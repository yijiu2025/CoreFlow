# 命令行管理工具 {#cli}

CoreFlow 提供了完整的命令行管理工具，支持交互式菜单和直接命令两种模式。

## 启动方式

```bash
# 交互式菜单（推荐新手使用）
npm run cli

# 直接命令模式
npm run cli -- user list
npm run cli -- role list
npm run cli -- health
```

## 功能总览

| 模块 | 命令 | 说明 |
|------|------|------|
| 用户管理 | `user list` | 列出所有用户 |
| 用户管理 | `user create` | 创建新用户 |
| 用户管理 | `user reset-password` | 重置用户密码 |
| 用户管理 | `user disable` | 禁用用户 |
| 用户管理 | `user enable` | 启用用户 |
| 角色管理 | `role list` | 列出所有角色 |
| 角色管理 | `role assign` | 分配角色给用户 |
| 数据库 | `db status` | 查看数据库状态 |
| 数据库 | `db migrate` | 执行数据库迁移 |
| Redis | `redis status` | 查看 Redis 状态 |
| Redis | `redis clear` | 清除所有 session |
| 系统 | `health` | 系统健康检查 |

## 交互式菜单

运行 `npm run cli` 进入交互式菜单：

```
╔══════════════════════════════════════╗
║    CoreFlow 命令行管理工具        ║
╚══════════════════════════════════════╝

请选择操作：
  1. 用户管理
  2. 角色管理
  3. 数据库操作
  4. Redis 操作
  5. 系统健康检查
  6. 超级管理员初始化
  0. 退出
```

## 用户管理

### 列出用户

```bash
npm run cli -- user list
```

输出：

```
┌────┬──────────┬─────────────────────┬────────┬─────────────────────┐
│ ID │ 用户名   │ 邮箱                │ 状态   │ 创建时间            │
├────┼──────────┼─────────────────────┼────────┼─────────────────────┤
│ 1  │ admin    │ admin@example.com   │ ✅ 正常│ 2026/6/14 10:00:00  │
│ 2  │ user1    │ user1@example.com   │ ❌ 禁用│ 2026/6/14 11:00:00  │
└────┴──────────┴─────────────────────┴────────┴─────────────────────┘
```

### 创建用户

```bash
npm run cli -- user create
```

交互式输入邮箱、用户名、密码，自动创建用户和身份凭证。

### 重置密码

```bash
npm run cli -- user reset-password
```

输入用户邮箱和新密码，自动清除旧 session。

### 禁用/启用用户

```bash
npm run cli -- user disable
npm run cli -- user enable
```

禁用用户会自动清除其所有 session，用户立即无法访问。

## 角色管理

### 列出角色

```bash
npm run cli -- role list
```

输出：

```
┌────┬───────────────┬──────────┬──────────────┬──────┬─────────────────────┐
│ ID │ 编码          │ 应用     │ 名称         │ 权重 │ 创建时间            │
├────┼───────────────┼──────────┼──────────────┼──────┼─────────────────────┤
│ 1  │ superadmin    │ GLOBAL   │ 超级管理员   │ 99   │ 2026/6/14 10:00:00  │
│ 2  │ fw_admin      │ firewall │ 防火墙管理员 │ 90   │ 2026/6/14 10:00:00  │
│ 3  │ fw_viewer     │ firewall │ 防火墙观察者 │ 1    │ 2026/6/14 10:00:00  │
└────┴───────────────┴──────────┴──────────────┴──────┴─────────────────────┘
```

### 分配角色

```bash
npm run cli -- role assign
```

交互式选择用户和角色，自动完成分配。

## 数据库操作

### 查看状态

```bash
npm run cli -- db status
```

输出：

```
✅ 数据库连接正常
📊 共 15 张表

表列表：
  1. user_user
  2. user_identity
  3. iam_role
  4. iam_user_role
  ...
```

### 执行迁移

```bash
npm run cli -- db migrate
```

等同于 `npm run migrate`。

## Redis 操作

### 查看状态

```bash
npm run cli -- redis status
```

输出：

```
✅ Redis 连接正常
📊 总键数: 42
📦 版本: 7.0.0
⏱️  运行时间: 86400秒
💾 内存使用: 1.5M
```

### 清除 session

```bash
npm run cli -- redis clear
```

清除所有 session 数据，所有用户需要重新登录。

## 系统健康检查

```bash
npm run cli -- health
```

输出：

```
🏥 系统健康检查

✅ 数据库: 连接正常
✅ Redis: 连接正常
✅ 环境变量: 配置完整
📊 用户总数: 42

🎉 健康检查完成
```

## 常用场景

### 首次部署

```bash
# 1. 配置 .env
cp .env.example .env

# 2. 执行迁移
npm run migrate

# 3. 初始化管理员
npm run setup:admin

# 4. 健康检查
npm run cli -- health

# 5. 启动服务
npm run dev
```

### 用户忘记密码

```bash
# 重置密码
npm run cli -- user reset-password
# 输入用户邮箱和新密码
```

### 封禁用户

```bash
# 禁用用户（清除所有 session）
npm run cli -- user disable
```

### 切换管理员

```bash
# 1. 创建新管理员
npm run setup:admin -- --email new-admin@example.com

# 2. 验证新管理员可以登录

# 3. 撤销旧管理员
npm run revoke:admin -- --email old-admin@example.com
```

### 清除所有登录状态

```bash
# 清除所有 session，所有用户需要重新登录
npm run cli -- redis clear
```
