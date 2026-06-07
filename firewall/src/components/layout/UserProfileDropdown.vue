<template>
  <div class="relative">
    <!-- Avatar Button (与 Header 按钮统一: w-10 h-10 rounded-xl) -->
    <button @click="handleAvatarClick"
      class="user-avatar-btn glass w-10 h-10 rounded-xl transition-all shadow-lg flex items-center justify-center relative overflow-hidden"
      :class="isDarkMode ? 'text-cyan-400 hover:bg-white/10' : 'text-indigo-600 hover:bg-slate-100'">
      <img v-if="authStore.isLoggedIn && authStore.user?.avatar" :src="authStore.user.avatar" alt="" class="w-full h-full object-cover" />
      <div v-else-if="authStore.isLoggedIn && authStore.user?.username" class="w-full h-full flex items-center justify-center font-bold text-sm"
        :class="isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-indigo-100 text-indigo-700'">
        {{ authStore.user?.username?.[0]?.toUpperCase() }}
      </div>
      <User v-else class="w-5 h-5" />
      <!-- Online dot -->
      <div v-if="authStore.isLoggedIn" class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-emerald-400"
        :class="isDarkMode ? 'border-slate-900' : 'border-white'"></div>
    </button>

    <!-- Dropdown Card -->
    <transition name="dropdown-fade">
      <div v-if="isOpen && authStore.isLoggedIn"
        class="user-profile-dropdown absolute right-0 mt-3 w-[320px] rounded-3xl overflow-hidden shadow-2xl border transition-all z-[90] pointer-events-auto"
        :class="isDarkMode
          ? 'bg-[#1a1f2e]/95 backdrop-blur-xl border-white/[0.06] shadow-black/40'
          : 'bg-white/95 backdrop-blur-xl border-slate-200/80 shadow-slate-300/30'">

        <!-- Header Banner -->
        <div class="relative h-24 overflow-hidden"
          :class="isDarkMode
            ? 'bg-gradient-to-br from-cyan-600/30 via-blue-600/20 to-purple-600/30'
            : 'bg-gradient-to-br from-indigo-400/30 via-blue-300/20 to-cyan-300/30'">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.15),transparent)]"></div>
          <!-- Close -->
          <button @click="emit('close')"
            class="absolute top-3 right-3 p-1.5 rounded-full backdrop-blur-sm transition-all hover:scale-110"
            :class="isDarkMode ? 'bg-white/10 hover:bg-white/20 text-white/70' : 'bg-black/10 hover:bg-black/20 text-black/50'">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Avatar (overlapping header) -->
        <div class="flex flex-col items-center -mt-10 relative z-10">
          <div class="relative">
            <div class="w-[76px] h-[76px] rounded-[22px] p-[3px] shadow-lg"
              :class="isDarkMode
                ? 'bg-gradient-to-br from-cyan-400 to-blue-500 shadow-cyan-500/20'
                : 'bg-gradient-to-br from-indigo-400 to-blue-500 shadow-indigo-400/20'">
              <div class="w-full h-full rounded-[19px] overflow-hidden flex items-center justify-center"
                :class="isDarkMode ? 'bg-[#1a1f2e]' : 'bg-white'">
                <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" alt="" class="w-full h-full object-cover" />
                <span v-else class="text-2xl font-bold uppercase"
                  :class="isDarkMode ? 'text-cyan-400' : 'text-indigo-600'">
                  {{ authStore.user?.username?.[0] || 'U' }}
                </span>
              </div>
            </div>
            <!-- Camera badge -->
            <div class="absolute -bottom-1 -right-1 p-1.5 rounded-xl shadow-md cursor-pointer hover:scale-110 transition-transform"
              :class="isDarkMode ? 'bg-slate-700 text-cyan-400' : 'bg-white text-indigo-500'">
              <Camera class="w-3 h-3" />
            </div>
          </div>
        </div>

        <!-- User Info -->
        <div class="px-6 pt-3 pb-4 text-center">
          <h3 class="text-[15px] font-bold tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">
            {{ authStore.user?.username || 'User' }}
          </h3>
          <p class="text-[11px] mt-0.5" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
            {{ authStore.user?.email || 'user@sso.com' }}
          </p>
          <!-- Role Badge -->
          <div class="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
            :class="authStore.isAdmin
              ? (isDarkMode ? 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200')
              : (isDarkMode ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20' : 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200')">
            <span class="w-1.5 h-1.5 rounded-full"
              :class="authStore.isAdmin ? 'bg-rose-400' : 'bg-cyan-400'"></span>
            {{ authStore.roleName }}
          </div>
        </div>

        <!-- Divider -->
        <div class="mx-5 h-px" :class="isDarkMode ? 'bg-white/[0.06]' : 'bg-slate-100'"></div>

        <!-- Quick Actions -->
        <div class="p-4 space-y-1">
          <button @click="openSettings"
            class="menu-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
            :class="isDarkMode ? 'text-slate-300 hover:bg-white/[0.05] hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center"
              :class="isDarkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-indigo-50 text-indigo-500'">
              <Settings class="w-4 h-4" />
            </div>
            <span class="flex-1 text-left">安全设置</span>
            <ChevronRight class="w-3.5 h-3.5 opacity-30" />
          </button>

          <button @click="openSecurityConsole"
            class="menu-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
            :class="isDarkMode ? 'text-slate-300 hover:bg-white/[0.05] hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center"
              :class="isDarkMode ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-50 text-violet-500'">
              <ShieldCheck class="w-4 h-4" />
            </div>
            <span class="flex-1 text-left">安全策略控制台</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-md font-bold"
              :class="isDarkMode ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-50 text-violet-600'">PRO</span>
          </button>

          <a :href="ssoUrl + '/profile'" target="_blank"
            class="menu-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
            :class="isDarkMode ? 'text-slate-300 hover:bg-white/[0.05] hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center"
              :class="isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-500'">
              <User class="w-4 h-4" />
            </div>
            <span class="flex-1 text-left">SSO 账号管理</span>
            <ExternalLink class="w-3 h-3 opacity-30" />
          </a>
        </div>

        <!-- Divider -->
        <div class="mx-5 h-px" :class="isDarkMode ? 'bg-white/[0.06]' : 'bg-slate-100'"></div>

        <!-- Logout -->
        <div class="p-4">
          <button @click="handleLogout"
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
            :class="isDarkMode
              ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 ring-1 ring-rose-500/10'
              : 'bg-rose-50 text-rose-600 hover:bg-rose-100 ring-1 ring-rose-200'">
            <LogOut class="w-3.5 h-3.5" />
            退出登录
          </button>
        </div>

        <!-- Footer -->
        <div class="pb-4 text-center">
          <p class="text-[9px] tracking-wider" :class="isDarkMode ? 'text-slate-600' : 'text-slate-300'">
            Antigravity SSO 2.1
          </p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
/**
 * 用户头像 + Google 风格下拉菜单（美化版）
 */
import { useAuthStore } from '@/stores/auth'
import { useDefenseStore } from '@/stores/defense'
import { SSO_URL } from '@/config/services'
import {
  User, X, Camera, LogOut, ShieldCheck, Settings, ChevronRight, ExternalLink
} from 'lucide-vue-next'

defineProps<{
  isDarkMode: boolean
  isOpen: boolean
}>()

const emit = defineEmits(['toggle', 'close', 'login', 'add-account', 'open-settings', 'open-console'])

const authStore = useAuthStore()
const defenseStore = useDefenseStore()
const ssoUrl = SSO_URL

function handleAvatarClick() {
  if (authStore.isLoggedIn) {
    emit('toggle')
  } else {
    emit('login')
  }
}

function handleLogout() {
  authStore.logout()
  emit('close')
}

function openSettings() {
  defenseStore.isSettingsModalOpen = true
  emit('close')
}

function openSecurityConsole() {
  defenseStore.isConfigModalOpen = true
  emit('close')
}
</script>

<style scoped>
.dropdown-fade-enter-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.dropdown-fade-leave-active { transition: all 0.2s ease-in; }
.dropdown-fade-enter-from { opacity: 0; transform: translateY(-8px) scale(0.96); }
.dropdown-fade-leave-to { opacity: 0; transform: translateY(-4px) scale(0.98); }

.menu-item:active { transform: scale(0.98); }
</style>
