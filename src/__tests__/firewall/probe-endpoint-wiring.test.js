/**
 * 健康探针的**可达性**契约
 *
 * 探针失败不是"少拦一点"，而是**编排系统把实例判死**：
 *   · 探针不带 UA（部分 Docker HEALTHCHECK、自研监控）→ 命中 Bot 检测的无 UA 分支 → 拿到挑战页；
 *   · 挑战页是 `200 + HTML` → 探针"看起来通过"，实际什么都没验证；
 *   · 若改判 429/428 → 健康实例被摘 → 重启 → IP 仍在挑战态 → **crash loop**。
 *
 * 豁免由两条腿组成，**并集**（任一条命中即放行）：
 *
 * | 腿 | 覆盖 | 会不会漂 |
 * | --- | --- | --- |
 * | 路由声明 `config.firewall.probeEndpoint` | 本服务注册了的探针路由（默认三条） | 不漂，随路由走 |
 * | `defense.probePaths`（兜底 `PROBE_PATHS`） | 部署方额外探的路径，可能没有对应路由 | 靠人同步 |
 *
 * 本文件钉四件事：
 *
 * | 组 | 断言 | 抓什么 |
 * | --- | --- | --- |
 * | 正查 | health.js 里每条探针路由都声明了 | 新增探针路由漏声明 |
 * | 反查 | 只有 health.js 声明；兜底值不指向不存在的路由 | 孤儿声明 / 兜底值变死链 |
 * | 行为 | 两条腿各自单独生效 | 有人把并集改成"只认配置"或"只认声明" |
 *
 * @author yijiu2025
 * @since 2026-11-06
 */

import { describe, test, expect } from '@jest/globals';
import { ALL_API_ROUTES as ALL_ROUTES } from '../helpers/route-declarations.js';

const { isProbeUrl, shouldSkipDeepCheck, isUnconditionallyReachable, PROBE_PATHS } =
  await import('../../framework/ingress/firewall/engine/pipeline.js');

/** health 路由模块（对账时按这个路径比对） */
const HEALTH_SRC = 'src/api/system/v1/health.js';

/** 声明了探针的路由 */
const isProbe = r => r.firewall.probeEndpoint === true;

describe('正查：探针路由必须自证', () => {
  test('扫描范围有效（防止路径写错导致空扫描假通过）', () => {
    expect(ALL_ROUTES.length).toBeGreaterThan(100);
    expect(ALL_ROUTES.some(r => r.url === '/health/live')).toBe(true);
  });

  test('health.js 里每条探针路由都声明了 probeEndpoint', () => {
    const inHealth = ALL_ROUTES.filter(r => r.file === HEALTH_SRC);
    expect(inHealth.length).toBeGreaterThanOrEqual(3);

    // 三条探针必须都在（漏一条 = 那条探针在挑战态下拿 428 → 容器重启）
    const urls = inHealth.filter(isProbe).map(r => r.url);
    expect(urls.sort()).toEqual(['/health', '/health/live', '/health/ready']);
  });

  test('health.js 里没有"漏声明"的路由（新增探针端点也逃不掉）', () => {
    const missing = ALL_ROUTES.filter(r => r.file === HEALTH_SRC && !isProbe(r)).map(r => r.url);
    expect(missing).toEqual([]);
  });
});

describe('反查：声明范围与兜底值', () => {
  test('全仓只有 health.js 声明 probeEndpoint', () => {
    const owners = [...new Set(ALL_ROUTES.filter(isProbe).map(r => r.file))];
    expect(owners).toEqual([HEALTH_SRC]);
  });

  test('数量钉死 3 条：多一条就是显式开了豁免，必须是一次有意识的改动', () => {
    expect(ALL_ROUTES.filter(isProbe)).toHaveLength(3);
  });

  test('兜底值不指向不存在的探针路由（否则那段兜底等于死链）', () => {
    // PROBE_PATHS 存的是**完整 URL**（`/v1/health/live`），而源码里的 `url` 只有路由段
    // （group prefix `/v1` 是注册时才拼的），所以去掉前缀后比对。
    const declaredRouteUrls = new Set(ALL_ROUTES.filter(isProbe).map(r => r.url));
    const dangling = PROBE_PATHS.filter(p => !declaredRouteUrls.has(p.replace(/^\/v1/, '')));
    expect(dangling).toEqual([]);
  });
});

describe('行为：两条腿各自单独生效（并集，不是二选一）', () => {
  test('配置腿：默认三条路径仅凭路径就豁免（部署方没改配置时）', () => {
    for (const p of PROBE_PATHS) {
      expect(isProbeUrl({ url: p })).toBe(true);
    }
  });

  test('声明腿：URL 不在配置清单里，靠声明照样豁免（部署方自定义前缀时）', () => {
    // 关键用例：模拟"system.json prefix 改了"——真实 URL 变了、配置里的旧值没跟上，
    // 此时只有路由声明能救。这也证明并集里声明那条腿**不依赖配置内容**。
    const request = { url: '/sys/v1/health/live', routeOptions: { config: { firewall: { probeEndpoint: true } } } };
    expect(isProbeUrl(request)).toBe(true);
    expect(shouldSkipDeepCheck(request)).toBe(true);
  });

  test('两条腿都不命中 → 不豁免（豁免范围必须可控）', () => {
    expect(isProbeUrl({ url: '/v1/healthz' })).toBe(false);
    expect(isProbeUrl({ url: '/v1/health/ready-extra' })).toBe(false);
    expect(isProbeUrl({})).toBe(false);
    // 未匹配路由时 routeOptions 不存在，不能抛错
    expect(isProbeUrl({ url: '/nothing', routeOptions: undefined })).toBe(false);
  });

  test('shouldSkipDeepCheck 对探针路径返回 true（bootstrap 的深检跳过入口）', () => {
    expect(shouldSkipDeepCheck({ url: '/v1/health/ready?x=1' })).toBe(true);
    expect(shouldSkipDeepCheck({ url: '/v1/user/userinfo' })).toBe(false);
  });
});

describe('共用判据：两类「无条件可达」收在一处（防 2026-11-03 的死锁复发）', () => {
  /**
   * 2026-11-03 的 `Challenge issue failed 428` 与 2026-11-04 的「探针拿到 428」是**同一个错**：
   * "哪些端点无条件可达"被抄成了两份名单，一份进「深度检测跳过」、另一份忘了加进
   * 「挑战态放行」。现在两个消费点都只调 `isUnconditionallyReachable`，本组钉住这个并集。
   */
  const flag = name => ({ url: '/whatever', routeOptions: { config: { firewall: { [name]: true } } } });

  test('挑战接口声明算无条件可达', () => {
    expect(isUnconditionallyReachable(flag('challengeSurface'))).toBe(true);
  });

  test('健康探针声明算无条件可达', () => {
    expect(isUnconditionallyReachable(flag('probeEndpoint'))).toBe(true);
  });

  test('探针的配置腿也算（配置里写了路径但该路径没有路由）', () => {
    expect(isUnconditionallyReachable({ url: '/v1/health/live' })).toBe(true);
  });

  test('普通路由不算（否则这道闸就没意义了）', () => {
    expect(isUnconditionallyReachable({ url: '/v1/user/userinfo' })).toBe(false);
    expect(isUnconditionallyReachable({ url: '/v1/user/userinfo', routeOptions: { config: {} } })).toBe(false);
    expect(isUnconditionallyReachable({})).toBe(false);
  });
});
