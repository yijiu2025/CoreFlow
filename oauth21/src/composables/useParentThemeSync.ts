/**
 * 监听父应用主题同步（iframe 嵌入场景）
 *
 * 父应用（posecraft/firewall）切主题时，通过 postMessage 通知子应用（oauth21 iframe）
 * 同步切换，解决 iframe 隔离导致父子主题不同步问题。
 *
 * === 消息协议 ===
 *   { type: 'THEME_CHANGE', isDark: boolean }                       // 旧版：只同步明暗
 *   { type: 'THEME_CHANGE', isDark?, theme?, skin?, tokens? }       // 新版：可同时换主题
 *
 * theme  配色 id（须在 src/theme/themes/ 下登记过；skin 是它的旧字段名，两者等价）
 * tokens 一组**扁平**的 CSS 变量覆写表，实现「父应用给子页面定制每个组件的 UI」：
 *          { '--mauth-primary': '#0e7490', '--mauth-radius': '16px' }
 *        ⚠️ 不再接受旧的两档结构 `{ light, dark }`（2026-09-25 取消明暗档）——
 *           配色自带完整底色，与明暗偏好无关。父应用想让深色下换一套色，
 *           请换一个**配色 id**（对应前端已登记的颜色目录）。
 *
 * ⚠️ tokens 的每一项都会过 src/theme/runtime.ts 的白名单校验（token 名 + 取值形态），
 *    不合规的条目被丢弃并告警。父页面虽然是受信来源，但 postMessage 的载荷
 *    在浏览器里终究是外部输入，未校验就写进 CSS 变量等于开了 CSS 注入的口子。
 *    `url()` 这类值一律被拒 —— 所以背景图、字体文件只能由前端主题包提供，
 *    父应用无法让子页面去加载任意外部资源。
 *
 * 安全：校验 message.origin 在白名单内（与 postToParent 共享白名单），防恶意页面伪造。
 *
 * 用法：在 App.vue 或 main.ts 调 useParentThemeSync()，自动监听 + 卸载清理。
 *
 * 父应用侧示例（posecraft/firewall）：
 *   // 切主题时通知所有 oauth21 iframe
 *   function syncThemeToIframes(theme) {
 *     const oauth21Origin = 'http://localhost:5174'; // oauth21 前端 origin
 *     document.querySelectorAll('iframe').forEach(iframe => {
 *       iframe.contentWindow?.postMessage({ type: 'THEME_CHANGE', ...theme }, oauth21Origin);
 *     });
 *   }
 *   // iframe 加载完成时也发一次（初始同步）
 *   iframe.addEventListener('load', () => syncThemeToIframes({ isDark: themeStore.isDark, skin: 'ocean' }));
 *
 * @author yijiu2025
 * @since 2026-08-30
 */
import { onMounted, onUnmounted } from 'vue';
import { useThemeStore } from '@/stores/theme';
import type { ThemeTokenOverrides } from '@/theme/runtime';
import { isAllowedParentOrigin } from '@/utils/parent-origins';

/**
 * 监听父应用主题同步消息
 * 仅在 iframe 嵌入时生效（顶层窗口无父，不监听）
 */
export function useParentThemeSync() {
  const themeStore = useThemeStore();

  function handleMessage(event: MessageEvent) {
    // 顶层窗口无父，忽略（非 iframe 场景）
    if (!(window.parent && window.parent !== window)) return;

    // origin 校验：只接受白名单父应用的消息（防恶意嵌入伪造主题切换）
    if (!isAllowedParentOrigin(event.origin)) return;

    const { type, isDark, theme, skin, tokens } = event.data || {};
    if (type !== 'THEME_CHANGE') return;

    // 明暗：新旧协议都支持
    if (typeof isDark === 'boolean') {
      themeStore.applyTheme(isDark);
    }

    // 主题与组件级覆写：新协议。theme 由 store 校验是否登记过，
    // tokens 由 applyThemeConfig → runtime 逐条白名单校验。
    // skin 是 theme 的旧字段名（历史父应用实现仍能生效）。
    const wantedTheme = typeof theme === 'string' ? theme : typeof skin === 'string' ? skin : undefined;
    if (wantedTheme !== undefined || (tokens && typeof tokens === 'object')) {
      themeStore.applyThemeConfig({
        theme: wantedTheme,
        tokens: (tokens && typeof tokens === 'object' ? tokens : undefined) as ThemeTokenOverrides | undefined
      });
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage);
  });

  onUnmounted(() => {
    window.removeEventListener('message', handleMessage);
  });
}
