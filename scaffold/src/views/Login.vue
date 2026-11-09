<script setup lang="ts">
/**
 * 登录页：iframe 嵌 oauth21 `/mini-login`
 *
 * 不在本页实现账号密码表单 —— 认证由 oauth21 统一承担（单一认证入口），
 * console 只负责「拿会话、绑定 Cookie、拉权限」。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { useRoute, useRouter } from 'vue-router';
import { ShieldCheck, Loader2 } from 'lucide-vue-next';
import { ThemeScope } from 'skinsuite/vue';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/view/useRenderDevice';
import { useSsoLogin } from '@/composables/useSsoLogin';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
/** 登录页独立页面域（page=login）：配色与后台壳分开，见 theme/views/login.ts */
const device = useRenderDevice();

const { iframeRef, loading, errorMessage, busy, loginUrl, onIframeLoad } = useSsoLogin(async () => {
  const ok = await auth.load(true);
  if (!ok) throw new Error('会话已建立，但读取用户信息失败');
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
  await router.replace(redirect);
});
</script>

<template>
  <ThemeScope page="login" :device="device">
    <div class="login">
    <section class="login__brand">
      <div class="login__mark">C</div>
      <h1 class="login__title">管理后台</h1>
      <p class="login__desc">
        统一身份认证由 oauth21 提供：登录成功后本应用只保存会话 Cookie，不接触任何密码凭证。
      </p>

      <ul class="login__points">
        <li><ShieldCheck :size="15" /> PBAC 权限：接口级放行由后端判定</li>
        <li><ShieldCheck :size="15" /> 设备身份：登录即归一，后续请求自动携带</li>
        <li><ShieldCheck :size="15" /> 审计留痕：登录与操作分别落库</li>
      </ul>
    </section>

    <section class="login__card">
      <header class="login__card-head">
        <span>账号登录</span>
        <span class="login__hint">如未显示，请检查 SSO 服务是否已启动</span>
      </header>

      <div class="login__frame">
        <iframe
          ref="iframeRef"
          :src="loginUrl"
          class="login__iframe"
          title="统一身份认证"
          allow="payment"
          @load="onIframeLoad"
        ></iframe>

        <div v-if="loading || busy" class="login__mask">
          <Loader2 class="spin" :size="22" />
          <span>{{ busy ? '正在建立会话…' : '正在加载安全登录…' }}</span>
        </div>
      </div>

      <p v-if="errorMessage" class="login__error">{{ errorMessage }}</p>
    </section>
    </div>
  </ThemeScope>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 48px;
  padding: 48px clamp(24px, 6vw, 96px);
  background:
    radial-gradient(1000px 520px at 12% -10%, var(--mauth-primary-soft), transparent 60%),
    radial-gradient(700px 420px at 92% 108%, var(--leaf-soft), transparent 62%), var(--mauth-bg);
}

.login__brand {
  max-width: 480px;
}

.login__mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(145deg, var(--mauth-primary), #164fb8);
  color: #fff;
  font-weight: 700;
  margin-bottom: 18px;
}

.login__title {
  font-size: 30px;
  letter-spacing: -0.01em;
  margin-bottom: 10px;
}

.login__desc {
  color: var(--mauth-text-mid);
  font-size: 14px;
  line-height: 1.7;
}

.login__points {
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
  color: var(--mauth-text-mid);
  font-size: 13px;
}

.login__points li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.login__card {
  width: min(880px, 92vw);
  background: var(--mauth-surface);
  border: 1px solid var(--mauth-border);
  border-radius: var(--r-lg);
  box-shadow: var(--e3);
  overflow: hidden;
}

.login__card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--mauth-border);
  font-weight: 600;
}

.login__hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--mauth-text-faint);
}

.login__frame {
  position: relative;
  height: 520px;
  background: var(--mauth-surface-2);
}

.login__iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.login__mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  gap: 10px;
  align-content: center;
  background: color-mix(in srgb, var(--mauth-surface) 86%, transparent);
  color: var(--mauth-text-mid);
  font-size: 13px;
  backdrop-filter: blur(3px);
}

.login__error {
  padding: 12px 20px;
  border-top: 1px solid var(--mauth-border);
  color: var(--mauth-danger);
  font-size: 13px;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .login {
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 28px 18px 40px;
  }

  .login__brand {
    max-width: none;
  }

  .login__frame {
    height: 460px;
  }
}
</style>
