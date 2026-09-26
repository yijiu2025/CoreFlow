# theme —— 主题层（机制 + 主题包 + 版式契约）

一个目录管三层，**层级即语义**（主题包 → 设备 → 页面 → 配色）：

```
src/theme/
├── index.ts            配色注册表：扫描 主题包 / 设备 / 页面 / 配色（机制）
├── types.ts            主题包 / 配色的契约
├── mode.ts             明暗三态（浅色 / 深色 / 跟随系统）—— 与配色正交，不参与配色选择
├── remote.ts           后端下发的换配色配置
├── runtime.ts          token 白名单校验 + 注入
├── views/              版式机制（架构层）：契约 + 注册表，与主题包无关
│   ├── registry.ts     版式注册表工厂（「业务容器 + 可换 UI」机制）
│   ├── params.ts       URL 参数读取：`theme.<设备>` / `view.<设备>`（含通用参数回退）
│   ├── pages.ts        页面版式总览（调试面板用）
│   ├── login.ts        login 页的契约 + 注册表
│   ├── register.ts     register 页的契约 + 注册表
│   └── forgot-password.ts  forgot-password 页的契约 + 注册表
└── themes/             **主题包**：一套完整设计，各端都住这里
    ├── default/        包根：只有包定义（meta / views）
    │   ├── index.ts
    │   ├── mobile/     该设计的**手机端**呈现
    │   │   ├── login/
    │   │   │   ├── index.vue              ← 该包该设备的**唯一**版式
    │   │   │   └── colors/                ← 该页的配色（只换取值，不动 DOM）
    │   │   │       ├── black/index.ts     ← 深色底 + 浅色字（自带底色，tone: 'dark'）
    │   │   │       ├── white/index.ts     ← 浅色底 + 深色字（自带底色，tone: 'light'）
    │   │   │       ├── blue/{index.ts, theme.scss, assets/}
    │   │   │       ├── cyan/{index.ts, theme.scss, assets/}
    │   │   │       └── rainbow/{index.ts}
    │   │   ├── register/{index.vue, colors/{black,blue,cyan,white}/}
    │   │   └── forgot-password/{index.vue, colors/{black,blue,cyan,white}/}
    │   ├── standard/   该设计的**桌面主窗口**呈现（结构同上；原 `web/` 更名，2026-09-25）
    │   │   ├── login/index.vue                 ← 容器 + 版式已拆分
    │   │   ├── login/colors/{black,white}/index.ts
    │   │   ├── register/{index.vue, colors/{black,white}/}
    │   │   └── forgot-password/{index.vue, colors/{black,white}/}
    │   └── mini/       该设计的**iframe 紧凑版**呈现（2026-09-25 起独立设备，与 standard 并列）
    │       └── login · register · forgot-password（各 index.vue + colors/{black,white}/）
    └── compact/        另一套设计的包：只做「注册页紧凑版式」示例，只建了 mobile
        └── mobile/register/{index.vue, colors/{black,blue,cyan,white}/}
```

🔴 **一个主题包 = 一种版式**（2026-09-26 定案）：

```
themes/<包>/<设备>/<页面>/index.vue          ← 该包该设备该页的**唯一**版式
themes/<包>/<设备>/<页面>/colors/<配色>/      ← 该页的配色
```

`<页面>/` 下**只有** `index.vue` 与 `colors/`，**没有「版式」这一层目录**。
要另一种版式 → **新建一个主题包**（如 `compact`），不要去建 `<页面>/<变体>/`。
注册表里每条配色记录的 `view` **恒等于包名**（`view` 不是从目录取的第四段，而是由包名派生）。

## 四级结构：主题包 → 设备 → 页面 → 配色

| 层级 | 是什么 | 目录 | id |
| --- | --- | --- | --- |
| **主题包** | 一套完整设计（各端都住这里） | `themes/<包>/` | 目录名 |
| **设备** | 这套设计在哪种设备上的呈现 | `themes/<包>/<设备>/` | `mobile` / `standard` / `mini`（白名单；2026-09-25 三值化，mini 从 web 的变体升为独立设备） |
| **页面** | 一页业务 + 它**唯一**的那套 DOM 结构 | `<设备>/<页面>/index.vue` | 目录名（`login` / `register` / `forgot-password`） |
| **配色** | 只换颜色 / 圆角 / 背景图，**同一套 DOM** | `<设备>/<页面>/colors/<配色>/` | 目录名 |

- **为什么设备在包内、而不是顶层目录**：一个主题包 = 一套设计语言，手机端与电脑端是
  它在两种设备上的呈现，因此住在同一个包里。「换一套设计」只需换一个包目录 —— 若把设备
  提到顶层（`theme/mobile/`、`theme/standard/`），换一套设计就要改两处，两者迟早漂移。
- **为什么配色在最内层**：配色是"给某一页具体 UI 上色"。页面是**不可再分**的叶子
  （一页只有一套 DOM），所以配色挂在页面下就够，不需要也没有"版式"这一层。
- **配色 id 的唯一性作用域是「包 × 设备 × 页面」**：该范围内不能重名；**跨层可以同名**
  （`black` 在每个页面、每个设备下各一份是正常且必要的）。
- **版式跟随「主题包 × 设备」**：换一套版式 = 换一个包；手机端与电脑端各看各的。
  机制与红线见下文「版式」一节与 `views/registry.ts` 的文件头。

## 手机端、电脑端分别配置（设备维度 URL 参数）

同一个色 id 在不同设备上可能指不同的东西（手机端要 `blue`、电脑端要 `black`），
所以 URL 参数支持**按设备取值**：

| 想要的效果 | 写法 |
| --- | --- |
| 三端（或所有端）**同一个**配色 + **同一个**版式 | `/login?theme=blue&view=compact` |
| 每端**各自**的配色 **与** 版式 | `/login?theme.mobile=blue&theme.standard=black&view.mobile=default&view.standard=compact` |
| 每端**各自**的配色，版式**共用**一个 | `/login?theme.mobile=blue&theme.standard=black&view=default` |

`mini` 与 `mobile` / `standard` 完全同权：`?theme.mini=...` / `?view.mini=...` 随时可加。

**取值链（逐级下沉，高 → 低）**

| 维度 | 链路 |
| --- | --- |
| 配色 | `?theme.<设备>`（`?skin.<设备>` 同义）→ `?theme` / `?skin` → localStorage 上次选择 → 该范围兜底配色 |
| 版式 | `?view.<设备>` → `?view` → 包声明的 `views.<页面>` → `VITE_<PAGE>_VIEW` → 该包该设备的唯一版式（`pkg`） |

- 设备维度参数**不写 localStorage**：它是"这次访问的意图"，不是"用户的选择"。
  用户手动点色卡（`setTheme` / `cycleMode` / `toggleTheme`）会**清掉该设备的 URL 覆盖**，
  让显式操作优先；但 `setMode`（后端/父应用下发）不会 —— 它必须留在 URL 之下。
- **"没有就自动下沉"**：`?theme=blue&view=compact` 在三端同时生效，某端没有
  `compact` 包或没有 `blue` 配色时，按上表逐级回落到该端**已有**的那一套，
  不报错、不白屏。回落口径见下节。
- 读取入口只有一个：`views/params.ts` 的 `readDeviceParam()`（版式）与
  `stores/theme.ts` 的 `readUrlIntent()`（配色）。

## 目录名的口径（真源：`index.ts` 的 `buildRegistry()`）

| 情形 | 结果 |
| --- | --- |
| 目录名不合 `^[a-z0-9-]+$` | 跳过，不注册 |
| 设备段不是 `mobile` / `standard` / `mini` | 整个目录跳过（不会被当成某个配色） |
| 缺 `index.ts` / 没有 `default` 导出 / 里面没有 `meta` | 跳过，不注册 |
| 配色 `meta.id` 与目录名不一致 | **以目录名为准**（被目录名覆盖） |
| 只有 `theme.scss`、没有 `index.ts` | 残缺，该目录的样式被忽略 |
| 包根（`themes/<包>/index.ts`）坏了 | 该包**及旗下所有设备的配色** 全部不注册 |
| 同包同设备同页内有同名配色 | 后到的告警并忽略（按路径排序先到先得） |

⚠️ 以上都是**静默跳过**：写错不报错，只是配色/版式不出现。加完没反应时先核这张表。

`meta.id` 以目录名为准的原因：`theme.scss` 的选择器必须写
`html[data-mauth-theme='<id>']`，而属性值由目录名生成 —— 两者不一致时选择器直接落空。

## 加一个主题包 / 加一套配色 / 加一种版式

**加一个包**（一整套新设计，两端版式自己写）：

1. 建 `src/theme/themes/<包>/index.ts`，默认导出 `MauthThemePackage`（**只有 meta / 可选 views**）。
2. 建 `<包>/mobile/`、`<包>/standard/`、`<包>/mini/` 设备目录（**按需**：某端暂无版式可先不建），
   各端各页放 **`<设备>/<页面>/index.vue`**（**该端该页的唯一版式**，也是兜底）。
3. 各页面下建 `colors/<配色>/index.ts`（**每页至少一套**，否则该范围没有任何配色可注入）。
4. （可选）加 `theme.scss` 放背景图 / `@font-face` / 伪元素装饰。
5. 访问 `?theme=<配色 id>` 看效果。

**加一种版式**（换 DOM 结构）＝ **加一个包**，不是加深目录：

1. 复制一个包骨架（或新建 `themes/<新包>/index.ts`）。
2. 在 `<新包>/<设备>/<页面>/index.vue` 写新版式的 DOM。
   想复用内置包的样式基线时，从 `default/<设备>/<页面>/index.vue` 照抄起步。
3. 建 `<新包>/<设备>/<页面>/colors/<配色>/index.ts`。
   ⚠️ 配色是**按包**查的，新包必须自带一份 —— 不想要多的就只建 `{black,white}`。
4. 访问 `?view=<新包名>` 切换（也支持 `?view.<设备>=<新包名>` 只换某端）。

> 「换版式要复制配色」是这条口径的**已知代价**，也是刻意的：两套 DOM 的 token 集合
> 本来就不同，共享一份文件只会让配色里堆满"只对某版式有意义"的条目。
> 6 段目录形态（`<页面>/<版式>/colors/`）曾支持过，2026-09-26 已删除。

**给已有的包加一套配色**（只换颜色）：

1. 建 `themes/<包>/<设备>/<页面>/colors/<配色>/index.ts`：

```ts
import type { MauthThemeColor } from '@/theme/types';

export default {
  meta: { id: 'brand', name: '品牌红', description: '一句话说明', preview: { primary: '#b91c1c', accent: '#dc2626' }, author: 'oauth21' },
  tone: 'light',
  tokens: {
    // 🔴 tokens 是**扁平值**（Record<string,string>），无 light/dark 两档（2026-09-25 取消明暗档）。
    // 配色自带底色：选这套配色就是这套底，与系统明暗偏好无关。
    '--mauth-primary': '#b91c1c',
    '--mauth-primary-fg': '#fff',
    '--mauth-accent': '#dc2626'
  }
} satisfies MauthThemeColor;
```

> 想要"深色版品牌色"？**另建一个颜色目录**（如 `navy`，`tone: 'dark'`），别往同一套里塞暗档。

2. （可选）同目录加 `theme.scss` + `assets/`。
3. 访问 `?theme=brand` 看效果。

> ⚠️ 要给**每个设备**都配上就用设备维度参数分别验：`?theme.mobile=brand`
> 加了新配色记得跑一次 `verify-theme-dirs.mjs` 看有没有撞名（同范围重名会告警）。

**两种都要**：重启 dev server（`import.meta.glob` 在启动时静态扫描，新目录不会被热更新发现）。

## `tokens` 是扁平值（不是"两档"）

```ts
tokens: Record<string, string>;   // 直接就是 --mauth-* 的值
```

2026-09-25 取消了早先的 `{ light, dark }` 两档形态。理由：两档形态让"明暗偏好"
偷偷参与配色选择，导致「先点黑再点蓝」会拿到 blue 的**深色档**（底色近黑）——
用户看到的是"选了蓝但底色还是黑的"。现在**每套配色自带完整底色**，与明暗偏好无关：

- **`tone`**（`'light' | 'dark'`，必填）是这套配色的**系别**，只用于"点明/点暗时落到哪张卡"；
- **`isDark`** = 当前配色的 `tone`（明暗 ≡ 色系，见下文）；
- 需要一套深色品牌色 → **加一个新颜色目录**，不要试图给现有配色加暗档。

可用 token 名清单见 `../assets/styles/mobile-auth.scss` 的第 1、2 层
（`--mauth-<角色>` 全局语义 + `--mauth-<组件>-<属性>` 组件级）。
组件级 token 默认都指向全局语义，所以「只改某个组件」覆写组件级那一个即可，不会波及其他组件。

### 🔴 明暗 ≡ 色系（`mode` 是「切到哪一系别」的意图，不是独立维度）

- **`mode`**（`mode.ts`：明 / 暗 / 跟随系统）是**系别意图**：明=白系、暗=黑系、跟随=按系统偏好。
- **配色**是**具体的一套外观**，自带底色与 `tone`（白系/黑系）。
- **明暗与配色是同一个东西**：`isDark = 当前配色的 tone`。点黑卡即暗、点白卡即明；
  切「暗」落到黑系、切「明」落到白系，两侧各自记住上次选的配色。

用户 2026-09-25 的原话：

> 明暗切换就是切换白色和黑色这个色系，不是另一套规则。

`black` 与 `white` 是**默认搭配的两套标配**：明暗切换落到它们（除非该系别下用户另有选择，如白系选了 `blue` 则切「明」回到 `blue`）。

## 五色并列（为什么不再有"基线配色"这个概念）

早期设计里 `mono`（黑白）是一套**零 token 的隐式兜底** —— 它借各端样式表的基线色值，
刻意不写任何 token，以保住"零配色 → 渲染路径与没有主题机制时完全一致"这条不变量。

2026-09-25 起这条不变量**被主动放弃**，改为：

- `mono` 拆成 **`black`** 与 **`white`** 两个**独立颜色**，各在自己的 `index.ts` 里写全 token；
- 它们与 `blue` / `cyan` / `rainbow` **完全并列**：同一个列表、同一套选中逻辑、同一优先级；
- 「基线」现在只是样式表里的 default 值，**不再是某套配色的身份**。

为什么放弃零 token：用户要的是"选黑就是黑、选白就是白，且选完之后再选别的颜色就是别的颜色"。
零 token 的基线配色做不到这件事 —— 它只能"什么都不改"，一旦用户先选黑再选蓝，
要么保留黑（错），要么让 `mode` 去兼职（更错）。自带底色后语义就直白了：
**每套配色定义自己的完整外观，互不影响，谁也不兼职明暗开关。**

> 用户 2026-09-25 原话：
> 「黑和白和蓝青等应该是并列关系，选了黑色再选蓝色，底色就是黑色，选了白色再选蓝色，底色就是蓝色不对」
> 「蓝色没有白蓝和黑蓝之分，底色由蓝色自己选择设置」

## 值的安全边界

`tokens` 会被白名单校验（`runtime.ts`）：token 名必须是 `--mauth-` 前缀；
取值只接受 `#hex` / `rgb()` / `hsl()` / 长度 / `var(--mauth-*)` / 少量关键字，
外加 `--mauth-font-family` 的字体栈写法。
**不接受 `url(...)`** —— 所以背景图、webfont 一律走 `theme.scss`。
这条边界的意义：后端下发的配色表与 URL 参数都是不可信输入，不能让它们触发外发请求或闭合 CSS 规则。

## 能改到什么深度

`blue` 与 `cyan` 是两个不同深度的范例（`rainbow` 是第三档：多彩装饰），按需要挑：

| 想改的东西 | 放在哪 | 参考 |
| --- | --- | --- |
| 品牌色 / 圆角 / 描边宽 / 字体栈 | `tokens` | `blue` |
| 背景图 / webfont / 伪元素装饰 | `theme.scss` | `blue` |
| **改表面分层**（让 header / body 透明，把底色交还给页面） | `tokens`：`--mauth-header-bg` 与 `--mauth-body-bg` 设为 `transparent` | `cyan` |
| **背景叠加**（渐变 + 贴底剪影） | `theme.scss`：`background-image` 多值，各自配 repeat / position / size | `cyan` |
| **按屏幕形态给不同值** | `theme.scss` 里的媒体查询 | `cyan` |

⚠️ 往 `.mauth-page` 上挂背景时，必须先让 `.mauth-header` / `.mauth-body` 透明 ——
这两块默认是不透明表面，会把页面底色整块盖住（`blue` 与 `cyan` 都踩过）。

### ⚠️ 让表面透明后，必须同时声明画布色 `--mauth-canvas`

`.mauth-page` **之外**的区域（地址栏收起/展开、回弹、安全区）露出的是**根画布**，
它的颜色由 `html` 的背景决定（CSS 2.2 §14.2：根元素的背景会向上传播成画布背景；
若根元素最终仍是 `transparent`，规范原文是"**渲染是未定义的**"）。

移动端页默认把 `--mauth-canvas` 取成"页面最上沿的颜色"= `--mauth-header-bg`。
但配色一旦把 `--mauth-header-bg` 设为 `transparent`（如 `cyan`），画布色也跟着变透明
→ **退回给浏览器内核自己发挥**（浅色下多半是白、深色下看内核心情），
于是"页面之外露出来的颜色"在手机上就和电脑上不一样 —— 这正是"同一条边，
换个浏览器就多一条色带"的典型来源。

→ 这类配色要在 `theme.scss` 里补一条，取值 = 页面最上沿的颜色：

```scss
html[data-mauth-theme='<id>'] {
  --mauth-canvas: <页面最上沿的颜色>;
}
```

参考 `themes/default/mobile/login/colors/cyan/theme.scss`（直接取渐变的第一个色标 `var(--mauth-cyan-top)`）。
⚠️ 必须落在 `html` 上：画布色由**根元素**的背景决定，挂在 `.mauth-page` 上不起作用。

### ⚠️ 不要用 `tokens` 覆写「断点里会变的 token」

`--mauth-pad-*` · `--mauth-gap-*` · `--mauth-logo-size` · `--mauth-title-size` ·
`--mauth-field-h` · `--mauth-control-h` · `--mauth-err-h`

这几个会在矮屏 / 横屏断点里被下调（见 `mobile-auth.scss` 0.5 节）。而 `tokens` 是写成
`html` 上的 inline style，**优先级高于媒体查询里的 `:root`** —— 在这里写死，矮屏适配会被
整体废掉（横屏重新挤不下）。配色要调字号或间距，目前只能写 `theme.scss` 里的具体规则。

### ⚠️ `assets/` 里的 SVG 必须带 `width` / `height`

只给 `viewBox` 时背景图没有固有尺寸，`background-size: … auto` 里的 `auto` 推不出高度，
图片会被撑满整个容器（实测剪影占掉 800px 视口）。写上宽高后才能用 `100% auto` 等比缩放。

## 配色怎么被选中

优先级（高 → 低）：

1. URL 参数 `?theme.<当前设备>=<配色 id>`（`?skin.<设备>` 同义）
2. URL 参数 `?theme=<配色 id>`（`?skin=` 同义；所有设备共用同一个 id）
3. 后端下发 `{ "theme": "<配色 id>" }`（见 `remote.ts`）
4. localStorage 里用户上次的选择
5. 该**包 × 设备 × 页面**下的兜底配色（按 id 字母序取最前，当前是 `black`）

⚠️ 第 5 档的查找范围是**当前包 × 当前设备 × 当前页面**：任一不同就是另一套可选集合。
配色的"能不能用"也按这个范围判 —— URL 给了一个属于别的范围（比如桌面端、或另一个页面）的
配色时**不跨范围借用**，而是回落到当前范围的兜底（跨设备回落时**先取同 `tone` 系别**的
首套，避免"点了深色却跳成浅色"）。

> 「兜底 = 字母序第一个」意味着**新增一个 id 比 `black` 更靠前的颜色会静默改变默认外观**
> （如 `amber`）。当前兜底是 `black`（深色底）。
> ⚠️ 但**首屏看到的不一定是 `black`**：store 挂载时有一次「首屏系别对齐」
> （`syncColorToTone`）—— `mode=system` 且系统是亮色时会把黑系校正到白系
> （否则「跟随系统」形同虚设、还会出现 html 深色 / 页面浅色的撕裂）。
> 该设备被 URL 显式锁定时不干预。

明暗 `mode` 同理但**独立**：`?mode=light|dark|system` > 后端下发 > localStorage > 跟随系统。
它只决定"切到哪一系别时落到哪张卡"，**不改变 id 的选择逻辑**。

### 显式操作 > URL > 后端 > 记忆

`?theme.<设备>` / `?theme` 是**这次访问的意图**，优先级最高，会被记成该设备的 URL 锁
（`urlLockedThemeOf(device)`），锁住该设备的自动写入：首屏 tone 同步、切版式时的配色重置、
后端配置下发。**用户手动点色卡 / 切明暗**（`setTheme` / `cycleMode` / `toggleTheme`）会
**清掉该设备的锁**——显式操作永远压过 URL。
`setMode`（后端与父应用 `postMessage` 走它）**不清锁**，它必须待在 URL 之下。

## 让包 / 配色声明版式（`views`，可选）

```ts
export default {
  meta: { id: 'cyan', name: '青' },
  tokens: { /* … */ },
  // 页面名 → 版式 id（版式 id = **目标主题包名**）
  views: { register: 'compact' }
} satisfies MauthThemeColor;
```

- 写在**包根**（`themes/<包>/index.ts`）→ 该包下**所有设备、所有页面、所有配色**共用这份声明
  （推荐：版式属于包）。
- 写在**配色里**（`<设备>/<页面>/colors/<配色>/index.ts`）→ 只覆盖这一套配色。

优先级：`?view.<设备>` > `?view=` > `views` > `VITE_<PAGE>_VIEW` > 当前包（自带版式）。
写错 / 未登记的版式名一律**回退当前包当前设备的版式**，不会因为写错而白屏
（合法性由 `views/<page>.ts` 判定）。版式的分工与红线见 `views/registry.ts` 的文件头。

## 版式（可换 UI）—— 业务容器 + 版式

页面拆成两半，机制见 `views/registry.ts` 文件头：

```
view/app/<page>/index.vue                业务容器：状态 / 校验 / 请求 / 路由 / 浮层 / 倒计时（手机端）
view/web/<page>/{Standard,Mini}*.vue     业务容器：同一页的桌面端 / 紧凑版容器
       │  传 ctx（<Page>ViewContext，定义在 views/<page>.ts）
       ▼
theme/themes/default/<设备>/<page>/index.vue   内置包版式（容器**静态引入**自己设备的那份）
theme/themes/<包>/<设备>/<page>/index.vue      非内置包版式（`import.meta.glob` **惰性**加载）

已接入：login / register / forgot-password × 三设备（mobile·standard·mini，容器 + 版式全部拆分）
        default 包手机端三页各有 black/white/blue/cyan（login 另加 rainbow 演示配色）
        compact 包提供 mobile/register 的「换包换版式」范例
```

- **业务只有一份**，永远在容器里；版式只读 `ctx`、只调 `ctx.actions`。
- **版式里不要写**：任何请求、校验、`router.push`、store 读写，以及"该不该拦"的判断。
- **版式里可以写**：布局、样式、静态装饰，以及纯展示用的局部状态（如密码明文开关）。
- **契约不要跟着进包**：它描述的是"容器给了版式什么 `ctx`"，属于页面，不属于某个包。
  跟着进包就会变成 N 份副本，必然漂移。所以契约与注册表是 `theme/views/` 目录下的
  页面文件 `views/<page>.ts`，每个包、每种设备共用一份。

### 设备是「页面身份」，由文件位置决定

容器的设备身份取**常量**（移动端容器写 `const THEME_DEVICE = 'mobile' as const`），
**不跑视口判定**：

- 视口判定的口径只在 `utils/device.ts` 有一份（路由分发用它）；
- 容器再判一次会出现"URL 说是移动端路由、视口却已变宽"这类自相矛盾的状态。

「当前这条路由属于哪端」由路由回答（`meta.device`），并在应用启动时同步给
store（`main.ts` → `setupThemeDeviceSync(router)`）。store 用这个值决定
**把哪一套配色的 token 注入 `html`**（`html` 是整份文档唯一的，只能注入一套）。

⚠️ 这里有一个**已修掉的坑**：设备同步**不能**写在 `router.afterEach` 里 ——
首次导航由 `app.use(router)` 触发，那一刻 Pinia 的 activeInstance 尚未建立，
`useThemeStore()` 抛错被 `try/catch` 吞掉 → 设备永远停在默认值（症状：电脑端页面
静默按手机端配色渲染，且**没有任何报错**）。现在用 `watch(router.currentRoute, { immediate: true })`，
既覆盖首屏、又不依赖钩子时序。

### 版式目录结构（2026-09-26 起）

- **版式** = `<包>/<设备>/<页面>/index.vue`，**没有**版式名这一层目录：
  一页只有一个版式，版式的"名字"就是**包名**。`base` 只是一个**逻辑 id**
  （`BASE_VIEW_ID`），不是目录名，也不再是配色注册表的 `view` 取值。
- **换版式 = 换包**：`?view=compact` 把 `compact` 当**目标包名**解析；
  跨包引用只在"该包 × 该设备内已登记"时成立，否则回退当前包的版式。
- 版式 id 来自 URL / 主题包 / 环境变量，都属**外部输入**：只做「当前包 × 当前设备内已登记」
  白名单匹配，未登记一律回退该范围自带版式（见 `views/registry.ts` 的 `resolve`）。

### 选择优先级（高 → 低）

1. URL `?view.<当前设备>=<id>`
2. URL `?view=<id>`
3. 声明（包根 `themes/<包>/index.ts` 或配色 `<设备>/<页面>/colors/<配色>/index.ts` 的 `views[page]`）
4. `VITE_<PAGE>_VIEW`（部署级默认，整站换 UI 不动代码）
5. 当前包（`pkg`）自带的那套版式

第 1/2 档都在**当前主题包 × 当前设备内**查找，找不到就回退**该包该设备自己的**版式
（不跨设备借别人的版式）。
🔴 **URL 只要给了值就不再往下走**：非法值落**当前包**，不会被第 3/4 档接管
（`?view=typo` → 当前包，而不是环境变量指的那套）—— 显式写错时静默换 UI 更难排查。
🔴 **设备键留空 = 未指定**：`?view.mobile=`（或纯空白）视为没给，继续落通用的 `?view`，
再往下才是第 3/4/5 档。参数留空是部署方常用的"这台设备不特殊指定"。
三页（login / register / forgot-password）**同一套规则、同一份形状**：
`pick*ViewId` 都接收 `source.theme`，URL 分支都是 `resolve(url, pkg, device) ?? pkg` ——
`verify-theme-dirs.mjs` §12 守这条（register 曾缺第 3 档、还多一条会把 `?view=base`
漏成 `'base'` 的重复分支）。
`<PAGE>` 为大写下划线形式，各页一枚：`VITE_REGISTER_VIEW` / `VITE_LOGIN_VIEW` /
`VITE_FORGOT_PASSWORD_VIEW`（定义在各页 `views/<page>.ts` 顶部的 `ENV_VIEW`）。

⚠️ 第 2 档**非法值不回退**：`?view=typo` 直接落当前包自带版式，而不是被第 3/4 档接管 ——
显式参数写错时静默换成另一套 UI，比看到默认版式更难排查。

### 版式怎么加载（按需加载是硬要求）

| 情形 | 来源 | 代价 |
| --- | --- | --- |
| **不带任何 `view` 参数**（绝大多数访问） | 容器**静态 import** 自己设备内置包的那份 | **零请求**，首帧即正确 |
| `?view=<当前包名>` 或 `?view=base` | 同上（`load()` 返回 `null`） | **零请求** |
| `?view=<其它包名>`（且该包该设备有实现） | `import.meta.glob` 惰性 | 一个 chunk 请求；路由守卫会提前预热 |

`views/registry.ts` 的 `load()` 返回 `null` 就是"**用你静态引入的那份**"这个语义。
三个设备**各自静态引入自己设备的那份**（`view/app/<page>/` → `default/mobile`、
`Standard*` → `default/standard`、`Mini*` → `default/mini`），所以"零请求"对三端都成立 ——
这一点由 `.tmp-probe/verify-theme-dirs.mjs` 的 **8b 节**守着（断言每个容器静态引入的路径与
`THEME_DEVICE` 常量都对得上）。

### 加一种版式

见上文「加一个包 / 加一套配色 / 加一种版式」的第 2 步。要点：

1. 新包目录 `themes/<新包>/<设备>/<页面>/`，**目录名就是版式 id**
   （只能 `[a-z0-9-]`）。**不用改任何注册表文件**：
   各页的 `views/<page>.ts` 用跨包跨设备 glob 扫全部实现，新目录自动登记。
2. 版式根元素写 `data-mauth-view="<新包名>"` —— 值就是**包名**（版式 id ≡ 包名），
   **三端每份版式都要写**：关卡与排查只能靠它读"现在渲染的是哪套 UI"
   （`verify-theme-dirs.mjs` §7b 守这条）。
3. 写 `index.vue`：`const props = defineProps<<Page>ViewProps>()`，然后照着 `ctx` 渲染，
   且**只调 `ctx.actions.*`**（不要在版式里碰请求 / 校验 / 路由）。
4. 需要自己的结构样式就写 `<style lang="scss" scoped>`，**取值一律用 `--mauth-*` token**
   （裸色值会在换配色 / 切深色时漏色）；能复用的（字段、按钮、摘要、协议、页脚）
   直接复用 `assets/styles/mobile-auth.scss` 的 `mauth-*` 类。
4. **重启 dev server**（`import.meta.glob` 在启动时静态扫描，新目录热更新发现不了）。
5. 访问 `?view=<新包名>` 看效果（组合验证：`?theme=cyan&view=<新包名>`）。

## 五条容易踩的线

- **移动端版式不要自带 `<style>`**：它是三页（登录 / 注册 / 重置密码）共用样式
  `assets/styles/mobile-auth.scss` 的消费方，自带样式块会让各页各自漂移 ——
  历史上"两页看起来不一样"都源于此。电脑端（standard / mini）版式**自带 `<style scoped>`**
  （`std*-*` / `m*-*` 体系，已 token 化），与移动端 `mauth-*` 是两套样式体系。
- 🔴 **分发器必须认「mini 来源」**：`view/web/<page>/index.vue` 三个分发器的判定顺序是
  **显式 `?isMobile=true` ＞ mini 来源（`from=mini` / 路径含 `mini-login` / `fromLogin=mini`）
  ＞ 自动识别 ＞ 桌面默认**。mini 来源意味着"本页正嵌在宿主 app 的弹窗 iframe 里"，此时
  的「窄」（实测宿主弹窗列宽 480px、宿主 1440px 时 iframe 内 854px、宿主 ≤800px 时掉到 718px）
  来自弹窗而非真机 → **必须保持桌面/紧凑版式**，与同一 iframe 里的 mini 登录页一致。
  漏掉这条的症状极具欺骗性：**只有漏的那一页**在窄 iframe 下跳成全屏手机端，其余页正常，
  且**桌面浏览器直接开该路由不会复现**。2026-09-24 `forgot-password` 漏过此分支（已修，
  关卡见 `verify-forgot-view.mjs` 的 I 段）。
- 🔴 **父 origin 白名单漏配 = 弹窗 loading 慢，而不是报错**：`SSO_READY` 握手走
  `utils/parent-origins.ts`（**单一来源**，`utils/parent.ts` 发、`useParentThemeSync` 收共用）。
  白名单里漏了宿主 origin 时 `postToParent` **拒发**，宿主收不到握手 → 等满自己的 **3s 兜底超时**
  → 用户看到的是"loading 转了很久"（实测 3608ms；补对后 719ms）。
  **症状像性能问题，实际是配置错误** → 排查任何 iframe 握手类「慢」，
  **第一件事 grep 控制台 `[SSO] 拒绝 postMessage：父 origin 未授权`**。
  ⚠️ 只写"嵌 oauth21 的父应用"的 origin，**别把 oauth21 自己的 5174 / 5175 写进去**（它是被嵌方）。
- **改契约要同步两边**：容器组装 `ctx` 时有编译期自检（`assertRegisterContract` /
  `assertLoginContract` / `assertForgotPasswordContract`，各页一枚，在容器 `index.vue` 里），
  改 `views/<page>.ts` 后容器与**所有包所有设备**的版式都会在类型检查时报错，不会悄悄跑偏。
- **契约要能"真的拦住"**：类型闸门自身也可能空转（见 `docs/frontend/coding-standard.md`
  的「类型闸门必须是"真检查"」）。改完 `views/<page>.ts` 临时写一行 `export const __p: number = 'x';`，
  跑 `npm run type-check` 必须报错，撤销后恢复绿 —— 恒绿的闸门等于没有闸门。

## 关卡（改完必须跑的静态断言）

```bash
node .tmp-probe/verify-theme-dirs.mjs         # 目录口径 + 无版式层目录 + 三设备静态引入 + store/路由接线（519 项）
node .tmp-probe/verify-glob-device.mjs        # glob 真的扫到设备段、配色 glob 只有一套（需能起 Vite）
node .tmp-probe/verify-first-paint-budget.mjs # 首屏请求清单：零个非内置包 chunk、零个 theme.scss（需 dev server）
node .tmp-probe/verify-view-priority.mjs      # 版式优先级五档 + 设备维度键 + 空串/非法值规则（需 dev server）
node .tmp-probe/verify-forgot-view.mjs        # 重置密码页版式 + 分发一致性（需 dev server）
```

- `verify-view-priority.mjs` 的第 4 档（`VITE_<PAGE>_VIEW`）需要一个**带环境变量启动**的实例：
  `VITE_REGISTER_VIEW=compact npx vite --port 5177 --strictPort`，然后
  `node .tmp-probe/verify-view-priority.mjs http://127.0.0.1:5174 --env-base http://127.0.0.1:5177`。
  不传就**明确跳过**那一组（不写恒绿断言）。
- ⚠️ 起多个实例时**串行启动**：几个 Vite 共用 `node_modules/.vite`，同时冷启会让各自的
  `optimizeDeps` 结果互相作废 → 页面白屏 + 控制台 `504 (Outdated Optimize Dep)`。
- `verify-theme-dirs.mjs` / `verify-glob-device.mjs` 用**毒丸验证**过有效性
  （`node .tmp-probe/poison-verify-theme-dirs.mjs`）：临时建一个 `<页面>/<版式>/` 目录、
  把 6 段配色 glob 塞回去、给 `colorFromKey` 加第二个模式、或把某份版式的
  `data-mauth-view` 改回 `'base'` —— 四枚毒丸都必须让关卡变红，且还原后字节级一致。
- `verify-forgot-view.mjs` 的 **I 段**用毒丸验证过：
  删掉分发器里的 `fromLogin === 'mini'` 分支后，I1 必须从"保持桌面版"变成"切成移动端"。
