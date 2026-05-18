# 企业级多级分级授权管理架构方案 (Delegated Administration)

本方案设计了一套类似于“金字塔”层级的管理体系，支持超管、全局管、应用管及模块管的权限委派与隔离。

---

## 1. 核心层级定义 (Hierarchy Design)

我们通过 `Level` (权重值) 来定义管理深度。只有权重高的管理员才能操作权重低的用户/资源。

| 角色级别 | 权重 (Level) | 作用域 (AppId) | 管理能力说明 |
| :--- | :--- | :--- | :--- |
| **L1: 超级管理员** | 99 | `null` | 系统最高权限。可任命任何级别的管理员，可修改系统底层配置。 |
| **L2: 全局管理员** | 80 | `null` | 跨应用管理者。可管理所有业务应用，但无法修改系统级安全配置。 |
| **L3: 应用管理员** | 60 | `specific_app` | 单应用总管。仅能管理自己应用内的用户权限与板块划分。 |
| **L4: 模块管理员** | 40 | `specific_app` | 局部管理者。如“财务板块”、“客服系统”的权限分发员。 |

---

## 2. 数据库模型支持

为了实现此架构，`Group` (角色) 模型必须包含 `level` 和 `app_id`。

```javascript
// models/Group.js
const Group = sequelize.define('Group', {
  name: DataTypes.STRING,
  appId: { type: DataTypes.STRING, allowNull: true }, // 应用隔离
  level: { type: DataTypes.INTEGER, defaultValue: 1 }, // 权重等级
});
```

---

## 3. 核心代码实现：权限委派校验器

这是最关键的逻辑：**确保管理员无法通过“提拔自己”或“提拔他人”来实现越权。**

### 3.1 委派权限拦截中间件 (Pseudo-code)

```javascript
/**
 * 校验当前操作者是否有权将某个角色授予目标用户
 * @param {Object} operator 当前管理员
 * @param {Object} targetRole 准备授予给别人的角色
 */
async function validateDelegation(operator, targetRole) {
  // 1. 获取操作者在该环境下的最高 Level
  // 如果 operator 是超管，则 operatorLevel = 99
  const operatorLevel = await getOperatorMaxLevel(operator.uid, targetRole.appId);

  // 2. 判定逻辑 A: 权重压制
  // 管理员只能委派比自己等级低的角色 (例如 60 级的应用管只能任命 40 级的模块管)
  if (operatorLevel <= targetRole.level) {
    throw new Error('Forbidden: 你不能委派等级高于或等于自己的角色');
  }

  // 3. 判定逻辑 B: 范围锁定
  // 如果操作者不是全局管 (appId !== null)，则必须限制在同一应用内
  if (operator.appId !== null && operator.appId !== targetRole.appId) {
    throw new Error('Forbidden: 你无权操作其他应用的权限体系');
  }

  return true;
}
```

---

## 4. 实战场景模拟

### 场景一：超管任命“闲鱼”应用管理员
1. **超管 (L:99)** 登录后台。
2. 调用接口：给用户 `B` 授予 `闲鱼管理员` 角色 (L:60, appId: 'xianyu')。
3. **系统校验**：99 > 60，且超管拥有全局权限。**允许操作**。

### 场景二：闲鱼管理员提拔“闲鱼-财务板块”管理员
1. **闲鱼管理员 (L:60)** 登录后台。
2. 调用接口：给用户 `C` 授予 `财务主管` 角色 (L:40, appId: 'xianyu')。
3. **系统校验**：
   - 权重：60 > 40 (通过)
   - 范围：应用 ID 匹配 'xianyu' == 'xianyu' (通过)
4. **允许操作**。

### 场景三：攻击性尝试 —— 闲鱼管理员试图提拔自己为“超管”
1. **闲鱼管理员 (L:60)** 调用接口。
2. 尝试给自己授予 `超级管理员` 角色 (L:99)。
3. **系统校验**：60 < 99。**立即拦截并记录安全日志**。

---

## 5. 权限继承机制 (Inheritance)

在 API 判定时，采用 **“向下包含”** 原则：
* 如果一个 API 需要 `Level 40` 的权限才能访问。
* 那么 `Level 60` (应用管) 和 `Level 99` (超管) 默认拥有该权限，无需重复授权。

**实现方式**：
```javascript
// middleware/auth.js
const checkLevel = (requiredLevel) => {
  return async (req, res, next) => {
    const userMaxLevel = req.user.maxLevel;
    if (userMaxLevel >= requiredLevel) {
      return next();
    }
    res.status(403).send('权限不足');
  }
}
```
