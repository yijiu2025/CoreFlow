/**
 * 会话/令牌策略默认值（配置值单一来源）
 *
 * ⚠️ 本文件只放**值**（叶子模块，禁止 import 任何 src 代码，见 config-leaf 守护测试）。
 * 运行时覆盖与热改机制在 `src/framework/config/runtime.js`：
 *   改 `src/data/auth_config.json` 即可热生效（无需重启），本文件是兜底默认值。
 *
 * env 兜底已退役（2026-11-03）：ROTATED_RETENTION / MAX_ACTIVE_DEVICES /
 * SESSION_SINGLE_DEVICE_TYPES 不再读环境变量。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */
const AUTH_CONFIG = {
  session: {
    // 旧 refresh token 轮转后「已轮转」标记的保留时长（秒），用于盗用检测。
    // 默认 7 天：足够覆盖「客户端长时间离线后带旧 token 回来」的检测窗口。
    // ⚠️ 消费方兜底最小 60 秒，防 0/负数导致 Redis TTL 异常（永不过期或立即失效）。
    rotatedRetentionSeconds: 604800,

    // 单用户最大活跃设备数。超过则在写库前裁剪最旧设备行 ——
    // 不裁剪的话「换设备反复登录」会让 session_tokens 行无界增长（设备统计失真 + DB 膨胀）。
    // 默认 20 足够正常用户（手机 / 电脑 / 平板 / 多浏览器）。
    maxActiveDevices: 20,

    // 单设备单登录的 deviceType 白名单：只对名单内类型互顶（新登录踢掉同类型旧会话），
    // 未列出的类型允许多端并存。空数组 = 全部类型互顶（历史行为）。
    // 例：['app', 'desktop'] → 手机/桌面客户端单登录，浏览器多开互不影响。
    // 调用方仍可用 createSession 的 multiDevice=true 显式豁免（优先级最高）。
    singleDeviceTypes: ['browser', 'app', 'desktop', 'miniapp', 'api']
  }
};

export { AUTH_CONFIG };
