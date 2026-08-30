<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AuthContainer from '@/components/common/AuthContainer.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import ResetByCode from './ResetByCode.vue';
import ResetByLink from './ResetByLink.vue';

const { t } = useI18n();
const router = useRouter();

// 密码重置方式由环境变量决定（与后端 PASSWORD_RESET_MODE 对应）
// code：验证码重置 / link：邮件链接重置，只渲染对应组件
const resetMode = (import.meta.env.VITE_PASSWORD_RESET_MODE || 'code') as 'code' | 'link';

function goToLogin() {
  // 从哪来回哪去：标准登录页进入 → 回 /（分发器，标准页）；mini 登录页进入 → 回 /mini-login
  // fromLogin 由各登录页的"忘记密码"链接注入；无标记时默认回标准登录页
  const q = { ...router.currentRoute.value.query };
  const fromLogin = q.fromLogin;
  delete q.fromLogin;
  router.push({ path: fromLogin === 'mini' ? '/mini-login' : '/', query: q });
}
</script>

<template>
  <div class="w-full h-full">
    <AuthContainer :appName="'Enterprise SSO'">
      <template #header>
        <h2 class="text-xl font-bold dark:text-white">{{ t('forgot.title') }}</h2>
        <p class="text-xs text-slate-400 mt-1">{{ t('forgot.desc') }}</p>
      </template>

      <!-- 重置方式由 PASSWORD_RESET_MODE 决定，只渲染一个（无 tab 切换） -->
      <ResetByCode v-if="resetMode === 'code'" />
      <ResetByLink v-else />

      <template #footer>
        <div class="flex items-center justify-center">
          <button @click="goToLogin" class="text-[11px] text-slate-400 hover:text-primary transition-colors">
            ← {{ t('forgot.back_to_login') }}
          </button>
        </div>
      </template>
    </AuthContainer>

    <MessageToast />
  </div>
</template>
