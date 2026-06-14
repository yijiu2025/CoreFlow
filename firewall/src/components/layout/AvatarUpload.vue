<template>
  <div>
    <!-- 触发按钮（相机图标） -->
    <button @click="openFilePicker"
      class="absolute -bottom-1 -right-1 p-1.5 rounded-xl shadow-md cursor-pointer hover:scale-110 transition-transform"
      :class="isDarkMode ? 'bg-slate-700 text-cyan-400' : 'bg-white text-indigo-500'">
      <Camera class="w-3 h-3" />
    </button>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      class="hidden"
      @change="onFileSelected"
    />

    <!-- 编辑弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showEditor" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="cancel"></div>

          <div class="relative w-[400px] rounded-3xl overflow-hidden shadow-2xl border"
            :class="isDarkMode ? 'bg-[#1a1f2e] border-white/10' : 'bg-white border-slate-200'"
            @click.stop>

            <!-- 标题 -->
            <div class="px-6 pt-5 pb-3">
              <h3 class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                {{ $t('avatar.title') || '更换头像' }}
              </h3>
              <p class="text-[10px] mt-1" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
                拖动图片调整位置，滚轮缩放大小
              </p>
            </div>

            <!-- 裁剪区域 -->
            <div class="px-6">
              <div class="relative w-full aspect-square rounded-2xl overflow-hidden border"
                :class="isDarkMode ? 'bg-slate-800 border-white/5' : 'bg-slate-100 border-slate-200'"
                ref="cropAreaRef"
                @mousedown="onDragStart"
                @touchstart.passive="onTouchStart">
                <img
                  ref="imgRef"
                  :src="imageUrl"
                  class="absolute select-none pointer-events-none"
                  :style="imgStyle"
                  @load="onImageLoad"
                  draggable="false"
                />
                <!-- 圆形遮罩 -->
                <div class="absolute inset-0 pointer-events-none">
                  <svg class="w-full h-full" viewBox="0 0 1 1">
                    <defs>
                      <mask id="circle-mask">
                        <rect width="1" height="1" fill="white" />
                        <circle cx="0.5" cy="0.5" r="0.4" fill="black" />
                      </mask>
                    </defs>
                    <rect width="1" height="1" fill="rgba(0,0,0,0.5)" mask="url(#circle-mask)" />
                    <circle cx="0.5" cy="0.5" r="0.4" fill="none" stroke="white" stroke-width="0.005" stroke-dasharray="0.02 0.01" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- 缩放滑块 -->
            <div class="px-6 pt-4 flex items-center gap-3">
              <button @click="zoomOut" class="p-1.5 rounded-lg transition-colors"
                :class="isDarkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100'">
                <Minus class="w-4 h-4" />
              </button>
              <input
                type="range"
                :min="minScale"
                max="3"
                step="0.01"
                v-model.number="scale"
                class="flex-1 h-1 rounded-full appearance-none cursor-pointer accent-cyan-500"
                :class="isDarkMode ? 'bg-slate-700' : 'bg-slate-200'"
              />
              <button @click="zoomIn" class="p-1.5 rounded-lg transition-colors"
                :class="isDarkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100'">
                <Plus class="w-4 h-4" />
              </button>
            </div>

            <!-- 文件信息 + 上传进度 -->
            <div class="px-6 pt-3 pb-2">
              <div v-if="uploading">
                <div class="h-1.5 rounded-full overflow-hidden"
                  :class="isDarkMode ? 'bg-slate-700' : 'bg-slate-100'">
                  <div class="h-full rounded-full bg-cyan-500 transition-all duration-300"
                    :style="{ width: `${uploadProgress}%` }"></div>
                </div>
                <p class="text-[10px] text-center mt-1.5"
                  :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
                  {{ uploadProgress }}%
                </p>
              </div>
              <div v-else class="flex items-center justify-between">
                <p class="text-[10px]" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">
                  {{ fileName }} · {{ fileSize }}
                </p>
                <p class="text-[10px] font-mono" :class="isDarkMode ? 'text-slate-600' : 'text-slate-300'">
                  256×256
                </p>
              </div>
              <p v-if="error" class="text-[10px] text-rose-500 text-center mt-1">{{ error }}</p>
            </div>

            <!-- 操作按钮 -->
            <div class="flex border-t" :class="isDarkMode ? 'border-white/5' : 'border-slate-100'">
              <button @click="cancel"
                class="flex-1 py-3.5 text-xs font-bold transition-colors"
                :class="isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'">
                取消
              </button>
              <div class="w-px" :class="isDarkMode ? 'bg-white/5' : 'bg-slate-100'"></div>
              <button @click="upload"
                :disabled="uploading"
                class="flex-1 py-3.5 text-xs font-bold transition-colors disabled:opacity-50"
                :class="isDarkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-indigo-600 hover:text-indigo-500'">
                {{ uploading ? '上传中...' : '确认上传' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * 头像上传组件（带裁剪/缩放编辑器）
 * 支持 JPG/PNG/WebP/GIF，Canvas 裁剪后压缩为 256x256
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { Camera, Minus, Plus } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useMessage } from '@/composables/useMessage'
import { API_BASE_URL } from '@/config/services'

defineProps<{ isDarkMode: boolean }>()

const authStore = useAuthStore()
const { error: showError } = useMessage()

const fileInput = ref<HTMLInputElement | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const cropAreaRef = ref<HTMLDivElement | null>(null)
const showEditor = ref(false)
const imageUrl = ref('')
const fileName = ref('')
const fileSize = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const error = ref('')

// 裁剪状态
const imgWidth = ref(0)
const imgHeight = ref(0)
const posX = ref(0)
const posY = ref(0)
const scale = ref(1)
const minScale = ref(0.5)
let dragging = false
let dragStartX = 0
let dragStartY = 0
let dragStartPosX = 0
let dragStartPosY = 0

const imgStyle = computed(() => ({
  width: `${imgWidth.value * scale.value}px`,
  height: `${imgHeight.value * scale.value}px`,
  left: `${posX.value}px`,
  top: `${posY.value}px`
}))

function openFilePicker() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    showError('仅支持 JPG、PNG、WebP、GIF 格式')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    showError('文件大小不能超过 5MB')
    return
  }

  fileName.value = file.name
  fileSize.value = formatSize(file.size)
  error.value = ''

  const reader = new FileReader()
  reader.onload = (ev) => {
    imageUrl.value = ev.target?.result as string
    showEditor.value = true
  }
  reader.readAsDataURL(file)
  input.value = ''
}

function onImageLoad() {
  const img = imgRef.value
  if (!img) return
  const area = cropAreaRef.value
  if (!area) return

  const areaSize = area.offsetWidth
  const imgNatW = img.naturalWidth
  const imgNatH = img.naturalHeight

  // 计算最小缩放：图片最短边 >= 裁剪区域直径
  const cropDiameter = areaSize * 0.8
  const minFit = cropDiameter / Math.min(imgNatW, imgNatH)
  minScale.value = Math.max(0.1, minFit)
  scale.value = minFit

  // 图片原始尺寸（缩放由 CSS transform 控制，保持宽高比）
  imgWidth.value = imgNatW
  imgHeight.value = imgNatH

  // 居中（transform-origin: top left，所以偏移量是缩放后的中心差）
  posX.value = (areaSize - imgNatW * scale.value) / 2
  posY.value = (areaSize - imgNatH * scale.value) / 2
}

// 拖拽时直接改 posX/posY（transform translate 生效）
function onDragStart(e: MouseEvent) {
  dragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartPosX = posX.value
  dragStartPosY = posY.value
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragging) return
  posX.value = dragStartPosX + (e.clientX - dragStartX)
  posY.value = dragStartPosY + (e.clientY - dragStartY)
}

function onDragEnd() {
  dragging = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  dragging = true
  dragStartX = touch.clientX
  dragStartY = touch.clientY
  dragStartPosX = posX.value
  dragStartPosY = posY.value
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
}

function onTouchMove(e: TouchEvent) {
  if (!dragging) return
  e.preventDefault()
  const touch = e.touches[0]
  posX.value = dragStartPosX + (touch.clientX - dragStartX)
  posY.value = dragStartPosY + (touch.clientY - dragStartY)
}

function onTouchEnd() {
  dragging = false
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
}

// 缩放
function zoomIn() {
  scale.value = Math.min(3, scale.value + 0.1)
}

function zoomOut() {
  scale.value = Math.max(minScale.value, scale.value - 0.1)
}

// Canvas 裁剪
function getCroppedBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const size = 256
    canvas.width = size
    canvas.height = size

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const area = cropAreaRef.value!
      const areaSize = area.offsetWidth
      const cropDiameter = areaSize * 0.8
      const cropRadius = cropDiameter / 2
      const centerX = areaSize / 2
      const centerY = areaSize / 2

      // 计算源图片上的裁剪区域
      const srcX = (centerX - cropRadius - posX.value) / scale.value
      const srcY = (centerY - cropRadius - posY.value) / scale.value
      const srcSize = cropDiameter / scale.value

      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()

      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size)

      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('裁剪失败'))
      }, 'image/jpeg', 0.85)
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = imageUrl.value
  })
}

async function upload() {
  if (uploading.value) return

  uploading.value = true
  uploadProgress.value = 0
  error.value = ''

  try {
    const blob = await getCroppedBlob()
    const formData = new FormData()
    formData.append('avatar', blob, 'avatar.jpg')

    const result = await new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE_URL}/user/v1/avatar`)
      xhr.withCredentials = true

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)
        }
      }

      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText)
          if (xhr.status === 200 && res.code === 200) {
            resolve(res.data)
          } else {
            reject(new Error(res.message || '上传失败'))
          }
        } catch {
          reject(new Error('响应解析失败'))
        }
      }

      xhr.onerror = () => reject(new Error('网络错误'))
      xhr.send(formData)
    })

    if (result?.avatar) {
      authStore.updateAvatar(result.avatar)
    }

    showEditor.value = false
    imageUrl.value = ''
  } catch (err: any) {
    error.value = err.message || '上传失败'
  } finally {
    uploading.value = false
  }
}

function cancel() {
  showEditor.value = false
  imageUrl.value = ''
  error.value = ''
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
})
</script>

<style scoped>
.modal-fade-enter-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.modal-fade-leave-active { transition: all 0.2s ease-in; }
.modal-fade-enter-from { opacity: 0; transform: scale(0.95); }
.modal-fade-leave-to { opacity: 0; transform: scale(0.98); }

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #06b6d4;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
</style>
