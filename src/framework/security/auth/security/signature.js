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
 * @since 2026-11-10 未登录不再签发/落库；设备维度幂等 + 活跃续期 + 签发限频
 */
import crypto from 'node:crypto';
import { getStore } from '../../../persistence/redis/index.js';
import { createNonceStore } from '../../../persistence/redis/nonce-store.js';

/** H5 签名 nonce 防重放（TTL 略大于时间窗，见 verifySignature） */
const h5NonceStore = createNonceStore('h5_nonce', 180);

/** H5 token 有效期（秒） */
const H5_TOKEN_TTL = 3600;

/**
 * 设备指针命名空间
 *
 * `h5_dev:<sha256(客户端标识)>` → `{ md5, exp }`
 *
 * 🔴 为什么需要它：`h5_token:<md5>` 的键是**随机数**，没有身份维度，于是
 *   "每进一次引导"就多一个键，键数 ≈ 签发次数 × TTL。加一层设备指针后，
 *   同一设备重复引导会**复用**已签发的 token，键数 ≈ 在线客户端数。
 *   （2026-11-10 实测：oauth21 每次页面加载都预取 h5-token，一个用户一小时几十个键）
 *
 * 指针的 key 只放哈希，不放明文 deviceId —— deviceId 由客户端 localStorage 提供，
 * 可伪造可清空；把它当主键会让"清缓存"变成必须重新引导，也会让伪造值互相覆盖。
 * 主键仍是服务端生成的 md5（验签零改动），指针只是"上次给这台设备发过哪个"。
 */
const H5_DEVICE_STORE = 'h5_dev';

/** 签发限频命名空间（每 IP 每分钟最多签发次数） */
const H5_ISSUE_STORE = 'h5_issue';

/** 每 IP 每分钟最大签发次数（设备幂等命中时不计入） */
const H5_ISSUE_MAX = 20;

/** 签发限频窗口（秒） */
const H5_ISSUE_WINDOW = 60;

/**
 * 运行期可覆盖的签发上限（`H5_ISSUE_MAX`）
 *
 * 每次调用时读环境变量而不是模块加载时读一次：测试要在 `beforeAll` 里放开
 * （同一进程内连发几十个新设备，正常上限会把它判成刷子），运行期也希望运维能临时调。
 */
function issueLimit() {
  const fromEnv = Number(process.env.H5_ISSUE_MAX);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : H5_ISSUE_MAX;
}

/**
 * nonce 合法形态
 *
 * nonce 会被拼进 Redis 键（`h5_nonce:<nonce>`）。此前没有任何约束，而**验签之前**就
 * 写入了存储 —— 匿名请求随便编个 1MB 的 nonce 就能造一个 1MB 的键（TTL 180s），
 * 属于零成本写放大。
 *
 * 判据刻意只做两件事：**长度上限 128** + **排除空白/控制字符**。
 * 不设最小长度、也不锁定字母表 —— 各端现存的 nonce 形态（uuid / hex / base64 / `n1`）
 * 都合法；加密强度由签名与服务端 token 保证，nonce 这里只需保证"键有界"。
 */
const NONCE_RE = /^[A-Za-z0-9._~+/=:-]{1,128}$/;

/** SHA-256 十六进制摘要 */
function sha256hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

/** 安全方法（引导放行的白名单） */
function isSafeMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

/**
 * 是否已登录
 *
 * 认证插件在 `onRequest` 阶段把结果写进 `request.state.user`（见 framework/security/auth/plugin.js），
 * 而本模块跑在 `preHandler` —— 因此这里读到的是**本请求已解析的**登录态，不需要额外查询。
 */
function isAuthenticated(request) {
  return Boolean(request?.state?.user);
}

/**
 * 客户端标识（设备指针的键来源）
 *
 * 优先 `x-device-id`（oauth21 前端每个请求都注入，见 oauth21/src/utils/request.ts）；
 * 没有则退化为来源 IP —— 非浏览器客户端（爬虫 / curl / 服务端直连）全靠这个兜底，
 * 否则它们每次请求都是"新设备"，写放大原样存在。
 */
function clientKey(request) {
  const deviceId = request?.headers?.['x-device-id'];
  if (typeof deviceId === 'string' && deviceId.trim()) {
    return sha256hex(`dev:${deviceId.trim()}`).slice(0, 32);
  }
  const ip = request?.ip || request?.socket?.remoteAddress || 'unknown';
  return sha256hex(`ip:${ip}`).slice(0, 32);
}

/** 下发 token（cookie + x-h5-tk 响应头双通道） */
function writeTokenCookie(reply, value, maxAgeSeconds) {
  reply.setCookie('_m_h5_tk', value, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: maxAgeSeconds
  });
  reply.header('x-h5-tk', value);
}

/**
 * 签发限频（每 IP 每分钟 H5_ISSUE_MAX 次）
 *
 * 🔴 为什么必须有：`bootstrapToken` 是"任何无 token 的请求"都能触发的写路径，
 *   而 oauth21 的全局签名钩子对匿名 GET 还直接放行。不限频的话，`curl` 循环即可
 *   无限造键（1h TTL 的写放大），与 userId 无关、与登录无关。
 *
 * 存储故障时选择**放行**（返回 true）：限频是防刷手段，不是鉴权手段 ——
 * 让它因为 Redis 抖动把正常用户登录后的引导也挡死，代价更大。
 */
async function allowIssue(request) {
  const ip = request?.ip || 'unknown';
  const key = `ip:${ip}`;
  const store = getStore(H5_ISSUE_STORE);
  const max = issueLimit();
  try {
    const current = Number(await store.get(key)) || 0;
    if (current >= max) return false;
    await store.set(key, current + 1, H5_ISSUE_WINDOW);
    return true;
  } catch {
    return true;
  }
}

/**
 * 无 token 时的处理（原 bootstrapToken）
 *
 * 🔴 2026-11-10 起**未登录不再签发 token、不写任何键**：
 *   - 未登录的键不承载身份，1h 后自然消失，却随请求量线性堆积；
 *   - 未登录的访问控制本来就由登录守卫（401）+ 端点限频承担；签名只是"提高爬取成本"，
 *     而给匿名请求发凭证恰恰**降低**不了这个成本，只增加写放大。
 *
 * 语义表：
 * | 场景 | GET/HEAD | 写方法 |
 * |------|----------|--------|
 * | 未登录 | 放行（不签发） | 403 `login_required`（不签发） |
 * | 已登录 | 签发/复用后放行一次 | 签发/复用 + 403 `token_required`，handler 不执行 |
 * | 已登录但超签发限频 | 放行（不签发） | 429 |
 *
 * 未登录写方法返回 `login_required` 而不是 `token_required`：后者会引导客户端
 * "拿 token 重试"，而匿名请求根本拿不到 token —— 那是死循环。
 *
 * 登录接口本身不受影响：它没有 `requireSignature`，`verifySignature` 第一步就返回了。
 *
 * @returns {boolean} true = 已放行（调用方直接 return，handler 继续执行）；
 *                    false = 已回复（调用方同样直接 return）
 */
async function bootstrapToken(request, reply) {
  if (!isAuthenticated(request)) {
    if (isSafeMethod(request.method)) return true;
    reply.code(403).send({
      code: 403,
      error: 'login_required',
      message: '请先登录后再执行该操作'
    });
    return false;
  }

  const issued = await allowIssue(request);
  if (issued) await issueH5Token(request.server, reply);

  if (isSafeMethod(request.method)) return true;

  reply.code(issued ? 403 : 429).send({
    code: issued ? 403 : 429,
    error: issued ? 'token_required' : 'too_many_requests',
    message: issued
      ? '安全检测失败：缺少访问凭证，请使用本次响应下发的 token 完成签名后重试'
      : '请求过于频繁，请稍后再试'
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

  // 3.1 nonce 形态校验（进 Redis 键之前）：长度 ≤128 且有界字符集，
  //     否则匿名请求可造超长键（见 NONCE_RE 注释）
  if (typeof nonce !== 'string' || !NONCE_RE.test(nonce)) {
    return reply.code(403).send({
      code: 403,
      error: 'invalid_nonce',
      message: '安全检测失败：nonce 格式非法'
    });
  }

  // 4. 获取 H5 临时 Token（双通道，见步骤 2）
  const m5H5Tk = clientToken;

  // 有签名参数但无 token（首访直接带签名 / cookie 过期被清）：
  // 同样走引导 —— 假签名头换不来执行权：未登录收到 403 login_required
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

  // 7. nonce 防重放：同一 nonce 在时间窗内只允许使用一次（原子 check-and-mark）
  //
  // 🔴 必须放在**验签之后**（2026-11-07 调整）：此前放在验签之前，任何人都能用
  // 任意 nonce 触发一次 Redis 写入 —— 零成本写放大，且可以先烧掉别人要用的 nonce。
  // 放到验签之后，只有持有合法 token + 正确签名的请求才会留下痕迹；
  // 语义不变（同一签名重放仍然命中）。
  const replayed = await h5NonceStore.checkAndMark(nonce);
  if (replayed) {
    return reply.code(403).send({
      code: 403,
      error: 'replay_detected',
      message: '安全检测失败：请求重复提交'
    });
  }

  // 8. 活跃续期：只在剩余有效期不足一半时续，避免每请求写 Redis + 每请求 Set-Cookie。
  //    续期必须同时改 cookie 的 maxAge（客户端只认 cookie 里的 exp），否则会出现
  //    「cookie 还活着但 exp 已过」的 403 token_expired 死循环。
  const remainingMs = expiredTime - now;
  if (remainingMs > 0 && remainingMs < (H5_TOKEN_TTL * 1000) / 2) {
    const renewedExp = now + H5_TOKEN_TTL * 1000;
    try {
      await sessionStore.expire(h5TokenMd5, H5_TOKEN_TTL);
      writeTokenCookie(reply, `${h5TokenMd5}_${renewedExp}`, H5_TOKEN_TTL);
      await getStore(H5_DEVICE_STORE).set(clientKey(request), { md5: h5TokenMd5, exp: renewedExp }, H5_TOKEN_TTL);
    } catch {
      // 续期失败不影响本次请求：旧 token 在 exp 之前仍然有效，下次引导会重建
    }
  }
}

/**
 * 签发/复用 H5 Token（登录成功后、或已登录请求的引导路径）
 *
 * 幂等：同一客户端（x-device-id / IP）已有有效 token 时**直接复用**，不写新键 ——
 * 这是把键数从「签发次数」压到「客户端数」的那一步。
 *
 * 🔴 值不再是 rawToken：验签拼的是 md5，rawToken **从不参与任何计算**
 *   （见 docs/H5-SIGNATURE.md），存它等于白占 48 字节。现在存 `{ v, d, u, ts }`：
 *   版本 / 设备指针 / 归属 uid / 签发时间 —— 体积减半，且第一次有了"这个键属于谁"，
 *   可以按 uid 清理、按设备统计。
 *
 * @returns {string|null} 新生成的 rawToken；复用已有 token 时返回 null
 */
async function issueH5Token(fastify, reply, options = {}) {
  const request = reply?.request;
  const sessionStore = getStore('h5_token');
  const deviceStore = getStore(H5_DEVICE_STORE);

  const nowMs = Date.now();
  const devHash = request ? clientKey(request) : '';
  // 登录成功那一刻 `request.state.user` 还是空的（认证插件跑在登录之前），
  // 由调用方（setAuthCookies）把 uid 显式传进来，否则登录发的 token 会带 `u: null`，
  // 导致登录后第一次引导因"归属不一致"再换一次 token。
  const uid = options.uid ?? request?.state?.user?.uid ?? null;

  // ① 设备维度幂等：先看指针，命中且主键仍存在 → 复用（不产生新键）
  if (devHash) {
    try {
      const cached = await deviceStore.get(devHash);
      if (cached?.md5 && cached.exp > nowMs) {
        const record = await sessionStore.get(cached.md5);
        // 归属校验：同一台设备换账号时必须换 token（否则 `u` 字段会指向上一个用户，
        // 一个"按 uid 清理"的动作就会清错人）。老格式的值是裸字符串、没有 u 字段，
        // 因此会自动落到"换新"，顺便完成格式迁移。
        const sameOwner = !uid || record?.u === uid;
        if (record && sameOwner) {
          // maxAge 必须按剩余有效期给：给满 TTL 会让 cookie 活得比 exp 久
          const remainingSec = Math.max(60, Math.floor((cached.exp - nowMs) / 1000));
          writeTokenCookie(reply, `${cached.md5}_${cached.exp}`, remainingSec);
          return null;
        }
        if (record) {
          // 换账号：旧键立即删掉，键数保持 ≈ 设备数（不靠 TTL 慢慢收）
          await sessionStore.delete(cached.md5);
        }
      }
    } catch {
      // 存储抖动 → 落到下面新建；命不中幂等不影响正确性
    }
  }

  // ② 新建
  const rawH5Token = crypto.randomBytes(24).toString('hex');
  const h5TokenMd5 = sha256hex(rawH5Token);
  const expiredTime = nowMs + H5_TOKEN_TTL * 1000;

  await sessionStore.set(h5TokenMd5, { v: 1, d: devHash || null, u: uid, ts: nowMs }, H5_TOKEN_TTL);
  if (devHash) {
    await deviceStore.set(devHash, { md5: h5TokenMd5, exp: expiredTime }, H5_TOKEN_TTL);
  }

  writeTokenCookie(reply, `${h5TokenMd5}_${expiredTime}`, H5_TOKEN_TTL);

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
