<template>
  <div
    class="w-screen h-screen transition-colors duration-500 relative overflow-hidden font-outfit bg-[var(--bg)] text-[var(--text)]">
    <!-- 背景扫描线 (仅在暗色模式显示更明显) -->
    <div v-if="isDarkMode" class="fixed inset-0 pointer-events-none opacity-20 overflow-hidden z-[60]">
      <div class="scan-line"></div>
    </div>

    <!-- Background Layer: Fullscreen Map -->
    <div class="bg-mesh" :class="{ 'light': !isDarkMode }"></div>
    <div class="absolute inset-0 z-0 overflow-hidden">
      <MapChart :events="wsEvents" :server-node="serverPosition" :is-dark="isDarkMode"
        :show-trajectory="securitySettings.showTrajectory" />
    </div>

    <!-- UI Overlay Layer -->
    <div class="absolute inset-0 z-10 pointer-events-none flex flex-col">
      <!-- HUD Toggle Button (Always visible) -->
      <div class="fixed bottom-6 right-6 pointer-events-auto z-[70]">
        <button @click="uiStore.toggleUI()" class="glass p-4 rounded-full transition-all group shadow-2xl"
          :class="isDarkMode ? 'hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'hover:bg-indigo-500/10 text-indigo-600 border-indigo-200'"
          :title="isUIVisible ? $t('hud.hide') : $t('hud.show')">
          <Monitor v-if="isUIVisible" class="w-6 h-6 group-hover:scale-110 transition-transform" />
          <Layout v-else class="w-6 h-6 animate-pulse" />
        </button>
      </div>

      <!-- Top Section -->
      <header class="flex justify-between items-center p-4 pointer-events-auto transition-all duration-500"
        :class="{ 'opacity-60 hover:opacity-100': !isUIVisible }">
        <div class="glass px-6 py-3 rounded-2xl flex items-center gap-6 shadow-xl">
          <div class="flex items-center gap-3">
            <ShieldCheck :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" class="w-8 h-8" />
            <h1 class="text-xl font-bold tracking-tight uppercase"
              :class="isDarkMode ? 'text-slate-100 glow-text' : 'text-slate-800'">Antigravity Firewall</h1>
          </div>
          <div class="h-8 w-px" :class="isDarkMode ? 'bg-white/10' : 'bg-slate-200'"></div>
          <div class="flex gap-8">
            <div class="flex flex-col">
              <span class="text-[10px] font-bold uppercase tracking-widest"
                :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">Total Traffic</span>
              <span class="text-xl font-mono font-bold" :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'">{{
                summary.totalRequests || 0 }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-bold uppercase tracking-widest"
                :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">Blocked</span>
              <span class="text-xl font-mono font-bold text-red-500">{{ summary.totalBlocked || 0 }}</span>
            </div>
          </div>
        </div>

        <transition name="fade-ui">
          <div v-if="isUIVisible" class="flex gap-3">
            <button @click="uiStore.toggleLang()"
              class="glass px-4 py-3 rounded-2xl transition-all shadow-lg text-[10px] font-black uppercase tracking-tighter"
              :class="isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'">
              {{ locale.toUpperCase() }}
            </button>

            <button @click="uiStore.toggleTheme()" class="glass p-3 rounded-2xl transition-all shadow-lg"
              :class="isDarkMode ? 'text-amber-400 hover:bg-white/10' : 'text-indigo-600 hover:bg-slate-100'"
              :title="$t('nav.theme')">
              <Sun v-if="isDarkMode" class="w-6 h-6" />
              <Moon v-else class="w-6 h-6" />
            </button>

            <button @click="defenseStore.isSettingsModalOpen = true"
              class="glass p-3 rounded-2xl transition-all shadow-lg group relative"
              :class="isDarkMode ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-indigo-600'"
              :title="$t('nav.settings')">
              <Settings class="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
            </button>

            <!-- User Avatar & Google-style Profile Dropdown -->
            <div class="relative">
              <button @click="handleAvatarClick"
                class="user-avatar-btn glass p-1.5 rounded-2xl transition-all shadow-lg border-2 border-transparent hover:border-cyan-500/50 overflow-hidden flex items-center justify-center relative"
                :class="isDarkMode ? 'bg-slate-800/50' : 'bg-white/50'">
                <div v-if="authStore.isLoggedIn && authStore.user?.avatar" class="w-9 h-9 rounded-xl overflow-hidden">
                  <img :src="authStore.user.avatar" alt="Avatar" class="w-full h-full object-cover" />
                </div>
                <div v-else-if="authStore.isLoggedIn && authStore.user?.username" class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
                  :class="isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-indigo-100 text-indigo-700'">
                  {{ authStore.user.username[0]?.toUpperCase() }}
                </div>
                <div v-else class="w-9 h-9 rounded-xl flex items-center justify-center"
                  :class="isDarkMode ? 'bg-slate-700 text-cyan-400' : 'bg-slate-200 text-indigo-600'">
                  <User class="w-5 h-5" />
                </div>
              </button>

              <!-- User Profile Dropdown Card (Google Style) -->
              <transition name="dropdown-fade">
                <div v-if="isUserProfileOpen && authStore.isLoggedIn" 
                  class="user-profile-dropdown absolute right-0 mt-3 w-80 rounded-[28px] shadow-2xl p-6 border transition-all z-[90] pointer-events-auto"
                  :class="isDarkMode ? 'bg-slate-900/95 backdrop-blur-md border-white/10 text-slate-100 shadow-[0_24px_50px_rgba(0,0,0,0.5)]' : 'bg-white/95 backdrop-blur-md border-slate-200 text-slate-800 shadow-[0_24px_50px_rgba(0,0,0,0.15)]'">
                  
                  <!-- Close Button -->
                  <button @click="closeUserProfile" 
                    class="absolute top-4 right-4 p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition-all">
                    <X class="w-4 h-4" />
                  </button>

                  <!-- Top Email Address -->
                  <div class="text-center text-xs font-medium tracking-wide mb-4 opacity-60">
                    {{ authStore.user?.email || 'user@sso.com' }}
                  </div>

                  <!-- Center Avatar -->
                  <div class="flex flex-col items-center justify-center relative mb-4">
                    <div class="relative group">
                      <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-cyan-400 dark:border-cyan-500 shadow-md p-1 flex items-center justify-center bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-500">
                        <div class="w-full h-full rounded-full bg-slate-850 dark:bg-slate-950 overflow-hidden flex items-center justify-center">
                          <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" alt="Avatar" class="w-full h-full object-cover" />
                          <span v-else class="text-2xl font-bold text-white uppercase">{{ authStore.user?.username[0] || 'U' }}</span>
                        </div>
                      </div>
                      <!-- Camera Overlay -->
                      <div class="absolute bottom-0 right-0 p-1 bg-white dark:bg-slate-800 rounded-full shadow-md border border-slate-200 dark:border-slate-700 cursor-pointer hover:scale-105 transition-transform">
                        <Camera class="w-3.5 h-3.5 text-slate-500 dark:text-cyan-400" />
                      </div>
                    </div>
                  </div>

                  <!-- Greeting & Manage SSO Pill -->
                  <div class="flex flex-col items-center gap-2.5 mb-5">
                    <div class="text-center text-lg font-semibold tracking-tight">
                      {{ authStore.user?.username || 'Gong' }}, 您好!
                    </div>
                    <a :href="ssoUrl + '/profile'" target="_blank"
                      class="inline-block px-5 py-2 rounded-full border text-xs font-semibold transition-all text-center"
                      :class="isDarkMode ? 'border-white/20 text-cyan-400 hover:border-cyan-500/50 hover:bg-white/5' : 'border-slate-300 text-indigo-600 hover:border-indigo-500/50 hover:bg-slate-50'">
                      管理您的 SSO 账号
                    </a>
                  </div>

                  <!-- Suggestion Banner -->
                  <div class="p-4 rounded-2xl text-[11px] flex gap-3 items-start text-left mb-4"
                    :class="isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/20 text-slate-300' : 'bg-indigo-500/5 border border-indigo-500/10 text-slate-600'">
                    <Info class="w-4 h-4 text-cyan-500 flex-shrink-0 mt-0.5" />
                    <div class="flex-1">
                      <div>当前安全监控面板已连接。如需调整访问控制，请前往设置中心。</div>
                      <div class="mt-1 flex gap-3 font-bold">
                        <button @click="closeUserProfile" class="hover:underline opacity-60">忽略</button>
                        <button @click="defenseStore.isSettingsModalOpen = true; closeUserProfile()" class="hover:underline text-cyan-400">安全设置</button>
                      </div>
                    </div>
                  </div>

                  <!-- Operation buttons -->
                  <div class="grid grid-cols-2 gap-2">
                    <button @click="isLoginModalOpen = true; closeUserProfile()"
                      class="flex items-center justify-center gap-2 p-3 rounded-2xl text-xs font-semibold border transition-all"
                      :class="isDarkMode ? 'border-white/10 hover:bg-white/5 text-slate-300' : 'border-slate-200 hover:bg-slate-50 text-slate-700'">
                      <Plus class="w-4 h-4" />
                      添加账号
                    </button>
                    <button @click="handleLogout"
                      class="flex items-center justify-center gap-2 p-3 rounded-2xl text-xs font-semibold border transition-all"
                      :class="isDarkMode ? 'border-white/10 hover:bg-red-500/10 text-red-400' : 'border-slate-200 hover:bg-red-50 text-red-600'">
                      <LogOut class="w-4 h-4" />
                      退出账号
                    </button>
                  </div>

                  <!-- Operation menu list -->
                  <div class="mt-4 border-t pt-3 flex flex-col gap-1 text-left"
                    :class="isDarkMode ? 'border-white/10' : 'border-slate-100'">
                    <button @click="defenseStore.isConfigModalOpen = true; closeUserProfile()" 
                      class="flex justify-between items-center px-3 py-2 rounded-xl text-xs transition-all hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100">
                      <div class="flex items-center gap-2">
                        <ShieldCheck class="w-4 h-4 text-cyan-500" />
                        <span>安全策略控制台</span>
                      </div>
                      <span class="text-[10px] opacity-50 font-mono">PRO</span>
                    </button>
                    
                    <button @click="defenseStore.isSettingsModalOpen = true; closeUserProfile()"
                      class="flex justify-between items-center px-3 py-2 rounded-xl text-xs transition-all hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100">
                      <div class="flex items-center gap-2">
                        <History class="w-4 h-4 text-cyan-500" />
                        <span>防火墙策略审计</span>
                      </div>
                      <span class="text-[10px] opacity-50 font-mono">Audited</span>
                    </button>
                  </div>

                  <!-- Footer -->
                  <div class="mt-4 text-center text-[10px] opacity-40">
                    由 Antigravity SSO 2.1 提供安全支持
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </transition>
      </header>

      <!-- Content Area: RouterView -->
      <transition name="fade-ui">
        <div v-if="isUIVisible" class="flex-1 relative pointer-events-none">
          <RouterView />
        </div>
      </transition>
    </div>

    <!-- Security Config Modal -->
    <SecurityConsoleModal
      :is-open="defenseStore.isConfigModalOpen"
      :is-dark-mode="isDarkMode"
      :configs="configs"
      z-index="z-[4000]"
      @close="defenseStore.isConfigModalOpen = false"
      @toggle="configsStore.toggleGuard"
      @toggleSystem="configsStore.toggleSystem"
      @edit="configsStore.openEditModal"
      @saveNode="configsStore.handleSaveNode"
      @reset="configsStore.resetGuard"
      @resetAll="handleResetStats" />

    <!-- System Settings Modal -->
    <SystemSettingsModal
      :is-open="defenseStore.isSettingsModalOpen"
      :is-dark-mode="isDarkMode"
      :server-position="serverPosition"
      :security-settings="securitySettings"
      :configs="configs"
      :summary="summary"
      :loading="loading"
      :available-ip-apis="availableIpApis"
      :active-blocks="activeBlocks"
      :active-whitelist="activeWhitelist"
      @close="defenseStore.isSettingsModalOpen = false"
      @saveNode="handleSaveNodeSettings"
      @syncNode="handleSyncNode"
      @refreshNode="handleRefreshNode"
      @openSecurityConsole="defenseStore.isConfigModalOpen = true"
      @openDefense="defenseStore.isDefenseModalOpen = true"
      @setLocale="uiStore.setLocale"
      @setTheme="uiStore.setTheme"
      @fetchData="fetchData"
      @resetStats="handleResetStats"
      @addBlacklist="settingsStore.handleAddBlacklist"
      @removeBlacklist="settingsStore.handleRemoveBlacklist"
      @saveSecurity="settingsStore.saveSecuritySettings"
      @savePartial="settingsStore.handleSavePartial"
      @addBlock="defenseStore.handleAddBlock"
      @removeBlock="defenseStore.handleRemoveBlock"
      @fetchBlocks="defenseStore.fetchBlocks"
      @addWhitelist="defenseStore.handleAddWhitelist"
      @removeWhitelist="defenseStore.handleRemoveWhitelist"
      @tagAdd="settingsStore.handleTagAdd"
      @tagRemove="settingsStore.handleTagRemove"
      @fetchWhitelist="defenseStore.fetchWhitelist" />

    <!-- Policy Edit Modal -->
    <PolicyEditModal
      :is-open="defenseStore.isModalOpen"
      :is-dark-mode="isDarkMode"
      :form="editForm"
      :editing-system="editingSystem"
      :editing-group="editingGroup"
      :editing-api="editingApi"
      z-index="z-[5000]"
      @close="defenseStore.isModalOpen = false"
      @save="configsStore.saveConfig" />

    <DefenseManagementModal :is-open="defenseStore.isDefenseModalOpen" :is-dark-mode="isDarkMode"
      :security-settings="securitySettings" :summary="summary" :loading="loading"
      z-index="z-[4000]"
      @close="defenseStore.isDefenseModalOpen = false"
      @saveSecurity="settingsStore.saveSecuritySettings" />

    <!-- Login Modal -->
    <LoginModal 
      :is-open="isLoginModalOpen" 
      @close="isLoginModalOpen = false" 
      @login-success="handleLoginSuccess"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * App 根组件
 * 职责：背景地图、全局 Header、HUD 切换、全局模态框
 * 页面内容由 RouterView 渲染
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useUiStore } from './stores/ui'
import { useDashboardStore } from './stores/dashboard'
import { useSettingsStore } from './stores/settings'
import { useConfigsStore } from './stores/configs'
import { useDefenseStore } from './stores/defense'
import { firewallApi } from './api/firewall'
import {
  ShieldCheck, Settings, Monitor, Layout, Sun, Moon, User,
  X, Camera, Plus, LogOut, Info, History
} from 'lucide-vue-next'

import MapChart from './components/MapChart.vue'
import DefenseManagementModal from './components/modals/DefenseManagementModal.vue'
import SecurityConsoleModal from './components/modals/SecurityConsoleModal.vue'
import SystemSettingsModal from './components/modals/SystemSettingsModal.vue'
import PolicyEditModal from './components/modals/PolicyEditModal.vue'
import LoginModal from './components/modals/LoginModal.vue'
import { useAuthStore } from './stores/auth'

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
const ssoUrl = (import.meta as any).env?.VITE_SSO_URL || 'http://localhost:5173'

// 从 store 提取响应式状态
const { isDarkMode, isUIVisible, loading } = storeToRefs(uiStore)
const { summary, wsEvents, serverPosition } = storeToRefs(dashboardStore)
const { securitySettings, availableIpApis } = storeToRefs(settingsStore)
const { configs, editingSystem, editingGroup, editingApi, editForm } = storeToRefs(configsStore)
const { activeBlocks, activeWhitelist } = storeToRefs(defenseStore)

// 初始化数据
async function fetchData(): Promise<void> {
  loading.value = true
  try {
    await Promise.all([
      configsStore.fetchConfigs(),
      settingsStore.fetchSettings(),
      defenseStore.fetchBlocks(),
      defenseStore.fetchWhitelist()
    ])
  } catch (err) {
    console.error('⚠️ 初始化数据失败:', err)
  } finally {
    loading.value = false
  }
}

function handleLoginSuccess(user: any) {
  authStore.setLoggedIn(true, user)
}

function handleAvatarClick(e: Event) {
  e.stopPropagation()
  if (authStore.isLoggedIn) {
    isUserProfileOpen.value = !isUserProfileOpen.value
  } else {
    isLoginModalOpen.value = true
  }
}

function closeUserProfile() {
  isUserProfileOpen.value = false
}

function handleLogout() {
  authStore.logout()
  closeUserProfile()
}

function clickOutsideHandler(e: MouseEvent) {
  const dropdown = document.querySelector('.user-profile-dropdown')
  const avatarBtn = document.querySelector('.user-avatar-btn')
  if (
    dropdown && 
    !dropdown.contains(e.target as Node) && 
    avatarBtn && 
    !avatarBtn.contains(e.target as Node)
  ) {
    isUserProfileOpen.value = false
  }
}

async function handleRefreshNode(): Promise<void> {
  loading.value = true
  try {
    await dashboardStore.refreshNodeLocation()
    defenseStore.nodeRefreshSuccess = true
    setTimeout(() => { defenseStore.nodeRefreshSuccess = false }, 3000)
  } finally {
    loading.value = false
  }
}

async function handleSyncNode(): Promise<void> {
  try {
    await firewallApi.updateNode(serverPosition.value)
  } catch (err) {
    console.error('同步节点设置失败:', err)
  }
}

async function handleSaveNodeSettings(): Promise<void> {
  await handleSyncNode()
  defenseStore.isSettingsModalOpen = false
}

async function handleResetStats(): Promise<void> {
  if (!confirm('确认清除所有流量记录？')) return
  loading.value = true
  try {
    await firewallApi.clearRecords()
    dashboardStore.resetSummary()
    await fetchData()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  authStore.checkSession()
  fetchData()
  dashboardStore.connectWS()
  // 同步初始主题状态
  uiStore.setTheme(isDarkMode.value)
  window.addEventListener('click', clickOutsideHandler)
})

onUnmounted(() => {
  dashboardStore.disconnectWS()
  window.removeEventListener('click', clickOutsideHandler)
})
</script>
