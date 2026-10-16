# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；细节全在 `MEMORY-details.md`（§即引用；欠账→§21）。**超 ~12KB 静默截断 ⇒ 宁缺勿长**。主索引只留**判据**（做什么/别做什么 + 守门脚本名），细节一律指向 §。

## 0. 仓库形态 / 发版

- **`packages/log/`、`phonecopy/` 嵌套仓** ⇒ `status` 恒脏；🔴 **`packages/theme-core/` 是 submodule** ⇒ 克隆必须 `--recurse-submodules`。
- 🔴 **`oauth21/` = 独立仓 `oauth-web`**（GPL-3.0）：根仓 `.gitignore` 有 `/oauth21/`，**提交/推送进 oauth21 目录做**；已删 `file:..` 依赖，外部可独立 `npm install`。
- 🔴 **oauth21/posecraft/firewall/admin/poseadmin/retroweb 非 workspace 成员**：靠 vite alias + tsconfig paths 源码直供，**禁 `workspace:*`**；装依赖 `npm install --prefix <dir>`。
- **本机 git ref 失灵** ⇒ **以 `git ls-remote` 为准**；异常跑 `fix-packed-refs.mjs`。
- **发版**：根仓 `scripts/release.mjs` / 子前端 `scripts/release-web.mjs`（自包含可拷走，`--npm` 才发 npm）→ `--apply`。判据：破坏性（**只认 footer 行首+冒号**）→major；`feat`→minor；仅 `fix|perf`→patch；**其余不发**。统一规则 = `docs/standards/git-release-rules.md`。🔴 **基线 = `git describe --tags --abbrev=0`（离 HEAD 最近的 tag，≠最高版本）** ⇒ 旧提交上打低版本 tag 会劫持基线（2026-10-16 v1.0.0 事故，本地+远端已删）。⚠️ 正则类外 `/` 必须转义。
- **手动发版路径**（判据外、经用户批准，2026-10-16 实战）：`git tag -a vX.Y.Z -F <消息文件>`（tag message 即 changelog）→ `git push origin main <tag>` → 重跑 `release-web.mjs --apply`（无新提交时走 **syncReleaseIfMissing** 补建 Release）→ `chore: 对齐版本号` 提交推送。Release 说明可经 API PATCH 改写（敏感措辞按 §1.5）。
- 🔴 **gh CLI 本机不存在**（2026-10-16 实测，常见安装路径全无）：GitHub API 一律 `TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')` + curl / node fetch；release 脚本凭据依次取 `$GITHUB_TOKEN`/`$GH_TOKEN`/GCM，无需 gh。

## 1. 强制约定（违反会红）→ **§1 全表**

- export 收拢文件末尾（仅 src/）· `src` 禁 import `scripts` · `src/app/<A>` 禁 import `src/app/<B>`。
- **测试有效性**：真实加载被测代码；禁手写常量自测/内联复制逻辑；`KNOWN_INEFFECTIVE_TESTS` 只减不增+同步 `FROZEN_SIZE`；一文件只注册一组路由。
- 🔴 **鸭子类型判据必须由接口派生**（`Record<keyof T,…>` 再遍历）；手抄成员名⇒判据静默落后。**"长红关卡=噪声"**⇒ 过期关卡**显式退役**。
- 🔴 **拆分/移动源码后，「断言读文件内容」的关卡必须同步文件清单**（已三踩）；🔴 新目录进 lint 范围前先配语言环境。
- 🔴 **构建期配置必须进类型检查**：Vite8=**Rolldown+Oxc**，`esbuild.drop` **已失效** ⇒ 用 `rolldownOptions.output.minify.compress.dropConsole`。
- 🔴 **路径别名单一来源 `oauth21/config/aliases.ts`**（改别名**两处同改**；JSONC **禁正则剥注释**）；🔴 **`skinsuite`/`stable-deviceid` 零外部 import**（包内 `import vue` ⇒ **两份 Vue**）。
- 🔴 **外部边界类型只收在 `src/types/external.ts`**（`declare global` + zod，禁 `any`）。
- 🔴 **前端类型闸门口径 = `vue-tsc -b`**（裸 `vue-tsc` 恒 0）。
- 🔴 **多主题/多版式**：token 基线 → 皮肤 → 版式三正交；**目录名即 id**（坏目录静默跳过）；业务只在容器，版式只读 `ctx`/`ctx.actions`。

## 2. 后端陷阱速查 → **§12**

`getModel` TypeError · `getStore` 命名空间 · 禁 `bcryptjs` · 禁 `*Sync(` · `underscored:true` · `process.exit` 伪装绿 · register 只认 `username` · Fastify（`onRoute`/`preClose`）· Redis v5（驼峰/`duplicate()` 不建连）· Guard（`restore()` 清表）。

## 3. oauth21 → **§11/§13/§17**

- 🔴 **主题替换规范 = 根仓 `docs/standards/theme-replacement.md`**（oauth-web `docs/` 有副本；view≡pkg、四入口优先级、`?theme.<设备>`、token 白名单）。
- ✅ **社区标准已补齐**（2026-10-16）：两仓根目录 CoC/CONTRIBUTING/SECURITY/ACCESSIBILITY + `.github/ISSUE_TEMPLATE/` 三件 + PR 模板；main 分支保护同 CoreFlow（必检 CI 单作业、strict、禁强推/禁删除、admin 可绕过）。**CodeQL 已挂 Default setup**（自定义 workflow 与 Default 冲突已删）；Wiki 五页 + Projects 看板均已建。
- 🔴 **Issue forms 识别判据**（2026-10-16 实证，勿再排查）：`.yml` 在 `.github/ISSUE_TEMPLATE/` 且含 `name:`+`description:`（name>3 字符）即被 GitHub 识别、清单打勾、health 100；**community profile API 的 `issue_template: null` 只跟踪旧版 .md 模板，是红鲱鱼**（home-assistant/astro 同款 null）；/community 页 "Issue templates" 恒为纯文本从不加链接；**Settings → "Set up templates" 构建器页永远显示 3 个默认起始模板**（Bug report/Feature request/Custom template），是「新增模板」入口，**不代表模板缺失**——两仓模板早已就位，勿在该页重复提交（只多出冗余 .md）。验证入口：登录后 `/issues/new/choose`。
- 🔴 **env 四文件同序同注释**（14 变量；`.env.production` parent 白名单刻意留空）；死变量 `VITE_APP_TITLE` 已删（title 走路由 meta）。
- 🔴 **oauth-web CI 自带**（ci.yml：type-check→lint→vitest→build→dist-nopwa→静态关卡 8 项）；新增 `scripts/*.mjs` 先补 eslint languageOptions；🔴 **本机 shim 拦 `vite build`**（后台清 dist 超 50 文件必红；CI runner 无此问题）。
- **主题热更新设计**（未实现）= `oauth21/docs/theme-hot-update.md`：L1 token/L2 配色已由 `remote.ts` 实现；L3 CDN 热更 P0-P3，manifest 即开关。
- 🔴 **别名双形态**：`config/aliases.ts` 对 skinsuite/stable-deviceid 条件注册——上级 `packages/` 在→源码直供；不在→删键回落 npm 版（CI/独立仓）。🔴 vite alias 精确匹配不回落 node_modules、TS paths 未命中会回落（type-check 绿而 vitest 红）。🔴 **改包源码必须同步发版**——CI 验 npm 发布版。
- 🔴 **view ≡ pkg**：`'base'` 不是合法 view 名；优先级 `?view=` > 包声明 > `VITE_<PAGE>_VIEW` > 包名；URL 显式非法值不回退。🔴 **设备平级** `mobile|standard|mini|tablet`（mini 独立）⇒ 加设备改 `devices.ts`+写容器。
- 🔴 **配色/样式**：注册表键四段（包/设备/页面/配色）每版式各一份；`isDark = tone`、跨设备回落先按同系别；URL `?theme=`/`?skin=` 设备无关；🔴 scoped 禁 `:global(.dark) X` ⇒ `.dark X`；black = `#000000` 且两个 bg 同时设。
- 🔴 **移动端页**：调前先造窄视口并刷新（宽≥1024 > 窄<768 > UA）；三个分发器都要认「mini 来源」；URL 不被视口改写；父 origin 白名单=`parent-origins.ts`。🔴 设备维度参数唯一入口 `readDeviceParam`（空串 = 未指定）。

## 4. 手法/命令 → **§9**

🔴 ① **禁在 Bash 里 `git rm` src/ 下任何路径**（递归清空整个 src/）→ `rm <path> && git add -A`。
🔴 ② **safe-delete shim 拦 `rm`/`fs.unlinkSync`** ⇒ 删/移目录用 `mv <path> .tmp-probe/`；`vite build` 须 `--outDir <全新目录>`。
🔴 ③ **同一文件多 Edit 同条消息会静默丢失** → 串行 + grep 复核。④ **Edit 对含 `*/` 的多行块易失配** → 用 Python 改。
⑤ **heredoc 写 TS 注释**：`` ` `` 会被当转义**真写进源码**、非 ASCII 可能乱码 ⇒ 改完必扫 `` \` `` + `vue-tsc` + 目视。
⑥ 写/核文件行尾只用 Python · **`bash -c` 的 `\n`/反引号被吃** ⇒ 含换行者写脚本文件 · Git Bash `/tmp` ≠ Windows 路径 ⇒ commit 用仓内相对路径 `-F`。
⑦ **批量改文本的 anchor 只用签名行**（含函数体会插出重复函数体）；脚本注入后必查块内裸空行（只清"一侧是 `@` 标签"的）。
⑧ 🔴 **Bash 的 cwd 每条命令都会重置** ⇒ 每条必带 `cd <dir> &&` 或 `git -C <dir>`；漏了会**静默跑在根仓**（已误判一次）。
⑨ **Write 工具保留原文件行尾**（原 CRLF 写完仍 CRLF）⇒ 批量写后 Python 核行尾。
⑩ **standalone 预演**：`.tmp-probe/standalone/<仓>/` 搭副本——配置/src/__tests__ 真实拷贝 + node_modules/public junction；🔴 禁整目录 junction（`import.meta.dirname` realpath 让 MONOREPO_ROOT 解回真实上级）；🔴 src 禁 junction（vite glob 键变 `./themes/` 相对形态，关卡假红）。

## 5. 部署/CI → **§10**

- 🔴 **前端 CI 用 `npm ci`**（`--prefix oauth21`，必须从仓库根跑）；lock 全仓入库。
- 🔴 **后端三 job（lint/test/verify）用 `npm install --no-package-lock`**：根 lock 记 `wb-logkit` 为 `link: packages/log`（gitignore 嵌套仓）⇒ `npm ci`/`npm install` 都建悬空软链⇒ERR_MODULE_NOT_FOUND；**禁开 `cache: npm`**。
- 🔴 **Dockerfile lockfile 不进镜像**（只 `COPY package.json`）+ `--legacy-peer-deps`；构建期自证 `docker/verify-deps.mjs`——🔴 RUN 里 `node -e` 引号不跨行。🔴 复刻树验容器 install 要删 packages/ 且删 install 生成的 lock。
- 🔴 **frontend job 禁 `submodules: recursive`**：phonecopy 私有仓 CI 拉不动 ⇒ 精确 `git submodule update --init packages/theme-core`；gitlink 必有 .gitmodules 条目。
- 改 `ci.yml`/Dockerfile 前先读 §10（安装三件套 · tini 软链 · secret ≥32 位 · `git archive` 到仓库外）。
- 🔴 **CI 统一规范**（2026-10-17 落地，单一来源 = fullstack-rules `references/ci-conventions.md`）：工作流命名四类 —— `ci.yml`（唯一入口）/ `ci-quality.yml`（共享门禁，前端家族**字节一致**）/ `ci-<domain>.yml`（专属关卡）/ `release-<target>.yml`（发布；CoreFlow publish-image→release-docker 已改名）。共享门禁 canonical 在 skill `assets/ci/`，分发 = `node .claude/skills/fullstack-rules/scripts/distribute-ci.mjs <仓>`；🔴 **禁手改副本**（文件末 `canonical-sha256` 章 + CI 首步 `scripts/ci-quality-check.mjs` 自检，手改即红）。oauth-web/retroweb 已接入（retroweb 从零建 CI + 补分支保护）。
- 🔴 **GitHub API 两坑**（2026-10-17 实战）：合并 PR 用 **PUT** `/pulls/<n>/merge`（**POST 静默 404**，勿误判 blocked/权限）；改必检项用 **PATCH** `/branches/main/protection/required_status_checks`（PUT 无效且不报错）。🔴 **作业名一改，必检项必须同步**——reusable workflow 作业名 = `<caller job key> / <called job 名>`（如 `quality / 类型 / 规范 / 单测 / 构建`），不同步则 PR 永远 blocked。
- retroweb 三浏览器关卡（verify:retro-envelope/ep-style/interrupt）需 dev server:5177，**不进 CI**（同 oauth-web dev/prod 口径，本地跑）；本机 `npm ci` 会被 safe-delete 垫拦（node_modules/.bin 批量删 >50）——与 lock 同步时可先用现有依赖预验证。

## 6. retroweb + retrochimera（逆合成工作台）→ **§14~§72**

前端 #7，端口 **5177** `strictPort`；Vue3.5+TS6+Vite8+Pinia+EP2.14。后端 `F:/retrochimera`（`启动后端API.bat`，`models/` 9GB 不入库）。🔴 **禁硬编码盘符**（`RETRO_MODELS_DIR`/`RETRO_MODEL_<KEY>`）·⚠️ 后端改动**须重启**。
🟡 条目末 §号 = 细节在 `MEMORY-details.md`；守门脚本在 `scripts/`（retroweb）或 `.tmp-probe/`。
- 🔴 **retroweb 是独立 git 仓**（`yijiu2025/retroweb.git`，main）——根仓完全不跟踪。🔴 提交/推送必须在 retroweb 目录里做；推送判定用 `git ls-remote origin main`，不信退出码。
- 🔴 **前端规范单一来源 `.claude/skills/fullstack-rules/`**（根仓 git 跟踪；子目录副本只读，改完跑 doctor）。v2.6.0 起含 CI 统一规范 + 入口规范 + main 主干支线模型（→ §5）。
- 🔴 **入口形态 = `main.ts` 门牌 + `bootstrap.ts` 编排**（五前端统一：retroweb/posecraft/firewall/admin/oauth-web，oauth-web 2026-10-17 PR #5 门牌化）。🔴 挂载一律 `router.isReady().then(mount)` + `.catch` 降级。→§63.3
- 🔴 **`@author` 只在文件头标**（函数级不加；归属以 `git blame` 为准）+ `@since`。本仓值 `Claude`/`yijiu2025`。→§63.5
- 🔴 **env 类型必须开严格模式**：`interface ViteTypeOptions { strictImportMetaEnv: unknown }`（interface，非对象字面量）。→§63.4
- 🔴 **JSDoc 基线 = 62 个导出函数**，`@param`/`@returns`/文件头缺口 0（2026-10-11）。守门 `npm run audit:jsdoc`（有缺口 exit 1）。口径：`@param` 写语义不抄类型；`@returns` 必交代失败路径；无参不写 `@param`；改脚本注意正则关键字白名单/只认末尾 export 块/无参函数先数逗号/文件头扫整个首块注释/`.d.ts` 豁免。→§73
- 🔴 **api 层三层 → §72**：传输层（`http/`、`retro/client.ts`，判据=**只认有没有收到响应**）/ 业务层（`auth.ts`、`retro/compute.ts`、`retro/llm.ts`）/ 能力层（`capability/`、`session/install.ts`）。`src/api/README.md` 是人工审查入口。入口层不出现任何 store。
- 🔴 **拆文件后必须重启 dev server**（2026-10-11 白屏）：旧进程模块图仍指向已删文件 ⇒ 404 ⇒ 整个模块图加载失败、`app.mount()` 从未执行。**代码没错，进程老了**。探针 `.tmp-probe/verify-white-screen.cjs`（9 项）；⚠️ 后端 502 属"没数据"不算白屏，判暗色白闪要测第一帧。→§73
- 🔴 **登录 = iframe 嵌 oauth21 `/mini-login`**：`bind-session` 失败须中断；宿主 origin+source 双校验；弹窗宽 = iframe 内口 1:1（`DIALOG_WIDTH=854`）；`.el-dialog__body{margin:0}`。→§59
- 🔴 **预测两条路**：单步=`/api/jobs`(kind=predict)；「自动往下拆」=kind=search 搜到底。`applySearchRoutes` 禁逐路线 adopt（共享节点互覆⇒树只剩根）。→§45/§61
- 🔴 **工作台 = 标定态/路线态**（`targetSetupOpen`）：可见性只认它；「换目标」须 `reset()`；解析不建任务。→§14.4/§37/§61
- 🔴 **端点配置走能力层 `capability/endpoint-config.ts` → §70**：Node 前缀 = `system.json.prefix` + 组前缀（不是 Python 的 `/api`）；`keys:[]`=显式清空、`undefined`=不动；DAO `mergeKeys` 是安全底线。
- 🔴 **前端不启停模型（`VITE_RETRO_MODEL_CONTROL`）→ §66**：`auto`(直连允许/中转禁止)|`on`|`off`；管住 `warmModel`/`stopModelService`/`loadForward`，但模型状态展示永远保留。
- 🔴 **免登录档别走身份切换路径 → §68**：bypass 分支曾调 `setUser`→`syncUserData`→`persist.clear()` ⇒ 每次刷新抹掉 localStorage；现在只写 user + `loadDevUserData()`（只补拉不清）。
- 🔴 **「启用清单」= 部署级模型 key 白名单**（N 个可同时运行、不是单选；至少留一个）。**权限下发已接**（`GET /user/v1/permissions`，deny 优先 + 通配）；免登录档权限走 localStorage `retroweb_dev_permissions`（生产不读）。🔴 **superadmin ⇒ `${appId}_admin`**（判定用权限码不写死角色）。→§67
- 🔴 **真实模式联调 → §57**：五环缺一即"没数据"不报错（凭据/哨兵/`refreshPersist()`/Node `GET /llm/models`/先跑 `migrate.js`）。**假绿四个**：错误条双容器 · 必打非 401 对照组 · 注入体像真信封 · VITE_开关三层钉。
- 🔴 **EP 样式 = 按需**（`importStyle:'css'`，main 不引 `dist/index.css`；`dark/css-vars.css` 必须单独手引）。→§63.2
- 🔴 **401 唯一入口 `intercept401`**：`_retry` 守卫必须记在请求配置上（模块状态挡不住，`finally` 早于 replay settle ⇒ 无界重放）。→§63.1
- 🔴 **暗色首屏白闪**：主题要在 `index.html` 内联预置；口径须与 `settings.ts` 的 `readInitial()` 逐字一致（key `retroweb_theme`、值 `'dark'/'light'`）。→§69
- 🔴 **export 收拢文件末尾（`src/**/*.ts`）**：定义处不写 `export`；末尾 `export {…}`/`export type {…}`（类型必须 `export type`）。已有 eslint `no-restricted-syntax` 硬规则。→§64
- 🔴 **多模型并行（走 Node 中转时）→ §65**：模型加载归 Node 侧，前端只问"能不能用"，允许多模型同时运行；现契约把单模型写死，⚠️ `is_current`/`current` 是死字段。
- 🔴 **「分析模块」键前后端对齐**：现 11 个；**`safety`（过程安全）≠ `toxicity`（物质毒性）**，加模块两侧同改。§16.7
- 其余 UI/画布/断言/搜索预算等细则 → §16/§22~§36/§41~§47/§54~§55/§58，未列出的查 details 文件。

## 7. GitHub 治理现状（2026-10-16 核实）

- **CoreFlow**（`yijiu2025/CoreFlow`）：社区标准全齐 health 100；Private vulnerability reporting 已开；CodeQL Default setup（js-ts/python/actions）；Wiki 五页+_Sidebar；Projects #3 看板（挂 CoreFlow+oauth-web，issue #6/#7/#8 已关）；分支保护（必检 CI 三作业、strict、admin 可绕过）。**已发版 v2.28.1**（tar 安全加固）。Dependabot 存量告警 ~238（axios×82 大头）。
- **oauth-web**（`yijiu2025/oauth-web`，本地 `oauth21/`）：同套社区标准 + issue forms 三件（已实证被识别）；CodeQL Default setup；Wiki 五页。**已发版 v1.1.0**（手动：Tailwind v4 迁移 + source-map-js 安全）。余 7 个 dependabot 告警（3 high / 4 moderate）；`vite-plugin-svg-icons@2.0.1` 远古传递树死锁（postcss/decode-uri-component/braces 安全更新不开 PR），处置选项见当日日志。
