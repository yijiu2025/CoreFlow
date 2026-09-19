/**
 * 权限缓存与 Guard 第 4 层的契约守卫
 *
 * 这类测试的价值不在"证明当前代码正确"，而在**钉死跨模块的字面量/接口约定**，
 * 让"改一处忘另一处"的静默失效在下一次改动时立刻变红。
 *
 * 背景：`PERM_NAMESPACE` 在 perm-cache.js 与 session-store.js 里各声明了一次
 * （后者受"零兄弟模块依赖"约束不能 import 前者）。命名空间字符串不一致会让
 * 读写落到不同 store，且**完全静默** —— 历史上 'user_sessions' 与 'userSessions'
 * 就因此让注销清理零执行。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERM_NAMESPACE, PERM_TTL, buildPermKey } from '../../framework/auth/perm-cache.js';
import { PERM_NAMESPACE as NS_IN_STORE } from '../../framework/auth/session-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', '..');

const read = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('权限缓存命名空间契约（第 2 层）', () => {
  test('两处 PERM_NAMESPACE 运行时取值逐字一致', () => {
    expect(NS_IN_STORE).toBe(PERM_NAMESPACE);
  });

  test("全仓不得再出现裸 getStore('perm')（旧业务 store 名）", () => {
    const offenders = [];
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'docs') continue;
          walk(p);
        } else if (e.name.endsWith('.js')) {
          const body = stripComments(fs.readFileSync(p, 'utf8'));
          // 裸 'perm' 命名空间：与 'auth:perm' 不同 → 读写必然错位
          if (/getStore\(\s*['"]perm['"]/.test(body)) offenders.push(path.relative(SRC, p));
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });

  test('perm 缓存键不得是明文 userId:appId 形式', () => {
    const body = stripComments(read('framework/auth/perm-cache.js'));
    // 旧实现：`${userId}:${appId}` 直接做键，可被枚举猜测
    expect(body).not.toMatch(/\$\{userId\}:\$\{appId\}/);
    // 新实现必须经过 buildPermKey（sha256）
    expect(body).toMatch(/createHash\('sha256'\)/);
  });

  test('buildPermKey 不是可枚举明文（防键空间遍历）', () => {
    const key = buildPermKey(1, 'oauth21');
    // 不能含 appId 明文（否则 `SCAN auth:perm:*oauth21*` 就能枚举某应用的全体用户）
    expect(key).not.toContain('oauth21');
    // 也不能是 `${userId}:${appId}` 的变形（如 userId 直接拼在开头）
    expect(key).not.toBe(`1oauth21`);
    expect(key).not.toMatch(/^1/); // 不等于把 userId 明文当前缀
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    // 相邻 userId 的键必须无关联（不可递推）
    expect(buildPermKey(2, 'oauth21')).not.toBe(buildPermKey(1, 'oauth21'));
  });

  test('PERM_TTL 必须是秒级短 TTL（长 TTL 会掩盖权限变更）', () => {
    expect(Number.isInteger(PERM_TTL)).toBe(true);
    expect(PERM_TTL).toBeGreaterThan(0);
    expect(PERM_TTL).toBeLessThanOrEqual(300);
  });
});

describe('会话权限走的必须是指纹入口（第 3 层）', () => {
  test('session.js 不得再直接调用 loadUserPermissions', () => {
    const body = stripComments(read('framework/auth/session.js'));
    // 直接调用会绕过指纹校验 → 会话长 TTL 再次掩盖权限变更
    expect(body).not.toMatch(/loadUserPermissions\s*\(/);
    expect(body).toMatch(/resolveSessionPermissions\s*\(/);
  });

  test('auth/index.js 的 JWT 路径走 getPermissions（带指纹）', () => {
    const body = stripComments(read('framework/auth/index.js'));
    expect(body).toMatch(/getPermissions\s*\(/);
    expect(body).not.toMatch(/loadUserPermissions\s*\(/);
  });

  test('会话数据里持久化了 permFingerprint', () => {
    const body = stripComments(read('framework/auth/session.js'));
    // 三处构造 sessionData 的位置都应带上指纹
    const hits = body.match(/permFingerprint,/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });
});

describe('敏感操作回源校验契约（第 4 层）', () => {
  test('guard.js 消费 freshPermission 并 fail-closed', () => {
    const body = stripComments(read('api/guard.js'));
    expect(body).toMatch(/freshPermission/);
    // 回源失败必须拒绝（而不是沿用旧权限放行）
    expect(body).toMatch(/fresh:\s*true/);
    expect(body).toMatch(/敏感操作权限回源失败/);
  });

  test('freshPermission 不得进入 RUNTIME_FIELDS（否则运维改 DB 即可关掉第 4 层）', () => {
    const body = stripComments(read('api/guard-config.js'));
    const m = body.match(/const RUNTIME_FIELDS\s*=\s*\[([^\]]*)\]/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toContain('freshPermission');
  });

  test('freshPermission 必须被 registerApiMetadata 落进配置对象（否则守卫读不到）', () => {
    const body = stripComments(read('api/guard-config.js'));
    const hits = body.match(/freshPermission/g) || [];
    // 首次注册 + 后续更新 + 注释，至少 2 处实际赋值
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  test('权限变更的两个接口都声明了 freshPermission', () => {
    const body = stripComments(read('api/admin/iam/v1/iam.js'));
    const hits = body.match(/freshPermission:\s*true/g) || [];
    expect(hits.length).toBe(2);
  });

  test('权限变更后主动失效缓存（iam.dao.js）', () => {
    const body = stripComments(read('app/admin/dao/iam.dao.js'));
    expect(body).toMatch(/invalidatePermCache/);
    const hits = body.match(/invalidateTargetPerm\s*\(/g) || [];
    // 定义 1 处 + 调用至少 2 处（assignRole / updateInlinePolicy）
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  test('主动失效失败不得阻断业务（缓存层故障不能回滚权限变更）', () => {
    const body = stripComments(read('app/admin/dao/iam.dao.js'));
    // 失效助手必须 try/catch 且只记日志
    expect(body).toMatch(/catch\s*\(err\)\s*\{\s*log\.warn/);
  });
});

describe('防复发：反例验证（确认检测器真的会红）', () => {
  test("检测器能识别裸 getStore('perm') 写法", () => {
    const RE = /getStore\(\s*['"]perm['"]/;
    expect(RE.test(stripComments(`const s = getStore('perm');`))).toBe(true);
    expect(RE.test(stripComments(`const s = getStore("perm", { timeout: 1 });`))).toBe(true);
    // 注释里的提及不算违规（会被剥掉）
    expect(RE.test(stripComments(`// 不要再写 getStore('perm')`))).toBe(false);
    // 正确写法不误伤
    expect(RE.test(stripComments(`getStore(PERM_NAMESPACE)`))).toBe(false);
  });

  test('检测器能识别回到 loadUserPermissions 直调', () => {
    const RE = /loadUserPermissions\s*\(/;
    expect(RE.test(stripComments(`const r = await loadUserPermissions(a, b);`))).toBe(true);
    expect(RE.test(stripComments(`// 不再调用 loadUserPermissions(a, b)`))).toBe(false);
    expect(RE.test(stripComments(`import { loadUserPermissions } from './x.js';`))).toBe(false);
  });

  test('检测器能识别 RUNTIME_FIELDS 里混入 freshPermission', () => {
    const grab = body => (body.match(/const RUNTIME_FIELDS\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
    expect(grab(`const RUNTIME_FIELDS = ['enabled', 'freshPermission'];`)).toContain('freshPermission');
    expect(grab(`const RUNTIME_FIELDS = ['enabled', 'requireLogin'];`)).not.toContain('freshPermission');
  });
});
