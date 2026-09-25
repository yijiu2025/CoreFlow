<script setup lang="ts">
/**
 * 登录页 · **mini 设备**版式（iframe 弹窗单栏卡片）
 *
 * 2026-09-25 起 mini 是独立设备（与 mobile / standard 并列，`THEME_DEVICES` 三值），
 * 本文件因此住在 `themes/<包>/mini/login/`，配色也独立成套（`mini/login/colors/`）。
 * 由容器 `view/web/login/MiniLogin.vue` 静态引入。
 * 版式只读 `ctx`、只调 `ctx.actions`。
 *
 * @author yijiu2025
 */
import { computed, toRef } from 'vue';
import AuthContainer from '@/components/common/AuthContainer.vue';
import ConsentPanel from '@/components/auth/ConsentPanel.vue';
import PasswordInput from '@/components/common/PasswordInput.vue';
import Icons from '@/components/common/Icons.vue';
import AppNameMissing from '@/components/common/AppNameMissing.vue';
import type { LoginViewProps } from '@/theme/views/login';

const props = defineProps<LoginViewProps>();
const ctx = toRef(props, 'ctx');

const consentOpen = computed(() => ctx.value.panel === 'consent');
const emailVerifyOpen = computed(() => ctx.value.panel === 'emailVerify');
</script>

<template>
  <div class="mini-login-root w-full h-full" :class="{ dark: ctx.isDark }">
    <AppNameMissing v-if="!ctx.hasAppName" />
    <AuthContainer
      v-else
      :appName="ctx.appName"
      :isMobile="false"
    >
      <template #header>
        <h2 class="text-xl font-bold dark:text-white leading-tight">
          {{ consentOpen ? ctx.t('login.consent_title') : ctx.showQr ? ctx.t('login.qr_title') : ctx.t('login.welcome') }}
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          {{
            consentOpen
              ? ctx.t('login.consent_desc', { app: ctx.consentState?.client_name || ctx.t('login.third_party') })
              : ctx.showQr
                ? ctx.t('login.qr_desc')
                : ctx.t('login.fill_credentials')
          }}
        </p>
      </template>

      <!-- 扫码/表单切换按钮（授权确认时不显示） -->
      <template #header-extra v-if="!consentOpen">
        <button
          type="button"
          @click="ctx.actions.toggleQr()"
          class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/80 text-slate-400 hover:text-[#2563eb] transition-all border border-slate-100 dark:border-slate-800"
          :title="ctx.showQr ? ctx.t('login.qr_title') : ctx.t('login.welcome')"
        >
          <svg v-if="!ctx.showQr" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </button>
      </template>

      <!-- 二维码面板 -->
      <div v-if="ctx.showQr && !consentOpen" class="qr-container flex flex-col items-center justify-center flex-1 py-4">
        <div
          class="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative group overflow-hidden cursor-pointer"
          :class="{ 'border-rose-300': ctx.qrStatus === 'expired' }"
          @click="ctx.qrStatus === 'expired' && ctx.actions.generateQr()"
        >
          <div class="absolute top-0 left-0 w-full h-[2px] bg-[#2563eb] blur-[2px] animate-scan z-10" v-if="ctx.qrStatus !== 'expired'"></div>
          <img
            v-if="ctx.qrDataUrl"
            :src="ctx.qrDataUrl"
            class="w-40 h-40 transition-opacity"
            :class="ctx.qrStatus === 'expired' ? 'opacity-30' : 'opacity-90 group-hover:opacity-100'"
          />
          <div v-else class="w-40 h-40 flex items-center justify-center">
            <div class="w-8 h-8 border-2 border-slate-200 border-t-[#2563eb] rounded-full animate-spin"></div>
          </div>
          <div
            v-if="ctx.qrStatus === 'expired'"
            class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/60 dark:bg-slate-900/60"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" class="text-rose-500">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            <span class="text-xs font-medium text-rose-500">点击刷新</span>
          </div>
        </div>
        <p class="mt-6 text-xs text-slate-500 text-center">
          {{ ctx.t('login.qr_scan_hint', { app: ctx.appName }) }}
        </p>
      </div>

      <!-- 授权确认面板 -->
      <ConsentPanel
        v-else-if="consentOpen"
        :consent-state="ctx.consentState ?? undefined"
        :submitting="ctx.consentSubmitting"
        :on-deny="ctx.actions.denyConsent"
        :on-approve="ctx.actions.approveConsent"
      />

      <!-- 邮箱二次验证 -->
      <div v-else-if="emailVerifyOpen" class="flex-1 flex flex-col justify-center py-2 space-y-4 w-full">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 mx-auto rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" stroke-width="2">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <h3 class="text-sm font-bold dark:text-white">环境变更验证</h3>
          <p class="text-xs text-slate-400">检测到{{ ctx.emailVerifyState?.reason }}，为保护账号安全，请验证邮箱</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">验证码已发送至 <strong>{{ ctx.emailVerifyState?.email }}</strong></p>
        </div>

        <div class="mlogin-field">
          <Icons name="mail" :size="18" class="mlogin-icon" />
          <input
            v-model="ctx.emailVerifyCode"
            type="text"
            maxlength="6"
            placeholder="邮箱验证码"
            class="mlogin-input"
            @keyup.enter="ctx.actions.submitEmailVerify()"
          />
        </div>

        <div class="flex items-center justify-between text-xs">
          <button type="button" @click="ctx.actions.sendEmailVerifyCode()" :disabled="ctx.emailVerifyCountingDown"
            class="text-[#2563eb] disabled:text-slate-400 disabled:cursor-not-allowed font-medium">
            {{ ctx.emailVerifyCountingDown ? `${ctx.emailVerifyCountdown}s 后重发` : '重新发送验证码' }}
          </button>
        </div>

        <button type="button" @click="ctx.actions.submitEmailVerify()" class="mlogin-submit h-11 text-xs">
          验证并登录
        </button>
      </div>

      <!-- 登录表单 -->
      <form v-else @submit.prevent="ctx.actions.submit()" class="form-container flex-1 flex flex-col justify-center mt-3">
        <!-- 登录类型 Tab -->
        <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 border border-slate-200/60 dark:border-slate-700/60">
          <button
            type="button"
            @click="ctx.actions.switchMode('email')"
            :class="ctx.mode === 'email' ? 'bg-white dark:bg-slate-700 text-[#2563eb] shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-slate-300'"
            class="flex-1 py-2 text-sm rounded-lg transition-all"
          >
            {{ ctx.t('login.email_login') }}
          </button>
          <button
            type="button"
            @click="ctx.actions.switchMode('pwd')"
            :class="ctx.mode === 'pwd' ? 'bg-white dark:bg-slate-700 text-[#2563eb] shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-slate-300'"
            class="flex-1 py-2 text-sm rounded-lg transition-all"
          >
            {{ ctx.t('login.password_login') }}
          </button>
        </div>

        <!-- 字段 1：邮箱/账号 -->
        <div class="mlogin-cell">
          <div class="mlogin-field" :class="{ 'is-error': ctx.fields.email.invalid || ctx.fields.username.invalid }">
            <Icons v-if="ctx.mode === 'email'" name="mail" :size="18" class="mlogin-icon" />
            <Icons v-else name="user" :size="18" class="mlogin-icon" />
            <input
              v-if="ctx.mode === 'email'"
              v-model="ctx.fields.email.value"
              v-bind="ctx.fields.email.attrs"
              type="email"
              :placeholder="ctx.t('login.email_placeholder')"
              autocomplete="username"
              class="mlogin-input"
            />
            <input
              v-else
              v-model="ctx.fields.username.value"
              v-bind="ctx.fields.username.attrs"
              type="text"
              :placeholder="ctx.t('login.username_placeholder')"
              autocomplete="username"
              class="mlogin-input"
            />
          </div>
          <div class="mlogin-err">{{ ctx.fields.email.error || ctx.fields.username.error }}</div>
        </div>

        <!-- 字段 2：验证码/密码 -->
        <div class="mlogin-cell">
          <div v-if="ctx.mode === 'email'" class="mlogin-field" :class="{ 'is-error': ctx.fields.code.invalid }">
            <input
              v-model="ctx.fields.code.value"
              v-bind="ctx.fields.code.attrs"
              type="text"
              :placeholder="ctx.t('login.code_placeholder')"
              autocomplete="one-time-code"
              class="mlogin-input"
            />
            <button
              type="button"
              @click="ctx.actions.sendCode()"
              :disabled="ctx.countingDown"
              class="mlogin-code-btn"
            >
              {{ ctx.countingDown ? `${ctx.countdown}s` : ctx.t('login.get_code') }}
            </button>
          </div>
          <PasswordInput
            v-else
            v-model="ctx.fields.password.value"
            :has-error="ctx.fields.password.invalid"
            :placeholder="ctx.t('login.password_placeholder')"
            autocomplete="current-password"
            input-class="mlogin-input"
          />
          <div class="mlogin-err">{{ ctx.fields.code.error || ctx.fields.password.error }}</div>
        </div>

        <!-- 提交按钮 -->
        <button type="submit" :disabled="ctx.submitting" class="mlogin-submit flex items-center justify-center gap-2 mt-1">
          <span v-if="ctx.submitting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {{ ctx.submitting ? ctx.t('login.logging_in') : ctx.t('login.submit') }}
        </button>
      </form>

      <!-- 底部控制与跳转插槽 -->
      <template #footer v-if="!consentOpen">
        <div class="flex items-center justify-between pt-1">
          <label class="mlogin-checkbox-label">
            <input type="checkbox" v-model="ctx.keepLogin" class="hidden" />
            <span class="mlogin-checkbox" :class="{ checked: ctx.keepLogin }">
              <svg v-if="ctx.keepLogin" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="text-xs text-slate-400 hover:text-slate-500 transition-colors">{{ ctx.t('login.keep_login') }}</span>
          </label>

          <div class="flex items-center gap-3">
            <a
              href="#"
              @click.stop.prevent="ctx.actions.goForgot()"
              class="text-xs text-slate-400 hover:text-[#2563eb] transition-colors"
            >
              {{ ctx.t('login.forgot_password') }}
            </a>
            <span class="text-slate-300 dark:text-slate-700">|</span>
            <a
              href="#"
              @click.stop.prevent="ctx.actions.goRegister()"
              class="mlogin-highlight-link text-xs font-semibold"
            >
              {{ ctx.t('login.register_now') }}
            </a>
          </div>
        </div>
      </template>
    </AuthContainer>
  </div>
</template>

<style scoped>
.mlogin-cell {
  display: flex;
  flex-direction: column;
}

.mlogin-field {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  gap: 10px;
  background: var(--mauth-field-bg);
  border: 1px solid var(--mauth-field-border);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.mlogin-field:focus-within {
  background: var(--mauth-field-bg-focus);
  border-color: var(--mauth-field-border-focus);
  box-shadow: 0 0 0 3px var(--mauth-focus-ring);
}

.mlogin-field.is-error {
  border-color: var(--mauth-danger);
  background: var(--mauth-danger-bg);
}

.mlogin-icon {
  color: var(--mauth-icon);
  flex-shrink: 0;
}

.mlogin-field:focus-within .mlogin-icon {
  color: var(--mauth-text);
}

.mlogin-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--mauth-text);
  height: 100%;
  min-width: 0;
}

.mlogin-input::placeholder {
  color: var(--mauth-text-faint);
}

.mlogin-code-btn {
  font-size: 12px;
  font-weight: 600;
  padding-left: 12px;
  border-left: 1px solid var(--mauth-field-border);
  color: var(--mauth-accent);
  white-space: nowrap;
  background: transparent;
  border-top: none;
  border-right: none;
  border-bottom: none;
  cursor: pointer;
  transition: color 0.2s;
}

.mlogin-code-btn:hover:not(:disabled) {
  color: var(--mauth-emphasis-fg);
}

.mlogin-code-btn:disabled {
  color: var(--mauth-text-faint) !important;
  cursor: not-allowed;
}

.mlogin-err {
  height: 16px;
  line-height: 16px;
  margin-top: 2px;
  padding-left: 4px;
  font-size: 11px;
  color: var(--mauth-danger);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mlogin-submit {
  height: 44px;
  width: 100%;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--mauth-primary-fg);
  border: none;
  background: var(--mauth-primary);
  box-shadow: var(--mauth-focus-ring);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mlogin-submit:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}

.mlogin-submit:active:not(:disabled) {
  transform: translateY(0);
}

.mlogin-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: saturate(0);
}

.mlogin-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.mlogin-checkbox {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid var(--mauth-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mauth-primary-fg);
  flex-shrink: 0;
  background: var(--mauth-bg);
  transition: all 0.2s;
}

.mlogin-checkbox.checked {
  background: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

.mlogin-highlight-link {
  color: var(--mauth-accent);
  cursor: pointer;
  transition: color 0.2s;
}

.mlogin-highlight-link:hover {
  color: var(--mauth-emphasis-fg);
  text-decoration: underline;
}

/* 二维码扫描动画 */
@keyframes scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

.animate-scan {
  animation: scan 2.5s linear infinite;
}
</style>
