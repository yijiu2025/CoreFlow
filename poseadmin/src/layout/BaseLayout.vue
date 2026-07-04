<script setup lang="ts">
import { useRoute } from 'vue-router'
import { ref } from 'vue'

const route = useRoute()
const isCollapse = ref(false)
</script>

<template>
  <el-container class="layout-container h-screen bg-gray-50">
    <el-aside :width="isCollapse ? '64px' : '220px'" class="transition-all duration-300 bg-white border-r shadow-sm flex flex-col">
      <div class="h-16 flex items-center justify-center border-b font-bold text-xl text-red-500 overflow-hidden shrink-0">
        {{ isCollapse ? 'PC' : 'PoseCraft Admin' }}
      </div>
      
      <el-menu
        :default-active="route.path"
        class="border-r-0 flex-1 overflow-y-auto"
        :collapse="isCollapse"
        router
      >
        <el-menu-item index="/works">
          <el-icon><Picture /></el-icon>
          <template #title>作品审核</template>
        </el-menu-item>
        <el-menu-item index="/templates">
          <el-icon><Document /></el-icon>
          <template #title>模板审核</template>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container class="flex flex-col overflow-hidden">
      <el-header class="h-16 bg-white border-b flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div class="flex items-center gap-4">
          <el-button link @click="isCollapse = !isCollapse">
            <el-icon class="text-xl text-gray-600"><Fold v-if="!isCollapse" /><Expand v-else /></el-icon>
          </el-button>
          <span class="font-medium text-gray-700">{{ route.meta.title }}</span>
        </div>
        <div class="flex items-center gap-3">
          <el-avatar :size="32" class="bg-red-500">Admin</el-avatar>
        </div>
      </el-header>
      
      <el-main class="bg-gray-50 p-6 overflow-auto">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 min-h-full">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
