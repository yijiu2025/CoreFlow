# 开发规范

## 文件头注释

每个新建文件必须在文件顶部添加标准注释块，包含功能描述、说明、作者信息。

### 后端文件（`src/`）

```js
/**
 * 模块简要描述
 *
 * 详细功能说明（可选，复杂模块需要写清楚职责、业务场景、注意事项）
 *
 * @author Claude
 * @since 2026-07-13
 */
```

### 前端文件（`posecraft/src/`）

```ts
/**
 * 组件/组合式函数/API 模块简要描述
 *
 * 详细功能说明（可选）
 *
 * @author Claude
 * @since 2026-07-13
 */
```

### 迁移文件（`migrations/`）

```js
/**
 * 迁移说明：本次迁移做什么（建表/加列/改数据/加密等）
 * 逆操作说明（down 是否能完全回滚、注意事项）
 *
 * @author Claude
 * @since 2026-07-13
 */
```

### 完整示例

**后端工具类** (`src/utils/crypto.js`):

```js
/**
 * 手机号加密工具
 * 使用 AES-256-CBC + 确定性 IV（HMAC-SHA256 派生），保证同一明文产生同一密文
 * 目的：加密存储手机号，同时保持唯一索引可用性
 *
 * @author Claude
 * @since 2026-07-13
 */
```

**前端 API 模块** (`posecraft/src/api/bannerConfig.ts`):

```ts
/**
 * Banner 配置前台 API
 * 首页推荐大图 Banner 的查询接口（公开、无登录）
 *
 * @author Claude
 * @since 2026-07-13
 */
```

**迁移文件** (`migrations/20260713000001-encrypt-phone.js`):

```js
/**
 * 批量加密 user_user 表中现有的明文手机号
 * 加密后格式: base64(IV):base64(ciphertext)（含冒号分隔符）
 *
 * @author Claude
 * @since 2026-07-13
 */
```

---

## 注释标签说明

| 标签          | 必填 | 说明                            |
| ------------- | ---- | ------------------------------- |
| `@author`     | ✅   | 作者标识（Claude / 开发者姓名） |
| `@since`      | ✅   | 创建日期（YYYY-MM-DD）          |
| `@param`      | 函数 | 参数说明（类型 + 名称 + 用途）  |
| `@returns`    | 函数 | 返回值说明                      |
| `@example`    | 可选 | 使用示例                        |
| `@deprecated` | 可选 | 标记废弃 + 替代方案             |
| `@see`        | 可选 | 关联模块引用                    |

---

## 函数注释（JSDoc / TSDoc）

```js
/**
 * 加密手机号
 * @param {string} plain - 明文手机号，如 '13812345678'
 * @returns {string} 加密字符串，格式: base64(IV):base64(ciphertext)
 */
export function encryptPhone(plain) { ... }
```

```ts
/**
 * 点赞/取消点赞（调后端 API + 乐观更新）
 * @param item - 作品对象
 * @throws 未登录时跳转登录页
 */
const handleLike = async (item: any) => { ... }
```
