/**
 * HTTP 请求组合式函数
 * 自动导入：任何组件中直接调用 useHttp() 无需 import
 */
import { createHttp } from '@/api/firewall'

/** 获取带 token 注入的 Axios 实例 */
export function useHttp() {
  return createHttp()
}
