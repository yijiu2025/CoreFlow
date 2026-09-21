# syntax=docker/dockerfile:1
# ============================================================================
# nodeServers 后端镜像
#
# 设计取舍（每条都对应一个真实踩坑点，改动前请先读）：
#
# 1. **不用 `npm ci`，改用 `npm install --workspaces=false`**
#    `package-lock.json` 把 `wb-logkit` 记录为 `link: packages/log` —— 那是被
#    `.gitignore` 排除的独立嵌套仓库，克隆主仓时并不存在，`npm ci` 会因
#    workspace 缺失直接失败。忽略 workspaces 后，`wb-logkit` 与
#    `stable-deviceid` 都从 registry 取**已发布版本**，这在部署语义上更正确：
#    镜像应当依赖已发布产物，而不是某台开发机上的软链。
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

# 只拷清单：这一层的缓存由 package.json（以及存在时的 lock）决定，改源码不会触发重装。
# ⚠️ 用通配符而不是逐个列举：`package-lock.json` **不在仓库里**（被 .gitignore 排除，
#    原因见文件头第 1 条），写死 `COPY package-lock.json` 会让构建在解析 COPY 时就失败：
#      ERROR: ... "/package-lock.json": not found
#    通配符的语义是"有就拷、没有就跳过"，与"刻意不依赖 lockfile 安装"的设计一致。
COPY package*.json ./

RUN npm install --omit=dev --workspaces=false --ignore-scripts \
 && npm cache clean --force \
 && node -e "require.resolve('fastify'); require.resolve('sequelize'); require.resolve('redis'); console.log('✅ 生产依赖校验通过')"

# ---------------------------------------------------------------------------
# 阶段 2：运行时
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime

LABEL org.opencontainers.image.title="nodeServers" \
      org.opencontainers.image.description="Fastify + Sequelize + Redis 模块化单体后端" \
      org.opencontainers.image.licenses="MIT"

# tini：PID 1 信号转发（见文件头第 5 条）
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=deps /app/node_modules ./node_modules
# 同上：lockfile 不在仓库里，用通配符避免 "not found"
COPY package*.json index.js ./
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
