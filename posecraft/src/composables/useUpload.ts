/**
 * 文件上传组合式函数
 *
 * 提供文件上传、Base64 上传、Canvas 截图上传、文件验证、图片压缩等功能
 *
 * @author Claude
 * @since 2026-07-13
 */
import { ref } from 'vue';
import { uploadFile as apiUploadFile, uploadBase64 as apiUploadBase64 } from '@/api/upload';

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
}

/**
 * 文件上传组合式函数
 * 管理上传状态（进度、错误）并提供多种上传方式
 * @returns 上传相关状态和方法
 */
export function useUpload() {
  const uploading = ref(false);
  const progress = ref(0);
  const error = ref<string | null>(null);

  /**
   * 上传文件
   * @param file - 要上传的文件
   * @param path - 存储路径（默认 posecraft）
   * @returns 上传结果（url/filename/size）或失败时返回 null
   */
  async function uploadFile(file: File, path = 'posecraft'): Promise<UploadResult | null> {
    uploading.value = true;
    progress.value = 0;
    error.value = null;

    try {
      const response = await apiUploadFile(file, path, percent => {
        progress.value = percent;
      });

      if (response.data.code === 200) {
        return response.data.data;
      } else {
        error.value = response.data.message || '上传失败';
        return null;
      }
    } catch (err: any) {
      error.value = err.message || '上传失败';
      return null;
    } finally {
      uploading.value = false;
    }
  }

  /**
   * 上传 Base64 图片
   * @param base64 - Base64 编码的图片数据
   * @param filename - 文件名
   * @returns 上传结果或失败时返回 null
   */
  async function uploadBase64(base64: string, filename: string): Promise<UploadResult | null> {
    uploading.value = true;
    progress.value = 0;
    error.value = null;

    try {
      const response = await apiUploadBase64(base64, filename, 'posecraft', percent => {
        progress.value = percent;
      });

      if (response.data.code === 200) {
        return response.data.data;
      } else {
        error.value = response.data.message || '上传失败';
        return null;
      }
    } catch (err: any) {
      error.value = err.message || '上传失败';
      return null;
    } finally {
      uploading.value = false;
    }
  }

  /**
   * 上传 Canvas 截图
   * @param canvas - 画布元素
   * @param filename - 可选文件名（默认自动生成）
   * @returns 上传结果或失败时返回 null
   */
  async function uploadCanvas(canvas: HTMLCanvasElement, filename?: string): Promise<UploadResult | null> {
    const dataUrl = canvas.toDataURL('image/png');
    const name = filename || `posecraft_${Date.now()}.png`;
    return uploadBase64(dataUrl, name);
  }

  /**
   * 验证文件大小和类型
   * @param file - 要验证的文件
   * @param options - 验证选项（maxSize/allowedTypes）
   * @returns 是否通过验证
   */
  function validateFile(
    file: File,
    options?: {
      maxSize?: number;
      allowedTypes?: string[];
    }
  ): boolean {
    const maxSize = options?.maxSize || 10 * 1024 * 1024; // 10MB
    const allowedTypes = options?.allowedTypes || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (file.size > maxSize) {
      error.value = `文件大小超过限制 (${Math.round(maxSize / 1024 / 1024)}MB)`;
      return false;
    }

    if (!allowedTypes.includes(file.type)) {
      error.value = `不支持的文件类型: ${file.type}`;
      return false;
    }

    return true;
  }

  /**
   * 压缩图片（等比缩放至最大宽度）
   * @param file - 原始图片文件
   * @param maxWidth - 最大宽度（默认 1920px）
   * @param quality - 压缩质量 0-1（默认 0.8）
   * @returns 压缩后的 File 对象
   */
  function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建 Canvas'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            blob => {
              if (blob) {
                resolve(new File([blob], file.name, { type: file.type }));
              } else {
                reject(new Error('压缩失败'));
              }
            },
            file.type,
            quality
          );
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
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
  };
}
