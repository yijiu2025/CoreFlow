/**
 * 用户管理写操作的审计留痕测试
 *
 * 起因：用户管理页的「冻结/解冻」点了没日志，顺着查出新建、编辑、导出、批量授权
 * 也都没进 `audit_logs`。这里守住两件事：
 *   1. 载荷正确 —— 事件码、目标、字段差集、状态中文化，缺一条日志就等于没记；
 *   2. 不再漏记 —— 5 个写接口的 handler 里必须真的调用了 `auditUser`（静态契约）。
 *
 * @author yijiu2025
 * @since 2026-11-17
 */
import { describe, expect, jest, beforeEach } from '@jest/globals';

/** logAuditEvent 桩：默认只记录调用参数，可切换成抛错以验证降级 */
const auditCalls = [];
let auditImpl = async event => {
  auditCalls.push(event);
};
jest.unstable_mockModule('../../../../framework/security/auth/index.js', () => ({
  logAuditEvent: (...args) => auditImpl(...args)
}));

/** Role 模型桩：按 id 返回角色名 */
const roleFindAll = jest.fn();
jest.unstable_mockModule('../../../../framework/persistence/db/index.js', () => ({
  getModel: name =>
    name === 'Role'
      ? {
          findAll: roleFindAll
        }
      : undefined
}));

/** Logger 桩：降级路径会打 warn，测试里不落盘 */
const warn = jest.fn();
jest.unstable_mockModule('../../../../framework/support/log/index.js', () => ({
  default: { warn, info: jest.fn(), error: jest.fn() }
}));

const { USER_EVENTS, statusText, diffProfile, roleNamesOf, auditUser } =
  await import('../../../../app/admin/console/services/user-audit.service.js');

beforeEach(() => {
  auditCalls.length = 0;
  roleFindAll.mockReset();
  warn.mockReset();
  auditImpl = async event => {
    auditCalls.push(event);
  };
});

describe('statusText → 状态码必须翻成人话', () => {
  test('1/0/-1/-2 各自对应正常 / 冻结 / 已注销 / 待注销', () => {
    expect(statusText(1)).toBe('正常');
    expect(statusText(0)).toBe('冻结');
    expect(statusText(-1)).toBe('已注销');
    expect(statusText(-2)).toBe('待注销');
  });

  test('字符串数字按同一口径处理（数据库 TINYINT 取回来可能是字符串）', () => {
    expect(statusText('1')).toBe('正常');
    expect(statusText('0')).toBe('冻结');
  });

  test('未知值不猜：null 记「未知」，其它码原样标出', () => {
    expect(statusText(null)).toBe('未知');
    expect(statusText(undefined)).toBe('未知');
    expect(statusText(9)).toBe('状态9');
  });
});

describe('diffProfile → 只记真正变了的字段', () => {
  test('未提交的字段不算变化（PUT 是部分更新语义）', () => {
    const changes = diffProfile({ username: 'a', email: 'a@x.com', dept_id: 3, status: 1 }, {});
    expect(changes).toEqual([]);
  });

  test('账号 / 邮箱 / 部门的变化被逐字段记录', () => {
    const changes = diffProfile(
      { username: 'old', email: 'old@x.com', dept_id: 3, status: 1 },
      { username: 'new', email: 'old@x.com', deptId: 5 }
    );
    expect(changes).toEqual([
      { field: 'username', from: 'old', to: 'new' },
      { field: 'deptId', from: '3', to: '5' }
    ]);
  });

  test('status 记成中文，而不是 1 → 0', () => {
    const changes = diffProfile({ status: 1 }, { status: 0 });
    expect(changes).toEqual([{ field: 'status', from: '正常', to: '冻结' }]);
  });

  test("null / '' / undefined 视为同一件事，不产生假变更", () => {
    expect(diffProfile({ email: null }, { email: '' })).toEqual([]);
    expect(diffProfile({ dept_id: null }, { deptId: null })).toEqual([]);
  });

  test('值没变时不写「a → a」的噪音', () => {
    expect(diffProfile({ username: 'same' }, { username: 'same' })).toEqual([]);
  });
});

describe('roleNamesOf → 日志里要能读到角色名', () => {
  test('查到名字时按入参顺序返回', async () => {
    roleFindAll.mockResolvedValue([
      { id: 3, name: '超级管理员' },
      { id: 7, name: '观察者' }
    ]);
    expect(await roleNamesOf([7, 3])).toEqual(['观察者', '超级管理员']);
  });

  test('查不到的名字用 #id 占位，不丢信息', async () => {
    roleFindAll.mockResolvedValue([{ id: 3, name: '超级管理员' }]);
    expect(await roleNamesOf([3, 99])).toEqual(['超级管理员', '#99']);
  });

  test('查库异常时降级为 #id，不让审计拖垮业务', async () => {
    roleFindAll.mockRejectedValue(new Error('db down'));
    expect(await roleNamesOf([5])).toEqual(['#5']);
    expect(warn).toHaveBeenCalled();
  });

  test('空数组不查库', async () => {
    expect(await roleNamesOf([])).toEqual([]);
    expect(roleFindAll).not.toHaveBeenCalled();
  });
});

describe('auditUser → 操作者与目标必须落到同一条记录', () => {
  const request = {
    ip: '10.0.0.8',
    headers: { 'user-agent': 'Mozilla/5.0 test' },
    state: { user: { userId: 42 } }
  };

  test('事件码、appId、操作者、IP、UA 全部写入', async () => {
    await auditUser(request, USER_EVENTS.STATUS, {
      targetId: 7,
      targetUsername: '张三',
      details: { verb: '冻结' }
    });
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      type: 'USER_STATUS',
      userId: 42,
      ip: '10.0.0.8',
      userAgent: 'Mozilla/5.0 test',
      appId: 'console',
      details: { targetId: 7, targetUsername: '张三', verb: '冻结' }
    });
  });

  test('未登录上下文（脚本/定时任务）不抛，userId 落 null', async () => {
    await auditUser({ ip: '127.0.0.1', headers: {} }, USER_EVENTS.EXPORT, { details: { count: 3 } });
    expect(auditCalls[0].userId).toBeNull();
    expect(auditCalls[0].details).toMatchObject({ count: 3 });
  });

  test('写审计本身失败时吞掉异常（不能把记录失败变成操作失败）', async () => {
    auditImpl = async () => {
      throw new Error('审计库不可用');
    };
    await expect(auditUser(request, USER_EVENTS.STATUS, { targetId: 7 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

/* 路由是否真的调用了审计，统一由 conventions/console-audit-coverage.test.js 守 */
