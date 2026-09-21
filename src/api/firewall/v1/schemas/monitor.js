/**
 * 防火墙模块 API Schema 定义
 * 使用 JSON Schema 约束请求参数与响应结构
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

// 基础响应结构 (Standard Response Wrapper)
// ⚠️ 必须与 globals 里 reply.result 的 build() 字段**一一对应**：schema 未声明的字段
//    会被序列化静默裁掉。此前漏了 requestId（信封里一直有，只是发不出去）。
const baseResponse = dataSchema => ({
  type: 'object',
  properties: {
    code: { type: 'number', example: 200 },
    message: { type: 'string', example: '操作成功' },
    timestamp: { type: 'number', example: Date.now() },
    requestId: { type: 'string', description: '请求 ID' },
    data: dataSchema
  }
});

// 1. 监控摘要响应
// 注意：Fastify 会用 response schema 对响应做**序列化裁剪** —— schema 里没声明的字段
// 会被直接丢掉（不是报错）。此前 schema 只声明了 totalRequests/totalBlocked/topRegions/topPaths，
// 于是 getSummary() 实际返回的 bufferedCount / bufferCapacity / topIps 以及 topPaths[].apiName
// 在 HTTP 响应里全部消失（前端拿不到，却以为后端没实现）。
const summarySchema = {
  description: '获取防火墙监控摘要数据',
  response: {
    200: baseResponse({
      type: 'object',
      properties: {
        totalRequests: { type: 'number' },
        totalBlocked: { type: 'number' },
        bufferedCount: { type: 'number' },
        bufferCapacity: { type: 'number' },
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
              count: { type: 'number' },
              apiName: { type: 'string' }
            }
          }
        },
        topIps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ip: { type: 'string' },
              count: { type: 'number' }
            }
          }
        },
        serverNode: { type: 'object' }
      }
    })
  }
};

// 2. 更新节点信息请求
const updateNodeSchema = {
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
};

// 3. 更新安全设置请求
// 只列出**代码里真的会读**的键。`enableBotChallenge` 之前被列在这里，但
// `DEFAULT_SECURITY_SETTINGS` 与任何 `settings.xxx` 读取点都不存在该键 ——
// 面板上勾选它会往配置里写一个永远没人读的键（用户以为开/关了某个功能）。
// （Bot 挑战的开关实际由 botChallenge*Limit 阈值控制。）
const updateSettingsSchema = {
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
          notFoundWindow: { type: 'number' },
          blacklistDuration: { type: 'number' },
          enableRateLimit: { type: 'boolean' },
          rateLimitRequests: { type: 'number' },
          rateLimitWindow: { type: 'number' },
          enableUserRateLimit: { type: 'boolean' },
          userRateLimitRequests: { type: 'number' },
          userRateLimitWindow: { type: 'number' },
          enableBruteForce: { type: 'boolean' },
          bruteLimit: { type: 'number' },
          bruteWindow: { type: 'number' },
          bruteIpLimit: { type: 'number' },
          accountLockTime: { type: 'number' },
          ipBlockTime: { type: 'number' },
          enableConnLimit: { type: 'boolean' },
          maxConn: { type: 'number' },
          enableGeoFilter: { type: 'boolean' },
          // 设备维度封禁开关（跨 IP）：自动封禁/挑战命中时是否同时记到设备 ID 上
          enableDeviceBlock: { type: 'boolean' },
          // 匿名请求深度检测短路开关：默认关闭，取舍见 config.js 注释
          skipDeepCheckForAnonymous: { type: 'boolean' },
          internalIpPrefixes: { type: 'array', items: { type: 'string' } },
          idcIpPrefixes: { type: 'array', items: { type: 'string' } },
          safePaths: { type: 'array', items: { type: 'string' } },
          challengeDifficulty: { type: 'number', minimum: 1, maximum: 6 },
          geoRules: { type: 'object' },
          endpointRateLimits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                limit: { type: 'number' },
                window: { type: 'number' },
                blockTime: { type: 'number' }
              }
            }
          }
        }
      }
    }
  },
  response: {
    200: baseResponse({ type: 'object' })
  }
};

// 4. 黑名单操作请求
const blacklistSchema = {
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
};

// 4b. 移除黑名单请求（DELETE 带 body）
// handler 会直接读 `req.body.type` / `req.body.value`，缺 schema 时 body 为 undefined → 500。
const removeBlacklistSchema = {
  description: '移除黑名单',
  body: {
    type: 'object',
    required: ['type', 'value'],
    properties: {
      type: { type: 'string', enum: ['ip', 'user'] },
      value: { type: 'string', minLength: 1 }
    }
  },
  response: {
    200: baseResponse({ type: 'object' })
  }
};

// 5. 封禁管理请求
const blocksSchema = {
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
};

// 6. 白名单管理请求
const whitelistSchema = {
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
};

export {
  summarySchema,
  updateNodeSchema,
  updateSettingsSchema,
  blacklistSchema,
  removeBlacklistSchema,
  blocksSchema,
  whitelistSchema
};
