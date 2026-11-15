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
  themes/spotlight/                      聚光（只有登录页是自有版式，其余页面转发到 default）
  themes/pocket/                         口袋版（**只有手机端**，独立布局，后续打包 App）
  views/<页面>.ts                        页面域声明 + 版式契约（纯类型 ctx + defineThemePage）
```

### 聚光的 `console/` 目录：两样东西，别一起删

聚光**只有登录页是自己的版式**（`<设备>/login/`，独立视觉语言），其余 13 个页面都是
`display:contents` 的转发壳。它的 `console/` 下有两类内容，删除风险完全不同：

| 内容 | 能不能删 | 后果 |
| --- | --- | --- |
| `console/index.vue`（转发壳） | 能，但 dev 启动会刷一条 `扫描跳过 …缺少版式组件` | 无（版式本来就用内置包的） |
| `console/colors/`（3 套配色 × 2 设备） | **不能** | `?th=spotlight` 预览时 `getThemeRecord(pkg='spotlight')` 查不到 ⇒ **token 清空、后台裸奔** |

🔴 关键区别：**配色按 pkg 精确匹配**（`findRecord` 没有跨包回退），而**版式组件缺失只回退到
内置包**。所以"删版式文件"安全、"删配色目录"不安全 —— 两者在同一个目录下，最容易顺手一起删。

要彻底去掉聚光，只能删整个包（登录页那套版式会一起消失），不能只删 `console/`。

它不进版式选择器：`coverage.pages` 是 `['login']`，转发壳不算"自己的版式"（选了也不会改变后台布局）。

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

## 命令面板（⌘ / Ctrl + K）

`components/layout/CommandPalette.vue` + `composables/useCommandPalette.ts`。

四组结果：

| 分组 | 出现时机 | 数据来源 |
| --- | --- | --- |
| 最近访问 | 未输入时 | localStorage `mauth:recent`（路由变化记录，最多 5 条） |
| 页面 | 始终 | `useNavGroups().pages` |
| 用户 | 输入关键字且**有 `admin:user:read`** | `listUsers({ keyword })`，防抖 220ms |
| 动作 | 始终 | 切明暗 / 外观与主题 / 个人设置 / 退出登录 |

🔴 **页面清单与侧栏同源**（`composables/useNavGroups.ts`）。过滤规则（下架 / 未注册 / 无权限 /
空目录消失）只写一次 —— 两份实现必然出现"侧栏藏了、面板搜得到"的错位。

🔴 **打开状态是模块级 ref**，不是 composable 内部的：`App.vue` 绑全局快捷键、面板组件读状态，
两边各调一次 composable 会拿到两个独立 ref，按了没反应（最容易写错的一处）。

键盘：`↑ ↓` 移动、`Enter` 执行、`Esc` 关闭。回车用户结果会跳到 `/system/user?keyword=<账号>`。

### 这些浮层组件怎么适配多主题

以命令面板为例，三层分开看：

| 层次 | 怎么做 | 换主题时 |
| --- | --- | --- |
| 颜色 / 圆角 / 描边 / 阴影 | 全用 `--mauth-*` | **自动跟随**，零代码 |
| 结构（桌面卡片 / 手机全屏） | 一个 DOM + CSS 断点（≤820px 变全屏） | 不变 |
| 交互本身 | 一套（搜索 + 键盘 + 动作） | 不变 |

所以「支持多主题」在这里的含义是**换皮不换骨**：同一个组件换配色、换明暗、甚至用户自定义了
任何一项 token，面板都跟着变，不需要按包写分支。

只有当一个包需要**完全不同的交互**（例如掌上版改成语音输入）时，才值得把它下沉成
`themes/<包>/<设备>/palette/index.vue` 的版式 —— 那是新维度，现在不值得为它付代价。

同样的判断适用于 `ToastHost` / `ConfirmHost`。

## 操作反馈：提示 / 确认 / 焦点

三件事各有唯一入口，**不要在业务组件里再造一套**。

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| 轻提示 | `useToastStore().push(msg, tone?)` / `.pushError(err, fallback)` | 底部居中胶囊，2.6s（失败 4.2s）；**悬停暂停**，最多 4 条 |
| 确认框 | `await useConfirmStore().ask({ title, message, confirmText?, danger? })` | 返回 `Promise<boolean>`；危险操作按钮变红 |
| 焦点陷阱 | `createFocusTrap()`（`composables/useFocusTrap.ts`） | 弹窗打开接管 Tab、关闭还焦点；**多层用栈** |

宿主 `ToastHost` / `ConfirmHost` 挂在 `App.vue`，全站只有一份。

🔴 **不要用 `window.confirm`**：它阻塞渲染线程、样式不可控（深色主题下是白框）、无法表达危险语义。
全仓 8 处已全部替换（删除岗位/部门/菜单/角色、下线设备、退出其他设备、清理记录、踢会话）。

🔴 **提示不要写死时长与位置**。此前 6 个页面各写 `const toast = ref('')` + `setTimeout(2600)`，
位置、时长、失败文案三样都不一致；现在 `notify()` 里只剩一行 `toastStore.push(message)`。

🔴 **危险操作的默认焦点留在「取消」**（不是确认）：删除类操作不该让手快的用户连按两下 Enter 就删掉数据。

## 外观：四档

`/settings/theme`（`views/settings/Theme.vue`）把外观拆成**互相正交**的四档，各自落盘：

| 档 | 内容 | 存储键 |
| --- | --- | --- |
| 背景 | 纯色 / 星空壁纸 | `mauth:bg` |
| 颜色 | 明暗（system/light/dark）、主题色、颜色主题（配色 id） | `mauth:mode` / `mauth:accent` / `mauth:theme` |
| 主题 | 密度（宽松/标准/紧凑）、版式（= 主题包） | `mauth:density` / `mauth:view:<设备>` |
| 自定义 | 逐令牌覆盖（按「材质」分组，见下） | `mauth:overrides` |

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

### 自定义模式（逐令牌覆盖）

`/settings/theme → 自定义`：64 个令牌全部可改，但**不是**摊成 64 个色轮。

**先按「材质」收口成 5 类**（`theme/materials.ts`）——这是用户脑子的分层，不是代码模块：

| 材质 | 管什么 | 令牌数 |
| --- | --- | --- |
| 画布 | 页面底色、侧栏、顶栏（整体亮不亮） | 12 |
| 卡片 | 面板、表头、行悬停 | 3 |
| 控件 | 按钮、输入框、弹窗、分段、开关 | 8 |
| 文字 | 四档文字、描边、圆角字号 | 13 |
| 信号 | 主色、语义色（含提醒色）、徽标、分类色 | 30 |

🔴 **材质不新增任何令牌**，只是 `token-manifest` 分组（10 个）的归并视图。CSS 一行没改，
`check:tokens` 继续守清单与配色表的一致性。

优先级三层（都写 `html` 的 inline，靠写入顺序决胜）：

```
配色（theme-runtime） → 主题色（accent） → 自定义覆盖（overrides）
```

`App.vue` 的 watch 在 `flush: 'post'` + `nextTick` 里按这个顺序依次调 —— **顺序不能颠倒**。

两个必须守住的细节：

1. 🔴 **改色要保留原透明度**（`withOriginalAlpha`）。侧栏 / 顶栏 / 面板是 `rgba(…, .72)`，
   一改就变实心的话，玻璃质感与壁纸透出全没了。实测：`rgba(255,255,255,.72)` → 改绿色 →
   `rgba(0,255,0,.72)`。
2. 🔴 **重置不能 `removeProperty`**。配色层的 token 也是同一元素的 inline，删掉会把配色
   自己的值一起删（那一项直接变空）。正确做法是把**当前配色记录里的基值写回去**，
   所以换配色后"没被覆盖的项"自动变成新配色的值（实测：石墨夜下 `nav-bg` 变
   `rgba(22,26,29,.72)`）。

存储语义：`overrides` 是**覆盖式**（不是合并）—— 用户清空某项后，别的设备必须能跟着还原。
其余六个键是合并式（自动保存一次只改一个维度）。

关卡：`scripts/check-color.mjs`（并入 `npm run typecheck`）用 Node 直接加载 `.ts` 跑纯函数断言
（29 项）：对比度钳制、`on-primary` 取色、alpha 保留、注入串拒绝、脏数据过滤。

## 令牌清单（可视化编辑器的地基）

`theme/token-manifest.ts` 是 66 个 `--mauth-*` 的**元数据表**：中文名、分组、控件类型
（color/length）、作用范围（global/component）、一句"改了会影响什么"。

没有这份表，任何"逐组件改色"的界面都只能列出 64 个裸变量名 —— 那种界面没人敢用。

🔴 **组件里不要再写颜色字面量**。语义色有 `--mauth-success` / `--mauth-danger` /
`--mauth-warning`（各带 `-soft`），主色实底上的字用 `--mauth-on-primary`。
软底上的语义色文字写 `color-mix(in srgb, var(--mauth-danger) 78%, var(--mauth-text))` ——
浅色下压深、深色下提亮，不要用固定深色（深色主题下会糊）。
只有三类字面量是允许的：遮罩（`mask-image` 的 `#000`）、光效高光（`#fff 55% inset`）、
内容图标色板（口袋版入口的彩色图标）。

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
