> **⚠️ 已迁出本仓（仅作历史参考）**
>
> 本文描述的前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`）
> 已于 2026-10-31 从本仓库移除，改为独立维护。**文中出现的源码路径、目录结构与 npm 命令均已失效**，
> 接入或改造时请以对应前端仓自身的文档为准（`oauth21` → https://github.com/yijiu2025/oauth-web ）。
>
> 本仓只保留**后端**相关规范；后端侧的认证集成契约见 [auth-integration](../../standards/auth-integration.md)。

---

# 开发计划：无路由应用 + 路由树外 UI（弹窗 / 通知 / 悬浮窗）的多主题支持

> 立项：2026-10-23 · 状态：**P0 / P1a / P1b 已实现（2026-10-23）**，P2 待命  
> 实现清单见包内 `CHANGELOG.md` 的 `0.9.0 — 未发布`；落地用法见 `onboarding.md` §十三  
> 范围：`packages/theme-core`（skinsuite）+ 文档；宿主 oauth21 只做验证消费，不为本计划改业务代码  
> 前置阅读：`packages/theme-core/docs/onboarding.md`（接入模型）、`README.md`「单例语义」一节

---

## 〇、问题陈述

主题机制的**作用域锚点**目前只有一种来源：路由树里的 `<ThemeView page device :ctx>`。  
由此缺两类能力：

1. **无路由应用接不进来**：`app.use(theme, { router })` 类型上强制要求 router；  
   没有 `<ThemeView>` 就没人调 `setActivePageView` → `activePage` 恒空串 →  
   `themeRecordFor()` 走空记录 → **零 token 注入**，全站只剩基线 SCSS。
2. **路由树之外的 UI 想要"自己的主题"没有通道**：弹窗（modal）、通知（toast）、  
   悬浮窗（floating panel）要么跟随全局（现状，见下），要么需要**独立/钉死**的作用域——  
   现在的注入是"html 根上唯一一份"，同屏不可能出现两套主题。

### 现状里已经能用的部分（先说清楚，避免重造）

| 场景                                   | 现状                                                                                                                                           | 结论                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 弹窗 / 通知 **跟随当前主题**                   | CSS 变量沿 DOM 树继承：`MessageToast.vue`（oauth21）Teleport 到 body，仍是 `<html>` 子孙 → 读到的就是全局 inline style 里的 `--mauth-*`。**已验证可用**（v2.21.0 改造时正是这么用的） | ✅ 继承模式零成本            |
| 无 router 时 store 还能建吗                | `currentQuery()` 未装 router 返回 `{}`（运行时已容忍）；配色侧 `readUrlIntent` 读的是 `window.location.search`，不依赖 router                                       | ✅ 运行时已容忍，**只有类型没放行** |
| `data-mauth-theme` 属性 + `theme.scss` | 写在 `<html>` 上；theme.scss 契约选择器是 `html[data-mauth-theme='<id>']` 前缀                                                                           | ⚠️ 作用域化会碰到契约，见 P2    |

### 真正的缺口（按代码路径定位）

| #  | 缺口                                                                                                                                   | 代码位置                                                                      |
| -- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| G1 | `ThemePluginOptions.router` **必填**，无路由应用只能传假 router                                                                                  | `src/vue/plugin.ts`                                                       |
| G2 | 无 `<ThemeView>` ⇒ `activePage=''` ⇒ 空记录 ⇒ 不注入任何 token                                                                                | `theme-scope.ts`（初始 `activePage = ref('')`）+ `theme-runtime.ts` 的注入 watch |
| G3 | `<ThemeView>` 太重：要求页面已注册 + 主题目录里有版式 `.vue` + 渲染该组件——"我只要 token"的场景（壳层、弹窗容器）没有轻量入口                                                    | `ThemeView.vue`（`pageOf` 未注册直接 throw）                                     |
| G4 | **同屏双主题无通道**：注入目标写死 `document.documentElement`，注入名单 `injectedNames` 是模块级单一份                                                          | `token-runtime.ts`                                                        |
| G5 | 路由切换会重刷全局 token：打开中的通知 / 悬浮窗会跟着换肤（继承模式可接受；"钉死"模式需要作用域隔离）                                                                             | `theme-runtime.ts` 的 record watch                                         |
| G6 | 无 router 时版式意图（`?th`）完全失效（读 `currentQuery()` 恒 `{}`），配色意图（`?th_color`）倒是能用                                                           | `device-domain.ts` + `theme-persistence.ts`                               |
| G7 | 作用域内的"暗色"没有第二套开关：`.dark` 类挂在 `<html>`，Tailwind `dark:` 变体与基线 SCSS `html.dark` 都认全局                                                   | `theme-runtime.ts` 注入 watch                                               |
| G8 | **主题化的"部件组件"没有目录契约与加载通道**：弹窗/通知/悬浮窗的 DOM 结构想随主题包换，但扫描器在页面层只认 `index.vue`（一页一版式），平铺多 `.vue` 是死文件；且现有 `<ThemeView>` 会劫持全局作用域（见 §一 的陷阱） | `src/vite/plugin.ts` 的 `walk()`（`VIEW_COMPONENT_FILE`）+ `ThemeView.vue`   |

---

## 一、目标场景与分级

把"弹窗 / 通知 / 悬浮窗要主题"拆成四个递进场景，**每个场景对应不同的机制，不要一上来就上最重的**：

| 场景                      | 描述                                                       | 需要的机制             |
| ----------------------- | -------------------------------------------------------- | ----------------- |
| **A. 无路由应用**            | 纯 UI 壳（工具页、嵌入式小组件、无 vue-router 的 app）想要完整多主题             | G1 + G2 + G3 + G6 |
| **B. 叠层 UI 跟随全局**       | 弹窗 / 通知跟随"当前生效主题"（oauth21 MessageToast 现状）               | **已支持**，只需文档明确    |
| **C. 叠层 UI 钉死某套主题**     | 悬浮窗 / 品牌组件锁定自己的 (包×设备×页面×配色)，路由切换、用户切肤都不动它               | G4 + G7（作用域化注入）   |
| **D. 同屏多主题**            | 页面后面一套主题、弹层前面另一套（如暗色控制面板浮在浅色页面上）                         | 同 C（C 的机制天然覆盖 D）  |
| **E. 叠层组件本身的 DOM 也要换肤** | 不只是颜色（token）：弹窗/通知/悬浮窗的**结构布局**随主题包换（紧凑包的弹窗就是另一套 markup） | G8（见 2.3 部件层）     |

> 设计基调：**B 是默认且免费**；C/D 才引入新机制（作用域化注入），并且**绝不碰全局 store 状态**——  
> 作用域解析走内核已有的纯查询 `getThemeRecord`，与 store 的 `activePage/activeDevice` 无关。

### 🔴 一个新识别的陷阱：不要用 `<ThemeView>` 渲染弹窗（G8 的由来）

`<ThemeView page="modal-aaa">` 表面上"零改动"就能渲染主题化弹窗，但它内部会调  
`setActivePageView('modal-aaa', view)` —— **全局作用域被弹窗劫持**：弹窗一打开，背景页面  
按"弹窗页"的配色域重新解析 token，背景换肤闪变；弹窗关闭又切回来。作用域是全局单份的  
（这正是本计划要修的架构事实），所以**任何"弹窗组件"都必须走不碰 store 的并行解析**——  
这就是 2.3 部件层存在的理由，也是评审时最容易走错的一步岔路。

---

## 二、方案设计

### 2.1 P0 —— 无路由支持 + 轻量作用域锚点 `<ThemeScope>`（场景 A）

**四个小改动，全部向后兼容：**

#### ① `router` 改为可选（G1）

```ts
// plugin.ts
export interface ThemePluginOptions {
  /** 宿主路由（可选）：未提供时 URL 版式意图、调试面板门控走一次性 location.search，无路由响应性 */
  router?: DeviceDomainRouter;
}
export const theme: Plugin<[ThemePluginOptions?]> = {
  install(_app: App, options: ThemePluginOptions = {}) {
    if (options.router) installThemeDomain({ router: options.router });
  }
};
```

`app.use(theme)` 无参也能装（单端、无路由的最小接入从此成立）。

#### ② 新组件 `<ThemeScope page device>`（G3 的轻量半边）

`<ThemeView>` 的"token-only"子集：**只锚定作用域，不渲染版式组件**。

```ts
// 新文件 src/vue/ThemeScope.vue（约 40 行）
// 职责 = ThemeView 的第 3、4 步，砍掉 1、2 步（pick/load 版式组件）：
//   3'. setActivePageView(page, pkg)   —— pkg 用当前生效包（store.packageId），不查版式注册表
//   4'. setActiveDevice(device)
// 模板只有 <slot />。不要求 defineThemePage 注册、不要求主题目录有版式 .vue。
```

- 为什么不是给 `<ThemeView>` 加 `view=false` 开关：ThemeView 的报错语义（页面未注册、版式缺失）  
  是页面链路的**防呆**，壳层链路不该被这些约束卡住——两个组件、两套契约，比一个开关两条路径干净。
- `page` 参数怎么给：主题目录里建一个普通页面目录即可（如 `themes/default/mobile/app/colors/white/`），  
  **机制零新增**——"弹窗/壳层"就是一个普通的主题页面，目录结构与 login 完全一致。

用法（无路由应用的最小接入）：

```vue

<ThemeRoot :theme-store="themeStore">
  <ThemeScope page="app" device="standard">
    <router-view v-if="hasRouter" />   
    <ModalHost /> <MessageToast /> <FloatingPanel />
  </ThemeScope>
</ThemeRoot>
```

#### ③ `createThemeState({ defaultPage })` 兜底播种（G2 的保险层）

```ts
export interface ThemeStateOptions {
  // ...现有三项
  /** 作用域播种：没有任何 <ThemeScope>/<ThemeView> 挂载时，按这个页面解析"壳层主题" */
  defaultPage?: string;
}
// scope 初始化：const activePage = ref(options.defaultPage ?? '')
```

双保险关系：`<ThemeScope>` 挂载后 `setActivePageView` 覆盖它；没挂（纯 headless 消费）  
也有一份 token。**不设 `defaultDevice`**：设备兜底已有既定口径（设备清单末条），再造一个  
"默认设备"参数会和 `fallbackDevice()` 形成双真相。

#### ④ 无 router 时 URL 意图的一次性回退（G6）

`device-domain.ts`：未装 router 时 `currentQuery()` 返回  
`Object.fromEntries(new URLSearchParams(window.location.search))`（**装载时读一次**，非响应式）。  
配色意图（`?th_color`）本就读 location.search，改后版式意图（`?th`）同口径；  
路由型宿主行为零变化（装了 router 就永远走 router）。

> 取舍说明：无路由应用的 URL 本来就不变（没有路由器在推 history），"装载时读一次"  
> 恰好是正确语义，不需要造假响应性。

#### P0 验收

- [ ] 无 vue-router 的最小 demo（包内 `examples/` 或 dev 依赖宿主的一个页面）：`app.use(theme)` 无参 +  
  `<ThemeScope page="app" device="standard">`，切配色 / 切明暗 / 通知组件全部生效
- [ ] `?th_color=blue` / `?th=compact` 在无路由应用装载时生效
- [ ] oauth21 回归：现有接入零改动、测试全绿（router 必填改可选是纯放宽）

### 2.2 P1 —— 作用域化注入 + `<ThemeProvider>`（场景 C / D）

#### ① `token-runtime` 支持注入目标（G4）

```ts
// token-runtime.ts（改造，签名向后兼容：target 缺省 = documentElement，即现状）
export interface ApplyTarget { target?: HTMLElement }
export function applyThemeLayers(layers: ThemeTokenLayers, opts?: ApplyTarget): string[];
export function clearThemeTokens(target?: HTMLElement): void;
export function getInjectedTokenNames(target?: HTMLElement): readonly string[];

// injectedNames 单一份 → WeakMap<HTMLElement, string[]>：
//   根节点键用 document.documentElement（同一 WeakMap 条目），全局路径的调用点零改动
```

#### ② 新组件 `<ThemeProvider>`：钉死 / 并行主题的容器

```vue
<script setup lang="ts">
// props：{ page, device, pkg?, colorId?, toneSync?: boolean }
// 行为：
//   · 用内核纯查询解析记录：getThemeRecord({ id: colorId ?? 默认, device, pkg: pkg ?? 'default', page })
//     —— 🔴 不读不写 store 的 activePage/activeDevice：并行主题各自解析，互不干扰
//   · onMounted/onBeforeUpdate：applyThemeLayers({ theme: record.tokens }, { target: rootEl })
//     + rootEl.dataset.mauthTheme = record.meta.id
//     + rootEl.classList.toggle('dark', record.tone === 'dark')   // 作用域暗色（G7）
//   · onBeforeUnmount：clearThemeTokens(rootEl) + 摘属性摘类
//   · token 变化（props 变）走差集清理，与全局注入同一套逻辑
</script>
<template><div ref="rootEl" class="mauth-theme-scope"><slot /></div></template>
```

典型消费：

```vue

<ThemeProvider page="app" device="standard" color-id="black">
  <FloatingQuickPanel />
</ThemeProvider>


<Modal v-model="open">
  <ThemeProvider v-if="brandMode" page="app" device="standard" color-id="cyan">…</ThemeProvider>
</Modal>
```

#### ③ 明确的边界（写进组件头注释 + 文档，防误用）

- **P1 作用域 = tokens-only**：`theme.scss` 不进作用域（它的选择器契约是  
  `html[data-mauth-theme]` 前缀）。作用域内的背景图 / webfont 需求：要么提升到全局层，  
  要么等 P2 的契约扩展。**刻意先不做**：theme.scss 是"仓库内受信 CSS"，作用域化它  
  涉及选择器契约变更 + 目录口径关卡同步，收益/成本比要等真实需求出现再评估。
- **Tailwind `dark:`**：v4 的 class 策略默认 `:where(.dark, .dark *)`——作用域根挂 `.dark`  
  即可让子树命中；若宿主自定义过变体（只认 `html.dark`），作用域暗色对 `dark:` 类不生效，  
  这是宿主配置事实，库不代偿。
- **基线 SCSS `html.dark` 块**：不进作用域（同 theme.scss 边界）。作用域暗色的底色  
  依赖该配色**自带完整底色 token**——这与 2026-09-25 的"配色自带底色"定案天然一致。
- **通知类组件默认不包 ThemeProvider**：继承全局（场景 B）才是常态，钉死是例外。

#### P1 验收

- [ ] 单测：`applyThemeLayers` 两个 target 互不串台、差集清理不残留、`clearThemeTokens(el)` 精确摘除
- [ ] 组件测：ThemeProvider 挂载注入 / props 变化重算 / 卸载清理（DOM 环境，见测试基建）
- [ ] 同屏双主题 demo：浅色页面 + 暗色悬浮窗，双方独立切换互不影响

### 2.3 P1b —— 部件层 `<ThemePart>`：主题化的弹窗 / 通知 / 悬浮窗**组件本身**（场景 E）

> 背景：评审中用户提议「`themes/models/aaaModel/aaa.vue|bbb.vue|ccc.vue` + `import aaa from 'theme'` +  
> `<ThemeModel id="aaa|bbb|ccc"/>`」。方向正确（组件跟主题包走、按 id 取），但落法与现有契约  
> 有三处冲突，本节给出契约内的等价设计。**先排除三个坑**：
>
> 1. **平铺多 `.vue` 是死文件**：扫描器在页面层只收 `index.vue`（一页一版式），  
>    `aaa.vue|bbb.vue|ccc.vue` 不进 `themeViews`，写了也白写；
> 2. **`import aaa from 'theme'` 不该做**：静态 import 把选择固定在构建期，绕过  
>    (包×设备) 的运行时解析 —— 换主题包时弹窗不跟随，机制的核心价值就没了；
> 3. **`id="aaa|bbb|ccc"` 的管道写法不需要**：`id` 是单值运行时 prop（`"aaa"` / `"bbb"`），  
>    "aaa|bbb|ccc" 只是类型层面的 union，模板里写 `<ThemePart id="aaa" />`。

#### ① 目录契约：`parts/` 与页面平级（**不是**页面目录里平铺多文件）

```
themes/<包>/<设备>/
├── <页面>/                     ← 现有：页面（导航表面，一页一版式 index.vue）
│   ├── index.vue
│   └── colors/<配色>/
└── parts/                      ← 新增：部件（可复用 UI 零件，同设备所有页面共用）
    └── <partId>/               ← 弹窗/通知/悬浮窗各占一个 partId（[a-z0-9-]）
        ├── index.vue           ← 该包该设备这套部件的 DOM 实现
        └── colors/<配色>/       ← 可选：部件自己的配色域（缺省继承全局）
```

- **page 与 part 语义分开**：page = 导航表面（路由语义），part = 复用零件（组合语义）。  
  混在一起（"弹窗当页面"）会撞上 §一 的作用域劫持陷阱，且 `listPageViews` /  
  页面契约 / 调试面板的"当前页"语义全被污染。
- **能写在 default 包里吗——能，而且这是推荐落点**：default 是 eager + 兜底包  
  （`ViewRegistry.builtin()` 的既有语义），"其它包没这个部件 → 回落 default 实现"  
  的回退链天然成立。两个代价写明：default 的部件走 eager import **全量进首屏包**  
  （部件多时注意体积，可以只把高频部件放 default，低频放惰性包——但惰性包没有  
  builtin 同步兜底，需 loading 态）；非 default 包要换弹窗 DOM 时，放同名 partId  
  目录即覆盖（同设备段）。
- 版式选择口径与 `<ThemeView>` 的 pick 一致：当前包优先 → default 包兜底；  
  惰性加载 + epoch 防抖同款。

#### ② 新组件 `<ThemePart id :ctx? :device? :color-id?>`

```ts
// 新文件 src/vue/ThemePart.vue
// 与 ThemeView 的三点本质差异：
//   1. 解析键是 (pkg × device × partId)，不查页面注册表（pageOf），不要求 defineThemePage；
//   2. 🔴 绝不调 setActivePageView / setActiveDevice —— 全局作用域纹丝不动（§一的陷阱）；
//      当前包从 inject 的 store.packageId 读（只读），device 缺省用 store.activeDevice；
//   3. 颜色默认继承全局 token（零成本）；显式给 color-id 时配合 P1 的作用域注入，
//      把该部件自己的配色解析结果注到部件根元素（走 getThemeRecord 纯查询，不碰 store）
```

用法（对照用户提议的最终形态）：

```vue

<ThemePart id="confirm-modal" :ctx="{ title, onConfirm }" />
<ThemePart id="toast" :ctx="message" />
<ThemePart id="floating-panel" device="mini" color-id="black" />  
```


#### ③ 插件与注册表接线

- `scan()/walk()`：设备层下识别 `parts/` 固定字面段（与 `colors` 同一手法，常量  
  `THEME_PARTS_SEGMENT` 进 `constants.ts`），收集 `./<包>/<设备>/parts/<partId>/index.vue`  
  进新导出 `themeParts`（形态与 `themeViews` 同构：按 partId 分组的加载表）；
- 部件配色（可选的 `colors/`）注册进**现有配色注册表**，`page` 段记 `part:<partId>`  
  命名空间前缀——不与真实页面名冲突，`getThemeRecord` 的回退链原样可用；
- `theme.d.ts` 补 `themeParts` 的类型声明。

#### P1b 验收

- [ ] default 包放 `parts/confirm-modal/`，compact 包放同名部件 → 切包时弹窗 DOM 跟随切换；  
  只有 default 有 → 任何包下都回落 default 实现
- [ ] 弹窗打开/关闭期间，`__MAUTH_STORE__.activePage` 纹丝不动（背景无换肤闪变）——  
  这是与"弹窗当页面"方案的判定性区别
- [ ] `color-id` 钉死部件配色：全局换肤不影响该部件
- [ ] 目录口径关卡（宿主 `verify-theme-dirs.mjs`）同步 `parts/` 契约

### 2.4 P2 —— 收尾与增强（可选，按真实需求排队）

| 项                                         | 内容                                                                      | 触发条件                        |
| ----------------------------------------- | ----------------------------------------------------------------------- | --------------------------- |
| theme.scss 契约扩展                           | 选择器双写 `html[data-mauth-theme='x'], [data-mauth-theme='x']`；目录口径关卡同步校验双写 | 出现"作用域内需要背景图/webfont"的真实主题包 |
| 调试探针扩展                                    | `__MAUTH_STORE__` 增加 `scopedProviders` 清单（页面上有哪些作用域、各解析到哪套配色）           | C/D 场景实际投入使用后               |
| `<ThemeScope>` / `<ThemeProvider>` 命名统一评审 | Scope=锚定全局 store，Provider=自解析作用域——语义差一个字，靠文档钉死还是合并组件再议                  | P0/P1 都落地后看用户混淆度            |

---

## 三、实现顺序与工作量

| 期       | 内容                                                                     | 改动面                                                                                                          | 工作量              | 发版                            |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------- |
| **P0**  | router 可选 + `<ThemeScope>` + `defaultPage` + URL 一次性回退 + onboarding 新章 | `plugin.ts`、新 `ThemeScope.vue`、`create-theme-state.ts`、`theme-scope.ts`、`device-domain.ts`、`vue/index.ts`、文档 | **1~1.5 天**      | 0.8.0 一起（当前未发布条目内追加）或独立 0.9.0 |
| **P1a** | token-runtime 作用域化 + `<ThemeProvider>` + 单测/组件测                        | `token-runtime.ts`、新 `ThemeProvider.vue`、`vue/index.ts`                                                      | **1~1.5 天**（含测试） | feat → 0.9.0                  |
| **P1b** | 部件层：`parts/` 目录契约 + 插件扫描 `themeParts` + `<ThemePart>` + 部件配色注册 + 关卡同步  | `constants.ts`、`plugin.ts`、`registry.ts`、`theme.d.ts`、新 `ThemePart.vue`、`vue/index.ts`                       | **1.5~2 天**（含测试） | feat → 0.9.0                  |
| **P2**  | 按上表触发条件逐项                                                              | —                                                                                                            | 每项 0.5~1 天       | 按项                            |

依赖关系：P0、P1a、P1b **两两无依赖**，可并行开工；P1b 的 `color-id` 能力消费 P1a 的  
作用域注入（P1b 可先发不带 `color-id` 的版本）；P1a/P1b 的组件测试都依赖 DOM 环境（见下）。

### 测试基建（与审查遗留项 #11 合并解决）

P1 的组件测试需要 DOM 环境（现测试全是纯内核 dist 测试）。方案：devDeps 加 `happy-dom`  
（比 jsdom 轻）+ `@vue/test-utils`，新建 `test/vue/` 目录跑组件级用例（node:test 直跑，  
不引 vitest——库仓保持零测试框架依赖的口径）。这正好把审查报告里"Vue 绑定层零库级测试"  
的欠账一起还掉：优先覆盖 `ThemeScope`、`ThemeProvider`、`dispose` 收全性三组回归。

---

## 四、风险与开放问题（评审时定）

| #  | 问题                                                                                             | 倾向                                                                                                                          |
| -- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Q1 | `defaultPage` 播种后，若宿主同时有 `<ThemeView>`，切换瞬间是否有"壳层 token → 页面 token"的闪变？                        | 不会：`setActivePageView` 在 ThemeView setup 的 immediate watch 里，先于渲染生效；但**首帧空窗**（ThemeView 异步版式加载完成前）由 defaultPage 兜住——这恰是它的价值 |
| Q2 | `ThemeProvider` 的 `colorId` 未登记时回退到该范围默认色——静默回退还是 dev 警告？                                      | dev 警告（走 param-audit 同款文案口径），prod 静默兜底——与库既有静默失败策略一致                                                                        |
| Q3 | 作用域 `.dark` 类与全局 `html.dark` 同时存在时，基线 SCSS 的 `html.dark` 块对作用域子树生效（是 html 的后代）——双重暗色叠加是否有样式冲突？ | 需在 P1 实现时用真实基线 SCSS 验一遍；若有冲突，作用域根加 `data-mauth-scope` 属性，基线 SCSS 的暗色块加 `:not()` 排除——**留到实测再定，不做投机设计**                       |
| Q4 | 无 router 时 `replaceQuery` 静默无效（无路可推）——要不要在 dev 下警告？                                            | 不警告：无路由应用本来就不该改 URL（调试面板切配色走 store，不依赖 replaceQuery）                                                                        |
| Q5 | P0 发版时机：并入 0.8.0（当前已有大量未发布修复）还是独立 minor？                                                       | 并入 0.8.0：全是新增能力 + 纯放宽（router 可选），无行为变更，一起发减少一轮宿主同步成本                                                                        |
| Q6 | 部件配色的注册命名空间用 `part:<partId>` 前缀（P1b ③）——`resolveThemeId` 等查询的 `page` 参数会见到带冒号的值，是否需要内核为此开口？    | 不开口：内核本就把 `page` 当不透明字符串（设备词汇表同理），冒号前缀对内核只是普通字符；宿主关卡负责校验。评审时如有异议，备选方案是部件配色**不进全局注册表**、只进 themeParts 自己的表                    |
| Q7 | default 包的部件 eager 进首屏——部件数量多时首屏体积怎么控？                                                         | 先不优化：default 只放"当前包缺失时的兜底实现"，高频低体积（confirm/toast 本就必要）；出现体积问题再加"按 partId 白名单 eager"的清单级开关（theme.config.ts），**有实测数据再设计**     |

---

## 五、评审通过后的落地顺序

1. P0 ①→④（半天可全绿）+ onboarding §「无路由 / 纯壳层接入」
2. 测试基建（happy-dom + @vue/test-utils）——P1a/P1b 的前置
3. P1a ① token-runtime 作用域化（纯函数，先行单测）
4. P1a ② ThemeProvider + 组件测
5. P1b ①→③ parts 目录契约 + 插件扫描 + `<ThemePart>`（可先发不带 color-id 的版本）
6. demo 验证 Q3（双暗色叠加）→ 定 P2 是否需要 `:not()` 排除
7. 全量验证 + CHANGELOG + 发版（0.8.0 含 P0；P1a/P1b 视完成度并版或 0.9.0）
