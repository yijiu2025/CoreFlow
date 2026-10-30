# scripts/verify —— 跨进程行为验收关卡

这里放的是**必须多进程才能验证**的不变量。它们不能用 jest 覆盖：单进程里
「分布式锁」「配置同步」都可以被单例状态伪装成正确，只有真实多进程 + 真实 Redis/MySQL
才能证伪。

> 背景：这些行为在 `reports/backend-architecture-remediation-2026-09-19.html` 里编号为
> **E1**（调度器分布式锁）、**E2**（守卫配置跨实例同步）、**E3**（遥测与 WS 广播外置）。
> E1/E2 此前只做到"逻辑有测试覆盖"，扩容评审把它列为**扩容前唯一必做的一步**；
> E3 则是最后剩下的多实例语义缺口。

## 关卡一览

| 命令                    | 验证什么                                                                                                         | 依赖  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ----- |
| `npm run verify:lock`   | 同一任务周期内，N 个进程抢同一把锁 → **恰好 1 个**成功；TTL 内抢不到（未被提前释放）；派生 TTL ≥ 2×周期；原始锁 TTL 过期后能重抢（无泄漏） | Redis |
| `npm run verify:fanout` | 进程 A 产生一条告警 → 进程 B 的 WS 客户端收到；且**两端都恰好 1 条**（不重复投递）                               | Redis |
| `npm run verify:stats`  | 进程 A 产生的流量出现在进程 B 的聚合统计里；**总数不丢不重**（多算一次就变红）                                   | Redis |
| `npm run verify:queue`  | 队列指针跨实例一致：别人写的消息立刻可见（不因进程内 meta 缓存而"指针倒退"）；多消费者并发取**不重不漏**；环形队列 count 不被并发写坏 | Redis |
| `npm run verify:guard`  | 进程 A 改库 → 进程 B 的内存配置在同步周期内跟上；版本不变时不重复合并                                            | MySQL |
| `npm run verify:docs`   | 全仓 Markdown 的相对链接是否指向真实文件（不依赖任何服务，纯静态）                                               | 无    |
| `npm run verify:all`    | 依次跑上面五个需要服务的关卡，聚合退出码                                                                         | 同上  |

> `verify:docs` 不在 `verify:all` 里：它零依赖、跑得极快，被挂在 CI 的 **lint 作业**
> （装依赖之前）与本地 `npm run verify:docs`，混进需要 Redis/MySQL 的聚合器只会让
> "环境不可用"污染一个本来永远能跑的检查。

可用环境变量微调：`PROBE_PROCS`（竞争者进程数，默认 5）、`PROBE_TTL_MS`（**任务周期**，默认 3000；
调度器会把它派生为锁 TTL `max(2×周期, 周期+60s)`，见下方"为什么第 3/4 轮不复用周期锁"）、
`PROBE_SEED`（队列条数，默认 300）、`PROBE_CONSUME_PROCS`（并发消费者，默认 3）、
`PROBE_RING_MAX` / `PROBE_RING_SEED`（环形队列容量与每写入者条数，默认 100 / 60）。

## 为什么第 3/4 轮不复用周期锁

E1 的前两轮走真实调度器路径 `acquirePeriodLock()`：传进去的是**任务周期**，
实际锁 TTL 由它派生 —— `max(2×周期, 周期+60s)`。这个派生是对的（任务跑超周期时
锁不该提前过期，否则其他实例会并发执行同一任务），但它让"等 TTL 看锁过期"这件事
在周期锁上**永远等不到**：拿 3s 的周期等 3s，实际锁还是 63s。

所以关卡拆成两组断言：

| 轮次 | 用什么 | 验什么 |
| --- | --- | --- |
| 1 / 2 | `acquirePeriodLock`（真实路径） | N 进程恰好 1 个成功；周期内再抢必失败 |
| — | 读 `PTTL scheduler:<key>` | 派生 TTL ≥ 2×周期（防"TTL 等于周期"的回归） |
| 3 / 4 | `createLock`（TTL 精确） | 空锁能抢到；过期后能重抢（锁不会永久卡死） |

2026-10-30 之前第 3 轮用的是周期锁，于是在 TTL 派生改造落地后变成
"仍未抢到 → 锁泄漏了"的假红：锁没泄漏，是关卡在等一个不会到期的锁。

## 前置条件

1. 项目根目录有 `.env`（脚本自己加载，不需要 `--env-file`）。
2. Redis 可达、且 `.env` 里 `REDIS_ENABLED=true`。
3. MySQL 里已有 `guard_configs` 数据（E2 会先取全量快照，**空表会直接拒绝运行**）。

## 指向另一套环境（重要）

各关卡用 `process.loadEnvFile()` **自己加载** env 文件，而不是 `node --env-file`。
这不是风格偏好，是因为下面两点叠加会让关卡无法切换环境：

- `--env-file` 的取值**不能被命令行环境变量覆盖**（进程环境变量优先）；
- `npm run` 会把命令行上的变量**丢掉**（实测 `PROBE_PROCS=3 npm run verify:lock` 仍是默认 5）。

所以覆盖时**必须直接跑 `node`**：

```bash
# 换整份 env 文件（对会写库的 E2 尤其重要：可以指向测试库）
VERIFY_ENV_FILE=.env.testing node scripts/verify/guard-sync.mjs

# 只改单个变量（已存在的进程环境变量优先于 env 文件）
DB_HOST=10.0.0.9 node scripts/verify/guard-sync.mjs
PROBE_PROCS=10   node scripts/verify/lock-mutex.mjs
```

`npm run verify:*` 适合默认环境；要指向别处就直接调用 `node`。

## 退出码约定

把「环境不可用」和「断言失败」分开，是为了让关卡**不因环境问题而变红**——
长期亮红灯的检查等于没有检查。

| 码  | 含义                                                                | 该怎么办                               |
| --- | ------------------------------------------------------------------- | -------------------------------------- |
| `0` | 全部通过                                                            | ——                                     |
| `1` | 断言失败（互斥不成立 / 同步未生效）                                 | 这是真回归，查代码                     |
| `2` | **回滚不完整**（仅 E2）                                             | 需要人工检查 `guard_configs`，不要重跑 |
| `3` | 环境不可用（Redis / MySQL 不可达，或 env 文件缺失、前置条件不满足） | 修环境，不是代码问题                   |

两个关卡都有**有界前置检查**：Redis 8s、MySQL 3s 内给结论。
不这样做的话，「环境不可用」会表现为一次 90 秒的挂起
（`connectStandalone()` 的内部重连按 `REDIS_MAX_RETRIES` 退避，实测要 90s 以上才返回，
详见该函数所在文件的注释与实际行为的差异）。

## 安全说明（E2 会写真实库）

`guard-sync.mjs` 是**唯一会写业务数据**的关卡。它做了四层防护：

1. 动手前 `Dao.backup()` 取全量快照，`finally` 里**无条件** `Dao.restore()` 并回读核对；
2. 快照为空时**在任何写入之前**退出（`restore()` 是 `truncate` + 回填，空快照会把整表清空）；
3. `NODE_ENV=production` 时拒绝运行；
4. 观测目标选 `Notice > config > getChannels`（非健康探针、非鉴权路径），内容变更用
   fail-closed 的 `allowIps`（写入不可路由的 TEST-NET-3 地址）。

它**只改 `version` 字段**做第一轮验证（内容逐字节不变 = 零行为影响），
第二轮才改内容，且两轮都在同一个 `finally` 里回滚。

## 隔离

E1 的父子进程都切到 **`REDIS_DB=15`**，不碰 db0 里的真实键
（`framework/redis/plugin.js:249` 读取该变量作为连接的 `database` 选项）。
可用 `PROBE_REDIS_DB` 覆盖。

E3 的两个关卡也在 **`REDIS_DB=15`** 上运行，并把遥测落盘路径重定向到 `.tmp-probe/`
（`FW_TRAFFIC_STATS_FILE`），避免写到被 git 跟踪的 `src/data/traffic_stats.json`；
关卡结束会删除临时文件，并清掉自己写入的 `fwstats:*` 基数（**只清这个前缀**，
它是本项目自有的统计键，不影响其他数据）。

## 子进程约定：**自建连接**

`createQueue(..., { backend: 'redis' })` / `createLock(...)` 只是**选后端**，不会替你连 Redis；
连接由 `connectStandalone()` 建好放进 `globalRedis`。所以每个被拉起的子进程都必须：

```js
const conn = await connectStandalone({ timeoutMs: 8000 });
if (!conn.ready) throw new Error(`connect_failed:${conn.reason}`);
// …干活…
await disconnectStandalone();   // 不关 socket 会让进程挂住，父进程只能等到硬超时
```

漏了这一步的表现**不是**"连不上"，而是每个队列/锁操作抛
`RedisRequiredError: 主 Redis 不可用`，父进程汇总成一句"消费者异常 / 写入者异常"，
看起来像业务回归。2026-10-30 `queue-atomic` 就因为这个一直红在"断言失败"上
（同一个关卡前面还压着一个 `destroy()` 的数组解构崩溃，把它挡住了）。

## 注意：这些关卡不探测 Redis 之外的部署形态

`docker` / 多主机等形态不在覆盖范围内（本机无 Docker）。
