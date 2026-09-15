/**
 * auth 公共契约测试（跨模块 API 对账）
 *
 * 守护「framework/auth 对外暴露的符号」与「调用方实际解构的符号」一致。
 * 起因：deactivation.service.js 解构 `sidHash` 却因 session.js 未导出而拿到
 * undefined，注销时会话清理必抛 TypeError（AUDIT-REPORT-2026-09-12.md 🔴-2）。
 * 本测试把该契约固化，防止再次漂移。
 *
 * 2026-09-14 扩充：session.js 按职责拆为 4 文件后（批次 C），追加「拆分回归」组，
 * 守护「行数硬限 / 子模块无环 / 公开面不膨胀 / 底座不反向依赖」四项不变量。
 *
 * @author yijiu2025
 * @since 2026-09-14
 */

import { describe, test, expect } from '@jest/globals';
import crypto from 'node:crypto';

describe('auth 公共契约（🔴-2 回归）', () => {
  describe('session.js 导出完整性', () => {
    /** 外部调用方实际解构使用的符号（与 src/app、src/api 下的 import 保持一致） */
    const REQUIRED_EXPORTS = [
      // deactivation.service.js 使用
      'sidHash',
      'deleteRefreshTokensForSession',
      // api/user/v1/sessions.js 使用
      'checkMaxSessions',
      'kickSession',
      'kickAllSessions',
      // api/admin/user/v1/sessions.js 使用
      'kickByDeviceId',
      // api/auth/v1/session.js 使用
      'refreshSession',
      // api/auth/v1/verify-challenge.js 使用
      'updateSessionBaseline',
      'getSessionTokenDevice',
      // api/oauth21/v1/logout.js 使用
      'destroySession',
      // session-api.service.js 使用
      'createSession',
      'updateRememberMe',
      'switchSessionByRefreshToken',
      'revokeRememberMe',
      // 其他内部/测试使用
      'getSession',
      'refreshSessionCore',
      'pruneActiveDevices',
      'pruneStaleSessionTokens',
      'kickUser',
      'logLoginFailure',
      'getSessionStats',
      'getLoginTrend',
      // 设备类型透传
      'DEVICE_TYPE',
      'detectDeviceType'
    ];

    test('所有被外部解构的符号都已导出且非 undefined', async () => {
      const mod = await import('../../../framework/auth/session.js');
      const missing = REQUIRED_EXPORTS.filter(name => mod[name] === undefined);
      expect(missing).toEqual([]);
    });

    test('sidHash 计算 sha256 hex，与 DB token 列存格式一致', async () => {
      const { sidHash } = await import('../../../framework/auth/session.js');
      const sid = 'some-raw-session-id';
      expect(sidHash(sid)).toBe(crypto.createHash('sha256').update(sid).digest('hex'));
      expect(sidHash(sid)).toMatch(/^[0-9a-f]{64}$/);
    });

    test('导出集合不因拆分而膨胀（内部符号不外泄）', async () => {
      const mod = await import('../../../framework/auth/session.js');
      // 批次 C 把 6 个 Redis 实例 / 常量 / 私有原语挪进 session-store.js，
      // 它们只应被兄弟模块 import，不应进入 session.js 的公开面
      const INTERNAL = [
        'sessionStore',
        'refreshStore',
        'userRefreshStore',
        'rotatedStore',
        'familyStore',
        'userSessionsStore',
        'MAX_REFRESH_TOKENS',
        'MAX_ACTIVE_DEVICES',
        'revokeFamily',
        '_kickSession',
        '_revokeOneSession'
      ];
      expect(INTERNAL.filter(name => mod[name] !== undefined)).toEqual([]);
      // 公开面恰好 24 项（与拆分前逐字一致）
      expect(Object.keys(mod).length).toBe(24);
    });
  });

  describe('redis 命名空间一致性（🔴-3 回归）', () => {
    test('session 子模块与 deactivation.service.js 使用同一 user_sessions 命名空间', async () => {
      const { readFileSync, readdirSync } = await import('node:fs');
      const root = new URL('../../../', import.meta.url);
      // 批次 C 拆分后，6 个 getStore 实例集中在 session-store.js
      const storeSrc = readFileSync(new URL('framework/auth/session-store.js', root), 'utf8');
      const deactSrc = readFileSync(new URL('app/user/services/deactivation.service.js', root), 'utf8');

      expect(storeSrc).toMatch(/getStore\('user_sessions'/);
      expect(deactSrc).toMatch(/getStore\('user_sessions'/);
      // 驼峰写法会导致命名空间隔离 → 清理静默失效
      expect(storeSrc).not.toMatch(/getStore\('userSessions'/);
      expect(deactSrc).not.toMatch(/getStore\('userSessions'/);

      // 全 auth 目录扫描：防拆分产生的新文件再次写错命名空间
      const authDir = new URL('framework/auth/', root);
      const offenders = readdirSync(authDir)
        .filter(f => f.endsWith('.js'))
        .filter(f => /getStore\('userSessions'/.test(readFileSync(new URL(f, authDir), 'utf8')));
      expect(offenders).toEqual([]);
    });

    test('同命名空间（不同 timeout）读写双向可见', async () => {
      const { getStore } = await import('../../../framework/redis/index.js');
      const writer = getStore('user_sessions');
      const reader = getStore('user_sessions', { timeout: 3000 });

      const key = 'contract-probe:' + Date.now();
      await writer.set(key, 'visible', 60);
      expect(await reader.get(key)).toBe('visible');
      expect(await writer.get(key)).toBe('visible');
    });
  });

  describe('session 子模块拆分回归（批次 C）', () => {
    const SESSION_FILES = ['session.js', 'session-store.js', 'session-kick.js', 'session-governance.js'];
    const readAuth = async f => {
      const { readFileSync } = await import('node:fs');
      const root = new URL('../../../', import.meta.url);
      return readFileSync(new URL(`framework/auth/${f}`, root), 'utf8');
    };
    /** 只认行首的 import/export 语句，避免注释里的路径字面量造成假依赖 */
    const depsOf = src => {
      const deps = [];
      for (const line of src.split('\n')) {
        if (!/^\s*(import|export)\s/.test(line) && !/^\}\sfrom/.test(line)) continue;
        const m = /from\s+'\.\/([A-Za-z0-9_.-]+\.js)'/.exec(line);
        if (m) deps.push(m[1]);
      }
      return deps;
    };

    test('四个文件均不超过 1000 行硬限（fullstack-rules）', async () => {
      const tooLong = [];
      for (const f of SESSION_FILES) {
        const n = (await readAuth(f)).split('\n').length - 1;
        if (n > 1000) tooLong.push(`${f} = ${n} 行`);
      }
      expect(tooLong).toEqual([]);
    });

    test('拆分后子模块依赖无环', async () => {
      const graph = new Map();
      for (const f of SESSION_FILES) {
        graph.set(
          f,
          depsOf(await readAuth(f)).filter(d => SESSION_FILES.includes(d))
        );
      }
      // DFS 三色查环
      const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
      const color = new Map(SESSION_FILES.map(f => [f, WHITE]));
      const cycles = [];
      const dfs = (n, stack) => {
        color.set(n, GRAY);
        stack.push(n);
        for (const d of graph.get(n) || []) {
          if (color.get(d) === GRAY) cycles.push([...stack.slice(stack.indexOf(d)), d].join(' -> '));
          else if (color.get(d) === WHITE) dfs(d, stack);
        }
        stack.pop();
        color.set(n, BLACK);
      };
      for (const f of SESSION_FILES) if (color.get(f) === WHITE) dfs(f, []);
      expect(cycles).toEqual([]);
    });

    test('共享底座 session-store.js 不依赖任何兄弟子模块（无环的最底层）', async () => {
      const siblings = SESSION_FILES.filter(f => f !== 'session-store.js');
      const deps = depsOf(await readAuth('session-store.js'));
      expect(deps.filter(d => siblings.includes(d))).toEqual([]);
    });

    test('_revokeOneSession 已收敛各踢出路径的重复动作（🔵-3）', async () => {
      const src = await readAuth('session-kick.js');
      // 4 处调用：_kickSession / kickSession / kickAllSessions / kickUser
      expect((src.match(/await _revokeOneSession\(/g) || []).length).toBe(4);
      // 1 处定义
      expect((src.match(/^async function _revokeOneSession\(/gm) || []).length).toBe(1);
      // 删 Redis session 与失效 sid_r 各应只出现在底座 helper 内部一处；
      // 数量上升即说明某个入口又长出了重复实现
      expect((src.match(/await sessionStore\.delete\(/g) || []).length).toBe(1);
      expect((src.match(/await deleteRefreshTokensForSession\(/g) || []).length).toBe(1);
    });
  });
});
