/**
 * 颜色工具：任意色 → 一整套主题色令牌
 *
 * === 为什么需要这一层 ===
 * 预设主题色是**枚举**（一个 id 对应 5 个手调值）。无极调色盘要接受任意色，
 * 就必须自己把「一个色」派生为 5 个值：
 *
 *   primary  —— 落在白底/暗底上要能当**文字色**（对比 ≥ 4.5），必要时自动压深/提亮
 *   hover    —— 同色相、明度再走一档
 *   soft     —— 12% 透明底（浅底按钮、选中背景）
 *   focus    —— 80% 透明（焦点环）
 *   tint     —— **原色**，专供大面积浅底（卡面渐变、光斑）
 *
 * === 为什么用 OKLCH 而不是 HSL ===
 * HSL 的 L 不是感知明度：同为 L=50%，黄色看着比蓝色亮得多。用它派生会出现
 * 「改色相后按钮突然变刺眼/变糊」。OKLCH 的 L 是感知均匀的，只调 L 时色相与
 * 彩度不漂移 —— 这也是旧青绿 `#4a7c14` 发"脏绿"的教训（HSL 思路只压了 L）。
 *
 * 实现为纯函数、无依赖：OKLab 矩阵转换 + WCAG 相对亮度，都不需要第三方库。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 派生结果（与 `AccentPreset` 的五个色值字段一一对应） */
export interface DerivedAccent {
  /** 主色（hex）—— 已按当前明暗钳制过对比度 */
  primary: string;
  /** hover / active（hex） */
  hover: string;
  /** 12% 透明底 */
  soft: string;
  /** 焦点环（80% 透明） */
  focus: string;
  /** 大面积浅底用的原色（hex） */
  tint: string;
  /**
   * **落在主色上的文字色**（实心按钮的字）
   *
   * 必须有这一项：主色要同时满足"它落在底上可读"和"它上面的字可读"，这两个要求
   * 在亮色上会打架。深色模式下主色被提亮到 `#ffe066` 时，白字在它上面只有 1.3:1 ——
   * 实心按钮直接看不清。所以文字色跟着主色的明度走：亮主色配深字，深主色配白字。
   */
  onPrimary: string;
  /** 是否因为对比度不足被自动调整过（UI 用来提示"已自动压深"） */
  adjusted: boolean;
  /** 调整后主色对当前底色的对比度 */
  contrast: number;
}

/** 明暗两档的"背景参照色"——主色最常落在这两种底上 */
const BG = {
  light: '#ffffff',
  /** 石墨夜的面板底色（主色当文字色时最常落的底） */
  dark: '#161a1d'
} as const;

/** 主色作为文字色时的最低对比度（WCAG AA 正文） */
const MIN_CONTRAST = 4.5;

/**
 * 归一化 hex
 *
 * 接受 `#abc` / `#aabbcc` / `abc`（大小写不限），统一成小写 `#aabbcc`。
 *
 * @param input 用户输入
 * @returns 合法 hex；不合法返回 null
 */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

/** hex → [r, g, b]（0~255） */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16)
  ];
}

/** [r, g, b]（0~255）→ hex */
function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** 通道 0~255 → 线性光（sRGB 传递函数） */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 线性光 → 通道 0~255 */
function fromLinear(value: number): number {
  const v = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return v * 255;
}

/** WCAG 相对亮度 */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 两个颜色的对比度（WCAG 2.x，1~21）
 *
 * @param a hex
 * @param b hex
 * @returns 对比度
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** OKLCH（L 0~1，C 0~0.4，H 0~360） */
interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** hex → OKLCH */
function hexToOklch(hex: string): Oklch {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.sqrt(okA * okA + okB * okB);
  let h = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: okL, c, h };
}

/**
 * OKLCH → hex
 *
 * 超出 sRGB 色域时**逐通道裁剪**（而不是降彩度）：裁剪后的色相基本不变，
 * 只是略失饱和，视觉上比"整体降彩度变灰"更可接受。
 */
function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180;
  const okA = c * Math.cos(rad);
  const okB = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * okA + 0.2158037573 * okB) ** 3;
  const m_ = (l - 0.1055613458 * okA - 0.0638541728 * okB) ** 3;
  const s_ = (l - 0.0894841775 * okA - 1.291485548 * okB) ** 3;

  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  return rgbToHex([fromLinear(r), fromLinear(g), fromLinear(b)]);
}

/**
 * 调整感知明度，直到主色在指定底色上的对比度达标
 *
 * 只动 L（保持色相与彩度），方向取决于原色比底色亮还是暗：
 *   · 浅色底 + 主色太浅 ⇒ 压深；
 *   · 暗色底 + 主色太暗 ⇒ 提亮。
 * 用二分而不是"按比例压"：感知明度与对比度不是线性关系，按比例压要么压不够、
 * 要么压过头（把鲜绿压成墨绿）。
 *
 * @param hex 原色
 * @param bg 背景色
 * @param target 目标对比度
 * @returns 调整后的 hex 与最终对比度
 */
function clampLForContrast(
  hex: string,
  bg: string,
  target: number
): { hex: string; contrast: number; adjusted: boolean } {
  const base = contrastRatio(hex, bg);
  if (base >= target) return { hex, contrast: base, adjusted: false };

  const lch = hexToOklch(hex);
  const darkBg = luminance(bg) < 0.18;
  // 暗底要往亮走、浅底要往暗走；二分区间取"从当前 L 到端点"
  let lo = darkBg ? lch.l : 0;
  let hi = darkBg ? 1 : lch.l;
  let best = hex;
  let bestContrast = base;

  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    const candidate = oklchToHex({ ...lch, l: mid });
    const ratio = contrastRatio(candidate, bg);
    if (ratio >= target) {
      // 达标：记住这个解，然后往"改动更小"的方向收
      best = candidate;
      bestContrast = ratio;
      if (darkBg) hi = mid;
      else lo = mid;
    } else if (darkBg) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return { hex: best, contrast: bestContrast, adjusted: best !== hex };
}

/**
 * 主色上的文字色：白与深墨之间取**对比更高的那个**
 *
 * 不能写成"白字 ≥4.5 才用白，否则用深字"：中等明度的色（如 `#0b8f45`）
 * 白字 4.18、深字 1.9 —— 按阈值会选深字，反而更糟。两边都比一遍才稳。
 *
 * 深墨取 `#101418`（与配色里的 `--mauth-text` 同族），不用纯黑：纯黑压在中低明度
 * 主色上边缘会显得"脏"。
 *
 * @param hex 主色
 * @returns `#ffffff` 或 `#101418`
 */
function onColorFor(hex: string): string {
  return contrastRatio('#ffffff', hex) >= contrastRatio('#101418', hex) ? '#ffffff' : '#101418';
}

/** 按相对明度走一档（hover 用）：浅色配色更深，深色配色更亮 */
function shiftL(hex: string, delta: number): string {
  const lch = hexToOklch(hex);
  return oklchToHex({ ...lch, l: Math.max(0, Math.min(1, lch.l + delta)) });
}

/** hex + 透明度 → `rgba()` */
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 任意色 → 一整套主题色令牌
 *
 * @param input 用户选的色（hex，`#abc` 亦可）
 * @param tone 当前明暗（决定往哪个方向钳制对比度）
 * @returns 派生结果；输入非法时返回 null
 */
export function deriveAccent(input: string, tone: 'light' | 'dark'): DerivedAccent | null {
  const hex = normalizeHex(input);
  if (!hex) return null;

  const bg = BG[tone];
  const { hex: primary, contrast, adjusted } = clampLForContrast(hex, bg, MIN_CONTRAST);

  return {
    primary,
    hover: shiftL(primary, tone === 'dark' ? 0.06 : -0.06),
    soft: withAlpha(primary, 0.12),
    focus: withAlpha(primary, 0.8),
    tint: hex,
    onPrimary: onColorFor(primary),
    adjusted,
    contrast
  };
}

/**
 * 把任意颜色值转成 `<input type="color">` 能吃的 `#rrggbb`
 *
 * 配色表里的值可能是 `rgba(...)`（半透明面板、侧栏）、`#rgb`、甚至 `color-mix(...)`。
 * 原生取色器只认 6 位 hex，所以要归一化；认不出来的（如 `color-mix`）回退成中性灰，
 * 让用户至少能从这里改出一个明确的值。
 *
 * @param value CSS 颜色值
 * @returns `#rrggbb`
 */
export function toPickerHex(value: string): string {
  const raw = String(value ?? '').trim();
  const hex = normalizeHex(raw);
  if (hex) return hex;

  // rgb() / rgba()：取前三个数字
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean).slice(0, 3).map(Number);
    if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
      return rgbToHex(parts as [number, number, number]);
    }
  }

  // hsl()：交给浏览器解析太麻烦，这里只做最基本的换算
  const hsl = /^hsla?\(([^)]+)\)$/i.exec(raw);
  if (hsl) {
    const [h, sat, l] = hsl[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if ([h, sat, l].every(n => Number.isFinite(n))) {
      return hslToHex(h, sat, l);
    }
  }

  return '#888888';
}

/** HSL（h 0~360，s/l 0~100）→ hex */
function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): number => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/**
 * 用新的 hex 替换原值，但**保留原来的透明度**
 *
 * 为什么必须保留：侧栏 / 顶栏 / 面板的底色是半透明的（`rgba(…, .72)`），
 * 用户只想换个色相，一改就变成不透明的话，玻璃质感和壁纸透出全没了 —— 那是最典型的
 * "改个颜色把设计改坏了"。
 *
 * @param original 原 CSS 值
 * @param hex 新颜色
 * @returns 保留 alpha 的新值
 */
export function withOriginalAlpha(original: string, hex: string): string {
  const normalized = normalizeHex(hex);
  if (!normalized) return original;
  const m = /^rgba?\(([^)]+)\)$/i.exec(String(original ?? '').trim());
  if (!m) return normalized;
  const parts = m[1].split(/[,/\s]+/).filter(Boolean);
  const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  if (!Number.isFinite(alpha) || alpha >= 1) return normalized;
  const [r, g, b] = hexToRgb(normalized);
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(2))})`;
}
