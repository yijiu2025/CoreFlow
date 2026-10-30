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
import { isEnabled, isSealed, seal, open } from './envelope.js';

/**
 * 取 KeyPair 模型（未加载时返回 null）
 * @returns {object|null}
 */
function getKeyPairModel() {
  return getModel('KeyPair');
}

/**
 * 写入前加密私钥
 *
 * 只在启用信封加密（配置了 KEK）时封；未配置时保持历史明文行为，
 * 避免未做密钥管理准备的部署突然无法启动。是否强制由 `KEY_ENCRYPTION_REQUIRED` 决定。
 *
 * @param {object} data
 * @returns {object} 待写入的数据
 */
function sealForWrite(data) {
  if (!isEnabled() || !data?.private_key || isSealed(data.private_key)) return data;
  return { ...data, private_key: seal(data.private_key, data.name) };
}

/**
 * 读取后解密私钥（就地替换 dataValues，保留 Sequelize 实例能力）
 *
 * 历史明文行原样返回；密文行解不开则抛错——绝不能把密文冒充 PEM 传到签名环节。
 *
 * @param {object|null} row
 * @returns {object|null}
 */
function openRow(row) {
  if (!row) return row;
  const stored = row.private_key;
  if (!stored || !isSealed(stored)) return row;
  const plaintext = open(stored, row.name);
  if (typeof row.setDataValue === 'function') {
    // setDataValue 不改 changed()，不会被误判为脏字段而回写
    row.setDataValue('private_key', plaintext);
  } else {
    row.private_key = plaintext;
  }
  return row;
}

/**
 * 批量解密
 * @param {object[]} rows
 * @returns {object[]}
 */
function openRows(rows) {
  return rows.map(openRow);
}

/**
 * 按名(kid)查启用的密钥对
 * @param {string} name - kid
 * @returns {Promise<object|null>}
 */
async function findActiveByName(name) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return null;
  return openRow(await KeyPair.findOne({ where: { name, active: true } }));
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
  return openRow(await KeyPair.findOne({ where: { name } }));
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
  return openRow(
    await KeyPair.findOne({
      where: { active: true },
      order: [['createdAt', 'DESC']]
    })
  );
}

/**
 * 查所有启用密钥对（供 JWKS 暴露全部公钥）
 * @returns {Promise<object[]>}
 */
async function findAllActive() {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return [];
  return openRows(
    await KeyPair.findAll({
      where: { active: true },
      order: [['createdAt', 'DESC']]
    })
  );
}

/**
 * 查所有密钥对（含未启用，供管理端列表）
 * @returns {Promise<object[]>}
 */
async function findAll() {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) return [];
  return openRows(await KeyPair.findAll({ order: [['createdAt', 'DESC']] }));
}

/**
 * 写入新密钥对
 * @param {object} data - { name, algorithm, private_key, public_key, jwk, active, remark }
 * @returns {Promise<object>} 数据库记录
 */
async function insertKey(data) {
  const KeyPair = getKeyPairModel();
  if (!KeyPair) throw new Error('KeyPair 模型未加载');
  return openRow(await KeyPair.create(sealForWrite(data)));
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
