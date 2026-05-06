<template>
  <div class="flex flex-col gap-3 p-2">
    <div v-for="(item, index) in data.slice(0, 6)" :key="item.path"
      class="group relative border rounded-xl p-3 transition-all animate-fade-in"
      :class="isDark ? 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10' : 'bg-white border-slate-100 hover:border-indigo-100 hover:shadow-sm'"
      :style="{ animationDelay: `${index * 80}ms` }">

      <div class="flex justify-between items-start mb-2">
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-[10px] font-bold uppercase tracking-tight"
              :class="isDark ? 'text-slate-500' : 'text-slate-400'">{{ $t('stats.endpoint') }}</span>
            <span v-if="item.apiName"
              class="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[8px] font-mono text-slate-500 uppercase tracking-tighter">{{
                item.apiName }}</span>
          </div>
          <span class="text-xs font-mono font-bold truncate pr-2"
            :class="isDark ? 'text-slate-200' : 'text-slate-900'">{{ simplifyPath(item.path) }}</span>
        </div>
        <div class="text-right">
          <span class="text-[10px] font-bold uppercase block mb-0.5"
            :class="isDark ? 'text-slate-500' : 'text-slate-400'">{{ $t('stats.hits') }}</span>
          <span class="text-sm font-mono font-bold leading-none"
            :class="isDark ? 'text-indigo-400' : 'text-indigo-600'">{{ item.count }}</span>
        </div>
      </div>

      <!-- Mini Sparkline-style progress -->
      <div class="h-1 w-full rounded-full overflow-hidden transition-colors duration-500"
        :class="isDark ? 'bg-slate-900/50' : 'bg-slate-100'">
        <div class="h-full rounded-full transition-all duration-1000"
          :class="isDark ? 'bg-gradient-to-r from-transparent to-indigo-500' : 'bg-indigo-500'"
          :style="{ width: `${(item.count / maxCount) * 100}%` }"></div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!data.length" class="py-10 flex flex-col items-center opacity-20">
      <Database class="w-8 h-8 mb-2" />
      <span class="text-[10px] font-bold tracking-widest">{{ $t('stats.no_traffic') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Database } from 'lucide-vue-next'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  isDark: Boolean
})

const maxCount = computed(() => {
  return props.data.length > 0 ? Math.max(...props.data.map(d => d.count)) : 100
})

const simplifyPath = (path) => {
  if (!path) return '---'
  let p = path.replace(/^\/api\/v1/, '')
  if (p === '') return '/'
  return p
}
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
</style>
