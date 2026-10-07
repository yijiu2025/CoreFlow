# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；见 `MEMORY-details.md`（§即引用；欠账→§21）。**超 ~12KB 静默截断** ⇒ 宁缺勿长。

## 0. 仓库形态 / 发版

- **`packages/log/`、`phonecopy/` 是嵌套仓** ⇒ `status` 恒脏；`release.mjs` 已过滤 ⇒ 不用 `--allow-dirty`。
- 🔴 **`packages/theme-core/` 是 submodule** ⇒ 克隆必须 `--recurse-submodules`。
- 🔴 **oauth21/posecraft/firewall/admin/poseadmin/retroweb 非 workspace 成员**：包靠 **vite alias + tsconfig paths 源码直供**，**禁 `workspace:*`**；装依赖 `npm install --prefix <dir>`；CI `submodules: recursive`。
- **本机 git ref 失灵**：status 谎报 ahead、push 零输出 ⇒ **以 `git ls-remote` 为准**；异常跑 `fix-packed-refs.mjs`。
- **发版**：`scripts/release.mjs` → `--apply`。`feat`→minor；仅 `fix|perf`→patch；破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` 不发。

## 1. 强制约定（违反会红）→ **§1 全表**

- export 收拢文件末尾（仅 src/）· `src` 禁 import `scripts` · `src/app/<A>` 禁 import `src/app/<B>`。
- **测试有效性**：真实加载被测代码；禁手写常量自测/内联复制逻辑；`KNOWN_INEFFECTIVE_TESTS` 只减不增+同步 `FROZEN_SIZE`；**一文件只注册一组路由**。
- 🔴 **鸭子类型判据必须由接口派生**（`Record<keyof T,…>` 再遍历）；手抄成员名⇒判据静默落后。**"长红关卡=噪声"**⇒ 过期关卡**显式退役**。
- 🔴 **拆分/移动源码后，「断言读文件内容」的关卡必须同步文件清单**（已三踩）；🔴 **新目录进 lint 范围前先配语言环境**。
- 🔴 **构建期配置必须进类型检查**：Vite8=**Rolldown+Oxc**，`esbuild.drop` **已失效** ⇒ 用 `rolldownOptions.output.minify.compress.dropConsole`。
- 🔴 **路径别名单一来源 `oauth21/config/aliases.ts`**（改别名**两处同改**；JSONC **禁正则剥注释**）；🔴 **`skinsuite`/`stable-deviceid` 零外部 import**（包内 `import vue` ⇒ **两份 Vue**）。
- 🔴 **外部边界类型只收在 `src/types/external.ts`**（`declare global` + zod，禁 `any`）。
- 🔴 **前端类型闸门**：裸 `vue-tsc` 恒 exit 0 ⇒ 口径 **`vue-tsc -b`**。
- 🔴 **多主题/多版式**：token 基线 → 皮肤 → 版式三正交；**目录名即 id**（坏目录静默跳过）；**业务只在容器**，版式只读 `ctx`/`ctx.actions`。
- 其余（firewall 分层 · 文档≠实现 · 审查唯一入口 + L3 禁提）→ §1 全表。

## 2. 后端陷阱速查 → **§12**

`getModel` TypeError · `getStore` 命名空间 · 禁 `bcryptjs` · 禁 `*Sync(` · `underscored:true` · `process.exit` 伪装绿 · register 只认 `username` · Fastify（`onRoute`/`preClose`）· Redis v5（驼峰/`duplicate()` 不建连）· Guard（`restore()` 清表）。

## 3. oauth21 → **§11/§13/§17**

- 🔴 **设备平级** `mobile|standard|mini|tablet`（mini **独立**）⇒ 加设备改 `devices.ts`+写容器。🔴 **view ≡ pkg**：`'base'` **不是合法 view 名**；版式优先级 `?view=` > 包声明 > `VITE_<PAGE>_VIEW` > 包名；URL 显式非法值**不回退**。
- 🔴 **配色/样式**：注册表键 **四段**（包/设备/页面/配色）**每版式各一份**；`isDark = tone`、跨设备回落**先按同系别**；URL `?theme=`/`?skin=` **设备无关**（否则同系别回落且**不写** `data-mauth-theme`）；🔴 scoped 禁 `:global(.dark) X` ⇒ **`.dark X`**；black = `#000000` 且两个 bg **同时**设。
- 🔴 **设备维度参数两侧同形**：唯一入口 `readDeviceParam`（**空串 = 未指定**）。🔴 **移动端页**：调前先造窄视口并刷新（`宽≥1024 > 窄<768 > UA`）；**三个分发器都要认「mini 来源」**；**URL 不被视口改写**；父 origin 白名单 = `utils/parent-origins.ts`。
- 其余（`validateField` 不跑 zod object 级 refine · 新 watch 取旧值须显式传）→ §11/§13。

## 4. 手法/命令 → **§9**

🔴 ① **禁在 Bash 里 `git rm` src/ 下任何路径**（会递归清空整个 src/）→ `rm <path> && git add -A`。
🔴 ② **safe-delete shim 拦 `rm`/`fs.unlinkSync`** → 删文件用 **`mv <path> .tmp-probe/`**；`vite build` 须 `--outDir <全新目录>`。
🔴 ③ **同一文件多 Edit 同条消息会静默丢失** → 串行 + grep 复核；块注释禁 `*/` 紧邻。
其余（ESLint `--ext` 静默失效 · **写/核文件行尾只用 Python** · **`bash -c` 的 `\n`、`git commit -m` 的反引号**被吃 ⇒ 含换行/反引号者写**脚本文件**）→ §9。

## 5. 部署/CI → **§10**

- 🔴 **前端 CI 用 `npm ci`**（`--prefix oauth21`，**必须从仓库根跑**）；lock 全仓入库。
- 🔴 **后端三 job（lint/test/verify）必须保持 `npm install`**：根 lock 记 `wb-logkit` 为 `link: packages/log`，`npm ci` 建**悬空软链** → ERR_MODULE_NOT_FOUND；**不能开 `cache: npm`**。
- 改 `ci.yml`/Dockerfile 前先读 §10（安装三件套 · tini 软链 · 生产 secret ≥32 位 · 复刻树 `git archive` 到**仓库外**）。

## 6. retroweb + retrochimera（逆合成工作台）→ **§14~§42**

前端 #7，端口 **5177** `strictPort`；Vue3.5+TS6+Vite8+Pinia+EP2.14。后端 `F:/retrochimera`（`启动后端API.bat`；`models/` 9GB 不入库）。🔴 **禁硬编码盘符**（`RETRO_MODELS_DIR`/`RETRO_MODEL_<KEY>`）·⚠️ 后端改动**须重启**。
- 🔴 **前端规范单一来源 `.claude/skills/fullstack-rules/`**（**未纳管**⇒只读；改完跑 `doctor.mjs`）。
- 🔴 **登录 = iframe 嵌 oauth21 `/mini-login`**：`bind-session` **失败必须中断**；宿主 **origin+source 双校验**；dev/生产白名单都要有 5177（空白名单放行 ⇒ 本地无感、上线才炸）。
- **预测 = 多次一步**：只调 `/api/predict`，**不调** `/api/search`；proxy `/retro/* → /api/*`。**TS6**：`paths` 非相对需 `baseUrl` + `"ignoreDeprecations":"6.0"`；`http.ts` **别**动态 import store ⇒ `setUnauthorizedHandler()`。
- 🔴 **工作台 = 标定态 / 路线态**（`targetSetupOpen`）：ⓐ 可见性判据**只能 `targetSetupOpen`**；ⓑ **解析成功 ≠ 开跑**；ⓒ「换目标」须 `reset()`；ⓓ **居中靠脱离文档流**；ⓔ **`mainTab` 三处复位**；ⓕ 🔴 **解析不建任务**（生于 `closeTargetSetup()`；`persistSession` **无归属不落盘**；草稿**打开 vs 刷新**落点一致）·ⓖ 🔴 **同阶段起跑线落点同源**。`verify-parse-notask.cjs`/`verify-auto-jump.cjs`。§14.4/§37/§39
- 🔴 **路线方案/AI 分析**：① 地基=确定性 `reactionIdFor(nodeId,precursors)`；② 切方案=`detached:true` **不删树**；③ 改已保存方案**须 fork**；④ AI = **POST+fetch SSE**，**质量数 RDKit 算、LLM 只解读**；守门 `test:store`；⑤ LLM 三步排查见 §25；推理模型只吐 `reasoning_content`（须发 `thinking`）。
- 🔴 **追问（§18.3）**：上下文复用 `build_messages(json_footer=False)`；自由文本必须 **`_body(json_mode=False)`** 关 `response_format`；一次一条 + ≤10 条；`cur()` **每次重新 find**。
- 🔴 **候选条件（§19）**：枚举 → 选定 → 分析带 `chosen_condition` **锁定**；🔴 **`_norm_conditions` 先滤非对象再截断**；🔴 **重分析必须保留 `condOptions`/`chosenConditionId`**。
- 🔴 **端点配置（§20）**：`base_url`+`model`+`keys` **绑一套**、可存多套（`profiles[]`）；**读时懒迁移**老扁平结构；🔴 **Key 轮换状态按配置分桶**；🔴 **落盘只写新形态**、**扁平 payload 只并进激活那套**；「使用中」= 下标起**首个可用** key；`mask_key` **必须保尾部**；🔴 前端须容忍后端旧版（无 `profiles`⇒**白屏**）。
- 🔴 **LLM 面板/拉模型（§25/§27）**：同一状态**两处口径不一**⇒先打两个真值；真凶常是环境变量**单复数拼错**（`…_KEYS` vs `…_KEY`）⇒ 静默返回空；key 真值 3 处（`key_pool`/`_pool_keys`/`_profile_creds`）**都回落 `.env`、仅激活那套**；每把标 `source`；`.env` 那把删不掉⇒无删除按钮、保存能**认领**；多 key **401/403/429** 才轮换；「刷新」=**只读配置**+有改动**先确认**。守门 `verify-llm-{refresh,models}.cjs`
- 🔴 **侧栏（§22/§26/§28/§30）**：顺序=导航→**最近的任务**→**目标分析**，同在 `.app__side-scroll`（**禁内嵌滚动**）；同目标可确认**多条**「已确认路线」；`confirmRouteNetwork()`（改过已定步骤**自动分叉**）≠ `confirmScheme` ≠ `unconfirmRouteNetwork`；🔴 共用 `networkStats`；`sessionSignature` **须带 confirmed**；🔴 **整行热区**一致⇒行 click + 操作区 `@click.stop`；🔴 计数 = **本组条数**（`verify-side-scroll.cjs`）；**「目标分析」卡 → §35**（**无「切换目标」**、明细**结构式**+行尾**定宽**；`verify-targetbar-stepmol.cjs`）
- 🔴 **断言与探针（§24/§25.8/§28.3/§33）**：同一份数据**只许画一遍**；**主指标须脱离灰色小字**；**`tabular-nums` 只保等宽内对齐**⇒先给兄弟定 `min-width`（`verify-scheme-merge.cjs`）；🔴 **新增断言须"改回旧写法确认会红"**；🔴 **探针会崩** ⇒ `st[0] if st else {}` + `.get()`；🔴 **反向证明前先证"加载的是旧代码"** ⇒ `touch`+**读 dev 模块验特征串**；🔴 **探针锚点须新旧两版都有**（否则**首段崩**）；🔴 **替换禁空串**（`count('')`⇒必炸）；🔴 **可见性判据用 `elementFromPoint`**。
- 🔴 **后端只提供 API**。**Windows spawn 死锁修复不可回退**：模型在独立**非守护单线程** `Process`（`_REQ_Q`/`_RESP_Q`）；**"代跑 app.py"的启动器须注册 `sys.modules['__main__']`**；**`.bat` 改完验 BOM**。
- 🔴 **解析/画板/网络层/CAS → §16/§34**：RDKit（**CDXML 必须回落后端**）· Ketcher 3.14 四约束（§16.5）· `_request()` 档序由 **`RETRO_LLM_PROXY` 三态**定。🔴 **CAS = PubChem（§34）**：**POST 表单**（GET 遇立体化学 `/` 被拒 400）· 404 = 未收录 · CAS 混在 synonyms · 查不到**删整块**。守门 `verify-mol-cas.cjs`
- 🔴 **UI 细则 → §16.2/16.3/18.1/§23**：防跳位 = `Session.sig` 指纹（§18.1）；标定态「换目标/新任务」**禁 filter 删上一条会话**；DOM 三坑 §16.3；🔴 **收起/展开不得改控件位置**：贴底页脚**禁靠可伸缩兄弟顶住**、含可隐藏文字的按钮**须定高**（`verify-collapse-stable.cjs`）。🔴 **`<td>` 禁 `display:flex`**（⇒**分隔线断两截**）⇒flex 挂**内层 div**；`verify-tbl-lines.cjs` §38
- 🔴 **画布拖动/缩放（§29/§36）**：偏移只一套（`sizer=max(画布×zoom,容器)+2×余量`；**余量省不得**⇒缩图后 **拖不动**）；滚轮**手动注册非被动**+`preventDefault()`；缩放**先同步写 sizer 再设 scroll**；容器链须**确定高度**⇒否则与 `max(画布,容器)` 互撑成**几万 px**；懒页签⇒fitView **首次可见**补。守门 `verify-canvas-fit.cjs`
- 🔴 **方案栏的收与位（§32/§33）**：「目标分析」页签**整条收起**（留下那处须带**主指标**）；其余页签夹在**页签与内容之间**—EP 默认插槽整块进 `.el-tabs__content` ⇒ 放"页签后、首 pane 前"。🔴 **位置类报障量「顺序」不只「存在」**（DOM 序+几何链同量；改结构先 grep）
- 🔴 **行内 chip 行（§41/§42）**：禁竖排（撑高行+撑等宽）；`el-dropdown` 挂 pill **外层**才是整块热区；**EP 下拉不吃 Escape**。🔴 菜单项类名=`el-dropdown-menu__item`**（写错⇒空集**假绿**）；🔴 同页 7 个 `.el-dropdown-menu` 全预渲染，可见性只在**祖先** `.el-popper`（筛可见）；🔴 断言禁**绝对**行高 ⇒ 用**量化不变式**。守门 `verify-steprow-tags.cjs`
- 🔴 **「分析模块」key 前后端必须对齐**（`ALL_ANALYSIS_MODULES` ↔ `_MODULE_FIELDS` 同序）；加模块两侧同改；现 9 个含 **`workup`**（与 `conditions.workup` **分别渲染**）；断言 `_build_system` 只看 **`split("\n\n")[-1]`**。§16.7
