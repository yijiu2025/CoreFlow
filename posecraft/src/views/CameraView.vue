<template>
  <div class="h-screen w-screen flex flex-col bg-black relative overflow-hidden">
    <!-- 顶部导航栏 -->
    <header class="absolute top-0 left-0 right-0 h-14 flex items-center px-4 z-50 bg-gradient-to-b from-black/60 to-transparent">
      <router-link to="/" class="text-white text-lg font-medium drop-shadow-md flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </router-link>
      <div class="flex-1"></div>
      <button @click="camera.switchCamera()" class="text-white drop-shadow-md bg-black/40 p-2 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </header>

    <!-- 相机画面与模板覆盖层 -->
    <div class="flex-1 relative w-full h-full">
      <video ref="camera.videoRef" autoplay playsinline class="absolute inset-0 w-full h-full object-cover"></video>
      
      <!-- 绝对居中的画布容器，完全覆盖并和视频一样大 -->
      <div class="absolute inset-0 w-full h-full pointer-events-none z-10 flex items-center justify-center overflow-hidden">
        <canvas ref="templateCanvasRef"></canvas>
      </div>

      <!-- 拍照闪光效果 -->
      <div v-if="isFlashing" class="absolute inset-0 bg-white z-20 animate-pulse"></div>

      <!-- 加载提示 -->
      <div v-if="uploading" class="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
        <div class="bg-black/70 text-white px-6 py-4 rounded-xl flex flex-col items-center">
          <svg class="animate-spin h-8 w-8 text-white mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-sm">照片处理中...</span>
        </div>
      </div>
    </div>

    <!-- 底部控制栏：只保留拍照按钮 -->
    <div class="absolute bottom-0 left-0 right-0 h-32 flex items-center justify-center bg-gradient-to-t from-black/80 to-transparent z-50 pb-6">
      <button
        @click="handleCapture"
        :disabled="uploading"
        class="w-20 h-20 bg-transparent rounded-full border-[6px] border-white/80 active:border-white transition-all duration-200 flex items-center justify-center"
      >
        <div class="w-[60px] h-[60px] bg-white rounded-full active:scale-95 transition-transform duration-200 shadow-inner"></div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { fabric } from 'fabric'
import { useAuthStore } from '@/stores/auth'
import { useCamera } from '@/composables/useCamera'
import { useUpload } from '@/composables/useUpload'
import { workApi } from '@/api/work'
import { templateApi } from '@/api/template'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const camera = useCamera()
const { uploading, uploadBase64 } = useUpload()

const templateCanvasRef = ref<HTMLCanvasElement | null>(null)
let fCanvas: fabric.Canvas | null = null

const isFlashing = ref(false)
const templateTransform = ref<any>(null)

onMounted(async () => {
  if (!authStore.isLoggedIn) {
    router.push('/login')
    return
  }

  // 1. 启动相机
  await camera.start()

  // 使用屏幕的物理尺寸初始化画布
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (templateCanvasRef.value) {
    templateCanvasRef.value.width = vw
    templateCanvasRef.value.height = vh

    fCanvas = new fabric.Canvas(templateCanvasRef.value, {
      width: vw,
      height: vh,
      selection: false
    })

  }

  // 2. 加载模板信息并渲染
  const templateId = Number(route.query.template)
  if (templateId && fCanvas) {
    try {
      const template = await templateApi.getDetail(templateId, { camera: true }) as any
      let poseData = template?.pose_data
      if (typeof poseData === 'string') {
        try { poseData = JSON.parse(poseData) } catch (e) {}
      }

      if (!poseData) {
        const errText = new fabric.Text('Error: No pose_data found (Auth/Detail)', {
          left: 20,
          top: 110,
          fontSize: 16,
          fill: '#ff0000',
          backgroundColor: 'black',
          selectable: false,
          evented: false
        })
        fCanvas.add(errText)
        fCanvas.renderAll()
        alert('加载模板失败：无权获取机密骨架数据，请确认是否已登录并具备权限。')
        return
      }

      if (!poseData.fabricData) {
        const errText = new fabric.Text('Error: No fabricData inside pose_data', {
          left: 20,
          top: 110,
          fontSize: 16,
          fill: '#ff0000',
          backgroundColor: 'black',
          selectable: false,
          evented: false
        })
        fCanvas.add(errText)
        fCanvas.renderAll()
        alert('该模板不包含骨架数据。')
        return
      }

      if (poseData.fabricData) {
        
        // 深度克隆并清洗数据，绝不加载任何原图
        const safeFabricData = typeof poseData.fabricData === 'string' 
          ? JSON.parse(poseData.fabricData) 
          : JSON.parse(JSON.stringify(poseData.fabricData))
        
        delete safeFabricData.backgroundImage;
        if (safeFabricData.objects) {
          safeFabricData.objects = safeFabricData.objects.filter((obj: any) => obj.type !== 'image')
        }
        
        // 直接从 safeFabricData.objects 中重建图形，不用 loadFromJSON 从而避免任何可能发生的异步清理和副作用！
        const designW = safeFabricData.width || 800
        const designH = safeFabricData.height || 600
        
        // 💡 核心适配算法：
        // 1. 计算宽和高的缩放比例，选择较小的一个进行等比缩放，确保整个骨架能够完全装进屏幕
        const scaleX = vw / designW
        const scaleY = vh / designH
        const scale = Math.min(scaleX, scaleY)
        
        // 2. 计算居中偏移量，把骨架平移到画布的正中央
        const offsetX = (vw - designW * scale) / 2
        const offsetY = (vh - designH * scale) / 2

        templateTransform.value = {
          scale,
          offsetX,
          offsetY,
          designW,
          designH,
          vw,
          vh
        }

        const rawObjects = safeFabricData.objects || []
        
        rawObjects.forEach((obj: any) => {
          if (obj.type === 'line') {
            const line = new fabric.Line([obj.x1, obj.y1, obj.x2, obj.y2], {
              left: obj.left,
              top: obj.top,
              stroke: obj.stroke || '#6366f1',
              strokeWidth: obj.strokeWidth || 3,
              opacity: obj.opacity || 0.8,
              selectable: false,
              evented: false
            })
            fCanvas?.add(line)
          } else if (obj.type === 'circle') {
            const circle = new fabric.Circle({
              left: obj.left,
              top: obj.top,
              radius: obj.radius || 8,
              fill: obj.fill || '#ffffff',
              stroke: obj.stroke || '#6366f1',
              strokeWidth: obj.strokeWidth || 3,
              originX: obj.originX || 'center',
              originY: obj.originY || 'center',
              selectable: false,
              evented: false
            })
            fCanvas?.add(circle)
          }
        })
        
        // 3. 应用视口缩放与平移变换
        fCanvas.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY])
        fCanvas.calcOffset()
        fCanvas.renderAll()
      }
    } catch (err) {
      console.error('加载参考模板失败:', err)
    }
  }
})

onUnmounted(() => {
  if (fCanvas) {
    fCanvas.dispose()
  }
  camera.stop()
})

const handleCapture = async () => {
  if (uploading.value) return
  
  // 闪光灯特效
  isFlashing.value = true
  setTimeout(() => { isFlashing.value = false }, 150)

  try {
    // 拍照获取 Base64
    const base64 = camera.capture()
    if (!base64) {
      alert('拍照失败，请重试')
      return
    }

    // 直接上传
    const uploadResult = await uploadBase64(base64, `posecraft_${Date.now()}.png`)
    if (!uploadResult) return

    // 保存作品记录
    const res = await workApi.create({
      title: '随手拍作品',
      template_id: route.query.template ? Number(route.query.template) : undefined,
      image_url: uploadResult.url,
      edit_data: templateTransform.value
    }) as any

    // 拍照成功，跳转到作品详情或者返回首页
    if (res && res.id) {
      router.push(`/work/${res.id}`)
    } else {
      router.push('/mine')
    }
  } catch (err: any) {
    alert('保存失败: ' + err.message)
  }
}
</script>
