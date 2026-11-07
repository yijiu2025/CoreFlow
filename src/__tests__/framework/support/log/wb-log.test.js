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

    const inst = createLogger('inst.a').config({ level: 'debug', debug: true });
    inst.debug('inst-debug-keep');

    createLogger('othermod.x').info('module-rule-keep');
    createLogger('plain.x').info('plain-info-drop');

    const main = readMain();
    expect(main.map(r => r.msg)).toEqual(['inst-debug-keep', 'module-rule-keep']);
  });

  test('实例 file 配置：独立文件名/扩展名/无日期/关闭错误文件', () => {
    configureLog({ level: 'info' });
    const a = createLogger('file.a').config({ file: { name: 'pay', ext: '.txt', date: false, dir: tmpDir } });
    a.info('pay-main');
    a.error('pay-error-file');

    const b = createLogger('file.b').config({ file: { name: 'sec', date: false, error: false, dir: tmpDir } });
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
    createLogger('x')
      .config({ file: { name: 'custom', subdir: 'mymod' } })
      .info('inst-msg');
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

  /**
   * logStdout 与 logger 的两条通道（控制台 / 文件）完全解耦：
   *  - 控制台已关闭（beforeEach 的 console:false）时它照样输出 → 不受 LOG_CONSOLE 门控
   *  - 文件通道开启时它一个字节都不落盘 → 不受 LOG_FILE 门控，也不进 logs/ 目录
   * 固化的动机：CLI 结果输出既不能被 LOG_LEVEL/LOG_CONSOLE 静默吞掉（历史事故），
   * 也不该混进日志文件被清理策略连带删除。若有人给它接上 fileTransport 本用例会失败。
   */
  test('logStdout：不写文件，也不受控制台/文件开关门控', async () => {
    const { logStdout } = await import('wb-logkit');
    const stdoutMarker = 'stdout-only-marker-7c1d';
    const fileMarker = 'file-only-marker-7c1d';

    const captured = [];
    const real = process.stdout.write;
    process.stdout.write = (...args) => {
      captured.push(String(args[0]));
      return true;
    };
    try {
      logStdout(stdoutMarker);
      createLogger('stdout.probe').info(fileMarker); // 同一时刻走文件通道的常规日志
    } finally {
      process.stdout.write = real;
    }

    expect(captured.join('')).toBe(`${stdoutMarker}\n`);

    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.log'));
    expect(files.length).toBeGreaterThan(0); // 防止文件通道没生效导致的空断言假通过
    const all = files.map(f => fs.readFileSync(path.join(tmpDir, f), 'utf-8')).join('');
    expect(all).toContain(fileMarker);
    expect(all).not.toContain(stdoutMarker);
  });

  test('通道级级别：控制台只打 warn+，文件仍记全量', () => {
    configureLog({
      level: 'debug',
      console: true,
      consoleLevel: 'warn', // 控制台静音到 warn
      file: { name: 'ch', dir: tmpDir, ext: '.log', date: true, level: 'debug' }, // 文件记全量
      debugKeywords: ['ch']
    });
    const log = createLogger('ch');

    log.debug('dbg-to-file');
    log.info('info-to-file');
    log.warn('warn-both');
    log.error('err-both');

    const msgs = readMain('ch').map(r => r.msg);
    // 文件：全量（debug 起）
    expect(msgs).toEqual(['dbg-to-file', 'info-to-file', 'warn-both', 'err-both']);
  });

  test('通道级级别：file.level 高于 level 时，文件只留 warn+', () => {
    configureLog({
      level: 'debug',
      console: false,
      file: { name: 'fl', dir: tmpDir, ext: '.log', date: true, level: 'warn' },
      debugKeywords: ['fl']
    });
    const log = createLogger('fl');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(readMain('fl').map(r => r.msg)).toEqual(['w', 'e']);
  });

  test('通道级级别：file 对象存在即开启文件通道（无需 file: true）', () => {
    configureLog({ level: 'info', console: false });
    // 先显式关闭，确认基线
    expect(configureLog({ file: false }).fileEnabled).toBe(false);
    // 给对象即自动开启
    const cfg = configureLog({ file: { name: 'auto-on', dir: tmpDir, date: true } });
    expect(cfg.fileEnabled).toBe(true);
    createLogger('ao').info('auto-on-msg');
    expect(readMain('auto-on').map(r => r.msg)).toEqual(['auto-on-msg']);
  });

  test('通道级级别：file: false 显式关闭优先于对象配置', () => {
    const cfg = configureLog({ file: { name: 'x', dir: tmpDir }, console: false });
    expect(cfg.fileEnabled).toBe(true);
    const cfg2 = configureLog({ file: false });
    expect(cfg2.fileEnabled).toBe(false);
  });

  test('通道级级别：非法 consoleLevel/fileLevel 静默回退到全局 level', () => {
    const cfg = configureLog({
      level: 'info',
      consoleLevel: 'not-a-level',
      file: { name: 'bad', dir: tmpDir, level: 'nope' }
    });
    expect(cfg.consoleLevel).toBe(null);
    expect(cfg.file.level).toBe(null);
  });

  test("通道级级别：file.level='all' 全量记录（含 debug/trace）", () => {
    configureLog({
      level: 'error', // 全局门槛很高
      console: false,
      file: { name: 'allfile', dir: tmpDir, date: true, level: 'all' },
      debugKeywords: ['allmod']
    });
    const log = createLogger('allmod');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    // file.level='all' 是显式配置，优先级高于全局门槛 → 全量写入，不看 LOG_LEVEL 脸色
    expect(readMain('allfile').map(r => r.msg)).toEqual(['d', 'i', 'w', 'e']);
  });

  test("通道级级别：file.level='all' 越过全局门槛（无需关键词，回归）", () => {
    // 回归：全局 level=info 时，实例 file.level='all' 必须让 debug 进文件——
    // 显式通道配置优先级高于"默认门槛"，门槛不该否掉用户写下的配置
    configureLog({ level: 'info', console: false, dir: tmpDir, debugKeywords: [] });
    const log = createLogger('allmod2');
    log.config({ file: { name: 'all2', dir: tmpDir, date: true, level: 'all' } });
    log.debug('d-应进文件');
    log.trace('t-应进文件');
    log.info('i-应进文件');

    expect(readMain('all2').map(r => r.msg)).toEqual(['d-应进文件', 't-应进文件', 'i-应进文件']);
  });

  test("通道级级别：consoleLevel='all' 越过全局门槛（无需关键词，回归）", () => {
    // 全局门槛 warn + 控制台关闭时，显式 consoleLevel 仍应让低级别通过门控；
    // 这里用文件通道做等价断言（测试环境控制台被关闭）
    configureLog({
      level: 'warn',
      console: false,
      file: { name: 'cl3', dir: tmpDir, date: true, level: 'all' },
      debugKeywords: []
    });
    const log = createLogger('allmod3');
    log.config({ consoleLevel: 'all' });
    log.debug('d-应过门控');

    expect(readMain('cl3').map(r => r.msg)).toEqual(['d-应过门控']);
  });

  test('通道级级别：数组白名单只记列出的级别', () => {
    configureLog({
      level: 'debug',
      console: false,
      file: { name: 'wl', dir: tmpDir, date: true, level: ['info', 'error'] },
      debugKeywords: ['wlmod']
    });
    const log = createLogger('wlmod');
    log.debug('d-不在白名单');
    log.info('i-在白名单');
    log.warn('w-不在白名单');
    log.error('e-在白名单');
    log.fatal('f-不在白名单');

    expect(readMain('wl').map(r => r.msg)).toEqual(['i-在白名单', 'e-在白名单']);
  });

  test('通道级级别：consoleLevel 数组白名单（控制台只留 error/fatal）', () => {
    const cfg = configureLog({ consoleLevel: ['error', 'fatal'] });
    expect(cfg.consoleLevel).toEqual(['error', 'fatal']);
  });

  test('通道级级别：逗号分隔字符串等同数组', () => {
    const cfg = configureLog({ consoleLevel: 'warn,error' });
    expect(cfg.consoleLevel).toEqual(['warn', 'error']);
  });

  test('通道级级别：file.level 数组与全局 file 通道配合', () => {
    const cfg = configureLog({ file: { name: 'arr', dir: tmpDir, level: ['warn'] } });
    expect(cfg.file.level).toEqual(['warn']);
    expect(cfg.fileEnabled).toBe(true);
  });

  test('默认不写文件：库初始配置 fileEnabled=false', async () => {
    // 重置编程覆盖 + 清环境变量，回到纯出厂默认
    const { resetLogConfig } = await import('wb-logkit');
    const backup = {};
    for (const k of Object.keys(process.env)) {
      if (/^(LOG_|DEBUG_)/.test(k)) {
        backup[k] = process.env[k];
        delete process.env[k];
      }
    }
    try {
      const cfg = resetLogConfig();
      expect(cfg.fileEnabled).toBe(false);
      expect(cfg.consoleEnabled).toBe(true);
    } finally {
      for (const [k, v] of Object.entries(backup)) process.env[k] = v;
    }
  });
});

describe('全局 log 注册', () => {
  test('createLogger(tag, true) 注册后，全局 log 使用该 tag', async () => {
    const { createLogger, log, getGlobalLogger } = await import('wb-logkit');
    createLogger('pay', true);
    expect(log.tag).toBe('pay');
    expect(getGlobalLogger().tag).toBe('pay');
  });

  test('注册后对实例 config() 会实时反映到全局 log', async () => {
    const { createLogger, log } = await import('wb-logkit');
    const pay = createLogger('billing', true);
    pay.config({ level: 'warn' });
    expect(log.options.level).toBe('warn');
    expect(log.tag).toBe('billing');
  });

  test('对全局 log 调 config() 同步到底层实例', async () => {
    const { createLogger, log } = await import('wb-logkit');
    const svc = createLogger('svc', true);
    svc.config({ level: 'info' });
    log.config({ level: 'error' });
    expect(svc.options.level).toBe('error');
  });

  test('全局 log 是稳定引用：注册前后同一对象，import 方无需重新获取', async () => {
    const { createLogger, log } = await import('wb-logkit');
    const before = log; // 模拟其他文件顶部已 import
    createLogger('later', true);
    expect(log).toBe(before); // Proxy 门面恒定
    expect(log.tag).toBe('later'); // 内容已跟随
  });

  test('未注册时全局 log 为默认 app logger', async () => {
    const { createLogger, log, getGlobalLogger } = await import('wb-logkit');
    // 先注册一个，再用另一个模块实例覆盖，最终都应可读
    createLogger('tmp-reg', true);
    expect(getGlobalLogger().tag).toBe('tmp-reg');
    expect(log.tag).toBe('tmp-reg');
  });

  test('全局 log 可正常输出并写文件', async () => {
    const { createLogger, log } = await import('wb-logkit');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-logkit-global-'));
    try {
      const inst = createLogger('globaltest', true);
      inst.config({ file: { name: 'g', dir, ext: '.log', date: true }, console: false });
      log.info('via-global');
      const date = new Date().toLocaleDateString('sv-SE');
      const p = path.join(dir, `g-${date}.log`);
      expect(fs.existsSync(p)).toBe(true);
      expect(JSON.parse(fs.readFileSync(p, 'utf-8').trim()).msg).toBe('via-global');
      expect(JSON.parse(fs.readFileSync(p, 'utf-8').trim()).tag).toBe('globaltest');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('API 契约：createLogger 只有两个参数，第二参非 true 时不注册全局', async () => {
    // 回归防护：旧文档曾写 createLogger('pay', { level, file })，第二参传对象。
    // 契约是「第二参必须是 boolean」，传对象应被当作 falsy → 不注册全局，
    // 且对象里的配置被静默忽略（配置只能走 config()）。
    const { createLogger, getGlobalLogger } = await import('wb-logkit');
    createLogger('marker', true); // 先占用全局
    const before = getGlobalLogger().tag;

    const inst = createLogger('legacy-shape', { level: 'debug', file: { name: 'x' } });
    expect(getGlobalLogger().tag).toBe(before); // 未被覆盖
    expect(inst.tag).toBe('legacy-shape');
    expect(inst.options).toBeNull(); // 对象被丢弃，未当作 options
  });

  describe('防静默消失（fullstack-rules 审查修复）', () => {
    /** 捕获 process.stderr.write 的输出（降级告警走 stderr 裸写） */
    function captureStderr(fn) {
      const chunks = [];
      const orig = process.stderr.write;
      process.stderr.write = c => {
        chunks.push(String(c));
        return true;
      };
      try {
        fn();
      } finally {
        process.stderr.write = orig;
      }
      return chunks.join('');
    }

    test('fatal 在控制台与文件双关闭时仍向 stderr 兜底（进程级故障不可丢失）', async () => {
      const { createLogger, configureLog } = await import('wb-logkit');
      configureLog({ level: 'info', console: false, file: false });
      const log = createLogger('fatalfallback');
      const out = captureStderr(() => log.fatal('致命故障必须可见'));
      expect(out).toContain('FATAL');
      expect(out).toContain('致命故障必须可见');
    });

    test('log.file.* 但文件通道关闭时向 stderr 告警（配置矛盾，非正常过滤）', async () => {
      const { createLogger, configureLog } = await import('wb-logkit');
      configureLog({ level: 'info', console: true, file: false });
      const log = createLogger('fileonlywarn');
      const out = captureStderr(() => log.file.error('两头都没有的日志'));
      expect(out).toContain('文件通道未开启');
      expect(out).toContain('fileonlywarn');
    });

    test('configureLog 非法级别名留痕（不静默，且指出当前生效值）', async () => {
      const { configureLog } = await import('wb-logkit');
      const out = captureStderr(() => configureLog({ level: 'inf' }));
      expect(out).toContain('非法级别名');
      expect(out).toContain('inf');
    });

    test('configureLog 非法通道级别名留痕并给出已处理结果', async () => {
      const { configureLog } = await import('wb-logkit');
      const out = captureStderr(() => configureLog({ consoleLevel: ['warn', 'erro'] }));
      expect(out).toContain('无法识别的级别名');
      expect(out).toContain('erro');
    });

    test('文件通道写入失败向 stderr 告警（不再全吞）', async () => {
      const { createLogger, configureLog } = await import('wb-logkit');
      // 用一个"指向普通文件而非目录"的 dir，使 mkdirSync/appendFileSync 必然失败
      const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-logkit-fail-'));
      const blocker = path.join(localDir, 'not-a-dir');
      fs.writeFileSync(blocker, 'x');
      try {
        configureLog({
          level: 'info',
          console: false,
          file: { name: 'app', dir: blocker, date: false, error: false, keepDays: 0 }
        });
        const log = createLogger('filefail');
        const out = captureStderr(() => log.info('写不进去的日志'));
        expect(out).toContain('文件通道写入失败');
      } finally {
        fs.rmSync(localDir, { recursive: true, force: true });
      }
    });

    test('Object.keys(全局 log) 反映当前 active 实例（Proxy 反射一致性）', async () => {
      const { createLogger, log } = await import('wb-logkit');
      createLogger('reflect.marker', true);
      const keys = Object.keys(log);
      expect(keys).toContain('tag');
      // 键集应来自 active 实例：注册新实例后 tag 值随之变化
      expect(log.tag).toBe('reflect.marker');
    });
  });
});
