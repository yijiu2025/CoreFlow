# 跨内核渲染基线 {#browser-baseline}

> **适用范围**：本仓库所有前端应用（含新建）。新前端必须实现本页的「必做项」。
> **自检命令**：`npm run check:baseline`（默认检查 `oauth21`，可传目录名检查其它前端）。

## 〇、一条原则：规范的留白处，就是内核差异的来源

「同一个页面在不同浏览器里不一样」「电脑上看不到、手机上能看到」——这类问题的绝大多数，
**不是我们写错了 CSS，而是我们没写某个值**；而规范对这个值的态度是「由用户代理决定」，
甚至干脆写「渲染是未定义的」。

不声明，就等于把渲染结果交给各内核自由发挥。

所以本页所有规则的形式是统一的：**把规范留白的值，按应用自身的意图显式钉死**。
照抄样式片段只是副产品，真正要带走的是下面这张表里的判断力。

### 已知的留白清单（都在本仓真机排查中出现过）

| 值 | 规范初始值 | 谁受它支配 | 不声明的后果 |
| --- | --- | --- | --- |
| `color-scheme` | `normal`（= 不承诺任何配色） | **画布底色**、表单控件默认色、滚动条、`Canvas` / `CanvasText` 系统色关键字 | 画布颜色由 UA 决定；与下一行叠加后出现「页面之外多一条白带 / 色带」 |
| 根元素 `background-color` | `transparent` | 画布（根元素背景会**向上传播成整个画布的背景**，CSS 2.2 §14.2） | 规范原文：若根元素最终仍是 `transparent`，则「**渲染是未定义的**」。浅色下恰好也是白所以看不出来，**深色模式下就是「页面是深色、画布还是白」** |
| 长度 `vh` | 等于 `lvh`（**大**视口） | `100vh` 的页高 | 地址栏出现时 `100vh > 100dvh`（典型 56~80px）→ 容器比页面高 → 居中布局在上下留缝 → 缝里露出祖先底色 |
| `-webkit-text-size-adjust`（厂商私有） | `auto` | 正文字号 | 部分国产浏览器 / WebView 自行放大正文（「字比电脑上大一圈」） |
| viewport meta | 不是留白，是**内核实现缺陷** | 布局视口 | 被整条丢弃后退化成「桌面站点式」渲染：布局视口 980px + 整页等比缩放，**比例整个错掉**（详见 B7） |

> ⚠️ **别把「桌面看不出来」当成「没问题」。** 上表第 1、2 行要真机的画布才暴露；
> 第 3 行是因为**桌面 DevTools 不模拟动态浏览器 UI**，`vh ≡ dvh`，缝恒为 0；
> 第 5 行桌面根本没有对应的退化路径。

---

## 一、必做项

### B1　`viewport` meta：单行书写 + 只留最通用的键

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

- **必须写在一行内**，且**不要加实验键**（如 `interactive-widget=resizes-content`）。
  实测两次教训：跨 4 行书写 → 小米浏览器**整条丢弃**；带 `interactive-widget` → 夸克浏览器**整条丢弃**。
- `viewport-fit=cover` 是 `env(safe-area-inset-*)` 生效的前提，**不能省**。
- 键盘避让不要依赖 `interactive-widget`：用交互侧的 `useKeyboardAvoid`（focus 时把字段滚进可视区）。
  **真机上没验证过的「更好」，不如已验证的「不出错」。**
- ⚠️ 运行时补 meta **无效**：`<head>` 解析期插入会生效，`load` 之后再插入浏览器**不再重新解读** →
  所以 B7 的兜底只能改整页比例，不能「补一条 meta」。

### B2　`color-scheme`：连写两条（不带 `only` + 带 `only`）

```scss
html {
  color-scheme: light;
  color-scheme: only light;
}

html.dark {
  color-scheme: dark;
  color-scheme: only dark;
}
```

- 带 `only` 的那条能禁掉 Chrome 的 **Auto Dark Theme** 覆写；但**不支持 `only` 关键字的引擎会丢掉整条声明**，
  所以前面必须留一条不带 `only` 的兜住（后者不支持时自动退化，不会更差）。
- ⚠️ 它只管到「配色协商层」。国产魔改内核（夸克 / QQ / UC / 小米）的强制深色是在**合成器层**注入
  `filter: invert()` 逐像素反色的，**CSS 拦不住** —— 那类问题只能靠「页面里别留突兀的纯白色块」减轻。
- ⚠️ 排查时不要用 CDP 的 `Emulation.setAutoDarkModeOverride` 去「排除浏览器强制深色」：
  实测与 MIUI 的「智能反色」**不等价**（零变化），据此排除会得出错误结论。

### B3　根元素显式画布底色，且与页面同源

```scss
html {
  background-color: var(--app-canvas, hsl(var(--background)));
}
```

- 画布是「页面之外」唯一可见的东西：地址栏收起/展开、回弹、安全区、任何**没铺到**的区域，露出的都是它。
  给它一个确定值，就把「页面之外的颜色」从 UA 手里拿回来了。
- 取值必须**与页面自身的底色同源**（这里退回 `--background`），于是「页面之外露出来的颜色」恒等于
  「页面自己的颜色」，深浅两档都跟随。
- **`--app-canvas` 命名可随前端调整，语义不可变**：它是**画布底色的唯一出口**。

### B4　钉住 `-webkit-text-size-adjust`

```scss
html {
  -webkit-text-size-adjust: 100%;
}
```

一行的事。不写就可能被内核放大正文。

### B5　全屏页贴容器顶部，不要靠居中

```scss
.full-screen-page {
  align-self: flex-start; /* 而不是让父级的 items-center 去居中它 */
}
```

- 这条正是为了消掉 B 表第 3 行（`vh` / `dvh` 差）造成的缝：页高 = 当前可视高，
  **贴顶 ⇒ 可见区域必被铺满**；多出来的部分在页面下方（屏幕外），根元素 `overflow: hidden` 也滚不到。
- 用 `align-self` 而不是 `position: fixed`：不需要新包含块，也不受入场过渡的 `transform` 影响。
- 这条**不依赖 `:has()`**，是真正的兜底。

### B6　「表面透明」必须同时声明画布色（token 契约）

任何让页面最上沿**透明**的皮肤/主题（例如把 header 交还给页面底色、或做渐变通栏），
**必须自己声明 `--app-canvas`**，否则画布色变成 `transparent` → 又退回给 UA 决定。

```scss
/* 主题里 */
:root {
  --app-canvas: <页面最上沿的颜色>; /* 落在 html 上 */
}
```

> 机制说明：默认实现会把 `--app-canvas` 取成「页面最上沿的颜色」。一旦那层透明，这个推导就断了。

### B7　布局视口兜底（应对内核丢弃 meta）

B1 的最简写法仍可能被丢。兜底分两半，缺一不可：

**① 交互侧**：入口文件在 **`createApp` 之前**调用（此刻全屏页还没创建 → 首帧即正确，不会「先画错再跳变」）

```ts
import { setupViewportFix } from './utils/viewport-fix';

setupViewportFix(); // 必须在 Vue 挂载前
```

判据只用 **`visualViewport.scale`**：正常页恒为 `1`，异常页为 `物理宽 / 980`（夸克实测 `0.4082`）。
修法是 `zoom = 1 / scale`。

**② 样式侧**：`zoom` **不会除** viewport 单位 → `100dvh` 会被多乘一次，必须配套写

```scss
html[data-vpfix] .full-screen-page {
  zoom: var(--vpfix-k);
  height: calc(100dvh / var(--vpfix-k));
}
```

作用域限定在标记属性下 ⇒ 正常手机（`scale = 1`）与桌面都匹配不到，**零影响**。
横竖屏切换要**能撤销**（横屏 980 ≈ 设备宽度，本就无需自救）。

> ❌ **两个已被实测排除的判据**，别再用：
> - `documentElement.clientWidth`：`<head>` 解析期**连正常页面都是 980**（meta 要到首次布局才生效）
>   → 用它会在**正常手机上误触发**。
> - `screen.width`：有的内核报**物理像素**（1200）；除 dpr 归一又会把 iPad（1024 CSS / dpr 2 → 512）
>   误判成手机。

---

## 二、禁止项（都踩过，写下来是为了别再踩）

| 禁止 | 为什么 | 正确做法 |
| --- | --- | --- |
| viewport meta 跨行书写 / 加实验键 | 会让**整条 meta** 被内核丢弃，比例整体错掉 | 单行 + 只留通用键（B1） |
| 把某层「染成另一个颜色」来盖住色带 | 打补丁，**必然把问题转移到别处**（实测：为盖住 `#f8fafc` 的缝把祖先链染成纯白，结果换出一条新白带） | **先修布局（B5），再统一颜色（B3）** |
| 运行时补 `<meta name="viewport">` | `load` 之后插入浏览器不再重新解读 | 改整页比例（B7） |
| 用 `clientWidth` / `screen.width` 判布局视口异常 | 见 B7 末尾两个反例 | 只用 `visualViewport.scale` |
| 用 `Emulation.setAutoDarkModeOverride` 排除「浏览器强制深色」 | 与 MIUI 智能反色不等价，实测零变化 | 合成器层无解，靠不留纯白色块 |
| 把画布色 / 结构色的推导留给 UA | 就是本页开头那条原则的反面 | 显式声明（B2/B3/B6） |

---

## 三、验收：怎么证明生效（不是「肉眼看没问题」）

跨内核问题**默认复现不出来**，所以验收必须主动构造条件：

1. **构造异常态**。桌面 Chrome 可用 CDP 精确注入，无需真机：
   - 安全区：`Emulation.setSafeAreaInsetsOverride`（实测 `top=47` 时 `env(safe-area-inset-top)` 真返回 `47px`）→
     **刘海/安全区分支可以在电脑上验证**。
   - `vh > dvh` 的缝：给容器加高等价量（如 +120px）模拟。
   - 布局视口被缩：把 `visualViewport.scale` 打到 `0.4082` 等价态。
   - ⚠️ 强制深色：`setAutoDarkModeOverride` **不等价**（见禁止项），别用它下结论。
2. **稳定化后再截图**，否则拿到的是噪声：
   - 注入的冻结样式必须在**加载之后**注入并**断言生效**（往 `head` 塞 `<style>` 会被解析器丢弃 → 实验静默失效）；
   - 等 `document.fonts.ready`；禁用过渡/动画；挖掉时间相关区域（倒计时等）。
   - 稳定后噪声下限 = **0（逐像素全等）**，所以「有差异」就一定是真差异。
3. **两组对照**：基线（改前等价态）vs 改后，逐像素比对。判据是「本该消失的像素差异消失了」，
   而不是「看起来对了」。
4. **同时验零影响**：桌面视口与正常手机路径必须报 **0 像素差异**——
   任何「顺手修好的东西」如果动到了正常路径，就不算修好。

> 调试真机时若没有 DevTools，可在页面注入浮层显示：视口尺寸 / `100vh` 实测值 / 安全区 /
> **各层背景色** / 命中链，并支持逐层染色。这比猜「这层是谁」快得多。

---

## 四、新前端接入清单

新建前端时逐项打勾（建议直接复制到该前端的 README 或 onboarding 清单）：

- [ ] **B1** `index.html` 的 viewport meta 是**单行**，无实验键，含 `viewport-fit=cover`
- [ ] **B2** 全局样式声明 `color-scheme`，且**不带 `only` 与带 `only` 各一条**，明暗两档都有
- [ ] **B3** 根元素有显式 `background-color`，取自画布 token，兜底值与页面底色同源
- [ ] **B4** 根元素 `-webkit-text-size-adjust: 100%`
- [ ] **B5** 全屏页容器是 `align-self: flex-start`（不依赖父级居中）
- [ ] **B6** 任何让页面上沿透明的主题都自行声明画布 token（写进主题契约与主题 README）
- [ ] **B7** 入口在 `createApp` 前调用视口兜底；样式侧有 `calc(<dvh> / var(--k))` 的配套规则与 `[data-*]` 作用域
- [ ] **验收** 用两组对照做逐像素比对，且「正常路径 0 差异」与「异常路径差异消失」都拿到
- [ ] **自检** `npm run check:baseline <你的前端目录>` 全绿

---

## 五、本仓现状（参考实现）

`oauth21` 已完成上述全部项，可作为抄写来源：

| 项 | 落点 |
| --- | --- |
| B1 | `oauth21/index.html`（注释里记了两次真机教训） |
| B2 / B3 / B4 | `oauth21/src/assets/styles/main.scss` 的「跨内核初始值同步」段 |
| B5 / B6 / B7② | `oauth21/src/assets/styles/mobile-auth.scss`（画布 token 与兜底样式段） |
| B6 契约 | `oauth21/src/themes/README.md`、`oauth21/src/themes/types.ts`（主题包声明画布色的要求）；参考主题 `oauth21/src/themes/sky/theme.scss` |
| B7① | `oauth21/src/utils/viewport-fix.ts`，在 `oauth21/src/main.ts` 顶部调用 |

> 相关但不同的主题机制（皮肤 / 版式）见[多主题 / 多版式开发模式](/frontend/multi-theme)与[主题系统](/frontend/theme)；前端整体约定见[前端统一规范](/frontend/coding-standard)。
