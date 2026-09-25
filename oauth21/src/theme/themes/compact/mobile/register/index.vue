<script setup lang="ts">
/**
 * 注册页 · 轻版式（`theme/themes/default/register/compact/`）—— **参考实现 / 变体模板**
 *
 * 存在的意义有两个：
 *   1. 证明机制跑得通：`?view=compact` 或主题包声明 `views.register: 'compact'` 时，
 *      这个 chunk 才会被动态加载（基础版式不在其中）。
 *   2. 给后续版式一个可照抄的骨架 —— 复制这个目录、改结构即可，业务一行都不用碰。
 *
 * === 与基础版式的差别（仅版式层面）===
 *   • 顶部不再是大 logo + 进度条，改成「返回 + 主题开关」一行 + 步骤点（dots）
 *   • 标题区下移到表单上方，并展示 `ctx.appName`（基础版式不展示）
 *   • 表单收进一张卡片，间距更紧
 * 功能面**完全一致**：字段、验证码、错误态、密码明文开关、核对摘要、协议勾选、
 * 加载态、返回、去登录 —— 一个不少（数据与动作全部来自 `ctx`）。
 *
 * === 版式作者的约束（详见 ../types.ts）===
 * 只读 `ctx`、只调 `ctx.actions`；**不写**任何请求 / 校验 / 路由 / store。
 * 样式可以自带 `<style scoped>`，但取值一律用 `--mauth-*` token（裸色值会在
 * 换配色或切深色时漏色）。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import { ref, toRef } from 'vue';
import MauthThemeSwitch from '@/components/auth/MauthThemeSwitch.vue';
import type { RegisterViewProps } from '@/theme/views/register';

const props = defineProps<RegisterViewProps>();
const ctx = toRef(props, 'ctx');

// 纯展示状态（与基础版式各自独立，互不影响）
const showPwd = ref(false);
const showConfirmPwd = ref(false);
</script>

<template>
  <!-- data-mauth-view：版式自己声明身份，便于排查"现在到底是哪套 UI"（基础版式同样带） -->
  <div class="mauth-page mreg" data-mauth-view="compact">
    <!-- 顶部工具行：返回 + 主题开关（嵌 iframe 时自动隐藏） -->
    <header class="mreg-top">
      <button class="mauth-back-btn" :aria-label="ctx.t('register.prev')" @click="ctx.actions.back()">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <MauthThemeSwitch />
    </header>

    <main class="mauth-body">
      <!-- 标题区：应用名 + 标题 + 步骤副标题 + 步骤点 -->
      <div class="mreg-head">
        <p v-if="ctx.appName" class="mreg-app">{{ ctx.appName }}</p>
        <h1 class="mreg-title">{{ ctx.t('register.title') }}</h1>
        <p class="mreg-sub">{{ ctx.subtitle }}</p>
        <div
          class="mreg-dots"
          role="progressbar"
          :aria-valuenow="ctx.step"
          aria-valuemin="1"
          :aria-valuemax="ctx.totalSteps"
        >
          <span v-for="n in ctx.totalSteps" :key="n" class="mreg-dot" :class="{ 'is-on': n <= ctx.step }"></span>
        </div>
      </div>

      <transition :name="ctx.direction === 'next' ? 'mauth-slide-next' : 'mauth-slide-prev'" mode="out-in">
        <!-- 步骤 1：用户名 + 邮箱 + 验证码 -->
        <section v-if="ctx.step === 1" key="1" class="mreg-card">
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

          <button type="button" class="mauth-submit mreg-cta" :disabled="!ctx.codeSent" @click="ctx.actions.nextStep(2)">
            {{ ctx.t('register.next') }}
          </button>
        </section>

        <!-- 步骤 2：密码 -->
        <section v-else-if="ctx.step === 2" key="2" class="mreg-card">
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

          <button type="button" class="mauth-submit mreg-cta" @click="ctx.actions.nextStep(3)">{{ ctx.t('register.next') }}</button>
        </section>

        <!-- 步骤 3：核对信息 + 协议 + 提交 -->
        <section v-else key="3" class="mreg-card">
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

          <button type="button" class="mauth-submit mreg-cta" :disabled="!ctx.canSubmit" @click="ctx.actions.submit()">
            <span v-if="ctx.submitting" class="mauth-spinner"></span>
            {{ ctx.submitting ? ctx.t('register.submitting') : ctx.t('register.submit') }}
          </button>
        </section>
      </transition>

      <!-- 已有账号 → 回登录 -->
      <div class="mauth-footer">
        <span>{{ ctx.t('register.signin_hint') }}</span>
        <button class="mauth-register-btn" @click="ctx.actions.goLogin()">{{ ctx.t('register.signin_link') }}</button>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
/* 本版式独有的结构样式；**取值一律用 --mauth-* token**（裸色值会在换配色/切深色时漏色）。
   需要全局共享的（字段、按钮、摘要、协议、页脚）直接复用 mobile-auth.scss 的 mauth-* 类。 */
.mreg-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mauth-pad-header-t) var(--mauth-pad-header-x) 0;
  /* 🔴 必须与 mauth-body 同色（默认包用 .mauth-header background=--mauth-header-bg
     = --mauth-surface 也跟 body 同色 → 整片连续，看不出分界）。
     不写 background 时这里是透明的 → 透出 .mauth-page 的 --mauth-bg（更深），
     跟 body 的 --mauth-surface 之间出现一道色阶线（实测黑色主题下 60px 高度处
     #020617 → #0f172a 的色差非常明显，default 包下不存在）。
     用 --mauth-body-bg 而非 --mauth-surface：blue 主题 tokens 把两个都设成
     transparent（让渐变透上来），同走 --mauth-body-bg 才能保持「两个区域一起
     透明 → 渐变整片覆盖」的对称。 */
  background: var(--mauth-body-bg);
}

.mreg-head {
  margin-bottom: var(--mauth-gap-cell);
}

.mreg-app {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mauth-text-faint);
}

.mreg-title {
  margin: 0;
  font-size: var(--mauth-title-size);
  font-weight: 800;
  line-height: 1.2;
  color: var(--mauth-title-fg);
}

.mreg-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--mauth-sub-fg);
}

/* 步骤点：取代基础版式的整条进度条 */
.mreg-dots {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}

.mreg-dot {
  width: 22px;
  height: 3px;
  border-radius: 2px;
  background: var(--mauth-progress-bg);
  transition: background 0.2s;
}

.mreg-dot.is-on {
  background: var(--mauth-progress-fill);
}

/* 表单收进一张卡（基础版式是三段平铺） */
.mreg-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--mauth-pad-body-x);
  background: var(--mauth-surface);
  border: 1px solid var(--mauth-border);
  border-radius: calc(var(--mauth-radius) + 4px);
}

.mreg-cta {
  margin-top: 12px;
}

/* 矮屏 / 横屏：把标题区压扁，保证按钮可见（与基础版式的断点口径一致） */
@media (max-height: 700px) {
  .mreg-title {
    font-size: 18px;
  }

  .mreg-sub,
  .mreg-dots {
    display: none;
  }
}

@media (orientation: landscape) and (max-height: 560px) {
  .mreg-top {
    padding-top: 12px;
  }

  .mreg-head {
    margin-bottom: 10px;
  }

  .mreg-app {
    display: none;
  }
}
</style>
