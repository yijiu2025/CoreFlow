/**
 * 防火墙存储键命名 + 与后端无关的纯函数（零依赖）
 *
 * 为什么独立成文件：键名是**线上数据契约**（改一个前缀就等于让历史封禁失效），
 * 而 Redis 访问层里同时堆着两条路径（Redis / 内存降级）的实现，改键名时容易顺手
 * 改到别的逻辑。把命名与纯函数抽出来，访问层只负责「怎么读写」。
 *
 * 本文件**零 import、零副作用**：任何地方都可引用而不引入环。
 *
 * 约定：
 *   · 返回值都是**相对 key**（rel.*），实际 key 由 full() 补 fw: 前缀；
 *     只有需要直接给 Lua 传 KEYS 时才用 full()。
 *   · 三个身份维度平级命名：block:<ip> / block:fp:<fp> / block:dev:<dev>。
 *   · 冒号是分隔符：deviceId / username 若含 : 会让键产生歧义（既有风险）。
 *
 * @author yijiu2025
 * @since 2026-11-02（自 util/redis.js 抽出，逻辑未改）
 */
/** 命名空间：getStore 自动加 `fw:` 前缀，store.* 方法传相对 key */
const NS = 'fw';

/** 无指纹时给 KEYS 占位，保证 Lua 中 KEYS 数量恒定（避免 nil 索引） */
const KEY_SENTINEL = '_none';

/** 相对 key → 完整 Redis key（仅在需要绕过 store 前缀、直接给 Lua 传 KEYS 时使用） */
function full(relKey) {
  return `${NS}:${relKey}`;
}

/**
 * 相对 key 构造表：**全部**防火墙存储键的唯一命名来源
 *
 * 约定（改这张表之前务必读完）：
 *   1. 这里返回的都是**相对 key**，写入时由 store 自动补 `fw:` 前缀；需要直接给 Lua 传
 *      KEYS 的地方用 `full()` 补前缀（见上方各 `LUA_*` 脚本的 KEYS 说明）。
 *   2. 同一个字符串**同时**是内存降级表的 key（`mem.blocks` / `mem.flags` / `mem.windows`…），
 *      所以 Redis 与内存两条路径共用这一份命名 —— 两边不一致就是「写得进、读不出」。
 *   3. 键名是**线上数据契约**：把 `block:` 改成 `blk:` 等于让所有历史封禁立刻失效
 *      （启动同步按新前缀读不到旧数据）。只能新增键，不能重命名既有键。
 *   4. 三个身份维度平级命名：IP → `block:<ip>`、指纹 → `block:fp:<fp>`、设备 → `block:dev:<dev>`。
 *      维度选择收在 `DIMS` 表，业务层**不要自己拼字符串**。
 *   5. 冒号是维度分隔符：`deviceId` / `username` 若含 `:` 会让键产生歧义（既有风险，
 *      改上游字符集前先确认）。
 *   6. 封禁/白名单条目除自身键外还有一份 **Hash 索引**（`HASH.*`，见下），
 *      用于面板列举与启动同步 —— 只写数据键不写索引，列表就会永远是空的。
 *
 * TTL 列出的都是**默认配置值**（`framework/ingress/firewall/config/defaults.js`，可被面板/磁盘配置覆盖）。
 */
const rel = {
  // ── 封禁 ──────────────────────────────────────────────────────────────
  // 值：JSON `{status, source, permanent, createdAt, expiresAt}`
  // TTL：剩余封禁时长（秒）；`permanent: true` 时**不设 TTL**，永不过期、只能人工解封。
  // 写：setBlock() / setBlockForSubject()（同时写 Hash 索引）；读：readAccessState()（一次 Lua 读三维度+索引）。
  // status 语义：BLOCKED=直接拒；SCANNER=扫描器（403）；CHALLENGE=**不是硬封禁**，
  //   持有通过令牌则撤回挑战，否则下发挑战页（TTL 1800s，见 bot-detector.js；IP 维度的暴力破解挑战是 600s）。
  block: id => `block:${id}`, // IP 维度
  // 指纹维度：输入含 IP（换 IP 即变），只能拦"同一个连接/设备指纹在换 IP 前的行为"。
  blockFp: fp => `block:fp:${fp}`,
  // 设备维度：deviceId 由 auth 的结构化设备流程签发、与 IP 无关 —— 唯一能拦"换个 IP 重来"的维度。
  blockDevice: dev => `block:dev:${dev}`,

  // ── 白名单 ────────────────────────────────────────────────────────────
  // 值：JSON `{expiresAt}`（无永久概念）。TTL：写入时给的有效期，非法入参兜底 24h（normalizeDuration）。
  // 优先级**最高**：readAccessState 的 Lua 里白名单命中即短路，不再看封禁。
  // 同样带 `whitelisted:*` Hash 索引供面板列举。
  whitelist: id => `whitelist:${id}`,
  whitelistFp: fp => `whitelist:fp:${fp}`,
  whitelistDevice: dev => `whitelist:dev:${dev}`,

  // ── 扫描陷阱计数（404 陷阱） ───────────────────────────────────────────
  // 类型：整数计数（INCR 语义，固定窗口）。TTL：`notFoundWindow`（默认 60s）。
  // 404/403/405 累加，达到 `maxNotFoundAttempts`（默认 10）→ 封 SCANNER（`blacklistDuration` 默认 3600s）
  // 并**立刻删除本键**，避免解封后第一条 404 就再次触发。
  trap: ip => `trap:${ip}`,

  // ── 暴力破解计数 ──────────────────────────────────────────────────────
  // 类型：整数计数（固定窗口）。TTL：`bruteWindow`（默认 300s）。
  // 登录**成功**时两个键都被清空（removeCounters）。
  // bruteIp：该来源 IP 的累计失败数，达 `bruteIpLimit`（默认 10）→ 挑战该 IP（`ipBlockTime` 600s）。
  bruteIp: ip => `brute:ip:${ip}`,
  // bruteUser：该账号的累计失败数，达 `bruteLimit`（默认 5）→ 锁定账号（见下）+ 清空本键。
  bruteUser: user => `brute:user:${user}`,

  // ── 账号锁定标记 ──────────────────────────────────────────────────────
  // 类型：标记（值 `'1'`，只判存在性）。TTL：`accountLockTime`（默认 900s）。
  // ⚠️ 写入时必须**同时清空 `bruteUser` 计数**：否则计数长期处于"已超限"状态，
  // 攻击者每发一次失败请求都会重新续期，一个已知账号可被低成本永久锁死（DoS）。
  accountLock: user => `lock:${user}`,

  // ── 人机挑战「已通过」令牌 ────────────────────────────────────────────
  // 类型：标记（值 `'1'`）。TTL：`PASS_TOKEN_TTL` = 1800s，与下发的 Cookie maxAge 一致。
  // 一次挑战通过后**三个维度各写一份**，校验时 Lua 的 EXISTS 任一命中即放行 ——
  // 于是通过状态既能绑定 IP/指纹的短期会话，又能借设备维度跨 IP 生效。
  passIp: (ip, token) => `pass:${ip}:${token}`,
  passFp: (fp, token) => `pass:fp:${fp}:${token}`,
  passDevice: (dev, token) => `pass:dev:${dev}:${token}`,

  // ── 挑战载荷（服务端持有） ────────────────────────────────────────────
  // 值：JSON `{salt, difficulty, binding:{ip,fingerprint,deviceId}, issuedAt}`；
  //     TTL：`CHALLENGE_TTL_SEC` = 300s。
  // `binding` 是**不透明字段**（`framework/security/verify/pow` 只原样存取，比对策略在 challenge/service）。
  // 只下发不透明的 challengeId（页面里不含任何可直接回放的凭据）；
  // 校验时用 Lua `GET + DEL` **一次性消费** —— 并发/重放第二次必然取不到值，
  // 「一次挑战只能用一次」这条承诺就落在这里（旧实现把凭据内嵌进 HTML，脚本回填即可绕过）。
  challenge: id => `chal:${id}`,

  // ── 挑战"信誉"计数（递进难度用） ──────────────────────────────────────
  // 类型：计数器（正数，`bumpCounter` 的 INCR+EXPIRE）。TTL：`challengeReputationWindowSec`。
  // 只按 IP 维度记 —— 递进难度问的是"这台机器最近被挑战时表现如何"，
  // 换设备/换指纹正是攻击方的常见动作，捆太细反而记不住。
  //
  // ⚠️ `fail` **只统计「答案不对」**（Invalid Proof）。`Challenge Expired`（载荷过期）、
  //    `Mismatch`（切网改 IP）、`Malformed` 一律不计：那些更像客户端/网络问题，
  //    计入升难度会把真实用户越推越死（这类机制最常见的自伤方式）。
  chalFail: ip => `chal:fail:${ip}`,
  chalPass: ip => `chal:pass:${ip}`
};

/**
 * 封禁 / 白名单的**索引 Hash**（与上面的数据键一一对应，成对写入）
 *
 * 为什么需要第二份：数据键是 `block:<id>` 这种「一实体一键」，没法遍历（KEYS/SCAN 不可用于面板）。
 * 索引 Hash 用 `field = id`、`value = 元数据 JSON` 承载列举能力 —— 面板的封禁列表、启动时的
 * 名单同步都读它。故写入/删除必须**同时**动数据键与索引：LUA_WRITE_BLOCK / LUA_WRITE_WHITELIST /
 * LUA_REMOVE_ENTRY 各是一条 Lua 保证原子，业务层不要绕过它们单独 hset。
 *
 * ⚠️ 索引 field 本身**没有 TTL**：数据键过期后 field 会残留，读列表时必须按
 * `permanent / expiresAt` 过滤（见 readIndex 系列），不能假定「索引里有 = 当前生效」。
 */
const HASH = {
  blockedIps: 'blocked:ips',
  blockedFps: 'blocked:fps',
  blockedDevices: 'blocked:devices',
  whitelistedIps: 'whitelisted:ips',
  whitelistedFps: 'whitelisted:fps',
  whitelistedDevices: 'whitelisted:devices'
};

/**
 * 解析目标身份属于哪个维度（优先级：设备 > 指纹 > IP，最精确者胜）
 *
 * @param {{ip?:string, fingerprint?:string, deviceId?:string}} target 目标
 * @returns {'device'|'fingerprint'|'ip'} 维度名
 */
function dimOf(target) {
  if (target?.deviceId) return 'device';
  if (target?.fingerprint) return 'fingerprint';
  return 'ip';
}

/** 各维度「从目标对象里取标识」的取值器（DIMS 与内存表共用同一份定义，避免两处漂移） */
const ID_BY_DIM = {
  device: t => t.deviceId,
  fingerprint: t => t.fingerprint,
  ip: t => t.ip
};

export { NS, KEY_SENTINEL, full, rel, HASH, dimOf, ID_BY_DIM };
