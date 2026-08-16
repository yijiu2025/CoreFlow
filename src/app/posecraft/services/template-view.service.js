/**
 * PoseCraft 模板视图服务
 *
 * 从 api/posecraft/v1/template.js 的 getTemplate handler 下沉：
 * pose_data / image_url / thumbnail_url 的可见度控制（机密信息保护）。
 *
 * 规则：
 * - camera=true 且有权限（创建者/管理员/持有 read|premium|purchase）→ 只返回 pose_data，剥离底图
 * - 其它情况 → 剥离 pose_data 骨骼明文，只返回渲染图
 *
 * @author yijiu
 * @since 2026-08-16
 */

/** 持有任一即视为可读 pose_data 的权限 */
const POSE_DATA_PRIVILEGES = ['posecraft:work:read', 'posecraft:vip:premium_templates', 'posecraft:template:purchase'];

/**
 * 按 camera 参数与权限剥离模板的机密字段（就地修改 template 模型实例）
 * @param {object} template - Sequelize 模板模型实例
 * @param {object} [user] - 当前登录用户（session 用户对象）
 * @param {boolean} isAdmin - 是否管理员
 * @param {boolean} camera - 是否辅助拍照场景
 */
export function applyPoseDataVisibility(template, user, isAdmin, camera) {
  const isCreator = template.user_id === user?.userId;
  const hasPrivilege = user?.permissions?.allows?.some(p => POSE_DATA_PRIVILEGES.includes(p));
  const isAuthorized = isCreator || isAdmin || hasPrivilege;

  if (camera && isAuthorized) {
    // 辅助拍照且有权限：只返回 pose_data 纯模板数据，剥离底图
    template.setDataValue('image_url', undefined);
    template.setDataValue('thumbnail_url', undefined);
  } else {
    // 其它情况：不返回 pose_data 骨骼明文，只能加载渲染图
    template.setDataValue('pose_data', undefined);
  }
}
