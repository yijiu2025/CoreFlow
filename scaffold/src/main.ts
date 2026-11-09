/**
 * Console 入口文件（门牌）
 *
 * 🔴 只做两件事：**引样式** + **转交启动编排**（`./bootstrap`）。
 * 启动顺序（设备 ID 同步 → createApp → pinia → router → 主题域 → 路由就绪 → mount）
 * 全部在 bootstrap.ts，本文件刻意保持极简 —— 与 oauth21 / firewall / posecraft 同构。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import './assets/styles/main.css';

// 启动编排（顺序与决策记录见 bootstrap.ts）
import './bootstrap';
