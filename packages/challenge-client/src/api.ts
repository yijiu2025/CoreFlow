/**
 * 挑战接口客户端（issue / verify）
 *
 * 为什么不用 app 里现成的 axios 实例：两个前端各有一套拦截器（token 注入、401 刷新队列），
 * 而这两个接口是**免登录**的，走那套实例会被 428 跳到拦截器里，形成"挑战页请求挑战接口
 * 又被判定需要挑战"的递归。这里用裸 fetch，只带 cookie，语义最小。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

/** 签发挑战（相对 API 根） */
export const ISSUE_PATH = '/api/firewall/v1/challenge/issue';
/** 提交验证结果（相对 API 根） */
export const VERIFY_PATH = '/api/firewall/v1/challenge/verify';

/** 服务端支持的验证方式（与 `defense.challengeProvider` 取值一致） */
export type ChallengeProvider = 'pow' | 'turnstile' | 'hcaptcha' | 'google';

/**
 * 服务端下发的挑战材料（载荷本体只在服务端）
 *
 * ⚠️ pow 与第三方 provider 下发的字段**不同**，调用方必须先看 `provider`：
 *
 * | provider | 字段 | 客户端要做的 |
 * | --- | --- | --- |
 * | `pow`（默认，旧后端无此字段也按 pow 处理） | `challengeId` / `salt` / `difficulty` / `maxAttempts` | 本地解 PoW 后调 `verifyChallenge` |
 * | `turnstile` / `hcaptcha` / `google` | `siteKey` | 渲染组件，拿到 token 后调 `verifyToken` |
 *
 * 因此 pow 专用字段是**可选**的：它们在第三方模式下根本不存在。
 */
export interface ChallengeIssue {
  /** 本次使用的验证方式（缺省视为 `pow`，兼容未升级的后端） */
  provider?: ChallengeProvider;
  /** 第三方组件的站点密钥（**公开值**，不是密钥；渲染用） */
  siteKey?: string;

  /** ↓ pow 专用 */
  challengeId?: string;
  salt?: string;
  difficulty?: number;
  maxAttempts?: number;
  /** 挑战材料有效期（秒）；pow 才有意义 */
  ttlSec?: number;

  /**
   * 这道题为什么是这个难度（**粗粒度**归因，可选）
   *
   * `baseline` = 基准；`hardened` = 该 IP 最近反复答错，题变难了；
   * `relaxed` = 最近顺利通过，题变简单了。
   *
   * 由服务端的「递进难度」产生（`defense.challengeReputationEnabled`，默认关闭 →
   * 恒为 `baseline`）。它**不含分数也不含计数**，只够让页面解释一句
   * "为什么这次要多算一会儿"，不足以让攻击者反推阈值。
   */
  reason?: 'baseline' | 'hardened' | 'relaxed';
}

/**
 * 验证结果
 *
 * `passTtlSec` / `scope` 由服务端按**登录态**决定：已登录 1800s，匿名 120s。
 * 前端只负责如实展示，不要自己假设"通过就是 30 分钟"。
 */
export interface VerifyResult {
  ok: boolean;
  reason?: string;
  /** 本次通过的免挑战时长（秒），服务端返回 */
  passTtlSec?: number;
  /** 档位：account（已登录）/ anonymous */
  scope?: 'account' | 'anonymous';
}

/**
 * 挑战接口错误
 *
 * `code` 取服务端的 `reason`（`Not Challenged` / `Challenge Unavailable` …），
 * 供调用方按**结构化标记**分支，而不是拿 message 文本做控制流。
 */
export interface ChallengeError extends Error {
  code?: string;
  status?: number;
}

/** 客户端配置 */
export interface ChallengeClientOptions {
  /**
   * API 根地址（不含尾斜杠）。同源部署留空；跨域开发填 `http://localhost:3000`
   * （两个 app 的 `VITE_API_BASE_URL` 已经为此存在）。
   */
  baseURL?: string;
  /** 自定义 fetch（测试注入用） */
  fetchImpl?: typeof fetch;
}

/**
 * 归一化 API 根：去掉尾斜杠，避免拼出 `//api/...`
 *
 * @param base 原始根地址
 * @returns 归一化结果（可能为空串）
 */
function normalizeBase(base?: string): string {
  return (base || '').replace(/\/+$/, '');
}

/**
 * 签发一份挑战
 *
 * @param options 客户端配置
 * @returns 挑战材料
 * @throws Error 网络失败或服务端拒绝（含 429 限频 / 503 签发失败）
 */
export async function issueChallenge(options: ChallengeClientOptions = {}): Promise<ChallengeIssue> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${normalizeBase(options.baseURL)}${ISSUE_PATH}`, {
    method: 'POST',
    // 跨域开发时必须显式带上 cookie，否则 verify 阶段的设备/指纹绑定与 cookie 都对不上
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });

  const body = (await safeJson(res)) as Partial<ChallengeIssue> & { ok?: boolean; reason?: string };
  if (!res.ok || body?.ok !== true) {
    const err = new Error(body?.reason || `Challenge issue failed (${res.status})`) as ChallengeError;
    err.code = body?.reason;
    err.status = res.status;
    throw err;
  }
  return body as ChallengeIssue;
}

/**
 * 提交验证结果
 *
 * 服务端通过 Set-Cookie 下发 `fw_verified`（HttpOnly），因此这里必须 `credentials: 'include'`。
 *
 * @param challengeId 挑战 ID
 * @param answer 求解答案（纯十进制数字串）
 * @param options 客户端配置
 * @param solveMs 本机求解耗时（毫秒，可选）
 *   **只用于服务端统计**（成功率之外的"用户到底卡了多久"），不参与任何判定 ——
 *   既然是客户端自报，服务端不会拿它做安全决定。
 * @returns `{ ok: true }` 或 `{ ok: false, reason }`
 */
export async function verifyChallenge(
  challengeId: string,
  answer: string,
  options: ChallengeClientOptions = {},
  solveMs?: number
): Promise<VerifyResult> {
  const payload: Record<string, unknown> = { challengeId, answer };
  if (typeof solveMs === 'number' && Number.isFinite(solveMs) && solveMs >= 0) {
    payload.solveMs = Math.round(solveMs);
  }
  return await postVerify(payload, options);
}

/**
 * 打 verify 端点并归一化返回（pow 与第三方共用这段）
 *
 * @param payload 请求体（`{challengeId,answer}` 或 `{token}`，可选 `solveMs`）
 * @param options 客户端配置
 * @returns 归一化后的验证结果
 */
async function postVerify(payload: Record<string, unknown>, options: ChallengeClientOptions): Promise<VerifyResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(`${normalizeBase(options.baseURL)}${VERIFY_PATH}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = (await safeJson(res)) as Partial<VerifyResult>;
  if (body && typeof body.ok === 'boolean') {
    return {
      ok: body.ok,
      reason: body.reason,
      passTtlSec: body.passTtlSec,
      scope: body.scope
    };
  }
  return { ok: false, reason: `Verification failed (${res.status})` };
}

/**
 * 提交第三方 provider 的验证 token（Turnstile / hCaptcha / reCAPTCHA）
 *
 * 与 `verifyChallenge` 同一个端点，区别只在载荷形状：第三方没有本地求解，
 * token 由组件在渲染/交互后给出，服务端转给上游校验。
 *
 * 区分两个函数而不是给一个函数加可选参数，是为了让**调用点一眼看出走的是哪条路** ——
 * 混成一个 `verify({challengeId?, answer?, token?})` 之后，"到底该传什么"就只剩注释知道了。
 *
 * @param token 组件回调里拿到的 token（一次性，且有效期很短）
 * @param options 客户端配置
 * @param solveMs 从展示组件到用户完成的耗时（毫秒，可选）；**只用于统计**
 * @returns `{ ok: true }` 或 `{ ok: false, reason }`（上游不可达时 reason 为 `Challenge Unavailable`，可重试）
 */
export async function verifyToken(
  token: string,
  options: ChallengeClientOptions = {},
  solveMs?: number
): Promise<VerifyResult> {
  const payload: Record<string, unknown> = { token };
  if (typeof solveMs === 'number' && Number.isFinite(solveMs) && solveMs >= 0) {
    payload.solveMs = Math.round(solveMs);
  }
  return await postVerify(payload, options);
}

/**
 * 容错 JSON 解析（网关/代理返回 HTML 错误页时不抛异常）
 *
 * @param res fetch 响应
 * @returns 解析后的对象；解析失败返回 null
 */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
