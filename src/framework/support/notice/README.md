# 通知服务 (Notice)

通知能力分**两层**，别再按老路径 `src/notice/` 找（那个目录 2026-09 已拆掉）：

| 位置                            | 职责                                                                                                               | 依赖方向                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `src/framework/support/notice/` | **发信能力**：SMTP 传输、模板渲染、发送队列与重试                                                                  | 不依赖任何业务           |
| `src/app/notice/`               | **应用层**：`dao/notice.js`（通道配置读写）、`config.js`、`cli/index.js`（`npm run cli` 的 notice 子命令）、权限码 | 可依赖 framework         |
| `src/api/notice/v1/config.js`   | 对外管理接口（见下）                                                                                               | 走 `registerSecureRoute` |

## 目录

```
src/framework/support/notice/
├── README.md                 # 本文件
├── OPTIMIZATION.md           # 2026-08 的重构记录（路径为当时快照，仅作历史参考）
└── services/email.js         # 唯一的通道实现：SMTP + 模板 + 发送队列

src/app/notice/
├── config.js                 # 通知模块常量
├── dao/notice.js             # 通道配置的持久化（DB）
├── cli/index.js              # `npm run cli` → notice 子命令（发测试邮件）
└── permission/               # 面板权限码
```

目前**只实现了邮件**通道。`OPTIMIZATION.md` 里提到的钉钉 / 微信 / 短信**从未落地**，
不要把它当成"现有能力清单"。

## 对外接口

| 方法 | 路径                      | 说明         |
| ---- | ------------------------- | ------------ |
| GET  | `/notice/v1/channels`     | 列出可用通道 |
| GET  | `/notice/v1/config/:type` | 读某通道配置 |
| POST | `/notice/v1/config/:type` | 写某通道配置 |
| POST | `/notice/v1/test-email`   | 发测试邮件   |

全部走 `registerSecureRoute`；配置里对外的密码字段是**掩码**下发（读接口不回显明文，
保存接口对掩码值跳过更新）。

## 发信用法

```js
import emailService from '../../framework/support/notice/services/email.js';

// 同步发送（内部带重试，默认 2 次）
await emailService.send('user@example.com', '标题', '正文');

// 验证码（自带模板）
await emailService.sendVerificationCode('user@example.com', '123456');

// 指定模板 + 变量
await emailService.sendWithTemplate('user@example.com', 'welcome', { name: '张三' });

// 异步发送（进队列，不阻塞当前请求）
await emailService.sendAsync('user@example.com', '标题', '正文');

// 队列状态（运维排查用）
emailService.getQueueStatus(); // { pending, processing }
```

约定：

- **验证码一律走 `sendVerificationCode`**，别自己拼模板 —— 各处的文案与有效期提示要对齐
- 请求路径上发信优先用 `sendAsync`：SMTP 是 IO 密集型，同步发送会把响应时间拖到秒级
- 通道配置从 `src/app/notice/dao/notice.js` 读，**不要在业务里直接读环境变量** ——
  面板改配置后要立即生效，环境变量做不到

## 相关

- 配置种子：`src/framework/lifecycle/loader/registry/09-notice.js`（可选 loader，失败只告警）
- 密钥加密：SMTP 密码用 AES-256-GCM 加密存储（`src/framework/security/crypto/symmetric.js`）
- CLI 测试邮件：`npm run cli` → notice → 发送测试邮件
  （⚠️ 在 Docker 容器里用 `node scripts/cli.js`：`npm run cli` 带 `--env-file=.env`，
  镜像里没有 `.env`，会直接失败）
