<script setup lang="ts">
/**
 * 无访问权限页（**已认证但没被授予后台角色**）
 *
 * 与 `NoAccess.vue` 的分工：
 *   · `NoAccess.vue`  —— 已进后台，但缺某个具体权限码（挂在 AppShell 里，侧栏还在）
 *   · `AccessDenied.vue`（本页）—— 连后台都进不去（`/session/me` 403），没有侧栏可用
 *
 * 为什么必须单独一页而不是"回登录页"：这类账号的 SSO 身份是有效的，回登录页再登
 * 一次结果完全相同 —— 用户会以为是自己密码打错了，反复重试。这里把原因说清楚，
 * 并给两条真正的出路：换账号 / 退出。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { useRouter } from 'vue-router';
import { LogOut, ShieldOff, UserRoundPlus } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { ThemeScope } from 'skinsuite/vue';
import { useRenderDevice } from '@/view/useRenderDevice';

const router = useRouter();
const auth = useAuthStore();
const device = useRenderDevice();

/**
 * 退出并去登录页（换账号）
 *
 * 失败也要跳：Cookie 清不掉时留在本页只会让用户卡住，跳过去至少能重新走一遍
 * SSO（`bind-session` 会用新身份覆盖旧会话）。
 */
async function switchAccount(): Promise<void> {
  try {
    await auth.logout();
  } finally {
    await router.replace('/login');
  }
}
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
          {{ auth.deniedMessage || '该账号没有管理后台的访问权限，请联系管理员分配角色后再试。' }}
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
