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
 * PoW 的哈希实现直接复用 `util/pow-sha256.js` 的**同一份源码**（`toString()` 内联），
 * 服务端校验与浏览器求解不可能漂移。
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
import { sha256Hex } from './util/pow-sha256.js';
import { getConfig } from './util/shared.js';
import { writeChallenge } from './util/redis.js';

/** 挑战载荷有效期（秒） */
const CHALLENGE_TTL_SEC = 300;
/**
 * 难度上限：5 个前导零（期望 16^5 ≈ 105 万次哈希，约 1~3s）
 *
 * 旧上限是 6（期望 1670 万次）：纯 JS 在主线程上算 1670 万次 ≈ 1 分钟**整页冻结**，
 * 且下面的尝试上限只有 2000 万（仅 1.2 倍期望值）→ 难度配 6 时约 30% 的用户直接
 * 得到 "Challenge Unsolvable"，而挑战载荷是一次性的、页面又不重试 → 用户卡死。
 * 因此把上限收到 5，并让尝试上限随难度按 8 倍期望值推导（见 attemptsForDifficulty）。
 */
const MAX_DIFFICULTY = 5;
/**
 * 单次挑战允许的尝试次数 = 8 × 期望值（16^difficulty）
 *
 * 8 倍期望值下「解不出来」的概率 ≈ e^-8 ≈ 0.03%，既不会误伤低端机，也不会让
 * 难度配置变成"看运气"。上限 2000 万只是防御性夹取（难度已被 MAX_DIFFICULTY 夹到 5，
 * 实际最大 840 万）。
 */
function attemptsForDifficulty(difficulty) {
  return Math.min(20_000_000, Math.ceil(8 * 16 ** difficulty));
}

/**
 * 当前配置的 PoW 难度（前导十六进制零个数）
 *
 * @returns {number} 夹取到 [1, MAX_DIFFICULTY] 的难度
 */
function currentDifficulty() {
  const raw = Number(getConfig().defense?.challengeDifficulty);
  if (!Number.isFinite(raw) || raw < 1) return 3;
  return Math.min(MAX_DIFFICULTY, Math.floor(raw));
}

/**
 * 签发一份挑战载荷（**服务端持有**），只把不透明 challengeId + 求解参数交给调用方
 *
 * 页面模板（本文件）与 JSON 接口（`POST /api/firewall/v1/challenge/issue`，供 Vue 挑战页）
 * 共用这一处实现：绑定字段、TTL、难度、尝试上限只有一份，两个入口不可能漂移。
 *
 * @param {{ip: string, fingerprint?: string|null, deviceId?: string|null}} subject 绑定上下文
 * @returns {Promise<{challengeId:string, salt:string, difficulty:number, maxAttempts:number, ttlSec:number}>}
 */
async function issueChallengePayload({ ip, fingerprint = null, deviceId = null }) {
  const challengeId = crypto.randomBytes(16).toString('hex');
  const salt = crypto.randomBytes(8).toString('hex');
  const difficulty = currentDifficulty();

  // 载荷只在服务端保存；调用方拿到的 challengeId 本身不含任何可直接回放的凭据
  await writeChallenge(
    challengeId,
    { ip, fingerprint: fingerprint || null, deviceId: deviceId || null, salt, difficulty, issuedAt: Date.now() },
    CHALLENGE_TTL_SEC
  );

  return { challengeId, salt, difficulty, maxAttempts: attemptsForDifficulty(difficulty), ttlSec: CHALLENGE_TTL_SEC };
}

/**
 * 求解线程源码（Blob Worker 的 body）
 *
 * 为什么要线程：PoW 是**同步纯计算**，跑在主线程上会把整页冻住（难度 5 ≈ 2s：
 * 进度条不动、点击无响应、低端机可能被判「页面无响应」）。放进 Worker 后主线程始终空闲。
 *
 * `sha256Hex` 在这里**再内联一次**：Worker 没有外层闭包，必须自带哈希实现。它仍然来自
 * `util/pow-sha256.js` 的同一份源码（`toString()`），所以服务端校验 / 主线程降级 /
 * 求解线程三处不可能各改各的。
 *
 * @returns {string} 可直接塞进 `new Blob([...])` 的 JS 源码
 */
function buildSolverSource() {
  return `'use strict';
var sha256Hex = ${sha256Hex.toString()};
self.onmessage = function (e) {
  var d = e.data || {};
  var target = '0'.repeat(d.difficulty);
  var prefix = d.prefix;
  var total = d.maxAttempts;
  for (var i = 0; i < total; i++) {
    if (sha256Hex(prefix + i).indexOf(target) === 0) {
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
  const { challengeId, salt, difficulty, maxAttempts } = await issueChallengePayload({ ip, fingerprint, deviceId });
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
          // 服务端同一份源码内联：主线程降级求解与服务端校验共用同一个哈希实现
          const sha256Hex = ${sha256Hex.toString()};

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
            const target = '0'.repeat(DIFFICULTY);
            for (let answer = 0; answer < MAX_ATTEMPTS; answer++) {
              if (sha256Hex(PREFIX + answer).indexOf(target) === 0) return String(answer);
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
            return fetch('/api/firewall/v1/challenge/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ challengeId: CHALLENGE_ID, answer: answer })
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
  challengePageCsp,
  buildSolverSource,
  issueChallengePayload,
  currentDifficulty,
  attemptsForDifficulty,
  CHALLENGE_TTL_SEC,
  MAX_DIFFICULTY
};
