/**
 * firewall Redis 访问层契约测试
 *
 * 背景：firewall 过去在 10 个文件里传来传去 `app.redis` 裸客户端，手写命令，踩了三类坑：
 *   1. node-redis v5 只认驼峰（`hSet`/`hGetAll`…），`hset`/`hgetall` 一律 undefined
 *      → try/catch 吞掉后 hash 索引静默写不进去，404 陷阱直接抛错；
 *   2. `pipeline()` 是 ioredis 的 API；`eval(script, numKeys, key, arg)` 是旧签名；
 *   3. 没有超时/降级，Redis 抖动直接拖慢请求。
 *
 * 本测试分两层：
 *   A. 行为层 —— 在无 Redis 环境下（jest 不加载 .env，适配层自动走内存实现）
 *      逐条固化适配层的语义：一次性读取、原子双写、白名单短路、TTL 兜底、计数与令牌。
 *   B. 源码层 —— 静态扫描 firewall 全部源码，禁止上述不兼容 API 与裸客户端回潮。
 *      行为层只能证明「当前实现是对的」，源码层才能拦住「以后又写回去」。
 *
 * @author yijiu2025
 * @since 2026-09-15
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import * as adapter from '../app/firewall/util/redis.js';
import * as blockManager from '../app/firewall/engine/dao/block-manager.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..');
const FIREWALL_DIRS = [path.join(SRC, 'app', 'firewall'), path.join(SRC, 'api', 'firewall')];

/** 收集目录下全部 .js 源文件 */
function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const IP = '203.0.113.10';
const FP = 'abc123def456abcd';

const FILES = FIREWALL_DIRS.flatMap(d => walkJs(d));
const ADAPTER_PATH = path.join(SRC, 'app', 'firewall', 'util', 'redis.js');

/** 相对 src/ 的展示路径 */
const relToSrc = f => path.relative(SRC, f).replace(/\\/g, '/');

/**
 * 取出「代码行」：剔除纯注释行与行尾注释。
 *
 * 必需的一步：本仓库的文档注释会**刻意引用**被禁用的历史写法（如 `redisClient.pipeline()`、
 * `eval(script, numKeys, key, arg)`）来解释为什么改掉，不剔除注释就会把每条守卫都变成假报警。
 *
 * @param {string} src 源码
 * @returns {Array<{no:number, text:string}>} 行号 + 去注释后的该行内容
 */
function codeLines(src) {
  return src.split('\n').map((line, i) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      return { no: i + 1, text: '' };
    }
    // 行尾注释也去掉；用 [^:] 保护 `https://` 这类 URL 不被误切
    return { no: i + 1, text: line.replace(/(^|[^:])\/\/.*$/, '$1') };
  });
}

/**
 * 在全部 firewall 源码的代码行中查找违规位置
 *
 * @param {RegExp} pattern 匹配模式（不要带 g 标志）
 * @param {string} [skipFile] 需要跳过的文件绝对路径
 * @returns {string[]} `相对路径:行号` 列表
 */
function findOffenders(pattern, skipFile) {
  const hits = [];
  for (const f of FILES) {
    if (skipFile && f === skipFile) continue;
    for (const { no, text } of codeLines(fs.readFileSync(f, 'utf8'))) {
      if (pattern.test(text)) hits.push(`${relToSrc(f)}:${no}`);
    }
  }
  return hits;
}

beforeEach(() => {
  adapter.resetMemoryState();
});

describe('firewall Redis 访问层：运行环境前提', () => {
  it('单测环境必须处于内存降级模式（否则下面的行为断言会误测 Redis 路径）', () => {
    expect(adapter.redisAvailable()).toBe(false);
  });
});

describe('firewall Redis 访问层：访问控制状态读取', () => {
  it('无任何记录时四项状态均为空', async () => {
    const st = await adapter.readAccessState({ ip: IP, fingerprint: FP });
    expect(st).toEqual({ fpWhitelisted: false, ipWhitelisted: false, fpBlock: null, ipBlock: null });
  });

  it('IP 封禁可被读到，并带剩余秒数', async () => {
    const now = Date.now();
    await adapter.writeBlock(
      { ip: IP },
      { status: 'BLOCKED', source: 'auto', permanent: false, createdAt: now, expiresAt: now + 120_000 }
    );
    const st = await adapter.readAccessState({ ip: IP });
    expect(st.ipBlock.status).toBe('BLOCKED');
    expect(st.ipBlock.ttlSec).toBeGreaterThan(100);
    expect(st.ipBlock.ttlSec).toBeLessThanOrEqual(120);
  });

  it('永久封禁的 ttlSec 为约定的兜底值（供 Retry-After 使用）', async () => {
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'manual', permanent: true, expiresAt: null });
    const st = await adapter.readAccessState({ ip: IP });
    expect(st.ipBlock.ttlSec).toBe(adapter.PERMANENT_RETRY_AFTER);
  });

  it('指纹封禁与 IP 封禁互不干扰', async () => {
    await adapter.writeBlock({ fingerprint: FP }, { status: 'SCANNER', source: 'auto', permanent: true });
    const st = await adapter.readAccessState({ ip: IP, fingerprint: FP });
    expect(st.fpBlock.status).toBe('SCANNER');
    expect(st.ipBlock).toBeNull();
  });

  it('白名单优先级最高：IP 白名单命中后不再返回封禁状态', async () => {
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'manual', permanent: true });
    await adapter.writeWhitelist({ ip: IP }, 60);
    const st = await adapter.readAccessState({ ip: IP });
    expect(st.ipWhitelisted).toBe(true);
    expect(st.ipBlock).toBeNull();
  });

  it('指纹白名单命中同样短路 IP 封禁', async () => {
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'manual', permanent: true });
    await adapter.writeWhitelist({ fingerprint: FP }, 60);
    const st = await adapter.readAccessState({ ip: IP, fingerprint: FP });
    expect(st.fpWhitelisted).toBe(true);
    expect(st.ipBlock).toBeNull();
  });

  it('decodeStatus 兼容「JSON 元数据」与「旧格式纯字符串」两种存量数据', () => {
    expect(adapter.decodeStatus('BLOCKED')).toBe('BLOCKED');
    expect(adapter.decodeStatus('{"status":"SCANNER"}')).toBe('SCANNER');
    expect(adapter.decodeStatus('{"noStatus":1}')).toBe('BLOCKED');
    expect(adapter.decodeStatus('not-json')).toBe('not-json');
  });
});

describe('firewall Redis 访问层：封禁/白名单写入必须同时落「键」与「索引」', () => {
  it('写封禁后列表可见（复现并锁死「键写了但索引没写」的历史缺陷）', async () => {
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'auto', permanent: true });
    const { ip, fp } = await adapter.listActive('block');
    expect(ip.map(e => e.field)).toContain(IP);
    expect(fp).toHaveLength(0);
  });

  it('写指纹封禁后进入指纹索引而非 IP 索引', async () => {
    await adapter.writeBlock({ fingerprint: FP }, { status: 'SCANNER', source: 'auto', permanent: true });
    const { ip, fp } = await adapter.listActive('block');
    expect(fp.map(e => e.field)).toContain(FP);
    expect(ip).toHaveLength(0);
  });

  it('写白名单后进入白名单索引，与封禁索引互不混淆', async () => {
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'auto', permanent: true });
    await adapter.writeWhitelist({ ip: '198.51.100.7' }, 60);
    const blocks = await adapter.listActive('block');
    const whites = await adapter.listActive('whitelist');
    expect(blocks.ip.map(e => e.field)).toEqual([IP]);
    expect(whites.ip.map(e => e.field)).toEqual(['198.51.100.7']);
  });

  it('时间推进到有效期之后，条目从列表中消失（不存在永久残留的索引项）', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    try {
      await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'auto', permanent: false });
      expect((await adapter.listActive('block')).ip).toHaveLength(1);

      jest.setSystemTime(new Date('2026-01-01T00:02:00Z')); // 兜底 60s 已过
      expect((await adapter.listActive('block')).ip).toHaveLength(0);
      expect((await adapter.readAccessState({ ip: IP })).ipBlock).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('白名单到期后不再短路封禁检查', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    try {
      await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'manual', permanent: true });
      await adapter.writeWhitelist({ ip: IP }, 60);
      expect((await adapter.readAccessState({ ip: IP })).ipWhitelisted).toBe(true);

      jest.setSystemTime(new Date('2026-01-01T00:02:00Z'));
      const st = await adapter.readAccessState({ ip: IP });
      expect(st.ipWhitelisted).toBe(false);
      expect(st.ipBlock).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('removeBlock 同时清掉键与索引', async () => {
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'auto', permanent: true });
    await adapter.removeBlock({ ip: IP });
    expect((await adapter.readAccessState({ ip: IP })).ipBlock).toBeNull();
    expect((await adapter.listActive('block')).ip).toHaveLength(0);
  });

  it('removeWhitelist 同时清掉键与索引', async () => {
    await adapter.writeWhitelist({ ip: IP }, 60);
    await adapter.removeWhitelist({ ip: IP });
    expect((await adapter.readAccessState({ ip: IP })).ipWhitelisted).toBe(false);
    expect((await adapter.listActive('whitelist')).ip).toHaveLength(0);
  });
});

describe('firewall Redis 访问层：封禁 TTL 兜底（防止临时封禁变永久）', () => {
  it('元数据缺少 expiresAt 时按 60s 临时封禁兜底，而不是写永久', async () => {
    // 历史缺陷：auto-responder 传过 { reason, duration }，算出 Math.max(1, NaN) = NaN，
    // SET ... EX NaN 抛错后若忽略错误不带 TTL 写入，临时封禁就变成了永久封禁。
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'auto' });
    const st = await adapter.readAccessState({ ip: IP });
    expect(st.ipBlock).not.toBeNull();
    expect(st.ipBlock.ttlSec).toBeLessThanOrEqual(60);
  });

  it('expiresAt 已在过去时同样兜底为 60s 临时封禁（宁可短封，不可误永久）', async () => {
    await adapter.writeBlock({ ip: IP }, { status: 'BLOCKED', source: 'auto', expiresAt: Date.now() - 5000 });
    const st = await adapter.readAccessState({ ip: IP });
    // 若采纳已过期的 expiresAt，`SET ... EX 负数` 会抛错；忽略错误不带 TTL 写入则会把
    // 「临时封禁」变成「永久封禁」——那是比短封更糟的失败形态。
    expect(st.ipBlock).not.toBeNull();
    expect(st.ipBlock.ttlSec).toBeLessThanOrEqual(60);
  });
});

describe('firewall Redis 访问层：normalizeDuration 入参防御', () => {
  it('是同一个函数实例（block-manager 与适配层不得各持一份副本）', () => {
    expect(blockManager.normalizeDuration).toBe(adapter.normalizeDuration);
  });

  it.each([
    [120, 120],
    ['90', 90],
    [{ duration: 120 }, 120],
    [{ durationSeconds: '300' }, 300],
    [1.2, 2]
  ])('合法入参 %p → %p 秒', (input, expected) => {
    expect(adapter.normalizeDuration(input)).toBe(expected);
  });

  it.each([[undefined], [null], [{}], [{ duration: 'abc' }], [NaN], [0], [-5], ['abc'], [Infinity]])(
    '非法入参 %p 一律兜底为 24 小时（不产生 NaN TTL）',
    input => {
      expect(adapter.normalizeDuration(input)).toBe(86400);
    }
  );

  it('对象形式的入参也能真正写进白名单（历史缺陷：NaN TTL 导致静默失败）', async () => {
    await adapter.writeWhitelist({ ip: IP }, { duration: 60 });
    expect((await adapter.readAccessState({ ip: IP })).ipWhitelisted).toBe(true);
  });
});

describe('firewall Redis 访问层：计数 / 滑窗 / 令牌', () => {
  it('bumpCounter 递增且首轮即建立窗口', async () => {
    const key = adapter.rel.trap(IP);
    expect(await adapter.bumpCounter(key, 300)).toBe(1);
    expect(await adapter.bumpCounter(key, 300)).toBe(2);
    expect(await adapter.readCounter(key)).toBe(2);
  });

  it('removeCounters 清零计数（登录成功后清失败计数）', async () => {
    const key = adapter.rel.bruteIp(IP);
    await adapter.bumpCounter(key, 900);
    await adapter.removeCounters([key]);
    expect(await adapter.readCounter(key)).toBe(0);
  });

  it('consumeRateWindow 返回窗口内累计次数（含本次）', async () => {
    const key = adapter.rel.rateLimit(`/api/order:${IP}`);
    expect(await adapter.consumeRateWindow(key, 60_000)).toBe(1);
    expect(await adapter.consumeRateWindow(key, 60_000)).toBe(2);
    expect(await adapter.consumeRateWindow(key, 60_000)).toBe(3);
  });

  it('窗口外的历史记录被滑动清理（用受控时钟，避免同毫秒抖动）', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    try {
      const key = adapter.rel.rateLimit(`/api/order:${IP}`);
      expect(await adapter.consumeRateWindow(key, 1000)).toBe(1);
      jest.setSystemTime(new Date('2026-01-01T00:00:02Z')); // 已超出 1s 窗口
      expect(await adapter.consumeRateWindow(key, 1000)).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('grantPass / hasPass 支持 IP 与指纹两个维度', async () => {
    await adapter.grantPass({ ip: IP, fingerprint: FP, token: 'tok1', ttlSec: 300 });
    expect(await adapter.hasPass({ ip: IP, token: 'tok1' })).toBe(true);
    expect(await adapter.hasPass({ ip: IP, fingerprint: FP, token: 'tok1' })).toBe(true);
    expect(await adapter.hasPass({ ip: IP, token: 'other' })).toBe(false);
  });

  it('grantPass 不带指纹时只有 IP 维度可用', async () => {
    await adapter.grantPass({ ip: IP, token: 'tok2', ttlSec: 300 });
    expect(await adapter.hasPass({ ip: IP, token: 'tok2' })).toBe(true);
    expect(await adapter.hasPass({ ip: IP, fingerprint: FP, token: 'tok2' })).toBe(true);
  });

  it('setFlag / hasFlag 用于账号锁定', async () => {
    const key = adapter.rel.accountLock('bob');
    expect(await adapter.hasFlag(key)).toBe(false);
    await adapter.setFlag(key, 900);
    expect(await adapter.hasFlag(key)).toBe(true);
  });

  it('removeKeys 可清理任意相对 key', async () => {
    const lock = adapter.rel.accountLock('bob');
    await adapter.setFlag(lock, 900);
    await adapter.removeKeys([lock]);
    expect(await adapter.hasFlag(lock)).toBe(false);
  });

  it('Redis 不可用时 scanKeys 返回空数组（不是抛错），CLI 统计因此显示 0', async () => {
    expect(await adapter.scanKeys('block:*')).toEqual([]);
  });
});

describe('firewall Redis 访问层：源码级回潮守卫', () => {
  it('扫描范围有效（防止路径写错导致空扫描假通过）', () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES).toContain(ADAPTER_PATH);
  });

  it('没有任何文件使用 ioredis 的 pipeline()', () => {
    expect(findOffenders(/\.pipeline\s*\(/).join('\n')).toBe('');
  });

  it('没有任何文件在裸客户端上使用 node-redis v5 不存在的全小写命令', () => {
    // 注意：框架 store 自己是**小写方法名**（store().hgetall / hexists / hset / hdel），
    // 内部才映射到 node-redis 的驼峰命令，所以 `store().hgetall(...)` 合法。
    // 被禁的是**裸客户端**上的小写命令 —— 那在 node-redis v5 里是 undefined。
    const rawClient = String.raw`(?:client|redis|raw|conn|db)`;
    const cmd = String.raw`(?:hset|hget|hgetall|hdel|hkeys|hexists|sadd|srem|smembers|zadd|zrem|zcard|zrevrange|zrangebyscore|zremrangebyscore|pttl|setex|expire|expireat|incr|incrby|getset)`;
    const lowerCaseCommands = new RegExp(String.raw`\b` + rawClient + String.raw`\s*\.\s*` + cmd + String.raw`\s*\(`);
    expect(findOffenders(lowerCaseCommands).join('\n')).toBe('');
  });

  it('没有任何文件通过 store().redis 绕过框架封装直接拿裸客户端', () => {
    expect(findOffenders(/\.redis\s*\.\s*[a-zA-Z]+\s*\(/).join('\n')).toBe('');
  });

  it('eval 只能出现在访问层内部，且必须是 v5 的 { keys, arguments } 签名', () => {
    expect(findOffenders(/\beval\s*\(/, ADAPTER_PATH).join('\n')).toBe('');

    const lines = codeLines(fs.readFileSync(ADAPTER_PATH, 'utf8'));
    const callIdx = lines.map((l, i) => (/client\.eval\s*\(/.test(l.text) ? i : -1)).filter(i => i >= 0);
    expect(callIdx.length).toBeGreaterThanOrEqual(9);

    for (const i of callIdx) {
      const call = lines
        .slice(i, i + 5)
        .map(l => l.text)
        .join('\n');
      // 新签名必须一次给全 keys 与 arguments；keys 允许简写 `{ keys, arguments: [...] }`
      expect(call).toMatch(/\bkeys\b\s*[,:}]/);
      expect(call).toMatch(/\barguments\b\s*:/);
    }
    // 旧签名 eval(script, numKeys, key, arg) 的特征：脚本名后紧跟一个数字
    expect(lines.filter(l => /client\.eval\(\s*LUA_[A-Z_]+\s*,\s*\d/.test(l.text))).toHaveLength(0);
  });

  it('没有任何文件再把裸 redis 客户端当参数传来传去（req.server.redis / app.redis / redisClient）', () => {
    expect(findOffenders(/req\.server\.redis|app\.redis\b|redisClient/).join('\n')).toBe('');
  });

  it('只有访问层自己调用 getStore，业务代码一律走语义化 API', () => {
    expect(findOffenders(/getStore\s*\(/, ADAPTER_PATH).join('\n')).toBe('');
  });

  it('getRaw 必须返回「原始字符串」，不得复用会 safeParse 的 store().get', () => {
    // 事故形态：store().get() 会把 JSON 解析成**对象**，而调用方（旧数据迁移）
    // 写的是 `raw.startsWith('{')` —— 对对象调 startsWith 抛 TypeError，
    // 整个启动期迁移中断，且报错信息与「读取数据」毫无关联，极难定位。
    const lines = codeLines(fs.readFileSync(ADAPTER_PATH, 'utf8'));
    const start = lines.findIndex(l => /async function getRaw\s*\(/.test(l.text));
    expect(start).toBeGreaterThan(-1);

    let end = start + 1;
    while (end < lines.length && !/^\}/.test(lines[end].text)) end++;
    const body = lines
      .slice(start, end)
      .map(l => l.text)
      .join('\n');

    expect(body).not.toMatch(/store\s*\(\s*\)\s*\.\s*get\s*\(/);
    expect(body).toMatch(/client\s*\.\s*get\s*\(/);
  });

  it('两处封禁回包都必须透传 err.headers（Retry-After），不能只有一处', () => {
    // 事故形态：buildBlockError 刻意设置了 Retry-After 供客户端退避，
    // 但 pipeline.js 里两个「Security Policy Blocked」回包点只有一个透传了
    // err.headers —— 全局封禁阶段那处漏了，导致首屏拦截场景下该响应头从未下发。
    // 这里锁住「两处对称」，防止再次只改一处。
    const pipelinePath = path.join(SRC, 'app', 'firewall', 'engine', 'pipeline.js');
    const lines = codeLines(fs.readFileSync(pipelinePath, 'utf8'));

    const replyIdx = lines.map((l, i) => (/Security Policy Blocked/.test(l.text) ? i : -1)).filter(i => i >= 0);
    expect(replyIdx.length).toBeGreaterThanOrEqual(2); // 扫描范围有效，防路径写错假通过

    for (const i of replyIdx) {
      const near = lines
        .slice(Math.max(0, i - 6), i)
        .map(l => l.text)
        .join('\n');
      expect(near).toMatch(/reply\.headers\(\s*err\.headers\s*\)/);
    }
  });

  it('关键 key 前缀与索引名保持与历史数据兼容', async () => {
    expect(adapter.rel.block(IP)).toBe(`block:${IP}`);
    expect(adapter.rel.blockFp(FP)).toBe(`block:fp:${FP}`);
    expect(adapter.rel.whitelist(IP)).toBe(`whitelist:${IP}`);
    expect(adapter.rel.whitelistFp(FP)).toBe(`whitelist:fp:${FP}`);
    expect(adapter.rel.accountLock('bob')).toBe('lock:bob');
    expect(adapter.HASH.blockedIps).toBe('blocked:ips');
    expect(adapter.HASH.blockedFps).toBe('blocked:fps');
    expect(adapter.HASH.whitelistedIps).toBe('whitelisted:ips');
    expect(adapter.HASH.whitelistedFps).toBe('whitelisted:fps');
  });
});
