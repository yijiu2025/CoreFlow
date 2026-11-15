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

import { deriveAccent, normalizeHex } from './color';

/** 一个可选主题色 */
export interface AccentPreset {
  id: string;
  name: string;
  /**
   * `true` = 不写主色（跟随配色自带的主色）
   *
   * 这是"换配色按钮却不跟着变"的解药：主色是**后写的 inline 变量**，
   * 一旦写过就压过配色层的 `--mauth-primary`，于是选了石墨夜/珍珠白，按钮还是绿的。
   * `auto` 会把那几个 inline 变量删掉，让配色自己说话。
   */
  inherit?: boolean;
  /** 主色（按钮、链接、选中态、图表主线） */
  primary: string;
  /** 深一档（hover / active） */
  hover: string;
  /** 10%~12% 透明底（浅底按钮、选中背景） */
  soft: string;
  /** 焦点环 */
  focus: string;
  /**
   * 大面积浅底用的**饱和版**主色（卡面渐变、图表填充、光斑）
   *
   * 与 `primary` 分开的理由：主色还要承担"白字落在它上面"（实心按钮）和
   * "它落在白底上"（链接、选中文字）两个任务，因此必须压深；但把压深后的值
   * 直接按 26% 混进白底，得到的是一层**发灰的绿**（饱和度只剩一半）。
   * 参考站点的卡面之所以是清透的青柠，是因为它混的是鲜色而不是深色。
   *
   * 不换色的主题一律填 `primary`（行为与之前完全一致）。
   */
  tint: string;
  /** `true` = 用户用调色盘选的自定义色（值现场派生，不来自预设表） */
  custom?: boolean;
  /** 自定义色是否被自动调整过明度（对比度不足时的补救，UI 据此提示） */
  adjusted?: boolean;
  /** 调整后主色对当前底色的对比度（预设不填） */
  contrast?: number;
  /** 落在主色上的文字色（自定义色必填；预设由配色表给，此处留空） */
  onPrimary?: string;
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
    focus: 'rgba(35, 109, 233, 0.8)',
    tint: '#236de9'
  },
  {
    id: 'teal',
    name: '青碧',
    primary: '#0d9b8a',
    hover: '#0b8476',
    soft: 'rgba(13, 155, 138, 0.12)',
    focus: 'rgba(13, 155, 138, 0.8)',
    tint: '#0d9b8a'
  },
  {
    id: 'violet',
    name: '靛紫',
    primary: '#6d5ce7',
    hover: '#5b4bd1',
    soft: 'rgba(109, 92, 231, 0.12)',
    focus: 'rgba(109, 92, 231, 0.8)',
    tint: '#6d5ce7'
  },
  {
    id: 'amber',
    name: '琥珀',
    primary: '#d98324',
    hover: '#bf7018',
    soft: 'rgba(217, 131, 36, 0.14)',
    focus: 'rgba(217, 131, 36, 0.8)',
    tint: '#d98324'
  },
  {
    id: 'rose',
    name: '玫瑰',
    primary: '#d84a76',
    hover: '#c03c65',
    soft: 'rgba(216, 74, 118, 0.13)',
    focus: 'rgba(216, 74, 118, 0.8)',
    tint: '#d84a76'
  },
  {
    id: 'leaf',
    name: '青绿',
    /*
     * 与参考站点同一株青柠：**深色做墨、鲜色做底**。
     *
     * 旧值 `#3f8f2a`（色相 105°、饱和度 54%）按 26% 混进白卡后只剩一层
     * 灰绿（实测 `rgb(206,228,201)`，饱和度 0.33），而参考站点的卡面是
     * `rgb(211,240,183)`（色相 91°、饱和度 0.66）—— 同样的配方混出来的绿
     * 明显"脏"一档，因为混的是深色而不是鲜色。
     *
     * 所以拆开：`primary` 取青柠家族的深档、`tint` 取鲜青柠 `#82dd2d` 专供大面积浅底。
     *
     * 🔴 2026-11-15 再修一档「不够纯正」：旧值 `#4a7c14`（H89° S72% L28%）虽是深档，
     * 但饱和度只有 72%、色相偏黄，实心按钮与链接看起来发"脏绿/橄榄绿"。
     * 现在取色相 100°、饱和度 100% 的 `#2c8500`（白底对比 4.73:1，仍过 AA 文字线）——
     * 同一亮度下把"灰味"去掉，才是参考站点那种清透的青柠。
     * 已经不能再亮了：再往亮里走（如 `#58a021` 3.25:1）就不适合当文字色。
     */
    primary: '#2c8500',
    hover: '#237000',
    soft: 'rgba(44, 133, 0, 0.12)',
    focus: 'rgba(44, 133, 0, 0.75)',
    tint: '#82dd2d'
  },
  {
    id: 'wechat',
    name: '微信绿',
    /*
     * 「口袋版」主题包配套色：**深档做墨、鲜档做底**（与 leaf 同一套办法）。
     *
     * 品牌绿 `#07C160` 在白底上只有 2.38:1，而主色在本站还要当文字色用；
     * 直接拿它当 primary 会让链接、选中态、角色名都变得难以辨认。
     * 所以 primary 取同色相深档 `#0b8f45`（白底 4.18:1），`tint` 保留品牌鲜绿 ——
     * 大面积浅底（卡面渐变、光斑）用它，既有品牌绿，又不用在它上面落小字。
     */
    primary: '#0b8f45',
    hover: '#097a3b',
    soft: 'rgba(7, 193, 96, 0.12)',
    focus: 'rgba(7, 193, 96, 0.7)',
    tint: '#07c160'
  },
  {
    id: 'auto',
    name: '跟随配色',
    /*
     * 空色值 + `inherit`：`applyAccent` 只标记状态，由 `stores/accent` 的 `sync()`
     * 从**当前配色记录**回写主色组（不能删 inline 变量：配色自己的值也在同一槽位）。
     *
     * 为什么需要它：主色是**后写的 inline 变量**，优先级高于配色层。用户在「颜色主题」里
     * 换了石墨夜/珍珠白，按钮却还是上一套绿 —— 因为 accent 把 `--mauth-primary` 压住了。
     * 想要"换了配色按钮就跟着变"，就选这一档（它也会让选包联动失效，符合预期）。
     */
    inherit: true,
    primary: '',
    hover: '',
    soft: '',
    focus: '',
    tint: ''
  },
  {
    id: 'graphite',
    name: '石墨',
    primary: '#3f4a52',
    hover: '#2f3940',
    soft: 'rgba(63, 74, 82, 0.12)',
    focus: 'rgba(63, 74, 82, 0.75)',
    tint: '#3f4a52'
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
    if (!saved) return ACCENTS[0].id;
    // 预设 id 与自定义 hex 都合法（`#rrggbb` 走派生，见 `resolveAccent`）
    if (ACCENTS.some(item => item.id === saved)) return saved;
    const hex = normalizeHex(saved);
    if (hex) return hex;
  } catch {
    // 隐私模式下 localStorage 可能抛错：按默认色走，不阻塞启动
  }
  return ACCENTS[0].id;
}

/**
 * 当前明暗（决定自定义色往哪个方向钳制对比度）
 *
 * 读 DOM 的 `dark` 类而不是 pinia：本文件是**纯函数层**（无 store 依赖），
 * 而 `dark` 类由主题层在写 token 时同步维护，任何时刻都与实际底色一致。
 *
 * @returns 'light' | 'dark'
 */
function currentTone(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * 把一个 id 解析成完整的主题色定义
 *
 * 两种来源：
 *   · **预设 id**（`ocean` / `leaf` / `auto` …）—— 手调过的值，原样使用；
 *   · **任意 hex**（`#rrggbb`）—— 现场派生 hover / soft / focus / tint，并按当前
 *     明暗把 primary 钳制到对比度 ≥ 4.5（详见 `theme/color.ts`）。
 *
 * @param id 预设 id 或 hex
 * @param tone 明暗（不给则读 DOM）
 * @returns 主题色定义（未知 id 回落第一个预设）
 */
function resolveAccent(id: string, tone: 'light' | 'dark' = currentTone()): AccentPreset {
  const preset = ACCENTS.find(item => item.id === id);
  if (preset) return preset;

  const hex = normalizeHex(id);
  if (!hex) return ACCENTS[0];

  const derived = deriveAccent(hex, tone);
  if (!derived) return ACCENTS[0];

  return {
    id: hex,
    /* 自定义色没有名字：面板上直接显示色值，比"自定义 1"更有信息量 */
    name: hex.toUpperCase(),
    primary: derived.primary,
    hover: derived.hover,
    soft: derived.soft,
    focus: derived.focus,
    tint: derived.tint,
    onPrimary: derived.onPrimary,
    /* 供 UI 提示"已按对比度自动压深/提亮" */
    custom: true,
    adjusted: derived.adjusted,
    contrast: derived.contrast
  };
}

/**
 * 应用主题色
 *
 * @param id 预设 ID（未知值按默认处理）
 * @returns 实际生效的预设
 */
function applyAccent(id: string, tone: 'light' | 'dark' = currentTone()): AccentPreset {
  const preset = resolveAccent(id, tone);
  const root = document.documentElement;
  if (preset.inherit) {
    /*
     * 🔴 不能 `removeProperty`：配色层的 value 也是**同一元素上的 inline 声明**
     *    （ThemeRoot 把 token 写成 `html` 的 style），删掉会把配色自己的主色一起删掉，
     *    结果是 `--mauth-primary` 空值、按钮透明（实测踩过）。
     *    正确做法由 `stores/accent.ts` 的 `sync()` 负责：从当前配色记录里把这几项
     *    **回写**一遍。这里只标记状态。
     */
    root.dataset.accent = preset.id;
    return preset;
  } else {
    root.style.setProperty('--mauth-primary', preset.primary);
    root.style.setProperty('--mauth-primary-hover', preset.hover);
    root.style.setProperty('--mauth-primary-soft', preset.soft);
    root.style.setProperty('--mauth-tint', preset.tint);
    root.style.setProperty('--mauth-focus', preset.focus);
    /*
     * 自定义色要把"主色上的文字色"一起写：主色被提亮到 `#ffe066` 时白字只有 1.3:1，
     * 实心按钮会看不清。预设不写这一项 —— 它们由配色表给（都是手调过的配对）。
     */
    if (preset.onPrimary) root.style.setProperty('--mauth-on-primary', preset.onPrimary);
  }
  /* 自定义色统一标成 `custom`：CSS 侧不该为每种 hex 单独开选择器 */
  root.dataset.accent = preset.custom ? 'custom' : preset.id;
  return preset;
}

/**
 * 切换并持久化主题色
 *
 * @param id 预设 id 或任意 hex
 * @param tone 明暗（不给则读 DOM）
 * @returns 实际生效的预设
 */
function setAccent(id: string, tone: 'light' | 'dark' = currentTone()): AccentPreset {
  const preset = applyAccent(id, tone);
  try {
    localStorage.setItem(STORAGE_KEY, preset.id);
  } catch {
    // 存不上不影响本次会话生效
  }
  return preset;
}

export { ACCENTS, STORAGE_KEY, readAccentId, applyAccent, setAccent, resolveAccent, currentTone };
