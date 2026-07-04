<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div class="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
        <router-link to="/" class="text-slate-500 hover:text-slate-700">← 返回</router-link>
        <h1 class="font-bold truncate">{{ work?.title || '作品详情' }}</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8" v-if="work">
      <div class="grid md:grid-cols-2 gap-8">
        <!-- 作品图片 -->
        <div class="aspect-square bg-slate-200 dark:bg-slate-800 rounded-2xl overflow-hidden">
          <img :src="work.image_url" :alt="work.title" class="w-full h-full object-contain" />
        </div>

        <!-- 作品信息 -->
        <div>
          <h2 class="text-2xl font-bold mb-4">{{ work.title || '未命名作品' }}</h2>
          <p v-if="work.description" class="text-slate-600 dark:text-slate-400 mb-6">
            {{ work.description }}
          </p>

          <div class="flex gap-4 mb-6 text-slate-500">
            <span>❤️ {{ work.likes_count }}</span>
            <span>👁️ {{ work.views_count }}</span>
            <span>📅 {{ new Date(work.created_at).toLocaleDateString() }}</span>
          </div>

          <!-- 作者信息与关注 -->
          <div class="flex items-center gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
            <div class="w-10 h-10 bg-primary-500 text-white rounded-full flex items-center justify-center font-bold">
              {{ (work.author?.username || 'U').charAt(0).toUpperCase() }}
            </div>
            <div class="flex-grow">
              <div class="font-bold">{{ work.author?.username || '未知作者' }}</div>
            </div>
            <button
              v-if="!isOwner && authStore.isLoggedIn"
              @click="toggleFollow"
              class="px-4 py-1.5 rounded-full text-sm font-bold transition"
              :class="isFollowing ? 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300' : 'bg-primary-500 text-white hover:bg-primary-600'"
            >
              {{ isFollowing ? '已关注' : '+ 关注' }}
            </button>
          </div>

          <!-- AI 分析结果 -->
          <div v-if="work.analysis_data" class="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 mb-6">
            <h3 class="font-bold mb-2">🤖 AI 分析结果</h3>
            <pre class="text-sm text-slate-600 dark:text-slate-400 overflow-auto">{{ JSON.stringify(work.analysis_data, null, 2) }}</pre>
          </div>

          <div class="flex gap-4">
            <button
              @click="likeWork"
              class="px-6 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              ❤️ 点赞
            </button>
            <button
              v-if="isOwner"
              @click="editWork"
              class="px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition"
            >
              📝 编辑
            </button>
            <button
              v-if="isOwner"
              @click="deleteWork"
              class="px-6 py-3 border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition"
            >
              🗑️ 删除
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { workApi } from '@/api/work'
import { followApi } from '@/api/follow'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const work = ref<any>(null)
const isFollowing = ref(false)

const isOwner = computed(() => {
  return authStore.user?.id === work.value?.user_id
})

onMounted(async () => {
  const id = Number(route.params.id)
  try {
    work.value = await workApi.getDetail(id)
    if (authStore.isLoggedIn && !isOwner.value && work.value?.user_id) {
      const res = await followApi.checkStatus(work.value.user_id) as any
      isFollowing.value = res.isFollowing
    }
  } catch (err) {
    console.error('加载作品失败:', err)
  }
})

async function toggleFollow() {
  if (!work.value?.user_id) return
  try {
    if (isFollowing.value) {
      await followApi.unfollow(work.value.user_id)
      isFollowing.value = false
    } else {
      await followApi.follow(work.value.user_id)
      isFollowing.value = true
    }
  } catch (err) {
    console.error('操作关注失败:', err)
  }
}

async function likeWork() {
  if (!work.value) return
  try {
    await workApi.like(work.value.id)
    work.value.likes_count++
  } catch (err) {
    console.error('点赞失败:', err)
  }
}

async function deleteWork() {
  if (!work.value || !confirm('确定删除此作品？')) return
  try {
    await workApi.delete(work.value.id)
    router.push('/')
  } catch (err) {
    console.error('删除失败:', err)
  }
}

function editWork() {
  if (!work.value) return
  if (work.value.template_id) {
    router.push({ path: '/editor', query: { id: work.value.template_id } })
  } else {
    router.push('/editor')
  }
}
</script>
