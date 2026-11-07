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
 *                 部署时的静态覆盖：核心策略（`defense.*`）**与面板层键**都可以写，
 *                 写了的优先于本文件的内置默认。core 在 05-firewall 阶段就要读它，
 *                 因此它必须留在 src/config，**不能**下沉到 app。
 *   ③ 面板层     本文件
 *                 面板自己才关心的展示偏好的**内置默认值**：地图画不画轨迹、
 *                 节点 IP 用哪个公网 API。防护核心零读取，只有 firewall 前端与本 app 的 dao 用。
 *
 * 判据：`grep -rn "defense\.<key>" src/framework/firewall` 为空、且只有前端 / dao 读
 * ⇒ 该键属于面板层，写在这里；否则属于核心层。
 *
 * ════════════════════════════════════════════════════════════════════
 * 合并顺序（见 ./config.js）
 * ════════════════════════════════════════════════════════════════════
 *   本文件（内置默认） ← src/config 静态覆盖 ← 磁盘 JSON（运行期热改）
 *
 * 本文件只是**内置默认值**：`src/config/firewall_config.js` 里显式写了
 * `activeIpApi` / `showTrajectory` 就以那份为准（由 config.js 的
 * `applyPanelOverrides` 处理，并打一条 info 说明生效值）。
 * 判定依据：core 内置默认值只有 `defense.*`，面板层键出现在 core 侧
 * 只可能是用户显式覆盖，因此「用户写的优先」不会误伤内置默认。
 *
 * ⚠️ 持久化 schema 不变：这两个键依旧在 `securitySettings` 顶层
 * （面板与存量 `data/firewall_config.json` 无需迁移）。
 *
 * @author yijiu2025
 * @since 2026-11-04（从 core 默认值下沉到面板层）
 */

/**
 * 公网 IP 归属查询数据源（面板「当前节点 IP」展示用）：sohu | ipinfo | ipapi | baidu
 *
 * 为什么默认 ipinfo（2026-11-07 实测）：
 *   - `sohu`（pv.sohu.com/cityjson）对本机出口 IP 恒返回 `{"cip":"127.0.0.1","cid":"00","cname":"未知"}`
 *     —— 同一时刻纯 HTTP 的 ip-api.com 能正确返回真实出口 IP，说明是搜狐服务端判定失败，
 *     不是我们的请求/解析问题（curl 与 node fetch 结果一致，重复 3 次、HTTPS、带 XFF 都一样）。
 *   - `ipapi`（ipapi.co）被 Cloudflare 的 JS 挑战挡下，恒返回 403（带 UA 也一样）。
 *   - `baidu`（qifu-api.baidubce.com）该端点已 404。
 * 留着的另外三个仍可手动切换（面板热改优先于这里），只是不再是默认。
 */
const ACTIVE_IP_API = 'ipinfo';

/** 面板是否展示访问轨迹（省份热力图） */
const SHOW_TRAJECTORY = true;

const DEFAULT_PANEL_SETTINGS = {
  activeIpApi: ACTIVE_IP_API,
  showTrajectory: SHOW_TRAJECTORY
};

export { DEFAULT_PANEL_SETTINGS };
