/**
 * 私钥信封加密（AES-256-GCM）
 *
 * 数据库里存的是**密文**，解密用的主密钥（KEK）来自进程环境，永不入库。
 * 这样即使备份、只读副本、SQL 注入或被拖库，攻击者拿到的也只是密文；
 * 要还原私钥必须同时拿到 DB 与 KEK —— 两个不同的信任域。
 *
 * 存储格式（单列自描述，便于平滑迁移且不需要改表）：
 *
 *   enc:v1:<keyId>:<base64(iv[12] || tag[16] || ciphertext)>
 *
 * - `enc:v1` 前缀让「明文旧数据」与「密文新数据」可以在同一列共存：
 *   `open()` 遇到没有该前缀的值原样返回，于是滚动升级期间旧行照常可用；
 * - `keyId` 记录本行是用哪把 KEK 封的，轮转 KEK 时可以新旧并存，
 *   只需要保证旧 key 仍在 `KEY_ENCRYPTION_KEY_PREVIOUS` 里；
 * - AAD 绑定密钥对的 `name`（kid）：密文不能跨行搬用。否则有 DB 写权限的人
 *   可以把 A 行的密文复制到 B 行，让服务用 A 的身份签名（密文本身没被破解，
 *   但语义被替换了）。
 *
 * ⚠️ 这不是 KMS/HSM。KEK 仍在进程环境里，能读 `/proc/<pid>/environ`
 * 或拿到部署密钥的人可以解密；它的价值在于**把「拖库」和「拿到私钥」解耦**。
 * 真正需要 HSM 语义时，替换 `seal()`/`open()` 的实现即可（本模块是唯一出入口）。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */

import crypto from 'node:crypto';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.keys.envelope');

/** 密文前缀：同时充当格式版本标识 */
const SEALED_PREFIX = 'enc:v1:';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM 推荐 96 bit
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

/** 环境变量名 */
const ENV_ACTIVE_KEY = 'KEY_ENCRYPTION_KEY';
const ENV_ACTIVE_ID = 'KEY_ENCRYPTION_KEY_ID';
const ENV_PREVIOUS_KEY = 'KEY_ENCRYPTION_KEY_PREVIOUS';
const ENV_PREVIOUS_ID = 'KEY_ENCRYPTION_KEY_PREVIOUS_ID';
const ENV_REQUIRED = 'KEY_ENCRYPTION_REQUIRED';

const DEFAULT_ACTIVE_ID = 'k1';
const DEFAULT_PREVIOUS_ID = 'k0';

/**
 * 把 env 里的密钥串解析成 32 字节
 *
 * 接受 hex（64 字符）或 base64（44 字符，含 padding）。长度不对直接抛错——
 * 静默接受任意长度会让 AES-256 变成一个错误的自定义算法。
 *
 * @param {string} raw
 * @param {string} envName 用于报错定位
 * @returns {Buffer}
 */
function parseKey(raw, envName) {
  const value = String(raw).trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`${envName} 必须是 32 字节密钥（64 位 hex 或 44 字符 base64），当前解码后 ${buf.length} 字节`);
  }
  return buf;
}

/**
 * 读取当前 keyring（每次调用都重新解析：测试与运行时热改都能生效，开销可忽略）
 * @returns {{ activeId: string, keys: Map<string, Buffer> }}
 */
function loadKeyring() {
  const keys = new Map();
  const activeRaw = process.env[ENV_ACTIVE_KEY];
  const activeId = process.env[ENV_ACTIVE_ID] || DEFAULT_ACTIVE_ID;

  if (activeRaw) keys.set(activeId, parseKey(activeRaw, ENV_ACTIVE_KEY));

  const previousRaw = process.env[ENV_PREVIOUS_KEY];
  if (previousRaw) {
    const previousId = process.env[ENV_PREVIOUS_ID] || DEFAULT_PREVIOUS_ID;
    if (previousId === activeId) {
      throw new Error(`${ENV_PREVIOUS_ID} 不能与 ${ENV_ACTIVE_ID} 相同（都是 ${activeId}）`);
    }
    keys.set(previousId, parseKey(previousRaw, ENV_PREVIOUS_KEY));
  }

  return { activeId, keys };
}

/**
 * 是否启用了私钥加密（配置了当前密钥）
 * @returns {boolean}
 */
function isEnabled() {
  return Boolean(process.env[ENV_ACTIVE_KEY]);
}

/**
 * 是否为信封加密后的值
 * @param {unknown} value
 * @returns {boolean}
 */
function isSealed(value) {
  return typeof value === 'string' && value.startsWith(SEALED_PREFIX);
}

/**
 * 加密私钥
 *
 * @param {string} plaintext PEM 明文
 * @param {string} recordName 密钥对 name（kid），作为 AAD 绑定行身份
 * @returns {string} `enc:v1:...`
 * @throws {Error} 未配置 KEK
 */
function seal(plaintext, recordName) {
  if (!isEnabled()) {
    throw new Error(`未配置 ${ENV_ACTIVE_KEY}，无法加密私钥`);
  }
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('seal: 明文必须是非空字符串');
  }
  const { activeId, keys } = loadKeyring();
  const key = keys.get(activeId);

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(`${SEALED_PREFIX}${activeId}:${recordName}`, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);

  return `${SEALED_PREFIX}${activeId}:${payload.toString('base64')}`;
}

/**
 * 解密私钥（兼容历史明文行）
 *
 * 明文行原样返回，是为了让「先升级代码、后跑迁移」的滚动发布不至于全站掉线：
 * 新代码读旧行仍能签发，跑完迁移脚本即全部变成密文。
 *
 * 但**看起来是密文却解不开**必须抛错：绝不能把密文当 PEM 交给 `crypto.sign`
 * （那会把错误推到一个毫不相关的地方，或者更糟——静默按明文处理）。
 *
 * @param {string} value 密文或历史明文
 * @param {string} recordName 密钥对 name（kid）
 * @returns {string} PEM 明文
 * @throws {Error} 密文损坏、AAD 不匹配、找不到对应 KEK
 */
function open(value, recordName) {
  if (typeof value !== 'string') throw new Error('open: 值必须是字符串');
  if (!isSealed(value)) return value; // 历史明文

  const rest = value.slice(SEALED_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) throw new Error('私钥密文格式非法：缺少 keyId 段');

  const keyId = rest.slice(0, sep);
  const payload = Buffer.from(rest.slice(sep + 1), 'base64');
  if (payload.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('私钥密文格式非法：负载长度不足');
  }

  const { keys } = loadKeyring();
  const key = keys.get(keyId);
  if (!key) {
    throw new Error(`找不到解密所需的密钥 ${keyId}（检查 ${ENV_ACTIVE_KEY} / ${ENV_PREVIOUS_KEY} 与 keyId 是否匹配）`);
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(`${SEALED_PREFIX}${keyId}:${recordName}`, 'utf8'));
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    // GCM 校验失败只有两种可能：密文被改、AAD（kid）不匹配 —— 都属于必须拒绝的情况
    const error = new Error(`私钥解密失败（kid=${recordName}）：密文损坏或 AAD 不匹配`, { cause: err });
    error.code = 'KEY_ENCRYPTION_DECRYPT_FAILED';
    throw error;
  }
}

/**
 * 启动自检
 *
 * `KEY_ENCRYPTION_REQUIRED=true` 时要求 KEK 必须可用：这是「我已经决定不再允许明文私钥」
 * 的显式开关，配置缺失要当场失败，而不是等到第一次签发才炸。
 *
 * @throws {Error} 要求加密但 KEK 缺失/非法
 */
function assertReady() {
  const required = String(process.env[ENV_REQUIRED] || '').toLowerCase() === 'true';
  if (!required) {
    if (!isEnabled()) {
      log.warn(
        `⚠️ [Keys] 未配置 ${ENV_ACTIVE_KEY}，私钥仍以明文入库；生产环境建议启用并运行 scripts/migrate-key-encryption.js`
      );
    }
    return;
  }

  if (!isEnabled()) {
    throw new Error(`${ENV_REQUIRED}=true 但缺少 ${ENV_ACTIVE_KEY}，拒绝以明文私钥启动`);
  }
  loadKeyring(); // 长度/ID 非法在这里就暴露
  log.info('🔐 [Keys] 私钥信封加密已启用');
}

export { seal, open, isSealed, isEnabled, assertReady, SEALED_PREFIX };
