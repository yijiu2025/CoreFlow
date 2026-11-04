/**
 * 存储布局与私有文件下载的契约测试
 *
 * 覆盖两类：
 *   ① 路径守卫（framework/storage）：app / key 合法性与 `..` 越界，私有根与公开根互不串门；
 *   ② 下载路由（api/files）：未登录/非本人 403、本人 200、越界 400、不存在 404。
 *
 * 为什么值得单测：这两处一旦漏了，私有文件就等于"公开可下载"（URL 可猜）——
 * 而且不会有任何报错，只会安静地泄露。
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
  PUBLIC_ROOT,
  PRIVATE_ROOT,
  assertApp,
  assertKey,
  resolveFile,
  publicUrl,
  privateKey
} from '../framework/storage/index.js';

describe('存储布局：app / key 的路径守卫', () => {
  it('app 名：只接受字母数字与 -_（挡掉 ..、分隔符、绝对路径）', () => {
    expect(assertApp('posecraft')).toBe('posecraft');
    expect(assertApp('user')).toBe('user');
    for (const bad of ['..', '.', 'a/b', '../etc', '', 'x'.repeat(40), '/abs']) {
      expect(() => assertApp(bad)).toThrow();
    }
  });

  it('key：拒绝 .. / 空段 / 反斜杠 / NUL / 绝对路径', () => {
    expect(assertKey('u/42/a.png')).toEqual(['u', '42', 'a.png']);
    for (const bad of [
      '',
      'u//a.png',
      '../a.png',
      'u/../../etc/passwd',
      'u\\42\\a.png',
      'u/42/a\0.png',
      '/etc/passwd'
    ]) {
      expect(() => assertKey(bad)).toThrow();
    }
  });

  it('私有与公开根互不串门，且解析结果必须落在 app 目录内', () => {
    const pub = resolveFile('posecraft', 'a.png');
    const priv = resolveFile('posecraft', 'u/42/a.pdf', { private: true });

    expect(pub).toBe(path.join(PUBLIC_ROOT, 'posecraft', 'a.png'));
    expect(priv).toBe(path.join(PRIVATE_ROOT, 'posecraft', 'u', '42', 'a.pdf'));
    expect(pub.startsWith(PRIVATE_ROOT)).toBe(false);
    expect(priv.startsWith(PUBLIC_ROOT)).toBe(false);
  });

  it('publicUrl 直接拼 /<app>/<key>（静态服务以 / 为 prefix）', () => {
    expect(publicUrl('posecraft', 'abc.jpg')).toBe('/posecraft/abc.jpg');
    expect(publicUrl('user', 'avatars/abc.jpg')).toBe('/user/avatars/abc.jpg');
  });

  it('privateKey 强制 u/<ownerId>/<filename>，且 filename 不能含路径', () => {
    expect(privateKey(42, 'a.pdf')).toBe('u/42/a.pdf');
    expect(() => privateKey('', 'a.pdf')).toThrow();
    expect(() => privateKey('4/2', 'a.pdf')).toThrow();
    expect(() => privateKey(42, 'sub/a.pdf')).toThrow();
  });
});

describe('私有文件下载路由', () => {
  const APP = 'testapp';
  const OWNER = '4711';
  const FILE = '合同 2026.txt';
  const KEY = `u/${OWNER}/${FILE}`;
  let absFile;
  let handler;
  /** 本机是否允许创建符号链接（Windows 非管理员 / 部分容器会 EPERM） */
  let symlinkSupported = false;
  /** 建不出软链时的原始错误（用来说明「为什么这条断言没跑」） */
  let symlinkError = null;

  /** 捕获路由处理器（guard 的 _routeRegistry 是进程级的，只注册一次） */
  beforeAll(async () => {
    absFile = resolveFile(APP, KEY, { private: true });
    fs.mkdirSync(path.dirname(absFile), { recursive: true });
    fs.writeFileSync(absFile, 'hello-private');

    // 探测软链能力：建不出来就显式 skip，而不是让用例「静默通过」
    // （静默通过的守卫等于没有守卫 —— 这正是本仓库反复踩的坑）。
    const probe = path.join(PRIVATE_ROOT, APP, '.symlink-probe');
    try {
      fs.symlinkSync(absFile, probe);
      symlinkSupported = true;
      fs.rmSync(probe, { force: true });
    } catch (err) {
      symlinkSupported = false;
      symlinkError = err;
    }

    const routes = [];
    const fakeFastify = {
      get(url, opts) {
        routes.push({ url, opts });
      }
    };
    const { default: registerFileRoutes } = await import('../api/files/v1/download.js');
    await registerFileRoutes(fakeFastify);
    const route = routes.find(r => r.url?.endsWith('/*'));
    if (!route) throw new Error('未捕获到 download 路由');
    handler = route.opts.handler;
  });

  afterAll(() => {
    fs.rmSync(path.join(PRIVATE_ROOT, APP), { recursive: true, force: true });
  });

  /** 最小 reply 替身：记录状态码 / 头 / sendFile 参数 */
  function makeReply() {
    const reply = {
      statusCode: 200,
      headers: {},
      sentFile: null,
      header(k, v) {
        reply.headers[k] = v;
        return reply;
      },
      sendFile(file, root, opts) {
        reply.sentFile = { file, root, opts };
        return reply;
      }
    };
    reply.result = {
      badRequest: m => {
        reply.statusCode = 400;
        reply.body = { message: m };
        return reply;
      },
      forbidden: m => {
        reply.statusCode = 403;
        reply.body = { message: m };
        return reply;
      },
      notFound: m => {
        reply.statusCode = 404;
        reply.body = { message: m };
        return reply;
      }
    };
    return reply;
  }

  const makeReq = (user, key = KEY, app = APP, query = {}) => ({
    params: { app, '*': key },
    query,
    state: { user }
  });

  it('本人下载 → 下发文件，且禁止共享缓存', async () => {
    const reply = makeReply();
    await handler(makeReq({ id: OWNER, roles: ['user'] }), reply);

    expect(reply.sentFile.file).toBe(path.join(APP, KEY));
    expect(reply.sentFile.root).toBe(PRIVATE_ROOT);
    // 私有文件绝不能走 public 缓存策略
    expect(reply.sentFile.opts).toMatchObject({ cacheControl: false, etag: false });
    expect(reply.headers['Cache-Control']).toBe('private, no-store');
    expect(reply.headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('他人下载 → 403（不泄漏文件是否存在）', async () => {
    const reply = makeReply();
    await handler(makeReq({ id: '9999', roles: ['user'] }), reply);
    expect(reply.statusCode).toBe(403);
    expect(reply.sentFile).toBeNull();
  });

  it('管理员可下载他人文件', async () => {
    const reply = makeReply();
    await handler(makeReq({ id: '1', roles: ['admin'] }), reply);
    expect(reply.sentFile.file).toBe(path.join(APP, KEY));
  });

  it('缺归属层（没有 u/<ownerId>/）→ 403', async () => {
    const reply = makeReply();
    await handler(makeReq({ id: OWNER }, `${FILE}`), reply);
    expect(reply.statusCode).toBe(403);
  });

  it('越界 key（..）→ 400，且不触盘', async () => {
    const reply = makeReply();
    await handler(makeReq({ id: OWNER }, 'u/../../etc/passwd'), reply);
    expect(reply.statusCode).toBe(400);
    expect(reply.sentFile).toBeNull();
  });

  it('文件不存在 → 404', async () => {
    const reply = makeReply();
    await handler(makeReq({ id: OWNER }, `u/${OWNER}/nope.txt`), reply);
    expect(reply.statusCode).toBe(404);
  });
  it('符号链接 → 404（私有出口只认真实文件）', async () => {
    // 备份还原 / 运维手抖 / 其它写入方都可能在 storage/ 里留下软链；
    // 用 statSync 会跟随软链并照常 isFile()，等于把链那头的文件读出去。
    //
    // 本机建不出软链时（Windows 非管理员 / 部分容器）不能当「通过」，
    // 所以把断言点设成「跳过原因是权限」—— 单一断言点，避免分支里 expect。
    let observed;
    if (symlinkSupported) {
      const linkKey = `u/${OWNER}/link-to-outside.txt`;
      const linkAbs = resolveFile(APP, linkKey, { private: true });
      fs.symlinkSync(absFile, linkAbs);
      const reply = makeReply();
      await handler(makeReq({ id: OWNER }, linkKey), reply);
      observed = { status: reply.statusCode, sentFile: reply.sentFile };
    } else {
      // 把「为什么没跑」压成布尔值，避免在分支里调 expect（jest/no-conditional-expect）
      observed = {
        skipped: true,
        permissionDenied: /^(EPERM|EACCES|ENOTSUP|UNKNOWN)$/.test(String(symlinkError?.code))
      };
    }

    const expected = symlinkSupported ? { status: 404, sentFile: null } : { skipped: true, permissionDenied: true };
    expect(observed).toEqual(expected);
  });

  it('扩展名决定 inline / attachment，?download=1 强制附件', async () => {
    // .txt 在白名单里 → 允许内联
    const inlineReply = makeReply();
    await handler(makeReq({ id: OWNER }), inlineReply);
    expect(inlineReply.headers['Content-Disposition']).toContain('inline');

    // 非白名单扩展名 → 强制下载（避免被浏览器当页面渲染）
    const binKey = `u/${OWNER}/report.bin`;
    fs.writeFileSync(resolveFile(APP, binKey, { private: true }), 'bin');
    const attachReply = makeReply();
    await handler(makeReq({ id: OWNER }, binKey), attachReply);
    expect(attachReply.headers['Content-Disposition']).toContain('attachment');

    // 显式 ?download=1 → 即使 .txt 也按附件
    const forcedReply = makeReply();
    await handler(makeReq({ id: OWNER }, KEY, APP, { download: '1' }), forcedReply);
    expect(forcedReply.headers['Content-Disposition']).toContain('attachment');
  });
});
