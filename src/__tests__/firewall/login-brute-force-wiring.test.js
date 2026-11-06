/**
 * 暴力破解防护的**接线**契约
 *
 * 这套机制的失效方式非常安静：计数不写，没有任何报错、没有任何日志，
 * 只有"账号永远锁不上"这一个可观测后果。本仓就吃过一次 ——
 * `2026-11-03` 发现 `checkLoginBruteForce` 定义了却零调用，防护从未生效。
 *
 * 所以这里钉三件事：
 *
 * | 方向 | 断言 | 抓什么 |
 * | --- | --- | --- |
 * | 正查 | 长得像登录的路由必须声明 `credentialRoute` | 新增登录端点忘了声明 |
 * | 反查 | 声明了的路由必须真的长得像登录，且只有 3 条 | 改名后残留的孤儿声明 / 拼错 |
 * | 行为 | 声明 → 401 计一次；未声明 → 不计；400 不计 | 读取点没接上 / 把参数错误当爆破 |
 *
 * 外加一条**漂移检查**：登录服务实际返回的 4xx 必须都在 `CREDENTIAL_FAILURE_CODES` 里。
 * 两个文件相隔两层，改一边忘另一边不会有任何运行时症状 —— 只能靠这条测试。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import { ROOT, ALL_API_ROUTES as ALL_ROUTES } from '../helpers/route-declarations.js';

// ── 隔离：配置读取器 + 记账函数 ────────────────────────────────────────────────
// 必须先 mock 再 import 任何**传递依赖**它们的模块，否则拿到的是真身。
let settings = { defense: { enableBruteForce: true } };
jest.unstable_mockModule('../../framework/firewall/interface/config-access.js', () => ({
  readSecuritySettings: () => settings,
  registerSettingsReader: () => {},
  hasSettingsReader: () => true
}));

/** 记账调用（真身会写 Redis，这里只关心「有没有被调用、参数对不对」） */
const bruteCalls = [];
jest.unstable_mockModule('../../framework/firewall/engine/detectors/brute-force.js', () => ({
  checkLoginBruteForce: (...args) => {
    bruteCalls.push(args);
  },
  isAccountLocked: async () => false
}));

const { observeLoginOutcome, CREDENTIAL_FAILURE_CODES } = await import('../../framework/firewall/engine/pipeline.js');

/** 「像登录」的路径（只用于**对账**，不参与运行时判断 —— 运行时只认路由声明） */
const CREDENTIAL_URL = /\/(mini-login|login|verify-email)$/;

beforeEach(() => {
  bruteCalls.length = 0;
  settings = { defense: { enableBruteForce: true } };
});

/**
 * 造一个小 app：一条声明了凭证消费的路由、一条没声明的、一条 400 的
 *
 * @returns {Promise<import('fastify').FastifyInstance>} 已注册 onResponse 观测钩子的实例
 */
async function buildApp() {
  const app = Fastify();

  app.post('/api/v1/login', { config: { firewall: { credentialRoute: true } } }, async (req, reply) => {
    const code = Number(req.headers['x-status'] || 401);
    return reply.code(code).send({ ok: false });
  });

  app.post('/api/v1/plain', async (req, reply) => reply.code(401).send({ ok: false }));

  // 与 bootstrap.js 里一致：观测挂在 onResponse（此时路由已匹配，routeOptions 可读）
  app.addHook('onResponse', async (request, reply) => {
    await observeLoginOutcome(request, reply);
  });

  await app.ready();
  return app;
}

describe('行为：只有声明了 credentialRoute 的路由才记账', () => {
  test('声明 + 401 → 记一次失败，账号维度取到 email', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/login',
      payload: { email: 'victim@example.com' }
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(bruteCalls).toHaveLength(1);
    expect(bruteCalls[0][1]).toBe('victim@example.com'); // 账号
    expect(bruteCalls[0][2]).toBe(false); // success=false
  });

  test('未声明 + 401 → 一次都不记（别的端点 401 不是凭证失败）', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/v1/plain', payload: { email: 'a@b.c' } });
    await app.close();

    expect(bruteCalls).toHaveLength(0);
  });

  test('声明 + 400 → 不计（用户填错字段不是爆破；把 400 算进去会锁死正常用户）', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/login',
      headers: { 'x-status': '400' },
      payload: { email: 'a@b.c' }
    });
    await app.close();

    expect(bruteCalls).toHaveLength(0);
  });

  test('声明 + 423（锁定中继续试）→ 仍然计，锁定不会变成免罚期', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/login',
      headers: { 'x-status': '423' },
      payload: { email: 'a@b.c' }
    });
    await app.close();

    expect(bruteCalls).toHaveLength(1);
    expect(bruteCalls[0][2]).toBe(false);
  });

  test('声明 + 200 → 记一次成功（用于清零历史失败）', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/v1/login',
      headers: { 'x-status': '200' },
      payload: { email: 'a@b.c' }
    });
    await app.close();

    expect(bruteCalls).toHaveLength(1);
    expect(bruteCalls[0][2]).toBe(true);
  });

  test('未匹配路由（404）→ 不抛错、不记账（routeOptions 为空）', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/definitely/not/here', payload: {} });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(bruteCalls).toHaveLength(0);
  });

  test('总开关关闭 → 声明了也不记账', async () => {
    settings = { defense: { enableBruteForce: false } };
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/api/v1/login', payload: { email: 'a@b.c' } });
    await app.close();

    expect(bruteCalls).toHaveLength(0);
  });
});

// ── 静力对账：路由声明 ────────────────────────────────────────────────────────

// 声明解析器在 helpers 里（三份 wiring 测试共用一份，否则迟早各自学会不同的读法）
const FLAGGED = r => r.firewall.credentialRoute === true;

describe('静力对账：路由声明 ↔ URL', () => {
  test('扫描范围有效（防止路径写错导致空扫描假通过）', () => {
    expect(ALL_ROUTES.length).toBeGreaterThan(100);
    expect(ALL_ROUTES.some(r => r.url === '/login')).toBe(true);
  });

  test('正查：像登录的路由必须声明 credentialRoute（新增端点漏声明会红）', () => {
    const suspects = ALL_ROUTES.filter(r => r.url && CREDENTIAL_URL.test(r.url));
    expect(suspects.length).toBeGreaterThan(0);

    const missing = suspects.filter(r => !FLAGGED(r)).map(r => `${r.file} → ${r.url}`);
    expect(missing).toEqual([]);
  });

  test('反查：声明了的路由必须真的像登录（改名/拼错留下的孤儿声明会红）', () => {
    const flagged = ALL_ROUTES.filter(FLAGGED);
    const orphans = flagged.filter(r => !r.url || !CREDENTIAL_URL.test(r.url)).map(r => `${r.file} → ${r.url}`);
    expect(orphans).toEqual([]);
  });

  test('数量钉死 4 条：新增登录端点必须是一次有意识的改动', () => {
    // 2026-11-06：对账时发现 `/authorize/login` 也被旧正则的 `$` 后缀**侥幸**覆盖了
    // （没人显式决定过它算不算），补了声明。这类"巧合覆盖"正是换掉正则的理由。
    const flagged = ALL_ROUTES.filter(FLAGGED)
      .map(r => r.url)
      .sort();
    expect(flagged).toEqual(['/authorize/login', '/login', '/login/verify-email', '/mini-login']);
  });

  test('consent/confirm 明确不声明（已认证后的授权确认，403 = 拒绝授权 ≠ 凭证失败）', () => {
    const consent = ALL_ROUTES.find(r => r.url === '/login/consent/confirm');
    expect(consent).toBeDefined();
    expect(FLAGGED(consent)).toBe(false);
  });
});

// ── 漂移检查：状态码契约 ──────────────────────────────────────────────────────

/**
 * 消费凭证的服务 —— 这些文件里的每个 4xx 分支都必须被**显式分类**
 *
 * 不是"全部计入"：400（填错字段）、429（风控拒绝）都不该算凭证失败。
 * 但"不该算"也必须写下来 —— 否则某天有人在登录里加一个 418 分支，
 * 它既不计数也没人发现，只是安静地少统计一类攻击。
 */
const CREDENTIAL_SERVICES = [
  'src/app/oauth21/services/login.service.js',
  'src/app/oauth21/services/authorization.service.js'
];

/**
 * 明确**不**计入凭证失败的 4xx —— 每个都要写理由
 *
 * 新增 4xx 分支时二选一：要么进 `CREDENTIAL_FAILURE_CODES`，要么进这张表。
 */
const NOT_COUNTED = {
  400: '参数校验 / 图形验证码或邮箱码错误 / 会话无效 —— 用户填错字段不该被锁号（5 次就锁是灾难）',
  404: '邮箱未注册 —— 现状不计（账号枚举目前由扫描陷阱兜底，它同样看 404）。要把枚举纳入爆破计数就改 CREDENTIAL_FAILURE_CODES',
  429: '风控拒绝（环境异常）—— 已由风控单独处置，再算一次凭证失败等于双重处罚'
};

describe('漂移检查：登录服务的每个 4xx 分支都被显式分类过', () => {
  /** 汇总这些服务真实产出的 4xx */
  function emittedCodes() {
    const all = new Set();
    for (const relPath of CREDENTIAL_SERVICES) {
      const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      for (const m of src.matchAll(/reply\.code\((4\d{2})\)/g)) all.add(Number(m[1]));
    }
    return [...all].sort((a, b) => a - b);
  }

  test('扫描范围有效（防止正则失效导致空断言假通过）', () => {
    const codes = emittedCodes();
    expect(codes.length).toBeGreaterThan(0);
    expect(codes).toContain(401); // 密码错误必须在内，否则说明根本没扫到
  });

  test('每个产出的 4xx 要么计入、要么在 NOT_COUNTED 里写明理由', () => {
    const unclassified = emittedCodes().filter(
      code => !CREDENTIAL_FAILURE_CODES.includes(code) && !(code in NOT_COUNTED)
    );
    // 有新分支没分类时这里红：去 CREDENTIAL_FAILURE_CODES 或 NOT_COUNTED 里二选一
    expect(unclassified).toEqual([]);
  });

  test('400 不在名单里（参数错误计入会锁死填错字段的用户）', () => {
    expect(CREDENTIAL_FAILURE_CODES).not.toContain(400);
  });

  test('名单只有 4xx（2xx 走清零分支，不该混进来）', () => {
    for (const code of CREDENTIAL_FAILURE_CODES) {
      expect(code).toBeGreaterThanOrEqual(400);
      expect(code).toBeLessThan(500);
    }
  });
});
