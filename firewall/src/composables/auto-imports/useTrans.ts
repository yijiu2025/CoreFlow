/**
 * i18n 翻译组合式函数
 * 自动导入：任何组件中直接调用 useTrans() 无需 import
 *
 * 用法：
 *   const t = useTrans()
 *   t('common.save')  // 全局翻译
 */
import { useI18n } from 'vue-i18n'

export function useTrans() {
  const { t, locale } = useI18n()

  /**
   * 翻译 key
   * @param key 翻译键名
   * @returns 翻译后的文本
   */
  function translate(key: string): string {
    return t(key)
  }

  return { t: translate, locale }
}
