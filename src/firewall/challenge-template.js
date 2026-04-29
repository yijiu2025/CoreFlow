/**
 * 验证挑战页面模板
 * 生成一个包含指纹采集脚本的 HTML 页面，用于区分真实用户和自动化机器人。
 */
import crypto from 'crypto';
import { CHALLENGE_SECRET } from './config.js';

/**
 * 构建高强度浏览器挑战页面
 * 包含签名验证与基础指纹采集
 */
/**
 * 构建高强度浏览器挑战页面
 * @param {string} ip 客户端 IP
 * @returns {string} HTML 字符串
 */
export function buildChallengePage(ip) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', CHALLENGE_SECRET)
    .update(`${ip}:${nonce}:${timestamp}`)
    .digest('hex');

  return `
    <html>
      <head><title>Security Check</title></head>
      <body style="background:#0f172a;color:#22d3ee;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;overflow:hidden;">
        <div style="background:rgba(30,41,59,0.5);backdrop-filter:blur(10px);padding:3rem;border-radius:2rem;border:1px solid rgba(34,211,238,0.1);text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
          <div style="width:60px;height:60px;background:rgba(34,211,238,0.1);border-radius:1.5rem;display:flex;items-center;justify-content:center;margin:0 auto 1.5rem;display:flex;align-items:center;justify-content:center;">
             <svg style="width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h1 style="font-size:1.5rem;font-weight:900;letter-spacing:-0.025em;margin-bottom:0.5rem;">Security Verification</h1>
          <p id="status" style="color:#94a3b8;font-size:0.875rem;margin-bottom:2rem;">Verifying your browser, please wait...</p>
          <div style="width:100%;height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;">
             <div id="progress" style="width:0%;height:100%;background:#22d3ee;transition:width 3s ease-out;"></div>
          </div>
        </div>

        <script>
          const progress = document.getElementById('progress');
          setTimeout(() => progress.style.width = '90%', 100);

          const collectFingerprint = () => {
            try {
              const canvas = document.createElement('canvas');
              const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
              return {
                screen: screen.width + 'x' + screen.height,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                plugins: navigator.plugins.length,
                webgl: !!gl,
                webdriver: navigator.webdriver || false
              };
            } catch (e) { return { error: true }; }
          };

          const data = {
            nonce: '${nonce}',
            timestamp: ${timestamp},
            signature: '${signature}',
            ...collectFingerprint()
          };

          fetch('/api/firewall/v1/challenge/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          })
          .then(r => r.json())
          .then(res => {
            if (res.ok) {
              progress.style.width = '100%';
              document.getElementById('status').innerText = 'Verified. Redirecting...';
              setTimeout(() => location.reload(), 500);
            } else {
              document.getElementById('status').innerText = 'Verification Failed: ' + (res.reason || 'Unknown Error');
              document.getElementById('status').style.color = '#ef4444';
            }
          })
          .catch(() => {
             document.getElementById('status').innerText = 'Connection Error';
          });
        </script>
      </body>
    </html>
  `;
}
