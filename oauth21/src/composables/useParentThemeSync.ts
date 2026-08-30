/**
 * 监听父应用主题同步（iframe 嵌入场景）
 *
 * 父应用（posecraft/firewall）切主题时，通过 postMessage 通知子应用（oauth21 iframe）
 * 同步切换，解决 iframe 隔离导致父子主题不同步问题。
 *
 * 消息协议：
 *   { type: 'THEME_CHANGE', isDark: boolean }
 *   { type: 'THEME_REQUEST' }  // 父应用加载时请求子应用当前主题（可选）
 *
 * 安全：校验 message.origin 在白名单内（与 postToParent 共享白名单），防恶意页面伪造。
 *
 * 用法：在 App.vue 或 main.ts 调 useParentThemeSync()，自动监听 + 卸载清理。
 *
 * 父应用侧示例（posecraft/firewall）：
 *   // 切主题时通知所有 oauth21 iframe
 *   function syncThemeToIframes(isDark: boolean) {
 *     const oauth21Origin = 'http://localhost:5174'; // oauth21 前端 origin
 *     document.querySelectorAll('iframe').forEach(iframe => {
 *       iframe.contentWindow?.postMessage({ type: 'THEME_CHANGE', isDark }, oauth21Origin);
 *     });
 *   }
 *   // iframe 加载完成时也发一次（初始同步）
 *   iframe.addEventListener('load', () => syncThemeToIframes(themeStore.isDark));
 *
 * @author yijiu2025
 * @since 2026-08-30
 */
import { onMounted, onUnmounted } from 'vue';
import { useThemeStore } from '@/stores/theme';

/** 受信父应用 origin 白名单（与 parent.ts 共享，env 配置逗号分隔） */
const ALLOWED_PARENT_ORIGINS = (
  (import.meta as any).env?.VITE_ALLOWED_PARENT_ORIGINS ||
  'http://aaa.localhost:5176,http://localhost:5175'
).split(',');

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
    if (!event.origin || !ALLOWED_PARENT_ORIGINS.includes(event.origin)) return;

    const { type, isDark } = event.data || {};
    if (type === 'THEME_CHANGE' && typeof isDark === 'boolean') {
      themeStore.applyTheme(isDark);
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage);
  });

  onUnmounted(() => {
    window.removeEventListener('message', handleMessage);
  });
}
