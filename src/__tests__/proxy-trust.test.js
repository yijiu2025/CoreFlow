/**
 * 反向代理信任网段的过宽检测
 *
 * 这条判据守的是一条**看不见的边界**：`trustProxy` 里的每个网段，其来源都能自定义
 * `X-Forwarded-For`，于是 `request.ip` 变成攻击者可填的字符串。而 `request.ip` 是
 * `allowIps` 白名单、全局限流 key、按 IP 封禁的**唯一**判据 —— 网段写宽了，
 * 这三层同时失效，且没有任何报错（限流看起来在跑、封禁看起来在写，只是键值是伪造的）。
 *
 * 历史上 `.env.docker.example` 就给了 `172.16.0.0/12`（100 万个地址），
 * 等于把 IP 维度整体让出去。本文件把"什么算过宽"钉死。
 */
import { describe, it, expect, jest } from '@jest/globals';
// @fastify/static@10 依赖 **ESM-only** 的 content-disposition；Node 22.12+ 的 require(esm)
// 能跑通，但 jest 的 CJS 运行时不行 —— 于是任何 import src/app.js 的套件都会在加载阶段炸。
// 本文件只验证代理信任网段的过宽判定（describeProxyTrustRisk），与静态资源无关，所以用空插件替身；
// 真实的静态服务链路由 CI 的 compose 冒烟（GET /v1/health/ready + 站点资源）覆盖。
jest.unstable_mockModule('@fastify/static', () => ({ default: async () => {} }));
const { describeProxyTrustRisk } = await import('../app.js');

describe('describeProxyTrustRisk', () => {
  it('默认值（仅回环）没有风险', () => {
    expect(describeProxyTrustRisk(['127.0.0.1', '::1'])).toEqual([]);
  });

  it('单个主机地址（无前缀）永远安全', () => {
    expect(describeProxyTrustRisk(['172.18.0.2', '203.0.113.7'])).toEqual([]);
  });

  it('精确到 /32 的代理地址没有风险', () => {
    expect(describeProxyTrustRisk(['172.18.0.2/32'])).toEqual([]);
  });

  it('单个子网 /24 可接受（正常部署形态，不制造噪音告警）', () => {
    expect(describeProxyTrustRisk(['172.18.0.0/24'])).toEqual([]);
  });

  it('Docker 默认桥接 /16 也放行（不误报常见部署）', () => {
    expect(describeProxyTrustRisk(['172.17.0.0/16'])).toEqual([]);
  });

  it('🔴 172.16.0.0/12 被判定为过宽（历史默认值，必须报出来）', () => {
    const risks = describeProxyTrustRisk(['172.16.0.0/12']);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toContain('172.16.0.0/12');
  });

  it('🔴 0.0.0.0/0 与 ::/0 被判定为「等价于关闭 IP 维度」', () => {
    expect(describeProxyTrustRisk(['0.0.0.0/0'])[0]).toContain('全部来源');
    expect(describeProxyTrustRisk(['::/0'])[0]).toContain('全部来源');
  });

  it('10.0.0.0/8 同样过宽', () => {
    expect(describeProxyTrustRisk(['10.0.0.0/8'])).toHaveLength(1);
  });

  it('IPv6 前缀过窄（≤ /32）被报出，/64 放行', () => {
    expect(describeProxyTrustRisk(['2001:db8::/32'])).toHaveLength(1);
    expect(describeProxyTrustRisk(['2001:db8::/64'])).toEqual([]);
  });

  it('混合列表只报有风险的那几条', () => {
    const risks = describeProxyTrustRisk(['127.0.0.1', '172.16.0.0/12', '172.18.0.2/32']);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toContain('/12');
  });

  it('空值 / 脏值不抛错（非法写法交给 Fastify 自己报）', () => {
    expect(() => describeProxyTrustRisk([])).not.toThrow();
    expect(() => describeProxyTrustRisk(undefined)).not.toThrow();
    expect(() => describeProxyTrustRisk([''])).not.toThrow();
    expect(() => describeProxyTrustRisk(['not-an-ip/x'])).not.toThrow();
    expect(describeProxyTrustRisk(['not-an-ip/x'])).toEqual([]);
  });
});
