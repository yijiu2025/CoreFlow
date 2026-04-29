<template>
  <div :class="{ 'dark': isDark }"
    class="flex h-full min-h-0 bg-var-bg text-var-text overflow-hidden font-sans border-t border-var-border transition-colors duration-500">
    <!-- 侧边导航: 系统列表 -->
    <div class="w-64 border-r border-var-border flex flex-col bg-var-side-bg backdrop-blur-md">
      <div class="p-6">
        <h2 class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">{{
          $t('nav.matrix') }}</h2>

        <nav class="space-y-1">
          <div v-for="(system, sysKey) in configs" :key="sysKey" @click="selectSystem(sysKey)"
            :class="activeSystem === sysKey ? 'active-node shadow-sm' : 'inactive-node'"
            class="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all group">
            <div class="flex items-center gap-3">
              <Shield
                :class="activeSystem === sysKey ? 'text-primary' : 'text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400'"
                class="w-4 h-4" />
              <span class="text-sm font-semibold">{{ system.alias || system.name || sysKey }}</span>
            </div>
            <ChevronRight v-if="activeSystem === sysKey" class="w-4 h-4 opacity-50" />
          </div>
        </nav>
      </div>

      <div class="mt-auto p-6 border-t border-var-border" :class="isDark ? 'bg-black/20' : 'bg-slate-100/50'">
        <div
          class="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
          <Info class="w-3 h-3" /> {{ $t('config.inheritance_title') }}
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-600 leading-relaxed">
          {{ $t('config.inheritance') }}
        </p>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="flex-1 flex flex-col min-w-0 bg-var-main-bg">
      <div v-if="currentSystemData" class="flex-1 flex flex-col min-h-0">
        <!-- 头部: 系统概览 -->
        <header class="px-10 py-8 border-b border-var-border bg-var-header-bg sticky top-0 z-10">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest"
                :class="isDark ? 'text-cyan-400' : 'text-indigo-500'">
                <span class="px-1.5 py-0.5 rounded border"
                  :class="isDark ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-indigo-50 border-indigo-100'">{{
                    $t('config.l1') }}</span>
                <span class="text-slate-300 dark:text-slate-700">/</span>
                <span>{{ activeSystem }}</span>
              </div>
              <div class="flex items-center gap-3 mb-2">
                <h1 class="text-3xl font-bold tracking-tight" :class="isDark ? 'text-white' : 'text-slate-900'">{{
                  currentSystemData.alias || currentSystemData.name }}</h1>
                <span
                  class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-colors duration-500"
                  :class="isDark ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-slate-100 text-slate-500 border-slate-200'">
                  {{ activeSystem }}
                </span>
              </div>
              <p class="text-sm max-w-2xl" :class="isDark ? 'text-slate-400' : 'text-slate-500'">{{
                currentSystemData.description }}</p>
            </div>

            <div class="flex items-center gap-4">
              <!-- 系统级开关图标化 -->
              <button @click="$emit('toggleSystem', activeSystem)"
                class="flex items-center justify-center w-12 h-12 rounded-2xl border transition-all shadow-sm group"
                :class="currentSystemData.enabled ? 
                  (isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white border-emerald-100 text-emerald-600') : 
                  (isDark ? 'bg-slate-900 border-white/5 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400')">
                <Power class="w-6 h-6 transition-transform group-active:scale-90" />
              </button>
              <button @click="$emit('edit', activeSystem)"
                class="p-2.5 rounded-xl border border-var-border hover:bg-white/5 text-slate-500 transition-all shadow-sm"
                :title="$t('config.edit_system')">
                <Settings2 class="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <!-- 内容滚动区 -->
        <div class="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
          <!-- 模块列表 (Level 2) -->
          <section>
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-sm font-bold flex items-center gap-2"
                :class="isDark ? 'text-slate-300' : 'text-slate-900'">
                <LayoutGrid class="w-4 h-4 text-primary" />
                {{ $t('config.l2') }}
              </h3>
              <span class="text-[10px] font-bold text-slate-400 dark:text-slate-600">{{
                Object.keys(currentSystemData.groups || {}).length }} {{ $t('common.nodes_count') }}</span>
            </div>

            <div class="grid grid-cols-1 gap-3">
              <div v-for="(group, grpKey) in currentSystemData.groups" :key="grpKey"
                class="group border border-var-border rounded-2xl bg-var-card-bg hover:border-primary/30 transition-all overflow-hidden">
                <div class="flex items-center p-5 gap-6">
                  <!-- 状态图标 -->
                  <div class="flex-shrink-0">
                    <div
                      :class="group.enabled ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-700'"
                      class="w-12 h-12 rounded-2xl flex items-center justify-center transition-colors">
                      <Activity class="w-6 h-6" />
                    </div>
                  </div>

                  <!-- 模块信息 -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-1">
                      <h4 class="text-base font-bold truncate" :class="isDark ? 'text-slate-200' : 'text-slate-900'">{{
                        group.alias || group.name || grpKey }}</h4>
                      <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border"
                        :class="isDark ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-indigo-50 text-indigo-600 border-indigo-100'">{{
                          $t('config.l2') }}</span>
                    </div>
                    <p class="text-xs truncate" :class="isDark ? 'text-slate-500' : 'text-slate-500'">{{
                      group.description || $t('common.no_description') }}</p>
                  </div>

                  <!-- API 计数 -->
                  <div class="hidden md:flex flex-col items-center px-6 border-x border-var-border">
                    <span class="text-lg font-bold leading-none"
                      :class="isDark ? 'text-slate-300' : 'text-slate-900'">{{ Object.keys(group.apis || {}).length
                      }}</span>
                    <span
                      class="text-[9px] font-bold text-slate-400 dark:text-slate-600 uppercase mt-1">{{ $t('common.endpoints') }}</span>
                  </div>

                  <!-- 操作区 -->
                  <div class="flex items-center gap-3 pl-4 border-l border-var-border ml-2">
                    <button @click="$emit('toggle', grpKey)"
                      class="p-2.5 rounded-xl transition-all hover:bg-slate-50 dark:hover:bg-white/5"
                      :class="group.enabled ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-800'"
                      :title="group.enabled ? '禁用该模块' : '启用该模块'">
                      <Power class="w-5 h-5" />
                    </button>
                    <button @click="$emit('edit', activeSystem, grpKey)"
                      class="p-2.5 rounded-xl border border-var-border hover:border-primary/50 text-slate-500 transition-all shadow-sm">
                      <Settings2 class="w-4 h-4" />
                    </button>
                    <button @click="expandModule(grpKey)"
                      class="p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 text-slate-400 transition-all"
                      :class="expandedGroups.has(grpKey) ? 'rotate-90 text-primary' : ''">
                      <ChevronRight class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- 二级列表: API 节点 (Level 3) -->
                <transition name="slide-down">
                  <div v-if="expandedGroups.has(grpKey)" class="border-t border-var-border p-5 space-y-2"
                    :class="isDark ? 'bg-black/40' : 'bg-slate-50/50'">
                    <div
                      class="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-3 pl-4 flex items-center gap-2">
                      <Terminal class="w-3 h-3" /> {{ $t('config.l3') }}
                    </div>

                    <div v-for="(api, apiId) in group.apis" :key="apiId"
                      class="flex items-center justify-between px-5 py-3 rounded-xl border transition-all"
                      :class="isDark ? 'bg-slate-900/40 border-white/5 hover:border-white/10 shadow-lg' : 'bg-white border-slate-100 hover:shadow shadow-sm'">
                      <div class="flex items-center gap-4 min-w-0">
                        <div
                          :class="api.enabled ? (isDark ? 'bg-cyan-500' : 'bg-green-500') : (isDark ? 'bg-slate-800' : 'bg-slate-300')"
                          class="w-1.5 h-1.5 rounded-full flex-shrink-0 shadow-sm"></div>
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-bold truncate"
                              :class="isDark ? 'text-slate-300' : 'text-slate-900'">{{ api.alias || api.name }}</span>
                            <span v-if="api.alias || api.name"
                              class="text-[9px] font-mono text-slate-500 opacity-60">({{ apiId }})</span>
                            <span v-else class="text-xs font-mono font-bold"
                              :class="isDark ? 'text-slate-300' : 'text-slate-900'">{{ apiId }}</span>
                            <span class="text-[9px] font-mono text-slate-400 uppercase">{{ api.method || 'GET' }}</span>
                          </div>
                          <div class="text-[9px] font-mono text-slate-400 truncate tracking-tight">{{ api.url || apiId
                            }}</div>
                        </div>
                      </div>

                      <div class="flex items-center gap-4 ml-4">
                        <!-- 简要权限预览 -->
                        <div class="hidden sm:flex items-center gap-3 pr-4 border-r border-var-border">
                          <div v-if="api.requireLogin" class="p-1 rounded bg-amber-500/10 text-amber-500" :title="$t('common.require_login_tip')">
                            <Lock class="w-3 h-3" />
                          </div>
                          <div v-if="api.allowIps?.length"
                            class="p-1 rounded bg-primary/10 text-primary text-[9px] font-bold px-1.5">
                            IP: {{ api.allowIps.length }}
                          </div>
                          <div v-if="api.allowRoles?.length"
                            class="p-1 rounded bg-purple-500/10 text-purple-500 text-[9px] font-bold px-1.5">
                            {{ $t('common.roles') }}: {{ api.allowRoles.length }}
                          </div>
                        </div>

                        <div class="flex items-center gap-2">
                          <button @click="$emit('toggle', grpKey, apiId)"
                            :class="api.enabled ? 'text-green-500' : 'text-slate-300 dark:text-slate-800'"
                            class="p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                            <Power class="w-4 h-4" />
                          </button>
                          <button @click="$emit('edit', activeSystem, grpKey, apiId)"
                            class="p-2 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-all"
                            :title="$t('config.edit_endpoint')">
                            <Edit3 class="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div v-if="!Object.keys(group.apis || {}).length" class="py-10 text-center">
                      <div class="text-[10px] font-bold text-slate-300 dark:text-slate-800 uppercase tracking-widest">
                        该模块下暂无 API 节点</div>
                    </div>
                  </div>
                </transition>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- 未选择状态 -->
      <div v-else class="flex-1 flex items-center justify-center"
        :class="isDark ? 'bg-slate-950/30' : 'bg-slate-50/30'">
        <div class="text-center">
          <ShieldAlert class="w-16 h-16 text-slate-100 dark:text-slate-900 mx-auto mb-4" />
          <h3 class="text-lg font-bold text-slate-400 dark:text-slate-700">请从左侧选择一个安全域进行配置</h3>
          <p class="text-sm text-slate-300 dark:text-slate-800 mt-2">选择系统后可管理其下的模块及具体接口策略</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  Shield, ShieldAlert, Activity, Info, ChevronRight,
  Settings2, LayoutGrid, Terminal, Lock, Power, Edit3
} from 'lucide-vue-next'

const props = defineProps({
  configs: Object,
  isDark: Boolean
})

const emit = defineEmits(['toggle', 'edit', 'reset', 'resetAll', 'toggleSystem', 'saveNode'])

const activeSystem = ref('')
const expandedGroups = ref(new Set())

const selectSystem = (key) => {
  activeSystem.value = key
}

const expandModule = (key) => {
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key)
  } else {
    expandedGroups.value.add(key)
  }
}

const currentSystemData = computed(() => {
  if (!props.configs || !activeSystem.value) return null
  return props.configs[activeSystem.value]
})

watch(() => props.configs, (newVal) => {
  if (newVal && Object.keys(newVal).length > 0 && !activeSystem.value) {
    activeSystem.value = Object.keys(newVal)[0]
  }
}, { immediate: true })

</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  opacity: 0.2;
  border-radius: 10px;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #1e293b;
}

.bg-var-bg {
  background-color: var(--modal-bg);
}

.text-var-text {
  color: var(--text);
}

.border-var-border {
  border-color: var(--modal-border);
}

.bg-var-side-bg {
  background-color: var(--modal-bg);
}

.bg-var-main-bg {
  background-color: var(--bg);
}

.bg-var-header-bg {
  background-color: var(--modal-bg);
}

.bg-var-card-bg {
  background-color: var(--modal-bg);
}

.active-node {
  background-color: var(--primary);
  color: white;
  opacity: 0.9;
}

.dark .active-node {
  background-color: rgba(6, 182, 212, 0.2);
  color: #06b6d4;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.inactive-node {
  color: var(--text);
  opacity: 0.6;
}

.inactive-node:hover {
  background-color: rgba(0, 0, 0, 0.05);
  opacity: 1;
}

.dark .inactive-node:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.text-primary {
  color: var(--primary);
}

.bg-primary {
  background-color: var(--primary);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease-out;
  max-height: 2000px;
  opacity: 1;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}
</style>
