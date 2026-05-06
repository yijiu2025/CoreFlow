<template>
  <button @click="$emit('update:modelValue', !modelValue)"
    class="w-10 h-5 rounded-full p-0.5 transition-all flex items-center shadow-inner"
    :class="modelValue ? activeColor : inactiveColor"
    role="switch"
    :aria-checked="modelValue">
    <div class="w-4 h-4 bg-white rounded-full transition-all transform"
      :class="modelValue ? 'translate-x-5' : ''"></div>
  </button>
</template>

<script setup lang="ts">
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  color: { type: String, default: 'indigo' }
})

defineEmits(['update:modelValue'])

const colorMap = {
  indigo: { active: 'bg-indigo-500', inactive: 'bg-slate-400' },
  cyan: { active: 'bg-cyan-500', inactive: 'bg-slate-400' },
  emerald: { active: 'bg-emerald-500', inactive: 'bg-slate-400' },
  amber: { active: 'bg-amber-500', inactive: 'bg-slate-400' },
  rose: { active: 'bg-rose-500', inactive: 'bg-slate-400' },
  green: { active: 'bg-green-500', inactive: 'bg-slate-400' }
}

const activeColor = colorMap[props.color]?.active || colorMap.indigo.active
const inactiveColor = colorMap[props.color]?.inactive || colorMap.indigo.inactive
</script>
