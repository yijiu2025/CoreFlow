<script setup lang="ts">
/**
 * 注册页 · **mini 设备**版式（iframe 弹窗单栏卡片）
 *
 * 2026-09-25 起 mini 是独立设备（与 mobile / standard 并列，`THEME_DEVICES` 三值），
 * 本文件因此住在 `themes/<包>/mini/register/`，配色也独立成套（`mini/register/colors/`）。
 * 由容器 `view/web/register/MiniRegister.vue` 静态引入。
 * 版式只读 `ctx`、只调 `ctx.actions`。
 *
 * @author yijiu2025
 */
import { computed, toRef } from 'vue';
import AuthContainer from '@/components/common/AuthContainer.vue';
import PasswordInput from '@/components/common/PasswordInput.vue';
import PasswordStrength from '@/components/common/PasswordStrength.vue';
import type { RegisterViewProps } from '@/theme/views/register';

const props = defineProps<RegisterViewProps>();
const ctx = toRef(props, 'ctx');

const isStep1 = computed(() => ctx.value.step === 1);
</script>

<template>
  <div class="mini-reg-root w-full h-full">
    <AuthContainer :app-name="ctx.appName">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold dark:text-white leading-tight">{{ ctx.t('register.title') }}</h2>
            <p class="text-xs text-slate-400 mt-1">{{ ctx.subtitle }}</p>
          </div>
          <!-- 步骤指示小圆点 -->
          <div class="flex items-center gap-1.5 mr-2">
            <span class="mreg-step-dot" :class="{ 'mreg-step-dot--active': isStep1 }"></span>
            <span class="mreg-step-dot" :class="{ 'mreg-step-dot--active': !isStep1 }"></span>
          </div>
        </div>
      </template>

      <form @submit.prevent="isStep1 ? ctx.actions.nextStep(2) : ctx.actions.submit()" class="mreg-form">
        <!-- 第一步：基本账号信息 -->
        <div v-if="isStep1" class="mreg-step-box">
          <!-- 用户名 -->
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': ctx.fields.username.invalid }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <input v-model="ctx.fields.username.value" v-bind="ctx.fields.username.attrs" type="text" :placeholder="ctx.t('register.username')" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ ctx.fields.username.error }}</div>
          </div>

          <!-- 邮箱 -->
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': ctx.fields.email.invalid }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input v-model="ctx.fields.email.value" v-bind="ctx.fields.email.attrs" @blur="ctx.actions.checkEmail()" type="email" :placeholder="ctx.t('register.email')" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ ctx.fields.email.error }}</div>
          </div>

          <!-- 验证码 -->
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': ctx.fields.code.invalid }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="ctx.fields.code.value"
                v-bind="ctx.fields.code.attrs"
                type="text"
                :placeholder="ctx.t('register.code')"
                :disabled="!ctx.codeSent"
                class="mreg-input disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button type="button" @click="ctx.actions.sendCode()" :disabled="ctx.countingDown" class="mreg-code-btn">
                {{ ctx.countingDown ? ctx.t('register.code_countdown', { countdown: ctx.countdown }) : ctx.t('register.get_code') }}
              </button>
            </div>
            <div class="mreg-err">{{ ctx.fields.code.error }}</div>
          </div>

          <!-- 下一步按钮（未发验证码前禁用） -->
          <button type="button" @click="ctx.actions.nextStep(2)" :disabled="!ctx.codeSent" class="mreg-submit disabled:opacity-50 disabled:cursor-not-allowed">
            {{ ctx.t('register.next') }}
          </button>
        </div>

        <!-- 第二步：密码与协议 -->
        <div v-else class="mreg-step-box">
          <!-- 登录密码 -->
          <div class="mreg-cell">
            <PasswordInput
              v-model="ctx.fields.password.value"
              :has-error="ctx.fields.password.invalid"
              :placeholder="ctx.t('register.password')"
              input-class="mreg-input"
            />
            <div class="mreg-err">{{ ctx.fields.password.error }}</div>
            <PasswordStrength :password="ctx.fields.password.value" />
          </div>

          <!-- 确认密码 -->
          <div class="mreg-cell">
            <PasswordInput
              v-model="ctx.fields.confirmPassword.value"
              :has-error="ctx.fields.confirmPassword.invalid"
              :placeholder="ctx.t('register.confirm_password')"
              input-class="mreg-input"
            />
            <div class="mreg-err">{{ ctx.fields.confirmPassword.error }}</div>
          </div>

          <!-- 协议勾选 -->
          <div class="mreg-cell pt-1">
            <label class="mreg-agree">
              <input type="checkbox" v-model="ctx.agreed" class="hidden" />
              <span class="mreg-checkbox" :class="{ checked: ctx.agreed }">
                <svg v-if="ctx.agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
              <span class="text-xs text-slate-500 dark:text-slate-400">
                {{ ctx.t('register.agree_prefix') }}<span @click.stop.prevent="ctx.actions.openAgreement('service')" class="mreg-highlight-link">{{ ctx.t('register.agree_link_service') }}</span>{{ ctx.t('register.agree_and') }}<span @click.stop.prevent="ctx.actions.openAgreement('privacy')" class="mreg-highlight-link">{{ ctx.t('register.agree_link_privacy') }}</span>
              </span>
            </label>
          </div>

          <!-- 提交/上一步按钮组 -->
          <div class="flex gap-2.5 mt-2">
            <button type="button" @click="ctx.actions.back()" class="mreg-back-btn">{{ ctx.t('register.prev') }}</button>
            <button type="submit" class="mreg-submit flex-1" :disabled="!ctx.canSubmit" :class="{ 'opacity-50 cursor-not-allowed': !ctx.canSubmit }">
              {{ ctx.submitting ? ctx.t('register.submitting') : ctx.t('register.submit') }}
            </button>
          </div>
        </div>
      </form>

      <!-- 底部返回登录 -->
      <template #footer>
        <div class="flex items-center justify-between pt-1">
          <span class="text-xs text-slate-400">{{ ctx.t('register.signin_hint') }}</span>
          <button type="button" @click="ctx.actions.goLogin()" class="mreg-highlight-link font-medium text-xs">
            {{ ctx.t('register.signin_link') }}
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
.mini-reg-root {
  width: 100%;
}

/* ================================
   表单布局
   ================================ */
.mreg-form {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
}

.mreg-step-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mreg-cell {
  display: flex;
  flex-direction: column;
}

/* ================================
   输入框样式（token 化）
   ================================ */
.mreg-field {
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

.mreg-field:focus-within {
  background: var(--mauth-field-bg-focus);
  border-color: var(--mauth-field-border-focus);
  box-shadow: 0 0 0 3px var(--mauth-focus-ring);
}

.mreg-field.is-error {
  border-color: var(--mauth-danger);
  background: var(--mauth-danger-bg);
}

.mreg-icon {
  color: var(--mauth-icon);
  flex-shrink: 0;
  transition: color 0.2s;
}

.mreg-field:focus-within .mreg-icon {
  color: var(--mauth-text);
}

.mreg-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--mauth-text);
  height: 100%;
  min-width: 0;
}

.mreg-input::placeholder {
  color: var(--mauth-text-faint);
}

/* ================================
   验证码按钮样式
   ================================ */
.mreg-code-btn {
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

.mreg-code-btn:hover:not(:disabled) {
  color: var(--mauth-emphasis-fg);
}

.mreg-code-btn:disabled {
  color: var(--mauth-text-faint) !important;
  cursor: not-allowed;
}

/* ================================
   错误提示样式
   ================================ */
.mreg-err {
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
.mreg-submit {
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
}

.mreg-submit:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.mreg-submit:active:not(:disabled) {
  transform: translateY(0);
}

.mreg-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: saturate(0);
}

.mreg-back-btn {
  height: 44px;
  padding: 0 16px;
  margin-top: 4px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mauth-text-faint);
  background: var(--mauth-surface-2);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.mreg-back-btn:hover:not(:disabled) {
  background: var(--mauth-surface-3);
  color: var(--mauth-text);
}

/* ================================
   协议勾选样式
   ================================ */
.mreg-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.mreg-checkbox {
  width: 16px;
  height: 16px;
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

.mreg-checkbox:hover {
  border-color: var(--mauth-accent);
}

.mreg-checkbox.checked {
  background: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

.mreg-highlight-link {
  color: var(--mauth-accent);
  cursor: pointer;
  transition: color 0.2s;
}

.mreg-highlight-link:hover {
  color: var(--mauth-emphasis-fg);
  text-decoration: underline;
}

/* ================================
   步骤指示小圆点
   ================================ */
.mreg-step-dot {
  display: inline-block;
  height: 0.5rem;
  width: 0.5rem;
  border-radius: 9999px;
  background: var(--mauth-border);
  transition: all 0.3s;
}

.mreg-step-dot--active {
  width: 1rem;
  background: var(--mauth-primary);
}
</style>
