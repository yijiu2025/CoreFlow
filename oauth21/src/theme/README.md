# theme —— 主题层（机制 + 主题包 + 版式契约）

一个目录管三层，**层级即语义**：

```
src/theme/
├── index.ts            主题注册表：扫描 主题包 与 包内配色（机制）
├── types.ts            主题包 / 配色的契约
├── mode.ts             明暗三态（浅色 / 深色 / 跟随系统）—— 与配色正交
├── remote.ts           后端下发的换配色配置
├── runtime.ts          token 白名单校验 + 注入
├── views/              版式机制（架构层）：契约 + 注册表，与主题包无关
│   ├── registry.ts     版式注册表工厂（「业务容器 + 可换 UI」机制）
│   ├── pages.ts        页面版式总览（调试面板用）
│   ├── login.ts        login 页的契约 + 注册表
│   ├── register.ts     register 页的契约 + 注册表
│   └── forgot-password.ts  forgot-password 页的契约 + 注册表
└── themes/             **主题包**：一套完整设计 = 版式 + 一组配色
    └── default/        包根：index.ts 既是包定义，也是该包的默认配色
        ├── index.ts
        ├── register/index.vue           ← 基础版式（目录名即页面名）
        ├── register/compact/index.vue   ← 变体（目录名即版式 id）
        ├── login/index.vue
        ├── forgot-password/index.vue
        └── colors/     该包下的其它配色（只换取值，不动 DOM）
            ├── ocean/{index.ts, theme.scss, assets/}
            └── sky/{index.ts, theme.scss, assets/}
```

## 两级结构：主题包 → 配色

| 层级 | 是什么 | 目录 | id |
| --- | --- | --- | --- |
| **主题包** | 一套完整设计：版式 + 一组配色，一起开发 | `themes/<包>/` | 目录名 |
| **配色** | 只换颜色 / 圆角 / 背景图，**同一套 DOM** | `themes/<包>/colors/<配色>/` | 目录名 |
| **版式** | 换 DOM 结构与交互组织，**同一套业务** | 主题包**根**的 `<page>/index.vue`（基础）与 `<page>/<变体>/index.vue` | 目录名 |

- **配色 id 全局唯一**（包根配色的 id = 包名，天然唯一）。因为 URL `?theme=ocean` 只给一个
  id，要靠它**反查所属主题包** —— 版式就在那个包里找。重名时按路径排序先到先得并告警。
- **版式跟随主题包**：换一套设计 = 换一个包，版式与配色不会各换一半。
  机制与红线见下文「版式」一节与 `views/registry.ts` 的文件头。

## 目录名的口径（真源：`index.ts` 的 `buildRegistry()`）

| 情形 | 结果 |
| --- | --- |
| 目录名不合 `^[a-z0-9-]+$` | 跳过，不注册 |
| 缺 `index.ts` / 没有 `default` 导出 / 包内没有 `meta` | 跳过，不注册 |
| 包内 `meta.id` 与目录名不一致 | **以目录名为准**（被目录名覆盖） |
| 只有 `theme.scss`、没有 `index.ts` | 残缺，该目录的样式被忽略 |
| 包根（`themes/<包>/index.ts`）坏了 | 该包**及其 colors 下配色** 全部不注册 |

⚠️ 以上都是**静默跳过**：写错不报错，只是配色/版式不出现。加完没反应时先核这张表。

`meta.id` 以目录名为准的原因：`theme.scss` 的选择器必须写
`html[data-mauth-theme='<id>']`，而属性值由目录名生成 —— 两者不一致时选择器直接落空。

## 加一个主题包 / 加一套配色

**加一个包**（一整套新设计，版式自己写）：

1. 建 `src/theme/themes/<包>/index.ts`，默认导出 `MauthThemePackage`（包定义 + 该包默认配色）。
2. 在包根建各页版式：`<page>/index.vue`（**基础版式必须有**，它是该包的兜底）。
3. （可选）加 `theme.scss` 放背景图 / `@font-face` / 伪元素装饰。
4. 访问 `?theme=<包>` 看效果。

**给已有的包加一套配色**（只换颜色）：

1. 建 `src/theme/themes/<包>/colors/<配色>/index.ts`：

```ts
import type { MauthThemePackage } from '@/theme/types';

export default {
  meta: { id: 'brand', name: '品牌红', description: '一句话说明' },
  tokens: {
    light: { '--mauth-primary': '#b91c1c', '--mauth-primary-fg': '#fff', '--mauth-accent': '#dc2626' },
    dark:  { '--mauth-primary': '#fca5a5', '--mauth-primary-fg': '#450a0a' }
  }
} satisfies MauthThemePackage;
```

2. （可选）同目录加 `theme.scss` + `assets/`。
3. 访问 `?theme=brand` 看效果。

**两种都要**：重启 dev server（`import.meta.glob` 在启动时静态扫描，新目录不会被热更新发现）。

## `tokens` 两档的语义

| 档位 | 浅色 | 深色 |
| --- | --- | --- |
| `light` | 生效 | **也生效**（打底） |
| `dark` | 不生效 | 追加覆盖 |

⚠️ 因此**颜色类 token 必须成对给**：只写 `light` 的品牌主色会在深色下沿用，
深底上发闷。不分明暗的（圆角、间距、字体族名）只写 `light` 即可。

可用 token 名清单见 `../assets/styles/mobile-auth.scss` 的第 1、2 层
（`--mauth-<角色>` 全局语义 + `--mauth-<组件>-<属性>` 组件级）。
组件级 token 默认都指向全局语义，所以「只改某个组件」覆写组件级那一个即可，不会波及其他组件。

⚠️ **不要为明暗另开配色目录**：明暗由 `mode.ts` 管（浅色 / 深色 / 跟随系统），
配色只管品牌色系 —— 同一个效果有两个入口，早晚会打架。两者正交，组合数是「配色数 × 2」。

## 值的安全边界

`tokens` 会被白名单校验（`runtime.ts`）：token 名必须是 `--mauth-` 前缀；
取值只接受 `#hex` / `rgb()` / `hsl()` / 长度 / `var(--mauth-*)` / 少量关键字，
外加 `--mauth-font-family` 的字体栈写法。
**不接受 `url(...)`** —— 所以背景图、webfont 一律走 `theme.scss`。
这条边界的意义：后端下发的配色表与 URL 参数都是不可信输入，不能让它们触发外发请求或闭合 CSS 规则。

## 能改到什么深度

`ocean` 与 `sky` 是两个不同深度的范例，按需要挑：

| 想改的东西 | 放在哪 | 参考 |
| --- | --- | --- |
| 品牌色 / 圆角 / 描边宽 / 字体栈 | `tokens` | `ocean` |
| 背景图 / webfont / 伪元素装饰 | `theme.scss` | `ocean` |
| **改表面分层**（让 header / body 透明，把底色交还给页面） | `tokens`：`--mauth-header-bg` 与 `--mauth-body-bg` 设为 `transparent` | `sky` |
| **背景叠加**（渐变 + 贴底剪影） | `theme.scss`：`background-image` 多值，各自配 repeat / position / size | `sky` |
| **按屏幕形态给不同值** | `theme.scss` 里的媒体查询 | `sky` |

⚠️ 往 `.mauth-page` 上挂背景时，必须先让 `.mauth-header` / `.mauth-body` 透明 ——
这两块默认是不透明表面，会把页面底色整块盖住（`ocean` 与 `sky` 都踩过）。

### ⚠️ 让表面透明后，必须同时声明画布色 `--mauth-canvas`

`.mauth-page` **之外**的区域（地址栏收起/展开、回弹、安全区）露出的是**根画布**，
它的颜色由 `html` 的背景决定（CSS 2.2 §14.2：根元素的背景会向上传播成画布背景；
若根元素最终仍是 `transparent`，规范原文是"**渲染是未定义的**"）。

移动端页默认把 `--mauth-canvas` 取成"页面最上沿的颜色"= `--mauth-header-bg`。
但配色一旦把 `--mauth-header-bg` 设为 `transparent`（如 `sky`），画布色也跟着变透明
→ **退回给浏览器内核自己发挥**（浅色下多半是白、深色下看内核心情），
于是"页面之外露出来的颜色"在手机上就和电脑上不一样 —— 这正是"同一条边，
换个浏览器就多一条色带"的典型来源。

→ 这类配色要在 `theme.scss` 里补一条，取值 = 页面最上沿的颜色：

```scss
html[data-mauth-theme='<id>'] {
  --mauth-canvas: <页面最上沿的颜色>;
}
```

参考 `themes/default/colors/sky/theme.scss`（直接取渐变的第一个色标 `var(--mauth-sky-top)`）。
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

1. URL 参数 `?theme=<配色 id>`（`?skin=` 为兼容别名）
2. 后端下发 `{ "theme": "<配色 id>" }`（见 `remote.ts`）
3. localStorage 里用户上次的选择
4. `default`

明暗 `mode` 同理：`?mode=light|dark|system` > 后端下发 > localStorage > 跟随系统。

## 让包 / 配色声明版式（`views`，可选）

```ts
export default {
  meta: { id: 'sky', name: '天青' },
  tokens: { /* … */ },
  // 页面名 → 版式 id（当前包内的 themes/<包>/<页面>/<版式>/）
  views: { register: 'compact' }
} satisfies MauthThemePackage;
```

- 写在**包根**（`themes/<包>/index.ts`）→ 该包下**所有配色**共用这份声明（推荐：版式属于包）。
- 写在**配色里**（`colors/<配色>/index.ts`）→ 只覆盖这一套配色。

优先级：`?view=`（最高）> `views` > `VITE_<PAGE>_VIEW` > `base`。
写错 / 未登记的版式名一律**回退当前包的基础版式**，不会因为写错而白屏
（合法性由 `views/<page>.ts` 判定）。版式的分工与红线见 `views/registry.ts` 的文件头。

## 版式（可换 UI）—— 业务容器 + 版式

页面拆成两半，机制见 `views/registry.ts` 文件头：

```
view/app/<page>/index.vue                  业务容器：状态 / 校验 / 请求 / 路由 / 浮层 / 倒计时
       │  传 ctx（<Page>ViewContext，定义在 views/<page>.ts）
       ▼
theme/themes/default/<page>/index.vue      基础版式（内置包，容器**静态引入**）
theme/themes/<包>/<page>/<变体>/index.vue   变体（`import.meta.glob` **惰性**加载）

已接入：register（default 包：base + compact）· login（base）· forgot-password（base）
```

- **业务只有一份**，永远在容器里；版式只读 `ctx`、只调 `ctx.actions`。
- **版式里不要写**：任何请求、校验、`router.push`、store 读写，以及"该不该拦"的判断。
- **版式里可以写**：布局、样式、静态装饰，以及纯展示用的局部状态（如密码明文开关）。
- **契约不要跟着进包**：它描述的是"容器给了版式什么 `ctx`"，属于页面，不属于某个包。
  跟着进包就会变成 N 份副本，必然漂移。所以契约与注册表是 `theme/views/` 目录下的
  页面文件 `views/<page>.ts`，每个包共用一份。

### 版式目录结构（2026-09-24 起）

- **基础版式** = `<page>/index.vue`，**不再有 `base/` 这层**：它直接落在页面目录下，
  与变体平级。`base` 只是一个**逻辑 id**（`BASE_VIEW_ID`），不是目录名。
- **变体** = `<page>/<变体>/index.vue`，目录名即版式 id，`import.meta.glob` 惰性加载成独立 chunk。
- 版式 id 来自 URL / 主题包 / 环境变量，都属**外部输入**：只做「当前包内已登记」白名单匹配，
  未登记一律回退该包的基础版式（见 `views/registry.ts` 的 `resolve`）。

### 选择优先级（高 → 低）

1. URL `?view=<id>`
2. 声明（包根 `themes/<包>/index.ts` 或配色 `colors/<配色>/index.ts` 的 `views[page]`）
3. `VITE_<PAGE>_VIEW`（部署级默认，整站换 UI 不动代码）
4. `base`

前两档都在**当前主题包内**查找；找不到就回退**该包自己的** base（不跨包借别人的版式）。
`<PAGE>` 为大写下划线形式，各页一枚：`VITE_REGISTER_VIEW` / `VITE_LOGIN_VIEW` /
`VITE_FORGOT_PASSWORD_VIEW`（定义在各页 `views/<page>.ts` 顶部的 `ENV_VIEW`）。

⚠️ 第 1 档**非法值不回退**：`?view=typo` 直接落基础版式，而不是被第 2/3 档接管 ——
显式参数写错时静默换成另一套 UI，比看到默认版式更难排查。

### 基础版式怎么加载

`base` 几乎总是默认路径，所以它**不进惰性表**：

| 情形 | 来源 | 代价 |
| --- | --- | --- |
| **内置包**（`DEFAULT_THEME_PACKAGE`，默认 `default`）的 base | 容器**静态 import** | **零请求**，首帧即正确 |
| 其它包的 base | `import.meta.glob` 惰性 | 一个 chunk 请求；路由守卫会提前预热 |

容器首帧一律先渲染静态引入的那份兜底，chunk 到了再接管 —— 所以**其它包的第一个包**
需要一次切换（有守卫预热时通常在同一 tick 内完成，看不到）。静态 import 的路径在
容器里写死了 `default`，与 `registry.builtinPackage` 必须指向同一个包。

`views/registry.ts` 的 `load()` 返回 `null` 就是"**用你静态引入的那份**"这个语义。

### 加一套版式

1. 在**主题包内**建目录 `themes/<包>/<page>/<id>/` —— **目录名就是版式 id**
   （只能 `[a-z0-9-]`，会成为 `data-mauth-view` 的属性值）。**不用改任何注册表文件**：
   各页的 `views/<page>.ts` 用跨包 glob 扫全部实现，新目录自动登记。
2. 写 `index.vue`：`const props = defineProps<<Page>ViewProps>()`，然后照着 `ctx` 渲染，
   且**只调 `ctx.actions.*`**（不要在版式里碰请求 / 校验 / 路由）。
3. 需要自己的结构样式就写 `<style lang="scss" scoped>`，**取值一律用 `--mauth-*` token**
   （裸色值会在换配色 / 切深色时漏色）；能复用的（字段、按钮、摘要、协议、页脚）
   直接复用 `assets/styles/mobile-auth.scss` 的 `mauth-*` 类。
4. **重启 dev server**（`import.meta.glob` 在启动时静态扫描，新目录热更新发现不了）。
5. 访问 `?view=<id>` 看效果（组合验证：`?theme=ocean&view=<id>`）。

参考实现照抄 `themes/default/register/compact/`（目前唯一落地的变体）；
三页的 `index.vue` 是"忠实搬运原模板、不带 `<style>`"的范例。

## 三条容易踩的线

- **基础版式不要自带 `<style>`**：它是三页（登录 / 注册 / 重置密码）共用样式
  `assets/styles/mobile-auth.scss` 的消费方，自带样式块会让各页各自漂移 ——
  历史上"两页看起来不一样"都源于此。变体不受这条约束（它本来就是"另一套 UI"），
  但要遵守上面的 token 规则。
- **改契约要同步两边**：容器组装 `ctx` 时有编译期自检（`assertRegisterContract` /
  `assertLoginContract` / `assertForgotPasswordContract`，各页一枚，在容器 `index.vue` 里），
  改 `views/<page>.ts` 后容器与**所有包**的版式都会在类型检查时报错，不会悄悄跑偏。
- **契约要能"真的拦住"**：类型闸门自身也可能空转（见 `docs/frontend/coding-standard.md`
  的「类型闸门必须是"真检查"」）。改完 `views/<page>.ts` 临时写一行 `export const __p: number = 'x';`，
  跑 `npm run type-check` 必须报错，撤销后恢复绿 —— 恒绿的闸门等于没有闸门。
