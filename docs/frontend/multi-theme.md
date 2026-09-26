# 多主题 / 多版式开发模式 {#multi-theme}

> **强制规则。** 本仓库认证前端 `oauth21` 的认证页面（登录 / 注册 / 重置密码）必须按本文组织「可换的呈现」。
> 新增页面照第七节的清单接入，不要另起一套。
>
> 机制实现：`oauth21/src/theme/index.ts`（主题包 + 设备 + 页面 + 配色注册表）、
> `oauth21/src/theme/views/registry.ts`（版式注册表工厂）、
> `oauth21/src/theme/views/params.ts`（设备维度 URL 参数的唯一读取入口）。
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
| ② 版式 | `src/theme/themes/<包>/<设备>/<页面>/index.vue` | **DOM 结构与交互组织**，**同一套业务** | `?view.<设备>=` → `?view=` → 主题包 `views.<页面>` → `VITE_<PAGE>_VIEW` → 当前包自带版式 |
| ③ 配色 | `src/theme/themes/<包>/<设备>/<页面>/colors/<配色>/` | 颜色 / 圆角 / 描边 / 背景图 / 字体，**同一套 DOM** | `?theme.<设备>=`（`?skin.<设备>=`）→ `?theme=`（`?skin=`）→ 后端下发 → localStorage → **该范围的兜底配色** |

「**设备**」不是一个独立的换装维度，而是**页面身份**：手机端页面与电脑端页面各住各的子树，
各自有配色与版式（`<设备>` 段取 `mobile` / `standard` / `mini`，白名单）。
同一份设计语言（同一个包）下，三端可以给出不同的配色与版式，也可以给出同名的配色
（如 `black` 三端各一份，这是正常的）。详见 `oauth21/src/theme/README.md` 的「四级结构」。

🔴 **一个主题包 = 一种版式**（2026-09-26 定案，用户：「变体版式使用新包」）：

```
themes/<包>/<设备>/<页面>/index.vue        ← 该包该设备该页的**唯一**版式
themes/<包>/<设备>/<页面>/colors/<配色>/    ← 该页的配色
```

`<页面>/` 下**只有** `index.vue` 与 `colors/`，**没有「版式」这一层目录**。
换一套版式 = **新建一个主题包**（如 `compact`），所以版式的"名字"就是**包名**
（`?view=compact` 即"切到 compact 包"）。注册表里每条配色记录的 `view` 段**恒等于包名** ——
它不是从目录读出来的第四段，而是由包名派生。

> 旧形态 `<页面>/<版式>/colors/<配色>/`（2026-09-24 ~ 09-26 支持过）已**删除**：
> 它要求换版式时复制整套配色与目录层级，两套配色必然漂移。
> 结构关卡 `.tmp-probe/verify-theme-dirs.mjs` 第 4b/7 节现在断言"不存在版式层目录"。

三者**正交**，可任意组合：`?theme=cyan&view=compact` = 青配色 + 轻版式。

### 设备维度参数：三端各配各的（2026-09-26 新增）

同一个色 id 在三端可能指不同的东西（手机端要 `blue`、电脑端要 `black`），
所以 ② ③ 两个维度都支持**按设备取值**：

| 想要的场景 | 写法 |
| --- | --- |
| **三端共用**同一个配色 + 同一个版式（某端没有就自动下沉） | `/login?theme=blue&view=compact` |
| 每端**各自的配色** 与 **各自的版式** | `/login?theme.mobile=blue&theme.standard=black&view.mobile=default&view.standard=compact` |
| 每端**各自的配色**，版式**共用**一个 | `/login?theme.mobile=blue&theme.standard=black&view=default` |

`mini` 与 `mobile` / `standard` 完全同权：`?theme.mini=…` / `?view.mini=…` 随时可加。

- **取值链**：`?<名>.<设备>` 优先，缺省回退通用 `?<名>`（空串视为"没给"）。
  实现只有一处：`views/params.ts` 的 `readDeviceParam()`（版式）与
  `stores/theme.ts` 的 `readUrlIntent()`（配色）。
- **不写 localStorage**：设备维度参数是"这次访问的意图"，不是"用户的选择"。
- 🔴 **显式操作 > URL**：用户手动点色卡 / 切明暗（`setTheme` / `cycleMode` / `toggleTheme`）
  会清掉**该设备**的 URL 覆盖；`setMode`（后端与父应用 `postMessage` 走它）**不清** ——
  它是外部信号，必须待在 URL 之下。
- **"没有就自动下沉"**：某端没有 `compact` 包或没有 `blue` 时，按上面的链路逐级回落到该端
  **已有**的那一套（跨设备回落时**先取同 `tone` 系别**的首套，避免"点了深色却跳成浅色"），
  不报错、不白屏。

### 想改 X 该去哪儿

| 想改的东西 | 动哪一层 | 参考 |
| --- | --- | --- |
| 品牌色 / 圆角 / 描边宽 / 字体栈 | ③ 配色 `tokens` | `themes/default/mobile/login/colors/blue/` |
| 背景图 / webfont / 伪元素装饰 | ③ 配色 `theme.scss` | `themes/default/mobile/login/colors/blue/` |
| 表面分层（让 header / body 透明，底色交还页面） | ③ 配色 `tokens` + 画布 token | `themes/default/mobile/login/colors/cyan/` |
| 按屏幕形态给不同值（横屏 / 矮屏） | ③ 配色 `theme.scss` 的媒体查询 | `themes/default/mobile/login/colors/cyan/` |
| **DOM 顺序、分步流程、面板组织** | ② 版式（按设备分区） | `themes/compact/mobile/register/index.vue` |
| 校验规则、请求、跳转、拦截条件 | **容器**（不是主题也不是版式） | `view/app/register/index.vue` |
| 三页共用的字段 / 按钮 / 页脚外观 | ① 基线 `mobile-auth.scss` 的 `mauth-*` 类 | 该文件第 1、2 层 token |

**判断线**：换颜色 → ③；换 DOM 或流程组织 → ②（**＝新建一个包**）；**两者都不该动业务**。
一旦发现"要改业务才能换 UI"，说明分层破了。

## 二、目录约定

```text
src/theme/
├── index.ts / types.ts              # 主题包 + 设备 + 页面 + 配色注册表 / 契约
├── mode.ts / remote.ts / runtime.ts # 明暗三态 / 后端下发 / token 白名单校验 / 配色系别
├── tone.ts                          # 配色的系别（light | dark）
├── views/registry.ts                # 版式注册表工厂（机制，一般不用动）
├── views/params.ts                  # 设备维度 URL 参数的唯一读取入口
├── views/<page>.ts                  # 某页的契约 + 注册表（每页一份，如 login.ts）
├── views/pages.ts                   # 汇总各页注册表（供调试面板查询，新增页面不用改）
└── themes/                          # 主题包：一套完整设计 = 各设备各自的版式 + 配色
    └── <包>/                        #   主题包，目录名即 id（**版式的名字就是它**）
        ├── index.ts                 #   包定义（meta / 可选 views；**不含 tokens**）
        ├── <设备>/                  #   mobile | standard | mini（白名单），设备由「页面身份」决定
        │   └── <页面>/
        │       ├── index.vue                    # 该包该设备该页的**唯一**版式
        │       └── colors/<配色>/                # 该页的配色（每页各一套）
        └── <另一设备>/              #   同上，各端各一套
```

- `<包>`、`<设备>`、`<页面>`、`<配色>` 都只允许 `[a-z0-9-]`。
  其中 `<设备>` 另受白名单限制，只认 `mobile` / `standard` / `mini`。
- 各页的 `views/<page>.ts` 彼此独立、互不感知；**加页面不必改公共工厂**。
- ⚠️ 描述 glob 模式时别写出「星号紧跟斜杠」的字符组合：它会**提前闭合块注释**
  （已踩过两次，见第十三节最后一行的坑）。

### 主题包 = 一个目录，目录名即 id

`themes/` 下**只按主题包分文件夹**，包内再按**设备**分一层（`./*/index.ts` 只扫一层包）：

| 目录 | 是什么 | id 从哪来 |
| --- | --- | --- |
| `themes/<包>/` | 主题包（本仓 `default` / `compact`） | **目录名就是 id**，也是该包版式的 id |
| `themes/<包>/<设备>/` | 该包在某设备上的呈现（`mobile` / `standard` / `mini`） | 目录名，且必须是这三个值之一 |
| `themes/<包>/<设备>/<页面>/` | 该页在该端的**唯一版式**（`index.vue`）+ 它的配色目录 | 目录名 |
| `themes/<包>/<设备>/<页面>/colors/<配色>/` | 该页的**配色**（`black` / `white` / `blue` / `cyan` / …） | **目录名就是 id** |

🔴 **不要往 `themes/` 下放任何不是主题包的目录**：主题注册表扫的就是「一层子目录 + `index.ts`」。
历史上版式契约塞在 `themes/app/` 里，只能靠「刻意不放 `index.ts`」躲过扫描器 —— 那是个**隐式条件**。
2026-09-24 的重构把契约与注册表收进 `theme/views/` 目录，这个隐式条件才从结构上消失。
**别为了整齐把它们再收进一个 `views/` 目录塞回 `themes/` 里** —— 那等于把坑重新挖开。

口径以 `theme/index.ts` 的 `buildRegistry()` 为准（实现即真源）：

| 情形 | 结果 |
| --- | --- |
| 目录名不合 `^[a-z0-9-]+$` | **跳过**，不注册 |
| 设备段不是 `mobile` / `standard` / `mini` | 整个目录**跳过**（不会被当成某个配色） |
| 缺 `index.ts` / 没有 `default` 导出 / 包内没有 `meta` | **跳过**，不注册 |
| 包内 `meta.id` 与目录名不一致 | **以目录名为准**（`meta: { ...def.meta, id: parsed.colorId }`） |
| 只有 `theme.scss`、没有 `index.ts` | 视为残缺，**该目录的样式被忽略** |
| 包根（`themes/<包>/index.ts`）坏了 | 该包**及旗下所有设备的配色**全部不注册 |
| 同一页面内有同名配色 | 后到的**告警并忽略**（按路径排序先到先得） |

两点意图：

1. **目录名是唯一真源**：`theme.scss` 的选择器必须写 `html[data-mauth-theme='<id>']`，
   属性值来自目录名 —— 包内再写一个别的 `meta.id` 只会让选择器对不上，所以直接由目录名覆盖。
2. **跳过而不是抛错**：一个写坏的主题不该让整个认证页起不来。
   **但"跳过"就是静默失效** —— 加完主题没生效时，先查目录名是否合规、有没有漏 `export default`、`meta` 有没有写错字段名。

🔴 **配色 id 的唯一性作用域是「同包 × 同设备 × 同页」，不是全局**：
该范围内不能重名，但**跨页 / 跨设备 / 跨包都可以同名**（`black` 在每个作用域下各配一份是正常且必要的）。
原因是取值时**必须同时给出这三段归属**（`getThemeRecord(id, pkg, device, page, view)`），
歧义在入口就被消解 —— 注册表的键是 `包/设备/页面/版式/配色` **五段复合键**，
其中**「版式」段恒等于「包」段**（`view ≡ pkg`，见第一节）。
写扫描器时这点很要命：以配色 id 单键登记会让后来者（同名的另一页 / 另一端 / 另一包）被当成重名丢掉。

所以「加一个主题包 / 加一套配色」= **加一个目录**：不改 `theme/index.ts`、不改 `mobile-auth.scss`、不改 store（步骤见第八节）。

## 三、职责红线（容器 vs 版式）

```text
view/app/<page>/index.vue                      业务容器（手机端）：状态 / 校验 / 请求 / 路由 / 浮层 / 倒计时
view/web/<page>/{Standard,Mini}*.vue           业务容器（桌面端 / 紧凑版）
        │  传 ctx（<Page>ViewContext）
        ▼
themes/default/<设备>/<page>/index.vue         内置包版式（容器**静态引入**自己设备的那份）
themes/<包>/<设备>/<page>/index.vue            非内置包版式（`import.meta.glob` **惰性**加载）
```

| 允许在**版式**里出现 | 禁止在**版式**里出现 |
| --- | --- |
| 布局、样式、静态装饰 | 任何网络请求 |
| 纯展示用局部状态（如密码明文开关、过渡方向） | 任何校验规则、`router.push`、store 读写 |
| 读 `ctx`、调 `ctx.actions.*` | "该不该拦"的业务判断 |
| 复用 `mauth-*` 类 / 自有 `<style>`（取值只许 `--mauth-*`） | 裸色值、裸像素断点 |

补充约定：

1. **移动端版式不得自带 `<style>`**。它是三页共用样式 `assets/styles/mobile-auth.scss` 的消费方，
   自带样式块会让各页各自漂移 —— 历史上"两页看起来不一样"都源于此。
   电脑端（`standard` / `mini`）版式**自带 `<style scoped>`**（`std*-*` / `m*-*` 体系，已 token 化），
   与移动端 `mauth-*` 是两套样式体系。
2. **浮层由容器渲染**。图形验证码、协议弹窗、消息提示都是 `fixed` 或 Teleport 到 body 的，
   渲染位置不影响呈现 —— 放在容器里可以让所有版式共享，且不会各写一遍。
3. **凭据不下发给版式**。`verifyToken` 这类只在请求里用的值留在容器，
   `ctx` 只暴露版式要展示的那两项（如 `{ email, reason }`）。
4. **单一状态值优于布尔量**。登录页用 `panel: 'consent' | 'emailVerify' | 'form'`、重置密码页用
   `stage`（6 态），而不是让每个版式各自写一遍 `v-if` 链 —— 否则"哪一步该显示什么"又散到多份里去了。

## 四、版式选择优先级

1. URL `?view.<当前设备>=<id>` —— 只给某端指定版式
2. URL `?view=<id>` —— 本次访问的显式意图（联调 / 灰度 / 单页预览都走它，三端共用）
3. 主题包声明 —— `themes/<包>/index.ts`（或配色里）的 `views: { <页面>: '<id>' }`（配色与版式成对下发）
4. `VITE_<PAGE>_VIEW` —— 部署级默认（整站换 UI，不动代码）
5. **当前包自带的版式** —— 缺省（就是包名本身）

⚠️ **版式 id 就是"目标主题包名"**：第 1/2 档解析出的 id 若不是当前包名，
就把它当**目标包**去找（`?view=compact` = 切到 compact 包）；
该包在**当前设备**下没登记版式时，回退**当前包自己的**版式（不跨设备借）。
搜索范围永远是 `themes/*/<当前设备>/<页面>/`。

⚠️ **当前设备由「页面身份」决定，不是运行时判定**：移动端容器写 `const THEME_DEVICE = 'mobile'`、
`Standard*` 容器写 `'standard'`、`Mini*` 容器写 `'mini'`，路由 `meta.device` 与之对应；
设备同步在应用启动时一次性接好（见 `router/index.ts` 的 `setupThemeDeviceSync`），
**不跑视口判定** —— 视口判定只用于"访问 `/` 时该进手机端还是电脑端"这一层的分发，
一旦已经落在某个页面上，它属于哪端就是固定的。

⚠️ **第 2 档非法值不回退**：`?view=typo`（不在当前包、也不是任何已登记包）直接落当前包自带的版式，
而不是被第 3/4 档接管。显式参数写错时**静默换用另一套 UI**，比看到默认版式更难排查。

⚠️ **内置包的版式不进惰性表**（由容器静态引入）：
它是绝大多数访问的默认路径，让它在关键路径上多等一个网络往返不划算。
`views/registry.ts` 的 `load()` 在「`target === builtinPackage`」时返回 `null`，
表示"用你静态引入的那份"。**三个设备各自静态引入自己那份**，所以"零请求"对三端都成立。
其它包只能惰性加载（包是运行时才定的，静态 import 钉不住），由路由守卫提前预热。

## 五、分包与首屏（按需加载是硬要求）

- **内置包版式静态引入**
  （`import BaseLoginView from '@/theme/themes/default/mobile/login/index.vue'`，
  桌面端 `Standard*` 引 `standard/`、`Mini*` 引 `mini/`）→ 默认路径**零额外请求**。
  ⚠️ 静态引的路径写死在容器里，所以「设备」对版式来说是**写死的**，与 `THEME_DEVICE` 常量一致。
- **不带任何 `view` 参数 = 零请求**：容器首帧就渲染静态引入的那份，
  `registry.load()` 返回 `null` 时容器直接沿用，**不发任何动态 import**。
  `?view=<当前包名>` 与 `?view=base` 走同一条短路（`resolve` 把二者都归一成包名）。
- **非内置包走 `import.meta.glob`** → 独立 chunk，只有真被选中才下载。
- **导航阶段预取**：路由 `beforeEnter` 调 `preload<Page>View(...)`，**不 await**（与路由组件 chunk 并行）。
  预取用的 URL 值也走 `readDeviceParam`（与容器同一条取值链），**不 await** 就不会拖慢导航。
- ⚠️ **新增包/版式目录必须重启 dev server**：`import.meta.glob` 在**启动时**静态扫描，热更新发现不了新目录。
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

于是改契约时**容器与所有包所有设备的版式一起报错**，不会悄悄跑偏 —— 契约是真的有约束力，而不是一份会过期的文档。

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
   （电脑端另建 `view/web/<page>/` 的分发器 + `Standard*` / `Mini*` 容器。）
2. **契约**：建 `theme/views/<page>.ts`，定义 `<Page>ViewContext` / `<Page>ViewProps` + 各子结构，
   再在同文件里建注册表（`createViewRegistry` + `ENV_VIEW` + `pick<Page>ViewId` + `preload<Page>View`）。
   能从既有实现复用的联合类型，用 `import type` 直接引（如 `LoginSocialProviderId = SocialProviderId`），**不要重写一份**。
   ⚠️ 读 URL 参数一律用 `readDeviceParam(route.query, 'view', THEME_DEVICE)`，**不要**直接 `route.query.view`
   （直接取会漏掉 `?view.<设备>` 这一档）。
3. **版式**：建 `themes/default/<设备>/<页面>/index.vue`，把容器原来的模板**忠实搬运**过去（不改外观），
   加 `data-mauth-view="<包名>"`（**值就是包名** —— 一个主题包 = 一种版式；**三端都要带**，
   关卡与排查都只能靠它读"现在渲染的是哪套 UI"），移动端的**不写 `<style>`**（消费 `mauth-*`）。
4. **容器改造**：静态引入该设备的版式、`ctx = assert<Page>Contract(reactive({...}))`、
   `activeView` 按 `pick<Page>ViewId` 惰性加载、`viewEpoch` 防过期。
5. **路由预取**：在 `router/routes.ts` 给该页的 `beforeEnter` 接上 `preload<Page>View`（预取是无条件优化，不再有"宽屏跳转"分支——见下文「URL 不被视口改写」）。
6. **重启 dev server**，访问 `?view=<id>` 看效果。
7. **补验收关卡**（见第十节），并跑一遍既有基线。

## 八、加一套配色 / 加一种版式

### 加一套配色（在已有主题包的某个页面下）

1. 建目录 `src/theme/themes/<包>/<设备>/<页面>/colors/<配色>/`
   （`<配色>` 只允许 `[a-z0-9-]`；`<设备>` 是 `mobile` / `standard` / `mini`）。
   ⚠️ **路径里没有「版式」这一层** —— 一个主题包 = 一种版式。
2. 写 `index.ts`，默认导出 `MauthThemeColor`：`meta` + `tone` + `tokens`（**一组扁平值** `{ '--mauth-*': '值' }`）。
3. （可选）`theme.scss` 放背景图 / `@font-face` / 伪元素装饰 / 媒体查询。
4. **每个设备各加一份**：配色是**按包 × 设备 × 页面**查的，只给 mobile 加了、
   standard 没有，URL 在电脑端就会**静默回落到同系别兜底**。
   （三端要同名同款时，可以把同一份 `index.ts` 内容复制三处；跨设备同名是允许的。）
5. **重启 dev server**。

⚠️ **配色 `meta.id` 与目录名必须字面一致**（以目录名为准，但不对齐会让维护者困惑），
且**同一页面内不得重名**。跨页 / 跨设备 / 跨包同名是允许的（`black` 在每个作用域各配一份）。

⚠️ **`tokens` 只有一组扁平值，不分明暗档**（2026-09-25 取消）：

```ts
tokens: {
  '--mauth-primary': '#0e7490',
  '--mauth-primary-fg': '#fff',
  /* 不分明暗的（圆角、间距、字体族名）同样直接写在里面 */
  '--mauth-radius': '16px'
}
```

以前要求「颜色类 token 必须成对给 `light` 与 `dark`」，那是**配色兼职明暗**时代的产物；
现在明暗不再兼职配色选档、配色自带底色，**再写成两档就是无意义的重复**。
类型 `ThemeTokenOverrides` 已收窄为 `Record<string, string>`，写 `light:` / `dark:` 会直接编译报错。

### 🔴 明暗（`mode`）与配色独立，但明暗会**单向联动**配色系别（tone）

- **`mode`**（`mode.ts`：浅色 / 深色 / 跟随系统）是**系统级偏好**，全局一个值，只决定 `html.dark` 这个 class 是否挂上（基线 SCSS 的地基色）。
- **配色**是**具体的一套外观**，自带底色（`--mauth-canvas` 等），选谁就是谁 —— **不分明暗档**。
- **每套配色声明一个系别 `tone: 'light' | 'dark'`**（`theme/tone.ts`，必填，漏写 `vue-tsc` 报错）：`black`=dark，`white/blue/cyan/rainbow`=light。
- `isDark` 不是独立状态，**就是当前配色的 `tone`**。

**明暗 → 配色系别 单向联动**（用户 2026-09-25 要求「白系在用时切夜间就切黑色主题，再切回恢复原来那套」）：

- 白系配色在用时切夜间 → 自动跳到黑系配色；再切回 → 恢复**原来那套**白系（双侧记忆槽 `lightColor`/`darkColor` 落盘保存）。
- 黑系起手则反之。实现见 `stores/theme.ts` 的 `watch(isDark) → syncColorToTone`。
- **单向**：手动点颜色**不改**明暗（黑白蓝青是并列选项，不该被强制切明暗）；`setTheme` 不碰 `mode`。
- 首屏对齐只在**有落盘偏好**时生效（全新用户不被字母序换色）；URL `?theme=` 显式指定时豁免（部署方"永远用蓝"的链接要压过联动）。
- **跨设备系别一致**：`theme/index.ts` 的 `getThemeRecord` 在请求 id 不在当前作用域时，按该 id 系别（`toneOfAnyScope`）取同系别首套 —— mobile 选 `blue`(light) 拉宽到 standard(无 blue) → 回落 `white`(light)；
  但**设备维度参数那一路优先级更高**：`?theme.standard=black` 会让电脑端直接用 `black`，回落链不会启动。

**所以：**

- 需要一套深色的品牌色？**加一个新颜色目录**（如 `navy`，标 `tone: 'dark'`），而不是把它做成"某配色的深色档"。
- `black` 与 `white` 是**两个完全并列的颜色**（各有 id、各自出现在面板里），不是一个配色的两档。
  选 `black` 就是黑底，选 `white` 就是白底。
- 调试面板**不提供**「点颜色顺带改明暗」这种行为（曾有过 `COLOR_MODE` 映射，2026-09-25 已删除）。

用户 2026-09-25 的原话：

> 没有深浅两档了，深和浅就是两种颜色配置。
> 黑和白和蓝青等应该是并列关系…蓝色没有白蓝和黑蓝之分，底色由蓝色自己选择设置。

⚠️ 把 `--mauth-header-bg` / `--mauth-body-bg` 设为 `transparent` 时，**必须同时声明画布 token**
（见[跨内核渲染基线](/frontend/browser-baseline)的「表面透明必须同时声明画布色」）。

### 加一种版式 ＝ 加一个主题包（不是加深目录）

1. 建包目录 `themes/<新包>/` + `index.ts`（默认导出 `MauthThemePackage`，只声明 `meta` / 可选 `views`）。
2. 建 `<新包>/<设备>/<页面>/index.vue`：`const props = defineProps<XxxViewProps>()`，
   照着 `ctx` 渲染，只调 `ctx.actions.*`。想复用内置包的样式基线时，从
   `themes/default/<设备>/<页面>/index.vue` 照抄起步。
3. 建 `<新包>/<设备>/<页面>/colors/<配色>/index.ts` —— ⚠️ **配色是按包查的，新包必须自带一份**，
   不想要多的就只建 `{black,white}`。
4. **重启 dev server**，访问 `?view=<新包名>`（或 `?view.<设备>=<新包名>` 只换某端）。

参考实现照抄仓库里的 `themes/compact/`（`mobile/register` 的「换包换版式」范例）。

> 「换版式要复制配色」是这条口径的**已知代价**，也是刻意的：两套 DOM 的 token 集合本来就不同，
> 共享一份文件只会让配色里堆满"只对某版式有意义"的条目。

## 九、安全边界

**版式 id、配色 id、token 取值都是外部输入**（URL 参数、后端下发都可能被改动），必须过白名单。

| 输入 | 校验位置 | 口径 |
| --- | --- | --- |
| 版式 id | `theme/views/registry.ts` 的 `resolve()` | 只认 `^[a-z0-9-]+$` 且**当前包当前设备内已登记**；未登记返回 `null`，**不拼路径、不做模糊匹配** |
| 配色 id | `theme/index.ts` 注册表 | 同上；未登记回退**该范围的兜底配色**（`defaultColorIdOf(device, page, view)`，按 id 字母序取最前） |
| 设备维度参数名 | `theme/views/params.ts` | 只按 `<名>.<设备>` 组装，设备名来自容器常量白名单，**不拼任意键** |
| token 名 / 取值 | `src/theme/runtime.ts` | token 名必须 `--mauth-` 前缀；取值只接受 `#hex` / `rgb()` / `hsl()` / 长度 / `var(--mauth-*)` / 少量关键字 |

🔴 **`runtime.ts` 刻意拒 `url()` 与 CSS 颜色名**：

- `url(https://evil/x)` 是**外发请求的唯一入口**，可被用来做探测 / 追踪；所以背景图、webfont 一律走 `theme.scss`。
- CSS 颜色名有上百个、维护白名单容易漏；放宽成"任意字母"等于把 CSS 注入的口子交出去。

同类边界：登录页的**第三方授权端点只放行站内相对路径**（`/` 开头且非 `//` —— `//evil.com` 是协议相对地址，
浏览器会当外域绝对地址用）；未配端点**不静默**，明确提示。

## 十、验收

改这一层后，至少证明四件事：**门没坏（业务没被换 UI 弄坏）、取值没漏（token 生效）、像素没动（外观零回归）、
首屏没变重（按需加载未退化）**。

1. **业务关卡**：`.tmp-probe/verify-<page>-view.mjs`（Playwright）。断言面至少覆盖：
   版式选择（含**非法 id 落当前包版式**）、业务完整性（未勾协议不发请求 / 加密信封 / 拦截图形的分支）、
   各面板可达、浮层与分发路径、静态分层体检。
   分发逻辑还要单测 **iframe 内宽度**的情形（`verify-forgot-view.mjs` 的 I 段：把页面放进
   指定宽度的 iframe，断言 `fromLogin=mini` 时窄 iframe 也保持桌面版 —— 见第十一节）。
   **版式优先级关卡**：`.tmp-probe/verify-view-priority.mjs`（Playwright）。逐档验第二节那张表
   （`?view.<设备>` ＞ `?view` ＞ `views.<页面>` 声明 ＞ `VITE_<PAGE>_VIEW` ＞ 当前包名）与两条硬规则
   （**设备键留空 = 未指定**、**URL 显式非法值不回退到声明/环境变量档**），并用**同一条链接**在三台设备上
   各验一遍（不串台：`view.mobile` 不能在 standard 上生效）。
   ⚠️ 第 4 档（环境变量）需要一个**带 `VITE_<PAGE>_VIEW` 启动**的实例 —— 用 `--env-base <url>` 传入；
   不传就**明确跳过该组**，不写恒绿的空断言。第 3 档（声明）本仓三个包都还没声明 `views`，
   浏览器侧只能验"不误伤"，"声明真的生效"由下一项从实现口径守。
2. **目录口径关卡**：`.tmp-probe/verify-theme-dirs.mjs`（**519 项**静态断言，纯文件系统、**不需要浏览器**）。
   守的就是本节「主题包 = 一个目录」那张表：**四级结构**（包 / 设备 / 页面 / 配色）、目录名合法性、必备文件、
   `theme.scss` 选择器必须用目录名、🔴 **页面下不存在「版式层」目录**（一个主题包 = 一种版式）、
   **黑白是与蓝青并列的实体颜色**（每个「包×设备×页面」作用域下都要同时有 `black` 与 `white` 且自带 token）、
   🔴 **每份版式都带 `data-mauth-view` 且值 == 包名**（三端都带 —— 关卡与排查的唯一取值口）、
   契约收在 `theme/views/` 下、**配色 id 唯一性按「同包同设备同页」判**（注册表键仍是五段、view ≡ pkg）、
   目录名与 `meta.id` 字面一致（6b 节，按目录名判而非 `meta.id`，防"不同目录写同一个 id"逃检）、
   **三设备容器各自静态引入自己设备的版式**（首屏零请求）、
   **三页的版式选择同形**（`pick*ViewId` 都接收 `source.theme`、容器都传 `themeStore.viewFor(<page>)`、
   URL 分支一律是 `resolve(url, pkg, device) ?? pkg`）、
   设备维度 URL 参数的两侧（配色 `theme.<设备>` / 版式 `readDeviceParam`）都在、
   **两侧都把空串当"未指定"**，且 URL 不写 localStorage，
   外加**实现 ↔ 文档口径一致性**（配色 glob 只有一套、仍由目录名覆盖 `meta.id`、
   `listColorsOf` 只按 id 字母序不给黑白特权、
   `setupThemeDeviceSync` 用 `watch(router.currentRoute)` 且接在 `app.use(pinia)` 之后）。
   改主题目录结构或 `theme/index.ts` 的扫描逻辑后跑它。
3. **glob 编译产物关卡**：`.tmp-probe/verify-glob-device.mjs`（**26 项**，需能起 Vite）。
   用 Vite `createServer` + `transformRequest(..., { ssr: true })` 读回 `import.meta.glob` 的**编译产物**，
   断言包定义 / 三设备配色 / `theme.scss` / 三页 mobile·standard·mini 版式各 1 条都真的被扫到，
   并断言 🔴 **配色 glob 只有一套（4 段）** —— 旧的 6 段模式一旦复辟就会扫到 0 个文件（比"目录存在"更接近真源）。
4. **按需加载关卡（首屏请求清单）**：`.tmp-probe/verify-first-paint-budget.mjs`（**36 项**，Playwright）。
   这条不变量一旦破了（比如把 `load()` 的 `null` 短路去掉、或在容器里改回同步 import 别的包），
   **功能一切正常、只是首屏悄悄多了一堆请求**，其它关卡全都不会红 —— 所以必须用真实网络清单来证。
   ⚠️ 别把"设计内的加载"误报成泄漏：不带任何参数时首帧**会**加载 ① 各主题包与各配色的 `index.ts`
   （注册表 `eager: true`，首帧前要能同步校验 `?theme=` 的合法性）② **内置包当前页的三个设备版式**
   （分发器 `onMounted` 刻意预热三形态容器，v2.20.1「避免切换闪屏」）。
   要守的是**除此之外一个不多**：**零个非内置包的版式 chunk、零个 `theme.scss`**；
   再做正向对照 —— `?view=<其它包>` 只多那一个 chunk、`?theme=<配色>` 只多那一个 `theme.scss`
   （证明探针看得见差异，不是恒绿）。
5. **门禁**：`npm run type-check`（= `vue-tsc -b`）必须绿，且按第六节做**毒丸验证**。
6. **视觉回归**：遵循[视觉回归归因三铁律](/frontend/coding-standard) ——
   ① 先稳定化（冻结过渡/动画 + 等 `fonts.ready`，冻结样式须在**加载后**注入并**断言生效**）；
   ② 比对前先确认基准与结果**来自不同状态**（否则同一份代码自比恒等，"重构前后一致"这类结论不成立）；
   ③ 报**逐场景归因表**，不报一个总百分比。
   ⚠️ 连拍两次不一致的项是非确定性的（如 3s 自动关闭的提示条），**不能作断言目标**。
7. **调试面板**：`?debug=theme` 会列出当前设备的**可选版式**（就是包名本身）
   与当前页面的可选配色 —— 面板的"版式"区现在只列**当前设备的包**，
   写道具用 `view.<设备>`（该键已存在时）否则 `view`，与 URL 参数口径一致。
   面板带**设备切换**（跟随路由 / 手机端 / 桌面端 / 紧凑版）。
   ⚠️ 面板**只控制当前页面的版式与配色**，不展示路由、不跨页跳转（2026-09-25 改）。

### 关卡必须自己"会红"（毒丸验证）

静态关卡靠"读文件 + 断言文本"过活，**很容易写成恒绿的摆设**。改完关卡后必须做一次毒丸：

- 把某个页面某个版式下的 **`white/` 临时改名**（如 `__poison`）→ 关卡必须报「有 colors/white/」与「目录名合法」两条红；
- 在某个页面下临时建一个 **「版式层」目录**（如 `themes/default/mobile/login/compact/`）
  → 关卡必须报「页面目录下不存在多余子目录」红（这条守的正是"一个主题包 = 一种版式"）；
- 把注册表退回**以配色 id 单键**登记（还原旧实现）→ 两个页面的 `black` 撞键，关卡必须报错；
- 在 `theme/index.ts` 里塞回 **6 段配色 glob** → 关卡必须报「不再有『6 段配色』glob」红；
- 把 `setupThemeDeviceSync` 改回 `router.afterEach` → 关卡必须报错。

毒丸变绿就说明关卡没真在检查。
（仓库里有现成的毒丸脚本：`.tmp-probe/poison-verify-theme-dirs.mjs`，跑一遍就能验证上面前两条。）

## 十一、设备分发的一致性（分发器）

「桌面路由渲染桌面版还是手机版」由一个**分发器**决定（`view/web/<page>/index.vue`）。
判定优先级（三条，缺一条就会出线上问题）：

```
显式 ?isMobile=true  ＞  显式来源信号（mini）  ＞  自动识别(宽视口>窄视口>UA)  ＞  桌面默认
```

🔴 **三个分发器必须都认「mini 来源」**（`from=mini` / 路径含 `mini-login` / `fromLogin=mini`）。
**mini 来源 = 这个页面正被嵌在宿主 app 的弹窗 iframe 里**，此时的「窄」是弹窗列宽造成的，
不代表用户在用手机 —— 必须保持桌面/紧凑版式，和同一 iframe 里的 mini 登录页一致。

⚠️ **漏掉这条分支的症状极具欺骗性**：iframe 宽度落在 `<768px` 时，该页会**自己跳成全屏手机版**，
而同一 iframe 的登录/注册页仍是桌面卡片 —— 表现为「就这一个页面变成了手机端」。
宿主弹窗本身有宽度上限（如 `w-[856px] max-w-[90vw]`，内部列宽 `480px`），
所以**宿主窗口一收窄，iframe 内宽度就掉到 768 以下**（实测宿主 1440px → iframe 854px；
宿主 ≤800px → iframe 718px 触发切换）。

**判定方式**：桌面浏览器直接开 `/forgot-password` 是**不会**复现的 —— 必须真的放进 iframe，
且用 `iframe 内容页的 window.innerWidth`（不是宿主的）来判断。
关卡 `verify-forgot-view.mjs` 的 I 段就是这么测的（窄 iframe + `fromLogin=mini` → 必须桌面版）。

## 十二、iframe 嵌入：握手与父 origin 白名单

oauth21 被别的 app（如 posecraft）用 iframe 嵌进弹窗时，靠一条 **`SSO_READY` 握手**告诉宿主"我加载好了"：

```
oauth21 iframe 挂载 → postToParent({ type: 'SSO_READY' })
宿主收到          → 关掉「正在加载安全登录」遮罩
宿主 `@load`      → 只启动 3s 兜底超时（收不到握手就硬关）
```

🔴 **白名单是单一来源**：`oauth21/src/utils/parent-origins.ts`，
由 `utils/parent.ts`（发消息）与 `composables/useParentThemeSync.ts`（收消息）共用。
改白名单只需改这一处 + 各 `.env` 的 `VITE_ALLOWED_PARENT_ORIGINS`（逗号分隔，自动 trim）。
此前这两处**各抄了一份**，fallback 默认值也各写各的 —— 漂移会导致"发得出去、收不回来"或反之。

⚠️ **只写「嵌 oauth21 的父应用」的 origin。**
**别把 oauth21 自己的端口（5174 / 5175）写进去** —— 它是被嵌方，不是父应用。

### 🔴 漏配的症状是「loading 慢」，不是报错

这是最容易误判的地方。白名单漏了宿主 origin 时：

1. `postToParent` 拒绝发送，控制台出现
   `[SSO] 拒绝 postMessage：父 origin 未授权 <origin>`；
2. 宿主收不到 `SSO_READY` → 等满自己的 **3s 兜底超时**；
3. 用户看到的是「**弹窗打开后 loading 转了很久**」，表现完全像一个性能问题。

实测（`localhost:5176` 的 posecraft 弹窗，`.env` 漏了 `http://localhost:5176`）：
**停留 3608ms**；补对白名单后 **719ms**（多轮 790~830ms）。

**排查任何 iframe 握手类「慢」，第一件事 grep 控制台有没有那条拒绝日志。**

### 余下的 ~800ms 是什么

补对白名单后的剩余耗时**不是 bug**，拆解如下（弹窗点击 = 0）：

| 段 | 耗时 | 归因 |
| --- | --- | --- |
| 弹窗点击 → iframe HTML | ~150ms | 宿主渲染 + iframe 首块 HTML（含 Vue 等 deps） |
| → `SSO_READY` 发出 | ~350ms | **dev 冷启动**模块瀑布：`domInteractive=29ms` 后仍需拉 ~65 个模块 |
| → loading 消失 | **~280ms** | 宿主收握手后**自己**的收尾（卸遮罩 + 回发主题），**不在 oauth21 可控范围** |

- **不是模块转换慢**：热服务单模块 1~5ms，最大的 `deps/dist-*.js`（535KB）也只 47ms。
- `SSO_READY` 已挂在 dispatcher 的 `onMounted`（首屏异步 chunk 之前）。
  **不要再提前到 app mount**：`useParentThemeSync` 的消息监听器在 `App.vue` setup 注册、
  `onMounted` 才 `addEventListener`，比 dispatcher 更深 —— 提前发会有"宿主回发的主题消息
  到达时监听器还没就绪"的风险，收益却很小。
- 这是 **dev 模式冷启动特征，生产构建下显著更短**。

## 十三、常见坑

| 坑 | 症状 | 处置 |
| --- | --- | --- |
| **`.env` 白名单漏了宿主 origin** | 弹窗「正在加载安全登录」转很久（等满宿主 3s 兜底），看起来像性能问题 | 控制台必有 `[SSO] 拒绝 postMessage：父 origin 未授权 …` → 补 `VITE_ALLOWED_PARENT_ORIGINS`。**别把 oauth21 自己的 5174/5175 写进去** |
| **某分发器漏了「mini 来源」分支** | 嵌在宿主弹窗 iframe 里时，**只有这一页**跳成全屏手机端，同 iframe 的登录/注册仍是桌面卡片 | 在自动识别**之前**加一条：`fromLogin === 'mini'`（本页参数名）/ `from === 'mini'` / 路径含 `mini-login` → 直接返回桌面版。三个分发器都要有 |
| 加了配色/主题目录但"没生效" | 主题不出现，**且没有任何报错** | 注册表对坏目录是**静默跳过**：逐一核 ① 目录名是否 `[a-z0-9-]` ② 设备段是否 `mobile`/`standard`/`mini` ③ 有没有 `index.ts` ④ 有没有 `export default` ⑤ 包里有没有 `meta` ⑥ **这个设备下有没有这份配色**（配色按「包×设备×页面」查，只给 mobile 加，电脑端会静默回落） |
| **把新版式建在 `<页面>/<变体>/` 下** | `?view=<变体>` 落回当前包版式、配色整组消失 | 🔴 一个主题包 = 一种版式：新版式必须**新建包**（`themes/<新包>/<设备>/<页面>/index.vue`）。旧的 6 段形态已删除，注册表 glob 也只会扫到 0 个文件 |
| **配色 id 用单键登记（漏了归属段）** | 同一份配色在不同页/设备间互相覆盖，或后扫描到的被当成重名**静默丢弃** | 注册表键必须是 `包/设备/页面/版式/配色` 五段复合键（view ≡ pkg）；取值用 `getThemeRecord(id, pkg, device, page, view)`。加完版式若发现"少了一套配色"，先看控制台有没有重名告警 |
| **让某个颜色去兼职明暗开关** | 选了黑再选蓝，底色还是黑的（或反之） | `mode` 与配色**独立**（明暗不兼职选档），但**单向联动**系别（切夜间→黑系，见「明暗与配色独立」）；每套配色自带底色，选谁就是谁。需要深色品牌色就**另加一个颜色目录**（如 `navy`，标 `tone: 'dark'`） |
| **设备维度参数没生效** | `?theme.mobile=blue` 在手机上仍是黑的 | 检查读参数处是否走了 `readDeviceParam` / `readUrlIntent`（**别直接取 `route.query.view` / `searchParams.get('theme')`**）；两条链都是「`<名>.<设备>` → 通用 `<名>`」，直接读只会拿到通用值 |
| **URL 压过用户操作** | 用户点了色卡，刷新或切版式后又回到 URL 里的那套 | `setTheme` / `cycleMode` / `toggleTheme` 必须 `clearDeviceThemeOverride()`（只清**当前设备**的锁）；`setMode` 刻意不清（后端与父应用要待在 URL 之下） |
| 设备同步写在 `router.afterEach` 里 | 电脑端页面被当成手机端，列出手机端配色 | `afterEach` 首次触发时 Pinia `activeInstance` 尚未建立，`useThemeStore()` 抛错**被 try/catch 吞掉** → 设备永远停在默认值。改用 `watch(router.currentRoute, { immediate: true })`，并在 `main.ts` 的 `app.use(pinia)` **之后**调 `setupThemeDeviceSync(router)` |
| 往 `themes/` 下塞回一个 `views/` 目录 | 契约被主题扫描器当配色扫到 | 契约与注册表在 `theme/views/`（与 themes 平级），别塞回 `themes/` 里 |
| `meta.id` 与目录名不一致 | 主题能选中但 `theme.scss` 完全不生效 | 以**目录名**为准（会被覆盖）；把 `theme.scss` 的选择器改成目录名 |
| 新增包/版式目录后没重启 dev server | `?view=<新包>` 落回当前包版式 | 重启（`import.meta.glob` 启动时静态扫描）。**目录迁移后还要 `--force`** 清 optimize-deps 缓存，否则报 504 Outdated Optimize Dep |
| 移动端版式自带 `<style>` | 三页外观各自漂移 | 抽到 `mobile-auth.scss`，版式只消费 `mauth-*` |
| token 里覆写断点会变的项 | 矮屏 / 横屏适配整体失效 | `tokens` 是 `html` 上的 inline style，**优先级高于媒体查询** → 绝不在 token 里写 `--mauth-pad-*` / `gap-*` / `logo-size` / `title-size` / `field-h` / `control-h` / `err-h` / `social-*`，这些交给 `theme.scss` 的媒体查询 |
| `assets/` 的 SVG 只给 `viewBox` | 背景图撑满容器 | **必须带 `width`/`height`**（`background-size: …auto` 推不出高度） |
| 版式里提前取 `attrs.value` | 字段属性过期、校验态不同步 | 存整个 ref |
| 视口 / UA 判定不对就调试移动端页 | "电脑上看不到、手机上能看到" | 判定顺序是**宽视口(≥1024) ＞ 窄视口(<768) ＞ UA** → 先造窄视口并**刷新**；UA 伪装压不过宽视口。🔴 **URL 不被视口改写**：`/m/*` 与 `/<page>` 共用同一套分发器，窄屏渲染手机端、宽屏渲染桌面卡片，URL 永远不变（`desktopWhenWide` 已删，别加回） |
| **给 `/m/*` 加回"宽屏跳电脑版"重定向** | 刷新窄屏 `/login` 被改写成 `/m/login`、拉宽又被改写回，"切不回电脑路由" | 🔴 `/m/*` 与 `/<page>` **共用同一套分发器**（`view/web/<page>/index.vue`），URL **不被视口改写**（2026-09-25）。`desktopWhenWide` / `redirectMobileRouteOnWideViewport` 已删。关卡 `verify-mobile-forgot.mjs` ③ 守这条（毒丸：加回重定向→「保持路由」变红） |
| **桌面卡片点色卡无效**（黑白色切换无反应） | 点 black 色卡，token 注入 `html`（背景变黑）但卡片仍白；只有点 dark 明暗才变深灰 | 🔴 桌面卡片根容器挂局部 `.dark` class：`:class="{ dark: themeStore.isDark \|\| themeStore.activeTone === 'dark' }"`。Tailwind `darkMode:'class'` 允许 `.dark` 在**任意祖先**——点色卡（不改 mode）选中 dark 系配色时根 .dark 挂上，`dark:` 变体全触发。桌面版式的 SCSS 把 `html.dark .std-*` 写成 `:is(html.dark .standard-login-root, .standard-login-root.dark) .std-*` |
| 注释里写出"星号紧跟斜杠"的两个字符 | 块注释提前闭合，后续正文被当代码解析 | 描述 glob 模式时改用文字表述（已踩过两次） |
| **设备键留空，却把通用键也一起吞掉** | 带 `?theme=blue&theme.mobile=` 的链接在手机上**不是蓝的**（通用键也失效）；`?view=default&view.mobile=` 同理落回当前包 | `URLSearchParams.get()` 对 `?theme.mobile=` 返回**空串而不是 `null`**，`scoped ?? anyScope` 仍是空串 ⇒ `resolveThemeId('')` 返回 `null` ⇒ 该设备**一条锁都不记**。参数留空是部署方常用的"这台设备不特殊指定"，两侧都必须把它当**未指定**：版式侧 `params.ts` 的 `isPresent()`、配色侧 `readUrlIntent` 的 `present()` |
| **把已废弃的 `'base'` 当版式 id 返回下去** | 页面配色无声变回基线（**tokens 全丢**）、`activeView` 与 `data-mauth-view` 都是 `'base'`、且**没有任何报错** | 一个主题包 = 一种版式 ⇒ 版式 id ≡ 包名，配色键里的 view 段从不出现 `'base'`。`resolve()` 只把 `base` 当"当前包"的**别名**归一到包名；各页 `pick*ViewId` 对非法值一律 `?? pkg`（**别写 `?? baseId`**），也别再写「把 url 当包名再 resolve 一次」那种重复分支 —— 它会让 `?view=base` 从缝里漏出 `'base'`（register 曾长期如此） |
| **几个 dev 实例同时冷启** | 页面白屏，控制台 `504 (Outdated Optimize Dep)`，`.mauth-page` 永远等不到 | 多个 Vite 实例共用 `node_modules/.vite`，各自的 `optimizeDeps` 结果**互相作废**（客户端请求的 `?v=<hash>` 过期）。**串行启动**（前一个 curl 到 200 再起下一个），或给各实例不同的 `cacheDir` |
| 版式没带 `data-mauth-view`（或写了 `'base'`） | 关卡读不到"现在渲染的是哪套 UI"，报 `view=<多套:…>` / `'base'` | **三端每份版式**的根元素都要写 `data-mauth-view="<包名>"`（值 = 版式 id = 包名）。`verify-theme-dirs.mjs` §7b 守这条（毒丸④：把值改回 `'base'` 必须变红） |

## 本仓现状

### 三设备（mobile / standard / mini）

| 页面 | 手机端容器 | 桌面端容器 | 紧凑版容器 | 版式目录 |
| --- | --- | --- | --- | --- |
| 登录 | `view/app/login/index.vue` | `view/web/login/StandardLogin.vue` | `view/web/login/MiniLogin.vue` | `themes/default/<设备>/login/index.vue` |
| 注册 | `view/app/register/index.vue` | `view/web/register/StandardRegister.vue` | `view/web/register/MiniRegister.vue` | `themes/default/<设备>/register/index.vue` |
| 重置密码 | `view/app/forgot-password/index.vue` | `view/web/forgot-password/StandardForgot.vue` | `view/web/forgot-password/MiniForgot.vue` | `themes/default/<设备>/forgot-password/index.vue` |

✅ 三页 × 三设备的**容器 + 版式拆分已全部落地**（v2.21.0 ~ v2.23.0），
电脑端版式自带 `<style scoped>`（`std*-*` / `m*-*` 体系，已 token 化），移动端消费 `mauth-*`。
每个容器都**静态引入自己设备的那份**内置包版式 → 不带 `view` 参数时首屏零请求。

### 主题包

| 包 | 覆盖范围 | 说明 |
| --- | --- | --- |
| `default` | mobile / standard / mini × 三页 | 主包，**版式 id 就是 `default`** |
| `compact` | mobile × register | 「换包换版式」的范例：`?view=compact` |

### 配色

| 设备 | 页面 | 可选配色 |
| --- | --- | --- |
| mobile | login | `black` `white` `blue` `cyan` `rainbow` |
| mobile | register / forgot-password | `black` `white` `blue` `cyan` |
| standard / mini | 三页 | `black` `white` |
| compact | mobile / register | `black` `white` `blue` `cyan` |

**五色完全并列**：同一个列表、同一套选中逻辑、同一优先级，黑白不兼职明暗开关。
`blue`（改取值 + 贴底剪影）、`cyan`（改取值 + 改结构 + 横屏断点）、`rainbow`（多彩装饰，仅 mobile/login 页）是两个不同深度的范例。

> 相关：[主题系统](/frontend/theme)（各前端通用的 HSL 变量 / Store 约定）、
> [前端统一规范](/frontend/coding-standard)、[跨内核渲染基线](/frontend/browser-baseline)。
