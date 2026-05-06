<template>
  <div>
    <div v-if="label" class="flex items-center justify-between mb-2">
      <label class="text-[10px] font-bold uppercase tracking-widest"
        :class="isDark ? 'text-slate-500' : 'text-slate-400'">{{ label }}</label>
      <span v-if="badge" class="text-[9px] font-bold px-2 py-0.5 rounded-md"
        :class="badgeClass">{{ badge }}</span>
    </div>
    <div class="flex flex-wrap gap-1.5 p-3 rounded-xl border min-h-[40px]"
      :class="isDark ? 'bg-black/40 border-white/10' : 'bg-white border-slate-200'">
      <span v-for="(item, i) in modelValue" :key="i"
        class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
        :class="tagClass">
        <span class="font-mono">{{ item }}</span>
        <X class="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100"
          @click="$emit('remove', i)" />
      </span>
      <input :placeholder="placeholder"
        @keydown.enter.prevent="handleAdd"
        class="flex-1 min-w-[120px] bg-transparent text-xs font-bold outline-none"
        :class="isDark ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'">
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  badge: { type: String, default: '' },
  placeholder: { type: String, default: 'Type and press Enter...' },
  isDark: { type: Boolean, default: false },
  color: { type: String, default: 'indigo' }
})

const emit = defineEmits(['add', 'remove'])

const handleAdd = (event) => {
  const val = event.target.value.trim()
  if (!val) return
  emit('add', val)
  event.target.value = ''
}

const colorMap = {
  indigo: {
    tag: 'bg-indigo-500/15 text-indigo-400',
    tagLight: 'bg-indigo-50 text-indigo-600',
    badge: 'text-indigo-400 bg-indigo-500/10'
  },
  rose: {
    tag: 'bg-rose-500/15 text-rose-400',
    tagLight: 'bg-rose-50 text-rose-600',
    badge: 'text-rose-400 bg-rose-500/10'
  },
  emerald: {
    tag: 'bg-emerald-500/15 text-emerald-400',
    tagLight: 'bg-emerald-50 text-emerald-600',
    badge: 'text-emerald-400 bg-emerald-500/10'
  }
}

const c = colorMap[props.color] || colorMap.indigo
const tagClass = props.isDark ? c.tag : c.tagLight
const badgeClass = c.badge
</script>
