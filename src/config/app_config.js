/**
 * 运行调优配置（src/config/ = 手工调优区，env 瘦身后的启动期旋钮都收敛于此）
 *
 * 为什么是 JS 模块而不是 JSON：JSON 写不了注释，调优参数离开了「为什么是这个值」
 * 的上下文就没人敢改；JS 里每个值自带踩坑注释，且同样能被 IDE 校验语法。
 *
 * ⚠️ 运行时可修改性说明：本文件的值都是 **启动期读取一次**（Fastify 构造参数 /
 * 模块加载期常量），**不支持运行时热改** —— 改完需重启进程。
 * 需要运行时可改的调优项（防火墙阈值等）不放这里，走
 * `firewall_config.json` deepMerge + 面板热改那套（见 framework/firewall/config/）。
 * 分层判据：启动期旋钮 → 本文件（注释 + IDE 校验）；运行时可改 → JSON + deepMerge。
 *
 * 校验：`validateAppConfig()` 在 app.js 启动时调用 —— 未知配置段/配置项
 * （疑似拼写错误）与越界值都会 log.warn，非法值回退默认，不阻断启动。
 */
const APP_CONFIG = {
  http: {
    // keep-alive 空闲超时（毫秒），与 Fastify 内置默认一致（零行为变更）。
    // **必须大于前置反代的 keepalive**，否则会出现「反代刚复用连接而应用已关闭」
    // 的间歇性 502 —— Nginx 默认 75s、ALB 60s，按上游实际值对齐。
    keepAliveTimeoutMs: 72_000,

    // 单请求（含请求体）接收总时长上限（毫秒）= Node 自身默认值。
    // Fastify 默认关掉了它（0），显式打开是为了封住「慢速发 body」（RUDY 类）攻击
    // —— 防火墙的检测器里没有慢连接检测，这一层是唯一防线。
    // 300s 是留给 200MB multipart 上传的余量（约 0.67MB/s 即达标）；
    // 弱网移动端调大，高速内网可下调，不要低于最慢的真实上传耗时。
    requestTimeoutMs: 300_000
  },

  websocket: {
    // 关闭宽限期（毫秒）：停机时先广播关闭帧，等这么久再强制断开残留连接。
    // 规范客户端毫秒级断开，1s 足够；调大只会拖慢停机。
    shutdownGraceMs: 1_000
  },

  guard: {
    // 守卫配置跨实例同步轮询间隔（毫秒）。多实例部署时各实例靠它对齐鉴权配置；
    // **单实例部署设为 0 可关闭**（省一个定时器）。改动需重启生效。
    syncIntervalMs: 30_000
  },

  monitor: {
    // 慢请求告警阈值（毫秒）：超过即记警告日志，**只观测不干预** ——
    // 硬断开由 http.requestTimeoutMs 负责，两者不要混淆。
    slowRequestThresholdMs: 2_000
  },

  passwordHash: {
    // scrypt 并发上限（防御公开登录突发放大 libuv 线程池与内存）。
    // 每次 scrypt 内存开销约 16MB，默认 16 → 峰值约 256MB。
    // 超限时抛 SCRYPT_BUSY，由上层按 503 背压，而不是无界排队拖垮整个进程。
    scryptMaxConcurrency: 16,

    // bcrypt 并发上限：超限立刻抛错（不排队），与 scrypt 一样 fail-closed
    // —— 宁可误拒一次登录，也不让异常冒到路由层。
    bcryptMaxConcurrency: 4
  }
};

/** 每个数值项的合法区间（闭区间，毫秒/次） */
const NUMBER_RULES = [
  ['http.keepAliveTimeoutMs', 0, 3_600_000],
  ['http.requestTimeoutMs', 0, 3_600_000],
  ['websocket.shutdownGraceMs', 0, 600_000],
  ['guard.syncIntervalMs', 0, 3_600_000],
  ['monitor.slowRequestThresholdMs', 0, 3_600_000],
  ['passwordHash.scryptMaxConcurrency', 1, 1024],
  ['passwordHash.bcryptMaxConcurrency', 1, 1024]
];

/** 合法配置段 → 合法配置项（用于拼写错误诊断） */
const KNOWN_SECTIONS = {
  http: ['keepAliveTimeoutMs', 'requestTimeoutMs'],
  websocket: ['shutdownGraceMs'],
  guard: ['syncIntervalMs'],
  monitor: ['slowRequestThresholdMs'],
  passwordHash: ['scryptMaxConcurrency', 'bcryptMaxConcurrency']
};

/**
 * 校验运行调优配置（app.js 启动时调用一次）
 *
 * 只告警不阻断 —— 调优配置文件不该有让服务起不来的能力；
 * 非法值由各消费方回退默认（与原 resolveTimeoutMs 语义一致）。
 *
 * @param {object} [config] - 待校验配置，缺省用本模块的 APP_CONFIG
 * @returns {string[]} 问题清单（人类可读）；空数组表示配置合法
 */
function validateAppConfig(config = APP_CONFIG) {
  const warnings = [];

  for (const [section, value] of Object.entries(config || {})) {
    const knownKeys = KNOWN_SECTIONS[section];
    if (!knownKeys) {
      warnings.push(`未知配置段 "${section}"（合法：${Object.keys(KNOWN_SECTIONS).join(' / ')}），已忽略`);
      continue;
    }
    for (const key of Object.keys(value || {})) {
      if (!knownKeys.includes(key)) {
        warnings.push(`未知配置项 "${section}.${key}"（合法：${knownKeys.join(' / ')}），已忽略 —— 疑似拼写错误`);
      }
    }
  }

  const get = path => path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), config);
  for (const [path, min, max] of NUMBER_RULES) {
    const raw = get(path);
    if (raw === undefined || raw === null || raw === '') continue; // 未设置走消费方默认
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      warnings.push(`"${path}" = ${JSON.stringify(raw)} 非法（需 ${min}~${max} 的整数），已回退默认值`);
    }
  }

  return warnings;
}

export { APP_CONFIG, validateAppConfig };
