<template>
  <div @click="$emit('click')"
    class="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all group"
    :class="isActive ? activeClass : inactiveClass">
    <div class="flex items-center gap-3">
      <component :is="icon" v-if="icon" class="w-4 h-4"
        :class="isActive ? activeIconClass : inactiveIconClass" />
      <span class="text-sm font-semibold">{{ label }}</span>
    </div>
    <ChevronRight v-if="isActive && showChevron" class="w-4 h-4 opacity-50" />
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

const props = defineProps({
  isActive: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
  label: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
  showChevron: { type: Boolean, default: true },
  variant: { type: String, default: 'cyan' }
})

defineEmits(['click'])

const variants = {
  cyan: {
    activeDark: 'bg-cyan-500/20 text-cyan-400 shadow-sm',
    activeLight: 'bg-indigo-600 text-white shadow-sm',
    iconActiveDark: 'text-cyan-400',
    iconActiveLight: 'text-white'
  },
  indigo: {
    activeDark: 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20 shadow-xl',
    activeLight: 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20',
    iconActiveDark: 'text-indigo-400',
    iconActiveLight: 'text-white'
  }
}

const v = variants[props.variant] || variants.cyan

const activeClass = props.isDark ? v.activeDark : v.activeLight
const inactiveClass = 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'
const activeIconClass = props.isDark ? v.iconActiveDark : v.iconActiveLight
const inactiveIconClass = 'text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400'
</script>
