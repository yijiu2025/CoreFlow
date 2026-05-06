/**
 * 封禁与白名单管理 — 对外交互层
 *
 * 提供前端管理面板需要的查询接口，以及 API 层手动操作的薄封装。
 * 核心检测逻辑仍在 engine/block-manager.js。
 */
import {
  getActiveBlocks as _getActiveBlocks,
  getActiveWhitelist as _getActiveWhitelist,
  setBlockFp as _setBlockFp,
  removeBlockFp as _removeBlockFp,
  setWhitelist as _setWhitelist,
  removeWhitelist as _removeWhitelist,
  setWhitelistFp as _setWhitelistFp,
  removeWhitelistFp as _removeWhitelistFp
} from '../engine/block-manager.js';

// ============== 查询接口（前端管理面板） ==============

/**
 * 获取所有活跃封禁记录（IP + 指纹）
 * 合并 Redis 和内存数据，按剩余时间排序
 *
 * @param {object|null} redisClient Redis 客户端
 * @returns {Promise<Array>} 封禁记录列表
 */
export const getActiveBlocks = _getActiveBlocks;

/**
 * 获取所有活跃白名单记录（IP + 指纹）
 *
 * @param {object|null} redisClient Redis 客户端
 * @returns {Promise<Array>} 白名单记录列表
 */
export const getActiveWhitelist = _getActiveWhitelist;

// ============== 指纹封禁接口（API 手动拉黑） ==============

/**
 * 设置指纹封禁（API 层调用）
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹
 * @param {object} metadata 封禁元数据
 */
export const setBlockFp = _setBlockFp;

/**
 * 移除指纹封禁（API 层调用）
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹
 */
export const removeBlockFp = _removeBlockFp;

// ============== 白名单接口（API 手动管理） ==============

/**
 * 设置 IP 白名单（API 层调用）
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} ip IP 地址
 * @param {number} durationSeconds 持续时间（秒）
 */
export const setWhitelist = _setWhitelist;

/**
 * 移除 IP 白名单（API 层调用）
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} ip IP 地址
 */
export const removeWhitelist = _removeWhitelist;

/**
 * 设置指纹白名单（API 层调用）
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹
 * @param {number} durationSeconds 持续时间（秒）
 */
export const setWhitelistFp = _setWhitelistFp;

/**
 * 移除指纹白名单（API 层调用）
 *
 * @param {object|null} redisClient Redis 客户端
 * @param {string} fingerprint 设备指纹
 */
export const removeWhitelistFp = _removeWhitelistFp;
