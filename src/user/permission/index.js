/**
 * 用户应用域 (User Domain) 权限字典常量
 * 
 * 规范：必须遵循 `domain:resource:action` 的三段式命名。
 */
export const USER_PERMISSIONS = {
  // 基础操作 (所有登录用户都应有)
  BASE: {
    READ: 'user:base:read',    // 查看基础资料
    WRITE: 'user:base:write',  // 修改基础资料 (昵称/头像)
  },
  
  // VIP 专属操作
  VIP: {
    PREMIUM_FEATURE: 'user:vip:feature', // 访问专属高级功能
  },
  
  // 管理员高危操作
  ADMIN: {
    ALL: 'user:admin:*',       // 通配符：管理员全量权限
    BAN: 'user:admin:ban',     // 封禁用户
    ROLE: 'user:admin:role',   // 分配权限角色
  }
};

export default USER_PERMISSIONS;
