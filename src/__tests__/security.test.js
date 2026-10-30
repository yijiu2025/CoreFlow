/**
 * 安全基线（测试真实实现，不测手抄副本）
 *
 * ⚠️ 为什么重写：本文件的前身在每个 `describe` 里**重新实现了一遍**被测逻辑
 * （自己写 `validatePasswordStrength`、自己写 `sanitizeForLog`、自己写一份
 * cookie 选项对象和一份 CSRF 排除清单），然后断言自己刚写的东西。
 * 这类用例对生产代码零约束：改错、删掉都照样全绿。
 * 其中「日志脱敏」那段测的 `sanitizeForLog` 在生产里**根本不存在**，
 * 属于凭空的覆盖幻觉。
 *
 * 现在锁的是四条真实基线：
 *   1. 密码策略 `framework/auth/password-policy.js`
 *   2. Cookie 属性 `framework/auth/cookie.js`（HttpOnly / SameSite / path 收窄）
 *   3. CSRF 排除清单 `app/oauth21/config/csrf-exclude.js`
 *   4. 敏感接口限频 `app/oauth21/middleware/rate-limiter.js`（内存降级路径可断言）
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 重写为真身测试（U18）
 */
import { describe, it, expect, jest } from '@jest/globals';

// 限频器惰性解析 globalRedis；这里固定为 null，走可预测的内存降级路径
jest.unstable_mockModule('../framework/redis/plugin.js', () => ({ globalRedis: null }));

const { validatePasswordStrength } = await import('../framework/auth/password-policy.js');
const { COOKIE_OPTIONS, REFRESH_COOKIE_PATH, USER_COOKIE_OPTS, COOKIE_SID, COOKIE_SID_R } =
  await import('../framework/auth/cookie.js');
const { CSRF_EXCLUDE_PATHS } = await import('../app/oauth21/config/csrf-exclude.js');
const { createIpRateLimiter } = await import('../app/oauth21/middleware/rate-limiter.js');

describe('密码策略（真实 validatePasswordStrength）', () => {
  it('满足默认策略的密码通过', () => {
    expect(validatePasswordStrength('MyP@ssw0rd')).toEqual({ valid: true, errors: [] });
  });

  it('过短 / 缺大写 / 缺数字 / 缺小写 分别给出对应错误', () => {
    expect(validatePasswordStrength('Ab1').errors.join()).toMatch(/不能少于 8/);
    expect(validatePasswordStrength('mypassword1').errors.join()).toMatch(/大写字母/);
    expect(validatePasswordStrength('MyPassword').errors.join()).toMatch(/数字/);
    expect(validatePasswordStrength('MYPASSWORD1').errors.join()).toMatch(/小写字母/);
  });

  it('空值与非字符串一律拒绝（不做隐式转换）', () => {
    for (const bad of ['', null, undefined, 123]) {
      expect(validatePasswordStrength(bad).valid).toBe(false);
    }
  });

  it('调用方传入的策略覆盖默认值（requireSpecial=true 后必须含特殊字符）', () => {
    expect(validatePasswordStrength('MyPassw0rd', { requireSpecial: true }).valid).toBe(false);
    expect(validatePasswordStrength('MyPassw0rd!', { requireSpecial: true }).valid).toBe(true);
  });
});

describe('Cookie 属性（真实 COOKIE_OPTIONS）', () => {
  it('SID：HttpOnly + 全站 path（会话 cookie 要随业务请求走）', () => {
    expect(COOKIE_SID).toBeTruthy();
    expect(COOKIE_OPTIONS.SID).toMatchObject({ httpOnly: true, path: '/' });
  });

  it('sid_r：HttpOnly + path 收窄到刷新端点（长期凭证不随业务请求暴露）', () => {
    expect(COOKIE_SID_R).toBeTruthy();
    expect(COOKIE_OPTIONS.SID_R).toMatchObject({ httpOnly: true, path: REFRESH_COOKIE_PATH });
    // path 收窄是这条 cookie 的核心防护：一旦有人把它改回 '/'，下面这条立刻红
    expect(COOKIE_OPTIONS.SID_R.path).not.toBe('/');
  });

  it('sid_r 默认 sameSite=strict（跨站提交拿不到刷新凭证）', () => {
    expect(COOKIE_OPTIONS.SID_R.sameSite).toBe('strict');
  });

  it('多账号凭证 cookie 也是 HttpOnly，且 path 只到 switch-account', () => {
    expect(USER_COOKIE_OPTS).toMatchObject({
      httpOnly: true,
      path: '/auth/v1/switch-account'
    });
  });

  it('所有凭证类 cookie 都必须 httpOnly（防 XSS 直接读走）', () => {
    for (const [name, opts] of Object.entries(COOKIE_OPTIONS)) {
      expect({ name, httpOnly: opts.httpOnly }).toEqual({ name, httpOnly: true });
    }
  });
});

describe('CSRF 排除清单（真实 CSRF_EXCLUDE_PATHS）', () => {
  const excluded = url => CSRF_EXCLUDE_PATHS.some(p => url === p || url.startsWith(`${p}/`));

  it('只有"不依赖浏览器 cookie"的端点被排除：token / revoke / crypto / 设备流', () => {
    for (const url of [
      '/oauth2.1/token',
      '/oauth2.1/revoke',
      '/oauth2.1/crypto/public-key',
      '/oauth2.1/device_authorization',
      '/oauth2.1/device/token'
    ]) {
      expect({ url, excluded: excluded(url) }).toEqual({ url, excluded: true });
    }
  });

  it('🔴 登录 / 授权确认 / 扫码确认 / 登出 必须在保护范围内（登录 CSRF = 登录劫持）', () => {
    for (const url of [
      '/oauth2.1/login',
      '/oauth2.1/mini-login',
      '/oauth2.1/login/consent/confirm',
      '/oauth2.1/login/verify-email',
      '/oauth2.1/authorize/consent',
      '/oauth2.1/qr/confirm',
      '/oauth2.1/logout'
    ]) {
      expect({ url, excluded: excluded(url) }).toEqual({ url, excluded: false });
    }
  });

  it('排除项全部落在 /oauth2.1 内（作用域外的前缀没有意义，只会误导）', () => {
    for (const path of CSRF_EXCLUDE_PATHS) {
      expect({ path, inScope: path.startsWith('/oauth2.1/') }).toEqual({ path, inScope: true });
    }
  });

  it('豁免不能靠前缀把兄弟路径一起带进来（`/oauth2.1/device` 不吞 `/oauth2.1/device/authorize`）', () => {
    expect(excluded('/oauth2.1/device/authorize')).toBe(false);
    expect(excluded('/oauth2.1/device')).toBe(false);
  });
});

describe('敏感接口限频（真实 createIpRateLimiter，内存降级路径）', () => {
  /** 每个用例用独立 prefix，避免共享 memoryStore 串味 */
  let seq = 0;
  const freshLimiter = (max, windowSec) => createIpRateLimiter(`test-${++seq}`, max, windowSec);

  it('窗口内未超阈值时放行', async () => {
    const limit = freshLimiter(3, 60);
    for (let i = 0; i < 3; i++) {
      expect(await limit('1.1.1.1')).toEqual({ allowed: true });
    }
  });

  it('超过阈值后拒绝并给出 Retry-After（正整数秒）', async () => {
    const limit = freshLimiter(2, 60);
    await limit('2.2.2.2');
    await limit('2.2.2.2');

    const blocked = await limit('2.2.2.2');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(Number.isInteger(blocked.retryAfter)).toBe(true);
  });

  it('按 IP 隔离：A 被限流不影响 B', async () => {
    const limit = freshLimiter(1, 60);
    expect((await limit('3.3.3.3')).allowed).toBe(true);
    expect((await limit('3.3.3.3')).allowed).toBe(false);
    expect((await limit('4.4.4.4')).allowed).toBe(true);
  });

  it('不同前缀互不干扰（登录与验证码是两套计数）', async () => {
    const login = createIpRateLimiter(`login-${++seq}`, 1, 60);
    const captcha = createIpRateLimiter(`captcha-${++seq}`, 1, 60);

    expect((await login('5.5.5.5')).allowed).toBe(true);
    expect((await login('5.5.5.5')).allowed).toBe(false);
    // 同一 IP，但验证码计数是另一份
    expect((await captcha('5.5.5.5')).allowed).toBe(true);
  });
});
