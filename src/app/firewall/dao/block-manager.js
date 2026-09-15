/**
 * 封禁与白名单管理 — 对外交互层
 *
 * 提供前端管理面板需要的查询接口，以及 API 层手动操作的薄封装。
 * 核心策略与存储实现位于 engine/dao/block-manager.js + util/redis.js。
 *
 * API 层无需再传 Redis 客户端：访问层会按当前后端（Redis / 内存）自动选择，
 * 因此这里的函数签名一律为「业务参数」。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
export {
  getActiveBlocks,
  getActiveWhitelist,
  setBlock,
  removeBlock,
  setBlockFp,
  removeBlockFp,
  setWhitelist,
  removeWhitelist,
  setWhitelistFp,
  removeWhitelistFp,
  setBlockDevice,
  removeBlockDevice,
  setWhitelistDevice,
  removeWhitelistDevice
} from '../engine/dao/block-manager.js';
