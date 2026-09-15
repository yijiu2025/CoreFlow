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
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'crypto';
import { sha256Hex } from '../util/pow-sha256.js';
import { getConfig } from '../util/shared.js';
import { writeChallenge } from '../util/redis.js';

/** 挑战载荷有效期（秒） */
const CHALLENGE_TTL_SEC = 300;
/** 难度上限：超过 6 个前导零（期望 1600 万次哈希）会让低端机卡死，服务端与客户端都按此夹取 */
const MAX_DIFFICULTY = 6;
/** 客户端最多尝试次数（防御性上限，约等于难度 6 的 2 倍期望值） */
const MAX_ATTEMPTS = 20_000_000;

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
 * 构建高强度浏览器挑战页面（含工作量证明）
 *
 * @param {string} ip 客户端 IP
 * @param {string} [fingerprint] 可选的请求指纹（一并绑定到挑战载荷）
 * @param {string|null} [deviceId] 可选的设备 ID（一并绑定；它让「通过」跨 IP 有效）
 * @returns {Promise<string>} HTML 字符串
 */
async function buildChallengePage(ip, fingerprint, deviceId = null) {
  const challengeId = crypto.randomBytes(16).toString('hex');
  const salt = crypto.randomBytes(8).toString('hex');
  const difficulty = currentDifficulty();

  // 载荷只在服务端保存；页面拿到的 challengeId 本身不含任何可直接回放的凭据
  await writeChallenge(
    challengeId,
    { ip, fingerprint: fingerprint || null, deviceId: deviceId || null, salt, difficulty, issuedAt: Date.now() },
    CHALLENGE_TTL_SEC
  );

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
        </div>

        <script>
          // 服务端同一份源码内联：浏览器求解与服务端校验共用同一个哈希实现
          const sha256Hex = ${sha256Hex.toString()};

          const CHALLENGE_ID = '${challengeId}';
          const SALT = '${salt}';
          const DIFFICULTY = ${difficulty};
          const MAX_ATTEMPTS = ${MAX_ATTEMPTS};

          const statusEl = document.getElementById('status');
          const progress = document.getElementById('progress');

          function solve() {
            const target = '0'.repeat(DIFFICULTY);
            const prefix = CHALLENGE_ID + ':' + SALT + ':';
            for (let answer = 0; answer < MAX_ATTEMPTS; answer++) {
              if (sha256Hex(prefix + answer).indexOf(target) === 0) return String(answer);
            }
            return null;
          }

          function submit(answer) {
            return fetch('/api/firewall/v1/challenge/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ challengeId: CHALLENGE_ID, answer: answer })
            }).then(r => r.json());
          }

          setTimeout(function () {
            progress.style.width = '60%';
            // 让出一次事件循环，保证进度条先渲染出来再进入同步计算
            setTimeout(function () {
              const answer = solve();
              if (answer === null) {
                statusEl.innerText = 'Verification Failed: Challenge Unsolvable';
                statusEl.style.color = '#ef4444';
                return;
              }
              progress.style.width = '90%';
              submit(answer)
                .then(function (res) {
                  if (res && res.ok) {
                    progress.style.width = '100%';
                    statusEl.innerText = 'Verified. Redirecting...';
                    setTimeout(function () { location.reload(); }, 500);
                  } else {
                    statusEl.innerText = 'Verification Failed: ' + ((res && res.reason) || 'Unknown Error');
                    statusEl.style.color = '#ef4444';
                  }
                })
                .catch(function () {
                  statusEl.innerText = 'Connection Error';
                  statusEl.style.color = '#ef4444';
                });
            }, 50);
          }, 100);
        </script>
      </body>
    </html>
  `;
}

export { buildChallengePage, currentDifficulty, CHALLENGE_TTL_SEC, MAX_DIFFICULTY };
