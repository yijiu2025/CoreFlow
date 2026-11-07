/**
 * 验证挑战页面模板
 * 生成一个包含**工作量证明（PoW）求解脚本**的 HTML 页面，用于区分真实用户和自动化机器人。
 *
 * 与旧实现的区别（旧实现是一条死路，见 docs/AUDIT-REPORT-2026-09-15.md 🔴-2）：
 *   - 旧版把 `nonce / timestamp / HMAC 签名` **明文内嵌**在页面里，客户端只要原样回传即通过，
 *     脚本取一次页面、回填一次就能绕过；
 *   - 旧版校验字段（webgl/webdriver/plugins）**全部由客户端自报**，且 `plugins === 0` 会
 *     直接拒绝现代 Chrome / Firefox（它们早已上报 0 个插件）→ 真实用户被误杀。
 * 现在：服务端只下发一个**不透明 challengeId**（载荷存服务端，见 util/redis.js writeChallenge），
 * 客户端必须付出可校验的计算代价（找到满足前导零难度的 PoW 答案）才能通过。
 *
 * PoW 的**能力**（哈希原语 / 出题 / 判题）在 `framework/security/verify/pow/`（验证能力库，与
 * captcha / recaptcha 同构）；本文件只负责「**怎么把题呈现给用户**」—— 页面、CSP、302、
 * Worker。两边共用同一份哈希源码（`toString()` 内联），求解与判题不可能漂移。
 *
 * 求解跑在 **Blob Worker** 里（`buildSolverSource`）：PoW 是同步纯计算，放主线程会把整页
 * 冻住；Worker + 主线程降级两条路都保留，Worker 不可用时自动退回同步求解。
 *
 * ⚠️ **CSP 是这条链路的隐形杀手**：本页脚本是内联的，而生产环境的全局 helmet 策略是
 * `script-src 'self'` —— 少了 `challengePageCsp(nonce)` 这一份**专属响应头**，浏览器会
 * 直接拦掉整段脚本，页面永远停在 "Verifying your browser"。开发环境 CSP 关闭，看不出来。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-05 内联脚本改 nonce + Blob Worker 求解（此前在生产 CSP 下根本不会执行）
 */
import crypto from 'crypto';
import {
  makePowSolver,
  SHA256_K,
  powDao,
  MAX_DIFFICULTY,
  DEFAULT_TTL_SEC
} from '../../../security/verify/pow/index.js';
import { resolveChallengeDifficulty } from './difficulty.js';
import { powChallengeStore } from '../util/pow-store.js';

/** 挑战载荷有效期（秒）：语义与出处都在 `verify/pow`，这里只是本模块的对外名字 */
const CHALLENGE_TTL_SEC = DEFAULT_TTL_SEC;

/**
 * 签发一份挑战载荷（**服务端持有**），只把不透明 challengeId + 求解参数交给调用方
 *
 * 页面模板（本文件）与 JSON 接口（`POST /api/firewall/v1/challenge/issue`，供 Vue 挑战页）
 * 共用这一处实现：绑定字段、TTL、难度、尝试上限只有一份，两个入口不可能漂移。
 *
 * 题目本身的生成与落盘在 `verify/pow`（`powDao.issue`）；这里只决定**难度取多少**
 * 与**题目绑谁**（ip / 指纹 / 设备 ID）—— 后两者都是防火墙的域知识，
 * 对 verify 来说只是不透明字段，原样存取、原样回传给调用方自己比对。
 *
 * 难度来自 `resolveChallengeDifficulty()`（基准 ± 信誉浮动，默认关闭 → 恒为基准）。
 * 返回体里的 `reason` 是粗粒度归因（`baseline` / `hardened` / `relaxed`），
 * 只用来让前端解释"为什么这道题更难了"，不含分数也不含计数。
 *
 * @param {object} subject 挑战对象
 * @param {string} subject.ip 客户端 IP
 * @param {string|null} [subject.fingerprint] 请求指纹
 * @param {string|null} [subject.deviceId] 设备 ID
 * @param {boolean} [subject.loggedIn] 是否已登录（登录用户难度降一档）
 * @returns {Promise<{challengeId:string, salt:string, difficulty:number, maxAttempts:number, ttlSec:number, reason:string}>}
 */
async function issueChallengePayload({ ip, fingerprint = null, deviceId = null, loggedIn = false }) {
  const { difficulty, reason } = await resolveChallengeDifficulty({ ip, loggedIn });
  const challenge = await powDao.issue(powChallengeStore, {
    difficulty,
    ttlSec: CHALLENGE_TTL_SEC,
    binding: { ip, fingerprint: fingerprint || null, deviceId: deviceId || null }
  });
  // `reason` 只是粗粒度归因（baseline / hardened / relaxed），与题目本身一起下发，
  // 让前端能说清"为什么这次更难"，又不至于把分数/计数暴露给攻击者当调参反馈。
  return { ...challenge, reason };
}

/**
 * 求解线程源码（Blob Worker 的 body）
 *
 * 为什么要线程：PoW 是**同步纯计算**，跑在主线程上会把整页冻住（难度 5 ≈ 2s：
 * 进度条不动、点击无响应、低端机可能被判「页面无响应」）。放进 Worker 后主线程始终空闲。
 *
 * 求解内核用 `makePowSolver()`（零分配，比 `sha256Hex + startsWith` 快约 5.9×，实测见该函数注释）。
 * 它必须**再内联一次**：Worker 没有外层闭包，`toString()` 只带函数体、不带外面的 `SHA256_K`，
 * 所以常量表单独发一份。两者仍来自 `verify/pow/service.js` 的同一份源码，
 * 服务端判题 / 主线程降级 / 求解线程三处不可能各改各的。
 *
 * @returns {string} 可直接塞进 `new Blob([...])` 的 JS 源码
 */
function buildSolverSource() {
  return `'use strict';
var SHA256_K = ${JSON.stringify(SHA256_K)};
var makePowSolver = ${makePowSolver.toString()};
self.onmessage = function (e) {
  var d = e.data || {};
  var total = d.maxAttempts;
  var matches = makePowSolver(d.prefix, d.difficulty);
  for (var i = 0; i < total; i++) {
    if (matches(i)) {
      self.postMessage({ answer: String(i) });
      return;
    }
    // 每 16384 次回报一次进度：调用方据此画真实进度条（不是假动画）
    if ((i & 16383) === 0) self.postMessage({ progress: i / total });
  }
  self.postMessage({ answer: null });
};
`;
}

/**
 * 挑战页的**专属 CSP**（每次响应一个 nonce，只放行本页那一支脚本）
 *
 * 为什么必须单独给：全局 helmet 策略是 `script-src 'self'`（生产环境），而本页的脚本是
 * **内联**的 —— 生产环境下浏览器会把整段 `<script>` 拦掉，页面永远停在
 * `Verifying your browser, please wait...`，而且连 `fail()` 都跑不到，用户没有任何出口。
 * 开发环境 `contentSecurityPolicy: false`，所以这个坑在本地完全看不见。
 *
 * 为什么不用 `'sha256-…'`：页面每次都不同（内嵌本次 challengeId / salt），哈希无法预置。
 *
 * 各条目的必要性：
 *   script-src 'nonce-X'    本页内联脚本；**不含** 'unsafe-inline'（那会削掉全局 XSS 防护）
 *   worker-src blob:        PoW 求解线程用 Blob URL 起（页面自包含、不额外发请求）
 *   connect-src 'self'      POST /api/firewall/v1/challenge/verify 是同源请求
 *   style-src 'unsafe-inline'  页面全部是内联 style 属性，无外部样式表
 *   default-src 'none'      其余一律不放（无图片/字体/框架/表单提交）
 *   base-uri 'none' / form-action 'none' / frame-ancestors 'none'
 *                           防 <base> 改写相对 URL、防被三方页面内嵌钓鱼
 *
 * @param {string} nonce 本次响应的一次性 nonce
 * @returns {string} Content-Security-Policy 头的值
 */
function challengePageCsp(nonce) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    'worker-src blob:',
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

/**
 * 拼「文档请求 → 独立前端挑战页」的 302 Location
 *
 * 只在 `defense.challengePageUrl` 配了的时候用；返回 null 表示继续用内置页。
 *
 * 三条硬规则：
 *   ① 只接受**站内相对路径**（`/…` 但**不是** `//host` 或 `/\host`）——
 *      否则 302 就是开放重定向（配置写错 = 把被挑战的用户送到任意站点）；
 *   ② 跨站部署下 `fw_verified` 会变成第三方 cookie，`SameSite=Strict` 不发送
 *      → 用户通过后立刻又被挑战（死循环）。所以这里**不**支持绝对地址，是功能约束
 *      而不只是安全考虑；确实要跨站得先改 cookie 策略（另立配置项）；
 *   ③ `return` 必须是原样可回跳的站内地址：原 URL 带查询串时也要带回去，
 *      否则用户过完验证会落在"少了筛选条件"的页面上。
 *
 * @param {string} pageUrl `defense.challengePageUrl` 的值（可为空/非法）
 * @param {string} originalUrl 被挑战的原始 URL（可含查询串）
 * @returns {string|null} 形如 `/firewall/challenge.html?return=%2Fapi%2Fx%3Fa%3D1`
 */
function buildChallengeRedirect(pageUrl, originalUrl) {
  const page = typeof pageUrl === 'string' ? pageUrl.trim() : '';
  if (!page) return null;
  if (!page.startsWith('/')) return null;
  if (page.startsWith('//') || page.startsWith('/\\')) return null;

  const raw = typeof originalUrl === 'string' ? originalUrl : '';
  // 只回跳站内地址；其他情况（空、绝对 URL）退回根路径，绝不把外部地址塞进 return
  const target = raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';

  const sep = page.includes('?') ? '&' : '?';
  return `${page}${sep}return=${encodeURIComponent(target)}`;
}

/**
 * 构建高强度浏览器挑战页面（含工作量证明）
 *
 * @param {string} ip 客户端 IP
 * @param {string} [fingerprint] 可选的请求指纹（一并绑定到挑战载荷）
 * @param {string|null} [deviceId] 可选的设备 ID（一并绑定；它让「通过」跨 IP 有效）
 * @param {{nonce?: string}} [options] `nonce` 由调用方传入并与 `challengePageCsp()` 配对；
 *   不传时自生成一个（HTML 本身仍自洽，但**响应头必须用同一个值**，见 pipeline.sendChallengePage）
 * @returns {Promise<string>} HTML 字符串
 */
async function buildChallengePage(ip, fingerprint, deviceId = null, options = {}) {
  const { challengeId, salt, difficulty, maxAttempts } = await issueChallengePayload({
    ip,
    fingerprint,
    deviceId,
    // 登录用户难度降一档（递进难度开着时才有效果）：有身份可追责，体验优先
    loggedIn: options.loggedIn === true
  });
  const nonce = options.nonce || crypto.randomBytes(16).toString('hex');
  // JSON.stringify 负责转义换行/引号；再挡一次 `</` 拼接，避免出现字面量 `</script>`
  const solverLiteral = JSON.stringify(buildSolverSource()).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
    <html>
      <head><title>Security Check</title></head>
      <body style="background:#0f172a;color:#22d3ee;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;overflow:hidden;">
        <div style="background:rgba(30,41,59,0.5);backdrop-filter:blur(10px);padding:3rem;border-radius:2rem;border:1px solid rgba(34,211,238,0.1);text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
          <div style="width:60px;height:60px;background:rgba(34,211,238,0.1);border-radius:1.5rem;margin:0 auto 1.5rem;display:flex;align-items:center;justify-content:center;">
             <svg style="width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h1 style="font-size:1.5rem;font-weight:900;letter-spacing:-0.025em;margin-bottom:0.5rem;">Security Verification</h1>
          <p id="status" style="color:#94a3b8;font-size:0.875rem;margin-bottom:2rem;">Verifying your browser, please wait...</p>
          <div style="width:100%;height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;">
             <div id="progress" style="width:0%;height:100%;background:#22d3ee;transition:width 0.4s ease-out;"></div>
          </div>
          <button id="retry" type="button" style="display:none;margin:1.5rem auto 0;padding:0.6rem 1.5rem;border-radius:0.75rem;border:1px solid rgba(34,211,238,0.4);background:rgba(34,211,238,0.12);color:#22d3ee;font-size:0.875rem;cursor:pointer;">Retry Verification</button>
        </div>

        <script nonce="${nonce}">
          // 服务端同一份源码内联：求解内核（零分配）+ 常量表，与 Worker、服务端校验同源
          const SHA256_K = ${JSON.stringify(SHA256_K)};
          const makePowSolver = ${makePowSolver.toString()};

          const CHALLENGE_ID = '${challengeId}';
          const SALT = '${salt}';
          const DIFFICULTY = ${difficulty};
          const MAX_ATTEMPTS = ${maxAttempts};
          const PREFIX = CHALLENGE_ID + ':' + SALT + ':';

          // PoW 求解线程源码（Blob Worker，顺带说明：Worker 无外层闭包，哈希在那里再内联一份）
          const SOLVER_SRC = ${solverLiteral};

          const statusEl = document.getElementById('status');
          const progress = document.getElementById('progress');
          const retryEl = document.getElementById('retry');
          let retryTimer = null;
          /**
           * 求解开始时刻（毫秒）。只在**真正开始算**时打一次：Worker 起不来会降级到
           * 主线程再算一遍，但"用户等了多久"应当从第一次开始算起，不能重置。
           */
          var solveStartedAt = 0;
          function markSolveStart() {
            if (!solveStartedAt) solveStartedAt = Date.now();
          }
          retryEl.addEventListener('click', function () { location.reload(); });

          function setProgress(pct) {
            progress.style.width = String(pct) + '%';
          }

          /** 自动重取挑战的次数（存 sessionStorage，跨刷新保留） */
          function retryCount() {
            try { return Number(sessionStorage.getItem('fw_chal_retry') || 0) || 0; } catch (e) { return 0; }
          }

          /**
           * 统一失败出口
           *
           * 挑战载荷是**一次性**的（服务端 GET+DEL），任何一次失败都已经把它作废：
           * 停在原地等于把用户关在一个没有任何出口的死页面（旧实现正是如此，
           * 只在成功时才 location.reload）。这里给按钮 + 最多 3 次自动刷新重取新挑战。
           *
           * 为什么要封顶：上下文持续不一致（例如移动端一路换网）时，无限自动刷新会把
           * 用户锁在「刷新 → 失败 → 刷新」的循环里，也白白打挑战接口。超过 3 次就只留按钮。
           */
          function fail(reason) {
            if (retryTimer) clearTimeout(retryTimer);
            statusEl.innerText = 'Verification Failed: ' + reason;
            statusEl.style.color = '#ef4444';
            retryEl.style.display = 'inline-block';
            var n = retryCount();
            if (n < 3) {
              try { sessionStorage.setItem('fw_chal_retry', String(n + 1)); } catch (e) { /* 隐私模式：退化为手动重试 */ }
              retryTimer = setTimeout(function () { location.reload(); }, 3000);
            }
          }

          /**
           * 主线程同步求解 —— **只作为降级路径**
           *
           * Worker 起不来时（老浏览器、或 CSP 没放行 worker-src blob:）才走这里。
           * 它会把页面冻住，所以正常情况下不应执行；执行了也不影响正确性。
           */
          function solveOnMain() {
            const matches = makePowSolver(PREFIX, DIFFICULTY);
            for (let answer = 0; answer < MAX_ATTEMPTS; answer++) {
              if (matches(answer)) return String(answer);
            }
            return null;
          }

          /**
           * 用 Blob Worker 求解
           *
           * resolve 答案字符串（解不出为 null）；**任何**起线程/运行时错误都 reject，
           * 由调用方降级到主线程 —— 绝不让用户卡在"进度条不动"的状态里。
           * 用完必须 terminate + revokeObjectURL，否则 Blob 会一直挂在文档上。
           */
          function solveInWorker() {
            return new Promise(function (resolve, reject) {
              var url = null;
              var worker = null;
              var settled = false;

              function finish(answer, err) {
                if (settled) return;
                settled = true;
                try { if (worker) worker.terminate(); } catch (e) { /* 已终止 */ }
                try { if (url) URL.revokeObjectURL(url); } catch (e) { /* 已释放 */ }
                if (err) reject(err); else resolve(answer);
              }

              try {
                url = URL.createObjectURL(new Blob([SOLVER_SRC], { type: 'text/javascript' }));
                worker = new Worker(url);
              } catch (err) {
                finish(null, err);
                return;
              }

              worker.onmessage = function (e) {
                var data = e.data || {};
                if (typeof data.progress === 'number') {
                  // 真实进度：10% → 80% 之间按尝试次数推进
                  setProgress(10 + Math.floor(data.progress * 70));
                  return;
                }
                finish(data.answer === undefined ? null : data.answer, null);
              };
              worker.onerror = function () { finish(null, new Error('worker-error')); };

              try {
                worker.postMessage({ prefix: PREFIX, difficulty: DIFFICULTY, maxAttempts: MAX_ATTEMPTS });
              } catch (err) {
                finish(null, err);
              }
            });
          }

          function submit(answer) {
            // solveMs 只用于服务端统计（"用户卡了多久"），不参与任何判定
            var payload = { challengeId: CHALLENGE_ID, answer: answer };
            if (solveStartedAt > 0) payload.solveMs = Date.now() - solveStartedAt;
            return fetch('/api/firewall/v1/challenge/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).then(r => r.json());
          }

          /** 拿到答案之后：提交校验 → 通过则刷新（刷新会带上 fw_verified cookie） */
          function onAnswer(answer) {
            if (answer === null) {
              fail('Challenge Unsolvable');
              return;
            }
            setProgress(90);
            submit(answer)
              .then(function (res) {
                if (res && res.ok) {
                  setProgress(100);
                  statusEl.innerText = 'Verified. Redirecting...';
                  try { sessionStorage.removeItem('fw_chal_retry'); } catch (e) { /* 无 storage 时忽略 */ }
                  setTimeout(function () { location.reload(); }, 500);
                } else {
                  fail((res && res.reason) || 'Unknown Error');
                }
              })
              .catch(function () {
                fail('Connection Error');
              });
          }

          setProgress(5);
          setTimeout(function () {
            markSolveStart();
            solveInWorker().then(onAnswer, function () {
              // 降级：先让 setProgress 那一帧渲染出来，再进同步计算（否则进度条不会动）
              setProgress(10);
              setTimeout(function () { onAnswer(solveOnMain()); }, 30);
            });
          }, 100);
        </script>
      </body>
    </html>
  `;
}

export {
  buildChallengePage,
  buildChallengeRedirect,
  challengePageCsp,
  buildSolverSource,
  issueChallengePayload,
  // 这两个是**能力常量**（出处 `verify/pow/service.js`），本模块转出只为让调用方
  // 不必同时 import 两处；数值只有一个来源，不会出现两套口径。
  CHALLENGE_TTL_SEC,
  MAX_DIFFICULTY
};
