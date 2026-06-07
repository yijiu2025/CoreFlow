import sequelize from '../../../db/index.js';
import Logger from '../../../log/index.js';
import { FIREWALL_PERMISSIONS } from './index.js';

/**
 * 自动加载防火墙模块的基础角色配置 (Upsert)
 */
export async function seedFirewallRoles() {
  const { Role } = sequelize.models;

  if (!Role) return;

  const baseRoles = [
    {
      code: 'fw_viewer',
      app_id: 'firewall',
      name: '防火墙观察者',
      rank_level: 1,
      description: '只能查看监控数据和日志，不能修改配置',
      policy: {
        Version: '2026-06-06',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              FIREWALL_PERMISSIONS.MONITOR.READ,
              FIREWALL_PERMISSIONS.MONITOR.LOGS,
              FIREWALL_PERMISSIONS.MONITOR.SUMMARY,
              FIREWALL_PERMISSIONS.BLOCK.READ,
              FIREWALL_PERMISSIONS.WHITELIST.READ,
              FIREWALL_PERMISSIONS.CONFIG.READ,
              FIREWALL_PERMISSIONS.DEFENSE.READ
            ]
          }
        ]
      }
    },
    {
      code: 'fw_operator',
      app_id: 'firewall',
      name: '防火墙操作员',
      rank_level: 50,

      description: '可以管理封禁/白名单，修改安全配置和防御策略',
      policy: {
        Version: '2026-06-06',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              FIREWALL_PERMISSIONS.MONITOR.READ,
              FIREWALL_PERMISSIONS.MONITOR.LOGS,
              FIREWALL_PERMISSIONS.MONITOR.SUMMARY,
              FIREWALL_PERMISSIONS.BLOCK.READ,
              FIREWALL_PERMISSIONS.BLOCK.WRITE,
              FIREWALL_PERMISSIONS.BLOCK.FINGERPRINT,
              FIREWALL_PERMISSIONS.WHITELIST.READ,
              FIREWALL_PERMISSIONS.WHITELIST.WRITE,
              FIREWALL_PERMISSIONS.CONFIG.READ,
              FIREWALL_PERMISSIONS.CONFIG.WRITE,
              FIREWALL_PERMISSIONS.CONFIG.TOGGLE,
              FIREWALL_PERMISSIONS.DEFENSE.READ,
              FIREWALL_PERMISSIONS.DEFENSE.WRITE
            ]
          }
        ]
      }
    },
    {
      code: 'fw_admin',
      app_id: 'firewall',
      name: '防火墙管理员',
      rank_level: 90,
      description: '拥有防火墙全部权限，包括节点管理和数据重置',
      policy: {
        Version: '2026-06-06',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['fw:admin:*']
          }
        ]
      }
    }
  ];

  try {
    for (const roleDef of baseRoles) {
      await Role.findOrCreate({
        where: { code: roleDef.code, app_id: roleDef.app_id },
        defaults: roleDef
      });
    }
    Logger.info('✨ [PBAC] 防火墙角色 (Seeder) 同步完毕');
  } catch (error) {
    Logger.error('❌ [PBAC] 防火墙角色数据同步失败:', error);
  }
}
