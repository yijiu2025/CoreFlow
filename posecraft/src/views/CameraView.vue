<template>
  <div class="h-screen flex flex-col bg-black">
    <!-- 顶部栏 -->
    <header class="h-14 flex items-center px-4">
      <router-link to="/" class="text-white">← 返回</router-link>
      <h1 class="flex-1 text-center text-white font-bold">{{ $t('camera.title') }}</h1>
      <button @click="camera.switchCamera()" class="text-white">🔄</button>
    </header>

    <!-- 相机预览 -->
    <div class="flex-1 relative">
      <video ref="camera.videoRef" autoplay playsinline class="w-full h-full object-cover"></video>

      <!-- AI 分析覆盖层 -->
      <canvas ref="overlayRef" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>

      <!-- AI 状态提示 -->
      <div v-if="aiLoading" class="absolute inset-0 flex items-center justify-center bg-black/30">
        <div class="bg-black/60 text-white px-6 py-3 rounded-full">
          🤖 AI 分析中...
        </div>
      </div>

      <!-- 分析结果 -->
      <div v-if="aiResult" class="absolute bottom-4 left-4 right-4">
        <div class="bg-black/60 text-white rounded-xl p-4">
          <p class="text-sm">✅ {{ aiResult.type }} 分析完成</p>
          <p class="text-xs text-slate-300">检测到 {{ aiResult.keypoints?.length || 0 }} 个关键点</p>
          <p class="text-xs text-slate-300">耗时 {{ aiResult.processingTime }}ms</p>
        </div>
      </div>
    </div>

    <!-- 底部控制栏 -->
    <div class="h-24 flex items-center justify-center gap-8">
      <!-- 拍照按钮 -->
      <button
        @click="handleCapture"
        class="w-16 h-16 bg-white rounded-full border-4 border-slate-300 hover:border-primary-500 transition flex items-center justify-center"
      >
        <span class="text-2xl">📷</span>
      </button>

      <!-- AI 分析按钮 -->
      <button
        @click="handleAnalyze"
        :disabled="aiLoading"
        class="w-16 h-16 bg-primary-500 rounded-full text-white text-2xl flex items-center justify-center disabled:opacity-50"
      >
        {{ aiLoading ? '⏳' : '🤖' }}
      </button>

      <!-- 保存按钮 -->
      <button
        @click="handleSave"
        :disabled="!capturedImage || uploading"
        class="w-16 h-16 bg-green-500 rounded-full text-white text-2xl flex items-center justify-center disabled:opacity-50"
      >
        {{ uploading ? '⏳' : '💾' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCamera } from '@/composables/useCamera'
import { useAI } from '@/composables/useAI'
import { useUpload } from '@/composables/useUpload'
import { workApi } from '@/api/work'
import { analysisApi } from '@/api/analysis'

const router = useRouter()
const authStore = useAuthStore()
const camera = useCamera()
const ai = useAI()
const { uploading, uploadBase64 } = useUpload()

const overlayRef = ref<HTMLCanvasElement | null>(null)
const capturedImage = ref<string | null>(null)
const aiLoading = ref(false)
const aiError = ref<string | null>(null)
const aiResult = ref<any>(null)

onMounted(async () => {
  if (!authStore.isLoggedIn) {
    router.push('/login')
    return
  }

  await camera.start()
})

function handleCapture() {
  capturedImage.value = camera.capture()
  if (capturedImage.value) {
    alert('拍照成功！')
  }
}

async function handleAnalyze() {
  const frame = camera.getVideoFrame()
  if (!frame) {
    aiError.value = '无法获取视频帧'
    return
  }

  aiLoading.value = true
  aiError.value = null
  aiResult.value = null

  try {
    const result = await ai.analyze(frame, 'pose')
    if (result) {
      aiResult.value = result

      // 绘制骨架到覆盖层
      if (overlayRef.value && result.keypoints) {
        const ctx = overlayRef.value.getContext('2d')
        if (ctx) {
          overlayRef.value.width = frame.width
          overlayRef.value.height = frame.height
          ctx.clearRect(0, 0, frame.width, frame.height)
          ai.drawPoseSkeleton(ctx, result.keypoints, frame.width, frame.height)
        }
      }
    }
  } catch (err: any) {
    aiError.value = err.message
  } finally {
    aiLoading.value = false
  }
}

async function handleSave() {
  if (!capturedImage.value) {
    alert('请先拍照')
    return
  }

  try {
    // 上传图片
    const uploadResult = await uploadBase64(capturedImage.value, `posecraft_${Date.now()}.png`)
    if (!uploadResult) return

    // 保存作品
    await workApi.create({
      title: '相机拍摄作品',
      image_url: uploadResult.url,
      analysis_data: aiResult.value
    })

    // 保存分析记录
    if (aiResult.value) {
      await analysisApi.save({
        image_url: uploadResult.url,
        analysis_type: aiResult.value.type,
        result_data: aiResult.value,
        processing_time: aiResult.value.processingTime
      })
    }

    alert('保存成功')
    router.push('/profile')
  } catch (err: any) {
    alert('保存失败: ' + err.message)
  }
}
</script>
