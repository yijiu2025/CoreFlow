# 代码检查工具箱（检查命令的单一来源）

> 所有验证命令以此文件为准。**改完代码必须按"检查金字塔"跑对应层级的检查**，
> 禁止只跑自己觉得需要的部分。

## 检查金字塔（由快到慢，逐层跑）

```
语法层   eslint / tsc / vue-tsc        ← 秒级，每次改动必跑
单元层   jest 单测                     ← 改逻辑必跑相关 pattern
集成层   curl 验证 API / 浏览器全链路   ← 新增接口/页面必跑
安全层   npm audit / 审查清单 / doctor  ← 提交前必跑
全量层   全量 jest + vue-tsc 全项目     ← 提交前必跑
```

## 后端（仓库根目录执行）

```bash
# ESLint（修改的文件 0 警告才算过）
npx eslint src/<改动目录>/**/*.js

# 自动修复格式/简单问题后再复检
npx eslint --fix src/<改动目录>/**/*.js

# 单元测试（全量，ESM 模式）
node --experimental-vm-modules node_modules/jest/bin/jest.js

# 单个测试（按 pattern 过滤）
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"

# 依赖安全审计
npm audit
```

## 前端（各前端项目目录执行：oauth21 / firewall / posecraft / admin）

```bash
# 类型检查（vue-tsc；plain tsc 不识别 .vue，报 .vue 模块错误属正常）
../node_modules/.bin/vue-tsc --noEmit -p tsconfig.json

# 生产构建验证（发布前必跑）
npm run build

# ESLint（项目有自己的 eslint 配置时）
npx eslint src --ext .ts,.vue
```

## 共享包（packages/shared-device）

```bash
# 类型检查
npx tsc -p packages/shared-device --noEmit

# 构建（改 src 后必须重新 build——后端引用的是 dist 产物）
npm run build

# 单元测试（93+ 用例）
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns "packages/shared-device"
```

## 技能文档（.claude/skills/fullstack-rules）

```bash
# 修改 skill 后必跑（链接可达性/禁用模式/行数上限/frontmatter）
node .claude/skills/fullstack-rules/scripts/doctor.mjs
```

## 场景 → 必跑检查矩阵

| 改动内容 | 必跑 | 建议 |
| --- | --- | --- |
| 后端 JS 逻辑 | eslint + 相关 jest pattern | 全量 jest |
| 后端 API 新增/修改 | eslint + jest + **curl 验证四态**（200/400/401/404） | npm audit |
| 数据模型/迁移 | jest + `npm run migrate --status`（本地库验证迁移可执行） | 回滚演练 `--down` |
| 前端 TS/Vue | 项目 eslint + vue-tsc | vite build |
| 共享包 packages/shared-device | 包测试 + tsc + **重新 build** + 引用方（后端/前端）类型检查 | npm pack --dry-run |
| 认证/cookie/安全相关 | jest 全量 + 审查清单（security.md） | 手工 curl 验证 401/403 路径 |
| .kx / skill 文档 | doctor.mjs | 人工核对链接 |
| 依赖变更（npm install） | npm audit + 全量 jest | 检查 lock 变更范围 |

## 提交前最终清单

```
[ ] 全量 jest 通过（存量失败套件需能解释与本次无关）
[ ] 改动文件 eslint 0 警告
[ ] 涉及前端：vue-tsc 通过
[ ] 涉及共享包：已重新 build 且测试通过
[ ] 涉及 skill：doctor.mjs 通过
[ ] npm audit 无新增高危
[ ] commit message 符合 git-patterns.md
```
