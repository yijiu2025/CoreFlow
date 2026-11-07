/**
 * RetroWeb 对称加密工具（**薄壳指针**）
 *
 * 实现在 `src/framework/crypto/symmetric.js` —— notice 应用（SMTP 密码）也要加密，
 * 而 app 之间禁止互相 import，所以唯一同时满足"单一实现 + 依赖方向 app → framework"
 * 的位置是 framework。本文件保留原路径与导出名，仅为不打断既有 import
 * （`dao/llm-profile.dao.js`）与文档引用。
 *
 * 算法与格式：AES-256-GCM（`v2:iv:cipher:tag`，base64），密钥由 `APP_SECRET` 派生；
 * 旧 `iv:cipher`（CBC）格式仍可读，用于存量数据。详见 framework 侧注释。
 *
 * @author yijiu2025
 * @since 2026-10-09
 * @since 2026-11-07 实现上收至 framework/crypto/symmetric.js（notice 复用，避免两份实现）
 */
import { encryptSecret, decryptSecret, maskSecret, isMasked } from '../../../framework/crypto/symmetric.js';

export { encryptSecret, decryptSecret, maskSecret, isMasked };
