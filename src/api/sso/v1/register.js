// src/api/sso/v1/register.js
import Result from '../../../core/result.js';
import { UserDao } from '../../../dao/user/user.js';

const userDao = new UserDao();

// ──────────────────────────────────────────────
// AJV JSON Schema 定义 (Fastify 原生校验)
// 在请求到达业务代码 *之前*，Fastify 会用 AJV 以 C++ 级别的速度完成校验
// ──────────────────────────────────────────────
const checkUsernameSchema = {
  querystring: {
    type: 'object',
    required: ['username'],
    properties: {
      username: {
        type: 'string',
        minLength: 5,
        maxLength: 20
      }
    }
  }
};

const registerSchema = {
  body: {
    type: 'object',
    required: ['username', 'password', 'verification_code', 'session_id'],
    properties: {
      username: {
        type: 'string',
        minLength: 5,
        maxLength: 20,
        description: '用户名，5~20位'
      },
      password: {
        type: 'string',
        minLength: 1,
        description: '密码（前端已加密）'
      },
      email: {
        type: 'string',
        format: 'email',
        description: '邮箱（可选）'
      },
      nickname: {
        type: 'string',
        maxLength: 50,
        description: '昵称（可选）'
      },
      verification_code: {
        type: 'string',
        minLength: 1,
        description: '邮箱/图形验证码'
      },
      session_id: {
        type: 'string',
        minLength: 1,
        description: '图形验证码对应的 sessionId'
      },
      group_ids: {
        type: 'array',
        items: { type: 'integer' },
        description: '分配的分组 ID 列表（可选）'
      }
    }
  }
};

export default async function (fastify, opts) {
  /**
   * 检查用户名是否已经注册
   * AJV 会自动校验 querystring.username 的长度，无需手写逻辑
   */
  fastify.get(
    '/api/v1/sso/check_username',
    {
      schema: checkUsernameSchema
    },
    async (request, reply) => {
      const { username } = request.query;
      const isExist = await userDao.checkUsernameExist(username);

      if (isExist) {
        reply.json(Result.fail(400, '用户名已存在'));
      } else {
        reply.json(Result.success(null, '用户名可用'));
      }
    }
  );

  /**
   * 用户注册 (SSO 核心接口)
   * AJV 会在请求进入此函数之前，自动校验 body 的必填字段和格式
   */
  fastify.post(
    '/api/v1/sso/register',
    {
      schema: registerSchema
    },
    async (request, reply) => {
      const { username, password, email, nickname, verification_code, session_id, group_ids } = request.body;

      try {
        // 1. 账号与邮箱唯一性检查
        if (await userDao.checkUsernameExist(username)) {
          throw Object.assign(new Error('用户名已存在'), { statusCode: 409 });
        }
        if (email && (await userDao.checkEmailExist(email))) {
          throw Object.assign(new Error('该邮箱已被注册'), { statusCode: 409 });
        }

        // 2. 邮箱验证码校验 (通过兼容的 v 代理对象传入)
        const v = {
          get: (key) => {
            const map = {
              'body.email': email,
              'body.verification_code': verification_code,
              'body.session_id': session_id,
              'body.username': username,
              'body.password': password,
              'body.nickname': nickname,
              'body.group_ids': group_ids || []
            };
            return map[key];
          }
        };

        await userDao.checkEmailCode(v);

        // 3. 执行注册
        const result = await userDao.registerUser(v);

        request.log.info({ uid: result.uid, username }, '新用户注册成功');
        reply.json(Result.success({ uid: result.uid, username: result.username }, '注册成功'));
      } catch (err) {
        // 已携带 statusCode 的错误由 Fastify 全局错误处理器处理
        if (err.statusCode) throw err;
        // 其他业务异常
        reply.status(400).json(Result.fail(400, err.message || '注册失败'));
      }
    }
  );
}
