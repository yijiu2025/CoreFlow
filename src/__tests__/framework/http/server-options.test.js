/**
 * Fastify 构造参数
 *
 * 两个"写错了也不会报错"的点在这里被钉住：
 *   ① 生产环境日志的 `req` 序列化器必须剥掉 query —— 否则 `?code=...&token=...`
 *      会原样进 ELK/Loki（OAuth 授权码与令牌就是这么泄露的）；
 *   ② 请求 ID 只接受受限字符，否则攻击者可以用换行注入污染日志。
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildServerOptions,
  buildLoggerOptions,
  genReqId,
  resolveHttpTimeouts
} from '../../../framework/http/server-options.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('buildServerOptions', () => {
  it('请求体上限 / 强制关闭长连接 / 超时都显式声明（不依赖 Fastify 隐式默认）', () => {
    const options = buildServerOptions({ isProduction: false, trustProxy: ['127.0.0.1'] });
    expect(options.bodyLimit).toBe(5 * 1024 * 1024);
    expect(options.forceCloseConnections).toBe(true);
    expect(Number.isInteger(options.keepAliveTimeout)).toBe(true);
    expect(Number.isInteger(options.requestTimeout)).toBe(true);
    expect(options.trustProxy).toEqual(['127.0.0.1']);
  });

  it('trustProxy 原样透传（收窄由 utils/proxy-trust 负责，此处不做二次解释）', () => {
    const options = buildServerOptions({ trustProxy: ['172.18.0.2/32'] });
    expect(options.trustProxy).toEqual(['172.18.0.2/32']);
  });

  it('未给参数时有安全默认值（不信任任何代理 → 空数组）', () => {
    expect(buildServerOptions().trustProxy).toEqual([]);
  });

  it('不认识的调优项不会混进选项（Fastify 会静默丢弃，写进来只会骗自己）', () => {
    const options = buildServerOptions();
    expect(options).not.toHaveProperty('headersTimeout');
    expect(options).not.toHaveProperty('timeout');
  });
});

describe('resolveHttpTimeouts', () => {
  it('返回值恒为合法毫秒数（缺配置时用保底值）', () => {
    const { keepAliveTimeoutMs, requestTimeoutMs } = resolveHttpTimeouts();
    expect(Number.isInteger(keepAliveTimeoutMs)).toBe(true);
    expect(Number.isInteger(requestTimeoutMs)).toBe(true);
    expect(keepAliveTimeoutMs).toBeGreaterThanOrEqual(0);
    expect(requestTimeoutMs).toBeGreaterThanOrEqual(0);
  });
});

describe('buildLoggerOptions', () => {
  it('开发环境走 pino-pretty，生产环境不美化（JSON 供采集）', () => {
    expect(buildLoggerOptions(false).transport.target).toBe('pino-pretty');
    expect(buildLoggerOptions(true).transport).toBeUndefined();
  });

  it('🔴 生产环境 req 序列化器剥离 query（code / token / sign 不得进日志）', () => {
    const { serializers } = buildLoggerOptions(true);
    const out = serializers.req({
      method: 'GET',
      url: '/oauth/authorize?code=SECRET&token=SECRET2&sign=SECRET3',
      hostname: 'api.example.com',
      ip: '203.0.113.7',
      id: 'req-1'
    });
    expect(out.url).toBe('/oauth/authorize');
    expect(JSON.stringify(out)).not.toContain('SECRET');
    expect(out).toMatchObject({ method: 'GET', remoteAddress: '203.0.113.7', requestId: 'req-1' });
  });
});

describe('genReqId', () => {
  it('合法入站 X-Request-Id 原样沿用（全链路追踪）', () => {
    expect(genReqId({ headers: { 'x-request-id': 'abc-123.4' } })).toBe('abc-123.4');
  });

  it('缺省 / 非字符串 → 生成 UUID', () => {
    expect(genReqId({ headers: {} })).toMatch(UUID_RE);
    expect(genReqId({ headers: { 'x-request-id': ['a', 'b'] } })).toMatch(UUID_RE);
  });

  it('🔴 换行 / 空格 / 超长 / 特殊字符一律拒绝（防日志注入）', () => {
    expect(genReqId({ headers: { 'x-request-id': 'a\nb' } })).toMatch(UUID_RE);
    expect(genReqId({ headers: { 'x-request-id': 'a b' } })).toMatch(UUID_RE);
    expect(genReqId({ headers: { 'x-request-id': 'x'.repeat(129) } })).toMatch(UUID_RE);
    expect(genReqId({ headers: { 'x-request-id': '../../etc/passwd' } })).toMatch(UUID_RE);
  });
});
