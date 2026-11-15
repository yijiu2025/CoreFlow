/**
 * 令牌覆盖层（自定义模式）
 *
 * === 它在优先级链里的位置 ===
 * ```
 * 用户覆盖（本文件） > 主题色 accent > 配色（themes/…/colors/<id>）
 * ```
 * 三者都写 `document.documentElement.style`，靠**写入顺序**决胜 —— 所以
 * `stores/overrides` 必须在主题层与 accent 层之后应用（见 `App.vue` 的 watch）。
 *
 * === 为什么"重置"不能 removeProperty ===
 * 配色层的 token 也是同一元素的 inline 声明（theme-runtime 整批写）。直接删掉某个变量，
 * 等于把配色自己给的值一起删了 —— 那一项会退化成空值（`var()` 解析失败 ⇒ 透明/初始值）。
 * 所以重置时要把**该配色记录里的基值写回去**，而不是删。
 *
 * === 安全 ===
 * 值只接受 CSS 单值白名单（hex / rgb(a) / hsl(a) / 长度），键只接受令牌清单里登记过的。
 * 用户输入永远不直接进 `style`：颜色走 `<input type="color">`，长度走数字输入，
 * 但 localStorage 与账号数据都可能被改，所以仍然逐项校验。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
/*
 * 🔴 这里带 `.ts` 后缀是**故意的**：`scripts/check-color.mjs` 用 Node 直接加载本文件跑
 *    纯函数关卡，而 Node 的类型剥离不支持无扩展名的相对导入（Vite 能解析，Node 不能）。
 *    其余文件保持无后缀风格，只有"要被 Node 直接加载"的模块需要这样写。
 */
import { TOKEN_BY_KEY } from './token-manifest.ts';
import { accentVarOf } from './accent-tokens.ts';

/** localStorage 键（与 `mauth:accent` / `mauth:density` 同一命名族） */
export const OVERRIDES_STORAGE_KEY = 'mauth:overrides';

/** 覆盖表：令牌名 → CSS 值 */
export type TokenOverrides = Record<string, string>;

/** 颜色值白名单 */
const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
/** 长度值白名单（px / rem / em / %） */
const LENGTH_RE = /^\d+(\.\d+)?(px|rem|em|%)$/;

/**
 * 校验单个覆盖项
 *
 * @param key 令牌名
 * @param value CSS 值
 * @returns 合法返回 true
 */
export function isValidOverride(key: string, value: string): boolean {
  const meta = TOKEN_BY_KEY.get(key);
  if (!meta) return false;
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 64) return false;
  return meta.kind === 'color' ? COLOR_RE.test(raw) : LENGTH_RE.test(raw);
}

/**
 * 归一化整张覆盖表（丢掉非法键与非法值）
 *
 * 从 localStorage / 服务端读回来的数据都过这一道：配色目录可能已经删掉某个令牌，
 * 而存储里还留着它的覆盖值 —— 不过滤的话会写进一个没人消费的变量（看着"改了没反应"）。
 *
 * @param raw 任意来源的对象
 * @returns 干净的覆盖表
 */
export function normalizeOverrides(raw: unknown): TokenOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TokenOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    if (!isValidOverride(key, value)) continue;
    out[key] = value.trim();
  }
  return out;
}

/**
 * 读本地覆盖表
 *
 * @returns 干净的覆盖表（没有则空对象）
 */
export function readOverrides(): TokenOverrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    return normalizeOverrides(JSON.parse(raw));
  } catch {
    // 隐私模式 / 脏数据：当作没有覆盖，不阻塞启动
    return {};
  }
}

/**
 * 写本地覆盖表
 *
 * 空表就删键（而不是存 `{}`）：`hasExplicitAccent` 那类"有没有表达过偏好"的判断
 * 靠的是键存在与否，存空对象会让"我全重置了"看起来像"我设过一堆"。
 *
 * @param overrides 覆盖表
 */
export function writeOverrides(overrides: TokenOverrides): void {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(OVERRIDES_STORAGE_KEY);
    else localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // 存不上不影响本次会话生效
  }
}

/** 上一轮实际写过的令牌（用于"这一轮取消覆盖"时还原） */
let applied = new Set<string>();

/**
 * 把覆盖写进 DOM
 *
 * @param overrides 当前覆盖表
 * @param baseTokens 当前配色记录里的 token（用于还原被取消的覆盖）
 */
export function applyOverrides(overrides: TokenOverrides, baseTokens: TokenOverrides): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  /*
   * ① 先还原"上一轮覆盖过、这一轮不覆盖了"的令牌。
   *    写回基值而不是 removeProperty —— 配色层也是 inline，
   *    删掉会把它的值一起删（那一项直接变空）。
   *
   * 🔴 "基值"不等于"配色记录里的值"：主色组（`accent-tokens.ts`）的真值由 accent 层
   *    后写，配色记录里那份只是构建期的默认色。照抄记录 = 用户取消自定义后，
   *    主色从他的琥珀退回配色表的蓝（同源 bug：徽标不跟主色）。
   */
  for (const key of applied) {
    if (overrides[key]) continue;
    const base = accentVarOf(key) ?? baseTokens[key];
    if (base) root.style.setProperty(key, base);
    else root.style.removeProperty(key);
  }

  // ② 再写当前覆盖（后写者胜，天然压过配色层与 accent 层）
  for (const [key, value] of Object.entries(overrides)) {
    root.style.setProperty(key, value);
  }

  applied = new Set(Object.keys(overrides));
}

/**
 * 当前是否有任何覆盖（UI 用来显示"自定义"角标）
 *
 * @param overrides 覆盖表
 * @returns 非空返回 true
 */
export function hasOverrides(overrides: TokenOverrides): boolean {
  return Object.keys(overrides).length > 0;
}
