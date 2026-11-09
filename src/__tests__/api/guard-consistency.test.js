/**
 * 守卫规则的一致性契约
 *
 * 背景（2026-11-09）：规则曾经有三份实现 —— `applyGuardLogic`（HTTP）、
 * `checkGuardBase`（WS 三级）、`registerSecureWebSocket` 里内联的 4~7 段（WS 路由级）。
 * 三处判据已经出现分叉：登录判据一处写 `!user`、两处写 `!user?.sub`；
 * WS 的那份还漏了 `requirePermission`。这类漂移不会报错，只会让"同一个配置在
 * HTTP 上放行、在 WS 上拒绝"这种问题在线上慢慢显形。
 *
 * 现在规则收成 `checkNodeAccess` + `checkNodeIdentity` 一份实现，本文件钉两件事：
 *   ① 对同一组 (配置, 用户, IP)，`checkGuardBase` 与 `applyGuardLogic` 判定**必须一致**，
 *      且阻塞时的文案也必须一致（WS 的 close reason 就是这段文案）；
 *   ② WS 与 HTTP 一样有重复注册检测。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

import { describe, it, expect } from '@jest/globals';

const { __test__applyGuardLogic, __test__checkGuardBase, registerSecureWebSocket } = await import('../../api/guard.js');

const USER = {
  sub: 'uid-uuid-string',
  userId: 7,
  appId: 'app1',
  roles: ['user'],
  permissions: { allows: ['order:read', 'order:write'], denies: [] }
};

/** 与 guard-fresh-permission.test.js 同款 reply 桩：记录实际发出的响应 */
function makeReply() {
  const r = {
    sent: false,
    statusCode: 200,
    body: null,
    result: {
      forbidden: msg => {
        r.sent = true;
        r.statusCode = 403;
        r.body = { forbidden: msg };
        return r;
      },
      unauth: msg => {
        r.sent = true;
        r.statusCode = 401;
        r.body = { unauth: msg };
        return r;
      }
    },
    code(c) {
      r.statusCode = c;
      return r;
    },
    send(b) {
      r.sent = true;
      r.body = b;
      return r;
    }
  };
  return r;
}

function makeRequest(user) {
  return { ip: '127.0.0.1', state: user === undefined ? {} : { user }, headers: {} };
}

/** 把 HTTP 的 reply 结果翻译成与 checkGuardBase 同构的 { passed, status, message } */
function httpVerdict(reply) {
  if (!reply.sent) return { passed: true };
  if (reply.statusCode === 401) return { passed: false, status: 4001, message: reply.body.unauth };
  return { passed: false, status: 4003, message: reply.body.forbidden };
}

/** 判定矩阵：覆盖 enabled / allowIps / requireLogin / allowRoles / requirePermission */
const CASES = [
  { name: '节点禁用', opts: { enabled: false }, user: USER },
  { name: 'IP 不在白名单', opts: { allowIps: ['10.0.0.0/8'] }, user: USER },
  { name: 'IP 命中白名单', opts: { allowIps: ['127.0.0.1'] }, user: USER },
  { name: '需要登录但无用户', opts: { requireLogin: true }, user: undefined },
  { name: '需要登录且已登录', opts: { requireLogin: true }, user: USER },
  { name: '角色不匹配', opts: { allowRoles: ['admin'] }, user: USER },
  { name: '角色匹配', opts: { allowRoles: ['user'] }, user: USER },
  { name: '无用户时角色校验', opts: { allowRoles: ['user'] }, user: undefined },
  { name: '权限不足', opts: { requirePermission: 'order:delete' }, user: USER },
  { name: '权限命中', opts: { requirePermission: 'order:read' }, user: USER },
  { name: 'any 权限命中一个', opts: { requirePermission: { any: ['x:none', 'order:write'] } }, user: USER },
  { name: 'all 权限缺一个', opts: { requirePermission: { all: ['order:read', 'x:none'] } }, user: USER },
  { name: '无用户时权限校验', opts: { requirePermission: 'order:read' }, user: undefined },
  {
    name: '组合：已登录 + IP + 角色 + 权限全部满足',
    opts: { allowIps: ['127.0.0.1'], allowRoles: ['user'], requireLogin: true, requirePermission: 'order:read' },
    user: USER
  },
  {
    name: '组合：前置条件全过但权限不足',
    opts: { allowIps: ['127.0.0.1'], requireLogin: true, requirePermission: 'order:delete' },
    user: USER
  }
];

describe('守卫规则 · HTTP 与 WS 必须同一份实现', () => {
  for (const { name, opts, user } of CASES) {
    it(`${name} → 两边判定与文案一致`, async () => {
      const base = __test__checkGuardBase(opts, user, '127.0.0.1');

      const reply = makeReply();
      await __test__applyGuardLogic(opts, makeRequest(user), reply);
      const http = httpVerdict(reply);

      expect(http.passed).toBe(base.passed);
      // status 决定 HTTP 是 401 还是 403，文案则直接作为 WS 的 close reason。
      // 三项打包比较（而不是 if 里逐个 expect）：jest/no-conditional-expect 禁止条件断言，
      // 而"通过时三项都该是 undefined"本身就是契约的一部分。
      expect({ status: http.status, message: http.message }).toEqual({
        status: base.status,
        message: base.message
      });
    });
  }
});

describe('WebSocket 路由注册', () => {
  it('空字符串组名不能被当成"没有组"（否则 API 级声明静默失效）', async () => {
    // 真实来源：`registerSecureWebSocket` 的 `targetGroup = group || currentGroup`，
    // 当两者都为空时 API 节点会落在 `groups['']` 下。若 getGuardConfig 用 `!groupKey`
    // 判空，这次查询会退化成"读系统节点" —— 该 WS 自己声明的 requireLogin /
    // requirePermission 全部失效，且日志上完全看不出异常。
    const { registerApiMetadata, getGuardConfig } = await import('../../api/guard-config.js');
    registerApiMetadata('empty-group-sys', '', 'ws:_probe', {
      url: '/ws/probe',
      method: 'WS',
      requireLogin: true,
      requirePermission: 'x:y:z'
    });

    const node = getGuardConfig('empty-group-sys', '', 'ws:_probe');
    expect(node).not.toBeNull();
    expect(node.requireLogin).toBe(true);
    expect(node.requirePermission).toBe('x:y:z');
  });

  it('同一 URL 注册两次 → 抛 DUPLICATE_ROUTE（与 HTTP 同款检测）', () => {
    const fakeFastify = { get() {} };
    const url = '/ws/dup-probe';

    registerSecureWebSocket(fakeFastify, { url, group: 'g1', handler: () => {} });
    let err;
    try {
      registerSecureWebSocket(fakeFastify, { url, group: 'g1', handler: () => {} });
    } catch (e) {
      err = e;
    }

    expect(err).toBeTruthy();
    expect(err.code).toBe('DUPLICATE_ROUTE');
    // 报错要说清是谁和谁撞了，否则只能靠翻代码找
    expect(err.message).toContain('首次注册');
    expect(err.message).toContain('重复注册');
  });
});
