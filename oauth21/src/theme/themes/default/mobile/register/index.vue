<script setup lang="ts">
/**
 * 注册页 · 基础版式（`theme/themes/default/register/`）
 *
 * 这是**默认版式**：没有任何 `?view=` / 主题包声明 / 环境变量指定时用它。
 * 由容器**静态引入**（不在 registry 的惰性表里），所以默认路径上零额外请求、零闪烁。
 *
 * === 这个文件里应该有什么 / 不该有什么 ===
 * 有：DOM 结构、`mauth-*` 类名、转场动画、纯展示用的局部状态（密码明文开关）。
 * 没有：任何业务逻辑 —— 校验、请求、路由、倒计时全在容器里，这里只读 `ctx`、
 * 只调 `ctx.actions`。契约见 `../types.ts`。
 *
 * === 样式 ===
 * 本组件**不自带 `<style>`**：移动端认证页的样式单一来源是
 * `assets/styles/mobile-auth.scss`（`mauth-*` 体系，登录/注册/重置密码三页共用），
 * 自带样式块会让三页各自漂移 —— 历史上"两页看起来不一样"都源于此。
 * 特殊版式（`theme/themes/default/register/<变体>/`）需要自己那套结构样式时可以写 `<style scoped>`，
 * 但取值一律引用 `--mauth-*` token，别写裸色值，否则换配色/换明暗时会漏。
 *
 * @author yijiu2025
 */
import { ref, toRef } from 'vue';
import MauthThemeSwitch from '@/components/auth/MauthThemeSwitch.vue';
import type { RegisterViewProps } from '@/theme/views/register';

const props = defineProps<RegisterViewProps>();
/** 契约对象由容器创建一次（reactive），这里用 toRef 保证即使被替换也能跟着更新 */
const ctx = toRef(props, 'ctx');

// 密码明文显示：纯展示状态，不参与业务 → 留在版式内（换版式各管各的）
const showPwd = ref(false);
const showConfirmPwd = ref(false);
</script>

<template>
  <!-- 移动端全屏注册（与手机端登录页共用 mauth-* 样式体系）
       data-mauth-view：版式自己声明身份，值 = **主题包名**（一个主题包 = 一种版式） -->
  <div class="mauth-page" data-mauth-view="default">
    <!-- 顶部 Header：返回 + 标题 + 步骤副标题 + 进度条 -->
    <header class="mauth-header">
      <button class="mauth-back-btn" :aria-label="ctx.t('register.prev')" @click="ctx.actions.back()">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <!-- 右上角主题切换（跟随系统 / 浅色 / 深色 三态）；被 iframe 嵌入时自动隐藏 -->
      <MauthThemeSwitch />
      <div class="mauth-header-content">
        <div class="mauth-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 class="mauth-title">{{ ctx.t('register.title') }}</h1>
        <p class="mauth-sub">{{ ctx.subtitle }}</p>
      </div>
      <!-- 步骤进度条 -->
      <div class="mauth-progress">
        <div class="mauth-progress-bar" :style="{ width: `${ctx.progress}%` }"></div>
      </div>
    </header>

    <!-- 分步表单（堆栈进退，slide 动画） -->
    <main class="mauth-body">
      <transition :name="ctx.direction === 'next' ? 'mauth-slide-next' : 'mauth-slide-prev'" mode="out-in">
        <!-- 步骤 1：用户名 + 邮箱 + 验证码 -->
        <section v-if="ctx.step === 1" key="1" class="mauth-step">
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': ctx.fields.username.invalid }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <input
                v-model="ctx.fields.username.value"
                v-bind="ctx.fields.username.attrs"
                type="text"
                autocomplete="username"
                :placeholder="ctx.t('register.username')"
                class="mauth-input"
              />
            </div>
            <div class="mauth-err">{{ ctx.fields.username.error }}</div>
          </div>

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
                :placeholder="ctx.t('register.email')"
                class="mauth-input"
                @blur="ctx.actions.checkEmail()"
              />
            </div>
            <div class="mauth-err">{{ ctx.fields.email.error }}</div>
          </div>

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
                :placeholder="ctx.t('register.code')"
                :disabled="!ctx.codeSent"
                class="mauth-input"
              />
              <button type="button" @click="ctx.actions.sendCode()" :disabled="ctx.countingDown" class="mauth-code-btn">
                {{ ctx.countingDown ? ctx.t('register.code_countdown', { countdown: ctx.countdown }) : ctx.t('register.get_code') }}
              </button>
            </div>
            <div class="mauth-err">{{ ctx.fields.code.error }}</div>
          </div>

          <!-- 未发码前禁用：避免没收到码就往下走 -->
          <button type="button" class="mauth-next-btn" :disabled="!ctx.codeSent" @click="ctx.actions.nextStep(2)">
            {{ ctx.t('register.next') }}
          </button>
        </section>

        <!-- 步骤 2：密码 -->
        <section v-else-if="ctx.step === 2" key="2" class="mauth-step">
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
                :placeholder="ctx.t('register.password')"
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
                :placeholder="ctx.t('register.confirm_password')"
                class="mauth-input"
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

          <button type="button" class="mauth-next-btn" @click="ctx.actions.nextStep(3)">{{ ctx.t('register.next') }}</button>
        </section>

        <!-- 步骤 3：核对信息 + 协议 + 提交 -->
        <section v-else key="3" class="mauth-step">
          <div class="mauth-summary">
            <div class="mauth-summary-row"><span>{{ ctx.t('register.username') }}</span><strong>{{ ctx.fields.username.value }}</strong></div>
            <div class="mauth-summary-row"><span>{{ ctx.t('register.email') }}</span><strong>{{ ctx.fields.email.value }}</strong></div>
            <div class="mauth-summary-row"><span>{{ ctx.t('register.password_label') }}</span><strong>{{ ctx.t('register.summary_password_set') }}</strong></div>
          </div>

          <label class="mauth-agree">
            <input type="checkbox" v-model="ctx.agreed" class="hidden" />
            <span class="mauth-checkbox" :class="{ checked: ctx.agreed }">
              <svg v-if="ctx.agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="mauth-option-text">
              {{ ctx.t('register.agree_prefix') }}<span @click.stop.prevent="ctx.actions.openAgreement('service')" class="mauth-link">{{ ctx.t('register.agree_link_service') }}</span>{{ ctx.t('register.agree_and') }}<span @click.stop.prevent="ctx.actions.openAgreement('privacy')" class="mauth-link">{{ ctx.t('register.agree_link_privacy') }}</span>
            </span>
          </label>

          <button type="button" class="mauth-submit" :disabled="!ctx.canSubmit" @click="ctx.actions.submit()">
            <span v-if="ctx.submitting" class="mauth-spinner"></span>
            {{ ctx.submitting ? ctx.t('register.submitting') : ctx.t('register.submit') }}
          </button>
        </section>
      </transition>

      <!-- 已有账号 → 回登录（透传 OAuth 上下文，登录后才能回到授权页） -->
      <div class="mauth-footer">
        <span>{{ ctx.t('register.signin_hint') }}</span>
        <button class="mauth-register-btn" @click="ctx.actions.goLogin()">{{ ctx.t('register.signin_link') }}</button>
      </div>
    </main>
  </div>
</template>
