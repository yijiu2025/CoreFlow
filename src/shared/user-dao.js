/**
 * 共享用户查询
 *
 * 从 oauth21/dao/user.dao.js 中提取常用查询，
 * 供 auth/ 模块使用，避免直接依赖 oauth21。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import UserDao from '../app/oauth21/dao/user.dao.js';

/**
 * 根据 uid（UUID）查找用户
 *
 * 🔴 命名契约：`ByUid` = UUID，`ById` = 数字主键。原名 findUserById 实按 uid
 * 查询，是「uid vs 数字主键」错位类 bug 的帮凶型命名（2026-11-01 改名）。
 * @param {string} uid - 用户 UUID
 * @returns {Promise<object|null>}
 */
async function findUserByUid(uid) {
  return UserDao.findById(uid);
}

/**
 * 根据邮箱查找用户
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function findUserByEmail(email) {
  return UserDao.findByEmail(email);
}

/**
 * 根据用户名查找用户
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function findUserByUsername(username) {
  return UserDao.findByUsername(username);
}

export { findUserByUid, findUserByEmail, findUserByUsername };
