/**
 * 安全设置 Store
 * 管理安全策略配置、防御子标签、标签输入
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { firewallApi } from '@/api/firewall'
import type { SecuritySettings, DefenseConfig, SettingsResponse } from '@/types'

// 需要确保为数组的字段
const ARRAY_FIELDS: (keyof DefenseConfig)[] = [
  'internalIpPrefixes', 'idcIpPrefixes', 'safePaths',
  'manualBlacklistIps', 'manualBlacklistUsers', 'manualWhitelistIps',
  'botPatterns', 'browserPatterns'
]

// defense 子对象的 key 列表
const DEFENSE_KEYS: string[] = [
  'enableAutoBlacklist', 'maxNotFoundAttempts', 'blacklistDuration', 'notFoundWindow',
  'enableRateLimit', 'rateLimitRequests', 'rateLimitWindow',
  'enableBruteForce', 'bruteLimit', 'bruteWindow', 'accountLockTime', 'ipBlockTime', 'bruteIpLimit',
  'enableConnLimit', 'maxConn',
  'enableGeoFilter', 'geoRules',
  'enableBotChallenge', 'botPatterns', 'browserPatterns', 'botChallengeNoUaLimit', 'botChallengeBotLimit', 'botChallengeBrowserLimit',
  'internalIpPrefixes', 'idcIpPrefixes', 'safePaths'
]

const DEFAULT_DEFENSE: DefenseConfig = {
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

export const useSettingsStore = defineStore('settings', () => {
  const securitySettings = ref<SecuritySettings>({
    defense: { ...DEFAULT_DEFENSE }
  })
  const availableIpApis = ref<string[]>([])
  const activeSettingsTab = ref('node')
  const activeDefenseSubTab = ref('scanning')

  function normalizeDefenseArrays(): void {
    const d = securitySettings.value.defense
    if (!d) return
    for (const key of ARRAY_FIELDS) {
      const val = d[key]
      if (val != null && !Array.isArray(val)) {
        (d as any)[key] = String(val).split(',').map((s: string) => s.trim()).filter(Boolean)
      }
    }
    if (d.geoRules) {
      const sp = d.geoRules.sensitivePaths
      if (sp != null && !Array.isArray(sp)) {
        d.geoRules.sensitivePaths = String(sp).split(',').map((s: string) => s.trim()).filter(Boolean)
      }
    }
  }

  function mergeSettings(incoming: Partial<SecuritySettings>): void {
    securitySettings.value = {
      ...securitySettings.value,
      ...incoming,
      defense: { ...securitySettings.value.defense, ...incoming.defense }
    }
    normalizeDefenseArrays()
  }

  async function fetchSettings(): Promise<void> {
    try {
      const settingsData: SettingsResponse = await firewallApi.getSettings()
      if (settingsData?.availableApis) {
        availableIpApis.value = settingsData.availableApis
      }
    } catch (err) {
      console.error('获取安全设置失败:', err)
    }
  }

  async function saveSecuritySettings(): Promise<void> {
    try {
      await firewallApi.updateSettings(securitySettings.value.defense)
    } catch (err) {
      console.error('保存安全设置失败:', err)
      throw err
    }
  }

  async function handleSavePartial(payload: Record<string, any>): Promise<void> {
    try {
      const keys = Object.keys(payload)
      let finalPayload: Record<string, any>
      if (keys.some(k => DEFENSE_KEYS.includes(k))) {
        finalPayload = { defense: payload }
      } else {
        finalPayload = payload
      }
      await firewallApi.updateSettings(finalPayload)
      console.log('✅ [Synergy Update] 配置已增量同步:', keys)
    } catch (err) {
      console.error('局部更新失败:', err)
      throw err
    }
  }

  function handleTagAdd({ field, value }: { field: string; value: string }): void {
    const arr = (securitySettings.value.defense as any)[field]
    if (!Array.isArray(arr)) {
      (securitySettings.value.defense as any)[field] = [value]
    } else if (!arr.includes(value)) {
      arr.push(value)
    }
  }

  function handleTagRemove({ field, index }: { field: string; index: number }): void {
    const arr = (securitySettings.value.defense as any)[field]
    if (Array.isArray(arr)) {
      arr.splice(index, 1)
    }
  }

  async function handleAddBlacklist(type: string, value: string): Promise<void> {
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

  async function handleRemoveBlacklist(type: string, value: string): Promise<void> {
    try {
      await firewallApi.removeBlacklist(type, value)
      if (type === 'ip') {
        securitySettings.value.defense.manualBlacklistIps =
          securitySettings.value.defense.manualBlacklistIps.filter((v: string) => v !== value)
      } else {
        securitySettings.value.defense.manualBlacklistUsers =
          securitySettings.value.defense.manualBlacklistUsers.filter((v: string) => v !== value)
      }
    } catch (err) {
      console.error('移除黑名单失败:', err)
    }
  }

  return {
    securitySettings,
    availableIpApis,
    activeSettingsTab,
    activeDefenseSubTab,
    normalizeDefenseArrays,
    mergeSettings,
    fetchSettings,
    saveSecuritySettings,
    handleSavePartial,
    handleTagAdd,
    handleTagRemove,
    handleAddBlacklist,
    handleRemoveBlacklist
  }
})
