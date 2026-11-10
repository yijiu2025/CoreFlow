<script setup lang="ts">
/**
 * 登录页 —— **业务容器**（不含任何版式）
 *
 * 这里只做四件事，具体长什么样交给主题包里的版式组件：
 *   1. 驱动 iframe SSO 握手（`useSsoLogin`：origin/source 校验、设备归一、绑会话）
 *   2. 成功后拉用户与菜单并跳转（含 `?redirect=` 回跳）
 *   3. 把「加载中 / 忙碌 / 失败 / 无权限」算成一组**结论**交给版式（版式不做判断）
 *   4. 提供 iframe 元素回绑入口（元素在版式里，`event.source` 校验在容器里）
 *
 * 版式选择规则与全站一致（skinsuite 的 pick）：
 *   `?th[_<设备>]` > 包/配色声明的 `views.login` > 当前主题包名
 * 于是 `?th=spotlight` 换版式、`?th_color=black` 换配色 —— 与 oauth21 同一套开关。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ThemeView } from 'skinsuite/vue';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useSsoLogin } from '@/composables/useSsoLogin';
import type { LoginViewContext } from '@/theme/views/login';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
/**
 * 设备身份：**挂载时定格**，不跟视口变化
 *
 * 版式目录按它查找（`themes/<包>/<设备>/login/index.vue`），而 `<ThemeView>` 在
 * device 变化时会换版式组件 —— 组件换 = 重挂载 = **iframe 被重建**：
 * SSO 要重新握手，用户已经输入的账号/验证码、扫码状态、授权确认页全丢。
 * 实测：把窗口从 1440 拖到 800（跨 820px 断点）会多出一次 `/mini-login` 请求，
 * 拖回来再多一次 —— 拖几下就重载几次。
 *
 * 登录页的版式本身是响应式的（宽度断点自己处理布局），device 只影响「加载哪个版式
 * 文件」与「用哪套配色」；本仓两套设备的配色是同一份色值（都展开 `theme/palette.ts`），
 * 所以定格没有视觉代价。需要真机版时用 `?device=mobile` 锁定（本来就是常量）。
 */
const device = ref(useRenderDevice().value);

const { iframeRef, loading, errorMessage, busy, denied, loginUrl, reload, onIframeLoad } = useSsoLogin(async () => {
  const ok = await auth.load(true);
  if (!ok) throw new Error('会话已建立，但读取用户信息失败');
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
  await router.replace(redirect);
});

/**
 * 交给版式的上下文
 *
 * 用 getter 而不是快照：版式里读到的永远是**当前值**，状态推进（加载 → 登录中 → 失败）
 * 会立刻反映到界面；传普通对象的话，版式拿到的只是首次渲染时的那一份。
 */
const ctx = reactive<LoginViewContext>({
  get loading() {
    return loading.value;
  },
  get busy() {
    return busy.value;
  },
  get errorMessage() {
    return errorMessage.value;
  },
  get denied() {
    return denied.value;
  },
  get loginUrl() {
    return loginUrl.value;
  },
  isDev: import.meta.env.DEV,
  bindIframe(el: unknown) {
    iframeRef.value = (el as HTMLIFrameElement | null) ?? null;
  },
  onIframeLoad,
  reload
});
</script>

<template>
  <!-- 设备身份即「去哪个目录找版式」；版式内部只渲染 ctx -->
  <ThemeView page="login" :device="device" :ctx="ctx" />
</template>
