# 多主题 / 多版式开发模式 {#multi-theme}

> **强制规则。** 本仓库认证前端 `oauth21` 的认证页面（登录 / 注册 / 重置密码）必须按本文组织「可换的呈现」。
> 新增页面照第七节的清单接入，不要另起一套。
>
> 机制实现：`oauth21/src/theme/index.ts`（主题包 + 设备 + 配色注册表）、
> `oauth21/src/theme/views/registry.ts`（版式注册表工厂）。
> 上游依赖：[跨内核渲染基线](/frontend/browser-baseline) 定义画布与视口，本文定义它之上的分层。

## 〇、一条原则

**把「长什么样」从「做什么」里剥出来。**

「做什么」——校验规则、请求、路由跳转、倒计时、协议拦截——**只允许存在一份**；
「长什么样」——DOM 结构、布局、装饰——可以有多份，随时增删，互不影响。

这不是为了"好看"，是为了让下面这件事不成立：同一套登录逻辑被复制成三份，改了一个忘了另两个，
于是"邮箱格式的提示只在旧版式里是对的"。**凡是要复制业务才能换 UI 的做法，都是错的。**

## 一、三个正交维度

| 维度 | 目录 / 载体 | 换的是什么 | 换的来源（优先级高 → 低） |
| --- | --- | --- | --- |
| ① token 基线 | `src/assets/styles/mobile-auth.scss` 的 `--mauth-*` | 不换。所有呈现取值的**唯一出口** | — |
| ② 配色 | `src/theme/themes/<包>/<设备>/colors/<配色>/` | 颜色 / 圆角 / 描边 / 背景图 / 字体，**同一套 DOM** | `?theme=`（别名 `?skin=`）→ 后端下发 → localStorage → **该设备兜底配色** |
| ③ 版式 | `src/theme/themes/<包>/<设备>/<page>/` | **DOM 结构与交互组织**，**同一套业务** | `?view=` → 主题包 `views.<page>` → `VITE_<PAGE>_VIEW` → `base` |

「**设备**」不是一个独立的换装维度，而是**页面身份**：手机端页面与电脑端页面各住各的子树，
各自有配色与版式（`<设备>` 段取 `mobile` / `web`，白名单）。同一份设计语言（同一个包）下，
两端可以给出不同的配色与版式，也可以给出同名的配色（`mono` 两端各一份，这是正常的）。
详见 `oauth21/src/theme/README.md` 的「三级结构」「设备是页面身份」。

三者**正交**，可任意组合：`?theme=ocean&view=compact` = 海蓝配色 + 轻版式。

### 想改 X 该去哪儿

| 想改的东西 | 动哪一层 | 参考 |
| --- | --- | --- |
| 品牌色 / 圆角 / 描边宽 / 字体栈 | ② 配色 `tokens` | `themes/default/mobile/colors/ocean/` |
| 背景图 / webfont / 伪元素装饰 | ② 配色 `theme.scss` | `themes/default/mobile/colors/ocean/` |
| 表面分层（让 header / body 透明，底色交还页面） | ② 配色 `tokens` + 画布 token | `themes/default/mobile/colors/sky/` |
| 按屏幕形态给不同值（横屏 / 矮屏） | ② 配色 `theme.scss` 的媒体查询 | `themes/default/mobile/colors/sky/` |
| **DOM 顺序、分步流程、面板组织** | ③ 版式（按设备分区） | `themes/default/mobile/register/compact/` |
| 校验规则、请求、跳转、拦截条件 | **容器**（不是主题也不是版式） | `view/app/register/index.vue` |
| 三页共用的字段 / 按钮 / 页脚外观 | ① 基线 `mobile-auth.scss` 的 `mauth-*` 类 | 该文件第 1、2 层 token |

**判断线**：换颜色 → ②；换 DOM 或流程组织 → ③；**两者都不该动业务**。一旦发现"要改业务才能换 UI"，说明分层破了。

## 二、目录约定

```text
src/theme/
├── index.ts / types.ts              # 主题包 + 设备 + 配色注册表 / 契约
├── mode.ts / remote.ts / runtime.ts # 明暗三态 / 后端下发 / token 白名单校验
├── views/registry.ts                # 版式注册表工厂（机制，一般不用动）
├── views/<page>.ts                  # 某页的契约 + 注册表（每页一份，如 login.ts）
├── views/pages.ts                   # 汇总各页注册表（供调试面板查询，新增页面不用改）
└── themes/                          # 主题包：一套完整设计 = 两端各自的版式 + 配色
    └── <包>/                        #   主题包，目录名即 id
        ├── index.ts                 #   包定义（meta / 可选 views；**不含 tokens**）
        ├── <设备>/                  #   mobile | web（白名单），设备由「页面身份」决定
        │   ├── <page>/index.vue     #   该端该页的基础版式（直接落在页面目录下，无 base/ 层）
        │   ├── <page>/<变体>/       #   变体：`import.meta.glob` **惰性**加载
        │   │   └── index.vue
        │   └── colors/<配色>/       #   该端该包的配色（index.ts + theme.scss + assets/）
        └── <另一设备>/              #   同上，两端各一套
```

- `<包>`、`<设备>`、`<配色>`、`<变体>` 都只允许 `[a-z0-9-]`（`<变体>` 会成为 `data-mauth-view` 的属性值）。
  其中 `<设备>` 另受白名单限制，只认 `mobile` / `web`。
- 各页的 `views/<page>.ts` 彼此独立、互不感知；**加页面不必改公共工厂**。

### 主题包 = 一个目录，目录名即 id

`themes/` 下**只按主题包分文件夹**，包内再按**设备**分一层（`./*/index.ts` 只扫一层包）：

| 目录 | 是什么 | id 从哪来 |
| --- | --- | --- |
| `themes/<包>/` | 主题包（本仓 `default`） | **目录名就是 id** |
| `themes/<包>/<设备>/` | 该包在某设备上的呈现（`mobile` / `web`） | 目录名，且必须是这两个值之一 |
| `themes/<包>/<设备>/colors/<配色>/` | 该端该包的**配色**（`mono` / `ocean` / `sky` / …） | **目录名就是 id** |

🔴 **不要往 `themes/` 下放任何不是主题包的目录**：主题注册表扫的就是「一层子目录 + `index.ts`」。
历史上版式契约塞在 `themes/app/` 里，只能靠「刻意不放 `index.ts`」躲过扫描器 —— 那是个**隐式条件**。
2026-09-24 的重构把契约与注册表收进 `theme/views/` 目录，这个隐式条件才从结构上消失。
**别为了整齐把它们再收进一个 `views/` 目录塞回 `themes/` 里** —— 那等于把坑重新挖开。

口径以 `theme/index.ts` 的 `buildRegistry()` 为准（实现即真源）：

| 情形 | 结果 |
| --- | --- |
| 目录名不合 `^[a-z0-9-]+$` | **跳过**，不注册 |
| 设备段不是 `mobile` / `web` | 整个目录**跳过**（不会被当成某个配色） |
| 缺 `index.ts` / 没有 `default` 导出 / 包内没有 `meta` | **跳过**，不注册 |
| 包内 `meta.id` 与目录名不一致 | **以目录名为准**（`meta: { ...def.meta, id: colorId }`） |
| 只有 `theme.scss`、没有 `index.ts` | 视为残缺，**该目录的样式被忽略** |
| 包根（`themes/<包>/index.ts`）坏了 | 该包**及旗下所有设备的配色**全部不注册 |
| 同包同设备内有同名配色 | 后到的**告警并忽略**（按路径排序先到先得） |

两点意图：

1. **目录名是唯一真源**：`theme.scss` 的选择器必须写 `html[data-mauth-theme='<id>']`，
   属性值来自目录名 —— 包内再写一个别的 `meta.id` 只会让选择器对不上，所以直接由目录名覆盖。
2. **跳过而不是抛错**：一个写坏的主题不该让整个认证页起不来。
   **但"跳过"就是静默失效** —— 加完主题没生效时，先查目录名是否合规、有没有漏 `export default`、`meta` 有没有写错字段名。

🔴 **配色 id 的唯一性作用域是「设备内」，不是全局**：
同包同设备下不能重名，但**跨设备可以同名**（`mono` 两端各配一份）。原因是取值时**必须同时给出设备**
（`getThemeRecord(id, device)`），歧义在入口就被设备消解 —— 注册表的键是 `包/设备/配色` 三段复合键。
写扫描器时这点很要命：以配色 id 单键登记会让后来者（web 的 `mono`）被当成重名丢掉。

所以「加一个主题包 / 加一套配色」= **加一个目录**：不改 `theme/index.ts`、不改 `mobile-auth.scss`、不改 store（步骤见第八节）。

## 三、职责红线（容器 vs 版式）

```text
view/app/<page>/index.vue                      业务容器：状态 / 校验 / 请求 / 路由 / 浮层 / 倒计时
        │  传 ctx（<Page>ViewContext）
        ▼
themes/default/mobile/<page>/index.vue         基础版式（默认，内置包静态引入）
themes/<包>/<设备>/<page>/<变体>/index.vue     变体（懒加载）
```

| 允许在**版式**里出现 | 禁止在**版式**里出现 |
| --- | --- |
| 布局、样式、静态装饰 | 任何网络请求 |
| 纯展示用局部状态（如密码明文开关、过渡方向） | 任何校验规则、`router.push`、store 读写 |
| 读 `ctx`、调 `ctx.actions.*` | "该不该拦"的业务判断 |
| 复用 `mauth-*` 类 / 自有 `<style>`（取值只许 `--mauth-*`） | 裸色值、裸像素断点 |

补充约定：

1. **基础版式不得自带 `<style>`**。它是三页共用样式 `assets/styles/mobile-auth.scss` 的消费方，
   自带样式块会让各页各自漂移 —— 历史上"两页看起来不一样"都源于此。变体不受此约束（它本来就是"另一套 UI"），
   但要遵守上面的 token 规则。
2. **浮层由容器渲染**。图形验证码、协议弹窗、消息提示都是 `fixed` 或 Teleport 到 body 的，
   渲染位置不影响呈现 —— 放在容器里可以让所有版式共享，且不会各写一遍。
3. **凭据不下发给版式**。`verifyToken` 这类只在请求里用的值留在容器，
   `ctx` 只暴露版式要展示的那两项（如 `{ email, reason }`）。
4. **单一状态值优于布尔量**。登录页用 `panel: 'consent' | 'emailVerify' | 'form'`、重置密码页用
   `stage`（6 态），而不是让每个版式各自写一遍 `v-if` 链 —— 否则"哪一步该显示什么"又散到多份里去了。

## 四、版式选择优先级

1. URL `?view=<id>` —— 本次访问的显式意图（联调 / 灰度 / 单页预览都走它）
2. 主题包声明 —— `themes/<包>/index.ts`（或配色里）的 `views: { <page>: '<id>' }`（配色与版式成对下发）
3. `VITE_<PAGE>_VIEW` —— 部署级默认（整站换 UI，不动代码）
4. `base` —— 基础版式（缺省）

⚠️ **版式跟随「主题包 × 设备」**：前三档查找都限定在**当前包 + 当前设备**的子目录内
（`themes/<包>/<设备>/<page>/`）。某个包在某端没登记这套版式时，回退的是**该端该包自己的**
基础版式，不跨包、也不跨设备借别人的版式（`themes/default/mobile/login/` 不会去 web 端取）。

⚠️ **当前设备由「页面身份」决定，不是运行时判定**：移动端容器写 `const THEME_DEVICE = 'mobile'`，
路由 `meta.device` 与之对应；设备同步在应用启动时一次性接好（见 `router/index.ts` 的 `setupThemeDeviceSync`），
**不跑视口判定** —— 视口判定只用于"访问 `/` 时该进手机端还是电脑端"这一层的分发，
一旦已经落在某个页面上，它属于哪端就是固定的。

⚠️ **第 1 档非法值不回退**：`?view=typo` 直接落 `base`，而不是被第 2/3 档接管。
显式参数写错时**静默换用另一套 UI**，比看到默认版式更难排查。

⚠️ **内置包的 `base` 不进化名表**（由容器静态引入）：
它是绝大多数访问的默认路径，让它在关键路径上多等一个网络往返不划算。其它包的 `base` 只能惰性加载
（包是运行时才定的，静态 import 钉不住），由路由守卫提前预热。

## 五、分包与首屏

- **内置包 `base` 静态引入**（`import BaseXxxView from '@/theme/themes/default/mobile/<page>/index.vue'`）→ 默认路径**零额外请求**。
  ⚠️ 静态引的路径写死在容器里，所以「设备」对基础版式来说是**写死的**，与 `THEME_DEVICE` 常量一致。
- **变体走 `import.meta.glob`** → 独立 chunk，只有真被选中才下载。
- **导航阶段预取**：路由 `beforeEnter` 调 `preload<Page>View({ url })`，**不 await**（与路由组件 chunk 并行）。
  绝大多数情况下容器挂载时已在模块缓存里，用户看不到"先 base 后变体"的切换。
- ⚠️ **新增变体目录必须重启 dev server**：`import.meta.glob` 在**启动时**静态扫描，热更新发现不了新目录。
- **用 `viewEpoch` 丢弃过期结果**：版式 A→B→A 时，A 的旧 chunk 回来不得覆盖当前状态。
- **`markRaw` 包组件**，避免组件对象被深层代理。

## 六、契约与编译期自检

`theme/views/<page>.ts` 里的类型定义是**该页版式的唯一接口**，纯类型（不含实现，`import type` 编译后擦除）。
容器侧用一个恒等函数做**编译期自检**：

```ts
/** ctx 必须结构上满足 views/login.ts 的契约：少字段、类型不符都会在这行报错 */
function assertLoginContract(ctx: LoginViewContext): LoginViewContext {
  return ctx;
}
const ctx = assertLoginContract(reactive({ /* … */ }));
```

于是改契约时**容器与所有版式一起报错**，不会悄悄跑偏 —— 契约是真的有约束力，而不是一份会过期的文档。

### 契约组装的两个坑

1. **`reactive` + 嵌套 ref 自动解包**：契约里声明的是标量（`mode`、`fields.email.value: string`），
   容器里都是 ref —— `reactive` 会解包，版式侧写 `ctx.mode`、`v-model="ctx.fields.email.value"` 即可，不必到处 `.value`。
2. **字段绑定三件套**（`bindField`）：把 vee-validate 的字段 ref 打包成 `{ value, attrs, invalid, error }`。
   - `attrs` **整个 ref 原样存**，**不要提前取 `.value`** —— 它是 `computed`，提前取会拿到过期快照。
   - `value` 用可写 computed 兜底 `undefined → ''`：vee-validate 一次都没填过时给的是 `undefined`，
     而契约承诺版式拿到的一定是字符串；写时原样回填进同一个 ref，校验/取值链路不变。

### 改契约必须毒丸验证

类型闸门本身也可能是空转（见[前端统一规范](/frontend/coding-standard)的「类型闸门必须是"真检查"」）。
**改完 `views/<page>.ts` 后临时写一行 `export const __p: number = 'x';`，跑 `npm run type-check` 必须报错且退出码非 0**，
撤销后恢复绿。恒绿的闸门等于没有闸门。

## 七、接入一个新页面（清单）

1. **容器**：`view/app/<page>/index.vue` 收拢全部业务；模板里只留两件事 ——
   `<component :is="activeView" :ctx="ctx" />` + 与版式无关的业务浮层。
2. **契约**：建 `theme/views/<page>.ts`，定义 `<Page>ViewContext` / `<Page>ViewProps` + 各子结构，
   再在同文件里建注册表（`createViewRegistry` + `ENV_VIEW` + `pick<Page>ViewId` + `preload<Page>View`）。
   能从既有实现复用的联合类型，用 `import type` 直接引（如 `LoginSocialProviderId = SocialProviderId`），**不要重写一份**。
3. **基础版式**：建 `themes/default/mobile/<page>/index.vue`（电脑端则是 `web/`），把容器原来的模板**忠实搬运**过去（不改外观），
   加 `data-mauth-view="base"`，**不写 `<style>`**。
4. **容器改造**：静态引入 `Base<Page>View`、`ctx = assert<Page>Contract(reactive({...}))`、
   `activeView` 按 `pick<Page>ViewId` 惰性加载、`viewEpoch` 防过期。
5. **路由预取**：在 `router/routes.ts` 给该页的 `beforeEnter` 接上 `preload<Page>View`。
   若该页有"宽屏跳电脑版"逻辑，预取要放在**跳转判定之后**（否则会为一次不发生的渲染白拉 chunk）。
6. **重启 dev server**，访问 `?view=<id>` 看效果。
7. **补验收关卡**（见第十节），并跑一遍既有基线。

## 八、加一套配色 / 加一套版式

### 加一套配色（在已有主题包的某个设备下）

1. 建目录 `src/theme/themes/<包>/<设备>/colors/<配色>/`（`<配色>` 只允许 `[a-z0-9-]`；`<设备>` 是 `mobile` / `web`）。
2. 写 `index.ts`，默认导出 `MauthThemeColor`：`meta` + `tokens: { light, dark }`。
3. （可选）`theme.scss` 放背景图 / `@font-face` / 伪元素装饰 / 媒体查询。
4. **重启 dev server**。

⚠️ **配色 `meta.id` 与目录名必须字面一致**（以目录名为准，但不对齐会让维护者困惑），
且**同包同设备内不得重名**。跨设备同名是允许的（两端各配各的 `mono`）。

⚠️ **颜色类 token 必须成对给 `light` 与 `dark`**：`light` 在深色下**也生效**（打底），
`dark` 只是追加覆盖 —— 只写 `light` 的品牌主色会在深色下沿用，深底上发闷。
不分明暗的（圆角、间距、字体族名）只写 `light` 即可。

⚠️ 把 `--mauth-header-bg` / `--mauth-body-bg` 设为 `transparent` 时，**必须同时声明画布 token**
（见[跨内核渲染基线](/frontend/browser-baseline)的「表面透明必须同时声明画布色」）。

### 加一套版式（在某个主题包的某个设备下）

1. 建目录 `themes/<包>/<设备>/<page>/<变体>/`（基础版式则是直接改 `<page>/index.vue`）。
2. 写 `index.vue`：`const props = defineProps<XxxViewProps>()`，照着 `ctx` 渲染，只调 `ctx.actions.*`。
3. 需要自有结构样式就写 `<style lang="scss" scoped>`，**取值一律用 `--mauth-*`**；
   能复用的（字段、按钮、摘要、协议、页脚）直接复用 `mauth-*` 类。
4. **重启 dev server**，访问 `?view=<id>`。

参考实现照抄 `themes/default/mobile/register/compact/`。

## 九、安全边界

**版式 id、配色 id、token 取值都是外部输入**（URL 参数、后端下发都可能被改动），必须过白名单。

| 输入 | 校验位置 | 口径 |
| --- | --- | --- |
| 版式 id | `theme/views/registry.ts` 的 `resolve()` | 只认 `^[a-z0-9-]+$` 且**当前包内已登记**；未登记返回 `null`，**不拼路径、不做模糊匹配** |
| 配色 id | `theme/index.ts` 注册表 | 同上；未登记回退**该设备的兜底配色**（`defaultColorIdOf(device)`） |
| token 名 / 取值 | `src/theme/runtime.ts` | token 名必须 `--mauth-` 前缀；取值只接受 `#hex` / `rgb()` / `hsl()` / 长度 / `var(--mauth-*)` / 少量关键字 |

🔴 **`runtime.ts` 刻意拒 `url()` 与 CSS 颜色名**：

- `url(https://evil/x)` 是**外发请求的唯一入口**，可被用来做探测 / 追踪；所以背景图、webfont 一律走 `theme.scss`。
- CSS 颜色名有上百个、维护白名单容易漏；放宽成"任意字母"等于把 CSS 注入的口子交出去。

同类边界：登录页的**第三方授权端点只放行站内相对路径**（`/` 开头且非 `//` —— `//evil.com` 是协议相对地址，
浏览器会当外域绝对地址用）；未配端点**不静默**，明确提示。

## 十、验收

改这一层后，至少证明三件事：**门没坏（业务没被换 UI 弄坏）、取值没漏（token 生效）、像素没动（外观零回归）**。

1. **业务关卡**：`.tmp-probe/verify-<page>-view.mjs`（Playwright）。断言面至少覆盖：
   版式选择（含**非法 id 落 base**）、业务完整性（未勾协议不发请求 / 加密信封 / 拦截图形的分支）、
   各面板可达、浮层与分发路径、静态分层体检。
2. **目录口径关卡**：`.tmp-probe/verify-theme-dirs.mjs`（**132 项**静态断言，纯文件系统、**不需要浏览器**）。
   守的就是本节「主题包 = 一个目录」那张表：**三级结构**（包 / 设备 / 配色）、目录名合法性、必备文件、
   `theme.scss` 选择器必须用目录名、配色目录叫 `colors/`、版式按设备分区、版式去 `base/` 层、
   契约收在 `theme/views/` 下、**配色 id 唯一性按「设备内」判**（复合键 `包/设备/配色`）、
   目录名与 `meta.id` 字面一致（6b 节，按目录名判而非 `meta.id`，防"不同目录写同一个 id"逃检），
   外加**实现 ↔ 文档口径一致性**（glob 仍只扫三层、仍由目录名覆盖 `meta.id`、
   `setupThemeDeviceSync` 用 `watch(router.currentRoute)` 且接在 `app.use(pinia)` 之后）。
   改主题目录结构或 `theme/index.ts` 的扫描逻辑后跑它。
3. **glob 编译产物关卡**：`.tmp-probe/verify-glob-device.mjs`（**15 项**）。
   用 Vite `createServer` + `transformRequest(..., { ssr: true })` 读回 `import.meta.glob` 的**编译产物**，
   断言配色三段/样式设备段/三页 mobile·web base 各 1 条都真的被扫到（比"目录存在"更接近真源）。
4. **门禁**：`npm run type-check`（= `vue-tsc -b`）必须绿，且按第六节做**毒丸验证**。
5. **视觉回归**：遵循[视觉回归归因三铁律](/frontend/coding-standard) ——
   ① 先稳定化（冻结过渡/动画 + 等 `fonts.ready`，冻结样式须在**加载后**注入并**断言生效**）；
   ② 比对前先确认基准与结果**来自不同状态**（否则同一份代码自比恒等，"重构前后一致"这类结论不成立）；
   ③ 报**逐场景归因表**，不报一个总百分比。
   ⚠️ 连拍两次不一致的项是非确定性的（如 3s 自动关闭的提示条），**不能作断言目标**。
6. **调试面板**：`?debug=theme` 会自动列出版式
   （`/m/login → 版式·login [base]`、`/m/forgot-password → 版式·forgot-password [base]`、`/m/register → [base, compact]`）——
   这是 `theme/views/pages.ts` 汇总出来的，**新增页面不用回来改**。
   面板带**设备切换**（跟随路由 / 手机端 / 电脑端）：电脑端当前只列出 `mono` 一套配色。

### 关卡必须自己"会红"（毒丸验证）

静态关卡靠"读文件 + 断言文本"过活，**很容易写成恒绿的摆设**。改完关卡后必须做一次毒丸：

- 造一个 **`colors/mobile/mono-base/`**（目录名合法但未登记）→ 若关卡不报错，说明它没真在核对；
- 把注册表退回**以配色 id 单键**登记（还原旧实现）→ web 的 `mono` 与 mobile 的 `mono` 撞键，关卡必须报错；
- 把 `setupThemeDeviceSync` 改回 `router.afterEach` → 关卡必须报错。

毒丸变绿就说明关卡没真在检查。这三条正是 2026-09-24 那轮**真实踩到并修掉**的坑。

## 十一、常见坑

| 坑 | 症状 | 处置 |
| --- | --- | --- |
| 加了配色/主题目录但"没生效" | 主题不出现，**且没有任何报错** | 注册表对坏目录是**静默跳过**：逐一核 ① 目录名是否 `[a-z0-9-]` ② 设备段是否 `mobile`/`web` ③ 有没有 `index.ts` ④ 有没有 `export default` ⑤ 包里有没有 `meta` |
| **配色 id 用单键登记（漏了设备段）** | 后扫描到的一端（如 web 的 `mono`）被当成重名**静默丢弃** | 注册表键必须是 `包/设备/配色` 三段复合键；取值用 `getThemeRecord(id, device)`。加完新设备若发现"少了一套配色"，先看控制台有没有重名告警 |
| 设备同步写在 `router.afterEach` 里 | 电脑端页面被当成手机端，列出手机端配色 | `afterEach` 首次触发时 Pinia `activeInstance` 尚未建立，`useThemeStore()` 抛错**被 try/catch 吞掉** → 设备永远停在默认值。改用 `watch(router.currentRoute, { immediate: true })`，并在 `main.ts` 的 `app.use(pinia)` **之后**调 `setupThemeDeviceSync(router)` |
| 往 `themes/` 下塞回一个 `views/` 目录 | 契约被主题扫描器当配色扫到 | 契约与注册表在 `theme/views/`（与 themes 平级），别塞回 `themes/` 里 |
| `meta.id` 与目录名不一致 | 主题能选中但 `theme.scss` 完全不生效 | 以**目录名**为准（会被覆盖）；把 `theme.scss` 的选择器改成目录名 |
| 新增变体目录后没重启 dev server | `?view=<新id>` 落回 base，注册表 `list()` 里没有它 | 重启（`import.meta.glob` 启动时静态扫描）。**目录迁移后还要 `--force`** 清 optimize-deps 缓存，否则报 504 Outdated Optimize Dep |
| 基础版式自带 `<style>` | 三页外观各自漂移 | 抽到 `mobile-auth.scss`，版式只消费 `mauth-*` |
| token 里覆写断点会变的项 | 矮屏 / 横屏适配整体失效 | `tokens` 是 `html` 上的 inline style，**优先级高于媒体查询** → 绝不在 token 里写 `--mauth-pad-*` / `gap-*` / `logo-size` / `title-size` / `field-h` / `control-h` / `err-h` / `social-*`，这些交给 `theme.scss` 的媒体查询 |
| `assets/` 的 SVG 只给 `viewBox` | 背景图撑满容器 | **必须带 `width`/`height`**（`background-size: …auto` 推不出高度） |
| 版式里提前取 `attrs.value` | 字段属性过期、校验态不同步 | 存整个 ref |
| 视口 / UA 判定不对就调试移动端页 | "电脑上看不到、手机上能看到" | 判定顺序是**宽视口(≥1024) ＞ 窄视口(<768) ＞ UA**，且**只在导航时执行** → 先造窄视口并**刷新**；UA 伪装压不过宽视口 |
| 注释里写出"星号紧跟斜杠"的两个字符 | 块注释提前闭合，后续正文被当代码解析 | 描述 glob 模式时改用文字表述（已踩过两次） |

## 本仓现状

### 手机端

| 页面 | 容器 | 版式目录 | 已登记版式 | 预取 |
| --- | --- | --- | --- | --- |
| 注册 | `view/app/register/index.vue` | `themes/default/mobile/register/` | `base`、`compact` | ✅ |
| 登录 | `view/app/login/index.vue` | `themes/default/mobile/login/` | `base` | ✅ |
| 重置密码 | `view/app/forgot-password/index.vue` | `themes/default/mobile/forgot-password/` | `base` | ✅ |

手机端配色：`mono`（黑白基线，**零 token**，写 `data-mauth-theme="mono"`）、
`ocean`（只改取值）、`sky`（改取值 + 改结构 + 横屏断点）。

### 电脑端（2026-09-24 骨架）

| 页面 | 版式目录 | 状态 |
| --- | --- | --- |
| 登录 / 注册 / 重置密码 | `themes/default/web/<page>/index.vue` | **最小占位**（只渲染一行提示 + 契约 props） |

电脑端配色：**仅 `mono` 一套**（黑白基线，零 token，骨架）。
其余配色留给后续 —— 口径是「手机端用 `ocean` / `sky`，电脑端若要自己的品牌色则叫 `web-ocean` / `web-sky`」
（跨设备同名虽被允许，但两端要**不同**色时仍须不同名）。

⚠️ 电脑端的**核心组件（`StandardLogin.vue` / `StandardRegister.vue` 等）目前仍是业务与 UI 揉在一起
的单体**，尚未拆成「容器 + 版式」，所以 `web/` 下的版式与配色**当前没有消费方**（不会影响像素）。
容器重构落地后替换为真版式，机制侧无需改动。详见 `oauth21/src/theme/README.md`。

> 相关：[主题系统](/frontend/theme)（各前端通用的 HSL 变量 / Store 约定）、
> [前端统一规范](/frontend/coding-standard)、[跨内核渲染基线](/frontend/browser-baseline)。
