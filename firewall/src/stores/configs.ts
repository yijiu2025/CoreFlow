/**
 * 3 级 Guard 配置 Store
 * 管理 API 配置树、编辑表单、guard 切换
 */
import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { firewallApi } from '@/api/firewall'
import { useDefenseStore } from './defense'
import type { ApiConfigs, EditForm, SaveNodePayload, ApiNodeConfig, GroupConfig, SystemConfig } from '@/types'

export const useConfigsStore = defineStore('configs', () => {
  const configs = ref<ApiConfigs>({})
  const loaded = ref(false)
  const activeSystem = ref('firewall')
  const editingSystem = ref('')
  const editingGroup = ref('')
  const editingApi = ref('')

  const editForm = reactive<EditForm>({
    ips: '',
    roles: '',
    requireLogin: false,
    description: '',
    updatedAt: ''
  })

  async function fetchConfigs(): Promise<void> {
    try {
      const configData = await firewallApi.getApiConfigs().catch((err: any) => {
        if (err.code === 401) return null
        throw err
      })
      if (configData) {
        configs.value = configData
        loaded.value = true
      }
    } catch (err) {
      console.error('获取 API 配置失败:', err)
    }
  }

  async function toggleGuard(groupKey: string, apiKey: string | null = null): Promise<void> {
    const systemKey = activeSystem.value || 'firewall'
    const data = await firewallApi.toggleGuard(systemKey, groupKey, apiKey)
    if (apiKey) {
      configs.value[systemKey].groups[groupKey].apis[apiKey].enabled = data.enabled
    } else {
      configs.value[systemKey].groups[groupKey].enabled = data.enabled
    }
  }

  async function toggleSystem(systemKey: string): Promise<void> {
    const data = await firewallApi.toggleSystem(systemKey)
    configs.value[systemKey].enabled = data.enabled
  }

  async function handleSaveNode({ systemKey, groupKey, apiKey, data }: SaveNodePayload): Promise<void> {
    const updatedData = await firewallApi.updateConfig(systemKey, groupKey, apiKey, data)
    if (apiKey && groupKey) {
      configs.value[systemKey].groups[groupKey].apis[apiKey] = updatedData.groups[groupKey].apis[apiKey]
    } else if (groupKey) {
      configs.value[systemKey].groups[groupKey] = updatedData.groups[groupKey]
    } else {
      configs.value[systemKey] = updatedData
    }
  }

  function openEditModal(systemKey: string, groupKey: string | null = null, apiKey: string | null = null): void {
    let cfg: any = null
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

    const defenseStore = useDefenseStore()
    defenseStore.isModalOpen = true
  }

  async function saveConfig(): Promise<void> {
    const patch = {
      allowIps: editForm.ips.split(',').map((s: string) => s.trim()).filter((s: string) => s),
      allowRoles: editForm.roles.split(',').map((s: string) => s.trim()).filter((s: string) => s),
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

    const defenseStore = useDefenseStore()
    defenseStore.isModalOpen = false
  }

  function resetGuard(_key?: string): void {
    // 暂时保留，可能需要适配 3 层
  }

  return {
    configs,
    loaded,
    activeSystem,
    editingSystem,
    editingGroup,
    editingApi,
    editForm,
    fetchConfigs,
    toggleGuard,
    toggleSystem,
    handleSaveNode,
    openEditModal,
    saveConfig,
    resetGuard
  }
})
