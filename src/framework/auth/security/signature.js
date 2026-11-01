/**
 * H5 签名工具（SHA-256 摘要 + nonce 防重放 + 双因子）
 *
 * token 双通道：浏览器走 `_m_h5_tk` cookie；小程序 / API 直连等不便携带
 * cookie 的客户端走 `x-h5-tk` 请求头（引导时同名响应头下发）。
 * 机制全貌与客户端接入见 docs/H5-SIGNATURE.md。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-01 x-h5-tk 双通道（非 cookie 客户端接入）
 */
import crypto from 'node:crypto';
import { getStore } from '../../redis/index.js';
import { createNonceStore } from '../../redis/nonce-store.js';

/** H5 签名 nonce 防重放（TTL 略大于时间窗，见 verifySignature） */
const h5NonceStore = createNonceStore('h5_nonce', 180);

/**
 * 引导下发 token（首次访问 / token 失效后的重新引导）。
 *
 * 🔴 引导放行仅限 GET/HEAD（浏览器首访兼容）；写方法（POST/PUT/DELETE/PATCH）
 * 下发 token 后返回 403 token_required，**不执行 handler** —— 否则攻击者
 * "永不上交 token"（curl 天然如此）即可免签名打写接口（2026-11-01 深度检查确认的
 * 引导绕过，本次修复）。
 *
 * @returns {boolean} true = 已放行（调用方直接 return，handler 继续执行）；
 *                    false = 已回复 403 token_required（调用方同样直接 return）
 */
async function bootstrapToken(request, reply) {
  await issueH5Token(request.server, reply);
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  reply.code(403).send({
    code: 403,
    error: 'token_required',
    message: '安全检测失败：缺少访问凭证，请使用本次响应下发的 token 完成签名后重试'
  });
  return false;
}

/**
 * 校验客户端请求签名，防爬防篡改防重放 (类似阿里巴巴 H5 Mtop 签名校验)
 */
async function verifySignature(request, reply) {
  // 1. 仅对 requireSignature 的路由校验签名（requireLogin 自动开启，或公开端点显式配置）
  //    routeConfig 挂在 Fastify 的 routeOptions.config，由 registerSecureRoute 写入。
  if (!request.routeOptions?.config?.requireSignature) {
    return;
  }

  // 签名参数兼容头与 query（头为主，query 兼容大厂 URL 签名方式）
  const sign = request.headers['x-sign'] || request.query?.['x-sign'];
  const timestampStr = request.headers['x-timestamp'] || request.query?.['x-timestamp'];
  const nonce = request.headers['x-nonce'] || request.query?.['x-nonce'];

  // 2. Token 双通道读取：cookie 为主（浏览器），`x-h5-tk` 请求头兜底
  //    （小程序 wx.request / 服务端 API 直连等不便携带 cookie 的客户端）。
  //    非 cookie 客户端的 token 由引导响应的同名响应头下发（见 issueH5Token），
  //    客户端自行存储并在后续请求回传 —— 两条通道的 token 形态与校验完全一致。
  const clientToken = request.cookies?._m_h5_tk || request.headers['x-h5-tk'];

  // 无签名参数：仅当也还没有 token 时才引导（首次访问）；已有 token（cookie 或头）
  // 仍不签名 → 拒绝，避免客户端永久省略签名即可绕过。
  if (!sign || !timestampStr || !nonce) {
    if (!clientToken) {
      await bootstrapToken(request, reply);
      return;
    }
    return reply.code(403).send({
      code: 403,
      error: 'signature_required',
      message: '安全检测失败：缺少签名参数'
    });
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

  // 4. 获取 H5 临时 Token（双通道，见步骤 2）
  const m5H5Tk = clientToken;

  // 有签名参数但无 token（首访直接带签名 / cookie 过期被清）：
  // 同样走引导 —— 假签名头换不来执行权，写方法收到 403 token_required
  if (!m5H5Tk) {
    await bootstrapToken(request, reply);
    return;
  }

  // 解析 Token 格式（cookie 与 x-h5-tk 头同构）: [h5_token_md5]_[expired_time]
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
  const sessionStore = getStore('h5_token');
  const h5Token = await sessionStore.get(h5TokenMd5);

  if (!h5Token) {
    return reply.code(403).send({
      code: 403,
      error: 'invalid_token',
      message: '安全检测失败：Token 不合法'
    });
  }

  // 5.1 nonce 防重放：同一 nonce 在时间窗内只允许使用一次（原子 check-and-mark）
  const replayed = await h5NonceStore.checkAndMark(nonce);
  if (replayed) {
    return reply.code(403).send({
      code: 403,
      error: 'replay_detected',
      message: '安全检测失败：请求重复提交'
    });
  }

  // 6. 重算签名：h5TokenMd5（会话密钥）+ SIGN_APP_KEY（前后端共享常量）双因子
  // 与前端 utils/sign.ts generateSignWithKey 保持一致
  // ⚠️ Fastify 5 已移除 request.routerPath（v4 弃用、v5 删除，恒为 undefined）。
  // 前端签的是**具体请求路径**（非路由模板 /user/:id），request.url 去 query 即为
  // 该值 —— 这正是对齐的正确来源，不能改成 routeOptions.url（那是模板形态）。
  const url = request.url.split('?')[0];
  const bodyStr = request.body ? JSON.stringify(request.body) : '';
  // query 剔除签名自身字段后按 key 排序纳入验签（与前端 serializeParamsForSign 对齐）
  const paramsStr = serializeQueryForSign(request.query, ['x-sign', 'x-timestamp', 'x-nonce', 'x-device-id']);
  const appKey = process.env.SIGN_APP_KEY || '';
  const signString = `${h5TokenMd5}&${appKey}&${timestamp}&${nonce}&${url}&${paramsStr}&${bodyStr}`;

  const serverSign = crypto.createHash('sha256').update(signString).digest('hex');

  // 恒定时间比较：`sign` 完全由客户端控制且长度任意，若直接 timingSafeEqual 会因
  // 两 Buffer 字节长度不等而抛 RangeError（与 AUDIT-REPORT 🔴-1 同一个坑）。
  // 故先比字节长度（`Buffer.from(非法hex,'hex')` 会静默截断，长度自然不等 → 拒绝），
  // 长度相等时再恒定时间比对，避免逐字节短路带来的时序侧信道。
  // 摘要固定 64 hex = 32 字节。
  const serverBuf = Buffer.from(serverSign, 'hex');
  const clientBuf = Buffer.from(String(sign), 'hex');
  if (clientBuf.length !== serverBuf.length || !crypto.timingSafeEqual(clientBuf, serverBuf)) {
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
async function issueH5Token(fastify, reply) {
  const sessionStore = getStore('h5_token');
  // 生成随机 H5 Token 密钥
  const rawH5Token = crypto.randomBytes(24).toString('hex');
  const h5TokenMd5 = crypto.createHash('sha256').update(rawH5Token).digest('hex');

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

  // 非 cookie 客户端通道（小程序 / API 直连）：同名响应头下发，值与 cookie 完全
  // 同构（md5_expireAt），客户端存储后以 x-h5-tk 请求头回传；浏览器端忽略此头（走 cookie）。
  reply.header('x-h5-tk', cookieValue);

  return rawH5Token;
}

/**
 * 序列化 query 用于验签（按 key 字典序排序，key=value，value encodeURIComponent，& 连接）
 * 与前端 request.ts serializeParamsForSign 必须完全一致。
 * 排除签名自身字段（x-sign/x-timestamp/x-nonce/x-device-id），避免循环依赖。
 * 只支持扁平 key-value；数组/嵌套对象不保证一致（当前所有调用都是扁平 params）。
 */
function serializeQueryForSign(query, excludeKeys) {
  if (!query || typeof query !== 'object') return '';
  const exclude = new Set(excludeKeys || []);
  const keys = Object.keys(query).filter(k => !exclude.has(k) && query[k] !== undefined && query[k] !== null);
  if (keys.length === 0) return '';
  keys.sort();
  return keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`).join('&');
}

export { verifySignature, issueH5Token };
