# Changelog

本仓库（CoreFlow）遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：major（破坏性变更）/ minor（新增功能，向后兼容）/ patch（修复）。

> 子前端（oauth-web、retroweb、posecraft 等）各自维护独立的 CHANGELOG 与 tag 线，不在本文件内记录。
> 发版流程见 `docs/standards/git-release-rules.md` 与 fullstack-rules 技能的 `references/release-checklist.md`。

## 未发布（Unreleased）

## 2.32.0 — 2026-11-07

### 变更（v2.32.0 候选）

> 本版本自 v2.31.4 起累计 74 个提交（含防火墙挑战链、oauth21 配置热改等此前
> 累积变更，逐条清单见同版 GitHub Release 说明）；下表为全量人工安全审查后
> 修复的重点条目。

- **fix(oauth21)**：设备授权页两处生产不可用缺陷——内联提交脚本补专属 CSP
  （nonce 与响应头配对下发，原先被全局 `script-src 'self'` 拦死）、授权端点
  从硬编码路径改为渲染时注入本页真实地址（原先必 404）。
- **fix(oauth21)**：令牌撤销按 RFC 7009 §2.1 绑定客户端归属（原先任意客户端
  可吊销别家客户端签发的 refresh token）；PKCE 比较改常量时间实现。
- **fix(notice)**：SMTP 授权码不再明文回显管理端（读接口下发掩码、保存接口
  对掩码跳过更新）；移除"邮件下发明文新密码"的遗留默认模板。
- **fix(posecraft)**：预览 SVG 的用户字段全部消毒（数值夹取 / 颜色 `#hex`
  白名单 / path 字符集白名单 + 限长），堵住属性逃逸型注入；上传改流式边收
  边拒（原先 200MB 以内整包进内存才做 10MB 校验）；文件落盘补越界自检。
- **fix(auth)**：TOTP 动态截断改用合并默认值后的位数配置（原先调用方只传
  部分配置时恒产出 "NaN" 验证码）。
- **refactor(user)**：删除不可达的登录签发死代码（引用未定义全局与无人配置
  的 JWT 环境变量），应用隔离守卫白名单同步修剪；用户名更新补 1-50 长度校验。


## 2.31.4 — 2026-11-02

### 变更（v2.31.4 候选）

- **fix(firewall)**：**限流链路首次真正生效**。插件注册不再被 `enableRateLimit`
  提前 return 掐死（改为「有一个开关打开就注册」，`global` 只跟随 `enableRateLimit`；
  端点级关闭时在注册前用 `onRoute` 钩子摘掉路由上的 `config.rateLimit`）。此前全仓
  14 处 `config.rateLimit`（含 h5-token 的 `groupId` 计数隔离）从未生效过。
- **fix(firewall)**：删除自研 ZSET 滑窗（`consumeRateWindow` / `LUA_RATE_WINDOW` /
  `rel.rateLimit`），计数统一交给 `@fastify/rate-limit` 的 `createRateLimit`；超限才
  `setBlock` 并抛 429 —— 封禁键改用**真实 IP**（原先把 `<路径>:<ip>` 当 IP 写入，
  永远匹配不到，端点限频的自动封禁从未落地）。同时删除整套空转的
  `defense.endpointRateLimits`（三条规则的 path 在现存路由里一条都不存在）。
- **fix(firewall)**：公开端点补独立 `groupId` 限流 —— `bind-token` / `bind-session`
  30 次/分、oauth `token` + `revoke` 60 次/分、device 流程 20 次/分、
  `challenge/verify` 20 次/分。
- **fix(redis)**：`ResilientStore` 三处语义偏差 —— 窗口取插件传入的 `timeWindow`
  （此前恒用全局配置，路由声明形同装饰）、只在窗口创建时 `PEXPIRE`（此前每请求续期，
  客户端持续重试则永不恢复）、`child()` 共享 `memoryFallback`（此前降级模式按路由
  各算而 Redis 模式共享，属语义分裂）。
- **refactor(firewall)**：`app/firewall` 归还 **10-apps** 按应用约定注册
  （`config.init` → `firewallAppInit`），`05-firewall` 只注册防护核心、不再反向 import
  app；配置读取下沉 `framework/firewall/config/persisted.js`，依赖方向恢复单向
  （app → framework）。`util/redis.js` 拆为 `lua-scripts` / `redis-keys` /
  `redis-memory` 三模块，对外 API 与 import 路径不变。
- **fix(firewall)**：内存无界增长三处 —— 遥测 `ipStats`（上限 2000）与 `pathStats`
  （上限 500 + 路径长度上限）此前可被随机路径扫描 / 海量源 IP 撑爆，`pendingDelta`
  同步裁剪；连接追踪清理任务改为「单轮失败不断链」（自续 `setTimeout` 抛错会永久
  停摆，表从此无人回收）；限流器缓存封顶 32。
- **fix(auth)**：h5-token 限流计数按 `groupId` 独立核算；`session/` 与 `security/`
  深度检查修复（会话生命周期、H5 签名双通道与引导收口）。


## 2.31.0 — 2026-11-01

### 变更（v2.31.0 候选）

- **feat(redis)**：`getStore` 新增 `{ memory: true }` 选项——强制进程内 MapStore，
  数据严格单实例、永不进 Redis。补全存储工厂语义矩阵（`backup`=要高可用跨实例共享，
  `memory`=要进程本位）；默认 `false`，既有调用方行为不变。
- **feat(auth)**：封禁负缓存切换 `getStore('auth_ban_neg', { memory: true })` 并修复
  历史缺陷——负缓存 Map 此前从未有读路径（"30s 内不再打 Redis"从未生效），本次补上
  读路径（`getBanInfo` 公共底层，session 认证热路径"零额外 Redis 读"首次兑现）、
  删除手写过期逻辑（改用 MapStore 惰性清理 + 兜底清扫 + 容量上限）、fail-open 不缓存、
  封禁/解封事件对本进程即时失效。新增 2 回归用例钉契约。
- **refactor(auth)**：模块拆 7 个职责子目录（context/session/permission/device/risk/
  security/audit），`index.js` 收拢为纯门面（141 个分类命名导出）；业务代码统一走门面，
  测试直连叶子文件，auth 内部相对互引禁碰 index（防环）。

## 2.30.0 — 2026-11-01

### 构建 / 运行时

- **Node 下限 20.19 → 24**：`engines` 改为 `>=24.0.0`，新增仓库根 `.nvmrc`（内容 `24`），
  CI（`.github/workflows/{ci,docs}.yml` 的 `NODE_VERSION`）与 `Dockerfile`
  （`ARG NODE_VERSION`）同步升到 24。
  原因不是"24 更新"，而是 `geoip-lite@2`（防火墙的运行期依赖）**声明 `engines >= 24`**，
  而 CI 与镜像一直在 22 上跑 —— 那只是"还没走到被版本门控的路径"，
  声明与实际运行不一致才是真风险。对齐后 `npm install` 不再刷 EBADENGINE。
  > 没有写 `BREAKING CHANGE` 走 major：本仓是应用不是库，版本号不对运行时兼容性做对外承诺。
  > **部署方需要把基础镜像 / 宿主 Node 一起升到 24**，这一条写在这里，不靠 semver 去猜。

### 依赖

- **Dependabot 恢复可用**（此前它自己就是坏的）：
  - `.github/dependabot.yml` 的 `groups.<name>.update-types` 写成了 `version-update:semver-*`
    （那是 `ignore` 的写法），GitHub 直接判配置非法 —— **分组从 2026-10-16 起从未生效**，
    每次推送都挂一个「contained invalid details」的红检查。改成 `minor` / `patch` 后恢复正常。
  - `uuid` 的 override 由写死的 `^11.1.1` 改成引用式 `"$uuid"`：它既是直接依赖、又被 override
    钉住，Dependabot 想把 uuid 推大版本就会撞
    `Override for uuid@14.0.3 conflicts with direct dependency`，导致整批更新 job 失败。
    `$uuid` 由 npm 解析时展开为直接依赖的声明值，"顶掉 sequelize 的 uuid@8"效果不变。
  - `minimatch` / `glob` / `deepmerge` 加入 `ignore` 并写明解除条件：这三条在 devDependency
    里没有可行修复路径（唯一"修复"要降级 eslint，或要 rimraf 放弃 `glob.sync`），
    跑一次红一次纯噪音；**生产链路早已是 0**。
- 合并两个 Dependabot 分组 PR：生产 7 个 minor/patch（@fastify/cookie / cors / helmet /
  websocket、light-my-request、pino-pretty、umzug）与开发 7 个（eslint 10.13、jest 30.5、
  prettier 3.9 等）。全量 `npm audit` 29 条，**0 high**。

### 修复

- **防火墙封禁元数据的时间来源不唯一**：`rate-limiter.js` / `scan-trap.js` / `monitor.service.js`
  里 `createdAt` 与 `expiresAt` 各自取一次 `Date.now()`，二者可能差 1ms，
  使"封禁时长 = expiresAt - createdAt"这个不变量在边界抖动（Node 24 上实测让
  `rate-limiter.test.js` 偶发失败：期望 120000，实得 120001）。改为同一个 `now` 推导。

### 安全

- **机密扫描告警 1 → 0（误报，证据留档）**：`google_api_key` 指向 6 个 `.bin` 模型权重文件，
  实际内容是保存下来的 **Kaggle 页面**（5401 字节 HTML），其中的 key 属 Kaggle 自己的公开前端
  key（`projectId: kaggle-161607`），不是本仓凭据、也无法由本仓吊销。按 `false_positive` 关闭并写明依据；
  该批文件已在 `c7f08d82`（2026-10-31）随 `public/` 历史产物一起删除，`git grep` 确认 HEAD 中已无此串。
- **新增载荷形状守卫** `src/utils/payload-guard.js`：只看开头 256 字节判断"这是网页不是数据"；
  `scripts/download-models.js` 在写盘前调用它，并保留 `content-type` 作第一道闸门。
  这条事故的根因正是"下载只看 HTTP 状态码"——地址返回登录页时会把 HTML 原样写成 `.bin`。
  配套 9 例测试（含"二进制里偶然出现 `<html>` 不误判"与"脚本确实调用了守卫"）。

## 2.29.7 — 2026-11-01

### 依赖安全

- `@babel/core` 7.29.0 → **7.29.7**（GHSA-4x5r-pxfx-6jf8：sourceMappingURL 任意文件读取），
  由 `overrides` 顶到首个修复版之上。仅 jest 覆盖率插桩使用；`jest --coverage` 实测仍正常。

### 仓库治理

- **Dependabot 开放告警 296 → 0**。三分之二根本不是"现存漏洞"，而是仓库结构变化后没人清理的残留：
  - **169 条**挂在已删除的清单文件上（`firewall/` / `admin/` / `poseadmin/` / `posecraft/` 的
    `package-lock.json`）。这些前端工程 2026-10-31 已移出本仓，按 `not_used` dismiss，
    理由写进每一条告警。
  - **127 条**挂在根 `package-lock.json` 上，逐条与当前 lock 比对后：**20 条依赖已不存在**
    （`not_used`）、**92 条已被 v2.29.4–v2.29.7 的升级修掉**（`fix_started`）、
    **12 条 vite 告警判据错位**（区间是 `>=8.2.0,<=8.2.3` / `>=8.3.0,<=8.3.2`，
    当前 lock 里是 6.4.5 → `inaccurate`；Dependabot 快照仍记着已移除工作区的 8.2.2/8.3.1）、
    **1 条 deepmerge 无上游修复版**（`tolerable_risk`：仅 jest-config 合并静态配置）。
  - 处理前先按 `vulnerable_version_range` 逐条比对再 dismiss —— 第一版判据用的是
    "所有副本里的最小版本"，把 eslint 内部的 ajv 6.15.0 也算进了 `>=7` 的公告，
    属于误判，已重开并改写理由。**dismiss 的理由必须能被复核**，否则等于把告警静音。

### 工具

- **`bumpChangelog` 的顺序缺陷**：提升「未发布」后，重建的空占位块被放在新版本**下面**，
  于是下一次发版在原地提升它 → 新版本落到旧版本下方（实测已产出 2.29.6 / 2.29.7 的乱序）。
  改为占位块始终在最上方；补一条"连续两次发版仍保持从新到旧"的回归用例。

## 2.29.6 — 2026-11-01

### 依赖安全

- **生产依赖漏洞 5 → 0**。剩余 5 条 moderate 的"自动修复建议"都是错的（让 @fastify/static 降到 6、
  让 sequelize 降到 3.30.0），逐条按真实调用点验证后处理：
  - `@fastify/static` → `glob 13.0.6`（GHSA-3g3m-2fjr-6pw4：AbortSignal 取消绕过 ⇒ 超时后仍可
    遍历文件系统）→ `overrides: { "@fastify/static": { glob: "^14.0.3" } }`。
    **只对这一个父包作用域化**：全局把 glob 抬到 14 会打碎 `rimraf@3` / `test-exclude` 依赖的
    `glob.sync`（v9 起已移除）。`wildcard: true` 那条 `glob('**/**')` 分支已实测：命中 200、
    不存在的文件 404。
  - `sequelize` → `uuid 8.3.2`（GHSA-w5hq-g745-h8pq：v3/v5/v6 传 buf 时缺边界检查）
    → 全局 `uuid ^11.1.1`。sequelize 只调用 `require('uuid').v1/.v4`，v11 同名导出；
    实测 `DataTypes.UUIDV4` 默认值仍能生成。
  - `glob` → `minimatch`（GHSA-g3hv-75wg-m249：globparts 放大的 DoS）由 glob 14 自带的
    `minimatch ^11` 一并解决。
- **docs 站点链路**：`vue` / `@vue/server-renderer` 3.5.38 → **3.5.44**（XSS：attribute-name
  黑名单缺 CR）、`vite` 5.4.21 → **6.4.5**（优化依赖 `.map` 路径穿越等 8 条）、
  `follow-redirects` 1.16.0 → **1.16.2**（跨域凭据头剥离失效）、`js-yaml` 3.14.2 → **4.3.2**
  （merge-key 二次复杂度 DoS；调用方用的是 `yaml.load()`，v4 同名导出）。
  vite 6 与 vitepress 1.6.4 的兼容性已实测：文档站构建通过（`dist/en/` 19 页）。
- **踩到的坑**：一开始也把 `minimatch` 全局抬到 11 —— `npm audit` 确实更干净，但
  `jest --coverage` 直接崩在 `generateEmptyCoverage`（`minimatch is not a function`）：
  v11 的 CJS 导出形态变了，`test-exclude` 仍按函数调用。**审计数字好看 ≠ 工具能跑**，
  所以撤掉那条 override，只让 glob 14 自带新版 minimatch。
- 结果：`npm audit --production` **0 条**；全量 43 → **33 条，全部 dev-only**
  （jest 30 → glob 10.5.0、eslint 10 → minimatch 10.2.5、`@babel/core` low、`deepmerge` low）——
  根因是 jest / eslint 自身尚未升级它们的 glob / minimatch，需等上游 major，不在本仓可控范围。

### 工具

- `jest.config.js` 的 `collectCoverageFrom` 修正：旧配置指向 `src/auth` / `src/firewall/engine` /
  `src/redis` / `src/log`，这四个目录在 framework 重整后已不存在 ⇒ `--coverage` 实际只统计
  `src/api`，覆盖率数字是**假的高**。改为按当前结构收集（api / app / framework / utils / shared）。

## 2.29.5 — 2026-10-31

### CI / 代码扫描

- **CodeQL 从托管 default setup 改为仓库内 advanced setup**（`.github/workflows/codeql.yml`）。
  托管模式的真正问题是**失败不可诊断**：语言列表由 GitHub 托管，出问题时 Security 页面只给
  一句「Code scanning configuration error」，没有任何日志。现在语言集合
  （`javascript-typescript` + `actions`）、权限（`security-events: write` / `actions: read`）、
  触发条件与并发全部可 review、可 diff、失败日志在 Actions 里。
  配套把 default setup 置为 `not-configured`（两者并存会互相冲突）。
  - 坑：`queries: default` 是**无效输入**（只接受 extended / quality / query pack 名），
    会让 Initialize CodeQL 直接失败 —— 想用默认套件就不要写这个 input，已写进文件注释。
- **修掉 3 条真实代码扫描告警**：
  `scripts/release*.mjs` 的 `name.replace('/', '%2F')` 只替换第一处 `/` → 改 `replaceAll`；
  `oss.service.js` 用 `url.includes('aliyuncs.com')` 判断 OSS 地址（`https://evil.com/?x=aliyuncs.com`
  也为真）→ 改为 `new URL()` 解析后 **hostname 精确比对** + 强制 https + key 非空，
  并新增 `src/__tests__/app/user/oss-url.test.js`（10 例）把判据钉死。
- **4 条 `js/missing-rate-limiting` 按误报 dismiss**，理由写进告警本身：它们指向的是
  `app.addHook('onRequest'|'onClose')` 与限流中间件自身，不是路由 handler；
  全局限流由 `@fastify/rate-limit` 在 05-firewall loader 注册（600 次/60 秒/键）。
- 结果：代码扫描告警 **6 fixed / 4 dismissed / 0 open**。

## 2.29.4 — 2026-10-31

### 依赖安全

- **根因先修：`workspaces` 里还挂着三个已迁出的前端目录**（`oauth21` / `posecraft` / `firewall`）。
  npm 因此仍把整个前端依赖树（vue / vite / tensorflow / echarts / fabric…）算进 lock 与审计结果 ——
  Dependabot 的绝大部分告警来自这里，与本仓后端无关。移除这三个 workspace 名并重建 lock 后，
  lock 条目 1675 → 878，**审计从 296 条降到可治理的量级**。
- **生产依赖：21 条（9 high）→ 5 条（0 high，全 moderate）**：
  `fastify` 5.8.5 → 5.12.7（含 `find-my-way` / `fast-uri` 等传递依赖）、
  `@fastify/static` 9.1.3 → 10.1.8（修「Authorization Bypass via Non-Canonical URL Paths」）、
  `@fastify/multipart` → 10.1.6（含 `@fastify/busboy` 3.2.x DoS 修复）、
  `nodemailer` 8 → 10.3.1、`sharp` 0.34 → 0.35.5、`mysql2` → 3.24.6（解压炸弹 DoS）、
  `geoip-lite` → 2.0.3。
- 用 `overrides` 固定补丁级安全修复（同 major，语义兼容）：
  `@fastify/busboy ^3.2.1`、`brace-expansion ^5.0.6`、`fast-uri ^3.1.4`、`ajv ^8.18.0`
  （`$data` ReDoS）、`fast-copy ^4.1.0`、`moment ^2.31.0`。
- 🔴 **Node 版本下限抬到 20.19**（`package.json` 新增 `engines`）：`@fastify/static@10` 依赖
  ESM-only 的 `content-disposition@3`，需要 `require(esm)` 支持，Node 18 起不来。
  CI 与镜像本来就用 Node 22，行为未变；README / 快速上手 / 技术栈表已同步。
- 仍保留的 5 条 moderate 已在 roadmap 记录成因：`@fastify/static`→`glob 14` /
  `minimatch 11` 需跨 major；`sequelize`→`uuid` 的"修复建议"是降到 3.30.0（等于拆库，不采纳）。
- 测试侧：`exceptions.test.js` / `proxy-trust.test.js` 对 `@fastify/static` 用空插件替身 ——
  jest 的 CJS 运行时无法 `require(ESM)`，而这两个套件只验证错误处理器与代理信任判定；
  真实静态服务链路由 CI 的 compose 冒烟覆盖。

## 2.29.3 — 2026-10-31

### 文档

- **文档体系重构（前后端分家后的收口）**：18 篇描述已迁出前端工程的规范与接入模板移入
  `docs/archive/legacy-frontend/`（带弃用横幅 + 索引），`standards/` 由 16 篇收敛到 2 篇 +
  最佳实践，侧边栏 8 组 → 7 组；归档文档的相对链接按「迁移前基准目录」重算（56 处修正、
  25 处目标已不在本仓的降级为行内代码）。
- **修掉与实现相反的事实错误**：`security.md` 的「使用 bcryptjs 做密码哈希」（实际是 scrypt，
  bcrypt 只做历史校验 + 登录后透明升级）、签名时间窗 5 分钟（实际 2 分钟）、
  `SCRYPT_CONCURRENCY`（实际 `SCRYPT_MAX_CONCURRENCY`）、不存在的 `SSO_READY` 握手名、
  `StpUtil` 导入路径、注册端点 `/user/v1/open/register`（实际 `/user/v1/register`）、
  admin 用户管理 `/admin/v1/iam/users`（实际 `/admin/iam/v1/users`）、
  roadmap 的「Docker 化未实现，仓库内没有 Dockerfile」（早已实现）。
- **文档站双语（中文为主语言，新增 `/en/` 英文站）**：`config.ts` 改为 `locales` 结构，
  中英各自的 nav / sidebar / footer / 搜索与组件文案分开；英文侧边栏只挂已翻译页面；
  新增 7 篇英文页（index / introduction / quick-start / project-structure / architecture /
  auth-integration / docker）与 [翻译状态页](https://yijiu2025.github.io/CoreFlow/en/translation-status)。
- **双语 README（英文为主）**：`README.md` 为英文主入口、`README.zh-CN.md` 为中文版，
  顶部互加语言切换；`doc-links` 关卡的扫描根补上中文版，避免其链接静默腐烂。
- `.env.example` 补「资源闸门」段：`SCRYPT_MAX_CONCURRENCY` / `BCRYPT_MAX_CONCURRENCY` /
  `CAPTCHA_MAX_ATTEMPTS`（都是代码真实读取、此前模板缺失的开关）。

### 工具

- `scripts/release.mjs` 发版时**同步 `package-lock.json` 的根版本号**（顶层 `version` 与
  `packages[""]`）。此前只 bump `package.json`，lock 会一路落后（实测脱节过两个版本，
  容易被误判成"依赖没装对"）。只做文本替换且要求上一行是 `name` 锚点，
  绝不触碰 `packages` 里同版本号的三方包。

## 2.29.2 — 2026-10-31

### 仓库

- **AI 工具目录脱库**：`.claude/`（含 `skills/fullstack-rules` 整套技能、plans、agents、
  `settings.local.json`）、`.codebuddy`、`.codegraph`、`.mimocode`、`.v2c`、`.video_agent`、
  `.zcode` 共 47 个文件移出索引。**根因是 `.gitignore` 对已跟踪文件无效** —— 规则早就写了，
  但这些文件入库在规则之前，所以一直没生效。本地文件与历史提交完整保留。
- **前端工程脱库**：`posecraft/`（162）、`admin/`（18）、`poseadmin/`（31）、`firewall/`（67）
  共 278 个文件移出索引（`oauth21/` 早于 986e34e 已脱库）。本仓只做后端，
  `ci.yml` 与 `.dockerignore` 本就把这些前端工程排除在 CI 图与镜像之外。
- **移除失效 submodule**：`phonecopy` 目录里只有一个空 `.git/`（从未真正初始化），
  却仍挂在 `.gitmodules` 上 → 别人 `clone --recurse-submodules` 会去拉一个用不上的仓库。
- `.gitignore` 补齐 `/posecraft/`、`/admin/`、`/poseadmin/`、`/firewall/`、`/phonecopy/`。

> 以上均为「只删索引」：本地目录照常可用，`git checkout <旧提交> -- <路径>` 可取回。

### 修复

- **`package-lock.json` 与 `package.json` 版本脱节**：发版脚本只 bump `package.json`，
  lock 的 `version` 落后两个版本 → 同步为当前版本（三方包 `nan@2.28.0` 不受影响）。
  同时带上一次 `npm install` 的 devDeps 刷新，使 lock 的 `workspaces` / `dependencies` /
  `devDependencies` 与 `package.json` 完全一致。
- **`packages/theme-core` submodule 指针漂移**：本地 checkout 比父仓记录点领先 1 个提交，
  属工作区漂移而非有意升级 → 复原到父仓记录点，不擅自推进主题版本线。

### 工具

- `scripts/release.mjs` 新增 `--kind <major|minor|patch>`：本次改动只有 chore 类提交
  （按规则「不发版」），但仓库结构变更需要可交付的 tag。该参数是**显式逃生门**，
  触发与提交类型不一致时会打印覆盖告警，避免变成绕过版本规则的后门。

## 2.29.1 — 2026-10-31

### 修复

- **CI 上真身驱动的签名/登录用例拿到 503**：`REDIS_ENABLED=true` 但没有 Fastify 插件跑过时，
  `getStore()` 按设计抛 `RedisRequiredError(503)`（fail-fast，不静默退回内存）。
  `integration/signature.test.js` 与 `service.test.js` 补上
  `isRedisConfigured() ? connectTestRedis() : 跳过建连` 引导 —— CI 里真连上 Redis 并真正
  验到 Redis 路径，本地未配置时仍走进程内实现。（仅测试代码，无运行期行为变更。）

## 2.29.0 — 2026-10-31

### 修复

- **环形队列 Redis 后端丢消息**：`SHIFT_SCRIPT` 的 head 推进量写成了 `maxSize`，而
  `(head + maxSize) % maxSize === head` → head 永不前进，第一次 `shift` 之后每次都取到
  `nil` 却仍把 `count` 减 1。改为推进 1 格；Lua 的 `false` 归一化为 `null`（与 Map 版同形）。
  `queue-atomic` 补第 4 轮关卡（此前三轮都不执行 `shift`，正是缺陷能长期存活的原因）。
- **敏感接口限频规则指向不存在的路由**：`/oauth2.1/register` 全仓不存在（真实注册在 user 域），
  这条"注册 3 次/时"从未生效。规则表改为 `paths[]` 并指向真实的 `/oauth2.1/mini-register`；
  新增「规则表 ↔ 真实路由表」一致性守卫（把路由真注册进 Fastify 逐条比对）。
- **全局限流阈值形同虚设**：配置里存在两套同名限流字段，代码只读 `defense.*`，而扁平那份写着
  60（不被任何代码读取）。删除误导字段，出厂阈值 10000/60s → 600/60s，启动打印生效值并对
  「>1000」与「enableRateLimit=false」（会让 13 处端点级 `config.rateLimit` 一起失效）告警。
- **IP 维度可被 X-Forwarded-For 伪造**：`.env.docker.example` 默认给 `172.16.0.0/12`
  → 收窄为回环并写清取值方法；`src/app.js` 启动时对过宽信任网段告警。
  `isIpMatch` 通配符由 `startsWith(前缀)` 改为按段比对（`192.168.*.1` 不再放行整段），
  `BlockList` 按规则缓存（热路径不再逐请求分配）。
- **图形验证码可无限试错**：`verify` 无失败上限（4 位码在 TTL 内反复试，且限频按 IP、换 IP 即可绕）。
  加上限（默认 5，`CAPTCHA_MAX_ATTEMPTS` 可调）并作废；失败写回按剩余 TTL，不续命。
- **历史 bcrypt 校验可被用来冻结事件循环**：每次 `compare` 阻塞主线程约 68ms 且无并发上限。
  纳入 `BCRYPT_MAX_CONCURRENCY`（默认 4，与 scrypt 分开计数），超限 fail-closed。
- **CLI 可绕过密码策略**：三处自写"至少 6 位"改为统一走 `validatePasswordStrength()`。
- **CLI 工具会阻塞 Redis / 误删 key**：`scripts/lib/redis.js` 的 `KEYS` 改 SCAN 游标遍历、
  session 批读；`cleanup-test-user` 转义 glob 特殊字符、短 localPart 不通配、多表删除包进同一事务。

### 移除

- `scripts/initSuperAdmin.js`（硬编码超管 + `sync({alter:true})` + 角色 code 拼错）
- `scripts/debug-auth.js`（可向 Redis 注入 `allows:['*']` 的会话）
- `scripts/cleanup-users.mjs`（相对导入必然失败，且会选中全部非保留用户软删）

### 测试

- `test-effectiveness` 守卫由文本正则改为 **AST + 仓库内路径解析**：此前注释里写一句
  `from '../x'`、夹具字符串里的 `from './y'`、或 `await import('crypto')` 都能通关。
- 四份假覆盖测试改为真身驱动：`dao.test.js`（`TokenDao`）、`service.test.js`
  （`decryptLoginRequest`）、`integration/signature.test.js`（`verifySignature`，补上副本没有的
  nonce 重放与 query 参与验签）、`guard.test.js`（`applyGuardLogic` 权限判定）。
- `exceptions.test.js` 改为驱动真身 `createErrorHandler`，补上「生产环境 500 不回显原文、
  不返回 stack」这条此前完全没测的安全属性。
- `api-routes` 的条件空跑改为两个分支都成立断言（原来任何环境下必有一条用例空跑却 PASS）。

### 文档

- `best-practices/security.md`：「使用 bcryptjs 做密码哈希」与实现相反（已改 scrypt 并注明禁用
  bcrypt）、时间窗 5 分钟 → 2 分钟、去掉已废弃且有害的 `X-XSS-Protection`、CORS 示例补 null 安全。
- `best-practices/performance.md`：权限缓存示例用的是被明令禁止的明文键 → 改 `buildPermKey`。
- `best-practices/testing.md`：整棵测试目录树不存在、`import '../src/app.js'` 路径错、
  缺「毒丸判据」这条最重要的约定 —— 全部重写。
- `guide/quick-start.md`：`cd antigravity`、`DB_NAME`、探针响应结构（统一封装而非裸 `status`）。
- `standards/auth-integration.md`：注册限频的真实位置与数值（此前写的 3 次/时从未生效）。

## 2.28.1 — 2026-10-16

### 修复

- **tar 6.2.1 → 7.5.22**：修复 2 个 critical 漏洞告警
- **根 lock 同步 workspace 依赖**：恢复 `npm ci` 可用

### 依赖

- 新增 `dependabot.yml` 统一依赖更新策略
- posecraft 子仓依赖批量 bump：`brace-expansion` / `fast-uri` / `postcss-selector-parser` / `tailwindcss` / `@vue/server-renderer` / `source-map-js` / `axios`

## 2.28.0 — 2026-10-16

### 新增

- **retroweb 业务模块**：骨架（S0）→ 任务真实读写 → LLM 双来源（用户自建 / 系统官方）→ S3 算法中转（同步转发 + job 落库 + SSE 透传 + stale）→ LLM 双来源「选择 UI」（官方/自建可切换，偏好落服务端；官方凭据服务端注入，永不出前端）

### 修复

- CI：钉死 cookie 链版本 + 删除失效的 frontend job，修复四 job 齐红
- CI：安装路径不读 lock + submodule 精确 init
- Docker：构建期自证脚本化（修复 `RUN` 内联多行 `-e` 解析错误）；lockfile 不再进镜像（修复 E2E 冒烟 migrate 悬空软链）
- retroweb：task 表 target 索引改 191 前缀长度，修复 MySQL 迁移失败
- lint：check-browser-baseline 5 处全角空格改半角

### 文档

- 文档体系重组：通用规范收进 `docs/standards/`
- 新增前端主题替换规范、统一 Git 发版规则与通用发布脚本（子前端可复用）

### 杂项

- oauth21 拆分为独立仓库 oauth-web（各自维护版本线）
