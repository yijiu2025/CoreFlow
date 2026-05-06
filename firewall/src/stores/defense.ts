/**
 * 封禁/白名单/模态框 Store
 * 管理活跃封禁列表、白名单、模态框开关状态
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { firewallApi } from '@/api/firewall'
import type { BlockEntry, AddBlockData, AddWhitelistData, RemoveEntry } from '@/types'

export const useDefenseStore = defineStore('defense', () => {
  const activeBlocks = ref<BlockEntry[]>([])
  const activeWhitelist = ref<BlockEntry[]>([])
  const nodeRefreshSuccess = ref(false)

  // 模态框状态
  const isConfigModalOpen = ref(false)
  const isSettingsModalOpen = ref(false)
  const isDefenseModalOpen = ref(false)
  const isModalOpen = ref(false)

  async function fetchBlocks(): Promise<void> {
    try {
      activeBlocks.value = await firewallApi.getBlocks() || []
    } catch (err) {
      console.error('获取封禁列表失败:', err)
    }
  }

  async function fetchWhitelist(): Promise<void> {
    try {
      activeWhitelist.value = await firewallApi.getWhitelist() || []
    } catch (err) {
      console.error('获取白名单失败:', err)
    }
  }

  async function handleAddBlock(data: AddBlockData): Promise<void> {
    try {
      if (data.type === 'fingerprint') {
        await firewallApi.addBlockFp(data)
      } else {
        await firewallApi.addBlock(data)
      }
      await fetchBlocks()
    } catch (err) {
      console.error('添加封禁失败:', err)
    }
  }

  async function handleRemoveBlock({ type, value }: RemoveEntry): Promise<void> {
    try {
      if (type === 'fingerprint') {
        await firewallApi.removeBlockFp(value)
      } else {
        await firewallApi.removeBlock(value)
      }
      activeBlocks.value = activeBlocks.value.filter((b: BlockEntry) =>
        type === 'fingerprint' ? b.fingerprint !== value : b.ip !== value
      )
    } catch (err) {
      console.error('移除封禁失败:', err)
    }
  }

  async function handleAddWhitelist(data: AddWhitelistData): Promise<void> {
    try {
      if (data.type === 'fingerprint') {
        await firewallApi.addWhitelistFp(data)
      } else {
        await firewallApi.addWhitelist(data)
      }
      await fetchWhitelist()
    } catch (err) {
      console.error('添加白名单失败:', err)
    }
  }

  async function handleRemoveWhitelist({ type, value }: RemoveEntry): Promise<void> {
    try {
      if (type === 'fingerprint') {
        await firewallApi.removeWhitelistFp(value)
      } else {
        await firewallApi.removeWhitelist(value)
      }
      activeWhitelist.value = activeWhitelist.value.filter((w: BlockEntry) =>
        type === 'fingerprint' ? w.fingerprint !== value : w.ip !== value
      )
    } catch (err) {
      console.error('移除白名单失败:', err)
    }
  }

  return {
    activeBlocks,
    activeWhitelist,
    nodeRefreshSuccess,
    isConfigModalOpen,
    isSettingsModalOpen,
    isDefenseModalOpen,
    isModalOpen,
    fetchBlocks,
    fetchWhitelist,
    handleAddBlock,
    handleRemoveBlock,
    handleAddWhitelist,
    handleRemoveWhitelist
  }
})
