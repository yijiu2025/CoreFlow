# scripts/ —— 宿主侧工具集

这里放**不参与请求链路**的东西：CLI、发版、一次性迁移、跨进程验收、压测、文档数据生成。

## 边界（先看这条，再决定放不放这里）

| 判据                   | 说明                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **不进请求链路**       | 由 loader 按 `registry/` 顺序加载的、进 `src/` 的才是运行时。这里的一切都靠"人跑一次"或"CI 跑一次"触发                                     |
| **依赖单向**           | `scripts → src` 允许；`src → scripts` **禁止**，由 `src/__tests__/conventions/no-scripts-import.test.js` 静态拦截                          |
| **进镜像但不参与启动** | `Dockerfile` 有 `COPY scripts ./scripts`，所以容器内也能跑 CLI / 迁移；但没有任何启动路径会加载它们                                        |
| **可以被 jest 收集**   | `jest.config.js` 的 `testMatch` 含 `**/scripts/**/*.test.js` —— 纯逻辑（如 `lib/release/`）的测试与实现同目录，不为"能被收集"而塞进 `src/` |

## 目录地图

| 目录          | 职责                                                                                                                                          | 入口 / 说明                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `verify/`     | **跨进程**行为验收关卡：调度器分布式锁 / 守卫配置跨实例同步 / WS 广播 / 遥测聚合 / 队列原子性（另有独立的文档链接检查 `npm run verify:docs`） | `npm run verify:all`；细节见 [`verify/README.md`](./verify/README.md) |
| `bench/`      | 压测基线：RPS / 延迟分位 / **事件循环最长冻结时长**（tick 间隔法）                                                                            | `npm run bench`；细节见 [`bench/README.md`](./bench/README.md)        |
| `commands/`   | `cli.js` 的内置子命令模块（user / role / admin / database / cache / system）                                                                  | 只被 `cli.js` import，不单独运行                                      |
| `lib/`        | 内部复用：`plugin.js`（加载 `src/app/<app>/cli/` 插件命令）、`redis.js`（连接与信息查询）、`release/index.js`（发版决策纯函数 + 同名测试）    | 无 CLI 入口                                                           |
| `canvas/`     | 静态扫描 `src/` 生成函数调用图数据 → `docs/public/canvas/data.js`                                                                             | `npm run canvas:scan`（文档站 CI 会自动重扫，产物不入库）             |
| `dev/`        | 本地联调辅助：手工造防火墙拦截态（CHALLENGE / 封禁 / 429）                                                                                    | `node scripts/dev/firewall-challenge.mjs arm`                         |
| `jest/shims/` | jest 专用 CJS 镜像：`cookie.cjs` 是**生成物**（勿手改），`build-cookie-shim.mjs` 是生成器                                                     | 见 `jest.config.js` 的 `moduleNameMapper` 注释                        |
| `storage/`    | 一次性：旧上传目录搬迁（`/uploads/**` → 现行布局）+ 改写 DB 里的旧 URL                                                                        | 默认预演，`--apply` 真跑                                              |

## 根级入口（日常会用到的）

| 文件                         | 做什么                                                                                                               | 怎么跑                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `cli.js`                     | CoreFlow CLI v2.0：交互式管理用户 / 角色 / 管理员 / 数据库 / 缓存 / 系统，并自动加载各应用的 `cli/index.js` 插件命令 | `npm run cli`                                           |
| `setup-superadmin.js`        | 初始化超管：确保迁移 → 建 superadmin 角色 → 找/建用户 → 授权 → 清 Redis session                                      | `npm run setup:admin`                                   |
| `revoke-superadmin.js`       | 撤销超管：列出全部超管、**拒绝撤销最后一个**、默认二次确认、撤销后清 session                                         | `npm run revoke:admin`                                  |
| `release.mjs`                | 按提交类型发版（本仓）：git tag + GitHub Release + `packages/log` npm，**默认只预览**                                | `node scripts/release.mjs [--apply]`                    |
| `release-web.mjs`            | 同一套判据的**通用版**，供各前端独立仓使用；`--npm` 才发 npm                                                         | `node scripts/release-web.mjs [--apply] [--npm]`        |
| `check-browser-baseline.mjs` | 跨内核渲染基线静态检查（硬性项 FAIL / 提醒项 WARN），规则见 `docs/standards/browser-baseline.md`                     | `npm run check:baseline`                                |
| `download-models.js`         | 下载 TensorFlow.js 模型（姿态 / 分割 / 人脸 / 手部）到 `public/models`                                               | `npm run download:models`                               |
| `download-models.sh`         | 同上，bash 版（无 Node 环境时用）                                                                                    | `bash scripts/download-models.sh`                       |
| `cleanup-test-user.js`       | 按邮箱清理测试用户：MySQL 按依赖顺序删 6 张表的行 + 清 Redis 残留 key                                                | `node scripts/cleanup-test-user.js <email> [--dry-run]` |

## 一次性脚本（跑过就该退役，别当常规工具用）

| 文件                                 | 干什么                                                                    | 现状                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `migrate-console-to-log.js`          | 把 `console.*` 全量改写成 `framework/log`（含自动补 import 与 tag 推导）  | 已完成，仅作历史参考                                                  |
| `migrate-key-encryption.js`          | 把 `oauth_key_pairs.private_key` 的历史明文 PEM 就地改成 AES-256-GCM 密文 | 仍在 `docs/deployment/key-encryption.md` 中被引用，新环境按该文档执行 |
| `sync-guard-config.js`               | 守卫配置收敛：让"代码声明"重新覆盖 DB 里的运行时字段                      | 运维救急用（DB 被改乱后拉回代码基线）                                 |
| `storage/migrate-legacy-uploads.mjs` | 旧上传目录搬迁 + 改写 DB 旧 URL                                           | 已执行完（`storage/migration-*.json` 是它的回滚记录）                 |

## 新脚本放哪（判据）

1. **要起多进程 / 连真 Redis+MySQL 才能证明的** → `verify/`（单进程测试会被单例状态伪装成正确）
2. **纯函数、可被 jest 直接测的** → `lib/<domain>/`，测试与实现同目录
3. **CLI 的一个子命令** → `commands/<domain>.js`，并在 `cli.js` 注册
4. **一次性数据修复 / 目录搬迁** → 放根级或按领域建子目录，**文件名必须自解释**，头部注释写清"什么时候可以删"
5. **给人反复用的** → 根级入口，并在 `package.json` 加一条 `npm run` 别名（别让人记路径）

## 现状与建议

**结论：不需要重构，当前分组已经覆盖主要类别。** 8 个子目录各有明确职责，根级 12 个文件都是"直接给人跑"的入口或一次性脚本。

三处可以顺手改进，但收益有限、都会牵动引用，**暂不执行**：

1. **三个一次性脚本平铺在根级**（`migrate-console-to-log.js` / `migrate-key-encryption.js` / `sync-guard-config.js`）与日常入口混在一起，靠文件名区分。若将来一次性脚本超过 5 个，可收进 `scripts/ops/` —— 但 `migrate-key-encryption` 被 `docs/deployment/key-encryption.md`（中英两份）引用，移动要同步改文档。
2. **`.js` 与 `.mjs` 混用**：`.mjs` 显式 ESM，`.js` 依赖根 `package.json` 的 `"type": "module"`，功能等价。`cli.js` / `commands/*.js` 被 `lib/plugin.js` 按路径加载，改名要一起动，收益只是风格统一。
3. **`jest/shims/cookie.cjs` 是生成物却和生成器同目录**：已由 `build-cookie-shim.mjs` 的文件头与 `jest.config.js` 注释双向标注"勿手改"，并在 `.prettierignore` / eslint 里豁免 —— 维持现状即可。

真要整理时，**先跑一遍 `git grep <文件名>` 确认引用面**：`package.json`、`.github/workflows/*.yml`、`docs/**`、`src/__tests__/**` 都可能硬编码了路径。

## 相关文档

- [`verify/README.md`](./verify/README.md) —— 五个跨进程关卡的判据与依赖
- [`bench/README.md`](./bench/README.md) —— 压测口径与"为什么量事件循环冻结"
- `docs/standards/git-release-rules.md` —— 发版判据（`release.mjs` / `release-web.mjs` 的共同来源）
- `AGENTS.md` 的「常用命令」「Git 提交与发版」两节
