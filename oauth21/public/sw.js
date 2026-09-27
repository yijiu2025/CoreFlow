/**
 * Service Worker 自毁迁移脚本 —— 它**不是功能代码**，唯一使命是把自己从浏览器里清掉。
 *
 * === 为什么这个文件存在 ===
 * 本项目曾用 `vite-plugin-pwa` 生成过 SW（`registerType: 'autoUpdate'`）。它在生产环境有两个
 * 已实测的危害（完整记录见 `docs/frontend/PWA_GUIDE.md` 第六节）：
 *   ① 未配 denylist 的 `NavigationRoute` 会把**一切同源 GET 导航**顶成预缓存的 index.html，
 *      于是后端设备码授权页 `/oauth2.1/device`（`verification_uri`，只能靠浏览器导航打开）不可用；
 *   ② 预缓存把整棵 dist 写进清单，首访多下 780 KB（页面自身按需只要 214 KB）。
 * 2026-09-27 整体移除了 PWA 配置。
 *
 * === 为什么光删配置不够（这一步最容易漏） ===
 * 浏览器一旦装过 SW，就会**一直用它** —— 导航与静态资源都走它的 fetch handler，永远不回源。
 * 删掉构建配置只是不再生成新的 SW，已装机的那些仍会继续劫持请求。必须有一段代码**主动注销自己**。
 *
 * 于是本文件顶替了 `/sw.js` 这个 URL（`public/` 下的文件原样拷进产物根目录），浏览器做 SW
 * **更新检查**时就会取到它。这是浏览器的原生行为，**不需要任何页面代码注册或引用它**。
 *
 * === 它做什么 ===
 *   install  → 跳过等待（不等旧页面关闭，立即进入 activate）
 *   activate → 接管 → 清空所有 Cache Storage → 注销自己 → 让已打开的页面重新导航
 * 它**不注册任何 fetch handler**：缓存清空后它就是个空壳，不参与任何请求。
 *
 * === 什么时候可以删掉这个文件 ===
 * 等旧 SW 的装机量归零之后。判据：连续两个发布周期都确认 `/sw.js` 不再被请求。
 * 在那之前删掉它 = 让仍在旧缓存里的用户永远卡在旧版本。
 * 届时同步把 `verify-no-pwa.mjs` 的期望值从「sw.js 是自毁版」改成「sw.js 不存在」。
 */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // 先接管，确保下面能拿到全部 window clients
      await self.clients.claim();

      // 清空所有缓存（workbox 的 precache 与任何 runtime cache 都在这里）
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // 注销自己 —— 这一步之后本 origin 不再有 SW 注册
      await self.registration.unregister();

      // 让已打开的页面重新导航，立刻回到"纯网络"状态。
      // 不这么做的话缓存虽然清了，但页面仍是旧 SW 渲染出来的壳，用户得手动刷新一次。
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        // 跨域 / 已关闭的 client 会 reject，忽略即可，不影响迁移
        client.navigate(client.url).catch(() => null);
      });
    })()
  );
});
