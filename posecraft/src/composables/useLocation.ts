/**
 * 定位服务 Composable
 * 提供 GPS 定位、IP 定位、逆编码等能力，供模板/作品创建和详情页复用
 *
 * @author Claude
 * @since 2026-07-16
 */
import { ref } from 'vue'

export interface LocationResult {
  address: string
  lat: number
  lng: number
  source: 'gps' | 'ip'
}

export function useLocation() {
  const loading = ref(false)
  const error = ref('')

  /**
   * GPS 定位（浏览器原生 API）
   * @returns Promise<LocationResult | null>
   */
  const getGPSPosition = (): Promise<LocationResult | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null)
        return
      }
      loading.value = true
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords
          const address = await reverseGeocode(latitude, longitude)
          loading.value = false
          resolve({ address: address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, lat: latitude, lng: longitude, source: 'gps' })
        },
        () => {
          loading.value = false
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      )
    })
  }

  /**
   * IP 定位（ipapi.co 免费接口）
   * @returns Promise<LocationResult | null>
   */
  const getIPLocation = async (): Promise<LocationResult | null> => {
    try {
      loading.value = true
      const res = await fetch('https://ipapi.co/json/')
      if (!res.ok) throw new Error('IP API failed')
      const data = await res.json()
      loading.value = false
      if (data.latitude && data.longitude) {
        const address = [data.city, data.region, data.county].filter(Boolean).join(' ') || `${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`
        return { address, lat: data.latitude, lng: data.longitude, source: 'ip' }
      }
      return null
    } catch (err) {
      loading.value = false
      console.warn('IP 定位失败:', err)
      return null
    }
  }

  /**
   * 自动定位：优先 GPS，失败则 IP 兜底
   * @returns Promise<LocationResult | null>
   */
  const autoLocate = async (): Promise<LocationResult | null> => {
    // 先尝试 GPS
    const gps = await getGPSPosition()
    if (gps) return gps
    // GPS 失败 → IP 兜底
    return await getIPLocation()
  }

  /**
   * 逆编码：经纬度 → 地址文本
   */
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      // Photon 逆编码（国内可用）
      const res = await fetch(`https://photon.komoot.io/reverse/?lat=${lat}&lon=${lng}&limit=1&lang=zh`)
      if (res.ok) {
        const data = await res.json()
        if (data.features?.length) {
          const props = data.features[0].properties
          return props.name || [props.city, props.state, props.country].filter(Boolean).join(' ')
        }
      }
    } catch (err) {
      console.warn('逆编码失败:', err)
    }
    return ''
  }

  return {
    loading,
    error,
    getGPSPosition,
    getIPLocation,
    autoLocate,
    reverseGeocode
  }
}
