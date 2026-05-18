/**
 * User 用户注册
 *
 * POST /user/register — 注册新用户
 * GET /check-email — 校验邮箱是否重复
 * GET /check-username — 校验用户名是否重复
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import userDao from '../../../user/dao/user.js';
import verifyDao from '../../../verify/dao/verify.js';
import '../../../user/permission/roles.js'; // 导入即可触发底层的 defineRoles() 注册机制
export default async function (fastify) {
  registerGroupMetadata({
    name: 'userRegister',
    description: 'user用户注册',
    prefix: '/v1',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /user/register — 注册新用户
   */
  registerSecureRoute(fastify, {
    name: 'userRegister',
    alias: '注册新用户',
    method: 'POST',
    url: '/register',
    handler: async (request, reply) => {
      // 验证邮件验证码
      try {
        const { email, code } = request.body;
        await verifyDao.checkEmailCode(email, code);
      } catch (err) {
        return reply.result.fail(err.message, null, 400);
      }

      const user = await userDao.createUser(request);
      return reply.result.success('注册成功', user);
    }
  });

  /**
   * GET /check-nickname — 校验昵称是否重复
   */
  // registerSecureRoute(fastify, {
  //   name: 'checkNickname',
  //   alias: '校验昵称是否重复',
  //   method: 'GET',
  //   url: '/check-nickname',
  //   handler: async (request, reply) => {
  //     const { nickname } = request.query;
  //     const isDuplicate = await userDao.checkUsernameExist(nickname);
  //     return reply.code(200).send({ isDuplicate });
  //   }
  // });

  /**
   * GET /check-email — 校验邮箱是否重复
   */
  registerSecureRoute(fastify, {
    name: 'checkEmail',
    alias: '校验邮箱是否重复',
    method: 'GET',
    url: '/check-email',
    handler: async (request, reply) => {
      const { email } = request.query;
      const isDuplicate = await userDao.checkEmailExist(email);
      return reply.code(200).send({ isDuplicate });
    }
  });
}

