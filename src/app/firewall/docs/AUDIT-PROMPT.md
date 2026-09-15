# 模块审查指令：app/firewall（+ api/firewall）

> 用途：对 `src/app/firewall` 与其 HTTP 层 `src/api/firewall` 做一次结构化审查，
> 覆盖**代码质量**、**安全防护有效性**与**文件组织合理性**三个维度。
> 依据：`.workbuddy/memory/MEMORY.md`（项目约定）+ `framework/auth/docs/AUDIT-PROMPT.md`（同族模板）。
> 使用方式：把本文件全文作为提示词交给执行者（人或 AI），按其中流程产出报告。
> 产出：`src/app/firewall/docs/AUDIT-REPORT-YYYY-MM-DD.md`。

---

## 一、审查对象

`src/app/firewall/`（33 个文件，约 4874 行）+ `src/api/firewall/`（6 个文件，约 804 行）

### 1.1 app 层（按行数降序）

| 文件 | 行数 | 职责 |
| ---- | ---- | ---- |
| `util/redis.js` | **1026** | Redis 访问层：语义化操作 + Lua + 内存降级（本轮新增，最大的文件） |
| `dao/dao.js` | 400 | 配置/名单持久化、节点自动定位、启动同步 |
| `data/store.js` | 278 | 流量环形缓冲（1000 条）、统计、10s 节流落盘、WS 广播 |
| `config/config.js` | 278 | 默认策略矩阵、IP 解析 API、`CHALLENGE_SECRET` |
| `engine/dao/block-manager.js` | 272 | 封禁/白名单策略：优先级、状态码映射、Retry-After |
| `services/monitor.service.js` | 253 | WS 客户端管理 + 封禁/白名单编排 |
| `engine/pipeline.js` | 210 | onRequest 三阶段管道 + 日志记录 |
| `cli/blocks.js` | 195 | CLI：封禁增删查 |
| `cli/whitelist.js` | 161 | CLI：白名单增删查 |
| `engine/auto-responder.js` | 139 | 自动封禁 + 邮件/Webhook 告警 |
| `index.js` | 110 | Fastify 插件入口（钩子注册） |
| `permission/seeder.js` | 106 | 角色种子（Upsert） |
| `engine/detectors/rate-limiter.js` | 103 | 滑窗限频 + 端点级封禁 |
| `engine/detectors/bot-detector.js` | 100 | Bot/僵尸网络检测 → 挑战 |
| `data/challenge-template.js` | 96 | 挑战页 HTML（HMAC 签名 + 浏览器指纹采集） |
| `engine/detectors/scan-trap.js` | 95 | 404/403 扫描陷阱 + 登录失败计数 |
| `util/connection-tracker.js` | 95 | 并发连接追踪 + 僵尸清理 |
| `engine/detectors/brute-force.js` | 95 | 登录暴力破解防护（账号 + IP 双维度） |
| `cli/stats.js` | 89 | CLI：运行状态统计 |
| `permission/roles.js` | 86 | 角色定义（PBAC 静态注册） |
| `engine/detectors/geo-filter.js` | 85 | 地理围栏 + GeoIP 解析 |
| `cli/status.js` | 83 | CLI：状态查看 |
| `services/challenge.service.js` | 74 | 挑战结果校验 + 签发通过令牌 |
| `engine/detectors/first-ratelimit.js` | 74 | 注册 `@fastify/rate-limit`（全局第一层） |
| `util/shared.js` | 60 | 内存状态 + 30s 配置缓存 |
| `permission/index.js` | 56 | 权限字典（15 个权限码） |
| `cli/redis-boot.js` | 46 | CLI 的 Redis 连接生命周期 |
| `services/metrics.service.js` | 42 | 指标聚合视图 |
| `config.js` | 41 | app 元数据（`init` / `oauth_client`） |
| `cli/index.js` | 40 | CLI 子命令注册 |
| `engine/index.js` | 36 | engine barrel |
| `util/fingerprint.js` | 26 | 请求指纹 |
| `dao/block-manager.js` | 24 | 纯 re-export |

### 1.2 api 层

| 文件 | 行数 | 职责 |
| ---- | ---- | ---- |
| `v1/monitor.js` | 292 | 中控面板：摘要/记录/节点/设置/黑名单/封禁/白名单/WS |
| `v1/export.js` | 170 | 规则导入导出 |
| `v1/schemas/monitor.js` | 163 | JSON Schema |
| `v1/apiConfig.js` | 95 | Guard 安全配置中心（全域策略热更新） |
| `v1/challenge.js` | 44 | 挑战验证路由 |
| `v1/metrics.js` | 40 | 性能指标路由 |

---

## 二、必须先读懂的业务背景（禁止误报为 bug）

审查前先确认以下设计意图，凡属有意设计的不作为缺陷上报（但**必须验证其确实成立**）：

1. **`util/redis.js` 是唯一的 Redis 出口**：`getStore('fw')` 自动加前缀、单次调用带超时（2s）、
   Redis 不可用时**同一套语义**自动走进程内内存实现。调用方不再有 `if (!redisClient)` 分支。
2. **`readAccessState` 的 fail-open**：Redis 抖动时返回"无任何状态"（不拦人），
   历史语义，注释已写明理由。属有意设计，但需评估"攻击者诱发 Redis 超时即可绕过封禁"的风险。
3. **白名单优先于封禁**：Lua 内短路，指纹白名单优先于 IP 白名单。有意设计。
4. **`CHALLENGE` / `SCANNER` / `BLOCKED` / `BRUTE_FORCE` 是封禁状态机的一部分**：
   不同状态映射不同 HTTP 码（`SCANNER`→403，其余→429）。需**验证状态机是否自洽**。
5. **`enableRateLimit: false` 时 `checkRateLimit` 直接返回 true**（整个限频关闭）。
6. **`initDao()` 只由 CLI 调用**：不要武断判为 bug，必须查证服务端是否另有加载路径，
   并实测运行时内存中的配置与磁盘文件是否一致。
7. **`initFirewall` 同时出现在 `loader/registry/05-firewall.js` 与 `config.js` 的 `init`**：
   需查证 `10-apps.js` 是否会二次注册，以及 `fastify-plugin` 下钩子落在哪个作用域。
8. **GeoIP 只做"限频"不做"拦截"**：境外敏感路径是限频而非阻断，有意设计。
9. **`CHALLENGE_SECRET` 缺失时生产环境 `process.exit(1)`**：fail-fast，有意设计。

---

## 三、审查维度

### A. 防护有效性（本轮重点，必须实测）

| 检查点 | 判定标准 |
| ------ | -------- |
| 挑战链路端到端 | 触发 → 拿到挑战页 → 提交验证 → 拿到令牌 → 放行，**全链路必须可走通** |
| 挑战可绕过性 | 凭证是否明文暴露在响应中；校验字段是否全部由客户端提供 |
| 封禁状态机 | `CHALLENGE` 状态在入口是否被正确翻译为挑战页而非硬封禁 |
| 指纹强度 | 输入是否全部客户端可控 → 指纹封禁能否被"改一个 Header"绕过 |
| 限频是否真的生效 | 配置开关 → 插件注册 → 请求 429 三段链路是否闭环 |
| 守卫授权粒度 | 每个接口的 `requireLogin` / `allowRoles` 是否与实际数据一致 |
| IP 伪造 | `trustProxy` 配置下 `X-Forwarded-For` 能否伪造 `req.ip` |
| 白名单兜底 | Redis 不可用时，配置文件里的手动名单是否仍然是有效防线 |

### B. 配置面与实现面的一致性

- 配置里出现的键，是否有代码读取；代码读取的键，是否在配置里有定义
- 管理员可通过 API/Schema 切换的开关，是否真的有效果（**静默无效开关是高危**）
- 运行时内存配置 vs 磁盘配置文件是否一致（`initDao` 是否被调用）
- 配置变更后，同一请求内是否可能读到两个版本的配置

### C. 控制流与空值安全

- 禁止用 `err.message.includes()` 做控制流判断（须用 `err.code` / 结构化标记）
- `req.body` / 函数参数解构前是否防御 `undefined`
- `await` 是否有遗漏（尤其写操作）
- `catch {}` 是否吞掉关键异常（静默失败检测）
- 计数/累加是否有界（内存 DoS）

### D. 并发与资源

- 模块级可变状态（Map / 数组 / 定时器）是否可能无界增长
- 请求热路径的 Redis 往返次数（用 `INFO commandstats` 前后差量化）
- 钩子是否可能被注册多次（会导致计数翻倍、阈值减半）
- 定时器是否 `.unref()` / 是否在 `onClose` 清理

### E. 错误处理

- 所有 `continue`/`return` 跳过路径是否记日志
- 错误响应是否会把内部 message（含文件路径/SQL/Redis 错误）透给客户端
- 批量操作是否逐条 try/catch 且**记录失败原因**

### F. 文件组织（本次重点）

| 检查点 | 判定标准 |
| ------ | -------- |
| 单文件行数 | ≤1000 硬限；`util/redis.js` 1026 行已超限，需给出拆分方案 |
| 一文件一模块 | 是否有内嵌另一模块完整逻辑的文件 |
| 命名一致性 | `dao/block-manager.js` 与 `engine/dao/block-manager.js` 同名易混 |
| 死代码/死导出 | 全仓零调用的导出必须逐个列出（含"仅测试引用"） |
| 职责重叠 | `permission/roles.js` 与 `permission/seeder.js` 是否重复定义 |
| 循环依赖 | 依赖图脚本确认内部无环 |
| 文档一致性 | README 的目录树/职责表是否与代码一致 |
| 测试真实性 | 测试文件是否 import 真身（内联副本 = 零覆盖） |

### G. 注释与文档

- 文件头是否有 JSDoc + `@author`/`@since`
- 注释是否与实现一致（**本仓历史最大问题类型**）
- 注释里的历史缺陷说明是否准确（不能变成"传说"）

---

## 四、工作方式（硬性规则）

1. **先读后判**：完整读取全部 39 个文件，不凭文件名或片段下结论。
2. **追调用链**：每个导出都要在全仓 grep 调用点，区分「生产调用」「仅测试调用」「零调用」。
3. **实测优先**：能用脚本验证的必须实测，不接受"看起来像"。本轮至少覆盖：
   - `app.inject()` 打全部 monitor/export/challenge 端点（带/不带认证）
   - 挑战链路端到端（触发 → 提取凭证 → 提交）
   - 封禁状态机（人为写入各状态，观察入口行为）
   - `CONFIG RESETSTAT` + `INFO commandstats` 量化单请求 Redis 命令数
   - 依赖图脚本查环
   - `createGuard` 直接调用验证授权粒度（用真实 guard 配置 + 不同身份）
   - 探针脚本写进 `.tmp-probe/`（已 gitignore），**用完清理**，并清掉探针写入的 Redis key。
4. **区分有意设计与缺陷**：第二节列出的意图不判错；但若实测发现意图**事实上不成立**（如
   号称"指纹难以伪造"实则一个 Header 就能换掉），必须作为缺陷上报。
5. **不修改产品代码**：本指令只审查并产出报告；修复是后续独立任务。
   **禁止对真实环境做破坏性写入**（配置覆盖、批量导入等），此类路径只读代码 + 用现状数据旁证。
6. **修复后验证**：若后续执行修复，必须 `eslint`（0 问题）+ 全量测试通过。

---

## 五、输出格式

### 5.1 报告头部

```
## 审查报告：app/firewall

| 等级 | 数量 | 说明 |
| ---- | ---- | ---- |
| 🔴 严重 | N | 防护绕过、提权、配置/数据丢失、核心功能死锁 |
| 🟡 中等 | N | 静默失效、错误处理、测试失真、组织缺陷 |
| 🔵 低 | N | 可读性、命名、注释、死导出 |
```

### 5.2 防护有效性专项结论

必须给出一张「宣称 vs 实测」对照表：README/注释宣称的每条防护能力 → 实测是否成立 → 证据。

### 5.3 文件组织专项结论

```
| 文件 | 行数 | 职责是否单一 | 建议 | 优先级 |
```

必须给出**可执行的拆分方案**：拆成哪几个文件、每个装什么、新文件名是什么。

### 5.4 死代码清单

```
| 导出 | 定义位置 | 生产调用 | 测试调用 | 处置建议 |
```

### 5.5 每个问题必须包含

- **位置**：`文件:行号`
- **问题**：一句话
- **证据**：代码片段或实测输出（不接受"我觉得"）
- **影响**：会导致什么后果
- **建议**：具体怎么改

### 5.6 必须包含「已确认无问题清单」

列出检查过但确认正常的项（含**实测方法与原始输出**），防止后续重复排查。

### 5.7 优先级排序

按「危害 / 修复成本」给出修复顺序表。

---

## 六、审查者自检清单

```
[ ] 已完整读取 app 33 个 + api 6 个文件（非只读片段）
[ ] 已用依赖图确认内部无循环依赖
[ ] 已实测挑战链路端到端（不只是读代码推断）
[ ] 已实测封禁状态机四种状态的入口行为
[ ] 已实测未登录/已登录无角色/管理员三种身份 × 各分组的守卫判定
[ ] 已确认 trustProxy 与 XFF 伪造的实际效果
[ ] 已逐个 grep 所有导出，产出死代码清单
[ ] 已核对每条声明式配置开关是否真的被代码读取
[ ] 已量化请求热路径的 Redis 往返数
[ ] 已给出可执行的拆分方案（不只说"太大了"）
[ ] 已输出「已确认无问题清单」并附原始输出
[ ] 探针脚本与写入的 Redis key 已清理
[ ] 报告未使用"可能""也许"等模糊表述而无依据
[ ] 未修改任何产品代码
```
