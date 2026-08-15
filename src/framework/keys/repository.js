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

export { findActiveByName, findNewestActive, findAllActive, findAll, insertKey, removeByName, existsByName };
