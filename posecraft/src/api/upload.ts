/**
 * 文件上传 API
 * 注意：上传使用 axios 原生实例（不经过 service 拦截器），因为要支持 onUploadProgress
 */
import axios from 'axios'

/** 上传文件（支持进度回调） */
export const uploadFile = (
  file: File,
  path = 'posecraft',
  onProgress?: (percent: number) => void
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('path', path)

  return axios.post('/posecraft/v1/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    withCredentials: true,
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
  })
}

/** 上传 Base64 图片（支持进度回调） */
export const uploadBase64 = (
  base64: string,
  filename: string,
  path = 'posecraft',
  onProgress?: (percent: number) => void
) => {
  return axios.post('/posecraft/v1/upload/base64', {
    data: base64,
    filename,
    path
  }, {
    withCredentials: true,
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
  })
}
