# 验证服务模块 (Verification Module)

## 概述
本模块统一管理系统中所有的安全验证逻辑，包括图形验证码和邮箱验证码。采用模块化设计，将接口层 (API)、业务逻辑层 (DAO) 和底层服务层 (Service) 进行解耦。

## 目录结构
- `src/verify/captcha.js`: 图形验证码底层 Service，负责生成和校验。
- `src/verify/dao/verify.js`: 验证中心 DAO，负责协调图形验证码与邮件发送的业务流程，并对接数据库模型。
- `src/api/verify/`: 验证中心的对外 API 接口。

## 主要功能
1. **图形验证码 (Captcha)**
   - 生成：`GET /verify/v1/generate-captcha`
   - 校验：`POST /verify/v1/verify-captcha`
2. **邮箱验证码 (Email Code)**
   - 发送：集成在 `verify-captcha` 接口中，支持在校验图形验证码后自动发送。
   - 独立校验：`POST /verify/v1/check-email-code`

## 安全特性
- **防重放攻击**：图形验证码通过 `consume` 模式在关键业务（如登录）中一次性使用。
- **发送频率限制**：后端强制执行 60 秒邮件发送冷却，防止接口被恶意刷取。
- **环境降级**：验证码存储支持 Redis，在 Redis 不可用时自动降级为内存存储。

## 优化建议
1. **IP 级限流**：建议进一步在 API 层挂载 `@fastify/rate-limit`，限制单个 IP 在短时间内的请求频率。
2. **多通道支持**：未来可扩展支持短信验证码 (SMS)，只需在 `VerifyDao` 中增加短信通道即可。
3. **验证码样式动态化**：可以在 `CaptchaService` 中根据安全等级动态调整干扰线数量和字符复杂度。
