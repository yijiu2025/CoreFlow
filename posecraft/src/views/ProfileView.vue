<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <router-link to="/" class="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </router-link>
          <h1 class="text-xl font-bold">个人中心</h1>
        </div>
        <button @click="handleLogout" class="text-sm text-red-500 hover:underline">
          退出登录
        </button>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <!-- 用户信息卡片 -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 mb-8 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="w-20 h-20 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-md">
            {{ authStore.user?.username?.[0]?.toUpperCase() || '👤' }}
          </div>
          <div>
            <h2 class="text-xl font-bold">{{ authStore.user?.username || '用户' }}</h2>
            <p class="text-slate-500 dark:text-slate-400 text-sm mb-2">{{ authStore.user?.email }}</p>
            <div class="flex gap-4 mb-2 text-sm font-bold">
              <div><span class="text-primary-500">{{ followingCount }}</span> <span class="text-slate-500 font-normal dark:text-slate-400">关注</span></div>
              <div><span class="text-primary-500">{{ followersCount }}</span> <span class="text-slate-500 font-normal dark:text-slate-400">粉丝</span></div>
            </div>
            <div class="flex gap-2 mt-2">
              <span
                v-for="role in authStore.roles"
                :key="role"
                class="px-2.5 py-1 bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 rounded-md text-xs font-semibold border border-primary-100 dark:border-primary-900/50"
              >
                {{ role === 'admin' ? '👑 管理员' : role }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 我的模板 -->
      <section class="mb-10 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h2 class="text-lg font-bold mb-4">🎨 我的姿势模板</h2>
        <div v-if="myTemplates.length" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div
            v-for="tpl in myTemplates"
            :key="tpl.id"
            @click="router.push(`/template/${tpl.id}`)"
            class="cursor-pointer group border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950 p-2 flex flex-col"
          >
            <div class="aspect-[3/4] bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden mb-2 relative">
              <img :src="tpl.thumbnail_url || '/placeholder.png'" class="w-full h-full object-cover" />
              <!-- 审核状态角标 -->
              <span
                class="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-bold shadow"
                :class="{
                  'bg-yellow-500 text-white': tpl.status === 2,
                  'bg-green-500 text-white': tpl.status === 1,
                  'bg-red-500 text-white': tpl.status === -2,
                  'bg-slate-500 text-white': tpl.status === 0
                }"
              >
                {{ getStatusLabel(tpl.status) }}
              </span>
            </div>
            <h3 class="font-bold text-xs truncate">{{ tpl.title }}</h3>
            <span class="text-[10px] text-slate-500 mt-1">{{ tpl.category }}</span>
          </div>
        </div>
        <div v-else class="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
          您还未创建过任何模板，快去编辑器中绘制并发布吧！
        </div>
      </section>

      <!-- 我的作品 -->
      <section class="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h2 class="text-lg font-bold mb-4">📸 我的作品</h2>
        <div v-if="works.length" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div
            v-for="work in works"
            :key="work.id"
            @click="router.push(`/work/${work.id}`)"
            class="cursor-pointer group border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950 p-2"
          >
            <div class="aspect-square bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden">
              <img
                :src="work.thumbnail_url || work.image_url"
                :alt="work.title"
                class="w-full h-full object-cover group-hover:scale-105 transition"
              />
            </div>
            <h3 class="font-bold text-xs truncate mt-2">{{ work.title || '未命名作品' }}</h3>
          </div>
        </div>
        <div v-else class="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
          暂无作品，去创建一个吧！
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { workApi } from '@/api/work'
import { templateApi } from '@/api/template'
import { followApi } from '@/api/follow'

const router = useRouter()
const authStore = useAuthStore()

const works = ref<any[]>([])
const allTemplates = ref<any[]>([])
const followingCount = ref(0)
const followersCount = ref(0)

// 过滤得到我自己的模板（自己发布的，包含任何审核状态）
const myTemplates = computed(() => {
  if (!authStore.user?.id) return []
  return allTemplates.value.filter(t => t.user_id === authStore.user?.id)
})

// 转换审核状态文字标签
function getStatusLabel(status: number) {
  if (status === 2) return '待审核'
  if (status === 1) return '已公开'
  if (status === -2) return '审核未通过'
  if (status === 0) return '私密'
  return '未知'
}

// 加载核心数据
const loadData = async () => {
  if (!authStore.isLoggedIn) {
    router.push('/login')
    return
  }

  try {
    // 1. 获取我的作品
    if (authStore.user?.id) {
      const workRes = (await workApi.getUserWorks(authStore.user.id)) as any
      works.value = workRes?.list || []
    }

    // 2. 获取模板列表（后端接口自动为已登录用户提取公开+自己上传的所有模板）
    const tplRes = await templateApi.getList({ page: 1, pageSize: 100 }) as any
    allTemplates.value = tplRes?.list || []

    // 3. 获取统计数据
    if (authStore.user?.id) {
      const stats = await followApi.getStats(authStore.user.id) as any
      followingCount.value = stats.followingCount || 0
      followersCount.value = stats.followersCount || 0
    }
  } catch (err) {
    console.error('加载中心数据失败:', err)
  }
}

onMounted(async () => {
  await loadData()
})

function handleLogout() {
  if (confirm('确定退出登录？')) {
    authStore.logout()
    router.push('/login')
  }
}
</script>
