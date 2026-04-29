/**
 * 防火墙模块 API Schema 定义
 * 使用 JSON Schema 约束请求参数与响应结构
 */

// 基础响应结构 (Standard Response Wrapper)
const baseResponse = (dataSchema) => ({
  type: 'object',
  properties: {
    code: { type: 'number', example: 200 },
    message: { type: 'string', example: '操作成功' },
    timestamp: { type: 'number', example: Date.now() },
    data: dataSchema
  }
})

// 1. 监控摘要响应
export const summarySchema = {
  description: '获取防火墙监控摘要数据',
  response: {
    200: baseResponse({
      type: 'object',
      properties: {
        totalRequests: { type: 'number' },
        totalBlocked: { type: 'number' },
        topRegions: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              region: { type: 'string' },
              count: { type: 'number' }
            }
          }
        },
        topPaths: { 
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              count: { type: 'number' }
            }
          }
        },
        serverNode: { type: 'object' }
      }
    })
  }
}

// 2. 更新节点信息请求
export const updateNodeSchema = {
  description: '更新服务器节点地理位置信息',
  body: {
    type: 'object',
    required: ['name', 'lat', 'lon'],
    properties: {
      name: { type: 'string', minLength: 1 },
      lat: { type: 'number' },
      lon: { type: 'number' },
      country: { type: 'string' },
      region: { type: 'string' },
      city: { type: 'string' }
    }
  },
  response: {
    200: baseResponse({ type: 'object' })
  }
}

// 3. 更新安全设置请求
export const updateSettingsSchema = {
  description: '更新全局防御策略设置',
  body: {
    type: 'object',
    properties: {
      activeIpApi: { type: 'string' },
      showTrajectory: { type: 'boolean' },
      defense: {
        type: 'object',
        properties: {
          enableAutoBlacklist: { type: 'boolean' },
          maxNotFoundAttempts: { type: 'number' },
          blacklistDuration: { type: 'number' },
          enableRateLimit: { type: 'boolean' },
          rateLimitRequests: { type: 'number' },
          rateLimitWindow: { type: 'number' },
          enableBruteForce: { type: 'boolean' },
          bruteLimit: { type: 'number' },
          accountLockTime: { type: 'number' },
          enableConnLimit: { type: 'boolean' },
          maxConn: { type: 'number' },
          enableGeoFilter: { type: 'boolean' },
          enableBotChallenge: { type: 'boolean' },
          internalIpPrefixes: { type: 'array', items: { type: 'string' } },
          idcIpPrefixes: { type: 'array', items: { type: 'string' } },
          safePaths: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  },
  response: {
    200: baseResponse({ type: 'object' })
  }
}

// 4. 黑名单操作请求
export const blacklistSchema = {
  description: '添加/移除黑名单',
  body: {
    type: 'object',
    required: ['type', 'value'],
    properties: {
      type: { type: 'string', enum: ['ip', 'user'] },
      value: { type: 'string', minLength: 1 },
      duration: { type: 'number', minimum: 60 },
      permanent: { type: 'boolean' }
    }
  },
  response: {
    200: baseResponse({ type: 'object' })
  }
}

// 5. 封禁管理请求
export const blocksSchema = {
  description: '添加封禁记录',
  body: {
    type: 'object',
    required: ['ip'],
    properties: {
      ip: { type: 'string', minLength: 7 },
      duration: { type: 'number', minimum: 60 },
      permanent: { type: 'boolean' },
      status: { type: 'string', enum: ['BLOCKED', 'SCANNER', 'CHALLENGE'] }
    }
  },
  response: {
    200: baseResponse({ type: 'object' })
  }
}

// 6. 白名单管理请求
export const whitelistSchema = {
  description: '添加白名单记录',
  body: {
    type: 'object',
    required: ['ip'],
    properties: {
      ip: { type: 'string', minLength: 7 },
      duration: { type: 'number', minimum: 60, maximum: 86400 }
    }
  },
  response: {
    200: baseResponse({ type: 'object' })
  }
}
