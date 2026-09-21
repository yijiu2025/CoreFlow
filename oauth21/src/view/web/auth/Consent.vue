<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- 后端 OAuth 响应字段动态，any 合理 */
/**
 * 独立授权确认页（全屏可直达：/consent?...）
 *
 * 覆盖两种授权来源（历史上这里只有一半逻辑、且存在语法错误导致整个文件不可用）：
 *  1. authorize 流：守卫/api 授权时带 session_id + user_id
 *     → POST /oauth2.1/authorize/consent（同 Authorize.vue），后端返回校验过的 redirect_url
 *  2. login 流：登录响应 action=consent 时带 consent_key
 *     → POST /oauth2.1/login/consent/confirm，成功后按登录成功处理（父窗口 or 回跳）
 *
 * iframe 内不自行跳转（交给父窗口），全屏直连时按 ?redirect= 原路返回。
 *
 * @author yijiu2025
 * @since 2026-09-20 重写：修重复声明 / 只读 computed 赋值 / 未定义 startCountdown，并支持移动端
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { authApi } from '@/api/auth';
import { postToParent } from '@/utils/parent';
import { sanitizeLocalRedirect } from '@/utils/redirect';
import { useDeviceDetect } from '@/composables/useDeviceDetect';
import { useMessage } from '@/composables/useMessage';
import { useThemeStore } from '@/stores/theme';
import ConsentPanel from '@/components/auth/ConsentPanel.vue';
import MessageToast from '@/components/common/MessageToast.vue';

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const { error: showError } = useMessage();
const themeStore = useThemeStore();

// 响应式设备形态：窄屏压缩间距
const { isMobileDevice } = useDeviceDetect();

const submitting = ref(false);
const done = ref(false);
const errorMsg = ref('');

/** iframe 嵌入检测：嵌入时由父窗口接管跳转与通知 */
const inIframe = computed(() => !!window.parent && window.parent !== window);
const notLoadSsoView = computed(() => route.query.notLoadSsoView === 'true');
const shouldSendSSOMessage = computed(() => !notLoadSsoView.value && inIframe.value);

// 应用展示名
const clientName = computed(
  () =>
    (route.query.client_name as string) ||
    (route.query.appName as string) ||
    (route.query.client_id as string) ||
    t('login.third_party')
);

// 两种授权来源的凭据
const consentKey = computed(() => (route.query.consent_key as string) || (route.query.consentKey as string) || '');
const sessionId = computed(() => (route.query.session_id as string) || (route.query.sessionId as string) || '');
const userId = computed(() => (route.query.user_id as string) || '');
/** authorize 流优先：带 session_id 才算授权流 */
const isAuthorizeFlow = computed(() => !!sessionId.value);
/** 凭据是否齐全（全屏直接打开 /consent 而不带凭据时给出友好提示） */
const paramsMissing = computed(() => !isAuthorizeFlow.value && !consentKey.value);

/**
 * 权限明细：优先取 query 里父应用透传的 scope_details(JSON)，
 * 否则退化为按 scope 字符串（空格/逗号分隔）只显示权限名，不编造描述。
 */
const scopeDetails = computed<Array<{ id: string; name: string; desc: string; required?: boolean }>>(() => {
  const raw = route.query.scope_details;
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((s: any, i: number) => ({
          id: String(s?.id ?? s?.name ?? i),
          name: String(s?.name ?? s?.id ?? ''),
          desc: String(s?.desc ?? ''),
          required: !!s?.required
        }));
      }
    } catch {
      // 解析失败按无描述处理，不阻塞授权
    }
  }
  const scopeStr = (route.query.scope as string) || '';
  return scopeStr
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(name => ({ id: name, name, desc: '' }));
});

const consentState = computed(() => ({
  consentKey: consentKey.value,
  client_name: clientName.value,
  scopeDetails: scopeDetails.value
}));

/** 取后端校验过的跳转地址（不直接用 query.redirect_uri，防开放重定向） */
function pickRedirectUrl(res: any): string | undefined {
  return res?.redirect_url || res?.data?.redirect_url;
}

/** 登录流授权成功后收尾：iframe 通知父窗口；全屏按 ?redirect= 回跳或返回 */
function finishLoginConsent(res: unknown) {
  if (inIframe.value) {
    postToParent({ type: 'LOGIN_SUCCESS', data: res });
    return;
  }
  const target = sanitizeLocalRedirect(route.query.redirect);
  if (target) {
    window.location.replace(target);
  } else {
    done.value = true;
  }
}

/** 同意授权 */
const approve = async () => {
  if (submitting.value || paramsMissing.value) return;
  submitting.value = true;
  try {
    if (isAuthorizeFlow.value) {
      const res: any = await authApi.authorizeConsent({
        sessionId: sessionId.value,
        user_id: userId.value,
        action: 'approve'
      });
      const redirectUrl = pickRedirectUrl(res);
      if (redirectUrl) window.location.href = redirectUrl;
      else showError(t('auth.redirect_missing'));
    } else {
      const res = await authApi.confirmConsent(consentKey.value);
      finishLoginConsent(res);
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : t('login.consent_failed');
    showError(errorMsg.value);
  } finally {
    submitting.value = false;
  }
};

/** 拒绝授权 */
const deny = async () => {
  if (submitting.value) return;
  submitting.value = true;
  try {
    if (isAuthorizeFlow.value) {
      const res: any = await authApi.authorizeConsent({
        sessionId: sessionId.value,
        user_id: userId.value,
        action: 'deny'
      });
      const redirectUrl = pickRedirectUrl(res);
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
    }
    // 登录流 / 拿不到跳转地址：iframe 通知父窗口拒绝，全屏退回上一页
    if (shouldSendSSOMessage.value) {
      postToParent({ type: 'SSO_DENIED', error: 'user_denied', description: t('login.consent_denied') });
    }
    if (window.history.length > 1) router.back();
    else router.replace('/login');
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('login.consent_failed'));
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  // 语言 / 主题跟随父应用透传
  const lang = route.query.lang as string;
  if (lang) locale.value = lang;
  const theme = route.query.theme as string;
  if (theme === 'dark' || theme === 'light') {
    themeStore.applyTheme(theme === 'dark');
  }
  if (shouldSendSSOMessage.value) {
    postToParent({ type: 'SSO_READY' });
  }
});
</script>

<template>
  <div class="consent-viewport" :class="{ 'is-mobile': isMobileDevice }">
    <div class="consent-card animate-fade-in">
      <!-- 完成态（登录流无回跳目标时的收尾提示） -->
      <div v-if="done" class="consent-state">
        <div class="state-icon state-icon-success">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h1 class="state-title">{{ t('login.consent_title') }}</h1>
        <p class="state-desc">{{ t('auth.consent_done_desc') }}</p>
      </div>

      <!-- 缺凭据（全屏直接打开 /consent） -->
      <div v-else-if="paramsMissing" class="consent-state">
        <div class="state-icon state-icon-warn">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h1 class="state-title">{{ t('auth.params_missing_title') }}</h1>
        <p class="state-desc">{{ t('auth.consent_missing_desc') }}</p>
      </div>

      <!-- 授权确认 -->
      <template v-else>
        <header class="consent-head">
          <div class="head-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
            </svg>
          </div>
          <h1 class="consent-title">{{ t('login.consent_title') }}</h1>
          <p class="consent-sub">{{ t('login.consent_desc', { app: clientName }) }}</p>
        </header>

        <ConsentPanel
          :consent-state="consentState"
          :submitting="submitting"
          :on-deny="deny"
          :on-approve="approve"
        />

        <p class="consent-foot">{{ t('auth.consent_footer_hint') }}</p>
      </template>
    </div>

    <MessageToast />
  </div>
</template>

<style scoped>
.consent-viewport {
  /* dvh 防移动端地址栏收放导致内容被裁；100vh 兜底 */
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, #f1f5f9 100%);
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

:global(.dark) .consent-viewport {
  background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%);
}

.consent-card {
  width: 100%;
  max-width: 440px;
  margin: auto;
  background: #ffffff;
  border-radius: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.12);
  padding: 24px 20px;
  box-sizing: border-box;
}

:global(.dark) .consent-card {
  background: #1e293b;
  border-color: #334155;
}

@media (min-width: 640px) {
  .consent-card {
    border-radius: 32px;
    padding: 32px;
  }
}

/* 头部 */
.consent-head {
  text-align: center;
  margin-bottom: 20px;
}

.head-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.25);
}

.consent-title {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 6px;
  letter-spacing: -0.01em;
}

:global(.dark) .consent-title {
  color: #f1f5f9;
}

.consent-sub {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
}

.consent-foot {
  margin-top: 18px;
  text-align: center;
  font-size: 10px;
  line-height: 1.6;
  color: #94a3b8;
}

/* 状态块（完成 / 缺参） */
.consent-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 12px;
}

.state-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.state-icon-success {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.state-icon-warn {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.state-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px;
}

:global(.dark) .state-title {
  color: #f1f5f9;
}

.state-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
  margin: 0;
}

/* 入场动画 */
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.4s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in {
    animation: none;
  }
}
</style>
