/**
 * 防火墙配置读取 —— 依赖倒置的接口层
 *
 * 为什么需要这一层（拆环，2026-09-16）：
 * 拆环前的依赖是 `util/shared.js → dao/dao.js → util/redis.js`，
 * 而 `getSecuritySettings` 的**真身**在 `dao/dao.js`（它持有 `securitySettings` 单例）。
 * 于是 util 层直接依赖 dao 层，形成 `util ↔ dao` 的环。
 *
 * 现在把「读配置」抽成本模块的一个**可注入引用**：
 *   - `util/shared.js` 的 `getConfig()` 改为调用本模块的 `readSecuritySettings()`
 *     → util 不再 import dao，环断开；
 *   - `dao/dao.js` 在模块加载时把自己的 `getSecuritySettings` 注册进来
 *     → 真身仍是 dao 的那个单例，**没有快照、没有副本**。
 *
 * 这一点很关键：本模块持有的是**函数引用**，不是配置对象。因此
 * `updateSecuritySettings` 整体替换 `securitySettings` 后，所有调用点立刻可见新值 ——
 * 与 `util/shared.js` 当年那个 30 秒缓存导致的「同一进程两套视图」缺陷正好相反。
 *
 * 依赖方向：本模块**零 import**，只被 dao 与 util 依赖，自身不依赖任何一层。
 * 这使它成为依赖图里最底层的节点，不会引入新环。
 *
 * 注册时机：`dao/dao.js` 是 ESM 模块，正文在**任何** import 链触达它时都会执行，
 * 因此不存在「忘了注册」。若真的没注册，`readSecuritySettings()` 会抛错而不是
 * 静默返回 `undefined` —— 后者会让所有 `settings.defense` 读取点变成
 * `TypeError: Cannot read properties of undefined`，且失败点离根因很远。
 *
 * @author yijiu2025
 * @since 2026-09-16
 */

/** @type {(() => object) | null} 由 dao/dao.js 注册的配置读取器 */
let settingsReader = null;

/**
 * 注册安全配置读取器（由 `dao/dao.js` 在模块加载时调用）
 *
 * 重复注册会覆盖前一个 —— 这是刻意的：测试里用 `jest.unstable_mockModule`
 * 替换配置来源时会走到这里，覆盖语义让测试不必先清空状态。
 *
 * @param {() => object} reader 返回当前安全配置对象的函数
 * @returns {void}
 */
function registerSettingsReader(reader) {
  if (typeof reader !== 'function') {
    throw new TypeError('registerSettingsReader 需要传入函数');
  }
  settingsReader = reader;
}

/**
 * 读取当前安全配置
 *
 * @returns {object} 安全配置对象（含 defense 段）
 * @throws {Error} 读取器尚未注册时抛出（说明 `dao/dao.js` 没被加载过）
 */
function readSecuritySettings() {
  if (!settingsReader) {
    throw new Error('安全配置读取器尚未注册：dao/dao.js 未被加载');
  }
  return settingsReader();
}

/**
 * 是否已注册读取器（供测试断言，不参与业务逻辑）
 *
 * @returns {boolean}
 */
function hasSettingsReader() {
  return settingsReader !== null;
}

export { registerSettingsReader, readSecuritySettings, hasSettingsReader };
