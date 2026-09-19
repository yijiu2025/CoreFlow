/**
 * 系统健康探针测试
 *
 * 覆盖：/health/live（恒 200）、/health/ready（关键依赖不可用 → 503）、
 * /health（兼容端点恒 200），以及防火墙管道对探针路径的深度检测豁免。
 *
 * 【为什么探针豁免要放在同一个文件里测】
 * 两者是一组：探针若被自家 Bot 检测拦下（返回挑战页 200 或 429），
 * 就表现为"探针看起来通过、实际完全失效"或"健康实例被编排系统摘掉"。
 * 只验证状态码分级而不管豁免，等于验证了一个会在生产里退回错误答案的探针。
 *
 * 【为什么只能建一个 app】
 * `registerSecureRoute` 的 `_routeRegistry`（api/guard.js）是模块级全局状态且无重置入口，
 * 同一 URL 在一个测试文件内只能注册一次。因此依赖状态通过
 * 「改环境变量 + 改 app.redisHealthy」来切换，而不是反复重建 app。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import globalsLoader from '../../framework/loader/registry/00-globals.js';
import registerHealthRoutes from '../../api/system/v1/health.js';
import { shouldSkipDeepCheck, PROBE_PATHS } from '../../app/firewall/engine/pipeline.js';

/** @type {import('fastify').FastifyInstance} */
let app;

/** 探测路径的原始状态，便于用例结束后还原环境 */
const envBackup = {
  REDIS_ENABLED: process.env.REDIS_ENABLED,
  REDIS_HOST: process.env.REDIS_HOST
};

/** 发起一次探针请求 */
const probe = url => app.inject({ method: 'GET', url });

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(globalsLoader); // 真实 reply.result 装饰器
  await app.register(registerHealthRoutes); // 真实路由插件
  await app.ready();
});

afterAll(async () => {
  await app.close();
  process.env.REDIS_ENABLED = envBackup.REDIS_ENABLED;
  process.env.REDIS_HOST = envBackup.REDIS_HOST;
});

describe('健康探针分级', () => {
  it('三个端点都已真实注册（路径为 /v1/health/live|ready|health）', async () => {
    const [live, ready, legacy] = await Promise.all([
      probe('/v1/health/live'),
      probe('/v1/health/ready'),
      probe('/v1/health')
    ]);

    for (const res of [live, ready, legacy]) {
      expect(res.statusCode).not.toBe(404);
    }
  });

  it('/health/live 只反映进程存活：依赖不可用时仍 200', async () => {
    // 把 Redis 配成"已配置但不可用"
    process.env.REDIS_ENABLED = 'true';
    process.env.REDIS_HOST = '192.0.2.1'; // TEST-NET-1，必然不可达
    app.redisHealthy = false;

    const res = await probe('/v1/health/live');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ code: 200, data: { status: 'ok' } });
    // 存活探针不触碰外部依赖，因此响应里不应出现依赖明细
    expect(res.json().data).not.toHaveProperty('dependencies');
  });

  it('/health/ready 在依赖未配置时返回 200（skipped 不判失败）', async () => {
    // 未配置 Redis：访问层走进程内 MapStore 降级，是合法模式而非故障
    delete process.env.REDIS_ENABLED;

    const res = await probe('/v1/health/ready');
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe(200);
    expect(body.data.dependencies).toHaveProperty('database');
    expect(body.data.dependencies.redis.status).toBe('skipped');
  });

  it('/health/ready 在已配置的依赖不可用时返回 503，并给出明细', async () => {
    process.env.REDIS_ENABLED = 'true';
    process.env.REDIS_HOST = '192.0.2.1';
    app.redisHealthy = false;

    const res = await probe('/v1/health/ready');
    const body = res.json();

    // 这是本端点存在的全部意义：让编排系统能把坏实例摘出负载均衡池
    expect(res.statusCode).toBe(503);
    expect(body.code).toBe(503);
    expect(body.message).toBe('服务未就绪');
    expect(body.data.status).toBe('unavailable');
    expect(body.data.dependencies.redis).toMatchObject({ status: 'down' });
  });

  it('/health/ready 在依赖恢复后回到 200', async () => {
    app.redisHealthy = true;

    const res = await probe('/v1/health/ready');

    expect(res.statusCode).toBe(200);
    expect(res.json().data.dependencies.redis.status).toBe('up');
  });

  it('/health（兼容端点）在依赖不可用时仍 200，且保留历史字段', async () => {
    app.redisHealthy = false;

    const res = await probe('/v1/health');
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.data).toHaveProperty('status', 'ok');
    expect(body.data).toHaveProperty('uptime');
    expect(body.data).toHaveProperty('redis', 'disconnected');
  });

  it('带查询串不影响探针判定', async () => {
    app.redisHealthy = false;
    expect((await probe('/v1/health/ready?probe=kube')).statusCode).toBe(503);

    app.redisHealthy = true;
    expect((await probe('/v1/health/ready?probe=kube')).statusCode).toBe(200);
  });
});

describe('探针路径的深度检测豁免', () => {
  it('三个探针路径都被判定为可跳过深度检测', () => {
    for (const path of PROBE_PATHS) {
      expect(shouldSkipDeepCheck(path)).toBe(true);
    }
  });

  it('带查询串时同样跳过', () => {
    expect(shouldSkipDeepCheck('/v1/health/ready?x=1')).toBe(true);
  });

  it('反例：普通业务路径不被跳过（否则豁免范围就失控了）', () => {
    expect(shouldSkipDeepCheck('/v1/user/userinfo')).toBe(false);
    expect(shouldSkipDeepCheck('/v1/healthz')).toBe(false);
    expect(shouldSkipDeepCheck('/v1/health/ready-extra')).toBe(false);
  });
});
