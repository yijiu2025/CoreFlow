---
name: fullstack-rules
version: 1.8.0
description: 前后端全栈开发规范。涵盖：创建项目、新增App、写API、写页面、调外部接口、修复Bug、代码审查。每次触发时，必须按以下顺序执行：① 有外部 API 的先 curl 验证格式 ② 写后端路由 ③ curl 验证后端 ④ 写前端 ⑤ 验证全链路。禁止假数据，禁止半截功能。审查代码时执行企业级审查清单。代码审查模式：无需执行①-⑤，直接执行审查清单。
type: prompt
whenToUse: 用户任何涉及代码的操作时自动触发：创建新项目、新增业务模块、编写前后端代码、设计API接口、审查代码质量、修复Bug、开发新功能、调用外部API、对接第三方数据、创建Vue页面、编写Node.js后端、设计数据库模型、配置路由、写curl命令、测试接口、查看API返回数据、股票分析、行情数据、K线图、**kt架构/KX架构、.kx文件、KX规范、页面描述语言、架构描述文件、架构设计模式、设计模式评分**。注意：本 skill 强制要求 curl 验证外部 API 格式、禁止假数据、禁止半截功能。
arguments:
  - techStack
  - scope
---

# 编码规范

## 核心铁律

先在输出前加一句"本次 skill 加载正常"。

### 开发一个功能的固定执行顺序

必须严格按以下顺序执行，**禁止跳步、禁止猜测、禁止假数据**：

```
0. 涉及新项目/新 App → 先输出需求文档 (.md) → 多次提问确认需求 → 确认后创建 KX 架构文件 (.kx)
1. 有外部 API 的 → 先 curl 验证返回格式（确认字段名和类型）
2. 写后端 API 路由（system.json → route → DAO/Service）
3. curl 验证后端 API 返回数据（状态码 + 数据结构）
4. 写前端页面和 API 调用
5. 验证全链路（浏览器或 curl 确认数据正常展示）
```

---

## KX 页面描述语言

> **KX**（Knowledge eXchange）是一种声明式页面描述 DSL，用于描述页面架构、数据流、交互逻辑和业务规则，AI 据此生成完整的前端代码。

### 什么时候用 KX？

| 场景 | 触发词 | 操作 |
|------|--------|------|
| **新项目/新 App** | "kt架构"、"架构文件"、".kx" | 先输出需求文档 → 多轮提问确认 → 创建 `guide/` 目录下的 `.kx` 文件 |
| **新增页面** | "新页面"、"写页面"、"页面描述" | 先确认页面功能 → 在 `pages/` 下新增 `.kx` 文件 |
| **定义数据模型** | "数据模型"、"实体设计" | 在 `models/` 下新增 `.kx` 文件 |
| **定义 API** | "接口设计"、"API 规划" | 在 `models/api.kx` 中集中定义 |
| **生成代码** | "生成代码"、"根据架构生成" | 读取 `.kx` 文件 → 生成 Vue 3 代码 |

### KX 文件结构

```
<项目名>/
└── guide/                     # 需求与设计文档根目录
    ├── index.kx               # 入口文件：@ref 引用所有文件
    ├── layouts/               # 布局定义
    │   └── main.kx
    ├── pages/                 # 页面定义（一个页面一个文件）
    │   ├── home.kx
    │   └── detail.kx
    ├── models/                # 数据模型 + API 定义
    │   ├── user.kx
    │   └── api.kx
    └── components/            # 共享组件（浮窗等）
        └── shared.kx
```

### 编写 KX 文件的步骤

```
1. 阅读规范 → 读取 assets/project-template/kt/kx-lang/SPEC.md 了解完整语法
2. 确认需求 → 需求文档已确认，用户签字通过
3. 创建目录 → 按上述结构创建 guide/ 目录
4. 写 index.kx → 项目概述 + 架构设计（无 @ref 无 @note）
5. 写 layouts/ → 定义布局骨架 + 全局状态
6. 写 models/ → 定义数据模型和 API（@model API 统一命名）
7. 写 pages/ → 定义页面结构、数据流、交互（顶部 @ref 引用模型）
8. 写 components/ → 定义可复用组件接口（@prop 声明 props）
9. 展示给用户确认 → 确认架构后开始生成代码
```

### KX 写作规范（避免常见错误）

编写 `.kx` 文件时，必须遵守以下规则，避免反模式：

| 规则 | 说明 | 反例 | 正例 |
|:---|:---|:---|:---|
| `@sync` 只用于计算属性 | 不是变量赋值 | `@sync = 'all'` | `@navigate click -> @state activeTab = 'all'` |
| `@empty` 在容器内 | 必须在 @list/@detail 内 | `@empty 独立` | `@list { @empty { ... } }` |
| 数组操作用 `=` 展开 | 不用 JS 方法名 | `.unshift(new)` | `= [new, ...old]` |
| `@model` 命名规范 | API 用 `@model API` | `@model StockAPI` | `@model API { @api ... }` |
| 组件定义接口 | 复杂组件声明 @prop | `@note K线图组件` | `@detail KChart { @prop data }` |
| 页面引用模型 | 顶部加 @ref | 无 @ref | `@ref ../models/stock.kx` |
| 全局状态在布局 | 共享状态在 layouts/ | 每个页面重复声明 | 布局文件 `@state isLoggedIn` |
| 循环不写死名称 | 动态列表用变量名 | `@card 上证指数 (v-for: idx)` | `@card 指数卡片 (v-for: idx)` |

### KX 核心语法速览

| 指令 | 用途 | 示例 |
|------|------|------|
| `@page` | 页面定义 | `@page /home (首页) extends Layout` |
| `@layout` / `@slot` | 布局骨架 | `@layout Main { @slot main (role: main) }` |
| `@model` / `@field` | 数据模型 | `@model User { @field name: string }` |
| `@api` | 接口请求 | `@api GET /works -> works` |
| `@state` / `@prop` / `@param` | 状态/属性/参数 | `@state page: number = 1` |
| `@mutation` | 状态变更 | `@mutation set list[idx].liked = true` |
| `@sync` | 计算属性 | `@sync filtered = list.filter(...)` |
| `@render` | 条件渲染 | `@render when: loading` |
| `@navigate` | 路由跳转 | `@navigate click -> /detail` |
| `@button` / `@card` / `@list` | 组件 | 23 种组件指令 |
| `@modal` / `@popover` | 弹窗/浮窗 | `@modal 确认删除` |
| `@hover` / `@leave` / `@delay` | 悬浮交互 | `@hover -> @popover 详情` |
| `@login` / `@permission` | 权限控制 | `@login` / `@permission work:create` |
| `@note` | 业务约束（AI 强制识别） | `@note 仅 VIP 可见` |
| `@ref` | 跨文件引用 | `@ref ../models/user.kx` |

完整语法和 AI 生成映射表见 [KX 规范](assets/project-template/kt/kx-lang/SPEC.md)。

### 开发规范

1. **DRY 原则**: 拒绝重复代码，合理抽取公共组件和工具函数。
2. **单个文件 ≤ 1000 行**（含空行注释）。接近 700 行主动拆分。
3. **一个文件 = 一个模块**。组件 A 不内嵌组件 B 的 UI/逻辑；前端跨模块用 props/emit/v-model/composable 通信。
4. **UI 禁止 emoji 图标**。所有 UI 图标用图标库或内联SVG。控制台日志 emoji 前缀不受限。
5. **修改现有代码前先说明计划**；不确定的业务逻辑先提问再写。
6. **每个函数写文档注释**；注释和文档用简体中文,函数必须包含 JSDoc/Docstring 格式的参数和返回值说明。
7. **错误处理**: 不要吞噬异常，所有错误必须被捕获并记录日志。
8. **每次修改代码后主动提交 git**，更新 commit 信息。git规范文件：[Git Commit Message Convention](references/git-patterns.md)
9. **开发时关权限**：`requireLogin: false`，功能调通后再加。
10. **写完 API 必须 curl 验证**：确认返回数据后再写前端。
11. **外部 API 先 curl 验证格式**：不猜测字段名。

### 模块边界规则（核心铁律第3条展开）

| 规则 | 说明 | 示例 |
|:---|:---|:---|
| **职责单一** | 一个组件只负责一个功能域 | 搜索组件只管搜索框，不管分类 Tab |
| **不内嵌其他模块** | 组件 A 中不出现组件 B 的 UI/逻辑 | 列表页里的 Tab 不应写在搜索组件里 |
| **状态归属** | 由消费方（父组件）管理状态，不内嵌数据 | Tab 切换状态属于列表页，不属于搜索组件 |
| **跨模块通信** | 通过 props / emit / v-model / 共享 composable | 子组件需要数据 → props；需要通知 → emit |
| **禁止反向依赖** | 子组件不依赖父组件的内部结构 | 搜索组件不应知道列表页的存在 |

**判断标准**：如果修改功能 X 需要改动组件 Y 的文件，说明边界划错了。

### 图标使用规范（核心铁律第4条展开）

- 禁止在 UI 中使用 Unicode emoji 作为图标（跨平台渲染不一致、不可样式化）
- 前端项目优先使用 `lucide-vue-next`（与 firewall 保持一致）
- 编辑器 toolbar 图标可使用内联 SVG
- 控制台日志允许 emoji 前缀（不影响 UI 渲染）
- 用户生成内容（如个人简介）中 emoji 不在此限制范围内

---

## AI 行为准则

> 以下规则约束 AI 在修改代码时的行为，防止盲目操作。

| 规则 | 说明 |
|:---|:---|
| **先读后改** | 修改前先 Read，禁止凭记忆修改代码 |
| **不改无关代码** | 只改任务相关部分，不顺便重构 |
| **不确定先问** | 业务逻辑不确定时先提问，不猜测 |
| **不删未读内容** | 不删除未读过的文件内容 |
| **KX 先读规范** | 涉及 KX 架构文件时，先读取 SPEC.md 了解完整语法，不凭记忆写 `.kx` 文件 |
| **禁止假数据** | 严禁 mock 数据。必须全链路打通：后端 API → 真实数据源 → 前端展示 |
| **功能完整性** | 写了页面必须有对应 API，写了 API 必须有对应 DAO/Service，不允许半截功能 |
| **开发时关权限** | `requireLogin: false`，功能调通后再恢复 |
| **API 必须 curl 验证** | 写完 API 立即 curl 验证：状态码 + 数据结构 + 边界值 |
| **外部 API 先 curl** | 调用外部 API 前先 curl 确认字段名，不猜测返回格式 |
| **追踪调用链** | 审查代码时追踪 import 依赖和调用方（至少 2 层），不只看单个文件 |
| **功能一致性** | 相同功能的不同路径安全级别必须一致（如 HTTP 和 WebSocket 守卫） |
| **错误码优先** | 错误判断用 `err.code`，不用 `err.message.includes()` 匹配文本 |
| **空值保护** | 所有嵌套对象访问用可选链 `?.`，逐层保护 |
| **超时保护** | 所有可能阻塞的异步操作设置超时 |
| **提交后复盘** | 每次提交后，回顾本次对话和修改，提取可复用的模式/反模式，更新 skill 自身 |

### 任务执行规范

**接到任务后，先做计划，再做执行：**

1. **拆解任务** — 将用户需求拆分为可执行的步骤列表，标注为 `任务1`、`任务2`、`任务3`...
2. **子任务** — 每个任务下可拆分 `1.1`、`1.2`、`1.3`... 子步骤
3. **逐项执行** — 按顺序完成每个任务，完成后标记 `✅`
4. **每步确认** — 每个子任务完成后，简要说明做了什么、结果如何

### 需求确认规范

**新项目/新 App 的完整流程：**

```
Step 1: 输出需求文档 (.md)
    ↓
Step 2: 逐轮提问确认需求（至少 3 轮）
    ↓
Step 3: 输出最终架构方案
    ↓
Step 4: 用户确认 → 创建 KX 架构文件 (.kx)
    ↓
Step 5: 开始生成代码
```

**Step 1 — 输出需求文档：**

在创建任何代码之前，先生成一份完整的 **需求文档（`guide/requirements.md`）**，包含：

```markdown
# 项目名称需求文档

## 1. 产品定位
- 一句话描述：这个项目/App 做什么？
- 目标用户：谁会用？
- 核心价值：解决什么问题？

## 2. 功能清单
- 功能 A：描述
- 功能 B：描述
- ...

## 3. 页面规划
- 页面 1：路由 /xxx，用途
- 页面 2：路由 /xxx，用途
- ...

## 4. 数据模型
- 实体 1：字段列表
- 实体 2：字段列表
- ...

## 5. API 接口
- 接口 1：GET /api/xxx，用途
- 接口 2：POST /api/xxx，用途
- ...

## 6. 数据来源
- 外部 API / 本地数据库 / 第三方服务

## 7. 权限设计
- 角色：操作权限
```

**Step 2 — 逐轮提问确认需求：**

需求文档输出后，**不要直接写代码**。必须通过多轮提问确认需求，每轮 2-4 个问题：

**第一轮（产品定位）：**
- 项目名称和定位是什么？
- 目标用户是谁？使用场景是什么？
- 核心功能有哪些？（列出 3-5 个主要功能点）

**第二轮（功能细节）：**
- 数据模型有哪些？（核心实体和字段）
- API 需要哪些接口？（method + url 列表）
- 前端页面有哪些？（路由列表）

**第三轮（技术选型与约束）：**
- 数据来源？（本地数据库 / 外部 API / 第三方服务）
- 权限设计？（角色 + 权限编码）
- 前端架构？（Vue 3 / React / 其他）
- 是否需要先创建 KX 架构文件？（新项目/新 App 默认需要）

**提问规范：**
- 开放式问题优先（"这个功能期望达到什么效果？"）
- 避免只有"是/否"的封闭问题
- 如果涉及多个方案，列出选项让用户选择
- 每轮结束后，更新需求文档，让用户确认

**Step 3 — 输出最终架构方案：**

确认所有需求后，输出完整架构方案，包含：

- 项目概述（定位、目标用户、核心功能）
- 页面路由规划（路径 + 标题 + 用途）
- 数据模型设计（实体 + 字段 + 关联关系）
- API 接口设计（method + url + 请求/响应）
- 权限模型（角色 + 权限编码）

**Step 4 — 用户确认后创建 KX 文件：**

用户确认架构方案后，再按以下步骤创建 `.kx` 文件：

1. 创建 `guide/` 目录结构
2. 写 `index.kx` → 项目概述 + 架构设计（无 @ref 无 @note）
3. 写 `layouts/main.kx` → 布局骨架 + 全局状态
4. 写 `models/*.kx` → 数据模型 + API 定义
5. 写 `pages/*.kx` → 页面结构 + 数据流 + 交互（顶部 @ref 引用模型）
6. 写 `components/shared.kx` → 可复用组件（@prop 声明接口）
7. 展示给用户确认，再开始生成代码

**Step 5 — 开始生成代码：**

用户确认架构后，按固定执行顺序开发代码。

---

## 反例速查

| 场景 | ❌ 错误写法 | ✅ 正确做法 |
|------|-----------|-----------|
| API 请求 | 组件内直接 `axios.get('/api/users')` | 封装到 `src/api/user.ts`，组件调 `getUser()` |
| 错误处理 | `catch { /* 吞掉 */ }` | `catch (e) { logger.error(e); throw e }` |
| 注释 | 只写"做了什么" `// 设置用户名为张三` | 写"为什么" `// 用户未设置昵称时用手机号占位` |
| 类型 | `const data: any = res.data` | `const data: ApiResult<User> = res.data` |
| 样式 | 内联 `style="color: red"` | CSS 变量 `var(--color-error)` 或 Tailwind 类 |
| 数据库 | `WHERE id = ${id}` 拼接 SQL | 参数化 `WHERE id = ?` / Sequelize `where: { id }` |
| 提交 | `git commit -m "fix bug"` | `git commit -m "fix(login): 修复空指针异常"` |
| 分支同步 | `git merge develop` 在 feature 分支 | `git rebase develop` 保持线性历史 |
| 敏感信息 | 代码中硬编码 `apiKey: "sk-xxx"` | 从 `process.env.API_KEY` 读取 |
| 文件大小 | 一个文件 2000 行不拆分 | 超过 700 行按功能拆分为独立模块 |
| 错误判断 | `err.message.includes('路由重复')` 匹配中文文本 | `err.code === 'DUPLICATE_ROUTE'` 用错误码 |
| 嵌套访问 | `configs[a].groups[b].apis[c]` 直接链式访问 | `configs[a]?.groups?.[b]?.apis?.[c]` 可选链保护 |
| 跳过路径 | `if (!x) continue` 静默跳过 | `if (!x) { console.warn('...'); continue; }` 记录日志 |
| 异步超时 | `await register(app)` 无超时限制 | `Promise.race([register(app), timeoutPromise])` 超时保护 |
| 优雅关闭 | `setTimeout` 定时任务无人清理 | 暴露 `flush()` 方法，`onClose` 钩子调用 |
| 安全一致性 | HTTP 路由有 IP 白名单，WebSocket 没有 | 所有入口路径安全级别一致 |
| 异常输入 | 非预期格式静默返回 false | 记录 `console.warn` 告知配置错误 |
| onClose 错误 | `onClose` 钩子不 catch，异步异常静默丢失 | 内部 try-catch + console.error |
| 进程退出日志 | `process.exit(1)` 导致日志可能被截断 | `setTimeout(() => process.exit(1), 100)` 给刷新时间 |
| 配置无警告 | 生产环境缺少关键配置，启动时不提醒 | 启动时输出 `⚠️ [App]` 警告，附修复指引 |
| 公共 API 参数 | 假设调用方总传有效参数，深层崩溃 | 入口处 `if (!param) { err.code='INVALID_PARAM'; throw err; }` |
| 标识符生成 | 用 `Math.random()` 生成标识符 | 用固定默认值 `'default'` 或 `crypto.randomUUID()` |
| reply.sent | 直接 `return reply.send(...)` 不标记 sent | `reply.send(...); reply.sent = true; return;` |

---

## 规范参考文档

| 规范 | 文件 | 说明 |
|------|------|------|
| 📝 注释规范 | [note.md](references/note.md) | 文件头注释、函数注释、行内注释、TODO 标记、控制台日志 |
| 🏷️ 命名规范 | [naming-convention.md](references/naming-convention.md) | 代码/文件/数据库/权限/API 命名规则 |
| ⚙️ 后端规范 | [backend/main.md](references/backend/main.md) | 目录结构、API 路由、认证、守卫、数据库 |
| 🎨 前端规范 | [frontend/main.md](references/frontend/main.md) | 技术栈、组件开发、数据加载、API 响应格式 |
| 🧪 测试规范 | [testing.md](references/testing.md) | 测试文件命名、Jest/Vitest 模板、覆盖率阈值 |
| 🔒 安全红线 | [security.md](references/security.md) | 敏感信息、XSS 防护、SQL 注入、权限校验、输入验证 |
| 🌱 新项目模板 | [new-project.md](references/new-project.md) | 从零创建新项目时的初始化流程 |
| 🎯 Git 规范 | [git-patterns.md](references/git-patterns.md) | 分支模型、提交信息、PR 模板、版本号 |
| 🏗️ KX 架构规范 | [assets/project-template/kt/kx-lang/SPEC.md](assets/project-template/kt/kx-lang/SPEC.md) | KX 页面描述语言完整语法、AI 生成映射表 |
| 📖 KX 快速入门 | [assets/project-template/kt/kx-lang/README.zh.md](assets/project-template/kt/kx-lang/README.zh.md) | KX 设计理念、快速上手、核心概念
| 🔍 代码审查 | [code-review.md](references/code-review.md) | 企业级代码审查清单、空值安全、控制流安全、优雅关闭

---

## 修复问题原则

**先分析再修改**，禁止盲目尝试：

1. **定位根因** — 看日志错误栈 → 检查代码流程 → 复现最小步骤 → 必要时 git blame 了解改动意图
2. **追踪调用链** — 检查该文件的 import 依赖和调用方（至少 2 层），不只看单个文件
3. **明确原因** — 确认是逻辑错误、边界条件、还是外部依赖问题
4. **对照清单** — 执行企业级审查清单（Output Format 第 6 项）
5. **动手改** — 只改必要代码，不顺便重构无关逻辑
6. **验证** — 确认修复有效且不破坏相关功能

---

## Output Format (输出要求)

1. **任务计划**: 接到任务后，先输出任务拆解列表，格式如下：
   ```
   ── 任务拆解 ──
   Task 1: xxx
     1.1 子任务描述
     1.2 子任务描述
   Task 2: xxx
   ── 请确认是否按此计划执行 ──
   ```
   等待用户确认后再开始写代码。

2. **思考过程**: 在写代码前，先简要分析需求并列出实现步骤。

3. **代码输出**: 
   - 每次只输出必要的文件，并在代码块上方标注完整的文件路径（例如：`src/components/Button.tsx`）。
   - 代码必须完整，不要使用 `// ... existing code ...` 这种省略号敷衍。

4. **依赖说明**: 如果引入了新的第三方包，请在最后列出安装命令（如 `npm install xxx`）。

5. **内置检查清单（每次输出代码前自动执行）**:

   ```
   [ ] 本次涉及新项目/新 App？→ 已输出需求文档 (.md) + 多轮提问确认
   [ ] 本次涉及外部 API？→ 已先 curl 验证格式
   [ ] 本次涉及后端 API？→ 已 curl 验证返回数据
   [ ] 本次涉及前端页面？→ 对应的 KX 描述和后端 API 已存在
   [ ] 是否有任何假数据？→ 全部替换为真实数据源
   [ ] 功能是否完整？→ 后端 API + 前端调用 + 数据展示，全链路打通
   [ ] 开发时权限是否已关闭？→ requireLogin: false
   [ ] KX 语法检查 → @sync 不用常量赋值 / @empty 在容器内 / @mutation 用展开语法
   [ ] KX 引用检查 → 页面文件顶部有 @ref 引用模型
   [ ] KX 组件检查 → 复杂组件有 @prop 接口定义，非仅 @note 描述
   ```

6. **企业级审查清单（审查代码/修复问题时自动执行）**:

   ```
   [ ] 追踪调用链 → 已检查 import 依赖和调用方（至少 2 层）
   [ ] 错误码优先 → 所有错误判断使用 err.code 而非消息文本
   [ ] 空值保护 → 所有嵌套对象访问有可选链保护
   [ ] 超时保护 → 所有异步操作有超时兜底
   [ ] 优雅关闭 → 所有定时器/防抖有 flush 路径
   [ ] 静默失败 → 所有 continue/return 跳过路径有日志
   [ ] 功能一致性 → 相同功能的不同路径安全级别一致
   [ ] 异常输入 → 非预期格式有警告日志而非静默返回
   [ ] 不对称行为 → 首次/后续调用差异已文档化
   [ ] 并发安全 → 模块级可变状态已审查写入路径
   ```

7. **提交后复盘（每次 git commit 后自动执行）**:

   ```
   [ ] 回顾本次对话 → 是否有新的模式/反模式被发现？
   [ ] 回顾本次修改 → 是否有重复出现的 bug 类型？
   [ ] 提取规则 → 哪些发现可以抽象为 skill 的通用规则？
   [ ] 更新 skill → 已更新 SKILL.md 或 references/*.md 文件
   ```

   **复盘指南**：

   - 每次提交后，强制回顾本次对话中发现的问题
   - 问自己三个问题：
     - *"这次修复的问题，有没有在其他地方也出现过？"* → 如果是，抽象为通用规则
     - *"如果下次遇到类似场景，我希望 AI 自动做什么？"* → 添加到检查清单
     - *"这次发现的模式，是项目特有的还是通用的？"* → 项目特有加 CLAUDE.md，通用加 skill
   - 更新完成后在 commit message 中标注 `feat(skill):`