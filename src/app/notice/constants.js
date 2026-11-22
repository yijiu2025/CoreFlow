/**
 * 通知中心：渠道与事件清单（唯一来源）
 *
 * 为什么必须是"唯一来源"：同一份清单同时被四处消费 —— 管理页的渠道表单、保存时的
 * 字段白名单、投递时的渠道路由、个人偏好页的开关矩阵。任何一处自己再写一份，
 * 加渠道/改字段时必然漏改，而症状是"配置存进去了但发不出去"或"表单多一个字段
 * 直接 400"，从代码上看不出两边已经分叉。
 *
 * 前端（`scaffold/`）是独立工程，不打包本文件：它通过 `GET /notice/v1/channels`
 * 与 `GET /notice/v1/events` 拿到同一份数据 —— 仍然是单一来源，只是经 HTTP 分发。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

/**
 * 渠道清单
 *
 * `implemented` 是**能力声明**，不是开关：只有 true 的渠道会真正尝试发送；
 * false 的渠道允许保存配置（接入前先把密钥配好），但投递时一律记 failed +
 * `通道未接入`，绝不做"看起来发了"的假成功。
 *
 * `fields` 同时驱动三处：管理页表单渲染、保存白名单、读取时的类型还原。
 * `secret: true` 的字段加密入库、读取时掩码，永远不回显明文。
 */
const NOTICE_CHANNELS = [
  {
    id: 'email',
    label: '邮件',
    implemented: true,
    description: 'SMTP 直发，支持 HTML 模板；唯一已接入的通道',
    fields: [
      { key: 'host', label: 'SMTP 服务器', type: 'text', required: true, placeholder: 'smtp.example.com' },
      { key: 'port', label: '端口', type: 'number', required: true, placeholder: '465' },
      { key: 'user', label: '发件账号', type: 'text', required: true, placeholder: 'no-reply@example.com' },
      {
        key: 'pass',
        label: 'SMTP 授权码',
        type: 'password',
        secret: true,
        hint: '读取时显示为掩码；保持掩码原样提交表示不修改'
      },
      { key: 'from', label: '发件人显示名', type: 'text', placeholder: '留空则与发件账号一致' },
      { key: 'secure', label: '使用 SSL', type: 'boolean' }
    ]
  },
  {
    id: 'wecom',
    label: '企业微信',
    implemented: false,
    description: '群机器人 Webhook，待接入',
    fields: [
      {
        key: 'webhookUrl',
        label: 'Webhook 地址',
        type: 'password',
        secret: true,
        placeholder: 'https://qyapi.weixin.qq.com/...'
      },
      { key: 'mentionAll', label: '@所有人', type: 'boolean' }
    ]
  },
  {
    id: 'dingtalk',
    label: '钉钉',
    implemented: false,
    description: '群机器人 Webhook（支持加签），待接入',
    fields: [
      {
        key: 'webhookUrl',
        label: 'Webhook 地址',
        type: 'password',
        secret: true,
        placeholder: 'https://oapi.dingtalk.com/...'
      },
      { key: 'secret', label: '加签密钥', type: 'password', secret: true },
      { key: 'mentionAll', label: '@所有人', type: 'boolean' }
    ]
  },
  {
    id: 'feishu',
    label: '飞书',
    implemented: false,
    description: '群机器人 Webhook，待接入',
    fields: [
      {
        key: 'webhookUrl',
        label: 'Webhook 地址',
        type: 'password',
        secret: true,
        placeholder: 'https://open.feishu.cn/...'
      },
      { key: 'mentionAll', label: '@所有人', type: 'boolean' }
    ]
  },
  {
    id: 'webhook',
    label: 'Webhook',
    implemented: false,
    description: '通用 HTTP 回调，待接入',
    fields: [
      { key: 'url', label: '回调地址', type: 'text', required: true, placeholder: 'https://example.com/hooks/notice' },
      { key: 'token', label: '鉴权令牌', type: 'password', secret: true },
      { key: 'mentionAll', label: '附带 @所有人 标记', type: 'boolean' }
    ]
  },
  {
    id: 'sms',
    label: '短信',
    implemented: false,
    description: '短信服务商模板短信，待接入',
    fields: [
      {
        key: 'provider',
        label: '服务商',
        type: 'select',
        options: [
          { label: '阿里云', value: 'aliyun' },
          { label: '腾讯云', value: 'tencent' }
        ]
      },
      { key: 'accessKeyId', label: 'AccessKeyId', type: 'text' },
      { key: 'accessKeySecret', label: 'AccessKeySecret', type: 'password', secret: true },
      { key: 'signName', label: '短信签名', type: 'text' },
      { key: 'templateCode', label: '模板编码', type: 'text' }
    ]
  }
];

/**
 * 事件清单
 *
 * `defaultChannels` 是"用户没设置、全局也没订阅"时的兜底：只在默认渠道上开启。
 * 全关是一个合法选择（用户就是要静音），所以不能用"空即全开"的写法。
 */
const NOTICE_EVENTS = [
  {
    code: 'user.created',
    label: '用户创建',
    description: '新账号创建成功后通知本人（欢迎/开通信息）',
    defaultChannels: ['email']
  },
  {
    code: 'user.deactivated',
    label: '账号停用/注销',
    description: '账号被停用或注销后通知本人留档',
    defaultChannels: ['email']
  },
  {
    code: 'security.login_failed',
    label: '登录失败告警',
    description: '连续登录失败时通知账号本人，便于发现盗号尝试',
    defaultChannels: ['email']
  },
  {
    code: 'system.alert',
    label: '系统告警',
    description: '服务异常、容量告警等运维事件',
    defaultChannels: ['email']
  }
];

/** 渠道 id 列表（投递遍历顺序即此顺序） */
const NOTICE_CHANNEL_IDS = NOTICE_CHANNELS.map(channel => channel.id);

/** 事件 code 列表（校验与遍历用） */
const NOTICE_EVENT_CODES = NOTICE_EVENTS.map(event => event.code);

const CHANNEL_MAP = new Map(NOTICE_CHANNELS.map(channel => [channel.id, channel]));
const EVENT_MAP = new Map(NOTICE_EVENTS.map(event => [event.code, event]));

/**
 * 取渠道定义
 *
 * @param {string} id 渠道 id
 * @returns {object|undefined} 渠道定义（未知渠道为 undefined，调用方据此拒绝）
 */
function getChannel(id) {
  return CHANNEL_MAP.get(String(id || ''));
}

/**
 * 取事件定义
 *
 * @param {string} code 事件 code
 * @returns {object|undefined} 事件定义
 */
function getEvent(code) {
  return EVENT_MAP.get(String(code || ''));
}

/**
 * 渠道是否已接入（只有已接入的渠道会真正发送）
 *
 * @param {string} id 渠道 id
 * @returns {boolean}
 */
function isChannelImplemented(id) {
  return getChannel(id)?.implemented === true;
}

/**
 * 渠道里标记为 secret 的字段名
 *
 * 读取时按这个清单掩码，写入时按这个清单跳过掩码值并加密。
 * 放在常量里而不是各路由各写一份：漏一个就是明文凭据直接回显给浏览器。
 *
 * @param {string} id 渠道 id
 * @returns {string[]} 字段名数组
 */
function getChannelSecretKeys(id) {
  const channel = getChannel(id);
  if (!channel) return [];
  return channel.fields.filter(field => field.secret).map(field => field.key);
}

export {
  NOTICE_CHANNELS,
  NOTICE_EVENTS,
  NOTICE_CHANNEL_IDS,
  NOTICE_EVENT_CODES,
  getChannel,
  getEvent,
  isChannelImplemented,
  getChannelSecretKeys
};
