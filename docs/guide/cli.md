# 命令行管理工具 {#cli}

CoreFlow 提供了完整的命令行管理工具，支持交互式菜单和直接命令两种模式，以及应用插件扩展。

## 启动方式

```bash
# 交互式菜单（推荐新手使用）
npm run cli

# 查看帮助
npm run cli -- help

# 直接命令模式
npm run cli -- user list
npm run cli -- firewall status
```

## 内置命令总览

### 用户管理 `user`

| 命令 | 说明 |
|------|------|
| `user list` | 列出所有用户 |
| `user create` | 创建新用户（交互式输入） |
| `user view` | 查看用户详情（含角色） |
| `user reset-password` | 重置密码（**踢出所有设备**） |
| `user disable` | 禁用用户（**踢出所有设备**） |
| `user enable` | 启用用户 |
| `user delete` | 删除用户（**踢出所有设备**，软删除） |

### 角色管理 `role`

| 命令 | 说明 |
|------|------|
| `role list` | 列出所有角色 |
| `role view` | 查看角色详情（含用户列表） |
| `role assign` | 分配角色给用户 |
| `role revoke` | 撤销用户角色 |
| `role stats` | 角色统计（用户数） |

### 数据库操作 `db`

| 命令 | 说明 |
|------|------|
| `db status` | 查看数据库状态 |
| `db migrate` | 执行数据库迁移 |
| `db rollback` | 回滚最近一次迁移 |
| `db tables` | 查看所有表结构 |
| `db optimize` | 优化数据库表 |

### Redis 操作 `redis`

| 命令 | 说明 |
|------|------|
| `redis status` | 查看 Redis 状态 |
| `redis clear` | 清除所有 session |
| `redis pattern` | 按模式清除缓存 |
| `redis keys` | 查看 key 列表 |

### 管理员管理 `admin`

| 命令 | 说明 |
|------|------|
| `admin list` | 列出超级管理员 |
| `admin setup` | 初始化超级管理员（支持交互式） |
| `admin revoke` | 撤销超级管理员（安全检查） |

### 系统操作 `system`

| 命令 | 说明 |
|------|------|
| `system health` | 系统健康检查 |
| `system info` | 查看系统信息 |
| `system cleanup` | 清理过期数据 |

## 应用插件命令

应用可以在 `src/app/<app>/cli/index.js` 中定义自定义命令，自动加载。

### 防火墙 `firewall`

| 命令 | 说明 |
|------|------|
| `firewall status` | 查看防火墙状态 |
| `firewall blocks` | 查看封禁列表 |
| `firewall whitelist` | 查看白名单 |
| `firewall ban` | 添加封禁 IP |
| `firewall unban` | 解除封禁 IP |
| `firewall allow` | 添加白名单 IP |
| `firewall stats` | 流量统计 |

## 使用示例

### 用户管理

```bash
# 列出用户
npm run cli -- user list

# 创建用户（交互式输入邮箱、密码）
npm run cli -- user create

# 查看用户详情
npm run cli -- user view

# 重置密码（踢出所有设备）
npm run cli -- user reset-password

# 禁用用户（踢出所有设备）
npm run cli -- user disable
```

### 角色管理

```bash
# 列出角色
npm run cli -- role list

# 分配角色（交互式选择）
npm run cli -- role assign

# 撤销角色
npm run cli -- role revoke

# 角色统计
npm run cli -- role stats
```

### 数据库操作

```bash
# 查看状态
npm run cli -- db status

# 执行迁移
npm run cli -- db migrate

# 查看表结构
npm run cli -- db tables
```

### 防火墙管理

```bash
# 查看状态
npm run cli -- firewall status

# 查看封禁列表
npm run cli -- firewall blocks

# 封禁 IP
npm run cli -- firewall ban

# 解除封禁
npm run cli -- firewall unban

# 流量统计
npm run cli -- firewall stats
```

## 安全机制

以下操作会**同时踢出用户所有设备**（吊销数据库 Token + 清除 Redis Session）：

| 操作 | 说明 |
|------|------|
| `user reset-password` | 重置密码后，所有设备需重新登录 |
| `user disable` | 禁用用户后，所有设备立即失效 |
| `user delete` | 删除用户后，所有设备立即失效 |
| `admin revoke` | 撤销管理员后，该用户需重新登录 |

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
npm run cli -- user reset-password
# 输入用户邮箱和新密码
```

### 封禁用户

```bash
# 禁用用户（清除所有 session，立即生效）
npm run cli -- user disable
```

### 切换管理员

```bash
# 1. 创建新管理员（交互式输入）
npm run cli -- admin setup

# 2. 验证新管理员可以登录

# 3. 撤销旧管理员
npm run cli -- admin revoke
```

### 清除所有登录状态

```bash
npm run cli -- redis clear
```

### 清理过期数据

```bash
npm run cli -- system cleanup
# 清理过期 session、授权码、历史日志
```

## 开发应用插件

在 `src/app/<app>/cli/index.js` 中定义命令：

```js
export default {
  command: 'myapp',
  appName: 'myapp',
  description: '我的应用管理',
  subcommands: {
    'list': {
      description: '列出数据',
      handler: async () => { /* ... */ }
    }
  }
};
```

详见 [CLI 插件开发](/guide/cli-plugins)
