/**
 * 密钥 DB 持久层
 *
 * 隔离 Sequelize 访问：所有 KeyPair 表操作集中于此，
 * 上层（accessor/manager）只调用本模块，不直接写查询。
 *
 * @author yijiu
 * @since 2026-08-15
 */

import { getModel } from '../db/index.js';

/**
 * 取 KeyPair 模型（未加载时返回 null）
 * @returns {object|null}
 */
function getKeyPairModel() {
  return getModel('KeyPair');
}

/**
 * 按名(kid)查启用的密钥对
 * @param {string} name - kid
 * @returns {Promise<object|null>}
 */
async function findActiveByName(name) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return null;
  return KeyPair.findOne({ where: { name, active: true } });
}

/**
 * 按名(kid)查密钥对（不论 active 状态）
 *
 * 供验签路径：旧 token 的 kid 可能指向已退役但仍处宽限期的密钥。
 * 是否可用（active 或在宽限内）由调用方判定。
 * @param {string} name - kid
 * @returns {Promise<object|null>}
 */
async function findByName(name) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return null;
  return KeyPair.findOne({ where: { name } });
}

/**
 * 修改密钥启用状态（轮转时停用旧密钥，updated_at 自动刷新为退役时刻）
 * @param {string} name - kid
 * @param {boolean} active
 */
async function setActive(name, active) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) throw new Error('KeyPair 模型未加载');
  await KeyPair.update({ active }, { where: { name } });
}

/**
 * 查最新的启用密钥对（按创建时间倒序）
 * @returns {Promise<object|null>}
 */
async function findNewestActive() {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return null;
  return KeyPair.findOne({
    where: { active: true },
    order: [['created_at', 'DESC']]
  });
}

/**
 * 查所有启用密钥对（供 JWKS 暴露全部公钥）
 * @returns {Promise<object[]>}
 */
async function findAllActive() {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return [];
  return KeyPair.findAll({
    where: { active: true },
    order: [['created_at', 'DESC']]
  });
}

/**
 * 查所有密钥对（含未启用，供管理端列表）
 * @returns {Promise<object[]>}
 */
async function findAll() {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return [];
  return KeyPair.findAll({ order: [['created_at', 'DESC']] });
}

/**
 * 写入新密钥对
 * @param {object} data - { name, algorithm, private_key, public_key, jwk, active, remark }
 * @returns {Promise<object>} 数据库记录
 */
async function insertKey(data) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) throw new Error('KeyPair 模型未加载');
  return KeyPair.create(data);
}

/**
 * 按名删除密钥对
 * @param {string} name
 */
async function removeByName(name) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) throw new Error('KeyPair 模型未加载');
  await KeyPair.destroy({ where: { name } });
}

/**
 * 按名校验名称是否已存在
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function existsByName(name) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return false;
  return !!(await KeyPair.findOne({ where: { name }, attributes: ['id'] }));
}

export {
  findActiveByName,
  findByName,
  findNewestActive,
  findAllActive,
  findAll,
  insertKey,
  removeByName,
  setActive,
  existsByName
};
