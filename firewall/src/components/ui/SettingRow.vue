<template>
  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors duration-300"
    :class="isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center"
        :class="iconBgClass">
        <slot name="icon">
          <component :is="icon" class="w-5 h-5" :class="iconColorClass" />
        </slot>
      </div>
      <div>
        <p class="text-sm font-bold" :class="isDark ? 'text-white' : 'text-slate-900'">{{ title }}</p>
        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{{ description }}</p>
      </div>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  isDark: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  iconBg: { type: String, default: '' },
  iconColor: { type: String, default: '' }
})

const iconBgClass = props.iconBg || 'bg-indigo-500/10'
const iconColorClass = props.iconColor || 'text-indigo-500'
</script>
