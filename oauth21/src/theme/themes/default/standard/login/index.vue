<script setup lang="ts">
/**
 * 登录页 · **standard 设备**基础版式（桌面主窗口双栏卡片 + 扫码面板）
 *
 * 2026-09-25 起设备三值化（mobile / standard / mini），本文件住在
 * `themes/<包>/standard/login/`（原 `web/` 目录更名），配色独立成套。
 * 由容器 `view/web/login/StandardLogin.vue` 静态引入（内置包基础版式，首屏零请求）。
 * 版式只读 `ctx`、只调 `ctx.actions`，禁止出现请求 / 校验 / 路由 / store。
 * 契约见 `theme/views/login.ts`。
 *
 * 样式：本组件自带 `<style scoped>`（`std-*` 体系，已 token 化），
 * 与 mobile-auth.scss 的 `mauth-*` 是两套（桌面卡片 vs 移动全屏）。
 *
 * @author yijiu2025
 */
import { computed, toRef } from 'vue';
import Icons from '@/components/common/Icons.vue';
import AppNameMissing from '@/components/common/AppNameMissing.vue';
import type { LoginViewProps } from '@/theme/views/login';

const props = defineProps<LoginViewProps>();
const ctx = toRef(props, 'ctx');

// 把「当前是哪块面板」投影成布尔量，模板里少写长表达式
const consentOpen = computed(() => ctx.value.panel === 'consent');
const emailVerifyOpen = computed(() => ctx.value.panel === 'emailVerify');
</script>

<template>
  <div class="standard-login-root" :class="{ dark: ctx.isDark }">
    <!-- 错误场景：应用标识缺失 -->
    <AppNameMissing v-if="!ctx.hasAppName" />

    <!-- 主登录容器 -->
    <div v-else class="relative group w-full">
      <!-- 背景流光动画装饰 -->
      <div class="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div class="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-700"></div>

      <!-- max-w 限宽 + w-full：窄于 856px 的窗口跟随视口收缩 -->
      <div class="relative w-full max-w-[856px] mx-auto min-h-[480px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-[10px] overflow-hidden flex shadow-2xl border border-white/40 dark:border-slate-800">
        <!-- 左侧面板：登录/授权表达面板 -->
        <div class="flex-1 p-10 flex flex-col justify-between relative">
          <!-- OAuth 授权确认视图 -->
          <template v-if="consentOpen">
            <div>
              <div class="flex items-center gap-3 mb-6">
                <div class="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-600 font-bold text-xl">
                  {{ (ctx.consentState?.client_name || 'A')[0].toUpperCase() }}
                </div>
                <div>
                  <h2 class="text-xl font-bold dark:text-white leading-tight">
                    {{ ctx.t('login.consent_title') || '应用授权确认' }}
                  </h2>
                  <p class="text-xs text-slate-400 mt-1">
                    {{ ctx.t('login.consent_desc', { app: ctx.consentState?.client_name || ctx.t('login.third_party') }) }}
                  </p>
                </div>
              </div>

              <div class="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {{ ctx.t('login.requesting_permissions') || '该应用将获取以下权限：' }}
                </p>
                <ul class="space-y-2.5">
                  <li
                    v-for="s in (ctx.consentState?.scopeDetails || [])"
                    :key="s.id"
                    class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"
                  >
                    <Icons name="check" :size="16" class="text-green-500 shrink-0 mt-0.5" />
                    <span>
                      <strong class="font-semibold">{{ s.name }}</strong>
                      <span class="text-slate-400 dark:text-slate-500">— {{ s.desc }}</span>
                      <span v-if="s.required" class="ml-1 text-[10px] text-slate-400">（必需）</span>
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div class="flex gap-4 mt-8">
              <button
                type="button"
                @click="ctx.actions.denyConsent()"
                class="flex-1 h-12 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                {{ ctx.t('login.deny') || '拒绝' }}
              </button>
              <button
                type="button"
                @click="ctx.actions.approveConsent()"
                :disabled="ctx.consentSubmitting"
                class="flex-1 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all"
              >
                <span v-if="ctx.consentSubmitting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                {{ ctx.t('login.approve') || '同意并授权' }}
              </button>
            </div>
          </template>

          <!-- 邮箱二次验证（密码登录环境异常） -->
          <template v-else-if="emailVerifyOpen">
            <div class="flex flex-col items-center justify-center py-8 space-y-5">
              <div class="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f59e0b" stroke-width="2">
                  <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                </svg>
              </div>
              <div class="text-center space-y-1">
                <h3 class="text-lg font-bold dark:text-white">环境变更验证</h3>
                <p class="text-xs text-slate-400">检测到{{ ctx.emailVerifyState?.reason }}，为保护账号安全，请验证邮箱</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">验证码已发送至 <strong>{{ ctx.emailVerifyState?.email }}</strong></p>
              </div>

              <div class="w-full std-field">
                <Icons name="mail" :size="18" class="std-icon" />
                <input
                  v-model="ctx.emailVerifyCode"
                  type="text"
                  maxlength="6"
                  placeholder="邮箱验证码"
                  class="std-input"
                  @keyup.enter="ctx.actions.submitEmailVerify()"
                />
              </div>

              <div class="w-full flex items-center justify-between text-xs">
                <button type="button" @click="ctx.actions.sendEmailVerifyCode()" :disabled="ctx.emailVerifyCountingDown"
                  class="text-primary disabled:text-slate-400 disabled:cursor-not-allowed font-medium">
                  {{ ctx.emailVerifyCountingDown ? `${ctx.emailVerifyCountdown}s 后重发` : '重新发送验证码' }}
                </button>
              </div>

              <button type="button" @click="ctx.actions.submitEmailVerify()" class="auth-btn w-full">
                验证并登录
              </button>
            </div>
          </template>

          <!-- 标准登录表单视图 -->
          <template v-else>
            <div>
              <!-- 品牌 Header -->
              <div class="flex items-center gap-3.5 mb-6">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1 7-2 2.5 1 5 2 7 2a1 1 0 0 1 1 1z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div class="flex flex-col justify-center">
                  <h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                    {{ ctx.t('login.welcome') || '欢迎登录' }}
                  </h2>
                  <p class="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-none">Enterprise Identity System</p>
                </div>
              </div>

              <!-- Tab 切换 -->
              <div class="relative flex p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl mb-6">
                <button
                  type="button"
                  @click="ctx.actions.switchMode('email')"
                  :class="ctx.mode === 'email' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700'"
                  class="flex-1 py-2 text-xs rounded-lg transition-all"
                >
                  {{ ctx.t('login.email_login') || '邮箱验证码登录' }}
                </button>
                <button
                  type="button"
                  @click="ctx.actions.switchMode('pwd')"
                  :class="ctx.mode === 'pwd' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700'"
                  class="flex-1 py-2 text-xs rounded-lg transition-all"
                >
                  {{ ctx.t('login.password_login') || '账号密码登录' }}
                </button>
              </div>

              <!-- 表单输入区域 -->
              <form @submit.prevent="ctx.actions.submit()" class="space-y-4">
                <!-- 字段 1：邮箱 / 账号 -->
                <div class="std-cell">
                  <div class="std-field" :class="{ 'is-error': ctx.fields.email.invalid || ctx.fields.username.invalid }">
                    <Icons v-if="ctx.mode === 'email'" name="mail" :size="18" class="std-icon" />
                    <Icons v-else name="user" :size="18" class="std-icon" />
                    <input
                      v-if="ctx.mode === 'email'"
                      v-model="ctx.fields.email.value"
                      v-bind="ctx.fields.email.attrs"
                      type="email"
                      :placeholder="ctx.t('login.email_placeholder') || '请输入电子邮箱'"
                      autocomplete="username"
                      class="std-input"
                    />
                    <input
                      v-else
                      v-model="ctx.fields.username.value"
                      v-bind="ctx.fields.username.attrs"
                      type="text"
                      :placeholder="ctx.t('login.username_placeholder') || '账号 / 邮箱 / 手机号'"
                      autocomplete="username"
                      class="std-input"
                    />
                  </div>
                  <div class="std-err">{{ ctx.fields.email.error || ctx.fields.username.error }}</div>
                </div>

                <!-- 字段 2：验证码 / 密码 -->
                <div class="std-cell">
                  <div class="std-field" :class="{ 'is-error': ctx.fields.code.invalid || ctx.fields.password.invalid }">
                    <Icons name="lock" :size="18" class="std-icon" />
                    <input
                      v-if="ctx.mode === 'email'"
                      v-model="ctx.fields.code.value"
                      v-bind="ctx.fields.code.attrs"
                      type="text"
                      :placeholder="ctx.t('login.code_placeholder') || '请输入验证码'"
                      autocomplete="one-time-code"
                      class="std-input"
                    />
                    <input
                      v-else
                      v-model="ctx.fields.password.value"
                      v-bind="ctx.fields.password.attrs"
                      type="password"
                      :placeholder="ctx.t('login.password_placeholder') || '请输入密码'"
                      autocomplete="current-password"
                      class="std-input"
                    />
                    <button
                      type="button"
                      v-if="ctx.mode === 'email'"
                      @click="ctx.actions.sendCode()"
                      :disabled="ctx.countingDown"
                      class="std-code-btn"
                    >
                      {{ ctx.countingDown ? `${ctx.countdown}s` : ctx.t('login.get_code') || '获取验证码' }}
                    </button>
                  </div>
                  <div class="std-err">{{ ctx.fields.code.error || ctx.fields.password.error }}</div>
                </div>

                <!-- 登录提交按钮 -->
                <button
                  type="submit"
                  :disabled="ctx.submitting"
                  class="std-submit-btn flex items-center justify-center gap-2"
                >
                  <span v-if="ctx.submitting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  {{ ctx.submitting ? (ctx.t('login.logging_in') || '登录中...') : (ctx.t('login.submit') || '安全登录') }}
                </button>
              </form>
            </div>
            <!-- 底部控制与服务协议 -->
            <div class="std-bottom">
              <!-- 行 1：记住登录 + 忘记密码 -->
              <div class="std-row">
                <label class="std-check-label">
                  <input type="checkbox" v-model="ctx.keepLogin" class="hidden" />
                  <span class="std-checkbox" :class="{ checked: ctx.keepLogin }">
                    <Icons v-if="ctx.keepLogin" name="check" :size="10" />
                  </span>
                  <span class="std-sub-text">{{ ctx.t('login.keep_login') || '保持登录' }}</span>
                </label>

                <a href="#" class="std-forgot-link" @click.stop.prevent="ctx.actions.goForgot()">
                  {{ ctx.t('login.forgot_password') || '忘记密码？' }}
                </a>
              </div>

              <!-- 行 2：协议卡片 + 立即注册 -->
              <div class="std-agreement-card">
                <label class="std-check-label flex-1 min-w-0">
                  <input type="checkbox" v-model="ctx.agreed" class="hidden" />
                  <span class="std-checkbox" :class="{ checked: ctx.agreed }">
                    <Icons v-if="ctx.agreed" name="check" :size="10" />
                  </span>
                  <span class="std-sub-text truncate">
                    同意 <a href="#" class="std-link-primary" @click.stop.prevent="ctx.actions.openAgreement('service')">《服务协议》</a> 与 <a href="#" class="std-link-primary" @click.stop.prevent="ctx.actions.openAgreement('privacy')">《隐私政策》</a>
                  </span>
                </label>

                <a href="#" class="std-register-link" @click.stop.prevent="ctx.actions.goRegister()">
                  {{ ctx.t('login.register_now') || '立即注册' }}
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </a>
              </div>
            </div>
          </template>
        </div>

        <!-- 右侧面板：扫码登录面板 -->
        <div class="w-[340px] bg-slate-50/70 dark:bg-slate-800/40 border-l border-slate-200/80 dark:border-slate-800 flex flex-col items-center justify-center p-8">
          <div class="text-center mb-6">
            <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {{ ctx.t('login.qr_title') || '扫码快捷登录' }}
            </h3>
            <p class="text-xs text-slate-400">
              {{ ctx.t('login.qr_desc') || '使用移动客户端扫描二维码' }}
            </p>
          </div>

          <!-- 二维码显示区 -->
          <div
            class="relative p-3.5 bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-700 cursor-pointer overflow-hidden group"
            :class="{ 'border-rose-300': ctx.qrStatus === 'expired' }"
            @click="ctx.qrStatus === 'expired' && ctx.actions.generateQr()"
          >
            <div v-if="ctx.qrStatus !== 'expired'" class="absolute top-0 left-0 w-full h-[2px] bg-blue-600 blur-[2px] animate-scan z-10"></div>

            <img
              v-if="ctx.qrDataUrl"
              :src="ctx.qrDataUrl"
              class="w-44 h-44 transition-opacity"
              :class="ctx.qrStatus === 'expired' ? 'opacity-20' : 'opacity-95 group-hover:opacity-100'"
            />
            <div v-else class="w-44 h-44 flex items-center justify-center">
              <div class="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>

            <!-- 过期刷新遮罩 -->
            <div
              v-if="ctx.qrStatus === 'expired'"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-rose-500 animate-bounce">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              <span class="text-xs font-semibold text-rose-500">二维码已失效，点击刷新</span>
            </div>
          </div>

          <p class="mt-6 text-xs text-slate-400 text-center leading-relaxed">
            {{ ctx.t('login.qr_scan_hint', { app: ctx.appName }) || `打开手机客户端扫码登录 ${ctx.appName}` }}
          </p>
        </div>
      </div>

      <!-- 暗黑模式切换按钮 (非嵌入场景下可用) -->
      <button
        v-if="!ctx.isEmbedded"
        @click="ctx.actions.toggleTheme()"
        class="absolute -bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-xs font-medium hover:scale-105 transition-all"
      >
        <Icons v-if="ctx.isDark" name="moon" :size="14" />
        <Icons v-else name="sun" :size="14" />
        <span>{{ ctx.isDark ? 'Dark Mode' : 'Light Mode' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 根节点撑满分发器 wrapper 宽度，让卡片 max-w 能跟随视口收缩 */
.standard-login-root {
  width: 100%;
}

/* ==========================================================================
   1. 头部 Brand Header 精准垂直居中样式
   ========================================================================== */
.brand-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--mauth-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mauth-primary-fg);
  box-shadow: var(--mauth-focus-ring);
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.brand-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--mauth-text);
  margin: 0;
}

.brand-sub {
  font-size: 12px;
  line-height: 1.2;
  color: var(--mauth-text-faint);
  margin-top: 4px;
}

/* ==========================================================================
   2. 输入框 & 按钮通用样式（token 化）
   ========================================================================== */
.std-cell {
  display: flex;
  flex-direction: column;
}

.std-field {
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

.std-field:focus-within {
  background: var(--mauth-field-bg-focus);
  border-color: var(--mauth-field-border-focus);
  box-shadow: 0 0 0 3px var(--mauth-focus-ring);
}

.std-field.is-error {
  border-color: var(--mauth-danger);
  background: var(--mauth-danger-bg);
}

.std-icon {
  color: var(--mauth-icon);
  flex-shrink: 0;
  transition: color 0.2s;
}

.std-field:focus-within .std-icon {
  color: var(--mauth-text);
}

.std-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--mauth-text);
  height: 100%;
  min-width: 0;
}

.std-input::placeholder {
  color: var(--mauth-text-faint);
}

.std-code-btn {
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

.std-code-btn:hover:not(:disabled) {
  color: var(--mauth-emphasis-fg);
}

.std-code-btn:disabled {
  color: var(--mauth-text-faint) !important;
  cursor: not-allowed;
}

.std-err {
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

.std-submit-btn {
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

.std-submit-btn:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.std-submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.std-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: saturate(0);
}

/* ==========================================================================
   3. 底部完美左对齐
   ========================================================================== */
.std-bottom {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.std-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 9px 0 0;
}

.std-agreement-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0px 0px;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.std-agreement-card:hover {
  background: var(--mauth-surface-2);
}

.std-check-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  line-height: 1;
}

.std-checkbox {
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
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.std-checkbox:hover {
  border-color: var(--mauth-accent);
}

.std-checkbox.checked {
  background: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

.std-sub-text {
  font-size: 12px;
  color: var(--mauth-text-faint);
  line-height: 1;
}

.std-forgot-link {
  font-size: 12px;
  color: var(--mauth-text-faint);
  font-weight: 500;
  white-space: nowrap;
  transition: color 0.2s ease;
}

.std-forgot-link:hover {
  color: var(--mauth-accent);
}

.std-link-primary {
  color: var(--mauth-accent);
  font-weight: 500;
  text-decoration: none;
}

.std-link-primary:hover {
  text-decoration: underline;
}

.std-register-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-accent);
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.std-register-link:hover {
  color: var(--mauth-emphasis-fg);
  transform: translateX(2px);
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
