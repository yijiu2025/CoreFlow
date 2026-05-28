import crypto from 'node:crypto';
import { getSessionStore } from '../../../redis/session-store.js';

/**
 * 校验客户端请求签名，防爬防篡改防重放 (类似阿里巴巴 H5 Mtop 签名校验)
 */
export async function verifySignature(request, reply) {
  // 1. 仅对 requireLogin 的路由校验签名，公开接口自动跳过
  if (!request.routeConfig?.requireSignature) {
    return;
  }

  const sign = request.headers['x-sign'];
  const timestampStr = request.headers['x-timestamp'];
  const nonce = request.headers['x-nonce'];

  // 2. 无签名头时自动下发 h5_token cookie，本次放行
  if (!sign || !timestampStr || !nonce) {
    const existingCookie = request.cookies?._m_h5_tk;
    if (!existingCookie) {
      await issueH5Token(request.server, reply);
    }
    return;
  }

  // 3. 防重放校验 (时间偏差限制在 2 分钟以内)
  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();
  if (isNaN(timestamp) || Math.abs(now - timestamp) > 120_000) {
    return reply.code(403).send({
      code: 403,
      error: 'request_expired',
      message: '安全检测失败：请求已过期或本地时间偏差过大'
    });
  }

  // 4. 获取 H5 临时 Token
  let m5H5Tk = request.cookies?._m_h5_tk;

  // 无 cookie 时自动下发，本次放行（前端拿到 cookie 后后续请求即可签名）
  if (!m5H5Tk) {
    await issueH5Token(request.server, reply);
    return;
  }

  // 解析 Cookie 格式: [h5_token_md5]_[expired_time]
  const [h5TokenMd5, expiredTimeStr] = m5H5Tk.split('_');
  const expiredTime = parseInt(expiredTimeStr, 10);
  if (!h5TokenMd5 || isNaN(expiredTime) || now > expiredTime) {
    return reply.code(403).send({
      code: 403,
      error: 'token_expired',
      message: '安全检测失败：Token 已失效，请刷新页面或重试'
    });
  }

  // 5. 从 Redis 验证 token 存在性
  const sessionStore = getSessionStore(request.server, 'h5_token');
  const h5Token = await sessionStore.get(h5TokenMd5);

  if (!h5Token) {
    return reply.code(403).send({
      code: 403,
      error: 'invalid_token',
      message: '安全检测失败：Token 不合法'
    });
  }

  // 6. 重算签名：使用 h5TokenMd5（与前端保持一致）
  const url = request.routerPath || request.url.split('?')[0];
  const bodyStr = request.body ? JSON.stringify(request.body) : '';
  const signString = `${h5TokenMd5}&${timestamp}&${nonce}&${url}&${bodyStr}`;

  const serverSign = crypto
    .createHash('sha256')
    .update(signString)
    .digest('hex');

  if (serverSign !== sign) {
    return reply.code(403).send({
      code: 403,
      error: 'signature_mismatch',
      message: '安全检测失败：接口签名不匹配，禁止访问'
    });
  }
}

/**
 * 登录成功或页面访问时下发/更新 H5 Token
 */
export async function issueH5Token(fastify, reply) {
  const sessionStore = getSessionStore(fastify, 'h5_token');
  // 生成随机 H5 Token 密钥
  const rawH5Token = crypto.randomBytes(24).toString('hex');
  const h5TokenMd5 = crypto
    .createHash('sha256')
    .update(rawH5Token)
    .digest('hex');

  const ttlSeconds = 3600; // 1小时有效期
  const expiredTime = Date.now() + ttlSeconds * 1000;
  const cookieValue = `${h5TokenMd5}_${expiredTime}`;

  // 保存到 Redis，用于反向查找原始 Token 并比对签名
  await sessionStore.set(h5TokenMd5, rawH5Token, ttlSeconds);

  // 下发非 HttpOnly Cookie，允许前端 JavaScript 获取并在发送请求时参与签名计算
  reply.setCookie('_m_h5_tk', cookieValue, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: ttlSeconds
  });

  return rawH5Token;
}
