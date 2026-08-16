/**
 * 纯内存 Map 存储（单例模式）
 *
 * 不依赖 Redis，所有数据存储在进程内存中。
 * 全局共用一个 MapStore，按 prefix 自动隔离命名空间。
 * 适合验证码、扫码状态、临时缓存等非关键数据。
 *
 * 性能设计：
 * - 平行 keys 数组 + 交换删除，游标定位 O(1)
 * - 游标分批清理，每次扫 batchSize 条（默认 1000），避免阻塞事件循环
 *
 * 安全特性：
 * - maxSize 上限保护，写入前检查，超限时拒绝（不丢数据）
 * - TTL 自动过期，Symbol 隔离内部属性（kExpires, kIdx）
 * - 所有参数校验，无效参数直接 throw TypeError
 * - 支持自定义 serializer/deserializer，防止外部引用污染内部数据
 *
 * key 顺序说明：
 * - keys 数组仅在无删除操作时保持插入顺序
 * - 交换删除（_deleteKey）会打乱顺序，最新元素可能出现在任意位置
 * - list() 返回的键无固定顺序，且可能包含已过期但未清理的项
 * - 不要依赖 keys 的顺序做业务逻辑（如"淘汰最旧"）
 *
 * @example
 * MapStore.set('email_code', 'user@example.com', { code: '123456' }, 600);
 * MapStore.get('email_code', 'user@example.com');
 * MapStore.has('email_code', 'user@example.com');
 * MapStore.ttl('email_code', 'user@example.com');
 * MapStore.delete('email_code', 'user@example.com');
 * MapStore.list('email_code', 10, 0);
 * MapStore.count('email_code');
 * MapStore.clear();
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

const kExpires = Symbol('expires');
const kIdx = Symbol('idx');

/** 内部存储：prefix → { store, keys, timer, config } */
const _stores = new Map();

/** 默认配置 */
const DEFAULTS = {
  maxSize: 10000,
  ttl: 0,
  cleanupInterval: 3600_000,
  batchSize: 1000, // set() 触发清理时，每次扫多少条
  timerBatchSize: 10000, // 兜底定时器清理时，每次扫多少条
  ttlJitter: 0, // TTL 随机抖动范围（秒），防缓存雪崩
  clone: false, // 是否深拷贝 value（JSON 往返），防止外部修改影响 store 内部数据
  serializer: null, // (value) => any，clone=true 时自动设为 JSON.stringify
  deserializer: null // (any) => value，clone=true 时自动设为 JSON.parse
};

/**
 * 获取或创建 prefix 对应的内部存储
 */
function _ensure(prefix) {
  let entry = _stores.get(prefix);
  if (entry) return entry;

  const config = { ...DEFAULTS };
  const store = new Map();
  const keys = [];

  entry = { store, keys, timer: null, config, _cursor: 0, _cleaning: false, _destroyed: false };
  _stores.set(prefix, entry);

  // 定时器：兜底清理，异步清理进行中时跳过，避免干扰游标
  entry.timer =
    config.cleanupInterval > 0
      ? setInterval(() => {
          if (entry._cleaning) return;
          _sweepExpired(entry, config.timerBatchSize);
        }, config.cleanupInterval)
      : null;
  if (entry.timer) entry.timer.unref();

  return entry;
}

/**
 * 交换删除：将指定 key 从 keys 数组移除（O(1)）
 * 把末尾元素移到被删位置，保持数组紧凑
 */
function _deleteKey(entry, key) {
  const data = entry.store.get(key);
  if (!data) return;

  const idx = data[kIdx];
  if (idx === undefined) return;

  // 处理 keys 数组的移除逻辑
  // 不断检查末尾元素，直到成功执行交换或直接弹出目标元素
  while (entry.keys.length > 0) {
    const lastKey = entry.keys[entry.keys.length - 1];

    // 场景 A：如果末尾元素刚好就是要删除的元素，直接 pop 就完成了，无需交换
    if (lastKey === key) {
      entry.keys.pop();
      break;
    }

    const lastKeyData = entry.store.get(lastKey);

    // 场景 B：末尾元素有效，执行标准的交换删除
    if (lastKeyData) {
      entry.keys[idx] = lastKey; // 把末尾元素的 key 填入当前要删除的空缺位置
      lastKeyData[kIdx] = idx; // 更新被交换元素的索引元数据
      entry.keys.pop(); // 弹出已经交换完的末尾位置
      break;
    }
    // 场景 C：数据不一致，末尾是一个僵尸 key（在 keys 中但 store 中没有）
    else {
      console.warn(`[MapStore] 发现并清理尾部僵尸 key: "${lastKey}"`);
      entry.keys.pop(); // 直接丢弃僵尸元素
      // 循环继续，下一次会拿到倒数第二个元素作为新的 lastKey 进行判断
    }
  }

  // 最后清理 Map 中的数据
  entry.store.delete(key);
}

/**
 * 获取 entry 中指定 key 的原始数据，已过期则删除并返回 null
 */
function _getData(entry, key) {
  const data = entry.store.get(key);
  if (!data) return null;
  if (data[kExpires] && data[kExpires] < Date.now()) {
    _deleteKey(entry, key);
    return null;
  }
  return data;
}

/**
 * 游标扫描：从当前游标开始扫 batchSize 条，清理过期条目
 * 不限流，随时可调用，与定时器共享游标
 * 边扫描边删除，删除后回退索引，确保交换进来的新元素也被检查
 * 使用 scanned 计数确保每次至少扫描 batchSize 个元素（或到数组末尾）
 * @param {object} entry - 存储条目
 * @param {number} [batchSize=1000] - 本次扫描条数
 */
function _sweepExpired(entry, batchSize = 1000) {
  const { keys } = entry;
  if (keys.length === 0) return;
  const now = Date.now();
  let i = Math.min(entry._cursor, keys.length - 1);
  let scanned = 0;
  while (scanned < batchSize && i < keys.length) {
    const val = entry.store.get(keys[i]);
    if (val && val[kExpires] && val[kExpires] < now) {
      _deleteKey(entry, keys[i]);
      // 删除后，末尾元素被换到当前位置，不回退 i，继续检查新移过来的元素
    } else {
      i++;
    }
    scanned++;
  }
  entry._cursor = i >= keys.length ? 0 : i;
}

/**
 * 启动异步后台清理（若未在清理中）
 * 使用 setImmediate 让出当前事件循环，不阻塞正在进行的 set 请求
 */
function _scheduleCleanup(entry) {
  if (entry._cleaning || entry._destroyed) return;
  entry._cleaning = true;
  setImmediate(() => _asyncCleanup(entry));
}

/**
 * 异步分批清理，每次清理一批后让出事件循环
 * 无需外界手动调用，由 _rejectIfFull 在拒绝写入时自动触发
 */
function _asyncCleanup(entry) {
  const { store, config } = entry;
  const startCursor = entry._cursor;
  let scanned = 0;
  const MAX_SCAN = Math.min(config.maxSize * 2, config.timerBatchSize * 3);

  function step() {
    // 已销毁或空间已足够
    if (entry._destroyed || store.size <= config.maxSize) {
      entry._cleaning = false;
      return;
    }

    // 游标回到起点说明扫完一整圈
    if (entry._cursor === startCursor && scanned > 0) {
      entry._cleaning = false;
      return;
    }

    // 达到扫描上限
    if (scanned >= MAX_SCAN) {
      entry._cleaning = false;
      return;
    }

    const beforeLen = entry.keys.length;
    _sweepExpired(entry, config.batchSize);
    scanned += Math.min(config.batchSize, beforeLen);

    // 继续下一批，让出事件循环
    setImmediate(step);
  }

  step();
}

/**
 * 超出上限时拒绝写入（写入前检查）
 * 只执行一轮同步清理，避免阻塞当前请求。
 * 如果仍然超限，启动异步后台清理并立即抛出错误。
 */
function _rejectIfFull(entry) {
  const { store, config } = entry;
  if (store.size < config.maxSize) return;

  // 只执行一轮同步清理（最多 batchSize 条）
  _sweepExpired(entry, config.batchSize);

  if (store.size >= config.maxSize) {
    // 启动后台异步清理，不阻塞当前请求
    _scheduleCleanup(entry);
    throw new TypeError(`MapStore[${store.size}]: 已达上限 ${config.maxSize}，拒绝写入`);
  }
}

/** 参数校验 */
function _checkArg(name, value, type = 'string') {
  if (type === 'string' && (value === undefined || value === null || typeof value !== 'string')) {
    throw new TypeError(`MapStore: ${name} 必须是字符串`);
  }
  if (
    type === 'number' &&
    value !== undefined &&
    value !== null &&
    (typeof value !== 'number' || value < 0 || isNaN(value))
  ) {
    throw new TypeError(`MapStore: ${name} 必须是正数`);
  }
}

function _checkConfigOptions(options) {
  if (options.maxSize !== undefined) _checkArg('maxSize', options.maxSize, 'number');
  if (options.ttl !== undefined) _checkArg('ttl', options.ttl, 'number');
  if (options.cleanupInterval !== undefined) _checkArg('cleanupInterval', options.cleanupInterval, 'number');
  if (options.batchSize !== undefined) _checkArg('batchSize', options.batchSize, 'number');
  if (options.timerBatchSize !== undefined) _checkArg('timerBatchSize', options.timerBatchSize, 'number');
  if (options.ttlJitter !== undefined) _checkArg('ttlJitter', options.ttlJitter, 'number');
  if (options.serializer !== undefined && options.serializer !== null && typeof options.serializer !== 'function') {
    throw new TypeError('MapStore: serializer 必须是函数或 null');
  }
  if (
    options.deserializer !== undefined &&
    options.deserializer !== null &&
    typeof options.deserializer !== 'function'
  ) {
    throw new TypeError('MapStore: deserializer 必须是函数或 null');
  }
  if (options.clone !== undefined && typeof options.clone !== 'boolean') {
    throw new TypeError('MapStore: clone 必须是布尔值');
  }
}

const MapStore = {
  /**
   * 读取数据
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @returns {any|null} 值，不存在或已过期返回 null
   * @throws {TypeError} 参数无效时
   */
  get(prefix, key) {
    _checkArg('prefix', prefix);
    _checkArg('key', key);
    const entry = _stores.get(prefix);
    if (!entry) return null;
    const data = _getData(entry, key);
    if (!data) return null;
    return entry.config.deserializer ? entry.config.deserializer(data.value) : data.value;
  },

  /**
   * 判断 key 是否存在且未过期
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @returns {boolean}
   * @throws {TypeError} 参数无效时
   */
  has(prefix, key) {
    _checkArg('prefix', prefix);
    _checkArg('key', key);
    const entry = _stores.get(prefix);
    if (!entry) return false;
    return !!_getData(entry, key);
  },

  /**
   * 获取剩余过期时间（兼容 Redis TTL 语义）
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @returns {number} 剩余秒数，-1 无过期，-2 不存在
   * @throws {TypeError} 参数无效时
   */
  ttl(prefix, key) {
    _checkArg('prefix', prefix);
    _checkArg('key', key);
    const entry = _stores.get(prefix);
    if (!entry) return -2;
    const data = _getData(entry, key);
    if (!data) return -2;
    if (!data[kExpires]) return -1;
    return Math.ceil((data[kExpires] - Date.now()) / 1000);
  },

  /**
   * 修改已存在 key 的过期时间
   * 若 key 已过期，会先删除旧数据再重新写入（确保索引正确）
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {number} ttl - 过期时间（秒）
   * @throws {TypeError} 参数无效或 key 不存在时
   */
  expire(prefix, key, ttl) {
    _checkArg('prefix', prefix);
    _checkArg('key', key);
    _checkArg('ttl', ttl, 'number');
    const entry = _stores.get(prefix);
    if (!entry) throw new TypeError(`MapStore: key 不存在 ${prefix}:${key}`);
    const data = entry.store.get(key);
    if (!data) throw new TypeError(`MapStore: key 不存在 ${prefix}:${key}`);
    // 若 key 已过期，删除后重新写入，确保索引正确并避免与后台清理冲突
    if (data[kExpires] && data[kExpires] < Date.now()) {
      const rawValue = entry.config.deserializer ? entry.config.deserializer(data.value) : data.value;
      _deleteKey(entry, key);
      MapStore.set(prefix, key, rawValue, ttl);
      return;
    }
    data[kExpires] = ttl > 0 ? Date.now() + ttl * 1000 : 0;
  },

  /**
   * 写入数据
   * 新 key 写入前检查上限，避免 store 超限增长
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @param {any} value - 值
   * @param {number} [ttl] - 过期时间（秒），不传使用默认 TTL
   * @throws {TypeError} 参数无效或已达上限时
   */
  set(prefix, key, value, ttl) {
    _checkArg('prefix', prefix);
    _checkArg('key', key);
    if (value === undefined) throw new TypeError('MapStore: value 不能为 undefined');
    _checkArg('ttl', ttl, 'number');
    const entry = _ensure(prefix);
    const baseTtl = ttl ?? entry.config.ttl;
    const jitter = entry.config.ttlJitter || 0;
    const finalTtl = jitter > 0 && baseTtl > 0 ? baseTtl + Math.floor(Math.random() * (jitter + 1)) : baseTtl;
    const expiresIn = finalTtl * 1000;

    // 更新已有 key 不增加条目数，无需检查上限
    if (entry.store.has(key)) {
      _deleteKey(entry, key);
    } else {
      _rejectIfFull(entry);
    }

    const idx = entry.keys.length;
    const storedValue = entry.config.serializer ? entry.config.serializer(value) : value;
    entry.store.set(key, { value: storedValue, [kExpires]: expiresIn > 0 ? Date.now() + expiresIn : 0, [kIdx]: idx });
    entry.keys.push(key);
  },

  /**
   * 删除数据
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @throws {TypeError} 参数无效时
   */
  delete(prefix, key) {
    _checkArg('prefix', prefix);
    _checkArg('key', key);
    const entry = _stores.get(prefix);
    if (entry) _deleteKey(entry, key);
  },

  /**
   * 原子读取并删除（一次性消费）
   * 获取值后立即删除，模拟 Redis GETDEL 语义
   * @param {string} prefix - 命名空间
   * @param {string} key - 键
   * @returns {any|null} 值，不存在或已过期返回 null
   * @throws {TypeError} 参数无效时
   */
  getDel(prefix, key) {
    _checkArg('prefix', prefix);
    _checkArg('key', key);
    const entry = _stores.get(prefix);
    if (!entry) return null;
    const data = _getData(entry, key);
    if (!data) return null;
    _deleteKey(entry, key);
    return entry.config.deserializer ? entry.config.deserializer(data.value) : data.value;
  },

  /**
   * 批量读取
   * @param {string} prefix - 命名空间
   * @param {string[]} keys - 键数组
   * @returns {Array<any|null>} 值数组，不存在或已过期返回 null
   * @throws {TypeError} 参数无效时
   */
  mget(prefix, keys) {
    _checkArg('prefix', prefix);
    if (!Array.isArray(keys)) throw new TypeError('MapStore: keys 必须是数组');
    return keys.map(k => this.get(prefix, k));
  },

  /**
   * 批量写入
   * @param {string} prefix - 命名空间
   * @param {Array<[string, any]>} entries - [key, value] 数组
   * @param {number} [ttl] - 过期时间（秒），不传使用默认 TTL
   * @throws {TypeError} 参数无效或已达上限时
   */
  mset(prefix, entries, ttl) {
    _checkArg('prefix', prefix);
    if (!Array.isArray(entries)) throw new TypeError('MapStore: entries 必须是数组');
    _checkArg('ttl', ttl, 'number');
    // 先校验所有条目的格式，不通过就不写入
    for (const item of entries) {
      if (!Array.isArray(item) || item.length < 2) {
        throw new TypeError('MapStore: entries 每项必须是 [key, value] 数组');
      }
    }
    // 预检空间：统计需要新增的 key 数
    const entry = _ensure(prefix);
    let newKeys = 0;
    for (const item of entries) {
      if (!entry.store.has(item[0])) newKeys++;
    }
    if (entry.store.size + newKeys > entry.config.maxSize) {
      // 尝试一轮同步清理释放空间
      _sweepExpired(entry, entry.config.batchSize);
      const available = entry.config.maxSize - entry.store.size;
      if (newKeys > available) {
        throw new TypeError(
          `MapStore[${prefix}]: mset 需要 ${newKeys} 个新位置，当前仅剩 ${Math.max(0, available)} 个`
        );
      }
    }
    for (const item of entries) {
      this.set(prefix, item[0], item[1], ttl);
    }
  },

  /**
   * 列出指定命名空间下的键（支持分页）
   * 注意：返回的键无固定顺序，且可能包含已过期但未及时清理的项，使用前建议通过 get 确认
   * @param {string} prefix - 命名空间
   * @param {number} [limit=-1] - 返回条数，-1 返回全部
   * @param {number} [offset=0] - 跳过条数
   * @returns {string[]} 键列表
   * @throws {TypeError} 参数无效时
   */
  list(prefix, limit = -1, offset = 0) {
    _checkArg('prefix', prefix);
    _checkArg('offset', offset, 'number');
    const entry = _stores.get(prefix);
    if (!entry) return [];
    const end = limit < 0 ? entry.keys.length : Math.min(offset + limit, entry.keys.length);
    return entry.keys.slice(offset, end);
  },

  /**
   * 列出有效（未过期）的键，同时清理过期 key
   * 遍历检查，O(n) 开销，适合运维排查
   * 倒序遍历避免交换删除导致迭代跳过
   * @param {string} prefix - 命名空间
   * @param {number} [limit=-1] - 返回条数，-1 返回全部
   * @param {number} [offset=0] - 跳过条数
   * @returns {string[]} 有效键列表
   * @throws {TypeError} 参数无效时
   */
  listValid(prefix, limit = -1, offset = 0) {
    _checkArg('prefix', prefix);
    _checkArg('offset', offset, 'number');
    const entry = _stores.get(prefix);
    if (!entry || entry.keys.length === 0) return [];
    const result = [];
    for (let i = entry.keys.length - 1; i >= 0; i--) {
      const key = entry.keys[i];
      if (_getData(entry, key)) result.push(key);
    }
    // 分页：先反转回正序，再 slice
    const ordered = result.reverse();
    const end = limit < 0 ? ordered.length : Math.min(offset + limit, ordered.length);
    return ordered.slice(offset, end);
  },

  /**
   * 遍历条目，clean=true 时自动清理过期 key
   * 回调参数与原生 Map.prototype.forEach 一致：(value, key, map)
   * @param {string} prefix - 命名空间
   * @param {function} callbackFn - (value, key, map) => void
   * @param {*} [thisArg] - 回调中的 this 指向
   * @param {boolean} [clean=false] - 是否清理过期 key
   * @throws {TypeError} 参数无效时
   */
  forEach(prefix, callbackFn, thisArg, clean = false) {
    _checkArg('prefix', prefix);
    if (typeof callbackFn !== 'function') {
      throw new TypeError('MapStore: callbackFn 必须是函数');
    }
    const entry = _stores.get(prefix);
    if (!entry) return;
    const deser = entry.config.deserializer;
    if (clean) {
      entry.store.forEach((v, k) => {
        if (v[kExpires] && v[kExpires] < Date.now()) {
          _deleteKey(entry, k);
          return;
        }
        const val = deser ? deser(v.value) : v.value;
        callbackFn.call(thisArg, val, k, entry.store);
      }, thisArg);
    } else {
      entry.store.forEach((v, k) => {
        const val = deser ? deser(v.value) : v.value;
        callbackFn.call(thisArg, val, k, entry.store);
      }, thisArg);
    }
  },

  /**
   * 列出键，clean=true 时只返回有效（未过期）键
   * @param {string} prefix - 命名空间
   * @param {boolean} [clean=false] - 是否清理过期 key
   * @returns {string[]} 键列表
   * @throws {TypeError} 参数无效时
   */
  keys(prefix, clean = false) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    if (!entry) return [];
    if (!clean) return [...entry.keys];
    // 倒序遍历，交换删除不会影响未遍历的元素
    const result = [];
    for (let i = entry.keys.length - 1; i >= 0; i--) {
      if (_getData(entry, entry.keys[i])) result.push(entry.keys[i]);
    }
    return result.reverse();
  },

  /**
   * 列出值，clean=true 时只返回有效值
   * @param {string} prefix - 命名空间
   * @param {boolean} [clean=false] - 是否清理过期 key
   * @returns {any[]} 值列表
   * @throws {TypeError} 参数无效时
   */
  values(prefix, clean = false) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    if (!entry) return [];
    const deser = entry.config.deserializer;
    if (clean) {
      // 倒序遍历，交换删除不会影响未遍历的元素
      const result = [];
      for (let i = entry.keys.length - 1; i >= 0; i--) {
        const d = _getData(entry, entry.keys[i]);
        if (d) result.push(deser ? deser(d.value) : d.value);
      }
      return result.reverse();
    }
    return Array.from(entry.store.values(), v => (deser ? deser(v.value) : v.value));
  },

  /**
   * 列出 [key, value] 对，clean=true 时只返回有效对
   * @param {string} prefix - 命名空间
   * @param {boolean} [clean=false] - 是否清理过期 key
   * @returns {Array<[string, any]>} [key, value] 数组
   * @throws {TypeError} 参数无效时
   */
  entries(prefix, clean = false) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    if (!entry) return [];
    const deser = entry.config.deserializer;
    if (clean) {
      // 倒序遍历，交换删除不会影响未遍历的元素
      const result = [];
      for (let i = entry.keys.length - 1; i >= 0; i--) {
        const d = _getData(entry, entry.keys[i]);
        if (d) result.push([entry.keys[i], deser ? deser(d.value) : d.value]);
      }
      return result.reverse();
    }
    return Array.from(entry.store.entries(), ([k, v]) => [k, deser ? deser(v.value) : v.value]);
  },

  /**
   * 获取指定命名空间的条目数量（包含已过期但未清理的条目）
   * @param {string} prefix - 命名空间
   * @returns {number} 条目数（含过期）
   * @throws {TypeError} 参数无效时
   */
  size(prefix) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    return entry ? entry.store.size : 0;
  },

  /**
   * 获取有效（未过期）条目数量，默认清理过期 key
   * 遍历检查，O(n) 开销，适合低频监控场景
   * @param {string} prefix - 命名空间
   * @param {boolean} [skipCleanup=false] - true 时跳过清理，仅统计
   * @returns {number} 有效条目数
   * @throws {TypeError} 参数无效时
   */
  sizeValid(prefix, skipCleanup = false) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    if (!entry || entry.keys.length === 0) return 0;
    let valid = 0;
    const now = Date.now();
    for (const key of entry.keys) {
      const data = entry.store.get(key);
      if (!data) continue;
      if (data[kExpires] && data[kExpires] < now) {
        if (!skipCleanup) _deleteKey(entry, key);
        continue;
      }
      valid++;
    }
    return valid;
  },

  /**
   * 配置命名空间
   * 调小 maxSize 时尝试一轮同步清理，若仍超限则启动后台异步清理，不阻塞
   * 注意：maxSize 是硬上限，不会自动淘汰有效（未过期）数据。若调小后所有数据
   * 均有效且未过期，store 将长期超限，新写入会持续被拒绝，直到数据自然过期或
   * 手动删除。这不是 LRU 缓存，请勿依赖自动淘汰策略
   * @param {string} prefix - 命名空间
   * @param {object} [options]
   * @param {number} [options.maxSize=10000] - 最大条目数
   * @param {number} [options.ttl=0] - 默认过期时间（秒），0 永不过期
   * @param {number} [options.cleanupInterval=3600000] - 兜底清理间隔（毫秒），0 不自动清理
   * @param {number} [options.batchSize=1000] - set() 触发清理时每次扫描条数
   * @param {number} [options.timerBatchSize=10000] - 兜底定时器每次扫描条数
   * @param {function|null} [options.serializer=null] - 序列化函数 (value) => any
   * @param {function|null} [options.deserializer=null] - 反序列化函数 (any) => value
   * @param {number} [options.ttlJitter=0] - TTL 随机抖动范围（秒），防缓存雪崩
   * @param {boolean} [options.clone=false] - 是否深拷贝 value（JSON 往返），自动配置 serializer/deserializer
   * @throws {TypeError} 参数无效时
   */
  config(prefix, options = {}) {
    _checkArg('prefix', prefix);
    _checkConfigOptions(options);
    const entry = _ensure(prefix);
    const oldMaxSize = entry.config.maxSize;
    Object.assign(entry.config, options);

    // clone 开关自动配置 serializer/deserializer，确保成对出现
    if (options.clone === true) {
      entry.config.serializer = JSON.stringify;
      entry.config.deserializer = JSON.parse;
    } else if (options.clone === false) {
      entry.config.serializer = null;
      entry.config.deserializer = null;
    }

    // 调小 maxSize 时尝试一轮同步清理，超限则启动异步清理，不抛错
    if (options.maxSize !== undefined && options.maxSize < oldMaxSize) {
      _sweepExpired(entry, entry.config.batchSize);
      if (entry.store.size > entry.config.maxSize) {
        _scheduleCleanup(entry);
      }
    }

    if (options.cleanupInterval !== undefined) {
      if (entry.timer) clearInterval(entry.timer);
      entry.timer =
        options.cleanupInterval > 0
          ? setInterval(() => {
              if (entry._cleaning) return;
              _sweepExpired(entry, entry.config.timerBatchSize);
            }, options.cleanupInterval)
          : null;
      if (entry.timer) entry.timer.unref();
    }
  },

  /**
   * 获取命名空间容量使用情况
   * 采用抽样算法估算内存，避免全量 JSON.stringify 阻塞主线程
   * @param {string} prefix - 命名空间
   * @returns {{ capacity: number, used: number, free: number, percent: number, estimatedBytes: number }}
   * @throws {TypeError} 参数无效时
   */
  usage(prefix) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    const capacity = entry?.config.maxSize ?? 0;
    const used = entry?.store.size ?? 0;
    const free = Math.max(0, capacity - used);
    const percent = capacity > 0 ? Math.round((used / capacity) * 100) : 0;

    let estimatedBytes = 0;

    if (entry && used > 0) {
      // 最大抽样数量，兼顾估算精度与性能
      const SAMPLE_MAX = 100;
      let sampleCount = 0;
      let sampleBytes = 0;

      // 使用迭代器进行遍历，允许中途 break 退出
      for (const [k, v] of entry.store.entries()) {
        sampleBytes += k.length * 2; // UTF-16 key 占用

        try {
          sampleBytes += JSON.stringify(v.value)?.length * 2 || 0;
        } catch {
          sampleBytes += 1024; // 循环引用等不可序列化场景，按 1KB 估算
        }

        sampleCount++;
        if (sampleCount >= SAMPLE_MAX) break;
      }

      // 根据抽样的平均大小，放大到全局得出估算总体积
      estimatedBytes = Math.floor((sampleBytes / sampleCount) * used);
    }

    return { capacity, used, free, percent, estimatedBytes };
  },

  /**
   * 销毁指定命名空间
   * @param {string} prefix - 命名空间
   * @throws {TypeError} 参数无效时
   */
  destroy(prefix) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    if (entry) {
      entry._destroyed = true;
      entry._cleaning = false;
      if (entry.timer) clearInterval(entry.timer);
      entry.store.clear();
      entry.keys.length = 0;
      _stores.delete(prefix);
    }
  },

  /**
   * 清空指定命名空间的数据（保留配置和定时器）
   */
  clear(prefix) {
    _checkArg('prefix', prefix);
    const entry = _stores.get(prefix);
    if (entry) {
      entry.store.clear();
      entry.keys.length = 0;
      entry._cursor = 0;
      entry._cleaning = false;
    }
  }
};

/**
 * 创建 MapStore 模式的 store 对象
 */
function getMapStore(prefix) {
  if (prefix === undefined || prefix === '') {
    prefix = 'default';
  }

  return {
    get: async key => MapStore.get(prefix, key),
    set: async (key, value, ttl) => {
      MapStore.set(prefix, key, value, ttl);
    },
    delete: async key => {
      MapStore.delete(prefix, key);
    },
    has: async key => MapStore.has(prefix, key),
    ttl: async key => MapStore.ttl(prefix, key),
    expire: async (key, ttl) => {
      MapStore.expire(prefix, key, ttl);
    },
    getDel: async key => MapStore.getDel(prefix, key),
    mget: async keys => MapStore.mget(prefix, keys),
    mset: async (entries, ttl) => {
      MapStore.mset(prefix, entries, ttl);
    },
    list: async (limit = 100, offset = 0) => MapStore.list(prefix, limit, offset),
    listValid: async (limit = -1, offset = 0) => MapStore.listValid(prefix, limit, offset),
    size: async () => MapStore.size(prefix),
    sizeValid: async (skipCleanup = false) => MapStore.sizeValid(prefix, skipCleanup),
    usage: async () => MapStore.usage(prefix),
    keys: async clean => MapStore.keys(prefix, clean),
    values: async clean => MapStore.values(prefix, clean),
    entries: async clean => MapStore.entries(prefix, clean),
    forEach: async (callbackFn, thisArg, clean) => MapStore.forEach(prefix, callbackFn, thisArg, clean),
    destroy: async () => {
      MapStore.destroy(prefix);
    },
    clear: async () => {
      MapStore.clear(prefix);
    },
    config: async options => MapStore.config(prefix, options),

    // 仅 Redis 支持的操作（本身就是返回 rejected Promise）
    hset: async () => {
      throw new TypeError('getStore(MapStore): hash 操作仅支持 Redis 模式');
    },
    hget: async () => {
      throw new TypeError('getStore(MapStore): hash 操作仅支持 Redis 模式');
    },
    hgetall: async () => {
      throw new TypeError('getStore(MapStore): hash 操作仅支持 Redis 模式');
    },
    hdel: async () => {
      throw new TypeError('getStore(MapStore): hash 操作仅支持 Redis 模式');
    },
    hexists: async () => {
      throw new TypeError('getStore(MapStore): hash 操作仅支持 Redis 模式');
    },
    exists: async () => {
      throw new TypeError('getStore(MapStore): exists 操作仅支持 Redis 模式');
    },
    scan: async () => {
      throw new TypeError('getStore(MapStore): scan 操作仅支持 Redis 模式');
    },
    call: async () => {
      throw new TypeError('getStore(MapStore): 当前使用 MapStore，无 Redis 客户端');
    },
    _backend: 'map'
  };
}

export { MapStore, getMapStore };
