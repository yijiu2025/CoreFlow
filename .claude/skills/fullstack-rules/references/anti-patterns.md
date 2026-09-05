# 反例速查与企业级审查清单

> 写代码前快速扫一遍反例表；审查代码 / 修复问题时执行企业级审查清单。

## 反例速查

| 场景          | ❌ 错误写法                                     | ✅ 正确做法                                                   |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| API 请求      | 组件内直接 `axios.get('/api/users')`            | 封装到 `src/api/user.ts`，组件调 `getUser()`                  |
| 错误处理      | `catch { /* 吞掉 */ }`                          | `catch (e) { logger.error(e); throw e }`                      |
| 注释          | 只写"做了什么" `// 设置用户名为张三`            | 写"为什么" `// 用户未设置昵称时用手机号占位`                  |
| 类型          | `const data: any = res.data`                    | `const data: ApiResult<User> = res.data`                      |
| 样式          | 内联 `style="color: red"`                       | CSS 变量 `var(--color-error)` 或 Tailwind 类                  |
| 数据库        | `WHERE id = ${id}` 拼接 SQL                     | 参数化 `WHERE id = ?` / Sequelize `where: { id }`             |
| 提交          | `git commit -m "fix bug"`                       | `git commit -m "fix(login): 修复空指针异常"`                  |
| 分支同步      | `git merge develop` 在 feature 分支             | `git rebase develop` 保持线性历史                             |
| 敏感信息      | 代码中硬编码 `apiKey: "sk-xxx"`                 | 从 `process.env.API_KEY` 读取                                 |
| 文件大小      | 一个文件 2000 行不拆分                          | 接近 400 行规划拆分、1000 行强制拆分（见 AGENTS.md 文件大小限制） |
| 错误判断      | `err.message.includes('路由重复')` 匹配中文文本 | `err.code === 'DUPLICATE_ROUTE'` 用错误码                     |
| 嵌套访问      | `configs[a].groups[b].apis[c]` 直接链式访问     | `configs[a]?.groups?.[b]?.apis?.[c]` 可选链保护               |
| 跳过路径      | `if (!x) continue` 静默跳过                     | `if (!x) { console.warn('...'); continue; }` 记录日志         |
| 异步超时      | `await register(app)` 无超时限制                | `Promise.race([register(app), timeoutPromise])` 超时保护      |
| 优雅关闭      | `setTimeout` 定时任务无人清理                   | 暴露 `flush()` 方法，`onClose` 钩子调用                       |
| 安全一致性    | HTTP 路由有 IP 白名单，WebSocket 没有           | 所有入口路径安全级别一致                                      |
| 异常输入      | 非预期格式静默返回 false                        | 记录 `console.warn` 告知配置错误                              |
| onClose 错误  | `onClose` 钩子不 catch，异步异常静默丢失        | 内部 try-catch + console.error                                |
| 进程退出日志  | `process.exit(1)` 导致日志可能被截断            | `setTimeout(() => process.exit(1), 100)` 给刷新时间           |
| 配置无警告    | 生产环境缺少关键配置，启动时不提醒              | 启动时输出 `⚠️ [App]` 警告，附修复指引                        |
| 公共 API 参数 | 假设调用方总传有效参数，深层崩溃                | 入口处 `if (!param) { err.code='INVALID_PARAM'; throw err; }` |
| 标识符生成    | 用 `Math.random()` 生成标识符                   | 用固定默认值 `'default'` 或 `crypto.randomUUID()`             |
| reply.sent    | 直接 `return reply.send(...)` 不标记 sent       | `reply.send(...); reply.sent = true; return;`                 |
| 统一响应      | `reply.code(400).send({error})` 直接 send       | `reply.result.badRequest('消息')` 用统一方法                  |

## 企业级审查清单（审查代码 / 修复问题时逐项执行）

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
[ ] 公共 API 参数校验 → 所有 export 函数入口处防御性校验
[ ] reply.sent 标记 → 直接 reply.send() 后必须 reply.sent = true
[ ] 登录与角色一致性 → allowRoles 设置时必须强制登录
[ ] 错误对象构造 → 用 err.code = '...' 而非 Object.assign
[ ] 文件头注释 → JSDoc 格式，带 @author 和 @since
```

完整版（含代码级示例与展开说明）见 [code-review.md](code-review.md)。

## 提交后复盘（每次 git commit 后执行）

```
[ ] 回顾本次对话 → 是否有新的模式/反模式被发现？
[ ] 回顾本次修改 → 是否有重复出现的 bug 类型？
[ ] 提取规则 → 哪些发现可以抽象为 skill 的通用规则？
[ ] 更新 skill → 已更新 SKILL.md 或 references/*.md 文件
```

**复盘三问**：

- _"这次修复的问题，有没有在其他地方也出现过？"_ → 如果是，抽象为通用规则
- _"如果下次遇到类似场景，我希望 AI 自动做什么？"_ → 添加到检查清单
- _"这次发现的模式，是项目特有的还是通用的？"_ → 项目特有加 AGENTS.md，通用加 skill

更新完成后在 commit message 中标注 `feat(skill):`。
