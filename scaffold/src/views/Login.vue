<script setup lang="ts">
/**
 * 登录页：iframe 嵌 oauth21 `/mini-login`
 *
 * 不在本页实现账号密码表单 —— 认证由 oauth21 统一承担（单一认证入口），
 * console 只负责「拿会话、绑定 Cookie、拉权限」。
 *
 * === 视觉上的三条取舍 ===
 *  1. **不再套一层卡片**：iframe 里已经是 oauth21 的成品卡片（854×484，自带品牌栏与
 *     圆角阴影），外面再包一张带标题栏的白卡就是"卡中卡"。这里只留一层极淡的光晕与
 *     描边，让那张卡片本身就是页面的主体。
 *  2. **不重复品牌**：iframe 内已有 appName + 欢迎语；页面级只保留一枚字标 + 一句定位，
 *     避免两个"品牌区"互相抢注意力。
 *  3. **错误是一等公民**：准入被拒（403）与网络故障的语气、动作不同 —— 前者引导
 *     「换账号 / 找管理员」，后者给「重试」。见 `useSsoLogin` 的 `denied`。
 *
 * 登录表单的外观（版式 / 配色）由 oauth21 主题机制决定，宿主通过 iframe 的
 * `?th` / `?th_color` 覆盖，见 `composables/useSsoLogin.ts` 文件头。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { useRoute, useRouter } from 'vue-router';
import { AlertCircle, ArrowRight, Loader2, RotateCw, ShieldOff } from 'lucide-vue-next';
import { ThemeScope } from 'skinsuite/vue';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/view/useRenderDevice';
import { useSsoLogin } from '@/composables/useSsoLogin';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
/** 登录页独立页面域（page=login）：配色与后台壳分开，见 theme/views/login.ts */
const device = useRenderDevice();

const { iframeRef, loading, errorMessage, busy, denied, loginUrl, reload, onIframeLoad } = useSsoLogin(async () => {
  const ok = await auth.load(true);
  if (!ok) throw new Error('会话已建立，但读取用户信息失败');
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
  await router.replace(redirect);
});

/** 环境标记：页脚标出来，避免把测试实例当成生产 */
const isDev = import.meta.env.DEV;
</script>

<template>
  <ThemeScope page="login" :device="device">
    <div class="login">
      <!-- 背景：两团柔光 + 极淡网格（网格靠 mask 在中心淡出，不与卡片抢） -->
      <div class="login__aura" aria-hidden="true"></div>
      <div class="login__grid" aria-hidden="true"></div>

      <header class="login__top">
        <span class="login__brand">
          <span class="login__mark" aria-hidden="true">C</span>
          <span class="login__wordmark">管理后台</span>
        </span>
        <span class="login__env" :class="{ 'is-dev': isDev }">
          <span class="login__env-dot" aria-hidden="true"></span>
          {{ isDev ? '开发环境' : '生产环境' }}
        </span>
      </header>

      <main class="login__main">
        <div class="login__intro">
          <p class="login__eyebrow">SSO · UNIFIED SIGN-IN</p>
          <h1 class="login__title">登录你的控制台</h1>
          <p class="login__sub">
            一个账号进入全部业务系统。身份、权限与审计由后台统一管理，本应用只保存会话 Cookie，不接触任何密码。
          </p>
        </div>

        <div class="login__card">
          <iframe
            ref="iframeRef"
            :src="loginUrl"
            class="login__iframe"
            title="统一身份认证"
            allow="payment"
            @load="onIframeLoad"
          ></iframe>

          <!-- 加载态：骨架条而不是纯转圈 —— "正在加载"要有形状，否则看着像卡死 -->
          <div v-if="loading || busy" class="login__mask">
            <div class="login__skeleton" aria-hidden="true">
              <span class="login__bone login__bone--mark"></span>
              <span class="login__bone login__bone--title"></span>
              <span class="login__bone login__bone--line"></span>
              <span class="login__bone login__bone--input"></span>
              <span class="login__bone login__bone--input"></span>
              <span class="login__bone login__bone--btn"></span>
            </div>
            <p class="login__mask-text">
              <Loader2 class="spin" :size="15" />
              {{ busy ? '正在建立会话…' : '正在加载安全登录…' }}
            </p>
          </div>
        </div>

        <!-- 失败提示：403（无权限）与其它故障分开说，动作也不同 -->
        <div v-if="errorMessage" class="login__alert" :class="{ 'is-denied': denied }" role="alert">
          <ShieldOff v-if="denied" :size="18" class="login__alert-icon" />
          <AlertCircle v-else :size="18" class="login__alert-icon" />
          <div class="login__alert-body">
            <p class="login__alert-title">{{ denied ? '没有访问权限' : '登录未完成' }}</p>
            <p class="login__alert-text">{{ errorMessage }}</p>
          </div>
          <button class="btn btn--ghost btn--sm login__alert-action" type="button" @click="reload">
            <RotateCw :size="14" />
            {{ denied ? '换账号' : '重试' }}
          </button>
        </div>

        <div class="login__hint">
          <span>没有账号？请联系管理员开通并分配角色</span>
          <button class="login__link" type="button" @click="reload">
            重新加载
            <ArrowRight :size="13" />
          </button>
        </div>
      </main>

      <footer class="login__meta">
        <span>CoreFlow · 管理后台</span>
        <span class="login__meta-sep" aria-hidden="true">·</span>
        <span>认证服务 oauth21</span>
        <span class="login__meta-sep" aria-hidden="true">·</span>
        <span>© {{ new Date().getFullYear() }}</span>
      </footer>
    </div>
  </ThemeScope>
</template>

<style scoped>
.login {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: 22px clamp(20px, 4vw, 56px) 18px;
  overflow: hidden;
  background: var(--mauth-bg);
  color: var(--mauth-text);
  isolation: isolate;
}

/* 柔光：主色在左上、叶绿在右下；用 blur 铺开，避免大半径渐变的色带 */
.login__aura {
  position: absolute;
  inset: -20% -10% auto -10%;
  height: 74%;
  z-index: -2;
  pointer-events: none;
  background:
    radial-gradient(closest-side, var(--mauth-primary-soft), transparent) 14% 16% / 44% 66% no-repeat,
    radial-gradient(closest-side, var(--mauth-success-soft), transparent) 88% 78% / 40% 58% no-repeat;
  filter: blur(12px);
}

/* 网格：极细，中心淡出 —— 只在边缘可见 */
.login__grid {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(to right, var(--mauth-border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--mauth-border) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(120% 90% at 50% 42%, #000 8%, transparent 72%);
  opacity: 0.5;
}

.login__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.login__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.login__mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(150deg, var(--mauth-primary), #164fb8);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--mauth-primary) 70%, transparent);
}

.login__wordmark {
  font-size: 14px;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.login__env {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--mauth-border);
  background: color-mix(in srgb, var(--mauth-surface) 60%, transparent);
  color: var(--mauth-text-soft);
  font-size: 11.5px;
  backdrop-filter: blur(8px);
}

.login__env.is-dev {
  color: var(--mauth-primary);
  border-color: color-mix(in srgb, var(--mauth-primary) 30%, transparent);
}

.login__env-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.login__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 28px 0 22px;
}

.login__intro {
  width: min(854px, 100%);
  text-align: center;
  animation: rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.login__eyebrow {
  margin: 0 0 10px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--mauth-text-faint);
}

.login__title {
  margin: 0 0 8px;
  font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.login__sub {
  margin: 0 auto;
  max-width: 560px;
  color: var(--mauth-text-mid);
  font-size: 13.5px;
  line-height: 1.75;
}

/* 卡片只是 iframe 的"承台"：无标题栏、无内边距，描边与阴影都极淡 */
.login__card {
  position: relative;
  width: min(854px, 100%);
  height: 484px;
  border-radius: var(--mauth-radius-lg);
  overflow: hidden;
  background: var(--mauth-surface);
  box-shadow:
    0 1px 0 color-mix(in srgb, #fff 55%, transparent) inset,
    0 24px 60px -28px rgba(16, 20, 24, 0.34),
    0 2px 10px -4px rgba(16, 20, 24, 0.12);
  animation: rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both;
}

.login__card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--mauth-border);
}

.login__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

/* 加载遮罩：同色底 + 骨架，弱化白屏闪烁 */
.login__mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 32px;
  background: var(--mauth-surface);
  animation: fade 0.2s ease both;
}

.login__skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(340px, 80%);
}

.login__bone {
  display: block;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    var(--mauth-surface-2) 0%,
    color-mix(in srgb, var(--mauth-border) 55%, var(--mauth-surface)) 50%,
    var(--mauth-surface-2) 100%
  );
  background-size: 220% 100%;
  animation: shimmer 1.25s linear infinite;
}

.login__bone--mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.login__bone--title {
  width: 46%;
  height: 15px;
}

.login__bone--line {
  width: 68%;
  height: 10px;
}

.login__bone--input {
  height: 40px;
}

.login__bone--btn {
  height: 42px;
  margin-top: 4px;
  border-radius: 10px;
}

.login__mask-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
}

/* 失败提示：与卡片同宽，左图标 + 文案 + 右动作 */
.login__alert {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: min(854px, 100%);
  padding: 13px 14px;
  border-radius: var(--mauth-radius-md);
  border: 1px solid color-mix(in srgb, var(--mauth-danger) 26%, transparent);
  background: color-mix(in srgb, var(--mauth-danger-soft) 70%, var(--mauth-surface));
  animation: rise 0.28s ease both;
}

.login__alert.is-denied {
  border-color: color-mix(in srgb, var(--mauth-primary) 26%, transparent);
  background: color-mix(in srgb, var(--mauth-primary-soft) 70%, var(--mauth-surface));
}

.login__alert-icon {
  flex: none;
  margin-top: 1px;
  color: var(--mauth-danger);
}

.login__alert.is-denied .login__alert-icon {
  color: var(--mauth-primary);
}

.login__alert-body {
  min-width: 0;
  flex: 1;
}

.login__alert-title {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 620;
}

.login__alert-text {
  margin: 0;
  color: var(--mauth-text-mid);
  font-size: 12.5px;
  line-height: 1.6;
  word-break: break-word;
}

.login__alert-action {
  flex: none;
  align-self: center;
}

.login__hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 14px;
  color: var(--mauth-text-faint);
  font-size: 12px;
}

.login__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.16s ease;
}

.login__link:hover {
  color: var(--mauth-primary);
}

.login__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--mauth-text-faint);
  font-size: 11.5px;
}

.login__meta-sep {
  opacity: 0.6;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 平板：卡片按宽度收缩（iframe 内 <lg 会自己隐藏品牌栏） */
@media (max-width: 980px) {
  .login__card {
    height: 470px;
  }
}

/*
 * 手机（≤720px）：只留字标 + 卡片。
 *
 * 标题与说明在窄屏会把卡片挤到折线以下 —— 它们的职责（说明这是什么系统）由
 * iframe 内的品牌栏承担，这里整块让位。卡片高度用 dvh：地址栏伸缩不会跳。
 */
@media (max-width: 720px) {
  .login {
    padding: 14px 14px 12px;
  }

  .login__main {
    gap: 14px;
    padding: 10px 0 12px;
    justify-content: flex-start;
  }

  .login__intro {
    text-align: left;
  }

  .login__eyebrow,
  .login__sub {
    display: none;
  }

  .login__title {
    font-size: 18px;
    margin: 2px 0 0;
  }

  .login__card {
    height: min(66dvh, 520px);
    border-radius: var(--mauth-radius-md);
  }

  .login__meta {
    font-size: 11px;
  }
}

/* 尊重系统偏好：动效直接不播（不是缩短） */
@media (prefers-reduced-motion: reduce) {
  .login__intro,
  .login__card,
  .login__alert,
  .login__mask,
  .login__bone {
    animation: none;
  }
}
</style>
