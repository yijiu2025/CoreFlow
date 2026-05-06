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
  </div>
</template>

<script setup lang="ts">
/**
 * App 根组件
 * 职责：背景地图、全局 Header、HUD 切换、全局模态框
 * 页面内容由 RouterView 渲染
 */
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useUiStore } from './stores/ui'
import { useDashboardStore } from './stores/dashboard'
import { useSettingsStore } from './stores/settings'
import { useConfigsStore } from './stores/configs'
import { useDefenseStore } from './stores/defense'
import { firewallApi } from './api/firewall'
import {
  ShieldCheck, Settings, Monitor, Layout, Sun, Moon
} from 'lucide-vue-next'

import MapChart from './components/MapChart.vue'
import DefenseManagementModal from './components/modals/DefenseManagementModal.vue'
import SecurityConsoleModal from './components/modals/SecurityConsoleModal.vue'
import SystemSettingsModal from './components/modals/SystemSettingsModal.vue'
import PolicyEditModal from './components/modals/PolicyEditModal.vue'

const { locale } = useI18n()

// Stores
const uiStore = useUiStore()
const dashboardStore = useDashboardStore()
const settingsStore = useSettingsStore()
const configsStore = useConfigsStore()
const defenseStore = useDefenseStore()

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
  fetchData()
  dashboardStore.connectWS()
  // 同步初始主题状态
  uiStore.setTheme(isDarkMode.value)
})

onUnmounted(() => {
  dashboardStore.disconnectWS()
})
</script>
