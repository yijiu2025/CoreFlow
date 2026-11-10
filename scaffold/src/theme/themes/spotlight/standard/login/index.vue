<script setup lang="ts">
/**
 * 登录页版式 · spotlight（聚光 / 左深右浅）
 *
 * 与 `default`（居中承台）是**同一个页面的两种组织方式**，上下文契约完全一致：
 *   · default   —— 单列居中，最适合"只登录、不解释"
 *   · spotlight —— 左侧深色叙事面板 + 右侧登录卡，适合首次接触、需要讲清"这是什么"
 *
 * 版式内不出现任何请求/路由/状态判断 —— 见 `theme/views/login.ts` 的职责划分。
 *
 * === 竖排节奏（这一版重做的重点）===
 * 深色面板最怕"上面一个 logo、下面一段话，中间空一大片"：那不叫留白，那叫没排完。
 * 这里把内容分三段并**居中对齐**（叙事块 / 能力清单 / 页脚），左右对称的负空间才像
 * 设计；另加一枚巨大的字标水印压住右上角，让空处有东西可看。
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
    <!-- 左：叙事面板 -->
    <aside class="spot__aside">
      <span class="spot__watermark" aria-hidden="true">C</span>
      <span class="spot__ruler" aria-hidden="true"></span>

      <div class="spot__aside-inner">
        <span class="spot__brand">
          <span class="spot__mark" aria-hidden="true">C</span>
          <span class="spot__wordmark">管理后台</span>
        </span>

        <div class="spot__lead">
          <p class="spot__eyebrow">SSO · UNIFIED SIGN-IN</p>
          <h1 class="spot__headline">一套身份<br />管住所有入口</h1>
          <p class="spot__sub">账号、权限、设备与审计收敛到一处，业务系统只认这份凭证。</p>
        </div>

        <ul class="spot__points">
          <li>
            <span class="spot__point-tile"><ShieldCheck :size="15" /></span>
            <span class="spot__point-body">
              <strong>PBAC 权限</strong>
              <span>接口级放行由后端判定，前端只负责可见性</span>
            </span>
          </li>
          <li>
            <span class="spot__point-tile"><Fingerprint :size="15" /></span>
            <span class="spot__point-body">
              <strong>设备归一</strong>
              <span>登录即绑定设备身份，异常变更触发二次验证</span>
            </span>
          </li>
          <li>
            <span class="spot__point-tile"><ScrollText :size="15" /></span>
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
          <span class="spot__sep" aria-hidden="true">·</span>
          <span>© {{ new Date().getFullYear() }}</span>
        </footer>
      </div>
    </aside>

    <!-- 右：登录区 -->
    <main class="spot__stage">
      <span class="spot__halo" aria-hidden="true"></span>

      <div class="spot__stage-inner">
        <header class="spot__stage-top">
          <p class="spot__stage-label">账号登录</p>
          <button class="spot__reload" type="button" @click="ctx.reload">
            <RotateCw :size="13" />
            重新加载
          </button>
        </header>

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

        <p class="spot__stage-foot">
          登录即表示同意《服务协议》与《隐私政策》
          <span class="spot__sep" aria-hidden="true">·</span>
          没有账号请联系管理员开通
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.spot {
  display: grid;
  grid-template-columns: minmax(320px, 38%) minmax(0, 1fr);
  min-height: 100dvh;
  background: var(--mauth-bg);
  color: var(--mauth-text);
}

/* ── 左：深色叙事面板 ─────────────────────────────────────────── */
.spot__aside {
  position: relative;
  display: flex;
  padding: 34px clamp(24px, 3vw, 46px);
  overflow: hidden;
  background: var(--mauth-plate-bg);
  color: var(--mauth-plate-ink);
  isolation: isolate;
}

/* 左下角一团冷绿光：只提亮边缘，不干扰文字对比 */
.spot__aside::after {
  content: '';
  position: absolute;
  inset: auto -18% -26% -18%;
  height: 58%;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(closest-side, rgba(130, 221, 45, 0.18), transparent);
  filter: blur(16px);
}

/*
 * 巨大字标水印：压住右上角
 *
 * 作用不是装饰，是**给空处一个主体** —— 深色面板面积大、文字少，没有这一层时
 * 中间是一片死黑（实测原版有一条约 270px 的纯空带）。
 */
.spot__watermark {
  position: absolute;
  top: -6%;
  right: -8%;
  z-index: -1;
  font-size: clamp(220px, 26vw, 380px);
  font-weight: 800;
  line-height: 0.82;
  letter-spacing: -0.06em;
  color: rgba(255, 255, 255, 0.035);
  user-select: none;
  pointer-events: none;
}

/* 右缘刻度：细密短横，给面板一条"收边"，与后台的仪器化语汇呼应 */
.spot__ruler {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 18px;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.14) 0 1px,
    transparent 1px 14px
  );
  mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  opacity: 0.6;
}

.spot__aside-inner {
  display: flex;
  flex-direction: column;
  gap: 30px;
  width: 100%;
  max-width: 372px;
  margin: auto 0;      /* 上下对称留白：比"顶部堆一起"更像排版 */
}

.spot__brand {
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
  box-shadow: 0 8px 20px -8px rgba(35, 109, 233, 0.8);
}

.spot__wordmark {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.spot__eyebrow {
  margin: 0 0 12px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: color-mix(in srgb, var(--mauth-plate-ink) 46%, transparent);
}

.spot__headline {
  margin: 0 0 12px;
  font-size: clamp(26px, 2.4vw, 34px);
  font-weight: 720;
  line-height: 1.18;
  letter-spacing: -0.025em;
}

.spot__sub {
  margin: 0;
  max-width: 330px;
  color: color-mix(in srgb, var(--mauth-plate-ink) 64%, transparent);
  font-size: 13px;
  line-height: 1.75;
}

.spot__points {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每条一条细分隔线：把三行走廊串起来，纵向不再发散 */
.spot__points li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.spot__points li:first-child {
  border-top: 0;
  padding-top: 0;
}

.spot__point-tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  margin-top: 1px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  color: #8bd94f;
}

.spot__point-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.spot__point-body strong {
  font-size: 12.5px;
  font-weight: 620;
}

.spot__point-body span {
  color: color-mix(in srgb, var(--mauth-plate-ink) 54%, transparent);
  font-size: 12px;
  line-height: 1.6;
}

.spot__aside-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: color-mix(in srgb, var(--mauth-plate-ink) 50%, transparent);
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
  opacity: 0.45;
}

/* ── 右：登录区 ──────────────────────────────────────────────── */
.spot__stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px clamp(18px, 3vw, 48px);
  overflow: hidden;
  background: var(--mauth-bg);
  isolation: isolate;
}

/* 卡片背后的一团柔光：让白色卡片从背景上"浮"起来，而不是贴在纸上 */
.spot__halo {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: -1;
  width: min(860px, 92%);
  height: min(640px, 82%);
  translate: -50% -50%;
  pointer-events: none;
  background:
    radial-gradient(closest-side, var(--mauth-primary-soft), transparent 72%),
    radial-gradient(closest-side, var(--mauth-success-soft), transparent 70%) 82% 84% / 60% 60% no-repeat;
  filter: blur(6px);
  opacity: 0.9;
}

.spot__stage-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(760px, 100%);
}

.spot__stage-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.spot__stage-label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--mauth-text-mid);
}

.spot__reload {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}

.spot__reload:hover {
  color: var(--mauth-primary);
  background: var(--mauth-hover);
}

.spot__card {
  position: relative;
  width: 100%;
  height: min(484px, 60dvh);
  border-radius: var(--mauth-radius-lg);
  overflow: hidden;
  background: var(--mauth-surface);
  box-shadow:
    0 1px 0 color-mix(in srgb, #fff 60%, transparent) inset,
    0 30px 70px -34px rgba(16, 20, 24, 0.42),
    0 2px 10px -4px rgba(16, 20, 24, 0.14);
}

.spot__card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--mauth-border-strong);
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
  width: min(320px, 84%);
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

.spot__stage-foot {
  margin: 0;
  text-align: center;
  color: var(--mauth-text-faint);
  font-size: 11.5px;
  line-height: 1.6;
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
 * 它这时只会把登录卡挤到折线以下；"这是什么系统"由 iframe 内的品牌栏承担。
 */
@media (max-width: 1024px) {
  .spot {
    grid-template-columns: 1fr;
  }

  .spot__aside {
    display: none;
  }

  .spot__stage {
    padding-top: 16px;
  }

  .spot__card {
    height: min(72dvh, 560px);
  }
}

@media (max-width: 720px) {
  .spot__stage {
    padding: 12px;
  }

  .spot__stage-inner {
    gap: 8px;
  }

  .spot__stage-top,
  .spot__stage-foot {
    display: none;
  }

  .spot__card {
    height: min(66dvh, 520px);
    border-radius: var(--mauth-radius-md);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spot__bone {
    animation: none;
  }
}
</style>
