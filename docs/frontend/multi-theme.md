# 多主题 / 多版式开发模式 {#multi-theme}

> **强制规则。** 本仓库认证前端 `oauth21` 的移动端页面（登录 / 注册 / 重置密码）必须按本文组织「可换的呈现」。
> 新增页面照第二节的清单接入，不要另起一套。
>
> 机制实现：`oauth21/src/themes/app/registry.ts`（版式）、`oauth21/src/themes/index.ts`（皮肤）。
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
| ② 皮肤 | `src/themes/<id>/` | 颜色 / 圆角 / 描边 / 背景图 / 字体，**同一套 DOM** | `?theme=`（别名 `?skin=`）→ 后端下发 → localStorage → `default` |
| ③ 版式 | `src/themes/app/<page>/<id>/` | **DOM 结构与交互组织**，**同一套业务** | `?view=` → 主题包 `views.<page>` → `VITE_<PAGE>_VIEW` → `base` |

三者**正交**，可任意组合：`?theme=ocean&view=compact` = 海蓝配色 + 轻版式。

### 想改 X 该去哪儿

| 想改的东西 | 动哪一层 | 参考 |
| --- | --- | --- |
| 品牌色 / 圆角 / 描边宽 / 字体栈 | ② 皮肤 `tokens` | `themes/ocean/` |
| 背景图 / webfont / 伪元素装饰 | ② 皮肤 `theme.scss` | `themes/ocean/` |
| 表面分层（让 header / body 透明，底色交还页面） | ② 皮肤 `tokens` + 画布 token | `themes/sky/` |
| 按屏幕形态给不同值（横屏 / 矮屏） | ② 皮肤 `theme.scss` 的媒体查询 | `themes/sky/` |
| **DOM 顺序、分步流程、面板组织** | ③ 版式 | `themes/app/register/compact/` |
| 校验规则、请求、跳转、拦截条件 | **容器**（不是主题也不是版式） | `view/app/register/index.vue` |
| 三页共用的字段 / 按钮 / 页脚外观 | ① 基线 `mobile-auth.scss` 的 `mauth-*` 类 | 该文件第 1、2 层 token |

**判断线**：换颜色 → ②；换 DOM 或流程组织 → ③；**两者都不该动业务**。一旦发现"要改业务才能换 UI"，说明分层破了。

## 二、目录约定

```text
src/
├── assets/styles/mobile-auth.scss        # ① 基线：mauth-* 类 + 三层 token，唯一取值出口
├── view/app/<page>/index.vue             # 业务容器（**只有一份**）
└── themes/
    ├── index.ts / types.ts               # 皮肤注册表 + 主题包契约
    ├── <id>/                             # ② 皮肤（ocean / sky / …）
    │   ├── index.ts                      #   默认导出 MauthThemePackage（token 取值）
    │   └── theme.scss                    #   可选：背景图 / webfont / 媒体查询
    └── app/                              # ③ 版式
        ├── registry.ts                   #   注册表工厂（机制，一般不用动）
        ├── pages.ts                      #   汇总各页注册表（供调试面板查询，新增页面不用改）
        └── <page>/                       #   <page> = 版式目录名 = 路由 path 末段
            ├── types.ts                  #   该页契约（**纯类型，唯一接口**）
            ├── registry.ts               #   本页注册表 + 选择优先级
            ├── base/index.vue            #   基础版式：容器**静态引入**
            └── <variant>/index.vue       #   变体：`import.meta.glob` **惰性**加载
```

- `<page>` 与 `<id>` 都只允许 `[a-z0-9-]`（`<id>` 会成为 `data-mauth-view` 的属性值）。
- 各页的 `registry.ts` 彼此独立、互不感知；**加页面不必改公共工厂**。

### 主题包 = 一个目录，目录名即 id

`themes/` 下**只按主题包分文件夹**，不再多套一层（`./*/index.ts` 只扫一层）：

| 目录 | 是什么 | id 从哪来 |
| --- | --- | --- |
| `themes/<id>/` | ② 皮肤包（本仓 `default` / `ocean` / `sky`） | **目录名就是 id** |
| `themes/app/` | ③ 版式维度的**保留目录名** | 不是主题，**不得用作主题 id** |

🔴 **不要往 `themes/app/` 下加 `index.ts`**：主题注册表扫的就是「一层子目录 + `index.ts`」，
`themes/app/index.ts` 会被它扫到。现在之所以没事，是因为该目录**刻意没有** `index.ts`
（版式侧的汇总文件叫 `pages.ts`）—— 这是个**隐式条件**，一旦有人给它加一句 `export default`，
就会凭空冒出一个 id 为 `app` 的假主题。同理：不要建名为 `app` 的主题目录。

口径以 `themes/index.ts` 的 `buildRegistry()` 为准（实现即真源）：

| 情形 | 结果 |
| --- | --- |
| 目录名不合 `^[a-z0-9-]+$` | **跳过**，不注册 |
| 缺 `index.ts` / 没有 `default` 导出 / 包内没有 `meta` | **跳过**，不注册 |
| 包内 `meta.id` 与目录名不一致 | **以目录名为准**（`meta: { ...pkg.meta, id }`） |
| 只有 `theme.scss`、没有 `index.ts` | 视为残缺，**该目录的样式被忽略** |

两点意图：

1. **目录名是唯一真源**：`theme.scss` 的选择器必须写 `html[data-mauth-theme='<id>']`，
   属性值来自目录名 —— 包内再写一个别的 `meta.id` 只会让选择器对不上，所以直接由目录名覆盖。
2. **跳过而不是抛错**：一个写坏的主题不该让整个认证页起不来。
   **但"跳过"就是静默失效** —— 加完主题没生效时，先查目录名是否合规、有没有漏 `export default`、`meta` 有没有写错字段名。

所以「加一个主题」= **加一个目录**：不改 `themes/index.ts`、不改 `mobile-auth.scss`、不改 store（步骤见第八节）。

## 三、职责红线（容器 vs 版式）

```text
view/app/<page>/index.vue                 业务容器：状态 / 校验 / 请求 / 路由 / 浮层 / 倒计时
        │  传 ctx（<Page>ViewContext）
        ▼
themes/app/<page>/base/index.vue          基础版式（默认）
themes/app/<page>/<variant>/index.vue     变体（懒加载）
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
2. 主题包声明 —— `themes/<id>/index.ts` 的 `views: { <page>: '<id>' }`（皮肤与版式成对下发）
3. `VITE_<PAGE>_VIEW` —— 部署级默认（整站换 UI，不动代码）
4. `base` —— 基础版式（缺省）

⚠️ **第 1 档非法值不回退**：`?view=typo` 直接落 `base`，而不是被第 2/3 档接管。
显式参数写错时**静默换用另一套 UI**，比看到默认版式更难排查。

⚠️ **`base` 不进化名表**（`import.meta.glob` 里显式排除）：
它是绝大多数访问的默认路径，由容器静态引入，让它在关键路径上多等一个网络往返不划算。

## 五、分包与首屏

- **`base` 静态引入**（`import BaseXxxView from '@/themes/app/<page>/base/index.vue'`）→ 默认路径**零额外请求**。
- **变体走 `import.meta.glob`** → 独立 chunk，只有真被选中才下载。
- **导航阶段预取**：路由 `beforeEnter` 调 `preload<Page>View({ url })`，**不 await**（与路由组件 chunk 并行）。
  绝大多数情况下容器挂载时已在模块缓存里，用户看不到"先 base 后变体"的切换。
- ⚠️ **新增变体目录必须重启 dev server**：`import.meta.glob` 在**启动时**静态扫描，热更新发现不了新目录。
- **用 `viewEpoch` 丢弃过期结果**：版式 A→B→A 时，A 的旧 chunk 回来不得覆盖当前状态。
- **`markRaw` 包组件**，避免组件对象被深层代理。

## 六、契约与编译期自检

`themes/app/<page>/types.ts` 是**该页版式的唯一接口**，纯类型（不含实现，`import type` 编译后擦除）。
容器侧用一个恒等函数做**编译期自检**：

```ts
/** ctx 必须结构上满足 types.ts 的契约：少字段、类型不符都会在这行报错 */
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
**改完 `types.ts` 后临时写一行 `export const __p: number = 'x';`，跑 `npm run type-check` 必须报错且退出码非 0**，
撤销后恢复绿。恒绿的闸门等于没有闸门。

## 七、接入一个新页面（清单）

1. **容器**：`view/app/<page>/index.vue` 收拢全部业务；模板里只留两件事 ——
   `<component :is="activeView" :ctx="ctx" />` + 与版式无关的业务浮层。
2. **契约**：建 `themes/app/<page>/types.ts`，定义 `<Page>ViewContext` / `<Page>ViewProps` + 各子结构。
   能从既有实现复用的联合类型，用 `import type` 直接引（如 `LoginSocialProviderId = SocialProviderId`），**不要重写一份**。
3. **注册表**：建 `themes/app/<page>/registry.ts`，照抄任一同名文件 ——
   `createViewRegistry(import.meta.glob(['./*/index.vue', '!./base/index.vue']))` + `ENV_VIEW` +
   `pick<Page>ViewId({ url, theme })` + `preload<Page>View()`。
   ⚠️ 目录名含连字符时，`views` 的键名必须与目录名**逐字一致**（`views['forgot-password']`）。
4. **基础版式**：建 `base/index.vue`，把容器原来的模板**忠实搬运**过去（不改外观），加 `data-mauth-view="base"`，**不写 `<style>`**。
5. **容器改造**：静态引入 `Base<Page>View`、`ctx = assert<Page>Contract(reactive({...}))`、
   `activeView` 按 `pick<Page>ViewId` 惰性加载、`viewEpoch` 防过期。
6. **路由预取**：在 `router/routes.ts` 给该页的 `beforeEnter` 接上 `preload<Page>View`。
   若该页有"宽屏跳电脑版"逻辑，预取要放在**跳转判定之后**（否则会为一次不发生的渲染白拉 chunk）。
7. **重启 dev server**，访问 `?view=<id>` 看效果。
8. **补验收关卡**（见第九节），并跑一遍既有基线。

## 八、加一套皮肤 / 加一套版式

### 加一套皮肤

1. 建目录 `src/themes/<id>/`（`<id>` 只允许 `[a-z0-9-]`）。
2. 写 `index.ts`，默认导出 `MauthThemePackage`：`meta` + `tokens: { light, dark }`。
3. （可选）`theme.scss` 放背景图 / `@font-face` / 伪元素装饰 / 媒体查询。
4. **重启 dev server**。

⚠️ **颜色类 token 必须成对给 `light` 与 `dark`**：`light` 在深色下**也生效**（打底），
`dark` 只是追加覆盖 —— 只写 `light` 的品牌主色会在深色下沿用，深底上发闷。
不分明暗的（圆角、间距、字体族名）只写 `light` 即可。

⚠️ 把 `--mauth-header-bg` / `--mauth-body-bg` 设为 `transparent` 时，**必须同时声明画布 token**
（见[跨内核渲染基线](/frontend/browser-baseline)的「表面透明必须同时声明画布色」）。

### 加一套版式

1. 建目录 `themes/app/<page>/<id>/`。
2. 写 `index.vue`：`const props = defineProps<XxxViewProps>()`，照着 `ctx` 渲染，只调 `ctx.actions.*`。
3. 需要自有结构样式就写 `<style lang="scss" scoped>`，**取值一律用 `--mauth-*`**；
   能复用的（字段、按钮、摘要、协议、页脚）直接复用 `mauth-*` 类。
4. **重启 dev server**，访问 `?view=<id>`。

参考实现照抄 `themes/app/register/compact/`。

## 九、安全边界

**版式 id、皮肤 id、token 取值都是外部输入**（URL 参数、后端下发都可能被改动），必须过白名单。

| 输入 | 校验位置 | 口径 |
| --- | --- | --- |
| 版式 id | `themes/app/registry.ts` 的 `resolve()` | 只认 `^[a-z0-9-]+$` 且**已登记**；未登记返回 `null`，**不拼路径、不做模糊匹配** |
| 皮肤 id | `themes/index.ts` 注册表 | 同上；未登记回退 `default` |
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
2. **目录口径关卡**：`.tmp-probe/verify-theme-dirs.mjs`（22 项静态断言，纯文件系统、**不需要浏览器**）。
   守的就是本节「主题包 = 一个目录」那张表：目录名合法性、必备文件、`theme.scss` 选择器必须用目录名、
   `themes/app/` 保留名不被占用，外加**实现 ↔ 文档口径一致性**（glob 仍只扫一层、仍由目录名覆盖 `meta.id`）。
   改主题目录结构或 `themes/index.ts` 的扫描逻辑后跑它。
3. **门禁**：`npm run type-check`（= `vue-tsc -b`）必须绿，且按第六节做**毒丸验证**。
4. **视觉回归**：遵循[视觉回归归因三铁律](/frontend/coding-standard) ——
   ① 先稳定化（冻结过渡/动画 + 等 `fonts.ready`，冻结样式须在**加载后**注入并**断言生效**）；
   ② 比对前先确认基准与结果**来自不同状态**（否则同一份代码自比恒等，"重构前后一致"这类结论不成立）；
   ③ 报**逐场景归因表**，不报一个总百分比。
   ⚠️ 连拍两次不一致的项是非确定性的（如 3s 自动关闭的提示条），**不能作断言目标**。
5. **调试面板**：`?debug=theme` 会自动列出版式
   （`/m/login → 版式·login [base]`、`/m/forgot-password → 版式·forgot-password [base]`、`/m/register → [base, compact]`）——
   这是 `themes/app/pages.ts` 汇总出来的，**新增页面不用回来改**。

## 十一、常见坑

| 坑 | 症状 | 处置 |
| --- | --- | --- |
| 加了主题目录但"没生效" | 主题不出现，**且没有任何报错** | 注册表对坏目录是**静默跳过**：逐一核 ① 目录名是否 `[a-z0-9-]` ② 有没有 `index.ts` ③ 有没有 `export default` ④ 包里有没有 `meta` |
| 往 `themes/app/` 里加了 `index.ts` | 凭空多出一个 id 为 `app` 的"主题"，`?theme=app` 居然能用 | 删掉它；版式侧的汇总文件叫 `pages.ts` 就是为了避开主题扫描器 |
| `meta.id` 与目录名不一致 | 主题能选中但 `theme.scss` 完全不生效 | 以**目录名**为准（会被覆盖）；把 `theme.scss` 的选择器改成目录名 |
| 新增变体目录后没重启 dev server | `?view=<新id>` 落回 base，注册表 `list()` 里没有它 | 重启（`import.meta.glob` 启动时静态扫描） |
| 基础版式自带 `<style>` | 三页外观各自漂移 | 抽到 `mobile-auth.scss`，版式只消费 `mauth-*` |
| token 里覆写断点会变的项 | 矮屏 / 横屏适配整体失效 | `tokens` 是 `html` 上的 inline style，**优先级高于媒体查询** → 绝不在 token 里写 `--mauth-pad-*` / `gap-*` / `logo-size` / `title-size` / `field-h` / `control-h` / `err-h` / `social-*`，这些交给 `theme.scss` 的媒体查询 |
| `assets/` 的 SVG 只给 `viewBox` | 背景图撑满容器 | **必须带 `width`/`height`**（`background-size: …auto` 推不出高度） |
| 版式里提前取 `attrs.value` | 字段属性过期、校验态不同步 | 存整个 ref |
| 视口 / UA 判定不对就调试移动端页 | "电脑上看不到、手机上能看到" | 判定顺序是**宽视口(≥1024) ＞ 窄视口(<768) ＞ UA**，且**只在导航时执行** → 先造窄视口并**刷新**；UA 伪装压不过宽视口 |
| 注释里写出"星号紧跟斜杠"的两个字符 | 块注释提前闭合，后续正文被当代码解析 | 描述 glob 模式时改用文字表述（已踩过两次） |

## 本仓现状

| 页面 | 容器 | 版式目录 | 已登记版式 | 预取 |
| --- | --- | --- | --- | --- |
| 注册 | `view/app/register/index.vue` | `themes/app/register/` | `base`、`compact` | ✅ |
| 登录 | `view/app/login/index.vue` | `themes/app/login/` | `base` | ✅ |
| 重置密码 | `view/app/forgot-password/index.vue` | `themes/app/forgot-password/` | `base` | ✅ |

皮肤：`default`（基线配色）、`ocean`（只改取值）、`sky`（改取值 + 改结构 + 横屏断点）。

> 相关：[主题系统](/frontend/theme)（各前端通用的 HSL 变量 / Store 约定）、
> [前端统一规范](/frontend/coding-standard)、[跨内核渲染基线](/frontend/browser-baseline)。
