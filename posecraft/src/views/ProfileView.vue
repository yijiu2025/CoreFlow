<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <h1 class="text-xl font-bold">{{ $t('app.profile') }}</h1>
        <button @click="handleLogout" class="text-sm text-red-500 hover:underline">
          {{ $t('app.logout') }}
        </button>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8">
      <!-- 用户信息卡片 -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 mb-8 border border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-4">
          <div class="w-20 h-20 bg-gradient-to-br from-primary-500 to-purple-500 rounded-full flex items-center justify-center text-white text-3xl">
            {{ authStore.user?.username?.[0]?.toUpperCase() || '👤' }}
          </div>
          <div>
            <h2 class="text-xl font-bold">{{ authStore.user?.username || '用户' }}</h2>
            <p class="text-slate-500">{{ authStore.user?.email }}</p>
            <div class="flex gap-2 mt-2">
              <span
                v-for="role in authStore.roles"
                :key="role"
                class="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded text-xs"
              >
                {{ role }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 我的作品 -->
      <section>
        <h2 class="text-xl font-bold mb-4">我的作品</h2>
        <div v-if="works.length" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div
            v-for="work in works"
            :key="work.id"
            @click="router.push(`/work/${work.id}`)"
            class="cursor-pointer group"
          >
            <div class="aspect-square bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden">
              <img
                :src="work.thumbnail_url || work.image_url"
                :alt="work.title"
                class="w-full h-full object-cover group-hover:scale-105 transition"
              />
            </div>
          </div>
        </div>
        <div v-else class="text-center py-12 text-slate-500">
          暂无作品，去创建一个吧！
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { workApi } from '@/api/work'

const router = useRouter()
const authStore = useAuthStore()
const works = ref<any[]>([])

onMounted(async () => {
  if (!authStore.isLoggedIn) {
    router.push('/login')
    return
  }

  try {
    if (authStore.user?.id) {
      works.value = await workApi.getUserWorks(authStore.user.id) || []
    }
  } catch (err) {
    console.error('加载作品失败:', err)
  }
})

function handleLogout() {
  if (confirm('确定退出登录？')) {
    authStore.logout()
    router.push('/login')
  }
}
</script>
