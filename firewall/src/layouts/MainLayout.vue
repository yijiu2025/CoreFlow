<template>
  <div class="w-screen h-screen transition-colors duration-500 relative overflow-hidden font-outfit bg-[var(--bg)] text-[var(--text)]">
    <!-- 背景扫描线 -->
    <div v-if="isDarkMode" class="fixed inset-0 pointer-events-none opacity-20 overflow-hidden z-[60]">
      <div class="scan-line"></div>
    </div>

    <!-- 背景地图 -->
    <div class="bg-mesh" :class="{ 'light': !isDarkMode }"></div>
    <div class="absolute inset-0 z-0 overflow-hidden">
      <MapChart :events="wsEvents" :server-node="serverPosition" :is-dark="isDarkMode"
        :show-trajectory="securitySettings.showTrajectory" />
    </div>

    <!-- UI 层 -->
    <div class="absolute inset-0 z-10 pointer-events-none flex flex-col">
      <!-- HUD 切换按钮 -->
      <div class="fixed bottom-6 right-6 pointer-events-auto z-[70]">
        <button @click="uiStore.toggleUI()" class="glass p-4 rounded-full transition-all group shadow-2xl"
          :class="isDarkMode ? 'hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'hover:bg-indigo-500/10 text-indigo-600 border-indigo-200'"
          :title="isUIVisible ? $t('hud.hide') : $t('hud.show')">
          <Monitor v-if="isUIVisible" class="w-6 h-6 group-hover:scale-110 transition-transform" />
          <Layout v-else class="w-6 h-6 animate-pulse" />
        </button>
      </div>

      <!-- 顶部导航栏 -->
      <TheHeader
        :is-dark-mode="isDarkMode"
        :is-ui-visible="isUIVisible"
        :locale="locale"
        :summary="summary"
        @toggle-lang="uiStore.toggleLang()"
        @toggle-theme="uiStore.toggleTheme()"
        @open-settings="defenseStore.isSettingsModalOpen = true">
        <template #user-avatar>
          <UserProfileDropdown
            :is-dark-mode="isDarkMode"
            :is-open="isUserProfileOpen"
            @toggle="isUserProfileOpen = !isUserProfileOpen"
            @close="isUserProfileOpen = false"
            @login="isLoginModalOpen = true"
          />
        </template>
      </TheHeader>

      <!-- 页面内容 -->
      <transition name="fade-ui">
        <div v-if="isUIVisible" class="flex-1 relative pointer-events-none">
          <RouterView />
        </div>
      </transition>
    </div>

    <!-- 全局模态框 -->
    <SecurityConsoleModal
      :is-open="defenseStore.isConfigModalOpen"
      :is-dark-mode="isDarkMode"
      :configs="configs"
      z-index="z-[5000]"
      @close="defenseStore.isConfigModalOpen = false"
      @toggle="configsStore.toggleGuard"
      @toggleSystem="configsStore.toggleSystem"
      @edit="configsStore.openEditModal"
      @saveNode="configsStore.handleSaveNode"
      @reset="configsStore.resetGuard" />

    <SystemSettingsModal
      :is-open="defenseStore.isSettingsModalOpen"
      @close="defenseStore.isSettingsModalOpen = false" />

    <PolicyEditModal
      :is-open="defenseStore.isModalOpen"
      :is-dark-mode="isDarkMode"
      :form="configsStore.editForm"
      :editing-system="configsStore.editingSystem"
      :editing-group="configsStore.editingGroup"
      :editing-api="configsStore.editingApi"
      @close="defenseStore.isModalOpen = false"
      @save="configsStore.saveConfig" />

    <DefenseManagementModal
      :is-open="defenseStore.isDefenseModalOpen"
      @close="defenseStore.isDefenseModalOpen = false" />

    <LoginModal
      :is-open="isLoginModalOpen"
      @close="isLoginModalOpen = false"
      @login-success="handleLoginSuccess"
      @max-sessions="handleMaxSessions" />
  </div>
</template>

<script setup lang="ts">
/**
 * 主布局组件
 * 职责：组合地图、导航栏、页面内容、全局模态框
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Monitor, Layout } from 'lucide-vue-next'

import { useUiStore } from '@/stores/ui'
import { useDashboardStore } from '@/stores/dashboard'
import { useSettingsStore } from '@/stores/settings'
import { useConfigsStore } from '@/stores/configs'
import { useDefenseStore } from '@/stores/defense'
import { useAuthStore } from '@/stores/auth'
import { useCache } from '@/composables/useCache'
import { firewallApi } from '@/api/firewall'

import MapChart from '@/components/MapChart.vue'
import TheHeader from '@/components/layout/TheHeader.vue'
import UserProfileDropdown from '@/components/layout/UserProfileDropdown.vue'
import DefenseManagementModal from '@/components/modals/DefenseManagementModal.vue'
import SecurityConsoleModal from '@/components/modals/SecurityConsoleModal.vue'
import SystemSettingsModal from '@/components/modals/SystemSettingsModal.vue'
import PolicyEditModal from '@/components/modals/PolicyEditModal.vue'
import LoginModal from '@/components/modals/LoginModal.vue'

const cache = useCache('localStorage')
const { locale } = useI18n()

// Stores
const uiStore = useUiStore()
const dashboardStore = useDashboardStore()
const settingsStore = useSettingsStore()
const configsStore = useConfigsStore()
const defenseStore = useDefenseStore()
const authStore = useAuthStore()

const isLoginModalOpen = ref(false)
const isUserProfileOpen = ref(false)
const showMaxSessionsModal = ref(false)
const maxSessionsData = ref<any>(null)

// 监听 auth store 的 showLoginModal（API 层 401 时自动触发）
watch(() => authStore.showLoginModal, (val) => {
  if (val) {
    isLoginModalOpen.value = true
    authStore.showLoginModal = false
  }
})

// 按需加载：打开安全控制台时加载配置
watch(() => defenseStore.isConfigModalOpen, (val) => {
  if (val) fetchConfigsOnDemand()
})

// 按需加载：打开设置/防御管理时加载设置和封禁数据
watch(() => defenseStore.isSettingsModalOpen, (val) => {
  if (val) fetchSettingsOnDemand()
})

watch(() => defenseStore.isDefenseModalOpen, (val) => {
  if (val) fetchSettingsOnDemand()
})

// 响应式状态
const { isDarkMode, isUIVisible, loading } = storeToRefs(uiStore)
const { summary, wsEvents, serverPosition } = storeToRefs(dashboardStore)
const { securitySettings } = storeToRefs(settingsStore)
const { configs } = storeToRefs(configsStore)

// 初始化数据（仅加载 WebSocket 实时数据，其他按需加载）
async function fetchData(): Promise<void> {
  loading.value = true
  try {
    await dashboardStore.fetchSummary()
  } catch (err) {
    console.error('⚠️ 初始化数据失败:', err)
  } finally {
    loading.value = false
  }
}

// 按需加载：打开安全控制台时
async function fetchConfigsOnDemand(): Promise<void> {
  if (!configsStore.loaded) {
    await configsStore.fetchConfigs()
  }
}

// 按需加载：打开设置/防御管理时
async function fetchSettingsOnDemand(): Promise<void> {
  if (!settingsStore.loaded) {
    await Promise.all([
      settingsStore.fetchSettings(),
      defenseStore.fetchBlocks(),
      defenseStore.fetchWhitelist()
    ])
  }
}

async function handleLoginSuccess(data: any) {
  authStore.setLoggedIn(true, data.user, data.token)
  const rt = data.data?.refreshToken || data.data?.refresh_token
  if (rt) cache.set('refresh_token', rt, { exp: 86400 })
  // 登录成功后获取权限 + 加载数据 + 连接 WebSocket
  await authStore.fetchPermissions()
  fetchData()
  dashboardStore.connectWS()
}

function handleMaxSessions(data: { sessions: any[]; maxSessions: number }) {
  // 存储会话数据并弹出设备管理弹窗
  maxSessionsData.value = data
  showMaxSessionsModal.value = true
}

async function handleKickSession(sessionId: string) {
  try {
    await firewallApi.kickSession(sessionId)
    // 刷新会话列表
    if (maxSessionsData.value) {
      maxSessionsData.value.sessions = maxSessionsData.value.sessions.filter(
        (s: any) => !s.sessionId?.startsWith(sessionId.substring(0, 16))
      )
    }
  } catch (err) {
    console.error('踢出会话失败:', err)
  }
}

async function handleKickAll() {
  try {
    await firewallApi.kickAllSessions()
    maxSessionsData.value = null
    showMaxSessionsModal.value = false
  } catch (err) {
    console.error('踢出所有会话失败:', err)
  }
}

// 点击外部关闭下拉菜单
function clickOutsideHandler(e: MouseEvent) {
  const dropdown = document.querySelector('.user-profile-dropdown')
  const avatarBtn = document.querySelector('.user-avatar-btn')
  if (dropdown && !dropdown.contains(e.target as Node) && avatarBtn && !avatarBtn.contains(e.target as Node)) {
    isUserProfileOpen.value = false
  }
}

onMounted(async () => {
  const isLoggedIn = await authStore.checkSession()
  uiStore.setTheme(isDarkMode.value)
  window.addEventListener('click', clickOutsideHandler)

  if (isLoggedIn) {
    fetchData()
    dashboardStore.connectWS()
  }
})

onUnmounted(() => {
  dashboardStore.disconnectWS()
  window.removeEventListener('click', clickOutsideHandler)
})
</script>
