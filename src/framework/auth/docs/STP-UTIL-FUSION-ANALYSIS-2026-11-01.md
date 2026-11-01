# StpUtil 与 CodeQL 告警的融合分析 {#stp-util-fusion}

> 分析日期：2026-11-01
> 分析对象：`src/framework/auth/stp-util.js`（`class StpUtil`，238 行）+ 本仓 CodeQL（code scanning）全部历史告警
> 触发问题：「CodeQL 页面里那些相关内容，能不能融合进 `StpUtil`？」
> 结论口径：每条判断都附**证据路径/行号/实测输出**，可复核；不含"建议引入某某框架"式推测

---

## 一、结论先行

**1. CodeQL 那 4 条限流告警，不可能通过"写进 StpUtil"解决。**
规则 `js/missing-rate-limiting` 判定的是「路由 handler 的调用链上有没有限流中间件」。
`StpUtil` 是静态工具类，不是 handler，把限流写进去既不会改变扫描结果，也不会产生真实保护
（限流必须按路由 + IP 维度挂在注册链上）。这条路走不通，后文第四节给机制层面的论证。

**2. 真正值得融合的不是告警文本，而是"权限判定的单一事实来源"。**
本仓现在有两条并行鉴权链，且它们的**通配符语义不一致**（第五节有对照表）：

- `src/api/guard.js:57` `isPermissionMatch()`：只认 `*` 与 `前缀:*`
- `src/framework/auth/stp-util.js:71` `StpUtil._isMatch()`：把 `*` 换成 `.*` 走正则，任意位置可通配

同一个权限串在两条链上可能得出相反结论。这是本次分析最重要的发现。

**3. `StpUtil` 目前是"文档里的 API、代码里的孤儿"。**
生产代码零调用（只有 `app.decorate('auth', StpUtil)` 挂了装饰器但没人用），
而 `docs/core/permission.md:135` 仍在对外宣称它可以用来鉴权，测试也覆盖了它。
一旦有人照着文档用，就会踩到下面第 4 条的坑。

**4. 融合之前必须先修两个真实缺陷**（详见第五节，均可复现）：

| 级别 | 缺陷 | 后果 |
| --- | --- | --- |
| P0 | `NotPermissionException` 只设 `code`，全局错误处理器读 `statusCode` | 权限不足以 **500** 出站，不是 403 |
| P1 | `_isMatch` 把权限串直接拼进 `RegExp` | 未配对的 `[`/`(` 抛 `SyntaxError` → 500；`.`/`+`/`?` 静默改变匹配语义 |

**5. 推荐方案 A（薄封装），不推荐把 `StpUtil` 扶正为唯一鉴权入口。**
guard 已是事实标准（全仓路由都走三级 PBAC），把 `StpUtil` 降级为 guard 的只读视图，
改动面最小、不触碰已通过验收的鉴权链。方案对比见第七节。

---

## 二、事实核对

### 2.1 CodeQL 侧：10 条告警，4 条与认证相关且全是误报

```bash
# 复核命令（需 repo 权限的 token）
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/yijiu2025/CoreFlow/code-scanning/alerts?state=all&per_page=100"
```

| # | 规则 | 位置 | 状态 |
| --- | --- | --- | --- |
| 10 | `js/missing-rate-limiting` | `src/framework/auth/index.js:367` | dismissed（误报） |
| 9 | `js/missing-rate-limiting` | `src/app/oauth21/middleware/csrf.middleware.js:104` | dismissed（误报） |
| 8 | `js/missing-rate-limiting` | `src/app/oauth21/middleware/rate-limiter.js:163` | dismissed（误报） |
| 6 | `js/missing-rate-limiting` | `src/app.js:453` | dismissed（误报） |
| 7 | `js/incomplete-url-substring-sanitization` | `src/app/user/services/oss.service.js:131` | fixed |
| 5 | `js/incomplete-sanitization` | `scripts/release.mjs:399` | fixed |
| 4 | `js/incomplete-sanitization` | `scripts/release-web.mjs:436` | fixed |
| 1–3 | `actions/missing-workflow-permissions` | `.github/workflows/ci.yml:103/132/161` | fixed |

4 条限流的处置理由（原文）：

> 非路由 handler：`auth/index.js:367` 与 `csrf.middleware.js:104` 是 onRequest 钩子，
> `app.js:453` 是 onClose 钩子，`rate-limiter.js:163` 即限流中间件本身。
> 全局限流由 `@fastify/rate-limit` 在 05-firewall 注册（`defense.enableRateLimit=true`，600/6min）

补充：default setup 遗留的动态 workflow `dynamic/github-code-scanning/codeql` 已于 2026-11-01
清空运行记录后消失（65 条 run）；`refs/heads/main` 的 152 条分析被平台锁死不可删
（`DELETE /code-scanning/analyses/{id}` 返回 400 "Analysis specified is not deletable."）。

### 2.2 StpUtil 侧：能力齐全，但没人调用

```bash
# 生产代码调用面（排除测试）
grep -rn "StpUtil" src --include=*.js | grep -v __tests__
# → src/framework/auth/stp-util.js      （自身 20 处）
# → src/framework/auth/request-context.js（注释 3 处）
# → src/framework/auth/index.js:35,49,424-425（import + app.decorate('auth', StpUtil)）

# 装饰后的消费方
grep -rn "request\.auth\|req\.auth\|app\.auth\b" src --include=*.js | grep -v __tests__
# → 无
```

类提供 10 个静态方法：

| 方法 | 语义 | 数据来源 |
| --- | --- | --- |
| `getLoginId()` | 取当前 uid | `state.user.sub \|\| state.user.uid` |
| `check()` | 强制登录，否则 401 | `state.user` |
| `login(params)` | 建会话 + 下发 Cookie（惰性 import `session.js`） | — |
| `checkRole(role)` | 角色校验，否则 403 | `state.user.roles` |
| `getPermissionList()` | 取权限集合 | `state.user.permissions` |
| `hasPermission(p)` | 判断（Deny 优先 + 通配） | 同上 |
| `checkPermission(p)` | 校验，否则抛 `NotPermissionException` | 同上 |
| `checkPermissionAnd(...p)` | AND 语义 | 同上 |
| `checkPermissionOr(...p)` | OR 语义 | 同上 |

设计上是**刻意零副作用**的（`stp-util.js:16-21`）：只依赖 `./request-context.js`，
`session.js` 惰性导入，`import` 本身不建连。这个约束是它唯一的"资产"，
后续任何融合方案都必须保留，否则单测与脚本无法安全引入。

### 2.3 真实鉴权链：guard 三级 PBAC

```
onRequest (src/framework/auth/index.js:367)
  ├─ JWT claims（JWT_ENABLED=true 时）      → state.user
  └─ Session Cookie（sid）                  → state.user { roles, permissions }
        ↓
preHandler: createGuard(systemKey, groupKey, apiKey)  (src/api/guard.js:257)
        ├─ 1 级 系统级  applyGuardLogic(sys)
        ├─ 2 级 文件级  applyGuardLogic(grp)
        ├─ 2.5 敏感操作回源 freshPermission → getPermissions(..., { fresh: true })
        └─ 3 级 接口级  requireLogin / allowRoles / requirePermission
        ↓
handler
```

要点：

- 权限数据是**会话/Token 快照**（`state.user.permissions`，`auth/index.js:405`），
  非快照失效由 `perm-cache.js` 的指纹机制兜底；
- `freshPermission: true` 的路由会在 guard 内**回源覆盖** `state.user`（`guard.js:206`）；
- guard 的失败出口是 `reply.result.forbidden()`（直接写响应，`guard.js:249`），
  **不抛异常**。

---

## 三、逐条映射：CodeQL 规则 × StpUtil

| CodeQL 规则 | 落点 | 与 StpUtil 的关系 | 能否融合 |
| --- | --- | --- | --- |
| `js/missing-rate-limiting` ×4 | auth/csrf/rate-limiter/app 的钩子 | **无关**。StpUtil 不注册路由、不在 handler 链上 | ❌ 不能。写进去也不改变判定 |
| `js/incomplete-url-substring-sanitization` | `oss.service.js:131` | 无关（OSS key 归一化） | ❌ 已修，无需动 |
| `js/incomplete-sanitization` ×2 | `scripts/release*.mjs` | 无关（发版脚本） | ❌ 已修 |
| `actions/missing-workflow-permissions` ×3 | `ci.yml` | 无关（workflow 权限块） | ❌ 已修 |

**结论：10 条 CodeQL 告警里，没有一条能在 `StpUtil` 里找到落点。**
"把 CodeQL 相关内容融合进 StpUtil"这个命题本身不成立 —— 它们分属两个层面：
CodeQL 说的是**路由注册层**的问题，StpUtil 是**请求上下文读取层**的工具。

---

## 四、为什么"融合 CodeQL 建议"这条路走不通（机制层面）

`js/missing-rate-limiting` 是一条**数据流规则**，判定逻辑可以概括为：

1. 源：某个注册到路由表上的 handler（`app.get/post/...` 或 `app.route()` 的回调）；
2. 汇：handler 内部可达的敏感操作（DB 写、认证校验等）；
3. 检查：从源到汇的路径上是否存在一个"限流中间件"节点（`@fastify/rate-limit` 的
   `config.rateLimit`、或显式 `preHandler` 里的限流函数）；
4. 缺失 → 报 `missing-rate-limiting`。

因此：

- `StpUtil.checkPermission()` **不是源**（它没有注册为路由），写多少代码都不会出现在数据流图里；
- 即使把 `@fastify/rate-limit` 的逻辑复制进 `StpUtil`，规则也不会认为"该 handler 有限流"，
  因为判定看的是**注册链**而不是**调用链**；
- 更现实的问题是：在工具类里做限流需要知道"当前路由 + 客户端 IP + 限流配置"，
  这等于把路由层的职责硬塞进零依赖工具类，直接破坏 `stp-util.js:16-21` 的零副作用约束。

**这 4 条误报的真正成因是"架构不可见"，不是"代码缺失"：**
全局限流在 `05-firewall` 插件注册，扫描器从单个 handler 出发看不到那层注册。
让 CodeQL 变绿的正确做法是**让架构显形**（在路由声明处显式标注 `config.rateLimit`
或加一条 `queries` 排除配置），而不是往工具类里堆代码。

---

## 五、动手前必须先修的两处（P0 / P1）

这两处与"融合"直接相关：**不修，融合只会把缺陷扩散到更多调用点**。

### P0 · `NotPermissionException` 出站是 500，不是 403

证据链：

```js
// src/framework/auth/stp-util.js:33-39
class NotPermissionException extends Error {
  constructor(permission) {
    super(`无此权限: ${permission}`);
    this.name = 'NotPermissionException';
    this.code = 403;          // ← 只设了 code
  }
}

// src/app.js:229（全局错误处理器）
let statusCode = error.statusCode ?? error.status ?? 500;   // ← 读的是 statusCode / status
```

`error.code` 在这条链上**没有任何读取方**，所以 `StpUtil.checkPermission()` 抛出的异常会
落到 `?? 500` 分支：HTTP 状态 500、日志按 `log.error('服务器内部错误', error)` 打完整堆栈、
生产环境响应体被替换成"服务器内部错误"。

对比同类的其它两处（都写对了）：

```js
// stp-util.js:96-97  check()
err.statusCode = 401;
// stp-util.js:159-160 checkRole()
err.statusCode = 403;
```

**为什么测试没发现**：`src/__tests__/permission-system.test.js:79` 断言的是
`expect(err.code).toBe(403)` —— 断言的是自定义字段，不是 HTTP 语义。
测试与真实出站链路之间没有任何一环校验过状态码。

修法（二选一，推荐前者）：

```js
// 方案 1：补齐 statusCode，保留 code 兼容老断言
this.code = 403;
this.statusCode = 403;

// 方案 2：改为继承统一异常基类（若能接受改动测试）
// class NotPermissionException extends ApiException { ... bizCode ... }
```

同时补一条**真的走一遍错误处理器**的测试，断言 `reply.statusCode === 403`，
而不只是断言异常对象字段。

### P1 · `_isMatch` 未转义正则元字符

```js
// src/framework/auth/stp-util.js:71-76
static _isMatch(pattern, target) {
  if (pattern === target) return true;
  if (!pattern.includes('*')) return false;
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');   // ← 原样拼接
  return regex.test(target);
}
```

三种失效形态（2026-11-01 实测，`node --input-type=module` 直接调生产代码）：

| pattern | target | 期望（guard 语义） | 实际 `_isMatch` |
| --- | --- | --- | --- |
| `user:*.read` | `user:xxXread` | `false`（没这条权限） | **`true`**（`.` 被当通配） |
| `a+b:*` | `aab:x` | `false` | **`true`**（`a+b+` 走正则量词语义） |
| `user:[a-:*` | `user:[a-:read` | `true`（前缀匹配） | **抛 `SyntaxError`**：`Invalid regular expression: /^user:[a-:.*$/: Range out of order` |
| `user:(x:*` | `user:(x:read` | `true` | **抛 `SyntaxError`**：`Unterminated group` |

```text
# 实测输出（P0/P1 一起验）
[P0] name= NotPermissionException | code= 403 | statusCode= undefined | status= undefined
[P0] 错误处理器算出的状态码 = 500
[P1] user:*.read vs user:xxXread => true
[P1] a+b:* vs aab:x => true
[P1] user:[a-:* => 抛错: SyntaxError | Invalid regular expression: /^user:[a-:.*$/: Range
[P1] user:(x:* => 抛错: SyntaxError | Invalid regular expression: /^user:(x:.*$/: Unterm
```

值得注意的是前两种**不会报错**：权限判定静默变宽/变窄，日志里什么都看不到。
这正是"两套实现必须合并"的最强理由 —— 这类偏差靠 review 抓不到。

修法：

```js
const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
const regex = new RegExp(`^${escaped}$`);
```

或者更彻底：**直接复用 guard 的 `isPermissionMatch`**，让两条链共用一份语义
（这就是第六节"融合"的核心动作）。

---

## 六、可融合 / 不建议融合

### ✅ 可融合（按价值排序）

| # | 融合内容 | 落点 | 价值 |
| --- | --- | --- | --- |
| 1 | **权限匹配语义统一**：`_isMatch` 改为复用 `guard.js` 的 `isPermissionMatch`（抽到 `src/utils/` 供双方 import） | `stp-util.js:71` | 消除"同一权限串两种结论"的分裂；顺手修掉 P1 |
| 2 | **异常契约统一**：`NotPermissionException` 补齐 `statusCode`/`bizCode`，与 `reply.result.forbidden()` 的响应体对齐 | `stp-util.js:33` | 修掉 P0；让 throw 与 reply 两条出口对前端表现一致 |
| 3 | **敏感操作回源**：给 `checkPermission` 加 `{ fresh: true }` 选项，转调 `getPermissions(..., {fresh:true})` | `stp-util.js:204` | 让工具类也能覆盖 `freshPermission` 场景，不必绕道 guard |
| 4 | **审计埋点**：`checkPermission` 失败时写一条 `audit-logger`（谁、要什么权限、被拒理由） | `stp-util.js:204` | 权限拒绝目前只在 guard 侧有日志，工具类侧完全没有痕迹 |

### ❌ 不建议融合

| 内容 | 原因 |
| --- | --- |
| 限流（`@fastify/rate-limit`） | 需要路由 + IP 上下文；破坏零依赖约束；且不影响 CodeQL 判定 |
| 三级守卫的 system/group/api 级联 | 依赖 `guard-config` + 路由注册期信息，属注册层职责 |
| IP 白名单 / `isIpMatch` | 同上，guard 已在 `guard.js:174` 处理 |
| 会话创建之外的 session 生命周期 | `login()` 已惰性转调 `session.js`，再堆逻辑会让工具类变成第二套 session 实现 |
| CSRF / 风险检测 | 已在 onRequest 钩子链上，与"权限判定"是两个关注点 |

---

## 七、三个方案

| | A · 薄封装（推荐） | B · 扶正为唯一入口 | C · 删除 |
| --- | --- | --- | --- |
| 做法 | `StpUtil` 保留 API 形状，内部委托 guard 的判定函数；补 P0/P1 | 所有路由改用 `StpUtil.checkPermission()` 声明鉴权，guard 退化为限流/白名单层 | 删除 `stp-util.js`，同步删文档与测试 |
| 改动面 | 小（2 个文件 + 测试） | **大**（173 条路由逐个改 + 鉴权链重构） | 小 |
| 风险 | 低 | 高：要重新验证三级守卫、freshPermission、IP 白名单的等价性 | 低，但会丢掉"可移植的工具类 API" |
| 对 CodeQL | 无影响（本来就不相关） | 无影响 | 无影响 |
| 文档影响 | `docs/core/permission.md` 需加"仅上下文读取"限定 | 文档要大改 | 文档删一节 |
| 结论 | **建议采纳** | 不建议（收益不抵风险） | 备选（若确认长期无人使用） |

选 A 的理由：guard 已经是**经过验收的事实标准**（三级守卫 + 指纹失效 + freshPermission +
IP 白名单都在它身上，且有跨应用隔离等守卫测试盯着）。把工具类扶正意味着把这些能力
重新实现一遍或整体搬迁，属于"为了统一而制造新风险"。
`StpUtil` 的真实价值是**给调用方一个不用传 request 的读取口**，那就只做读取口该做的事。

---

## 八、落地路线（分三步，可独立验收）

### Step 1 · 修 P0 / P1（不改变任何现有行为，纯修复）

- `NotPermissionException` 补 `statusCode = 403`
- `_isMatch` 转义正则元字符（或直接换成共享的 `isPermissionMatch`）
- 补测试：
  - `checkPermission` 失败 → 走一次真实 error handler，断言 HTTP 403
  - `_isMatch('user:(beta):*', '...')` 不抛 `SyntaxError`
  - `_isMatch('user:*.read', 'user:xxXread') === false`（`.` 不再通配）

验收：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/__tests__/permission-system.test.js`

### Step 2 · 权限语义统一（方案 A 的核心）

- 从 `guard.js:57` 抽出 `isPermissionMatch` 到 `src/utils/permission-match.js`
- `guard.js` 与 `stp-util.js` 同时 import 它（消除两份实现）
- 补一条**跨链一致性**测试：同一组 `(allows, denies, perm)` 在 guard 与 StpUtil 上结论相同

验收：新增的一致性用例 + 全量 `npm test` 1273 条不回退

### Step 3 · 文档更正

- `docs/core/permission.md:135`「StpUtil 静态鉴权」小节加限定：
  **它是"在同一请求内读取/判定权限"的工具，不是路由鉴权入口**；路由鉴权请用 `createGuard`
- `docs/en/core/permission.md` 同步
- 若最终选 C（删除），则改为删除该小节并更新 `permission-system.test.js`

> 本文档只做分析，未改动任何生产代码。Step 1–3 待确认后再执行。

---

## 九、附：复核命令

```bash
# 1. CodeQL 告警（含已关闭）
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/yijiu2025/CoreFlow/code-scanning/alerts?state=all&per_page=100"

# 2. StpUtil 生产调用面（预期：只有自身与 index.js 的 decorate）
grep -rn "StpUtil" src --include=*.js | grep -v __tests__

# 3. 两套通配语义对照
sed -n '57,64p' src/api/guard.js      # isPermissionMatch：只认 '*' 与 '前缀:*'
sed -n '71,76p' src/framework/auth/stp-util.js   # _isMatch：正则拼接

# 4. 异常字段错配
sed -n '33,39p' src/framework/auth/stp-util.js   # 只有 code
sed -n '227,231p' src/app.js                    # 读 statusCode ?? status ?? 500
```
