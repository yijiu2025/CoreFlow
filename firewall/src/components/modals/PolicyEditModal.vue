<template>
  <transition enter-active-class="transition duration-300 ease-out" enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0" leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-4">
    <div v-if="isOpen" class="fixed inset-0 flex items-center justify-center p-6 z-[4000]">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md" @click="$emit('close')"></div>

      <!-- Modal Window -->
      <div
        class="w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col relative overflow-hidden transition-colors duration-500"
        :class="isDarkMode ? 'bg-slate-900 border border-white/10' : 'bg-white border border-slate-200'">
        
        <!-- Header -->
        <div class="p-8 border-b flex items-start justify-between transition-colors duration-500"
          :class="isDarkMode ? 'border-white/5 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'">
          <div class="flex items-center gap-5">
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
              :class="isDarkMode ? 'bg-cyan-500 shadow-cyan-500/20' : 'bg-indigo-600 shadow-indigo-500/20'">
              <ShieldCheck class="w-7 h-7 text-white" />
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border"
                  :class="isDarkMode ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-indigo-50 text-indigo-600 border-indigo-100'">{{
                    $t('config.override') }}</span>
                <span class="text-[10px] font-mono" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
                  {{ editingSystem }}
                  <span v-if="editingGroup"> / {{ editingGroup }}</span>
                  <span v-if="editingApi"> / {{ editingApi }}</span>
                </span>
              </div>
              <h2 class="text-2xl font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ editingApi ||
                editingGroup || editingSystem }}</h2>
            </div>
          </div>
          <button @click="$emit('close')"
            class="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 transition-all">
            <X class="w-6 h-6" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
          <!-- Node Info -->
          <div class="p-5 rounded-2xl border transition-colors duration-500"
            :class="isDarkMode ? 'bg-cyan-500/5 border-cyan-500/10' : 'bg-indigo-50/50 border-indigo-100/50'">
            <h3 class="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-2"
              :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-400'">
              <Info class="w-3 h-3" /> {{ $t('config.node_desc') }}
            </h3>
            <p class="text-sm leading-relaxed italic" :class="isDarkMode ? 'text-slate-400' : 'text-slate-600'">"{{
              form.description || $t('config.desc_empty') }}"</p>
          </div>

          <!-- Configuration Grid -->
          <div class="space-y-6">
            <!-- IP Whitelist -->
            <div class="space-y-3">
              <label class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
                <Monitor class="w-3 h-3 text-indigo-500" /> {{ $t('config.ip_white') }}
              </label>
              <textarea v-model="form.ips" :placeholder="$t('config.ip_placeholder')" rows="3"
                class="w-full rounded-2xl p-5 text-sm font-mono transition-all outline-none border"
                :class="isDarkMode ? 'bg-slate-950/50 border-white/5 text-cyan-100 focus:border-cyan-500/30' : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-indigo-500/30 focus:bg-white'"></textarea>
              <p class="text-[10px]" :class="isDarkMode ? 'text-slate-600' : 'text-slate-400'">{{ $t('config.ip_help')
                }}</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Roles -->
              <div class="space-y-3">
                <label class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
                  <Users class="w-3 h-3 text-purple-500" /> {{ $t('config.roles_req') }}
                </label>
                <input v-model="form.roles" placeholder="admin, editor..."
                  class="w-full rounded-xl px-5 py-3.5 text-sm font-mono transition-all outline-none border"
                  :class="isDarkMode ? 'bg-slate-950/50 border-white/5 text-purple-100 focus:border-purple-500/30' : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-indigo-500/30 focus:bg-white'" />
              </div>

              <!-- Auth Toggle -->
              <div class="space-y-3">
                <label class="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                  :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
                  <Lock class="w-3 h-3 text-amber-500" /> {{ $t('config.auth_req') }}
                </label>
                <div @click="form.requireLogin = !form.requireLogin" :class="[
                  form.requireLogin ? (isDarkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200') : (isDarkMode ? 'bg-slate-950/50 border-white/5' : 'bg-slate-50 border-slate-200'),
                  'flex items-center justify-between px-5 py-3.5 rounded-xl border cursor-pointer hover:shadow-sm transition-all'
                ]">
                  <span class="text-xs font-bold"
                    :class="form.requireLogin ? 'text-amber-500' : 'text-slate-500'">{{ $t('config.require_login')
                    }}</span>
                  <div class="w-10 h-5 rounded-full relative transition-all"
                    :class="form.requireLogin ? 'bg-amber-500' : (isDarkMode ? 'bg-slate-800' : 'bg-slate-300')">
                    <div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all"
                      :class="form.requireLogin ? 'translate-x-5' : ''"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-8 border-t flex items-center justify-between transition-colors duration-500"
          :class="isDarkMode ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'">
          <div class="text-[10px] font-bold flex items-center gap-2"
            :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
            <RotateCcw class="w-3 h-3" /> {{ $t('common.last_update') }}: {{ form.updatedAt ? new
              Date(form.updatedAt).toLocaleString()
              : $t('common.never') }}
          </div>
          <div class="flex items-center gap-3">
            <button @click="$emit('close')"
              class="px-6 py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">{{
                $t('common.cancel') }}</button>
            <button @click="$emit('save')"
              class="px-8 py-3 rounded-xl text-white text-xs font-bold shadow-lg transition-all active:scale-95"
              :class="isDarkMode ? 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'">
              {{ $t('common.apply') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ShieldCheck, X, Info, Monitor, Users, Lock, RotateCcw } from 'lucide-vue-next'

defineProps({
  isOpen: Boolean,
  isDarkMode: Boolean,
  form: Object,
  editingSystem: String,
  editingGroup: String,
  editingApi: String
})

defineEmits(['close', 'save'])
</script>
