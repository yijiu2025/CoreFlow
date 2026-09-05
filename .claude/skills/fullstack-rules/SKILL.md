---
name: fullstack-rules
version: 2.0.0
description: 前后端全栈开发规范。涵盖：创建项目、新增App、写API、写页面、调外部接口、修复Bug、代码审查。每次触发时，必须按以下顺序执行：① 有外部 API 的先 curl 验证格式 ② 写后端路由 ③ curl 验证后端 ④ 写前端 ⑤ 验证全链路。禁止假数据，禁止半截功能。审查代码时执行企业级审查清单。代码审查模式：无需执行①-⑤，直接执行审查清单。
type: prompt
whenToUse: 用户涉及本仓库前后端代码操作时触发：创建新项目、新增业务模块、编写前后端代码、设计API接口、审查代码质量、修复Bug、开发新功能、调用外部API、对接第三方数据、创建Vue页面、编写Node.js后端、设计数据库模型、配置路由、测试接口。涉及 KX 架构文件 / .kx / 页面描述语言时，按需加载 references/kx.md。
---

# 编码规范

## 核心铁律

### 开发一个功能的固定执行顺序

必须严格按以下顺序执行，**禁止跳步、禁止猜测、禁止假数据**：

```
0. 涉及新项目/新 App → 先走需求确认流程（references/requirement-intake.md），
   输出需求文档 → 多轮提问确认 → 创建 KX 架构文件（references/kx.md）
1. 有外部 API 的 → 先 curl 验证返回格式（确认字段名和类型）
2. 写后端 API 路由（system.json → route → DAO/Service）
3. curl 验证后端 API 返回数据（状态码 + 数据结构）
4. 写前端页面和 API 调用
5. 验证全链路（浏览器或 curl 确认数据正常展示）
```

## 开发规范

1. **DRY 原则**：拒绝重复代码，合理抽取公共组件和工具函数。
2. **单个文件 ≤ 1000 行**（含空行注释）；接近 400 行主动规划拆分。
3. **一个文件 = 一个模块**。组件 A 不内嵌组件 B 的 UI/逻辑；前端跨模块用 props/emit/v-model/composable 通信。
4. **UI 禁止 emoji 图标**。所有 UI 图标用图标库或内联 SVG（优先 `lucide-vue-next`）。控制台日志 emoji 前缀不受限。
5. **修改现有代码前先说明计划**；不确定的业务逻辑先提问再写。
6. **每个函数写文档注释**；注释和文档用简体中文，必须含参数和返回值说明。
7. **错误处理**：不吞噬异常，所有错误必须被捕获并记录日志。
8. **每次修改代码后主动提交 git**，遵守 [git-patterns.md](references/git-patterns.md)。
9. **开发时关权限**：`requireLogin: false`，功能调通后再加。
10. **写完 API 必须 curl 验证**：确认返回数据后再写前端。
11. **外部 API 先 curl 验证格式**：不猜测字段名。

## AI 行为准则

> 以下规则约束 AI 在修改代码时的行为，防止盲目操作。

| 规则                   | 说明                                                                     |
| :--------------------- | :----------------------------------------------------------------------- |
| **先读后改**           | 修改前先 Read，禁止凭记忆修改代码                                        |
| **不改无关代码**       | 只改任务相关部分，不顺便重构                                             |
| **不确定先问**         | 业务逻辑不确定时先提问，不猜测                                           |
| **不删未读内容**       | 不删除未读过的文件内容                                                   |
| **KX 先读规范**        | 涉及 KX 架构文件时，先读 [kx.md](references/kx.md) 与 SPEC.md，不凭记忆写 |
| **禁止假数据**         | 严禁 mock 数据。必须全链路打通：后端 API → 真实数据源 → 前端展示         |
| **功能完整性**         | 写了页面必须有对应 API，写了 API 必须有对应 DAO/Service，不允许半截功能  |
| **开发时关权限**       | `requireLogin: false`，功能调通后再恢复                                  |
| **API 必须 curl 验证** | 写完 API 立即 curl 验证：状态码 + 数据结构 + 边界值                      |
| **外部 API 先 curl**   | 调用外部 API 前先 curl 确认字段名，不猜测返回格式                        |
| **追踪调用链**         | 审查代码时追踪 import 依赖和调用方（至少 2 层），不只看单个文件          |
| **功能一致性**         | 相同功能的不同路径安全级别必须一致（如 HTTP 和 WebSocket 守卫）          |
| **错误码优先**         | 错误判断用 `err.code`，不用 `err.message.includes()` 匹配文本            |
| **空值保护**           | 所有嵌套对象访问用可选链 `?.`，逐层保护                                  |
| **超时保护**           | 所有可能阻塞的异步操作设置超时                                           |
| **提交后复盘**         | 每次提交后按 [anti-patterns.md](references/anti-patterns.md) 复盘并更新 skill |

### 任务执行规范

1. **拆解任务** — 将用户需求拆分为可执行步骤（`任务1`、`任务2`...，可再拆 `1.1`/`1.2`）
2. **逐项执行** — 按顺序完成，完成后标记 `✅` 并简要说明结果
3. **每步确认** — 关键节点（架构、破坏性改动）等待用户确认

## 修复问题原则

**先分析再修改**，禁止盲目尝试：

1. **定位根因** — 看日志错误栈 → 检查代码流程 → 复现最小步骤 → 必要时 git blame
2. **追踪调用链** — 检查 import 依赖和调用方（至少 2 层）
3. **明确原因** — 确认是逻辑错误、边界条件、还是外部依赖问题
4. **对照清单** — 执行企业级审查清单（[anti-patterns.md](references/anti-patterns.md)）
5. **动手改** — 只改必要代码，不顺便重构无关逻辑
6. **验证** — 确认修复有效且不破坏相关功能

## 内置检查清单（每次输出代码前自动执行）

```
[ ] 本次涉及新项目/新 App？→ 已走 requirement-intake.md 流程（需求文档 + 多轮确认 + KX）
[ ] 本次涉及外部 API？→ 已先 curl 验证格式
[ ] 本次涉及后端 API？→ 已 curl 验证返回数据
[ ] 本次涉及前端页面？→ 对应的 KX 描述和后端 API 已存在
[ ] 是否有任何假数据？→ 全部替换为真实数据源
[ ] 功能是否完整？→ 后端 API + 前端调用 + 数据展示，全链路打通
[ ] 开发时权限是否已关闭？→ requireLogin: false
[ ] KX 语法检查 → 已对照 references/kx.md 写作规范表
[ ] KX 引用检查 → 页面文件顶部有 @ref 引用模型
[ ] KX 组件检查 → 复杂组件有 @prop 接口定义，非仅 @note 描述
```

## 输出要求

1. **任务计划**：接到任务先输出拆解列表（`── 任务拆解 ──` 格式），等待用户确认后再写代码。
2. **思考过程**：写代码前简要分析需求并列出实现步骤。
3. **代码输出**：每次只输出必要文件，代码块上方标注完整文件路径；代码必须完整，禁止 `// ... existing code ...` 省略。
4. **依赖说明**：引入新第三方包时列出安装命令。

## 规范参考文档（按需加载）

| 时机                     | 文件                                              | 说明                                            |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------- |
| 写注释/日志时            | [note.md](references/note.md)                     | 文件头注释、函数注释、TODO 标记、控制台日志     |
| 命名犹豫时               | [naming-convention.md](references/naming-convention.md) | 代码/文件/数据库/权限/API 命名规则        |
| 写后端代码时             | [backend/main.md](references/backend/main.md)     | 目录结构、API 路由、认证、守卫、数据库索引页    |
| 写 Redis 代码时          | [backend/redis.md](references/backend/redis.md)   | 数据结构选型、键命名、大 Key 治理、禁用命令     |
| 写 Fastify 路由/DAO 时   | [nodejs-fastify.md](references/backend/nodejs/nodejs-fastify.md) | registerSecureRoute/DAO/模型/迁移模板 |
| 写前端代码时             | [frontend/main.md](references/frontend/main.md)   | 技术栈索引、组件开发、数据加载、API 响应格式    |
| 写 Vue 组件时            | [frontend/web/vue.md](references/frontend/web/vue.md) | TS 配置、Axios、认证、路由守卫、目录规范    |
| 写测试时                 | [testing.md](references/testing.md)               | 测试命名、Jest/Vitest 模板、覆盖率阈值          |
| 涉及安全/敏感数据时      | [security.md](references/security.md)             | 敏感信息、XSS、SQL 注入、权限校验、输入验证     |
| 新项目/新 App            | [requirement-intake.md](references/requirement-intake.md) → [kx.md](references/kx.md) | 需求确认流程 → KX 语法规范 |
| 涉及 KX / .kx 文件       | [kx.md](references/kx.md) → [SPEC.md](assets/project-template/kt/kx-lang/SPEC.md) | 操作规范 → 完整语法与 AI 生成映射表 |
| Git 操作                 | [git-patterns.md](references/git-patterns.md)     | 分支模型、提交信息、PR 模板、版本号             |
| 审查代码 / 修复问题      | [anti-patterns.md](references/anti-patterns.md) → [code-review.md](references/code-review.md) | 反例速查 + 审查清单 → 完整展开 |
