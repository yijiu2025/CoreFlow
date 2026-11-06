/**
 * 防火墙遥测统计汇聚（Redis 跨实例聚合）
 *
 * 从 `framework/firewall/util/redis.js` 拆出（2026-11-01 两层分离）：
 * 访问控制语义（封禁/白名单/计数/挑战/通行证）留在 framework 引擎层；
 * 面板遥测的跨实例汇聚只被 `data/store.js`（app 层）消费，随消费者留在 app。
 * 本文件经 framework 访问层取 store（app → framework 方向，合法）。
 *
 * 解决什么问题：`data/store.js` 的 totalRequests / totalBlocked / regionStats /
 * pathStats / ipStats 全是**进程内**变量。多实例部署时，管理面板的「总请求数」
 * 「Top 地域」只是处理那个请求的实例的切片 —— 数字偏小且随负载均衡漂移。
 * 这不影响可用性，但会**误导运营判断**（把攻击量下降误读成业务变好）。
 *
 * 为什么是「本地累加 + 增量刷写」而不是「每请求写 Redis」：
 * `pushRecord` 在请求热路径上。逐请求写 Redis 等于给每个请求加一次网络往返，
 * 而这个系统刚因为「热路径上的阻塞调用」吃过亏。所以累加留在内存（零额外开销），
 * 只把**增量**按既有落盘节奏批量汇入这里。
 *
 * key 布局（fw: 前缀之后）：
 *   stats:totals     hash  requests / blocked
 *   stats:region     hash  regionKey → count
 *   stats:path       hash  apiKey → count
 *   stats:pathmeta   hash  apiKey → JSON {path, apiName}
 *   stats:ip         hash  ip → count
 *   stats:records    list  JSON 记录（最新在最左）
 *
 * @author yijiu2025
 * @since 2026-11-01（自 util/redis.js 迁出，逻辑保持逐字不变）
 */
import { store, full, redisAvailable } from '../../../framework/firewall/util/redis.js';
import { summarizeChallengeFields } from '../../../framework/firewall/challenge-metrics.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.data.stats-redis');

/** 记录列表保留条数，与 data/store.js 的环形缓冲区容量保持一致 */
const STATS_RECORDS_MAX = 1000;

/** 统计相关的相对 key */
const STATS_KEY = {
  totals: 'stats:totals',
  region: 'stats:region',
  path: 'stats:path',
  pathMeta: 'stats:pathmeta',
  ip: 'stats:ip',
  records: 'stats:records',
  /**
   * 挑战链路计数器（field → count，见 framework/firewall/challenge-metrics.js）
   *
   * 单独一个 hash 而不是塞进 `stats:totals`：挑战指标是**枚举维度**（provider / reason /
   * 耗时桶 / 难度 / 页面形态），塞进 totals 会让那个 hash 变成混合语义，面板读的时候
   * 还得挑字段。
   */
  challenge: 'stats:challenge'
};

/**
 * 把一批统计增量写入 Redis（一次 MULTI 往返）
 *
 * 为什么用 MULTI 而不是逐条 await：一次刷写可能有几百个不同 IP / 路径，
 * 逐条 await 会退化成几百次往返，等于把周期刷写变成了压测。
 *
 * 注意 `store().call(fn)` 里的 fn 收到的是**裸客户端**，key 必须用 `full()` 补全前缀。
 *
 * @param {object} delta
 * @param {number} delta.requests - 新增请求数
 * @param {number} delta.blocked - 新增拦截数
 * @param {Map<string, number>} delta.regions
 * @param {Map<string, {path: string, count: number, apiName: string|null}>} delta.paths
 * @param {Map<string, number>} delta.ips
 * @param {object[]} delta.records - 新增记录（按时间正序）
 * @param {Object<string, number>} [delta.challenge] - 挑战链路计数增量（field → count）
 * @returns {Promise<boolean>} 是否写入成功
 */
async function flushStatsDelta(delta) {
  if (!redisAvailable()) return false;

  const challengeFields = delta.challenge && typeof delta.challenge === 'object' ? Object.entries(delta.challenge) : [];
  const hasCounters =
    delta.requests > 0 ||
    delta.blocked > 0 ||
    delta.regions.size > 0 ||
    delta.paths.size > 0 ||
    delta.ips.size > 0 ||
    challengeFields.length > 0;
  const hasRecords = delta.records.length > 0;
  if (!hasCounters && !hasRecords) return true; // 空刷写不算失败

  try {
    if (hasCounters) {
      await store().call(client => {
        const pipe = client.multi();
        if (delta.requests > 0) pipe.hIncrBy(full(STATS_KEY.totals), 'requests', delta.requests);
        if (delta.blocked > 0) pipe.hIncrBy(full(STATS_KEY.totals), 'blocked', delta.blocked);
        for (const [k, v] of delta.regions) pipe.hIncrBy(full(STATS_KEY.region), k, v);
        for (const [k, v] of delta.ips) pipe.hIncrBy(full(STATS_KEY.ip), k, v);
        for (const [k, stat] of delta.paths) {
          pipe.hIncrBy(full(STATS_KEY.path), k, stat.count);
          // apiName 通常只有首次请求才带，用 NX 保留已有值而不是覆盖
          if (stat.apiName) {
            pipe.hSetNX(full(STATS_KEY.pathMeta), k, JSON.stringify({ path: stat.path, apiName: stat.apiName }));
          }
        }
        // 挑战计数：field 是枚举维度拼出来的（issued:pow / failed:Expired / solveMs:b2 …）
        for (const [field, count] of challengeFields) {
          if (Number(count) > 0) pipe.hIncrBy(full(STATS_KEY.challenge), field, Number(count));
        }
        return pipe.exec();
      });
    }

    if (hasRecords) {
      await store().call(client => {
        // 保持批次内时间正序直接 LPUSH：Redis 是逐个插入头部，
        // 因此 push([旧, 新]) 得到 [新, 旧] —— 最新自然落在最左，**不需要反转**。
        // （曾写成先 reverse 再 push，结果是旧记录跑到最前面。）
        const payload = delta.records.map(r => JSON.stringify(r));
        const pipe = client.multi();
        pipe.lPush(full(STATS_KEY.records), payload);
        pipe.lTrim(full(STATS_KEY.records), 0, STATS_RECORDS_MAX - 1);
        return pipe.exec();
      });
    }
    return true;
  } catch (err) {
    log.warn(`⚠️  [FirewallRedis] 统计增量汇聚失败：${err.message}`);
    return false;
  }
}

/**
 * 读取全局聚合的统计
 *
 * @param {object} [options]
 * @param {number} [options.recordLimit=100] - 读取的记录条数；传 0 表示只要总数不要内容
 * @returns {Promise<{totals: object, regions: Array, paths: Array, ips: Array, records: Array, recordCount: number}|null>}
 *          Redis 不可用或读取失败返回 null（调用方退回本实例视图）
 */
async function readAggregatedStats({ recordLimit = 100 } = {}) {
  if (!redisAvailable()) return null;

  try {
    const wantRecords = recordLimit > 0;
    const [totals, regions, pathCounts, pathMetas, ips, challengeCounts, recordCount, rawRecords] = await Promise.all([
      store().hgetall(STATS_KEY.totals),
      store().hgetall(STATS_KEY.region),
      store().hgetall(STATS_KEY.path),
      store().hgetall(STATS_KEY.pathMeta),
      store().hgetall(STATS_KEY.ip),
      store().hgetall(STATS_KEY.challenge),
      store().call(client => client.lLen(full(STATS_KEY.records))),
      wantRecords
        ? store().call(client => client.lRange(full(STATS_KEY.records), 0, recordLimit - 1))
        : Promise.resolve([])
    ]);

    const toEntries = hash =>
      Object.entries(hash || {})
        .map(([k, v]) => [k, Number(v) || 0])
        .filter(([, v]) => v > 0);

    /**
     * 解析路径元数据
     *
     * ⚠️ 必须自己 JSON.parse：`store().hgetall` 走的是 `redis.hGetAll`，**不做 safeParse**，
     * 返回的是原始字符串。曾直接写 `pathMetas[key].path`（对字符串取属性 → undefined），
     * 于是聚合视图里 path 静默退化成 apiKey（`notice.getChannels`），与本地视图不一致。
     * 单测用「会 safeParse 的假 store」掩盖了这个差异 —— 假替身比真身宽松就是假绿。
     *
     * @param {*} raw hgetall 取到的原始值
     * @returns {object|null} 解析后的元数据
     */
    const toMeta = raw => {
      if (raw && typeof raw === 'object') return raw; // 容错：上游若改为 safeParse 也能用
      if (typeof raw !== 'string') return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    return {
      totals: {
        requests: Number(totals?.requests) || 0,
        blocked: Number(totals?.blocked) || 0
      },
      regions: toEntries(regions)
        .sort((a, b) => b[1] - a[1])
        .map(([region, count]) => ({ region, count })),
      paths: toEntries(pathCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => {
          const meta = toMeta(pathMetas?.[key]);
          return {
            // key 是 hash 的原始 field（apiIdentifier），调用方合并本地增量时必须用它
            // 对齐，否则同一路径会被算成两条
            key,
            path: meta?.path || key,
            count,
            apiName: meta?.apiName ?? null
          };
        }),
      ips: toEntries(ips)
        .sort((a, b) => b[1] - a[1])
        .map(([ip, count]) => ({ ip, count })),
      // 挑战链路汇总（成功率 / 失败原因 / 求解耗时分位 / 页面形态分布）
      challenge: summarizeChallengeFields(challengeCounts || {}),
      /**
       * 原始字段表（field → count）
       *
       * 调用方要合并"本实例未刷写的增量"时必须拿原始字段再算一次 ——
       * 分位数不能把两个**已汇总**的结果相加。
       */
      challengeFields: challengeCounts || {},
      recordCount: Number(recordCount) || 0,
      records: (rawRecords || [])
        .map(raw => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    };
  } catch (err) {
    log.warn(`⚠️  [FirewallRedis] 读取聚合统计失败：${err.message}`);
    return null;
  }
}

/**
 * 清空全部统计汇聚（对应遥测的 `clearAll`）
 * @returns {Promise<boolean>} 是否清空成功
 */
async function resetAggregatedStats() {
  if (!redisAvailable()) return false;
  try {
    await store().call(client => {
      const pipe = client.multi();
      for (const key of Object.values(STATS_KEY)) pipe.del(full(key));
      return pipe.exec();
    });
    return true;
  } catch (err) {
    log.warn(`⚠️  [FirewallRedis] 清空统计汇聚失败：${err.message}`);
    return false;
  }
}

export { flushStatsDelta, readAggregatedStats, resetAggregatedStats, STATS_KEY };
// re-export：store.js 的「Redis 可用性」判断与本模块同源（单一 mock 点 —— 测试
// 只需替换本模块即可同时控制刷写与降级判定，与拆分前 store.js 的 import 面一致）。
export { redisAvailable } from '../../../framework/firewall/util/redis.js';
