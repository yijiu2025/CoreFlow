# 通知服务模块 (Notice Module)

## 概述
本模块负责系统中所有的对外通知逻辑。目前已支持邮件通知（Email），未来计划扩展钉钉机器人（DingTalk）、微信推送（WeChat）等多种通道。通过统一的配置接口，管理员可以动态调整通知参数。

## 目录结构
- `src/notice/services/`: 各类通知通道的底层实现类。
  - `email.js`: 邮件发送服务（支持 SMTP）。
- `src/notice/dao/notice.js`: 通知中心的 DAO 层，负责管理各类通道的配置参数。
- `src/api/notice/`: 通知中心的对外管理接口。

## 主要功能
1. **通道配置管理**
   - 获取所有可用通道：`GET /notice/v1/channels`
   - 获取/更新特定配置：`GET|POST /notice/v1/config/:type`
2. **测试功能**
   - 测试邮件发送：`POST /notice/v1/test-email`
3. **验证码下发**
   - 集成邮件模板，供 `Verify` 模块调用发送 6 位数字验证码。

## 优化建议
1. **异步任务队列**：通知发送属于耗时操作（IO 密集型），建议未来集成 `BullMQ` 或 `RabbitMQ`。将发送请求放入队列，由后台 Worker 异步执行，防止阻塞业务主流程。
2. **多模板引擎**：目前的邮件内容是硬编码的。建议引入 `Handlebars` 或 `EJS` 模板引擎，支持从数据库加载动态 HTML 模板。
3. **失败重试机制**：针对网络抖动导致的发送失败，应增加自动重试逻辑。
4. **统一分发器 (Dispatcher)**：增加一个 `NoticeDispatcher` 类，业务侧只需调用 `dispatch(userId, content)`，由分发器根据用户的偏好设置（如：优先微信，备选邮件）自动选择通道。

## 使用示例
```javascript
import emailService from '../notice/services/email.js';

// 发送简单邮件
await emailService.send('user@example.com', '标题', '内容');

// 发送验证码
await emailService.sendVerificationCode('user@example.com', '123456');
```
