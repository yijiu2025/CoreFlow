# Docker 部署 {#docker}

> ## ✅ 实现状态：已落地（2026-09-20）
>
> | 文件 | 作用 |
> | --- | --- |
> | `Dockerfile` | 多阶段构建、非 root、tini 作 PID 1、内置健康探针 |
> | `docker-compose.yml` | app + MySQL + Redis 单机编排，含健康依赖与持久化卷 |
> | `docker/entrypoint.mjs` | 依赖等待 → 可选迁移 → 启动并转发信号 |
> | `.dockerignore` | 裁剪构建上下文（仓库里住着 8 万文件的第三方快照） |
> | `.env.docker.example` | 部署环境变量模板（含全部必填项说明） |
> | `.github/workflows/publish-image.yml` | 构建推镜像 + **compose 全栈端到端冒烟** |
>
> 本页**曾经是一份未落地的设计稿**（2026-09-19 核实：仓库里没有 Dockerfile）。
> 旧稿里的示例有几处照着做会直接踩坑 —— 已在文末「与旧设计稿的差异」逐条列出。

## 快速开始

```bash
# 1. 准备配置（必须改掉所有 change-me）
cp .env.docker.example .env.docker

# 2. 建表 —— 迁移是独立的一次性任务，不随应用启动
docker compose --env-file .env.docker up -d --build mysql redis
docker compose --env-file .env.docker run --rm migrate

# 3. 启动应用
docker compose --env-file .env.docker up -d app

# 4. 验证
curl -s http://127.0.0.1:3000/v1/health/ready
```

> ⚠️ **`--env-file .env.docker` 不能省。**
> 不带它时 compose 会去读仓库根目录的 `.env` —— 那是**开发机**的配置（本地
> DB 密码、`192.168.x.x` 的 Redis 地址），容器会带着一套错的凭据起来。
> `docker-compose.yml` 里 `${DB_PASS:?...}` 的写法就是为此：宁可启动时明确报错。

## 镜像设计：五条取舍

每条都对应一个真实踩坑点，改动前请先读 `Dockerfile` 顶部的完整说明。

| 取舍 | 原因 |
| --- | --- |
| **不用 `npm ci`** | lock 把 `wb-logkit` 记为 `link: packages/log`，那是被 gitignore 排除的独立嵌套仓库，CI/克隆环境不存在 → `npm ci` 必失败。改用 `npm install --workspaces=false`：两个 workspace 包都从 registry 取已发布版本 |
| **`--ignore-scripts`** | 根 `prepare` 是 `husky`（devDependency），`--omit=dev` 后该命令不存在，不忽略会在安装最后一步炸掉；顺带挡掉 postinstall 供应链面 |
| **`node:22-slim` 而非 alpine** | `sharp` 是原生模块，slim（glibc）有官方预编译二进制；alpine（musl）要额外装 libc6-compat，镜像升级时容易踩 ABI 不匹配 |
| **镜像里不放 `.env.production`** | 含密钥且被 gitignore。配置全部由编排层注入；`index.js` 的 dotenv 在文件不存在时静默跳过，不会覆盖已注入变量。**启动必须用 `node index.js`** —— `npm start` 的 `--env-file` 在文件缺失时会直接报错退出 |
| **tini 作 PID 1** | 应用自己监听 SIGTERM 做优雅关闭（广播 WS 关闭帧 → 关 DB/Redis）。没有 init 时 PID 1 信号语义不同，`docker stop` 会退化成"等 10 秒再 SIGKILL"，手写的优雅关闭等于白写 |

## 编排设计

### 启动顺序用健康依赖，不是 `depends_on` 裸列表

```yaml
depends_on:
  mysql: { condition: service_healthy }
  redis: { condition: service_healthy }
```

裸 `depends_on` 只保证"容器已启动"，不保证"能连上"。MySQL 首次初始化要 20~60s，
这期间应用起来会看到一个空表库。此外 `entrypoint.mjs` 还有一层**有界**等待兜底
（`DEP_WAIT_TIMEOUT_MS`，默认 90s），并把"到底连上了没"写成一条日志。

### 依赖等待策略：DB 硬失败、Redis 降级继续

这是刻意的**不对称**，策略在 `src/framework/ops/dependency-plan.js`（有测试）：

- **DB 等不到 → 直接失败退出**：缺连接池的应用能监听端口却对每个请求返回 500。
  让它"启动成功"是最糟的失败形态 —— 监控全绿、用户全错。
- **Redis 等不到 → 告警后继续**：访问层会降级到进程内 MapStore，限流/验证码/会话
  在单实例内照常工作。把可选组件的抖动判成致命，等于用一次缓存故障换取整体不可用。

### 优雅停机要给够时间

```yaml
stop_grace_period: 35s   # 应用自身兜底是 30s（index.js 的 SHUTDOWN_TIMEOUT）
```

编排层的宽限期**必须大于**应用自身的兜底时间，否则容器会先被 SIGKILL，
`onClose` 钩子里的守卫配置刷写、WS 关闭帧广播全部来不及执行。

### 持久化卷

| 卷 | 挂载点 | 内容 |
| --- | --- | --- |
| `app-logs` | `/app/logs` | 滚动日志 |
| `app-data` | `/app/src/data` | 防火墙遥测等落盘状态 |
| `app-uploads` | `/app/public/uploads` | 用户上传 |

## 迁移怎么跑

**不做成应用启动的一部分**：多副本同时启动会并发跑迁移，两个进程同时改写同一批
表结构，轻则报错、重则半途状态。生产用一次性任务，在部署流程的独立步骤里执行：

```bash
docker compose --env-file .env.docker run --rm migrate
```

单机 / 演示场景可以用便利开关 `RUN_MIGRATIONS=true`（entrypoint 会在启动前跑一次），
但它与多副本互斥。

## 健康探针怎么接到编排上

项目提供三级语义（见 `src/api/system/v1/health.js`）：

| 端点 | 语义 | 编排用途 |
| --- | --- | --- |
| `GET /v1/health/live` | 恒 200，不碰任何依赖 | **liveness**：失败就重启实例 |
| `GET /v1/health/ready` | 关键依赖不可用即 **503** | **readiness**：失败就摘出负载均衡 |
| `GET /v1/health` | 兼容保留，恒 200 | 别用于新接入 |

镜像里的 `HEALTHCHECK` 用的是 **live**（避免依赖抖动导致容器被反复重启）。
K8s 里应当分开配：

```yaml
livenessProbe:  { httpGet: { path: /v1/health/live,  port: 3000 } }
readinessProbe: { httpGet: { path: /v1/health/ready, port: 3000 } }
```

## 排障速查

| 现象 | 先看哪里 |
| --- | --- |
| 容器起来但 `/v1/health/ready` 503 | 响应体里 `dependencies.database.status` 与 `redis.status`；错误只给标签（如 `ECONNREFUSED`），完整错误在 `docker compose logs app` |
| 应用启动即退出 | 大概率是 DB 配置缺失 —— 生产环境下 `framework/db` 检测不到 `DB_HOST/DB_NAME/DB_USER` 会直接终止进程 |
| 日志出现"Redis 等待超时，继续启动" | 这是**降级**不是故障。确认 `REDIS_HOST` 是否指到了容器网络外的地址（容器里必须用服务名 `redis`） |
| 表不存在 / 列不存在 | 迁移没跑：`docker compose --env-file .env.docker run --rm migrate` |
| 探针一直失败但服务正常 | 检查是不是用了 `/health/live`（少 `/v1`） |
| 停机要等 10 秒 | `stop_grace_period` 小于应用兜底时间，或镜像里 tini 被改掉了 |

## 与旧设计稿的差异（教训留档）

本页 2026-09-19 之前的版本是照抄即错的示例，如实记录：

| 旧稿写法 | 真实情况 |
| --- | --- |
| `RUN npm ci --production` | 必失败：`packages/log` 是 gitignore 的嵌套仓库，workspace 缺失 |
| `HEALTHCHECK ... http://localhost:3000/health/live` | 路径错，真实路径是 `/v1/health/live`（`system.json` 的 prefix 为空，`/v1` 来自路由组） |
| `env_file: .env` | 会把开发机配置灌进生产容器 |
| `depends_on: [db, redis]` | 无健康条件，MySQL 未就绪时应用就起来了 |
| `CMD ["node","index.js"]` 无 init | 信号语义问题，优雅关闭失效 |
| 单一前端构建阶段 | 实际有 4 个前端 workspace，且它们与本镜像无关（各自独立构建、静态托管） |

> 教训与项目里其他文档一致：**设计稿与代码是两回事**。核实手法 ——
> 拿文档里的路径 / 变量名去 grep 代码，命中 0 就是没实现；对文档里的关键文件，
> 先看它是否真在仓库里（`ls` 一下比读十页更有效）。
