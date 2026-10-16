# CI 统一规范

> **适用范围**：CoreFlow 仓库族全部仓库（根仓 CoreFlow、oauth-web、retroweb、theme、log……）。
> **单一来源**：共享门禁的 canonical 在本技能 `assets/ci/`；本文是规则真身。
> **配套**：分支与合入流程见 [git-patterns.md](git-patterns.md)，发版权重逢 `docs/standards/git-release-rules.md`。

## 核心原则

1. **一个仓库只有一个门禁入口** —— `.github/workflows/ci.yml`。想找"这个仓怎么门禁"，只看这一个文件。
2. **同一逻辑只有一份代码** —— 前端家族（Vue3 + Vite）的质量门禁是字节级一致的共享文件 `ci-quality.yml`，由技能脚本分发、由 CI 自检，**禁止手改**。
3. **专属测试住自己的文件** —— 某仓特有的关卡（结构守卫、JSDoc、样式回归……）放 `ci-<domain>.yml`，不塞进共享门禁。
4. **顺序口径全家族一致** —— 类型 → 规范 → 单测 → 构建 → 关卡，越便宜的检查越靠前。
5. **CI 红 = 合并止** —— 门禁不是装饰；首跑即红的仓不许合入（先修再合）。

---

## 一、文件命名规范

`.github/workflows/` 下只允许四类文件，全部 kebab-case：

| 文件                    | 职责                                                 | 触发方式            | 是否唯一             |
| ----------------------- | ---------------------------------------------------- | ------------------- | -------------------- |
| `ci.yml`                | **门禁入口**：固定骨架 + 调用共享门禁 + 引用专属文件  | push / PR / dispatch | 每仓恰好一个        |
| `ci-quality.yml`        | **共享门禁**（`workflow_call`）：类型/规范/单测/构建   | 被 `ci.yml` 调用    | 前端家族有，字节一致 |
| `ci-<domain>.yml`       | **专属关卡**（`workflow_call`）：本仓特有的检查        | 被 `ci.yml` 调用    | 按需，域名单数      |
| `release-<target>.yml`  | **发布工作流**：镜像 / npm / 部署                      | tag / dispatch      | 按需                |

命名规则：

- 文件名一律 kebab-case，`ci-` 前缀表明属于门禁族，`release-` 前缀表明属于发布族；
- `<domain>` 用**单数名词**：`gates`（结构关卡）、`security`（安全扫描）、`e2e`（端到端）、`perf`（性能）——不要 `ci-static-checks.yml` 这种句子式命名；
- 禁止 `main.yml` / `test.yml` / `build.yml` / `workflow.yml` 等无法表明职责的名字；
- 历史资产改名示例：CoreFlow `publish-image.yml` → `release-docker.yml`（2026-10-17）。

## 二、入口骨架（ci.yml 固定六块）

每个仓的 `ci.yml` 必须按此骨架写，缺块即不合规：

```yaml
# 头部注释：本仓门禁的职责、共享门禁指针、安装口径（为什么这么装）
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  # 共享门禁（前端家族）——
  quality:
    uses: ./.github/workflows/ci-quality.yml
    with:
      post-build-cmd: npx vite build --outDir dist-nopwa && node e2e/verify-all.mjs --only static
  # 专属关卡（按需）——
  gates:
    uses: ./.github/workflows/ci-gates.yml
```

固定口径：

| 块             | 规范                                                         |
| -------------- | ------------------------------------------------------------ |
| 头部注释       | 写清"本仓门禁干什么、共享门禁在哪、安装口径为什么是这样"      |
| `name`         | 恒为 `CI`                                                    |
| 触发           | `push[main]` + `pull_request[main]` + `workflow_dispatch` 三件 |
| `concurrency`  | `ci-${{ github.ref }}` + `cancel-in-progress: true`          |
| `permissions`  | `contents: read`（发布族按需加 `packages: write`）           |
| job / step 名  | job key 用英文 kebab-case；`name:` 用中文，与步骤顺序口径一致 |

Node 版本、超时等运行参数住共享门禁（见下）；后端 / 库仓的自建 `ci.yml` 也按本骨架写，job 内参数自行声明。

## 三、顺序口径（不可调换）

```
完整性自检 → 类型 → 规范 → 单测 → 构建 → 构建后关卡
```

- **类型错最便宜**（不进构建、不跑测试），先挡；
- **规范**第二（ESLint 秒级，挡住风格回归）；
- **单测**第三（吃类型与规范的红利，失败信息更干净）；
- **构建最贵**，放后面兜底；
- **构建后关卡**最后：需要 `dist/` 产物的检查（包体积预算、PWA 移除、console 剥离……）必须等构建出来才有意义。
- 🔴 **需要 dist 的关卡与构建同 job**（走共享门禁的 `post-build-cmd`）——拆 job 传 artifact 更脆，oauth-web 静态关卡的历史决策，勿翻案。

## 四、共享门禁（ci-quality.yml）

### 4.1 设计

- 形态：`on: workflow_call` 的**可复用工作流**，经入口 `ci.yml` 以 `uses: ./.github/workflows/ci-quality.yml` 调用（仓内调用，不跨仓、不依赖权限）；
- 单一来源：`.claude/skills/fullstack-rules/assets/ci/ci-quality.yml`；
- 分发：`node .claude/skills/fullstack-rules/scripts/distribute-ci.mjs <仓路径...>`（盖章 + 拷贝门禁 + 拷贝自检脚本）；
- 防手改：文件末尾 `# canonical-sha256:` 章记录「删章后全文」的哈希，CI 第一步跑 `scripts/ci-quality-check.mjs` 重算，不符即红。自检脚本是算法型（不内嵌内容），自身无漂移点。

### 4.2 输入（`with`）

| 输入              | 默认值                                          | 说明                               |
| ----------------- | ----------------------------------------------- | ---------------------------------- |
| `node-version`    | `'22'`                                          | Node 主版本，全家族统一 22         |
| `install-cmd`     | `npm ci --ignore-scripts --no-audit --no-fund`  | 空串 = 跳过安装                    |
| `type-check-cmd`  | `npm run type-check`                            | 空串 = 跳过（无类型系统的仓）      |
| `lint-cmd`        | `npm run lint`                                  | 空串 = 跳过                        |
| `test-cmd`        | `npm run test`                                  | 空串 = 跳过（无单测框架的仓）      |
| `build-cmd`       | `npm run build`                                 | 空串 = 跳过                        |
| `post-build-cmd`  | `''`                                            | 构建后关卡，需 dist 产物的检查放这  |

> 留空跳过的语义是给"真的没有"用的（如 retroweb 无单测框架）；**有的步骤不许跳过**。
> `cache: npm` 由门禁自带，要求 `package-lock.json` 入库（家族既有规矩）。

### 4.3 改共享逻辑的正确流程

```
改技能 canonical（assets/ci/ci-quality.yml）
  → node scripts/distribute-ci.mjs <各仓路径>   # 盖章 + 分发
  → 逐仓进目录提交推送（支线 → PR → 合并 → 删支线）
  → 各仓 CI 第一步自检会验证副本一致
```

## 五、专属关卡（ci-<domain>.yml）

某仓特有的检查住独立文件，`workflow_call` 被 `ci.yml` 引用，job 内自带 checkout / setup-node / 安装。现状：

| 仓        | 专属文件       | 关卡内容                                                       |
| --------- | ------------- | -------------------------------------------------------------- |
| oauth-web | （无独立文件） | 静态关卡 8 项经 `post-build-cmd` 进共享门禁（需 dist，见 §三） |
| retroweb  | `ci-gates.yml` | JSDoc 审计 / README 同步 / 发布脚本测试（浏览器三关卡需 dev server，本地跑） |
| CoreFlow  | （无）         | 后端三作业（lint/test/verify）直接在 `ci.yml`，见 §七           |

> 何时拆独立文件：关卡步骤 ≥3 且不依赖共享门禁产物；否则走 `post-build-cmd` 或直接在 `ci.yml` 写 job。

## 六、发布工作流（release-<target>.yml）

镜像 / npm / 部署等发布族文件：`release-<目标>.yml`，触发用 `tags: ['v*']` + `workflow_dispatch`，权限按最小必要声明（如 GHCR 推 `packages: write`）。CoreFlow 现状：`release-docker.yml`（构建镜像 + compose 全栈冒烟，改名自 `publish-image.yml`）。

## 七、各仓安装口径（为什么不能都 npm ci）

安装命令是 CI 里最"因地而异"的一块，**口径差异必须写进各仓 ci.yml 头部注释**，不允许默默不一样：

| 仓 / 栈            | 安装口径                                            | 原因摘要                                                 |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| 前端家族           | `npm ci --ignore-scripts`（共享门禁默认）           | lock 入库可复现；跳过 postinstall 供应链面                |
| CoreFlow 后端      | `npm install --workspace=… --no-package-lock …`     | 根 lock 把 `wb-logkit` 记为 link→gitignore 的嵌套仓，ci/install 都建悬空软链；详见该仓 ci.yml 头注（长注释，勿删） |
| 库仓（theme 等）   | `npm install`                                       | 发布前现算树，无 lock 复现需求                           |

## 八、新仓接入清单（5 分钟）

```bash
# 1. 分发共享门禁三件套中的两件（第三件入口照着写）
node .claude/skills/fullstack-rules/scripts/distribute-ci.mjs <新仓路径>

# 2. 写入口 ci.yml：照 §二骨架；前端仓 quality job 按需传 with 输入
#    （无单测框架传 test-cmd: ''；有 dist 关卡传 post-build-cmd）

# 3. 专属关卡（可选）：ci-<domain>.yml + 在 ci.yml 里加 uses 引用

# 4. 本地预验证：把 CI 将跑的命令在本机跑一遍，红不许推
#    （本机 npm ci 可能被 safe-delete 垫拦：node_modules 与 lock 同步时可先用现有依赖）

# 5. 提交推送走支线 → PR → 等 CI 绿 → 合并 → 删支线（git-patterns.md）

# 6. GitHub 侧：Settings → Branches 保护 main（必填 PR、禁强推），
#    必检项填 CI 实际作业名（首跑后从 PR checks 列表抄，见 §九）
```

## 九、FAQ

| 现象                                              | 原因 / 处理                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| CI 第一步就红："与 canonical 不一致"                | 手改了 `ci-quality.yml`。改技能 canonical 后重新分发，勿手改副本              |
| "缺少 canonical-sha256 盖章行"                     | 副本来源不正规（手工 cp 会漏章）。用 `distribute-ci.mjs` 重新分发             |
| PR 合并不了："required check 未满足"               | 作业名变了但分支保护必检项没更新。首跑后从 PR checks 抄新名字去 protection 改 |
| 本机 `npm ci` 报 SAFE_DELETE_BULK_CONFIRM_REQUIRED | 本机安全垫拦批量删除。确认 node_modules 与 lock 同步后可先用现有依赖预验证    |
| 某仓不该用共享门禁（后端 / 库）                     | 对。共享门禁只覆盖前端家族；后端按 §七自建 ci.yml，骨架仍按 §二               |

---

## 附：本规范落地记录（2026-10-17）

| 仓        | 动作                                                                 |
| --------- | -------------------------------------------------------------------- |
| oauth-web | `ci.yml` 改为入口（调用共享门禁，静态关卡走 post-build-cmd）           |
| retroweb  | 从零建 CI：`ci.yml` + `ci-gates.yml` + 共享门禁三件套                 |
| CoreFlow  | `publish-image.yml` → `release-docker.yml`；`ci.yml` 补规范骨架        |
