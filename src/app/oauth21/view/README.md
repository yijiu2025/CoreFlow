# view/ 目录说明

本目录下的 `_legacy/` 文件夹包含已废弃的遗留代码，仅供参考。

## 遗留文件（不参与构建）

| 文件 | 说明 | 废弃原因 |
|------|------|----------|
| `index.js` | Express 独立入口 | 已迁移至 Fastify 主服务 |
| `login.ejs` | EJS 登录模板 | 已迁移至 Vue 前端 (oauth21/) |
| `login.html` | HTML 登录页面 | 已迁移至 Vue 前端 |
| `consent.ejs` | EJS 授权确认模板 | 已迁移至 Vue 前端 |
| `vue-sso-login.html` | Vue SSO 登录页 | 已迁移至 Vue 前端 |
| `test-iframe-login.html` | iframe 测试页 | 开发调试用，不再维护 |
| `flow.test.js` | 端到端测试 | 已迁移至 src/__tests__/ |

## 当前活跃文件

- `../templates/device.html` — 设备授权验证页面（RFC 8628）
