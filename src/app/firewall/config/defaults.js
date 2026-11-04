/**
 * Firewall **应用层**默认配置（面板展示 / 节点定位 —— app 概念，不是防护策略）
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么单独一层（2026-11-04）
 * ════════════════════════════════════════════════════════════════════
 * `securitySettings` 是**一个**持久化对象（`src/data/firewall_config.json`），
 * 里面混了两类东西：
 *   ① 防护策略 —— core 在请求链路上读（`defense.*`）；
 *   ② 控制台展示 —— 只有 firewall 前端 + 本应用 dao 读
 *      （`showTrajectory`：地图是否画访问轨迹；`activeIpApi`：节点 IP 用哪个公网 API）。
 * 它们此前都写在 `framework/firewall/config/defaults.js` —— 于是一个纯 UI 开关
 * 成了「防护核心的保底默认值」，卸载 firewall app 后仍然存在，改名还得改 core。
 * 现在 ② 归本文件，`framework` 只保留 ①。
 *
 * ════════════════════════════════════════════════════════════════════
 * 合并顺序（见 ./config.js）
 * ════════════════════════════════════════════════════════════════════
 *   core 默认（含 src/config 静态覆盖） ← 本文件 ← 磁盘 JSON
 * 方向是「core 打底、app 补自己的键」：`deepMerge(CORE, APP)`。app 的键在 core 里
 * 根本不存在，所以不存在「谁覆盖谁」的歧义；万一 core 侧出现同名键，app 的这层仍
 * 生效，并由 config.js 的 strayAppKeys 打一条 warn（不允许静默失效）。
 *
 * ⚠️ 持久化 schema 不变：这两个键依旧在 `securitySettings` 顶层，
 * 面板与存量 JSON 无需迁移。
 *
 * @author yijiu2025
 * @since 2026-11-04
 */

/** 公网 IP 归属查询数据源（面板「当前节点 IP」展示用）：sohu | ipinfo | ipapi | baidu */
const ACTIVE_IP_API = 'sohu';

/** 面板是否展示访问轨迹（省份热力图） */
const SHOW_TRAJECTORY = true;

const DEFAULT_APP_SETTINGS = {
  activeIpApi: ACTIVE_IP_API,
  showTrajectory: SHOW_TRAJECTORY
};

export { DEFAULT_APP_SETTINGS };
