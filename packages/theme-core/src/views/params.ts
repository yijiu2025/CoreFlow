/**
 * 版式参数的**设备维度**解析 —— `?view.<设备>` 支持
 *
 * === 解决什么 ===
 * 同一条链接要能给三台设备各指定一套版式：
 * ```
 * /login?view=compact                               三端共用（哪端没有就自动下沉到当前包）
 * /login?view.mobile=default&view.standard=compact   各端各指定（mini 走通用/包默认）
 * /login?view.mobile=default&view=default            设备专属优先，通用键兜底
 * ```
 *
 * === 取值链（每台设备各一条）===
 *   `view.<设备>`  →  `view`  →  （返回 undefined：由调用方走包声明 → 环境变量 → 当前包）
 *
 * === 为什么收在内核（而不是各页文件里）===
 * 三个页面（login / register / forgot-password）各有**一份**注册表文件，但"哪个 query
 * key 属于哪台设备"这件事与页面无关 —— 抄三份必然漂移。各页的 `pick*ViewId` 只负责
 * "拿到原始值之后怎么解析（落在哪个包、是否合法）"，取哪个键这一步交给本模块。
 * 2026-09-26 抽包 Stage 1 起它住在 `mauth-theme-core`：任何复用这套机制的前端
 * 都直接拿到这份实现，而不是再抄一遍。
 *
 * === 与配色侧同形（很重要）===
 * 配色侧（`oauth21/src/stores/theme.ts` 的 `readUrlIntent`）用同样的键形
 * （`theme.<设备>` / `skin.<设备>`）与同样的"设备专属优先"链。**两侧必须同形**，
 * 否则配置者要记两套规则，`?theme.mobile=blue&view.standard=compact` 这种混搭就写不出来。
 * 但两侧读的入口不同：配色侧读 `window.location.search`（store 是全局的，不依赖路由），
 * 版式侧读**路由 query**（容器手上只有 `route.query`）—— 所以不是同一个函数，是同一套规则。
 *
 * ⚠️ query key 里带 `.` 是合法的（`URLSearchParams` 与 vue-router 都原样保留），
 *    但访问时**必须用下标**（`query['view.standard']`）—— 点号在 JS 里不是合法标识符。
 *
 * @author yijiu2025
 * @since 2026-09-26
 */
import { THEME_DEVICES, type ThemeDevice } from '../constants';

/** 支持设备维度的参数名（与配色侧 `readUrlIntent` 的键保持一致） */
export type DeviceScopedParam = 'view' | 'theme';

/**
 * 把外部传入的设备名归一化
 *
 * 不认识的取值返回 null（**不是**落默认设备）—— 调用方各有自己的兜底口径
 * （各页 `pick*ViewId` 落默认设备，卡片等场景可能直接忽略）。
 */
export function asThemeDevice(raw: unknown): ThemeDevice | null {
  return typeof raw === 'string' && (THEME_DEVICES as readonly string[]).includes(raw)
    ? (raw as ThemeDevice)
    : null;
}

/** 值"存在且非空" —— 空串 / 空数组视为**未指定**，不顶掉兜底键 */
function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) {
    return value.some(v => typeof v === 'string' && v.trim() !== '');
  }
  return true;
}

/**
 * 按**设备**读取版式 / 配色参数
 *
 * @param query  路由 query（`route.query`）
 * @param name   参数名（`'view'` / `'theme'`）
 * @param device 当前设备 —— 容器用自己的 `THEME_DEVICE` 常量传进来（文件位置即身份）
 * @returns `query['<name>.<device>']` 优先；缺席或空值时退 `query[name]`；
 *          两者都没有则返回 undefined，表示"**这台设备**没有被显式指定"
 *
 * ⚠️ 只决定"取哪个键"，**不做合法性校验** —— 校验属于各页 `pick*ViewId` 与配色注册表
 *    （本函数也拿不到"当前包里有没有这套版式"）。返回值可能是数组（`?view=a&view=b`），
 *    由下游按"非字符串即非法"处理，与改前的行为一致。
 * ⚠️ 空串视为"未指定"：`?view.standard=` 不该把 `?view=compact` 顶掉 ——
 *    部署方常把参数留空当作"这台设备不特殊指定"。
 */
export function readDeviceParam(
  query: Record<string, unknown> | undefined,
  name: DeviceScopedParam,
  device: ThemeDevice
): unknown {
  const scoped = query?.[`${name}.${device}`];
  if (isPresent(scoped)) return scoped;
  return query?.[name];
}
