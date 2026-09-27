# PWA 接入规范（前端项目通用）

> 适用于所有 Vue 3 + Vite 前端项目。新建前端项目时**先确认适用场景**（见第一节末），再按本规范启用。
> 现有项目：`posecraft` 已启用；**`oauth21` 曾启用，已于 2026-09-27 整体移除**（它是"用完即走"的登录页，
> 本就不属于适用场景；移除过程与必须留的自毁迁移见第六节 —— 那一节是实战踩坑记录，值得先读）。

## 一、为什么用 PWA

PWA（渐进式 Web 应用）让网站能像原生 App 一样：

1. **可安装到主屏幕**（手机/桌面），启动图标、全屏体验、无浏览器地址栏
2. **离线访问**——Service Worker 预缓存静态资源，断网时仍能打开页面 UI
3. **自动更新**——新版本上线，用户下次访问自动拿到最新资源

适用场景：内容型应用（posecraft 之类）、用户高频访问的工具页。

🔴 **不适用**：**纯登录页 / 授权页**（oauth21 那种"用完即走"的入口闸门）。理由不是"收益不高"这么轻，
而是**成本与收益正好错配**：首访代价（SW 注册 + 预缓存全套）在新用户 / 无痕 / 清了缓存时**每次都要付**，
而它换来的"二次访问 0 请求"恰恰付在最不需要快的场景 —— 用户一次登录能用很久，不会反复冷启同一个 origin。
更严重的是它**会破坏功能**（`NavigationRoute` 顶掉同源导航），详见第六节。

> 判断口径一句话：**这个页面会不会成为用户反复冷启的入口？** 会 → 适合；不会 → 别启用。

## 二、技术栈

- **vite-plugin-pwa** ^1.0 — Vite 官方 PWA 插件，自动生成 SW + manifest
- **workbox** — Google 的 SW 库，vite-plugin-pwa 默认基于它

## 三、安装

```bash
npm install -D vite-plugin-pwa
```

## 四、配置 vite.config.ts

### 4.1 基础配置（SPA 默认）

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',     // SW 自动静默更新
      includeAssets: ['favicon.svg'], // 额外预缓存资源
      manifest: {
        name: 'App Name',              // 全名（安装提示）
        short_name: 'App',             // 短名（图标下文字）
        description: 'App description',
        theme_color: '#0f172a',        // 状态栏颜色
        background_color: '#0f172a',   // 启动背景色
        display: 'standalone',         // 全屏模式（无浏览器 UI）
        scope: '/app-base/',           // 与 vite.config 的 base 对齐
        start_url: '/app-base/',       // 启动 URL
        icons: [
          { src: '/app-base/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/app-base/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/app-base/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  base: '/app-base/', // 必须与 manifest.scope / start_url 对齐
});
```

### 4.2 关键配置项说明

| 选项 | 说明 | 默认 |
|---|---|---|
| `registerType: 'autoUpdate'` | SW 注册模式。新版本自动静默更新（用户下次访问即生效） | `autoUpdate` |
| `includeAssets` | 额外预缓存的静态资源（favicon 等） | `[]` |
| `manifest.theme_color` | 浏览器 UI 配色（状态栏、地址栏） | — |
| `manifest.display: 'standalone'` | 全屏模式（无浏览器地址栏） | `standalone` |
| `manifest.scope / start_url` | SW 作用域和启动 URL，**必须与 vite base 对齐** | `/` |
| `manifest.icons[]` | 必填 192/512 PNG，外加 maskable 版（Android 适配） | — |

### 4.3 workbox 缓存策略（进阶）

```ts
VitePWA({
  // ...基础配置
  workbox: {
    // 限制预缓存的文件类型（避免大文件被预缓存）
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff,woff2,ttf}'],
    // 调高缓存上限（默认 2MiB，部分 chunk 略超需要放宽）
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    // SPA 路由 fallback：所有未匹配到的导航请求回退到 index.html
    navigateFallback: '/app-base/index.html',
    // 排除列表（大文件目录、AI 模型等不预缓存）
    navigateFallbackDenylist: [/^\/app-base\/models\//, /^\/api\//]
  }
})
```

**为什么需要 `navigateFallback`**：SPA 路由是前端处理（`/home` `/profile` 等），SW 拦截未知 URL 时需要回退到 index.html 让前端路由接管，否则刷新页面会 404。

**为什么需要 `navigateFallbackDenylist`**：API 请求（`/api/...`）和大文件（AI 模型、视频等）不应走 SPA fallback，应让 Service Worker 直接放行或 NetworkFirst 处理。

### 4.4 资源类型决策

| 资源类型 | 是否预缓存 | 策略 |
|---|---|---|
| JS/CSS/HTML/SVG/PNG/图标/字体 | ✅ 预缓存 | CacheFirst（构建时哈希，永久缓存） |
| API 请求 | ❌ 不预缓存 | NetworkFirst（在线优先，断网 fallback） |
| 大文件（AI 模型、视频、>5MiB） | ❌ 不预缓存 | 直接走网络（按需下载） |
| 第三方字体（CDN） | 可选 | CacheFirst + 长期缓存 |

## 五、图标生成

PWA 要求 192×192 和 512×512 两种 PNG 图标（外加 512×512 maskable 版）。从项目 logo.svg 生成：

```bash
node -e "
const sharp=require('sharp');
const fs=require('fs');
const svg=fs.readFileSync('public/logo.svg');
Promise.all([
  sharp(svg).resize(192,192).png().toFile('public/pwa-192x192.png'),
  sharp(svg).resize(512,512).png().toFile('public/pwa-512x512.png')
]).then(()=>console.log('icons generated'));
"
```

图标放 `public/` 根目录（会被复制到 dist），文件路径在 manifest.icons 中引用。

## 六、如何移除（迁移期必须留自毁脚本）

**不适用就别启用**—— oauth21 就是一次反例：它正是上面写的"纯登录页"，却一直启用着 PWA，直到 2026-09-27
被整体移除（原因：无 denylist 的 `NavigationRoute` 顶掉了后端设备码授权页 `/oauth2.1/device`）。

### 6.1 光删配置是不够的（最容易漏的一步）

> 浏览器一旦装过 SW，就会**一直用它**：导航与静态资源都走它的 fetch handler，**永远不回源**。
> 删掉 `VitePWA` 只是不再生成新的 SW，**已装机的那些仍会继续劫持请求**。

所以必须留一次**自毁迁移**。

### 6.2 移除步骤（四件，缺一不可）

1. **删 `VitePWA({...})`**（含 `workbox` / `manifest` 段）。

2. **在 `public/` 放一个 `sw.js`**，顶替 `/sw.js` 这个 URL。浏览器做 SW **更新检查**时会取到它 ——
   这是浏览器原生行为，**不需要任何页面代码注册或引用它**。

   ```js
   self.addEventListener('install', event => {
     event.waitUntil(self.skipWaiting()); // 不等旧页面关闭
   });

   self.addEventListener('activate', event => {
     event.waitUntil(
       (async () => {
         await self.clients.claim();
         const names = await caches.keys();
         await Promise.all(names.map(n => caches.delete(n))); // 清空全部 Cache Storage
         await self.registration.unregister(); // 注销自己
         const clients = await self.clients.matchAll({ type: 'window' });
         // 让已打开的页面立刻回到"纯网络"态，否则用户还得手动刷新一次
         clients.forEach(c => c.navigate(c.url).catch(() => null));
       })()
     );
   });
   ```

   它**不要注册任何 `fetch` handler** —— 缓存清空后它就是个空壳，不参与任何请求。

3. **清掉为 PWA 做的构建期改造**。本仓曾把惰性主题 chunk 产出到 `lazy-theme/`，再用
   `workbox.globIgnores` 整目录排除 —— 那套路径前缀的**唯一**存在理由就是配合 SW，应随 SW 一起回滚
   （回滚路径 ≠ 少打包：产物里该切分的 chunk 仍要切分出来，这条要有断言守）。

4. **把"PWA 已移除"写成会红的关卡**，而不是删掉检查。本仓：`verify-no-pwa.mjs`（静态产物断言）
   + `verify-sw-migration.mjs`（造一个假老 SW 复现劫持 → 让真 `/sw.js` 接管同 scope → 断言缓存清空、
   registration 注销、导航回源）。

⛔ **自毁脚本什么时候才能删**：等旧 SW 装机量归零之后（建议 ≥2 个发布周期，确认 `/sw.js` 不再被请求）。
在那之前删掉它 ＝ 让仍在旧缓存里的用户**永远卡在旧版本**。

### 6.3 排查顺序

症状：生产上首访流量远大于"按需加载"该有的数，或**某个后端页面打不开、返回了前端 SPA 骨架**。

1. 打开 `dist/sw.js`：有没有 `precacheAndRoute` / `NavigationRoute` / `createHandlerBoundToUrl`；
2. 打开 `dist/index.html`：有没有 `<link rel="manifest">` 与 SW 注册注入；
3. ⚠️ **别指望页面级流量探针能发现它** —— SW 的 install 跑在**独立的 ServiceWorker target** 上，
   page 级的 `Network.enable` 一个字节都看不见（实测屏蔽与不屏蔽两轮数字**一字不差**）。
   要量它必须遍历 `caches`（`caches.keys()` + 逐个 `open().keys()`），或用 `navigator.storage.estimate()`。

## 七、构建验证

```bash
npx vite build
```

成功输出应包含：
```
PWA v1.x.x
mode      generateSW
precache  XX entries (XXX KiB)
files generated
  dist/sw.js
  dist/workbox-*.js
  dist/manifest.webmanifest
```

**常见错误**：
- `Configure "workbox.maximumFileSizeToCacheInBytes" to change the limit` → 默认 2MiB，调大 `workbox.maximumFileSizeToCacheInBytes` 或用 `globPatterns` 排除大文件
- `Could not resolve entry module "index.html"` → `cd <app-dir>` 后再 build（cwd 问题）
- `NODE_ENV=production is not supported` → 根目录 .env 不要设 NODE_ENV=production，Vite 默认会自动设

## 八、部署注意事项

1. **HTTPS 必须**：SW 仅在 HTTPS（localhost 除外）下注册。生产环境必须 HTTPS。
2. **Service-Worker-Allowed 头**：如果 SW 不在根目录，后端需返回 `Service-Worker-Allowed: /` 头允许作用域扩展（通常不需）
3. **首次访问需联网**：SW 注册 + 资源预缓存需要首次在线访问
4. **更新延迟**：`autoUpdate` 模式下，新版本在用户下次打开标签页（关闭所有同域标签）后生效

## 九、调试

浏览器 DevTools：
- **Application → Service Workers**：查看 SW 状态、更新、注销
- **Application → Manifest**：查看 manifest 配置和图标
- **Application → Cache Storage**：查看预缓存的资源列表
- **Network**：勾选 "Offline" 测试离线行为

## 十、参考实现

- [posecraft/vite.config.ts](../../posecraft/vite.config.ts) — SPA + 大文件排除（AI 模型不预缓存）
- [oauth21/public/sw.js](../../oauth21/public/sw.js) — **移除时的自毁迁移脚本**（不是功能代码，见第六节）
- [vite-plugin-pwa 文档](https://vite-pwa-org.netlify.app/)

## 十一、新建前端项目检查清单

新建 Vue 3 + Vite 前端项目时，**先过第一节的适用场景判断**，确认适合再按本规范启用 PWA：

- [ ] **适用场景确认**：这个页面会是用户反复冷启的入口吗？（纯登录页 / 授权页 → **不要启用**）
- [ ] `npm install -D vite-plugin-pwa`
- [ ] vite.config.ts 加 `VitePWA({...})`，base 与 manifest.scope/start_url 对齐
- [ ] public/ 放 pwa-192x192.png + pwa-512x512.png
- [ ] manifest 配置 name/short_name/theme_color/display/icons
- [ ] workbox 配置 globPatterns + navigateFallback（如有 SPA 路由 + API/大文件）
- [ ] `npx vite build` 验证 PWA 输出（sw.js + manifest.webmanifest + precache entries）
- [ ] 浏览器 DevTools 检查 SW 注册和离线行为
