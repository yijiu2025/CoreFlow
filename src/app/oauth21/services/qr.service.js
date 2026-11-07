/**
 * 扫码登录业务服务
 *
 * 从 api/oauth21/v1/auth/qr.js 下沉：二维码状态机 + 确认后签发令牌。
 * 状态流转：PENDING → SCANNED → CONFIRMED（→ 签发令牌）/ EXPIRED。
 *
 * 安全设计：
 * - 二维码内容 = 扫码 URL（含 qrKey + client_id），移动端扫到能识别给哪个应用
 * - generateQrCode 存 client_id/scope/oidcNonce，签发时用存储值（防 PC 端调包 client_id）
 * - scan 记录移动端设备指纹（IP+UA），confirm 校验同一移动端（防 scan 和 confirm 不同设备）
 * - confirm 需移动端已登录（requireLogin），记录 userId
 * - qrKey 一次性 + 120s TTL，签发后即删
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import UserDao from '../dao/user.dao.js';
import ClientDao from '../dao/client.dao.js';
import { issueDirectTokens } from './token-issuer.service.js';
import { buildTokenResponse } from './cookies.service.js';

/** 二维码有效期（秒） */
const QR_TTL = 120;

/** 一次性票据索引前缀（ticket → qrKey） */
const TICKET_PREFIX = 'ticket:';

/**
 * 把「二维码公开票据」解析成真实 qrKey
 *
 * 安全模型（2026-11-07 修复）：
 *   · `qrKey` = 兑换令牌的**唯一凭据**，只在 `GET /qr/generate` 的响应里交给 PC 端，
 *     **不印在二维码上**；
 *   · `ticket` = 印在二维码里的公开票据，只能用来 scan / confirm，换不到令牌。
 *
 * 为什么必须拆开：此前二维码里放的就是 qrKey，而 `GET /qr/status` 仅凭 qrKey 就签发
 * 令牌 —— 二维码被投屏/截图/直播露出一次（120s 窗口），看到的人直接轮询即可
 * 拿走该用户的 access_token / session_token，属登录劫持。
 *
 * 兼容性：字段名仍叫 `qrKey`（移动端前端从二维码 JSON 取 `qrKey` 传给 scan/confirm），
 * 值换成 ticket；这两个端点经本函数解析回真实 qrKey，前端无需改动。
 *
 * @param {{get: Function}} qrStore 二维码存储
 * @param {string} maybeTicket 客户端传来的值（可能是真 qrKey，也可能是 ticket）
 * @returns {Promise<string|null>} 真实 qrKey；无效返回 null
 */
async function resolveQrKey(qrStore, maybeTicket) {
  if (!maybeTicket || typeof maybeTicket !== 'string') return null;
  // 真 qrKey 直接命中（PC 端轮询 / 老客户端）
  const direct = await qrStore.get(maybeTicket);
  if (direct) return maybeTicket;
  // ticket → qrKey
  const mapped = await qrStore.get(`${TICKET_PREFIX}${maybeTicket}`);
  return typeof mapped === 'string' && mapped ? mapped : null;
}

/**
 * 计算设备指纹（IP + UA hash，前 32 hex）
 * scan 时记录移动端指纹，confirm 时校验同一移动端
 */
function deviceFingerprint(request) {
  const ip = request?.ip || '';
  const ua = request?.headers?.['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

/**
 * 生成登录二维码
 * @param {object} qrStore
 * @param {object} [ctx] - { clientId, scope, oidcNonce } PC 端发起的应用上下文，存入二维码供签发时用
 * @returns {Promise<{qrKey: string, expires_in: number, qrContent: string}>}
 *   qrContent 是二维码内容（扫码 URL），移动端扫描后解析
 */
async function generateQrCode(qrStore, ctx = {}) {
  const qrKey = uuidv4();
  // 印在二维码上的公开票据：与 qrKey 分离，泄露也换不到令牌（见 resolveQrKey 的注释）
  const ticket = crypto.randomBytes(16).toString('hex');
  const { clientId = '', scope = '', oidcNonce = '' } = ctx;
  await qrStore.set(
    qrKey,
    {
      status: 'PENDING',
      userId: null,
      clientId, // 应用标识，签发时用（防 PC 端调包）
      scope,
      oidcNonce,
      deviceFingerprint: null, // scan 时填入移动端指纹
      expiredAt: Date.now() + QR_TTL * 1000
    },
    QR_TTL
  );
  // ticket → qrKey 单向索引（ticket 本身不携带任何凭据语义）
  await qrStore.set(`${TICKET_PREFIX}${ticket}`, qrKey, QR_TTL);

  // 二维码内容 = 扫码 URL（含 ticket），移动端扫到能识别给哪个应用登录
  // ⚠️ 字段名沿用 `qrKey` 是为了不动移动端前端；值是 ticket，不是兑换令牌用的 qrKey。
  const qrContent = JSON.stringify({ qrKey: ticket, clientId, scope });
  return { qrKey, expires_in: QR_TTL, qrContent };
}

/**
 * 移动端标记二维码为已扫码
 * 记录移动端设备指纹，confirm 时校验同一设备（防 scan 和 confirm 不同移动端）
 * @returns {Promise<boolean>} 成功返回 true，二维码无效返回 false
 */
async function scanQrCode(qrStore, qrKeyOrTicket, request) {
  // 入参可能是二维码里的 ticket（移动端），需先解析成真实 qrKey
  const qrKey = await resolveQrKey(qrStore, qrKeyOrTicket);
  if (!qrKey) return false;

  const data = await qrStore.get(qrKey);

  if (!data || data.status === 'CONFIRMED') {
    return false;
  }

  data.status = 'SCANNED';
  // 记录移动端设备指纹（scan 的设备必须与 confirm 的设备一致）
  data.deviceFingerprint = deviceFingerprint(request);
  await qrStore.set(qrKey, data, QR_TTL);
  return true;
}

/**
 * 移动端确认登录（需已登录用户上下文）
 *
 * 安全：
 * 1. 校验 scan 和 confirm 是同一移动端（deviceFingerprint 一致）
 * 2. 移动端已登录（requireLogin 保证 user.sub 有值）
 *
 * @param {object} qrStore
 * @param {string} qrKey
 * @param {string} userId - 当前登录用户 sub
 * @param {object} request - Fastify request（校验设备指纹）
 * @returns {Promise<boolean>} 成功返回 true，二维码无效/设备不符返回 false
 */
async function confirmQrCode(qrStore, qrKeyOrTicket, userId, request) {
  const qrKey = await resolveQrKey(qrStore, qrKeyOrTicket);
  if (!qrKey) {
    return false;
  }

  const data = await qrStore.get(qrKey);
  if (!data) {
    return false;
  }

  // 必须先被扫码：否则「未扫码直接确认」会跳过下面的设备一致性校验
  // （deviceFingerprint 还是 null，比对条件不成立），等于放弃 scan/confirm 同设备约束。
  if (data.status !== 'SCANNED') {
    return false;
  }

  // 设备一致性校验：scan 时的移动端指纹必须与 confirm 时一致
  // 防 scan 和 confirm 来自不同设备（如 scan 被截获后另一设备 confirm）
  if (data.deviceFingerprint && data.deviceFingerprint !== deviceFingerprint(request)) {
    return false;
  }

  data.status = 'CONFIRMED';
  data.userId = userId;
  await qrStore.set(qrKey, data, QR_TTL);
  return true;
}

/**
 * 轮询二维码状态；CONFIRMED 时签发令牌
 *
 * 签发时用 generateQrCode 存储的 client_id（不是前端传的），防 PC 端调包 client_id
 *
 * @param {object} qrStore
 * @param {object} params - { qrKey }（client_id/scope 从存储取，不信任前端）
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @param {object} fastify - Fastify 实例
 * @returns {Promise<object>} 状态响应或令牌响应
 */
async function getQrStatus(qrStore, { qrKey }, request, reply, fastify) {
  // 🔴 这里**只认真实 qrKey，不做 ticket 解析**（与 scan/confirm 刻意不同）：
  // 二维码里印的是 ticket，若这里也解析 ticket，等于把"看到二维码即可领令牌"的洞留着。
  // 拿 ticket 来轮询 → get() 为空 → 返回 EXPIRED，拿不到任何令牌。
  const data = await qrStore.get(qrKey);

  if (!data) {
    return { code: 200, message: 'ok', data: { status: 'EXPIRED' } };
  }

  if (data.status === 'CONFIRMED') {
    const user = await UserDao.findById(data.userId);
    if (!user) {
      return { code: 404, message: '用户不存在', data: { status: 'ERROR' } };
    }

    try {
      // 用存储的 client_id/scope 签发（防 PC 端轮询时调包 client_id 给恶意应用）
      // issueDirectTokens 期望 client 对象，必须先按存储的 client_id 查库
      const client = await ClientDao.findById(data.clientId);
      if (!client) {
        return { code: 400, message: '客户端不存在', data: { status: 'ERROR' } };
      }
      const result = await issueDirectTokens(user, client, data.scope, data.oidcNonce, request, reply, fastify);
      await qrStore.delete(qrKey);
      return buildTokenResponse(result, '扫码登录成功');
    } catch (err) {
      if (err.message === 'invalid_client') {
        return { code: 401, message: '客户端认证失败', data: { status: 'ERROR' } };
      }
      throw err;
    }
  }

  return { code: 200, message: 'ok', data: { status: data.status } };
}

export { generateQrCode, scanQrCode, confirmQrCode, getQrStatus, resolveQrKey };
