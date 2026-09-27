/**
 * 主题（配色）注册表 —— 四级结构：**主题包 → 设备 → 页面 → 配色**
 *
 * === 目录骨架 ===
 * ```
 * theme/themes/<包>/                    主题包：一套完整设计，手机端与电脑端都住这里
 * ├── index.ts                          包定义（只有 meta / views，不再是"默认配色"）
 * ├── mobile/                           该设计的**手机端**呈现
 * │   └── <页面>/
 * │       ├── index.vue                 该包在该设备该页的**唯一**版式
 * │       └── colors/<配色>/            该页的配色（配色只挂在页面下，与版式同级）
 * ├── standard/                         该设计的**桌面主窗口**呈现（结构同上）
 * │   └── <页面>/{index.vue, colors/<配色>/}
 * └── mini/                             该设计的**iframe 紧凑版**呈现（结构同上）
 *     └── <页面>/{index.vue, colors/<配色>/}
 * ```
 *
 * 🔴 **一个主题包 = 一种版式**（2026-09-26 定案，用户：「变体版式使用新包」）：
 *    `<页面>` 下**只有** `index.vue` 与 `colors/`，**没有**「版式」这一层目录。
 *    要另一种版式 → 新建包（`theme/themes/compact/<设备>/<页面>/`），不要建
 *    `<页面>/<版式>/`。曾支持过的 6 段形态已删除，原因是它要求换版式时复制整套配色，
 *    两套必然漂移。守卫见 `.tmp-probe/verify-theme-dirs.mjs`。
 *
 * === 为什么设备是主题包内的一层，而不是另一个顶层目录 ===
 * 一个主题包 = 一套**设计语言**。手机端与电脑端是这套语言在两种设备上的呈现，
 * 因此住在同一个包里：「换一套设计」只需换一个包目录，不会出现版式换了、配色没换
 * 或者两端各换一半的情况。若把设备提到顶层（`theme/mobile/`、`theme/standard/`），
 * 换一套设计就要改两处，两者迟早漂移。
 *
 * === 为什么配色在设备内独立配置 ===
 * 同一套设计，手机端用黑白、电脑端用海蓝是完全合理的诉求（场景不同、品牌侧重不同）。
 * 所以 `mobile/colors/` 与 `standard/colors/` 是**两个互不影响的配色集合**，
 * 虽然目录名可以相同 —— 这正是「手机端、电脑端分别配置主题」的落点。
 *
 * === 为什么配色 id 的唯一性作用域是「同包同设备同页」 ===
 *   URL `?theme=ocean` 只给一个 id —— 但**取值时必须同时给出归属**
 *   （`getThemeRecord(id, pkg, device, page, view)`），歧义在入口就被消解掉了。
 *   于是：
 *     • 同一个包、同一个设备、同一个页面下，配色 id 必须唯一（该范围只有一个答案）
 *     • **跨设备可以同名**：`default/mobile/login/colors/black` 与
 *       `default/standard/login/colors/black` 并存是**正常且必要**的
 *       —— 黑白这套设计在两端本来就该各配各的尺寸/圆角。
 *   ⚠️ 同名 ⇒ **同一个颜色概念、两端各配一份**：手机端海洋蓝、电脑端深墨蓝可以都叫
 *     `ocean`，各写各的 tokens，仍是两套独立配色（这正是"两端分别配置"的落点）。
 *     若两端要的是**两个不同的 id**（手机 `blue`、电脑 `black`），那不是"重名"问题，
 *     而是 URL 需要按设备分别给 id —— 用**设备维度参数**：
 *     `?theme.mobile=blue&theme.standard=black`（见 `stores/theme.ts` 的 `readUrlIntent`）。
 *   同包同设备同页内重名按路径排序**先到先得**并告警，不静默覆盖
 *   （否则哪套生效取决于文件系统顺序）。
 *
 * === 黑白不是"没有配色" ===
 *   它们是**两个具名配色目录**（`<页面>/colors/{black,white}/`），与 blue/cyan/rainbow
 *   平级，可以显式选中、出现在列表里。黑白**也带自己的 tokens 与 tone**
 *   （`black.tone='dark'` / `white.tone='light'`）—— 它们不是"零 token 的隐式兜底"。
 *   真正保住"零配色时零回归"的是**注册表为空/该范围无配色**时走的 `emptyRecord`
 *   路径（tokens 为 undefined，外观完全由 SCSS 基线决定）。
 *   ⚠️ 早期注释里的 `mono`（`colors/mono/`，零 token）**已改名且加上了 tokens**，
 *     现为 `black` / `white` 两个目录，`colors/mono/` 不存在。
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
import {
  DEFAULT_THEME_COLOR,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_PACKAGE,
  DEFAULT_THEME_PAGE,
  THEME_ID_RE
} from 'skinsuite';
import type { MauthThemeMeta, MauthThemeRecord } from './types';
import { registry } from './registry';
import type { ThemeTone } from './tone';
import { DEFAULT_THEME_DEVICE, type ThemeDevice } from './devices';

/**
 * 常量与白名单**已迁到内核包**（2026-09-26 抽包 Stage 1）
 *
 * 取值集合（默认包/页面/配色、id 白名单）只有一个来源：
 * `packages/theme-core/src/constants.ts`。**设备取值集合例外** —— 它随应用走，
 * 声明在本应用的 `./devices.ts`（见该文件头）。本文件把名字**原样转发**出去，
 * 于是 `@/theme` 的导入面一个字不变 —— 40 多处 `from '@/theme'` 的调用点、
 * 关卡断言、调试面板都不用改。
 *
 * ⚠️ 下面这组 `export … from` **不创建本地绑定**（所以本文件真用到的那几个走上面的
 *    `import`）。加新常量时两处都要动：白名单进包、名字在这里露出。
 */
export {
  BASE_VIEW_ID,
  DEFAULT_THEME_COLOR,
  DEFAULT_THEME_DARK_COLOR,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_PACKAGE,
  DEFAULT_THEME_PAGE
} from 'skinsuite';

/** 设备维度取值集合、默认设备、设备联合类型、设备中文名 —— 随应用走，见 `./devices` */
export { DEFAULT_THEME_DEVICE, THEME_DEVICES, deviceLabel } from './devices';
export type { ThemeDevice } from './devices';

/**
 * ⚠️ 注册表构建（glob 加载 + 键解析 + `buildRegistry`）已抽到 `./registry` ——
 *    本文件只保留查询层（`findRecord` / `getThemeRecord` / `list*` 等）与 re-export 壳。
 *    构建产物 `registry` 单例从 `./registry` import，查询函数的导入面不变。
 *    完整目录骨架、键的唯一性作用域、加载策略说明见本文件头注释与 `./registry`。
 */

/**
 * 查找一条配色记录
 *
 * **四段都必须给**（包 / 设备 / 页面 / 配色）：配色的归属就是这四段，
 * 少给任何一段都可能命中同一 id 的另一份（`black` 在每个包 / 每个设备下各有一份）。
 *
 * 🔴 **没有「版式」段**（2026-09-27 B5）：一个主题包 = 一种版式，`view ≡ pkg`，
 *    所以「当前包」就同时是「当前版式」的答案。给定精确包，**第一行**直接命中；
 *    找不到再走回退链。
 *
 * @param pkg  主题包 id（`DEFAULT_THEME_PACKAGE` = 'default' 表示默认包）
 */
function findRecord(
  id: string,
  pkg: string,
  device: ThemeDevice,
  page: string
): MauthThemeRecord | undefined {
  // ① 精确匹配：当前包 × 当前设备 × 当前页面（键已无 view 段，见 keyOf 注释）
  // 🔴 旧实现这里 hardcode 了 `DEFAULT_THEME_PACKAGE`，导致切到 compact 包后点
  //    blue 永远命中 default 包 —— 因为 compact 包的配色键根本命中不了。改为按
  //    调用方传入的 pkg 查。
  return registry.get(`${pkg}/${device}/${page}/${id}`) ??
    // ② 兜底扫描：任意包 × 同 pkg（切包后 pkg 还没跟上的那一帧，极少见）
    [...registry.values()].find(
      r => r.meta.id === id && r.device === device && r.page === page && r.pkg === pkg
    ) ??
    // ③ 跨包兜底：当前包没有这个 id 时退回**默认包**（如切到 compact 后想看 blue，
    //    该包没这套色 → 用 default 包的同名色）。
    (pkg !== DEFAULT_THEME_PACKAGE
      ? [...registry.values()].find(
          r => r.meta.id === id && r.device === device && r.page === page && r.pkg === DEFAULT_THEME_PACKAGE
        )
      : undefined);
}

/**
 * 某版式下的兜底配色 id
 *
 * 口径（2026-09-26 定）：**先取显式默认色 `DEFAULT_THEME_COLOR`（`white`）**，
 * 该范围里没有它才退回「排在最前的那套」（按 id 排序）。
 *
 * 那条退路保留的原因：允许某个版式只提供一套自命名的配色而不必强行叫 `white`
 * —— 它是"只有一套时的兜底"，**不是**"默认是 `black`"（旧口径的误读点）。
 * 该范围一套配色都没有时返回 null，由调用方退回"什么都不注入"的基线路径。
 *
 * ⚠️ view = 包名（一个主题包 = 一种版式）；若该范围内没配色，本函数返回 null ——
 *    调用方应当别跨范围借配色（拿别包的 token 渲染当前版式尺寸/圆角会错位）。
 */
function defaultColorIdOf(device: ThemeDevice, page: string, pkg: string): string | null {
  const ids = [...registry.values()]
    .filter(r => r.device === device && r.page === page && r.pkg === pkg)
    .map(r => r.meta.id)
    .sort();
  if (ids.includes(DEFAULT_THEME_COLOR)) return DEFAULT_THEME_COLOR;
  return ids[0] ?? null;
}

/** 注册表为空 / 该范围无配色时给一个空记录兜底，保证 store 侧不必到处判空 */
function emptyRecord(device: ThemeDevice, page: string): MauthThemeRecord {
  return {
    // 🔴 空记录的包归属**恒为默认包**：零配色时视觉完全由 SCSS 基线决定，
    //    而基线就是默认包的效果（`packageId` 据此回落，切包后若该包没配色，
    //    版式查找仍落默认包 —— 与「换版式 = 换包，配色跟着包走」一致）。
    pkg: DEFAULT_THEME_PACKAGE,
    device,
    page,
    meta: { id: DEFAULT_THEME_ID, name: '默认' },
    // 没有配色时外观完全由 SCSS 基线决定，而基线 `:root` 是浅底（深色要 `html.dark` 才成立），
    // 所以兜底记 'light' —— 语义上如实描述"当前呈现是浅底"。
    tone: 'light',
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
  pkg?: string
): { pkg: string; themes: MauthThemeMeta[] }[] {
  const groups = new Map<string, MauthThemeMeta[]>();
  for (const record of registry.values()) {
    if (device && record.device !== device) continue;
    if (page && record.page !== page) continue;
    if (pkg && record.pkg !== pkg) continue;
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
 * 列出某个包下的全部配色（按 id 去重、按目录名排序）
 *
 * ⚠️ 排序**只按 id 字母序**（`black < blue < cyan < rainbow < white`）。
 *    曾经想过给黑白加"基线优先"的特权排序，但那与「五色完全并列」的语义相悖
 *    （用户 2026-09-25 明确："黑白色和蓝青色应当同等，他们只是一个选项而已"）——
 *    排序上的任何特权都是"黑白更特殊"的暗示。面板的换行位置不值得为它破例。
 *
 * 🔴 **view ≡ pkg**，所以本函数只列「当前包」下的配色。
 *    跨包兜底：切到 compact 后该包若无某色，**不该**默默收进 default 包那套同名色
 *    （否则"切版式后蓝青颜色切换无效"又会发生 —— 调试面板看着有 blue，点完渲的是
 *    default 包的 token）。
 *
 * @param pkg 当前生效的包 id（= 版式，view ≡ pkg）
 */
export function listColorsOf(device: ThemeDevice, page: string, pkg: string): MauthThemeMeta[] {
  const seen = new Map<string, MauthThemeMeta>();
  for (const record of registry.values()) {
    if (record.device !== device || record.page !== page) continue;
    // 精确匹配包（= 版式，view ≡ pkg），一行命中
    if (record.pkg !== pkg) continue;
    if (!seen.has(record.meta.id)) seen.set(record.meta.id, record.meta);
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 某配色在指定归属下的**明暗系别**；未登记返回 null（由调用方决定怎么回退）
 *
 * 🔴 用 `findRecord`（要求该 id 真的在这一段登记过），**不是** `getThemeRecord` ——
 *    后者会回落到该版式的默认配色，于是"一个本版式不存在的 id"会拿到**别的配色**
 *    的系别，store 据此判断"要不要联动"就会判错。
 *
 * `findRecord` 需要 pkg，而本函数不知道当前包（只收 device/page/view）：它只能先按
 * `DEFAULT_THEME_PACKAGE` 查；`view ≡ pkg` 下这通常够用（同名 id 跨包系别一致）。
 */
export function toneOfColor(
  id: string,
  device: ThemeDevice,
  page: string,
  pkg: string
): ThemeTone | null {
  return findRecord(id, pkg, device, page)?.tone ?? null;
}

/**
 * 某配色的系别（**任意**登记处）—— 给"槽归位"这类没有明确范围的场景用
 *
 * ⚠️ 同一个 id 在多个页面/版式下各有一份配置，系别**应当处处一致**；
 *    这里取注册表里**第一处**（按路径排序，注册顺序稳定）。
 *    真的配得不一致属于配置错误，本函数不负责纠正（由目录口径关卡守卫）。
 */
export function toneOfAnyScope(id: string): ThemeTone | null {
  for (const record of registry.values()) {
    if (record.meta.id === id) return record.tone;
  }
  return null;
}

/**
 * 某个版式下、指定**系别**的全部配色 id（按目录名排序）
 *
 * 明暗联动取"另一侧配色"时用它：槽里没记过就取这里的第一套兜底。
 * 排序只按 id 字母序（与 `listColorsOf` 同一口径，不给黑白特权）。
 *
 * ⚠️ 返回空数组 = 该版式下**没有**这个系别的配色 —— 调用方应当**什么都不做**，
 *    而不是回落到别的系别（否则"开夜间"会拿到一套浅底，看起来像没生效）。
 */
export function listColorIdsOfTone(
  device: ThemeDevice,
  page: string,
  pkg: string,
  tone: ThemeTone
): string[] {
  const seen = new Set<string>();
  for (const record of registry.values()) {
    if (record.device !== device || record.page !== page || record.pkg !== pkg) continue;
    if (record.tone !== tone) continue;
    seen.add(record.meta.id);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
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
 * @param pkg    限定包（可选）：传了就只接受该包下的配色
 */
export function resolveThemeId(
  raw: unknown,
  device?: ThemeDevice,
  page?: string,
  pkg?: string
): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  if (!id || !THEME_ID_RE.test(id)) return null;
  const match = (record: MauthThemeRecord): boolean =>
    record.meta.id === id &&
    (!device || record.device === device) &&
    (!page || record.page === page) &&
    (!pkg || record.pkg === pkg);
  // 各段都不传时：只要**任意**一处登记过就认（URL/后端下发未必知道是哪端哪版式，
  // 匹配留给调用点按自己的上下文判 —— 见 store 的 themeRecordFor）。
  return [...registry.values()].some(match) ? id : null;
}

/**
 * 取配色记录
 *
 * 回退链（2026-09-25 加了"系别一致"这一层）：
 *   指定 id（且四段都匹配）→ **同系别**的首套配色 → 该范围的兜底配色 → 空记录。
 *
 * === 为什么回退要保持系别一致 ===
 * 一个 id 并非在每个作用域都有登记（如 `blue` 只在手机端有）。
 * 若直接回落到该范围的兜底配色（按 id 排序，电脑端通常落到 `black`），
 * "把窗口拉宽"这类作用域切换就会让页面在黑白之间翻转 —— 用户看到的
 * 是"同一条路由、不同宽度、两个主题"。按**请求配色的系别**取同系别的
 * 首套（浅底选浅底、深底选深底），观感才连续。
 *
 * 版式 / 设备不匹配时**仍不跨包借用**：拿紧凑包的配色去渲染基础包会得到一套
 * 尺寸/圆角都对不上的东西，不如老实用基线。
 *
 * @param pkg  主题包 id（`DEFAULT_THEME_PACKAGE` = 'default' 表示默认包）；
 *             应**显式传当前包**（即 `packageId`），否则会按 default 查，
 *             与「切到 compact 包」后的版式/UI 不一致。
 * @param page 页面名（`theme/views/<page>.ts` 的文件名，如 `register`）
 */
export function getThemeRecord(
  id: string,
  pkg: string = DEFAULT_THEME_PACKAGE,
  device: ThemeDevice = DEFAULT_THEME_DEVICE,
  page: string = DEFAULT_THEME_PAGE
): MauthThemeRecord {
  const record = findRecord(id, pkg, device, page);
  if (record) return record;
  // 同系别回落：请求的 id 没登记在当前作用域时，取它的系别在本作用域的首套
  //（该作用域没有这个系别时走下面的原始兜底，不跨系别硬凑）
  const tone = toneOfAnyScope(id);
  if (tone) {
    const sameTone = listColorIdsOfTone(device, page, pkg, tone)[0];
    const sameToneHit = sameTone ? findRecord(sameTone, pkg, device, page) : undefined;
    if (sameToneHit) return sameToneHit;
  }
  const fallback = defaultColorIdOf(device, page, pkg);
  return (fallback && findRecord(fallback, pkg, device, page)) ||
    emptyRecord(device, page);
}

/**
 * 这套配色属于哪个主题包 —— **版式的查找范围由它决定**（版式跟随主题包）
 *
 * 未知 / 非法配色返回 `DEFAULT_THEME_PACKAGE`：与 `getThemeRecord` 的回退口径一致，
 * 调用方不必先判空再取。
 *
 * @param pkg 主题包 id（`DEFAULT_THEME_PACKAGE` = 'default' 表示默认包）
 */
export function getThemePackage(
  id: string,
  pkg: string = DEFAULT_THEME_PACKAGE,
  device: ThemeDevice = DEFAULT_THEME_DEVICE,
  page: string = DEFAULT_THEME_PAGE
): string {
  return getThemeRecord(id, pkg, device, page).pkg;
}

/**
 * 该范围内默认用哪套配色（供 store 在"没选过"时取值）；无配色时返回 null
 *
 * 口径 = `defaultColorIdOf`：**先 `DEFAULT_THEME_COLOR`（`white`）**，该范围没有才
 * 退回 id 字母序第一（2026-09-26 定；此前是"字母序第一"→ 实际落到黑系 `black`）。
 *
 * ⚠️ 缺省包用 `DEFAULT_THEME_PACKAGE`（2026-09-26）：配色键里没有 view 段，
 *    用 `'base'` 查会一套都匹配不到 → 返回 null → 调用方拿到 null 后可能
 *    退到"拿设备名当配色 id"这类无意义兜底（`stores/theme.ts` 的 `readInitialTheme`
 *    就是这么用的）。
 */
export function getDefaultThemeId(
  device: ThemeDevice = DEFAULT_THEME_DEVICE,
  page: string = DEFAULT_THEME_PAGE,
  pkg: string = DEFAULT_THEME_PACKAGE
): string | null {
  return defaultColorIdOf(device, page, pkg);
}

/** 该配色是否登记过（限定哪几段就要求哪几段匹配） */
export function isKnownTheme(
  id: unknown,
  device?: ThemeDevice,
  page?: string,
  pkg?: string
): boolean {
  return resolveThemeId(id, device, page, pkg) !== null;
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
 * 某设备某页面下有哪些**包**登记了配色（面板要按包分组）
 *
 * 🔴 版式 ≡ 包名（一个主题包 = 一种版式），所以「有哪些版式」=「有哪些包」，
 *    直接返回 `pkg` 去重。
 */
export function listColorViews(device: ThemeDevice, page: string): string[] {
  return [
    ...new Set(
      [...registry.values()]
        .filter(r => r.device === device && r.page === page)
        .map(r => r.pkg)
    )
  ].sort();
}
