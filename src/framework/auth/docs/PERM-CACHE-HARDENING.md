# 权限缓存加固（四层防御）

> 2026-09-16 实施。起因：权限缓存键为明文 `${userId}:${appId}`、命名空间为裸 `'perm'`，
> 任何人（含运维误操作、或某个接口把用户可控数据塞进该键空间）都能读写他人权限缓存，
> **等价于伪造权限**。同时发现更常见的问题：管理员撤销权限后，会话内快照因长 TTL
> （记住我 30 天）继续有效 —— 属**功能缺陷**而非攻击。

## 威胁模型重排

按实际发生概率排序，而不是按听起来吓人的程度：

| 场景 | 概率 | 性质 |
| --- | --- | --- |
| 权限已变更，但缓存/会话未失效 | **高** | 功能缺陷（撤权不生效） |
| 运维手动 `SET` 了某个键 | 低 | 误操作 |
| 某接口把用户可控值写进该键空间 | 低 | 越权写入 |
| 外部直接连 Redis 改数据 | 极低 | 需已失守内网 |

所以四层里真正的重心是**第 3 层**，而非"防篡改"。

## 第 1 层：短 TTL

`PERM_TTL = 60`（秒）。仅作为兜底 —— 即便指纹机制整体失效，陈旧权限最多存活 60s。

## 第 2 层：键加盐 + 命名空间隔离

- 命名空间：`'perm'` → **`'auth:perm'`**。`auth:` 前缀声明归属，业务代码不应触碰。
- 键体：`${userId}:${appId}` → **`sha256(userId + '\u0000' + appId).slice(0, 16)`**
  （`buildPermKey()`）。
  - 不可枚举：`SCAN auth:perm:*` 无法反推用户/应用。
  - `\u0000` 分隔防拼接歧义：否则 `('1','23')` 与 `('12','3')` 会撞成同一键 → 跨用户串权限。

**命名空间字面量有两处声明**：`perm-cache.js` 与 `session-store.js`。
后者受"零兄弟模块依赖"约束（它是会话子模块依赖图的最底层）不能 import 前者，
故重复声明，并有契约测试钉死两者逐字一致 —— 命名空间不一致会让读写落到不同 store
且**完全静默**（历史事故：`'user_sessions'` vs `'userSessions'` 导致注销清理零执行）。

## 第 3 层：权限指纹（核心）

会话/JWT 恢复时不再无条件信任缓存，而是比对**由数据自身推导的指纹**。

```
指纹 = sha256( UserRole[id,updatedAt,deletedAt]
             + Role[id,updatedAt,deletedAt]        ← 角色策略变更影响该角色全体用户
             + InlinePolicy[id,updatedAt,deletedAt] )[:16]
```

行按 id 排序后拼接 —— SQL 不保证返回顺序，依赖顺序会让指纹无谓抖动导致缓存每次都判失效。

### 为什么不用 DB 版本列

`users.perm_version` 的方案有两个无法回避的问题：

1. **漏递增**：`Role.policy` 改一次影响该角色下**所有**用户，逐个递增既慢又必然漏
   —— 任何绕过 DAO 的写入（运维 SQL、其他服务）都不会记得递增。
2. **多一次写**：每次权限变更都要多一次批量 UPDATE。

指纹由数据自身推导，不存在"忘记递增"这一运维漏洞，且**零 schema 改动**
（三张表都是 `timestamps: true` + `paranoid: true`）。

### ⚠️ 实现陷阱（已踩过）

`underscored: true` 下时间戳的**属性名**仍是 `updatedAt` / `deletedAt`
（物理列才是 `updated_at` / `deleted_at`）。把 `'updated_at'` 写进 Sequelize 的
`attributes` 会被**静默丢弃** → 指纹退化成常量 → 缓存永不失效，
而"缓存命中"的测试恰好会**通过**。

`src/__tests__/auth/perm-fingerprint.test.js` 专门断言方向相反的事实
（属性名存在、物理列名不在 attributes 里），防止这类静默退化回来。

### 接入点

| 位置 | 改动 |
| --- | --- |
| `auth/index.js` JWT 路径 | `loadUserPermissions` → `getPermissions`（带指纹） |
| `session.js` 三处 | 统一走 `resolveSessionPermissions`（`session-perm.js`） |
| `session.js` Redis 命中路径 | **新增**指纹比对，变更了就地刷新会话权限 |
| `token-issuer.service.js` | 预热改走 `warmPermissions`（原键/命名空间都对不上，一直是无效写） |

> JWT Claims 里**嵌了** `permissions` 时仍直接用（签发时快照，OAuth 无状态约定），
> 不嵌才走指纹缓存。

### 降级方向

指纹计算失败 → **保守回源**（宁可多查一次库，不可沿用可能过期的权限）。
任何缓存层异常都不得变成"拒绝请求"或"放行"。

## 第 4 层：敏感操作回源校验

路由声明 `freshPermission: true` → 守卫以 `getPermissions(..., { fresh: true })`
**强制回源**，并用回源结果覆盖 `request.state.user`。

适用：权限变更本身、注销账号、导出全量数据等**不可逆/高影响**操作。
已启用：`POST /admin/iam/v1/roles/assign`、`POST /admin/iam/v1/policies`。

- **fail-closed**：回源失败 → 403，不是放行。与"权限读取失败降级"不同，
  敏感操作的默认答案必须是"不执行"。
- **不产生额外查询**：未声明该标志的路由零成本。
- **不入 `RUNTIME_FIELDS`**：与 `requirePermission` 同为代码级授权声明，
  否则运维改一次 DB 就能把第 4 层关掉。

## 主动失效

`invalidatePermCache(userId, appId)` 供变更后立即清除缓存，把生效时机提前到变更瞬间。
指纹机制在"下次请求时"也能发现变更，两者互补：

- 主动删可能漏（如直接改 DB）→ 指纹兜底
- 指纹要等下次请求 → 主动删补上

已接入 `iam.dao.js` 的 `assignRole` / `updateInlinePolicy`。
**失效失败不抛错** —— 变更本身已提交，不能因缓存层故障回滚，指纹仍会兜底。

## 验证

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "perm|session-perm|guard-fresh"
```

- `src/__tests__/auth/perm-fingerprint.test.js` —— 指纹语义 + `underscored` 陷阱
- `src/__tests__/auth/perm-cache-contract.test.js` —— 命名空间/键/接入点契约 + 反例
- `src/__tests__/auth/session-perm-e2e.test.js` —— 指纹失效端到端
- `src/__tests__/api/guard-fresh-permission.test.js` —— 第 4 层 fail-closed 行为

## 强度边界（写宣称时须守）

`auth:perm` 命名空间 + hash 键提高的是**被误写/被枚举的成本**，不是屏障：
- 能连 Redis 的攻击者仍可直接写缓存 —— 但**指纹会让他下次请求时被自动覆盖**（自愈）
- 指纹本身不是秘密，能读 Redis 就能读指纹；它的作用是**检测数据变化**，不是防篡改
