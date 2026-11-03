/**
 * src/config 分层守护测试
 *
 * 规则：`src/config/*.js` 是**配置值叶子模块** —— 只放数据与纯函数，
 * 禁止 import 任何 src 内代码（框架/应用/共享都不行）。
 *
 * 为什么必须机器守：配置值一旦反向依赖框架，framework → src/config 的单向
 * 依赖就会成环（ESM 循环引用在启动期报 TDZ / undefined，且极难定位）；
 * 同时叶子化保证任何层（framework / api / app）都能安全引用配置而不引入耦合。
 *
 * 机制类代码不属于这里：deepMerge、持久化读写、reader 注册等
 * 留在各自的 framework 目录（如 framework/firewall/config/persisted.js）。
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config');

/** 列出 src/config 下的所有 .js 文件 */
function listConfigFiles() {
  return readdirSync(CONFIG_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name);
}

describe('src/config 分层契约', () => {
  it('目录非空（防止路径写错导致本测试空跑）', () => {
    expect(listConfigFiles().length).toBeGreaterThan(0);
  });

  it('配置文件一律零 import（叶子模块，禁止反向依赖）', () => {
    const offenders = [];
    for (const name of listConfigFiles()) {
      const src = readFileSync(path.join(CONFIG_DIR, name), 'utf-8');
      // 只看真实的 import 语句，忽略注释里的文字
      const importLines = src
        .split(/\r?\n/)
        .filter(line => /^\s*import\s/.test(line) || /^\s*export\s+.*\sfrom\s+['"]/.test(line));
      if (importLines.length > 0) offenders.push(`${name}: ${importLines[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it('配置文件必须至少导出一个名字（空文件视为误提交）', () => {
    const offenders = [];
    for (const name of listConfigFiles()) {
      const src = readFileSync(path.join(CONFIG_DIR, name), 'utf-8');
      if (!/export\s*\{/.test(src)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * 已迁出 env 的变量清单：改配置项时只应改 src/config / core 默认值，
 * 任何 `process.env.<KEY>` 回潮都会让"配置改了不生效"的 bug 重现。
 *
 * ⚠️ 白名单只放**确实必须读 env** 的特例（它们不是配置项）。
 */
const MIGRATED_ENV_KEYS = [
  // 调优项 → core 默认 + src/config
  'HTTP_KEEP_ALIVE_TIMEOUT_MS',
  'HTTP_REQUEST_TIMEOUT_MS',
  'WS_SHUTDOWN_GRACE_MS',
  'GUARD_CONFIG_SYNC_MS',
  'SLOW_REQUEST_THRESHOLD',
  'SCRYPT_MAX_CONCURRENCY',
  'BCRYPT_MAX_CONCURRENCY',
  'DB_POOL_MAX',
  'DB_POOL_MIN',
  'DB_POOL_ACQUIRE',
  'DB_POOL_IDLE',
  'REDIS_CONNECT_TIMEOUT',
  'REDIS_MAX_RETRIES',
  'REDIS_COMMAND_TIMEOUT_MS',
  'KEY_RETIREMENT_GRACE_SECONDS',
  // 业务开关 / TTL → src/config
  'JWT_ENABLED',
  'DEVICE_FINGERPRINT_ENABLED',
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL',
  'ID_TOKEN_TTL',
  'AUTH_CODE_TTL',
  'MAX_REFRESH_TOKENS',
  'MAX_ACTIVE_DEVICES',
  'MAX_SESSIONS_PER_APP',
  'SESSION_SINGLE_DEVICE_TYPES',
  'ROTATED_RETENTION',
  'CAPTCHA_SIZE',
  'CAPTCHA_NOISE',
  'CAPTCHA_TTL',
  'CAPTCHA_EXTEND_TTL',
  'CAPTCHA_MAX_ATTEMPTS',
  'SLIDER_TOLERANCE',
  'SLIDER_TTL',
  'QRCODE_TTL',
  'QRCODE_POLL_INTERVAL',
  'VERIFY_RATE_LIMIT',
  'VERIFY_CODE_TTL',
  'SMS_CODE_LENGTH',
  'SMS_CODE_TTL',
  'SMS_RATE_LIMIT',
  'RECAPTCHA_ENABLED',
  'RECAPTCHA_PROVIDER',
  'RECAPTCHA_MIN_SCORE',
  // 防火墙阈值（唯一保留的两个特例见下方 ALLOWED_ENV_READERS）
  'FW_RATE_LIMIT',
  'FW_SCAN_THRESHOLD',
  'FW_ACTIVE_IP_API',
  'FW_ALERT_EMAIL',
  'FW_ALERT_WEBHOOK'
];

/** 例外：确实必须读 env 的（测试隔离 / 压测旁路），不在回潮检查范围 */
const ALLOWED_ENV_READERS = new Set(['FW_RATE_LIMIT_OVERRIDE', 'FW_TRAFFIC_STATS_FILE']);

/** 递归列出 src 下的 .js（跳过测试与 env.js 自身） */
function listSrcFiles(dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...listSrcFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('已迁出的 env 不得回潮', () => {
  it('代码里不再出现这些 process.env.<KEY>（否则配置改了不生效）', () => {
    const offenders = [];
    for (const file of listSrcFiles()) {
      const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
      const src = readFileSync(file, 'utf-8');
      for (const key of MIGRATED_ENV_KEYS) {
        if (ALLOWED_ENV_READERS.has(key)) continue;
        // 精确匹配：FW_RATE_LIMIT 不能命中 FW_RATE_LIMIT_OVERRIDE
        if (new RegExp(`process\\.env\\.${key}(?![A-Z_0-9])`).test(src)) offenders.push(`${rel} → ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('src/config 目录确实存在且文件都是非空导出（防止模板被误删成空文件）', () => {
    for (const name of listConfigFiles()) {
      const full = path.join(CONFIG_DIR, name);
      expect(statSync(full).size).toBeGreaterThan(50);
    }
  });
});
