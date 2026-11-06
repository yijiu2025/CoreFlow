/**
 * 挑战接口的**可达性**契约
 *
 * 「挑战接口必须无条件可达」这条不变量一旦破了，后果不是"少拦一类攻击"，
 * 而是**全站登录死锁**：被挑战的请求拿不到载荷 → 客户端永远解不开 → 也永远进不来。
 * 本仓实测踩过一次（`Challenge issue failed 428`：常量只写进了深度检测跳过名单，
 * 漏了挑战态放行名单）。
 *
 * 2026-11-06 起判据从「路径常量」改成「路由声明」`config.firewall.challengeSurface`：
 * 旧常量的三段是手拼的（`system.json` 的 prefix + group prefix + route url），
 * 任何一段改了常量都不会跟着变 → 死锁。声明与 URL 在同一个对象字面量里，物理上无法漂移。
 *
 * 本文件钉四件事：
 *
 * | 组 | 断言 | 抓什么 |
 * | --- | --- | --- |
 * | 接线 | 真注册链路上，两条挑战路由都带上了声明（且与 rateLimit / skipScanTrap 共存） | `registerSecureRoute` 把 config 吃掉了 |
 * | 正查 | 像挑战接口的路由必须声明 | 新增端点漏声明 → 该端点死锁 |
 * | 反查 | 声明了的路由必须真的在挑战模块里 | 改名/搬家后的孤儿声明 |
 * | 行为 | 判据只认声明，URL 长得像不算 | 有人悄悄退回"按路径猜" |
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { ROOT, rel, walkJs, ALL_API_ROUTES as ALL_ROUTES } from '../helpers/route-declarations.js';

// ⚠️ 先 mock 掉会起定时器/写盘的模块，再 import 任何传递依赖它们的模块
jest.unstable_mockModule('../../app/firewall/data/store.js', () => ({
  pushRecord: () => {},
  getRecentRecords: () => [],
  getSummary: () => ({}),
  clearAll: () => {},
  setBroadcastHandler: () => {},
  stopPersistTimer: () => {},
  flushPersist: async () => {}
}));

const { isChallengeApiUrl, shouldSkipDeepCheck } = await import('../../framework/firewall/engine/pipeline.js');
const { default: registerChallengeRoutes } = await import('../../api/firewall/v1/challenge.js');

/** 挑战路由模块（对账时按这个路径比对） */
const CHALLENGE_SRC = rel(path.join(ROOT, 'src/api/firewall/v1/challenge.js'));

/**
 * 用假 fastify 捕获真实注册结果
 *
 * 走真 `registerSecureRoute` 而不是读源码：要验证的正是"config 里的 firewall 声明
 * 会不会被守卫层吃掉"（它内部会 `{ ...config }` 再塞 rateLimit / requireLogin 等键）。
 *
 * ⚠️ 只能跑一次：`registerSecureRoute` 有全局重复注册守卫（同一 url 二次注册直接抛
 * `DUPLICATE_ROUTE`），所以结果缓存在这里。
 *
 * @returns {Array<{url: string, opts: object}>} 捕获到的路由
 */
let capturedRoutes = null;
function captureChallengeRoutes() {
  if (capturedRoutes) return capturedRoutes;

  const routes = [];
  const fakeFastify = {
    post(url, opts) {
      routes.push({ url, opts });
    }
  };
  registerChallengeRoutes(fakeFastify);
  capturedRoutes = routes;
  return capturedRoutes;
}

// 声明解析器在 helpers 里（三份 wiring 测试共用一份）
const isSurface = r => r.firewall.challengeSurface === true;

describe('接线：注册链路真的把声明送进了路由 config', () => {
  test('两条挑战路由都带 challengeSurface（issue 漏了 → 挑战页拉不到载荷）', () => {
    const routes = captureChallengeRoutes();
    expect(routes).toHaveLength(2);

    for (const { opts } of routes) {
      expect(opts.config.firewall.challengeSurface).toBe(true);
      // 与同一对象里的另外两件事共存，互不覆盖
      expect(opts.config.firewall.skipScanTrap).toBe(true);
      expect(opts.config.rateLimit.groupId).toMatch(/^challenge-/);
    }
  });

  test('签发与校验两条都在（只声明 verify 是不够的）', () => {
    const urls = captureChallengeRoutes().map(r => r.url);
    expect(urls.sort()).toEqual(['/v1/challenge/issue', '/v1/challenge/verify']);
  });
});

describe('正查：像挑战接口的路由必须声明', () => {
  /** 挑战接口的 URL 形状（只用于对账，不参与运行时判断） */
  const CHALLENGE_URL = /\/challenge\/(issue|verify)$/;

  test('扫描范围有效（防止路径写错导致空扫描假通过）', () => {
    expect(ALL_ROUTES.length).toBeGreaterThan(100);
    expect(ALL_ROUTES.some(r => r.url === '/issue')).toBe(true);
  });

  test('挑战模块里的**每一条**路由都声明了（新增 /cancel 之类也逃不掉）', () => {
    const inChallengeFile = ALL_ROUTES.filter(r => r.file === CHALLENGE_SRC);
    expect(inChallengeFile.length).toBeGreaterThanOrEqual(2);

    const missing = inChallengeFile.filter(r => !isSurface(r)).map(r => `${r.file} → ${r.url}`);
    expect(missing).toEqual([]);
  });

  test('真实注册出来的 URL 确实长成挑战接口（豁免随路由走，不靠常量拼）', () => {
    // source 里的 `url: '/issue'` 只有路由段，group prefix 是注册时才拼上去的；
    // 所以这条只能打在**捕获结果**上，否则看不出最终形状。
    for (const { url, opts } of captureChallengeRoutes()) {
      expect(url).toMatch(CHALLENGE_URL);
      expect(opts.config.firewall.challengeSurface).toBe(true);
    }
  });

  test('全仓只有挑战模块注册 challenge 组（在别处另起一组会逃出上面的检查）', () => {
    // 只认「`registerGroupMetadata({` 紧跟 `name: 'challenge'`」——放宽到"文件里出现过
    // challenge 这个词"会把 monitor.js 也算进来（它自报的是 monitor 组，只是别的字段里
    // 带 challenge 字样），那就成了假阳性。
    const owners = walkJs(path.join(ROOT, 'src/api')).filter(f =>
      /registerGroupMetadata\(\{\s*name:\s*'challenge'/.test(fs.readFileSync(f, 'utf8'))
    );
    expect(owners.map(rel)).toEqual([CHALLENGE_SRC]);
  });
});

describe('反查：声明了的路由必须真的在挑战模块里', () => {
  test('没有孤儿声明（改名/搬家后留下的会红）', () => {
    const flagged = ALL_ROUTES.filter(isSurface);
    const orphans = flagged.filter(r => r.file !== CHALLENGE_SRC).map(r => `${r.file} → ${r.url}`);
    expect(orphans).toEqual([]);
  });

  test('数量钉死 2 条：多一条就是有人显式开了豁免，必须是一次有意识的改动', () => {
    expect(ALL_ROUTES.filter(isSurface)).toHaveLength(2);
  });
});

describe('行为：判据只认声明，URL 长得像不算', () => {
  test('带声明 → 是挑战接口', () => {
    expect(isChallengeApiUrl({ routeOptions: { config: { firewall: { challengeSurface: true } } } })).toBe(true);
  });

  test('只有 URL、没有声明 → 不是（防退回"按路径猜"）', () => {
    expect(isChallengeApiUrl({ url: '/api/firewall/v1/challenge/verify' })).toBe(false);
    expect(isChallengeApiUrl({ routeOptions: { config: {} } })).toBe(false);
    expect(isChallengeApiUrl({ routeOptions: {} })).toBe(false);
    // 未匹配路由（404）时 routeOptions 整个不存在，不能抛错
    expect(isChallengeApiUrl({ url: '/api/firewall/v1/challenge/verify', routeOptions: undefined })).toBe(false);
  });

  test('shouldSkipDeepCheck 跟着声明走（这条是 bootstrap 的深检跳过入口）', () => {
    const declared = {
      url: '/api/firewall/v1/challenge/issue',
      routeOptions: { config: { firewall: { challengeSurface: true } } }
    };
    expect(shouldSkipDeepCheck(declared)).toBe(true);

    const undeclared = { url: '/api/firewall/v1/challenge/issue' };
    expect(shouldSkipDeepCheck(undeclared)).toBe(false);
  });
});
