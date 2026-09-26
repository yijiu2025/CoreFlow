# 主题框架抽包立项（theme-core / theme-vue）

> **状态：立项；Stage 0 / Stage 1 已完成**（定案 2026-09-26）。
> 已落地 = 纯叶子层进包 + 应用侧零逻辑壳；**注册表、picker、store 仍全在 `oauth21/src/`**（Stage 2 起迁）。
> 适用范围：`oauth21` 的主题层（`src/theme/**` + `src/stores/theme.ts`），以及未来任何要复用这套机制的前端。
> 上游规则：[多主题 / 多版式开发模式](/frontend/multi-theme)（本页只讲"怎么搬走"，不重复"规则是什么"）。
>
> ⚠️ **阅读约定**：本页把「**现状**」与「**目标**」严格分开。带 §二 的每一条现状都有 `grep` / `Read` 作依据；
> 带 §三 之后的都是**尚未实现的提案**，不得被当成规则引用 —— 抽包是一段演进，写进代码之前它只是计划。

## 〇、一条原则

**内核不知道 Vue 之外的任何东西，壳不知道业务。**

推论有三条，后面所有设计都是它的展开：

1. 内核（`theme-core`）里**不允许**出现 `import.meta.*`、`window`、`document`、`localStorage`、`vue-router`、`axios` —— 它是纯函数 + 数据。
2. 一切"外面长什么样"的东西（文件怎么被扫到、环境变量叫什么、往哪个 DOM 节点写、存到哪）都走**注入**。
3. 业务永远不进包：`themes/**`（版式实现与配色数据）、`view/app/<page>/`（容器）、每页 ctx 契约都留在应用侧。

## 一、目标与非目标

**目标**：把主题层里**与业务无关**的部分抽成两个工作区包，使另一套前端能通过"换一个适配器"拿到
同一套「主题包 → 设备 → 页面 → 配色」机制，而不是复制 3600 行、再各自漂移。

**非目标**（明确不做，避免范围失控）：

| 不做 | 原因 |
| --- | --- |
| 主题包上云 / 运行时下载 | 仍是"构建期目录 + 编译期 glob"。运行时下载会引入签名、缓存、版本对齐三件套，本阶段不背 |
| 改「一个主题包 = 一种版式」的结构 | 2026-09-26 已定案（见 [multi-theme.md](/frontend/multi-theme)），抽包**不**动结构 |
| SSR / 非 DOM 渲染目标 | 当前 target 只有浏览器。内核本身已无 DOM，将来要支持再补适配器即可 |
| 把 `themes/**` 搬进包 | 版式实现与配色数据是**业务资产**（认证页长什么样），随应用走 |
| 本期就发 npm | 先做**工作区源码直供**（与 `stable-deviceid` 同形）；发布是后话，见 §八 |

## 二、现状盘点（全部有出处）

### 2.1 体量

| 部分 | 文件数 | 行数 | 说明 |
| --- | --- | --- | --- |
| `src/theme/**/*.ts` | 12 | 2697 | 主题机制与契约 |
| `src/stores/theme.ts` | 1 | 905 | Pinia store：决策链 + DOM 应用 + 调试出口 |
| `src/theme/themes/**/index.vue` | 10 | — | 版式实现（业务侧资产） |
| `src/theme/themes/**/colors/*/index.ts` | 31 | — | 配色 tokens（业务侧资产） |
| `src/theme/themes/**/colors/*/theme.scss` | 8 | — | 惰性样式（业务侧资产） |

另有两个"外围"但同属这一层的消费者：`components/dev/ThemeDebugPanel.vue`（526 行，调试面板）与
`composables/useParentThemeSync.ts`（88 行，父应用 postMessage 同步）。

### 2.2 依赖：**已经比预想的干净**

对 `src/theme/**` 与 `src/stores/theme.ts` 的非相对 import 做统计，只有三类：

| 依赖 | 出现次数 | 处置 |
| --- | --- | --- |
| `@/`（应用内别名） | 76 | 其中绝大多数是 `themes/**` 的配色/版式文件 import 类型；内核文件里的要消掉 |
| `vue` | 15 | `reactive`/`watch`/`computed`/`ref` + `Component` 类型 → 归 `theme-vue` |
| `pinia` | 1 | `defineStore` → 归 `theme-vue` |

**没有 axios、没有业务模块、没有 UI 库。** 这是"能抽"的根本原因。

### 2.3 四处平台耦合 —— 要打桩的就是这四处

| # | 耦合 | 出现在（现状） | 现形态 | 目标形态 |
| --- | --- | --- | --- | --- |
| 1 | `import.meta.glob` | `theme/index.ts`（包定义 / 配色 index / `theme.scss` 三处）、`theme/views/pages.ts`、每页 `theme/views/<page>.ts` 的版式 glob | Vite 专有，编译期展开成路径 → 加载器表 | 注入 `ThemeAssets`（见 §五） |
| 2 | `import.meta.env` | 三页各自的 `ENV_VIEW`（`VITE_LOGIN_VIEW` / `VITE_REGISTER_VIEW` / `VITE_FORGOT_PASSWORD_VIEW`）、`stores/theme.ts` 的调试出口用 `import.meta.env.DEV` | Vite 专有 | 注入 `ThemeHostOptions.env` |
| 3 | DOM / 存储 / 系统偏好 | `stores/theme.ts`（`documentElement`、`document.getElementById`、`localStorage`、`matchMedia`）、`theme/runtime.ts`（往 `documentElement` 写 inline token）、`theme/remote.ts`（`window.location.origin` + `fetch`） | 直接摸全局 | 注入 `ThemeHost`（见 §五） |
| 4 | `vue-router` | 只有一处生产耦合：`router/index.ts` 的 `setupThemeDeviceSync` 读 `route.meta.device`。其余是容器读 `route.query`、`router/routes.ts` 的 `beforeEnter` 预取 | 应用侧接线 | 保留在应用侧（`theme-vue` 只提供 `syncDevice(meta)` 这类纯函数） |

> 第 4 项刻意**不**进包：路由是应用自己的世界观（路径语义、`meta` 约定、`/m/*` 与 `/mini-*` 谁存在），
> 包只该提供"给我一个设备基线，我负责把它和渲染形态对齐"。

## 三、目标架构

### 3.1 两个包 + 应用侧

| 层 | 归属 | 装什么 | 依赖 |
| --- | --- | --- | --- |
| 内核 | `packages/theme-core`（`mauth-theme-core`） | 常量与白名单、`types`、`tone`、`mode`、参数读取、token 形态与校验、配色注册表、版式注册表工厂、回退链 | **零运行时依赖**（`Component` 等 Vue 类型用 `import type`） |
| 壳 | `packages/theme-vue`（`mauth-theme-vue`） | Pinia store、DOM 应用（inline token + `theme.scss` 节点）、存储适配、系统偏好订阅、glob 适配器、调试出口 | `vue` + `pinia` + `mauth-theme-core` |
| 应用 | 各前端仓库 | `themes/**`（版式 + 配色）、`view/app/<page>/`（容器）、每页 ctx 契约、路由接线 | 上面两个包 |

### 3.2 依赖方向（单向，可断言）

```
themes/**  →  容器（业务）  →  theme-vue  →  theme-core
                    ↘___________↗（只经公开 API）
```

**禁止反向**：`theme-core` 不得 import `theme-vue`，两个包都不得 import 应用代码（`@/…`）。
这条要落成静态断言（§七），否则抽包三个月后必然出现"包内偷偷依赖宿主"的死结。

### 3.3 目录形态（包的内部）

```
packages/theme-core/
├── package.json           name: mauth-theme-core，源码直供（exports 指 src）
└── src/
    ├── index.ts           唯一公开出口（barrel，显式具名导出）   ✅ Stage 1
    ├── constants.ts       设备 / 页面 / 默认包 / 默认配色 / id 白名单  ✅ Stage 1
    ├── types.ts           包定义、配色定义、记录、元信息          ✅ Stage 1
    ├── tone.ts            系别（light / dark）                  ✅ Stage 1
    ├── mode.ts            明暗意图（system / light / dark）      ✅ Stage 1
    ├── tokens.ts          token 形态 + 白名单校验（刻意拒颜色名与 url()）✅ Stage 1
    └── views/
        ├── params.ts      设备维度参数读取（`?view.<设备>` 链）   ✅ Stage 1
        ├── registry.ts    版式注册表工厂（吃注入的加载器）        ⏳ Stage 2
        └── picker.ts      版式选择器工厂（四档链，见 §四）        ⏳ Stage 2
```

## 四、core 的公开 API 面

**只有 `src/index.ts` 是公开出口**，且必须**显式具名导出**（不用 `export *`）：这张表就是包的承诺，
表里没有的名字不该出去（内部正则、解析器等）；`export *` 会让承诺变成隐式清单，
加一个内部导出就悄悄扩大了对外的面。

> ⚠️ **子路径导出（`mauth-theme-core/tone`）本期不提供**。宿主的 `resolve.alias` / `paths`
> 当前直接指到 `src/index.ts`，子路径根本解析不到；要支持就得同时补 `package.json` 的
> `exports` 子路径与别名里的通配 —— 两张表要一起维护，而目前**一个调用点都没有**。
> 等真有宿主需要"只拿某一小块"时再加，加的时候记得两处同改。

| 导出 | 职责 | 现状出处 |
| --- | --- | --- |
| `THEME_DEVICES` / `ThemeDevice` / `DEFAULT_THEME_DEVICE` | 设备三值白名单与兜底 | `packages/theme-core/src/constants.ts`（Stage 1） |
| `DEFAULT_THEME_PACKAGE` / `DEFAULT_THEME_PAGE` / `DEFAULT_THEME_ID` | 包 / 页面 / 空记录兜底 | 同上 |
| `DEFAULT_THEME_COLOR`（`white`）/ `DEFAULT_THEME_DARK_COLOR`（`black`） | **显式默认配色**与暗系配对 | 同上（2026-09-26 新增） |
| `THEME_ID_RE` | 目录名白名单（包 / 页面 / 配色 id 都进 `data-*` 属性，故要校验） | 同上 |
| `createColorRegistry(assets)` | 由注入的条目建配色注册表 | `theme/index.ts` 的模块级 registry |
| `createViewRegistry({ page, builtinPackage, loaders })` | 版式注册表工厂（`resolve` / `has` / `load`） | `theme/views/registry.ts` |
| `createViewPicker({ page, envView })` | 版式选择器工厂：`?view.<设备>` > `?view` > 声明档 > ENV > 包名 | 三份 `pick*ViewId` 的收口 |
| `readDeviceParam(query, name, device)` / `asThemeDevice(raw)` | 设备维度参数读取与归一 | `packages/theme-core/src/views/params.ts`（Stage 1） |
| `normalizeTone` / `isThemeTone` / `THEME_TONES` / `TONE_LABELS` | 系别判定与展示文案 | `packages/theme-core/src/tone.ts`（Stage 1） |
| `normalizeMode` / `isThemeMode` / `MODE_CYCLE` / `MODE_LABELS` | 明暗意图归一与循环顺序 | `packages/theme-core/src/mode.ts`（Stage 1） |
| `MauthThemeMeta` / `MauthThemePackage` / `MauthThemeColor` / `MauthThemeRecord` | 契约类型（`import type` 消费，编译期擦除） | `packages/theme-core/src/types.ts`（Stage 1） |
| `ThemeTokenOverrides` / `SanitizeResult` / `ThemeTokenLayers` | token 的数据形态 | `packages/theme-core/src/tokens.ts`（Stage 1） |
| `listColorIdsOfTone` | 同系别配色枚举（要读注册表，故不在 `tone.ts`） | `theme/index.ts` |
| `isSafeTokenName` / `isSafeTokenValue` / `isSafeTokenEntry` / `sanitizeOverrides` | token 白名单校验（纯函数，刻意拒颜色名与 url()） | `packages/theme-core/src/tokens.ts`（Stage 1 从 `theme/runtime.ts` 拆出；`runtime.ts` 只留注入动作并**转发**这些名字） |
| `getThemeRecord` / `getThemePackage` / `getDefaultThemeId` / `toneOfAnyScope` / `listColorsOf` | 回退链与列举 | `theme/index.ts` |

> ⚠️ **口径表要引真源**：「选哪套配色」「回退到哪」一律以 `theme-core` 的 `getThemeRecord()` 与
> `createViewPicker()` 为准（实现即真源）。本页只列名字，不复述优先级细节 —— 复述必然漂移。

## 五、四个注入点契约

```ts
/** ① 资产来源：取代 import.meta.glob */
interface ThemeAssets {
  /** 各主题包的包定义（`meta` 与可选的 `views` 声明） */
  packages: MauthThemePackage[];
  /** 各配色的元信息 + tokens（`index.ts`，eager —— 首帧前要能同步校验 ?theme= 合法性） */
  colors: MauthThemeColor[];
  /** 键 = 配色记录键，值 = 惰性取编译后的 CSS 字符串（`theme.scss`） */
  styles: Record<string, () => Promise<string>>;
}

/** ② 环境：取代 import.meta.env */
interface ThemeEnv {
  /** 部署级默认版式，按页给：{ login: 'compact' } ← VITE_LOGIN_VIEW */
  viewByPage?: Partial<Record<string, string>>;
  /** 开发模式（决定是否挂调试出口） */
  dev?: boolean;
}

/** ③ 宿主：取代 document / localStorage / matchMedia / location */
interface ThemeHost {
  /** 写 inline token 与 data-* 属性的根节点（浏览器里是 document.documentElement） */
  root: HTMLElement;
  /** 样式节点容器（浏览器里是 document.head） */
  head: HTMLElement;
  storage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
  };
  /** 当前查询串（浏览器里是 location.search） */
  search(): string;
  /** 系统明暗偏好：取值 + 订阅（浏览器里是 matchMedia('(prefers-color-scheme: dark)')） */
  systemDark: {
    get(): boolean;
    subscribe(listener: (dark: boolean) => void): () => void;
  };
}

/** ④ 路由：只在应用侧用，包提供纯函数 */
// 应用侧：router.afterEach(to => syncDevice(to.meta.device))
```

**Vite 适配器（应用侧，约 15 行）**：

```ts
import { createColorRegistry } from 'mauth-theme-core';

const assets = {
  packages: Object.values(import.meta.glob('./themes/*/index.ts', { eager: true }) as any).map(m => m.default),
  colors: Object.values(import.meta.glob('./themes/*/*/*/colors/*/index.ts', { eager: true }) as any).map(m => m.default),
  styles: import.meta.glob('./themes/*/*/*/colors/*/theme.scss', { query: '?inline', import: 'default' })
};
```

> webpack 适配器把这三行换成 `require.context`；测试环境直接喂数组 —— 同一份内核，三种来源。
> 这也是「按需加载」能被保住的原因：**惰性的是 `styles` 那张表的值**，不是内核。

## 六、迁移分期

| 期 | 内容 | 状态 |
| --- | --- | --- |
| **Stage 0** | 仓内收口（抽包前置）：① 默认配色收口成显式常量 `DEFAULT_THEME_COLOR`；② 补 `withViewPreload` 漏掉的版式声明档；③ 三份 `pick*ViewId` 收成 `createViewPicker` | ✅ 本轮完成 |
| **Stage 1** | 建 `packages/theme-core`，迁**纯叶子层**：`constants` / `tokens` / `tone` / `mode` / `types` / `views/params`；应用侧留同名 re-export 壳，`@/theme/*` 导入面一个字不变 | ✅ 本轮完成 |
| **Stage 2** | 迁 `views/registry.ts` 工厂 + `createViewPicker` 进包；版式 glob 变成注入 | 待做 |
| **Stage 3** | 迁配色注册表（`theme/index.ts` 的 registry + 回退链）；`import.meta.glob` 改为注入 `ThemeAssets`（token 校验已在 Stage 1 随 `tokens.ts` 进包） | 待做 |
| **Stage 4** | 迁 store 的**纯逻辑**（URL 意图归一、回退链、明暗联动规则）；DOM 应用与存储拆成 `ThemeHost` 适配器 | 待做 |
| **Stage 5** | 抽 `mauth-theme-vue`，应用侧只剩 `themes/**` + 容器 + 路由接线 | 待做 |

**每期都必须保持"应用侧导入面不变"**：`@/theme/*` 的路径继续可用（Stage 1/2/3 靠 re-export 壳），
容器与版式代码不改一行。这样任何一期都可以**独立回滚**（删壳换回实现）。

## 七、每期统一的验收判据

一期没全绿 = 这一期没做完：

1. `npm run type-check`（`vue-tsc -b`，口径见 [coding-standard](/frontend/coding-standard)）0 错。
2. `npx eslint src/` 0 错；`npm run docs:build` exit 0。
3. `.tmp-probe/verify-theme-dirs.mjs` 全绿 —— **它现在能跨"实现还在 `src` 还是已进包"两处找源码**（`implText` 解析器），
   所以抽包期间不用改断言逻辑，只在断言真的失效时才改。
4. 毒丸验证仍然有效（`.tmp-probe/poison-verify-theme-dirs.mjs`，含"默认配色改回 `black` 必须变红"）。
5. 按需加载不退化：`.tmp-probe/verify-first-paint-budget.mjs` 全绿（首屏仍**零个非内置包版式 chunk、零个 `theme.scss`**）。
6. **依赖方向断言**（§〇 原则的唯一机械保障）—— 已落地为 `verify-theme-dirs.mjs` 第 13 节，三类共 18 条：
   - 内核源码（剔掉注释后）不得出现 `import.meta` / `window.` / `document.` / `localStorage` /
     非 `import type` 的 `vue` / `vue-router` / `axios`·`fetch` / `@/` 别名；
   - `src/index.ts` 必须含全部关键导出，且**不用 `export *`**；
   - `src/theme/` 下的壳文件除「注释 + 从 `mauth-theme-core` 转发」外**空无一物**（"同一时刻只有一个实现"）。
   对应的毒丸 ⑦（内核塞 `window.location`）与 ⑧（壳里塞 `const __logic = 1`）都必须让关卡变红。

## 八、风险与回滚

| 风险 | 处置 |
| --- | --- |
| 抽包期间出现"两份真相"（`src` 与包各有一份实现） | 铁律：**同一时刻只有一个实现**，另一侧只允许是 re-export 壳。壳文件里不得有任何逻辑 |
| 守卫脚本按路径读源码 → 迁一个文件就要改一堆断言 | 已引入 `implText(['views/params.ts'])` 这类解析器：候选相对路径 × 两个根目录，实现搬走不用改断言 |
| `vue-tsc -b` 与"工作区源码包"不兼容 | 已有先例：`stable-deviceid` 用 `tsconfig.app.json` 的 `paths` + `include` 指到 `packages/shared-device/src/**`，Vite 侧用 `resolve.alias` 指同一份源码。照抄这套 |
| 包被误当成"可复用"而先于成熟度发布 | 本期**不发 npm**：`exports` 指向源码，只作工作区消费。发布另立一项，需先补齐 `dist` 构建与版本策略 |
| 抽包改动混进业务改动 | 每期独立提交，提交信息里写清"纯迁移"或"行为变更"；纯迁移的提交**不得**同时改行为 |

**回滚**：任一期回滚 = 把包内文件移回 `src/theme/` 原路径、删壳。因为导入面没变、`implText` 兼容两处，
回滚不影响任何关卡与文档。

## 九、本仓现状与进度

- 当前 oauth21 已有 **3 设备 × 3 页面** 的完整拆分（`default` + `compact` 两个主题包），
  配色按「包 × 设备 × 页面」分布（`black`/`white` 处处都有，`blue`/`cyan` 仅手机端，`rainbow` 仅手机端登录页）。
- **Stage 0 已完成**（默认色收口 / 预取缺口 / picker 工厂）。
- **Stage 1 已完成**（2026-09-26）：`packages/theme-core`（`mauth-theme-core`，源码直供）落地纯叶子层
  —— `constants` / `tokens` / `tone` / `mode` / `types` / `views/params` 六个模块 + barrel；
  `oauth21/src/theme/` 侧 `tone.ts` / `mode.ts` / `types.ts` / `views/params.ts` 变**零逻辑转发壳**，
  `index.ts` 转发常量、`runtime.ts` 转发 token 校验（本体只剩注入动作）。
  接线照抄 `stable-deviceid` 那套：Vite `resolve.alias` + `tsconfig.app.json` 的 `paths` / `include`
  都指到**源码**（不依赖 `node_modules` 里那条由 `npm install` 生成的符号链接）。
  界面级判据：`type-check` / `eslint` 0 错、`verify-theme-dirs` 552/552、八枚毒丸全中、`docs:build` exit 0。
- 已知**欠账**（与本立项无关，但同属这一层）：
  `docs/frontend/theme.md` 讲的是 shadcn 的全局 HSL 变量（与 `--mauth-*` 主题层不是一回事）；
  `AGENTS.md` 与 `docs/frontend/coding-standard.md` 里的多主题条目仍在用旧口径（`web` 作为设备名、
  五段键、`<页面>/<变体>/` 形态），待单独一轮收口。

## 相关

- [多主题 / 多版式开发模式](/frontend/multi-theme) —— 规则全文（目录约定、选择优先级、安全边界、验收）。
- [前端统一规范](/frontend/coding-standard) —— 类型闸门、导出位置等通用约定。
- 主题包 / 配色 / 版式的目录约定与关卡清单：`oauth21/src/theme/README.md`（该 README 是本规则的一部分）。
