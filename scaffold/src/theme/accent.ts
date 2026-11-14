/**
 * 主题色（accent）—— 用户可切换的品牌色
 *
 * 为什么是运行时覆盖而不是新增配色目录：
 * 骨架（侧栏/顶栏/内容区）的颜色来自 skinsuite 主题包，配色目录是「包 × 设备 × 页面 × 配色」
 * 的**构建期**矩阵（8 份壳文件共享 `palette.ts`）。用户想换的只是"主色调"这一个维度，
 * 为它复制 8×N 份壳文件既难维护，也没必要 —— 主色只有 4 个 token。
 *
 * 所以这里走**外部覆写层**：只改 `--mauth-primary*` / `--focus` 四个变量，
 * 其余（表面、文字、语义色）仍由主题包决定。这样：
 *   - 明暗切换、版式切换、设备切换全部照旧（它们不改主色）；
 *   - 任何用到 `var(--mauth-primary)` 的组件自动跟随，业务代码不用感知。
 *
 * 🔴 写的是 `document.documentElement.style`（inline）。主题包也是往同一位置写 inline，
 *    靠**写入顺序**决胜 —— 所以必须在主题应用**之后**调用（见 main.ts 的启动顺序）。
 *    色值全部来自本文件的常量表，不接受用户输入，因此不经过 skinsuite 的
 *    sanitizeOverrides 也不存在注入风险。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */

/** 一个可选主题色 */
export interface AccentPreset {
  id: string;
  name: string;
  /** 主色（按钮、链接、选中态、图表主线） */
  primary: string;
  /** 深一档（hover / active） */
  hover: string;
  /** 10%~12% 透明底（浅底按钮、选中背景） */
  soft: string;
  /** 焦点环 */
  focus: string;
}

/**
 * 预设主题色
 *
 * `ocean` 与 `palette.ts` 的默认主色一致，保证"不改设置"时视觉零变化。
 */
const ACCENTS: AccentPreset[] = [
  {
    id: 'ocean',
    name: '海蓝',
    primary: '#236de9',
    hover: '#1d61d5',
    soft: 'rgba(35, 109, 233, 0.1)',
    focus: 'rgba(35, 109, 233, 0.8)'
  },
  {
    id: 'teal',
    name: '青碧',
    primary: '#0d9b8a',
    hover: '#0b8476',
    soft: 'rgba(13, 155, 138, 0.12)',
    focus: 'rgba(13, 155, 138, 0.8)'
  },
  {
    id: 'violet',
    name: '靛紫',
    primary: '#6d5ce7',
    hover: '#5b4bd1',
    soft: 'rgba(109, 92, 231, 0.12)',
    focus: 'rgba(109, 92, 231, 0.8)'
  },
  {
    id: 'amber',
    name: '琥珀',
    primary: '#d98324',
    hover: '#bf7018',
    soft: 'rgba(217, 131, 36, 0.14)',
    focus: 'rgba(217, 131, 36, 0.8)'
  },
  {
    id: 'rose',
    name: '玫瑰',
    primary: '#d84a76',
    hover: '#c03c65',
    soft: 'rgba(216, 74, 118, 0.13)',
    focus: 'rgba(216, 74, 118, 0.8)'
  },
  {
    id: 'leaf',
    name: '青绿',
    // 绿色主色要压深一档：白字要落在它上面，青柠 #82dd2d 的对比度撑不住（那只适合做数据色）
    primary: '#3f8f2a',
    hover: '#34761f',
    soft: 'rgba(63, 143, 42, 0.13)',
    focus: 'rgba(63, 143, 42, 0.8)'
  },
  {
    id: 'graphite',
    name: '石墨',
    primary: '#3f4a52',
    hover: '#2f3940',
    soft: 'rgba(63, 74, 82, 0.12)',
    focus: 'rgba(63, 74, 82, 0.75)'
  }
];

/** localStorage 键（与主题的 `mauth:mode` / `mauth:theme` 同一命名族） */
const STORAGE_KEY = 'mauth:accent';

/**
 * 读当前主题色 ID
 *
 * @returns 预设 ID；未设置或已失效时回落到第一个（默认海蓝）
 */
function readAccentId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ACCENTS.some(item => item.id === saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 可能抛错：按默认色走，不阻塞启动
  }
  return ACCENTS[0].id;
}

/**
 * 应用主题色
 *
 * @param id 预设 ID（未知值按默认处理）
 * @returns 实际生效的预设
 */
function applyAccent(id: string): AccentPreset {
  const preset = ACCENTS.find(item => item.id === id) ?? ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty('--mauth-primary', preset.primary);
  root.style.setProperty('--mauth-primary-hover', preset.hover);
  root.style.setProperty('--mauth-primary-soft', preset.soft);
  root.style.setProperty('--mauth-focus', preset.focus);
  root.dataset.accent = preset.id;
  return preset;
}

/**
 * 切换并持久化主题色
 *
 * @param id 预设 ID
 * @returns 实际生效的预设
 */
function setAccent(id: string): AccentPreset {
  const preset = applyAccent(id);
  try {
    localStorage.setItem(STORAGE_KEY, preset.id);
  } catch {
    // 存不上不影响本次会话生效
  }
  return preset;
}

export { ACCENTS, STORAGE_KEY, readAccentId, applyAccent, setAccent };
