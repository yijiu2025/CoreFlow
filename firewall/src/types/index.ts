/**
 * 防火墙前端共享类型定义
 */

// ==================== API 响应 ====================

export interface ApiResponse<T = any> {
  code: number
  message: string
  timestamp: number
  data: T
}

export interface ApiError extends Error {
  code?: number
}

// ==================== 服务器节点 ====================

export interface ServerNode {
  name: string
  country: string
  region: string
  city: string
  ip: string
  lat: number
  lon: number
}

// ==================== 监控数据 ====================

export interface MonitorSummary {
  totalRequests: number
  totalBlocked: number
  topRegions: RegionStat[]
  topPaths: PathStat[]
  serverNode?: ServerNode
  securitySettings?: Partial<SecuritySettings>
}

export interface RegionStat {
  region: string
  count: number
}

export interface PathStat {
  path: string
  count: number
  apiName?: string | null
}

export interface TrafficLog {
  method: string
  url: string
  ip: string
  status: number
  blocked: boolean
  region?: string
  city?: string
  apiKey?: string
  fingerprint?: string
  timestamp: number
  [key: string]: any
}

export interface WsMessage {
  type: 'INIT' | 'LOG' | 'PONG'
  data: any
}

// ==================== 安全设置 ====================

export interface SecuritySettings {
  defense: DefenseConfig
  showTrajectory?: boolean
  activeIpApi?: string
}

export interface DefenseConfig {
  enableAutoBlacklist: boolean
  maxNotFoundAttempts: number
  blacklistDuration: number
  notFoundWindow: number
  enableRateLimit: boolean
  rateLimitRequests: number
  rateLimitWindow: number
  enableBruteForce: boolean
  bruteLimit: number
  bruteWindow: number
  accountLockTime: number
  ipBlockTime: number
  bruteIpLimit: number
  enableConnLimit: boolean
  maxConn: number
  enableGeoFilter: boolean
  geoRules: GeoRules
  enableBotChallenge: boolean
  botPatterns: string[]
  browserPatterns: string[]
  botChallengeNoUaLimit: number
  botChallengeBotLimit: number
  botChallengeBrowserLimit: number
  internalIpPrefixes: string[]
  idcIpPrefixes: string[]
  safePaths: string[]
  manualBlacklistIps: string[]
  manualBlacklistUsers: string[]
  manualWhitelistIps: string[]
  [key: string]: any
}

export interface GeoRules {
  sensitivePaths: string[]
  overseasLimit: number
  overseasWindow: number
  overseasBlockTime: number
  [key: string]: any
}

// ==================== 封禁/白名单 ====================

export interface BlockEntry {
  ip?: string
  fingerprint?: string
  type: 'ip' | 'fingerprint'
  status: string
  duration?: number
  permanent?: boolean
  createdAt: string
  expiresAt?: string
  [key: string]: any
}

export interface AddBlockData {
  type: 'ip' | 'fingerprint'
  ip?: string
  fingerprint?: string
  duration?: number
  permanent?: boolean
  status?: string
}

export interface AddWhitelistData {
  type: 'ip' | 'fingerprint'
  ip?: string
  fingerprint?: string
  duration?: number
}

export interface RemoveEntry {
  type: 'ip' | 'fingerprint'
  value: string
}

// ==================== API 配置树 ====================

export interface ApiConfigs {
  [systemKey: string]: SystemConfig
}

export interface SystemConfig {
  enabled: boolean
  description?: string
  groups: Record<string, GroupConfig>
}

export interface GroupConfig {
  enabled: boolean
  description?: string
  apis: Record<string, ApiNodeConfig>
}

export interface ApiNodeConfig {
  enabled: boolean
  allowIps: string[]
  allowRoles: string[]
  requireLogin: boolean
  description?: string
  updatedAt?: string
}

export interface EditForm {
  ips: string
  roles: string
  requireLogin: boolean
  description: string
  updatedAt: string
}

export interface SaveNodePayload {
  systemKey: string
  groupKey: string
  apiKey?: string
  data: Record<string, any>
}

// ==================== 可用 IP API ====================

export interface SettingsResponse {
  availableApis?: string[]
  [key: string]: any
}
