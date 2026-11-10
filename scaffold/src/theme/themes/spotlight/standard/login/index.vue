<script setup lang="ts">
/**
 * 登录页版式 · spotlight（聚光 / 左深右浅）
 *
 * 与 `default`（居中承台）是**同一个页面的两种组织方式**，上下文契约完全一致：
 *   · default   —— 单列居中，最适合"只登录、不解释"
 *   · spotlight —— 左侧深色叙事面板 + 右侧登录卡，适合首次接触、需要讲清"这是什么"
 *
 * 切换：`?th=spotlight`（版式 ≡ 包名）。本包只覆盖 login 页，其余页面回退 default。
 *
 * 版式内不出现任何请求/路由/状态判断 —— 见 `theme/views/login.ts` 的职责划分。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { AlertCircle, Fingerprint, Loader2, RotateCw, ScrollText, ShieldCheck, ShieldOff } from 'lucide-vue-next';
import type { LoginViewProps } from '@/theme/views/login';

defineProps<LoginViewProps>();
</script>

<template>
  <div class="spot">
    <!-- 左：叙事面板（深色板面 + 极淡光斑），窄屏整块让位 -->
    <aside class="spot__aside">
      <span class="spot__brand">
        <span class="spot__mark" aria-hidden="true">C</span>
        <span class="spot__wordmark">管理后台</span>
      </span>

      <div class="spot__lead">
        <h1 class="spot__headline">一套身份<br />管住所有入口</h1>
        <p class="spot__sub">账号、权限、设备与审计收敛到一处，业务系统只认这份凭证。</p>
      </div>

      <ul class="spot__points">
        <li>
          <ShieldCheck :size="16" class="spot__point-icon" />
          <span class="spot__point-body">
            <strong>PBAC 权限</strong>
            <span>接口级放行由后端判定，前端只负责可见性</span>
          </span>
        </li>
        <li>
          <Fingerprint :size="16" class="spot__point-icon" />
          <span class="spot__point-body">
            <strong>设备归一</strong>
            <span>登录即绑定设备身份，异常变更触发二次验证</span>
          </span>
        </li>
        <li>
          <ScrollText :size="16" class="spot__point-icon" />
          <span class="spot__point-body">
            <strong>审计留痕</strong>
            <span>登录、授权与敏感操作分别落库，可回溯</span>
          </span>
        </li>
      </ul>

      <footer class="spot__aside-foot">
        <span class="spot__dot" :class="{ 'is-dev': ctx.isDev }" aria-hidden="true"></span>
        <span>{{ ctx.isDev ? '开发环境' : '生产环境' }}</span>
        <span class="spot__sep" aria-hidden="true">·</span>
        <span>认证服务 oauth21</span>
      </footer>
    </aside>

    <!-- 右：登录卡 -->
    <main class="spot__stage">
      <div class="spot__stage-top">
        <p class="spot__eyebrow">SSO · UNIFIED SIGN-IN</p>
        <button class="spot__reload" type="button" @click="ctx.reload">
          <RotateCw :size="13" />
          重新加载
        </button>
      </div>

      <div class="spot__card">
        <iframe
          :ref="ctx.bindIframe"
          :src="ctx.loginUrl"
          class="spot__iframe"
          title="统一身份认证"
          allow="payment"
          @load="ctx.onIframeLoad"
        ></iframe>

        <div v-if="ctx.loading || ctx.busy" class="spot__mask">
          <div class="spot__skeleton" aria-hidden="true">
            <span class="spot__bone spot__bone--title"></span>
            <span class="spot__bone spot__bone--line"></span>
            <span class="spot__bone spot__bone--input"></span>
            <span class="spot__bone spot__bone--input"></span>
            <span class="spot__bone spot__bone--btn"></span>
          </div>
          <p class="spot__mask-text">
            <Loader2 class="spin" :size="15" />
            {{ ctx.busy ? '正在建立会话…' : '正在加载安全登录…' }}
          </p>
        </div>
      </div>

      <div v-if="ctx.errorMessage" class="spot__alert" :class="{ 'is-denied': ctx.denied }" role="alert">
        <ShieldOff v-if="ctx.denied" :size="18" class="spot__alert-icon" />
        <AlertCircle v-else :size="18" class="spot__alert-icon" />
        <div class="spot__alert-body">
          <p class="spot__alert-title">{{ ctx.denied ? '没有访问权限' : '登录未完成' }}</p>
          <p class="spot__alert-text">{{ ctx.errorMessage }}</p>
        </div>
        <button class="btn btn--ghost btn--sm spot__alert-action" type="button" @click="ctx.reload">
          <RotateCw :size="14" />
          {{ ctx.denied ? '换账号' : '重试' }}
        </button>
      </div>

      <p class="spot__hint">没有账号？请联系管理员开通并分配角色</p>
    </main>
  </div>
</template>

<style scoped>
.spot {
  display: grid;
  grid-template-columns: minmax(300px, 40%) minmax(0, 1fr);
  min-height: 100dvh;
  background: var(--mauth-bg);
  color: var(--mauth-text);
}

/* ── 左：深色叙事面板 ─────────────────────────────────────────── */
.spot__aside {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 40px clamp(24px, 3.4vw, 52px) 28px;
  overflow: hidden;
  background: var(--mauth-plate-bg);
  color: var(--mauth-plate-ink);
}

/* 板面上的一团冷绿光斑：只提亮左下角，不干扰文字对比 */
.spot__aside::after {
  content: '';
  position: absolute;
  inset: auto -20% -30% -20%;
  height: 62%;
  pointer-events: none;
  background: radial-gradient(closest-side, rgba(130, 221, 45, 0.16), transparent);
  filter: blur(14px);
}

.spot__brand {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.spot__mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(150deg, var(--mauth-primary), #164fb8);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.spot__wordmark {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.spot__lead {
  position: relative;
  z-index: 1;
  margin-top: auto;
}

.spot__headline {
  margin: 0 0 10px;
  font-size: clamp(26px, 2.6vw, 34px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.spot__sub {
  margin: 0;
  max-width: 340px;
  color: color-mix(in srgb, var(--mauth-plate-ink) 66%, transparent);
  font-size: 13px;
  line-height: 1.7;
}

.spot__points {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 14px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.spot__points li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.spot__point-icon {
  flex: none;
  margin-top: 2px;
  color: #8bd94f;
}

.spot__point-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.spot__point-body strong {
  font-size: 12.5px;
  font-weight: 600;
}

.spot__point-body span {
  color: color-mix(in srgb, var(--mauth-plate-ink) 56%, transparent);
  font-size: 12px;
  line-height: 1.6;
}

.spot__aside-foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  color: color-mix(in srgb, var(--mauth-plate-ink) 52%, transparent);
  font-size: 11.5px;
}

.spot__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.spot__dot.is-dev {
  background: #8bd94f;
  box-shadow: 0 0 0 3px rgba(139, 217, 79, 0.18);
}

.spot__sep {
  opacity: 0.5;
}

/* ── 右：登录区 ──────────────────────────────────────────────── */
.spot__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px clamp(18px, 3vw, 44px);
  background:
    radial-gradient(closest-side, var(--mauth-primary-soft), transparent) 84% 8% / 40% 50% no-repeat,
    var(--mauth-bg);
}

.spot__stage-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(720px, 100%);
}

.spot__eyebrow {
  margin: 0;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--mauth-text-faint);
}

.spot__reload {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.16s ease;
}

.spot__reload:hover {
  color: var(--mauth-primary);
}

.spot__card {
  position: relative;
  width: min(720px, 100%);
  height: min(484px, 62dvh);
  border-radius: var(--mauth-radius-lg);
  overflow: hidden;
  background: var(--mauth-surface);
  box-shadow:
    0 1px 0 color-mix(in srgb, #fff 55%, transparent) inset,
    0 26px 64px -30px rgba(16, 20, 24, 0.36);
}

.spot__card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--mauth-border);
}

.spot__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.spot__mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--mauth-surface);
}

.spot__skeleton {
  display: flex;
  flex-direction: column;
  gap: 11px;
  width: min(300px, 82%);
}

.spot__bone {
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

.spot__bone--title {
  width: 44%;
  height: 14px;
}

.spot__bone--line {
  width: 64%;
  height: 10px;
}

.spot__bone--input {
  height: 40px;
}

.spot__bone--btn {
  height: 42px;
  border-radius: 10px;
}

.spot__mask-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
}

.spot__alert {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: min(720px, 100%);
  padding: 12px 14px;
  border-radius: var(--mauth-radius-md);
  border: 1px solid color-mix(in srgb, var(--mauth-danger) 26%, transparent);
  background: color-mix(in srgb, var(--mauth-danger-soft) 70%, var(--mauth-surface));
}

.spot__alert.is-denied {
  border-color: color-mix(in srgb, var(--mauth-primary) 26%, transparent);
  background: color-mix(in srgb, var(--mauth-primary-soft) 70%, var(--mauth-surface));
}

.spot__alert-icon {
  flex: none;
  margin-top: 1px;
  color: var(--mauth-danger);
}

.spot__alert.is-denied .spot__alert-icon {
  color: var(--mauth-primary);
}

.spot__alert-body {
  flex: 1;
  min-width: 0;
}

.spot__alert-title {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 620;
}

.spot__alert-text {
  margin: 0;
  color: var(--mauth-text-mid);
  font-size: 12.5px;
  line-height: 1.6;
  word-break: break-word;
}

.spot__alert-action {
  flex: none;
  align-self: center;
}

.spot__hint {
  margin: 0;
  color: var(--mauth-text-faint);
  font-size: 12px;
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

/*
 * 窄屏（≤1024px）：叙事面板整块让位。
 *
 * 它在这时候只会把登录卡挤到折线以下；"这是什么系统"由 iframe 内的品牌栏承担。
 * 顶栏补一个不可见的品牌占位，避免右侧只剩一行英文小字。
 */
@media (max-width: 1024px) {
  .spot {
    grid-template-columns: 1fr;
  }

  .spot__aside {
    display: none;
  }

  .spot__stage {
    justify-content: flex-start;
    padding-top: 18px;
  }

  .spot__card {
    height: min(74dvh, 560px);
  }
}

@media (max-width: 720px) {
  .spot__stage {
    padding: 12px;
    gap: 10px;
  }

  .spot__stage-top {
    display: none;
  }

  .spot__card {
    height: min(66dvh, 520px);
    border-radius: var(--mauth-radius-md);
  }

  .spot__hint {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spot__bone {
    animation: none;
  }
}
</style>
