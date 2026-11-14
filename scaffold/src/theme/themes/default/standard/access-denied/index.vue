<script setup lang="ts">
/**
 * 珍珠玻璃 · 后台准入被拒版式
 *
 * DOM 与搬迁前逐字一致（含 `<ThemeScope page="login">` 那层 token）：这一屏住在应用
 * 外壳之外，没有侧栏也没有自己的配色记录，借登录页的视觉语言才与前一屏连贯。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { LogOut, ShieldOff, UserRoundPlus } from 'lucide-vue-next';
import { ThemeScope } from 'skinsuite/vue';
import type { AccessDeniedViewContext } from '@/theme/views/access-denied';

const props = defineProps<{ ctx: AccessDeniedViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  device,
  message,
  switchAccount
} = props.ctx;
</script>

<template>
  <ThemeScope page="login" :device="device">
    <div class="denied">
      <div class="denied__aura" aria-hidden="true"></div>

      <div class="denied__card" role="alert">
        <span class="denied__icon" aria-hidden="true">
          <ShieldOff :size="22" />
        </span>

        <h1 class="denied__title">没有访问权限</h1>
        <p class="denied__text">
          {{ message }}
        </p>
        <p class="denied__hint">
          这不是密码错误，也不是掉线 —— 你的身份已验证通过，只是这个账号还没被授予后台角色。
        </p>

        <div class="denied__actions">
          <button class="btn btn--primary btn--sm" type="button" @click="switchAccount">
            <UserRoundPlus :size="15" />
            换账号登录
          </button>
          <button class="btn btn--ghost btn--sm" type="button" @click="switchAccount">
            <LogOut :size="15" />
            退出
          </button>
        </div>
      </div>
    </div>
  </ThemeScope>
</template>

<style scoped>
.denied {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 24px;
  overflow: hidden;
  background: var(--mauth-bg);
  isolation: isolate;
}

.denied__aura {
  position: absolute;
  inset: -18% -10% auto -10%;
  height: 70%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(closest-side, var(--mauth-primary-soft), transparent) 20% 20% / 46% 62% no-repeat,
    radial-gradient(closest-side, var(--mauth-danger-soft), transparent) 84% 76% / 38% 54% no-repeat;
  filter: blur(12px);
}

.denied__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: min(460px, 100%);
  padding: 32px 28px 26px;
  border-radius: var(--mauth-radius-lg);
  border: 1px solid var(--mauth-border);
  background: var(--mauth-surface);
  box-shadow:
    0 1px 0 color-mix(in srgb, #fff 55%, transparent) inset,
    0 24px 60px -30px rgba(16, 20, 24, 0.32);
  text-align: center;
  animation: rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.denied__icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 4px;
  border-radius: 14px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.denied__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.denied__text {
  margin: 0;
  color: var(--mauth-text-mid);
  font-size: 13.5px;
  line-height: 1.7;
}

.denied__hint {
  margin: 2px 0 6px;
  color: var(--mauth-text-faint);
  font-size: 12px;
  line-height: 1.65;
}

.denied__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .denied__card {
    animation: none;
  }
}
</style>
