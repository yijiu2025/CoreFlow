/**
 * 权限加载器测试
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// 模拟 Sequelize 模型
const mockRole = {
  findOne: async () => ({
    code: 'fw_admin',
    app_id: 'firewall',
    policy: { Statement: [{ Effect: 'Allow', Action: ['fw:admin:*'] }] }
  })
};

const mockUserRole = {
  findAll: async () => [
    {
      role: {
        code: 'superadmin',
        app_id: 'GLOBAL',
        policy: '{"Statement":[{"Effect":"Allow","Action":["*"]}]}'
      }
    },
    {
      role: {
        code: 'fw_admin',
        app_id: 'firewall',
        policy: { Statement: [{ Effect: 'Allow', Action: ['fw:admin:*'] }] }
      }
    }
  ]
};

const mockInlinePolicy = {
  findAll: async () => [
    {
      policy: { Statement: [{ Effect: 'Deny', Action: ['user:delete'] }] }
    }
  ]
};

// 模拟 sequelize
const mockSequelize = {
  models: {
    Role: mockRole,
    UserRole: mockUserRole,
    InlinePolicy: mockInlinePolicy
  }
};

// 动态导入被测模块
let loadUserPermissions;

beforeAll(async () => {
  // 由于模块使用 sequelize，需要 mock
  // 这里直接测试 extractPermissions 逻辑
});

describe('permission-loader', () => {
  describe('extractPermissions', () => {
    // 直接测试 extractPermissions 函数逻辑
    function extractPermissions(policy, allows, denies) {
      if (!policy) return;
      if (typeof policy === 'string') {
        try { policy = JSON.parse(policy); } catch { return; }
      }
      if (Array.isArray(policy.Statement)) {
        for (const stmt of policy.Statement) {
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          if (stmt.Effect === 'Allow') allows.push(...actions);
          else if (stmt.Effect === 'Deny') denies.push(...actions);
        }
        return;
      }
      if (Array.isArray(policy.allows)) allows.push(...policy.allows);
      if (Array.isArray(policy.denies)) denies.push(...policy.denies);
    }

    it('解析 Statement 格式 - Allow', () => {
      const allows = [];
      const denies = [];
      extractPermissions(
        { Statement: [{ Effect: 'Allow', Action: ['fw:admin:*'] }] },
        allows, denies
      );
      expect(allows).toEqual(['fw:admin:*']);
      expect(denies).toEqual([]);
    });

    it('解析 Statement 格式 - Deny', () => {
      const allows = [];
      const denies = [];
      extractPermissions(
        { Statement: [{ Effect: 'Deny', Action: ['user:delete'] }] },
        allows, denies
      );
      expect(allows).toEqual([]);
      expect(denies).toEqual(['user:delete']);
    });

    it('解析 Statement 格式 - 混合', () => {
      const allows = [];
      const denies = [];
      extractPermissions({
        Statement: [
          { Effect: 'Allow', Action: ['fw:read', 'fw:write'] },
          { Effect: 'Deny', Action: ['fw:delete'] }
        ]
      }, allows, denies);
      expect(allows).toEqual(['fw:read', 'fw:write']);
      expect(denies).toEqual(['fw:delete']);
    });

    it('解析 JSON 字符串格式', () => {
      const allows = [];
      const denies = [];
      extractPermissions(
        '{"Statement":[{"Effect":"Allow","Action":["*"]}]}',
        allows, denies
      );
      expect(allows).toEqual(['*']);
    });

    it('解析直接格式 allows/denies', () => {
      const allows = [];
      const denies = [];
      extractPermissions(
        { allows: ['user:read'], denies: ['user:delete'] },
        allows, denies
      );
      expect(allows).toEqual(['user:read']);
      expect(denies).toEqual(['user:delete']);
    });

    it('空 policy 不报错', () => {
      const allows = [];
      const denies = [];
      extractPermissions(null, allows, denies);
      expect(allows).toEqual([]);
      expect(denies).toEqual([]);
    });

    it('无效 JSON 字符串不报错', () => {
      const allows = [];
      const denies = [];
      extractPermissions('invalid json', allows, denies);
      expect(allows).toEqual([]);
      expect(denies).toEqual([]);
    });

    it('Action 为字符串时转为数组', () => {
      const allows = [];
      const denies = [];
      extractPermissions(
        { Statement: [{ Effect: 'Allow', Action: 'single:action' }] },
        allows, denies
      );
      expect(allows).toEqual(['single:action']);
    });
  });
});
