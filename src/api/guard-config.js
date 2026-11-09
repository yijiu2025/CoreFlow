/**
 * 守卫配置存储
 * 三级守卫配置的注册/查询/持久化，使用数据库存储替代 JSON 文件
 * 启动时 register* 设置代码级默认值 → loadGuardConfig 从 DB 加载覆盖（运维优先）
 * 运行时读内存，配置变更时异步原子写入 DB
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import { C } from '../utils/colors.js';
import GuardConfigDao from '../app/guard/dao/guard-config.dao.js';
import { logAuditEvent } from '../framework/security/auth/index.js';
import { createLogger } from '../framework/support/log/index.js';
import { APP_CONFIG } from '../framework/config/app-config.js';
import { RUNTIME_FIELDS, diffNode } from '../app/guard/services/direction.js';
import { verifyRelaxation } from '../app/guard/services/signing.js';

const log = createLogger('api.guard-config');

/**
 * 核心配置存储 - 仅存放与 API 加载、权限策略相关的配置
 * 启动时 register* 构建代码级配置，随后 loadGuardConfig 用 DB 配置覆盖
 */
let configs = {};
let currentVersion = 0;
let _dbVersions = {}; // 每行独立版本号: { systemKey: version }
let _dirtySystems = new Set(); // 待保存的脏系统列表

/**
 * 从数据库加载持久化配置，覆盖内存中的代码级默认值
 * 必须在 runEngine（register* 调用完成）之后执行
 * DB 配置优先，确保运维修改不因重启丢失
 *
 * @returns {Promise<void>}
 */
async function loadGuardConfig() {
  let data;
  try {
    data = await GuardConfigDao.loadFromDB();
  } catch (err) {
    // 数据库不可用时使用代码级配置，不阻止启动
    log.warn(`⚠️ [Guard Config] ${C.yellow}数据库加载失败，使用代码级配置${C.reset}`, err);
    return;
  }

  // ── 判据：DB 里到底有没有行 ──
  // 用行数而不是 `data.version > 0`：版本是**每行独立**的，全局最大版本为 0
  // 不代表没有数据（历史数据/手工插入的行版本可能就是 0），那种情况会误走合并分支。
  const dbSystems = Object.keys(data.configs || {});

  if (dbSystems.length > 0) {
    // 合并：DB 配置覆盖代码级配置（仅覆盖运行时字段，不覆盖结构）
    mergeDbConfig(data.configs);
    currentVersion = data.version;
    _dbVersions = data.versions || {};
    log.info(`💾 [Guard Config] ${C.dim}已加载持久化策略数据（${dbSystems.length} 个系统）${C.reset}`);

    // ── 只补录"DB 里没有该系统"的行 ──
    //
    // 这里曾经是 `saveWithTimeout()`（全量），意图只是"把新增/删除的路由同步进 DB"，
    // 实际效果却是把内存整棵树覆盖回 DB：任何内存态错误（注册逻辑写错、字段默认值算错、
    // 某个调用方误改了单例）都会在每次启动时被固化一遍，而且无法察觉。
    //
    // 路由级差异**不需要**落库：
    //   · 面板读的是内存（getAllGuardConfigs），新路由立刻可见；
    //   · 重启时 mergeDbConfig 对 DB 里的已删路由只告警忽略，不会复活；
    //   · DB 行里缺的新路由，节点用代码默认值，正是期望行为。
    // 所以只处理"整行都还没有"的系统，其余交给运行期写入。
    const missing = Object.keys(configs).filter(k => !(k in data.configs));
    if (missing.length > 0) {
      // 逐个预检，把"字段类型非法的系统"隔离出去：一个注册逻辑写错的系统
      // 不应该让其他合法的新系统也落不了库（整体写入会互相牵连）。
      // 非法的那些本次不落库 —— 面板读内存仍能看到，但绝不写进 DB，
      // 修好代码后下次启动会自动补录。
      const invalid = missing.filter(k => !validateConfigs({ [k]: configs[k] }));
      const writable = missing.filter(k => !invalid.includes(k));

      if (invalid.length > 0) {
        log.error(
          `❌ [Guard Config] ${C.red}以下系统字段类型非法，本次不落库（修复后重启会自动补录）: ${invalid.join(', ')}${C.reset}`
        );
      }

      if (writable.length > 0) {
        try {
          const result = await saveWithTimeout(writable);
          currentVersion = result.maxVersion;
          log.info(
            `💾 [Guard Config] ${C.dim}已补录 ${writable.length} 个未落库的系统: ${writable.join(', ')}${C.reset}`
          );
        } catch (err) {
          // 补录失败不阻止启动：这些系统本次用代码默认值运行，下次启动会重试
          log.warn(`⚠️ [Guard Config] ${C.yellow}未落库系统的补录失败，下次启动将重试${C.reset}`, err);
        }
      }
    } else {
      log.info(`💾 [Guard Config] ${C.dim}DB 已覆盖全部 ${Object.keys(configs).length} 个系统，无需补录${C.reset}`);
    }
  } else {
    // 首次运行：DB 无数据，将代码级配置写入 DB 作为初始数据
    // 写入失败向上冒泡，让 initLoader 感知并阻止启动
    const result = await saveWithTimeout();
    currentVersion = result.maxVersion;
    log.info(
      `💾 [Guard Config] ${C.dim}已写入初始策略数据 (${Object.keys(configs).length} 个系统, version=${currentVersion})${C.reset}`
    );
  }
}

/**
 * 将 DB 配置合并到内存中，仅覆盖运行时字段，不覆盖结构定义
 * @param {object} dbConfigs - 从 DB 加载的完整配置树
 */
function mergeDbConfig(dbConfigs) {
  for (const [systemKey, dbSystem] of Object.entries(dbConfigs)) {
    if (!configs[systemKey]) {
      // 只差大小写 ⇒ DB 里是历史键（例：代码后来把 admin 改名 Admin，DB 行仍是 admin）。
      // 这不能用普通的"已删除系统"一句带过：MySQL 默认 utf8mb4_general_ci 让两个键互相遮蔽，
      // `WHERE system_key='Admin'` 会命中 admin 行 —— 读的时候键对不上（被忽略），
      // 写的时候又落回旧键，表现为"该系统的运维配置重启后失效 + 每次启动都补录一次"。
      const caseTwin = Object.keys(configs).find(k => k.toLowerCase() === systemKey.toLowerCase());
      if (caseTwin) {
        log.error(
          `❌ [Guard Config] ${C.red}DB 行 "${systemKey}" 与代码注册的 "${caseTwin}" 仅大小写不同` +
            `（ci collation 会互相遮蔽，导致该系统的持久化配置不生效）；` +
            `需把 system_key 改为 "${caseTwin}"${C.reset}`
        );
      } else {
        log.warn(`⚠️ [Guard Config] DB 中存在已删除或未注册的系统配置: ${systemKey}，已忽略`);
      }
      continue;
    }
    // 覆盖系统级运行时字段
    applyRuntimeFields(configs[systemKey], dbSystem, systemKey, getBaselineNode(systemKey));
    // 覆盖模块级运行时字段
    for (const [groupKey, dbGroup] of Object.entries(dbSystem.groups || {})) {
      if (!configs[systemKey].groups[groupKey]) {
        log.warn(`⚠️ [Guard Config] DB 中存在已删除的模块配置: ${systemKey}/${groupKey}，已忽略`);
        continue;
      }
      applyRuntimeFields(
        configs[systemKey].groups[groupKey],
        dbGroup,
        `${systemKey}/${groupKey}`,
        getBaselineNode(systemKey, groupKey)
      );
      // 覆盖 API 级运行时字段
      for (const [apiKey, dbApi] of Object.entries(dbGroup.apis || {})) {
        if (!configs[systemKey].groups[groupKey].apis[apiKey]) {
          log.warn(`⚠️ [Guard Config] DB 中存在已删除的 API 配置: ${systemKey}/${groupKey}/${apiKey}，已忽略`);
          continue;
        }
        applyRuntimeFields(
          configs[systemKey].groups[groupKey].apis[apiKey],
          dbApi,
          `${systemKey}/${groupKey}/${apiKey}`,
          getBaselineNode(systemKey, groupKey, apiKey)
        );
      }
    }
  }
}

/**
 * 代码基线：在每个节点被 register* 时记录**代码声明**的运行时字段值。
 *
 * 为什么必须单独存一份：DB 合并会原地改写内存节点，合并之后"代码原本要什么"就丢了。
 * 判断"DB 里这次改动是放宽还是收紧"必须有一个不会被改写的锚点 —— 否则
 * 「先放宽一点、再放宽一点」每次都只是相对当前值的小改动，永远绕得过认证。
 */
const _codeBaseline = {};

/** 把代码声明的运行时字段记进基线（各层注册完成时调用） */
function syncBaseline(node, metadata) {
  if (!node) return;
  node.enabled = metadata.enabled ?? true;
  node.requireLogin = metadata.requireLogin ?? false;
  node.allowIps = Array.isArray(metadata.allowIps) ? [...metadata.allowIps] : [];
  node.allowRoles = Array.isArray(metadata.allowRoles) ? [...metadata.allowRoles] : [];
}

/** 取基线的某个节点（未注册时返回 undefined，调用方按"无基线"降级） */
function getBaselineNode(systemKey, groupKey = null, apiKey = null) {
  const system = _codeBaseline[systemKey];
  if (!system) return undefined;
  if (!groupKey) return system;
  const group = system.groups?.[groupKey];
  if (!group) return undefined;
  if (!apiKey) return group;
  return group.apis?.[apiKey];
}

/**
 * 用 DB 值覆盖目标节点的运行时字段
 *
 * ── 与旧实现的关键差异 ──
 * 旧实现是无条件 `target[field] = source[field]`：DB 里写什么就是什么，
 * 一句 SQL 就能把某组的角色门槛清空。现在分两步：
 *   1. 先对照**代码基线**算方向；
 *   2. 只有"放宽"才要求签名信封（由面板在二次认证后签发），验不过就整节点跳过。
 *
 * 跳过而不是部分应用是刻意的：一个节点里若同时放宽了 allowRoles 又收紧了
 * requireLogin，部分应用会造出一个两边都不成立的中间态，比不应用更难解释。
 *
 * @param {object} target 内存节点（会被就地修改）
 * @param {object} source DB 中的节点
 * @param {string} path 用于日志与签名的路径（`system/group/apiKey`）
 * @param {object} [baselineNode] 代码基线节点
 */
function applyRuntimeFields(target, source, path, baselineNode) {
  if (!target || !source || typeof source !== 'object') return;

  // 无基线时以当前值作锚：只会在"该系统尚未被 register 过"的异常路径出现，
  // 方向判定退化为相对当前值，仍然只会多要求认证、不会少要求。
  const diff = diffNode(baselineNode || target, source);

  if (diff.direction === 'relax') {
    const verdict = verifyRelaxation(path, source);
    if (!verdict.ok) {
      log.warn(`🔒 [Guard Config] ${C.yellow}已忽略未授权的放宽配置 ${path}：${verdict.reason}${C.reset}`);
      logAuditEvent({
        type: 'PERMISSION_CHANGE',
        userId: null,
        ip: null,
        appId: 'guard',
        details: {
          action: 'relaxation_rejected',
          path,
          code: verdict.code,
          reason: verdict.reason,
          changes: diff.changes,
          timestamp: new Date().toISOString()
        }
      }).catch(() => {});
      return;
    }
  }

  for (const field of RUNTIME_FIELDS) {
    if (source[field] !== undefined) target[field] = source[field];
  }

  // 签名信封必须随节点一起留下来：saveWithTimeout 会把内存写回 DB，
  // 若这里不带上 _relaxation，下次启动时这条"已授权的放宽"会被判成未授权而失效。
  if (source._relaxation !== undefined) target._relaxation = source._relaxation;

  target.updatedAt = new Date().toISOString();
}

/** 每次写入前备份的旧版本快照，用于写入失败时回滚 */
let _previousSnapshot = null;

/**
 * 把内存状态还原到上一次写入前的快照
 *
 * 写入失败必须回滚：不回滚的话内存是新值、DB 是旧值，本实例会按"运维已改"的语义
 * 继续放行/拦截，而重启后行为又变回去 —— 这种"改完生效一阵又自己恢复"最难排查。
 *
 * 防抖路径（triggerSave）与关停路径（flushGuardConfig）共用这一份实现，
 * 避免两处各写一遍导致判据漂移。
 *
 * @returns {boolean} 是否真的回滚了（无快照时 false）
 */
function rollbackToPreviousSnapshot() {
  if (!_previousSnapshot) return false;
  configs = structuredClone(_previousSnapshot.configs);
  currentVersion = _previousSnapshot.version;
  _dbVersions = { ..._previousSnapshot.versions };
  _previousSnapshot = null;
  return true;
}

/** 运行时字段的合法类型：写库前逐个核对，非法即整次拒绝 */
const BOOLEAN_NODE_FIELDS = ['enabled', 'requireLogin', 'freshPermission'];
const STRING_ARRAY_NODE_FIELDS = ['allowIps', 'allowRoles'];

/**
 * 校验单个节点的运行时字段类型
 *
 * 为什么必须校验类型而不是"发现坏了就丢弃"：
 * 丢弃会让坏值静默变成代码默认值，DB 里存的既不是运维想要的、也不是报错提示的值；
 * 整次拒绝才能让调用方看到失败。这与 `firewall/config/persisted.js` 的
 * sanitizeSecuritySettings 取的是同一条思路（那边按 spec 表校验值域）。
 *
 * @param {object} node 待校验节点
 * @param {string} path 日志用的路径
 * @param {string[]} problems 问题收集器
 */
function validateNodeTypes(node, path, problems) {
  for (const field of BOOLEAN_NODE_FIELDS) {
    if (node[field] !== undefined && typeof node[field] !== 'boolean') {
      problems.push(`${path}.${field} 必须是布尔值（实际 ${typeof node[field]}）`);
    }
  }
  for (const field of STRING_ARRAY_NODE_FIELDS) {
    const value = node[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
      problems.push(`${path}.${field} 必须是字符串数组`);
    }
  }
}

/**
 * 验证配置树的结构与运行时字段类型
 *
 * 结构：每个系统必须有 groups，每个模块必须有 apis（可以为空对象）。
 * 类型：见 validateNodeTypes。任何一条不合法都返回 false，由调用方整次取消写入。
 *
 * @param {object} tree - 待写入的配置树（只校验这部分）
 * @returns {boolean}
 */
function validateConfigs(tree) {
  const problems = [];

  for (const [systemKey, system] of Object.entries(tree)) {
    if (!system || typeof system !== 'object') {
      problems.push(`${systemKey}: 系统配置无效`);
      continue;
    }
    if (!system.groups || typeof system.groups !== 'object') {
      problems.push(`${systemKey}: 缺少 groups`);
      continue;
    }
    validateNodeTypes(system, systemKey, problems);

    for (const [groupKey, group] of Object.entries(system.groups)) {
      if (!group || typeof group !== 'object') {
        problems.push(`${systemKey}/${groupKey}: 模块配置无效`);
        continue;
      }
      validateNodeTypes(group, `${systemKey}/${groupKey}`, problems);

      for (const [apiKey, api] of Object.entries(group.apis || {})) {
        if (!api || typeof api !== 'object') {
          problems.push(`${systemKey}/${groupKey}/${apiKey}: 接口配置无效`);
          continue;
        }
        validateNodeTypes(api, `${systemKey}/${groupKey}/${apiKey}`, problems);
      }
    }
  }

  if (problems.length > 0) {
    // 只打前 5 条：配置规模大时全量刷屏反而看不到关键的
    const shown = problems.slice(0, 5).join('；');
    const more = problems.length > 5 ? ` …共 ${problems.length} 条` : '';
    log.warn(`⚠️ [Guard Config] 配置校验失败: ${shown}${more}`);
    return false;
  }
  return true;
}

/** 异步写入超时时间（毫秒） */
const SAVE_TIMEOUT = 10000;

/**
 * 生成节点的只读快照
 *
 * 本模块是模块级单例，把内部节点直接交出去等于把全局鉴权状态交给所有调用方：
 * 任何一处 `node.enabled = false` 都会立刻改变本进程的判定，而且下一次**任意系统**
 * 的写入会把这棵树整体带进 DB（参见 loadGuardConfig 里关于全量写的教训）。
 *
 * 用浅拷贝 + 冻结而不是 structuredClone：本函数在 `preHandler` 上**每个请求**都会调，
 * 深拷贝整棵子树（含该系统全部 api）会把配置规模乘进 P99。这里只需挡住顶层字段；
 * `groups` 子对象仍是共享引用 —— 调用方只读时无差别，要改请走 setGuardConfig。
 *
 * @param {object} node 内部节点
 * @returns {Readonly<object>}
 */
function toReadonlyNode(node) {
  return Object.freeze({
    ...node,
    allowIps: Object.freeze([...(node.allowIps || [])]),
    allowRoles: Object.freeze([...(node.allowRoles || [])])
  });
}

/**
 * 获取指定层级的配置（只读快照，非内部引用）
 */
function getGuardConfig(systemKey, groupKey = null, apiKey = null) {
  const system = configs[systemKey];
  if (!system) return null;

  if (!groupKey) return toReadonlyNode(system);

  const group = system.groups ? system.groups[groupKey] : null;
  if (!group) return null;

  if (!apiKey) return toReadonlyNode(group);

  const api = group.apis ? group.apis[apiKey] : null;
  return api ? toReadonlyNode(api) : null;
}

/**
 * 热更新配置 (支持 3 层更新)
 *
 * @param {string} systemKey - 系统标识
 * @param {object} patch - 要更新的字段
 * @param {string} [groupKey=null] - 模块标识
 * @param {string} [apiKey=null] - API 标识
 * @param {object} [operator={}] - 操作者信息（用于审计日志）
 * @param {string|number} [operator.userId] - 操作者用户 ID
 * @param {string} [operator.ip] - 操作者 IP
 * @param {object} [operator.redis] - Redis 实例（可选）
 * @returns {object|null} 更新后的系统配置，失败返回 null
 */
function setGuardConfig(systemKey, patch, groupKey = null, apiKey = null, operator = {}) {
  const system = configs[systemKey];
  if (!system) return null;

  // patch 无效时直接返回，避免静默 no-op 让人困惑
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    log.warn(`⚠️ [Guard Config] setGuardConfig: patch 参数无效，systemKey=${systemKey}`);
    return null;
  }

  const updatePatch = { ...patch, updatedAt: new Date().toISOString() };

  // `_relaxation: null` = 清除旧签名信封。
  // 收紧操作必须用它把之前放宽留下的签名一起带走：签名覆盖的是**字段值**，
  // 若残留旧信封而字段已被收紧，下次启动验签必然失配 —— 方向是收紧时虽不校验，
  // 但节点上留着一份对不上的签名会让审计与排查非常困惑，也会在再次放宽时误导。
  const clearRelaxation = updatePatch._relaxation === null;
  if (clearRelaxation) delete updatePatch._relaxation;

  let node;
  if (apiKey && groupKey) {
    const group = system.groups?.[groupKey];
    node = group?.apis?.[apiKey] || null;
    if (!node) return null;
  } else if (groupKey) {
    node = system.groups?.[groupKey] || null;
    if (!node) return null;
  } else {
    node = system;
  }

  Object.assign(node, updatePatch);
  if (clearRelaxation) delete node._relaxation;

  triggerSave(systemKey);

  // 审计日志：记录配置变更
  logAuditEvent({
    type: 'PERMISSION_CHANGE',
    userId: operator.userId || null,
    ip: operator.ip || null,
    appId: 'guard',
    details: {
      systemKey,
      groupKey: groupKey || null,
      apiKey: apiKey || null,
      patch: Object.keys(patch),
      timestamp: new Date().toISOString()
    }
  }).catch(() => {
    // 审计日志写入失败不影响配置更新
  });

  // 与 getGuardConfig 同一套：写路径也不交出内部引用。
  // 调用方（config.service 的上游）只把它序列化回给面板，冻结副本没有任何代价。
  return toReadonlyNode(configs[systemKey]);
}

/**
 * 带超时保护的数据库写入
 * 所有写入路径统一使用此函数，确保超时行为一致
 *
 * @param {string[]|null} [systemKeys] - 要写入的系统列表，null 表示全部写入
 * @returns {Promise<{maxVersion: number, updated: string[], versions: object}>}
 * @throws {Error} 写入超时或配置校验失败时抛出
 */
async function saveWithTimeout(systemKeys = null) {
  // 只写入指定系统，或全部写入
  const toSave = systemKeys ? Object.fromEntries(systemKeys.map(k => [k, configs[k]]).filter(([, v]) => v)) : configs;

  // 没有需要写入的系统时直接返回
  if (Object.keys(toSave).length === 0) {
    return { maxVersion: currentVersion, updated: [], versions: { ..._dbVersions } };
  }

  // 写入前校验**待写入的那部分**：结构 + 运行时字段类型。
  // 只校验 toSave 而不是全树 —— 否则某个系统的脏数据会阻断另一个系统的正常写入，
  // 一次单系统保存被无关系统拖成失败，运维完全看不出因果。
  if (!validateConfigs(toSave)) {
    throw new Error('配置结构或字段类型校验失败，已取消写入');
  }

  // 备份当前状态，用于写入失败时回滚
  _previousSnapshot = {
    configs: structuredClone(configs),
    versions: { ..._dbVersions },
    version: currentVersion
  };

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`写入超时 (>${SAVE_TIMEOUT}ms)`)), SAVE_TIMEOUT);
  });
  const result = await Promise.race([
    GuardConfigDao.saveToDB(toSave, _dbVersions).finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
  // `result.versions` **只含本次写入的系统**（DAO 只遍历传入的 toSave）。
  // 直接赋值会把其他系统的本地版本抹成 0 ⇒ 下一轮 syncGuardConfigFromDb 把它们
  // 全判成"DB 版本更大"：日志谎报"已同步其他实例的配置变更: A,B,C"，并多跑一轮深合并。
  _dbVersions = { ..._dbVersions, ...result.versions };
  return result;
}

/**
 * 异步保存配置到数据库 (防抖处理)
 * 只保存标记为脏的系统，避免全量写入
 *
 * @param {string} systemKey - 被修改的系统标识（**必传**；缺失时跳过并告警，绝不退化成全量写）
 */
let saveTimer = null;
function triggerSave(systemKey) {
  // 🔴 缺 systemKey 时**不能**退化成"全量写"：旧实现是 `size > 0 ? [...set] : null`，
  // 而 `saveWithTimeout(null)` 会把整棵树覆盖回 DB —— 那正是启动路径被移除的行为
  // （见 loadGuardConfig 里"只补录 DB 缺失系统"的注释）。将来有人忘传参数时，
  // 结果会是"改了一个系统、顺手把其他系统的运维配置一起冲掉"，且不报错。
  if (!systemKey) {
    log.warn(`⚠️ [Guard Config] ${C.yellow}triggerSave 缺少 systemKey，已跳过（避免全量覆盖 DB）${C.reset}`);
    return;
  }
  _dirtySystems.add(systemKey);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const keys = [..._dirtySystems];
    _dirtySystems.clear();
    if (keys.length === 0) return;
    try {
      // 🔴 取 `.maxVersion`（2026-11-08）：`saveWithTimeout` 返回的是
      // `{maxVersion, updated, versions}`，直接赋值会让 currentVersion 变成对象 ——
      // 之后 `Math.max(currentVersion, …)` 得到 NaN、日志打印 `[object Object]`、
      // 回滚快照里存的也是对象。
      currentVersion = (await saveWithTimeout(keys)).maxVersion;
    } catch (err) {
      // 写入失败时回滚内存状态到写入前的快照
      rollbackToPreviousSnapshot();
      log.error(`❌ [Guard Config] ${C.red}异步写入失败${C.reset}`, err);
    }
  }, 1000);
}

/**
 * 1层注册：系统级元数据 (Level 1)
 */
function registerSystemMetadata(systemKey, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    log.warn(`⚠️ [Guard Config] registerSystemMetadata: metadata 参数无效，systemKey=${systemKey}`);
    return;
  }

  if (!configs[systemKey]) {
    configs[systemKey] = { groups: {} };
  }

  Object.assign(configs[systemKey], {
    id: systemKey,
    name: metadata.alias || metadata.name || systemKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: metadata.enabled ?? true,
    requireLogin: metadata.requireLogin ?? false,
    requirePermission: metadata.requirePermission ?? null,
    allowIps: metadata.allowIps || [],
    allowRoles: metadata.allowRoles || [],
    updatedAt: new Date().toISOString()
  });

  // 记录代码基线：方向判定与验签都以它为锚（见 applyRuntimeFields）
  if (!_codeBaseline[systemKey]) _codeBaseline[systemKey] = { groups: {} };
  syncBaseline(_codeBaseline[systemKey], metadata);
}

/**
 * 2层注册：模块/文件级元数据 (Level 2)
 */
function registerGroupMetadata(systemKey, groupKey, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    log.warn(
      `⚠️ [Guard Config] registerGroupMetadata: metadata 参数无效，systemKey=${systemKey}, groupKey=${groupKey}`
    );
    return;
  }

  if (!configs[systemKey]) {
    configs[systemKey] = {
      id: systemKey,
      name: systemKey,
      enabled: true,
      groups: {}
    };
  }
  if (!configs[systemKey].groups[groupKey]) {
    configs[systemKey].groups[groupKey] = { apis: {} };
  }

  Object.assign(configs[systemKey].groups[groupKey], {
    id: groupKey,
    name: metadata.alias || metadata.name || groupKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: metadata.enabled ?? true,
    requireLogin: metadata.requireLogin ?? false,
    requirePermission: metadata.requirePermission ?? null,
    allowIps: metadata.allowIps || [],
    allowRoles: metadata.allowRoles || [],
    updatedAt: new Date().toISOString()
  });

  if (!_codeBaseline[systemKey]) _codeBaseline[systemKey] = { groups: {} };
  if (!_codeBaseline[systemKey].groups) _codeBaseline[systemKey].groups = {};
  if (!_codeBaseline[systemKey].groups[groupKey]) _codeBaseline[systemKey].groups[groupKey] = { apis: {} };
  syncBaseline(_codeBaseline[systemKey].groups[groupKey], metadata);
}

/**
 * 3层注册：API 级元数据 (Level 3)
 *
 * 注意：首次注册和后续更新的行为不对称：
 * - 首次注册：创建完整条目，包含 enabled/requireLogin 等运行时字段（使用 metadata 参数值）
 * - 后续更新：仅更新 name/url/method/requirePermission 等**代码级**字段，不覆盖运行时字段
 *   运行时字段由 DB 持久化配置控制（loadGuardConfig 时覆盖），
 *   避免代码热更新意外重置运维配置
 *
 * ⚠️ requirePermission 属于**代码级授权声明**（与 name/url/method 同类），不入 RUNTIME_FIELDS：
 * 它必须由代码决定并每次启动刷新，绝不能由 DB 覆盖 —— 否则运维改一次 DB 就能永久提权。
 * 曾因本函数遗漏该字段，导致全仓 HTTP 路由上的 requirePermission **静默失效**
 * （守卫从配置对象读，配置对象里根本没有这个键）。
 */
function registerApiMetadata(systemKey, groupKey, apiKey, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    log.warn(
      `⚠️ [Guard Config] registerApiMetadata: metadata 参数无效，systemKey=${systemKey}, groupKey=${groupKey}, apiKey=${apiKey}`
    );
    return;
  }

  if (!configs[systemKey]) {
    configs[systemKey] = {
      id: systemKey,
      name: systemKey,
      enabled: true,
      groups: {}
    };
  }
  if (!configs[systemKey].groups[groupKey]) {
    configs[systemKey].groups[groupKey] = {
      id: groupKey,
      name: groupKey,
      enabled: true,
      apis: {}
    };
  }

  const group = configs[systemKey].groups[groupKey];

  if (!group.apis[apiKey]) {
    group.apis[apiKey] = {
      id: apiKey,
      name: metadata.alias || apiKey,
      enabled: metadata.enabled ?? true,
      requireLogin: metadata.requireLogin ?? false,
      allowIps: metadata.allowIps || [],
      allowRoles: metadata.allowRoles || [],
      requirePermission: metadata.requirePermission ?? null,
      freshPermission: metadata.freshPermission === true,
      url: metadata.url,
      method: metadata.method,
      updatedAt: new Date().toISOString()
    };
  } else {
    // freshPermission 与 requirePermission 同为**代码级授权声明**（见上方注释）：
    // 每次启动由代码刷新，绝不入 RUNTIME_FIELDS —— 否则运维改一次 DB
    // 就能把敏感操作的"回源校验"关掉，等于给第 4 层留了个后门开关。
    Object.assign(group.apis[apiKey], {
      name: metadata.alias || group.apis[apiKey].name,
      url: metadata.url,
      method: metadata.method,
      requirePermission: metadata.requirePermission ?? null,
      freshPermission: metadata.freshPermission === true,
      updatedAt: new Date().toISOString()
    });
  }

  // 基线记录的是**代码声明值**，与该 API 是否首次注册无关：
  // 后续更新分支刻意不覆盖运行时字段（否则会重置运维配置），但方向判定
  // 需要的是"代码原本要什么"，两者不是同一件事，不能混用。
  if (!_codeBaseline[systemKey]) _codeBaseline[systemKey] = { groups: {} };
  if (!_codeBaseline[systemKey].groups) _codeBaseline[systemKey].groups = {};
  if (!_codeBaseline[systemKey].groups[groupKey]) _codeBaseline[systemKey].groups[groupKey] = { apis: {} };
  const baselineGroup = _codeBaseline[systemKey].groups[groupKey];
  if (!baselineGroup.apis) baselineGroup.apis = {};
  if (!baselineGroup.apis[apiKey]) baselineGroup.apis[apiKey] = {};
  syncBaseline(baselineGroup.apis[apiKey], metadata);
}

/**
 * 立即刷新待保存的配置到数据库（用于优雅关闭）
 * 清除防抖定时器并立即执行一次保存
 *
 * 只在进程退出前调用（`src/app.js` 的 onClose）。它解决的是防抖窗口丢失问题：
 * `triggerSave` 的 1s 定时器若恰好撞上 SIGTERM，那个 timer 永远不会触发，
 * 这次修改就静默丢了。onClose 是退出前唯一"in-flight 已结束且能跑异步"的时机。
 *
 * 语义是**只写脏系统**：没有脏系统就什么都不写，不做全量覆盖。
 *
 * @returns {Promise<void>}
 */
async function flushGuardConfig() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const keys = [..._dirtySystems];
  _dirtySystems.clear();

  // 没有脏系统就别走保存：`saveWithTimeout([])` 的 toSave 为空、会直接早退，
  // 一条都不写却仍然打印"配置已安全写入数据库"——那是假绿。
  if (keys.length === 0) {
    log.info(`ℹ️ [Guard Config] ${C.dim}无待写入的变更，跳过落盘${C.reset}`);
    return;
  }

  try {
    // `saveWithTimeout` 返回对象，版本号在 `maxVersion` 上
    currentVersion = (await saveWithTimeout(keys)).maxVersion;
    log.info(`✅ [Guard Config] ${C.green}配置已安全写入数据库${C.reset}（${keys.join(', ')}）`);
  } catch (err) {
    // 与防抖路径同一套回滚：否则"内存已改 / DB 未改"的不一致会带进下一次启动。
    rollbackToPreviousSnapshot();
    log.error(`❌ [Guard Config] ${C.red}优雅关闭保存失败${C.reset}`, err);
  }
}

/**
 * 获取所有配置（深拷贝，防止外部篡改内部状态）
 * 注意：返回的数据量大时注意性能，当前配置规模在 KB 级别，深拷贝可接受
 */
function getAllGuardConfigs() {
  return structuredClone(configs);
}

/**
 * 跨实例配置同步：比对 DB 版本号，把其他实例的改动拉回本实例内存
 *
 * ── 为什么必须有这个函数 ──
 * 本模块是**模块级单例**（`let configs`），运行期改配置只更新**本进程**的内存。
 * 于是多实例下会出现：运维在面板上关掉某个路由的鉴权 → 只有处理这次写请求的实例生效，
 * 其余实例直到重启都不知道。同一个请求打到 A 和 B 会得到**不同的鉴权结果** ——
 * 这是安全语义错误，不是可用性问题，因此不能只在文档里标注"单实例假定"了事。
 *
 * ── 三个必须守住的约束 ──
 * 1. **不回写 DB**：启动时那次 `saveWithTimeout()` 是为了把新增路由补进 DB；
 *    这里若也写，会与对端互相覆盖，形成写放大甚至配置震荡。
 * 2. **跳过本地未落盘的改动**（`_dirtySystems`）：本地刚改完还在防抖窗口里，
 *    此时若被 DB 的旧版本覆盖，运维的修改会"自己消失"——比不同步更难排查。
 * 3. **只在版本真的变大时合并**：避免每次轮询都做一遍 structuredClone 与深合并。
 *
 * @returns {Promise<{updated: string[]}>} 本次实际重载的系统列表
 */
async function syncGuardConfigFromDb() {
  let data;
  try {
    data = await GuardConfigDao.loadFromDB();
  } catch (err) {
    // 单次轮询失败不影响服务，也不清空现有内存配置
    log.warn(`⚠️ [Guard Config] ${C.yellow}跨实例同步读取失败，保留现有配置${C.reset}`, err);
    return { updated: [] };
  }

  const dbVersions = data.versions || {};
  const changed = [];

  for (const [systemKey, dbVersion] of Object.entries(dbVersions)) {
    if (!configs[systemKey]) continue; // DB 里有、本实例已删除的系统 → 忽略
    if (_dirtySystems.has(systemKey)) continue; // 本地有未落盘改动 → 本地优先
    const localVersion = _dbVersions[systemKey] || 0;
    if (dbVersion > localVersion) changed.push(systemKey);
  }

  if (changed.length === 0) return { updated: [] };

  // 只合并真正变化的系统，避免整棵树重算
  mergeDbConfig(Object.fromEntries(changed.map(k => [k, data.configs[k]])));
  for (const key of changed) {
    _dbVersions[key] = dbVersions[key];
  }
  currentVersion = Math.max(currentVersion, ...changed.map(k => dbVersions[k] || 0));

  return { updated: changed };
}

/** 跨实例同步的轮询间隔（毫秒）。设为 0 可关闭（单实例部署不需要）。来源：src/config/app_config.js */
const SYNC_INTERVAL_MS = (() => {
  const raw = APP_CONFIG.guard?.syncIntervalMs;
  if (raw === undefined || raw === null || raw === '') return 30_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 30_000;
})();

/** 同步定时器句柄（模块级，保证幂等启动与可停止） */
let _syncTimer = null;

/**
 * 启动跨实例配置同步轮询
 *
 * 幂等：重复调用不会产生多个定时器。
 *
 * @returns {boolean} true = 本轮已启动；false = 已关闭（间隔为 0）或已在运行
 */
function startGuardConfigSync() {
  if (_syncTimer) return false;
  if (SYNC_INTERVAL_MS === 0) {
    log.info(`ℹ️ [Guard Config] ${C.dim}跨实例同步已关闭（app_config.js 的 guard.syncIntervalMs = 0）${C.reset}`);
    return false;
  }

  _syncTimer = setInterval(() => {
    syncGuardConfigFromDb()
      .then(res => {
        if (res.updated.length > 0) {
          log.info(`🔄 [Guard Config] ${C.cyan}已同步其他实例的配置变更: ${res.updated.join(', ')}${C.reset}`);
        }
      })
      .catch(err => log.warn(`⚠️ [Guard Config] 跨实例同步异常`, err));
  }, SYNC_INTERVAL_MS);

  // 不阻塞进程退出（真正的清理在 stopGuardConfigSync / onClose 里）
  if (_syncTimer.unref) _syncTimer.unref();
  log.info(`🔁 [Guard Config] ${C.dim}跨实例同步已启动，间隔 ${SYNC_INTERVAL_MS}ms${C.reset}`);
  return true;
}

/** 停止跨实例配置同步（应用关闭时调用） */
function stopGuardConfigSync() {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}

export {
  loadGuardConfig,
  getGuardConfig,
  setGuardConfig,
  registerSystemMetadata,
  registerGroupMetadata,
  registerApiMetadata,
  flushGuardConfig,
  getAllGuardConfigs,
  syncGuardConfigFromDb,
  startGuardConfigSync,
  stopGuardConfigSync,
  // 仅供测试驱动"脏系统落盘"的边界（缺 systemKey 必须跳过而非全量写）。
  // 前缀 `__test__` 明示非公开 API —— 生产路径一律经 setGuardConfig。
  triggerSave as __test__triggerSave
};
