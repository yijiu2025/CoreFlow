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
  components/        layout/AppShell（壳容器）、business/ 业务组件、ui/ 基础件
  views/             **只放业务**：取数 / 分页 / 校验 / 权限判定 / ctx 组装；
                     每页模板只剩一行 `<ThemeView page=… :device :ctx>`（0 行 scoped CSS）
  assets/styles/     tokens → base → layout → components（顺序即层叠）
  theme/devices.ts   设备词汇（宿主事实）
```

## 主题（与 oauth21 同构）

```
src/theme/
  theme.config.ts                        主题域清单（调试面板档位 ?debug=theme）
  themes/default/                        包 = **版式**（目录名 default = 库内置兜底包名）
    index.ts                             包定义（设计名放 meta.name：珍珠玻璃）
    <设备>/<页面>/index.vue              **页面 DOM 都在这里**（设备身份 = 目录位置）
    <设备>/<页面>/colors/<配色>/index.ts  **配色 = 一套完整色值表**（自带全部 token）
    <设备>/<页面>/colors/<配色>/theme.scss 该配色专属的额外 CSS（背景图只能放这里）
  themes/spotlight/                      极光（登录页是另一套布局，所以它是包）
  themes/pocket/                         口袋版（**只有手机端**，独立布局，后续打包 App）
  views/<页面>.ts                        页面域声明 + 版式契约（纯类型 ctx + defineThemePage）
```

### 包 = 版式，配色 = 搭配（与 oauth21 同一套判据）

| 想做的事 | 做法 | 反例 |
| --- | --- | --- |
| 换**布局**（结构、导航、交互） | **新建一个包** `themes/<新包>/` | 用配色目录装"另一套 DOM" |
| 换**颜色 / 圆角 / 背景图** | 在现有包里加一个配色目录 `colors/<id>/` | 为一种颜色新建包 |

所以：**桌面端的「灰白 + 绿」不是包**，是珍珠玻璃版式下的 `wechat` 配色
（`themes/default/standard/<页面>/colors/wechat/`）；**手机端的「导航栏 + TabBar + cell 列表」
才是包**（`themes/pocket/`，因为它换的是布局本身）。

现有配色（跨包同名，语义一致）：

| id | 名称 | 说明 |
| --- | --- | --- |
| `white` | 珍珠白 | 浅色，蓝主操作 |
| `black` | 石墨夜 | 深色，蓝主操作 |
| `wechat` | 微信绿 | 浅色，绿主操作（与珍珠同版式，只换色） |
| `wechat-dark` | 微信夜间绿 | 深色 + 品牌绿 |
| `star` | 星空 | 深蓝夜空，面板半透明（配「星空」背景效果最好） |

配色 id 的作用域是「包 × 设备 × 页面」：跨包同名互不影响（口袋版的 `white` 是绿系，
珍珠的 `white` 是蓝系）。每份 `index.ts` 都是**自包含**的完整表（基础层 + 组件层），
不 import 任何共享色表 —— 改一份只影响那一种搭配。

一页的四层：

```
views/system/Users.vue                业务容器（取数 / 判定 / 状态）
        │ ctx（= theme/views/users.ts 的 UsersViewContext）
        ▼
themes/<包>/<设备>/users/index.vue    版式（只渲染 ctx、只调 ctx 上的回调）
        ▲
        │ <ThemeView page="users" :device :ctx>（views/system/Users.vue 的模板就这一行）
```

🔴 内容页一律 `scope="inherit"`：配色记录是「包 × 设备 × **壳页**」声明的，内容页若按
默认的 `scope="page"` 锚定，`getThemeRecord` 查不到记录 ⇒ **token 层被清空**，
页面上所有 `--mauth-*` 变成「未定义」（表现是"样式突然全没了"，控制台只有一条
`[theme] … 没有任何配色记录` 的 warn）。独立页面（登录 / 授权 / 外壳 / 404）才用 `page`。

**版式里禁止**：`@/api/*` 请求、pinia 读写、权限判定、分页/校验逻辑。
权限已由容器算成 `can*` 布尔，分页已由 `useListPage` 算成 `list`，版式只显示结论。
换一套 UI = 在包里加个 `<设备>/<页面>/` 目录，容器零改动。
src/view/devices.ts                      设备词汇（宿主事实，不 import 主题库）
src/view/useRenderDevice.ts              设备判定（?device= 优先，否则视口 ≤ 820px）
```

- 明暗 = 配色系别：`white`（浅）/ `black`（深）；`mode` 仍是用户偏好（system/light/dark），
  由 `createThemeState` 维护、持久化在 `mauth:mode` / `mauth:theme`。
- **每份配色两层**：**基础层**（底色 / 文字四档 / 语义色 / 描边 / 圆角）与
  **组件层**（下面这一组）。想只改侧栏、只改标签、只改弹窗底色，动组件层那一行，
  别去动基础层 —— 基础层一动全站跟着变。
- **背景是独立一档，不与配色绑定**：`theme/backgrounds.ts` 定义有哪些壁纸，选中时给
  `<html>` 加 `data-mauth-bg`，样式在 `assets/styles/backgrounds.css`。壁纸是 `url()`，
  进不了 token（白名单只收单值），所以它走 CSS 而不是配色表 —— 同一套配色可配任意背景。
- 配色目录里的 `theme.scss` 仍然保留（oauth21 的 `blue`/`cyan` 用它画城市剪影），
  但**壁纸不要再写进这里**：写进去就又变成"想要壁纸必须选这套配色"。

| 组件层 token | 管什么 |
| --- | --- |
| `--mauth-nav-bg` / `--mauth-nav-ink` / `--mauth-nav-active-bg` | 侧栏底 / 未选中文字 / 选中项底色 |
| `--mauth-topbar-bg` | 顶栏底（默认半透明，叠在内容上） |
| `--mauth-panel-bg` / `--mauth-table-head-bg` / `--mauth-table-row-hover` | 卡片、表头、行悬停 |
| `--mauth-btn-bg` / `--mauth-input-bg` / `--mauth-modal-bg` / `--mauth-tabbar-bg` / `--mauth-tab-active-bg` | 按钮 / 输入框 / 弹窗 / 分段控件底 / 选中项 |
| `--mauth-tag-bg`·`-ink`、`--mauth-tag-ok-*`、`--mauth-tag-off-*`、`--mauth-tag-info-*` | 四类徽标（中性 / 成功 / 停用 / 信息） |

  想只改一处视觉（比如让侧栏比内容区更浅、让成功标签更淡），改对应表里的**那一行**即可；
  CSS 侧写的是 `var(--mauth-xxx, 兜底值)`，新配色漏写某一项也不会退化成透明。
- 壳层本身也是版式（`themes/<包>/<设备>/console/index.vue`）：`AppShell` 只准备
  `ConsoleViewContext`（导航分组 / 标题 / 返回 / 明暗），微信包的手机端因此能换成一整套
  导航栏 + 底部 TabBar，而 `AppShell` 里一行 `if (pkg === …)` 都没有。
- 颜色变量一律 `--mauth-*`（skinsuite 注入白名单要求）；阴影 / 字体栈 / 结构尺寸
  是复合值或布局骨架，留在 `src/assets/styles/tokens.css`，不进主题 token。
- 要「同一壳换一套 DOM」：新建主题包（`themes/<包>/`）并给该包建 `<设备>/console/` 目录，
  **不要**在 AppShell 里写 `if (pkg === …)`。
- 🔴 每台会被访问到的设备都要有目录：`<ThemeView>` 找不到版式时渲染空（不报错）。
  内容页的版式是**惰性 chunk**（`themeAssets({ eagerPages })` 只让 `login` / `console` 进首屏），
  所以入口体积不随页面数量增长。

调试：`?debug=theme` 打开面板；`?th_color=black` 强制深色；`?device=mobile` 锁定手机版。

## 外观：五维 + 密度

`/settings/theme`（`views/settings/Theme.vue`）把外观拆成**互相正交**的几档，各自落盘：

| 档 | 内容 | 存储键 |
| --- | --- | --- |
| 背景 | 纯色 / 星空壁纸 | `mauth:bg` |
| 颜色 | 明暗（system/light/dark）、主题色、颜色主题（配色 id） | `mauth:mode` / `mauth:accent` / `mauth:theme` |
| 主题 | 密度（宽松/标准/紧凑）、版式（= 主题包） | `mauth:density` / `mauth:view:<设备>` |

**存储分两层**：本机 localStorage（立即生效）→ 登录后与服务端对齐
（`PUT /session/preferences`，JSON 合并，服务端优先；新账号把本地值上报一次）。
六维全部覆盖：`accent` / `theme` / `mode` / `view` / `bg` / `density`。

🔴 **URL 参数（`?th=` / `?th_color=`）只是"本次预览"，不写任何偏好**。
早先做过"深链即偏好"，实测是错的：登录页上一个 `?th=pearl` 链接会把**全站**版式一起改掉。
**想记住 → 设置页里选；只想看一眼 → URL 带参。**

🔴 **版式按设备各存一份**（`mauth:view:standard` / `mauth:view:mobile`）：桌面与手机可以不同。
同步到账号时上报的是"用户显式选过的那个"（`persistedViewOf`），不会把 URL 预览当成偏好。

**密度**只改三个尺寸（`--row-h` / `--cell-px` / `--control-h`），表格、工具栏、分页、小按钮
全都自动跟着变；它不动字号与颜色，所以能与任意配色/壁纸自由组合。实现在 `theme/density.ts`
+ `tokens.css` 末尾的 `[data-density]` 两段（同特异性，靠顺序覆盖 `:root`）。

### 无极调色盘（任意色）

`theme/accent.ts` 接受**两种形态**的 id：预设 id（`ocean` / `leaf` …）与任意 `#rrggbb`。
后者由 `theme/color.ts` 现场派生一整套：

| 令牌 | 怎么来 |
| --- | --- |
| `primary` | 原色，但**按当前明暗钳制到对比 ≥ 4.5**（浅色底压深、深色底提亮），只动 OKLCH 的 L |
| `hover` | 同色相，L 再走一档（深色配色往亮、浅色往暗） |
| `soft` / `focus` | 主色的 12% / 80% 透明 |
| `tint` | **原色**，专供大面积浅底（卡面渐变、光斑） |
| `on-primary` | 落在主色上的文字：白与深墨**取对比更高者** |

🔴 为什么用 OKLCH 而不是 HSL：HSL 的 L 不是感知明度（同为 L=50%，黄色比蓝色亮得多），
按它派生会出现"改个色相按钮突然刺眼/变糊"。旧青绿 `#4a7c14` 发"脏绿"就是只压 HSL 亮度的结果。

🔴 `--mauth-on-primary` 不能省：主色要同时满足"它落在底上可读"和"它上面的字可读"，
亮主色（深色模式提亮后尤甚）上白字只有 1.3:1，实心按钮直接看不清。
`color.ts` 里不是"白字够 4.5 才用白"，而是**两边都比一遍取高者** —— 中等明度的色
（如 `#0b8f45`）白字 4.17、深字 4.49，按阈值会选错方向。

面板上的色块是**对角双色**（左=你选的原色、右=实际生效的主色）：只显示原色会骗人，
只显示 primary 又看不出自己选了哪个。

🔴 **主题色（accent）会盖住配色自带的主色**：它是后写的 inline 变量。想"换配色按钮就跟着变"，
选「**跟随配色**」—— 它把配色记录里的主色组回写一遍（不能删变量：配色自己的值也在同一槽位）。

## 令牌清单（可视化编辑器的地基）

`theme/token-manifest.ts` 是 64 个 `--mauth-*` 的**元数据表**：中文名、分组、控件类型
（color/length）、作用范围（global/component）、一句"改了会影响什么"。

没有这份表，任何"逐组件改色"的界面都只能列出 64 个裸变量名 —— 那种界面没人敢用。

🔴 `npm run typecheck` 会跑 `scripts/check-token-manifest.mjs` **双向**比对清单 vs 配色表：
清单有、配色表没有（编辑器写出空变量）；配色表有、清单没有（用户看不到这一项）。
加 token 的顺序固定为：**先写进 38 份配色表 → 再登记清单**。

## 与后端的分工

- 菜单只决定**侧栏可见性**（`/session/routes`）；接口放行由后端 PBAC policy 判定。
- 前端 `hasPermission()` / 按钮隐藏只是体验，**不是安全边界**。
- 列表统一 `{ rows, total, pageNum, pageSize }`；写操作失败直接展示后端 `message`。

## 已知边界

- 代码生成（`/tool/generator`）为二期占位：参考项目生成的是 Java，本仓模板需整套重写。
- 移动端只保证登录、工作台、列表类页面的可用性；图谱类版式（溯源 / 星图 / 阶梯）待补。
- 未接 i18n：参考项目的文案是硬编码中文，本仓一期同样只用中文。
