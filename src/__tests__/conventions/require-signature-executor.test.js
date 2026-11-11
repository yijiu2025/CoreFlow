/**
 * requireSignature 必须"有执行者"（约定测试）
 *
 * 背景（2026-11-10）：`src/api/user/v1/open.js` 里 5 个公开端点（注册 / 校验邮箱 /
 * 两种重置密码 / 发重置链接）都写着 `requireSignature: true`，但那 5 条**从未被校验过**：
 *
 *   - `verifySignature` 在生产只有一个执行入口 —— oauth21 的全局 preHandler
 *     （`initOAuthMiddleware`，经 `rootPlugins` 挂根作用域），且它自带前缀闸门，
 *     只处理 `/oauth2.1` 及其子路径；
 *   - `createGuard`（每个路由的 preHandler）**不调用** `verifySignature`；
 *   - 所以 user 域里的这个字段没有读者，配置看起来生效、实际是死的。
 *
 * 危害不是"少了一层防护"（那些端点本来就有端点级限频 + 人机验证 + 验证码），
 * 而是**误导**：后来人读到 `requireSignature: true` 会以为签名已被校验，于是不再加别的防护。
 *
 * 为什么不能简单让 guard 全局接上：`requireLogin` 会自动把 requireSignature 置 true，
 * 而目前只有 oauth21 前端实现了签名拦截器 —— 全局接线会让 firewall / posecraft /
 * retroweb / admin 的登录态请求全部 403。
 *
 * 本文件守两件事：
 *   ① 静态：`src/api/**` 里凡是 `requireSignature: true` 的路由声明，必须落在 oauth21 目录内
 *      （路径代理判据 —— 真正的运行时判据是 guard 启动告警，见下）；
 *   ② 真加载 `api/guard.js` 的 `hasSignatureExecutor`，钉死作用域口径
 *      （`/oauth2.1` 内为真、`/oauth2.10` 为假，与 `isOAuth21Request` 同口径）。
 *
 * 运行时配套：`registerSecureRoute` 对"显式声明 + 无执行者"会在启动时打 warn（不阻断启动）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';
import * as espree from 'espree';
// 真加载：断言的是线上真正执行的作用域判定，不是这里重写一份
import { hasSignatureExecutor } from '../../api/guard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const API_DIR = path.join(ROOT, 'src', 'api');
const OAUTH21_DIR = path.join(API_DIR, 'oauth21');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__tests__']);

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

/** 递归收集 .js 文件 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** AST 深度遍历（espree 节点没有统一的 children 属性） */
function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) visit(child, fn);
    return;
  }
  if (typeof node.type === 'string') fn(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    visit(node[key], fn);
  }
}

/**
 * 收集文件里所有 `requireSignature: true` 的**对象属性**（Property）声明
 *
 * 用 AST 而不是正则：注释里提到这个字段（本次清理就留了这种注释）不该被判成声明；
 * 而 `routeConfig.requireSignature = true`（AssignmentExpression，guard 内部赋值）
 * 也不是"路由声明"，不该命中。
 */
function collectDeclarations(file) {
  const ast = espree.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
    loc: true
  });
  const hits = [];
  visit(ast, node => {
    if (node.type !== 'Property') return;
    const keyName = node.key?.name ?? node.key?.value;
    if (keyName !== 'requireSignature') return;
    if (node.value?.type !== 'Literal' || node.value.value !== true) return;
    hits.push({ file: rel(file), line: node.loc?.start.line ?? 0 });
  });
  return hits;
}

describe('requireSignature 声明必须有执行者', () => {
  it('src/api 下所有 requireSignature: true 都落在 oauth21 目录内', () => {
    const files = walk(API_DIR);
    expect(files.length).toBeGreaterThan(50); // 目录没被扫空（否则本断言恒真 = 假绿）

    const offenders = [];
    for (const file of files) {
      for (const hit of collectDeclarations(file)) {
        if (!path.resolve(ROOT, hit.file).startsWith(OAUTH21_DIR)) offenders.push(hit);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('oauth21 内确实存在声明（防止上一条因为"一条都没有"而空转）', () => {
    const hits = walk(OAUTH21_DIR).flatMap(collectDeclarations);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('hasSignatureExecutor：作用域口径', () => {
  it('/oauth2.1 及其子路径 → 有执行者', () => {
    expect(hasSignatureExecutor('/oauth2.1')).toBe(true);
    expect(hasSignatureExecutor('/oauth2.1/v1/login')).toBe(true);
    expect(hasSignatureExecutor('/oauth2.1/v1/auth/qr/generate')).toBe(true);
  });

  it('其他域 → 没有执行者（写在这些地方就是死配置）', () => {
    expect(hasSignatureExecutor('/user/v1/register')).toBe(false);
    expect(hasSignatureExecutor('/firewall/v1/monitor')).toBe(false);
  });

  it('/oauth2.10 不是 /oauth2.1（与 isOAuth21Request 同口径，不误命中）', () => {
    expect(hasSignatureExecutor('/oauth2.10/protected')).toBe(false);
    expect(hasSignatureExecutor('/oauth2.1x/token')).toBe(false);
  });

  it('空值/非字符串 → 没有执行者', () => {
    expect(hasSignatureExecutor('')).toBe(false);
    expect(hasSignatureExecutor(undefined)).toBe(false);
    expect(hasSignatureExecutor(null)).toBe(false);
  });
});
