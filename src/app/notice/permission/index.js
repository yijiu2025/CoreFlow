/**
 * 权限定义入口
 *
 * 分组原则：`CONFIG` 管"平台怎么发"（渠道、事件默认订阅、日志），`TEMPLATE` 管内容，
 * `SELF` 管"我自己收不收"，`SEND` 是服务间唤醒投递的入口。
 *
 * 个人偏好接口**只要求登录**，不挂 `SELF` 权限码：让每个人都必须先被授予
 * "改自己的设置"权限，等于把基础功能做成需要特批 —— 数据隔离靠
 * `request.state.user.userId` 强制过滤，而不是靠权限码。`SELF` 两枚码保留给
 * 菜单/按钮授权（前端菜单树可以按它控制入口显隐），不参与接口拦截。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { createPermissionRegistry } from '../../../framework/security/pbac/index.js';

/**
 * 通知应用权限字典常量
 */
const NOTICE_PERMISSIONS = createPermissionRegistry('notice', '通知模块', {
  CONFIG: {
    READ: { code: 'notice:config:read', label: '查看通知配置', type: 'read' },
    UPDATE: {
      code: 'notice:config:update',
      label: '修改通知配置',
      type: 'write'
    }
  },
  TEMPLATE: {
    READ: { code: 'notice:template:read', label: '查看模板', type: 'read' },
    WRITE: { code: 'notice:template:write', label: '管理模板', type: 'write' }
  },
  SELF: {
    READ: { code: 'notice:self:read', label: '查看个人通知偏好', type: 'read' },
    UPDATE: { code: 'notice:self:update', label: '修改个人通知偏好', type: 'write' }
  },
  SEND: {
    EXECUTE: { code: 'notice:send', label: '发送通知', type: 'execute' }
  }
});

export { NOTICE_PERMISSIONS };
export default NOTICE_PERMISSIONS;
