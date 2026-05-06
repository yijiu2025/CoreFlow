/**
 * 仪表盘数据 Store
 * 管理 WebSocket 连接、实时日志、摘要统计、节点位置
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { firewallApi } from '@/api/firewall'
import { useSettingsStore } from './settings'
import type { MonitorSummary, TrafficLog, ServerNode, PathStat, RegionStat } from '@/types'

// WebSocket 实例和定时器（模块级，避免 Vue 代理）
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export const useDashboardStore = defineStore('dashboard', () => {
  const logs = ref<TrafficLog[]>([])
  const summary = ref<MonitorSummary>({
    totalRequests: 0,
    totalBlocked: 0,
    topRegions: [],
    topPaths: []
  })
  const wsEvents = ref<TrafficLog[]>([])
  const serverPosition = ref<ServerNode>({
    name: 'Core Defense Node',
    country: '中国',
    region: '河南',
    city: '郑州',
    ip: '127.0.0.1',
    lat: 34.75,
    lon: 113.65
  })

  function connectWS(): void {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.DEV ? 'localhost:3000' : window.location.host
    const wsUrl = `${protocol}//${host}/api/firewall/v1/monitor/ws`

    socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      console.log('🚀 [WS] 已连接到安全网关')
      if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null }
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send('PING')
        }
      }, 20000)
    }

    socket.onmessage = (event: MessageEvent) => {
      if (event.data === 'PONG') return

      try {
        const { type, data } = JSON.parse(event.data)
        if (type === 'INIT') {
          summary.value = data.summary
          logs.value = data.records || []
          if (data.summary.serverNode) {
            serverPosition.value = { ...serverPosition.value, ...data.summary.serverNode }
          }
          if (data.summary.securitySettings) {
            useSettingsStore().mergeSettings(data.summary.securitySettings)
          }
        } else if (type === 'LOG') {
          requestAnimationFrame(() => {
            logs.value.unshift(data)
            if (logs.value.length > 200) logs.value.pop()

            wsEvents.value.push(data)
            if (wsEvents.value.length > 50) wsEvents.value.shift()

            summary.value.totalRequests++
            if (data.blocked) summary.value.totalBlocked++

            // 增量更新路径统计
            if (!summary.value.topPaths) summary.value.topPaths = []
            const pathBase: string = data.url?.split('?')[0] || '/'
            const apiIdentifier: string = data.apiKey || pathBase
            const pathIdx = summary.value.topPaths.findIndex((p: PathStat) =>
              (apiIdentifier && p.apiName === apiIdentifier) || p.path === pathBase
            )
            if (pathIdx > -1) {
              summary.value.topPaths[pathIdx].count++
            } else {
              summary.value.topPaths.push({ path: pathBase, count: 1, apiName: data.apiKey || null })
            }
            summary.value.topPaths.sort((a: PathStat, b: PathStat) => b.count - a.count)
            if (summary.value.topPaths.length > 20) summary.value.topPaths.splice(20)

            // 增量更新地区统计
            if (!summary.value.topRegions) summary.value.topRegions = []
            const regionKey = `${data.region || '未知'}-${data.city || '未知'}`
            const regIdx = summary.value.topRegions.findIndex((r: RegionStat) => r.region === regionKey)
            if (regIdx > -1) {
              summary.value.topRegions[regIdx].count++
            } else {
              summary.value.topRegions.push({ region: regionKey, count: 1 })
            }
            summary.value.topRegions.sort((a: RegionStat, b: RegionStat) => b.count - a.count)
            if (summary.value.topRegions.length > 20) summary.value.topRegions.pop()
          })
        }
      } catch (e) {
        console.error('[WS] 消息解析失败', e)
      }
    }

    socket.onclose = () => {
      console.warn('🔌 [WS] 连接断开，正在尝试重连...')
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
      if (!reconnectTimer) {
        reconnectTimer = setInterval(connectWS, 3000)
      }
    }

    socket.onerror = () => {
      socket?.close()
    }
  }

  function disconnectWS(): void {
    if (socket) { socket.close(); socket = null }
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  }

  async function refreshNodeLocation(): Promise<boolean> {
    try {
      const data = await firewallApi.refreshNode()
      serverPosition.value = { ...serverPosition.value, ...data }
      return true
    } catch (err) {
      console.error('刷新节点位置失败:', err)
      return false
    }
  }

  function resetSummary(): void {
    logs.value = []
    summary.value = { totalRequests: 0, totalBlocked: 0, topRegions: [], topPaths: [] }
  }

  return {
    logs,
    summary,
    wsEvents,
    serverPosition,
    connectWS,
    disconnectWS,
    refreshNodeLocation,
    resetSummary
  }
})
