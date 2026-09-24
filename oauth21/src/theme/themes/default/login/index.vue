<script setup lang="ts">
/**
 * 登录页 · 基础版式（`theme/themes/default/login/`）
 *
 * 这是**默认版式**：没有任何 `?view=` / 主题包声明 / 环境变量指定时用它。
 * 由容器**静态引入**（不在 registry 的惰性表里），所以默认路径上零额外请求、零闪烁。
 *
 * === 这个文件里应该有什么 / 不该有什么 ===
 * 有：DOM 结构、`mauth-*` 类名、转场动画、纯展示用的局部状态（密码明文开关）。
 * 没有：任何业务逻辑 —— 校验、请求、路由、图形码、倒计时、第三方登录全在容器里，
 * 这里只读 `ctx`、只调 `ctx.actions`。契约见 `../types.ts`。
 *
 * === 样式 ===
 * 本组件**不自带 `<style>`**：移动端认证页的样式单一来源是
 * `assets/styles/mobile-auth.scss`（`mauth-*` 体系，登录/注册/重置密码三页共用），
 * 自带样式块会让三页各自漂移 —— 历史上"两页看起来不一样"都源于此。
 * 特殊版式（`theme/themes/default/login/<变体>/`）需要自己那套结构样式时可以写 `<style scoped>`，
 * 但取值一律引用 `--mauth-*` token，别写裸色值，否则换配色/换明暗时会漏。
 *
 * === 三块面板 ===
 * 授权确认 / 邮箱二次验证 / 登录表单由容器用 `ctx.panel` 选择，本版式只负责把选中的
 * 那块渲染出来 —— 换句话说"什么时候显示哪块"是业务，不是版式。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
import { computed, ref, toRef, watch } from 'vue';
import AppNameMissing from '@/components/common/AppNameMissing.vue';
import ConsentPanel from '@/components/auth/ConsentPanel.vue';
import MauthThemeSwitch from '@/components/auth/MauthThemeSwitch.vue';
import MauthSocialRow from '@/components/auth/MauthSocialRow.vue';
import type { LoginViewProps } from '@/theme/views/login';

const props = defineProps<LoginViewProps>();
/** 契约对象由容器创建一次（reactive），这里用 toRef 保证即使被替换也能跟着更新 */
const ctx = toRef(props, 'ctx');

// 密码明文显示：纯展示状态，不参与业务 → 留在版式内（换版式各管各的）
const showPwd = ref(false);

/**
 * 转场动画名：容器只给出方向语义（切到密码=next、切回验证码=prev），
 * 具体用哪个动画类由版式决定 —— 换个版式想改成淡入淡出，不必碰容器。
 */
const transitionName = ref('mauth-slide-next');
watch(
  () => ctx.value.direction,
  dir => {
    transitionName.value = dir === 'next' ? 'mauth-slide-next' : 'mauth-slide-prev';
  }
);

/** 把「当前是哪块面板」投影成两个布尔量：模板里少写长表达式，也少一处写错的机会 */
const consentOpen = computed(() => ctx.value.panel === 'consent');
const emailVerifyOpen = computed(() => ctx.value.panel === 'emailVerify');
</script>

<template>
  <!-- 移动端登录（白灰高级色 + 全屏平铺 + slide 切换）
       data-mauth-view：版式自己声明身份，排查"现在到底是哪套 UI"时一眼可见 -->
  <div class="mauth-page" data-mauth-view="base">
    <!-- 应用标识缺失：直接打开 /m/login 无 appName 时给明确提示。
         ⚠️ 判据由容器给出（ctx.hasAppName），版式不要自己去读 query —— 
         "什么算缺标识"是业务口径，各版式各写一遍必然漂移。 -->
    <div v-if="!ctx.hasAppName" class="mauth-missing">
      <AppNameMissing />
    </div>

    <template v-else>
      <!-- 顶部 Header（白灰，与 body 融为一体） -->
      <header class="mauth-header">
        <button class="mauth-back-btn" @click="ctx.actions.back()" :aria-label="ctx.t('login.back', '返回')">
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
          <h1 class="mauth-title">{{ ctx.title }}</h1>
          <p class="mauth-sub">{{ ctx.subtitle }}</p>
        </div>
      </header>

      <!-- 表单主体（全屏平铺，无卡片浮层） -->
      <main class="mauth-body">
        <!-- ① 授权确认（后端返回 action=consent 时）：与桌面版同一面板组件 -->
        <template v-if="consentOpen">
          <ConsentPanel
            :consent-state="ctx.consentState ?? undefined"
            :submitting="ctx.consentSubmitting"
            :on-deny="ctx.actions.denyConsent"
            :on-approve="ctx.actions.approveConsent"
          />
        </template>

        <!-- ② 邮箱二次验证（登录环境变更） -->
        <template v-else-if="emailVerifyOpen">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-warn">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <p class="mauth-panel-text">{{ ctx.t('login.email_verify_hint', { reason: ctx.emailVerifyState?.reason || '' }) }}</p>
            <p class="mauth-panel-sub">
              {{ ctx.t('login.code_sent_to', '验证码已发送至') }} <strong>{{ ctx.emailVerifyState?.email }}</strong>
            </p>

            <div class="mauth-cell mt-4">
              <div class="mauth-field">
                <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input
                  v-model="ctx.emailVerifyCode"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  :placeholder="ctx.t('login.email_verify_code', '邮箱验证码')"
                  class="mauth-input"
                  @keyup.enter="ctx.actions.submitEmailVerify()"
                />
              </div>
            </div>

            <button
              type="button"
              class="mauth-resend"
              :disabled="ctx.emailVerifyCountingDown"
              @click="ctx.actions.sendEmailVerifyCode()"
            >
              {{ ctx.emailVerifyCountingDown
                ? ctx.t('login.code_countdown', { countdown: ctx.emailVerifyCountdown })
                : ctx.t('login.resend_code', '重新发送验证码') }}
            </button>

            <button type="button" class="mauth-submit" @click="ctx.actions.submitEmailVerify()">
              {{ ctx.t('login.verify_and_login', '验证并登录') }}
            </button>
          </div>
        </template>

        <!-- ③ 登录表单 -->
        <template v-else>
          <!-- 模式切换 Tab -->
          <div class="mauth-tabs">
            <button class="mauth-tab" :class="{ active: ctx.mode === 'email' }" @click="ctx.actions.switchMode('email')">
              {{ ctx.t('login.email_login') }}
            </button>
            <button class="mauth-tab" :class="{ active: ctx.mode === 'pwd' }" @click="ctx.actions.switchMode('pwd')">
              {{ ctx.t('login.password_login') }}
            </button>
          </div>

          <!-- 表单（slide 切换动画） -->
          <form @submit.prevent="ctx.actions.submit()" class="mauth-form">
            <transition :name="transitionName" mode="out-in">
              <!-- 邮箱验证码登录 -->
              <div v-if="ctx.mode === 'email'" key="email" class="mauth-step">
                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': ctx.fields.email.invalid }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    <input v-model="ctx.fields.email.value" v-bind="ctx.fields.email.attrs" type="email" inputmode="email" :placeholder="ctx.t('login.email_placeholder')" autocomplete="email" class="mauth-input" />
                  </div>
                  <div class="mauth-err">{{ ctx.fields.email.error }}</div>
                </div>

                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': ctx.fields.code.invalid }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <input v-model="ctx.fields.code.value" v-bind="ctx.fields.code.attrs" type="text" inputmode="numeric" :placeholder="ctx.t('login.code_placeholder')" autocomplete="one-time-code" class="mauth-input" />
                    <button type="button" @click="ctx.actions.sendCode()" :disabled="ctx.countingDown" class="mauth-code-btn">
                      {{ ctx.countingDown ? ctx.t('login.code_countdown', { countdown: ctx.countdown }) : ctx.t('login.get_code') }}
                    </button>
                  </div>
                  <div class="mauth-err">{{ ctx.fields.code.error }}</div>
                </div>
              </div>

              <!-- 密码登录 -->
              <div v-else key="pwd" class="mauth-step">
                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': ctx.fields.username.invalid }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <input v-model="ctx.fields.username.value" v-bind="ctx.fields.username.attrs" type="text" :placeholder="ctx.t('login.username_placeholder')" autocomplete="username" class="mauth-input" />
                  </div>
                  <div class="mauth-err">{{ ctx.fields.username.error }}</div>
                </div>

                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': ctx.fields.password.invalid }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <input v-model="ctx.fields.password.value" v-bind="ctx.fields.password.attrs" :type="showPwd ? 'text' : 'password'" :placeholder="ctx.t('login.password_placeholder')" autocomplete="current-password" class="mauth-input" />
                    <!-- 密码可见性开关：移动端无 hover，必须显式可点 -->
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

                <!-- 忘记密码（与桌面版对齐） -->
                <button type="button" class="mauth-forgot" @click="ctx.actions.goForgot()">{{ ctx.t('login.forgot_password') }}</button>
              </div>
            </transition>

            <!-- 记住登录 + 已读协议（合并到一处，提交按钮上方） -->
            <div class="mauth-options">
              <label class="mauth-option">
                <input type="checkbox" v-model="ctx.keepLogin" class="hidden" />
                <span class="mauth-checkbox" :class="{ checked: ctx.keepLogin }">
                  <svg v-if="ctx.keepLogin" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span class="mauth-option-text">{{ ctx.t('login.keep_login') }}</span>
              </label>
              <label class="mauth-option">
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
            </div>

            <!-- 登录按钮 -->
            <button type="submit" :disabled="ctx.submitting" class="mauth-submit">
              <span v-if="ctx.submitting" class="mauth-spinner"></span>
              {{ ctx.submitting ? ctx.t('login.logging_in') : ctx.t('login.submit') }}
            </button>
          </form>

          <!-- 第三方登录：未配置 providers 时整行不渲染任何 DOM。
               插在 CTA 之后，表单内的「保持登录 / 阅读同意」两行位置与行为都不受影响。 -->
          <MauthSocialRow
            :providers="ctx.socialProviders"
            :last-provider="ctx.socialLastProvider"
            :disabled="ctx.submitting"
            @select="ctx.actions.selectSocial"
          />

          <!-- 底部注册入口 -->
          <div class="mauth-footer">
            <span>{{ ctx.t('login.no_account', '还没有账号？') }}</span>
            <button class="mauth-register-btn" @click="ctx.actions.goRegister()">{{ ctx.t('login.register_now') }}</button>
          </div>
        </template>
      </main>
    </template>
  </div>
</template>
