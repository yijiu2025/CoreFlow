/**
 * 主题域清单 —— **主题机制自己的配置**
 *
 * 与 oauth21 同构：住在主题根目录（`VITE_THEME_DIR`，本仓 `src/theme`）下，
 * 与 `themes/`（主题包）、`views/`（页面域声明）平级。
 *
 * 本文件只回答一件事：调试面板什么时候出现（`?debug=theme` 才挂载）。
 * 其余全部由机制推导：
 *   · 有哪些设备 → `src/views/device/devices.ts`（宿主事实，注入 store）
 *   · 有哪些页面 → `src/theme/views/<page>.ts`（`defineThemePage` 声明即注册）
 *   · 有哪些配色 → `themes/<包>/<设备>/<页面>/colors/` 目录结构（扫出来的）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { defineThemeManifest } from 'skinsuite';

export default defineThemeManifest({
  /**
   * `url` 档：真机上排查「这个账号配色不对」时能直接 `?debug=theme` 打开面板，
   * 又不像 `always` 那样给每个访客多下一块面板（不带参数时面板主体不下载）。
   */
  debug: { enabled: 'url', query: 'debug', value: 'theme' }
});
