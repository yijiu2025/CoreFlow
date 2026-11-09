# 管理脚手架（Console）需求文档

> 状态：待确认（v0.1，2026-11-09）
> 参考实现：`wbr664393425-lgtm/scaffold-master`（`scaffold-vue` 珍珠玻璃前端 + `scaffold-system` Java 后端）
> 本仓落点：新增前端 `scaffold/`，后端扩 `admin` 域，登录走 oauth21 iframe

## 1. 产品定位

- **一句话**：把本仓后端包装成一套「开箱即用的通用后台脚手架」——自带珍珠玻璃视觉、多主题多端、设备身份、SSO 登录、完整系统管理（用户/角色/菜单/部门/岗位/字典/参数/日志/生成器）。
- **目标用户**：拿本仓当底座做二次开发的自己人；以及需要一套能直接上线跑的后台管理界面的项目。
- **核心价值**：视觉与交互直接对标成熟商业后台（参考项目），但底层完全复用本仓已有的安全体系（PBAC + 会话 + 风控 + 防火墙 + 设备身份 + 结构化日志），不引入 Java 那一套。

## 2. 功能清单

参考项目的功能**全量对标**，逐项映射到本仓能力：

| # | 功能 | 参考实现 | 本仓现状 | 处理方式 |
| --- | --- | --- | --- | --- |
| F1 | SSO 登录（iframe） | `Login.vue`（自建账号密码 + 验证码） | oauth21 `/mini-login` + `bind-session`；firewall `LoginModal` 已有成熟协议 | **替换**：不抄账号密码页，改为 iframe 嵌 oauth21，复用 origin+source 双校验 / `SSO_READY` / `LOGIN_SUCCESS` / `adoptDeviceId` |
| F2 | 动态路由与菜单权限 | `/auth/routes` 下发菜单 → 注册路由 | 无菜单表 | **新建** `sys_menu` + `sys_role_menu`，按角色下发菜单树 |
| F3 | 工作台 | 主次布局 + 读数 + 趋势 + 泳道 + 最近登录 | 无聚合接口 | **新建** `GET /console/v1/dashboard/summary` |
| F4 | 用户管理（列表 / 看板 / 状态 / 重置密码 / 导出） | `views/system/Users.vue` | `User` 模型 + `/admin/user/v1/list`（仅列表） | **扩写**：分页筛选、状态、重置密码、批量、导出 |
| F5 | 角色管理（列表 / 权限矩阵 / 溯源图谱） | `Roles.vue` | `Role` / `UserRole` / `Permission` / `InlinePolicy`（PBAC，含 `rank_level` / `app_id`） | **改造**：PBAC 语义 → 界面语言（角色 = 编码 + 职级 + 应用 + 策略 + 菜单授权） |
| F6 | 菜单管理（表格 / 导航星系 / 侧栏预览） | `Menus.vue` | 无 | **新建** |
| F7 | 部门管理（组织画布 / 表格） | `Depts.vue` | 无 | **新建**（`sys_dept`，含 `parent_id` / `ancestors`） |
| F8 | 岗位管理（列表 / 阶梯） | `Posts.vue` | 无 | **新建**（`sys_post` + `sys_user_post`） |
| F9 | 字典管理（表格 / 样本册） | `Dict.vue` | 无 | **新建**（`sys_dict_type` / `sys_dict_data`） |
| F10 | 参数管理（设置面板 / 表格） | `Configs.vue` | 运行期 `data/*.json` 已有配置体系 | **新建** `sys_config` 表，与 `data/*.json` 分工见 §4 风险 R2 |
| F11 | 操作日志（概览 / 趋势·泳道 / 明细） | `OperLog.vue` | `AuditLog` 模型 | **新建**聚合接口（stats / timeline / 明细 / 导出） |
| F12 | 登录日志（概览 / 趋势·热力 / 异常 / 明细） | `LoginLog.vue` | `SessionLog` 模型 | **新建**聚合接口（stats / heatmap 7×24 / 异常聚合） |
| F13 | 代码生成（三步流水线） | `Generator.vue` | 无 | **重写**：Java 模板 → Node/Sequelize/Vue 模板（工作量最大，见 §4 风险 R3） |
| F14 | 命令面板 + 本地问答 | `CommandPalette.vue` / `ask.ts` | 无 | **移植**（纯前端规则引擎，无后端依赖） |
| F15 | 外观设置（浅/深/跟随 + 密度） | `appearance.ts` | skinsuite 已管明暗 + 配色 | **改接**：`appearance.ts` → skinsuite `createThemeState`，密度保留 |
| F16 | 设备身份 | 无 | `stable-deviceid`（全前端强制） | **接入**：`initDeviceSync` + `setupDeviceSync(http)` + SSO 后 `adoptDeviceId` |
| F17 | 防火墙监控（本仓独有） | 无 | `src/api/firewall` 已有 metrics/monitor/summary | **新增页面**：把防火墙前端的能力搬进 console（仪表盘卡 + 黑名单/白名单入口） |

## 3. 页面规划

路由前缀 `/console`（前端 base 亦为 `/console/`），端口 **5175**（5173 firewall / 5174 oauth21+admin / 5176 posecraft / 5177 retroweb 已占）。

| 路由 | 页面 | 用途 | 视图形态 |
| --- | --- | --- | --- |
| `/login` | 登录 | iframe 嵌 oauth21 `/mini-login`，握手成功后 bind-session | 全幅画布 + 右侧说明面板 |
| `/dashboard` | 工作台 | 系统读数、趋势、当日操作泳道、最近登录、常用入口 | 主次布局 |
| `/system/user` | 用户 | 增删改查、状态、重置密码、导出 | 表格 / 看板 |
| `/system/role` | 角色 | 角色维护、权限矩阵、权限溯源 | 表格 / 矩阵 / 图谱舞台 |
| `/system/menu` | 菜单 | 菜单树维护、侧栏预览 | 表格 / 星图 |
| `/system/dept` | 部门 | 组织架构维护 | 表格 / 组织画布 |
| `/system/post` | 岗位 | 岗位维护、在岗成员 | 表格 / 阶梯 |
| `/system/dict` | 字典 | 类型 + 数据两级维护 | 表格 / 样本册 |
| `/system/config` | 参数 | 键值参数维护 | 面板 / 表格 |
| `/monitor/oper-log` | 操作日志 | 概览 + 趋势/泳道 + 明细 + 导出 | 横带分层 |
| `/monitor/login-log` | 登录日志 | 概览 + 趋势/热力 + 异常 + 明细 | 横带分层 |
| `/tool/generator` | 代码生成 | 选表 → 字段映射 → 预览/下载 | 三步抽屉流水线 |
| `/no-access` `/404` | 无权限 / 未找到 | 兜底 | 简单页 |

移动端（`mobile` 设备）首期只保证：登录、工作台、用户/角色/日志的只读视图；图谱类版式在窄屏降级为表格（与参考项目 820px 断点一致）。

## 4. 数据模型（新增表）

沿用本仓约定：`underscored: true`、`created_at/updated_at`、`paranoid` + `delete_version`（与 `iam_role` 同款软删除安全方案）、表名前缀 `sys_`（与 `iam_*` 区分）。

### 4.1 新增 8 张表

**① `sys_menu` —— 菜单 / 按钮**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BIGINT PK AI | |
| `parent_id` | BIGINT DEFAULT 0 | 0 = 根节点 |
| `name` | VARCHAR(50) NOT NULL | 菜单名 |
| `type` | ENUM('dir','menu','btn') | 目录 / 页面 / 按钮 |
| `icon` | VARCHAR(64) NULL | lucide 图标名 |
| `path` | VARCHAR(200) NULL | 前端路由（`dir`/`menu` 有值） |
| `component` | VARCHAR(200) NULL | 视图键（映射到前端页面注册表） |
| `permission` | VARCHAR(100) NULL | 权限码（`admin:user:create`），`btn` 必填 |
| `sort` | INT DEFAULT 0 | |
| `visible` | TINYINT DEFAULT 1 | 是否在侧栏显示 |
| `status` | TINYINT DEFAULT 1 | 1 启用 / 0 停用 |
| `created_at` / `updated_at` | DATETIME | |

索引：`idx_parent(parent_id)`、`idx_type_status(type,status)`、`idx_permission(permission)`。

**② `sys_role_menu` —— 角色菜单授权**

`role_id` BIGINT、`menu_id` BIGINT，联合主键；`idx_menu(menu_id)`。仅表达「看得见什么」，**不承载接口放行**（见风险 R1）。

**③ `sys_dept` —— 部门**

`id`、`parent_id`（0=根）、`ancestors` VARCHAR(500)（`0,1,3` 上级链，避免递归查询）、`name` VARCHAR(50)、`leader` VARCHAR(50)、`phone` VARCHAR(20)、`email` VARCHAR(100)、`sort` INT、`status` TINYINT。索引：`idx_parent(parent_id)`、`idx_ancestors(ancestors)`。

**④ `sys_post` —— 岗位**

`id`、`post_code` VARCHAR(50) UNIQUE、`post_name` VARCHAR(50)、`sort` INT、`status` TINYINT、`remark` VARCHAR(255)。

**⑤ `sys_user_post` —— 用户岗位**

`user_id` BIGINT、`post_id` BIGINT，联合主键；`idx_post(post_id)`。用户 ↔ 岗位多对多（不进 `user_user`，避免污染认证主表）。

**⑥ `sys_dict_type` —— 字典类型**

`id`、`dict_name` VARCHAR(100)、`dict_type` VARCHAR(100) UNIQUE、`status` TINYINT、`remark` VARCHAR(255)。

**⑦ `sys_dict_data` —— 字典项**

`id`、`dict_type` VARCHAR(100)（索引）、`label` VARCHAR(100)、`value` VARCHAR(100)、`sort` INT、`status` TINYINT、`tone` VARCHAR(20)（前端标签色调：`cat-1`~`cat-5`）、`is_default` TINYINT、`remark` VARCHAR(255)。唯一键 `uk_type_value(dict_type,value)`。

**⑧ `sys_config` —— 参数**

`id`、`config_key` VARCHAR(100) UNIQUE、`config_value` TEXT、`type` CHAR(1)（`Y` 内置 / `N` 业务）、`builtin` TINYINT、`remark` VARCHAR(255)。**只放业务参数**，运行期配置仍归 `data/*.json`（风险 R2）。

### 4.2 对既有表的唯一改动

`user_user` 增列 `dept_id BIGINT NULL` + `idx_dept(dept_id)`（迁移为**可空新增列**，对存量数据零影响；不加外键约束，沿用本仓「不加 FK、由服务层保证」的口径）。

### 4.3 复用的既有表

`user_user` / `iam_role` / `iam_user_role` / `permissions` / `iam_inline_policy`、`audit_logs`（操作日志）、`session_logs`（登录日志）、`session_tokens`（在线会话）。

**风险 R1（必须先定）**：本仓权限是 **PBAC**（`app_id` + `rank_level` + policy statement），参考项目是 **RBAC + menuIds**。两者不能混用一套语义。方案：**菜单授权独立成表**（`sys_role_menu`），PBAC 继续管接口级 allow/deny，菜单只管「看得见什么」。禁止把菜单塞进 policy statement。

**风险 R2**：参数管理若允许改 `data/*.json` 里的运行期配置，会与「配置优先级：`data/*.json` > `src/config`」冲突，且没有事务保证。方案：`sys_config` 只放业务参数，运行期配置另开只读展示页（或 P2 再做）。

**风险 R3**：代码生成器在参考项目里生成 Java（Controller/Service/Mapper/XML/菜单 SQL）。本仓是 Fastify + Sequelize + Vue，模板要整套重写，且生成物必须符合本仓强制约定（export 收拢末尾、`registerSecureRoute`、DAO/Service 分层、`src/app/<A>` 禁跨模块 import）。**建议 P2，先交付其余功能。**

## 5. API 接口（新增，前缀 `/admin/console/v1`）

响应统一 `{ code, message, data }`（`reply.result.success`）；列表统一 `{ rows, total, pageNum, pageSize }`（对齐参考前端 `PageResult`，减少前端改动）；写接口全部落 `AuditLog`。

### 5.1 会话与路由（4）

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/session/me` | 登录即可 | 当前用户 + 角色 + 扁平权限码数组 + 数据范围 |
| GET | `/session/routes` | 登录即可 | 当前用户可见菜单树（`dir`/`menu`，含 `btn` 权限码） |
| PUT | `/session/password` | 登录即可 | 修改本人密码 |
| POST | `/session/logout` | 登录即可 | 清 Cookie + 注销会话 |

### 5.2 工作台（1）

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/dashboard/summary` | `admin:dashboard:read` | 用户/角色/菜单/部门计数、今日登录与失败、今日操作与成功率、7 日趋势、最近登录 5 条 |

### 5.3 用户（8）

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/users` | `admin:user:read` |
| GET | `/users/options` | `admin:user:read` |
| POST | `/users` | `admin:user:create` |
| PUT | `/users/:id` | `admin:user:update` |
| DELETE | `/users/:id` | `admin:user:delete` |
| PUT | `/users/:id/status` | `admin:user:update` |
| PUT | `/users/:id/password` | `admin:user:update` |
| GET | `/users/export` | `admin:user:read` |

### 5.4 角色与权限（7）

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/roles` | `admin:role:read` |
| POST | `/roles` | `admin:role:create` |
| PUT | `/roles/:id` | `admin:role:update` |
| DELETE | `/roles/:id` | `admin:role:delete` |
| GET | `/roles/:id/menus` | `admin:role:read` |
| PUT | `/roles/:id/menus` | `admin:role:update` |
| GET | `/permissions/graph` | `admin:role:read` |

### 5.5 菜单（5）

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/menus/tree` | `admin:menu:read` |
| POST | `/menus` | `admin:menu:create` |
| PUT | `/menus/:id` | `admin:menu:update` |
| DELETE | `/menus/:id` | `admin:menu:delete` |
| GET | `/menus/export` | `admin:menu:read` |

### 5.6 部门（5）

`GET /depts/tree`（list）、`GET /depts/options`（list）、`POST /depts`（add）、`PUT /depts/:id`（edit）、`DELETE /depts/:id`（remove）。

### 5.7 岗位（5）

`GET /posts`（list）、`POST /posts`（add）、`PUT /posts/:id`（edit）、`DELETE /posts/:id`（remove）、`GET /posts/:id/users`（list，在岗成员）。

### 5.8 字典（8）

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/dict/types` | `admin:dict:read` |
| POST | `/dict/types` | `admin:dict:create` |
| PUT | `/dict/types/:id` | `admin:dict:update` |
| DELETE | `/dict/types/:id` | `admin:dict:delete` |
| GET | `/dict/data/:type` | `admin:dict:read` |
| POST | `/dict/data` | `admin:dict:create` |
| PUT | `/dict/data/:id` | `admin:dict:update` |
| DELETE | `/dict/data/:id` | `admin:dict:delete` |
| GET | `/dict/options/:type` | 登录即可（业务下拉，只返回启用项） |

### 5.9 参数（4）

`GET /configs`（list）、`POST /configs`（add）、`PUT /configs/:id`（edit）、`DELETE /configs/:id`（remove，内置项禁删）。

### 5.10 操作日志（6，数据源 `audit_logs`）

| 方法 | 路径 | 权限码 |
| --- | --- | --- |
| GET | `/oper-logs` | `admin:log:read` |
| GET | `/oper-logs/stats?range=24h\|7d\|30d` | `admin:log:read` |
| GET | `/oper-logs/timeline?date=` | `admin:log:read` |
| GET | `/oper-logs/export` | `admin:log:read` |
| DELETE | `/oper-logs/:id` | `admin:log:remove` |
| DELETE | `/oper-logs` | `admin:log:remove` |

### 5.11 登录日志（6，数据源 `session_logs`）

`GET /login-logs`、`/stats`、`/heatmap?days=7|30`、`/export`（list）、`DELETE /login-logs/:id`、`DELETE /login-logs`（remove）。

### 5.12 防火墙只读（3）

`GET /firewall/summary`、`GET /firewall/blocks`、`GET /firewall/whitelist` —— 权限码 `admin:firewall:read`，内部转调既有 `src/api/firewall` 的 service，不重复实现。

### 5.13 代码生成（7，二期）

`GET /gen/tables`、`GET /gen/tables/importable`、`POST /gen/tables/import`、`PUT /gen/tables/:id`、`GET /gen/tables/:id/columns`、`GET /gen/tables/:id/preview`、`POST /gen/tables/:id/generate` —— 权限码 `admin:gen:read`。

**合计**：一期 62 个端点（5.1–5.12），二期 7 个（5.13）。

## 6. 数据来源

- 全部来自本仓 MySQL（Sequelize）+ Redis（会话 / 缓存）+ `data/*.json`（运行期配置，只读展示）。
- 登录态：oauth21 下发 `session_token` → console 调 `/auth/v1/bind-session` 换 `sid/sid_r` HttpOnly Cookie → 后续请求带 Cookie（`withCredentials`）。
- 设备身份：`stable-deviceid` 自动注入 `x-device-id`，SSO 成功后先 `adoptDeviceId` 再 bind-session（顺序不可颠倒）。
- 无任何 mock 数据。

## 7. 权限设计

| 角色 | 权限 |
| --- | --- |
| `superadmin` | 全部放行（既有机制） |
| `admin_admin` | 系统管理 + 日志 + 生成器全量 |
| `admin_operator` | 用户/角色/部门/岗位的读写；日志只读 |
| `admin_viewer` | 全部只读 |

权限码（新增，挂 `ADMIN_PERMISSIONS`）：
`system:user:{list,add,edit,remove,resetPwd}`、`system:role:*`、`system:menu:*`、`system:dept:*`、`system:post:*`、`system:dict:*`、`system:config:*`、`monitor:operlog:{list,remove}`、`monitor:loginlog:{list,remove}`、`admin:gen:read`、`admin:firewall:read`。

前端 `PermissionButton` + `v-permission` 只做「看不见」，后端 `allowPermissions` 才是真校验（与参考项目一致）。

## 8. 视觉与主题落地方案

参考项目的「珍珠玻璃」是一套完整设计语言（`DESIGN.md` + 七层 CSS + 仪器化图表 + GSAP 动效），**不整体搬 CSS，而是拆成三层落进 skinsuite**：

1. **token 层** → `scaffold/src/theme/themes/pearl/<device>/<page>/colors/{light,dark}/theme.scss`
   把 `tokens.css` 的 `--ink / --blue / --r-* / --e* / --cat-* / --graph-*` 等改名为 `--mauth-*`（外部注入白名单要求；主题包自身 SCSS 不受限，但统一前缀便于后端下发）。
2. **材质与组件层** → `scaffold/src/assets/styles/{base,materials,components,instruments,layout,pages}.css`（构建期受信代码，保留原类名，减少移植成本）。
3. **动效层** → `composables/motion.ts`（GSAP 配方）+ `composables/neural.ts`（Canvas 绘制件），保留原实现与性能红线（DPR ≤ 2、离屏暂停、每帧 try/catch）。

主题包命名 `pearl`，配色 `light` / `dark`；`dark` 用 `@custom-variant`/`.dark` 前缀（本仓 Tailwind v4 约定）。设备维度 `standard` / `mobile` 两套，`mini`/`tablet` 首期不建（参考项目也只有桌面断点）。

## 9. 任务拆解（按 skill 固定执行顺序）

| 阶段 | 任务 | 产出 |
| --- | --- | --- |
| P0-1 | 需求确认（本文档 + 4 个决策点） | 本文档 v1.0 |
| P0-2 | 创建 KX 架构文件 | `架构文件/console.kx` |
| P1-1 | 后端：8 张新表迁移 + 模型 + 种子数据 | `migrations/console/*`、`src/models/console/*` |
| P1-2 | 后端：`src/app/console`（DAO / Service / 权限注册） | 服务层 |
| P1-3 | 后端：`src/api/admin/console/v1/*` 路由 + `system.json` 分组 | 接口 |
| P1-4 | **curl 验证**全部接口（状态码 + 结构 + 边界） | 验证记录 |
| P2-1 | 前端骨架：`main.ts` 门牌 + `bootstrap.ts` 编排 + vite（主题插件/别名/设备库/端口 5175） | 可启动 |
| P2-2 | 主题包 `pearl`（light/dark）+ 七层样式 + `ThemeRoot/ThemeView` 接线 | 视觉基线 |
| P2-3 | 登录页：iframe SSO（复用 firewall 协议）+ 会话/设备身份 | 能登进来 |
| P2-4 | 外壳：AppShell / Sidebar / Topbar / 命令面板 / 外观设置 | 框架 |
| P2-5 | 公共件：ListPage / FormDialog / DataTable / 仪器化组件 / 图表（SVG） | 组件库 |
| P3 | 业务页：工作台 → 用户 → 角色 → 菜单 → 部门 → 岗位 → 字典 → 参数 → 两类日志 | 页面 |
| P4 | 防火墙只读监控页 + 代码生成器（P2 优先级） | 增强 |
| P5 | 全链路验证（真实登录 + 真实数据 + 权限分支 + 窄屏/暗色）+ 文档 + 提交 | 交付 |

**约束**：单文件 ≤ 1000 行；UI 禁 emoji（图标用 `lucide-vue-next`）；每函数中文注释；`src/app/<A>` 禁 import `src/app/<B>`；行尾 LF。

## 10. 免责声明

本文档基于对参考仓库与本仓代码的静态分析整理，仅供参考；实际实施需结合运行环境（数据库版本、Redis、oauth21 部署地址）确认。
