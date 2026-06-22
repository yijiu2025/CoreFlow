/**
 * 文件上传组合式函数
 */
import { ref } from 'vue'
import axios from 'axios'

export interface UploadResult {
  url: string
  filename: string
  size: number
}

export function useUpload() {
  const uploading = ref(false)
  const progress = ref(0)
  const error = ref<string | null>(null)

  /**
   * 上传文件
   */
  async function uploadFile(file: File, path = 'posecraft'): Promise<UploadResult | null> {
    uploading.value = true
    progress.value = 0
    error.value = null

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', path)

      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
        onUploadProgress: (e) => {
          if (e.total) {
            progress.value = Math.round((e.loaded / e.total) * 100)
          }
        }
      })

      if (response.data.code === 200) {
        return response.data.data
      } else {
        error.value = response.data.message || '上传失败'
        return null
      }
    } catch (err: any) {
      error.value = err.message || '上传失败'
      return null
    } finally {
      uploading.value = false
    }
  }

  /**
   * 上传 Base64 图片
   */
  async function uploadBase64(base64: string, filename: string): Promise<UploadResult | null> {
    uploading.value = true
    progress.value = 0
    error.value = null

    try {
      const response = await axios.post('/api/upload/base64', {
        data: base64,
        filename,
        path: 'posecraft'
      }, {
        withCredentials: true,
        onUploadProgress: (e) => {
          if (e.total) {
            progress.value = Math.round((e.loaded / e.total) * 100)
          }
        }
      })

      if (response.data.code === 200) {
        return response.data.data
      } else {
        error.value = response.data.message || '上传失败'
        return null
      }
    } catch (err: any) {
      error.value = err.message || '上传失败'
      return null
    } finally {
      uploading.value = false
    }
  }

  /**
   * 上传 Canvas 截图
   */
  async function uploadCanvas(canvas: HTMLCanvasElement, filename?: string): Promise<UploadResult | null> {
    const dataUrl = canvas.toDataURL('image/png')
    const name = filename || `posecraft_${Date.now()}.png`
    return uploadBase64(dataUrl, name)
  }

  /**
   * 验证文件
   */
  function validateFile(file: File, options?: {
    maxSize?: number
    allowedTypes?: string[]
  }): boolean {
    const maxSize = options?.maxSize || 10 * 1024 * 1024 // 10MB
    const allowedTypes = options?.allowedTypes || ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    if (file.size > maxSize) {
      error.value = `文件大小超过限制 (${Math.round(maxSize / 1024 / 1024)}MB)`
      return false
    }

    if (!allowedTypes.includes(file.type)) {
      error.value = `不支持的文件类型: ${file.type}`
      return false
    }

    return true
  }

  /**
   * 压缩图片
   */
  function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('无法创建 Canvas'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name, { type: file.type }))
              } else {
                reject(new Error('压缩失败'))
              }
            },
            file.type,
            quality
          )
        }
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
  }

  return {
    uploading,
    progress,
    error,
    uploadFile,
    uploadBase64,
    uploadCanvas,
    validateFile,
    compressImage
  }
}
