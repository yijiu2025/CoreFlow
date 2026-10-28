# Git 提交 / 发版 / 版本号 / 分支 统一规则

> **适用范围**：根仓 CoreFlow 与全部子前端 / 子项目（oauth-web、retroweb、posecraft、firewall、admin……）。
> **新项目接入**：拷贝 `scripts/release-web.mjs` + 本文档到新仓库，见[第五节](#五新项目接入清单5-分钟)。
>
> 配套工具：
>
> | 仓库形态 | 发布脚本 | 说明 |
> | --- | --- | --- |
> | 根仓 CoreFlow（后端 + npm 包） | `scripts/release.mjs` | 三通道：git tag / GitHub Release / npm(`packages/log`) |
> | 子前端 / 独立仓 | `scripts/release-web.mjs` | 两通道：git tag / GitHub Release；`--npm` 可选开启 npm |
>
> 两个脚本**判据完全一致**（同一套 Conventional Commits 规则），差别只在通道与默认值。

---

## 一、提交规范（Conventional Commits）

### 1.1 格式

```
<type>(<scope>): <subject>

[可选的 body：写清楚"为什么"，尤其是坑与决策]

[可选的 footer]
```

- `subject` 用中文或英文均可，**不超过 72 字符**，结尾不加句号；
- `body` 与 footer 之间空一行；footer 形如 `Key: value`。

### 1.2 type 表（判据只认这些前缀）

| type | 含义 | 是否触发发版 |
| --- | --- | --- |
| `feat` | 新功能 | ✅ minor |
| `fix` | 缺陷修复 | ✅ patch |
| `perf` | 性能优化 | ✅ patch |
| `refactor` | 重构（行为不变） | ❌ |
| `docs` | 文档 | ❌ |
| `test` | 测试 | ❌ |
| `chore` | 杂项（依赖、构建配置） | ❌ |
| `style` | 格式（不影响逻辑） | ❌ |
| `ci` | CI 配置 | ❌ |
| `build` | 构建系统 | ❌ |
| `revert` | 回滚 | ❌ |

> 不匹配以上前缀的提交归入 `other`，**不触发发版**。标题写错前缀 = 该提交不计入发版判据。

### 1.3 scope 约定

scope 写**受影响的面**，不写文件名：

| 场景 | scope 示例 |
| --- | --- |
| 后端业务域 | `retroweb`、`oauth21`、`firewall`、`user` |
| 前端页面 / 模块 | `login`、`theme`、`router`、`api` |
| 工程化 | `ci`、`release`、`deps`、`build` |
| 跨项目拆分 | 可省略 scope，如 `chore: oauth21 拆分为独立仓库` |

### 1.4 破坏性变更：只认 footer 形式（行首 + 冒号）

```
feat(api)!: 授权接口改为要求 PKCE

BREAKING CHANGE: /oauth/authorize 不再接受无 code_challenge 的请求，
调用方必须先升级 SDK。
```

- 判定正则：`/^BREAKING[ -]CHANGE:/m`——**必须行首且带冒号**；
- 🔴 **不可退化成子串匹配**：正文里"提到"这个词（例如写本规则自身）会把 minor 误升成 major，真实仓库上发生过；
- `!:` 简写（`feat(api)!: …`）与 footer 等价，任一出现即 major。

### 1.5 敏感词自查（Release 说明对公网可见）

标题 / 正文含下列表述的提交，发版时脚本会**单独列出要求人工确认**：

`漏洞`、`泄露`、`未授权`、`越权`、`注入`、`绕过`、`CVE-*`、`token`、`secret`、`password`、`密钥`、`凭证`

修复安全问题的提交，`fix` 标题写" hardening / 加固"而非漏洞细节，细节放 body（body 默认不进 Release 说明）。

---

## 二、版本号规则

### 2.1 语义化版本（SemVer）

```
v{major}.{minor}.{patch}
```

| 档位 | 递增规则 | 触发条件 |
| --- | --- | --- |
| major | `X+1.0.0` | 破坏性变更（footer 或 `!:`） |
| minor | `X.Y+1.0` | 含任一 `feat` |
| patch | `X.Y.Z+1` | 仅 `fix` / `perf` |
| — | 不发版 | 仅 chore/docs/test/style/ci/refactor/build/revert |

起算基线 = **最近的 tag**（复盘 / 补发用 `--from <ref>` 显式指定）。

### 2.2 版本源是 git tag，package.json 单向跟随

- 🔴 **不要反过来拿 `package.json` 的 `version` 推版本号**——tag 才是唯一版本源；
- 每次发版后**顺手把 `package.json` 的 `version` 对齐到新 tag**（提交一个 `chore: 对齐版本号` 或并入发版前的提交）；
- 脚本会检测"将打的 tag"与 `package.json version` 的漂移并警告，但**不会自动改**（改版本号必须是显式提交）；
- 子前端若没有 `package.json`（纯静态仓），此规则自动跳过。

### 2.3 tag 命名与创建方式

- 格式：`v1.2.3`，**必须带 `v` 前缀**；
- 必须 **annotated**（`git tag -a`），message 写版本摘要——Release 说明的初稿来自提交分类，tag message 是给人看的 changelog；
- tag 跟随 `main` 一起推；推送判定**一律以 `git ls-remote` 为准，不信退出码**（本机 push 有"零输出假成功"前科）；
- 删除远端 tag：`git push origin :refs/tags/vX.Y.Z`（仅限发错且未生成 Release 的场景）。

---

## 三、分支（支线）模型

### 3.1 分支总表

| 分支 | 生命周期 | 规则 |
| --- | --- | --- |
| `main` | **唯一长期分支** | 发版唯一入口；随时可部署；禁止 `git push --force` |
| `feature/*` | 短支线，合并即删 | 一个需求 / 一个提交主题一条；从 `main` 切出 |
| `hotfix/*` | 短支线，合并即删 | 生产紧急修复；从**出问题的 tag** 切出，修完回 `main` 并补 patch 版 |
| `docs/*`、`chore/*` | 可选短支线 | 纯文档 / 杂项改动，避免污染 feature 命名 |

```
main ─────●──────●──────────●──────●─── (tag: v1.0.0) ──▶
           │           ▲                    │
           └─ feature/login ┘                └─ hotfix/sign-key ─┐
                                          (从 v1.0.0 切)          │
                                                              main ◀┘ (tag: v1.0.1)
```

### 3.2 主干规则

- 🔴 **发版只允许在 `main` 上进行**（脚本强制检查，非 main 直接拒绝）；
- 单人开发 + 并行任务允许工作区有未提交改动，但发版执行时必须显式 `--allow-dirty`（语义："本次要发的内容已提交，剩余脏文件属于别的任务"）；
- 提交前跑一遍项目的 lint / test——CI 之外的最后一道闸。

### 3.3 支线规则

- 命名：`feature/<主题>`、`hotfix/<主题>`，小写连字符；
- **一个支线只做一件事**；做完立即合并回 `main` 并删除远端支线（`git push origin --delete <branch>`）；
- 合并用 `--no-ff`（保留支线拓扑，changelog 才读得出来）；
- 支线**不打 tag**——tag 只从 `main` 的提交打。

### 3.4 子前端 / 嵌套仓协作（本仓库族的特殊规则）

| 仓 | 远程 | 与根仓关系 |
| --- | --- | --- |
| CoreFlow（根） | `yijiu2025/CoreFlow` | 单体，跟踪 `src/`、`migrations/` 等 |
| oauth-web | `yijiu2025/oauth-web` | 独立 git 仓，位于 `oauth21/`，根仓 `.gitignore` 有 `/oauth21/` |
| retroweb | `yijiu2025/retroweb` | 同上，位于 `retroweb/` |
| posecraft / firewall / admin / phonecopy | 各自远程 | 同上 |

- 🔴 **嵌套仓的提交 / 推送必须在它自己的目录里做**（`cd oauth21 && git …`），在根仓 `git commit` 对它无效；
- 根仓的 `.gitignore` **必须带前导斜杠**（`/oauth21/` 而非 `oauth21/`）——否则会误伤 `src/oauth21/`、`migrations/retroweb/` 等后端同名目录，且无任何报错；
- 每个嵌套仓**独立维护自己的 tag 线**（`v1.0.0` 各自从 1.0.0 起算，与根仓版本号无关）；
- 根仓 `release.mjs` 已过滤嵌套仓的脏状态，不需要 `--allow-dirty` 兜它们。

### 3.5 GitHub 侧保护设置（每个仓建仓后做一次）

1. `Settings → Branches → Add rule`：`main` 勾选 **Require a pull request before merging**、**Block force push**；
2. `Settings → General`：Features 只留 Issues / Releases /Discussions（按需）；
3. 建仓后先在本地 `git push -u origin main` 再开保护，避免空仓规则不生效。

---

## 四、发布流程（脚本用法）

> 🔎 **端到端发布 checklist**（更新 CHANGELOG → 完善文档 → 对齐版本号 → 跑门禁 → 发版 → 镜像 → 校验）
> 见 fullstack-rules 技能 `references/release-checklist.md`。本节是脚本用法与行为约定，checklist 是
> 「一次完整发布」的动作顺序。

### 4.1 用法（所有仓统一）

```bash
# 预览（默认，不做任何写操作）—— 每次发版前先跑这个
node scripts/release.mjs            # 根仓
node scripts/release-web.mjs        # 子前端 / 独立仓

# 执行：打 annotated tag + 推 main 与 tag + 建 GitHub Release
node scripts/release.mjs --apply
node scripts/release-web.mjs --apply

# 复盘 / 补发：显式指定起算 ref
node scripts/release-web.mjs --from v1.0.0

# 子前端如需发 npm（默认不发）
node scripts/release-web.mjs --apply --npm

# 工作区有并行任务遗留改动时放行（语义：要发的内容已提交）
node scripts/release-web.mjs --apply --allow-dirty
```

### 4.2 脚本行为约定（两个脚本一致）

1. **默认 dry-run**：不可逆操作（推 tag、建公开 Release、npm publish）一律先预览；
2. **分支闸**：非 `main` 拒绝执行；
3. **脏工作区闸**：`--apply` 时有未提交改动且无 `--allow-dirty` 拒绝执行；
4. **判据**：破坏性 → major；`feat` → minor；仅 `fix`/`perf` → patch；其余不发；
5. **漂移自愈**：tag 已推而 Release 缺失时，重跑脚本自动补建（不依赖"有无新提交"的判断）；
6. **推送判定**：push 后一律 `git ls-remote` 核对远端 SHA 与 tag，**不信退出码**；成功同步后自动跑 `fix-packed-refs.mjs`（本机不写松散 ref，不修则 `git status` 长期谎报 ahead）；
7. **凭据**：GitHub token 依次取 `$GITHUB_TOKEN` / `$GH_TOKEN` / git credential manager（GCM），无需 `gh` CLI；
8. **敏感词**：命中 1.5 节词表的提交标题会被列出，要求人工确认后才可外发；
9. **CHANGELOG 自动提升**（release-web.mjs）：`--apply` 时把 `CHANGELOG.md` 的「未发布（Unreleased）」区块提升为 `## X.Y.Z — YYYY-MM-DD` 并重建空区块；区块为空则**不提升**、预览时警告；
10. **package.json 自动对齐**（release-web.mjs）：`--apply` 时把 `package.json` / `package-lock.json` 的 `version` 对齐到新 tag（单向跟随，见 2.2），不再手动改。

### 4.3 发版后的校验（脚本已自动收尾，剩人工核对）

- CHANGELOG / package.json 已由脚本 `--apply` 自动处理，**检查生成结果**是否符合预期即可；
- 在 Release 页面检查说明是否符合预期（尤其敏感词提交）；
- 有 Docker 镜像的仓：等 `docker-publish` workflow 完成，核对 GHCR / Docker Hub 的 `<version>` 与 `latest` tag（见 release-checklist.md §六）；
- 若 push 提示远端不一致：重试推送并用 `git ls-remote origin main` 复核——**超时不等于失败**。

---

## 五、新项目接入清单（5 分钟）

```bash
# 1. 拷两个文件进新仓库
cp <任意现有仓>/scripts/release-web.mjs <新仓库>/scripts/
cp <任意现有仓>/docs/standards/git-release-rules.md <新仓库>/docs/   # 或 docs/

# 2. 建远程仓并关联（GitHub 先建空仓，勿自动生成 README——本地已有）
git init -b main && git add -A && git commit -m "feat: 初始提交"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main

# 3. 按 3.5 节配好分支保护

# 4. 接入 CI 门禁（前端家族）：分发共享门禁三件套 + 写入口 ci.yml
node <fullstack-rules 技能路径>/scripts/distribute-ci.mjs <新仓库路径>
#    规范：fullstack-rules → references/ci-conventions.md（入口骨架 / 顺序口径 / 专属关卡）

# 5. 建 docs 总入口：docs/README.md 逐文档登记，拷校验脚本并挂 CI
cp <fullstack-rules 技能路径>/assets/docs/check-docs-index.mjs <新仓库>/scripts/
node scripts/check-docs-index.mjs docs   # 退出码 0 方可提交
#    规范：fullstack-rules → references/docs-conventions.md（两级入口体系 / 双写 / 死链口径）

# 6. 首次发版
node scripts/release-web.mjs          # 预览：应判定 minor 并给出 v0.1.0 或 v1.0.0
node scripts/release-web.mjs --apply  # 执行
```

> 💡 首版版本号习惯：后端 / 平台型从 `v0.1.0` 起步（内部迭代），对外发布的前端从 `v1.0.0` 起步（oauth-web 即此例）。

---

## 六、常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 提交了 `feat` 却不发版 | 标题前缀不在 1.2 表内（如 `feature:`、`新增:`） | 改前缀；已推送的用 `git commit --amend` 或认栽等下次 |
| minor 被误升 major | 正文写了 `BREAKING CHANGE:` 但不在行首 / 带冒号形式之外 | 按 1.4 节，只认行首+冒号 |
| `git status` 长期显示 ahead | 本机不写松散 ref | 跑 `node ~/.workbuddy/tools/fix-packed-refs.mjs <远端SHA>` |
| tag 推了但没 Release | 网络中断 / token 超时 | 重跑同一脚本，会自动补建 |
| 嵌套仓改动提交不进根仓 | 在根仓目录执行了提交 | `cd` 进嵌套仓目录重新提交 |
