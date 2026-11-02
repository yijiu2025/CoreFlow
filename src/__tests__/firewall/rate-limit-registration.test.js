/**
 * 限流插件「是否注册 / 注册成什么样」的决策测试
 *
 * 为什么需要这组测试：`config.rateLimit`（含 `groupId` 计数隔离）由 `@fastify/rate-limit`
 * 的 **onRoute 钩子**消费，插件不注册 → 全仓 14 处端点声明静默失效（Fastify 不校验未知
 * route config，连警告都没有）。历史上 `enableRateLimit=false` 就直接 `return`，导致
 * h5-token 的 30 次/分钟与 groupId 从未生效过。
 *
 * 2026-11-02 起的语义（本文件把它钉住）：
 *   · 只关全局        → 仍注册，`global: false`，端点声明照常生效；
 *   · 只关端点级      → 仍注册（全局开时），注册前摘掉路由上的 config.rateLimit；
 *   · 两个都关        → 不注册（真正的「完全不限流」，并打 warn）。
 *
 * 只把「配置读取」替换成可写桩，被测代码是 `first-ratelimit.js` 真身；
 * `app.register` 用假实例接住参数（插件类不会被实例化，因此不需要真 Redis）。
 *
 * @author yijiu2025
 * @since 2026-11-02
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** 可切换的防御配置（替身 config-access 的返回值） */
let settings = { defense: { enableRateLimit: false, enableEndpointRateLimit: true } };

jest.unstable_mockModule('../../framework/firewall/interface/config-access.js', () => ({
  readSecuritySettings: () => settings,
  registerSettingsReader: () => {},
  hasSettingsReader: () => true
}));

const { registerRateLimit } = await import('../../framework/firewall/engine/detectors/first-ratelimit.js');

/** 假 Fastify 实例：记录 addHook 与 register 的入参 */
function makeApp() {
  return {
    hooks: [],
    opts: null,
    plugin: null,
    addHook(name, fn) {
      this.hooks.push({ name, fn });
    },
    async register(plugin, opts) {
      this.plugin = plugin;
      this.opts = opts;
    }
  };
}

beforeEach(() => {
  settings = { defense: { enableRateLimit: false, enableEndpointRateLimit: true } };
});

describe('限流插件注册决策', () => {
  it('只关全局：仍然注册，且 global=false（端点声明的 config.rateLimit 才会生效）', async () => {
    const app = makeApp();
    await registerRateLimit(app);

    expect(app.opts).not.toBeNull();
    expect(app.opts.global).toBe(false);
    // 端点级没关，不应摘路由配置
    expect(app.hooks.filter(h => h.name === 'onRoute')).toHaveLength(0);
  });

  it('两个开关都关：完全不注册（唯一允许「声明全废」的组合）', async () => {
    settings = { defense: { enableRateLimit: false, enableEndpointRateLimit: false } };
    const app = makeApp();
    await registerRateLimit(app);

    expect(app.opts).toBeNull();
    expect(app.hooks).toHaveLength(0);
  });

  it('全局开 + 端点级关：注册 global=true，并在注册前摘掉路由上的 config.rateLimit', async () => {
    settings = { defense: { enableRateLimit: true, enableEndpointRateLimit: false } };
    const app = makeApp();
    await registerRateLimit(app);

    expect(app.opts.global).toBe(true);
    const strip = app.hooks.find(h => h.name === 'onRoute');
    expect(strip).toBeDefined();

    // 该钩子必须真的能摘掉声明，否则「关了端点级却还在限」
    const routeOptions = { config: { rateLimit: { max: 3 }, riskExempt: true } };
    strip.fn(routeOptions);
    expect(routeOptions.config.rateLimit).toBeUndefined();
    // 其它 route config 不能被误删
    expect(routeOptions.config.riskExempt).toBe(true);
  });

  it('全局开 + 端点级开：注册 global=true，且不摘任何声明', async () => {
    settings = { defense: { enableRateLimit: true, enableEndpointRateLimit: true } };
    const app = makeApp();
    await registerRateLimit(app);

    expect(app.opts.global).toBe(true);
    expect(app.hooks.filter(h => h.name === 'onRoute')).toHaveLength(0);
  });

  it('注册参数保留 429 契约所需的 errorResponseBuilder 与自定义 keyGenerator', async () => {
    const app = makeApp();
    await registerRateLimit(app);

    expect(typeof app.opts.keyGenerator).toBe('function');
    expect(typeof app.opts.errorResponseBuilder).toBe('function');

    // keyGenerator：已登录按 user.id，未登录按 IP（groupId 会在此基础上追加后缀）
    expect(app.opts.keyGenerator({ state: { user: { id: 42 } }, ip: '1.2.3.4' })).toBe('rate:user:42');
    expect(app.opts.keyGenerator({ ip: '1.2.3.4' })).toBe('rate:ip:1.2.3.4');
  });
});
