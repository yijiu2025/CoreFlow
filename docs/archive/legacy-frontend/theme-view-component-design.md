> **⚠️ 已迁出本仓（仅作历史参考）**
>
> 本文描述的前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`）
> 已于 2026-10-31 从本仓库移除，改为独立维护。**文中出现的源码路径、目录结构与 npm 命令均已失效**，
> 接入或改造时请以对应前端仓自身的文档为准（`oauth21` → https://github.com/yijiu2025/oauth-web ）。
>
> 本仓只保留**后端**相关规范；后端侧的认证集成契约见 [auth-integration](../../standards/auth-integration.md)。

---

# 主题库重新设计：开发者视角的接口契约

> 状态：**定稿**（2026-10-18）。本文是主题模块接口重设计的终稿，作为后续实现的唯一依据。

---

> ### 🔴 机制迁移台账（2026-10-21 更新）—— 本文代码块是 2026-10-18 的设计快照，以下机制已相继迁出 / 删除，**现行口径以 `packages/theme-core/docs/onboarding.md` 与 `docs/standards/theme-replacement.md` 为准**：
>
> | 本文记载 | 现状 |
> |---|---|
> | `match` 声明式判定（`from` / `fromLogin` / `pathSegment` / `explicitMobile` / `viewportMobile` / `fallback`）+ 库内 `pickDeviceId` / `deviceContext` | **2026-10-19 全删**。设备判定归宿主（`utils/device-resolve.ts` 纯函数 + 分发器），库零判定词汇 |
> | 触点 5「库监听路由 + 视口维护 `activeDevice`」、`app.use(theme, { router })` 派生设备 | **2026-10-19/20 改**：设备身份由被选中容器内的 `<ThemeView page="…" device="…">` props 告知 store（`setActiveDevice`），分发器不碰主题 |
> | 设备声明里的 `routePath`（本文 222 / 239 / 252 / 265 行及 §路由前缀表） | **2026-10-21 删**（`DeviceDef.routePath` 零读取方）。路由 path 早在 2026-10-18 收归宿主 `router/routes.ts` 固定声明 |
> | `asKnownDevice` / `asThemeDevice` / `currentDevice()` / `useDeviceDispatcher` / `deviceResolver` 注入槽 / `resolveDevice` 注入 | **相继退役**（0.3.x ~ 0.5.0），见库 `CHANGELOG.md` 各版本迁移节 |
> | `resetDevices` / `resetPages` / `resetThemeViews` / `resetThemeRuntime` / `asDeviceId` / `deviceLabel` / `isKnownDevice` 导出 | **2026-10-21 删**（零消费死字节，skinsuite 0.6.0） |
>
> 保留本文作为设计演进史；**照本文代码块写声明会缺 / 多字段**，以迁移台账右侧与现行文档为准。

---

## 核心理念

一个页面容器开发者只需要关心 **5 件事**，其余全部由库提供：

| # | 触点 | 开发者写什么 | 库提供什么 |
|---|------|-------------|-----------|
| 1 | 声明页面 | `defineThemePage({…})` | 版式注册表 + 选择器 |
| 2 | 渲染版式 | `<ThemeView>` 或 `useThemeView()` | 加载、epoch 防抖、回退 |
| 3 | 组装 ctx | 业务容器写 `reactive({…})` | 契约类型 `LoginViewContext` |
| 4 | 全局外壳 | `<ThemeRoot :themeStore />` + `<ThemeDebugPanel/>` | dark 类、token、调试面板（来源同步归运行时） |
| 5 | 启动接线 | `app.use(theme, { router })` | 设备判定（match）+ 设备域维护 activeDevice |
| 6 | 使用主题 | URL 参数 / `themeStore` 的切换方法 | 意图解析 + 三 composable 编排 + token 注入 |

---

## 触点 1：声明页面 — `defineThemePage`

开发者写（`views/login.ts`，三页之一）：

```ts
// views/login.ts
import { defineThemePage } from 'skinsuite/vue';
import { themeViews } from 'virtual:theme';

export const loginPage = defineThemePage({
  page: 'login',
  title: '安全登录',
  titles: { mobile: '移动端登录', mini: '快捷登录' },
  envView: import.meta.env.VITE_LOGIN_VIEW,
  loaders: themeViews.login,   // 版式组件由 virtual:theme 插件扫描，主题目录 = VITE_THEME_DIR
});
```

库提供：

- `loginPage.views` — 版式注册表（含 `load` / `resolve`）
- `loginPage.pick` — 选择器（URL > 声明 > env > 包名）
- `loginPage.preload` — 预热
- `loginPage.titleOf(device)` — 按设备取标题

> **无 `device` 字段**：设备归一化（校验版式 glob 里的设备目录名是否合法）由库内设备域**自动提供**（`defineThemeDevice` 自动注册，见 6.1.1）。开发者不写 `device`、不 import `asThemeDevice`。

> **`loaders` 从 `virtual:theme` 拿，不自己 glob**：主题目录由 env `VITE_THEME_DIR` 指定（**单一来源**），`virtual:theme` 插件读它、扫 `themes/<包>/<设备>/<页面>/index.vue` 并按页面分组出 `themeViews`。🔴 不写 `import.meta.glob('/src/theme/...')`——那会把主题目录硬编码成第二个真相，且 `import.meta.glob` 入参必须字面量、吃不了 env 变量。搬主题目录到别的项目只改 env，页面文件零改动。

---

## 触点 2：渲染版式 — `<ThemeView>`（新增，取代手工 watch）

开发者写（容器里，如 `view/app/login/index.vue`）：

```vue
<script setup lang="ts">
import { ThemeView } from 'skinsuite/vue';

// 其余全是业务逻辑：表单、校验、ctx 组装……
</script>

<template>
  <ThemeView page="login" device="mobile" :ctx="ctx" />
</template>
```

`<ThemeView>` 内部自动做了（开发者不再手写）：

```
┌─ watch([viewId, packageId]) ──────────────────────────┐
│  loginPage = 页面域取(page)                            │
│  fallback  = themeViews 取 default/<device>/<page>     │
│  viewId    = loginPage.pick({ url, theme, pkg, device })│
│  ↓                                                     │
│  loginPage.views.load(id, pkg, device)                 │
│  │  → epoch 防抖                                       │
│  │  → markRaw(loaded) ?? fallback                     │
│  └→ <component :is="activeView" :ctx="ctx" />         │
│                                                        │
│  + setActivePageView(page, viewId)  (immediate)        │
└────────────────────────────────────────────────────────┘
```

Props 契约：

| prop | 类型 | 说明 |
|------|------|------|
| `page` | `string` | 页面名（`'login'`）；内部从页面域取 `loginPage`（`defineThemePage` 产物） |
| `device` | `string` | 设备名（容器身份） |
| `ctx` | `object` | 业务上下文（传进版式组件的 props） |

> **不写 `loginPage` / `BaseLoginView` 的 import**：`page` 传页面名，内部从页面域自动取 `loginPage`（`loginPage` 与主题包是搭配的）；`fallback`（内置包 `default` 基础版式）路径是**约定**——`<主题目录>/themes/default/<device>/<page>/index.vue`，其中 `<主题目录>` 由 `VITE_THEME_DIR` 配置、`themes/default` 固定、`device`/`page` 是传入的、`index.vue` 固定。内部从 `themeViews`（`virtual:theme`）自动取，**首屏零请求那条路径保留**。

---

## 触点 3：组装 ctx（不改，现行已统一）

开发者写：

```ts
const ctx = reactive({
  t, appName, hasAppName,
  panel, title, subtitle,
  mode, direction, fields: { email, code, ... },
  keepLogin, agreed, submitting,
  actions: { submit, switchMode, sendCode, goRegister, ... }
});
```

库提供：`LoginViewContext` 类型（契约），编译期自检（`assertLoginContract`）。

---

## 触点 4：全局外壳 — `<ThemeRoot>` / `<ThemeDebugPanel>`

开发者写（`App.vue`，直接 import 库的组件，不再有宿主接线壳）：

```vue
<script setup lang="ts">
import { ThemeRoot, ThemeDebugPanel } from 'skinsuite/vue';
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();
</script>

<template>
  <ThemeRoot :themeStore="themeStore">
    <RouterView />
    <ThemeDebugPanel />
  </ThemeRoot>
</template>
```

Props 契约（`ThemeRoot`）：

| prop | 类型 | 必传 | 说明 |
|------|------|------|------|
| `themeStore` | `ThemeStoreLike` | ✅ | 库从它读 `isDark`（挂内部 dark 类），并 provide 给 `<ThemeDebugPanel>` |

`ThemeRoot` **只管外观**（两件事）：

```
┌─ ThemeRoot ───────────────────────────────┐
│  ① 内部容器挂 .dark 类（themeStore.isDark）│
│  ② body 容器 token 底色 + 过渡             │
│  <slot />                                  │
└───────────────────────────────────────────┘
```

> **「主题来源同步」不在 ThemeRoot**：父应用主题同步（`useParentThemeSync`）和拉后端配色（`fetchRemoteThemeConfig`）都是**主题意图来源**（和 URL / 用户操作 / localStorage 同类），归**主题运行时**（见触点 6），库读 env（`VITE_ALLOWED_PARENT_ORIGINS` / `VITE_THEME_ENDPOINT`）驱动，宿主零传参。ThemeRoot 只管外观，不再有 `parentSync` / 远程拉取。

> **删掉宿主接线壳**：`@/components/ThemeRoot.vue`、`@/composables/remote-theme.ts`、`@/composables/useThemeDebugPanel.ts` 都删。

> **`<ThemeDebugPanel/>` 无 host**：调试面板 host 由库自动组装——`store` 经 `ThemeRoot` provide、`router` 经 `app.use(theme, { router })`（触点 5）、页面/主题/配色/设备来自各「域」的自动注册（见 6.1.1）。宿主不写 `makeThemeDebugPanelHost`。

---

## 触点 5：启动接线 — `app.use(theme, { router })`

开发者写（`bootstrap.ts`，一行）：

```ts
app.use(pinia);
app.use(router);
app.use(theme, { router });   // 只传 router，库自己监听链接变动 + 判定设备
```

库内部自动做了：

- **设备判定**：监听路由（链接变动）+ 视口（`matchMedia`，阈值可配），用设备清单的 `match`（6.1.1）判定设备 → 更新设备域的 `activeDevice`。
  - 信号来源：`path` / `query`（从 router 拿）+ `viewportIsMobile`（库用 `matchMedia` 判定）。
  - 🔴 **路由不标 `meta.device`**：设备判定只有「设备清单 `match`」一个来源，`meta.device` 这个冗余基线删掉。

- **设备域维护 `activeDevice`**：宿主 store 从设备域**订阅** `activeDevice`，不再自己维护 / 同步。

**store 实例化不需要开发者写**：`App.vue` 的 setup 为了给 `<ThemeRoot>` 传 `themeStore` prop（触点 4）本来就会调 `useThemeStore()`——store 实例化顺带发生，`runtime` 的 token 注入（`applyThemeLayers`）也随之执行。

> **注册表安装不是触点**：`buildThemeRegistry` + `installThemeRegistry`、`themeManifest` 清单解析、`createPageIndex` 页面索引，都在 `import theme-manifest` 的**模块求值期副作用**里自动完成——**开发者无需调用、无感知**，不算「触点」，不列在这里。

> **只传 `router` 就够**：设备来源（`path`/`query`）从 router 拿、视口用库默认 `matchMedia`、判定结果存在设备域（store 订阅）、store 由 `App.vue` 的 setup 组装 `themeStore` 时自然实例化——全部收进库，宿主只写 `app.use(theme, { router })` 一行，不写 `deviceSource`、不标 `meta.device`、不手动 `setActiveDevice`、不显式 `useThemeStore()`。

> **时序（token 首帧不闪）**：`app.mount()` 是**同步**的——`App setup（useThemeStore → token 注入）→ 递归渲染`都在 mount 内部完成；浏览器**首次 paint 在 mount 返回之后**（JS 宏任务结束）。所以 token 注入赶在 paint 前完成，首帧即终态。🔴 分界是 **paint**，不是 mount——`store` 实例化不必卡在 `app.mount()` 调用之前。

---

## 触点 6：使用主题（选择与生效）

前 5 个触点讲的是「**页面怎么接入版式**」。这一节讲「**一套主题（主题包 + 配色 + 明暗）是怎么被选出来、怎么作用到全站的**」。

### 6.1 主题的三个维度

一套「主题」拆成三个正交维度，落到一个作用域（设备）：

| 维度 | 值 | 说明 |
|------|-----|------|
| `th`（版式） | 版式 id | **≡ 主题包名**（一个包 = 一种版式），决定 DOM 结构与交互组织 |
| `th_color`（配色） | 配色 id | `themes/<包>/<设备>/<页面>/colors/<配色>/`，决定 token 与背景 |
| `mode`（明暗） | `light` / `dark` / `system` | 用户意图；「明暗 ≡ 配色系别」（`tone`），单向联动（**无 URL 入口**） |
| （作用域）设备 | `mobile` / `standard` / `mini` | 不是偏好，是**页面身份**；每台设备在配置里带一个**缩写名**（URL 后缀用） |

### 6.1.1 设备类型声明（`defineThemeDevice`）

设备类型用**工厂函数声明**，与 `defineThemePage` 同一手法：**开发者只写设备清单约定，机制全收进库**。每条 `defineThemeDevice({...})` 声明会**自动注册**进库内「设备域」，库据此自动派生整套机制（归一化白名单、设备判定、容器表）——开发者**不写** `createDeviceRegistry` 装配、不手动组数组、不转发 `asKnownDevice`。

```ts
// theme/views/devices.ts —— 开发者只写这一份设备清单约定
import { defineThemeDevice } from 'skinsuite/vue';
import { THEME_ID_RE } from 'skinsuite';

// 每条声明自动注册（顺序 = 优先级，末条必须 fallback 兜底）
export const miniDevice = defineThemeDevice({
  id: 'mini',
  label: '紧凑版',
  urlKey: 'mini',                      // 缩写名（URL 后缀用）
  containers: {
    glob: import.meta.glob('/src/view/mini/*/index.vue'),  // 独立目录：view/mini/<页面>/index.vue
    fileRe: /^index\.vue$/,
    idRe: THEME_ID_RE
  },
  routePath: page => `mini/${page}`,    // 统一层级：mini/login（与 tablet/login 同构）
  match: {                              // 声明式：不再手写闭包
    from: ['mini'],
    fromLogin: ['mini'],
    pathSegment: 'mini'
  }
});

export const tabletDevice = defineThemeDevice({
  id: 'tablet',
  label: '平板',
  urlKey: 'tab',
  containers: {
    glob: import.meta.glob('/src/view/tablet/*/index.vue'),
    fileRe: /^index\.vue$/,
    idRe: THEME_ID_RE
  },
  routePath: page => `tablet/${page}`,
  match: { from: ['tablet'] }
});

export const mobileDevice = defineThemeDevice({
  id: 'mobile',
  label: '手机端',
  urlKey: 'mobile',
  containers: {
    glob: import.meta.glob('/src/view/app/*/index.vue'),
    fileRe: /^index\.vue$/,
    idRe: THEME_ID_RE
  },
  routePath: page => `m/${page}`,
  match: { explicitMobile: true, viewportMobile: true }   // 任一命中（OR）
});

export const standardDevice = defineThemeDevice({
  id: 'standard',
  label: '桌面端',
  urlKey: 'std',
  containers: {
    glob: import.meta.glob('/src/view/web/*/index.vue'),  // 独立目录：view/web/<页面>/index.vue
    fileRe: /^index\.vue$/,
    idRe: THEME_ID_RE
  },
  routePath: page => page,
  match: { fallback: true }              // 兜底：无条件命中（必须是清单末条）
});
```

> **自动注册**：`defineThemeDevice` 内部把声明注册进库内设备域，并据此派生整套机制 —— 归一化白名单（`asKnownDevice`）、设备判定（`pickDeviceId`）、容器表（`containersOf`）等。**默认设备（兜底设备）的指定先不在这里定**，后续另行明确。

> **设备域的运行时状态**：设备域还维护一个响应式 `activeDevice`（当前生效设备），由 `app.use(theme, { router })`（触点 5）监听路由 + 视口（`matchMedia`，阈值可配）→ `pickDeviceId` 判定后写入；宿主 store 从设备域**订阅** `activeDevice`，不再自己维护 / 同步。`match` 里的 `viewportMobile` 信号即由库的 `matchMedia` 判定提供。

> **三个「域」的自动注册**：与设备清单同构，页面清单（`defineThemePage`）自动注册进**页面域**（派生页面索引 `pageFromPath` / `viewsForPage`），主题清单（`theme-manifest` 装配）自动注册进**主题域**（派生 `manifest.debug` 等）。三者都进库，库内部（如 `<ThemeDebugPanel>` 的 host 组装）统一从域取用，宿主不写转发。🔴 版式组件的扫描与 `theme.config.ts` 因 `import.meta.glob` / 虚拟模块字面量约束，由 `virtual:theme` 插件统一在**构建期**完成（读 `VITE_THEME_DIR`），但**装配产物自动注册进库**——这是 `<ThemeDebugPanel/>` 无 host、`loaders` 不自己 glob 的前提。

**`containers` 三参数**（工厂内部自动执行 `pageContainers(glob, fileRe, idRe)`，宿主不再 import `pageContainers`）：

| 参数 | 类型 | 说明 |
|------|------|------|
| `glob` | `Record<string, loader>` | `import.meta.glob(...)` 的返回值。🔴 **必须写成字面量调用**（Vite 构建期静态展开，参数不接受变量），故这一句仍留在宿主、只写一次 |
| `fileRe` | `RegExp` | 文件名匹配正则（决定「哪个文件算容器入口」）。规范态入口文件统一 `index.vue`，`fileRe` 固定 `/^index\.vue$/` |
| `idRe` | `RegExp` | 页面名白名单（统一用 `THEME_ID_RE`，`[a-z0-9-]`） |

> 规范约定：每台设备一个独立容器目录 `view/<设备>/<页面>/index.vue`，`glob` 统一 `/src/view/<设备>/*/index.vue`、`fileRe` 统一 `/^index\.vue$/`，只有 `glob` 的路径段随设备不同；`idRe` 永远 `THEME_ID_RE`。

**`match` 声明式字段**（各字段之间是 **OR** 关系，任一命中即判定为该设备；`fallback` 与其它字段互斥）：

| 字段 | 语义 |
|------|------|
| `explicitMobile` | `?isMobile=true` |
| `viewportMobile` | 视口/UA 判为手机 |
| `from` | `?from=` 命中任一值 |
| `fromLogin` | `?fromLogin=` 命中任一值 |
| `pathSegment` | 路径含某整段/前缀 |
| `fallback` | 兜底（无条件命中） |

> 🔴 **优先级规则（库内唯一实现）**：判定按清单顺序先命中先用；`explicitMobile` 是**全局最高优先信号** —— 一旦 `ctx.explicitMobile=true`，直接跳过所有 `match` 里带 `from`/`fromLogin`/`pathSegment` 的条目，落到带 `explicitMobile: true` 的条目（mobile）。这样 mini/tablet 无需手写「排除显式手机意图」的逻辑，宿主只声明命中信号、不写排除。

> `urlKey`（缩写名）在这里一并声明（见 6.3）；全名 `id` 与缩写名分离，URL 专属参数后缀用 `urlKey`。

### 6.2 来源与优先级（高 → 低）

**配色 `th_color`**：

```
用户显式操作（点色卡 / 切明暗）
  > URL  ?th_color_<设备缩写> / ?th_color=
  > 后端下发 / 父应用 postMessage
  > localStorage
```

**明暗 `mode`**（**无 URL 入口**，只能用户操作 / 后端下发 / 父应用）：

```
用户显式操作
  > 后端下发 / 父应用
  > localStorage
  > 跟随系统（prefers-color-scheme）
```

**版式 `th`**（见触点 1/2，这里只列全貌）：

```
URL ?th_<设备缩写> / ?th=  >  主题包声明 views.<page>  >  VITE_<PAGE>_VIEW  >  当前包名
```

> 🔴 URL 是**锁**：`?th_color_<设备缩写>=blue` 会锁住该设备这一条，任何**自动**改写（后端下发、明暗联动）都不再干预它，只有用户**显式操作**能压过。设备专属键优先于通用键；空串视为「未指定」，不锁。

> **来源同步归主题运行时**：`后端下发`（`fetchRemoteThemeConfig`，读 `VITE_THEME_ENDPOINT`）与 `父应用 postMessage`（`useParentThemeSync`，读 `VITE_ALLOWED_PARENT_ORIGINS`）这两个「来源的同步机制」都在**主题运行时**（store 的 runtime），库读 env 驱动、宿主零传参；不在 `<ThemeRoot>` 外壳（见触点 4）。

### 6.3 URL 入口（查询参数）

URL 参数命名规范：**版式用 `th`，配色用 `th_color`**。设备专属参数用**下划线**连接设备缩写名：`th_<设备缩写>` / `th_color_<设备缩写>`（**不用点号 `.`**；`<设备缩写>` 由设备配置里的「缩写名」字段决定，不是硬编码的设备 id）。

| 参数 | 语义 | 示例 |
|------|------|------|
| `?th=<id>` | 三端通用版式 | `/login?th=compact` |
| `?th_<设备缩写>=<id>` | 某设备专属版式 | `/login?th_mobile=default&th_std=compact` |
| `?th_color=<id>` | 三端通用配色 | `/login?th_color=blue` |
| `?th_color_<设备缩写>=<id>` | 某设备专属配色 | `/login?th_color_mobile=blue&th_color_std=black` |

**设备缩写名**：每台设备在配置（`devices.ts` 的设备清单）里手动声明「全名（id）」和「缩写名（urlKey）」，见 6.1.1。URL 专属参数的后缀一律用**缩写名**。示例（与 6.1.1 的声明一致）：

```
全名 id   缩写名(urlKey)   版式专属参数       配色专属参数
mobile    mobile          th_mobile          th_color_mobile
standard  std             th_std             th_color_std
tablet    tab             th_tab             th_color_tab
mini      mini            th_mini            th_color_mini
```

> 缩写名是**宿主事实**（设备词汇表的一部分），由设备清单声明决定；内核不硬编码任何缩写，只按 `defineThemeDevice`（6.1.1）产出的 `urlKey` 派生 URL 后缀。

**设备定义字段约定**（完整契约见 6.1.1 的 `defineThemeDevice`，这里只列缩写名相关）：

- URL 专属参数后缀 = `urlKey`，**不**用 `id`。缩写名与全名可相同（如 `mobile`、`mini`），也可不同（如 `standard` → `std`、`tablet` → `tab`）。
- 缩写名必须唯一（同一份设备清单内），且只允许 `[a-z0-9]`（URL 参数名不允许 `-`/`.` 之外的符号，这里从简取 `[a-z0-9]`）。
- 内核据此派生 `?th_<urlKey>` / `?th_color_<urlKey>` 的读取，宿主不改任何解析代码，只改清单声明。

**三端各一套配色 / 版式的组合示例**：

```
/login?th_color_mobile=blue&th_color_std=black&th=default
```

- `mobile`（缩写 `mobile`）用 `blue`，`standard`（缩写 `std`）用 `black`；
- `mini`（缩写 `mini`）无专属键 → 走通用键 / localStorage；
- 非法值一律折成 null（不抛错、不锁项），让后端配置与本地存储照常参与。

### 6.4 程序化 API（`useThemeStore()`）

开发者/用户在代码里切换主题的入口，全部挂在 `themeStore` 上（三 composable 编排后对外直通）。

**两个状态**：`mode`（明暗意图 `light`/`dark`/`system`）+ `themeId`（配色 id）。**「明暗 ≡ 配色系别」**这条不变量由**一对**联动函数维护（不再散落）：

- `syncColorToTone(dark)`：明暗 → 配色（`mode` 变了，把 `themeId` 切到匹配系别）；
- `syncModeToTone(tone)`：配色 → 明暗（`themeId` 变了，把 `mode` 同步到该系别）。

**方法分三类**：

| 类型 | 方法 | 作用 | 备注 |
|------|------|------|------|
| 显式操作（落盘，先清 URL 覆盖） | `setTheme(id)` | 设配色：resolve → 清覆盖 → 设 themeId → 落盘 → `syncModeToTone` | 落盘复用 `setMode`，不手写 |
| | `toggleTheme()` | 白系 ↔ 黑系，纯反色不进 `system` | 先清 URL 覆盖 → `setMode` |
| | `cycleMode()` | 循环 `system → light → dark` | 先清 URL 覆盖 → `setMode` |
| 底层原语 | `setMode(mode)` | 设明暗意图（**唯一**「mode 落盘」入口） | **不**清 URL 覆盖；`mode.value + safeSet` 只此一处 |
| 外部配置（不落盘） | `applyThemeConfig(cfg)` | 应用后端 / 父应用配置 | URL 锁定时不动；`syncModeToTone` 复用（不落盘、守 URL 锁） |
| 读侧 | `viewFor(page, device?)` | 读某页声明式版式 | 只取值不校验 |

> **收敛的重复**：`setTheme` 不再手写「`mode.value + safeSet`」（改调 `setMode`）；「配色 tone → mode」联动收敛为单一 `syncModeToTone`（`setTheme` 与 `applyThemeConfig` 共用，差异靠参数：是否落盘 / 是否守 URL 锁）。于是「明暗 ≡ 配色系别」的双向联动成对：`syncColorToTone` / `syncModeToTone`，而非「一个函数 + 两段散代码」。

**读侧状态**（响应式，`computed`/`ref` 直读）：

| 状态 | 含义 |
|------|------|
| `themeId` | 全局配色意图 |
| `packageId` | 当前生效主题包（= 版式 id） |
| `activeDevice` / `activePage` / `activeView` | 当前生效作用域 |
| `isDark` / `activeTone` | 当前是否深色 / 生效配色系别 |
| `themes` | 可选主题列表 |

### 6.5 路由 / 守卫

**设备判定（路由不标 `meta.device`）**：设备由设备清单的 `match`（6.1.1）在**运行时**判定（`pickDeviceId`），信号来自 `path` / `query` / 视口，不是路由声明的字段。分发器按实际渲染形态渲染（窄视口 mobile 容器、宽视口 standard 容器，URL 不被改写）：

```ts
// routes.ts：各设备路由自动生成，带版式预取（不标设备，设备由 match 判定）
// （path 一律取 DeviceDef.routePath(page)，与 6.1.1 的声明同源）
const pageRoutes = listPageViews().map(pv => ({
  path: pv.page,
  component: dispatchers[`/src/view/web/${pv.page}/index.vue`],
  meta: { title: pv.title }
}));

const mobilePageRoutes = listPageViews().map(pv => ({
  path: `m/${pv.page}`,
  component: dispatchers[`/src/view/web/${pv.page}/index.vue`],
  meta: { title: pv.titleOf('mobile') },
  beforeEnter: withViewPreload(pv.preload, pv.page)  // 版式 chunk 预取
}));
```

> 🔴 路由**不标 `meta.device`**：设备是「设备清单 `match` 判定」的结果（`path` / `query` / 视口），不是路由声明的字段——`meta.device` 这个冗余基线删掉，设备判定只剩一个来源。

**各设备路由前缀（`DeviceDef.routePath`，统一层级语义：`<设备>/<页面>`）**：

| 设备 | routePath | login 页实际路径 | 容器目录（框架规范） |
|------|-----------|-----------------|---------------------|
| mobile | `m/${page}` | `/m/login` | `view/app/`（独立目录） |
| tablet | `tablet/${page}` | `/tablet/login` | `view/tablet/`（独立目录） |
| mini | `mini/${page}` | `/mini/login` | `view/mini/`（独立目录） |
| standard | `${page}` | `/login` | `view/web/`（独立目录） |

> 🔴 **框架规范：一台独立设备 = 一个独立容器目录**（`view/mini`、`view/tablet`、`view/app`、`view/web`），目录名即设备身份，`routePath` 统一 `<设备>/<页面>` 层级。

**版式预取**（`withViewPreload`）：在 `beforeEnter` 里调 `pv.preload(...)`，提前把版式 chunk 拉进模块缓存。🔴 预取的 `source` 必须与容器的 `pick` **同源**（`url` 即 `?th` 参数 + `theme` 即包声明的 `views.<page>` + `pkg` + `device` 四样都给齐），否则算出一个与容器**不同**的 id —— 白拉一个用不上的 chunk，真正要用的那个仍得现场等。预取失败静默（`try/catch` 吞掉），绝不影响导航。

### 6.6 完整生效链路（端到端）

从「意图来源」到「token 注入 DOM」的整条链：

```
意图来源（URL / 操作 / 后端 / 父应用 / localStorage / 系统）
        │  readUrlIntent() + readInitialTheme() + readInitialMode()
        ▼
useThemeStore()  ── 三 composable 编排 ──────────────────────────┐
  ├─ scope  (theme-scope)  设备/页面/版式作用域 + themeRecordFor() │
  ├─ intent (theme-intent) 明暗意图 + 记忆槽 + 明暗↔配色联动        │
  └─ runtime(theme-runtime) token 注入 + 附加样式 + dark 类        │
        │   + 来源同步（后端 fetch / 父应用 postMessage，库读 env）│
        │                                                         │
        ▼                                                         │
  themeRecordFor() ──▶ getThemeRecord({id, device, pkg, page})     │
        │  （回退链：精确匹配 → 同系别首套 → 该范围兜底 → 空记录）  │
        ▼                                                         │
  runtime 作用到 DOM：                                             │
    · applyThemeLayers() → <html> inline CSS 变量                 │
    · html.dark 类（isDark = 生效配色 tone）                       │
    · data-mauth-theme 属性                                        │
    · theme.scss 附加样式（惰性加载 + epoch 防串台）               │
        │                                                         │
        ▼                                                         │
  版式组件消费 token（var(--mauth-*)）+ 容器渲染 ctx ───────────────┘
```

> 🔴 编排顺序不可乱：`scope → intent → runtime`，runtime 内部有 `immediate` watcher 依赖前两步，顺序错了会踩 TDZ。这是拆成三 composable 时踩坑定型的结论，收在库内不该让宿主重演。

---

## 新增 vs 删除的机制文件

| 文件 | 动作 | 理由 |
|------|------|------|
| `vue/ThemeView.vue` | 新增 | 收掉每个容器的 40 行 watch+epoch+load 样板；props 精简为 `{ page: string, device, ctx }`——`page` 传页面名（内部从页面域取 `loginPage`）、`fallback` 内部自动算（`themes/default/<device>/<page>/index.vue`，从 `themeViews` 取） |
| `vue/ThemeRoot.vue` | 保留 | 退化为**纯外观壳**：props 改为 `{ themeStore }`（读 isDark + provide DebugPanel）；父主题同步 / 远程拉取剥离到主题运行时 |
| `vue/ThemeDebugPanel.vue` | 新增 | 调试面板独立组件，无 host（库自动组装：store 经 ThemeRoot provide + 各「域」自动注册），`?debug=theme` 时才下载/显示 |
| `vue/view-registry.ts` | 保留 | 版式注册表内核 |
| `vue/view-page.ts` | 保留 | `defineThemePage` 工厂 |
| `vue/page-index.ts` | 保留 | `createPageIndex` |
| `vue/view-picker.ts` | 保留（或并入 registry） | 选择器 |
| `vue/view-pages.ts` | 保留（或并入 page-index） | 汇总 |
| `vue/defineThemeDevice.ts` | 新增 | 设备声明工厂：吃 `{ id, label, urlKey, containers, routePath, match }`，内部统一 `pageContainers(glob, fileRe, idRe)` + 声明式 `match` 判定 + 优先级规则，并**自动注册进设备域**（自动派生归一化白名单 / 设备判定，宿主不写 `createDeviceRegistry` 装配与转发） |
| `vue/device-containers.ts` | 保留 | `pageContainers` 内核，改由工厂内部调用，宿主不再直接 import |
| `vue/device-domain.ts` | 新增 | 设备域运行时：`defineThemeDevice` 自动注册进这里，维护响应式 `activeDevice`，`matchMedia` 视口判定 + 路由监听 → `pickDeviceId` 判定设备（`app.use(theme, { router })` 时装配） |
| 容器里的 40 行 watch+load | 删除 | 由 `<ThemeView>` 替代 |
| 容器里的 setActivePageView watch | 删除 | 由 `<ThemeView>` 内部做 |

---

## 一个完整容器的最终形态（login 页为例）

```vue
<script setup lang="ts">
import { ThemeView } from 'skinsuite/vue';

// ── 全部是业务逻辑：表单、校验、ctx 组装 ──
const { values, errors, defineField, handleSubmit } = useForm({…});
const { showConsent, consentState, … } = useLoginFlow({…});
const ctx = reactive({
  t, appName, hasAppName,
  panel, title, subtitle,
  mode, direction, fields: { email, code, username, password },
  keepLogin, agreed, submitting,
  actions: { submit, switchMode, sendCode, goRegister, … }
});
</script>

<template>
  <ThemeView page="login" device="mobile" :ctx="ctx" />
  <GraphicCaptcha … />
  <AgreementModals … />
  <MessageToast />
</template>
```

---

## 总结

一个页面容器开发者只关心 5 件事，其余全由库提供：

| # | 触点 | 开发者写什么 | 库提供什么 |
|---|------|-------------|-----------|
| 1 | 声明页面 | `defineThemePage({…})` | 版式注册表 + 选择器 |
| 2 | 渲染版式 | `<ThemeView>` 或 `useThemeView()` | 加载、epoch 防抖、回退 |
| 3 | 组装 ctx | 业务容器写 `reactive({…})` | 契约类型 `LoginViewContext` |
| 4 | 全局外壳 | `<ThemeRoot :themeStore />` + `<ThemeDebugPanel/>` | dark 类、token、调试面板（来源同步归运行时） |
| 5 | 启动接线 | `app.use(theme, { router })` | 设备判定（match）+ 设备域维护 activeDevice |
| 6 | 使用主题 | URL / `themeStore` 切换方法 | 选择器、回退链、token 注入 |

核心机制改动：新增 `<ThemeView>` 组件（收掉每个容器复制粘贴的「view 加载 + epoch 防抖 + 回退」样板）、新增 `defineThemeDevice` 设备声明工厂（自动注册进设备域，收掉 `pageContainers` + `createDeviceRegistry` 装配 + `asKnownDevice` 转发 + 声明式 `match` 判定）。
