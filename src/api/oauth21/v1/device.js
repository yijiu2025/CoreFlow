/**
 * OAuth 2.1 设备授权端点（RFC 8628）
 *
 * POST /device/code       — 发起设备授权
 * POST /device/token      — 设备端轮询获取令牌
 * GET  /device            — 用户验证页面
 * POST /device/authorize  — 用户输入 user_code 并授权
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { DeviceService } from '../../../app/oauth21/services/device.service.js';

const deviceService = new DeviceService();

export default async function (fastify) {
  registerGroupMetadata({
    name: 'device',
    description: '设备授权流程（RFC 8628）',
    prefix: '/v1/dev',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /device/code — 发起设备授权
   *
   * 适用于输入受限设备（智能电视、CLI 工具等）。
   * 返回 device_code、user_code 和验证地址。
   */
  registerSecureRoute(fastify, {
    name: 'deviceCode',
    alias: '设备授权发起',
    method: 'POST',
    url: '/device/code',
    handler: async (request, reply) => {
      const { client_id, scope } = request.body;
      if (!client_id) {
        return reply.code(400).send({
          error: 'invalid_request',
          error_description: 'client_id is required'
        });
      }
      try {
        const result = await deviceService.initiateDeviceAuthorization(client_id, scope);
        return result;
      } catch (err) {
        if (err.message === 'invalid_client') {
          return reply.code(400).send({ error: 'invalid_client' });
        }
        throw err;
      }
    }
  });

  /**
   * POST /device/token — 设备端轮询获取令牌
   *
   * 设备端在用户完成授权前持续轮询此端点。
   * 返回 authorization_pending 表示等待中。
   */
  registerSecureRoute(fastify, {
    name: 'deviceToken',
    alias: '设备令牌轮询',
    method: 'POST',
    url: '/device/token',
    handler: async (request, reply) => {
      const { grant_type, device_code, client_id } = request.body;

      if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
        return reply.code(400).send({ error: 'unsupported_grant_type' });
      }
      if (!device_code || !client_id) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      const result = await deviceService.pollForToken(device_code, client_id);

      if (result.error === 'authorization_pending') {
        return reply.code(400).send(result);
      }
      if (result.error) {
        const status = result.error === 'slow_down' ? 429 : 400;
        return reply.code(status).send(result);
      }

      return result;
    }
  });

  /**
   * GET /device — 用户验证页面
   *
   * 用户在浏览器中打开此页面，输入 user_code 完成设备授权。
   */
  registerSecureRoute(fastify, {
    name: 'devicePage',
    alias: '设备验证页面',
    method: 'GET',
    url: '/device',
    handler: async (request, reply) => {
      const userCode = request.query.user_code ?? '';
      reply.type('text/html');
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Device Authorization</title>
  <style>
    :root{--bg:#0a0a0a;--surface:#141414;--border:#2a2a2a;--accent:#c8ff00;--text:#e8e8e8;--muted:#666}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:monospace;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center}
    .c{max-width:400px;width:100%;padding:0 24px}
    .brand{font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:48px}
    h1{font-size:28px;font-weight:400;margin-bottom:24px}
    .info{color:var(--muted);font-size:13px;margin-bottom:24px}
    input[type="text"]{width:100%;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:monospace;font-size:18px;text-align:center;letter-spacing:.2em;outline:none;margin-bottom:20px}
    input:focus{border-color:var(--accent)}
    button{width:100%;padding:14px;background:var(--accent);color:#000;border:none;border-radius:4px;font-family:monospace;font-size:13px;font-weight:500;letter-spacing:.1em;cursor:pointer}
    button:hover{opacity:.85}
    .msg{margin-top:16px;padding:12px;border-radius:4px;font-size:13px;text-align:center}
    .ok{background:rgba(200,255,0,.1);border:1px solid rgba(200,255,0,.3);color:var(--accent)}
    .err{background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.3);color:#ff4444}
  </style>
</head>
<body>
  <div class="c">
    <div class="brand">OAuth 2.1 Device Authorization</div>
    <h1>Enter code</h1>
    <p class="info">Enter the code displayed on your device to authorize it.</p>
    <form id="f">
      <input type="text" name="user_code" id="uc" placeholder="XXXX-XXXX" maxlength="9" value="${userCode}" autofocus>
      <button type="submit">Authorize Device</button>
    </form>
    <div id="msg"></div>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit',async e=>{
      e.preventDefault();
      const code=document.getElementById('uc').value;
      const m=document.getElementById('msg');
      try{
        const r=await fetch('/device/authorize',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({user_code:code})
        });
        const d=await r.json();
        if(d.success){m.className='msg ok';m.textContent='Device authorized! You can close this page.'}
        else{m.className='msg err';m.textContent=d.error||'Failed'}
      }catch{m.className='msg err';m.textContent='Network error'}
    });
  </script>
</body>
</html>`;
    }
  });

  /**
   * POST /device/authorize — 用户输入 user_code 并授权
   */
  registerSecureRoute(fastify, {
    name: 'deviceAuthorize',
    alias: '设备授权确认',
    method: 'POST',
    url: '/device/authorize',
    handler: async (request, reply) => {
      const { user_code, user_id } = request.body;
      if (!user_code) {
        return reply.code(400).send({ success: false, error: 'user_code is required' });
      }
      const userId = user_id || 'default-user';
      const result = await deviceService.authorizeDevice(user_code, userId);
      return result;
    }
  });
}
