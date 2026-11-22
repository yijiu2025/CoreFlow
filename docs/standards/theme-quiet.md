# 静默控制台（Quiet Console）

> 一句话定义：**中性灰 + 单一蓝 + 1px 发丝线**的信息型后台 —— 不用渐变、不堆阴影、不靠色块分区，
> 层级只由排版、留白和描边建立。
>
> 代号 `quiet`，中文名「静默控制台」，俗称「素白后台」。学术名为 Modern Minimal SaaS Admin
> （与 shadcn/ui 默认主题、Linear / Vercel 控制台同一审美谱系）。
>
> 本文是这套风格的**命名与实现单一来源**：命名、视觉规则、令牌取值、落地文件、验收点都以这里为准。
> 状态：**规范先行，配色包尚未落地**（`scaffold/` 目前只有 `white` / `star` / `island` / `black` / `wechat` 等）。

## 1. 它是什么 / 不是什么

| 是 | 不是 |
| --- | --- |
| 现代极简 SaaS 后台（Modern Minimal SaaS Admin） | Ant Design 默认风（蓝表头、明显投影、大圆角） |
| 以中性灰阶承担 95% 的信息表达 | Glassmorphism（毛玻璃、发光描边） |
| 单一强调色，只出现在主操作与当前选中项 | Material Design（浮起卡片、涟漪、FAB） |
| 12–13px 正文、400/500 两档字重、等宽数字 | Brutalism（粗黑边、撞色、大字报） |
| 表格 + 分段筛选 + 行内图标操作 | 营销落地页风格（大标题、插画、彩色渐变） |

适用：管理后台、控制台、B 端数据列表（当前 `scaffold` 的用户 / 角色 / 菜单 / 日志页）。
不适用：登录 / 授权确认这类「门户型」页面 —— 那里继续用现有的 `star` / `white`，它们靠更大的圆角与背景图承担品牌感。

## 2. 视觉规则（R1–R8，可逐条验收）

| 编号 | 规则 | 判据 |
| --- | --- | --- |
| R1 | **两层表面**：画布浅灰、内容纯白 | 截图里侧栏与画布同色，内容卡片是白色，没有第三层 |
| R2 | **描边优先于阴影**：分隔靠 1px 线 | 卡片、表头、分页都不靠投影分层；`--mauth-border` 不高于 10% 不透明度 |
| R3 | **单一强调色**：蓝只用于主按钮、当前导航、焦点环 | 全屏截图中蓝色像素占比 < 2% |
| R4 | **语义色只做胶囊**：成功/失败/警告不铺面 | 状态是「浅底 + 深字」的小胶囊，不做整行染色 |
| R5 | **小字号、紧行距**：正文 12–13px，行高 20–22px | 表头不加粗到 700，最多 500 |
| R6 | **圆角收敛**：卡片 8–10px、控件 8px、胶囊 999px | 不出现 16px 以上的大圆角 |
| R7 | **图标单色线性**：16px、描边 1.5、与文字同色 | 不用双色图标、不用填充图标做默认态 |
| R8 | **数字等宽**：ID、职级、计数、时间用 `--font-mono` | `<span class="mono">`，避免列宽跳动 |

## 3. 令牌映射（`--mauth-*`）

配色包只允许**单值**（hex / rgb(a) / hsl(a) / px / % / `var(--mauth-*)` 引用），
复合值（如 `1px solid #e5e7eb`）与背景图不在 token 里 —— 后者写在同目录 `theme.scss`。

### 3.1 基础层

| 令牌 | 建议值 | 说明 |
| --- | --- | --- |
| `--mauth-bg` | `#f7f8fa` | 画布：冷调浅灰，比 `white` 的 `#f6f8f7` 更中性 |
| `--mauth-surface` | `#ffffff` | 卡片 / 表格 / 弹窗表面 |
| `--mauth-surface-2` | `#fafbfc` | 次级表面：表头、只读区 |
| `--mauth-hover` | `rgba(16, 24, 40, 0.04)` | 行 hover |
| `--mauth-press` | `rgba(16, 24, 40, 0.07)` | 按下 |
| `--mauth-text` | `#101828` | 标题 / 正文强调 |
| `--mauth-text-mid` | `#475467` | 常规正文 |
| `--mauth-text-soft` | `#667085` | 次要说明 |
| `--mauth-text-faint` | `#98a2b3` | 占位、时间、禁用 |
| `--mauth-primary` | `#2563eb` | 主操作（比 `white` 的 `#236de9` 略深、更“工具感”） |
| `--mauth-primary-hover` | `#1d4ed8` | |
| `--mauth-primary-soft` | `rgba(37, 99, 235, 0.10)` | 选中项底色 |
| `--mauth-tint` | `#2563eb` | |
| `--mauth-on-primary` | `#ffffff` | |
| `--mauth-success` | `#12b76a` | 状态胶囊文字用更深的 `#067647`（见 3.2） |
| `--mauth-success-soft` | `rgba(18, 183, 106, 0.12)` | |
| `--mauth-danger` | `#d92d20` | |
| `--mauth-danger-soft` | `rgba(217, 45, 32, 0.10)` | |
| `--mauth-warning` | `#b54708` | 深琥珀，浅底上可读 |
| `--mauth-warning-soft` | `rgba(181, 71, 8, 0.12)` | |
| `--mauth-focus` | `rgba(37, 99, 235, 0.55)` | 焦点环 |
| `--mauth-border` | `rgba(16, 24, 40, 0.08)` | R2 的“发丝线” |
| `--mauth-border-strong` | `rgba(16, 24, 40, 0.14)` | 输入框 / 分隔线 |
| `--mauth-overlay` | `rgba(16, 24, 40, 0.32)` | 弹窗遮罩 |
| `--mauth-plate-bg` | `rgba(16, 24, 40, 0.92)` | 深色浮层（提示条） |
| `--mauth-plate-ink` | `#f9fafb` | |

### 3.2 形状与排版

| 令牌 | 建议值 | 对比 `white`（珍珠玻璃） |
| --- | --- | --- |
| `--mauth-radius-xs` | `6px` | `8px` |
| `--mauth-radius-sm` | `8px` | `12px` |
| `--mauth-radius-md` | `10px` | `16px` |
| `--mauth-radius-lg` | `12px` | `20px` |
| `--mauth-radius-xl` | `16px` | `24px` |
| `--mauth-fs-display-m` | `24px` | 同 |
| `--mauth-track-eyebrow` | `0.14em` | 同 |

**没有** `--mauth-font-*` / `--mauth-shadow-*`：字体栈与阴影在 `scaffold/src/assets/styles/tokens.css`，
属「主题不接管」的结构值。见第 4 节。

### 3.3 组件层

| 令牌 | 建议值 | 说明 |
| --- | --- | --- |
| `--mauth-nav-bg` | `#f7f8fa` | 侧栏与画布同色（R1） |
| `--mauth-nav-ink` | `#475467` | 导航默认文字 |
| `--mauth-nav-active-bg` | `#eaf2ff` | 当前项浅蓝胶囊 |
| `--mauth-topbar-bg` | `#ffffff` | 顶栏白，与内容区连成一片 |
| `--mauth-panel-bg` | `#ffffff` | 内容卡片 |
| `--mauth-table-head-bg` | `#fafbfc` | 表头只是极浅的底，不加粗不下边框 |
| `--mauth-table-row-hover` | `#f9fafb` | 行 hover |
| `--mauth-btn-bg` | `#ffffff` | 次按钮（描边型） |
| `--mauth-input-bg` | `#ffffff` | |
| `--mauth-modal-bg` | `#ffffff` | |
| `--mauth-tabbar-bg` | `#ffffff` | 移动端底栏 |
| `--mauth-tab-active-bg` | `#eaf2ff` | |
| `--mauth-tag-bg` | `#f2f4f7` | 中性标签（角色 / 岗位） |
| `--mauth-tag-ink` | `#475467` | |
| `--mauth-tag-ok-bg` | `#ecfdf3` | 「正常」胶囊 |
| `--mauth-tag-ok-ink` | `#067647` | |
| `--mauth-tag-off-bg` | `#f2f4f7` | 「冻结 / 禁用」 |
| `--mauth-tag-off-ink` | `#667085` | |
| `--mauth-tag-info-bg` | `#eff8ff` | |
| `--mauth-tag-info-ink` | `#175cd3` | |
| `--mauth-switch-track` | `#e4e7ec` | |
| `--mauth-switch-on` | `#2563eb` | |
| `--mauth-switch-knob` | `#ffffff` | |
| `--mauth-dash-rate` | `#2563eb` | 工作台速率线 |
| `--mauth-dash-ring` | `#e4e7ec` | 环形底 |
| `--mauth-dash-chip-bg` | `#f2f4f7` | |
| `--mauth-dash-chip-ink` | `#475467` | |
| `--mauth-dash-today` | `#2563eb` | 今日高亮 |

分类色（`--mauth-cat-1..5`）是图表用的低饱和浅底 + 深字，沿用 `white` 的值即可 —— 这套风格的图表本就该是
「灰底 + 一条主色线」，不需要另造一套彩色。

## 4. 边界：配色改不了的三个东西

这三项**不归配色包管**，写在这里是为了避免实现时误以为“改个 token 就能变成 Linear”：

1. **阴影**：`--e1 / --e2 / --e3 / --e1-lift` 在 `tokens.css`，是全局结构值。所以 `quiet` 的层次只能靠
   「白表面 + 浅灰画布 + 1px 描边」建立。若真要“零投影”，需要在框架层给主题开放阴影令牌
   （例如新增 `--mauth-shadow-card`），属于机制变更，不在本配色范围内。
2. **字体栈与字号阶梯**：字体族全局；字号只有 `--mauth-fs-display-m` 一个可调，正文 12–13px 由组件 CSS 决定。
3. **结构尺寸**：`--rail-w` / `--topbar-h` / `--row-h` / `--cell-px` / `--control-h` 属布局骨架，
   调它们会同时影响所有配色，不属于某个风格。
   `quiet` 在**标准密度**下呈现（`data-density="regular"`）；想更紧凑是用户侧密度偏好，不是配色差异。

## 5. 落地步骤（新增配色 `quiet`）

```bash
# 1. 建配色目录（目录名即 id，扫目录自动注册，无需改机制）
scaffold/src/theme/themes/default/standard/console/colors/quiet/
  ├── index.ts     # 上面三张令牌表；meta.id = 'quiet'
  └── theme.scss   # 仅当需要背景图/复合值时才建，本风格不需要
```

`index.ts` 的 `meta` 固定为：

```ts
meta: {
  id: 'quiet',
  name: '静默控制台',
  description: '中性灰画布 + 白表面 + 1px 描边，单一蓝色强调，无渐变无投影',
  author: 'console'
},
tone: 'light',
```

自检（三条都要过）：

```bash
cd scaffold
npm run typecheck                        # 令牌表类型（MauthThemeColor）与键名
npm run dev                              # ?debug=theme 面板里应出现「静默控制台」
node scripts/check-table-columns.mjs      # 表格 colgroup 与列数一致
```

**新增/修改令牌键**时，还必须同步 `scaffold/src/theme/token-manifest.ts` 的元数据
（只登记键，不登记值）；只改值不需要动 manifest。

## 6. 验收清单（对着截图逐条看）

- [ ] 侧栏底色与画布一致，当前导航是浅蓝胶囊，没有左侧竖条
- [ ] 内容区是一整块白卡，四周只有 1px 浅线，看不到投影
- [ ] 表头比正文略浅、字重 500，没有蓝色底
- [ ] 状态是「浅绿底 + 深绿字」的胶囊，不是整格染色
- [ ] 主按钮唯一强调色；次按钮是白底描边
- [ ] 行内操作是 16px 线性图标，hover 才有浅底
- [ ] 分页、筛选分段控件与表格同一基线（`--control-h` 对齐）
- [ ] 切到深色主题不塌：本配色只声明 `tone: 'light'`，深色由对应深色配色承担

## 7. 命名约定

| 场景 | 写法 |
| --- | --- |
| 配色 id（目录名） | `quiet` |
| 展示名 | 静默控制台 |
| 英文名 | Quiet Console |
| 提交信息前缀 | `style(theme):`（只调配色）/ `feat(theme):`（新增配色包） |
| 文档引用 | 「静默控制台（`quiet`）」 |

改名时只改 `meta.name` 与本文，**目录 id 与令牌值不动** —— id 是用户偏好里存的值，改名会让已选用户回落到默认配色。
