/**
 * 股票分析权限常量
 * 使用 createPermissionRegistry 工厂函数定义权限
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

/**
 * 股票分析权限定义
 * 三段式格式: stick:资源:动作
 */
export const STICK_PERMISSIONS = createPermissionRegistry('stick', '股票分析', {
  // 股票管理
  STOCK: {
    READ:   { code: 'stick:stock:read',   label: '查看股票',     type: 'read' },
    WRITE:  { code: 'stick:stock:write',  label: '添加/编辑股票', type: 'write' },
    DELETE: { code: 'stick:stock:delete', label: '删除股票',     type: 'high_risk' },
    ALL:    { code: 'stick:stock:*',      label: '股票管理通配', type: 'wildcard' }
  },

  // 持仓管理
  POSITION: {
    READ:   { code: 'stick:position:read',   label: '查看持仓',     type: 'read' },
    WRITE:  { code: 'stick:position:write',  label: '添加/编辑持仓', type: 'write' },
    DELETE: { code: 'stick:position:delete', label: '删除持仓',     type: 'high_risk' },
    ALL:    { code: 'stick:position:*',      label: '持仓管理通配', type: 'wildcard' }
  },

  // 交易记录
  TRADE: {
    READ:   { code: 'stick:trade:read',   label: '查看交易',     type: 'read' },
    WRITE:  { code: 'stick:trade:write',  label: '记录交易',     type: 'write' },
    ALL:    { code: 'stick:trade:*',      label: '交易管理通配', type: 'wildcard' }
  },

  // AI 分析
  ANALYSIS: {
    READ:   { code: 'stick:analysis:read',   label: '查看分析',     type: 'read' },
    WRITE:  { code: 'stick:analysis:write',  label: '触发分析',     type: 'write' },
    ALL:    { code: 'stick:analysis:*',      label: '分析管理通配', type: 'wildcard' }
  },

  // 交易日志
  JOURNAL: {
    READ:   { code: 'stick:journal:read',   label: '查看日志',     type: 'read' },
    WRITE:  { code: 'stick:journal:write',  label: '添加日志',     type: 'write' },
    DELETE: { code: 'stick:journal:delete', label: '删除日志',     type: 'high_risk' },
    ALL:    { code: 'stick:journal:*',      label: '日志管理通配', type: 'wildcard' }
  },

  // 实时行情
  MARKET: {
    READ:   { code: 'stick:market:read',   label: '查看行情',     type: 'read' },
    ALL:    { code: 'stick:market:*',      label: '行情通配',     type: 'wildcard' }
  },

  // 仪表盘
  DASHBOARD: {
    READ:   { code: 'stick:dashboard:read',   label: '查看仪表盘',   type: 'read' },
    ALL:    { code: 'stick:dashboard:*',      label: '仪表盘通配', type: 'wildcard' }
  },

  // 股票分析全量通配符
  STICK: {
    ALL: { code: 'stick:*', label: '股票分析全量通配符', type: 'wildcard' }
  }
});

export default STICK_PERMISSIONS;
