/**
 * 数据库连接初始化
 * 创建 Sequelize 实例，校验必要环境变量，配置连接池
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import { Sequelize } from 'sequelize';
import { createLogger } from '../log/index.js';
import { C } from '../../utils/colors.js';

const log = createLogger('framework.db.index');

const { DB_TYPE, DB_USER, DB_PASS, DB_HOST, DB_PORT, DB_NAME } = process.env;

// 启动时校验必要配置
const required = { DB_HOST, DB_NAME, DB_USER };
const missing = Object.entries(required).filter(([, v]) => !v);

// 测试环境不硬退出（生产 fail-fast 行为完全不变）。
//
// 本文件是**模块级副作用**：任何 import 到它的代码都会触发这段校验。jest 会加载整个
// 模块图，而测试环境按设计不带 DB 环境变量 —— 于是每个 worker 在 100ms 后被
// `process.exit(1)` 强杀，表现为：`--runInBand` 时整个进程中途死掉（拿不到任何汇总），
// 并行时「用例总数每次都不一样」（跑到一半的 worker 连同它剩下的用例一起消失，
// 而汇总里仍然是 0 失败 —— 一个会伪装的绿色）。同一条 import 链上的
// `jest.spyOn` 桩也救不了它，因为退出发生在模块求值阶段。
const isTestEnv = Boolean(process.env.JEST_WORKER_ID) || process.env.NODE_ENV === 'test';
if (missing.length > 0 && !isTestEnv) {
  // always.error：不受 LOG_LEVEL 门控，防止误配 LOG_LEVEL=fatal 时静默退出无任何提示
  log.always.error(`❌ [DB] ${C.red}缺少必要环境变量: ${missing.map(([k]) => k).join(', ')}${C.reset}`);
  // 延迟退出，确保错误日志刷新
  setTimeout(() => process.exit(1), 100);
} else if (missing.length > 0) {
  log.warn(`⚠️ [DB] 测试环境缺少 DB 配置（${missing.map(([k]) => k).join(', ')}），不退出进程`);
}

const dsn = `${DB_TYPE || 'mysql'}://${DB_USER}:${encodeURIComponent(DB_PASS || '')}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}`;

const sequelize = new Sequelize(dsn, {
  logging: false,
  define: {
    timestamps: true,
    underscored: true
  },
  dialectOptions: {
    connectTimeout: 10000
  },
  pool: {
    // ⚠️ 容量天花板：本池是**每实例**的。MySQL 默认 max_connections = 151，
    // 按默认 max=10 计算，约 15 个实例就会耗尽数据库连接。
    // 扩容时按此式取值：DB_POOL_MAX ≈ (MySQL_max_connections − 运维保留) ÷ 预期实例数
    // （例如 151 − 11 保留 = 140，跑 4 个实例 → 每实例 35，可设 30 留余量）
    max: parseInt(process.env.DB_POOL_MAX || '10'),
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    // acquire 是"等不到连接就放弃"的上限。注意它（默认 30s）远大于健康探针的 3s 超时 ——
    // 池枯竭时探针会先被自己的超时掐断，表现为"探针不稳定"而非"连接池耗尽"。
    // 因此池状态必须单独可观测，见 getPoolStats()。
    acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
    idle: parseInt(process.env.DB_POOL_IDLE || '10000')
  }
});

/**
 * 获取模型
 * 支持三种调用方式：
 *   getModel('User')              → 按模型名查找（flat，从 sequelize.models）
 *   getModel('user.User')         → 点号写法（命名空间 + 模型名）
 *   getModel('user', 'User')      → 双参数（命名空间 + 模型名）
 * 模型名全局唯一，命名空间仅作组织用途，最终都从 sequelize.models 查找
 *
 * @param {string} namespaceOrName - 命名空间（如 'user'）或单参数时的模型名
 * @param {string} [modelName] - 模型名（如 'User'），不传时 namespaceOrName 为模型名或点号写法
 * @returns {object} Sequelize 模型
 * @throws {TypeError} 模型不存在时
 */
function getModel(namespaceOrName, modelName) {
  let name = modelName;
  let ns = namespaceOrName;

  // 单参数点号写法：getModel('user.User')
  if (name === undefined && typeof ns === 'string' && ns.includes('.')) {
    const idx = ns.lastIndexOf('.');
    name = ns.slice(idx + 1);
    ns = ns.slice(0, idx);
  }
  // 单参数：getModel('User') → name = ns
  if (name === undefined) {
    name = ns;
  }

  const model = sequelize.models[name];
  if (!model) {
    throw new TypeError(
      `getModel: 模型 "${name}" 不存在。可用模型: ${Object.keys(sequelize.models).join(', ') || '(无)'}`
    );
  }
  return model;
}

/**
 * 读取数据库连接池的实时占用情况
 *
 * ⚠️ 字段名以 `sequelize-pool` 的**实际 API** 为准，不是直觉命名：
 *   `maxSize`（不是 `max`）、`waiting`（不是 `pending`）。
 *   实测来源：node_modules/sequelize-pool/lib/Pool.js 的 getter。
 *   按直觉写会拿到 `undefined` —— 而 `undefined` 在 JSON 里会整个键消失，
 *   表现为"指标端点是空的"却不报错。
 *
 * 为什么需要它：连接池枯竭是本系统最难排查的一类故障 ——
 * `pool.acquire` 默认等 30s，而健康探针 3s 就超时，于是探针只报"超时"，
 * 真正的原因（连接池耗尽）不出现在任何日志里。暴露这几个数字才能恢复可归因性。
 *
 * 其中 `waiting > 0` 是**饱和信号**：有请求在排队等连接。
 *
 * 防御式读取：Sequelize 启用读写分离时 `connectionManager.pool` 是另一种形状
 * （`{ read, write }` 两个子池），此处返回 null 而不是抛错或给出假的 0。
 *
 * @returns {{maxSize: number, minSize: number, size: number, available: number, using: number, waiting: number}|null}
 *          未初始化（如无 DB 的测试环境）或形态不符时返回 null
 */
function getPoolStats() {
  const pool = sequelize?.connectionManager?.pool;
  // 只有 sequelize-pool 的 Pool 实例才有数值型 size；读写分离形态是普通对象 → 判否
  if (!pool || typeof pool.size !== 'number') return null;
  return {
    maxSize: pool.maxSize,
    minSize: pool.minSize,
    size: pool.size,
    available: pool.available,
    using: pool.using,
    waiting: pool.waiting
  };
}

export { sequelize, Sequelize, getModel, getPoolStats };
export default sequelize;
