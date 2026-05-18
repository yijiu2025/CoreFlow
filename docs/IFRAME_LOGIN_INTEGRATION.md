# Iframe 快捷登录集成指南 (Standard v1.0)

本文档旨在指导外部应用如何集成“快捷登录小框”，以及认证中心如何进行安全加固。

## 1. 架构原理
通过 `iframe` 嵌入认证中心提供的极简登录页，利用 `postMessage` 进行跨域通信，实现无刷新、无跳转的登录体验。

## 2. 客户端集成 (Client App)

### 2.1 嵌入登录页
在你的应用中创建一个弹窗或侧边栏，嵌入以下 URL：
`http://auth.yourdomain.com/mini-login?origin=http://your-app.com`

> **注意**：`origin` 参数用于安全校验，告知认证中心哪个应用正在发起请求。

### 2.2 监听登录状态
```javascript
window.addEventListener('message', (event) => {
  // 1. 安全校验：必须来自信任的认证中心
  if (event.origin !== 'http://auth.yourdomain.com') return;

  const { event: type, data, message } = event.data;

  switch (type) {
    case 'AUTH_READY':
      console.log('登录框加载完成');
      break;
    case 'AUTH_SUCCESS':
      console.log('登录成功', data.token, data.userInfo);
      // 存储 Token 并刷新应用状态
      localStorage.setItem('auth_token', data.token);
      break;
    case 'AUTH_FAILURE':
      console.error('登录失败', message);
      break;
  }
});
```

## 3. 认证中心配置 (Auth Center)

### 3.1 前端：MiniLogin 页面逻辑
- **URL**: `/mini-login`
- **行为**: 登录成功后，禁止使用 `window.location.href` 跳转。
- **通信**: 使用 `window.parent.postMessage` 返回认证结果。

### 3.2 后端：安全响应头 (Fastify/Node.js)
认证中心必须放宽针对此页面的 `X-Frame-Options`。

```javascript
// 后端钩子示例
app.addHook('onSend', (request, reply, payload, done) => {
  if (request.url.startsWith('/mini-login')) {
    // 移除默认的 SAMEORIGIN 限制，允许外部域名通过 iframe 访问该地址
    reply.header('X-Frame-Options', 'ALLOWALL'); 
    reply.header('Content-Security-Policy', "frame-ancestors 'self' *"); // 建议生产环境指定具体域名
  }
  done();
});
```
