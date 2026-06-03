# 验证服务模块 (Verify Module)

系统级通用验证工具库，提供多种验证能力，所有应用均可复用。

## 设计原则

- **纯工具库**：verify 模块不含 API 路由，只提供验证能力
- **独立文件夹**：每种验证方式一个文件夹（service + dao + index）
- **Store 适配器**：通过 Store 接口解耦存储层（Redis/内存）
- **配置统一**：所有配置从 `config.js` 读取，支持环境变量覆盖
- **业务无关**：不含业务逻辑（如检查邮箱是否注册），由调用方负责

## 目录结构

```
src/verify/
├── config.js                   # 统一配置（环境变量 + 默认值）
├── captcha/                    # 图形验证码
│   ├── service.js              # CaptchaService（生成/验证/消费）
│   ├── dao.js                  # 验证码存储/校验逻辑
│   └── index.js
├── email/                      # 邮箱验证码
│   ├── service.js              # EmailService（邮件发送）
│   ├── dao.js                  # 频率限制/校验逻辑
│   └── index.js
├── sms/                        # 短信验证码
│   ├── service.js              # SmsService（阿里云/腾讯云）
│   ├── dao.js                  # 频率限制/校验逻辑
│   └── index.js
├── slider/                     # 滑块验证码
│   ├── service.js              # SliderService（生成/验证位置）
│   ├── dao.js
│   └── index.js
├── qrcode/                     # 二维码扫码验证
│   ├── service.js              # QrCodeService（生成/轮询/确认）
│   ├── dao.js
│   └── index.js
├── recaptcha/                  # 人机验证
│   ├── service.js              # RecaptchaService（Google/hCaptcha）
│   ├── dao.js
│   └── index.js
├── voice/                      # 语音验证码
│   ├── service.js              # VoiceService（语音播报）
│   ├── dao.js
│   └── index.js
└── README.md                   # 本文档
```

## 调用关系

```
API 路由层（api/verify/, api/user/, api/oauth21/）
    │
    ▼
captcha/dao.js 或 email/dao.js 或 sms/dao.js ...
    │
    ▼
对应的 service.js
    │
    ▼
config.js（统一配置）
```

## 配置文件 (config.js)

所有验证子模块从 `config.js` 读取配置，支持环境变量覆盖：

```js
import config from '../verify/config.js';

// 使用
const ttl = config.captcha.ttl;           // 图形验证码 TTL
const smsProvider = config.sms.provider;   // 短信服务商
```

### 环境变量清单

```env
# === 图形验证码 ===
CAPTCHA_SIZE=4                  # 验证码字符数
CAPTCHA_NOISE=3                 # 干扰线数量
CAPTCHA_TTL=600                 # 有效期（秒）
CAPTCHA_EXTEND_TTL=300          # 验证通过后延长有效期（秒）

# === 短信验证码 ===
SMS_PROVIDER=aliyun             # 服务商：aliyun / tencent
SMS_ACCESS_KEY_ID=              # AccessKey ID
SMS_ACCESS_KEY_SECRET=          # AccessKey Secret
SMS_SIGN_NAME=                  # 短信签名
SMS_TEMPLATE_CODE=              # 模板编码
SMS_CODE_LENGTH=6               # 验证码长度
SMS_CODE_TTL=300                # 有效期（秒）
SMS_RATE_LIMIT=60               # 发送频率限制（秒）

# === 人机验证 ===
RECAPTCHA_PROVIDER=google       # 服务商：google / hcaptcha
RECAPTCHA_SECRET_KEY=           # 密钥
RECAPTCHA_SITE_KEY=             # 站点密钥
RECAPTCHA_MIN_SCORE=0.5         # 最低分数（Google v3）

# === 滑块验证码 ===
SLIDER_TOLERANCE=5              # 位置容差（像素）
SLIDER_TTL=300                  # 有效期（秒）

# === 二维码扫码 ===
QRCODE_TTL=300                  # 有效期（秒）
QRCODE_POLL_INTERVAL=2000       # 轮询间隔（毫秒）

# === 通用 ===
VERIFY_RATE_LIMIT=60            # 通用频率限制（秒）
VERIFY_CODE_TTL=600             # 通用验证码有效期（秒）
```

## Store 适配器接口

所有验证 service 通过 Store 适配器访问存储，不直接依赖 Redis/内存：

```js
// Store 接口
const store = {
  async get(key) { ... },           // 返回值或 null
  async set(key, value, ttl) { ... }, // ttl 为秒
  async delete(key) { ... }
};

// 使用 Redis session-store
import { getSessionStore } from '../redis/session-store.js';
const captchaStore = getSessionStore(fastify, 'captcha');
```

## 已实现模块

### 1. 图形验证码 (captcha/)

```js
import { captchaService, captchaDao } from '../verify/captcha/index.js';

// 生成
const { captchaImage, captchaKey } = await captchaService.generate(store, { level: 'normal' });

// 验证（不销毁）
const isValid = await captchaService.verify(userInput, captchaKey, store);

// 消费（一次性销毁）
const isConsumed = await captchaService.consume(captchaKey, store);
```

**难度分级：** `easy` / `normal` / `high`

### 2. 邮箱验证码 (email/)

```js
import { emailDao } from '../verify/email/index.js';

// 发送
await emailDao.sendCode(email, sessionId, store);

// 校验（一次性消费）
await emailDao.verifyCode(email, code, store);
```

### 3. 短信验证码 (sms/)

```js
import { smsDao } from '../verify/sms/index.js';

// 发送
await smsDao.sendCode(phone, sessionId, store);

// 校验（一次性消费）
await smsDao.verifyCode(phone, code, store);
```

**支持服务商：** 阿里云、腾讯云（需配置环境变量）

### 4. 滑块验证码 (slider/)

```js
import { sliderDao } from '../verify/slider/index.js';

// 生成
const { sliderKey, bgWidth, bgHeight, sliderWidth, sliderHeight, token } = await sliderDao.generate(store);

// 验证
const isValid = await sliderDao.verify(sliderKey, userX, token, store);

// 消费
const isConsumed = await sliderDao.consume(sliderKey, store);
```

**工作流程：**
1. 前端获取滑块参数，展示背景图和滑块
2. 用户拖动滑块，前端发送 X 坐标
3. 后端验证 X 坐标是否在容差范围内

### 5. 二维码扫码 (qrcode/)

```js
import { qrCodeDao, QR_STATUS } from '../verify/qrcode/index.js';

// 生成二维码
const { sessionId, qrContent, expiresAt } = await qrCodeDao.generate(store);

// 手机端：标记已扫码
await qrCodeDao.scan(sessionId, userId, store);

// 手机端：确认登录
await qrCodeDao.confirm(sessionId, userId, store);

// PC 端：轮询状态
const { status, userId } = await qrCodeDao.poll(sessionId, store);

// 消费（获取用户 ID）
const userId = await qrCodeDao.consume(sessionId, store);
```

**状态流转：** `pending` → `scanned` → `confirmed` → consumed

### 6. 人机验证 (recaptcha/)

```js
import { recaptchaDao } from '../verify/recaptcha/index.js';

// 验证
const result = await recaptchaDao.verify(token, remoteIp);
// result: { success: boolean, score?: number, error?: string }

// 快速校验
const isValid = await recaptchaDao.isValid(token, remoteIp);
```

**支持服务商：** Google reCAPTCHA v2/v3、hCaptcha

### 7. 语音验证码 (voice/)

```js
import { voiceDao } from '../verify/voice/index.js';

// 发送
await voiceDao.sendCode(phone, sessionId, store);

// 校验（一次性消费）
await voiceDao.verifyCode(phone, code, store);
```

**复用短信验证码的频率限制和存储逻辑**

## 扩展指南

### 新增验证方式

1. 创建文件夹 `src/verify/xxx/`
2. 实现 `service.js`（纯验证逻辑）
3. 实现 `dao.js`（存储 + 频率限制）
4. 实现 `index.js`（导出）
5. 在 `config.js` 添加配置项
6. 更新本文档

### service.js 模板

```js
import config from '../config.js';

class XxxService {
  async generate(store, options = {}) {
    const cfg = { ...config.xxx, ...options };
    const key = uuidv4();
    await store.set(key, data, cfg.ttl);
    return { key, ... };
  }

  async verify(input, key, store) {
    const data = await store.get(key);
    if (!data) return false;
    return true;
  }
}

export default new XxxService();
```

## 注意事项

1. **系统层不含业务逻辑** — 检查邮箱是否注册等逻辑在应用层
2. **Store 必须实现 TTL** — 防止数据永不过期
3. **关键业务用 consume** — 登录、注册用一次性消费
4. **配置走 config.js** — 不要硬编码，保持可配置性
5. **Schema 在 API 层** — 验证模块不定义 Schema，由 API 路由定义
