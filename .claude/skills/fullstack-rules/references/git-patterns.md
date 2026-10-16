# Git 规范

> **版本号 / 发版权威细则**在根仓 `docs/standards/git-release-rules.md`（提交/版本号/分支三合一，两个 release 脚本共用同一套判据）；本文聚焦**分支怎么开、怎么合**。两文冲突时以该文为准。

## 核心原则

- **主干唯一**：`main` 是唯一长期分支，发版只从 `main` 打 tag；随时可部署
- **改动必走支线**：修 Bug、开发新功能一律先切支线，合回 `main` 后删除——禁止直接往 `main` 堆提交
- **提交要小**：一个提交只做一件事，方便回滚和 Code Review
- **信息要清晰**：让队友（和未来的自己）看一眼就知道改了什么
- **不要破坏历史**：已推送的提交禁止 `rebase` / `force push`（个人支线确认无人依赖除外）

---

## 一、分支模型（main 主干 + 短支线）

```
main ────●───────●──────────●───────●─── (tag: v1.0.0) ──▶
          │             ▲                 │
          └─ feature/xxx ┘                 └─ hotfix/yyy ──┐
                                                     main ◀┘ (tag: v1.0.1)
```

| 分支            | 生命周期     | 基线分支       | 合并目标 | 规则                                     |
| --------------- | ------------ | -------------- | -------- | ---------------------------------------- |
| `main`          | **唯一长期** | —              | —        | 发版唯一入口；禁止 force push             |
| `feature/*`     | 短支线       | `main`         | `main`   | 一个需求 / 一个提交主题一条；合并即删     |
| `hotfix/*`      | 短支线       | 出问题的 tag   | `main`   | 生产紧急修复；修完补 patch 版             |
| `docs/*`        | 短支线       | `main`         | `main`   | 纯文档改动，避免污染 feature 命名         |
| `chore/*`       | 短支线       | `main`         | `main`   | 依赖升级、CI 配置、工程杂务               |

### 分支命名

```
<type>/<简短描述>        # 小写连字符

feature/user-login       # 新功能
hotfix/fix-npe-on-login  # 紧急修复
docs/ci-conventions      # 文档
chore/upgrade-sequelize  # 杂务
```

### 红线

- 🔴 **支线不打 tag** —— tag 只从 `main` 的提交打（`git tag -a`，见 git-release-rules.md §2.3）；
- 🔴 **合并即删** —— 合回 `main` 后立即删除本地与远端支线，拒绝"长寿分支"（超过 2 周未合并应考虑拆分）;
- 🔴 **常规改动禁止直推 `main`** —— `main` 受分支保护；admin bypass 仅限发版与紧急抢修，用后必须在 PR 或提交说明里留痕。

---

## 二、提交信息规范（Conventional Commits）

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型（type）

| 类型       | 说明                      | 是否触发发版 | 示例                                               |
| ---------- | ------------------------- | ------------ | -------------------------------------------------- |
| `feat`     | 新功能                    | ✅ minor     | `feat(auth): 新增 Google OAuth2 登录`              |
| `fix`      | Bug 修复                  | ✅ patch     | `fix(login): 修复空指针异常`                       |
| `perf`     | 性能优化                  | ✅ patch     | `perf(db): 优化 N+1 查询，加 eager loading`        |
| `refactor` | 重构（不修 bug 不加功能） | ❌           | `refactor(session): 抽取双令牌刷新逻辑`            |
| `docs`     | 文档                      | ❌           | `docs(api): 补充用户接口 JSDoc`                    |
| `test`     | 测试                      | ❌           | `test(auth): 新增 Session 续期测试用例`            |
| `chore`    | 构建/依赖/配置            | ❌           | `chore: 升级 sequelize 到 v6.35`                   |
| `ci`       | CI/CD                     | ❌           | `ci: 接入家族共享门禁`                             |
| `build`    | 构建系统                  | ❌           | `build: 切换 tailwind v4 postcss 插件`             |
| `style`    | 格式（不影响逻辑）        | ❌           | `style: 统一 prettier 格式化`                      |
| `revert`   | 回滚                      | ❌           | `revert: 回滚 feat(auth): 新增 Google OAuth2 登录` |

> 标题写错前缀 = 该提交不计入发版判据（已推送用 `--amend` 或认栽等下次）。
> 破坏性变更只认 footer 行首 + 冒号（`BREAKING CHANGE: …`）或 `!:` 简写——细则与敏感词自查见 git-release-rules.md §1.4 / §1.5。

### 范围（scope）

可选但推荐，写**受影响的面**，不写文件名：

```
feat(auth):     # 认证模块        fix(db):        # 数据库
fix(firewall):  # 防火墙          refactor(api):  # API 路由
style(ui):      # 前端样式        ci:             # 工程化（scope 可省略）
```

### 正文（body）

- 描述 **为什么改**，而不是**改了什么**（代码本身已经说明了改了什么）
- 每行不超过 72 字符；可用列表说明多个改动点

### 完整示例

```
feat(auth): 新增 Google OAuth2 登录

- 实现 Google OAuth2 授权码流程
- 用户首次登录自动创建本地账号
- 新增 UserIdentity 模型存储第三方身份

Closes #123
```

```
fix(db): 修复迁移时外键冲突导致回滚失败

迁移 2026071301 在 down 时删除了被其他表引用的列，
导致回滚到该版本时数据库报错。改为先删除引用外键再执行 down。
```

---

## 三、支线开发全流程（修 Bug / 新功能都用这条）

```bash
# 1. 从 main 切支线（修复生产问题从出问题的 tag 切）
git checkout main && git pull
git checkout -b fix/xxx            # 或 feature/xxx

# 2. 开发：小步提交，一个提交只做一件事
git add <files>
git commit -m "fix(login): 修复空指针异常"

# 3. 开发中 main 前进了 → 变基同步（保持历史线性，禁止 merge 进来）
git fetch origin
git rebase origin/main

# 4. 推送支线并开 PR
git push -u origin fix/xxx

# 5. 等 CI 绿 + Review 通过 → 合并（--no-ff 保留支线拓扑）
git checkout main && git merge --no-ff fix/xxx
git push origin main

# 6. 合并即删（本地 + 远端）
git branch -d fix/xxx
git push origin --delete fix/xxx
git fetch -p
```

> GitHub 上等价操作：PR 合并方式选 **Create a merge commit**（= `--no-ff`）；
> 单人杂务支线（docs/chore）允许选 **Squash and merge**。
> PR 标题必须符合 Conventional Commits（squash 时它会成为 main 上的提交信息）。

### 合并策略

| 场景              | 策略             | 说明                                     |
| ----------------- | ---------------- | ---------------------------------------- |
| `feature/*` → main | **Merge commit** | 保留支线拓扑，changelog 才读得出来       |
| `hotfix/*` → main  | **Merge commit** | 保留修复上下文，方便追溯                 |
| `docs/*` `chore/*` → main | Squash 或 Merge | 杂务允许压缩为一个提交               |

### 提 PR 前自查

- [ ] 分支名符合 `<type>/<desc>`，一个支线只做一件事
- [ ] 提交信息 / PR 标题符合 Conventional Commits
- [ ] 本地 lint / test 通过（CI 之外的最后一道闸）
- [ ] 没有调试代码（`console.log`、`debugger`）
- [ ] 新增 API 有权限校验；数据库变更有迁移；新配置有 env 说明

---

## 四、Code Review 规范

### 4.1 PR 描述模板

```markdown
## 变更说明

<!-- 一句话概括 -->

## 改动清单

- [x] 模块 A：改了啥
- [x] 模块 B：改了啥

## 关联 Issue

Closes #123

## 测试说明

- [x] 单元测试
- [x] 本地手动测试
- [ ] 需要部署到测试环境验证

## 注意事项

<!-- 迁移回滚、配置变更、依赖升级等 -->
```

### 4.2 Review 原则

- **先看文件名和改动范围** — 确认是不是预期改动
- **关注逻辑正确性** — 边界条件、异常处理、并发安全
- **拒绝大 PR** — 单个 PR 超过 400 行 diff 应拆分
- **建设性反馈** — 指出问题同时给出建议方案

---

## 五、版本号规范（SemVer）

```
主版本.次版本.修订号

v1.0.0   # 首次正式发布        v1.2.0   # 新增功能
v1.2.1   # Bug 修复            v2.0.0   # 不兼容的 API 变更
```

- tag 格式 `vX.Y.Z`，必须 annotated，message 写版本摘要；
- **版本源是 git tag，`package.json` 单向跟随**（细则见 git-release-rules.md §2.2）；
- 发版流程（预览 → --apply → 推送判定 → 收尾）见 git-release-rules.md §四。

---

## 六、常用命令速查

```bash
# 查看当前分支和状态
git status

# 简洁的日志视图
git log --oneline --graph --all -20

# 查看某次提交详情
git show <commit-hash>

# 暂存当前工作
git stash
git stash pop

# 撤销工作区修改（谨慎）
git checkout -- <file>

# 修改最近一次提交信息（仅未推送时）
git commit --amend -m "新消息"

# 支线同步上游（rebase，勿用 merge）
git fetch origin && git rebase origin/main

# 清理本地已合并分支
git branch -d feature/user-login

# 清理本地已删除的远端分支引用
git fetch -p

# 交互式 rebase（仅本地个人支线）
git rebase -i HEAD~3
```

---

## 七、项目特殊约定

1. **提交语言**：提交信息统一使用中文（subject + body），语言简洁准确。
2. **提交粒度**：按逻辑原子化提交（One Atomic Commit per Action），禁止积压大提交。
3. **排错逻辑**：修复 Bug 前先定位根本原因，禁止盲目"试一下"式提交。
4. **提交不带 Co-Authored-By**，不需要署名协作信息。
5. **嵌套仓**（oauth21 / retroweb 等）的提交推送**必须在它自己的目录里做**，根仓 `git commit` 对它无效；各仓独立维护 tag 线（细则见 git-release-rules.md §3.4）。
6. **安全红线**：严禁提交 API 密钥、数据库密码、私钥等明文敏感信息。环境配置文件（`.env.local`、`.env.development`）必须写入 `.gitignore`，仅提交 `.env.example` 作为模板。

---

## 八、自动化卡点

靠人肉规范难以 100% 杜绝不规范提交，建议引入 Git 钩子工程化卡点。

### 8.1 提交信息校验（commitlint）

```bash
# 安装
npm install --save-dev @commitlint/cli @commitlint/config-conventional

# 配置 commitlint.config.js
echo "export default { extends: ['@commitlint/config-conventional'] }" > commitlint.config.js

# 挂载到 husky commit-msg（Husky v9+，直接写文件）
echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

配置后，`git commit -m "fix bug"` 会被自动拦截，提示格式不符合规范。

### 8.2 代码质量校验（lint-staged）

```bash
# 安装
npm install --save-dev lint-staged

# package.json 中配置
# "lint-staged": {
#   "*.{js,ts,vue}": ["eslint --fix", "prettier --write"],
#   "*.{md,json,yaml}": ["prettier --write"]
# }

# 挂载到 husky pre-commit（Husky v9+，直接写文件）
echo 'npx lint-staged' > .husky/pre-commit
```

提交前自动修复代码格式和 ESLint 错误，不符合规范的代码无法提交。

### 8.3 当前项目状态（根仓 CoreFlow）

| 卡点        | 状态      | 说明                                            |
| ----------- | --------- | ----------------------------------------------- |
| husky       | ✅ 已安装 | hooks 目录在 `.husky/`                          |
| commitlint  | ❌ 未配置 | 无 `commit-msg` hook，无 `commitlint.config.js` |
| lint-staged | ❌ 未启用 | `pre-commit` hook 被注释，`lint-staged` 未安装  |

> ⚠️ 提交信息的规范校验目前完全依赖人工遵守。新项目建议按 8.1 / 8.2 启用。

---

## 附录：.gitignore 安全配置

与第 7 节第 6 条安全红线配合，防止敏感文件意外提交：

```gitignore
# 敏感环境变量
.env
.env.*
!.env.example

# 本地调试与密钥
*.pem
*.key
id_rsa
*.local

# IDE 配置
.vscode/
.idea/
*.swp
*.swo

# 依赖与构建
node_modules/
dist/
build/
```
