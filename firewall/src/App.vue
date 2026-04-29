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
    <div class="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col">
      <!-- HUD Toggle Button (Always visible) -->
      <div class="fixed bottom-6 right-6 pointer-events-auto z-[70]">
        <button @click="isUIVisible = !isUIVisible" class="glass p-4 rounded-full transition-all group shadow-2xl"
          :class="isDarkMode ? 'hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'hover:bg-indigo-500/10 text-indigo-600 border-indigo-200'"
          :title="isUIVisible ? '隐藏界面 (HUD OFF)' : '显示界面 (HUD ON)'">
          <Monitor v-if="isUIVisible" class="w-6 h-6 group-hover:scale-110 transition-transform" />
          <Layout v-else class="w-6 h-6 animate-pulse" />
        </button>
      </div>

      <!-- Top Section -->
      <header class="flex justify-between items-center mb-4 pointer-events-auto transition-all duration-500"
        :class="{ 'opacity-60 hover:opacity-100': !isUIVisible }">
        <div class="glass px-6 py-3 rounded-2xl flex items-center gap-6 shadow-xl">
          <div class="flex items-center gap-3">
            <ShieldCheck :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" class="w-8 h-8" />
            <h1 class="text-xl font-bold tracking-tight uppercase"
              :class="isDarkMode ? 'text-slate-100 glow-text' : 'text-slate-800'">Antigravity Firewall</h1>
          </div>
          <!-- ... (Metrics) -->
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
            <!-- 语言切换 (保留在主屏) -->
            <button @click="toggleLang"
              class="glass px-4 py-3 rounded-2xl transition-all shadow-lg text-[10px] font-black uppercase tracking-tighter"
              :class="isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'">
              {{ locale.toUpperCase() }}
            </button>

            <!-- 模式切换按钮 (保留在主屏) -->
            <button @click="toggleTheme" class="glass p-3 rounded-2xl transition-all shadow-lg"
              :class="isDarkMode ? 'text-amber-400 hover:bg-white/10' : 'text-indigo-600 hover:bg-slate-100'"
              :title="$t('nav.theme')">
              <Sun v-if="isDarkMode" class="w-6 h-6" />
              <Moon v-else class="w-6 h-6" />
            </button>

            <!-- 统一设置入口 -->
            <button @click="isSettingsModalOpen = true"
              class="glass p-3 rounded-2xl transition-all shadow-lg group relative"
              :class="isDarkMode ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-indigo-600'"
              :title="$t('nav.settings')">
              <Settings class="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
            </button>
          </div>
        </transition>
      </header>

      <!-- Content Area (Sidebars Toggleable) -->
      <transition name="fade-ui">
        <div v-if="isUIVisible" class="flex-1 flex gap-4 min-h-0">

          <!-- Left: Real-time Log Stream (Expanded) -->
          <div class="w-[400px] flex flex-col gap-4 pointer-events-auto">
            <div
              class="flex-1 glass rounded-3xl overflow-hidden flex flex-col transition-colors duration-500 shadow-2xl"
              :class="isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-white/80 border-slate-200'">
              <div class="p-4 border-b flex justify-between items-center"
                :class="isDarkMode ? 'border-white/5' : 'border-slate-100 bg-slate-50/50'">
                <h2 class="text-sm font-bold flex items-center gap-2 uppercase tracking-widest"
                  :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">
                  <Activity class="w-4 h-4" :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'" />
                  {{ $t('stats.traffic_stream') }}
                </h2>
                <div class="flex gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500/50"></span>
                </div>
              </div>
              <LogTable :logs="logs" :is-dark="isDarkMode" class="flex-1 !bg-transparent" />
            </div>
          </div>

          <!-- Middle: Spacer -->
          <div class="flex-1"></div>

          <!-- Right: Analytics Charts -->
          <div class="w-[350px] flex flex-col gap-4 pointer-events-auto">
            <!-- 访问来源统计 -->
            <div
              class="glass flex flex-col rounded-3xl min-h-[280px] overflow-hidden shadow-2xl transition-colors duration-500"
              :class="isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-white/80 border-slate-200'">
              <div class="px-5 py-3 border-b bg-white/5 flex items-center justify-between"
                :class="isDarkMode ? 'border-white/5' : 'border-slate-100 bg-slate-50/50'">
                <span class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">
                  <MapPin class="w-3 h-3 text-indigo-400" />
                  {{ $t('stats.region_rank') }}
                </span>
              </div>
              <div class="flex-1 p-2 overflow-y-auto custom-scrollbar">
                <RegionList :data="summary.topRegions || []" :is-dark="isDarkMode" />
              </div>
            </div>

            <!-- 高频访问路径 -->
            <div
              class="glass flex flex-col rounded-3xl min-h-[350px] overflow-hidden shadow-2xl transition-colors duration-500"
              :class="isDarkMode ? 'bg-slate-950/60 border-white/5' : 'bg-white/80 border-slate-200'">
              <div class="px-5 py-3 border-b bg-white/5 flex items-center justify-between"
                :class="isDarkMode ? 'border-white/5' : 'border-slate-100 bg-slate-50/50'">
                <span class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">
                  <Database class="w-3 h-3 text-cyan-400" />
                  {{ $t('stats.path_rank') }}
                </span>
              </div>
              <div class="flex-1 p-2 overflow-y-auto custom-scrollbar">
                <PathList :data="summary.topPaths || []" :is-dark="isDarkMode" />
              </div>
            </div>

            <div class="glass p-5 rounded-3xl transition-colors duration-500"
              :class="isDarkMode ? 'border-white/5 bg-gradient-to-br from-indigo-500/10 to-transparent' : 'border-slate-200 bg-white/80 shadow-lg'">
              <div class="flex items-center gap-3 mb-2">
                <Info class="w-4 h-4 text-indigo-400" />
                <span class="text-xs font-bold uppercase tracking-wider"
                  :class="isDarkMode ? 'text-slate-300' : 'text-slate-700'">{{ $t('stats.monitor_suggestion') }}</span>
              </div>
              <p class="text-[11px] leading-relaxed" :class="isDarkMode ? 'text-slate-500' : 'text-slate-600'">
                {{ summary.totalBlocked > 0
                  ? $t('stats.suggestion_blocked', {
                    rate: (summary.totalBlocked / summary.totalRequests * 100).toFixed(1)
                  })
                  : $t('stats.suggestion_clean')
                }}
              </p>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Security Config Modal -->
    <SecurityConsoleModal 
      :is-open="isConfigModalOpen" 
      :is-dark-mode="isDarkMode" 
      :configs="configs"
      @close="isConfigModalOpen = false" 
      @toggle="toggleGuard" 
      @toggleSystem="toggleSystem"
      @edit="openEditModal" 
      @saveNode="handleSaveNode" 
      @reset="resetGuard" 
      @resetAll="resetStats" />
    
    <!-- System Settings Modal -->
    <SystemSettingsModal
      :is-open="isSettingsModalOpen"
      :is-dark-mode="isDarkMode"
      :server-position="serverPosition"
      :security-settings="securitySettings"
      :configs="configs"
      :summary="summary"
      :loading="loading"
      :available-ip-apis="availableIpApis"
      :active-blocks="activeBlocks"
      :active-whitelist="activeWhitelist"
      @close="isSettingsModalOpen = false"
      @saveNode="saveNodeSettings"
      @syncNode="syncNodeToServer"
      @refreshNode="refreshNodeLocation"
      @openSecurityConsole="isConfigModalOpen = true"
      @openDefense="isDefenseModalOpen = true"
      @setLocale="handleSetLocale"
      @setTheme="setTheme"
      @fetchData="fetchData"
      @resetStats="resetStats"
      @addBlacklist="handleAddBlacklist"
      @removeBlacklist="handleRemoveBlacklist"
      @saveSecurity="saveSecuritySettings"
      @savePartial="handleSavePartial"
      @addBlock="handleAddBlock"
      @removeBlock="handleRemoveBlock"
      @fetchBlocks="fetchBlocks"
      @addWhitelist="handleAddWhitelist"
      @removeWhitelist="handleRemoveWhitelist"
      @tagAdd="handleTagAdd"
      @tagRemove="handleTagRemove"
      @fetchWhitelist="fetchWhitelist" />

    <!-- Policy Edit Modal -->
    <PolicyEditModal 
      :is-open="isModalOpen" 
      :is-dark-mode="isDarkMode" 
      :form="editForm"
      :editing-system="editingSystem" 
      :editing-group="editingGroup" 
      :editing-api="editingApi"
      @close="isModalOpen = false" 
      @save="saveConfig" />

    <DefenseManagementModal :is-open="isDefenseModalOpen" :is-dark-mode="isDarkMode"
      :security-settings="securitySettings" :summary="summary" :loading="loading" @close="isDefenseModalOpen = false"
      @saveSecurity="saveSecuritySettings" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { firewallApi } from './api/firewall'
import * as echarts from 'echarts'
import {
  ShieldCheck, RefreshCw, Activity, ShieldAlert,
  Info, X, Settings, Cpu, MapPin, Database, Monitor, Layout, Users, Lock, RotateCcw, Sun, Moon, Trash2
} from 'lucide-vue-next'

import LogTable from './components/LogTable.vue'
import MapChart from './components/MapChart.vue'
import RegionList from './components/RegionList.vue'
import PathList from './components/PathList.vue'
import DefenseManagementModal from './components/modals/DefenseManagementModal.vue'
import SecurityConsoleModal from './components/modals/SecurityConsoleModal.vue'
import SystemSettingsModal from './components/modals/SystemSettingsModal.vue'
import PolicyEditModal from './components/modals/PolicyEditModal.vue'
import { chinaGeoCoordMap } from './utils/geoData'

// API 基础配置已转移至 src/api/firewall.js

const logs = ref([])
const summary = ref({
  totalRequests: 0,
  totalBlocked: 0,
  topRegions: [],
  topPaths: []
})
const configs = ref({})
const availableIpApis = ref([])
const loading = ref(false)
const wsEvents = ref([])
const activeBlocks = ref([])
const activeWhitelist = ref([])
const isConfigModalOpen = ref(false)
const isSettingsModalOpen = ref(false)
const isDefenseModalOpen = ref(false)
const isUIVisible = ref(true) // HUD 显示状态
const isModalOpen = ref(false)
const nodeRefreshSuccess = ref(false)
const isDarkMode = ref(localStorage.getItem('theme') !== 'light')
const { t, locale } = useI18n()

// 全局安全策略设置
const securitySettings = ref({
  defense: {
    enableAutoBlacklist: true,
    maxNotFoundAttempts: 10,
    blacklistDuration: 3600,
    notFoundWindow: 60,
    enableRateLimit: true,
    rateLimitRequests: 60,
    rateLimitWindow: 60,
    enableBruteForce: true,
    bruteLimit: 5,
    bruteWindow: 300,
    accountLockTime: 900,
    ipBlockTime: 600,
    bruteIpLimit: 10,
    enableConnLimit: true,
    maxConn: 100,
    enableGeoFilter: false,
    geoRules: {
      sensitivePaths: ['/api/admin', '/api/payment', '/api/user/delete'],
      overseasLimit: 10,
      overseasWindow: 60,
      overseasBlockTime: 3600
    },
    enableBotChallenge: true,
    botPatterns: ['python-requests', 'scrapy', 'httpclient', 'go-http-client', 'java/', 'libcurl', 'wget', 'axios', 'node-fetch', 'headless', 'phantomjs', 'selenium'],
    browserPatterns: ['chrome', 'firefox', 'safari', 'edge', 'opera'],
    botChallengeNoUaLimit: 10,
    botChallengeBotLimit: 30,
    botChallengeBrowserLimit: 120,
    internalIpPrefixes: ['127.', '10.', '192.168.', '::1'],
    idcIpPrefixes: [],
    safePaths: ['/health', '/favicon.ico', '/robots.txt'],
    manualBlacklistIps: [],
    manualBlacklistUsers: [],
    manualWhitelistIps: []
  }
})

const activeSettingsTab = ref('node') // node, security, defense, general
const activeDefenseSubTab = ref('scanning') // scanning, rate, brute, conn, sensitive, geo, bot

const handleTabClick = (id) => {
  if (id === 'security') {
    isConfigModalOpen.value = true
  } else if (id === 'defense') {
    isDefenseModalOpen.value = true
  } else {
    activeSettingsTab.value = id
  }
}

const toggleTheme = () => {
  setTheme(!isDarkMode.value)
}

const setTheme = (mode) => {
  isDarkMode.value = mode
  localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light')
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

const toggleLang = () => {
  const langs = ['zh', 'en', 'ja', 'fr', 'de']
  const nextIdx = (langs.indexOf(locale.value) + 1) % langs.length
  locale.value = langs[nextIdx]
  localStorage.setItem('lang', locale.value)
}

const activeSystem = ref('firewall')
const editingSystem = ref('')
const editingGroup = ref('')
const editingApi = ref('')
const envMode = import.meta.env.MODE

const handleSetLocale = (l) => {
  locale.value = l
  localStorage.setItem('lang', l)
}

// 服务器地理位置设置
const serverPosition = ref({
  name: '核心防御节点',
  country: '中国',
  region: '河南',
  city: '郑州',
  ip: '127.0.0.1',
  lat: 34.75,
  lon: 113.65
})


// WebSocket 优化：自动重连与心跳
let socket = null
let reconnectTimer = null
let heartbeatTimer = null

const connectWS = () => {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = import.meta.env.DEV ? 'localhost:3000' : window.location.host
  const wsUrl = `${protocol}//${host}/api/firewall/v1/monitor/ws`

  socket = new WebSocket(wsUrl)

  socket.onopen = () => {
    console.log('🚀 [WS] 已连接到安全网关')
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }

    // 开启心跳：每 20 秒发送一次 PING
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send('PING')
      }
    }, 20000)
  }

  socket.onmessage = (event) => {
    if (event.data === 'PONG') return // 忽略心跳响应

    try {
      const { type, data } = JSON.parse(event.data)
      if (type === 'INIT') {
        summary.value = data.summary
        logs.value = data.records || []
        if (data.summary.serverNode) {
          serverPosition.value = { ...serverPosition.value, ...data.summary.serverNode }
        }
        if (data.summary.securitySettings) {
          const incoming = data.summary.securitySettings
          securitySettings.value = {
            ...securitySettings.value,
            ...incoming,
            defense: { ...securitySettings.value.defense, ...incoming.defense }
          }
          normalizeDefenseArrays()
        }
      } else if (type === 'LOG') {
        // 使用高效的非阻塞更新
        requestAnimationFrame(() => {
          logs.value.unshift(data)
          if (logs.value.length > 200) logs.value.pop()

          wsEvents.value.push(data)
          if (wsEvents.value.length > 50) wsEvents.value.shift()

          // 1. 增量更新全局计数
          summary.value.totalRequests++
          if (data.blocked) summary.value.totalBlocked++

          // 2. 增量更新路径/API 统计 (需与后端逻辑保持对齐，防止重复)
          if (!summary.value.topPaths) summary.value.topPaths = []
          const pathBase = data.url?.split('?')[0] || '/'
          const apiIdentifier = data.apiKey || pathBase

          // 优先使用 apiName (apiKey) 匹配，其次使用路径匹配
          const pathIdx = summary.value.topPaths.findIndex(p =>
            (apiIdentifier && p.apiName === apiIdentifier) || p.path === pathBase
          )

          if (pathIdx > -1) {
            summary.value.topPaths[pathIdx].count++
          } else {
            summary.value.topPaths.push({
              path: pathBase,
              count: 1,
              apiName: data.apiKey || null
            })
          }
          // 重新排序并保持 Top 20
          summary.value.topPaths.sort((a, b) => b.count - a.count)
          if (summary.value.topPaths.length > 20) summary.value.topPaths.splice(20)

          // 3. 增量更新地区统计
          if (!summary.value.topRegions) summary.value.topRegions = []
          const regionKey = `${data.region || '未知'}-${data.city || '未知'}`
          const regIdx = summary.value.topRegions.findIndex(r => r.region === regionKey)
          if (regIdx > -1) {
            summary.value.topRegions[regIdx].count++
          } else {
            summary.value.topRegions.push({ region: regionKey, count: 1 })
          }
          summary.value.topRegions.sort((a, b) => b.count - a.count)
          if (summary.value.topRegions.length > 20) summary.value.topRegions.pop()
        })
      }
    } catch (e) {
      console.error('[WS] 消息解析失败', e)
    }
  }

  socket.onclose = () => {
    console.warn('🔌 [WS] 连接断开，正在尝试重连...')
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (!reconnectTimer) {
      reconnectTimer = setInterval(connectWS, 3000)
    }
  }

  socket.onerror = (err) => {
    socket.close()
  }
}

const fetchData = async () => {
  loading.value = true
  try {
    // 1. 获取三级安全配置
    const configData = await firewallApi.getApiConfigs().catch(err => {
      if (err.code === 401) return null
      throw err
    })
    configs.value = configData

    // 2. 获取监控摘要 (包含节点位置和安全设置)
    const summaryData = await firewallApi.getSummary()
    if (summaryData.serverNode) {
      serverPosition.value = { ...serverPosition.value, ...summaryData.serverNode }
    }
    if (summaryData.securitySettings) {
      const incoming = summaryData.securitySettings
      securitySettings.value = {
        ...securitySettings.value,
        ...incoming,
        defense: { ...securitySettings.value.defense, ...incoming.defense }
      }
      normalizeDefenseArrays()
    }

    // 3. 获取可用 IP 解析源
    const settingsData = await firewallApi.getSettings()
    if (settingsData && settingsData.availableApis) {
      availableIpApis.value = settingsData.availableApis
    }

    // 4. 获取封禁和白名单
    fetchBlocks()
    fetchWhitelist()
  } catch (err) {
    console.error('⚠️ 初始化数据失败:', err)
  } finally {
    loading.value = false
  }
}

const refreshNodeLocation = async () => {
  loading.value = true
  nodeRefreshSuccess.value = false
  try {
    const data = await firewallApi.refreshNode()
    serverPosition.value = { ...serverPosition.value, ...data }
    nodeRefreshSuccess.value = true
    setTimeout(() => { nodeRefreshSuccess.value = false }, 3000)
  } catch (err) {
    console.error('刷新节点位置失败:', err)
  } finally {
    loading.value = false
  }
}

const fetchSettings = async () => {
  try {
    const res = await axios.get('/api/firewall/v1/monitor/settings')
    const incoming = res.data.data
    securitySettings.value = {
      ...securitySettings.value,
      ...incoming,
      defense: { ...securitySettings.value.defense, ...incoming.defense }
    }
    normalizeDefenseArrays()
  } catch (err) {
    console.error('获取安全设置失败:', err)
  }
}

const saveSecuritySettings = async () => {
  try {
    loading.value = true
    await firewallApi.updateSettings(securitySettings.value.defense)
  } catch (err) {
    console.error('保存安全设置失败:', err)
  } finally {
    loading.value = false
  }
}

const handleSavePartial = async (payload) => {
  try {
    // 识别 key 是否属于 defense 子对象，如果属于则进行嵌套包装
    const defenseKeys = [
      'enableAutoBlacklist', 'maxNotFoundAttempts', 'blacklistDuration', 'notFoundWindow',
      'enableRateLimit', 'rateLimitRequests', 'rateLimitWindow',
      'enableBruteForce', 'bruteLimit', 'bruteWindow', 'accountLockTime', 'ipBlockTime', 'bruteIpLimit',
      'enableConnLimit', 'maxConn',
      'enableGeoFilter', 'geoRules',
      'enableBotChallenge', 'botPatterns', 'browserPatterns', 'botChallengeNoUaLimit', 'botChallengeBotLimit', 'botChallengeBrowserLimit',
      'internalIpPrefixes', 'idcIpPrefixes', 'safePaths'
    ]
    
    let finalPayload = {}
    const keys = Object.keys(payload)
    
    if (keys.some(k => defenseKeys.includes(k))) {
      finalPayload = { defense: payload }
    } else {
      finalPayload = payload
    }

    await firewallApi.updateSettings(finalPayload)
    console.log('✅ [Synergy Update] 配置已增量同步:', keys)
  } catch (err) {
    console.error('局部更新失败:', err)
  }
}

const syncNodeToServer = async () => {
  try {
    await firewallApi.updateNode(serverPosition.value)
  } catch (err) {
    console.error('同步节点设置失败:', err)
  }
}

const saveNodeSettings = async () => {
  await syncNodeToServer()
  isSettingsModalOpen.value = false
}

const resetStats = async () => {
  if (!confirm(t('stats.clear_confirm'))) return
  try {
    loading.value = true
    await firewallApi.clearRecords()
    logs.value = []
    summary.value = {
      totalRequests: 0,
      totalBlocked: 0,
      topRegions: [],
      topPaths: []
    }
    await fetchData()
  } finally {
    loading.value = false
  }
}

const handleAddBlacklist = async (type, value) => {
  try {
    await firewallApi.addBlacklist(type, value)
    if (type === 'ip') {
      if (!securitySettings.value.defense.manualBlacklistIps.includes(value)) {
        securitySettings.value.defense.manualBlacklistIps.push(value)
      }
    } else {
      if (!securitySettings.value.defense.manualBlacklistUsers.includes(value)) {
        securitySettings.value.defense.manualBlacklistUsers.push(value)
      }
    }
  } catch (err) {
    console.error('添加黑名单失败:', err)
  }
}

const handleRemoveBlacklist = async (type, value) => {
  try {
    await firewallApi.removeBlacklist(type, value)
    if (type === 'ip') {
      securitySettings.value.defense.manualBlacklistIps = securitySettings.value.defense.manualBlacklistIps.filter(v => v !== value)
    } else {
      securitySettings.value.defense.manualBlacklistUsers = securitySettings.value.defense.manualBlacklistUsers.filter(v => v !== value)
    }
  } catch (err) {
    console.error('移除黑名单失败:', err)
  }
}

// 封禁管理
const fetchBlocks = async () => {
  try {
    activeBlocks.value = await firewallApi.getBlocks() || []
  } catch (err) {
    console.error('获取封禁列表失败:', err)
  }
}

const handleAddBlock = async (data) => {
  try {
    await firewallApi.addBlock(data)
    await fetchBlocks()
  } catch (err) {
    console.error('添加封禁失败:', err)
  }
}

const handleRemoveBlock = async (ip) => {
  try {
    await firewallApi.removeBlock(ip)
    activeBlocks.value = activeBlocks.value.filter(b => b.ip !== ip)
  } catch (err) {
    console.error('移除封禁失败:', err)
  }
}

// 白名单管理
const fetchWhitelist = async () => {
  try {
    activeWhitelist.value = await firewallApi.getWhitelist() || []
  } catch (err) {
    console.error('获取白名单失败:', err)
  }
}

const handleAddWhitelist = async (data) => {
  try {
    await firewallApi.addWhitelist(data)
    await fetchWhitelist()
  } catch (err) {
    console.error('添加白名单失败:', err)
  }
}

const handleRemoveWhitelist = async (ip) => {
  try {
    await firewallApi.removeWhitelist(ip)
    activeWhitelist.value = activeWhitelist.value.filter(w => w.ip !== ip)
  } catch (err) {
    console.error('移除白名单失败:', err)
  }
}

// 确保 defense 中的数组字段始终为数组（后端可能返回逗号分隔字符串）
const ARRAY_FIELDS = ['internalIpPrefixes', 'idcIpPrefixes', 'safePaths', 'manualBlacklistIps', 'manualBlacklistUsers', 'manualWhitelistIps', 'botPatterns', 'browserPatterns', 'sensitivePaths']
const normalizeDefenseArrays = () => {
  const d = securitySettings.value.defense
  if (!d) return
  for (const key of ARRAY_FIELDS) {
    if (d[key] != null && !Array.isArray(d[key])) {
      d[key] = String(d[key]).split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  if (d.geoRules) {
    for (const key of ['sensitivePaths']) {
      if (d.geoRules[key] != null && !Array.isArray(d.geoRules[key])) {
        d.geoRules[key] = String(d.geoRules[key]).split(',').map(s => s.trim()).filter(Boolean)
      }
    }
  }
}

// 标签输入：添加/删除信任列表条目
const handleTagAdd = ({ field, value }) => {
  const arr = securitySettings.value.defense[field]
  if (!Array.isArray(arr)) {
    securitySettings.value.defense[field] = [value]
  } else if (!arr.includes(value)) {
    arr.push(value)
  }
}

const handleTagRemove = ({ field, index }) => {
  const arr = securitySettings.value.defense[field]
  if (Array.isArray(arr)) {
    arr.splice(index, 1)
  }
}

const toggleGuard = async (groupKey, apiKey = null) => {
  const systemKey = activeSystem.value || 'firewall'
  const data = await firewallApi.toggleGuard(systemKey, groupKey, apiKey)
  if (apiKey) {
    configs.value[systemKey].groups[groupKey].apis[apiKey].enabled = data.enabled
  } else {
    configs.value[systemKey].groups[groupKey].enabled = data.enabled
  }
}

const handleSaveNode = async ({ systemKey, groupKey, apiKey, data }) => {
  const updatedData = await firewallApi.updateConfig(systemKey, groupKey, apiKey, data)

  if (apiKey && groupKey) {
    configs.value[systemKey].groups[groupKey].apis[apiKey] = updatedData.groups[groupKey].apis[apiKey]
  } else if (groupKey) {
    configs.value[systemKey].groups[groupKey] = updatedData.groups[groupKey]
  } else {
    configs.value[systemKey] = updatedData
  }
}

const toggleSystem = async (systemKey) => {
  const data = await firewallApi.toggleSystem(systemKey)
  configs.value[systemKey].enabled = data.enabled
}

const resetGuard = async (key) => {
  // 暂时保留，可能需要适配 3 层
}

const editForm = reactive({
  ips: '',
  roles: '',
  requireLogin: false,
  description: '',
  updatedAt: ''
})

// ... (fetchData etc)

const openEditModal = (systemKey, groupKey = null, apiKey = null) => {
  let cfg = null
  if (apiKey && groupKey) {
    cfg = configs.value[systemKey].groups[groupKey].apis[apiKey]
  } else if (groupKey) {
    cfg = configs.value[systemKey].groups[groupKey]
  } else {
    cfg = configs.value[systemKey]
  }

  editingSystem.value = systemKey
  editingGroup.value = groupKey || ''
  editingApi.value = apiKey || ''
  editForm.ips = (cfg.allowIps || []).join(', ')
  editForm.roles = (cfg.allowRoles || []).join(', ')
  editForm.requireLogin = !!cfg.requireLogin
  editForm.description = cfg.description || ''
  editForm.updatedAt = cfg.updatedAt || ''
  isModalOpen.value = true
}

const saveConfig = async () => {
  const patch = {
    allowIps: editForm.ips.split(',').map(s => s.trim()).filter(s => s),
    allowRoles: editForm.roles.split(',').map(s => s.trim()).filter(s => s),
    requireLogin: editForm.requireLogin
  }

  const updatedData = await firewallApi.updateConfig(editingSystem.value, editingGroup.value, editingApi.value, patch)

  const sys = editingSystem.value
  const grp = editingGroup.value
  const api = editingApi.value

  if (api && grp) {
    configs.value[sys].groups[grp].apis[api] = updatedData.groups[grp].apis[api]
  } else if (grp) {
    configs.value[sys].groups[grp] = updatedData.groups[grp]
  } else {
    configs.value[sys] = updatedData
  }
  isModalOpen.value = false
}

// Charts Configuration

const regionChartOptions = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'rgba(255,255,255,0.1)',
    textStyle: { color: '#f8fafc', fontSize: 11 }
  },
  series: [{
    type: 'pie',
    radius: ['55%', '80%'],
    center: ['50%', '50%'],
    itemStyle: {
      borderRadius: 4,
      borderColor: '#0f172a',
      borderWidth: 2
    },
    label: { show: false },
    emphasis: {
      label: {
        show: true,
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fff'
      }
    },
    data: (summary.value.topRegions || []).map((r, idx) => ({
      name: r.region,
      value: r.count,
      itemStyle: {
        color: idx === 0 ? '#06b6d4' : idx === 1 ? '#6366f1' : idx === 2 ? '#8b5cf6' : '#334155'
      }
    }))
  }]
}))

const pathChartOptions = computed(() => {
  const data = (summary.value.topPaths || []).slice(0, 5).reverse();

  // 简化路径逻辑：移除冗余前缀，仅保留关键部分
  const simplifyPath = (path) => {
    if (!path) return 'Unknown';
    return path.replace(/^\/api\/firewall\/v1\//, '').replace(/^\/api\/v1\//, '').replace(/^\//, '');
  };

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#f8fafc', fontSize: 11 }
    },
    grid: {
      left: '5%',
      right: '15%',
      bottom: '10%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      show: false
    },
    yAxis: {
      type: 'category',
      data: data.map(p => simplifyPath(p.path)),
      axisLabel: {
        show: true,
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: 'bold',
        align: 'left',
        margin: -5,
        padding: [0, 0, 35, 10], // 将文字上移到柱子上方
        verticalAlign: 'bottom'
      },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [{
      type: 'bar',
      barWidth: 10,
      itemStyle: {
        borderRadius: 5,
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: 'rgba(99, 102, 241, 0.2)' },
          { offset: 1, color: '#6366f1' }
        ])
      },
      label: {
        show: true,
        position: 'right',
        color: '#f8fafc',
        fontSize: 10,
        fontWeight: 'bold',
        formatter: '{c}'
      },
      data: data.map(p => p.count)
    }]
  }
})

onMounted(() => {
  fetchData()
  connectWS()

  // 同步初始主题状态
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
})
</script>
