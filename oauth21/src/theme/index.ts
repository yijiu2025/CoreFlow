/**
 * 主题（配色）注册表 —— 三级结构：**主题包 → 设备 → 配色**
 *
 * === 目录骨架 ===
 * ```
 * theme/themes/<包>/                    主题包：一套完整设计，手机端与电脑端都住这里
 * ├── index.ts                          包定义（只有 meta / views，不再是"默认配色"）
 * ├── mobile/                           该设计的**手机端**呈现
 * │   ├── <page>/index.vue              版式实现（基础版式；变体为 <page>/<变体>/index.vue）
 * │   └── colors/<配色>/                手机端可用的配色（互不共享，两端各配各的）
 * └── web/                              该设计的**电脑端**呈现（结构同上）
 *     ├── <page>/index.vue
 *     └── colors/<配色>/
 * ```
 *
 * === 为什么设备是主题包内的一层，而不是另一个顶层目录 ===
 * 一个主题包 = 一套**设计语言**。手机端与电脑端是这套语言在两种设备上的呈现，
 * 因此住在同一个包里：「换一套设计」只需换一个包目录，不会出现版式换了、配色没换
 * 或者两端各换一半的情况。若把设备提到顶层（`theme/mobile/`、`theme/web/`），
 * 换一套设计就要改两处，两者迟早漂移。
 *
 * === 为什么配色在设备内独立配置 ===
 * 同一套设计，手机端用黑白、电脑端用海蓝是完全合理的诉求（场景不同、品牌侧重不同）。
 * 所以 `mobile/colors/` 与 `web/colors/` 是**两个互不影响的配色集合**，
 * 虽然目录名可以相同 —— 这正是「手机端、电脑端分别配置主题」的落点。
 *
 * === 为什么配色 id 的唯一性作用域是「设备内」 ===
 *   URL `?theme=ocean` 只给一个 id —— 但**取值时必须同时给出设备**
 *   （`getThemeRecord(id, device)`），歧义在入口就被设备消解掉了。
 *   于是：
 *     • 同一个包、同一个设备下，配色 id 必须唯一（该端只有一个答案）
 *     • **跨设备可以同名**：`mobile/colors/mono/` 与 `web/colors/mono/` 是**正常且必要**的
 *       —— 黑白这套设计在两端本来就该各配各的尺寸/圆角。
 *   ⚠️ 若"同一套设计想要两端各一套**不同**的品牌色"，仍需给它们不同名
 *     （如 `ocean` 与 `web-ocean`）—— 不是被唯一性逼的，而是因为它们是两套配色：
 *     同名会让"两端都要海蓝"与"两端各要一套色"在配置上无法区分。
 *   同包同设备内重名按路径排序**先到先得**并告警，不静默覆盖
 *   （否则哪套生效取决于文件系统顺序）。
 *
 * === 黑白（mono）不是"没有配色" ===
 *   它是各设备下的一套**具名配色**（`<设备>/colors/mono/`），与其它配色平级，
 *   可以显式选中、出现在列表里。它刻意不带 token —— 黑白档的色值就是
 *   `mobile-auth.scss` / 电脑端样式表的基线本身，保住"零配色时零回归"这条不变量。
 *
 * === 加载策略（为什么分两档）===
 *   • `index.ts`（元信息 + tokens）**同步预载**：体积只有几百字节，且 URL 参数
 *     `?theme=xxx` 的合法性校验、`data-mauth-theme` 属性写入都发生在首帧前，
 *     必须能同步拿到 id → tokens 的映射，否则会先渲染默认色再跳变。
 *   • `theme.scss`（可能内含背景图 / webfont 引用）**惰性动态加载**：这是真正
 *     有体积的部分，用 `?inline` 拿到编译后的 CSS 字符串，由运行时按需插进
 *     `<style>`，切换主题时替换。避免把 N 套配色的图片与字体全塞进首屏包。
 *   Vite 会把每套配色的 theme.scss 单独切 chunk，切到才请求。
 *
 * @author yijiu2025
 */
import type { MauthThemeColor, MauthThemePackage, MauthThemeMeta, MauthThemeRecord } from './types';

/**
 * 空记录（registered 目录尚未产出任何记录）的占位配色 id
 *
 * ⚠️ 它**不再**表示"默认配色"：自 2026-09-24 起，黑白基线是各设备下**具名的正式配色**
 * （`<设备>/colors/mono/`），由 `defaultColorIdOf(device)` 按设备取。这里只用于空记录占位。
 */
export const DEFAULT_THEME_ID = 'default';

/**
 * 内置默认**主题包** id
 *
 * 与 `DEFAULT_THEME_ID` 含义不同，它用在版式侧：该包的基础版式由容器**静态引入**
 * （首屏零请求），其它包的基础版式才需要惰性加载。见 `theme/views/registry.ts`。
 */
export const DEFAULT_THEME_PACKAGE = 'default';

/** 设备维度：主题包内的一级目录，决定"这套配色/版式给哪种设备用" */
export const THEME_DEVICES = ['mobile', 'web'] as const;
export type ThemeDevice = (typeof THEME_DEVICES)[number];

/** 兜底设备：设备无法判定时按手机端处理（与 `utils/device.ts` 的口径一致） */
export const DEFAULT_THEME_DEVICE: ThemeDevice = 'mobile';

/**
 * 兜底页面：`getThemeRecord` 这类函数在调用点没给页面时的默认值
 *
 * 取 `login` 是因为它是认证流程的默认入口（未指定页面时最可能问的就是它）。
 * 有明确页面的调用点（容器、面板）都应显式传 `page`，不要依赖这个兜底。
 */
export const DEFAULT_THEME_PAGE = 'login';

/**
 * 基础版式的逻辑 id（与 `theme/views/registry.ts` 的 `BASE_VIEW_ID` 同一约定值）
 *
 * 配色的目录在基础版式下少一层（`<页面>/colors/<颜色>/`），本常量是那条捷径的
 * 逻辑名字 —— 注册表里基础版式的配色统一登记在这个 view 名下。
 */
export const BASE_VIEW_ID = 'base';

/** 各主题包的包定义（只有 meta / views，不再充当默认配色） */
const packageModules = import.meta.glob<{ default: MauthThemePackage }>('./themes/*/index.ts', {
  eager: true
});

/**
 * 各**版式**下的配色（同步预载，理由见文件头「加载策略」）
 *
 * 两个 glob 合并，因为基础版式的配色少一层目录：
 *   • 基础版式：`themes/<包>/<设备>/<页面>/colors/<颜色>/index.ts`
 *   • 变体版式：`themes/<包>/<设备>/<页面>/<版式>/colors/<颜色>/index.ts`
 * 前者命中的键里「配色」段的位置与后者不同，所以解析函数分两个正则。
 */
const colorModules = {
  ...import.meta.glob<{ default: MauthThemeColor }>(
    './themes/*/*/*/colors/*/index.ts',
    { eager: true }
  ),
  ...import.meta.glob<{ default: MauthThemeColor }>(
    './themes/*/*/*/*/colors/*/index.ts',
    { eager: true }
  )
};

/** 版式内配色各自的附加样式（惰性，`?inline` 取编译后 CSS 字符串） */
const colorStyles = {
  ...import.meta.glob<string>('./themes/*/*/*/colors/*/theme.scss', {
    query: '?inline',
    import: 'default'
  }),
  ...import.meta.glob<string>('./themes/*/*/*/*/colors/*/theme.scss', {
    query: '?inline',
    import: 'default'
  })
};

/** 目录名只允许小写字母/数字/短横线：既约束了主题作者，也避免奇怪目录名进入属性选择器 */
const THEME_ID_RE = /^[a-z0-9-]+$/;

/** 设备名必须是登记过的两个值之一，否则整个目录按"不认识"跳过 */
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

/** 从配色键里取出的归属四段（基础版式时 view 为 `base`） */
interface ColorKeyInfo {
  pkg: string;
  device: ThemeDevice;
  page: string;
  /** 版式 id；基础版式（配色的前三层直接落在 `<页面>/colors/` 下）时为 `base` */
  view: string;
  colorId: string;
}

/**
 * 从配色键里取出归属；不合法返回 null
 *
 * 两种形态（见 `colorModules` 的说明）：
 *   • 基础版式：`./themes/<包>/<设备>/<页面>/colors/<颜色>/index.ts`（5 段目录 + 文件名）
 *   • 变体版式：`./themes/<包>/<设备>/<页面>/<版式>/colors/<颜色>/index.ts`（6 段）
 * 设备段与版式段都必须命中白名单，否则整个目录跳过。
 */
function colorFromKey(key: string, suffix: string): ColorKeyInfo | null {
  const file = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const baseRe = new RegExp(
    `^\\./themes/([^/]+)/([^/]+)/([^/]+)/colors/([^/]+)/${file}$`
  );
  const variantRe = new RegExp(
    `^\\./themes/([^/]+)/([^/]+)/([^/]+)/([^/]+)/colors/([^/]+)/${file}$`
  );

  const variant = variantRe.exec(key);
  const m = variant ?? baseRe.exec(key);
  if (!m) return null;
  const view = variant ? m[4] : BASE_VIEW_ID;
  const colorId = variant ? m[5] : m[4];
  const pkg = m[1];
  const device = asDevice(m[2]);
  const page = m[3];
  if (!pkg || !device || !page || !colorId) return null;
  if (!THEME_ID_RE.test(pkg) || !THEME_ID_RE.test(page) || !THEME_ID_RE.test(colorId)) return null;
  if (view !== BASE_VIEW_ID && !THEME_ID_RE.test(view)) return null;
  return { pkg, device, page, view, colorId };
}

function buildRegistry(): Map<string, MauthThemeRecord> {
  /*
   * 键是「包 / 设备 / 页面 / 版式 / 配色」五段复合键。
   *
   * === 为什么配色挂在**版式**下 ===
   * "一个版式有几种颜色" —— 颜色清单跟着版式走：同一页的 `base` 与 `compact`
   * 各自可以有不同的可选颜色。所以配色的目录位置在 `<页面>/[<版式>/]colors/<颜色>/`，
   * 键里必须把「页面」与「版式」两段都带上，否则同名颜色（如 `black`）在
   * 同一设备的不同版式间会互相覆盖。
   *
   * === 为什么不是单纯用配色 id 作键（早期实现）===
   * `black` 这样的配色在**每个版式下**各有一份是**正常且必要**的 —— 同一个版本
   * 在基础版式与紧凑版式下本来就该各自可配（基线的尺寸/圆角不同）。
   * 把它判成"重名冲突"会让其余版式静默失去配色。
   *
   * 那"配色 id 在同一版式内唯一"这条规则还成立吗？成立，作用域是「同包同设备同页同版式」：
   *   • 同一个版式下两个同名配色才是真冲突（取值时只给一个 id，必须有唯一答案）
   *   • 跨版式、跨设备、跨包都可以同名，因为取值时必然同时给出这几段
   */
  const registry = new Map<string, MauthThemeRecord>();
  /** 包名 → 包定义的版式声明（配色未自带声明时继承它；跨设备共用一份） */
  const packageViews = new Map<string, Record<string, string> | undefined>();

  /** 复合键：`包/设备/页面/版式/配色`（五段，避免嵌套 Map 样板） */
  const keyOf = (info: ColorKeyInfo): string =>
    `${info.pkg}/${info.device}/${info.page}/${info.view}/${info.colorId}`;

  // ① 包定义：只提供 meta 与可选的 views 声明（**不再充当默认配色**）
  for (const [key, mod] of sortedEntries(packageModules)) {
    const pkg = packageFromKey(key);
    const def = mod?.default;
    // 目录名不合规、或忘了 `export default`，都跳过而不是抛错：
    // 一个写坏的包不该让整个认证页起不来。
    if (!pkg || !def || typeof def !== 'object' || !def.meta) continue;
    packageViews.set(pkg, def.views);
  }

  // ② 各版式下的配色 —— 每条记录都带 pkg + device + page + view 四段归属
  for (const [key, mod] of sortedEntries(colorModules)) {
    const parsed = colorFromKey(key, 'index.ts');
    const def = mod?.default;
    if (!parsed || !def || typeof def !== 'object' || !def.meta) continue;
    // 包定义缺失（包本身写坏）：该配色无处可依，跳过
    if (!packageViews.has(parsed.pkg)) continue;
    if (registry.has(keyOf(parsed))) {
      console.warn(
        `[theme] 配色 id「${parsed.colorId}」在「${parsed.pkg}/${parsed.device}/${parsed.page}/` +
          `${parsed.view}」内重复（${key} 已忽略）：同一个版式下的配色 id 必须唯一。`
      );
      continue;
    }
    registry.set(keyOf(parsed), {
      pkg: parsed.pkg,
      device: parsed.device,
      page: parsed.page,
      view: parsed.view,
      meta: { ...def.meta, id: parsed.colorId },
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

const registry = buildRegistry();

/**
 * 查找一条配色记录
 *
 * **四段都必须给**（包 / 设备 / 页面 / 版式）：配色的归属就是这四段，
 * 少给任何一段都可能命中同一 id 的另一份（`black` 在每个版式下各有一份）。
 *
 * @param view 版式 id；`base` 表示基础版式（配色的目录少一层）
 */
function findRecord(
  id: string,
  device: ThemeDevice,
  page: string,
  view: string
): MauthThemeRecord | undefined {
  return registry.get(`${DEFAULT_THEME_PACKAGE}/${device}/${page}/${view}/${id}`) ??
    [...registry.values()].find(
      r => r.meta.id === id && r.device === device && r.page === page && r.view === view
    );
}

/**
 * 某版式下的兜底配色 id
 *
 * 取该版式下**排在最前**的配色（按 id 排序 → `black` 这类基础档通常在前）。
 * 之所以不写死 `black`：允许某个版式只提供一套配色而不必强行命名。
 * 该版式下一套配色都没有时返回 null，由调用方退回"什么都不注入"的基线路径。
 */
function defaultColorIdOf(device: ThemeDevice, page: string, view: string): string | null {
  const ids = [...registry.values()]
    .filter(r => r.device === device && r.page === page && r.view === view)
    .map(r => r.meta.id)
    .sort();
  return ids[0] ?? null;
}

/** 注册表为空 / 该版式无配色时给一个空记录兜底，保证 store 侧不必到处判空 */
function emptyRecord(device: ThemeDevice, page: string, view: string): MauthThemeRecord {
  return {
    pkg: DEFAULT_THEME_PACKAGE,
    device,
    page,
    view,
    meta: { id: DEFAULT_THEME_ID, name: '默认' },
    tokens: undefined,
    views: undefined,
    loadStyle: undefined
  };
}

/**
 * 当前有哪些配色（可选按设备过滤；不传则返回全部）
 *
 * 传了 device 就只返回该设备下的配色 —— 调试面板按设备分区展示用的就是这个口径。
 */
export function listThemes(device?: ThemeDevice): MauthThemeMeta[] {
  const records = [...registry.values()];
  return (device ? records.filter(r => r.device === device) : records).map(r => r.meta);
}

/** 当前有哪些主题包（去重，已排序）；包内含哪几套配色由调试面板自行归类 */
export function listThemePackages(): string[] {
  return [...new Set([...registry.values()].map(r => r.pkg))].sort();
}

/**
 * 调试面板用的一组：一个主题包 + 它名下**该版式**的配色（按包名、再按 id 排序）
 *
 * 传 device 只列出该设备下的配色；传 page + view 只列出该版式下的配色
 * —— 面板上「一个版式 → 它支持哪几种颜色」就是这样来的。
 *
 * 不传 page / view 时不做那两段过滤（返回全量），保留给"只想要一份配色总览"的调用点。
 */
export function listThemeGroups(
  device?: ThemeDevice,
  page?: string,
  view?: string
): { pkg: string; themes: MauthThemeMeta[] }[] {
  const groups = new Map<string, MauthThemeMeta[]>();
  for (const record of registry.values()) {
    if (device && record.device !== device) continue;
    if (page && record.page !== page) continue;
    if (view && record.view !== view) continue;
    const bucket = groups.get(record.pkg);
    if (bucket) bucket.push(record.meta);
    else groups.set(record.pkg, [record.meta]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pkg, themes]) => ({
      pkg,
      // 稳定排序：先按 id，同名时不会因为遍历顺序而不稳定
      themes: [...themes].sort((a, b) => a.id.localeCompare(b.id))
    }));
}

/**
 * 某个版式下可用的全部配色（去重、已排序）—— 面板「一版式 → 几种颜色」的直接答案
 *
 * 同一 id 可能在多个包下登记（跨包同名），这里按 id 去重后返回，只关心"有哪些颜色"。
 */
/**
 * 列出某个版式下的全部配色（按 id 去重、按目录名排序）
 *
 * ⚠️ 排序**只按 id 字母序**（`black < blue < cyan < rainbow < white`）。
 *    曾经想过给黑白加"基线优先"的特权排序，但那与「五色完全并列」的语义相悖
 *    （用户 2026-09-25 明确："黑白色和蓝青色应当同等，他们只是一个选项而已"）——
 *    排序上的任何特权都是"黑白更特殊"的暗示。面板的换行位置不值得为它破例。
 */
export function listColorsOf(device: ThemeDevice, page: string, view: string): MauthThemeMeta[] {
  const seen = new Map<string, MauthThemeMeta>();
  for (const record of registry.values()) {
    if (record.device !== device || record.page !== page || record.view !== view) continue;
    if (!seen.has(record.meta.id)) seen.set(record.meta.id, record.meta);
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 归一化并校验外部传入的配色 id
 *
 * 用于 URL 参数 / 后端下发这类不可信输入：非法字符、未登记 id 一律返回 null，
 * 由调用方决定回退（通常回默认配色）。不做「模糊匹配」，避免 `../` 一类路径
 * 拼装值绕过校验。
 *
 * @param raw    原始输入
 * @param device 限定设备（可选）：传了就只接受该设备下的配色
 * @param page   限定页面（可选）：传了就只接受该页面的配色
 * @param view   限定版式（可选）：传了就只接受该版式的配色
 */
export function resolveThemeId(
  raw: unknown,
  device?: ThemeDevice,
  page?: string,
  view?: string
): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  if (!id || !THEME_ID_RE.test(id)) return null;
  const match = (record: MauthThemeRecord): boolean =>
    record.meta.id === id &&
    (!device || record.device === device) &&
    (!page || record.page === page) &&
    (!view || record.view === view);
  // 各段都不传时：只要**任意**一处登记过就认（URL/后端下发未必知道是哪端哪版式，
  // 匹配留给调用点按自己的上下文判 —— 见 store 的 themeRecordFor）。
  return [...registry.values()].some(match) ? id : null;
}

/**
 * 取配色记录
 *
 * 回退链：指定 id（且四段都匹配）→ 该版式的兜底配色 → 空记录（吃 SCSS 基线）。
 * 版式 / 设备不匹配时**不跨版式借用**：拿紧凑版式的配色去渲染基础版式会得到一套
 * 尺寸/圆角都对不上的东西，不如老实用基线。
 *
 * @param page 页面名（`theme/views/<page>.ts` 的文件名，如 `register`）
 * @param view 版式 id（`base` 表示基础版式）
 */
export function getThemeRecord(
  id: string,
  device: ThemeDevice = DEFAULT_THEME_DEVICE,
  page: string = DEFAULT_THEME_PAGE,
  view: string = BASE_VIEW_ID
): MauthThemeRecord {
  const record = findRecord(id, device, page, view);
  if (record) return record;
  const fallback = defaultColorIdOf(device, page, view);
  return (fallback && findRecord(fallback, device, page, view)) || emptyRecord(device, page, view);
}

/**
 * 这套配色属于哪个主题包 —— **版式的查找范围由它决定**（版式跟随主题包）
 *
 * 未知 / 非法配色返回 `DEFAULT_THEME_PACKAGE`：与 `getThemeRecord` 的回退口径一致，
 * 调用方不必先判空再取。
 */
export function getThemePackage(
  id: string,
  device: ThemeDevice = DEFAULT_THEME_DEVICE,
  page: string = DEFAULT_THEME_PAGE,
  view: string = BASE_VIEW_ID
): string {
  return getThemeRecord(id, device, page, view).pkg;
}

/**
 * 该版式下默认用哪套配色（供 store 在"没选过"时取值）；无配色时返回 null
 */
export function getDefaultThemeId(
  device: ThemeDevice = DEFAULT_THEME_DEVICE,
  page: string = DEFAULT_THEME_PAGE,
  view: string = BASE_VIEW_ID
): string | null {
  return defaultColorIdOf(device, page, view);
}

/** 该配色是否登记过（限定哪几段就要求哪几段匹配） */
export function isKnownTheme(
  id: unknown,
  device?: ThemeDevice,
  page?: string,
  view?: string
): boolean {
  return resolveThemeId(id, device, page, view) !== null;
}

/**
 * 该设备下有哪些**页面**登记了配色（面板要按页面列出）
 *
 * 只返回真的挂了配色的页面名（如 `login` / `register`），按名称排序。
 */
export function listColorPages(device: ThemeDevice): string[] {
  return [...new Set([...registry.values()].filter(r => r.device === device).map(r => r.page))].sort();
}

/**
 * 某设备某页面下有哪些**版式**登记了配色（面板要按版式分组）
 *
 * 基础版式的 view 为 `base`，会出现在结果里（面板上它就是"基础版式"那一组）。
 */
export function listColorViews(device: ThemeDevice, page: string): string[] {
  return [
    ...new Set(
      [...registry.values()]
        .filter(r => r.device === device && r.page === page)
        .map(r => r.view)
    )
  ].sort();
}
