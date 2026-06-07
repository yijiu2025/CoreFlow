<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AuthContainer from '@/components/common/AuthContainer.vue'
import MessageToast from '@/components/common/MessageToast.vue'
import ResetByCode from './ResetByCode.vue'
import ResetByLink from './ResetByLink.vue'

const { t } = useI18n()
const router = useRouter()
const activeTab = ref<'code' | 'link'>('code')

function goToLogin() {
  router.push({ path: '/mini-login', query: router.currentRoute.value.query })
}
</script>

<template>
  <div class="w-full h-full">
    <AuthContainer
      :appName="'Enterprise SSO'"
      :styleType="'horizontal'"
      :showQrSwitcher="false"
    >
      <template #header>
        <h2 class="text-xl font-bold dark:text-white">{{ t('forgot.title') }}</h2>
        <p class="text-xs text-slate-400 mt-1">{{ t('forgot.desc') }}</p>
      </template>

      <!-- 方式切换 -->
      <div class="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl mb-6 border border-slate-100 dark:border-slate-800">
        <button
          type="button"
          @click="activeTab = 'code'"
          :class="activeTab === 'code' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'"
          class="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
        >
          {{ t('forgot.by_code') }}
        </button>
        <button
          type="button"
          @click="activeTab = 'link'"
          :class="activeTab === 'link' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'"
          class="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
        >
          {{ t('forgot.by_link') }}
        </button>
      </div>

      <!-- 方式一：验证码重置 -->
      <ResetByCode v-if="activeTab === 'code'" />

      <!-- 方式二：邮件链接重置 -->
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
