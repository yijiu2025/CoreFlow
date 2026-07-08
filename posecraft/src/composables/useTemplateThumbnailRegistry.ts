/**
 * 模板骨架预览图注册表
 *
 * 目的：前端 PoseCard 骨架叠加层（skeleton-overlay）根据 work.template_id 取对应模板的
 * thumbnail_url（后端生成的透明骨架 PNG），按需懒加载。
 *
 * - 已加载的模板：由 useHome 等父级在获取模板列表时调用 register() 写入，立即可用
 * - 未加载的模板：PoseCard mounted/watch 时调用 getThumbnail(template_id)，自动触发 API 拉取并缓存
 */
import { ref } from 'vue'
import { templateApi } from '@/api/template'

// 单例：template_id → thumbnail_url(skeleton PNG)
const registry = ref<Map<number, string>>(new Map())

export function useTemplateThumbnailRegistry() {
  /** 注册已知模板的骨架预览图（父级模板列表加载后调用） */
  const register = (template: { id: number; thumbnail_url?: string | null }) => {
    if (template.thumbnail_url) {
      registry.value.set(template.id, template.thumbnail_url)
    }
  }

  /** 批量注册 */
  const registerBatch = (templates: Array<{ id: number; thumbnail_url?: string | null }>) => {
    for (const t of templates) register(t)
  }

  /**
   * 取模板骨架预览图 URL；若缓存未命中则异步拉取
   * @returns 当前缓存的 URL（可能为 undefined）；首次未命中时触发后台拉取
   */
  const getThumbnail = (templateId: number): string | undefined => {
    const cached = registry.value.get(templateId)
    if (cached) return cached
    // 缓存未命中：异步拉取并写入注册表
    templateApi.getDetail(templateId).then((res: any) => {
      const data = res?.data?.data || res?.data || {}
      if (data.thumbnail_url) {
        registry.value.set(templateId, data.thumbnail_url)
      }
    }).catch(() => {
      // 拉取失败时写入空字符串避免重复请求
      registry.value.set(templateId, '')
    })
    return undefined
  }

  return { registry, register, registerBatch, getThumbnail }
}
