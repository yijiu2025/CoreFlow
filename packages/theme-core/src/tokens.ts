/**
 * token 的**数据形态**与**白名单校验** —— 主题变量能不能被写进页面的唯一判据
 *
 * 这些内容原先混在 `oauth21/src/theme/runtime.ts` 里（那份文件还兼着"往 DOM 写
 * inline style"的活），2026-09-26 抽包 Stage 1 把**纯校验**这一半移到这里。
 * 留在 `runtime.ts` 的是注入动作（`applyThemeLayers` 等），它反过来 import 本文件。
 *
 * ⚠️ 本文件**零依赖、零副作用**：不读 DOM、不 import 任何模块，是一串纯函数 + 常量。
 *    这是 `mauth-theme-core` 能被任意前端（webpack / 单测 / SSR 预备）复用的前提。
 *
 * === 为什么必须校验 ===
 * CSS 自定义属性是能直接改变渲染的输入。未校验就 `setProperty` 等于把 CSS 注入的
 * 口子交给后端或父页面：
 *   • 值里塞一个指向第三方的 url() → 触发外发请求（可用于探测/追踪）
 *   • 值里塞一段能闭合规则再起新规则的文本 → 注入任意样式
 * 所以这里 token 名与取值**都走白名单**，而不是黑名单过滤。
 *
 * 主题包自己的 theme.scss 不走这条通道 —— 那是构建期就在仓库里的受信代码，
 * 由 Vite 编译打包，不存在运行期注入问题（见 types.ts 的分界说明）。
 *
 * === tokens 是**一组扁平值**，不分明暗档（2026-09-25 改）===
 * 早先 `tokens` 是 `{ light, dark }` 两档，注入时按明暗取「light」或「light ∪ dark」。
 * 用户 2026-09-25 明确要求取消这个分档：
 *
 *   > 没有深浅两档了，深和浅就是两种颜色配置。
 *   > 蓝色没有白蓝和黑蓝之分，底色由蓝色自己选择设置。
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

/**
 * 一组扁平 token 覆写表（主题包与后端下发共用的数据形态）
 *
 * ⚠️ 不分 `light` / `dark` 两档（2026-09-25 改）—— 见文件头说明。
 *    键是 `--mauth-<角色>`，值是白名单内的取值。
 */
export type ThemeTokenOverrides = Record<string, string>;

/** 校验结果：通过白名单的项 + 被拒绝的项（后者供调用方上报，便于发现配置写错） */
export interface SanitizeResult {
  tokens: Record<string, string>;
  rejected: string[];
}

/** 参与注入的分层：主题包在前，外部覆写在后（后者同名覆盖前者） */
export interface ThemeTokenLayers {
  /** 主题包自带 token（来自 `themes/<包>/<设备>/<页面>/colors/<配色>/`） */
  theme?: ThemeTokenOverrides | null;
  /** 外部覆写 token（后端下发 / 父应用同步） */
  external?: ThemeTokenOverrides | null;
}

/**
 * 逐条校验覆写表，丢弃不安全的条目
 *
 * 不采用「有一条非法就整体拒绝」的策略：配置里混入一条写错的色值时，
 * 其余合法配色仍应生效，否则改一个字就整站退回默认配色，排查成本很高。
 * 被拒绝的条目会返回给调用方，便于上报告警。
 */
export function sanitizeOverrides(input: ThemeTokenOverrides | null | undefined): SanitizeResult {
  const result: SanitizeResult = { tokens: {}, rejected: [] };
  if (!input || typeof input !== 'object') return result;

  for (const [name, value] of Object.entries(input)) {
    if (!isSafeTokenEntry(name, value)) {
      result.rejected.push(`${name}=${String(value).slice(0, 40)}`);
      continue;
    }
    result.tokens[name] = value.trim();
  }
  return result;
}
