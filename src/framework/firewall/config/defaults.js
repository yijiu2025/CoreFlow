/**
 * 防火墙默认策略（兼容转发 —— 配置值已迁到 src/config/firewall_config.js）
 *
 * 分层（2026-11-03 起）：
 *   - **配置值** → `src/config/firewall_config.js`（叶子模块，零 import，开发者找配置只看 src/config/）
 *   - **配置机制** → 本目录（deepMerge / firewall_config.json 持久化 / reader 注册）
 * 依赖方向单向：framework → src/config，永不反向（守护测试见 src/__tests__/config-leaf.test.js）。
 *
 * 本文件只做 re-export，保留旧 import 路径不破坏既有调用方；
 * 需要默认值请直接从 `src/config/firewall_config.js` 引入。
 *
 * @author yijiu2025
 * @since 2026-11-02（自 app/firewall/config/config.js 迁入）；2026-11-03 拆出配置值
 */

export { DEFAULT_SECURITY_SETTINGS } from '../../../config/firewall_config.js';
