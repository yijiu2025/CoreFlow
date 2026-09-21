/**
 * 主题包契约
 *
 * 一个主题 = `src/themes/<id>/` 一个文件夹，至少含 `index.ts`；
 * 需要背景图 / 字体文件 / 伪元素装饰时，再加一个 `theme.scss`。
 * 注册表由 `import.meta.glob` 自动扫描，**加主题不需要改任何其他文件**。
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

/** 主题元信息（用于列表展示与日志，不参与渲染） */
export interface MauthThemeMeta {
  /** 主题 id，必须与所在文件夹名一致，只允许 [a-z0-9-] */
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
 */
export interface MauthThemePackage {
  meta: MauthThemeMeta;
  tokens?: ThemeTokenOverrides;
}

/** 注册表里一条已解析好的主题记录 */
export interface MauthThemeRecord {
  meta: MauthThemeMeta;
  /** 该主题的 token（已从包内取出，未做安全校验——校验在注入时统一做） */
  tokens: ThemeTokenOverrides | undefined;
  /** 该主题附加样式的惰性加载器；无 theme.scss 时为 undefined */
  loadStyle: (() => Promise<string>) | undefined;
}
