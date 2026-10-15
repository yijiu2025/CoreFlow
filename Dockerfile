# syntax=docker/dockerfile:1
# ============================================================================
# nodeServers 后端镜像
#
# 设计取舍（每条都对应一个真实踩坑点，改动前请先读）：
#
# 1. **不用 `npm ci`，lockfile 也一律不进镜像；安装用
#    `npm install --workspaces=false --legacy-peer-deps`**
#    `package-lock.json`（2026-09-28 起入库，939b91b）把 `wb-logkit` 记为
#    `link: packages/log` —— 那是被 `.gitignore` 排除的独立嵌套仓库，克隆主仓
#    时并不存在。`npm ci` 会因 workspace 缺失直接失败；`npm install` 若照到
#    lock 也会给 `node_modules` 建**悬空软链**（容器里没有 `packages/`），
#    `import 'wb-logkit'` 立即 ERR_MODULE_NOT_FOUND。所以 lock 只供人/审计看，
#    安装路径一律不依赖它（2026-10-15 E2E 冒烟连红一周的根因，见 deps 阶段）。
#    忽略 workspaces 且容器里没有 packages/ 目录时，`wb-logkit` 与
#    `stable-deviceid` 都从 registry 取**已发布版本**，这在部署语义上更正确：
#    镜像应当依赖已发布产物，而不是某台开发机上的软链。
#    `--legacy-peer-deps` 是无 lock 现算理想树的必要项（绕 arborist 崩溃，
#    根仓 ci.yml 后端三 job 同款；理由见 deps 阶段 RUN 处注释）。
#
# 2. **`--ignore-scripts`**
#    根 `prepare` 脚本是 `husky`（devDependency），`--omit=dev` 后该命令不存在，
#    不忽略脚本的话安装会在最后一步炸掉。生产依赖里没有需要编译的原生包
#    （`sharp` 走 optionalDependencies 的预编译二进制），忽略脚本是安全的，
#    顺带挡掉供应链 postinstall 面。
#
# 3. **`node:22-slim` 而不是 alpine**
#    `sharp` 是原生模块。slim（glibc）有官方预编译二进制；alpine（musl）需要
#    额外安装 libc6-compat，一旦镜像升级就容易踩到 ABI 不匹配。
#    多出来的几十 MB 换"构建不会莫名失败"，值。
#
# 4. **镜像里不放 `.env.production`**
#    该文件含密钥且被 gitignore。配置一律由编排层注入环境变量。
#    `index.js` 的 dotenv 在文件不存在时静默跳过，不会覆盖已注入的变量；
#    因此启动必须用 `node index.js`（`npm start` 的 `--env-file` 在文件缺失时
#    会直接报错退出）。
#
# 5. **tini 作为 PID 1**
#    应用自己监听 SIGTERM 做优雅关闭（先广播 WS 关闭帧、再关 DB/Redis）。
#    没有 init 进程时，PID 1 的信号语义与默认处理不同，`docker stop` 可能
#    退化成"等 10 秒再 SIGKILL"——这正是把手写优雅关闭白写掉的经典方式。
#    ⚠️ **tini 的路径不要写死发行版默认值**：Debian / Ubuntu 装的是
#       `/usr/bin/tini`，`/usr/sbin/tini` 在两者上都不存在。写错的后果不是
#       构建失败，而是容器**启动时**才炸：
#         OCI runtime create failed: exec: "/usr/sbin/tini":
#         stat /usr/sbin/tini: no such file or directory
#       实测 2026-09-21（Publish Image 的 compose 冒烟 `run --rm migrate`
#       起不来，而 `docker build` 一路绿灯 —— 只查构建根本发现不了）。
#       下面按实际安装位置建一个固定软链，并在构建期就 `--version` 自证一次。
# ============================================================================

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# 阶段 1：生产依赖
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps

WORKDIR /app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# 只拷 package.json（🔴 不拷 lockfile，2026-10-15 修）：
#   lockfile 入库（939b91b）后，旧的 `COPY package*.json` 通配符会把它带进镜像，
#   而它把两包记为 link（wb-logkit → packages/log、stable-deviceid →
#   packages/shared-device）—— 容器里没有这些目录，npm install 照 lock 建出
#   **悬空软链**：安装退出码 0、"added 311 packages" 一路绿灯，import 却
#   ERR_MODULE_NOT_FOUND。构建期自证原先只查 fastify/sequelize/redis 看不到，
#   直到 E2E 冒烟的 migrate 步骤才炸（2026-10-08 起连红一周）。
#   不拷 lock ⇒ npm 从 registry 现算 ⇒ 两包都取**已发布版本**（已在 Temp 复刻树
#   实测：无 packages/ 目录时 stable-deviceid@1.0.3 / wb-logkit@0.5.0 均装为
#   真实目录，具名导入与功能正常）。
#   缓存键只剩 package.json：改源码不会触发重装，语义不变。
COPY package.json ./

# 校验脚本随包清单进 deps 阶段（构建期自证用，见下方 RUN；runtime 阶段另有
# `COPY docker ./docker` 会再带一份，体积可忽略）
COPY docker/verify-deps.mjs ./docker/verify-deps.mjs

# ⚠️ `--legacy-peer-deps` 不是"放宽校验"，是绕开 npm 10 / arborist 的一个崩溃：
#    无 lock ⇒ 必须从 registry 现算整棵理想树 ⇒ 三个前端 workspace 的 devDeps
#    也进图 ⇒ vitest 的 peer 集合让 arborist 走到 `build-ideal-tree.js:1289`
#    的 `node.parent.edgesOut`（parent 为 null）→ TypeError，安装直接失败。
#    `--omit=dev` 挡不住它（崩溃发生在装载 peer 集合阶段，实测 2026-10-15：
#    不带该标志必崩；带上后 267 包装完）。根仓 ci.yml 后端三 job 同款标志。
# ⚠️ 自证走独立脚本而不是内联 `node -e`：Dockerfile 的续行不进入引号字符串，
#    多行 `-e` 会被解析器当成新 instruction（首版实测 `unknown instruction: await`）。
RUN npm install --omit=dev --workspaces=false --ignore-scripts --legacy-peer-deps \
 && npm cache clean --force \
 && node docker/verify-deps.mjs

# ---------------------------------------------------------------------------
# 阶段 2：运行时
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime

LABEL org.opencontainers.image.title="nodeServers" \
      org.opencontainers.image.description="Fastify + Sequelize + Redis 模块化单体后端" \
      org.opencontainers.image.licenses="MIT"

# tini：PID 1 信号转发（见文件头第 5 条）
# 软链而非硬写路径：无论 base image 把 tini 装到 /usr/bin 还是 /usr/sbin，
# ENTRYPOINT 认的 /usr/sbin/tini 都存在；`--version` 让构建期就暴露问题。
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && ln -sf "$(command -v tini)" /usr/sbin/tini \
 && /usr/sbin/tini --version \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=deps /app/node_modules ./node_modules
# 同上：不拷 lockfile（悬空软链的源头，见 deps 阶段）；运行期只需要 package.json
COPY package.json index.js ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
COPY public ./public
COPY docker ./docker

# 运行期需要可写的三个位置：滚动日志、防火墙统计落盘、用户上传
RUN mkdir -p logs src/data public/uploads \
 && chown -R node:node /app

# 非 root 运行：node 镜像自带 uid/gid 1000 的 node 用户
USER node

EXPOSE 3000

# 存活探针（不是就绪探针）：
#   - 用 live 而非 ready，是为了避免"依赖一时抖动 → 容器被判 unhealthy →
#     被反复重启"的雪崩；依赖可用性由编排层的 depends_on / readiness 负责。
#   - 用 node 内联 fetch 而不装 curl：镜像里已经有 node，少一个攻击面。
#   - K8s / Compose 如需按依赖摘流，请显式改用 /v1/health/ready（见部署文档）。
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/sbin/tini", "--"]
CMD ["node", "docker/entrypoint.mjs"]
