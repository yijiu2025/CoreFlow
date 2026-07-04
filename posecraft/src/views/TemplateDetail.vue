<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div class="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
        <router-link to="/" class="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← 返回</router-link>
        <h1 class="font-bold truncate">{{ template?.title || '模板详情' }}</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8" v-if="template">
      <div class="grid md:grid-cols-2 gap-8">
        <!-- 模板图片 -->
        <div class="aspect-[3/4] bg-slate-200 dark:bg-slate-800 rounded-2xl overflow-hidden shadow">
          <img :src="template.thumbnail_url || template.image_url" :alt="template.title" class="w-full h-full object-cover" />
        </div>

        <!-- 模板信息 -->
        <div class="flex flex-col justify-between">
          <div>
            <h2 class="text-2xl font-bold mb-4">{{ template.title }}</h2>
            <p class="text-slate-600 dark:text-slate-400 mb-6">{{ template.description || '暂无描述' }}</p>

            <div class="flex gap-4 mb-6 items-center">
              <span class="px-3 py-1 bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 rounded-full text-xs font-semibold border border-primary-100 dark:border-primary-900/50">
                {{ template.category }}
              </span>
              <span class="text-slate-500 text-sm">❤️ {{ template.likes_count }}</span>
              <span class="text-slate-500 text-sm">📸 {{ template.uses_count }} 次使用</span>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex gap-4">
              <button
                @click="useTemplate"
                class="flex-1 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition shadow-sm"
              >
                使用此模板
              </button>
              <button
                @click="likeTemplate"
                class="px-6 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                ❤️
              </button>
            </div>

            <!-- 编辑模板按钮：仅对创建者及管理员可见 -->
            <div v-if="canDelete">
              <button
                @click="editTemplate"
                class="w-full py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition flex items-center justify-center gap-2 mb-3 shadow-sm"
              >
                📝 编辑此模板
              </button>
            </div>

            <!-- 删除模板按钮：仅对创建者及管理员可见 -->
            <div v-if="canDelete">
              <button
                @click="deleteTemplate"
                class="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-600 rounded-xl font-semibold border border-red-500/20 transition flex items-center justify-center gap-2"
              >
                🗑️ 删除此模板 (管理员/创建者)
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { templateApi } from '@/api/template'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const template = ref<any>(null)

// 计算是否有权删除模板（管理员或者创建者本人）
const canDelete = computed(() => {
  if (!authStore.isLoggedIn) return false
  if (authStore.isAdmin) return true // 管理员直接放行
  return template.value?.user_id === authStore.user?.id // 只有本人的作品可删
})

onMounted(async () => {
  const id = Number(route.params.id)
  try {
    template.value = await templateApi.getDetail(id)
  } catch (err) {
    console.error('加载模板失败:', err)
  }
})

function useTemplate() {
  router.push({ path: '/camera', query: { template: template.value?.id } })
}

function editTemplate() {
  router.push({ path: '/editor', query: { id: template.value?.id } })
}

async function likeTemplate() {
  // TODO: 实现点赞
}

// 删除模板逻辑
async function deleteTemplate() {
  if (!confirm('确定要删除该姿势模板吗？此操作不可逆。')) return
  try {
    await templateApi.delete(template.value.id)
    alert('删除成功！')
    router.push('/') // 返回首页
  } catch (err: any) {
    alert(err.message || '删除失败，请重试')
  }
}
</script>
