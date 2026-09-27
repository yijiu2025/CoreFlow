/**
 * 主题（配色）注册表的**构建层** —— 只负责「把目录扫成注册表」，不含查询逻辑。
 *
 * 查询函数留在 `index.ts`（导出面不变），本文件只暴露构建产物 `registry` 单例。
 * 拆出来是为了让 `index.ts` 从「645 行单文件」降到可维护粒度：
 *   • 本文件 = glob 加载 + 键解析 + `buildRegistry`（约 180 行）
 *   • index.ts = re-export 壳 + 全部查询函数
 *
 * ⚠️ 本文件里的 `import.meta.glob` 路径是**相对本文件**的（`./themes/...`），
 *    与 index.ts 同目录，所以搬过来路径不变、无需改动。
 *
 * 目录骨架、键的唯一性作用域、加载策略等完整说明见 `index.ts` 文件头 ——
 * 那份注释是这套机制的「为什么」，别在这里重复。
 *
 * @author yijiu2025
 * @since 2026-09-27（从 index.ts 拆出构建层）
 */
import { THEME_ID_RE } from 'skinsuite';
import type { MauthThemeColor, MauthThemePackage, MauthThemeRecord } from './types';
import { normalizeTone } from './tone';
import { THEME_DEVICES, type ThemeDevice } from './devices';

/** 各主题包的包定义（只有 meta / views，不再充当默认配色） */
const packageModules = import.meta.glob<{ default: MauthThemePackage }>('./themes/*/index.ts', {
  eager: true
});

/**
 * 配色的元信息 + tokens（同步预载，理由见 index.ts 文件头「加载策略」）
 *
 * 🔴 **只有一种目录形态**（2026-09-26 收窄）：
 *    `themes/<包>/<设备>/<页面>/colors/<颜色>/index.ts`
 *    配色与版式**同级** ——「版式」不再是一层目录。变体版式请**新建主题包**
 *    （`themes/compact/<设备>/<页面>/`），不要建 `<页面>/<版式>/`。
 *
 * 曾支持过 6 段的变体形态（`<页面>/<版式>/colors/`），本次已删除：它要求换版式时
 * 复制整套配色，两套必然漂移；而「一个主题包 = 一种版式」让换版式 = 换包，
 * 配色跟着包走，天然只有一份。守卫断言见 `.tmp-probe/verify-theme-dirs.mjs`。
 */
const colorModules = import.meta.glob<{ default: MauthThemeColor }>(
  './themes/*/*/*/colors/*/index.ts',
  { eager: true }
);

/** 配色的附加样式（惰性，`?inline` 取编译后 CSS 字符串） */
const colorStyles = import.meta.glob<string>('./themes/*/*/*/colors/*/theme.scss', {
  query: '?inline',
  import: 'default'
});

/** 设备名必须命中 `THEME_DEVICES`（mobile / standard / mini / tablet），否则整个目录按"不认识"跳过 */
function asDevice(raw: string | undefined): ThemeDevice | null {
  return raw && (THEME_DEVICES as readonly string[]).includes(raw) ? (raw as ThemeDevice) : null;
}

/**
 * 按路径排序后再遍历
 *
 * `import.meta.glob` 的键顺序当前是稳定的，但"重名先到先得"这类规则若依赖它，
 * 就成了隐式条件。这里显式排序，让判定结果与文件系统顺序无关。
 */
function sortedEntries<T>(mods: Record<string, T>): [string, T][] {
  return Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** 从包定义入口的键里取出包名；不合法返回 null */
function packageFromKey(key: string): string | null {
  const id = /^\.\/themes\/([^/]+)\/index\.ts$/.exec(key)?.[1];
  return id && THEME_ID_RE.test(id) ? id : null;
}

/** 从配色键里取出的归属四段（包 / 设备 / 页面 / 配色） */
interface ColorKeyInfo {
  pkg: string;
  device: ThemeDevice;
  page: string;
  colorId: string;
}

/**
 * 从配色键里取出归属；不合法返回 null
 *
 * 目录只有**一种**形态（见 `colorModules` 的说明）：
 *   `./themes/<包>/<设备>/<页面>/colors/<颜色>/index.ts`
 * 设备段必须命中白名单，否则整个目录跳过。
 *
 * 🔴 **配色归属只到包段**（一个主题包 = 一种版式，view ≡ pkg）：
 *    例：`themes/compact/mobile/register/colors/blue/` → `pkg='compact'`。
 *    这样 `findRecord(id, 'compact', …)` 就能精确命中，
 *    切到 compact 包点 blue 不再被 default 包的配色抢走（issue：用户反馈
 *    "切换版式后蓝青颜色切换无效"，根因就是旧 view 段错把基础版式都打成 `'base'`）。
 *
 * 🔴 **6 段的变体形态已删除**（2026-09-26）：曾支持
 *    `themes/<包>/<设备>/<页面>/<版式>/colors/<色>/`。它要求换版式时复制整套配色，
 *    两套必然漂移 —— 现在换版式 = **新建主题包**。守卫断言见
 *    `.tmp-probe/verify-theme-dirs.mjs`（断言「不存在变体目录」与「glob 只有一套」）。
 *    `BASE_VIEW_ID='base'` 仍作为**版式注册表**（`createViewRegistry`）的逻辑值保留，
 *    但**不出现在配色注册表的键里**（配色键是「包/设备/页面/配色」四段）。
 */
function colorFromKey(key: string, suffix: string): ColorKeyInfo | null {
  const file = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\./themes/([^/]+)/([^/]+)/([^/]+)/colors/([^/]+)/${file}$`);
  const m = re.exec(key);
  if (!m) return null;
  const pkg = m[1];
  const device = asDevice(m[2]);
  const page = m[3];
  const colorId = m[4];
  if (!pkg || !device || !page || !colorId) return null;
  if (!THEME_ID_RE.test(pkg) || !THEME_ID_RE.test(page) || !THEME_ID_RE.test(colorId)) return null;
  // 一个主题包 = 一种版式 ⇒ 配色归属只到包段（view ≡ pkg，不再单列一段）
  return { pkg, device, page, colorId };
}

function buildRegistry(): Map<string, MauthThemeRecord> {
  /*
   * 键是「包 / 设备 / 页面 / 配色」四段复合键。
   *
   * 🔴 **没有「版式」段**（2026-09-27 B5）：一个主题包 = 一种版式，`view ≡ pkg`，
   *    五段里「版式」段恒等于「包」段，是纯冗余。删掉后键只剩四段。
   *
   * === 为什么不是单纯用配色 id 作键（早期实现）===
   * 同一个 `black` 在**每个包、每个设备、每个页面**下各有一份是**正常且必要**的
   * （各端各配各的尺寸/圆角）。把它判成"重名冲突"会让其余范围静默失去配色。
   *
   * 那"配色 id 唯一"这条规则还成立吗？成立，作用域收窄到「同包同设备同页」：
   *   • 同一范围内两个同名配色才是真冲突（取值时只给一个 id，必须有唯一答案）
   *   • 跨设备、跨页面、跨包都可以同名，因为取值时必然同时给出这几段
   *     （铁证：`default/{mobile,standard,mini}/login/colors/{black,white}` 三份并存）
   */
  const registry = new Map<string, MauthThemeRecord>();
  /** 包名 → 包定义的版式声明（配色未自带声明时继承它；跨设备共用一份） */
  const packageViews = new Map<string, Record<string, string> | undefined>();

  /**
   * 复合键：`包/设备/页面/配色`（四段，避免嵌套 Map 样板）
   *
   * 🔴 **没有「版式」段**（2026-09-27 B5）：一个主题包 = 一种版式，`view ≡ pkg`，
   *    所以「版式」段恒等于「包」段 —— 五段里有两段永远相同，是纯冗余。
   *    删掉它后，唯一性作用域仍是「同包同设备同页」（与文档承诺一致，见 index.ts 文件头），
   *    查询时给 pkg 就等于同时给了 view。
   */
  const keyOf = (info: ColorKeyInfo): string =>
    `${info.pkg}/${info.device}/${info.page}/${info.colorId}`;

  // ① 包定义：只提供 meta 与可选的 views 声明（**不再充当默认配色**）
  for (const [key, mod] of sortedEntries(packageModules)) {
    const pkg = packageFromKey(key);
    const def = mod?.default;
    // 目录名不合规、或忘了 `export default`，都跳过而不是抛错：
    // 一个写坏的包不该让整个认证页起不来。
    if (!pkg || !def || typeof def !== 'object' || !def.meta) continue;
    packageViews.set(pkg, def.views);
  }

  // ② 各包下的配色 —— 每条记录都带 pkg + device + page 三段归属
  for (const [key, mod] of sortedEntries(colorModules)) {
    const parsed = colorFromKey(key, 'index.ts');
    const def = mod?.default;
    if (!parsed || !def || typeof def !== 'object' || !def.meta) continue;
    // 包定义缺失（包本身写坏）：该配色无处可依，跳过
    if (!packageViews.has(parsed.pkg)) continue;
    if (registry.has(keyOf(parsed))) {
      console.warn(
        `[theme] 配色 id「${parsed.colorId}」在「${parsed.pkg}/${parsed.device}/${parsed.page}」内重复` +
          `（${key} 已忽略）：同一个包内的配色 id 必须唯一。`
      );
      continue;
    }
    // 系别：类型上必填（漏写会编译报错），但 dev server 不做类型检查，
    // 所以运行时再兜一次 —— 漏写不该让页面崩，但也不该静默：
    // 系别判错的后果是"开夜间不联动"，没有任何报错，极难归因。
    const tone = normalizeTone(def.tone);
    if (!tone) {
      console.warn(
        `[theme] 配色「${parsed.colorId}」未声明合法的 tone（light/dark），` +
          `已按 'light' 兜底：${key}`
      );
    }
    registry.set(keyOf(parsed), {
      pkg: parsed.pkg,
      device: parsed.device,
      page: parsed.page,
      meta: { ...def.meta, id: parsed.colorId },
      tone: tone ?? 'light',
      tokens: def.tokens,
      // 配色自己声明了就用自己的，否则继承包定义 —— 包根写一次，全包配色共用
      views: def.views ?? packageViews.get(parsed.pkg),
      loadStyle: undefined
    });
  }

  // ③ 附加样式：按与 ② 相同的键挂上去，避免歧义
  for (const [key, loader] of sortedEntries(colorStyles)) {
    const parsed = colorFromKey(key, 'theme.scss');
    if (!parsed) continue;
    const record = registry.get(keyOf(parsed));
    // 有 theme.scss 但没 index.ts 的目录视为残缺，忽略其样式
    if (record) record.loadStyle = loader;
  }

  return registry;
}

/** 配色注册表单例（构建层产物，查询层 `index.ts` 从这里 import） */
export const registry = buildRegistry();
