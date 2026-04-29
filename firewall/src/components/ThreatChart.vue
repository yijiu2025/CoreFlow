<template>
  <div class="glass p-6 rounded-2xl h-[350px]" ref="chartRef"></div>
</template>

<script setup>
import { onMounted, ref, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  options: Object
})

const chartRef = ref(null)
let chart = null

onMounted(() => {
  chart = echarts.init(chartRef.value, 'dark')
  chart.setOption(props.options)
  
  window.addEventListener('resize', handleResize)
})

const handleResize = () => {
  chart?.resize()
}

watch(() => props.options, (newOpts) => {
  chart?.setOption(newOpts)
}, { deep: true })

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>
