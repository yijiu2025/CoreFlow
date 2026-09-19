# Docker 部署 {#docker}

> ## 📐 实现状态：示例配置 · 未落地
>
> **2026-09-19 核实：仓库内没有 `Dockerfile`、`docker-compose.yml`、`.dockerignore`。**
>
> 本页代码块是**可直接照抄的示例**，但既没有进仓库，也没有被任何脚本或 CI 引用。
> 真要使用请先落地，并对齐当前实际：Node 版本、`node --env-file` 启动方式、
> 以及 `packages/log` 这个 workspace 软链包在镜像构建时的处理。
>
> 背景与前置条件见 [`架构评估报告`](/core/architecture-review-2026-09-19) 阶段 1 的 1.4 项。

## Dockerfile

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .

FROM base AS frontend
WORKDIR /app/firewall
COPY firewall/package.json firewall/package-lock.json ./
RUN npm ci
COPY firewall/ .
RUN npm run build

FROM base AS final
COPY --from=frontend /app/public/firewall ./public/firewall
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health/live || exit 1
CMD ["node", "index.js"]
```

## docker-compose.yml

```yaml
services:
  app:
    build: .
    ports: ['3000:3000']
    env_file: .env
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASS}
      MYSQL_DATABASE: ${DB_NAME}
    volumes: [db_data:/var/lib/mysql]
    ports: ['3306:3306']

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    volumes: [redis_data:/data]

volumes:
  db_data:
  redis_data:
```

## .dockerignore

```
node_modules
firewall/node_modules
.env
.git
*.md
```

## 常用命令

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f app

# 停止
docker-compose down

# 重建
docker-compose up -d --force-recreate
```

## 环境变量

在 `.env` 文件中配置，docker-compose 会自动读取：

```ini
DB_HOST=db
DB_PASS=your_password
DB_NAME=antigravity
REDIS_HOST=redis
APP_SECRET=your-secret
SESSION_SECRET=your-session-secret
FIREWALL_SECRET=your-firewall-secret
```
