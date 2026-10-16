# 入口文件规范

> 入口是每个项目的"第一印象"，也是规范最该钉死的地方。本规范覆盖三类入口：
> **前端应用**、**后端服务**、**CI 门禁**。命名细则另见 [naming-convention.md](naming-convention.md)。

## 核心原则

1. **入口只做"接线"，不做"实现"** —— 删掉入口换一种装配方式，业务一行代码不该变；
2. **启动顺序是一个可被单独阅读的单元** —— 读代码的人不必在样式 import 与装配语句之间来回跳；
3. **一个项目一个入口** —— 前端 `src/main.ts`、后端 `index.js`、门禁 `.github/workflows/ci.yml`，不许多个入口打架。

---

## 一、前端应用：main.ts 门牌 + bootstrap.ts 编排

### 1.1 形态

```
src/
├── main.ts       # 门牌：文件头 + 样式 import + import './bootstrap'
└── bootstrap.ts  # 编排：createApp → 插件装配 → 等待就绪 → mount
```

**`main.ts`（门牌）只允许有三类内容**：

1. 文件头注释（职责一句话 + `@author` / `@since`）；
2. 样式 import（全局 reset / token / 必须单独引的变量与函数式 API 样式）；
3. 一行 `import './bootstrap'` —— 转交启动编排。

**`bootstrap.ts`（编排）只做装配，按固定顺序**：

```
全局错误处理 → 状态管理（pinia）→ 路由 →（401/会话注入）→ 路由就绪 → mount
```

边界判据（缺了即返工）：

- 不认识任何 store（`useXxxStore` 不出现在本文件）；
- 不碰任何 HTTP 细节（只调 `installSession()` 这类接线函数）；
- 不处理业务分支；
- 挂载一律 `router.isReady().then(mount)` + `.catch` 降级，禁止裸挂载。

> 范例：`retroweb/src/main.ts` + `retroweb/src/bootstrap.ts`（注释含完整决策记录，新前端照抄形态）。

### 1.2 样式的两段职责（main.ts 内不许混）

| 段           | 内容                                         | 位置                     |
| ------------ | -------------------------------------------- | ------------------------ |
| 全局段       | reset / 设计 token / 本项目通用类            | `styles/index.scss`      |
| 组件库段     | 组件库样式**按需注入**（构建期解析），例外只有：暗色变量、函数式 API 样式 | `main.ts` 手写 import |

- 组件库全量 css（如 `element-plus/dist/index.css`）**禁止**出现在 main.ts；
- 函数式 API（`ElMessage` / `ElMessageBox` 等 JS 调用）按需机制看不见，必须手写引 style；
- EP 暗色 `dark/css-vars.css` 是纯变量覆盖，不隶属任何组件，必须单独引。

---

## 二、后端服务：index.js 入口

```
index.js   # 加载 env → createApp() → listen；只做启动编排
src/       # 全部实现在 src/，入口不出现业务逻辑
```

- 入口只允许：env 加载、`createApp()` 调用、监听与日志、优雅退出接线；
- 初始化顺序（引擎加载器：Redis → DB → Auth → Firewall → Models → API → Apps）是 `src/app.js` 的职责，入口只触发不编排细节；
- 范例：CoreFlow 根仓 `index.js`。

---

## 三、CI 门禁：ci.yml 唯一入口

- 每个仓 `.github/workflows/ci.yml` 是门禁唯一入口，固定骨架见 [ci-conventions.md](ci-conventions.md) §二；
- 入口只做"引用"：调用共享门禁 `ci-quality.yml` + 引用专属 `ci-<domain>.yml`，不在入口堆步骤；
- 后端 / 库仓不接入共享门禁，但 `ci.yml` 骨架（头部注释 / 触发 / concurrency / permissions）仍按同一规范。

---

## 四、现状对照与待办

| 仓 / 工程    | 入口形态                                        | 状态 |
| ------------ | ----------------------------------------------- | ---- |
| retroweb     | `main.ts` 门牌 + `bootstrap.ts` 编排             | ✅   |
| posecraft    | 同 retroweb                                      | ✅   |
| firewall     | 同 retroweb                                      | ✅   |
| admin        | 同 retroweb                                      | ✅   |
| oauth-web    | `main.ts` 门牌 + `bootstrap.ts` 编排             | ✅（2026-10-17，PR #5） |
| CoreFlow     | `index.js` 入口                                  | ✅   |

**oauth-web 改造记录**（2026-10-17，PR #5 已合并）：

1. 新建 `src/bootstrap.ts`，装配整体搬入（viewport 自救 → 设备 ID 同步 → createApp → errorHandler
   → pinia → router → i18n → setupThemeDeviceSync → H5 token 预发 → isReady → mount），
   原 `main.ts` 的装配语句与决策记录注释**原样搬迁**，行为零变化；
2. `main.ts` 收敛为门牌：文件头 + 两个 scss import + `import './bootstrap'`（66 行 → 23 行，import 仅 3 行）；
3. 本地验证全绿后才提 PR：`type-check` / `lint` / `test` 47-47 / `build`；
4. 🔴 **教训（第四次踩）**：`e2e/verify-theme-dirs.mjs` 有一条"读 `main.ts` 断言 `setupThemeDeviceSync`
   在 `app.use(pinia)` 之后"的静态关卡——搬文件后忘了同步关卡的文件清单，CI 假红
   （588/589，唯一失败项正是它）。**断言读文件内容的关卡，移动源码时必须同步目标文件**；
5. 连带修正 4 处指向 `main.ts` 的过时注释（viewport-fix.ts / router/index.ts / vite.config.ts /
   useParentThemeSync.ts）——注释不随代码搬迁会变成谎言。
