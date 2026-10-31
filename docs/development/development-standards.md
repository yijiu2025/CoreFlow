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

**迁移文件** (`migrations/20260527000001-baseline-all-tables.js`):

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
function encryptPhone(plain) { ... }

export { encryptPhone };
```

```ts
/**
 * 点赞/取消点赞（调后端 API + 乐观更新）
 * @param item - 作品对象
 * @throws 未登录时跳转登录页
 */
const handleLike = async (item: any) => { ... }
```

---

## 导出位置

**所有 `export` 一律收拢到文件末尾**，定义处不写 `export` 关键字。完整约定（含违约示例与默认导出改法对照表）见 [AGENTS.md](../../AGENTS.md) 的「导出位置」一节，这里只给速查：

```js
// ✅ 正确
function processOrder(order) { ... }
const MAX_RETRY = 3;

export { processOrder, MAX_RETRY };
export default orderService;
```

```js
// ❌ 禁止
export function processOrder(order) { ... }
export const MAX_RETRY = 3;
export default new OrderService();
```

强制手段：

| 手段                     | 位置                                                 | 作用                                          |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------- |
| ESLint `no-restricted-syntax` | `eslint.config.js`（`files: src/**/*.js`）      | 拦截新写入的行内导出（编辑期即时报错）        |
| 契约测试                 | `src/__tests__/conventions/export-placement.test.js` | 跨文件扫描全仓一致性（含 re-export 位置）     |

改写方式：这条规则**没有 `eslint --fix` 自动修复**（需要 AST 精确定位 + 保证导出面不变），小范围按上表手工改即可。

---

## 性能工程（后端）

后端性能要点见 [best-practices/performance.md](../standards/best-practices/performance.md)
（缓存与 TTL、连接池、优雅关闭、慢请求告警、限流器往返次数）。三条铁律：

| 铁律 | 一句话 |
| --- | --- |
| **先量后改** | 没有实测数字（`npm run bench` 基线 / 火焰图 / `EXPLAIN`）就不动配置或索引 |
| **热路径不分配** | 每请求都会走到的路径（守卫、IP 匹配、限流）禁止逐请求 new 对象 / 编译正则 / 查库 |
| **失效要主动** | 缓存不是"设了 TTL 就安全" —— 权限变更必须主动失效，否则撤销会被推迟到过期 |

> 原先这里的「前端性能工程」整节已随前端工程一并迁出，
> 内容见 [archive/legacy-frontend/frontend-performance-rules.md](../archive/legacy-frontend/frontend-performance-rules.md)。
