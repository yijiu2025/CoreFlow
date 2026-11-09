# Console 管理后台（scaffold）

通用后台脚手架前端。视觉取自参考项目 `scaffold-master/scaffold-vue`（珍珠玻璃），
底层完全复用本仓的安全体系：oauth21 SSO、PBAC 权限、设备身份、审计日志。

## 启动

```bash
# 1. 后端（仓库根）
npm run dev

# 2. 本前端
cd scaffold
npm run dev          # http://localhost:5175（端口由 .env.development 的 VITE_PORT 决定）
```

首次启动前如缺依赖：`npm install --prefix scaffold`（本目录不在根 workspaces 内）。

## 环境变量（`.env.development`）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `VITE_PORT` | `5175` | 开发端口（`strictPort`，被占直接报错） |
| `VITE_API_TARGET` | `http://127.0.0.1:3000` | 后端地址，vite 代理 `/admin`、`/auth`、`/user` |
| `VITE_SSO_URL` | `http://localhost:5174` | oauth21 登录页地址（iframe SSO） |

> ⚠️ **端口冲突提醒**：`admin/` 与 `oauth21/` 的 vite 默认端口都是 5174。
> 若同时启动 admin 开发服务，iframe 会加载到错误的站点。此时改 `VITE_SSO_URL`
> 指向 oauth21 实际端口，或调整 admin 的端口。

## 登录链路

```
/login（iframe → oauth21 /mini-login）
  → 校验 origin + event.source
  → SSO_READY（关加载态）
  → LOGIN_SUCCESS → adoptDeviceId(deviceId)
  → POST /auth/v1/bind-session（换 sid/sid_r Cookie）
  → GET /admin/console/v1/session/me + /session/routes
  → 跳转 redirect 或 /dashboard
```

顺序不可颠倒：**先 `adoptDeviceId` 再 `bind-session`**，否则登录基准指纹与后续请求
不一致，会触发「设备环境变更」风控（403 + 人机验证）。

## 目录

```
src/
  main.ts            门牌（引样式 + 转交 bootstrap）
  bootstrap.ts       启动编排（设备同步 → pinia → router → 主题 → mount）
  api/               http（唯一出口）/ session / system / monitor / types
  stores/            auth（用户 + 可见菜单）/ theme（skinsuite 状态机）
  router/            静态路由 + 守卫（meta.permission）
  composables/       useSsoLogin（iframe 协议）/ useListPage（分页通用态）
  components/        layout/AppShell、ui/AppIcon
  views/             Login / Dashboard / Users / Roles / Menus / Depts / Posts / Dict / Configs / OperLog / LoginLog / Firewall / Generator
  assets/styles/     tokens → base → layout → components（顺序即层叠）
  theme/devices.ts   设备词汇（宿主事实）
```

## 主题

用 `skinsuite` 的 `createThemeState`（明暗三态 / 系统偏好 / 持久化 / URL 参数）
＋ `<ThemeRoot>`（`.dark` 类与底色）。**本前端不建 `themes/` 目录**：
只有一套设计（珍珠玻璃），配色直接落 `assets/styles/tokens.css`（`:root` / `.dark`）。

将来要加第二套设计：建 `src/theme/themes/<包>/…`、vite 挂 `themeAssets()`、
页面容器改 `<ThemeView>` —— 不要在 CSS 里手写 `[data-skin]` 分支（那会成为第二套真相）。

## 与后端的分工

- 菜单只决定**侧栏可见性**（`/session/routes`）；接口放行由后端 PBAC policy 判定。
- 前端 `hasPermission()` / 按钮隐藏只是体验，**不是安全边界**。
- 列表统一 `{ rows, total, pageNum, pageSize }`；写操作失败直接展示后端 `message`。

## 已知边界

- 代码生成（`/tool/generator`）为二期占位：参考项目生成的是 Java，本仓模板需整套重写。
- 移动端只保证登录、工作台、列表类页面的可用性；图谱类版式（溯源 / 星图 / 阶梯）待补。
- 未接 i18n：参考项目的文案是硬编码中文，本仓一期同样只用中文。
