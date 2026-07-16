<!--
 * 作品 / 模板详情页
 *
 * 沉浸式左图右社媒布局：左侧图片浏览区（底图 + 骨架叠加 + 不透明度控制），
 * 右侧社区信息流（作者卡 + 标题/描述/标签/元数据 + AI 分析 + 评论 + 互动栏）。
 * 支持作品与模板两种详情：根据路由自动判断 isTemplate，调用不同 API。
 *
 * 功能：点赞、收藏、关注、评论、删除/编辑（作者本人）、使用模板拍照、分享。
 *
 * @author Claude
 * @since 2026-07-13
 -->
<template>
  <div class="work-detail-root" :class="{ 'dark': isDark }">
    <!-- 顶部返回条 -->
    <button class="back-btn" @click="goBack" aria-label="返回">
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <!-- 主体 -->
    <main class="layout">
      <!-- 左侧：沉浸图片浏览 -->
      <section class="media-pane">
        <div class="media-canvas" :style="containerStyle">
          <!-- 底图 -->
          <img
            v-if="work?.image_url"
            :src="work.image_url"
            :alt="work.title"
            class="base-image"
            :style="{ opacity: computedPhotoOpacity }"
          />
          <!-- 无底图 -->
          <div v-else class="no-image">
            <span class="no-image-icon">👤</span>
            <span class="no-image-label">纯姿势骨骼模板</span>
          </div>
          <!-- 骨架叠加：模板详情中的 thumbnail_url（骨架 PNG），点开详情时才加载 -->
          <img
            v-if="showOverlay && templateSkeletonUrl"
            :src="templateSkeletonUrl"
            alt="skeleton"
            class="skeleton-overlay"
            :style="overlayStyle"
          />
        </div>

        <!-- 骨架叠加浮动胶囊 -->
        <div class="floating-controls" v-if="templateSkeletonUrl">
          <button
            class="ctrl-pill"
            :class="{ active: showOverlay }"
            @click="showOverlay = !showOverlay"
          >
            <span class="pill-icon">✨</span>
            <span class="pill-label">{{ showOverlay ? '隐藏骨骼' : '显示骨骼' }}</span>
          </button>
          <transition name="fade">
            <div v-if="showOverlay && work?.image_url" class="opacity-slider">
              <input
                type="range" min="0" max="1" step="0.05"
                v-model.number="photoOpacity"
              />
            </div>
          </transition>
        </div>
      </section>

      <!-- 右侧：社区信息流 -->
      <aside class="social-pane">
        <!-- 作者卡 -->
        <div class="author-card">
          <div class="author-avatar">
            {{ (authorInitial || 'U') }}
          </div>
          <div class="author-meta">
            <div class="author-name">{{ work?.author?.username || '匿名用户' }}</div>
            <div class="author-sub" v-if="authorStats">
              {{ authorStats.followers ?? '—' }} 粉丝 · {{ authorStats.works ?? '—' }} 作品
            </div>
          </div>
          <button
            v-if="!isOwner"
            class="follow-btn"
            :class="{ following: isFollowing }"
            @click="toggleFollow"
          >
            {{ isFollowing ? '已关注' : '+ 关注' }}
          </button>
          <button
            v-if="isOwner"
            class="more-btn"
            @click="menuOpen = !menuOpen"
            aria-label="更多"
          >
            ⋯
          </button>
        </div>

        <!-- 更多菜单 -->
        <transition name="fade">
          <div v-if="isOwner && menuOpen" class="more-menu" @click="menuOpen = false">
            <button @click="editWork">✏️ 编辑</button>
            <button @click="deleteWork" class="danger">🗑️ 删除</button>
          </div>
        </transition>

        <!-- 滚动内容 -->
        <div class="content-scroll" ref="scrollRef">
          <!-- 标题 -->
          <h1 class="work-title">{{ work?.title || '未命名作品' }}</h1>

          <!-- 描述 -->
          <div class="work-desc-wrapper">
            <p
              class="work-desc"
              :class="{ collapsed: descCollapsed && descOverflow }"
            >{{ work?.description || '暂无描述' }}</p>
            <button
              v-if="descOverflow"
              class="expand-btn"
              @click="descCollapsed = !descCollapsed"
            >
              {{ descCollapsed ? '展开' : '收起' }}
            </button>
          </div>

          <!-- 标签 -->
          <div class="tags-row" v-if="displayTags.length">
            <span v-for="tag in displayTags" :key="tag" class="tag-pill">#{{ tag }}</span>
          </div>

          <!-- 元数据行 -->
          <div class="meta-row">
            <span class="meta-item">👁 {{ work?.views_count ?? 0 }}</span>
            <span class="meta-dot">·</span>
            <span class="meta-item">{{ formatDate(work?.created_at) }}</span>
          </div>

          <!-- 地址信息 -->
          <div class="address-row" v-if="work?.publication_address || work?.work_address">
            <div v-if="work?.publication_address" class="address-item pub-addr">
              <span class="addr-icon">📍</span>
              <span class="addr-label">发布于</span>
              <span class="addr-text">{{ work.publication_address }}</span>
              <span class="addr-source">({{ work.publication_source === 'gps' ? 'GPS' : 'IP' }})</span>
            </div>
            <div v-if="work?.work_address" class="address-item work-addr">
              <span class="addr-icon">📷</span>
              <span class="addr-label">{{ work.work_address_source === 'exif' ? '拍摄于' : '位于' }}</span>
              <span class="addr-text">{{ work.work_address }}</span>
            </div>
          </div>

          <!-- 使用模板拍照 CTA -->
          <button
            v-if="work && (isTemplate || work.template_id)"
            class="cta-shoot"
            @click="handleShoot"
          >
            <span class="cta-icon">📸</span>
            <span>{{ isTemplate || isTemplateWork ? '使用此姿势拍照' : '使用同款姿势拍摄' }}</span>
            <svg class="cta-arrow" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>

          <!-- AI 人体特征（折叠） -->
          <details v-if="work?.analysis_data" class="analysis-block">
            <summary class="analysis-summary">
              <span>🤖 AI 人体特征数据</span>
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </summary>
            <div v-if="typeof work.analysis_data === 'object' && Object.keys(work.analysis_data).length" class="analysis-grid">
              <div v-for="(val, key) in work.analysis_data" :key="key" class="analysis-cell">
                <div class="cell-key">{{ key }}</div>
                <div class="cell-val">
                  {{ typeof val === 'object' ? JSON.stringify(val) : val }}
                </div>
              </div>
            </div>
            <pre v-else class="analysis-raw">{{ JSON.stringify(work.analysis_data, null, 2) }}</pre>
          </details>

          <!-- 评论 -->
          <section class="comments-block" ref="commentsRef">
            <h3 class="comments-title">
              评论
              <span v-if="comments.length" class="comments-count">{{ comments.length }}</span>
            </h3>
            <div class="comment-composer">
              <div class="composer-avatar">我</div>
              <input
                v-model="newComment"
                class="composer-input"
                placeholder="说点什么吧..."
                @keyup.enter="submitComment"
              />
              <button class="composer-send" :disabled="!newComment.trim()" @click="submitComment">发送</button>
            </div>
            <div class="comment-list" v-if="comments.length">
              <div v-for="comment in comments" :key="comment.id" class="comment-item">
                <div class="comment-avatar">{{ (comment.author || 'U').charAt(0).toUpperCase() }}</div>
                <div class="comment-body">
                  <div class="comment-author">{{ comment.author }}</div>
                  <p class="comment-text">{{ comment.text }}</p>
                  <div class="comment-time">{{ formatTime(comment.created_at) }}</div>
                </div>
              </div>
            </div>
            <div v-else class="comments-empty">
              💬 还没有人评论，快来抢沙发
            </div>
          </section>
        </div>

        <!-- 互动栏 (sticky bottom on mobile / desktop side) -->
        <div class="action-bar">
          <button
            class="action-btn"
            :class="{ active: isLiked, pulse: likePulse }"
            @click="toggleLike"
          >
            <span class="action-icon">{{ isLiked ? '❤️' : '🤍' }}</span>
            <span class="action-count">{{ formattedLikes }}</span>
          </button>
          <button
            class="action-btn"
            :class="{ active: isCollected }"
            @click="toggleCollect"
          >
            <span class="action-icon">{{ isCollected ? '⭐' : '☆' }}</span>
            <span class="action-count">收藏</span>
          </button>
          <button class="action-btn" @click="scrollToComments">
            <span class="action-icon">💬</span>
            <span class="action-count">{{ comments.length || '' }}</span>
          </button>
          <button class="action-btn" @click="share">
            <span class="action-icon">↗️</span>
            <span class="action-count">分享</span>
          </button>
        </div>
      </aside>
    </main>

    <!-- Toast -->
    <transition name="toast">
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { useHome } from '@/composables/useHome'
import { workApi } from '@/api/work'
import { templateApi } from '@/api/template'
import { followApi } from '@/api/follow'

const route = useRoute()
const router = useRouter()
const themeStore = useThemeStore()
const authStore = useAuthStore()
const { showTemplate } = useHome()

const work = ref<any>(null)
const isFollowing = ref(false)
const isLiked = ref(false)
const isCollected = ref(false)
const likePulse = ref(false)

const showOverlay = ref(true)
const photoOpacity = ref(0.5)
const menuOpen = ref(false)

/** 关联模板的骨架预览图 URL（点开详情时才加载，获取模板的 thumbnail_url 骨架 PNG） */
const templateSkeletonUrl = ref<string | null>(null)

// 描述折叠
const descCollapsed = ref(true)
const descOverflow = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const commentsRef = ref<HTMLElement | null>(null)

// 作者数据（按作品 author 字段）
const authorInitial = computed(() => {
  if (!work.value) return 'U'
  const name = work.value.author?.username || work.value.username
  return (name || 'U').charAt(0).toUpperCase()
})
const authorStats = computed(() => work.value?.author?.stats || null)

// 评论本地状态（后端接入前用本地）
interface LocalComment {
  id: number
  author: string
  text: string
  created_at: number
}
const comments = ref<LocalComment[]>([])
const newComment = ref('')
let commentIdSeq = 1

const isDark = computed(() => themeStore.isDark)

const isTemplate = computed(() =>
  route.path.startsWith('/template') || route.name === 'template-detail'
)

const isTemplateWork = computed(() => {
  if (!work.value?.edit_data) return false
  try {
    const data = typeof work.value.edit_data === 'string' ? JSON.parse(work.value.edit_data) : work.value.edit_data
    return !!data?.is_template_work
  } catch {
    return false
  }
})

const isOwner = computed(() => authStore.user?.id === work.value?.user_id)

const computedPhotoOpacity = computed(() =>
  showOverlay.value ? photoOpacity.value : 1.0
)

const containerStyle = computed(() => {
  // 有 edit_data（带设计稿比例）：按设计稿锁定容器比例
  if (work.value?.edit_data) {
    try {
      const data = typeof work.value.edit_data === 'string' ? JSON.parse(work.value.edit_data) : work.value.edit_data
      const { vw, vh } = data
      if (vw && vh) return { aspectRatio: `${vw} / ${vh}` }
    } catch {}
  }
  // 真实图片：不锁定比例，让 base-image 用 height:auto 自己撑开
  return { width: '100%' }
})

const overlayStyle = computed<any>(() => {
  if (!work.value?.edit_data) {
    return { left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' }
  }
  try {
    const data = typeof work.value.edit_data === 'string' ? JSON.parse(work.value.edit_data) : work.value.edit_data
    const { scale, offsetX, offsetY, designW, designH, vw, vh } = data
    if (!vw || !vh) {
      return { left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' }
    }
    return {
      position: 'absolute',
      left: `${(offsetX / vw) * 100}%`,
      top: `${(offsetY / vh) * 100}%`,
      width: `${((designW * scale) / vw) * 100}%`,
      height: `${((designH * scale) / vh) * 100}%`,
    }
  } catch {
    return { left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' }
  }
})

// 标签
const displayTags = computed(() => {
  const raw = work.value?.tags || work.value?.category
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return [raw]
})

const formattedLikes = computed(() => {
  const n = work.value?.likes_count ?? 0
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
})

function formatDate(d: string | number | undefined) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(ts: number | undefined) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  return formatDate(ts)
}

const toastMsg = ref('')
let toastTimer: any = null
function toast(msg: string) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2000)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function scrollToComments() {
  commentsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 描述溢出检测
watch(work, async () => {
  descCollapsed.value = true
  descOverflow.value = false
  await nextTick()
  const el = scrollRef.value?.querySelector('.work-desc')
  if (el) descOverflow.value = el.scrollHeight > 80 // ~5 lines max
}, { immediate: true })

// 提交评论（本地，后端就绪后可替换）
function submitComment() {
  const txt = newComment.value.trim()
  if (!txt) return
  if (!authStore.isLoggedIn) {
    router.push('/login')
    return
  }
  comments.value.unshift({
    id: commentIdSeq++,
    author: authStore.userProfile?.username || authStore.user?.username || '我',
    text: txt,
    created_at: Date.now()
  })
  newComment.value = ''
  toast('评论成功')
}

async function toggleFollow() {
  if (!work.value?.user_id) return
  try {
    if (isFollowing.value) {
      await followApi.unfollow(work.value.user_id)
      isFollowing.value = false
      toast('已取消关注')
    } else {
      await followApi.follow(work.value.user_id)
      isFollowing.value = true
      toast('关注成功')
    }
  } catch (err) {
    console.error('操作关注失败:', err)
    toast('操作失败，请重试')
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
    work.value.likes_count += nextState ? 1 : -1
    if (nextState) {
      likePulse.value = true
      setTimeout(() => { likePulse.value = false }, 600)
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
    toast(nextState ? '已收藏' : '已取消收藏')
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
    toast('删除失败，请重试')
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
  if (tplId) router.push({ path: '/camera', query: { template: tplId } })
}

async function share() {
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
    toast('链接已复制，快去分享吧')
  } catch {
    toast('分享链接：' + url)
  }
}

onMounted(async () => {
  showOverlay.value = showTemplate.value
  const id = Number(route.params.id)
  try {
    if (isTemplate.value) {
      work.value = await templateApi.getDetail(id)
    } else {
      work.value = await workApi.getDetail(id)
    }

    // 作品关联了模板：点开详情时才加载模板详情获取骨架图 URL（thumbnail_url = 骨架 PNG）
    if (work.value && !isTemplate.value && work.value.template_id) {
      try {
        const tplRes: any = await templateApi.getDetail(work.value.template_id)
        templateSkeletonUrl.value = tplRes?.thumbnail_url || null
      } catch (e) {
        console.warn('加载关联模板骨架图失败:', e)
      }
    }

    if (authStore.isLoggedIn && work.value) {
      await authStore.recordHistoryAction(
        isTemplate.value ? { templateId: work.value.id } : { workId: work.value.id }
      )
      if (isTemplate.value) {
        work.value = await templateApi.getDetail(id)
      } else {
        work.value = await workApi.getDetail(id)
      }
      if (!isOwner.value && work.value.user_id) {
        const res = await followApi.checkStatus(work.value.user_id) as any
        isFollowing.value = res.isFollowing
      }
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
</script>

<style scoped>
.work-detail-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  color: #1e293b;
  overflow: hidden;
  transition: background-color .3s, color .3s;
}
.work-detail-root.dark {
  background: #09090b;
  color: #f4f4f5;
}

/* 返回按钮 */
.back-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 50;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: #1e293b;
  cursor: pointer;
  transition: transform .15s ease;
}
.back-btn:hover { transform: scale(1.06); }
.dark .back-btn {
  background: rgba(39, 39, 42, 0.85);
  border-color: rgba(255, 255, 255, 0.08);
  color: #f4f4f5;
}

/* 主体布局 */
.layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
@media (min-width: 768px) {
  .layout {
    flex-direction: row;
  }
}

/* 左侧沉浸图片 */
.media-pane {
  position: relative;
  flex: 0 0 auto;
  background: #09090b;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  /* 移动端给一个合理的上限，防止长图占满整个屏幕 */
  max-height: 60vh;
}
@media (min-width: 768px) {
  .media-pane {
    flex: 1 1 60%;
    max-height: 100%;
    min-height: 0;
  }
}

.media-canvas {
  position: relative;
  width: 100%;
  /* 高度由 aspect-ratio 驱动，不再强制 max-height 截断 */
  background: #09090b;
  display: flex;
  align-items: center;
  justify-content: center;
}
@media (min-width: 768px) {
  .media-canvas { height: 100%; }
}

.base-image {
  width: 100%;
  height: auto;
  /* 高度由 aspect-ratio 驱动，max-height 兜底避免超长图溢出视口 */
  max-height: 60vh;
  object-fit: contain;
  pointer-events: none;
  transition: opacity .25s ease;
}
@media (min-width: 768px) {
  .base-image {
    max-height: 100%;
    height: 100%;
  }
}

.no-image {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: #0f172a;
  color: #94a3b8;
}
.no-image-icon { font-size: 3rem; }
.no-image-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.skeleton-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 2;
  filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.6));
  /* 叠加图跟随 media-canvas 尺寸，而不是整个 pane */
  max-width: 100%;
  max-height: 100%;
}

/* 浮动控制胶囊 */
.floating-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 5;
}
.ctrl-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(12px);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all .2s ease;
}
.ctrl-pill:hover { background: rgba(30, 41, 59, 0.85); }
.ctrl-pill.active {
  background: rgba(99, 102, 241, 0.85);
  border-color: rgba(99, 102, 241, 0.4);
}
.pill-icon { font-size: 0.9rem; }

.opacity-slider {
  width: 120px;
}
.opacity-slider input {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 9999px;
  outline: none;
}
.opacity-slider input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}

/* 右侧社区区 */
.social-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
}
.dark .social-pane { background: #18181b; }
@media (min-width: 768px) {
  .social-pane { max-width: 420px; }
}

/* 作者卡 */
.author-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 4;
}
.dark .author-card { border-color: rgba(255, 255, 255, 0.06); }

.author-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff2442, #ff8b63);
  color: #fff;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.author-meta { flex: 1; min-width: 0; }
.author-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.author-sub {
  font-size: 0.7rem;
  color: #94a3b8;
  margin-top: 2px;
}
.dark .author-sub { color: #a1a1aa; }

.follow-btn {
  padding: 6px 16px;
  border-radius: 9999px;
  font-size: 0.85rem;
  font-weight: 600;
  background: #ff2442;
  color: #fff;
  border: none;
  cursor: pointer;
  transition: all .2s ease;
  flex-shrink: 0;
}
.follow-btn:hover { background: #e61e3c; }
.follow-btn.following {
  background: rgba(0, 0, 0, 0.05);
  color: #64748b;
}
.dark .follow-btn.following {
  background: rgba(255, 255, 255, 0.08);
  color: #a1a1aa;
}

/* 滚动内容 */
.content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}
.work-title {
  font-size: 1.2rem;
  font-weight: 800;
  line-height: 1.4;
  color: inherit;
  margin-bottom: 8px;
}
.work-desc-wrapper { margin-bottom: 12px; }
.work-desc {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #475569;
  white-space: pre-line;
  margin: 0;
}
.dark .work-desc { color: #cbd5e1; }
.work-desc.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.expand-btn {
  font-size: 0.85rem;
  color: #6366f1;
  background: none;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-weight: 600;
}

/* 标签 */
.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.tag-pill {
  font-size: 0.8rem;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.08);
  padding: 4px 10px;
  border-radius: 9999px;
}
.dark .tag-pill { background: rgba(99, 102, 241, 0.15); }

/* 元数据 */
.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 16px;
}
.dark .meta-row { color: #71717a; }
.meta-item { white-space: nowrap; }

/* 地址信息 */
.address-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.dark-mode .address-row {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}
.address-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
}
.addr-icon { font-size: 14px; }
.addr-label {
  color: #94a3b8;
  font-weight: 500;
  white-space: nowrap;
}
.dark-mode .addr-label { color: #71717a; }
.addr-text {
  color: #334155;
  font-weight: 600;
}
.dark-mode .addr-text { color: #e4e4e7; }
.addr-source {
  color: #94a3b8;
  font-size: 0.65rem;
}
.dark-mode .addr-source { color: #71717a; }

/* CTA 拍照 */
.cta-shoot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, #ff2442, #e11d48);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  margin-bottom: 16px;
  transition: transform .15s ease, box-shadow .15s ease;
  box-shadow: 0 6px 16px -4px rgba(255, 36, 66, 0.35);
}
.cta-shoot:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px -4px rgba(255, 36, 66, 0.45);
}
.cta-arrow { transition: transform .2s ease; }
.cta-shoot:hover .cta-arrow { transform: translateX(3px); }

/* AI 分析 */
.analysis-block {
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 12px;
}
.dark .analysis-block { border-color: rgba(255, 255, 255, 0.06); }
.analysis-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  color: #64748b;
}
.dark .analysis-summary { color: #a1a1aa; }
.analysis-summary::-webkit-details-marker { display: none; }
.analysis-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.analysis-cell {
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  padding: 8px;
}
.dark .analysis-cell { background: rgba(255, 255, 255, 0.04); }
.cell-key {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: #94a3b8;
  font-weight: 600;
}
.cell-val {
  font-size: 0.8rem;
  font-weight: 700;
  color: inherit;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.analysis-raw {
  margin-top: 12px;
  font-size: 0.75rem;
  color: #94a3b8;
  background: rgba(0, 0, 0, 0.03);
  padding: 8px;
  border-radius: 8px;
  overflow-x: auto;
}

/* 评论 */
.comments-block {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding-top: 16px;
}
.dark .comments-block { border-color: rgba(255, 255, 255, 0.06); }
.comments-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 12px;
}
.comments-count {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
}
.comment-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.composer-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.composer-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
  font-size: 0.85rem;
  outline: none;
  color: inherit;
}
.dark .composer-input {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}
.composer-input:focus { border-color: #6366f1; }
.composer-send {
  padding: 8px 14px;
  border-radius: 9999px;
  background: #6366f1;
  color: #fff;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.composer-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.comment-item {
  display: flex;
  gap: 8px;
}
.comment-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.15);
  color: #6366f1;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.comment-body { flex: 1; min-width: 0; }
.comment-author {
  font-size: 0.85rem;
  font-weight: 600;
  color: inherit;
}
.comment-text {
  font-size: 0.85rem;
  color: #475569;
  line-height: 1.5;
  margin: 2px 0;
}
.dark .comment-text { color: #cbd5e1; }
.comment-time {
  font-size: 0.7rem;
  color: #94a3b8;
}
.comments-empty {
  text-align: center;
  color: #94a3b8;
  font-size: 0.85rem;
  padding: 32px 0;
  border: 1px dashed rgba(0, 0, 0, 0.1);
  border-radius: 12px;
}
.dark .comments-empty { border-color: rgba(255, 255, 255, 0.1); }

/* 互动栏 */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 8px 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: #fff;
  position: sticky;
  bottom: 0;
  z-index: 4;
}
.dark .action-bar {
  background: #18181b;
  border-color: rgba(255, 255, 255, 0.06);
}
.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 9999px;
  background: transparent;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all .2s ease;
}
.action-btn:hover { background: rgba(0, 0, 0, 0.04); }
.dark .action-btn:hover { background: rgba(255, 255, 255, 0.04); }
.action-btn.active { color: #ff2442; }
.action-btn.pulse { animation: likePulse .6s ease; }
.action-icon { font-size: 1.2rem; line-height: 1; }
.action-count { font-size: 0.8rem; min-width: 18px; text-align: left; }

@keyframes likePulse {
  0% { transform: scale(1); }
  25% { transform: scale(1.25); }
  50% { transform: scale(0.95); }
  100% { transform: scale(1); }
}

/* 点赞飞心 */
.fly-heart {
  position: absolute;
  font-size: 1.5rem;
  pointer-events: none;
  animation: flyUp .8s ease forwards;
}
@keyframes flyUp {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-80px) scale(1.4); }
}

/* Toast */
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 10px 20px;
  border-radius: 9999px;
  font-size: 0.85rem;
  font-weight: 600;
  z-index: 100;
  backdrop-filter: blur(8px);
}
.toast-enter-active, .toast-leave-active { transition: opacity .25s ease, transform .25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* 过渡 */
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 更多菜单 */
.more-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 1rem;
  line-height: 1;
}
.dark .more-btn { border-color: rgba(255, 255, 255, 0.08); color: #a1a1aa; }
.more-btn:hover { background: rgba(0, 0, 0, 0.04); }
.more-menu {
  position: absolute;
  top: 70px;
  right: 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 6;
  min-width: 140px;
  overflow: hidden;
}
.dark .more-menu {
  background: #27272a;
  border-color: rgba(255, 255, 255, 0.06);
}
.more-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 0.9rem;
  color: inherit;
  cursor: pointer;
  transition: background .15s ease;
}
.more-menu button:hover { background: rgba(0, 0, 0, 0.04); }
.dark .more-menu button:hover { background: rgba(255, 255, 255, 0.04); }
.more-menu button.danger { color: #ef4444; }

/* 滚动条 */
.content-scroll::-webkit-scrollbar { width: 4px; }
.content-scroll::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); border-radius: 9999px; }
.dark .content-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); }

/* line-clamp 兜底 */
.work-desc.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>