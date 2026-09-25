<script setup lang="ts">
/**
 * 重置密码页 · **mini 设备**版式（iframe 弹窗单栏卡片）
 *
 * 2026-09-25 起 mini 是独立设备（与 mobile / standard 并列，`THEME_DEVICES` 三值），
 * 本文件因此住在 `themes/<包>/mini/forgot-password/`，配色也独立成套（`mini/forgot-password/colors/`）。
 * 由容器 `view/web/forgot-password/MiniForgot.vue` 静态引入。
 * 版式只读 `ctx`、只调 `ctx.actions`，禁止出现请求 / 校验 / 路由 / store。
 * 契约见 `theme/views/forgot-password.ts`。
 *
 * 两套步骤由容器给的 `ctx.mode` + `ctx.stage` 决定：
 *   - code 模式 3 步（email → code → done）
 *   - link 模式 4 步（verify → sent → reset → done）
 * 本版式**不自己判断"该不该跳过某步"**（例如带 token 进来时容器已把 stage 置为 reset）。
 *
 * 样式：本组件自带 `<style scoped>`（`mforgot-*` 体系，已 token 化），
 * 与 mobile-auth.scss 的 `mauth-*` 是两套（桌面卡片 vs 移动全屏）。
 *
 * @author yijiu2025
 */
import { toRef } from 'vue';
import AuthContainer from '@/components/common/AuthContainer.vue';
import PasswordInput from '@/components/common/PasswordInput.vue';
import PasswordStrength from '@/components/common/PasswordStrength.vue';
import type { ForgotPasswordViewProps } from '@/theme/views/forgot-password';

const props = defineProps<ForgotPasswordViewProps>();
const ctx = toRef(props, 'ctx');
</script>

<template>
  <div class="mini-forgot-root w-full h-full">
    <AuthContainer :app-name="'Enterprise SSO'">
      <template #header>
        <h2 class="text-xl font-bold dark:text-white leading-tight">{{ ctx.title }}</h2>
        <p class="text-xs text-slate-400 mt-1">{{ ctx.subtitle }}</p>
      </template>

      <!-- ===== 方式一：验证码重置（3 步） ===== -->
      <form v-if="ctx.mode === 'code'" @submit.prevent="ctx.actions.submit()" class="mforgot-form">
        <!-- 步骤 1：输入邮箱 -->
        <div v-if="ctx.stage === 'email'" class="mforgot-step-box">
          <div class="mforgot-cell">
            <div class="mforgot-field" :class="{ 'is-error': ctx.fields.email.invalid }">
              <svg class="mforgot-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input
                v-model="ctx.fields.email.value"
                v-bind="ctx.fields.email.attrs"
                type="email"
                inputmode="email"
                autocomplete="email"
                :placeholder="ctx.t('login.email_placeholder')"
                class="mforgot-input"
                @keyup.enter="ctx.actions.submitEmail()"
              />
            </div>
            <div class="mforgot-err">{{ ctx.fields.email.error }}</div>
          </div>

          <button type="button" class="mforgot-submit" @click="ctx.actions.submitEmail()">
            {{ ctx.t('forgot.send_code') }}
          </button>
        </div>

        <!-- 步骤 2：邮箱验证码 + 新密码 -->
        <div v-else-if="ctx.stage === 'code'" class="mforgot-step-box">
          <div class="mforgot-cell">
            <div class="mforgot-field" :class="{ 'is-error': ctx.fields.code.invalid }">
              <svg class="mforgot-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="ctx.fields.code.value"
                v-bind="ctx.fields.code.attrs"
                type="text"
                inputmode="numeric"
                maxlength="6"
                autocomplete="one-time-code"
                :placeholder="ctx.t('login.code_placeholder')"
                class="mforgot-input"
              />
              <button type="button" :disabled="ctx.countingDown" class="mforgot-code-btn" @click="ctx.actions.resendEmail()">
                {{ ctx.countingDown ? ctx.t('login.code_countdown', { countdown: ctx.countdown }) : ctx.t('forgot.resend') }}
              </button>
            </div>
            <div class="mforgot-err">{{ ctx.fields.code.error }}</div>
          </div>

          <div class="mforgot-cell">
            <PasswordInput
              v-model="ctx.fields.password.value"
              :has-error="ctx.fields.password.invalid"
              :placeholder="ctx.t('forgot.new_password_rule')"
              input-class="mforgot-input"
            />
            <div class="mforgot-err">{{ ctx.fields.password.error }}</div>
            <PasswordStrength :password="ctx.fields.password.value" />
          </div>

          <div class="mforgot-cell">
            <PasswordInput
              v-model="ctx.fields.confirmPassword.value"
              :has-error="ctx.fields.confirmPassword.invalid"
              :placeholder="ctx.t('forgot.confirm_password')"
              input-class="mforgot-input"
              @enter="ctx.actions.submit()"
            />
            <div class="mforgot-err">{{ ctx.fields.confirmPassword.error }}</div>
          </div>

          <button type="submit" class="mforgot-submit" :disabled="ctx.submitting">
            <span v-if="ctx.submitting" class="mforgot-spinner"></span>
            {{ ctx.t('forgot.reset_password') }}
          </button>
        </div>

        <!-- 步骤 3：完成 -->
        <div v-else class="mforgot-step-box">
          <div class="mforgot-panel mforgot-panel--ok">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <p>{{ ctx.t('forgot.success_desc') }}</p>
          </div>
          <button type="button" class="mforgot-submit" @click="ctx.actions.goLogin()">{{ ctx.t('forgot.back_to_login') }}</button>
        </div>
      </form>

      <!-- ===== 方式二：邮件链接重置（4 步） ===== -->
      <form v-else @submit.prevent="ctx.actions.submit()" class="mforgot-form">
        <!-- 步骤 1：验证身份（输入邮箱） -->
        <div v-if="ctx.stage === 'verify'" class="mforgot-step-box">
          <p class="mforgot-desc">{{ ctx.t('forgot.link_desc') }}</p>
          <div class="mforgot-cell">
            <div class="mforgot-field" :class="{ 'is-error': ctx.fields.email.invalid }">
              <svg class="mforgot-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input
                v-model="ctx.fields.email.value"
                v-bind="ctx.fields.email.attrs"
                type="email"
                inputmode="email"
                autocomplete="email"
                :placeholder="ctx.t('login.email_placeholder')"
                class="mforgot-input"
                @keyup.enter="ctx.actions.submitEmail()"
              />
            </div>
            <div class="mforgot-err">{{ ctx.fields.email.error }}</div>
          </div>

          <button type="button" class="mforgot-submit" @click="ctx.actions.submitEmail()">
            {{ ctx.t('forgot.send_link') }}
          </button>
        </div>

        <!-- 步骤 2：已发送 -->
        <div v-else-if="ctx.stage === 'sent'" class="mforgot-step-box">
          <div class="mforgot-panel mforgot-panel--info">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            <p>{{ ctx.t('forgot.link_sent_to') }}</p>
            <p class="mforgot-panel-sub"><strong>{{ ctx.fields.email.value }}</strong></p>
            <p class="mforgot-panel-sub">{{ ctx.t('forgot.link_hint') }}</p>
          </div>

          <button type="button" class="mforgot-resend" :disabled="ctx.countingDown" @click="ctx.actions.resendEmail()">
            {{ ctx.countingDown ? `${ctx.t('forgot.resend')} (${ctx.countdown}s)` : ctx.t('forgot.resend') }}
          </button>
          <button type="button" class="mforgot-submit" @click="ctx.actions.goLogin()">{{ ctx.t('forgot.back_to_login') }}</button>
        </div>

        <!-- 步骤 3：设置新密码（从邮件链接带 token 进入） -->
        <div v-else-if="ctx.stage === 'reset'" class="mforgot-step-box">
          <p class="mforgot-desc">{{ ctx.t('forgot.reset_desc') }}</p>
          <div class="mforgot-cell">
            <PasswordInput
              v-model="ctx.fields.password.value"
              :has-error="ctx.fields.password.invalid"
              :placeholder="ctx.t('forgot.new_password_rule')"
              input-class="mforgot-input"
            />
            <div class="mforgot-err">{{ ctx.fields.password.error }}</div>
            <PasswordStrength :password="ctx.fields.password.value" />
          </div>

          <div class="mforgot-cell">
            <PasswordInput
              v-model="ctx.fields.confirmPassword.value"
              :has-error="ctx.fields.confirmPassword.invalid"
              :placeholder="ctx.t('forgot.confirm_password')"
              input-class="mforgot-input"
              @enter="ctx.actions.submit()"
            />
            <div class="mforgot-err">{{ ctx.fields.confirmPassword.error }}</div>
          </div>

          <button type="submit" class="mforgot-submit" :disabled="ctx.submitting">
            <span v-if="ctx.submitting" class="mforgot-spinner"></span>
            {{ ctx.t('forgot.reset_password') }}
          </button>
        </div>

        <!-- 步骤 4：完成 -->
        <div v-else class="mforgot-step-box">
          <div class="mforgot-panel mforgot-panel--ok">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <p>{{ ctx.t('forgot.success_desc') }}</p>
          </div>
          <button type="button" class="mforgot-submit" @click="ctx.actions.goLogin()">{{ ctx.t('forgot.back_to_login') }}</button>
        </div>
      </form>

      <!-- 底部返回登录 -->
      <template #footer>
        <div class="flex items-center justify-between pt-1">
          <span class="text-xs text-slate-400">{{ ctx.t('forgot.remembered') }}</span>
          <button type="button" @click="ctx.actions.goLogin()" class="mforgot-highlight-link font-medium text-xs">
            {{ ctx.t('forgot.back_to_login') }}
          </button>
        </div>
      </template>
    </AuthContainer>
  </div>
</template>

<style scoped>
/* ================================
   页面根
   ================================ */
.mini-forgot-root {
  width: 100%;
}

/* ================================
   表单布局
   ================================ */
.mforgot-form {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
}

.mforgot-step-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mforgot-cell {
  display: flex;
  flex-direction: column;
}

.mforgot-desc {
  font-size: 12px;
  color: var(--mauth-text-faint);
  margin-bottom: 4px;
}

/* ================================
   输入框样式（token 化）
   ================================ */
.mforgot-field {
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

.mforgot-field:focus-within {
  background: var(--mauth-field-bg-focus);
  border-color: var(--mauth-field-border-focus);
  box-shadow: 0 0 0 3px var(--mauth-focus-ring);
}

.mforgot-field.is-error {
  border-color: var(--mauth-danger);
  background: var(--mauth-danger-bg);
}

.mforgot-icon {
  color: var(--mauth-icon);
  flex-shrink: 0;
  transition: color 0.2s;
}

.mforgot-field:focus-within .mforgot-icon {
  color: var(--mauth-text);
}

.mforgot-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--mauth-text);
  height: 100%;
  min-width: 0;
}

.mforgot-input::placeholder {
  color: var(--mauth-text-faint);
}

/* ================================
   验证码重发按钮
   ================================ */
.mforgot-code-btn {
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

.mforgot-code-btn:hover:not(:disabled) {
  color: var(--mauth-emphasis-fg);
}

.mforgot-code-btn:disabled {
  color: var(--mauth-text-faint) !important;
  cursor: not-allowed;
}

/* ================================
   错误提示样式
   ================================ */
.mforgot-err {
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

/* ================================
   按钮样式
   ================================ */
.mforgot-submit {
  height: 44px;
  width: 100%;
  margin-top: 4px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--mauth-primary-fg);
  border: none;
  background: var(--mauth-primary);
  box-shadow: var(--mauth-focus-ring);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.mforgot-submit:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.mforgot-submit:active:not(:disabled) {
  transform: translateY(0);
}

.mforgot-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: saturate(0);
}

.mforgot-resend {
  height: 40px;
  width: 100%;
  margin-top: 8px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mauth-accent);
  background: transparent;
  border: 1px solid var(--mauth-border-strong);
  cursor: pointer;
  transition: all 0.2s;
}

.mforgot-resend:hover:not(:disabled) {
  color: var(--mauth-emphasis-fg);
}

.mforgot-resend:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ================================
   面板（成功 / 信息）
   ================================ */
.mforgot-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px;
  margin: 8px 0;
  border-radius: 12px;
  text-align: center;
  font-size: 13px;
  color: var(--mauth-text-body);
}

.mforgot-panel--ok {
  background: var(--mauth-surface-2);
}

.mforgot-panel--ok svg {
  color: var(--mauth-accent);
}

.mforgot-panel--info {
  background: var(--mauth-surface-2);
}

.mforgot-panel--info svg {
  color: var(--mauth-accent);
}

.mforgot-panel-sub {
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.mforgot-panel-sub strong {
  color: var(--mauth-accent);
  font-weight: 600;
}

/* ================================
   高亮链接
   ================================ */
.mforgot-highlight-link {
  color: var(--mauth-accent);
  cursor: pointer;
  transition: color 0.2s;
}

.mforgot-highlight-link:hover {
  color: var(--mauth-emphasis-fg);
  text-decoration: underline;
}

/* ================================
   提交 spinner
   ================================ */
.mforgot-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--mauth-primary-fg);
  border-top-color: transparent;
  border-radius: 50%;
  animation: mforgot-spin 0.6s linear infinite;
}

@keyframes mforgot-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
