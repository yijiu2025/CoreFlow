/**
 * 把防火墙的挑战载荷存储，转成 `framework/verify/pow` 期望的 store 适配器
 *
 * 为什么需要它：`verify` 子模块统一「存储由调用方注入」，而防火墙这边早有自己的
 * redis 封装（`writeChallenge` / `takeChallenge`，含内存降级与 LUA 原子取删）。
 * 两者的方法签名天然一致，所以适配器就是一次转发。
 *
 * ⚠️ 三条不能改的地方：
 *   ① **不要**把它换成一个 `{ get, delete }` 的组合 —— 那样「一次性」会退化成两次
 *      非原子调用，同一份载荷在多实例下可能被用两次（安全问题，不是性能问题）；
 *   ② **不要**在这里补逻辑（重试、包装、加前缀）—— 存储语义的唯一实现仍在
 *      `util/redis.js`，这里多一层就会有两套语义；
 *   ③ **不要**让 `verify/pow` 反向 import 本文件 —— 那会让能力库依赖防火墙。
 *
 * 键空间仍是防火墙的 `fw:chal:<id>`（见 `util/redis-keys.js`），未因搬家而改变：
 * 载荷格式与 TTL 是运行期契约，换键会让升级瞬间的进行中挑战全部失效。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { writeChallenge, takeChallenge } from './redis.js';

/**
 * @type {{put: (challengeId: string, payload: object, ttlSec: number) => Promise<void>,
 *         take: (challengeId: string) => Promise<object|null>}}
 */
const powChallengeStore = { put: writeChallenge, take: takeChallenge };

export { powChallengeStore };
