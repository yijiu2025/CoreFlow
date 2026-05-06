<script setup lang="ts">
/**
 * 安全控制台视图
 * 3 级 Guard 配置管理
 */
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useConfigsStore } from '@/stores/configs'
import { ShieldCheck } from 'lucide-vue-next'

const uiStore = useUiStore()
const configsStore = useConfigsStore()

const { isDarkMode } = storeToRefs(uiStore)
const { configs } = storeToRefs(configsStore)
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none p-4 pt-20">
    <div class="max-w-6xl mx-auto pointer-events-auto">
      <div class="glass rounded-3xl p-6 shadow-2xl"
        :class="isDarkMode ? 'bg-slate-950/80 border-white/5' : 'bg-white/90 border-slate-200'">
        <div class="flex items-center gap-3 mb-6">
          <ShieldCheck class="w-5 h-5 text-cyan-400" />
          <h2 class="text-lg font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">
            {{ $t('config.title') }}
          </h2>
        </div>

        <!-- 配置树 -->
        <div v-if="configs" class="space-y-4">
          <div v-for="(system, sysKey) in configs" :key="sysKey"
            class="rounded-2xl p-4"
            :class="isDarkMode ? 'bg-white/5' : 'bg-slate-50'">
            <!-- 系统级 L1 -->
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">L1</span>
                <span class="font-bold" :class="isDarkMode ? 'text-slate-200' : 'text-slate-800'">{{ sysKey }}</span>
              </div>
              <button @click="configsStore.toggleSystem(String(sysKey))"
                class="text-xs px-3 py-1 rounded-full transition-colors"
                :class="system.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'">
                {{ system.enabled ? $t('common.enabled') : $t('common.disabled') }}
              </button>
            </div>

            <!-- 组级 L2 -->
            <div v-if="system.groups" class="ml-4 space-y-3">
              <div v-for="(group, grpKey) in system.groups" :key="grpKey"
                class="rounded-xl p-3"
                :class="isDarkMode ? 'bg-white/5' : 'bg-white'">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">L2</span>
                    <span class="text-sm font-semibold" :class="isDarkMode ? 'text-slate-300' : 'text-slate-700'">{{ grpKey }}</span>
                  </div>
                  <div class="flex gap-2">
                    <button @click="configsStore.openEditModal(String(sysKey), String(grpKey))"
                      class="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30">
                      {{ $t('config.edit_system') }}
                    </button>
                    <button @click="configsStore.toggleGuard(String(grpKey))"
                      class="text-xs px-2 py-0.5 rounded-full transition-colors"
                      :class="group.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'">
                      {{ group.enabled ? $t('common.on') : $t('common.off') }}
                    </button>
                  </div>
                </div>

                <!-- API 级 L3 -->
                <div v-if="group.apis" class="ml-6 space-y-1">
                  <div v-for="(api, apiKey) in group.apis" :key="apiKey"
                    class="flex items-center justify-between py-1.5 px-3 rounded-lg text-sm"
                    :class="isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">L3</span>
                      <span class="font-mono" :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">{{ apiKey }}</span>
                    </div>
                    <div class="flex gap-2">
                      <button @click="configsStore.openEditModal(String(sysKey), String(grpKey), String(apiKey))"
                        class="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30">
                        {{ $t('config.edit_endpoint') }}
                      </button>
                      <button @click="configsStore.toggleGuard(String(grpKey), String(apiKey))"
                        class="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                        :class="api.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'">
                        {{ api.enabled ? $t('common.on') : $t('common.off') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
