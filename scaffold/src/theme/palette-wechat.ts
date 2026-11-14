/**
 * 微信配色表（`themes/wechat/` 的色值单一来源）
 *
 * 与 `palette.ts`（珍珠玻璃）平级：一个主题包一份色表，壳文件只声明 meta/tone 并展开。
 *
 * === 为什么绿不是 `#07C160` ===
 * 微信的品牌绿 `#07C160` 落在白底上只有 **2.38:1**，而这个后台把主色当**文字色**用了
 * 五十多处（链接、选中态、角色名、标签）—— 直接用它等于把可读性交给运气。
 * 所以按 `accent.ts` 里 leaf 主题同一套办法拆开：
 *   · `--mauth-primary`  取同色相的深档 `#0b8f45`（白底 4.18:1，浅灰底 3.57:1），
 *     承担文字、实心按钮、TabBar 选中；
 *   · `--mauth-tint`     保留品牌鲜绿 `#07c160`，只用于大面积浅底（卡面、光斑、头像底），
 *     这类地方不需要"字压在上面"，鲜一点反而更像微信。
 * 深色档反过来：底色足够深，`#07c160` 的对比度自然够（约 6.2:1），直接当主色用。
 *
 * === 表面语言 ===
 * 微信是「灰底 + 白块」：页面底 `#EDEDED`，列表是白色整块（8~10px 圆角、块间留 8px），
 * 块内靠 **1px 发丝线**分隔而不是卡片间距。所以 `--mauth-surface` 必须明显亮于
 * `--mauth-bg`，`--mauth-border` 也要比珍珠玻璃更淡（`rgba(0,0,0,0.08)` 就够）——
 * 这是本包和 default 最大的差别，改 token 前先想清楚这一点。
 *
 * 🔴 token 名必须 `--mauth-` 前缀，值只接受 hex / rgb(a) / hsl(a) / px / % / em /
 *    var(--mauth-*)（skinsuite 注入前有白名单校验）。阴影、字体栈写不进 token。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */

/** 浅色（微信白天） */
export const WECHAT_LIGHT_TOKENS = {
  /* 场景与表面 */
  '--mauth-bg': '#ededed',
  '--mauth-surface': '#ffffff',
  '--mauth-surface-2': '#f7f7f7',
  '--mauth-hover': 'rgba(0, 0, 0, 0.04)',
  '--mauth-press': 'rgba(0, 0, 0, 0.07)',
  '--mauth-overlay': 'rgba(0, 0, 0, 0.4)',
  '--mauth-plate-bg': 'rgba(25, 25, 25, 0.9)',
  '--mauth-plate-ink': '#f2f2f2',

  /* 文字四档（微信：正文近黑、次要 #888、最弱 #b2） */
  '--mauth-text': '#191919',
  '--mauth-text-mid': '#555555',
  '--mauth-text-soft': '#888888',
  '--mauth-text-faint': '#b2b2b2',

  /* 语义色 */
  '--mauth-primary': '#0b8f45',
  '--mauth-primary-hover': '#097a3b',
  '--mauth-primary-soft': 'rgba(7, 193, 96, 0.12)',
  '--mauth-tint': '#07c160',
  '--mauth-success': '#2aa650',
  '--mauth-success-soft': 'rgba(42, 166, 80, 0.12)',
  '--mauth-danger': '#fa5151',
  '--mauth-danger-soft': 'rgba(250, 81, 81, 0.12)',
  '--mauth-focus': 'rgba(7, 193, 96, 0.7)',

  /* 描边（发丝线：微信的分隔线比珍珠玻璃淡一半） */
  '--mauth-border': 'rgba(0, 0, 0, 0.08)',
  '--mauth-border-strong': 'rgba(0, 0, 0, 0.14)',

  /* 圆角与排版 */
  '--mauth-radius-xs': '6px',
  '--mauth-radius-sm': '8px',
  '--mauth-radius-md': '10px',
  '--mauth-radius-lg': '12px',
  '--mauth-radius-xl': '16px',
  '--mauth-fs-display-m': '24px',
  '--mauth-track-eyebrow': '0.08em',

  /* 分类色（微信里的标签是浅底 + 同色系深字，不用高饱和） */
  '--mauth-cat-1-bg': '#fbf0d9',
  '--mauth-cat-1-ink': '#8a6414',
  '--mauth-cat-2-bg': '#e3eefc',
  '--mauth-cat-2-ink': '#2b5f9e',
  '--mauth-cat-3-bg': '#ece7fb',
  '--mauth-cat-3-ink': '#5a4a9c',
  '--mauth-cat-4-bg': '#fce7e7',
  '--mauth-cat-4-ink': '#9a3b3b',
  '--mauth-cat-5-bg': '#e3f5e8',
  '--mauth-cat-5-ink': '#25734a'
} as const;

/**
 * 手机端尺度（叠在浅/深色之后，**不含颜色**）
 *
 * 微信的块是「大圆角 + 大行高」：整块列表 10px 圆角、单条 cell 高 ≥52px。
 * 珍珠玻璃的手机端是 14/18px，那套更"圆润"；这里收紧两档，
 * 否则白块在 390px 上会像一颗颗药丸。
 */
export const WECHAT_MOBILE_TOKENS = {
  '--mauth-radius-md': '10px',
  '--mauth-radius-lg': '10px'
};

/** 深色（微信夜间：纯黑底 + 深灰块，绿保持品牌色） */
export const WECHAT_DARK_TOKENS = {
  '--mauth-bg': '#111111',
  '--mauth-surface': '#191919',
  '--mauth-surface-2': '#1f1f1f',
  '--mauth-hover': 'rgba(255, 255, 255, 0.05)',
  '--mauth-press': 'rgba(255, 255, 255, 0.09)',
  '--mauth-overlay': 'rgba(0, 0, 0, 0.66)',
  '--mauth-plate-bg': 'rgba(25, 25, 25, 0.92)',
  '--mauth-plate-ink': '#f2f2f2',

  '--mauth-text': '#d6d6d6',
  '--mauth-text-mid': '#a3a3a3',
  '--mauth-text-soft': '#8a8a8a',
  '--mauth-text-faint': '#666666',

  /* 深底上鲜绿就够读（6.2:1），不必再压深 */
  '--mauth-primary': '#07c160',
  '--mauth-primary-hover': '#2bd07c',
  '--mauth-primary-soft': 'rgba(7, 193, 96, 0.16)',
  '--mauth-tint': '#07c160',
  '--mauth-success': '#3eb575',
  '--mauth-success-soft': 'rgba(62, 181, 117, 0.16)',
  '--mauth-danger': '#fa5151',
  '--mauth-danger-soft': 'rgba(250, 81, 81, 0.16)',
  '--mauth-focus': 'rgba(7, 193, 96, 0.75)',

  '--mauth-border': 'rgba(255, 255, 255, 0.09)',
  '--mauth-border-strong': 'rgba(255, 255, 255, 0.16)',

  '--mauth-radius-xs': '6px',
  '--mauth-radius-sm': '8px',
  '--mauth-radius-md': '10px',
  '--mauth-radius-lg': '12px',
  '--mauth-radius-xl': '16px',
  '--mauth-fs-display-m': '24px',
  '--mauth-track-eyebrow': '0.08em',

  '--mauth-cat-1-bg': 'rgba(251, 240, 217, 0.14)',
  '--mauth-cat-1-ink': '#e8cf9a',
  '--mauth-cat-2-bg': 'rgba(227, 238, 252, 0.14)',
  '--mauth-cat-2-ink': '#a8c6ef',
  '--mauth-cat-3-bg': 'rgba(236, 231, 251, 0.14)',
  '--mauth-cat-3-ink': '#c3b6ee',
  '--mauth-cat-4-bg': 'rgba(252, 231, 231, 0.14)',
  '--mauth-cat-4-ink': '#f0b3b3',
  '--mauth-cat-5-bg': 'rgba(227, 245, 232, 0.14)',
  '--mauth-cat-5-ink': '#a5dbb9'
} as const;
