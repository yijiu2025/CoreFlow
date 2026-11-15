/**
 * 设计令牌清单（**元数据**）—— 可视化外观编辑器的唯一数据源
 *
 * === 这份表解决什么问题 ===
 * 配色表里有六十多个 `--mauth-*`，但只有代码注释知道谁管什么。任何"逐组件改色"的界面
 * 都绕不开三个问题：**它叫什么（中文）**、**它归哪一组**、**它该用哪种控件**。
 * 没有这份表，编辑器只能列出几十个裸变量名 —— 那种界面没人敢用。
 *
 * === 三条约定 ===
 * 1. **只登记配色表里真实存在的键**。新增 token 必须先进配色表（`themes/<包>/<设备>/<页面>/colors/<配色>/`），
 *    再来这里补一行；反过来（表里有、配色表没有）会让编辑器写进一个不存在的变量，页面上什么都不会变。
 * 2. `kind` 决定控件：`color` 开取色器，`length` 用数值+单位输入（圆角/字号/字距）。
 * 3. `scope` 决定提示：`component` 表示"只影响这一类组件"，避免用户以为改的是全局。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 令牌值的形态（决定编辑器用什么控件） */
export type TokenKind = 'color' | 'length';

/** 令牌作用范围（决定提示语与预览方式） */
export type TokenScope = 'global' | 'component';

/** 一条令牌元数据 */
export interface TokenMeta {
  /** CSS 变量名（含 `--mauth-` 前缀，与配色表逐字一致） */
  key: string;
  /** 中文名（给用户看，不写实现细节） */
  label: string;
  /** 分组（编辑器按组折叠） */
  group: TokenGroup;
  /** 值形态 */
  kind: TokenKind;
  /** 作用范围 */
  scope: TokenScope;
  /** 一句话说明：改了会影响什么（用户最需要这句） */
  hint?: string;
  /**
   * 层级：`1` = 常用（面板默认只显示这些），`2` 或缺省 = 高级（收在"显示全部"后面）
   *
   * 为什么要分：六十多个令牌一次摊开，用户第一眼不知道该动哪个（"要设置的太多了"就是这个观感）。
   * 常用的其实只有十几个 —— 底、卡片、文字、主色、语义色、圆角；其余（分类色、徽标、
   * 开关、细节描边）都是"知道自己要找什么才会来找"的项。
   */
  tier?: 1 | 2;
}

/** 分组（顺序 = 编辑器里的顺序，从"大面"到"细部"） */
export const TOKEN_GROUPS = [
  '面与底',
  '文字',
  '语义色',
  '描边',
  '形状与排版',
  '分类色',
  '侧栏与顶栏',
  '卡片与表格',
  '工作台',
  '控件',
  '徽标'
] as const;

export type TokenGroup = (typeof TOKEN_GROUPS)[number];

/**
 * 全部令牌
 *
 * 顺序与配色表一致，便于人工核对；分组信息在 `group` 字段里。
 */
export const TOKEN_MANIFEST: TokenMeta[] = [
  /* ── 面与底 ─────────────────────────────────────────────── */
  { key: '--mauth-bg', label: '页面底色', group: '面与底', kind: 'color', scope: 'global', hint: '内容区最底层，壁纸就浮在它上面' , tier: 1 },
  { key: '--mauth-surface', label: '表面', group: '面与底', kind: 'color', scope: 'global', hint: '卡片、弹窗、输入框的通用底色' },
  { key: '--mauth-surface-2', label: '次级表面', group: '面与底', kind: 'color', scope: 'global', hint: '表头、分段控件底这类"比白再深半档"' },
  { key: '--mauth-hover', label: '悬停底', group: '面与底', kind: 'color', scope: 'global', hint: '鼠标移上去的浅底（行、按钮、导航）' },
  { key: '--mauth-press', label: '按压底', group: '面与底', kind: 'color', scope: 'global', hint: '按下时更深一档' },
  { key: '--mauth-overlay', label: '遮罩', group: '面与底', kind: 'color', scope: 'global', hint: '弹窗背后的暗层' },
  { key: '--mauth-plate-bg', label: '铭牌底', group: '面与底', kind: 'color', scope: 'global', hint: '深色规格铭牌 / 底部浮条（两种明暗都是深色面）' },
  { key: '--mauth-plate-ink', label: '铭牌文字', group: '面与底', kind: 'color', scope: 'global' },

  /* ── 文字 ───────────────────────────────────────────────── */
  { key: '--mauth-text', label: '正文', group: '文字', kind: 'color', scope: 'global' , tier: 1 },
  { key: '--mauth-text-mid', label: '次级文字', group: '文字', kind: 'color', scope: 'global' , tier: 1 },
  { key: '--mauth-text-soft', label: '标签文字', group: '文字', kind: 'color', scope: 'global', hint: '字段名、副标题' },
  { key: '--mauth-text-faint', label: '元信息文字', group: '文字', kind: 'color', scope: 'global', hint: '时间、占位符、提示' },

  /* ── 语义色 ─────────────────────────────────────────────── */
  { key: '--mauth-primary', label: '主色', group: '语义色', kind: 'color', scope: 'global', hint: '按钮、链接、选中态；会被「主题色」覆盖' , tier: 1 },
  { key: '--mauth-primary-hover', label: '主色（悬停）', group: '语义色', kind: 'color', scope: 'global' },
  { key: '--mauth-primary-soft', label: '主色（浅底）', group: '语义色', kind: 'color', scope: 'global', hint: '选中行、图标底' },
  { key: '--mauth-tint', label: '主色（大面积）', group: '语义色', kind: 'color', scope: 'global', hint: '卡面渐变、光斑用的饱和版' },
  {
    key: '--mauth-on-primary',
    label: '主色上的文字',
    group: '语义色',
    kind: 'color',
    scope: 'global',
    hint: '实心按钮/徽标的字色：亮主色配深字，深主色配白字（自定义色会自动算）'
  },
  { key: '--mauth-success', label: '成功', group: '语义色', kind: 'color', scope: 'global', hint: '开关打开、正常标签' , tier: 1 },
  { key: '--mauth-success-soft', label: '成功（浅底）', group: '语义色', kind: 'color', scope: 'global' },
  { key: '--mauth-danger', label: '危险', group: '语义色', kind: 'color', scope: 'global', hint: '删除、停用、错误' , tier: 1 },
  { key: '--mauth-danger-soft', label: '危险（浅底）', group: '语义色', kind: 'color', scope: 'global' },
  {
    key: '--mauth-warning',
    label: '提醒色',
    group: '语义色',
    kind: 'color',
    scope: 'global',
    hint: '需要注意但不致命：风险提示、待确认、即将过期',
    tier: 1
  },
  {
    key: '--mauth-warning-soft',
    label: '提醒（浅底）',
    group: '语义色',
    kind: 'color',
    scope: 'global',
    hint: '提醒色作背景的淡版'
  },
  { key: '--mauth-focus', label: '焦点环', group: '语义色', kind: 'color', scope: 'global', hint: '键盘聚焦时的外圈' },

  /* ── 描边 ───────────────────────────────────────────────── */
  { key: '--mauth-border', label: '描边', group: '描边', kind: 'color', scope: 'global' },
  { key: '--mauth-border-strong', label: '描边（强）', group: '描边', kind: 'color', scope: 'global', hint: '输入框、按钮的可见边框' },

  /* ── 形状与排版 ─────────────────────────────────────────── */
  { key: '--mauth-radius-xs', label: '圆角 XS', group: '形状与排版', kind: 'length', scope: 'global' },
  { key: '--mauth-radius-sm', label: '圆角 SM', group: '形状与排版', kind: 'length', scope: 'global', hint: '按钮、输入框' },
  { key: '--mauth-radius-md', label: '圆角 MD', group: '形状与排版', kind: 'length', scope: 'global', hint: '卡片、面板' , tier: 1 },
  { key: '--mauth-radius-lg', label: '圆角 LG', group: '形状与排版', kind: 'length', scope: 'global', hint: '弹窗' , tier: 1 },
  { key: '--mauth-radius-xl', label: '圆角 XL', group: '形状与排版', kind: 'length', scope: 'global' },
  { key: '--mauth-fs-display-m', label: '读数大字号', group: '形状与排版', kind: 'length', scope: 'global' },
  { key: '--mauth-track-eyebrow', label: '眉标字距', group: '形状与排版', kind: 'length', scope: 'global' },

  /* ── 分类色（只区分类别，不表示状态）────────────────────── */
  { key: '--mauth-cat-1-bg', label: '分类 1 底（沙）', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-1-ink', label: '分类 1 字', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-2-bg', label: '分类 2 底（天）', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-2-ink', label: '分类 2 字', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-3-bg', label: '分类 3 底（丁香）', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-3-ink', label: '分类 3 字', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-4-bg', label: '分类 4 底（玫瑰）', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-4-ink', label: '分类 4 字', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-5-bg', label: '分类 5 底（薄荷）', group: '分类色', kind: 'color', scope: 'global' },
  { key: '--mauth-cat-5-ink', label: '分类 5 字', group: '分类色', kind: 'color', scope: 'global' },

  /* ── 侧栏与顶栏 ─────────────────────────────────────────── */
  { key: '--mauth-nav-bg', label: '侧栏底', group: '侧栏与顶栏', kind: 'color', scope: 'component', hint: '只影响左侧导航' , tier: 1 },
  { key: '--mauth-nav-ink', label: '侧栏未选中文字', group: '侧栏与顶栏', kind: 'color', scope: 'component' },
  { key: '--mauth-nav-active-bg', label: '侧栏选中底', group: '侧栏与顶栏', kind: 'color', scope: 'component' },
  { key: '--mauth-topbar-bg', label: '顶栏底', group: '侧栏与顶栏', kind: 'color', scope: 'component', hint: '默认半透明，叠在内容上' , tier: 1 },

  /* ── 卡片与表格 ─────────────────────────────────────────── */
  { key: '--mauth-panel-bg', label: '卡片底', group: '卡片与表格', kind: 'color', scope: 'component', hint: '面板、卡片' , tier: 1 },
  { key: '--mauth-table-head-bg', label: '表头底', group: '卡片与表格', kind: 'color', scope: 'component' },
  { key: '--mauth-table-row-hover', label: '表格行悬停', group: '卡片与表格', kind: 'color', scope: 'component' },
  /* ── 工作台 ─────────────────────────────────────────────────
   * 八项都是「只长在后台工作台这一页」的颜色：卡面光/底色、成功率（读数 + 刻度环）、
   * 浅色方块（最近登录头像 + 常用入口图标）、「今天」那根柱子。
   *
   * 为什么要单独一组：这些位置此前全部由 `--mauth-primary` / `--mauth-primary-soft`
   * 现算或直接引用 —— 想让工作台"暖一点 / 素一点"，只能改主题色，连带按钮、选中态、
   * 全站链接一起变。成组拆出来之后，改这八项只动这一页。
   *
   * 默认值一律写成 `var(--mauth-primary*)`（配色表里合法单值），所以不动它们就等于
   * 现在的样子；换主题色时这八项仍然跟着走。
   * ─────────────────────────────────────────────────────────── */
  {
    key: '--mauth-pulse-glow',
    label: '脉搏卡·暖光',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '登录脉搏卡左上角那团光；嫌艳就调淡或改透明',
    tier: 1
  },
  {
    key: '--mauth-pulse-bg',
    label: '脉搏卡·底色',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '卡片渐变起点；改成与「卡片底」一致就完全素了',
    tier: 1
  },
  {
    key: '--mauth-pulse-bg-2',
    label: '脉搏卡·底色末端',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '渐变到右下的收尾色',
    tier: 1
  },
  {
    key: '--mauth-dash-rate',
    label: '成功率读数',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '「今日操作」卡片右下那个百分比',
    tier: 1
  },
  {
    key: '--mauth-dash-ring',
    label: '成功率刻度环',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '已点亮的刻度与环上那个端点',
    tier: 1
  },
  {
    key: '--mauth-dash-chip-bg',
    label: '小方块底色',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '最近登录首字头像、常用入口图标的底',
    tier: 1
  },
  {
    key: '--mauth-dash-chip-ink',
    label: '小方块图标',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '同一批方块里的首字与图标线',
    tier: 1
  },
  {
    key: '--mauth-dash-today',
    label: '「今天」柱',
    group: '工作台',
    kind: 'color',
    scope: 'component',
    hint: '近 7 天柱状图里今天那根柱子、斜纹与柱下的「今天」二字',
    tier: 1
  },

  /* ── 控件 ───────────────────────────────────────────────── */
  { key: '--mauth-btn-bg', label: '按钮底', group: '控件', kind: 'color', scope: 'component', hint: '次要按钮；主按钮跟随主色' , tier: 1 },
  { key: '--mauth-input-bg', label: '输入框底', group: '控件', kind: 'color', scope: 'component' , tier: 1 },
  { key: '--mauth-modal-bg', label: '弹窗底', group: '控件', kind: 'color', scope: 'component' },
  { key: '--mauth-tabbar-bg', label: '分段控件底', group: '控件', kind: 'color', scope: 'component' },
  { key: '--mauth-tab-active-bg', label: '分段选中底', group: '控件', kind: 'color', scope: 'component' },
  { key: '--mauth-switch-track', label: '开关轨道（关）', group: '控件', kind: 'color', scope: 'component', hint: '开关关闭时的凹槽' },
  { key: '--mauth-switch-on', label: '开关轨道（开）', group: '控件', kind: 'color', scope: 'component', hint: '默认取成功色，可单独改成主色' },
  { key: '--mauth-switch-knob', label: '开关滑块', group: '控件', kind: 'color', scope: 'component' },

  /* ── 徽标 ───────────────────────────────────────────────── */
  { key: '--mauth-tag-bg', label: '中性徽标底', group: '徽标', kind: 'color', scope: 'component' },
  { key: '--mauth-tag-ink', label: '中性徽标字', group: '徽标', kind: 'color', scope: 'component' },
  { key: '--mauth-tag-ok-bg', label: '成功徽标底', group: '徽标', kind: 'color', scope: 'component' },
  { key: '--mauth-tag-ok-ink', label: '成功徽标字', group: '徽标', kind: 'color', scope: 'component' },
  { key: '--mauth-tag-off-bg', label: '停用徽标底', group: '徽标', kind: 'color', scope: 'component' },
  { key: '--mauth-tag-off-ink', label: '停用徽标字', group: '徽标', kind: 'color', scope: 'component' },
  { key: '--mauth-tag-info-bg', label: '信息徽标底', group: '徽标', kind: 'color', scope: 'component' },
  { key: '--mauth-tag-info-ink', label: '信息徽标字', group: '徽标', kind: 'color', scope: 'component' }
];

/** 令牌名 → 元数据（编辑器按 key 查标签/分组用） */
export const TOKEN_BY_KEY: ReadonlyMap<string, TokenMeta> = new Map(
  TOKEN_MANIFEST.map(meta => [meta.key, meta])
);

/**
 * 按分组切分（保持 `TOKEN_GROUPS` 的顺序，空组不出现）
 *
 * @returns 分组 → 该组令牌
 */
export function tokensByGroup(): Array<{ group: TokenGroup; items: TokenMeta[] }> {
  return TOKEN_GROUPS.map(group => ({
    group,
    items: TOKEN_MANIFEST.filter(meta => meta.group === group)
  })).filter(section => section.items.length > 0);
}
