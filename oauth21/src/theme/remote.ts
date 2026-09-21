/**
 * 后端下发的主题配置（换肤 + 组件级 UI 定制）
 *
 * === 解决的问题 ===
 * 换肤不该要求改前端代码重新发版。部署方在服务端按 client_id 配一套品牌配色，
 * 前端拉下来注入即可 —— 同一份构建产物可以服务多个品牌/租户。
 *
 * 来源不止后端一个：URL 参数 `?theme=` 也能指定（见 stores/theme.ts），
 * 后端配置的价值在于「同一个链接按 client_id 拿到不同品牌」，不必给每个租户单独发链接。
 *
 * === 后端接口契约 ===
 *   GET {VITE_THEME_ENDPOINT}?client_id=<clientId>
 *
 *   200 OK
 *   {
 *     "theme": "ocean",                       // 可选。src/themes/ 下已登记的主题 id
 *     "skin": "ocean",                        // 可选。theme 的旧字段名，二选一即可
 *     "mode": "dark",                         // 可选。'light' | 'dark' | 'system'
 *     "tokens": {                             // 可选。按明暗分组的 CSS 变量覆写
 *       "light": { "--mauth-primary": "#0e7490", "--mauth-radius": "16px" },
 *       "dark":  { "--mauth-primary": "#67e8f9" }
 *     }
 *   }
 *
 *   token 名必须以 `--mauth-` 开头，取值必须是颜色/长度/关键字/Var 引用之一；
 *   不合规的条目会被逐条丢弃并告警（见 src/theme/runtime.ts）。
 *   深色档未给出的变量沿用浅色档的值。
 *
 *   ⚠️ `theme` 只能指定**已登记**的主题 id，后端不能下发 CSS 正文；
 *      需要自由度更高的定制（背景图、字体文件）请走 tokens + 前端主题包。
 *
 *   ⚠️ 后端下发的 mode/theme **不写入 localStorage**：它们是「本次访问的部署方默认」，
 *      用户自己手动切过的明暗偏好优先级更高，不该被一次请求永久覆盖。
 *
 * === 为什么默认关闭 ===
 * 未配置 `VITE_THEME_ENDPOINT` 时直接返回 null、不发任何请求 —— 保证这份代码
 * 在后端还没做这个接口时完全无副作用，不会多出一个失败请求。
 *
 * === 失败策略 ===
 * 超时 / 非 200 / 结构不符 一律静默返回 null（用内置配色继续）。
 * 主题是"锦上添花"，绝不能因为拉不到配色而挡住登录 —— 所以这里不抛错、不重试。
 *
 * @author yijiu2025
 */
import { normalizeMode, type ThemeMode } from './mode';

/** 配置在 .env 里；未配置则整个机制不生效 */
const ENDPOINT = (import.meta as any).env?.VITE_THEME_ENDPOINT as string | undefined;

/** 超时上限：超过就放弃，不能让主题请求拖慢登录首屏 */
const TIMEOUT_MS = 3000;

export interface RemoteThemeConfig {
  /** 主题 id（src/themes/ 下已登记）；旧字段名 skin 也接受 */
  theme?: string;
  /** 明暗三态 */
  mode?: ThemeMode;
  /** @deprecated 旧字段名，等价于 theme。保留以兼容已上线的后端实现 */
  skin?: string;
  tokens?: { light?: Record<string, string>; dark?: Record<string, string> };
}

/** 后端换肤是否启用（env 配了端点） */
export function isRemoteThemeEnabled(): boolean {
  return typeof ENDPOINT === 'string' && ENDPOINT.trim().length > 0;
}

/**
 * 只保留认识的字段，丢弃其余
 *
 * 不直接把响应体透传给 store：响应结构由后端决定，多一个字段、少一个类型都可能
 * 让后续代码出错。这里显式挑选，顺带挡住数组/字符串之类的意外结构。
 * 注意这里**不做 id 合法性校验**（是否登记过由 store 用 resolveThemeId 判断），
 * 因为校验要读主题注册表，放在一处才不会两套标准。
 */
function normalize(data: unknown): RemoteThemeConfig | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  const out: RemoteThemeConfig = {};

  if (typeof raw.theme === 'string') out.theme = raw.theme;
  else if (typeof raw.skin === 'string') out.skin = raw.skin;

  const mode = normalizeMode(raw.mode);
  if (mode) out.mode = mode;

  if (raw.tokens && typeof raw.tokens === 'object' && !Array.isArray(raw.tokens)) {
    const tokens: RemoteThemeConfig['tokens'] = {};
    for (const level of ['light', 'dark'] as const) {
      const table = (raw.tokens as Record<string, unknown>)[level];
      if (table && typeof table === 'object' && !Array.isArray(table)) {
        tokens[level] = table as Record<string, string>;
      }
    }
    if (tokens.light || tokens.dark) out.tokens = tokens;
  }

  return out.theme || out.skin || out.mode || out.tokens ? out : null;
}

/**
 * 拉取后端主题配置
 *
 * @param clientId 接入应用的 client_id（决定用哪套品牌配色），可为空
 * @returns 配置对象；未启用 / 失败 / 无有效内容时返回 null
 */
export async function fetchRemoteThemeConfig(clientId?: string): Promise<RemoteThemeConfig | null> {
  if (!isRemoteThemeEnabled()) return null;

  let url: URL;
  try {
    url = new URL(ENDPOINT as string, window.location.origin);
  } catch {
    return null; // env 里写了个非法 URL
  }
  if (clientId) url.searchParams.set('client_id', clientId);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      // 免鉴权公开端点；不带 cookie，避免把登录态发到第三方域名
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return null;
    return normalize(await res.json());
  } catch {
    // 网络错误 / 超时 / JSON 解析失败：一律静默，主题缺失不影响登录
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
