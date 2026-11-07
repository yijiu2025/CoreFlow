/**
 * 工作量证明数据访问层
 *
 * 与其他 verify 子模块同构（`captcha` / `email` / `sms` 都是 `service` 纯逻辑 +
 * `dao` 管存储与生命周期）：**存储由调用方注入**，本模块不认识 Redis、不认识防火墙。
 *
 * 存储适配器契约（`PowStore`）：
 *
 * ```js
 * {
 *   put(challengeId, payload, ttlSec) => Promise<void>
 *   take(challengeId)                 => Promise<object|null>   // ⚠️ 必须原子 GET+DEL
 * }
 * ```
 *
 * **为什么必须是 `take` 而不是 `get + delete`**：这道题的"一次性"是安全性质，不是清理优化。
 * 两次非原子调用之间，同一个题号可能被两个并发请求各读一次 → 同一份答案被用两次。
 * 所以适配器只接受"取走"语义，防火墙那边用 Redis `GETDEL`/Lua 实现（`writeChallenge` /
 * `takeChallenge`，见 `framework/ingress/firewall/util/pow-store.js`）。
 *
 * 载荷里 **`binding` 是完全不透明的**：本模块只负责原样存、原样取回，由调用方自己决定
 * 它含哪些字段（防火墙塞的是 `{ ip, fingerprint, deviceId }`）、怎么比对、不一致算哪类失败。
 * 一旦这里认识"ip"，verify 就反向依赖了防火墙的域模型 —— 依赖方向会立刻翻过来。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import * as powService from './service.js';

/**
 * @typedef {object} PowStore 挑战载荷存储适配器
 * @property {(challengeId: string, payload: object, ttlSec: number) => Promise<void>} put 写入（带 TTL）
 * @property {(challengeId: string) => Promise<object|null>} take 原子取走（不存在/已消费/过期返回 null）
 */

class PowDao {
  /**
   * 出一道题并落存储
   *
   * 返回给调用方的只有**不透明题号 + 求解参数**：真正的判定依据（盐、难度、绑定上下文）
   * 留在服务端，客户端即使把整个响应体回传也拿不到可直接复用的凭据。
   *
   * @param {PowStore} store 存储适配器
   * @param {object} [options] 出题参数
   * @param {number} [options.difficulty] 难度（夹到 `[1, MAX_DIFFICULTY]`）
   * @param {number} [options.ttlSec] 有效期（秒）
   * @param {object|null} [options.binding] **不透明**绑定上下文，原样存取
   * @returns {Promise<{challengeId:string, salt:string, difficulty:number, maxAttempts:number, ttlSec:number}>} 题目
   */
  async issue(store, options = {}) {
    const challenge = powService.buildChallenge({ difficulty: options.difficulty, ttlSec: options.ttlSec });
    await store.put(
      challenge.challengeId,
      {
        salt: challenge.salt,
        difficulty: challenge.difficulty,
        binding: options.binding ?? null,
        issuedAt: Date.now()
      },
      challenge.ttlSec
    );
    return challenge;
  }

  /**
   * 取走一题（一次性）
   *
   * 取走即失效：无论后面判题成功还是失败，这份载荷都不会再存在 —— 与"失败可重试"
   * 的取舍是「重试必须重新出题」，否则同一题号可以被无限次试错。
   *
   * @param {PowStore} store 存储适配器
   * @param {string} challengeId 题号
   * @returns {Promise<{salt:string, difficulty:number, binding:object|null, issuedAt:number}|null>} 载荷
   */
  async consume(store, challengeId) {
    if (typeof challengeId !== 'string' || !challengeId) return null;
    return await store.take(challengeId);
  }

  /**
   * 判题（不碰存储；`salt` / `difficulty` 取自 `consume()` 拿到的载荷）
   *
   * @param {object} payload `consume()` 的返回值
   * @param {object} params 判题参数
   * @param {string} params.challengeId 题号（拼哈希前缀用）
   * @param {unknown} params.answer 客户端答案
   * @returns {{ok:true} | {ok:false, reason:string}} 判定结果
   */
  check(payload, { challengeId, answer }) {
    return powService.verifyAnswer({
      challengeId,
      salt: payload?.salt,
      answer,
      difficulty: payload?.difficulty
    });
  }
}

const powDao = new PowDao();

export default powDao;
