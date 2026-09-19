# 压测基线（P0）

对**真实启动的应用**（含 MySQL / Redis / 全部加载器）做固定并发的容量与延迟基线，
并独立留档**服务进程事件循环的最长冻结时长**（tick 间隔法）。

```bash
npm run bench            # 完整基线（每场景 8s，留档到 results/）
node scripts/bench/baseline.mjs --quick   # 冒烟（每场景 3s，结果标注 quickMode）
```

## 组成

| 文件 | 职责 |
| --- | --- |
| `baseline.mjs` | 编排：起真实应用 → 预热 → 三场景压测 → 读探针 → 留档 JSON |
| `tick-probe.mjs` | 事件循环探针，经 `node --import` 注入子进程，业务代码零侵入 |
| `results/baseline-*.json` | 留档（含机器指纹），用于优化前后同机对比 |

## 三场景

| 场景 | 请求 | 覆盖 |
| --- | --- | --- |
| S1-live | `GET /v1/health/live` | 管线地板（Fastify + 全局钩子，无 I/O） |
| S2-ready | `GET /v1/health/ready` | I/O 扇出（Redis + DB 就绪检查） |
| S3-challenge | `POST /api/firewall/v1/challenge/verify` | 防火墙热路径（访问层 Lua 读 + 挑战未命中拒绝） |

## 事件循环冻结：为什么单独量

吞吐量看不出阻塞类退化 —— 被冻结 700ms 的服务照样有漂亮 RPS，只是尾延迟爆炸
（bcryptjs 事件：RPS 正常、冻结 774ms）。探针用 10ms 心跳取相邻 tick 的**最大间隔**，
即事件循环最长冻结。判读：**噪声下限约 20ms，>50ms 才值得追查**。
⚠️ 不要用 `monitorEventLoopDelay`（固定分辨率采样会把一次性长冻结漏报成 17ms）。

冻结分两段留档：**boot**（模块加载/模型同步，不代表请求路径）与 **load**（就绪后压测期，
才是回归判据）。两段的切换靠标记文件让探针归零（Windows 上 `child.kill()` 走
TerminateProcess，信号监听不可用，所以探针每秒把结果落盘）。

## 与真实流量的差异

1. **IP 限流被旁路**：三个场景共用 127.0.0.1，而管理端持久化配置（被 git 跟踪的
   `firewall_config.json`）是 10000 req/60s/IP 且跨运行持久在 Redis —— 不旁路的话
   跑到一半全是 429。压测通过 `FW_RATE_LIMIT_OVERRIDE=1000000` 上调（纯放宽旁路，
   实现见 `first-ratelimit.js` 的 `resolveRateLimitMax`，有测试锁定）；限流计数本身的
   Redis 开销仍在每个请求里。
2. **S3 走「挑战未命中 → 拒绝」分支**：挑战 ID 随机，代表防火墙热路径开销，
   不代表验证成功分支的成本。
3. **单机回环**：绝对值只可用于同机前后对比，不可跨机器比较。
4. Fastify logger 固定 `level: 'info'`（dev 模式 pino-pretty），其成本计入管线地板，
   前后口径一致。

## 2026-09-19 基线（完整模式）

| 场景 | RPS | p50 | p95 | p99 |
| --- | --- | --- | --- | --- |
| S1-live | 1620 | 29.8ms | 43.7ms | 54.1ms |
| S2-ready | 619 | 31.5ms | 42.3ms | 50.1ms |
| S3-challenge | 762 | 25.3ms | 34.1ms | 39.5ms |

负载期事件循环最长冻结 **32.8ms**（噪声区间内 → 请求路径无阻塞退化）。
启动期最长冻结 ~1.2s（模型同步阶段，后续可单独排查，不影响请求路径）。
