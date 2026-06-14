# 快速上手 {#quick-start}

## 环境要求

- **Node.js** >= 18.0.0
- **MySQL** >= 8.0
- **Redis** >= 6.0（可选，不启用时自动降级到内存）

## 安装

```bash
# 克隆项目
git clone https://github.com/yijiu2025/CoreFlow.git
cd antigravity

# 安装依赖
npm install

# 安装前端依赖（以 firewall 为例）
cd firewall && npm install && cd ..
```

## 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env
```

编辑 `.env` 文件，配置以下必要变量：

```ini
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=antigravity
DB_USER=root
DB_PASS=your_password

# 安全密钥（务必修改为强随机值）
APP_SECRET=your-app-secret-key
SESSION_SECRET=your-session-secret-key
FIREWALL_SECRET=your-firewall-secret-key

# Redis（可选）
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

::: warning 安全提示
生产环境必须修改所有默认密钥，框架会在启动时检测不安全的默认值并拒绝启动。
:::

## 数据库迁移

```bash
# 执行迁移，创建所有表
npm run migrate
```

## 启动开发服务器

```bash
# 启动后端（nodemon 热重载）
npm run dev

# 另一个终端，启动前端
cd firewall && npm run dev
```

访问：
- 后端 API：`http://localhost:3000`
- 前端面板：`http://localhost:5173`

## 验证安装

```bash
# 健康检查
curl http://localhost:3000/health/live
# 应返回: { "status": "ok", "uptime": ... }
```

## 超级管理员管理

### 首次初始化

在 `.env` 中配置管理员信息：

```ini
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=your-strong-password
```

运行初始化脚本（用户不存在时自动创建）：

```bash
npm run setup:admin
```

### 切换超级管理员

```bash
# 方式 1：给已有用户授予 superadmin（保留原管理员）
npm run setup:admin -- --email new-admin@example.com

# 方式 2：修改 .env 后重新运行（自动创建新用户）
# 先修改 SUPERADMIN_EMAIL 和 SUPERADMIN_PASSWORD
npm run setup:admin
```

::: tip 多管理员
系统支持多个超级管理员。运行 `setup:admin` 只会新增，不会移除原有的。
:::

### 撤销超级管理员

```bash
npm run revoke:admin -- --email user@example.com
```

安全机制：
- 自动检查是否为最后一个 superadmin（防止锁死系统）
- 默认需要确认，`--force` 可跳过
- 撤销后自动清除 Redis session

::: warning 注意
撤销后该用户需要重新登录，权限才会生效。
:::

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm start            # 生产启动
npm run migrate      # 执行数据库迁移
npm run lint         # ESLint 自动修复
npm run format       # Prettier 格式化
npm test             # 运行测试
```

## 下一步

- [项目结构](/guide/project-structure) — 了解目录组织方式
- [应用模块开发](/development/app-module) — 创建你的第一个应用模块
- [架构总览](/core/architecture) — 深入理解框架架构
