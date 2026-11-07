/**
 * 面板层配置（firewall 控制台的展示偏好）—— **不是防护策略**
 *
 * ════════════════════════════════════════════════════════════════════
 * 三层边界（改配置前先确认自己在哪一层）
 * ════════════════════════════════════════════════════════════════════
 *   ① 核心层      framework/ingress/firewall/config/defaults.js
 *                 防护策略（`defense.*`），每个请求都在读。面板配的限频 / 挑战 /
 *                 地理围栏阈值都属这层（面板只是它的编辑界面，不是它的所有者）。
 *   ② 服务器后端层  src/config/firewall_config.js
 *                 部署时对核心策略的静态覆盖（只写要改的键）。core 在 05-firewall
 *                 阶段就要读它，因此它必须留在 src/config，**不能**下沉到 app。
 *   ③ 面板层     本文件
 *                 面板自己才关心的展示偏好：地图画不画轨迹、节点 IP 用哪个公网 API。
 *                 防护核心零读取，只有 firewall 前端与本 app 的 dao 用。
 *
 * 判据：`grep -rn "defense\.<key>" src/framework/firewall` 为空、且只有前端 / dao 读
 * ⇒ 该键属于面板层，写在这里；否则属于核心层。
 *
 * ════════════════════════════════════════════════════════════════════
 * 合并顺序（见 ./config.js）
 * ════════════════════════════════════════════════════════════════════
 *   core 默认（含 src/config 静态覆盖） ← 本文件 ← 磁盘 JSON
 * `deepMerge(core, panel)`：core 打底，本文件只补自己那两个键。core 侧即便出现同名键
 * 也不会覆盖面板值，并由 config.js 的 strayAppKeys 打一条 warn 留痕（不做静默失效）。
 *
 * ⚠️ 持久化 schema 不变：这两个键依旧在 `securitySettings` 顶层
 * （面板与存量 `data/firewall_config.json` 无需迁移）。
 *
 * @author yijiu2025
 * @since 2026-11-04（从 core 默认值下沉到面板层）
 */

/** 公网 IP 归属查询数据源（面板「当前节点 IP」展示用）：sohu | ipinfo | ipapi | baidu */
const ACTIVE_IP_API = 'sohu';

/** 面板是否展示访问轨迹（省份热力图） */
const SHOW_TRAJECTORY = true;

const DEFAULT_PANEL_SETTINGS = {
  activeIpApi: ACTIVE_IP_API,
  showTrajectory: SHOW_TRAJECTORY
};

export { DEFAULT_PANEL_SETTINGS };
