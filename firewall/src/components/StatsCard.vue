<template>
  <div class="glass p-6 rounded-2xl glow-border">
    <div class="flex justify-between items-start mb-4">
      <div :class="[`p-3 rounded-xl bg-${color}-500/10 text-${color}-400`]">
        <slot name="icon"></slot>
      </div>
      <span :class="[`text-xs font-semibold text-${color}-400 bg-${color}-400/10 px-2 py-1 rounded`]">{{ label }}</span>
    </div>
    <h3 class="text-3xl font-bold">{{ value }}</h3>
    <p class="text-slate-400 text-sm mt-1">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps({
  label: String,
  value: [String, Number],
  description: String,
  color: {
    type: String,
    default: 'cyan'
  }
})
</script>
