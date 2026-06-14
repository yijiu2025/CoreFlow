/**
 * 共享用户查询
 *
 * 从 oauth21/dao/user.dao.js 中提取常用查询，
 * 供 auth/ 模块使用，避免直接依赖 oauth21。
 */

import UserDao from '../app/oauth21/dao/user.dao.js';

/**
 * 根据 UID 查找用户
 * @param {string} uid - 用户 UUID
 * @returns {Promise<object|null>}
 */
export async function findUserById(uid) {
  return UserDao.findById(uid);
}

/**
 * 根据邮箱查找用户
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function findUserByEmail(email) {
  return UserDao.findByEmail(email);
}

/**
 * 根据用户名查找用户
 * @param {string} username
 * @returns {Promise<object|null>}
 */
export async function findUserByUsername(username) {
  return UserDao.findByUsername(username);
}
