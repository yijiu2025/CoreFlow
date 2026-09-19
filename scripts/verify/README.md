# scripts/verify —— 跨进程行为验收关卡

这里放的是**必须多进程才能验证**的不变量。它们不能用 jest 覆盖：单进程里
「分布式锁」「配置同步」都可以被单例状态伪装成正确，只有真实多进程 + 真实 Redis/MySQL
才能证伪。

> 背景：这两个行为在 `reports/backend-architecture-remediation-2026-09-19.html` 里编号为
> **E1**（调度器分布式锁）与 **E2**（守卫配置跨实例同步）。它们此前只做到"逻辑有测试覆盖"，
> 本次扩容评审把它列为**扩容前唯一必做的一步**。

## 关卡一览

| 命令                   | 验证什么                                                                                                         | 依赖  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ----- |
| `npm run verify:lock`  | 同一任务周期内，N 个进程抢同一把锁 → **恰好 1 个**成功；TTL 内抢不到（未被提前释放）；TTL 过期后能抢到（无泄漏） | Redis |
| `npm run verify:guard` | 进程 A 改库 → 进程 B 的内存配置在同步周期内跟上；版本不变时不重复合并                                            | MySQL |
| `npm run verify:all`   | 依次跑上面两个，聚合退出码                                                                                       | 同上  |

可用环境变量微调：`PROBE_PROCS`（竞争者进程数，默认 5）、`PROBE_TTL_MS`（锁 TTL，默认 3000）。

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

## 注意：这些关卡不探测 Redis 之外的部署形态

`docker` / 多主机等形态不在覆盖范围内（本机无 Docker）。
`E3`（遥测统计与 WS 广播外置 Redis）**尚未实现**，因此没有对应关卡。
