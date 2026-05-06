<template>
  <button
    class="font-black text-[11px] uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center gap-2"
    :class="[
      sizeClass,
      variantClass
    ]"
    v-bind="$attrs">
    <slot />
  </button>
</template>

<script setup lang="ts">
const props = defineProps({
  variant: { type: String, default: 'cyan' },
  size: { type: String, default: 'md' }
})

const sizeMap = {
  sm: 'px-6 py-2.5 rounded-xl text-[10px]',
  md: 'px-10 py-4 rounded-xl',
  lg: 'px-12 py-4 rounded-xl'
}

const variantMap = {
  cyan: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20',
  indigo: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20',
  emerald: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20',
  rose: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20',
  ghost: 'bg-transparent hover:bg-white/5 text-slate-400 hover:text-slate-600 shadow-none'
}

const sizeClass = sizeMap[props.size] || sizeMap.md
const variantClass = variantMap[props.variant] || variantMap.cyan
</script>
