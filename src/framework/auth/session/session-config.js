/**
 * 会话策略配置访问器
 *
 * ════════════════════════════════════════════════════════════════════
 * 四层配置链（默认值归 core，src/config 只做覆盖）
 * ════════════════════════════════════════════════════════════════════
 *   ① 本文件的 AUTH_SESSION_DEFAULTS   core 保底值（src/config 全空也能跑）
 *   ② src/config/auth_config.js        可选静态覆盖（缺失即 {}）
 *   ③ data/auth_config.json        运行期覆盖（**热改，无需重启**）
 *
 * ⚠️ 消费方必须**每次使用时调用 `authSessionConfig()`**，不要把返回值缓存成
 * 模块级常量 —— 那会退回「改完要重启」，热改语义就丢了。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

import { createRuntimeConfig } from '../../config/runtime.js';
import { loadOverrides } from '../../config/overrides.js';

/**
 * core 保底默认值（改内置默认才动这里；按部署微调请写 src/config/auth_config.js
 * 或热改 data/auth_config.json）
 */
const AUTH_SESSION_DEFAULTS = {
  // JWT 认证总开关（framework 侧唯一来源；oauth21 的签发/校验都读这里）
  // false（默认）= Session 认证。⚠️ 打开需配套配置 RS256 密钥，否则签发会失败。
  jwt: {
    enabled: false
  },

  session: {
    // 旧 refresh token 轮转后「已轮转」标记的保留时长（秒），用于盗用检测。
    // 默认 7 天：足够覆盖「客户端长时间离线后带旧 token 回来」的检测窗口。
    // ⚠️ 消费方兜底最小 60 秒，防 0/负数导致 Redis TTL 异常（永不过期或立即失效）。
    rotatedRetentionSeconds: 604800,

    // 单用户最多保留的 refresh token 数（超出裁剪最旧）：防止刷新链路无界增长。
    // 多端登录 + 反复刷新的场景下，只要不裁剪，user_refresh 集合会一直膨胀。
    maxRefreshTokens: 10,

    // 单用户最大活跃设备数。超过则在写库前裁剪最旧设备行 ——
    // 不裁剪的话「换设备反复登录」会让 session_tokens 行无界增长（设备统计失真 + DB 膨胀）。
    // 默认 20 足够正常用户（手机 / 电脑 / 平板 / 多浏览器）。
    maxActiveDevices: 20,

    // 单设备单登录的 deviceType 白名单：只对名单内类型互顶（新登录踢掉同类型旧会话），
    // 未列出的类型允许多端并存。置空数组 = 全部类型互顶（历史行为）。
    // 例：['app', 'desktop'] → 手机/桌面客户端单登录，浏览器多开互不影响。
    // 调用方仍可用 createSession 的 multiDevice=true 显式豁免（优先级最高）。
    singleDeviceTypes: ['browser', 'app', 'desktop', 'miniapp', 'api']
  }
};

/** src/config/auth_config.js 的静态覆盖（可选；缺失则为 {}） */
const OVERRIDES = loadOverrides('auth_config.js', 'AUTH_CONFIG');

const runtime = createRuntimeConfig({ name: 'auth', defaults: AUTH_SESSION_DEFAULTS, overrides: OVERRIDES });

/**
 * 取当前生效的会话策略（热改：改 data/auth_config.json 后下一次调用即生效）
 *
 * @returns {{ rotatedRetentionSeconds: number, maxRefreshTokens: number, maxActiveDevices: number, singleDeviceTypes: string[] }}
 */
function authSessionConfig() {
  return runtime.get().session;
}

/** JWT 认证开关（唯一来源；oauth21 签发与 framework 校验共用，避免两处判断不一致） */
function authJwtEnabled() {
  return runtime.get().jwt?.enabled === true;
}

export { runtime as authRuntime, authSessionConfig, authJwtEnabled, AUTH_SESSION_DEFAULTS };
