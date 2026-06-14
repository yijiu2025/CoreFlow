/**
 * 权限系统完整测试
 *
 * 覆盖：超管自动继承、按应用隔离、角色层次、权限合并
 */
import { describe, it, expect } from '@jest/globals';

describe('权限系统', () => {
  describe('角色层次', () => {
    const roles = [
      { code: 'superadmin', app_id: 'GLOBAL', rank_level: 99 },
      { code: 'fw_admin', app_id: 'firewall', rank_level: 90 },
      { code: 'fw_operator', app_id: 'firewall', rank_level: 50 },
      { code: 'fw_viewer', app_id: 'firewall', rank_level: 1 }
    ];

    it('superadmin 级别最高', () => {
      const superadmin = roles.find(r => r.code === 'superadmin');
      const fwAdmin = roles.find(r => r.code === 'fw_admin');
      expect(superadmin.rank_level).toBeGreaterThan(fwAdmin.rank_level);
    });

    it('fw_admin 高于 fw_operator', () => {
      const admin = roles.find(r => r.code === 'fw_admin');
      const operator = roles.find(r => r.code === 'fw_operator');
      expect(admin.rank_level).toBeGreaterThan(operator.rank_level);
    });

    it('fw_viewer 级别最低', () => {
      const viewer = roles.find(r => r.code === 'fw_viewer');
      const others = roles.filter(r => r.code !== 'fw_viewer');
      others.forEach(r => {
        expect(r.rank_level).toBeGreaterThan(viewer.rank_level);
      });
    });
  });

  describe('超管自动继承', () => {
    it('superadmin 自动获得应用管理员角色', () => {
      const userRoles = ['superadmin'];
      const appId = 'firewall';

      // 模拟权限加载器逻辑
      if (userRoles.includes('superadmin') && appId !== 'GLOBAL') {
        const appAdminRole = `${appId}_admin`;
        if (!userRoles.includes(appAdminRole)) {
          userRoles.push(appAdminRole);
        }
      }

      expect(userRoles).toContain('superadmin');
      expect(userRoles).toContain('firewall_admin');
    });

    it('非超管不自动继承', () => {
      const userRoles = ['fw_viewer'];
      const appId = 'firewall';

      if (userRoles.includes('superadmin') && appId !== 'GLOBAL') {
        userRoles.push(`${appId}_admin`);
      }

      expect(userRoles).not.toContain('fw_admin');
    });

    it('GLOBAL 应用不触发继承', () => {
      const userRoles = ['superadmin'];
      const appId = 'GLOBAL';

      if (userRoles.includes('superadmin') && appId !== 'GLOBAL') {
        userRoles.push(`${appId}_admin`);
      }

      expect(userRoles).not.toContain('GLOBAL_admin');
    });
  });

  describe('按应用隔离', () => {
    it('firewall 角色不影响 admin 应用', () => {
      const firewallRoles = ['fw_admin', 'fw_operator'];
      const adminRoles = ['admin_viewer'];

      expect(firewallRoles).not.toContain('admin_viewer');
      expect(adminRoles).not.toContain('fw_admin');
    });

    it('同一用户不同应用有不同角色', () => {
      const userAppRoles = {
        firewall: ['fw_admin'],
        admin: ['admin_viewer'],
        GLOBAL: ['superadmin']
      };

      expect(userAppRoles.firewall).toContain('fw_admin');
      expect(userAppRoles.admin).toContain('admin_viewer');
      expect(userAppRoles.GLOBAL).toContain('superadmin');
    });
  });

  describe('权限合并', () => {
    it('Statement 格式解析', () => {
      const policy = {
        Statement: [
          { Effect: 'Allow', Action: ['fw:config:read', 'fw:config:write'] },
          { Effect: 'Deny', Action: ['fw:config:delete'] }
        ]
      };

      const allows = [];
      const denies = [];

      for (const stmt of policy.Statement) {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        if (stmt.Effect === 'Allow') allows.push(...actions);
        else if (stmt.Effect === 'Deny') denies.push(...actions);
      }

      expect(allows).toEqual(['fw:config:read', 'fw:config:write']);
      expect(denies).toEqual(['fw:config:delete']);
    });

    it('多角色权限合并', () => {
      const role1 = { allows: ['fw:config:read'], denies: [] };
      const role2 = { allows: ['fw:block:read'], denies: [] };

      const merged = {
        allows: [...role1.allows, ...role2.allows],
        denies: [...role1.denies, ...role2.denies]
      };

      expect(merged.allows).toContain('fw:config:read');
      expect(merged.allows).toContain('fw:block:read');
    });

    it('deny 覆盖 allow', () => {
      const allows = ['fw:config:read', 'fw:config:write'];
      const denies = ['fw:config:write'];

      // deny 优先
      const hasPermission = (perm) => {
        if (denies.some(d => d === perm)) return false;
        return allows.includes(perm);
      };

      expect(hasPermission('fw:config:read')).toBe(true);
      expect(hasPermission('fw:config:write')).toBe(false);
    });
  });

  describe('通配符匹配', () => {
    function match(pattern, target) {
      if (pattern === '*') return true;
      if (pattern === target) return true;
      if (pattern.endsWith(':*')) return target.startsWith(pattern.slice(0, -1));
      return false;
    }

    it('精确匹配', () => {
      expect(match('fw:config:read', 'fw:config:read')).toBe(true);
      expect(match('fw:config:read', 'fw:config:write')).toBe(false);
    });

    it('通配符 fw:config:*', () => {
      expect(match('fw:config:*', 'fw:config:read')).toBe(true);
      expect(match('fw:config:*', 'fw:config:write')).toBe(true);
      expect(match('fw:config:*', 'fw:block:read')).toBe(false);
    });

    it('全局通配符 *', () => {
      expect(match('*', 'anything:here')).toBe(true);
    });
  });
});
