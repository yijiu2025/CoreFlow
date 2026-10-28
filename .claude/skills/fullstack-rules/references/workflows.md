# 端到端任务剧本（Playbooks）

> 高频任务的端到端步骤与验收清单。执行顺序铁律见 SKILL.md；
> 写代码前先扫 [pitfalls.md](pitfalls.md) 对应条目；细节模板在各专题文档。

## 剧本 A：新增后端 API

**涉及**：`nodejs-fastify.md`（模板）、`naming-convention.md`（命名）、`security.md`（红线）

1. 确认路由归属域：`src/api/<domain>/`（已有域复用，新域建 `system.json`）
2. 设计三级前缀：system prefix + group prefix + route url（写完逐级核对拼接，防重复前缀）
3. `registerSecureRoute` 注册：name 全局唯一、alias 中文、schema 校验入参、`requireLogin: false`（开发期）
4. DAO 写在 `src/app/<app>/dao/`：`getModel` 取模型、`delete_version: 0` 过滤、参数化查询
5. 模型/迁移：`src/models/<ns>/` + `migrations/`（禁 DB_SYNC，生产必须走迁移）
6. 序列化函数 `formatXxx`：集中管理输出字段，敏感字段不外露
7. **curl 验证**：200 格式 / 400 参数 / 401 未登录 / 404 不存在 / 空数据边界
8. 权限：功能调通后补 `permission` / `allowRoles`，重启验证

**验收**：nodejs-fastify.md"十、开发完成后验证清单"逐项打勾。

## 剧本 B：新增前端页面

**涉及**：`frontend/web/vue.md`、`kx.md`（KX 场景）、AGENTS.md 设备接入清单

1. 确认后端 API 已存在且 curl 验证过（**没有就先走剧本 A**）
2. 组件归属：三层目录 `src/components/<功能分类>/<业务页面>/`；一个文件一个模块
3. API 封装：`src/api/<domain>.ts` 统一封装，组件不直接 axios
4. 页面开发：SFC 顺序、composable 抽取、图标用 lucide-vue-next（禁 emoji）
5. 路由 + 权限：路由守卫 + `v-auth` 指令权限编码与后端一致
6. 类型：响应类型 `ApiResult<T>`，禁止 `any`
7. 验证：浏览器全链路（真实数据），组件四状态（加载/空/错误/正常）完备

**验收**：ESLint 0 警告；vue-tsc 通过；设备头已随 setupDeviceSync 自动携带。

## 剧本 C：对接外部 API

**涉及**：SKILL.md 执行顺序第 1 步、`security.md`

1. **先 curl 外部接口**，确认真实字段名/类型/分页方式/错误结构——不猜测
2. 记录契约：字段映射表（外部字段 → 内部字段），归档到 DAO/Service 注释
3. 后端代理层：统一超时（Promise.race）、错误映射（外部错误码 → 内部 err.code）、响应裁剪（只透出前端需要的字段）
4. 降级策略：外部服务不可用时的缓存/兜底行为，明确写进注释
5. 密钥：`process.env.XXX`，不入代码；缺失时启动告警
6. **curl 验证后端 → 外部 → 前端全链路**

**验收**：停掉外部 API 模拟故障，前端有兜底表现而非白屏。

## 剧本 D：修复 Bug

**涉及**：SKILL.md 修复问题原则、[pitfalls.md](pitfalls.md)（先扫历史事故）

1. **扫 pitfalls.md**：确认是否为历史事故的同型问题（是 → 按既有规则修，别发明新方案）
2. 定位根因：错误栈 → 代码流程 → 最小复现 → git blame 了解改动意图
3. 追踪调用链 ≥2 层（import 依赖 + 调用方）
4. 修最小范围：不顺便重构
5. **补边界测试**：本次 bug 的触发条件写成测试用例（防回归）
6. 验证：新测试 + 相关既有测试 + 全量 jest
7. 复盘：按 anti-patterns.md 复盘三问，可泛化的写入 skill

**验收**：新增测试覆盖该 bug；全量测试通过；commit message 说明根因而非现象。

## 剧本 E：代码审查

**涉及**：[anti-patterns.md](anti-patterns.md)（快速清单）→ [code-review.md](code-review.md)（完整展开）

1. 先读 diff 全量（不只看改动行，看上下文与调用方）
2. 追踪调用链 ≥2 层
3. 执行企业级审查清单 15 项逐项打勾
4. 扫 pitfalls.md：改动模块是否有历史事故同型风险
5. 输出审查报告：按严重度分级（🔴 必须修 / 🟡 建议修 / 🔵 打磨），每条带文件:行号与理由

**验收**：所有 🔴 项修复后才允许合并/提交。

## 剧本 F：安全审查（新增 API / 改认证 / 动 cookie 时）

**涉及**：[security.md](security.md)（红线 + 仓库防线）、[toolbox.md](toolbox.md)（检查命令）

1. 权限三件套：新路由的 `requireLogin` / `permission` / `allowIps` 是否按数据敏感度正确设置（开发期关闭的权限**是否已恢复**）
2. 信任边界：客户端可控输入（`x-device-id`、header、query）是否被当作凭证/权限依据使用（只允许作标识）
3. 输入防御：schema 校验齐全、数值有边界、字符串有 maxLength、外部输入进日志前已截断
4. 注入面：SQL 参数化、无 `v-html`、无 eval、重定向 URL 白名单
5. Cookie / 认证：新 cookie 引用 `COOKIE_POLICY`、SameSite 与部署形态匹配、HMAC 签名未绕过
6. 一致性：相同功能的不同入口（HTTP/WS/内部端点）安全级别一致；豁免路径（RISK_EXEMPT_PATHS）未被滥用
7. 依赖：新增第三方包是否必要（优先既有设施）、npm audit 无新增高危
8. 工具箱：按 [toolbox.md](toolbox.md) 场景矩阵跑完整检查
9. **深度扫描编排**（攻击面大的新模块/重大版本合入前）：按 [orchestration.md](orchestration.md)
   调度安全类专项 skill（如 `find-security-vulnerabilities-in-code`）做白盒深扫，
   发现回填剧本 D 修复流程；技能不存在时降级为本文件人工清单并注明

**验收**：security.md"安全自查清单"逐项打勾；防线一览表确认没有绕过既有设施造第二套。

## 剧本 G：npm 包发版（嵌套独立仓，skinsuite 型）

**涉及**：[git-patterns.md](git-patterns.md) §五（版本号）、[pitfalls.md](pitfalls.md) #13–#17（workspaces 提升 / 多 lock 失同步 / Pages base / 游离文件类型）
**适用**：独立发 npm 的嵌套仓（如 `packages/theme-core` = skinsuite）——与根仓 release.mjs 通道**互不相干**；发版链：tag → CI（Trusted Publishing）→ 宿主同步脚本。

> ⚠️ 本剧本只覆盖「npm 独立仓」这条专用通道。**Web 应用 / 打 tag 发版的前端仓**（oauth-web、retroweb 等）
> 走 [release-checklist.md](release-checklist.md) 的端到端流程（CHANGELOG → 文档 → 版本号 → 门禁 → 发版 → 镜像 → 校验）。

### 发版前检查（逐项打勾，全绿才准打 tag）

```
[ ] 1. 工作区干净、main 已与远端同步（git status 空 + git ls-remote 核对）
[ ] 2. 全量闸门本地绿：npm run typecheck + npm test（0 fail）
[ ] 3. 公开面 diff 审查：git log <上个tag>..HEAD 逐笔过，
       标出导出签名/新增/删除 → 0.x 口径定版本（改名/结构调整 = minor，仅 fix = patch）
[ ] 4. CHANGELOG「未发布」段定稿：公开面变更置顶、migration 提示写清
[ ] 5. node scripts/release-notes.mjs <版本> 能抽出该段（CI 建 Release 靠它，缺失响亮失败）
[ ] 6. package.json version 已升且与 tag 一致（CI 校验 tag === 'v' + version，不一致直接红）
[ ] 7. 敏感表述扫描：commit 标题/正文含 漏洞/密钥/token 字样的，确认适合公开 Release 正文
[ ] 8. 有文档站的仓：npm run docs:build 零死链零告警
```

### 发布链（顺序执行）

1. 提交 `chore(release): <pkg> <版本>` → 推 main
2. 打 annotated tag `v<版本>`（message 写版本摘要）→ 推 tag
3. **tag 到远端用 `git ls-remote --tags origin` 核实**——不信 push 退出码（推送可能极慢零输出）
4. CI（release-npm.yml）以 Trusted Publishing（OIDC）发布 + 自动建 GitHub Release（正文 = release-notes 抽取段）
5. 轮询 `npm view <pkg> version` 直到等于目标版本（registry 传播有延迟，2 分钟量级）
6. 宿主同步：`node scripts/publish-and-sync.mjs --skip-publish`（补宿主 package.json + lock 三字段 + `npm ci --dry-run` 自证）
7. **同步所有持有该包的 lock**——含根仓 lock 里 workspace 提升的那份：根仓 `npm install --package-lock-only --ignore-scripts`，漏了根仓 `npm ci` 直接红（pitfalls #15）
8. 确认 GitHub Release 已自动创建；docs 站（有则）等 Pages workflow 跑完刷新验证

**验收**：npm registry 版本 = tag；宿主 + 根 lock 的该包 version 一致；GitHub Release 存在且正文完整。

**禁止**：本地手跑 `npm publish`（本仓走 OIDC，本地无 token 会 401）；拿 package.json 的 version 反推 tag；工作区未提交就打 tag。
