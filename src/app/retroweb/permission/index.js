/**
 * RetroWeb 权限常量定义（PBAC）
 *
 * 🔴 判定一律用**权限点**，不要写死角色码：权限可单独授予、可在管理后台勾选，
 *    角色只是"打包"。写死角色码会让"给某个用户单独加配额"变成改代码。
 *
 * 分组：任务 / 路线方案 / 算法任务 / 大模型端点 / 配额 / 管理。
 *
 * @since 2026-10-09
 */
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

const RETROWEB_PERMISSIONS = createPermissionRegistry('retroweb', 'RetroWeb 逆合成工作台', {
  // A. 任务
  TASK: {
    READ: { code: 'retroweb:task:read', label: '查看自己的任务', type: 'read' },
    CREATE: { code: 'retroweb:task:create', label: '新建任务', type: 'write' },
    UPDATE: { code: 'retroweb:task:update', label: '编辑自己的任务', type: 'write' },
    DELETE: { code: 'retroweb:task:delete', label: '删除自己的任务', type: 'write' },
    IMPORT: { code: 'retroweb:task:import', label: '导入本地任务', type: 'write' },
    EXPORT: { code: 'retroweb:task:export', label: '导出任务', type: 'read' }
  },

  // B. 路线方案
  SCHEME: {
    READ: { code: 'retroweb:scheme:read', label: '查看路线方案', type: 'read' },
    CREATE: { code: 'retroweb:scheme:create', label: '保存路线方案', type: 'write' },
    UPDATE: { code: 'retroweb:scheme:update', label: '修改路线方案', type: 'write' },
    DELETE: { code: 'retroweb:scheme:delete', label: '删除路线方案', type: 'write' }
  },

  // C. 算法任务（占算力的入口，单独一组以便限流）
  JOB: {
    SUBMIT: { code: 'retroweb:job:submit', label: '提交预测/搜索任务', type: 'write' },
    READ: { code: 'retroweb:job:read', label: '查看任务进度与结果', type: 'read' },
    CANCEL: { code: 'retroweb:job:cancel', label: '取消进行中的任务', type: 'write' }
  },

  // D. 大模型端点配置（涉及密钥，高风险）
  LLM: {
    CONFIG: { code: 'retroweb:llm:config', label: '配置自己的大模型端点与密钥', type: 'high_risk' },
    USE: { code: 'retroweb:llm:use', label: '使用 AI 工艺分析', type: 'write' }
  },

  // E. 配额权益（🔴 会员判定依据，见 services/quota.service.js）
  QUOTA: {
    MEMBER: { code: 'retroweb:quota:member', label: '会员配额（任务上限 50 个）', type: 'read' }
  },

  // F. 管理
  ADMIN: {
    TASK_ANY: { code: 'retroweb:admin:task_any', label: '查看并管理他人任务', type: 'high_risk' },
    /**
     * 配置**本部署启用哪些模型**（走 Node 中转时的模型启用清单）。
     *
     * 🔴 为什么是管理权限而不是普通功能：模型服务是**部署级共享资源**（占显存 / 内存、
     *    起一个要 40~90 秒），"能用哪些模型"是运维决策，不该由每个用户各自决定。
     *    走 Node 中转后前端**不再负责启停模型**（见 `docs/plan-node-backend.md` §6.7/§6.8），
     *    改由持本权限的人在管理侧配置启用清单；普通用户只看到"哪些可用"。
     *
     * ⚠️ 判定一律用本权限码，**不要写死 `superadmin`** —— 权限可单独授予，
     *    写死角色码会让"给某个用户单独放行"变成改代码（见本文件头部）。
     */
    MODEL: { code: 'retroweb:admin:model', label: '配置启用哪些模型', type: 'high_risk' }
  }
});

export { RETROWEB_PERMISSIONS };
export default RETROWEB_PERMISSIONS;
