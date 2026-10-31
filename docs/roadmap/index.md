# 路线图 {#roadmap}

> 本文记录**当前真实状态**与**仍未完成的待办**，不保留已经过去的排期。
> 状态口径：✅ 已完成 / 🚧 进行中 / 📐 设计稿·未实现 / ❌ 已作废。
>
> 最近一次核对：2026-10-31（同日完成全量后端审查与仓库脱库，见 `reports/audit/`）。

## 已完成（原 Phase 0–1 的落地结果）

| 能力 | 状态 | 落点 |
| --- | --- | --- |
| 密码哈希 | ✅ | `crypto.scrypt`（libuv 线程池 + 并发背压），bcrypt 仅历史兼容校验 |
| 环境变量校验 | ✅ | `src/framework/config/env.js`（`validateEnv` / 弱值拒绝 / 跨字段关系） |
| CORS 白名单 | ✅ | `src/app.js` + `src/framework/auth/origin-guard.js`（生产 fail-closed） |
| 防火墙 API 鉴权 | ✅ | 走 `registerSecureRoute` + PBAC 权限码 |
| 优雅关闭 | ✅ | `src/app.js` 的 `onClose`：守卫配置 flush + Redis Pub/Sub 关闭 |
| 健康检查 | ✅ | `GET /v1/health/live`、`GET /v1/health/ready`（统一响应封装） |
| Redis 重连与降级 | ✅ | `src/framework/redis/`：「未配置 → 进程内实现」「配置了但连不上 → 503」 |
| Docker 制品 | ✅ | `Dockerfile`、`docker-compose.yml`、`.dockerignore`、`docker/verify-deps.mjs` |
| CI / CD | ✅ | `.github/workflows/`：CI（Lint·Verify·Test）、Docs、Publish Image、CodeQL、依赖自证 |
| Pre-commit | ✅ | Husky + lint-staged（ESLint + Prettier） |
| 分布式锁 / 队列 / 环形队列 | ✅ | `src/framework/redis/{lock-store,queue-store,ring-queue-store}.js` + 跨进程关卡 |
| 私钥信封加密 | ✅ | `src/framework/keys/`（AES-GCM + KEK + 迁移脚本 `scripts/migrate-key-encryption.js`） |
| 三级守卫 + PBAC | ✅ | `src/api/guard.js`（deny 优先 / 通配 / fail-closed） |
| 权限缓存与指纹失效 | ✅ | `src/framework/auth/{perm-cache,session-perm}.js` + 主动失效 |

## 待办（按"能不能被打到"排序）

### P0 · 安全与可用性

- [ ] **图形验证码的失败尝试上限已加，但 `/auth/v1/verify-challenge` 不在任何限频作用域内** ——
  应纳入限频（当前只有 `/oauth2.1/*` 的敏感端点有 IP 限频）
- [ ] **限流器 Redis 路径 5 次往返**（`zRemRangeByScore / zCard / zRange / zAdd / expire`）→ pipeline 压到 1–2 次，
  被刷时这 5 倍往返本身就是放大面
- [x] **`public/<前端名>/` 下 190 个历史前端构建产物已清理**（2026-10-31）：
  `posecraft/` 107、`models/` 37、`firewall/` 24、`poseadmin/` 22，约 152MB。
  `public/` 只留 `uploads/.gitkeep` 占位 —— `@fastify/static` 的 root 与 `Dockerfile` 的
  `COPY public ./public` 都要求该目录存在，否则干净检出时镜像构建直接失败。
- [x] **依赖告警 296 条 → 已治理**（2026-10-31）：
  - **根因**：`workspaces` 里仍挂着三个已迁出的前端目录（`oauth21`/`posecraft`/`firewall`），
    npm 把整个前端依赖树（vue/vite/tensorflow/echarts…）都算进 lock 与审计 → 告警的主体在这里。
    移除后 lock 1675 → 878 条目。
  - **生产链路 21 条（9 high）→ 5 条（0 high）**：fastify 5.12.7 / @fastify/static 10.1.8 /
    @fastify/multipart 10.1.6 / nodemailer 10.3.1 / sharp 0.35.5 / mysql2 3.24.6 / geoip-lite 2.0.3，
    外加 6 个补丁级 `overrides`（busboy / brace-expansion / fast-uri / ajv / fast-copy / moment）。
  - **第二轮（同日）把生产链路收到 0**：`@fastify/static` → `glob ^14.0.3`（作用域 override，
    全局抬会打碎 `glob.sync`）、`sequelize` → `uuid ^11.1.1`（只用到 v1/v4）；
    docs 链路顺带升 vue 3.5.44 / vite 6.4.5 / follow-redirects 1.16.2 / js-yaml 4.3.2。
  - **剩余 33 条全部 dev-only**（jest 30 → glob 10.5.0、eslint 10 → minimatch 10.2.5、
    `@babel/core` low、`deepmerge` low）：根因在 jest / eslint 自身未升级其 glob / minimatch，
    要等上游 major。**不要**用全局 override 硬压 —— 实测会把 `jest --coverage` 打崩
    （`minimatch is not a function`）。
  - ⚠️ **Node 下限抬到 24**（`engines >=24` + 仓库根 `.nvmrc`）：`geoip-lite@2`（防火墙运行期
    依赖）声明 `engines >= 24`，而 CI 与镜像此前都跑 22 —— 只靠"没走到那条被版本门控的路径"
    在撑。CI / `Dockerfile` 一并升到 24，声明与实际运行对齐。

### P1 · 架构收敛

- [ ] **反向依赖清理**：`src/framework/notice/services/email.js` → `src/app/notice/dao`（framework 依赖 app）、
  `src/shared/user-dao.js` → `src/app/oauth21/dao`（shared 依赖 app）。
  现有守卫只覆盖 `app → app` 与 `src → scripts`，这两种方向无人拦
- [ ] **未接线模块决策**：`framework/verify/slider`、`verify/sms`、`verify/voice`
  要么接线（并补 TTL / 失败上限），要么删除 —— 它们在仓库里只增加"看起来支持"的错觉
- [ ] **`package.json` workspaces 与已迁出目录**：`oauth21` / `posecraft` / `firewall` 仍列在
  `workspaces`，而目录已不在本仓。当前可用（npm 跳过缺失项），但语义上应收敛

### P2 · 工程质量

- [ ] **覆盖率阈值偏低**：`jest.config.js` 现为 branches 30 / functions 40 / lines 40 / statements 40，
  且 `collectCoverageFrom` 只覆盖 `src/api`、`src/app`（局部）。建议按模块分级提高，并扩大采集范围
- [ ] **Swagger / OpenAPI 文档**：目前 `oauth21-api-report.md` 是手写报告；路由已有 `schema`
  （Fastify 侧），可据此生成 OpenAPI，避免文档与实现再次漂移
- [ ] **测试有效性守卫的覆盖面**：`conventions/test-effectiveness` 已改为 AST 判据，
  但"一个文件里有真 import + 大段自证常量"仍拦不住（只能靠 review）

## 已作废

- ❌ **TypeScript 渐进式迁移**（原 Phase 2）：从未启动。原计划设想的是根级 TS 文件
  （如 `src/env.ts`、`src/api/guard.ts`，**这些路径今天都不存在**），与现在的
  `src/framework/*` 分层也对不上。若要做，需重新出方案。
- ❌ **前端架构升级**（原 Phase 3：Pinia / Vue Router / `App.vue` 瘦身）：
  前端工程已于 2026-10-31 迁出本仓，随各自前端仓的路线图走。
- ❌ **原「实施时间线」8 周排期**：已过期，删除（保留排期只会误导读者以为"还在按周推进"）。

## 成功指标（仅后端）

| 指标 | 目标值 | 当前 |
| --- | --- | --- |
| Critical 安全漏洞 | 0 | 本轮审查已修 4 个 🔴（队列丢消息 / 限流死规则 / 代理信任过宽 / 阈值形同虚设） |
| 测试 | 全绿且"毒丸可变红" | 105 套件 / 1250 用例通过，4 套件按 Redis 条件跳过 |
| Redis 双后端语义一致 | Map 与 Redis 同形 | 环形队列已补同形对比测试 |
| 容器化 | Docker + Compose | ✅ |
| 部署 | CI/CD 自动 | ✅（CI / Docs / Publish Image） |
| API 文档 | 自动生成 | ❌ 未做（手写报告会漂移） |
