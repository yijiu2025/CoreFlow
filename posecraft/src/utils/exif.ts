import exifr from 'exifr'

export interface ImageExifInfo {
  make?: string
  model?: string
  exposureTime?: number
  fNumber?: number
  iso?: number
  focalLength?: number
  focalLength35mm?: number
  dateTime?: string
  latitude?: number
  longitude?: number
  // 新增尺寸、分辨率和位深
  width?: number
  height?: number
  bitDepth?: string
  resolutionLabel?: string
}

function getResolutionLabel(w: number, h: number): string {
  const max = Math.max(w, h)
  if (max >= 3840) return '4K UHD'
  if (max >= 2560) return '2K QHD'
  if (max >= 1920) return '1080P FHD'
  if (max >= 1280) return '720P HD'
  return 'SD'
}

/**
 * 提取图片的 GPS 经纬度信息以及相机拍摄的关键参数
 */
export async function parseImageExif(file: File): Promise<{
  coords: { lat: number; lng: number } | null
  exif: ImageExifInfo | null
}> {
  try {
    const allTags = await exifr.parse(file)
    console.log('图片所有 EXIF 信息:', allTags)

    if (!allTags) {
      return { coords: null, exif: null }
    }

    const width = allTags.ImageWidth || allTags.ExifImageWidth
    const height = allTags.ImageHeight || allTags.ExifImageHeight

    // 估算或读取位深 (BitsPerSample 常常是个数组如 [8, 8, 8])
    let bitDepth = '8-bit'
    if (allTags.BitsPerSample) {
      if (Array.isArray(allTags.BitsPerSample)) {
        const sum = allTags.BitsPerSample.reduce((a: number, b: number) => a + b, 0)
        bitDepth = `${sum}-bit`
      } else {
        bitDepth = `${allTags.BitsPerSample}-bit`
      }
    }

    const exif: ImageExifInfo = {
      make: allTags.Make,
      model: allTags.Model,
      exposureTime: allTags.ExposureTime,
      fNumber: allTags.FNumber,
      iso: allTags.ISO,
      focalLength: allTags.FocalLength,
      focalLength35mm: allTags.FocalLengthIn35mmFormat,
      dateTime: allTags.DateTimeOriginal || allTags.CreateDate || allTags.ModifyDate,
      width,
      height,
      bitDepth,
      resolutionLabel: width && height ? getResolutionLabel(width, height) : undefined
    }

    // 提取 GPS 信息
    const gps = await exifr.gps(file)
    let coords: { lat: number; lng: number } | null = null
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      coords = { lat: gps.latitude, lng: gps.longitude }
      exif.latitude = gps.latitude
      exif.longitude = gps.longitude
    }

    return { coords, exif }
  } catch (e) {
    console.warn('解析 EXIF 失败:', e)
    return { coords: null, exif: null }
  }
}
