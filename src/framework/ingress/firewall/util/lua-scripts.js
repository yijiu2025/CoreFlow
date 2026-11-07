/**
 * 防火墙 Lua 脚本常量（纯字符串，零依赖）
 *
 * 为什么单独成文件：脚本是**不随调用上下文变化的字面量**，而访问层（`util/redis.js`）
 * 负责的是「怎么调、超时多少、失败怎么降级」。两者变化频率完全不同 —— 脚本一改就得
 * 逐字对齐 KEYS/ARGV 顺序，放在 1300 行的访问层中间时，改一次要上下翻好几屏。
 *
 * ── 本文件的硬约束（违反会被源码守卫拦住）──
 *   1. **零 import**：保持为依赖图最底层节点，任何模块都可以安全引用而不引入环。
 *   2. **零 `eval(`**：`firewall-redis-adapter.test.js` 断言 eval 只允许出现在访问层；
 *      本文件只放字符串，调用点（`client.eval(LUA_X, { keys, arguments })`）全部留在 redis.js。
 *   3. **KEYS/ARGV 编号即契约**：脚本内 `KEYS[n]` / `ARGV[n]` 的位置必须与 redis.js 里
 *      调用点的数组顺序逐位对应。改脚本参数顺序 = 必须同步改调用点，否则是**静默错值**
 *      （Lua 不会因为参数错位报错，只会读写到别的键）。
 *   4. **KEYS 必须走真实前缀**：脚本里拿到的 key 由访问层用 `full(relKey)` 补 `fw:` 前缀
 *      （`rel.*` 只给相对 key）。给 Lua 传裸相对 key 会写到 Redis 根命名空间下。
 *
 * ── Lua 返回值语义 ──
 * Redis 的 Lua 返回 `false` 到 JS 侧变成 `null`，所以「不存在」在调用点用 `=== null` 判断；
 * 数组返回值（`LUA_READ_ACCESS_STATE`）按位置解包，长度是 9，别漏项。
 *
 * @author yijiu2025
 * @since 2026-11-02（自 util/redis.js 原样抽出，逻辑未改）
 */

// ============== 访问控制状态读写 ==============

/**
 * 一次往返读取全部访问控制状态（三个维度：设备 / 指纹 / IP）。
 * KEYS: [1] 设备白名单 [2] 指纹白名单 [3] IP 白名单 [4] 设备封禁 [5] 指纹封禁 [6] IP 封禁
 * ARGV: [1] '1'/'0' 是否带指纹 [2] '1'/'0' 是否带设备 ID
 * 返回: { 设备白名单, 指纹白名单, IP白名单, 设备封禁原文, 设备PTTL, 指纹封禁原文, 指纹PTTL, IP封禁原文, IPPTTL }
 *
 * 白名单命中即短路（与旧逻辑一致：白名单优先级最高，命中后不再查封禁）。
 * 设备维度排在指纹之前：它比「IP+请求头」更精确，命中信息更能说明问题。
 */
const LUA_READ_ACCESS_STATE = `
local hasFp = ARGV[1] == '1'
local hasDev = ARGV[2] == '1'
if hasDev and redis.call('EXISTS', KEYS[1]) == 1 then
  return { 1, 0, 0, false, -2, false, -2, false, -2 }
end
if hasFp and redis.call('EXISTS', KEYS[2]) == 1 then
  return { 0, 1, 0, false, -2, false, -2, false, -2 }
end
if redis.call('EXISTS', KEYS[3]) == 1 then
  return { 0, 0, 1, false, -2, false, -2, false, -2 }
end
local devVal = false
local devTtl = -2
if hasDev then
  devVal = redis.call('GET', KEYS[4])
  if devVal then devTtl = redis.call('PTTL', KEYS[4]) end
end
local fpVal = false
local fpTtl = -2
if hasFp then
  fpVal = redis.call('GET', KEYS[5])
  if fpVal then fpTtl = redis.call('PTTL', KEYS[5]) end
end
local ipVal = redis.call('GET', KEYS[6])
local ipTtl = -2
if ipVal then ipTtl = redis.call('PTTL', KEYS[6]) end
return { 0, 0, 0, devVal or false, devTtl, fpVal or false, fpTtl, ipVal or false, ipTtl }
`;

/**
 * 写入封禁：SET 封禁键（可带 TTL）+ HSET 索引，一次往返完成，避免「键写进去了但列表查不到」。
 * KEYS: [1] 封禁键 [2] 索引 Hash
 * ARGV: [1] JSON 值 [2] TTL 秒（0 = 永久，不带 TTL）[3] Hash field
 */
const LUA_WRITE_BLOCK = `
if tonumber(ARGV[2]) > 0 then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
else
  redis.call('SET', KEYS[1], ARGV[1])
end
redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
return 1
`;

/**
 * 写入白名单：SET（带 TTL）+ HSET 索引。
 * KEYS: [1] 白名单键 [2] 索引 Hash
 * ARGV: [1] JSON 值 [2] TTL 秒 [3] Hash field
 */
const LUA_WRITE_WHITELIST = `
redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[2]))
redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
return 1
`;

/**
 * 移除访问控制条目：DEL 键 + HDEL 索引 field。
 * KEYS: [1] 键 [2] 索引 Hash
 * ARGV: [1] Hash field
 */
const LUA_REMOVE_ENTRY = `
redis.call('DEL', KEYS[1])
redis.call('HDEL', KEYS[2], ARGV[1])
return 1
`;

// ============== 计数 / 限频 ==============

/**
 * 计数 + 首次设置过期（替代旧共享 Lua）：原子，避免 incr 成功但 expire 没执行导致 key 永不过期。
 * KEYS: [1] 计数 key
 * ARGV: [1] 窗口秒
 */
const LUA_INCR_WITH_EXPIRE = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

// ============== 挑战 / 通过令牌 ==============

/**
 * 签发挑战通过令牌：按「设备 / 指纹 / IP」同时写最多三个键（一次往返）。
 * KEYS: [1] 设备键 [2] 指纹键（无该维度时传哨兵键）[3] IP 键
 * ARGV: [1] '1'/'0' 是否带设备 ID [2] '1'/'0' 是否带指纹 [3] TTL 秒
 */
const LUA_GRANT_PASS = `
if ARGV[1] == '1' then redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[3])) end
if ARGV[2] == '1' then redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3])) end
redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[3]))
return 1
`;

/**
 * 校验挑战通过令牌：三个键任一存在即通过，一次往返。
 * KEYS: [1] 设备键 [2] 指纹键（无该维度时传哨兵键）[3] IP 键
 * ARGV: [1] '1'/'0' 是否带设备 ID [2] '1'/'0' 是否带指纹
 */
const LUA_HAS_PASS = `
if ARGV[1] == '1' and redis.call('EXISTS', KEYS[1]) == 1 then return 1 end
if ARGV[2] == '1' and redis.call('EXISTS', KEYS[2]) == 1 then return 1 end
if redis.call('EXISTS', KEYS[3]) == 1 then return 1 end
return 0
`;

/**
 * 取走（读出并删除）挑战载荷：GET + DEL 必须原子，否则并发下同一 challengeId
 * 可以被重放两次 —— 「单次有效」的承诺就落空了。
 * KEYS: [1] 挑战 key
 * 返回: 载荷字符串；不存在返回 false
 */
const LUA_TAKE_CHALLENGE = `
local payload = redis.call('GET', KEYS[1])
if payload then redis.call('DEL', KEYS[1]) end
return payload
`;

export {
  LUA_READ_ACCESS_STATE,
  LUA_WRITE_BLOCK,
  LUA_WRITE_WHITELIST,
  LUA_REMOVE_ENTRY,
  LUA_INCR_WITH_EXPIRE,
  LUA_GRANT_PASS,
  LUA_HAS_PASS,
  LUA_TAKE_CHALLENGE
};
