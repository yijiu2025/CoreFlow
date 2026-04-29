<template>
  <div class="w-full h-full relative" ref="containerRef">
    <!-- ECharts canvas (仅负责底图和流量线) -->
    <div ref="mapRef" class="w-full h-full"></div>

    <!-- HTML Overlay: Defense Node (完全绕开 ECharts 多 canvas 同步问题) -->
    <div
      v-if="nodePixel"
      class="pointer-events-none absolute top-0 left-0"
      :style="{ transform: `translate(${nodePixel[0]}px, ${nodePixel[1]}px)` }"
    >
      <!-- 涟漪圈 (纯 CSS，与底图同帧渲染，无多 canvas 偏差) -->
      <div class="absolute -translate-x-1/2 -translate-y-1/2">
        <div class="ripple-ring text-amber-400"></div>
        <div class="ripple-ring delay-1 text-amber-400"></div>
        <!-- 核心圆点 -->
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full"
          style="background: #fbbf24; box-shadow: 0 0 15px #fbbf24, 0 0 30px rgba(251, 191, 36, 0.6);"
        ></div>
      </div>
      <!-- 标签 -->
      <div
        class="absolute left-6 -translate-y-1/2 whitespace-nowrap text-[11px] font-bold px-3 py-1.5 rounded-full border shadow-2xl backdrop-blur-md transition-all"
        :style="{
           background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
           borderColor: isDark ? 'rgba(6, 182, 212, 0.4)' : 'rgba(79, 70, 229, 0.3)',
           color: isDark ? '#22d3ee' : '#4f46e5',
           boxShadow: isDark ? '0 0 20px rgba(6, 182, 212, 0.15)' : '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
        }"
      >
        <span class="opacity-50 mr-2 tracking-widest text-[9px] uppercase">{{ props.serverNode?.name || 'CORE' }}</span>
        <span class="tracking-tight">{{ props.serverNode?.country || '中国' }} · {{ props.serverNode?.region || '未知' }}</span>
      </div>
    </div>

    <!-- 背景光晕 -->
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.07),transparent_70%)] pointer-events-none"></div>
  </div>
</template>

<script setup>
import { onMounted, ref, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios'
import { chinaGeoCoordMap, globalGeoCoordMap } from '../utils/geoData'

import worldUrl from '../assets/maps/world.json?url'
import chinaUrl from '../assets/maps/china_full.json?url'

const props = defineProps({
  events: Array,
  serverNode: Object,
  isDark: Boolean,
  showTrajectory: {
    type: Boolean,
    default: true
  }
})

const containerRef = ref(null)
const mapRef = ref(null)
let chart = null
let userHasRoamed = false // 记录用户是否手动移动过地图

// 防御节点的屏幕像素坐标（由地图事件实时更新）
const nodePixel = ref(null)

const chinaProvinces = [
  '北京市', '天津市', '河北省', '山西省', '内蒙古自治区',
  '辽宁省', '吉林省', '黑龙江省', '上海市', '江苏省',
  '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '广西壮族自治区',
  '海南省', '重庆市', '四川省', '贵州省', '云南省',
  '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区',
  '新疆维吾尔自治区', '台湾省', '香港特别行政区', '澳门特别行政区'
]

const getCoord = (data) => {
  if (data && typeof data === 'object' && data.lon !== undefined && data.lat !== undefined) {
    return [parseFloat(data.lon), parseFloat(data.lat)]
  }
  const name = typeof data === 'string' ? data : (data?.region || data?.name || '中国')
  return chinaGeoCoordMap[name] || globalGeoCoordMap[name] || globalGeoCoordMap['中国']
}

const getHighlightRegions = () => {
  const regions = [...chinaProvinces]
  if (!props.serverNode || props.serverNode.country === '中国') return regions
  
  const countryMap = {
    '日本': 'Japan', '美国': 'United States', '德国': 'Germany', 
    '俄罗斯': 'Russia', '英国': 'United Kingdom', '法国': 'France', '新加坡': 'Singapore'
  }
  const foreignCountry = countryMap[props.serverNode.country] || props.serverNode.country
  regions.push(foreignCountry)
  return regions
}

// 核心：将地理坐标实时换算为屏幕像素坐标
const updateNodePixel = () => {
  if (!chart || !props.serverNode) return
  const coord = getCoord(props.serverNode)
  try {
    const px = chart.convertToPixel('geo', coord)
    if (px && !isNaN(px[0]) && !isNaN(px[1])) {
      nodePixel.value = [px[0], px[1]]
    }
  } catch (e) {
    // convertToPixel 在图表未就绪时可能抛出，忽略
  }
}

const initMap = async () => {
  chart = echarts.init(mapRef.value)

  try {
    const [worldRes, chinaRes] = await Promise.all([
      axios.get(worldUrl, { baseURL: '' }),
      axios.get(chinaUrl, { baseURL: '' })
    ])
    const worldData = worldRes.data
    const chinaData = chinaRes.data
    worldData.features = worldData.features.filter(f => f.properties.name !== 'China')
    worldData.features.push(...chinaData.features)
    echarts.registerMap('world-china', worldData)
  } catch (err) {
    console.error('地图数据加载失败', err)
  }

  const initialCoord = getCoord(props.serverNode || '河南')

  chart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    geo: {
      map: 'world-china',
      roam: true,
      zoom: 1.2,
      center: initialCoord,
      label: { show: false },
      itemStyle: {
        areaColor: props.isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(240, 244, 248, 0.6)',
        borderColor: props.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(148, 163, 184, 0.3)',
        borderWidth: 1,
        shadowBlur: 0
      },
      emphasis: {
        itemStyle: {
          areaColor: props.isDark ? '#0f172a' : '#eef2ff',
          borderColor: props.isDark ? '#06b6d4' : '#4f46e5',
          borderWidth: 2
        }
      },
      // 重点高亮：中国区域（名称必须与 GeoJSON feature.properties.name 完全一致）
      regions: getHighlightRegions().map(name => ({
        name,
        itemStyle: {
          areaColor: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: props.isDark 
              ? [{ offset: 0, color: 'rgba(6, 182, 212, 0.2)' }, { offset: 1, color: 'rgba(6, 182, 212, 0.05)' }]
              : [{ offset: 0, color: 'rgba(99, 102, 241, 0.25)' }, { offset: 1, color: 'rgba(165, 180, 252, 0.1)' }]
          },
          borderColor: props.isDark ? 'rgba(34, 211, 238, 0.6)' : 'rgba(79, 70, 229, 0.6)',
          borderWidth: 1.5,
          shadowBlur: 20,
          shadowColor: props.isDark ? 'rgba(6, 182, 212, 0.4)' : 'rgba(79, 70, 229, 0.2)'
        }
      }))

    },
    series: [
      {
        name: 'lines',
        type: 'lines',
        coordinateSystem: 'geo',
        geoIndex: 0,
        effect: {
          show: true,
          period: 3,
          trailLength: 0.7,
          color: props.isDark ? '#06b6d4' : '#4f46e5',
          symbolSize: 4,
          loop: false
        },
        lineStyle: {
          width: 1,
          opacity: 0,
          curveness: 0.3
        },
        silent: true,
        data: []
      }
    ]
  })

  // 关键：每次地图 roam（缩放/平移）时，立即重算 HTML 节点的像素坐标
  chart.on('georoam', () => {
    userHasRoamed = true // 用户一旦手动操作，停止自动居中
    updateNodePixel()
  })
  chart.on('finished', updateNodePixel)

  // 地图渲染完成后首次计算
  setTimeout(updateNodePixel, 150)
}

// 监听位置变化，更新中心点和高亮
watch(() => props.serverNode, (newNode) => {
  if (!chart || !newNode) return
  const coord = getCoord(newNode)
  
  const geoUpdate = {
    regions: getHighlightRegions().map(name => ({
      name,
      itemStyle: {
        areaColor: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: props.isDark 
            ? [{ offset: 0, color: 'rgba(6, 182, 212, 0.2)' }, { offset: 1, color: 'rgba(6, 182, 212, 0.05)' }]
            : [{ offset: 0, color: 'rgba(99, 102, 241, 0.25)' }, { offset: 1, color: 'rgba(165, 180, 252, 0.1)' }]
        },
        borderColor: props.isDark ? 'rgba(34, 211, 238, 0.6)' : 'rgba(79, 70, 229, 0.6)',
        borderWidth: 1.5,
        shadowBlur: 20,
        shadowColor: props.isDark ? 'rgba(6, 182, 212, 0.4)' : 'rgba(79, 70, 229, 0.2)'
      }
    }))
  }

  // 只有当用户没有手动移动过地图时，才执行自动居中
  if (!userHasRoamed) {
    geoUpdate.center = coord
  }

  chart.setOption({
    geo: geoUpdate
  })
  updateNodePixel()
}, { deep: true })

const eventBuffer = []
let updateTimer = null

watch(() => props.events, (newEvents) => {
  if (!chart || !newEvents.length || !props.serverNode || !props.showTrajectory) return
  eventBuffer.push(newEvents[newEvents.length - 1])
}, { deep: true })

const startBatchProcessor = () => {
  updateTimer = setInterval(() => {
    if (!chart) return
    const opts = chart.getOption()
    const lines = opts.series?.[0]?.data || []
    if (!eventBuffer.length && !lines.length) return

    const now = Date.now()
    const filteredLines = lines.filter(l => (now - l.timestamp) < 3500)

    // 如果关闭了轨迹显示，且当前没有正在运行的动画线，则直接清除数据
    if (!props.showTrajectory) {
      if (filteredLines.length > 0) {
        chart.setOption({ series: [{ name: 'lines', data: [] }] })
      }
      eventBuffer.length = 0 // 清空缓冲区
      return
    }

    while (eventBuffer.length > 0) {
      const event = eventBuffer.shift()
      const fromCoord = getCoord(event.region)
      const toCoord = getCoord(props.serverNode)
      const eventColor = event.blocked ? '#ef4444' : (props.isDark ? '#ffffff' : '#4f46e5')

      filteredLines.push({
        timestamp: now,
        coords: [fromCoord, toCoord],
        lineStyle: { color: eventColor, opacity: 0.1 },
        effect: {
          show: true,
          period: 3,
          trailLength: 0.8,
          color: eventColor,
          symbolSize: event.blocked ? 5 : 4,
          loop: false
        }
      })
    }

    chart.setOption({ series: [{ name: 'lines', data: filteredLines }] })
  }, 300)
}

// 主题切换
// ... (Helpers moved to top)

watch(() => props.isDark, () => {
  if (!chart) return
  const accentColor = props.isDark ? '#06b6d4' : '#4f46e5'
  chart.setOption({
    geo: {
      itemStyle: {
        areaColor: props.isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(240, 244, 248, 0.6)',
        borderColor: props.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(148, 163, 184, 0.3)',
        borderWidth: 1,
        shadowBlur: 0
      },
      emphasis: {
        itemStyle: {
          areaColor: props.isDark ? '#0f172a' : '#eef2ff',
          borderColor: accentColor,
        }
      },
      regions: getHighlightRegions().map(name => ({
        name,
        itemStyle: {
          areaColor: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: props.isDark 
              ? [{ offset: 0, color: 'rgba(6, 182, 212, 0.2)' }, { offset: 1, color: 'rgba(6, 182, 212, 0.05)' }]
              : [{ offset: 0, color: 'rgba(99, 102, 241, 0.25)' }, { offset: 1, color: 'rgba(165, 180, 252, 0.1)' }]
          },
          borderColor: props.isDark ? 'rgba(34, 211, 238, 0.6)' : 'rgba(79, 70, 229, 0.6)',
          borderWidth: 1.5,
          shadowBlur: 20,
          shadowColor: props.isDark ? 'rgba(6, 182, 212, 0.4)' : 'rgba(79, 70, 229, 0.2)'
        }
      }))
    },
    series: [{ name: 'lines', effect: { color: accentColor } }]
  })
})

onMounted(() => {
  initMap()
  startBatchProcessor()
  window.addEventListener('resize', () => {
    chart?.resize()
    // resize 后坐标系变化，重新计算像素位置
    setTimeout(updateNodePixel, 50)
  })
})

onUnmounted(() => {
  clearInterval(updateTimer)
  chart?.dispose()
})
</script>

<style scoped>
.ripple-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid currentColor;
  transform: translate(-50%, -50%) scale(0.3);
  animation: ripple 2.4s ease-out infinite;
  opacity: 0;
}
.ripple-ring.delay-1 {
  animation-delay: 1.2s;
}
@keyframes ripple {
  0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; }
}
</style>
