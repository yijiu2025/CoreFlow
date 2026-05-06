<template>
  <span class="relative flex h-2 w-2">
    <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
      :class="pingColor"></span>
    <span class="relative inline-flex rounded-full h-2 w-2"
      :class="dotColor"></span>
  </span>
</template>

<script setup lang="ts">
const props = defineProps({
  color: { type: String, default: 'cyan' }
})

const colorMap = {
  cyan: { ping: 'bg-cyan-400', dot: 'bg-cyan-500' },
  green: { ping: 'bg-green-400', dot: 'bg-green-500' },
  indigo: { ping: 'bg-indigo-400', dot: 'bg-indigo-500' },
  rose: { ping: 'bg-rose-400', dot: 'bg-rose-500' },
  amber: { ping: 'bg-amber-400', dot: 'bg-amber-500' }
}

const pingColor = colorMap[props.color]?.ping || colorMap.cyan.ping
const dotColor = colorMap[props.color]?.dot || colorMap.cyan.dot
</script>
