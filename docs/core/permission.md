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
      Statement: [{ Effect: 'Allow', Action: [FIREWALL_PERMISSIONS.MONITOR.READ] }]
    }
  }
]);
```

::: warning `rank_level` 有硬上限
职级区间由 `src/models/iam/Role.js` 的 `validate: { min: 0, max: 99 }` 决定，**99 是最大值**。
写成 100 不会在本地报错（角色早已落库时 `Role.findOrCreate()` 只走"更新 policy"分支），
但**空库首次部署**（新环境 / CI 的 compose 冒烟）会真的 insert，于是抛
`SequelizeValidationError: Validation max on rank_level failed`，而 appsLoader 是 fail-fast 的
—— 应用直接起不来。`src/__tests__/permission/role-rank-levels.test.js` 用模型自身的边界
守卫这条约束（边界从模型派生，不手抄 0/99）。
:::

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

匹配实现单一来源：`src/framework/security/auth/permission/wildcard-match.js`（`isWildcardMatch`），
`api/guard.js` 的路由守卫与 `StpUtil._isMatch` 共用同一实现（此前是两份漂移的副本）。

```js
// src/framework/security/auth/permission/wildcard-match.js（真实源码）
function isWildcardMatch(pattern, target) {
  if (typeof pattern !== 'string' || typeof target !== 'string') return false;
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (!pattern.includes('*')) return false;
  // 先转义全部正则元字符，再以 * 为界拼回 .*——防止 pattern 里的
  // '.'、'('、'[' 等被当正则语法解释
  const regex = new RegExp(
    '^' + pattern.split('*').map(seg => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'
  );
  return regex.test(target);
}

// Deny 优先（调用方向：pattern = 用户持有的权限模式，target = 待检的具体权限）
function matchSingle(perm, allows, denies) {
  if (denies.some(d => isWildcardMatch(d, perm))) return false;
  return allows.some(a => isWildcardMatch(a, perm));
}
```

语义要点：

| 模式 | 语义 |
| --- | --- |
| `*` | 匹配一切 |
| `user:*` | `user:` 开头的一切（`*` 可跨 `:` 段） |
| `user:*:read` | 中段通配同样支持 |
| 其他 | 字面量匹配——**元字符不解释**，`user:read` 不会误匹配 `userXread`（2026-11-01 修复：旧实现未转义正则元字符） |

## 分级委派管理

| 角色级别       | 权重 | 作用域       | 管理能力     |
| -------------- | ---- | ------------ | ------------ |
| L1: 超级管理员 | 99   | GLOBAL       | 系统最高权限 |
| L2: 全局管理员 | 80   | GLOBAL       | 跨应用管理   |
| L3: 应用管理员 | 60   | specific_app | 单应用管理   |
| L4: 模块管理员 | 40   | specific_app | 局部管理     |

## OAuth 2.1 与 PBAC 的交互

```
OAuth Token 的 scope = 用户申请了什么权限
PBAC 的 allows/denies = 用户实际拥有什么权限

最终权限 = Token scope ∩ PBAC allows - PBAC denies
```

即使第三方拿到了最高 Scope 的 Token，只要管理员下发了 Deny 策略，请求仍然被拦截。

## StpUtil 静态鉴权

源码：`src/framework/security/auth/context/stp-util.js`（业务代码统一经 `framework/security/auth/index.js` 门面
re-export 引入，勿直接 import 子路径）。对标 Java Sa-Token，全部静态方法、依赖
AsyncLocalStorage 取当前请求——**必须在 HTTP 请求上下文中调用**（ALS 外抛错）。

::: warning loginId 的两种语义，传错不报错但必然失效
- **权限/角色系列**：操作"当前请求用户"，无此问题；
- **封禁系列（disable/untieDisable/isDisable/checkDisable/getDisableTime）**：`loginId`
  必须是**数字主键**（ban store 按 `userId:service` 数字键控）——传 `getLoginId()`
  返回的 uid 字符串不报错但**永远封不中**；管理端按 uid 查出 `user.id` 再传入；
- **二级认证系列（openSafe 等）**：内部已取 `state.user.userId`（数字主键），直接传 `service` 即可。
:::

### 认证与身份

| 方法 | 功能 | 失败行为 |
| --- | --- | --- |
| `getLoginId()` | 当前用户标识（**uid UUID**；client_token 上下文返回客户端名） | — |
| `check()` | 强制登录检查 | 未登录抛 401 |
| `checkRole(role)` | 角色校验（**精确匹配**，不支持通配；角色无 deny 维度） | 不匹配抛 403 |

### 权限校验（Deny 优先 + 通配符）

权限来源与认证路径解耦：Session 路径读 createSession 预热的快照；JWT 路径由
bearer-auth 经 perm-cache（数字主键 + 指纹校验）读实时快照——**JWT 不嵌入权限**，
权限变更即时生效。形状不完整按空集处理（fail-closed），鉴权失败不会伪装成 500。

| 方法 | 功能 | 失败行为 |
| --- | --- | --- |
| `getPermissionList()` | 取 `{ allows, denies }`（**只读引用**，勿修改） | — |
| `hasPermission(perm)` | 判断，返回 `true/false` | — |
| `checkPermission(perm)` | 校验单个 | 抛 `NotPermissionException`（403） |
| `checkPermissionAnd(...perms)` | AND：全部通过 | 任一不足抛 403；**零参显式报错**（空真 = 无守卫，疑似笔误） |
| `checkPermissionOr(...perms)` | OR：任一通过 | 全部不足抛 403；**零参显式报错** |

```js
import { StpUtil } from '../../src/framework/security/auth/index.js';

StpUtil.hasPermission('user:admin:*');   // 判断：返回 true/false
StpUtil.checkPermission('user:write');   // 校验：不通过抛 403（statusCode=403）
StpUtil.checkPermissionAnd('a', 'b');    // AND：全部通过
StpUtil.checkPermissionOr('a', 'b');     // OR：任一通过
```

### 账号封禁（disable 系列，async）

按 `userId:service` 数字键控存 Redis，TTL 到期自动解封；`service='login'` 拦新登录、
`'access'` 拦请求，业务可自定义维度。详见 `src/framework/security/auth/security/ban.js` 头注。

| 方法 | 功能 |
| --- | --- |
| `disable(loginId, service, time, opts?)` | 封禁（秒；`-1`=永久），opts 支持 `{ reason, level, operator }` |
| `disableLevel(loginId, service, level, time, opts?)` | 阶梯封禁：按等级处罚（level≥1，语义业务自定义） |
| `untieDisable(loginId, ...services)` | 解封，返回实际解封的服务数 |
| `isDisable(loginId, service)` | 是否被封禁（不区分等级） |
| `checkDisable(loginId, ...services)` | 校验未封禁，被封禁抛 403（code=`ACCOUNT_BANNED`） |
| `getDisableTime(loginId, service)` | 剩余封禁秒数：`-2`=未封禁，`-1`=永久 |

### 二级认证（openSafe 系列，async）

敏感操作"再次确认"机制：业务路由完成身份确认（重输密码/验证码）后 `openSafe` 开时间窗，
窗口内 `safe` 路由放行，窗口外 `checkSafe` 抛 403（code=`SECOND_AUTH_REQUIRED`）。
操作对象是**当前请求用户**；Redis 故障 fail-closed（视为未开启）。详见
`src/framework/security/auth/security/safe.js`。

| 方法 | 功能 |
| --- | --- |
| `openSafe(service, safeTime?)` | 开启时间窗（默认 1800s），返回 `{ openedAt, expireAt }` |
| `isSafe(service)` | 是否在时间窗内 |
| `checkSafe(service)` | 校验，未开启/已过期抛 403（`details.service` 供前端定位） |
| `closeSafe(service)` | 主动关闭（敏感操作完成后调用，缩短暴露窗） |
| `getSafeTime(service)` | 剩余秒数：`-1`=未开启 |

::: tip 为什么没有 `StpUtil.login()`
登录入口是 oauth21 的 `login.service`（密码校验 + createSession + Cookie 下发的完整编排）。
曾有一个占位 `login()`，但 ALS 上下文里只有 request 没有 reply，Cookie 永远下发不了——
2026-11-01 审查后删除。
:::
