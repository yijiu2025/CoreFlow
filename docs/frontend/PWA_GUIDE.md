# PWA 接入规范（前端项目通用）

> 适用于所有 Vue 3 + Vite 前端项目。新建前端项目时按本规范启用 PWA。
> 现有项目（posecraft、oauth21）已参考本规范集成。

## 一、为什么用 PWA

PWA（渐进式 Web 应用）让网站能像原生 App 一样：

1. **可安装到主屏幕**（手机/桌面），启动图标、全屏体验、无浏览器地址栏
2. **离线访问**——Service Worker 预缓存静态资源，断网时仍能打开页面 UI
3. **自动更新**——新版本上线，用户下次访问自动拿到最新资源

适用场景：内容型应用（posecraft 之类）、用户高频访问的工具页。**不适用**：纯登录页（oauth21 用完即走，安装价值低）。

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

## 六、构建验证

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

## 七、部署注意事项

1. **HTTPS 必须**：SW 仅在 HTTPS（localhost 除外）下注册。生产环境必须 HTTPS。
2. **Service-Worker-Allowed 头**：如果 SW 不在根目录，后端需返回 `Service-Worker-Allowed: /` 头允许作用域扩展（通常不需）
3. **首次访问需联网**：SW 注册 + 资源预缓存需要首次在线访问
4. **更新延迟**：`autoUpdate` 模式下，新版本在用户下次打开标签页（关闭所有同域标签）后生效

## 八、调试

浏览器 DevTools：
- **Application → Service Workers**：查看 SW 状态、更新、注销
- **Application → Manifest**：查看 manifest 配置和图标
- **Application → Cache Storage**：查看预缓存的资源列表
- **Network**：勾选 "Offline" 测试离线行为

## 九、参考实现

- [posecraft/vite.config.ts](../../posecraft/vite.config.ts) — SPA + 大文件排除（AI 模型不预缓存）
- [oauth21/vite.config.js](../../oauth21/vite.config.js) — 登录页简单启用
- [vite-plugin-pwa 文档](https://vite-pwa-org.netlify.app/)

## 十、新建前端项目检查清单

新建 Vue 3 + Vite 前端项目时，按本规范启用 PWA：

- [ ] `npm install -D vite-plugin-pwa`
- [ ] vite.config.ts 加 `VitePWA({...})`，base 与 manifest.scope/start_url 对齐
- [ ] public/ 放 pwa-192x192.png + pwa-512x512.png
- [ ] manifest 配置 name/short_name/theme_color/display/icons
- [ ] workbox 配置 globPatterns + navigateFallback（如有 SPA 路由 + API/大文件）
- [ ] `npx vite build` 验证 PWA 输出（sw.js + manifest.webmanifest + precache entries）
- [ ] 浏览器 DevTools 检查 SW 注册和离线行为
