<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div class="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
        <router-link to="/" class="text-slate-500 hover:text-slate-700">← 返回</router-link>
        <h1 class="font-bold truncate">{{ template?.title || '模板详情' }}</h1>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8" v-if="template">
      <div class="grid md:grid-cols-2 gap-8">
        <!-- 模板图片 -->
        <div class="aspect-[3/4] bg-slate-200 dark:bg-slate-800 rounded-2xl overflow-hidden">
          <img :src="template.image_url" :alt="template.title" class="w-full h-full object-cover" />
        </div>

        <!-- 模板信息 -->
        <div>
          <h2 class="text-2xl font-bold mb-4">{{ template.title }}</h2>
          <p class="text-slate-600 dark:text-slate-400 mb-6">{{ template.description }}</p>

          <div class="flex gap-4 mb-6">
            <span class="px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full text-sm">
              {{ template.category }}
            </span>
            <span class="text-slate-500">❤️ {{ template.likes_count }}</span>
            <span class="text-slate-500">📸 {{ template.uses_count }} 次使用</span>
          </div>

          <div class="flex gap-4">
            <button
              @click="useTemplate"
              class="flex-1 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition"
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
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { templateApi } from '@/api/template'

const route = useRoute()
const router = useRouter()
const template = ref<any>(null)

onMounted(async () => {
  const id = Number(route.params.id)
  try {
    template.value = await templateApi.getDetail(id)
  } catch (err) {
    console.error('加载模板失败:', err)
  }
})

function useTemplate() {
  router.push({ path: '/editor', query: { template: template.value?.id } })
}

async function likeTemplate() {
  // TODO: 实现点赞
}
</script>
