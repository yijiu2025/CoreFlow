/**
 * 用户数据路由边界（约定测试）
 *
 * 背景（2026-11-20）：应用侧「改自己的资料」和管理端「改别人的资料」很容易被合成
 * 一个接口 —— 多一个 `:id` 路径参数、多一条 `posecraft:user:changename` 权限码，
 * 任何持该码的人就能改别人的网名。这类缺陷不会报错，也不会有任何测试注意到：
 * 接口本身工作正常，只是**授权边界悄悄变宽了**。
 *
 * 本守卫固化三条规则（只读源码文本，不启动服务）：
 *
 *   ① 带目标用户的路由（`/users/:id`、`/:uid`、`/:userId`）如果会**写数据**，
 *      放行权限必须落在 `ADMIN_PERMISSIONS` 命名空间 —— 管理端改他人，只有 admin 码算数。
 *      确属"写关系而非写用户数据"的（如关注/取关），必须在白名单里写明理由。
 *   ② 请求体里**不得**出现单数 `userId / user_id / uid` 这类"要改谁"的字段。
 *      目标用户一律走路径参数（可在 params schema 上做整数校验），
 *      这样越权面就只看路由表，不用再读每个 handler 的取值逻辑。
 *   ③ 应用级用户码（`POSE CRAFT_PERMISSIONS.USER.*` 这类非 admin 的 `*_PERMISSIONS.USER.*`）
 *      只能出现在**自助**路由上：URL 不带目标用户参数，否则就是"用自助权限改别人"。
 *
 * 判据是**路径参数 + 权限命名空间 + body 字段名**三者的组合，不需要跑起服务，
 * 也不会因为库里数据变化而假红。
 *
 * @author yijiu2025
 * @since 2026-11-20
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from '@jest/globals';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../../src');
const API_DIR = path.join(SRC, 'api');

/** 会改数据的 HTTP 方法 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** URL 里出现"目标用户"的三种写法 */
const TARGET_USER_IN_URL = /(\/users\/:id\b|\/:uid\b|\/:userId\b)/;

/** 应用级用户码：`XXX_PERMISSIONS.USER.*`，但排除 admin */
const APP_USER_PERMISSION = /^(?!ADMIN_)[A-Z0-9_]+_PERMISSIONS\.USER\./;

/** 请求体里的"要改谁"字段（单数；批量接口用 `userIds` 复数） */
const BODY_TARGET_FIELD = /\b(userId|user_id|uid)\s*:\s*\{/;

/**
 * 允许"带目标用户 + 非 admin 权限"的例外（必须写清理由）
 *
 * key = `相对 src/api 的路径|方法|URL`
 *
 * 2026-11-21：`posecraft/v1/follow.js` 两条条目随应用移出本仓一并删除 ——
 * 白名单条目必须指向真实存在的文件，否则守卫会以为"还有例外没处理"。
 */
const ALLOWED_WRITE_ON_OTHER = new Map([]);

/** 递归收集 `src/api` 下的路由文件 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * 抽出一个文件里所有 `registerSecureRoute` 路由的关键信息
 *
 * 只取静态可判的四样：方法、URL、权限表达式、以及 body schema 那一段文本。
 * 不解析 handler —— 越权面应该由"路由 + 权限"决定，而不是靠读每个 handler 的取值。
 *
 * @param {string} src 文件内容
 * @returns {Array<{method: string, url: string, permission: string, bodyText: string}>} 路由清单
 */
function routesOf(src) {
  const out = [];
  const re = /registerSecureRoute\(fastify,\s*\{[\s\S]{0,600}?method:\s*'(\w+)'[\s\S]{0,300}?url:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    const next = src.indexOf('registerSecureRoute(', m.index + m[0].length);
    const block = src.slice(start, next === -1 ? src.length : next);
    const permission = (block.match(/requirePermission:\s*([A-Z_][A-Z0-9_.]*)/) || [])[1] || '';
    /* body schema 一定在 `handler:` 之前 */
    const bodyStart = block.lastIndexOf('body: {');
    const handlerAt = block.indexOf('handler:');
    const bodyText = bodyStart >= 0 && handlerAt > bodyStart ? block.slice(bodyStart, handlerAt) : '';
    out.push({ method: m[1], url: m[2], permission, bodyText });
  }
  return out;
}

describe('用户数据路由边界', () => {
  const files = walk(API_DIR);
  const rows = files.map(file => ({
    file: path.relative(API_DIR, file).replace(/\\/g, '/'),
    routes: routesOf(fs.readFileSync(file, 'utf8'))
  }));
  const flat = rows.flatMap(r => r.routes.map(route => ({ ...route, file: r.file })));

  test('扫描范围有效（防止路径写错导致空扫描假通过）', () => {
    expect(flat.length).toBeGreaterThan(150);
    // admin 命名空间的路由一定存在，否则说明权限表达式没解析出来
    expect(flat.some(r => r.permission.startsWith('ADMIN_PERMISSIONS.'))).toBe(true);
    // 命名空间都要扫到（admin / 用户域）——少一个就说明解析退化了。
    // 防火墙等第三方应用的命名空间已随应用移出本仓，不再作为取样点。
    const namespaces = new Set(flat.map(r => r.permission.split('.')[0]).filter(Boolean));
    for (const ns of ['ADMIN_PERMISSIONS', 'USER_PERMISSIONS']) {
      expect({ ns, has: namespaces.has(ns) }).toEqual({ ns, has: true });
    }
  });

  test('① 写他人数据必须由 admin 命名空间放行（应用级权限只能自助）', () => {
    const violations = [];
    for (const r of flat) {
      if (!TARGET_USER_IN_URL.test(r.url)) continue;
      if (!WRITE_METHODS.has(r.method)) continue;
      const key = `${r.file}|${r.method}|${r.url}`;
      if (ALLOWED_WRITE_ON_OTHER.has(key)) continue;
      if (r.permission.startsWith('ADMIN_PERMISSIONS.')) continue;
      violations.push(
        `${r.file} ${r.method} ${r.url} 的放行权限是「${r.permission || '仅登录'}」` +
          ' —— 写他人数据必须用 ADMIN_PERMISSIONS 的码；自助写自己请去掉目标用户参数'
      );
    }
    expect(violations).toEqual([]);
  });

  test('② 请求体不得声明「要改谁」（目标用户只走路径参数）', () => {
    const violations = [];
    for (const r of flat) {
      if (!BODY_TARGET_FIELD.test(r.bodyText)) continue;
      violations.push(
        `${r.file} ${r.method} ${r.url} 在 body 里声明了 userId/user_id/uid` +
          ' —— 目标用户一律走路径参数（params schema 可校验），否则越权面藏进 handler 里'
      );
    }
    expect(violations).toEqual([]);
  });

  test('③ 应用级用户码（*_PERMISSIONS.USER.*）只能用于自助路由', () => {
    const violations = [];
    for (const r of flat) {
      if (!APP_USER_PERMISSION.test(r.permission)) continue;
      if (TARGET_USER_IN_URL.test(r.url)) {
        violations.push(
          `${r.file} ${r.method} ${r.url} 用应用级权限「${r.permission}」改了带目标用户的接口` +
            ' —— 这就是"有该权限就能改别人"，请改走 ADMIN_PERMISSIONS 或去掉目标用户参数'
        );
      }
    }
    expect(violations).toEqual([]);
  });

  test('白名单条目必须仍然存在（防幽灵豁免）', () => {
    for (const key of ALLOWED_WRITE_ON_OTHER.keys()) {
      const [file, method, url] = key.split('|');
      const hit = flat.some(r => r.file === file && r.method === method && r.url === url);
      expect({ key, hit }).toEqual({ key, hit: true });
    }
  });
});
