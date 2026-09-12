/**
 * wb-log 核心行为单元测试
 *
 * 覆盖：级别门控、关键词调试、矩阵变体（always/dev/prod/file）、实例配置优先级、
 * 模块级环境变量规则、脱敏、文件命名全量配置、保留天数清理、零配置入口。
 *
 * @author yijiu2025
 * @since 2026-09-12
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('wb-log 核心行为', () => {
  let createLogger;
  let configureLog;
  let reloadLogConfig;
  let tmpDir;

  beforeAll(async () => {
    const mod = await import('@qirly/wb-log');
    createLogger = mod.createLogger;
    configureLog = mod.configureLog;
    reloadLogConfig = mod.reloadLogConfig;
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-log-test-'));

    // 隔离环境变量：清掉宿主环境的 LOG_* / DEBUG_*（保留 NODE_ENV 供环境门控测试改写）
    for (const k of Object.keys(process.env)) {
      if (/^(LOG_|DEBUG_)/.test(k)) delete process.env[k];
    }
    process.env.NODE_ENV = 'test';

    // 全部走文件通道（指定临时目录），关闭 pretty 保持 JSON 行可断言；
    // 控制台关闭，避免测试输出噪音
    configureLog({
      dir: tmpDir,
      console: false,
      pretty: false,
      level: 'info',
      file: { name: 't', date: true, ext: '.log', error: true, keepDays: 30 },
      debugKeywords: [],
      showDev: true
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterAll(() => {
    reloadLogConfig();
  });

  /** 读取当天主日志文件内容（JSON 行数组）；同步落盘，直接读即可 */
  const readMain = (name = 't') => {
    const date = new Date().toLocaleDateString('sv-SE');
    const p = path.join(tmpDir, `${name}-${date}.log`);
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  };

  test('级别门控：低于全局 LOG_LEVEL 的日志被过滤', () => {
    configureLog({ level: 'warn' });
    const log = createLogger('gate');
    log.info('should-drop');
    log.warn('should-keep');
    log.error('should-keep-err');
    const main = readMain();
    expect(main.map(r => r.msg)).toEqual(['should-keep', 'should-keep-err']);
  });

  test('关键词调试：LOG_DEBUG 命中 tag 才输出 debug；* 全开；always.debug 免关键词', () => {
    configureLog({ level: 'info', debugKeywords: ['auth'] });
    createLogger('auth.session').debug('auth-debug');
    createLogger('redis.pool').debug('redis-debug');
    createLogger('redis.pool').always.debug('redis-always-debug');
    const main = readMain();
    expect(main.map(r => r.msg)).toEqual(['auth-debug', 'redis-always-debug']);
  });

  test('关键词匹配规则：路径段匹配 + 前缀通配', async () => {
    const { isDebugTagEnabled } = await import('@qirly/wb-log');
    const kw = new Set(['auth']);
    expect(isDebugTagEnabled('auth', kw)).toBe(true);
    expect(isDebugTagEnabled('auth.session', kw)).toBe(true);
    expect(isDebugTagEnabled('framework.auth.session', kw)).toBe(true);
    expect(isDebugTagEnabled('redis', kw)).toBe(false);
    expect(isDebugTagEnabled('firewall.engine', new Set(['firewall.*']))).toBe(true);
    expect(isDebugTagEnabled('firex', new Set(['firewall.*']))).toBe(false);
  });

  test('矩阵变体：always 绕过级别门控；dev/prod 环境门控；组合等价', () => {
    // NODE_ENV='test'（beforeEach 已设）→ 非生产：dev 显示、prod 吞
    configureLog({ level: 'error' });

    const log = createLogger('mx');
    log.info('drop-info');
    log.always.info('keep-always-info');
    log.always.error('keep-always-error');
    log.dev.warn('drop-dev-warn'); // dev 受 LOG_LEVEL 门控：error 门槛下 warn(40)<50 被吞
    log.dev.error('keep-dev-error');
    log.prod.info('drop-prod-info');
    log.dev.always.warn('keep-dev-always');
    log.always.dev.warn('keep-always-dev');

    const main = readMain();
    expect(main.map(r => r.msg)).toEqual([
      'keep-always-info',
      'keep-always-error',
      'keep-dev-error',
      'keep-dev-always',
      'keep-always-dev'
    ]);
  });

  test('实例配置优先级：level/debug 覆盖全局与模块规则', () => {
    configureLog({ level: 'error', debugKeywords: [] });
    process.env.LOG_LEVEL_OTHERMOD = 'info';
    reloadLogConfig();

    const inst = createLogger('inst.a', { level: 'debug', debug: true });
    inst.debug('inst-debug-keep');

    createLogger('othermod.x').info('module-rule-keep');
    createLogger('plain.x').info('plain-info-drop');

    const main = readMain();
    expect(main.map(r => r.msg)).toEqual(['inst-debug-keep', 'module-rule-keep']);
  });

  test('实例 file 配置：独立文件名/扩展名/无日期/关闭错误文件', () => {
    configureLog({ level: 'info' });
    const a = createLogger('file.a', { file: { name: 'pay', ext: '.txt', date: false, dir: tmpDir } });
    a.info('pay-main');
    a.error('pay-error-file');

    const b = createLogger('file.b', { file: { name: 'sec', date: false, error: false, dir: tmpDir } });
    b.error('sec-no-error-file');

    expect(fs.readFileSync(path.join(tmpDir, 'pay.txt'), 'utf-8')).toContain('pay-main');
    expect(fs.readFileSync(path.join(tmpDir, 'pay-error.txt'), 'utf-8')).toContain('pay-error-file');
    expect(fs.existsSync(path.join(tmpDir, 'sec.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'sec-error.log'))).toBe(false);
  });

  test('错误文件默认命名：全局默认前缀时沿用 error-日期.log 旧约定', () => {
    configureLog({ level: 'warn', file: { name: 'app', date: true, ext: '.log', dir: tmpDir } });
    createLogger('legacy').error('legacy-err');
    const date = new Date().toLocaleDateString('sv-SE');
    expect(fs.readFileSync(path.join(tmpDir, `error-${date}.log`), 'utf-8')).toContain('legacy-err');
  });

  test('脱敏：敏感字段递归掩码', () => {
    configureLog({ level: 'info' });
    createLogger('san').info('san-test', {
      password: 'secret',
      nested: { apiKey: 'k', ok: 1 }
    });
    const [rec] = readMain();
    expect(rec.password).toBe('***');
    expect(rec.nested.apiKey).toBe('***');
    expect(rec.nested.ok).toBe(1);
  });

  test('Error 处理：自动提取 name/message/stack', () => {
    configureLog({ level: 'info' });
    const err = new Error('boom-detail');
    createLogger('errt').error('err-test', err);
    const [rec] = readMain();
    expect(rec.err.name).toBe('Error');
    expect(rec.err.message).toBe('boom-detail');
    expect(typeof rec.err.stack).toBe('string');
  });

  test('保留天数清理：过期文件删除、未过期保留、非日志文件不动', () => {
    const old = new Date(Date.now() - 40 * 86400000).toLocaleDateString('sv-SE');
    const near = new Date(Date.now() - 3 * 86400000).toLocaleDateString('sv-SE');
    // 全局 name='t' → 错误文件前缀为 t-error（非全局默认前缀）
    fs.writeFileSync(path.join(tmpDir, `t-${old}.log`), 'old');
    fs.writeFileSync(path.join(tmpDir, `t-error-${old}.log`), 'old');
    fs.writeFileSync(path.join(tmpDir, `t-${near}.log`), 'near');
    fs.writeFileSync(path.join(tmpDir, 'readme-important.md'), 'keep');

    configureLog({ level: 'info', file: { name: 't', keepDays: 30, date: true, dir: tmpDir } });
    createLogger('clean').info('trigger-cleanup');

    expect(fs.existsSync(path.join(tmpDir, `t-${old}.log`))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, `t-error-${old}.log`))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, `t-${near}.log`))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'readme-important.md'))).toBe(true);
  });

  test('零配置入口：log 直接打印且可 config', async () => {
    const { log } = await import('@qirly/wb-log');
    log.info('zero-config-msg');
    const main = readMain();
    expect(main.at(-1).msg).toBe('zero-config-msg');
    expect(main.at(-1).tag).toBe('app');
  });

  test('logStdout：原始输出无 JSON 装饰', async () => {
    const { logStdout } = await import('@qirly/wb-log');
    const captured = [];
    const real = process.stdout.write;
    process.stdout.write = (...args) => {
      captured.push(String(args[0]));
      return true;
    };
    try {
      logStdout('plain-out');
    } finally {
      process.stdout.write = real;
    }
    expect(captured.join('')).toBe('plain-out\n');
  });
});
