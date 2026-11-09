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

## 主题（与 oauth21 同构）

```
src/theme/
  theme.config.ts                        主题域清单（调试面板档位 ?debug=theme）
  palette.ts                             色值单一来源（8 个壳文件只声明 meta/tone 并展开它）
  themes/default/                        主题包（目录名 default = 库内置兜底包名）
    index.ts                             包定义（设计名放 meta.name：珍珠玻璃）
    <设备>/<页面>/colors/<配色>/index.ts  设备 standard|mobile × 页面 console|login × 配色 white|black
  views/console.ts · views/login.ts      页面域声明（defineThemePage）
src/view/devices.ts                      设备词汇（宿主事实，不 import 主题库）
src/view/useRenderDevice.ts              设备判定（?device= 优先，否则视口 ≤ 820px）
```

- 明暗 = 配色系别：`white`（浅）/ `black`（深）；`mode` 仍是用户偏好（system/light/dark），
  由 `createThemeState` 维护、持久化在 `mauth:mode` / `mauth:theme`。
- 壳层用 `<ThemeScope page="console" :device>`：**token-only**，只锚定「包 × 设备 × 页面」，
  不渲染版式组件 —— console 只有一套设计，页面之间换的是业务内容而不是 DOM。
- 颜色变量一律 `--mauth-*`（skinsuite 注入白名单要求）；阴影 / 字体栈 / 结构尺寸
  是复合值或布局骨架，留在 `src/assets/styles/tokens.css`，不进主题 token。
- 要「同一壳换一套 DOM」：新建主题包（`themes/<包>/`）并在包定义声明 `views.console`，
  **不要**在 AppShell 里写 `if (pkg === …)`。

调试：`?debug=theme` 打开面板；`?th_color=black` 强制深色；`?device=mobile` 锁定手机版。

## 与后端的分工

- 菜单只决定**侧栏可见性**（`/session/routes`）；接口放行由后端 PBAC policy 判定。
- 前端 `hasPermission()` / 按钮隐藏只是体验，**不是安全边界**。
- 列表统一 `{ rows, total, pageNum, pageSize }`；写操作失败直接展示后端 `message`。

## 已知边界

- 代码生成（`/tool/generator`）为二期占位：参考项目生成的是 Java，本仓模板需整套重写。
- 移动端只保证登录、工作台、列表类页面的可用性；图谱类版式（溯源 / 星图 / 阶梯）待补。
- 未接 i18n：参考项目的文案是硬编码中文，本仓一期同样只用中文。
