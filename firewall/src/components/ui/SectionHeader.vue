<template>
  <div class="px-5 py-3 border-b bg-white/5 flex items-center justify-between transition-colors duration-500"
    :class="isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'">
    <span class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
      :class="isDark ? 'text-slate-400' : 'text-slate-600'">
      <component :is="icon" v-if="icon" class="w-3 h-3" :class="iconColor" />
      <slot>{{ label }}</slot>
    </span>
    <slot name="actions" />
  </div>
</template>

<script setup lang="ts">
defineProps({
  isDark: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
  iconColor: { type: String, default: 'text-indigo-500' },
  label: { type: String, default: '' }
})
</script>
