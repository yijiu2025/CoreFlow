# 项目长期约定

## 日志系统（@qirly/wb-log）

- **全项目唯一日志出口**：`src/framework/log/index.js`（`export * from '@qirly/wb-log'`）。业务代码禁止任何 `console.*`（ESLint `no-console: error`）。
- **统一用包名导入**：`import { createLogger } from '@qirly/wb-log'`。禁止跨目录深层路径导入 `packages/log/src/*`。
- 该包是本地 npm workspace 包（`packages/log`），靠软链 `node_modules/@qirly/wb-log` 生效，**不要写进 `dependencies`**。
- **已开源发布**：GitHub https://github.com/yijiu2025/log （独立仓库，`packages/log` 已从主仓库 `.gitignore` 排除）；npm 包名 `@qirly/wb-log`（原名 `wb-log` 因与 `wblog` 相似被 npm 拒绝）。
- 注意：`packages/log` 是**嵌套在项目内的独立 git 仓库**（有自己的 `.git`），在主仓库中执行 git 操作时它会以未跟踪目录形式出现。
- 推荐用法：`const log = createLogger('<文件路径点分>')`；零配置可直接 `import { log } from '@qirly/wb-log'`。
- 前端目录（`oauth21/`、`firewall/`、`admin/`）复用时直接引 `@qirly/wb-log`，浏览器自动降级为纯控制台。

## 发布流程（wb-log）

```bash
cd packages/log
git add -A && git commit -m "..." && git push origin main      # GitHub（凭据走系统 Credential Manager）
npm publish --access public                                     # npm（需有效 token，写入 ~/.npmrc 或临时 userconfig）
```

注意：npm token 失效表现为 `E404/E403 Not Found on PUT`，用 `curl -H "Authorization: Bearer <token>" https://registry.npmjs.org/-/whoami` 可快速判别（有效返回用户名，失效返回 401）。

## 测试命令（Windows Git Bash）

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"
```

注意：直接 `npx jest` 会丢失 ESM 标志；`--testPathPattern` 已被 jest 30 更名为 `--testPathPatterns`。
