# 归属分析：`password-policy.js` 该放在 `framework/auth` 还是 `app/oauth21`？

> 背景：用户提出「密码策略属于 oauth21，放在 auth 上是否合理」。
> 结论：**放在 `framework/auth` 是对的，不建议迁到 `app/oauth21`**。但它当前的**内容**有问题，
> 真正该做的是「补齐能力 + 抬升归属」，而不是搬家。
> 分析时间：2026-09-14

---

## 一、先厘清一个前提：这个项目里 auth 与 oauth21 是什么关系

`src/framework/` 与 `src/app/` 是**两种不同层级**，不是平级业务模块：

| 目录 | 性质 | 例子 |
| ---- | ---- | ---- |
| `src/framework/` | **跨业务的基础设施**，不承载业务语义 | `log` / `db` / `redis` / `jwt` / `auth` / `verify` |
| `src/app/` | **业务应用**，一个 app 一套业务 | `oauth21` / `user` / `admin` / `firewall` / `posecraft` / `notice` / `poseadmin` |

`oauth21` 是**其中一个业务 app**（OIDC/OAuth 2.1 授权服务器），不是"认证层本身"。项目的认证基础设施是 `framework/auth`——`framework/loader/registry/04-auth.js` 把它作为独立插件在启动时注册，**与 oauth21 无绑定**（`JWT_ENABLED` 从环境变量读，"避免依赖 oauth21 应用层"，见 `index.js:45-46`）。

所以"密码策略属于 oauth21"这个前提**不成立**：oauth21 只是**消费方之一**，不是所有者。

---

## 二、实测：谁在真正用密码策略

```
$ grep -rn "password-policy" --include=*.js src/ oauth21/ firewall/ admin/ posecraft/ poseadmin/
src/app/user/dao/user.js:17:import { validatePasswordStrength } from '../../../framework/auth/password-policy.js';
```

**全仓唯一的生产引用方是 `app/user`，不是 `app/oauth21`。**

再往下看三个函数的引用情况：

| 函数 | 生产引用 | 说明 |
| ---- | -------- | ---- |
| `validatePasswordStrength` | `app/user/dao/user.js:174`（注册）、`:272`（重置密码） | 真正在用 |
| `isPasswordReused` | **零引用** | 死代码（`maxHistory` 配置项无人读） |
| `checkPasswordAge` | **零引用** | 死代码（`maxAgeDays` 配置项无人读） |

**关键发现**：两个用户想验证的调用点实际是：

| 调用点 | 位置 | 走的函数 |
| ------ | ---- | -------- |
| 注册 | `app/user/dao/user.js:158 registerUser()` | `validatePasswordStrength` |
| 找回密码/重置 | `app/user/dao/user.js:252 updatePassword()` | `validatePasswordStrength` |
| **修改密码（已登录）** | `app/user/dao/user.js:~250` | `validatePasswordStrength`（同上） |
| **OAuth 授权登录** | `app/oauth21/services/authorization.service.js:120 authenticateUser()` | ❌ **完全不校验密码策略** |

也就是说：**oauth21 只做"验证密码对不对"，从不做"密码够不够强"**——那是注册/改密时的职责，归 `app/user`。把策略文件放进 oauth21，等于让它去服务 `app/user` 的用例，**反而制造了跨 app 的反向依赖**。

---

## 三、逐条对比：四个候选位置

| 位置 | 合理性 | 理由 |
| ---- | ------ | ---- |
| **`framework/auth/`（现状）** | ✅ **推荐** | 密码复杂度是**认证域的基础规则**，与"会话/Cookie/令牌"同属一层；服务所有 app（user/oauth21/admin/未来的）；零依赖（不 import db/redis），是干净的纯函数工具 |
| `app/oauth21/` | ❌ **不建议** | oauth21 是业务 app 不是认证层；它根本不调用密码策略；会造成 `app/user → app/oauth21` 的跨 app 依赖（app 之间不应互相依赖） |
| `app/user/` | 🟡 次优 | 唯一真实调用方在这里，短期看"就近"；但密码策略是认证域规则，且 admin 后台改密、oauth21 将来若要强制强密码都会用到 → 放 app 层会造成重复实现 |
| 新建 `framework/security/` | 🟡 可选 | 若认为"密码策略"更偏安全治理而非认证流程，可另立。但当前 `framework/auth` 已在承担认证安全职责（`signature`/`totp`/`origin-guard`/`anomaly-detector`），单独再开一层**收益低、散点多** |

**结论：当前位置 `framework/auth/password-policy.js` 是四个选项里最合理的。**

---

## 四、真正的问题不是位置，是「内容与命名」

审阅后发现这个文件有**三处实质问题**，都与"放哪"无关：

### 问题 1：一半是死代码，且是**安全能力缺失**

`isPasswordReused`（防撞旧密码）和 `checkPasswordAge`（密码有效期）**零引用**。而 `DEFAULT_POLICY` 里高调声明了：

```js
maxHistory: 5,      // 记住最近 N 个密码，防止重复使用
maxAgeDays: 0       // 密码有效期（天），0 表示永不过期
```

配置项写了、注释写了、**功能没接**。这比"没实现"更危险——**读代码的人会以为系统有防密码重用能力**。

对比 `verifyCookie` 那类缺陷，这属于同类问题：**契约（注释/配置）与实现不一致**。

### 问题 2：`maxHistory` 语义自相矛盾

`isPasswordReused(password, passwordHistory, hashFn)` 要调用方传**已经哈希好的历史列表**，但：

- `UserIdentity` 表存的是**单个** `credential` 字段，没有密码历史表；
- 全仓无 `password_history` 相关模型或列；
- 即便接上，`maxHistory: 5` 也需要在改密时**把旧 credential 追加到历史**——没有这个写入路径。

所以这个函数**当前架构下无法使用**，不是"没接线"而是"缺配套存储"。

### 问题 3：命名与内容不匹配（可发现性差）

文件名 `password-policy.js` 听起来是"完整的密码策略模块"，实际只实现了**强度校验**。这会让 `isPasswordReused`/`checkPasswordAge` 这类死代码长期潜伏无人察觉。

---

## 五、建议方案

### 5.1 归属：保持不动

`framework/auth/password-policy.js` **不迁**。理由已在 §3 列明，核心是：它是**认证域的基础规则 + 多 app 潜在共用 + 零依赖纯函数**，三个特征都指向 framework 层。

### 5.2 内容：按优先级补齐

| 优先级 | 动作 | 理由 |
| ------ | ---- | ---- |
| **P0** | **决策 `isPasswordReused`/`checkPasswordAge` 去留** | 二选一：**(a)** 补齐配套存储（`UserIdentity` 加 `password_history` JSON 列 + 改密时追加），真正实现防重用；**(b)** 删除这两个函数 + `maxHistory`/`maxAgeDays` 配置项，文件收窄为"强度校验"。**推荐 (b)**——当前无密码历史表，补 (a) 是独立需求，不该以"半成品"形态挂着 |
| **P1** | 修正文件头注释，明确当前只覆盖"强度校验" | 消除"有完整策略"的错觉，与 fullstack-rules「注释与实现一致」对齐 |
| **P2** | 若保留 `maxAgeDays` 配置则接入；否则删配置项 | 避免"配置项存在但无效" |
| 🔵 | `validatePasswordStrength` 的 `maxLength: 128` 与 bcrypt 72 字节上限的关系 | **已实测确认存在静默截断**，详见下方 |

> **P2 补充说明（bcrypt 72 字节上限，已实测）**：
>
> ```
> $ node -e "const bcrypt=require('bcryptjs');
>   const a='A'.repeat(72)+'XXXXX', b='A'.repeat(72)+'YYYYY';
>   console.log(bcrypt.compareSync(b, bcrypt.hashSync(a,10)))"
> true
> ```
>
> 前 72 字节相同、后面不同的两个密码，`bcrypt.compareSync` 返回 **true** —— 证明 `bcryptjs` 只取前 72 字节。
> 而 `DEFAULT_POLICY.maxLength = 128` 是**字符**长度，故：
> - 长度 73–128 的密码，**超出 72 字节的部分被静默忽略**（用户以为设置了更长密码）；
> - 多字节字符下更早触发：`'中'.repeat(3)` = 9 字节 → 24 个汉字即超 72 字节。
>
> 建议 `maxLength` 收敛到 72（字符），或在 `validatePasswordStrength` 内按 `Buffer.byteLength(password)` 显式拒绝。
> 属独立小项，可与 P0 决策同批处理。

### 5.3 与 `framework/auth` 其他文件的分工梳理（顺带答疑）

若用户想给框架层"分类"，现状是这样的：

| 文件 | 语义 | 是否认证域 |
| ---- | ---- | ---------- |
| `password-policy.js` | 凭证**强度规则** | ✅ 是（凭证语义） |
| `totp.js` | 二次验证 | ✅ 是 |
| `signature.js` | 请求签名 | ✅ 是 |
| `origin-guard.js` | 来源白名单 | ✅ 是 |
| `anomaly-detector.js` | 异常检测 | ✅ 是 |
| `audit-logger.js` | 安全审计 | ✅ 是 |
| `permission-loader.js` | 权限加载 | ✅ 是 |

**七个文件都在"认证 / 授权 / 安全"这个域内，聚类是自洽的**——`password-policy` 放在这里与 `totp`/`signature` 同级，定位清晰。

---

## 六、一句话回答

> **放 `framework/auth` 合理，不要迁到 `oauth21`。**
> `oauth21` 是业务 app 且根本不调用密码策略，"密码策略属于 oauth21"的前提不成立；
> 实际唯一调用方是 `app/user`（注册/重置密码）。
> 真正要处理的是这个文件**自身**：一半函数是零引用死代码（`isPasswordReused`/`checkPasswordAge`），
> 而 `maxHistory`/`maxAgeDays` 配置项是"写了没接"——这才是需要修的。
