<template>
  <div class="flex flex-col gap-4 p-2">
    <div v-for="(item, index) in data.slice(0, 5)" :key="item.region" 
         class="group relative flex flex-col gap-1.5 animate-slide-right"
         :style="{ animationDelay: `${index * 100}ms` }">
      
      <div class="flex justify-between items-end px-1">
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold border transition-colors duration-500"
            :class="isDark ? 'bg-white/5 text-slate-500 border-white/5' : 'bg-slate-100 text-slate-400 border-slate-200'">
            0{{ index + 1 }}
          </span>
          <span class="text-xs font-bold tracking-tight" :class="isDark ? 'text-slate-300' : 'text-slate-700'">{{ item.region }}</span>
        </div>
        <div class="flex items-baseline gap-1">
          <span class="text-sm font-mono font-bold" :class="isDark ? 'text-cyan-400' : 'text-indigo-600'">{{ item.count }}</span>
          <span class="text-[9px] uppercase font-bold" :class="isDark ? 'text-slate-600' : 'text-slate-400'">{{ $t('stats.reqs') }}</span>
        </div>
      </div>

      <!-- Progress Track -->
      <div class="h-1.5 w-full rounded-full overflow-hidden border transition-colors duration-500"
        :class="isDark ? 'bg-slate-900/50 border-white/5' : 'bg-slate-100 border-slate-200'">
        <div 
          class="h-full rounded-full transition-all duration-1000 ease-out relative"
          :style="{ 
            width: `${(item.count / maxCount) * 100}%`,
            background: isDark 
              ? `linear-gradient(90deg, transparent, ${getColor(index)})` 
              : getColor(index)
          }"
        >
          <!-- Glimmer effect -->
          <div class="absolute inset-0 bg-white/20 animate-pulse"></div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!data.length" class="py-10 flex flex-col items-center opacity-20">
      <Globe class="w-8 h-8 mb-2" />
      <span class="text-[10px] font-bold tracking-widest">{{ $t('stats.waiting_data') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Globe } from 'lucide-vue-next'

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

const getColor = (index) => {
  const colors = props.isDark 
    ? ['#06b6d4', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b']
    : ['#4f46e5', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef']
  return colors[index % colors.length]
}
</script>

<style scoped>
@keyframes slideRight {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}
.animate-slide-right {
  animation: slideRight 0.5s ease-out forwards;
}
</style>
