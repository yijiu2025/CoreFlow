/**
 * 主题包契约
 *
 * === 主题包 = 一整套呈现方案（版式 + 配色），在一个目录里一起开发 ===
 * ```
 * theme/themes/<包>/                 主题包：一套设计
 * ├── index.ts                       包定义，同时充当该包的**默认配色**
 * ├── theme.scss                     （可选）包默认配色的附加样式
 * ├── <page>/index.vue               版式实现：基础版式（在包根，见下）
 * ├── <page>/<变体>/index.vue         版式实现：变体
 * └── colors/<配色>/                 该包下的其它配色：index.ts + theme.scss + assets/
 * ```
 * 两个 glob 决定注册表：包根的 `index.ts`（id = 包目录名）与 `colors` 下那层的
 * `index.ts`（id = 配色目录名）。**加一个包或加一套配色，都不需要改任何其它文件。**
 * ⚠️ 描述 glob 模式时别写出「星号紧跟斜杠」的字符组合：它会**提前闭合本段块注释**，
 *    报错行号会落在注释之后的正文上（本文件踩过一次）。
 *
 * ⚠️ **版式跟随主题包**：某一页的版式只在**当前包内**查找（见 `theme/views/registry.ts`），
 *    换一套设计就是换一个包，版式与配色不会各换一半。版式的**契约**与**注册表**
 *    是每页一份的页面文件（`theme/views/<page>.ts`），留在 `theme/views/` 架构层，
 *    **每个包共用一份** —— 跟着进包就会变成 N 份副本，必然漂移。
 *
 * ⚠️ 同一目录下的 `index.ts` 与 `theme.scss` 配套：只有样式、没有 `index.ts` 的目录
 *    视为残缺（样式被忽略）；反过来只有 `index.ts` 没有样式是正常情况。
 *
 * === 值怎么给：token 还是 theme.scss ===
 *   • 颜色、圆角、间距、字体族名  → `tokens`（走 `--mauth-*` 变量，会被白名单校验）
 *   • 背景图片、webfont、装饰边框、动画、结构级差异
 *                                → `theme.scss`（写真实 CSS，选择器必须带
 *                                   `html[data-mauth-theme='<id>']` 前缀）
 * 分界线的依据：token 取值要能被白名单校验（因此不接受 `url()`），
 * 凡是必须写 `url(...)` 或需要伪元素/keyframes 的，都用 theme.scss。
 *
 * @author yijiu2025
 */
import type { ThemeTokenOverrides } from '@/theme/runtime';

/** 配色的元信息（用于列表展示与日志，不参与渲染） */
export interface MauthThemeMeta {
  /**
   * 配色 id，以目录名为准：
   *   • 包根 `themes/<包>/index.ts`      → 包名本身（该包的默认配色）
   *   • 包内 `themes/<包>/colors/<配色>/` → `<配色>` 目录名
   * 只允许 `[a-z0-9-]`（它会进 `data-mauth-theme` 属性选择器）
   */
  id: string;
  /** 中文显示名 */
  name: string;
  /** 一句话描述，便于部署方挑选 */
  description?: string;
  /** 主色/强调色，供后台预览色卡使用（不参与渲染，渲染以 tokens 为准） */
  preview?: { primary: string; accent: string };
  /** 作者（可选） */
  author?: string;
}

/**
 * 主题包默认导出形态
 *
 * `tokens` 的语义（与原 SCSS 层叠规则严格一致，见 runtime.sanitizeOverrides）：
 *   • `light` —— **两档打底**：浅色生效，深色下也生效
 *   • `dark`  —— 仅在深色下追加覆盖
 * ⚠️ 因此 `light` 里的颜色类 token 若不写 `dark` 变体，深色下会沿用浅色值，
 *    可能造成深底浅字。**颜色请成对给**：品牌色在深色下通常需要提亮。
 *
 * ⚠️ 若主题把 `--mauth-header-bg` 设为 `transparent`（把底色交还给页面），
 *    必须同时声明 `--mauth-canvas`（页面最上沿的颜色），否则"页面之外的画布色"
 *    会退回给浏览器内核自己决定 → 真机与电脑不一致。参考 sky/theme.scss。
 */
export interface MauthThemePackage {
  meta: MauthThemeMeta;
  tokens?: ThemeTokenOverrides;
  /**
   * 该包 / 该配色默认给各页面用的**版式**（可选）
   *
   *   key   = 页面名，与 `theme/views/<page>.ts` 的页面名一致（如 `register`）
   *   value = 版式 id，即当前包内的 `themes/<包>/<page>/<id>/` 或 `themes/<包>/<page>/index.vue`
   *
   * 写在**包根**（`themes/<包>/index.ts`）→ 该包下**所有配色**共用这份声明；
   * 写在**配色里**（`colors/<配色>/index.ts`）→ 只覆盖这一套配色。
   *
   * 写错 / 未登记一律回退当前包的基础版式（由 `theme/views/<page>.ts` 判定，
   * 不会因为包写错而白屏）。
   *
   * ⚠️ URL `?view=` 优先级更高：声明不会挡住联调时的单次覆盖。
   */
  views?: Record<string, string>;
}

/** 注册表里一条已解析好的配色记录 */
export interface MauthThemeRecord {
  /**
   * 该配色所属的**主题包** id（= `themes/<包>/` 的目录名）
   *
   * 版式只在当前包内查找（版式跟随主题），所以容器与版式注册表都需要它。
   * 它同时是调试面板上"这套配色来自哪个包"的答案。
   */
  pkg: string;
  meta: MauthThemeMeta;
  /** 该主题的 token（已从包内取出，未做安全校验——校验在注入时统一做） */
  tokens: ThemeTokenOverrides | undefined;
  /** 该主题的版式声明（页面名 → 版式 id）；未声明为 undefined */
  views: Record<string, string> | undefined;
  /** 该主题附加样式的惰性加载器；无 theme.scss 时为 undefined */
  loadStyle: (() => Promise<string>) | undefined;
}
