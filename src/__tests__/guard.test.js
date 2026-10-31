/**
 * 三级级联守卫：IP 匹配 + 权限判定
 *
 * ⚠️ 为什么重写：旧版本的后两段 `describe` 在文件内**重新实现了一遍**被测逻辑
 * （`checkAccess` 与 `isPermissionMatch/matchSingle/checkPermission`，注释写着
 * "模拟 applyGuardLogic 的核心逻辑"），然后断言自己刚写的东西 —— 生产代码改坏、
 * 甚至整个删掉，它们都照样全绿。这类"副本测试"最危险的地方是：副本与真身漂移后，
 * 测试会**固化一个与线上相反**的结论。
 *
 * 现在两段都改为驱动真身 `__test__applyGuardLogic`（`src/api/guard.js` 专门为此导出的
 * 非公开入口，正常路径是 createGuard 生成的 preHandler）。
 * IP 匹配那一段原本就是真的，保留并补上边界。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-31 权限判定改为真身驱动（此前为内联副本）
 */
import { describe, test, expect } from '@jest/globals';
import { isIpMatch } from '../utils/ip.js';
import { __test__applyGuardLogic as applyGuardLogic } from '../api/guard.js';

/** 记录型 reply：只关心"守卫最终调了哪个 result 方法" */
function makeReply() {
  const reply = { calls: [], sent: false, statusCode: 200, body: null };
  const record = name => message => {
    reply.calls.push({ name, message });
    reply.sent = true;
    reply.statusCode = name === 'unauth' ? 401 : name === 'forbidden' ? 403 : 200;
    return reply;
  };
  reply.result = {
    success: record('success'),
    unauth: record('unauth'),
    forbidden: record('forbidden'),
    badRequest: record('badRequest')
  };
  reply.code = c => {
    reply.statusCode = c;
    return reply;
  };
  reply.send = b => {
    reply.sent = true;
    reply.body = b;
    return reply;
  };
  return reply;
}

const makeRequest = (user, ip = '127.0.0.1') => ({ ip, state: { user }, headers: {} });
const userWith = (allows, denies = []) => ({ sub: 1, roles: ['user'], permissions: { allows, denies } });

describe('IP 匹配引擎 (isIpMatch)', () => {
  test('通配符 * 应匹配所有 IP', () => {
    expect(isIpMatch('192.168.1.100', '*')).toBe(true);
    expect(isIpMatch('10.0.0.1', '*')).toBe(true);
  });

  test('0.0.0.0/0 应匹配所有 IP', () => {
    expect(isIpMatch('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  test('精确匹配', () => {
    expect(isIpMatch('192.168.1.100', '192.168.1.100')).toBe(true);
    expect(isIpMatch('192.168.1.100', '192.168.1.101')).toBe(false);
  });

  test('通配符模式: 192.168.1.*', () => {
    expect(isIpMatch('192.168.1.1', '192.168.1.*')).toBe(true);
    expect(isIpMatch('192.168.1.254', '192.168.1.*')).toBe(true);
    expect(isIpMatch('192.168.2.1', '192.168.1.*')).toBe(false);
  });

  test('🔴 通配符按段比对：192.168.*.1 不会把整段 192.168. 都放进来', () => {
    // 旧实现是 `cleanIp.startsWith(rule.split('*')[0])` → 前缀是 '192.168.'，
    // 于是 192.168.55.2 这种明显不符合 "第四段必须是 1" 的地址也会被放行，
    // allowIps 白名单因此比配置写的更宽。
    expect(isIpMatch('192.168.5.1', '192.168.*.1')).toBe(true);
    expect(isIpMatch('192.168.55.1', '192.168.*.1')).toBe(true);
    expect(isIpMatch('192.168.55.2', '192.168.*.1')).toBe(false);
    expect(isIpMatch('192.169.5.1', '192.168.*.1')).toBe(false);
  });

  test('通配符规则不适用于 IPv6（避免通配串误吃 IPv6 地址）', () => {
    expect(isIpMatch('2001:db8::1', '2001:db8::*')).toBe(false);
  });

  test('CIDR 规则: 192.168.1.0/24', () => {
    expect(isIpMatch('192.168.1.1', '192.168.1.0/24')).toBe(true);
    expect(isIpMatch('192.168.1.255', '192.168.1.0/24')).toBe(true);
    expect(isIpMatch('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  test('CIDR 规则: 10.0.0.0/8 与 172.16.0.0/12', () => {
    expect(isIpMatch('10.0.0.1', '10.0.0.0/8')).toBe(true);
    expect(isIpMatch('10.255.255.255', '10.0.0.0/8')).toBe(true);
    expect(isIpMatch('11.0.0.1', '10.0.0.0/8')).toBe(false);

    expect(isIpMatch('172.16.0.1', '172.16.0.0/12')).toBe(true);
    expect(isIpMatch('172.31.255.255', '172.16.0.0/12')).toBe(true);
    expect(isIpMatch('172.32.0.1', '172.16.0.0/12')).toBe(false);
  });

  test('IPv6 精确 / CIDR / ::/0', () => {
    expect(isIpMatch('2001:db8::1', '2001:db8::1')).toBe(true);
    expect(isIpMatch('2001:db8::1', '2001:db8::2')).toBe(false);
    expect(isIpMatch('2001:db8::1', '::/0')).toBe(true);
    expect(isIpMatch('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(isIpMatch('2001:db8::1', '2001:db8::/64')).toBe(true);
    expect(isIpMatch('2001:db9::1', '2001:db8::/32')).toBe(false);
  });

  test('IPv4-mapped IPv6 兼容匹配', () => {
    expect(isIpMatch('::ffff:192.168.1.100', '192.168.1.0/24')).toBe(true);
    expect(isIpMatch('192.168.1.100', '::ffff:192.168.1.0/24')).toBe(true);
  });
});

describe('权限判定（真身 applyGuardLogic）', () => {
  test('单个权限精确命中 → 放行', async () => {
    const reply = makeReply();
    await applyGuardLogic({ requirePermission: 'fw:config:read' }, makeRequest(userWith(['fw:config:read'])), reply);
    expect(reply.sent).toBe(false);
  });

  test('尾部通配符 fw:admin:* 命中其子权限，但不命中兄弟前缀', async () => {
    const user = userWith(['fw:admin:*']);

    const hit = makeReply();
    await applyGuardLogic({ requirePermission: 'fw:admin:reset' }, makeRequest(user), hit);
    expect(hit.sent).toBe(false);

    const miss = makeReply();
    await applyGuardLogic({ requirePermission: 'fw:config:read' }, makeRequest(user), miss);
    expect(miss.calls[0].name).toBe('forbidden');
  });

  test('全局通配符 * 放行任意权限', async () => {
    const reply = makeReply();
    await applyGuardLogic({ requirePermission: 'anything:here' }, makeRequest(userWith(['*'])), reply);
    expect(reply.sent).toBe(false);
  });

  test('deny 优先于 allows 里的 *（这是本仓权限模型的核心语义）', async () => {
    const reply = makeReply();
    await applyGuardLogic({ requirePermission: 'user:delete' }, makeRequest(userWith(['*'], ['user:delete'])), reply);
    expect(reply.calls[0].name).toBe('forbidden');
  });

  test('deny 支持通配符：denies 里的 user:* 拦掉全部 user 子权限', async () => {
    const reply = makeReply();
    await applyGuardLogic({ requirePermission: 'user:read' }, makeRequest(userWith(['*'], ['user:*'])), reply);
    expect(reply.calls[0].name).toBe('forbidden');
  });

  test('any 模式（OR）：命中任一即放行，全不中则 403', async () => {
    const ok = makeReply();
    await applyGuardLogic(
      { requirePermission: { any: ['fw:config:read', 'fw:admin:*'] } },
      makeRequest(userWith(['fw:config:read'])),
      ok
    );
    expect(ok.sent).toBe(false);

    const no = makeReply();
    await applyGuardLogic(
      { requirePermission: { any: ['fw:block:write', 'fw:admin:*'] } },
      makeRequest(userWith(['fw:config:read'])),
      no
    );
    expect(no.calls[0].name).toBe('forbidden');
  });

  test('all 模式（AND）：缺一项即 403，提示列出全部所需权限', async () => {
    const ok = makeReply();
    await applyGuardLogic(
      { requirePermission: { all: ['fw:config:read', 'fw:config:write'] } },
      makeRequest(userWith(['fw:config:read', 'fw:config:write'])),
      ok
    );
    expect(ok.sent).toBe(false);

    const no = makeReply();
    await applyGuardLogic(
      { requirePermission: { all: ['fw:config:read', 'fw:admin:*'] } },
      makeRequest(userWith(['fw:config:read'])),
      no
    );
    expect(no.calls[0].name).toBe('forbidden');
    expect(no.calls[0].message).toContain('fw:config:read, fw:admin:*');
  });

  test('空权限集合 → 403（不是"没配权限就放行"）', async () => {
    const reply = makeReply();
    await applyGuardLogic({ requirePermission: 'fw:config:read' }, makeRequest(userWith([])), reply);
    expect(reply.calls[0].name).toBe('forbidden');
  });

  test('未登录访问需权限的接口 → 401 unauth', async () => {
    const reply = makeReply();
    await applyGuardLogic({ requirePermission: 'fw:config:read' }, makeRequest(null), reply);
    expect(reply.calls[0].name).toBe('unauth');
  });

  test('非法权限格式 fail-closed（403，而不是静默放行）', async () => {
    const reply = makeReply();
    await applyGuardLogic({ requirePermission: { invalid: ['a:read'] } }, makeRequest(userWith(['*'])), reply);
    expect(reply.calls[0].name).toBe('forbidden');
  });
});
