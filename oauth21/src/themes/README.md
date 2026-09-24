# 主题包目录

**`themes/` 下按主题包分文件夹，文件夹名就是主题 id**（即 `src/themes/<id>/`）。
注册表由 `import.meta.glob('./*/index.ts')` 扫描，**加主题不用改任何其他文件**。

> ⚠️ `app/` 不是主题，是**页面版式（UI）目录**（换 DOM 结构，与换皮肤正交）。
> 它的约定见 `app/README.md`。`import.meta.glob('./*/index.ts')` 只扫一层，
> 不会把 `app/` 当成主题 —— **所以 `app` 是保留目录名，不得再拿来做主题 id**；
> 也**不要往 `themes/app/` 里加 `index.ts`**（版式侧的汇总文件刻意叫 `pages.ts`，
> 就是为了不被主题扫描到）：加了会凭空多出一个 id 为 `app` 的假主题。

目录名的口径（以 `index.ts` 的 `buildRegistry()` 为准，实现即真源）：

| 情形 | 结果 |
| --- | --- |
| 目录名不合 `^[a-z0-9-]+$` | 跳过，不注册 |
| 缺 `index.ts` / 没有 `default` 导出 / 包内没有 `meta` | 跳过，不注册 |
| 包内 `meta.id` 与目录名不一致 | **以目录名为准**（被目录名覆盖） |
| 只有 `theme.scss`、没有 `index.ts` | 残缺，该目录的样式被忽略 |

⚠️ 以上都是**静默跳过**：写错不报错，只是主题不出现。加完主题没反应时，先核这四项。

`meta.id` 以目录名为准的原因：`theme.scss` 的选择器必须写
`html[data-mauth-theme='<id>']`，而属性值由目录名生成 —— 两者不一致时选择器直接落空。

```
src/themes/
├── index.ts            主题（皮肤）注册表 + 惰性样式加载（机制，一般不用动）
├── types.ts            主题包契约
├── default/            默认主题：石墨（不设 token，直接用基线配色）
│   └── index.ts
├── ocean/              海蓝 —— 只改取值（配色 / 圆角 / 描边 + 一张背景图）
│   ├── index.ts
│   ├── theme.scss
│   └── assets/{wave.svg, wave-dark.svg}
├── sky/                天青 —— 改取值 + 改结构（表面透明、渐变叠图、横屏断点）
│   ├── index.ts
│   ├── theme.scss
│   └── assets/{skyline.svg, skyline-dark.svg}
└── app/                页面版式（UI）：业务容器 + 可换 UI，见 app/README.md
    ├── registry.ts     版式注册表工厂（机制）
    ├── pages.ts        汇总各页注册表（供 ?debug=theme 面板列出）
    ├── register/{types.ts, registry.ts, base/, compact/}
    ├── login/{types.ts, registry.ts, base/}
    └── forgot-password/{types.ts, registry.ts, base/}
```

## 加一个主题

1. 建目录 `src/themes/<id>/`。`<id>` 只能用小写字母、数字、短横线（它会成为 `data-mauth-theme` 属性值）。
2. 写 `index.ts`，默认导出 `MauthThemePackage`：

```ts
import type { MauthThemePackage } from '../types';

export default {
  meta: { id: 'brand', name: '品牌红', description: '一句话说明' },
  tokens: {
    light: { '--mauth-primary': '#b91c1c', '--mauth-primary-fg': '#fff', '--mauth-accent': '#dc2626' },
    dark:  { '--mauth-primary': '#fca5a5', '--mauth-primary-fg': '#450a0a' }
  }
} satisfies MauthThemePackage;
```

3. （可选）加 `theme.scss`，放背景图 / `@font-face` / 伪元素装饰。
4. 重启 dev server（`import.meta.glob` 在启动时静态扫描，新目录不会被热更新发现）。

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

## 值的安全边界

`tokens` 会被白名单校验（`src/theme/runtime.ts`）：token 名必须是 `--mauth-` 前缀；
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
但主题一旦把 `--mauth-header-bg` 设为 `transparent`（如 `sky`），画布色也跟着变透明
→ **退回给浏览器内核自己发挥**（浅色下多半是白、深色下看内核心情），
于是"页面之外露出来的颜色"在手机上就和电脑上不一样 —— 这正是"同一条边，
换个浏览器就多一条色带"的典型来源。

→ 这类主题要在 `theme.scss` 里补一条，取值 = 页面最上沿的颜色：

```scss
html[data-mauth-theme='<id>'] {
  --mauth-canvas: <页面最上沿的颜色>;
}
```

参考 `sky/theme.scss`（直接取渐变的第一个色标 `var(--mauth-sky-top)`）。
⚠️ 必须落在 `html` 上：画布色由**根元素**的背景决定，挂在 `.mauth-page` 上不起作用。

### ⚠️ 不要用 `tokens` 覆写「断点里会变的 token」

`--mauth-pad-*` · `--mauth-gap-*` · `--mauth-logo-size` · `--mauth-title-size` ·
`--mauth-field-h` · `--mauth-control-h` · `--mauth-err-h`

这几个会在矮屏 / 横屏断点里被下调（见 `mobile-auth.scss` 0.5 节）。而 `tokens` 是写成
`html` 上的 inline style，**优先级高于媒体查询里的 `:root`** —— 在这里写死，矮屏适配会被
整体废掉（横屏重新挤不下）。主题要调字号或间距，目前只能写 `theme.scss` 里的具体规则。

### ⚠️ `assets/` 里的 SVG 必须带 `width` / `height`

只给 `viewBox` 时背景图没有固有尺寸，`background-size: … auto` 里的 `auto` 推不出高度，
图片会被撑满整个容器（实测剪影占掉 800px 视口）。写上宽高后才能用 `100% auto` 等比缩放。

## 主题怎么被选中

优先级（高 → 低）：

1. URL 参数 `?theme=<id>`（`?skin=<id>` 为兼容别名）
2. 后端下发 `{ "theme": "<id>" }`（见 `src/theme/remote.ts`）
3. localStorage 里用户上次的选择
4. `default`

明暗 `mode` 同理：`?mode=light|dark|system` > 后端下发 > localStorage > 跟随系统。
明暗与主题是两个正交维度，四组组合都成立。

## 让主题声明页面版式（`views`，可选）

主题包（皮肤）可以顺带指定「各页面默认用哪套 UI」，让皮肤与版式成对下发：

```ts
export default {
  meta: { id: 'sky', name: '天青' },
  tokens: { /* … */ },
  // 页面名 → 版式 id（themes/app/<页面>/<版式>/）
  views: { register: 'compact' }
} satisfies MauthThemePackage;
```

优先级：`?view=`（最高）> `views` > `VITE_<PAGE>_VIEW` > `base`。
写错 / 未登记的版式名一律**回退基础版式**，不会因为主题包写错而白屏
（合法性由 `app/<page>/registry.ts` 判定）。详见 `app/README.md`。
