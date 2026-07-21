---
name: fullstack-rules
version: 1.1.0
description: 前后端全栈开发规范，涵盖项目结构、命名约定、API设计、数据库、安全、测试和部署。当用户进行全栈开发、创建新项目、编写前后端代码、设计API或审查代码质量时自动触发。
type: prompt
whenToUse: 当用户进行全栈开发、创建新项目、编写前后端代码、设计API接口、进行代码审查、或需要遵循团队开发规范时
arguments:
  - techStack
  - scope
---

# 编码规范

## 核心铁律
每次提问时，先在输出前加一句，本次skill加载正常。
1. **DRY 原则**: 拒绝重复代码，合理抽取公共组件和工具函数。
2. **单个文件 ≤ 1000 行**（含空行注释）。接近 700 行主动拆分。
3. **一个文件 = 一个模块**。组件 A 不内嵌组件 B 的 UI/逻辑；前端跨模块用 props/emit/v-model/composable 通信。
4. **UI 禁止 emoji 图标**。所有 UI 图标用图标库或内联SVG。控制台日志 emoji 前缀不受限。
5. **修改现有代码前先说明计划**；不确定的业务逻辑先提问再写。
6. **每个函数写文档注释**；注释和文档用简体中文,函数必须包含 JSDoc/Docstring 格式的参数和返回值说明。
7. **错误处理**: 不要吞噬异常，所有错误必须被捕获并记录日志。
8. **每次修改代码后主动提交 git**，更新 commit 信息。git规范文件：[Git Commit Message Convention](references/git-patterns.md)

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
| **先读后改** | 修改任何文件前，必须先 Read 该文件。禁止凭记忆或猜测修改代码 |
| **不改无关代码** | 只修改任务直接相关的部分，不顺便重构、格式化、优化无关代码 |
| **不确定先问** | 遇到不确定的业务逻辑（如"这个字段是什么意思"、"这一步是做什么"），先提问再写，不要猜测 |
| **不删未读内容** | 不要删除未读过的文件内容。如果觉得某段代码多余，先读完整文件再决定 |
| **改完即验证** | 修改完成后，说明验证方式（运行测试、手动测试步骤等），确保不破坏已有功能 |

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

---

## 修复问题原则

**先分析再修改**，禁止盲目尝试：

1. **定位根因** — 看日志错误栈 → 检查代码流程 → 复现最小步骤 → 必要时 git blame 了解改动意图
2. **明确原因** — 确认是逻辑错误、边界条件、还是外部依赖问题
3. **动手改** — 只改必要代码，不顺便重构无关逻辑
4. **验证** — 确认修复有效且不破坏相关功能

---

## Output Format (输出要求)

1. **思考过程**: 在写代码前，先简要分析需求并列出实现步骤。
2. **代码输出**: 
   - 每次只输出必要的文件，并在代码块上方标注完整的文件路径（例如：`src/components/Button.tsx`）。
   - 代码必须完整，不要使用 `// ... existing code ...` 这种省略号敷衍。
3. **依赖说明**: 如果引入了新的第三方包，请在最后列出安装命令（如 `npm install xxx`）。
4. **修改后验证**: 简述验证方式（运行测试 / 手动测试步骤等），确保改动正确。