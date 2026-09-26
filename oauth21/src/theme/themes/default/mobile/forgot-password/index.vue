<script setup lang="ts">
/**
 * 重置密码页 · 基础版式（`theme/themes/default/forgot-password/`）
 *
 * 这是**默认版式**：没有任何 `?view=` / 主题包声明 / 环境变量指定时用它。
 * 由容器**静态引入**（不在 registry 的惰性表里），所以默认路径上零额外请求、零闪烁。
 *
 * === 这个文件里应该有什么 / 不该有什么 ===
 * 有：DOM 结构、`mauth-*` 类名、进度条怎么画、纯展示用的局部状态（两个密码明文开关）。
 * 没有：任何业务逻辑 —— 校验、发码/发链接、加密提交、路由全在容器里，
 * 这里只读 `ctx`、只调 `ctx.actions`。契约见 `../types.ts`。
 *
 * === 两套步骤由容器给的 stage 决定 ===
 * 验证码模式 3 步（email → code → done）、邮件链接模式 4 步（verify → sent → reset → done）。
 * 本版式按 `ctx.mode` + `ctx.stage` 二选一地渲染，**不自己判断"该不该跳过某步"** ——
 * 那是容器的事（例如带 token 进来时容器直接把 stage 置为 reset）。
 *
 * === 样式 ===
 * 本组件**不自带 `<style>`**：移动端认证页的样式单一来源是
 * `assets/styles/mobile-auth.scss`（`mauth-*` 体系，登录/注册/重置密码三页共用），
 * 自带样式块会让三页各自漂移。特殊版式需要自己的结构样式时可以写 `<style scoped>`，
 * 但取值一律引用 `--mauth-*` token，别写裸色值。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
import { ref, toRef } from 'vue';
import MauthThemeSwitch from '@/components/auth/MauthThemeSwitch.vue';
import type { ForgotPasswordViewProps } from '@/theme/views/forgot-password';

const props = defineProps<ForgotPasswordViewProps>();
/** 契约对象由容器创建一次（reactive），这里用 toRef 保证即使被替换也能跟着更新 */
const ctx = toRef(props, 'ctx');

// 密码明文显示：纯展示状态，不参与业务 → 留在版式内（换版式各管各的）
const showPwd = ref(false);
const showConfirmPwd = ref(false);
</script>

<template>
  <!-- 移动端全屏重置密码（与手机端登录/注册页共用 mauth-* 样式体系）
       data-mauth-view：版式自己声明身份，值 = **主题包名**（一个主题包 = 一种版式） -->
  <div class="mauth-page" data-mauth-view="default">
    <!-- 顶部 Header：返回 + 主题切换 + 标题 + 步骤副标题 + 进度条 -->
    <header class="mauth-header">
      <button class="mauth-back-btn" :aria-label="ctx.t('forgot.back_to_login')" @click="ctx.actions.back()">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <!-- 右上角主题切换（跟随系统 / 浅色 / 深色 三态）；被 iframe 嵌入时自动隐藏 -->
      <MauthThemeSwitch />
      <div class="mauth-header-content">
        <div class="mauth-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h1 class="mauth-title">{{ ctx.title }}</h1>
        <p class="mauth-sub">{{ ctx.subtitle }}</p>
      </div>
      <!-- 步骤进度条 -->
      <div class="mauth-progress">
        <div class="mauth-progress-bar" :style="{ width: `${ctx.progress}%` }"></div>
      </div>
    </header>

    <main class="mauth-body">
      <!-- ===== 方式一：验证码重置（3 步） ===== -->
      <template v-if="ctx.mode === 'code'">
        <!-- 步骤 1：输入邮箱 -->
        <section v-if="ctx.stage === 'email'" class="mauth-step">
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.email.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
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
                class="mauth-input"
                @keyup.enter="ctx.actions.submitEmail()"
              />
            </div>
            <div class="mauth-err">{{ ctx.fields.email.error }}</div>
          </div>

          <button type="button" class="mauth-submit" @click="ctx.actions.submitEmail()">
            {{ ctx.t('forgot.send_code') }}
          </button>
        </section>

        <!-- 步骤 2：邮箱验证码 + 新密码 -->
        <section v-else-if="ctx.stage === 'code'" class="mauth-step">
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.code.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
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
                class="mauth-input"
              />
              <button type="button" :disabled="ctx.countingDown" class="mauth-code-btn" @click="ctx.actions.resendEmail()">
                {{ ctx.countingDown ? ctx.t('login.code_countdown', { countdown: ctx.countdown }) : ctx.t('forgot.resend') }}
              </button>
            </div>
            <div class="mauth-err">{{ ctx.fields.code.error }}</div>
          </div>

          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.password.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="ctx.fields.password.value"
                v-bind="ctx.fields.password.attrs"
                :type="showPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="ctx.t('forgot.new_password_rule')"
                class="mauth-input"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showPwd ? ctx.t('login.hide_password', '隐藏密码') : ctx.t('login.show_password', '显示密码')"
                @click="showPwd = !showPwd"
              >
                <svg v-if="showPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <!-- 密码强度：4 段条 + 文字（移动端无 hover，不做桌面版那种悬浮规则窗） -->
            <div v-if="ctx.fields.password.value" class="mauth-strength">
              <div class="mauth-strength-bars">
                <span
                  v-for="i in 4"
                  :key="i"
                  class="mauth-strength-bar"
                  :class="i <= ctx.strength.score ? `is-${ctx.strength.level}` : ''"
                ></span>
              </div>
              <p class="mauth-strength-text" :class="`is-${ctx.strength.level}`">
                {{ ctx.t('register.password_strength_label', { level: ctx.strength.label }) }}
              </p>
            </div>
            <div class="mauth-err">{{ ctx.fields.password.error }}</div>
          </div>

          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.confirmPassword.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <input
                v-model="ctx.fields.confirmPassword.value"
                v-bind="ctx.fields.confirmPassword.attrs"
                :type="showConfirmPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="ctx.t('forgot.confirm_password')"
                class="mauth-input"
                @keyup.enter="ctx.actions.submit()"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showConfirmPwd ? ctx.t('login.hide_password', '隐藏密码') : ctx.t('login.show_password', '显示密码')"
                @click="showConfirmPwd = !showConfirmPwd"
              >
                <svg v-if="showConfirmPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div class="mauth-err">{{ ctx.fields.confirmPassword.error }}</div>
          </div>

          <button type="button" class="mauth-submit" :disabled="ctx.submitting" @click="ctx.actions.submit()">
            <span v-if="ctx.submitting" class="mauth-spinner"></span>
            {{ ctx.t('forgot.reset_password') }}
          </button>
        </section>

        <!-- 步骤 3：完成 -->
        <section v-else class="mauth-step">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-ok">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <p class="mauth-panel-text">{{ ctx.t('forgot.success_desc') }}</p>
          </div>
          <button type="button" class="mauth-submit" @click="ctx.actions.goLogin()">{{ ctx.t('forgot.back_to_login') }}</button>
        </section>
      </template>

      <!-- ===== 方式二：邮件链接重置（4 步） ===== -->
      <template v-else>
        <!-- 步骤 1：验证身份（输入邮箱） -->
        <section v-if="ctx.stage === 'verify'" class="mauth-step">
          <p class="mauth-panel-text mauth-step-desc">{{ ctx.t('forgot.link_desc') }}</p>
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.email.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
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
                class="mauth-input"
                @keyup.enter="ctx.actions.submitEmail()"
              />
            </div>
            <div class="mauth-err">{{ ctx.fields.email.error }}</div>
          </div>

          <button type="button" class="mauth-submit" @click="ctx.actions.submitEmail()">
            {{ ctx.t('forgot.send_link') }}
          </button>
        </section>

        <!-- 步骤 2：已发送 -->
        <section v-else-if="ctx.stage === 'sent'" class="mauth-step">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-info">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <p class="mauth-panel-text">{{ ctx.t('forgot.link_sent_to') }}</p>
            <p class="mauth-panel-sub"><strong>{{ ctx.fields.email.value }}</strong></p>
            <p class="mauth-panel-sub">{{ ctx.t('forgot.link_hint') }}</p>
          </div>

          <button type="button" class="mauth-resend" :disabled="ctx.countingDown" @click="ctx.actions.resendEmail()">
            {{ ctx.countingDown ? `${ctx.t('forgot.resend')} (${ctx.countdown}s)` : ctx.t('forgot.resend') }}
          </button>
          <button type="button" class="mauth-submit" @click="ctx.actions.goLogin()">{{ ctx.t('forgot.back_to_login') }}</button>
        </section>

        <!-- 步骤 3：设置新密码（从邮件链接带 token 进入） -->
        <section v-else-if="ctx.stage === 'reset'" class="mauth-step">
          <p class="mauth-panel-text mauth-step-desc">{{ ctx.t('forgot.reset_desc') }}</p>
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.password.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="ctx.fields.password.value"
                v-bind="ctx.fields.password.attrs"
                :type="showPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="ctx.t('forgot.new_password_rule')"
                class="mauth-input"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showPwd ? ctx.t('login.hide_password', '隐藏密码') : ctx.t('login.show_password', '显示密码')"
                @click="showPwd = !showPwd"
              >
                <svg v-if="showPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div v-if="ctx.fields.password.value" class="mauth-strength">
              <div class="mauth-strength-bars">
                <span
                  v-for="i in 4"
                  :key="i"
                  class="mauth-strength-bar"
                  :class="i <= ctx.strength.score ? `is-${ctx.strength.level}` : ''"
                ></span>
              </div>
              <p class="mauth-strength-text" :class="`is-${ctx.strength.level}`">
                {{ ctx.t('register.password_strength_label', { level: ctx.strength.label }) }}
              </p>
            </div>
            <div class="mauth-err">{{ ctx.fields.password.error }}</div>
          </div>

          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.confirmPassword.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <input
                v-model="ctx.fields.confirmPassword.value"
                v-bind="ctx.fields.confirmPassword.attrs"
                :type="showConfirmPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="ctx.t('forgot.confirm_password')"
                class="mauth-input"
                @keyup.enter="ctx.actions.submit()"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showConfirmPwd ? ctx.t('login.hide_password', '隐藏密码') : ctx.t('login.show_password', '显示密码')"
                @click="showConfirmPwd = !showConfirmPwd"
              >
                <svg v-if="showConfirmPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div class="mauth-err">{{ ctx.fields.confirmPassword.error }}</div>
          </div>

          <button type="button" class="mauth-submit" :disabled="ctx.submitting" @click="ctx.actions.submit()">
            <span v-if="ctx.submitting" class="mauth-spinner"></span>
            {{ ctx.t('forgot.reset_password') }}
          </button>
        </section>

        <!-- 步骤 4：完成 -->
        <section v-else class="mauth-step">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-ok">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <p class="mauth-panel-text">{{ ctx.t('forgot.success_desc') }}</p>
          </div>
          <button type="button" class="mauth-submit" @click="ctx.actions.goLogin()">{{ ctx.t('forgot.back_to_login') }}</button>
        </section>
      </template>

      <!-- 底部返回登录入口（与手机端登录/注册页同款 footer） -->
      <div v-if="ctx.step < ctx.totalSteps" class="mauth-footer">
        <span>{{ ctx.t('forgot.remembered') }}</span>
        <button class="mauth-register-btn" @click="ctx.actions.goLogin()">{{ ctx.t('forgot.back_to_login') }}</button>
      </div>
    </main>
  </div>
</template>
