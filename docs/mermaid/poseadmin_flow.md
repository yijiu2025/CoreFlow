# PoseAdmin 前端页面流转与交互关系图 (User Flow & Interactions)

本文件使用 Mermaid.js 拓扑连线图定义了 `poseadmin` (后台动作审核平台) 的页面管理流转与接口交互逻辑。

---

## 1. 全景页面连线图 (Flowchart)

```mermaid
flowchart TD
    %% 页面节点声明
    Layout[后台主框架 Layout]
    TemplatesAudit[模板动作审核页 TemplatesAudit.vue]
    WorksAudit[用户作品审核页 WorksAudit.vue]

    %% 交互连线与流转逻辑
    Layout -->|菜单导航: 模版审核| TemplatesAudit
    Layout -->|菜单导航: 作品审核| WorksAudit

    TemplatesAudit -->|点击 '审核通过' -> 调用接口| ApproveTemplate[POST /api/v1/admin/template/approve]
    TemplatesAudit -->|点击 '审核拒绝' -> 调用接口| RejectTemplate[POST /api/v1/admin/template/reject]

    WorksAudit -->|点击 '审核通过' -> 封禁/通过接口| ApproveWork[POST /api/v1/admin/work/approve]
    WorksAudit -->|点击 '下架作品' -> 触发下架接口| RevokeWork[POST /api/v1/admin/work/revoke]
```

---

## 2. 核心功能及交互提示 (Functional Tooltips)

- **模板动作审核页 (`TemplatesAudit.vue`)**：
  - _功能_：展示待上架的动作模板（包含预览骨骼图和特征参数），管理员可对其进行一键批量审核或驳回。
- **用户作品审核页 (`WorksAudit.vue`)**：
  - _功能_：列表加载社区用户公开发表的动作作品。当收到举报或检测到不合规动作时，管理员在此页进行强行下架或账号预警控制。
