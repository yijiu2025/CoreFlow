/**
 * 防火墙遥测注入点 —— 引擎层与面板遥测的依赖倒置接口
 *
 * 两层分离（2026-11-01）：引擎（pipeline / detectors / auto-responder）已上移
 * framework，而流量记录的真身 `data/store.js` 属于面板遥测（app 层）。
 * 引擎在请求热路径上产生记录事件，但 framework **不得** import app ——
 * 因此与 `interface/config-access.js` 同款：这里持有**函数引用**，
 * app 在加载 store 时把 `pushRecord` 注册进来。没有快照、没有副本。
 *
 * 未注册时静默跳过（fail-open）：遥测是旁路能力，firewall 应用被卸载、
 * 或测试环境只装引擎不装面板时，防护本身必须照常工作。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */

/** @type {((record: object) => void) | null} 由 app/firewall/data/store.js 注册 */
let recordSink = null;

/**
 * 注册遥测记录接收器（由 app 层在模块加载时调用）
 *
 * @param {(record: object) => void} sink 记录接收函数（同步，内部只做内存累加）
 * @returns {void}
 */
function registerRecordSink(sink) {
  if (typeof sink !== 'function') {
    throw new TypeError('registerRecordSink 需要传入函数');
  }
  recordSink = sink;
}

/**
 * 引擎产生一条遥测记录（请求日志 / 拦截事件 / 攻击事件）
 *
 * @param {object} record 遥测记录
 * @returns {void}
 */
function recordFirewallEvent(record) {
  if (!recordSink) return; // 未接面板：静默跳过，防护不受影响
  try {
    recordSink(record);
  } catch {
    // 遥测失败绝不影响主流程
  }
}

/**
 * 是否已注册接收器（供测试断言，不参与业务逻辑）
 *
 * @returns {boolean}
 */
function hasRecordSink() {
  return recordSink !== null;
}

export { registerRecordSink, recordFirewallEvent, hasRecordSink };
