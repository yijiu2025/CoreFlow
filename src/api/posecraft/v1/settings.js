/**
 * PoseCraft 用户个性设置
 *
 * GET  /posecraft/v1/settings          — 一次性拉取全部设置（登录后调用）
 * GET  /posecraft/v1/settings/:field   — 读取单个字段
 * PUT  /posecraft/v1/settings/:field   — 改单字段，value 由前端传入
 *
 * 字段不存在时：mergeUpdate 会把新字段一起写入，无需前端额外处理
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import settingsDao from '../../../app/posecraft/dao/settings.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'settings',
    description: 'PoseCraft 用户个性设置（UI 偏好）',
    prefix: '/v1'
  });

  // 读取单个字段（必须先于 /settings 注册，避免被通配符吃掉）
  registerSecureRoute(fastify, {
    name: 'getUserSettingField',
    alias: '获取单个设置字段',
    method: 'GET',
    url: '/settings/:field',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = request.state?.user?.userId;
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const { field } = request.params;
      const allSettings = await settingsDao.getByUserId(userId);
      const value = allSettings[field];

      return reply.result.success('获取成功', {
        field,
        value: value !== undefined ? value : null,
        exists: value !== undefined
      });
    }
  });

  // 一次性拉取全部设置（登录后调用）
  registerSecureRoute(fastify, {
    name: 'getUserSettings',
    alias: '获取全部用户设置',
    method: 'GET',
    url: '/settings',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = request.state?.user?.userId;
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const settings = await settingsDao.getByUserId(userId);
      return reply.result.success('获取成功', settings);
    }
  });

  // 单字段更新（增量 merge：未提供字段保留原值，新字段一起入库）
  registerSecureRoute(fastify, {
    name: 'updateUserSettingField',
    alias: '更新单个设置字段',
    method: 'PUT',
    url: '/settings/:field',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = request.state?.user?.userId;
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const { field } = request.params;
      const { value } = request.body || {};
      if (value === undefined) {
        return reply.code(400).send({ code: 400, message: '请求体必须包含 value', data: null });
      }

      const merged = await settingsDao.mergeUpdate(userId, { [field]: value });
      return reply.result.success('更新成功', { field, value: merged[field] });
    }
  });
}
