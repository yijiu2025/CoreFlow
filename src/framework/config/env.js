/**
 * 环境变量集中校验
 *
 * ── 要解决的问题 ──
 * 全仓有 **116 个** `process.env.*` 键，而校验逻辑散落各处（`app.js` 的 validateSecrets、
 * `redis/plugin.js` 的端口/DB 号校验、`db/index.js` 的必填项检查…），没有统一清单。后果：
 *   · 拼错或漏配一个键 → 运行期某个功能**静默失效**，而不是启动失败。失败点离根因很远，
 *     是最难排查的一类故障；
 *   · 没有任何地方能回答"生产到底必须配哪些"。
 *
 * ── 判定原则（决定了什么算"错误"）──
 * 只有「缺了必然出故障」的项才判为 error；**能安全降级的项一律 warning**。
 * 把可降级项判成必需，会让本来能正常服务的环境起不来 —— 那比不校验更糟。
 * 例如 `REDIS_ENABLED!=true` 时访问层会走进程内 MapStore，这是合法模式而非故障。
 *
 * ── 严谨性边界（不要高估本模块）──
 * schema 覆盖的是**关键项**，不是全部 116 个键。未列入的键不受校验，仍可能拼错。
 * 本模块的价值在于：把"生产必须配什么"从散落的代码里提炼成一份可执行清单，
 * 并补上散落校验做不到的**跨字段关系**（如 REDIS_ENABLED=true 时 REDIS_HOST 必须存在）。
 *
 * ── 为什么零 import ──
 * 保持为纯函数（配置从参数传入），可以脱离进程环境直接测试，
 * 也让本模块处于依赖图最底层、不引入任何环。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

/** 端口合法区间 */
const PORT_MIN = 1;
const PORT_MAX = 65535;

/** 密钥最小长度（与 app.js 的历史判据一致） */
const MIN_SECRET_LENGTH = 32;

/** 日志级别白名单 */
const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

/** 运行环境白名单 */
const NODE_ENVS = ['development', 'production', 'test'];

/**
 * 已知的不安全默认密钥
 *
 * 这些值来自历史 `.env.example` 与教程，最容易被直接复制到生产。
 * 从 `app.js` 的 validateSecrets 迁移至此，作为**唯一**判据来源。
 */
const INSECURE_SECRETS = [
  'your_super_secret_key_2026',
  'change-this-in-production-secret-key-2024',
  'secret',
  'password',
  '123456'
];

/**
 * 校验器：返回 null 表示通过，否则返回可读的失败原因
 */
const validators = {
  port: v => {
    const n = Number(v);
    return Number.isInteger(n) && n >= PORT_MIN && n <= PORT_MAX
      ? null
      : `必须是 ${PORT_MIN}~${PORT_MAX} 之间的整数，实际得到 "${v}"`;
  },
  positiveInt: v => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? null : `必须是正整数，实际得到 "${v}"`;
  },
  nonNegativeInt: v => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? null : `必须是非负整数，实际得到 "${v}"`;
  },
  bool: v => (v === 'true' || v === 'false' ? null : `必须是 "true" 或 "false"，实际得到 "${v}"`),
  oneOf: list => v => (list.includes(v) ? null : `必须是 ${list.join(' / ')} 之一，实际得到 "${v}"`),
  notInsecure: v => (INSECURE_SECRETS.includes(v) ? '检测到已知的不安全默认值，必须替换为强随机值' : null)
};

/**
 * 配置 schema
 *
 * required 取值：
 *   true          —— 缺失即 error
 *   'production'  —— 仅当 NODE_ENV=production 时缺失才算 error（本地/测试可省）
 *   false/省略     —— 不要求存在，但一旦存在就要通过 validate
 *
 * @type {Array<{key: string, group: string, required?: boolean|string, fallback?: string, desc: string, validate?: Function}>}
 */
const SCHEMA = [
  // ── 运行环境 ──
  {
    key: 'NODE_ENV',
    group: 'runtime',
    fallback: 'development',
    desc: '运行环境',
    validate: validators.oneOf(NODE_ENVS)
  },
  { key: 'PORT', group: 'runtime', fallback: '3000', desc: 'HTTP 监听端口', validate: validators.port },

  // ── 数据库 ──
  // 这三项在 framework/db/index.js 里已是硬性要求（缺失即 process.exit），此处一并声明，
  // 让"生产必须配什么"能在一处看全。
  { key: 'DB_HOST', group: 'database', required: true, desc: 'MySQL 主机' },
  { key: 'DB_NAME', group: 'database', required: true, desc: 'MySQL 库名' },
  { key: 'DB_USER', group: 'database', required: true, desc: 'MySQL 用户名' },
  { key: 'DB_PORT', group: 'database', fallback: '3306', desc: 'MySQL 端口', validate: validators.port },
  {
    key: 'DB_POOL_MAX',
    group: 'database',
    fallback: '10',
    desc: '每实例连接池上限（注意：容量 = 本值 × 实例数，需 ≤ MySQL max_connections）',
    validate: validators.positiveInt
  },
  {
    key: 'DB_POOL_MIN',
    group: 'database',
    fallback: '2',
    desc: '每实例连接池下限',
    validate: validators.positiveInt
  },
  {
    key: 'DB_POOL_ACQUIRE',
    group: 'database',
    fallback: '30000',
    desc: '等待连接的超时（毫秒）',
    validate: validators.nonNegativeInt
  },
  {
    key: 'DB_POOL_IDLE',
    group: 'database',
    fallback: '10000',
    desc: '空闲连接回收时间（毫秒）',
    validate: validators.nonNegativeInt
  },

  // ── Redis（可降级：关闭时走进程内实现）──
  {
    key: 'REDIS_ENABLED',
    group: 'redis',
    fallback: 'false',
    desc: '是否启用 Redis（false 时自动降级为进程内实现，属合法模式）',
    validate: validators.bool
  },
  { key: 'REDIS_PORT', group: 'redis', fallback: '6379', desc: 'Redis 端口', validate: validators.port },
  { key: 'REDIS_DB', group: 'redis', fallback: '0', desc: 'Redis 库号', validate: validators.nonNegativeInt },

  // ── 安全密钥 ──
  {
    key: 'APP_SECRET',
    group: 'security',
    required: 'production',
    minLength: MIN_SECRET_LENGTH,
    validate: validators.notInsecure,
    desc: '应用签名密钥'
  },
  {
    key: 'SESSION_SECRET',
    group: 'security',
    required: 'production',
    minLength: MIN_SECRET_LENGTH,
    validate: validators.notInsecure,
    desc: '会话 cookie 签名密钥'
  },
  {
    key: 'FIREWALL_SECRET',
    group: 'security',
    required: 'production',
    minLength: MIN_SECRET_LENGTH,
    validate: validators.notInsecure,
    desc: '防火墙签名密钥'
  },

  // ── 日志 ──
  {
    key: 'LOG_LEVEL',
    group: 'logging',
    fallback: 'info',
    desc: '日志级别',
    validate: validators.oneOf(LOG_LEVELS)
  },

  // ── 超时（毫秒）──
  {
    key: 'HTTP_KEEP_ALIVE_TIMEOUT_MS',
    group: 'timeout',
    fallback: '72000',
    desc: 'HTTP keep-alive 超时（应大于上游反代的 keepalive，否则会出现间歇 502）',
    validate: validators.nonNegativeInt
  },
  {
    key: 'HTTP_REQUEST_TIMEOUT_MS',
    group: 'timeout',
    fallback: '300000',
    desc: '单请求（含请求体）总时长上限',
    validate: validators.nonNegativeInt
  },
  {
    key: 'WS_SHUTDOWN_GRACE_MS',
    group: 'timeout',
    fallback: '(内置默认)',
    desc: 'WebSocket 停机宽限期',
    validate: validators.nonNegativeInt
  },
  {
    key: 'GUARD_CONFIG_SYNC_MS',
    group: 'timeout',
    fallback: '30000',
    desc: '守卫配置跨实例同步间隔（0 = 关闭）',
    validate: validators.nonNegativeInt
  }
];

/**
 * 校验单个条目
 *
 * 返回的问题带 `kind`：
 *   'missing' —— 该项没配（是否需要致命取决于环境与 required）
 *   'invalid' —— 配了但值不对（**任何时候都算错误**：值已在环境里，
 *               却会让下游拿到 NaN / 越界值，属于明确的配置错误）
 *
 * @param {object} item - schema 条目
 * @param {object} env - 环境变量来源
 * @returns {{kind: string, level?: string, key: string, message: string}|null} 问题描述，通过时为 null
 */
function _checkItem(item, env) {
  const raw = env[item.key];
  const present = raw !== undefined && raw !== '';

  if (!present) {
    if (item.required) {
      return {
        kind: 'missing',
        key: item.key,
        message: item.required === 'production' ? `生产环境必须配置（${item.desc}）` : `缺少必需项（${item.desc}）`
      };
    }
    return null; // 非必需且未设置 → 走 fallback，无需报告
  }

  // 具体规则优先于通用规则：命中已知弱值时给出的提示更可操作
  // （"这是教程里的默认值"比"长度不足"更能指明该怎么改）
  if (item.validate) {
    const reason = item.validate(raw);
    if (reason) return { kind: 'invalid', key: item.key, message: `${reason}（${item.desc}）` };
  }

  // 长度下限（密钥强度）
  if (item.minLength && String(raw).length < item.minLength) {
    return {
      kind: 'invalid',
      key: item.key,
      message: `长度不足 ${item.minLength} 位（${item.desc}），请使用强随机值`
    };
  }

  return null;
}

/**
 * 跨字段关系校验
 *
 * 这是散落各处的单项检查做不到的部分：每个值单独看都合法，但组合起来是错的。
 *
 * @param {object} env - 环境变量来源
 * @returns {Array<{kind: string, key: string, message: string}>} 问题列表
 */
function _checkRelations(env) {
  const problems = [];

  // ① 启用 Redis 就必须给出主机。否则连接会失败并**静默降级**为进程内实现，
  //    而"以为在用 Redis、其实在本地 Map"是最容易被误判成"正常"的状态：
  //    多实例下限流阈值、会话一致性都会跟着变形，却没有任何报错。
  if (env.REDIS_ENABLED === 'true' && !env.REDIS_HOST) {
    problems.push({
      kind: 'invalid',
      key: 'REDIS_HOST',
      message: 'REDIS_ENABLED=true 时必须配置 REDIS_HOST，否则会静默降级为进程内实现'
    });
  }

  // ② 池下限不得大于上限，否则 Sequelize 行为未定义
  const min = Number(env.DB_POOL_MIN);
  const max = Number(env.DB_POOL_MAX);
  const minEff = Number.isInteger(min) ? min : 2;
  const maxEff = Number.isInteger(max) ? max : 10;
  if (minEff > maxEff) {
    problems.push({
      kind: 'invalid',
      key: 'DB_POOL_MIN',
      message: `DB_POOL_MIN(${minEff}) 不能大于 DB_POOL_MAX(${maxEff})`
    });
  }

  return problems;
}

/**
 * 计算连接池容量提示（供调用方展示，不参与判定）
 *
 * 扩容时最容易踩的隐性天花板：MySQL 默认 max_connections = 151，
 * 而连接池是**每实例**的，集群总需求 = DB_POOL_MAX × 实例数。
 *
 * @param {object} env - 环境变量来源
 * @returns {string} 可读提示
 */
function describePoolCapacity(env) {
  const max = Number(env.DB_POOL_MAX);
  const effective = Number.isInteger(max) && max > 0 ? max : 10;
  return (
    `每实例连接池上限 ${effective}；` +
    `集群总需求 = ${effective} × 实例数，必须小于 MySQL max_connections（默认 151）。` +
    `例：4 个实例 → 4 × ${effective} = ${effective * 4}`
  );
}

/**
 * 校验环境变量
 *
 * 纯函数：不读 process.env、不打印、不退出 —— 由调用方决定如何处置。
 *
 * 严重性判定分两类：
 *   · **配错**（值存在但不合法）→ 始终是 error。值已经进了环境，下游会拿到 NaN / 越界值。
 *   · **缺失**（尤其是生产必需的密钥、DB 三件套）→ 生产环境是 error；本地/测试降级为
 *     warning，否则开发与单测会被自己的校验拦住（`framework/db/index.js` 也是这个口径）。
 *
 * @param {object} [env=process.env] - 环境变量来源
 * @param {object} [options]
 * @param {boolean} [options.isProduction] - 是否生产环境（缺省按 env.NODE_ENV 推断）
 * @returns {{ok: boolean, errors: Array, warnings: Array, notes: Array}} 校验结果
 */
function validateEnv(env = process.env, options = {}) {
  const isProduction = options.isProduction ?? env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  for (const item of SCHEMA) {
    const problem = _checkItem(item, env);
    if (!problem) continue;
    const fatal = problem.kind === 'invalid' || isProduction;
    (fatal ? errors : warnings).push(problem);
  }

  for (const problem of _checkRelations(env)) {
    // 跨字段问题都是"值组合错误"，任何环境都算错误
    errors.push(problem);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    notes: [describePoolCapacity(env)]
  };
}

export { validateEnv, describePoolCapacity, SCHEMA, validators, MIN_SECRET_LENGTH };
