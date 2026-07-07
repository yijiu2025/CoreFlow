<template>
  <div class="h-screen w-screen flex flex-col md:flex-row bg-slate-100 dark:bg-slate-950 overflow-hidden text-slate-800 dark:text-slate-100">
    
    <!-- 左侧主工作区：可视底画与骨骼覆盖 (占满剩余宽屏) -->
    <div class="flex-grow h-2/3 md:h-full flex flex-col bg-slate-950 relative border-b md:border-b-0 border-slate-800 z-10 select-none">
      <!-- 顶部控制条：返回首页与标签 -->
      <div class="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-6 z-20">
        <router-link to="/" class="flex items-center text-white hover:text-primary-400 font-semibold drop-shadow-md text-sm">
          <svg class="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          返回主页
        </router-link>
        <span class="text-white/80 font-bold text-xs uppercase tracking-widest drop-shadow-md">
          {{ isTemplate ? '姿势模板预览' : '摄影作品解析' }}
        </span>
      </div>

      <!-- 核心画布工作区 -->
      <div class="flex-grow flex items-center justify-center p-8 relative overflow-hidden">
        <div class="relative shadow-2xl border border-slate-800/60 rounded-2xl overflow-hidden flex items-center justify-center select-none max-h-[80vh] max-w-[90%]" :style="containerStyle">
          <!-- 底图照片 -->
          <img 
            v-if="work?.image_url" 
            :src="work.image_url" 
            :alt="work.title" 
            class="w-full h-full object-contain pointer-events-none transition-opacity duration-300" 
            :style="{ opacity: computedPhotoOpacity }" 
          />
          <!-- 无底图占位 (针对纯骨架模板) -->
          <div v-else class="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/60">
            <span class="text-5xl mb-3">👤</span>
            <span class="text-xs font-bold uppercase tracking-widest text-slate-400">纯姿势骨骼模板</span>
          </div>

          <!-- 骨架重叠图 -->
          <img 
            v-if="showLocalTemplate && work?.thumbnail_url" 
            :src="work.thumbnail_url" 
            alt="skeleton" 
            class="absolute pointer-events-none z-10 filter drop-shadow-[0_0_12px_rgba(99,102,241,0.65)]" 
            :style="overlayStyle" 
          />
        </div>
      </div>

      <!-- 底部悬浮控制面板 -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-slate-800/80 px-6 py-4 rounded-2xl shadow-2xl z-20 w-[90%] max-w-md flex flex-col gap-3">
        <!-- 叠加 Toggle -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-extrabold text-white">✨ 叠加模板骨骼</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="showLocalTemplate" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
          </label>
        </div>

        <!-- 透明度滑杆 (只有当存在底图且开启叠加时可见) -->
        <div v-show="showLocalTemplate && work?.image_url" class="flex items-center gap-3 pt-2 border-t border-slate-800">
          <span class="text-[10px] font-bold text-slate-400 select-none shrink-0">底图不透明度</span>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            v-model.number="photoOpacity" 
            class="flex-grow accent-primary-500 bg-slate-800 h-1 rounded-lg appearance-none cursor-pointer"
          />
          <span class="text-[10px] font-bold text-slate-300 w-8 text-right">{{ Math.round(photoOpacity * 100) }}%</span>
        </div>
      </div>
    </div>

    <!-- 右侧滚动信息栏 -->
    <div class="w-full md:w-[380px] lg:w-[410px] h-1/3 md:h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-10 shrink-0">
      
      <!-- 信息展示滚动区 -->
      <div class="flex-grow overflow-y-auto p-6 space-y-6">
        
        <!-- 标题及头部标签 -->
        <div class="space-y-3" v-if="work">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wider" :class="isTemplate || isTemplateWork ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 border border-indigo-100 dark:border-indigo-900/50' : 'bg-primary-50 dark:bg-primary-950/40 text-primary-500 border border-primary-100 dark:border-primary-900/50'">
              {{ isTemplate || isTemplateWork ? '姿势模板' : '摄影作品' }}
            </span>
            <div class="flex gap-2" v-if="isOwner">
              <button @click="editWork" class="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition">编辑</button>
              <span class="text-slate-300 dark:text-slate-700">|</span>
              <button @click="deleteWork" class="text-xs font-semibold text-red-500 hover:text-red-600 transition">删除</button>
            </div>
          </div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-800 dark:text-white leading-tight">
            {{ work.title || '未命名作品' }}
          </h2>
          <p v-if="work.description" class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed whitespace-pre-line">
            {{ work.description }}
          </p>
        </div>

        <!-- 📸 辅助拍照大按钮 (仅模板/有绑定模板的作品可点击) -->
        <div v-if="work && (isTemplate || work.template_id)" class="pt-1">
          <button
            @click="handleShoot"
            class="w-full py-4 bg-gradient-to-r from-primary-500 to-indigo-600 hover:from-primary-600 hover:to-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-primary-500/20 hover:shadow-primary-600/30 transition flex items-center justify-center gap-2 select-none active:scale-[0.99]"
          >
            <span>📸</span>
            <span>{{ isTemplate || isTemplateWork ? '使用此姿势辅助拍照' : '使用同款姿势拍摄' }}</span>
          </button>
        </div>

        <!-- 作者信息卡片 -->
        <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/50 flex items-center gap-4" v-if="work">
          <div class="w-11 h-11 bg-gradient-to-tr from-primary-500 to-purple-500 text-white rounded-full flex items-center justify-center font-bold shadow">
            {{ (work.author?.username || 'U').charAt(0).toUpperCase() }}
          </div>
          <div class="flex-grow">
            <div class="font-bold text-sm text-slate-800 dark:text-white">{{ work.author?.username || '未知作者' }}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">PoseCraft 平台创作者</div>
          </div>
          <button
            v-if="!isOwner && authStore.isLoggedIn"
            @click="toggleFollow"
            class="px-4 py-1.5 rounded-full text-xs font-bold transition duration-200"
            :class="isFollowing ? 'bg-slate-250 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700' : 'bg-primary-500 text-white hover:bg-primary-600'"
          >
            {{ isFollowing ? '已关注' : '+ 关注' }}
          </button>
        </div>

        <!-- 数据及日期分析指标 -->
        <div class="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/20 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/60 text-center" v-if="work">
          <div>
            <div class="text-[10px] text-slate-400 font-semibold uppercase">❤️ 点赞</div>
            <div class="text-sm font-black text-slate-800 dark:text-white mt-1">{{ work.likes_count }}</div>
          </div>
          <div class="border-x border-slate-200 dark:border-slate-800">
            <div class="text-[10px] text-slate-400 font-semibold uppercase">👁️ 浏览</div>
            <div class="text-sm font-black text-slate-800 dark:text-white mt-1">{{ work.views_count }}</div>
          </div>
          <div>
            <div class="text-[10px] text-slate-400 font-semibold uppercase">📅 日期</div>
            <div class="text-sm font-black text-slate-800 dark:text-white mt-1">{{ new Date(work.created_at).toLocaleDateString() }}</div>
          </div>
        </div>

        <!-- AI 人体特征分析 -->
        <div v-if="work && work.analysis_data" class="space-y-3">
          <h3 class="text-xs font-extrabold text-slate-400 uppercase tracking-widest">🤖 AI 人体特征数据</h3>
          <div v-if="typeof work.analysis_data === 'object' && Object.keys(work.analysis_data).length > 0" class="grid grid-cols-2 gap-3">
            <div v-for="(val, key) in work.analysis_data" :key="key" class="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
              <div class="text-[10px] text-slate-400 uppercase font-semibold">{{ key }}</div>
              <div class="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1 truncate">
                {{ typeof val === 'object' ? JSON.stringify(val) : val }}
              </div>
            </div>
          </div>
          <pre v-else class="text-xs font-mono text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl overflow-x-auto">{{ JSON.stringify(work.analysis_data, null, 2) }}</pre>
        </div>
      </div>

      <!-- 底部操作按钮栏 -->
      <div class="p-6 border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur grid grid-cols-2 gap-3 shrink-0" v-if="work">
        <button
          @click="toggleLike"
          :class="['py-3 border.5 rounded-2xl font-bold transition flex items-center justify-center gap-2 select-none active:scale-[0.98]', isLiked ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 text-primary-500 dark:border-primary-900/50' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300']"
        >
          <span class="text-base">{{ isLiked ? '❤️' : '🤍' }}</span>
          <span class="text-sm">点赞 {{ work?.likes_count || 0 }}</span>
        </button>
        <button
          @click="toggleCollect"
          :class="['py-3 border.5 rounded-2xl font-bold transition flex items-center justify-center gap-2 select-none active:scale-[0.98]', isCollected ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-500 dark:border-yellow-900/50' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300']"
        >
          <span class="text-base">{{ isCollected ? '⭐' : '☆' }}</span>
          <span class="text-sm">收藏</span>
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useHome } from '@/composables/useHome'
import { workApi } from '@/api/work'
import { templateApi } from '@/api/template'
import { followApi } from '@/api/follow'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { showTemplate } = useHome()
const work = ref<any>(null)
const isFollowing = ref(false)
const isLiked = ref(false)
const isCollected = ref(false)

const showLocalTemplate = ref(true)
const photoOpacity = ref(0.5)

const isTemplate = computed(() => {
  return route.path.startsWith('/template') || route.name === 'template-detail'
})

const isTemplateWork = computed(() => {
  if (!work.value?.edit_data) return false
  try {
    const data = typeof work.value.edit_data === 'string' ? JSON.parse(work.value.edit_data) : work.value.edit_data
    return !!data?.is_template_work
  } catch (e) {
    return false
  }
})

const computedPhotoOpacity = computed(() => {
  return showLocalTemplate.value ? photoOpacity.value : 1.0
})

const containerStyle = computed(() => {
  if (!work.value?.edit_data) return { aspectRatio: '4/3' }
  try {
    const data = typeof work.value.edit_data === 'string' ? JSON.parse(work.value.edit_data) : work.value.edit_data
    const { vw, vh } = data
    if (vw && vh) {
      return { aspectRatio: `${vw} / ${vh}` }
    }
  } catch (e) {}
  return { aspectRatio: '4/3' }
})

const overlayStyle = computed<any>(() => {
  if (!work.value?.edit_data) {
    return {
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }
  try {
    const data = typeof work.value.edit_data === 'string' ? JSON.parse(work.value.edit_data) : work.value.edit_data
    const { scale, offsetX, offsetY, designW, designH, vw, vh } = data
    if (!vw || !vh) {
      return {
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      }
    }
    return {
      position: 'absolute',
      left: `${(offsetX / vw) * 100}%`,
      top: `${(offsetY / vh) * 100}%`,
      width: `${((designW * scale) / vw) * 100}%`,
      height: `${((designH * scale) / vh) * 100}%`
    }
  } catch (e) {
    return {
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }
})

const isOwner = computed(() => {
  return authStore.user?.id === work.value?.user_id
})

onMounted(async () => {
  showLocalTemplate.value = showTemplate.value
  const id = Number(route.params.id)
  try {
    if (isTemplate.value) {
      work.value = await templateApi.getDetail(id)
    } else {
      work.value = await workApi.getDetail(id)
    }
    
    if (authStore.isLoggedIn && work.value) {
      // 1. 记录浏览历史 (同时递增 views_count)
      await authStore.recordHistoryAction(
        isTemplate.value ? { templateId: work.value.id } : { workId: work.value.id }
      )
 
      // 2. 重新加载详情以显示最新 views_count
      if (isTemplate.value) {
        work.value = await templateApi.getDetail(id)
      } else {
        work.value = await workApi.getDetail(id)
      }
 
      // 3. 查询是否关注作者
      if (!isOwner.value && work.value.user_id) {
        const res = await followApi.checkStatus(work.value.user_id) as any
        isFollowing.value = res.isFollowing
      }
 
      // 4. 查询当前用户对该作品的点赞、收藏状态
      const { interactionApi } = await import('@/api/interaction')
      const statusRes = await interactionApi.checkStatus(
        isTemplate.value ? { templateId: work.value.id } : { workId: work.value.id }
      ) as any
      isLiked.value = statusRes.liked
      isCollected.value = statusRes.collected
    }
  } catch (err) {
    console.error('加载详情及状态失败:', err)
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

async function toggleLike() {
  if (!work.value) return
  if (!authStore.isLoggedIn) {
    router.push('/login')
    return
  }
  const nextState = !isLiked.value
  const success = await authStore.toggleLikeAction(
    isTemplate.value 
      ? { templateId: work.value.id, like: nextState }
      : { workId: work.value.id, like: nextState }
  )
  if (success) {
    isLiked.value = nextState
    if (nextState) {
      work.value.likes_count++
    } else {
      work.value.likes_count--
    }
  }
}

async function toggleCollect() {
  if (!work.value) return
  if (!authStore.isLoggedIn) {
    router.push('/login')
    return
  }
  const nextState = !isCollected.value
  const success = await authStore.toggleCollectAction(
    isTemplate.value 
      ? { templateId: work.value.id, collect: nextState }
      : { workId: work.value.id, collect: nextState }
  )
  if (success) {
    isCollected.value = nextState
  }
}

async function deleteWork() {
  if (!work.value || !confirm(isTemplate.value ? '确定删除此模板？' : '确定删除此作品？')) return
  try {
    if (isTemplate.value) {
      await templateApi.delete(work.value.id)
    } else {
      await workApi.delete(work.value.id)
    }
    router.push('/')
  } catch (err) {
    console.error('删除失败:', err)
  }
}

function editWork() {
  if (!work.value) return
  if (isTemplate.value) {
    router.push({ path: '/editor', query: { id: work.value.id } })
  } else {
    if (work.value.template_id) {
      router.push({ path: '/editor', query: { id: work.value.template_id } })
    } else {
      router.push('/editor')
    }
  }
}

function handleShoot() {
  const tplId = isTemplate.value ? work.value.id : work.value.template_id
  if (tplId) {
    router.push({ path: '/camera', query: { template: tplId } })
  }
}
</script>
