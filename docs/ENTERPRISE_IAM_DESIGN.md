# 工业级 IAM 系统深度设计规范 (V2.0)

本规范描述了支持 **通配符授权**、**分级委派** 及 **临时提权** 的工业级身份管理体系。

---

## 1. 核心设计理念

1.  **RBAC + ABAC 混合模型**：基于角色的访问控制 (RBAC) 负责标准授权，内联策略 (ABAC/Policy) 负责灵活的勾选与通配符授权。
2.  **权重压制 (Rank-Level Guard)**：管理员仅能委派等级低于自身的权限，禁止横向越权。
3.  **应用隔离与全局可见**：通过 `GLOBAL` 占位符区分全局资源与子应用资源。

---

## 2. 数据库设计 (扩充版)

### 2.1 核心角色表 (RBAC 层)
| 表名 | 作用 | 关键字段 |
| :--- | :--- | :--- |
| `user-user` | 统一身份 | `uid`, `username`, `status` |
| `user-role` | 角色模板 | `id`, `app_id`, `rank_level` (0-99) |
| `user-app_user_role` | 授权关系 | `uid`, `role_id`, `app_id`, `expire_at` (支持 JIT) |

### 2.2 灵活策略表 (Policy 层) —— **支持通配符**
**表名**：`user-inline_policy`
**作用**：解决“独立勾选特权”和“通配符授权”问题，避免数据库记录爆炸。

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `uid` | UUID | 关联用户 |
| `app_id` | String | 关联应用 |
| `policy_document` | JSON | 存储策略规则 (见下文示例) |

---

## 3. 授权进阶方案

### 方案一：JSON 内联策略 (Inline Policy) ⭐️推荐
支持 `order:*` 这种粗粒度的授权。当前台勾选“全选模块”时，后端不再存入 100 行 ID，而是存入一个 JSON。

**JSON 结构示例：**
```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["user:create", "order:*"] 
    },
    {
      "Effect": "Deny",
      "Action": ["finance:pay"] 
    }
  ]
}
```

### 方案二：JIT 临时提权 (Just-In-Time Access)
在 `user-app_user_role` 中加入 `expire_at`。
*   **应用场景**：给开发人员开通 2 小时的生产库只读权限。
*   **逻辑**：鉴权时自动过滤 `expire_at < NOW()` 的记录。

### 方案三：影子角色 (Shadow Role)
若不愿改动现有 RBAC 联表逻辑，则在勾选特权时，系统自动创建一个标记为 `is_virtual = true` 的隐藏角色绑定给用户。

---

## 4. 核心拦截代码 (双重压制)

```javascript
async function assignRole(adminUid, targetUid, targetRoleId, appId) {
  const [adminLevel, targetLevel] = await Promise.all([
    getMemberLevel(adminUid, appId),
    getMemberLevel(targetUid, appId)
  ]);

  const targetRole = await Role.findByPk(targetRoleId);

  // 1. 权重压制：管理员级别必须大于目标角色级别
  if (adminLevel <= targetRole.rank_level) {
    throw new Error("FORBIDDEN: 无法委派等级高于或等于自己的角色");
  }
  
  // 2. 职级保护：管理员级别必须大于目标用户级别
  if (adminLevel <= targetLevel) {
    throw new Error("FORBIDDEN: 无法对等级高于或等于自己的用户进行越级操作");
  }

  // 执行分配...
}
```

---

## 5. 性能优化：位图压缩 (Bitmap)
当权限 Code 过多时，可将其映射为连续 ID，在 JWT 中以 16 进制位图存储。
*   **示例**：拥有 ID 1, 3, 5 的权限 -> 二进制 `101010` -> Token 存 `2A`。
*   **优点**：Token 极小，解析极快。