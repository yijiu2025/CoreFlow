<template>
  <div class="glass rounded-2xl border transition-colors duration-500"
    :class="[
      padding,
      isDark ? 'bg-slate-950/60 border-white/5' : 'bg-white/80 border-slate-200'
    ]">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps({
  isDark: { type: Boolean, default: false },
  padding: { type: String, default: 'p-6' }
})
</script>
