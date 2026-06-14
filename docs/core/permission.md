# 权限系统 (PBAC) {#permission}

## 核心设计理念

1. **RBAC + ABAC 混合模型**：角色负责标准授权，内联策略负责灵活的通配符授权
2. **权重压制**：管理员仅能委派等级低于自身的权限
3. **应用隔离与全局可见**：通过 `GLOBAL` 占位符区分
4. **Deny 优先**：Deny 规则始终覆盖 Allow 规则
5. **权限点在代码中，角色策略在数据库中**

## 权限字典规范

权限编码遵循 `{应用域}:{资源名}:{动作}` 三段式小写格式：

```js
// src/app/firewall/permission/index.js
export const FIREWALL_PERMISSIONS = createPermissionRegistry('firewall', '防火墙模块', {
  MONITOR: {
    READ: { code: 'fw:monitor:read', label: '查看监控数据', type: 'read' },
    LOGS: { code: 'fw:monitor:logs', label: '查看访问日志', type: 'read' }
  },
  BLOCK: {
    READ: { code: 'fw:block:read', label: '查看封禁列表', type: 'read' },
    WRITE: { code: 'fw:block:write', label: '添加/移除封禁', type: 'write' }
  },
  ADMIN: {
    ALL: { code: 'fw:admin:*', label: '管理员全量通配符', type: 'wildcard' }
  }
});
```

## 角色体系

### 角色层次

```
superadmin (rank:99) → 所有应用管理员（自动继承）
  ├── fw_admin (rank:90) → 防火墙管理员
  ├── fw_operator (rank:50) → 防火墙操作员
  └── fw_viewer (rank:1) → 观察者（默认授予）
```

### 角色定义

```js
// src/app/firewall/permission/roles.js
defineRoles([
  {
    code: 'fw_viewer',
    app_id: 'firewall',
    name: '防火墙观察者',
    rank_level: 1,
    policy: {
      Version: '2026-06-06',
      Statement: [
        { Effect: 'Allow', Action: [FIREWALL_PERMISSIONS.MONITOR.READ] }
      ]
    }
  }
]);
```

### 策略格式

**Statement 格式（推荐）：**

```json
{
  "Version": "2026-06-06",
  "Statement": [
    { "Effect": "Allow", "Action": ["fw:config:read", "fw:config:write"] },
    { "Effect": "Deny", "Action": ["fw:config:delete"] }
  ]
}
```

## 权限加载流程

```
loadUserPermissions(userId, appId)
  → 查 UserRole（当前应用 + GLOBAL）
  → 解析 role.policy
  → superadmin 自动注入 {appId}_admin 角色
  → 查 InlinePolicy（当前应用 + GLOBAL）
  → 合并 allows/denies
  → Redis 缓存 5 分钟
```

## 权限匹配引擎

```js
function isPermissionMatch(pattern, target) {
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (pattern.endsWith(':*')) {
    return target.startsWith(pattern.slice(0, -1));
  }
  return false;
}

// Deny 优先
function matchSingle(perm, allows, denies) {
  if (denies.some(d => isPermissionMatch(d, perm))) return false;
  return allows.some(a => isPermissionMatch(a, perm));
}
```

## 分级委派管理

| 角色级别 | 权重 | 作用域 | 管理能力 |
|----------|------|--------|----------|
| L1: 超级管理员 | 99 | GLOBAL | 系统最高权限 |
| L2: 全局管理员 | 80 | GLOBAL | 跨应用管理 |
| L3: 应用管理员 | 60 | specific_app | 单应用管理 |
| L4: 模块管理员 | 40 | specific_app | 局部管理 |

## OAuth 2.1 与 PBAC 的交互

```
OAuth Token 的 scope = 用户申请了什么权限
PBAC 的 allows/denies = 用户实际拥有什么权限

最终权限 = Token scope ∩ PBAC allows - PBAC denies
```

即使第三方拿到了最高 Scope 的 Token，只要管理员下发了 Deny 策略，请求仍然被拦截。

## StpUtil 静态鉴权

```js
import StpUtil from '../../auth/StpUtil.js';

StpUtil.hasPermission('user:admin:*');           // 判断：返回 true/false
StpUtil.checkPermission('user:admin:*');         // 校验：不通过抛 403
StpUtil.checkPermissionAnd('a', 'b');            // 全部通过
StpUtil.checkPermissionOr('a', 'b');             // 任一通过
```
