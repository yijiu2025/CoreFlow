/**
 * 股票分析系统类型定义
 *
 * @author <作者>
 * @since 2026-07-20
 */

/** 股票基础信息 */
export interface Stock {
  id: number
  uid: string
  code: string
  name: string
  market: number
  industry?: string
  createdAt?: string
  updatedAt?: string
}

/** 持仓记录 */
export interface Position {
  id: number
  uid: string
  stockId: number
  userId: number
  quantity: number
  avgCost: number
  totalCost: number
  status: number
  stock?: Stock
  currentPrice?: number
  marketValue?: number
  profit?: number
  profitRate?: number
  createdAt?: string
  updatedAt?: string
}

/** 交易记录 */
export interface Trade {
  id: number
  uid: string
  stockId: number
  positionId?: number
  userId: number
  type: number
  price: number
  quantity: number
  amount: number
  fee: number
  tradeDate: string
  note?: string
  stock?: Stock
  createdAt?: string
  updatedAt?: string
}

/** AI 分析结果 */
export interface Analysis {
  id: number
  uid: string
  stockId: number
  currentPrice: number
  ma5: number
  ma10: number
  ma20: number
  macd: number
  rsi: number
  suggestion: number
  reason: string
  confidence: number
  stock?: Stock
  createdAt?: string
  updatedAt?: string
}

/** 交易日志 */
export interface Journal {
  id: number
  uid: string
  stockId?: number
  userId: number
  title: string
  content?: string
  mood: number
  lesson?: string
  stock?: Stock
  createdAt?: string
  updatedAt?: string
}

/** 仪表盘数据 */
export interface DashboardData {
  totalAsset: number
  totalCost: number
  totalProfit: number
  totalProfitRate: number
  todayProfit: number
  positionCount: number
  monthTradeCount: number
  positions: Position[]
}

/** 行情数据 */
export interface Quote {
  code: string
  name: string
  currentPrice: number
  high: number
  low: number
  open: number
  volume: number
  amount: number
  changePercent: number
}

/** 搜索结果 */
export interface SearchResult {
  code: string
  name: string
  market: number
  type: string
}

/** API 响应 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp?: number
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  code: number
  message: string
  data: T[]
  total: number
  page: number
  pageSize: number
}
