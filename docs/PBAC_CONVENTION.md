# 企业级 PBAC (基于策略的访问控制) 研发约定规范

## 1. 核心思想 (Core Philosophy)
在大型 Web 应用中，权限管理必须遵循 **“权限点在代码中，角色策略在数据库中”** 的分离原则。
- **权限锚点 (Action)** 是与业务代码强绑定的。开发者在新增 API 或按钮时，必须在代码配置中声明此操作的权限编码（如 `user:delete`）。
- **角色 (Role)** 与 **策略 (Policy)** 是产品运营的核心。超级管理员在后台可以通过动态调整 JSON Policy，实时变更普通用户/VIP用户的访问权限，无需停机发布。

## 2. 权限字典的编写规范
所有后端模块的权限字典必须统一集中存放在 `src/*/permission/index.js` 中。

### 2.1 命名规范 (Naming Convention)
权限编码字符串必须遵循 `应用域:资源名:动作` (Domain:Resource:Action) 的三段式小写格式：
- **正确**：`user:profile:read`, `order:item:create`, `xianyu:chat:reply`
- **错误**：`ReadUser`, `user_delete`, `ADMIN`

### 2.2 定义示例
```javascript
// src/user/permission/index.js
export const PERMISSIONS = {
  USER: {
    READ: 'user:profile:read',   // 允许读取基础资料
    WRITE: 'user:profile:write', // 允许修改基础资料
    ADMIN: 'user:admin:*',       // 允许管理员特权操作
  }
};
```

## 3. 基础角色的自动加载 (Memory Registry 模式)
我们采用极其优雅的**内存挂载注册模式**（类似 Vue 的 `defineStore`），从而杜绝耗时的全局文件扫描。

### 3.1 宣告角色 (defineRoles)
在你的业务模块中（如 `src/user/permission/roles.js`），通过导入 `defineRoles` 即可将角色挂载至内存中：

```javascript
import { defineRoles } from '../../utils/PbacRegistry.js';
import { USER_PERMISSIONS } from './index.js';

// 只要这个文件在系统中被 import 过，这批角色就会自动驻留内存
defineRoles([
  {
    code: 'user_normal',
    app_id: 'GLOBAL',
    name: '普通用户',
    policy: { Effect: 'Allow', Action: [USER_PERMISSIONS.BASE.READ] }
  }
]);
```

### 3.2 触发挂载点
请将你写好的 `roles.js` 导入到你该模块的**入口文件**中（例如 API 路由定义文件 `v1/open.js` 顶部），确保当系统加载你的模块时，代码能被执行。

```javascript
import '../../../user/permission/roles.js'; // 导入即触发自动注册
```

### 3.3 ⚠️ 核心架构约定：执行顺序 (Loader Order)
由于采用的是先挂载内存再批量入库的机制，必须严格保证注册机加载顺序：
- **`07-api.js` 等业务扫描器必须在前**：它们会遍历导入你的路由，从而触发上面提到的 `defineRoles` 执行。
- **`09-pbac.js` 必须在最后调用**：它只负责一件事：遍历内存里收集到的所有角色，批量同步 (Upsert) 到数据库。数字前缀 `09` 保证了它在所有的 `01`~`08` 之后执行。
绝不可将 pbac 改名成 `01-pbac.js`，否则它在读取内存数组时，业务代码还没开始跑，将导致注册不到任何角色。

## 4. 后端静态鉴权 (StpUtil) 
为了提升研发体验并对标业界最成熟的写法（类似 Java Sa-Token），我们封装了基于 `AsyncLocalStorage` 的全局静态鉴权工具 `StpUtil`。

在后端的任意 Controller、Service 或 Middleware 中，你都可以**无需传递 req 对象**，直接静态调用：

```javascript
import StpUtil from '../../utils/StpUtil.js';

// 获取：当前账号所拥有的权限集合 (包含 allows 和 denies)
const permissions = StpUtil.getPermissionList();

// 判断：当前账号是否含有指定权限, 返回 true 或 false
const canDelete = StpUtil.hasPermission("user:admin:*");        

// 校验：当前账号是否含有指定权限, 如果验证未通过，则直接抛出 NotPermissionException 异常 (HTTP 403)
StpUtil.checkPermission("user:admin:*");        

// 校验：当前账号是否含有指定权限 [指定多个，必须全部验证通过]
StpUtil.checkPermissionAnd("user:admin:*", "user:admin:get", "user:admin:post");        

// 校验：当前账号是否含有指定权限 [指定多个，只要其一验证通过即可]
StpUtil.checkPermissionOr("user:admin:*", "user:admin:get", "user:admin:post"); 
```

**注意**：`StpUtil` 底层依赖于通配符正则引擎，且严格遵循 **Deny 优先** 原则。如果用户的策略中存在对应的 `Deny` 规则，上述所有 `has/check` 方法将无视任何 `Allow` 规则，直接予以拦截。

## 5. 后端路由拦截约定
在路由层的鉴权，建议封装一个通用中间件 `requirePermission`，其内部调用 `StpUtil.checkPermission`：
```javascript

```
