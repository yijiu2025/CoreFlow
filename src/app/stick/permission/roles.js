/**
 * 股票分析角色定义
 * 使用 defineRoles 注册角色，loader 启动时自动同步到数据库
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { STICK_PERMISSIONS } from './index.js';

defineRoles([
  {
    code: 'stick_user',
    app_id: 'stick',
    name: '股票分析用户',
    rank_level: 10,
    description: '普通用户，拥有股票分析全部功能',
    policy: {
      Version: '2026-07-20',
      Statement: [
        {
          Effect: 'Allow',
          Action: [STICK_PERMISSIONS.STICK.ALL]
        }
      ]
    }
  },
  {
    code: 'stick_admin',
    app_id: 'stick',
    name: '股票分析管理员',
    rank_level: 80,
    description: '管理员，可管理所有用户数据',
    policy: {
      Version: '2026-07-20',
      Statement: [
        {
          Effect: 'Allow',
          Action: [STICK_PERMISSIONS.STICK.ALL]
        }
      ]
    }
  }
]);
