# Notice 模块优化清单

## 1. 钉钉机器人通道

**当前状态：** `getAvailableChannels()` 中 `dingtalk: enabled: false`

**实现方案：**
```js
// src/notice/services/dingtalk.js
class DingtalkService {
  async send(webhookUrl, content) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content } })
    });
  }
}
```

**环境变量：**
```env
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
DINGTALK_SECRET=xxx
```

---

## 2. 微信推送通道

**当前状态：** `getAvailableChannels()` 中 `wechat: enabled: false`

**实现方案：**
```js
// src/notice/services/wechat.js
class WechatService {
  async send(openid, templateId, data) {
    // 调用微信公众号模板消息 API
    const token = await this.getAccessToken();
    await fetch(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`, {
      method: 'POST',
      body: JSON.stringify({ touser: openid, template_id: templateId, data })
    });
  }
}
```

**环境变量：**
```env
WECHAT_APP_ID=xxx
WECHAT_APP_SECRET=xxx
```

---

## 3. 短信通道

**当前状态：** 短信功能在 `src/verify/sms/` 中，但通知模块未集成

**实现方案：**
```js
// src/notice/services/sms.js
class SmsService {
  async send(phone, content) {
    // 复用 verify/sms 的发送逻辑
    const smsDao = await import('../../verify/sms/dao.js');
    return await smsDao.default.sendCode(phone, null, null);
  }
}
```

---

## 4. 发送记录持久化

**当前状态：** 邮件发送后只写日志，无 DB 记录

**实现方案：**
```js
// 新增 src/models/notice/NoticeLog.js
{
  id: BIGINT PK,
  channel: STRING,      // email/dingtalk/wechat/sms
  recipient: STRING,    // 收件人
  subject: STRING,      // 主题
  status: TINYINT,      // 0:失败 1:成功
  error: TEXT,          // 失败原因
  message_id: STRING,   // 第三方返回的消息ID
  created_at: DATE
}
```

---

## 5. 模板编辑器 API

**当前状态：** 模板通过 `saveTemplate()` 保存，但无前端编辑接口

**实现方案：**
```js
// src/api/notice/v1/template.js
registerSecureRoute(fastify, {
  name: 'listTemplates',
  method: 'GET',
  url: '/templates',
  requireLogin: true,
  handler: async (request, reply) => {
    const templates = await noticeDao.getAllTemplates();
    return reply.result.success('获取成功', templates);
  }
});

registerSecureRoute(fastify, {
  name: 'saveTemplate',
  method: 'POST',
  url: '/templates/:id',
  requireLogin: true,
  handler: async (request, reply) => {
    await noticeDao.saveTemplate(request.params.id, request.body);
    return reply.result.success('保存成功');
  }
});
```

---

## 6. 邮件发送限流

**当前状态：** 无全局发送频率限制，可能被滥用

**实现方案：**
```js
// 在 email.js 中添加全局限流
let dailySentCount = 0;
const DAILY_LIMIT = parseInt(process.env.EMAIL_DAILY_LIMIT || '1000');

async send(email, subject, content) {
  if (dailySentCount >= DAILY_LIMIT) {
    Logger.warn('[Notice:Email] 达到每日发送上限');
    return false;
  }
  // ... 发送逻辑
  dailySentCount++;
}
```

**环境变量：**
```env
EMAIL_DAILY_LIMIT=1000
```

---

## 7. Webhook 通知

**当前状态：** 仅支持出站通知，不支持入站 Webhook

**实现方案：**
```js
// src/api/notice/v1/webhook.js
registerSecureRoute(fastify, {
  name: 'receiveWebhook',
  method: 'POST',
  url: '/webhook/:channel',
  requireLogin: false,
  handler: async (request, reply) => {
    const { channel } = request.params;
    const payload = request.body;
    // 验证签名 → 处理入站消息 → 触发业务逻辑
  }
});
```

---

## 8. 邮件预览功能

**当前状态：** 模板渲染后无法预览

**实现方案：**
```js
// src/api/notice/v1/preview.js
registerSecureRoute(fastify, {
  name: 'previewTemplate',
  method: 'POST',
  url: '/preview/:templateId',
  requireLogin: true,
  handler: async (request, reply) => {
    const template = await noticeDao.getTemplate(request.params.templateId);
    const html = renderTemplate(template.content, request.body.vars);
    return reply.type('text/html').send(html);
  }
});
```

---

## 9. 多语言模板

**当前状态：** 模板仅支持中文

**实现方案：**
```js
// 模板支持语言后缀
const templates = {
  'verification_code_zh': { subject: '验证码', content: '...' },
  'verification_code_en': { subject: 'Verification Code', content: '...' },
};

// 发送时根据用户语言选择模板
async sendVerificationCode(email, code, lang = 'zh') {
  return await this.sendWithTemplate(email, `verification_code_${lang}`, { code });
}
```

---

## 10. 队列持久化

**当前状态：** 发送队列在内存中，进程重启丢失

**实现方案：**
```js
// 使用 Redis List 作为持久化队列
async function enqueue(email, subject, content) {
  await redis.lPush('notice:send_queue', JSON.stringify({ email, subject, content }));
}

// Worker 消费队列
async function processQueue() {
  while (true) {
    const item = await redis.brPop('notice:send_queue', 5);
    if (item) {
      const task = JSON.parse(item.element);
      await emailService.send(task.email, task.subject, task.content);
    }
  }
}
```

---

## 11. 邮件附件支持

**当前状态：** 仅支持 HTML 正文，不支持附件

**实现方案：**
```js
async sendWithAttachment(email, subject, content, attachments) {
  const transporter = await getTransporter();
  await transporter.sendMail({
    from: config.from,
    to: email,
    subject,
    html: content,
    attachments: attachments.map(a => ({
      filename: a.name,
      content: Buffer.from(a.base64, 'base64'),
      contentType: a.type
    }))
  });
}
```

---

## 12. 批量发送

**当前状态：** 逐个发送，无批量支持

**实现方案：**
```js
async sendBatch(recipients, subject, content, concurrency = 5) {
  const chunks = [];
  for (let i = 0; i < recipients.length; i += concurrency) {
    chunks.push(recipients.slice(i, i + concurrency));
  }
  const results = [];
  for (const chunk of chunks) {
    const batch = await Promise.allSettled(
      chunk.map(email => this.send(email, subject, content))
    );
    results.push(...batch);
  }
  return results;
}
```

---

## 13. 退订机制

**当前状态：** 无退订功能，用户无法拒绝通知

**实现方案：**
```js
// 新增 Unsubscribe 模型
// 邮件底部添加退订链接
const unsubscribeUrl = `https://example.com/unsubscribe?email=${encodeURIComponent(email)}&token=${signToken(email)}`;

// 发送前检查
async function isUnsubscribed(email, channel) {
  const record = await Unsubscribe.findOne({
    where: { email, channel: { [Op.in]: [channel, 'all'] } }
  });
  return !!record;
}
```

---

## 14. 发送速率控制

**当前状态：** 无 SMTP 发送速率限制，可能触发服务商限流

**实现方案：**
```js
// 令牌桶限流
class RateLimiter {
  constructor(maxPerSecond = 10) {
    this.maxPerSecond = maxPerSecond;
    this.tokens = maxPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxPerSecond, this.tokens + elapsed * this.maxPerSecond);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.maxPerSecond) * 1000;
      await new Promise(r => setTimeout(r, waitMs));
      this.tokens = 0;
    } else {
      this.tokens -= 1;
    }
  }
}

const limiter = new RateLimiter(10); // 每秒最多 10 封
```

---

## 15. 邮件打开/点击追踪

**当前状态：** 无法追踪邮件是否被打开或链接被点击

**实现方案：**
```js
// 嵌入追踪像素
const trackingPixel = `<img src="https://example.com/api/notice/track/open?mid=${messageId}" width="1" height="1" style="display:none">`;

// 链接追踪
const trackedLink = `https://example.com/api/notice/track/click?mid=${messageId}&url=${encodeURIComponent(originalUrl)}`;
```

---

## 16. 通知偏好设置

**当前状态：** 用户无法选择接收哪些通知

**实现方案：**
```js
// 新增 NotificationPreference 模型
// { user_id, channel, notification_type, enabled }

// 发送前检查用户偏好
async function shouldNotify(userId, channel, type) {
  const pref = await NotificationPreference.findOne({
    where: { user_id: userId, channel, notification_type: type }
  });
  return pref ? pref.enabled : true; // 默认启用
}
```

---

## 17. 异步渲染引擎

**当前状态：** 模板渲染在主线程执行，复杂模板可能阻塞

**实现方案：**
```js
import { Worker } from 'worker_threads';

async function renderTemplateAsync(template, vars) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./template-worker.js', {
      workerData: { template, vars }
    });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}
```

---

## 18. 通知聚合（Digest）

**当前状态：** 每条通知单独发送，高频通知可能骚扰用户

**实现方案：**
```js
// 聚合多条通知为一封摘要邮件
async function sendDigest(userId) {
  const pending = await PendingNotification.findAll({
    where: { user_id: userId, sent: false }
  });
  if (pending.length === 0) return;

  const content = pending.map(n => `<li>${n.content}</li>`).join('');
  await emailService.sendTemplate(user.email, '您有新的通知', `<ul>${content}</ul>`);
  await PendingNotification.update({ sent: true }, { where: { id: pending.map(n => n.id) } });
}

// 定时任务：每 30 分钟聚合一次
setInterval(() => sendDigests(), 30 * 60 * 1000);
```

---

## 19. 多租户支持

**当前状态：** 通知配置全局共享，不支持多租户

**实现方案：**
```js
// 配置按租户隔离
async function getConfig(type, tenantId) {
  const key = tenantId ? `${tenantId}:smtp_server` : 'smtp_server';
  return await NoticeConfig.getVal(key, '');
}

// 发送时传入租户 ID
async function sendForTenant(tenantId, email, subject, content) {
  const config = await getConfig('email', tenantId);
  // 使用租户专属配置发送
}
```

---

## 20. 通知审计日志

**当前状态：** 仅有发送日志，无审计追踪

**实现方案：**
```js
// 新增 NoticeAudit 模型
// { user_id, action, target, details, ip, created_at }

// 记录所有通知操作
async function logAudit(userId, action, target, details, ip) {
  await NoticeAudit.create({ user_id: userId, action, target, details, ip });
}
```
