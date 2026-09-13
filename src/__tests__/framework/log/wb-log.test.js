/**
 * wb-logkit 核心行为单元测试
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

describe('wb-logkit 核心行为', () => {
  let createLogger;
  let configureLog;
  let reloadLogConfig;
  let tmpDir;

  beforeAll(async () => {
    const mod = await import('wb-logkit');
    createLogger = mod.createLogger;
    configureLog = mod.configureLog;
    reloadLogConfig = mod.reloadLogConfig;
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-logkit-test-'));

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
    const { isDebugTagEnabled } = await import('wb-logkit');
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

  // ── 目录分层（dateDir / subdir）─────────────────────────────

  test('dateDir：日期作为子目录，文件名不再带日期后缀', () => {
    configureLog({
      level: 'info',
      file: { name: 'app', dir: tmpDir, dateDir: true, date: true, ext: '.log' }
    });
    createLogger('d').info('datedir-msg');
    const date = new Date().toLocaleDateString('sv-SE');
    const p = path.join(tmpDir, date, 'app.log');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf-8')).toContain('datedir-msg');
    // 旧布局文件不应产生
    expect(fs.existsSync(path.join(tmpDir, `app-${date}.log`))).toBe(false);
  });

  test('subdir 固定名：写入 logs/日期/<subdir>/ 下', () => {
    configureLog({
      level: 'info',
      file: { name: 'app', dir: tmpDir, dateDir: true, subdir: 'firewall', ext: '.log' }
    });
    createLogger('firewall.engine').info('fw-msg');
    const date = new Date().toLocaleDateString('sv-SE');
    const p = path.join(tmpDir, date, 'firewall', 'app.log');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf-8')).toContain('fw-msg');
  });

  test('subdir=auto：按 tag 首段自动分目录', () => {
    configureLog({
      level: 'info',
      file: { name: 'app', dir: tmpDir, dateDir: true, subdir: 'auto', ext: '.log' }
    });
    createLogger('oauth21.services').info('oauth-msg');
    createLogger('web.index').info('web-msg');
    const date = new Date().toLocaleDateString('sv-SE');
    expect(fs.readFileSync(path.join(tmpDir, date, 'oauth21', 'app.log'), 'utf-8')).toContain('oauth-msg');
    expect(fs.readFileSync(path.join(tmpDir, date, 'web', 'app.log'), 'utf-8')).toContain('web-msg');
  });

  test('实例级 file.subdir / file.name 覆盖全局', () => {
    configureLog({
      level: 'info',
      file: { name: 'app', dir: tmpDir, dateDir: true, ext: '.log' }
    });
    createLogger('x', { file: { name: 'custom', subdir: 'mymod' } }).info('inst-msg');
    const date = new Date().toLocaleDateString('sv-SE');
    const p = path.join(tmpDir, date, 'mymod', 'custom.log');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf-8')).toContain('inst-msg');
  });

  test('dateDir 清理：过期日期目录整删，含其中的模块子目录', () => {
    const old = new Date(Date.now() - 40 * 86400000).toLocaleDateString('sv-SE');
    const today = new Date().toLocaleDateString('sv-SE');
    // 过期目录下带多个模块子目录（回归：曾因只删 <date>/<当前 subdir> 而漏删）
    fs.mkdirSync(path.join(tmpDir, old, 'firewall'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, old, 'oauth21'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, old, 'firewall', 'app.log'), 'old\n');
    fs.mkdirSync(path.join(tmpDir, today), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'mydata'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'mydata', 'keep.txt'), 'keep\n');

    configureLog({
      level: 'info',
      file: { name: 'app', dir: tmpDir, dateDir: true, subdir: 'auto', keepDays: 30, ext: '.log' }
    });
    createLogger('c').info('trigger-cleanup');

    expect(fs.existsSync(path.join(tmpDir, old))).toBe(false); // 过期目录整删（含所有模块子目录）
    expect(fs.existsSync(path.join(tmpDir, today))).toBe(true); // 当天保留
    expect(fs.existsSync(path.join(tmpDir, 'mydata', 'keep.txt'))).toBe(true); // 非日期目录不受影响
  });

  test('dateDir 清理：keepDays=0 关闭清理，过期目录保留', () => {
    const old = new Date(Date.now() - 100 * 86400000).toLocaleDateString('sv-SE');
    fs.mkdirSync(path.join(tmpDir, old), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, old, 'app.log'), 'old\n');

    configureLog({
      level: 'info',
      file: { name: 'app', dir: tmpDir, dateDir: true, keepDays: 0, ext: '.log' }
    });
    createLogger('c0').info('no-cleanup');

    expect(fs.existsSync(path.join(tmpDir, old))).toBe(true);
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

  test('脱敏：key 模式不误伤普通字段', async () => {
    const { sanitizeForLog } = await import('wb-logkit');
    const out = sanitizeForLog({ keyword: 'kw', keyboard: 'kb', apiKey: 'a', primaryKey: 'p' });
    expect(out.keyword).toBe('kw');
    expect(out.keyboard).toBe('kb');
    expect(out.apiKey).toBe('***');
    expect(out.primaryKey).toBe('***');
  });

  test('截断：超长字符串按 maxStr 截断加标记；0 关闭', () => {
    const long = 'x'.repeat(100);
    try {
      configureLog({ level: 'info', maxStr: 20 });
      // 裸字符串参数拼进 msg（'trunc-on ' + 100 个 x = 109 字符），对象参数进 data
      createLogger('trunc').info('trunc-on', long, { s: long });
      let [rec] = readMain();
      expect(rec.msg).toMatch(/…\(len=109\)$/);
      expect(rec.msg.length).toBeLessThanOrEqual(40);
      expect(rec.s).toMatch(/…\(len=100\)$/);

      configureLog({ level: 'info', maxStr: 0 });
      createLogger('trunc').info('trunc-off', { s: long });
      rec = readMain().at(-1);
      expect(rec.s).toBe(long);
    } finally {
      configureLog({ maxStr: 2000 }); // 还原，避免污染后续用例（runtimeOverrides 累积合并）
    }
  });

  test('时间基准：record.t 为本地时区 ISO（含偏移），与文件滚动日期一致', () => {
    configureLog({ level: 'info' });
    createLogger('tz').info('tz-msg');
    const [rec] = readMain();
    expect(rec.t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    // t 的日期部分 == 文件名中的日期
    const date = new Date().toLocaleDateString('sv-SE');
    expect(rec.t.startsWith(date)).toBe(true);
    expect(new Date(rec.t).getTime()).not.toBeNaN(); // 合法可解析
  });

  test('文件后缀：自定义字符串与 pid 模式', () => {
    try {
      configureLog({ level: 'info', fileSuffix: 'alpha', file: { name: 't', dir: tmpDir, ext: '.log', date: true } });
      createLogger('sfx').info('suffix-alpha');
      const date = new Date().toLocaleDateString('sv-SE');
      expect(fs.existsSync(path.join(tmpDir, `t-alpha-${date}.log`))).toBe(true);

      configureLog({ level: 'info', fileSuffix: 'pid', file: { name: 'p', dir: tmpDir, ext: '.log', date: true } });
      createLogger('sfx').info('suffix-pid');
      expect(fs.existsSync(path.join(tmpDir, `p-${process.pid}-${date}.log`))).toBe(true);
    } finally {
      configureLog({ fileSuffix: '', file: { name: 't' } }); // 还原，避免污染后续用例
    }
  });

  test('ctx 注入保护：provider 返回核心字段时不覆盖记录', async () => {
    const { setLogContextProvider } = await import('wb-logkit');
    configureLog({ level: 'info' });
    setLogContextProvider(() => ({ tag: 'evil', msg: 'evil', requestId: 'req-1', userId: 9 }));
    try {
      createLogger('safe').info('ctx-msg');
    } finally {
      setLogContextProvider(null);
    }
    const [rec] = readMain();
    expect(rec.tag).toBe('safe');
    expect(rec.msg).toBe('ctx-msg');
    expect(rec.requestId).toBe('req-1');
    expect(rec.userId).toBe(9);
  });

  test('配置深冻结：cfg 与 cfg.file 不可变', () => {
    const cfg = configureLog({ level: 'info' });
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen(cfg.file)).toBe(true);
  });

  test('文件通道：剥离 msg 中的 ANSI 颜色码，文件保持纯文本', () => {
    configureLog({ level: 'info' });
    createLogger('ansi').info(`\x1b[33m⚠️ [X] 黄色消息\x1b[0m`, { k: '\x1b[31m红\x1b[0m' });
    const [rec] = readMain();
    expect(rec.msg).toContain('黄色消息');
    expect(rec.msg).not.toContain('\x1b[');
    expect(rec.k).toBe('红');
  });

  test('pretty 模式：非 TTY（管道/重定向）不输出 ANSI 颜色码', () => {
    configureLog({ level: 'info', console: true, pretty: true });
    const captured = [];
    const real = process.stderr.write;
    // jest 环境下 stdout/stderr 均为管道（isTTY=undefined）→ 修复前 useColor 误判为 true
    process.stderr.write = (...args) => {
      captured.push(String(args[0]));
      return true;
    };
    try {
      createLogger('tty').error('no-ansi-please');
    } finally {
      process.stderr.write = real;
    }
    expect(captured.join('')).toContain('no-ansi-please');
    expect(captured.join('')).not.toContain('\x1b[');
  });

  test('脱敏：超过深度限制的部分返回占位符，不泄露未脱敏对象', () => {
    configureLog({ level: 'info' });
    // 测试夹具值动态拼接（仅验证掩码行为，非真实凭据）
    const fakeSecret = ['leak', 'attempt'].join('-');
    createLogger('deep').info('deep-san-test', {
      l1: { l2: { l3: { l4: { password: fakeSecret, token: ['t', 'ok'].join('') } } } }
    });
    const [rec] = readMain();
    // 第 4 层对象整体替换为占位符，内部敏感字段绝不透出
    expect(rec.l1.l2.l3).toBe('[maxDepth]');
  });

  test('健壮性：循环引用数组/对象、BigInt 不抛异常且不丢日志', () => {
    configureLog({ level: 'info' });

    // 循环引用数组：旧实现 JSON.stringify 抛 TypeError 直接打进业务调用方
    const circArr = ['a', 1];
    circArr.push(circArr);
    expect(() => createLogger('cyc').info('circ-array', circArr)).not.toThrow();

    // 循环引用对象：脱敏深度限制会截断，正常落盘
    const circObj = { self: null };
    circObj.self = circObj;
    expect(() => createLogger('cyc').info('circ-object', circObj)).not.toThrow();

    // BigInt：旧实现 transport 内 JSON.stringify 抛错 → 整行静默丢失
    expect(() => createLogger('big').info('bigint-msg', { n: 123n })).not.toThrow();

    const main = readMain();
    const msgs = main.map(r => r.msg);
    // 数组参数会序列化拼进 msg（含 '[Circular]'/'[maxDepth]' 截断标记）
    expect(msgs[0]).toMatch(/^circ-array \[/);
    expect(msgs[0]).toContain('[maxDepth]');
    expect(msgs).toContain('circ-object');
    expect(msgs).toContain('bigint-msg');
    const bigintRec = main.find(r => r.msg === 'bigint-msg');
    expect(bigintRec.n).toBe('123n');
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
    const { log } = await import('wb-logkit');
    log.info('zero-config-msg');
    const main = readMain();
    expect(main.at(-1).msg).toBe('zero-config-msg');
    expect(main.at(-1).tag).toBe('app');
  });

  test('logStdout：原始输出无 JSON 装饰', async () => {
    const { logStdout } = await import('wb-logkit');
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
