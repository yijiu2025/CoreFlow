/**
 * 通知应用配置
 * 供 loader 扫描时读取
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
const noticeConfig = {
  app_id: 'notice',
  name: '通知中心',
  description: '统一通知服务中心，负责邮件、钉钉、微信等多种通道的配置与下发',

  /**
   * 默认角色：**显式不自动授予**
   *
   * 本应用只有一个 `notice_admin`(rank 60)，任何"默认角色"都等于把管理员发给
   * 每个授权者。写 `null`（而不是省略）是为了让启动期审计知道这是**有意为之**，
   * 不会每次都提示"未声明默认角色，将回落为最低职级"。
   *
   * 🔴 不要把这行删成"没写"：没写 = 走兜底，兜底会因为 rank > 20 而跳过授予，
   *    同时每次启动刷一条 error，看起来像故障。
   */
  default_role: null
};

export default noticeConfig;
