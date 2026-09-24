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

/** 各主题包的包定义（只有 meta / views，不再充当默认配色） */
const packageModules = import.meta.glob<{ default: MauthThemePackage }>('./themes/*/index.ts', {
  eager: true
});

/** 各设备下的配色（同步预载，理由见文件头「加载策略」） */
const colorModules = import.meta.glob<{ default: MauthThemeColor }>(
  './themes/*/*/colors/*/index.ts',
  { eager: true }
);

/** 包内配色各自的附加样式（惰性，`?inline` 取编译后 CSS 字符串） */
const colorStyles = import.meta.glob<string>('./themes/*/*/colors/*/theme.scss', {
  query: '?inline',
  import: 'default'
});

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

/**
 * 从配色键里取出 `{ 包名, 设备, 配色 id }`；不合法返回 null
 *
 * 形态：`./themes/<包>/<设备>/colors/<配色>/index.ts`
 * 设备段必须命中白名单，否则该目录整个跳过（写错设备名不会被当成某个配色）。
 */
function colorFromKey(key: string): { pkg: string; device: ThemeDevice; colorId: string } | null {
  const m = /^\.\/themes\/([^/]+)\/([^/]+)\/colors\/([^/]+)\/index\.ts$/.exec(key);
  const pkg = m?.[1];
  const device = asDevice(m?.[2]);
  const colorId = m?.[3];
  if (!pkg || !device || !colorId) return null;
  if (!THEME_ID_RE.test(pkg) || !THEME_ID_RE.test(colorId)) return null;
  return { pkg, device, colorId };
}

/**
 * 样式键 → `{ 包名, 设备, 配色 id }`（形态与 `colorFromKey` 一致，只是文件名换成 theme.scss）
 *
 * 必须把三段都解析出来：注册表的键含设备段，只拿 id 在原子里找不回属于哪端
 * （`mono` 两端各一份）。
 */
function colorFromStyleKey(key: string): { pkg: string; device: ThemeDevice; colorId: string } | null {
  const m = /^\.\/themes\/([^/]+)\/([^/]+)\/colors\/([^/]+)\/theme\.scss$/.exec(key);
  const pkg = m?.[1];
  const device = asDevice(m?.[2]);
  const colorId = m?.[3];
  if (!pkg || !device || !colorId) return null;
  if (!THEME_ID_RE.test(pkg) || !THEME_ID_RE.test(colorId)) return null;
  return { pkg, device, colorId };
}

function buildRegistry(): Map<string, MauthThemeRecord> {
  /*
   * 键是「包 / 设备 / 配色」三段复合键。
   *
   * 为什么不是单纯用配色 id 作键（早期实现）：`mono` 这样的**基线配色在两端各有一份**
   * 是**正常且必要**的 —— 黑白这套设计在手机端和电脑端本来就该各配各的尺寸/圆角，
   * 把它判成"重名冲突"会让其中一端静默失去配色（实测：web 的 mono 被丢弃，
   * 控制台留下一条告警）。
   *
   * 那"配色 id 全局唯一"这条规则还成立吗？成立，只是**作用域是设备内**：
   *   • 同一个设备下两个包不能有同名配色（`?theme=ocean` 在该端必须有唯一答案）
   *   • 跨设备可以同名（`mono`），因为取值时**必须同时给出设备**
   *     （`getThemeRecord(id, device)`），歧义在入口就被设备消解掉了
   * 因此 `ocean`（mobile）与 `web-ocean` 这种"同一设计两端两套品牌色"的诉求，
   * 仍然需要不同名 —— 不是被这里逼的，而是因为它们是**两套不同的配色**
   * （同名会让"两端都要海蓝"与"两端各要一套色"在配置上无法区分）。
   */
  const registry = new Map<string, MauthThemeRecord>();
  /** 包名 → 包定义的版式声明（配色未自带声明时继承它；跨设备共用一份） */
  const packageViews = new Map<string, Record<string, string> | undefined>();

  /** 复合键：`包/设备/配色`。与视图注册表的 `scopeKey` 同一思路（避免嵌套 Map 样板） */
  const keyOf = (pkg: string, device: ThemeDevice, colorId: string): string =>
    `${pkg}/${device}/${colorId}`;

  // ① 包定义：只提供 meta 与可选的 views 声明（**不再充当默认配色**）
  for (const [key, mod] of sortedEntries(packageModules)) {
    const pkg = packageFromKey(key);
    const def = mod?.default;
    // 目录名不合规、或忘了 `export default`，都跳过而不是抛错：
    // 一个写坏的包不该让整个认证页起不来。
    if (!pkg || !def || typeof def !== 'object' || !def.meta) continue;
    packageViews.set(pkg, def.views);
  }

  // ② 各设备下的配色 —— 每条记录都带 pkg + device 两段归属
  for (const [key, mod] of sortedEntries(colorModules)) {
    const parsed = colorFromKey(key);
    const def = mod?.default;
    if (!parsed || !def || typeof def !== 'object' || !def.meta) continue;
    const { pkg, device, colorId } = parsed;
    // 包定义缺失（包本身写坏）：该配色无处可依，跳过
    if (!packageViews.has(pkg)) continue;
    // 冲突判定在**设备内**：同一个包、同一个设备下有同名配色才是真冲突
    if (registry.has(keyOf(pkg, device, colorId))) {
      console.warn(
        `[theme] 配色 id「${colorId}」在「${pkg}/${device}」内重复（${key} 已忽略）：` +
          '同一个包、同一个设备下的配色 id 必须唯一 —— 因为在该端取值时只给一个 id。' +
          '同一设计想给两端各一套品牌色，请给它们不同名（如 ocean 与 web-ocean）。'
      );
      continue;
    }
    registry.set(keyOf(pkg, device, colorId), {
      pkg,
      device,
      meta: { ...def.meta, id: colorId },
      tokens: def.tokens,
      // 配色自己声明了就用自己的，否则继承包定义 —— 包根写一次，全包配色共用
      views: def.views ?? packageViews.get(pkg),
      loadStyle: undefined
    });
  }

  // ③ 附加样式：按「包 / 设备 / 配色」挂上去（与 ② 同键，避免歧义）
  for (const [key, loader] of sortedEntries(colorStyles)) {
    const parsed = colorFromStyleKey(key);
    if (!parsed) continue;
    const record = registry.get(keyOf(parsed.pkg, parsed.device, parsed.colorId));
    // 有 theme.scss 但没 index.ts 的目录视为残缺，忽略其样式
    if (record) record.loadStyle = loader;
  }

  return registry;
}

const registry = buildRegistry();

/**
 * 在**指定设备**内查找一条配色记录
 *
 * 设备是必传项：注册表的键含设备段，不给设备就没有唯一答案
 * （`mono` 在两端各有一份）。
 */
function findRecord(id: string, device: ThemeDevice): MauthThemeRecord | undefined {
  for (const record of registry.values()) {
    if (record.meta.id === id && record.device === device) return record;
  }
  return undefined;
}

/**
 * 各设备的兜底配色 id
 *
 * 取该设备下**排在最前**的配色（按路径排序 → `mono` 这类基础档通常在前）。
 * 之所以不写死 `mono`：允许某个设备只提供一套配色而不必强行命名 mono。
 * 某设备下一套配色都没有时返回 null，由调用方退回"什么都不注入"的基线路径。
 */
function defaultColorIdOf(device: ThemeDevice): string | null {
  const ids = [...registry.values()]
    .filter(r => r.device === device)
    .map(r => r.meta.id)
    .sort();
  return ids[0] ?? null;
}

/** 注册表为空 / 该设备无配色时给一个空记录兜底，保证 store 侧不必到处判空 */
function emptyRecord(device: ThemeDevice): MauthThemeRecord {
  return {
    pkg: DEFAULT_THEME_PACKAGE,
    device,
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
 * 调试面板用的一组：一个主题包 + 它名下的配色（按包名、再按 id 排序）
 *
 * 传 device 只列出该设备下的配色：面板上「手机端」和「电脑端」是两张独立的卡片，
 * 各自列出本端可选的配色，而不是把两端的配色混在一张表里。
 */
export function listThemeGroups(device?: ThemeDevice): { pkg: string; themes: MauthThemeMeta[] }[] {
  const groups = new Map<string, MauthThemeMeta[]>();
  for (const record of registry.values()) {
    if (device && record.device !== device) continue;
    const bucket = groups.get(record.pkg);
    if (bucket) bucket.push(record.meta);
    else groups.set(record.pkg, [record.meta]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pkg, themes]) => ({
      pkg,
      // 稳定排序：先按 id，两端同名时不会因为遍历顺序而不稳定
      themes: [...themes].sort((a, b) => a.id.localeCompare(b.id))
    }));
}

/**
 * 归一化并校验外部传入的配色 id
 *
 * 用于 URL 参数 / 后端下发这类不可信输入：非法字符、未登记 id 一律返回 null，
 * 由调用方决定回退（通常回默认配色）。不做「模糊匹配」，避免 `../` 一类路径
 * 拼装值绕过校验。
 *
 * @param raw    原始输入
 * @param device 限定设备（可选）：传了就只接受该设备下的配色，
 *               防止 `?theme=web-ocean` 被手机端选中而套上一套不匹配的皮肤
 */
export function resolveThemeId(raw: unknown, device?: ThemeDevice): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  if (!id || !THEME_ID_RE.test(id)) return null;
  // 不传设备时：只要**任意**一端登记过就认（URL/后端下发未必知道是哪端，
  // 设备匹配留给调用点按自己的设备判 —— 见 store 的 themeRecordFor）。
  if (!device) return [...registry.values()].some(r => r.meta.id === id) ? id : null;
  return findRecord(id, device) ? id : null;
}

/**
 * 取配色记录
 *
 * 回退链：指定 id（且设备匹配）→ 该设备的兜底配色 → 空记录（吃 SCSS 基线）。
 * 设备不匹配时**不跨设备借用**：拿电脑端的配色去渲染手机端会得到一套
 * 尺寸/圆角都对不上的东西，不如老实用基线。
 */
export function getThemeRecord(id: string, device: ThemeDevice = DEFAULT_THEME_DEVICE): MauthThemeRecord {
  const record = findRecord(id, device);
  if (record) return record;
  const fallback = defaultColorIdOf(device);
  return (fallback && findRecord(fallback, device)) || emptyRecord(device);
}

/**
 * 这套配色属于哪个主题包 —— **版式的查找范围由它决定**（版式跟随主题包）
 *
 * 未知 / 非法配色返回 `DEFAULT_THEME_PACKAGE`：与 `getThemeRecord` 的回退口径一致，
 * 调用方不必先判空再取。
 */
export function getThemePackage(id: string, device: ThemeDevice = DEFAULT_THEME_DEVICE): string {
  return getThemeRecord(id, device).pkg;
}

/**
 * 这套配色属于哪个**设备** —— 决定版式在 `mobile/` 还是 `web/` 下查找
 *
 * 未知 / 非法配色返回 `device` 参数本身（调用方通常传当前判定出的设备），
 * 这样"URL 写了错配色"最多是回退基线配色，而不会把页面切到另一种设备形态。
 *
 * ⚠️ 配色可以**跨设备同名**（如 `mono`），所以查到的第一条不一定是想要的设备。
 *    实现上取"**该设备参数下**登记的那条"（`findRecord` 已按设备过滤）——
 *    没有该设备的记录时返回参数本身。
 */
export function getThemeDevice(id: string, device: ThemeDevice = DEFAULT_THEME_DEVICE): ThemeDevice {
  return findRecord(id, device)?.device ?? device;
}

/** 该设备下默认用哪套配色（供 store 在"没选过"时取值）；无配色时返回 null */
export function getDefaultThemeId(device: ThemeDevice = DEFAULT_THEME_DEVICE): string | null {
  return defaultColorIdOf(device);
}

/** 该配色是否登记过（限定设备时要求设备也匹配） */
export function isKnownTheme(id: unknown, device?: ThemeDevice): boolean {
  return resolveThemeId(id, device) !== null;
}
