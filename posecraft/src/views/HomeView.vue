<template>
  <div class="min-h-screen">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-xl">
            📸
          </div>
          <h1 class="text-xl font-bold bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent">
            PoseCraft
          </h1>
        </div>

        <div class="flex items-center gap-4">
          <div class="hidden md:flex items-center bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-2 w-80">
            <span class="text-slate-400 mr-2">🔍</span>
            <input v-model="searchQuery" type="text" placeholder="搜索模板、作品..." class="bg-transparent outline-none flex-1 text-sm" />
          </div>

          <button @click="themeStore.toggleTheme()" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            {{ themeStore.isDark ? '🌙' : '☀️' }}
          </button>

          <template v-if="authStore.isLoggedIn">
            <router-link to="/editor" class="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition">
              新建模板
            </router-link>
            <router-link to="/profile" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              👤
            </router-link>
          </template>
          <router-link v-else to="/login" class="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium">
            登录
          </router-link>
        </div>
      </div>
    </header>

    <!-- 主要内容 -->
    <main class="max-w-7xl mx-auto px-4 py-8">
      <!-- 分类标签 -->
      <div class="flex gap-2 mb-8 overflow-x-auto pb-2">
        <button
          v-for="cat in categories"
          :key="cat.value"
          @click="activeCategory = cat.value"
          :class="[
            'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition',
            activeCategory === cat.value
              ? 'bg-primary-500 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          ]"
        >
          {{ cat.icon }} {{ cat.label }}
        </button>
      </div>

      <!-- 热门模板 -->
      <section class="mb-12">
        <h2 class="text-2xl font-bold mb-6">热门模板</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div
            v-for="template in templates"
            :key="template.id"
            @click="router.push(`/template/${template.id}`)"
            class="group cursor-pointer"
          >
            <div class="aspect-[3/4] bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden mb-3 relative">
              <img :src="template.thumbnail_url || '/placeholder.png'" :alt="template.title" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
              <div class="absolute bottom-2 right-2 flex gap-1">
                <span class="bg-black/50 text-white text-xs px-2 py-1 rounded-full">❤️ {{ template.likes_count }}</span>
              </div>
            </div>
            <h3 class="font-medium text-sm truncate">{{ template.title }}</h3>
            <p class="text-xs text-slate-500 mt-1">{{ template.category }}</p>
          </div>
        </div>
      </section>

      <!-- 最新作品 -->
      <section>
        <h2 class="text-2xl font-bold mb-6">最新作品</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-for="work in works"
            :key="work.id"
            @click="router.push(`/work/${work.id}`)"
            class="group cursor-pointer"
          >
            <div class="aspect-square bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden mb-3">
              <img :src="work.thumbnail_url || work.image_url" :alt="work.title" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
            </div>
            <h3 class="font-medium text-sm truncate">{{ work.title || '未命名作品' }}</h3>
            <div class="flex items-center gap-3 mt-1 text-xs text-slate-500">
              <span>❤️ {{ work.likes_count }}</span>
              <span>👁️ {{ work.views_count }}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const themeStore = useThemeStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const activeCategory = ref('all')
const templates = ref<any[]>([])
const works = ref<any[]>([])

const categories = [
  { value: 'all', label: '全部', icon: '✨' },
  { value: 'dance', label: '舞蹈', icon: '💃' },
  { value: 'yoga', label: '瑜伽', icon: '🧘' },
  { value: 'sports', label: '运动', icon: '🏃' },
  { value: 'custom', label: '自定义', icon: '🎨' }
]

onMounted(async () => {
  // TODO: 加载数据
})
</script>
