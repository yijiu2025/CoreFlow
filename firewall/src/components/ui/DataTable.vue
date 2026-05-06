<template>
  <div class="border rounded-2xl overflow-hidden transition-all duration-300"
    :class="isDark ? 'border-white/5 bg-black/10' : 'border-slate-200 bg-white shadow-sm'">
    <!-- Header -->
    <div class="flex items-center px-6 py-3 border-b transition-colors"
      :class="isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50/80 border-slate-100'">
      <div v-for="col in columns" :key="col.key"
        class="text-[10px] font-black text-slate-400 uppercase tracking-widest"
        :class="col.class">
        {{ col.label }}
      </div>
    </div>
    <!-- Body -->
    <div class="divide-y transition-colors overflow-y-auto custom-scrollbar"
      :class="[isDark ? 'divide-white/5' : 'divide-slate-100', maxHeight]">
      <div v-for="(row, i) in data" :key="row.id || row.ip || i"
        class="flex items-center px-6 py-3 hover:bg-indigo-500/5 transition-colors">
        <div v-for="col in columns" :key="col.key" :class="col.class">
          <slot :name="`cell-${col.key}`" :row="row" :index="i">
            {{ row[col.key] }}
          </slot>
        </div>
      </div>
      <div v-if="!data.length" class="px-6 py-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        {{ emptyMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  isDark: { type: Boolean, default: false },
  columns: { type: Array, default: () => [] },
  data: { type: Array, default: () => [] },
  emptyMessage: { type: String, default: 'No Data' },
  maxHeight: { type: String, default: 'max-h-64' }
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.2); border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.4); }
</style>
