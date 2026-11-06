<script setup lang="ts">
/**
 * 第三方人机验证组件挂载器（Turnstile / hCaptcha / reCAPTCHA）
 *
 * 三家协议的渲染接口几乎一样（都是 `global.render(el, { sitekey, callback })`），
 * 差别只在脚本地址与全局对象名 —— 那两个坐标在 `widget-providers.ts`，
 * 这里只负责"挂上去 / 拿 token / 卸下来"。
 *
 * 三件必须做对的事：
 *   1. **脚本只加载一次**（`loadWidgetScript` 里按 URL 去重）；
 *   2. **加载失败要明确报错**：国内网络下 `challenges.cloudflare.com` 可能根本连不上，
 *      静默失败 = 用户对着一个空白盒子等（正是"页面不动"那类事故的形态）；
 *   3. **卸载要清理**：不 `remove` 会留下监听与 iframe，重试几次就是内存泄漏。
 *
 * ⚠️ 本组件**不参与任何安全判定**：token 只是上游给的凭证，是否放行由服务端调上游校验。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { WIDGET_SPECS, loadWidgetScript, widgetApi, type WidgetProvider } from './widget-providers';

const props = withDefaults(
  defineProps<{
    /** 服务端下发的验证方式 */
    provider: WidgetProvider;
    /** 服务端下发的站点密钥（公开值） */
    siteKey: string;
    /** 覆盖脚本地址（国内反代 / 私有化部署用）；空 = 用官方地址 */
    scriptSrc?: string;
    /** 主题（Turnstile 支持 auto/light/dark） */
    theme?: 'auto' | 'light' | 'dark';
  }>(),
  { scriptSrc: '', theme: 'auto' }
);

const emit = defineEmits<{
  /** 拿到 token（一次性，交给服务端校验） */
  verified: [token: string];
  /** 组件本身出错（脚本加载失败 / 上游报错 / token 过期） */
  error: [reason: string];
}>();

const boxEl = ref<HTMLElement | null>(null);
/** 当前 widget 实例句柄（卸载时用） */
let widgetId: string | number | null = null;
let disposed = false;

/** 渲染 widget */
async function mount(): Promise<void> {
  if (disposed || !boxEl.value || !props.siteKey) return;

  const spec = WIDGET_SPECS[props.provider];
  if (!spec) {
    emit('error', 'unsupported_provider');
    return;
  }

  try {
    await loadWidgetScript(props.scriptSrc || spec.scriptSrc);
  } catch {
    emit('error', 'widget_script_load_failed');
    return;
  }
  if (disposed) return;

  const api = widgetApi(spec.globalName);
  if (!api || typeof api.render !== 'function') {
    emit('error', 'widget_unavailable');
    return;
  }

  try {
    widgetId = api.render(boxEl.value, {
      sitekey: props.siteKey,
      theme: props.theme,
      callback: (token: string) => {
        if (!disposed) emit('verified', token);
      },
      'error-callback': () => {
        if (!disposed) emit('error', 'widget_error');
      },
      'expired-callback': () => {
        if (!disposed) emit('error', 'widget_expired');
      }
    }) as string | number;
  } catch {
    emit('error', 'widget_render_failed');
  }
}

/** 卸载 widget（不留监听与 iframe） */
function unmount(): void {
  const spec = WIDGET_SPECS[props.provider];
  if (!spec || widgetId === null) return;
  const api = widgetApi(spec.globalName);
  if (api && typeof api.remove === 'function') {
    try {
      api.remove(widgetId);
    } catch {
      // 上游已自行销毁时 remove 会抛，忽略即可
    }
  }
  widgetId = null;
}

onMounted(() => void mount());
// provider / siteKey 变化（重试会重新签发）→ 重挂
watch(
  () => [props.provider, props.siteKey, props.scriptSrc],
  () => {
    unmount();
    void mount();
  }
);
onBeforeUnmount(() => {
  disposed = true;
  unmount();
});
</script>

<template>
  <div class="fwc-widget">
    <div ref="boxEl" class="fwc-widget__box"></div>
    <p v-if="!siteKey" class="fwc-widget__hint">后端未下发 siteKey，无法渲染验证组件</p>
  </div>
</template>

<style scoped>
.fwc-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.fwc-widget__box {
  min-height: 65px;
}

.fwc-widget__hint {
  margin: 0;
  font-size: 0.75rem;
  color: #f87171;
}
</style>
