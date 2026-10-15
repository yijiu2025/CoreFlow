# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；细节全在 `MEMORY-details.md`（§即引用；欠账→§21）。**超 ~12KB 静默截断** ⇒ 宁缺勿长。主索引只留**判据**（做什么/别做什么 + 守门脚本名），细节一律指向 §。

## 0. 仓库形态 / 发版

- **`packages/log/`、`phonecopy/` 是嵌套仓** ⇒ `status` 恒脏；`release.mjs` 已过滤 ⇒ 不用 `--allow-dirty`。🔴 **`packages/theme-core/` 是 submodule** ⇒ 克隆必须 `--recurse-submodules`。
- 🔴 **`oauth21/` 已拆为独立仓 `oauth-web`**（GPL-3.0，2026-10-14）：根仓不跟踪（`.gitignore` 有 `/oauth21/`），**提交/推送进 oauth21 目录做**；开源版已删 `file:..` nodeservers 依赖并清 lockfile 的 `..` 树（外部可独立 `npm install`）。
- 🔴 **oauth21/posecraft/firewall/admin/poseadmin/retroweb 非 workspace 成员**：靠 **vite alias + tsconfig paths 源码直供**，**禁 `workspace:*`**；装依赖 `npm install --prefix <dir>`。
- **本机 git ref 失灵** ⇒ **以 `git ls-remote` 为准**；异常跑 `fix-packed-refs.mjs`。
- **发版**：`scripts/release.mjs` → `--apply`。`feat`→minor；仅 `fix|perf`→patch；破坏性（**只认 footer 行首+冒号**）→major；其余不发。🔴 **子前端/独立仓**用 `scripts/release-web.mjs`（自包含可拷走，判据同上，`--npm` 才发 npm）；统一规则 = `docs/development/git-release-rules.md`（提交/版本号/分支三合一，oauth-web 已落地）。⚠️ 正则里**类外 `/` 必须转义**（`\/`），类内合法。

## 1. 强制约定（违反会红）→ **§1 全表**

- export 收拢文件末尾（仅 src/）· `src` 禁 import `scripts` · `src/app/<A>` 禁 import `src/app/<B>`。
- **测试有效性**：真实加载被测代码；禁手写常量自测/内联复制逻辑；`KNOWN_INEFFECTIVE_TESTS` 只减不增+同步 `FROZEN_SIZE`；**一文件只注册一组路由**。
- 🔴 **鸭子类型判据必须由接口派生**（`Record<keyof T,…>` 再遍历）；手抄成员名⇒判据静默落后。**"长红关卡=噪声"**⇒ 过期关卡**显式退役**。
- 🔴 **拆分/移动源码后，「断言读文件内容」的关卡必须同步文件清单**（已三踩）；🔴 **新目录进 lint 范围前先配语言环境**。
- 🔴 **构建期配置必须进类型检查**：Vite8=**Rolldown+Oxc**，`esbuild.drop` **已失效** ⇒ 用 `rolldownOptions.output.minify.compress.dropConsole`。
- 🔴 **路径别名单一来源 `oauth21/config/aliases.ts`**（改别名**两处同改**；JSONC **禁正则剥注释**）；🔴 **`skinsuite`/`stable-deviceid` 零外部 import**（包内 `import vue` ⇒ **两份 Vue**）。
- 🔴 **外部边界类型只收在 `src/types/external.ts`**（`declare global` + zod，禁 `any`）。
- 🔴 **前端类型闸门口径 = `vue-tsc -b`**（裸 `vue-tsc` 恒 0）。
- 🔴 **多主题/多版式**：token 基线 → 皮肤 → 版式三正交；**目录名即 id**（坏目录静默跳过）；**业务只在容器**，版式只读 `ctx`/`ctx.actions`。

## 2. 后端陷阱速查 → **§12**

`getModel` TypeError · `getStore` 命名空间 · 禁 `bcryptjs` · 禁 `*Sync(` · `underscored:true` · `process.exit` 伪装绿 · register 只认 `username` · Fastify（`onRoute`/`preClose`）· Redis v5（驼峰/`duplicate()` 不建连）· Guard（`restore()` 清表）。

## 3. oauth21 → **§11/§13/§17**

- 🔴 **主题替换规范 = 根仓 `docs/frontend/theme-replacement.md`**（oauth-web `docs/` 有副本；view≡pkg、四入口优先级、`?theme.<设备>`、token 白名单——总文档 FRONTEND_STANDARDS 已接入）。
- 🔴 **env 四文件同序同注释**（`.env`/`.env.development`/`.env.production`/`.env.example`，14 变量；`.env.production` 的 parent 白名单刻意留空）；死变量 `VITE_APP_TITLE` 已删（title 走路由 meta）。

- 🔴 **view ≡ pkg**：`'base'` **不是合法 view 名**；版式优先级 `?view=` > 包声明 > `VITE_<PAGE>_VIEW` > 包名；URL 显式非法值**不回退**。🔴 **设备平级** `mobile|standard|mini|tablet`（mini 独立）⇒ 加设备改 `devices.ts`+写容器。
- 🔴 **配色/样式**：注册表键**四段**（包/设备/页面/配色）**每版式各一份**；`isDark = tone`、跨设备回落**先按同系别**；URL `?theme=`/`?skin=` **设备无关**；🔴 scoped 禁 `:global(.dark) X` ⇒ **`.dark X`**；black = `#000000` 且两个 bg **同时**设。
- 🔴 **移动端页**：调前先造窄视口并刷新（`宽≥1024 > 窄<768 > UA`）；**三个分发器都要认「mini 来源」**；**URL 不被视口改写**；父 origin 白名单=`parent-origins.ts`。🔴 **设备维度参数唯一入口 `readDeviceParam`**（**空串 = 未指定**）。

## 4. 手法/命令 → **§9**

🔴 ① **禁在 Bash 里 `git rm` src/ 下任何路径**（会递归清空整个 src/）→ `rm <path> && git add -A`。
🔴 ② **safe-delete shim 拦 `rm`/`fs.unlinkSync`**，目录还会 `trash-failed` ⇒ 删/移目录用 **`mv <path> .tmp-probe/`**；`vite build` 须 `--outDir <全新目录>`。
🔴 ③ **同一文件多 Edit 同条消息会静默丢失** → 串行 + grep 复核。④ **Edit 工具对含 `*/` 的多行块易失配** → 用 Python 改。
⑤ **heredoc 写 TS 注释**：`` \` `` 会被当转义**真写进源码**、非 ASCII 可能变乱码 ⇒ 改完必扫 `` \\` `` + `vue-tsc` + 目视。
⑥ 写/核文件行尾只用 Python · **`bash -c` 的 `\n`/反引号被吃** ⇒ 含换行者写脚本文件 · Git Bash 的 `/tmp` ≠ Windows 路径 ⇒ git commit 用**仓内相对路径**的 `-F`。
⑦ **批量改文本的 anchor 只用签名行**（含函数体会插出重复函数体）；脚本注入后必查**块内裸空行**（只清"一侧是 `@` 标签"的，分段空行是有意排版）。
⑧ 🔴 **Bash 的 cwd 每条命令都会重置**（并不持久）⇒ 每条必带 `cd <dir> &&` 或 `git -C <dir>`；漏了会**静默跑在根仓**（把子仓 log/remote 看成根仓的，已误判一次）。
⑨ **Write 工具保留原文件行尾**（原 CRLF 写完仍 CRLF）⇒ 批量写后 Python 核行尾。

## 5. 部署/CI → **§10**

- 🔴 **前端 CI 用 `npm ci`**（`--prefix oauth21`，**必须从仓库根跑**）；lock 全仓入库。
- 🔴 **后端三 job（lint/test/verify）保持 `npm install`**：根 lock 记 `wb-logkit` 为 `link: packages/log`，`npm ci` 建**悬空软链**⇒ERR_MODULE_NOT_FOUND；**禁开 `cache: npm`**。
- 改 `ci.yml`/Dockerfile 前先读 §10（安装三件套 · tini 软链 · secret ≥32 位 · `git archive` 到**仓库外**）。

## 6. retroweb + retrochimera（逆合成工作台）→ **§14~§72**

前端 #7，端口 **5177** `strictPort`；Vue3.5+TS6+Vite8+Pinia+EP2.14。后端 `F:/retrochimera`（`启动后端API.bat`，`models/` 9GB 不入库）。🔴 **禁硬编码盘符**（`RETRO_MODELS_DIR`/`RETRO_MODEL_<KEY>`）·⚠️ 后端改动**须重启**。
🟡 **每个条目末的 §号 = 展开细节在 `MEMORY-details.md`；守门脚本在 `scripts/`（retroweb）或 `.tmp-probe/`。**
- 🔴 **retroweb 是独立 git 仓**（`github.com/yijiu2025/retroweb.git`，`main`）—— 根仓**完全不跟踪**它。🔴 **提交/推送必须在 retroweb 目录里做**；推送判定用 **`git ls-remote origin main`**，不信退出码。

- 🔴 **前端规范单一来源 `.claude/skills/fullstack-rules/`**（**未纳管**⇒只读，改完跑 doctor）。
- 🔴 **入口形态 = `main.ts` 门牌 + `bootstrap.ts` 编排**（四前端统一）。🔴 挂载一律 **`router.isReady().then(mount)` + `.catch` 降级**。→§63.3
- 🔴 **`@author` 只在文件头标**（函数级不加；归属以 `git blame` 为准）+ `@since`。本仓值 `Claude`/`yijiu2025`。→§63.5
- 🔴 **env 类型必须开严格模式**：`interface ViteTypeOptions { strictImportMetaEnv: unknown }`（**interface，非对象字面量**），否则 `ImportMetaEnv extends Record<string,any>` 使声明清单形同虚设。→§63.4
- 🔴 **JSDoc 基线 = 62 个导出函数，`@param`/`@returns`/文件头缺口 0**（2026-10-11）。守门 **`npm run audit:jsdoc`**（`scripts/audit-jsdoc.cjs`，**有缺口 exit 1**）。口径：`@param` 写语义/范围/可选性**不抄类型**；`@returns` **必交代失败路径**（本层大量"失败也 resolve"）；无参不写 `@param`；401 方法要提哨兵。**改脚本时注意**：正则须有关键字白名单、`isExported` 只认末尾 export 块、无参函数先数逗号、文件头扫**整个首块注释**（非固定窗口）、`.d.ts` 豁免。→§73
- 🔴 **api 层三层 → §72**：传输层（`http/`、`retro/client.ts`，判据=**只认有没有收到响应**）/ 业务层（`auth.ts`、`retro/compute.ts`、`retro/llm.ts`）/ 能力层（`capability/`、`session/install.ts`）。`src/api/README.md` 是**人工审查入口**。**入口层不出现任何 store**。
- 🔴 **拆文件后必须重启 dev server**（2026-10-11 白屏）：旧进程模块图仍指向已删文件 ⇒ 404 ⇒ 整个模块图加载失败、`app.mount()` 从未执行。**代码没错，进程老了**。探针 `.tmp-probe/verify-white-screen.cjs`（9 项）；⚠️ 后端 502 属"没数据"**不算白屏**，判暗色白闪要测**第一帧**。→§73
- 🔴 **登录 = iframe 嵌 oauth21 `/mini-login`**：`bind-session` **失败须中断**；宿主 **origin+source 双校验**；弹窗宽 = iframe 内口 1:1（`DIALOG_WIDTH=854`）；`.el-dialog__body{margin:0}`。→§59
- 🔴 **预测两条路**：单步=`/api/jobs`(kind=predict)；「自动往下拆」=**kind=search 搜到底**。`applySearchRoutes` **禁逐路线 adopt**（共享节点互覆⇒树只剩根）。→§45/§61
- 🔴 **工作台 = 标定态/路线态**（`targetSetupOpen`）：可见性只认它；「换目标」须 `reset()`；**解析不建任务**。→§14.4/§37/§61
- 🔴 **端点配置走能力层 `capability/endpoint-config.ts` → §70**：Node 前缀 = `system.json.prefix` + 组前缀（**不是** Python 的 `/api`）；`keys:[]`=显式清空、`undefined`=不动；DAO `mergeKeys` 是安全底线。
- 🔴 **前端不启停模型（`VITE_RETRO_MODEL_CONTROL`）→ §66**：`auto`(直连允许/中转禁止)|`on`|`off`；管住 `warmModel`/`stopModelService`/`loadForward`，但**模型状态展示永远保留**。
- 🔴 **免登录档别走身份切换路径 → §68**：bypass 分支曾调 `setUser`→`syncUserData`→`persist.clear()` ⇒ 每次刷新抹掉 localStorage；现在只写 user + `loadDevUserData()`（只补拉不清）。
- 🔴 **「启用清单」= 部署级模型 key 白名单**（N 个可同时运行、不是单选；至少留一个）。**权限下发已接**（`GET /user/v1/permissions`，deny 优先 + 通配）；免登录档权限走 localStorage `retroweb_dev_permissions`（生产不读）。🔴 **superadmin ⇒ `${appId}_admin`**（角色 code 必须如此；判定用权限码不写死角色）。→§67
- 🔴 **真实模式联调 → §57**：五环缺一即"没数据"不报错（凭据/哨兵/`refreshPersist()`/Node `GET /llm/models`/先跑 `migrate.js`）。**假绿四个**：错误条双容器 · 必打非 401 对照组 · 注入体像真信封 · VITE_ 开关三层钉。
- 🔴 **EP 样式 = 按需**（`importStyle:'css'`，main 不引 `dist/index.css`；`dark/css-vars.css` 必须单独手引）。首屏 CSS 399.5→167.8KB。→§63.2
- 🔴 **401 唯一入口 `intercept401`**：`_retry` 守卫必须记在**请求配置**上（模块状态挡不住，`finally` 早于 replay settle ⇒ 无界重放）。→§63.1
- 🔴 **暗色首屏白闪**：主题要在 `index.html` 内联预置；口径须与 `settings.ts` 的 `readInitial()` **逐字一致**（key `retroweb_theme`、值 `'dark'/'light'`）。→§69
- 🔴 **export 收拢文件末尾（`src/**/*.ts`）**：定义处不写 `export`；末尾 `export {…}`/`export type {…}`（**类型必须 `export type`**）。已有 eslint `no-restricted-syntax` 硬规则。→§64
- 🔴 **多模型并行（走 Node 中转时）→ §65**：模型**加载归 Node 侧**，前端**只问"能不能用"**，允许多模型同时运行；现契约把单模型写死，⚠️ `is_current`/`current` 是死字段。
- 🔴 **「分析模块」键前后端对齐**：现 11 个；**`safety`（过程安全）≠ `toxicity`（物质毒性）**，加模块两侧同改。§16.7
- 其余 UI/画布/断言/搜索预算等细则 → **§16/§22~§36/§41~§47/§54~§55/§58**，未列出的查 details 文件。
