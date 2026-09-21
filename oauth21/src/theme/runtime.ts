/**
 * 主题运行时：把主题包 token 与外部来源（后端下发 / 父应用 postMessage）的 token
 * 校验后注入为 CSS 变量，实现「不改前端代码即可换肤」与「组件级 UI 定制」。
 *
 * === 为什么必须校验 ===
 * CSS 自定义属性是能直接改变渲染的输入。未校验就 `setProperty` 等于把 CSS 注入的
 * 口子交给后端或父页面：
 *   • 值里塞 `url(https://evil/x)` → 触发对第三方的外发请求（可用于探测/追踪）
 *   • 值里塞 `red } body { display:none` → 闭合规则，注入任意样式
 * 所以这里 token 名与取值**都走白名单**，而不是黑名单过滤。
 *
 * 主题包自己的 theme.scss 不走这条通道 —— 那是构建期就在仓库里的受信代码，
 * 由 Vite 编译打包，不存在运行期注入问题。
 *
 * === 分层与优先级（低 → 高）===
 *   1. SCSS 基线          :root / html.dark / 断点块
 *   2. 主题包 tokens      getThemeRecord(id).tokens
 *   3. 外部覆写 tokens    后端下发 / 父应用同步
 * 第 2、3 层都写在 `documentElement` 的 inline style 上（优先级高于任何选择器），
 * 层间顺序靠**写入顺序**保证：先写主题包，再写外部覆写，同名后者胜。
 *
 * === 为什么注入要跟着明暗重算 ===
 * inline style 会盖过 `html.dark` 这一整块基线深色值，所以注入表必须按当前明暗
 * 取用：浅色只注入 light 档，深色注入 light ∪ dark。否则明暗切换后颜色不会变。
 *
 * @author yijiu2025
 */

/** 只放行移动端认证页的主题变量，避免外部配置误伤全局（--background 等 shadcn 变量） */
const TOKEN_NAME_RE = /^--mauth-[a-z0-9-]+$/;

/** 单条取值长度上限：正常颜色/长度都远小于此，超长基本是要撑爆样式表 */
const MAX_VALUE_LENGTH = 120;

/** 字体族 token 单独放宽：字体栈天然含空格、逗号、引号 */
const FONT_FAMILY_TOKEN = '--mauth-font-family';

/**
 * 允许的取值形态（白名单，逐条匹配其一即可）
 *
 * ⚠️ 刻意**不支持 CSS 颜色名**（`red` / `blue` 之类）：
 *   一是颜色名上百个、维护白名单容易漏；二是若放宽成「任意字母」，
 *   会连带放行 `expression` 这类历史攻击向量。
 *   配置品牌色请用 #hex / rgb() / hsl()。
 *
 * ⚠️ 刻意**不支持 `url()`**：这是外发请求的唯一入口，也是背景图必须走
 *   theme.scss 的原因（见 types.ts 的分界说明）。
 */
const VALUE_PATTERNS: RegExp[] = [
  /^#[0-9a-fA-F]{3,8}$/, // #fff / #ffffff / #ffffffcc
  /^rgba?\(\s*[\d.,%\s/]+\)$/, // rgb(30 41 59) / rgba(30,41,59,0.12)
  /^hsla?\(\s*[\d.,%\s/]+(deg|rad|turn)?[\d.,%\s/]*\)$/, // hsl(210 40% 96%)
  /^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch)$/, // 12px / 1.5rem / 100%
  /^var\(--mauth-[a-z0-9-]+\)$/, // 引用另一个主题变量
  /^(transparent|none|auto|inherit|currentcolor|initial|0)$/i // 关键字
];

/**
 * 字体栈：字母数字、空格、逗号、连字符、下划线、单双引号。
 * 不含括号，因此写不出任何函数；配合 FORBIDDEN_RE 已足够安全。
 */
const FONT_VALUE_RE = /^[a-zA-Z0-9 ,'"_-]{1,120}$/;

/** 明确拒绝的危险片段（白名单之外的兜底，双保险） */
const FORBIDDEN_RE = /[;{}<>\\]|url\s*\(|expression\s*\(|\/\*|\*\/|@import/i;

/** 上一次注入到 inline style 的变量名，用于下次注入前清理，避免换肤后残留旧值 */
let injectedNames: string[] = [];

/** 校验 token 名：必须是 --mauth- 前缀的小写短横线命名 */
export function isSafeTokenName(name: unknown): name is string {
  return typeof name === 'string' && TOKEN_NAME_RE.test(name);
}

/** 校验 token 取值：命中白名单且不含危险片段（不含字体栈特例，见 isSafeTokenEntry） */
export function isSafeTokenValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > MAX_VALUE_LENGTH) return false;
  if (FORBIDDEN_RE.test(v)) return false;
  return VALUE_PATTERNS.some(re => re.test(v));
}

/**
 * 校验一条 token 键值对
 *
 * 单独抽出来的原因：**取值白名单要依赖 token 名**（字体族是唯一的例外），
 * 只看值无法判断 `Inter, sans-serif` 是否合法。
 */
export function isSafeTokenEntry(name: unknown, value: unknown): boolean {
  if (!isSafeTokenName(name)) return false;
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > MAX_VALUE_LENGTH) return false;
  if (FORBIDDEN_RE.test(v)) return false;
  if (name === FONT_FAMILY_TOKEN) return FONT_VALUE_RE.test(v);
  return VALUE_PATTERNS.some(re => re.test(v));
}

/** 按明暗分组的 token 覆写表（主题包与后端下发共用的数据形态） */
export interface ThemeTokenOverrides {
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

/** 校验结果：通过白名单的项 + 被拒绝的项（后者供调用方上报，便于发现配置写错） */
export interface SanitizeResult {
  light: Record<string, string>;
  dark: Record<string, string>;
  rejected: string[];
}

/** 参与注入的分层：主题包在前，外部覆写在后（后者同名覆盖前者） */
export interface ThemeTokenLayers {
  /** 主题包自带 token（来自 src/themes/<id>） */
  theme?: ThemeTokenOverrides | null;
  /** 外部覆写 token（后端下发 / 父应用同步） */
  external?: ThemeTokenOverrides | null;
}

/**
 * 逐条校验覆写表，丢弃不安全的条目
 *
 * 不采用「有一条非法就整体拒绝」的策略：配置里混入一条写错的色值时，
 * 其余合法配色仍应生效，否则改一个字就整站退回默认皮肤，排查成本很高。
 * 被拒绝的条目会返回给调用方，便于上报告警。
 */
export function sanitizeOverrides(input: ThemeTokenOverrides | null | undefined): SanitizeResult {
  const result: SanitizeResult = { light: {}, dark: {}, rejected: [] };
  if (!input || typeof input !== 'object') return result;

  for (const level of ['light', 'dark'] as const) {
    const table = input[level];
    if (!table || typeof table !== 'object') continue;
    for (const [name, value] of Object.entries(table)) {
      if (!isSafeTokenEntry(name, value)) {
        result.rejected.push(`${name}=${String(value).slice(0, 40)}`);
        continue;
      }
      result[level][name] = value.trim();
    }
  }
  return result;
}

/** 按当前明暗取出一层实际生效的 token：浅色只取 light，深色取 light ∪ dark */
function activeOf(sanitized: SanitizeResult, isDark: boolean): Record<string, string> {
  return isDark ? { ...sanitized.light, ...sanitized.dark } : sanitized.light;
}

/** 清掉上一次注入的所有主题变量 */
export function clearThemeTokens(): void {
  const root = document.documentElement;
  for (const name of injectedNames) root.style.removeProperty(name);
  injectedNames = [];
}

/**
 * 应用分层 token（主题包 + 外部覆写）
 *
 * 每次调用都是「按当前明暗把两层重算一遍，再与上一轮的变量名做差集清理」：
 *   • 换肤/切明暗时不会残留上一轮的值（差集里被移除的会被 removeProperty）
 *   • 只动自己写过的变量名，不碰别人留在 html 上的 inline style
 *
 * 层内顺序：先 theme 后 external，同名后者胜 —— 这就是「后端覆写压过主题默认」。
 *
 * @param layers  分层 token；两层都可以为 null（表示只用 SCSS 基线）
 * @param isDark  当前是否深色，决定各层取哪一档
 * @returns 被拒绝的条目（空数组表示全部合法）
 */
export function applyThemeLayers(layers: ThemeTokenLayers, isDark: boolean): string[] {
  const theme = sanitizeOverrides(layers.theme);
  const external = sanitizeOverrides(layers.external);

  const themeActive = activeOf(theme, isDark);
  const externalActive = activeOf(external, isDark);

  const root = document.documentElement;
  const nextNames = new Set([...Object.keys(themeActive), ...Object.keys(externalActive)]);
  for (const name of injectedNames) {
    if (!nextNames.has(name)) root.style.removeProperty(name);
  }

  const applied: string[] = [];
  for (const [name, value] of Object.entries(themeActive)) {
    root.style.setProperty(name, value);
    applied.push(name);
  }
  for (const [name, value] of Object.entries(externalActive)) {
    root.style.setProperty(name, value);
    applied.push(name);
  }
  injectedNames = applied;

  return [...theme.rejected, ...external.rejected];
}

/**
 * 只应用外部覆写（等价于 applyThemeLayers({ external })，保留给单层调用点）
 *
 * @param overrides 覆写表；传 null 表示撤销（回到主题包 / SCSS 基线）
 * @param isDark    当前是否深色，决定写哪一档
 * @returns 被拒绝的条目（空数组表示全部合法）
 */
export function applyThemeTokens(overrides: ThemeTokenOverrides | null, isDark: boolean): string[] {
  return applyThemeLayers({ external: overrides }, isDark);
}

/** 当前已注入的变量名（供验收脚本与单测断言注入是否真的发生） */
export function getInjectedTokenNames(): readonly string[] {
  return injectedNames;
}

/** 重置模块级状态（HMR / 单测用） */
export function resetThemeRuntime(): void {
  clearThemeTokens();
}
