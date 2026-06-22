/**
 * 相机组合式函数
 */
import { ref, onUnmounted } from 'vue'

export function useCamera() {
  const videoRef = ref<HTMLVideoElement | null>(null)
  const stream = ref<MediaStream | null>(null)
  const facingMode = ref<'user' | 'environment'>('user')
  const isReady = ref(false)
  const error = ref<string | null>(null)

  /**
   * 启动相机
   */
  async function start(videoElement?: HTMLVideoElement) {
    try {
      error.value = null

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode.value,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      }

      stream.value = await navigator.mediaDevices.getUserMedia(constraints)

      const video = videoElement || videoRef.value
      if (video) {
        video.srcObject = stream.value
        await video.play()
        isReady.value = true
      }
    } catch (err: any) {
      error.value = `相机访问失败: ${err.message}`
      isReady.value = false
    }
  }

  /**
   * 停止相机
   */
  function stop() {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    isReady.value = false
  }

  /**
   * 切换前后摄像头
   */
  async function switchCamera() {
    facingMode.value = facingMode.value === 'user' ? 'environment' : 'user'
    stop()
    await start()
  }

  /**
   * 拍照
   */
  function capture(): string | null {
    const video = videoRef.value
    if (!video) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/png')
  }

  /**
   * 拍照并返回 Blob
   */
  function captureBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = videoRef.value
      if (!video) {
        resolve(null)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }

      ctx.drawImage(video, 0, 0)
      canvas.toBlob(resolve, 'image/png')
    })
  }

  /**
   * 获取视频帧
   */
  function getVideoFrame(): HTMLCanvasElement | null {
    const video = videoRef.value
    if (!video) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)
    return canvas
  }

  onUnmounted(() => {
    stop()
  })

  return {
    videoRef,
    stream,
    facingMode,
    isReady,
    error,
    start,
    stop,
    switchCamera,
    capture,
    captureBlob,
    getVideoFrame
  }
}
