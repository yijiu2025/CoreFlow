/**
 * 设备账户关联查询接口（管理端）
 *
 * 落 /admin/user/v1/devices/*，继承 admin 域 system 级 requireLogin:true + allowRoles:['admin']。
 *
 * GET /admin/user/v1/devices/accounts — 按 device_id 反查该设备登录过的账户列表
 *
 * 用途：安全审计（一个设备被多少账户使用、哪些用户、是否有活跃会话），
 * 为后续"同设备账户关联"功能提供数据基础——响应 accounts[].uid 即同设备
 * 账户集合，可直接用于建立关联关系。查询逻辑在 device-account.service.js，
 * 本路由只做参数校验与响应包装。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { getDeviceAccountSummary } from '../../../../app/admin/services/device-account.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'deviceAccountsAdmin',
    alias: '设备账户关联查询',
    description: '按 device_id 反查登录过的账户列表（admin 审计）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });

  /**
   * GET /admin/user/v1/devices/accounts?deviceId=WEB-DaBOSbNdSuc-8s4T
   * 按设备 ID 查询登录过的账户列表
   *
   * 返回：{ deviceId, structured, totalAccounts, accounts[], firstSeenAt, lastActiveAt }
   * accounts[].uid 即同设备账户集合（账户关联扩展点）。
   */
  registerSecureRoute(fastify, {
    name: 'listDeviceAccounts',
    alias: '设备登录账户列表',
    method: 'GET',
    url: '/devices/accounts',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { deviceId } = request.query;
      if (!deviceId) {
        return reply.result.fail('deviceId 不能为空');
      }

      try {
        const summary = await getDeviceAccountSummary(deviceId);
        if (!summary) {
          return reply.result.fail('deviceId 格式非法（长度 1-100）');
        }
        return reply.result.success('获取成功', summary);
      } catch (err) {
        if (err.code === 'MODEL_NOT_LOADED') {
          return reply.result.fail('SessionToken / User 模型未加载');
        }
        throw err;
      }
    }
  });
}
