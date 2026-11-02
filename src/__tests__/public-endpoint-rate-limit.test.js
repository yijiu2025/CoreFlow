/**
 * 公开端点的路由级限流：声明契约 + 生效验证
 *
 * 背景（2026-11-02）：路由级 `config.rateLimit` 此前**从未生效**（插件因
 * `enableRateLimit=false` 不注册）。修好之后，一批「公开 + 消耗凭证/CPU」的端点仍
 * 没有声明限流，属于裸露的滥用面，本文件把补充的声明钉住：
 *
 *   /auth/v1/bind-token              30/min  groupId=bind-token
 *   /auth/v1/bind-session            30/min  groupId=bind-session
 *   /oauth2.1/token + /revoke        60/min  groupId=oauth-token（同一流程共桶）
 *   /oauth2.1/device_authorization、/device/token、/device、/device/authorize
 *                                    20/min  groupId=oauth-device（同一流程共桶）
 *   /firewall/v1/challenge/verify    20/min  groupId=challenge-verify
 *
 * 两类断言：
 *   ① **源码契约**：这些声明不能被悄悄删掉/改数值（逐路由截取代码块比对）；
 *   ② **行为验证**：走真实的 `registerRateLimit()` 注册路径，确认「声明 → 429」真的成立，
 *      且不同 `groupId` 各自独立计数（隔离语义不能靠约定，得测）。
 *
 * @author yijiu2025
 * @since 2026-11-02
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');

/** 期望声明：文件 → 路由名 → { max, groupId } */
const EXPECTED = {
  'api/auth/v1/session.js': {
    bindToken: { max: 30, groupId: 'bind-token' },
    bindSession: { max: 30, groupId: 'bind-session' }
  },
  'api/oauth21/v1/token.js': {
    issueToken: { max: 60, groupId: 'oauth-token' },
    revokeToken: { max: 60, groupId: 'oauth-token' }
  },
  'api/oauth21/v1/device.js': {
    deviceCode: { max: 20, groupId: 'oauth-device' },
    deviceToken: { max: 20, groupId: 'oauth-device' },
    devicePage: { max: 20, groupId: 'oauth-device' },
    deviceAuthorize: { max: 20, groupId: 'oauth-device' }
  },
  'api/firewall/v1/challenge.js': {
    verify: { max: 20, groupId: 'challenge-verify' }
  }
};

/** 截取某个路由的注册代码块（从 name 行到下一个 registerSecureRoute 之前） */
function routeBlock(src, routeName) {
  const start = src.indexOf(`name: '${routeName}'`);
  if (start < 0) return null;
  const next = src.indexOf('registerSecureRoute(', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('公开端点限流：声明契约', () => {
  for (const [file, routes] of Object.entries(EXPECTED)) {
    it(`${file} 的路由带独立 groupId 与阈值`, () => {
      const src = fs.readFileSync(path.join(SRC, file), 'utf-8');

      for (const [routeName, { max, groupId }] of Object.entries(routes)) {
        const block = routeBlock(src, routeName);
        expect(block).not.toBeNull();
        expect(block).toContain('config:');
        expect(block).toContain('rateLimit:');
        expect(block).toContain(`max: ${max}`);
        expect(block).toContain(`groupId: '${groupId}'`);
      }
    });
  }
});

describe('公开端点限流：真实注册路径下确实生效', () => {
  let app;

  beforeAll(async () => {
    // 用 framework 的默认策略矩阵当配置源（enableRateLimit=false / enableEndpointRateLimit=true）
    const { DEFAULT_SECURITY_SETTINGS } = await import('../framework/firewall/config/defaults.js');
    const { registerSettingsReader } = await import('../framework/firewall/interface/config-access.js');
    registerSettingsReader(() => DEFAULT_SECURITY_SETTINGS);

    const { registerRateLimit } = await import('../framework/firewall/engine/detectors/first-ratelimit.js');

    app = Fastify({ logger: false });
    await registerRateLimit(app);

    // 用极小阈值模拟「声明即生效」；groupId 分别隔离/共享，覆盖两种语义
    const limited = (name, groupId) => ({
      config: { rateLimit: { max: 2, timeWindow: '1 minute', groupId } }
    });
    app.post('/isolated-a', limited('a', 'group-a'), async () => ({ ok: true }));
    app.post('/isolated-b', limited('b', 'group-b'), async () => ({ ok: true }));
    app.post('/shared-1', limited('s1', 'group-shared'), async () => ({ ok: true }));
    app.post('/shared-2', limited('s2', 'group-shared'), async () => ({ ok: true }));
    app.post('/unlimited', async () => ({ ok: true }));
    await app.ready();
  });

  const hit = async url => (await app.inject({ method: 'POST', url })).statusCode;

  it('超过声明阈值后返回 429', async () => {
    expect(await hit('/isolated-a')).toBe(200);
    expect(await hit('/isolated-a')).toBe(200);
    expect(await hit('/isolated-a')).toBe(429);
  });

  it('不同 groupId 各自独立计数（A 打满不影响 B）', async () => {
    expect(await hit('/isolated-b')).toBe(200);
  });

  it('相同 groupId 的多个端点共享一个桶（分组配额语义）', async () => {
    expect(await hit('/shared-1')).toBe(200);
    expect(await hit('/shared-2')).toBe(200);
    // 两次已把 group-shared 用满，任一端点再来都超限
    expect(await hit('/shared-1')).toBe(429);
  });

  it('未声明 config.rateLimit 的路由不受影响（global=false 只对声明路由生效）', async () => {
    for (let i = 0; i < 5; i++) expect(await hit('/unlimited')).toBe(200);
  });
});
