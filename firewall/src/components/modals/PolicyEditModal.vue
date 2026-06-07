<template>
  <BaseModal :model-value="isOpen" @update:model-value="$emit('close')" :is-dark="isDarkMode"
    size="md" :show-dots="false" transition="slide" backdrop-class="bg-black/30 backdrop-blur-md" :z-index="zIndex">

    <template #header>
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
    </template>

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
        <FormField v-model="form.ips" type="textarea" :label="$t('config.ip_white')" :is-dark="isDarkMode"
          variant="mono" :placeholder="$t('config.ip_placeholder')" :rows="3" :hint="$t('config.ip_help')">
          <template #label-icon>
            <Monitor class="w-3 h-3 text-indigo-500" />
          </template>
        </FormField>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Roles -->
          <FormField v-model="form.roles" :label="$t('config.roles_req')" :is-dark="isDarkMode"
            variant="mono" placeholder="admin, editor...">
            <template #label-icon>
              <Users class="w-3 h-3 text-purple-500" />
            </template>
          </FormField>

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
              <ToggleSwitch v-model="form.requireLogin" color="amber" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
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
        <PrimaryButton @click="$emit('save')" variant="cyan">
          {{ $t('common.apply') }}
        </PrimaryButton>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { ShieldCheck, Info, Monitor, Users, Lock, RotateCcw } from 'lucide-vue-next'
import BaseModal from '../ui/BaseModal.vue'
import FormField from '../ui/FormField.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import PrimaryButton from '../ui/PrimaryButton.vue'

defineProps({
  isOpen: Boolean,
  isDarkMode: Boolean,
  form: { type: Object, default: () => ({}) },
  editingSystem: String,
  editingGroup: String,
  editingApi: String,
  zIndex: { type: String, default: 'z-[5000]' }
})

defineEmits(['close', 'save'])
</script>
