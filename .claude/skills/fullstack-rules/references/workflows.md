# 端到端任务剧本（Playbooks）

> 五类高频任务的端到端步骤与验收清单。执行顺序铁律见 SKILL.md；
> 写代码前先扫 [pitfalls.md](pitfalls.md) 对应条目；细节模板在各专题文档。

## 剧本 A：新增后端 API

**涉及**：`nodejs-fastify.md`（模板）、`naming-convention.md`（命名）、`security.md`（红线）

1. 确认路由归属域：`src/api/<domain>/`（已有域复用，新域建 `system.json`）
2. 设计三级前缀：system prefix + group prefix + route url（写完逐级核对拼接，防重复前缀）
3. `registerSecureRoute` 注册：name 全局唯一、alias 中文、schema 校验入参、`requireLogin: false`（开发期）
4. DAO 写在 `src/app/<app>/dao/`：`getModel` 取模型、`delete_version: 0` 过滤、参数化查询
5. 模型/迁移：`src/models/<ns>/` + `migrations/`（禁 DB_SYNC，生产必须走迁移）
6. 序列化函数 `formatXxx`：集中管理输出字段，敏感字段不外露
7. **curl 验证**：200 格式 / 400 参数 / 401 未登录 / 404 不存在 / 空数据边界
8. 权限：功能调通后补 `permission` / `allowRoles`，重启验证

**验收**：nodejs-fastify.md"十、开发完成后验证清单"逐项打勾。

## 剧本 B：新增前端页面

**涉及**：`frontend/web/vue.md`、`kx.md`（KX 场景）、AGENTS.md 设备接入清单

1. 确认后端 API 已存在且 curl 验证过（**没有就先走剧本 A**）
2. 组件归属：三层目录 `src/components/<功能分类>/<业务页面>/`；一个文件一个模块
3. API 封装：`src/api/<domain>.ts` 统一封装，组件不直接 axios
4. 页面开发：SFC 顺序、composable 抽取、图标用 lucide-vue-next（禁 emoji）
5. 路由 + 权限：路由守卫 + `v-auth` 指令权限编码与后端一致
6. 类型：响应类型 `ApiResult<T>`，禁止 `any`
7. 验证：浏览器全链路（真实数据），组件四状态（加载/空/错误/正常）完备

**验收**：ESLint 0 警告；vue-tsc 通过；设备头已随 setupDeviceSync 自动携带。

## 剧本 C：对接外部 API

**涉及**：SKILL.md 执行顺序第 1 步、`security.md`

1. **先 curl 外部接口**，确认真实字段名/类型/分页方式/错误结构——不猜测
2. 记录契约：字段映射表（外部字段 → 内部字段），归档到 DAO/Service 注释
3. 后端代理层：统一超时（Promise.race）、错误映射（外部错误码 → 内部 err.code）、响应裁剪（只透出前端需要的字段）
4. 降级策略：外部服务不可用时的缓存/兜底行为，明确写进注释
5. 密钥：`process.env.XXX`，不入代码；缺失时启动告警
6. **curl 验证后端 → 外部 → 前端全链路**

**验收**：停掉外部 API 模拟故障，前端有兜底表现而非白屏。

## 剧本 D：修复 Bug

**涉及**：SKILL.md 修复问题原则、[pitfalls.md](pitfalls.md)（先扫历史事故）

1. **扫 pitfalls.md**：确认是否为历史事故的同型问题（是 → 按既有规则修，别发明新方案）
2. 定位根因：错误栈 → 代码流程 → 最小复现 → git blame 了解改动意图
3. 追踪调用链 ≥2 层（import 依赖 + 调用方）
4. 修最小范围：不顺便重构
5. **补边界测试**：本次 bug 的触发条件写成测试用例（防回归）
6. 验证：新测试 + 相关既有测试 + 全量 jest
7. 复盘：按 anti-patterns.md 复盘三问，可泛化的写入 skill

**验收**：新增测试覆盖该 bug；全量测试通过；commit message 说明根因而非现象。

## 剧本 E：代码审查

**涉及**：[anti-patterns.md](anti-patterns.md)（快速清单）→ [code-review.md](code-review.md)（完整展开）

1. 先读 diff 全量（不只看改动行，看上下文与调用方）
2. 追踪调用链 ≥2 层
3. 执行企业级审查清单 15 项逐项打勾
4. 扫 pitfalls.md：改动模块是否有历史事故同型风险
5. 输出审查报告：按严重度分级（🔴 必须修 / 🟡 建议修 / 🔵 打磨），每条带文件:行号与理由

**验收**：所有 🔴 项修复后才允许合并/提交。
