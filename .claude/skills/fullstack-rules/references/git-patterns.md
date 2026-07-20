# Git 规范

## 核心原则

- **提交要小**：一个提交只做一件事，方便回滚和 Code Review
- **信息要清晰**：让队友（和未来的自己）看一眼就知道改了什么
- **不要破坏历史**：已推送的提交禁止 `rebase` / `force push`（除非是个人分支且确认无人依赖）

---

## 一、分支模型（Git Flow 轻量版）

```
main          # 生产分支，只接受 hotfix 和 release 合并
develop       # 开发分支，功能分支从这里切
feature/*     # 功能分支，从 develop 切，合并回 develop
release/*     # 发布分支，从 develop 切，合并到 main + develop
hotfix/*      # 紧急修复，从 main 切，合并到 main + develop
```

> **首次使用需初始化 `develop` 分支**：Git 不会自动创建 `develop`，如果仓库只有 `main`，需要手动执行：
> ```bash
> git checkout -b develop main
> git push -u origin develop
> ```
> 后续 `feature/*` 和 `release/*` 才能从 `develop` 切出。

### 分支命名

```
<type>/<简短描述>

# 示例
feature/user-login          # 新功能
feature/oauth2-google       # 新功能
release/v1.2.0              # 发布
hotfix/fix-npe-on-login     # 紧急修复
chore/upgrade-sequelize     # 杂务（依赖升级、配置变更等）
```

| 类型 | 基线分支 | 合并目标 | 说明 |
|------|---------|---------|------|
| `feature/*` | `develop` | `develop` | 日常开发 |
| `release/*` | `develop` | `main` + `develop` | 发布准备，只修 bug 不添功能 |
| `hotfix/*` | `main` | `main` + `develop` | 生产紧急修复 |
| `chore/*` | `develop` | `develop` | 构建、依赖、配置变更 |

---

## 二、提交信息规范（Conventional Commits）

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型（type）

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(auth): 新增 Google OAuth2 登录` |
| `fix` | Bug 修复 | `fix(login): 修复空指针异常` |
| `refactor` | 重构（不修 bug 不加功能） | `refactor(session): 抽取双令牌刷新逻辑` |
| `perf` | 性能优化 | `perf(db): 优化 N+1 查询，加 eager loading` |
| `style` | 代码格式（不影响逻辑） | `style: 统一 prettier 格式化` |
| `docs` | 文档 | `docs(api): 补充用户接口 JSDoc` |
| `test` | 测试 | `test(auth): 新增 Session 续期测试用例` |
| `chore` | 构建/依赖/配置 | `chore: 升级 sequelize 到 v6.35` |
| `ci` | CI/CD | `ci: 添加 GitHub Actions 自动部署` |
| `revert` | 回滚 | `revert: 回滚 feat(auth): 新增 Google OAuth2 登录` |

### 范围（scope）

可选但推荐，表示影响范围：

```
feat(auth):     # 认证模块
fix(db):        # 数据库
fix(firewall):  # 防火墙
refactor(api):  # API 路由
style(ui):      # 前端样式
```

### 正文（body）

- 描述 **为什么改**，而不是**改了什么**（代码本身已经说明了改了什么）
- 每行不超过 72 字符
- 可用列表说明多个改动点

### 尾部（footer）

- **关闭 Issue**：`Closes #123` / `Closes #123, #456`
- **Breaking Changes**：`BREAKING CHANGE: OAuth 授权码格式变更为 JWT`

### 完整示例

```
feat(auth): 新增 Google OAuth2 登录

- 实现 Google OAuth2 授权码流程
- 用户首次登录自动创建本地账号
- 新增 UserIdentity 模型存储第三方身份
- 登录页增加"使用 Google 登录"按钮

Closes #123
```

```
fix(db): 修复迁移时外键冲突导致回滚失败

迁移 2026071301 在 down 时删除了被其他表引用的列，
导致回滚到该版本时数据库报错。改为先删除引用外键再执行 down。

关联迁移需按顺序回滚，详见 migration/README.md
```

```
refactor(session): 抽取双令牌刷新逻辑为独立函数

原来的 refreshSession 函数内联了 sid 和 sid_r 的刷新逻辑，
导致单测无法 mock 令牌刷新。拆分为 refreshSid 和 refreshSidR，
方便单测覆盖各自分支。

BREAKING CHANGE: refreshSession 返回值格式变更，调用方需适配
```

---

## 三、分支操作规范

### 3.1 创建分支

```bash
# 功能分支
git checkout -b feature/user-login develop

# 紧急修复
git checkout -b hotfix/fix-npe-on-login main

# 发布分支
git checkout -b release/v1.2.0 develop
```

### 3.2 提交

```bash
git add <files>
git commit -m "feat(auth): 新增 Google OAuth2 登录"
```

**禁止：**

- `git commit -m "fix bug"` — 信息无意义
- `git commit -m "update"` — 信息无意义
- 一个提交包含多个不相关功能（如同时改了 auth 和 firewall）

### 3.2.1 提交信息反例

```bash
# ❌ 无意义信息
git commit -m "fix bug"
git commit -m "update"
git commit -m "wip"
git commit -m "调整"

# ❌ 一个提交包含多个不相关改动
git commit -m "feat(auth): 新增登录 + fix(db): 修复查询 + style: 格式化"

# ✅ 正确：一个提交只做一件事
git commit -m "feat(auth): 新增 Google OAuth2 登录"
git commit -m "fix(db): 修复用户查询时的 N+1 问题"
git commit -m "refactor(session): 抽取双令牌刷新逻辑"
```

### 3.3 特性分支同步上游代码

开发期间 `develop` 可能已被其他合并推进，需要同步最新代码。

```bash
# 切回 feature 分支，用 rebase 变基，保持历史线性
git checkout feature/user-login
git rebase develop
```

**禁止**在 feature 分支使用 `git merge develop`，会产生无意义的 `Merge branch 'develop' into feature/xxx` 杂乱记录。

> 如果 rebase 过程中有冲突，按提示逐个解决后执行 `git rebase --continue`。遇到复杂冲突可 `git rebase --abort` 放弃本次变基，改用 `git merge develop` 临时处理（事后需告知团队）。

### 3.4 合并策略

| 场景 | 策略 | 说明 |
|------|------|------|
| feature → develop | **Squash merge** | 功能分支的多个小提交压缩为一个，保持 develop 历史清晰 |
| hotfix → main | **Merge commit** | 保留修复上下文，方便追溯 |
| release → main | **Merge commit** | 保留发布节点 |
| release → develop | **Merge commit** | 确保 develop 包含 release 的修复 |
| develop → main | **Merge commit** | 常规发布 |

### 3.5 合并信息规范

```bash
# Squash merge 示例
git merge --squash feature/user-login
git commit -m "feat(auth): 新增 Google OAuth2 登录"
```

### 3.6 推送

```bash
git push origin feature/user-login
```

**禁止 `git push --force`** 到共享分支（develop、main、release/*）。个人 feature 分支如需 force push，先确认队友没有基于它工作。

### 3.7 分支清理与生命周期

PR/MR 合并后及时清理，拒绝"长寿分支"（Long-running branches）：

```bash
# 删除本地已合并的分支
git branch -d feature/user-login

# 删除远程已合并的分支（或 PR 合并时勾选 "Delete source branch"）
git push origin --delete feature/user-login

# 清理本地记录中已不存在的远程分支引用
git fetch -p
```

| 规则 | 说明 |
|------|------|
| 合并即删 | feature 分支合并到 develop 后立即删除本地和远程 |
| 拒绝长寿 | 功能分支生命周期不超过 2 周，长期未完成应考虑拆分 |
| 定期清理 | 每周执行 `git fetch -p` 清理远程失效分支引用 |

---

## 四、Code Review 规范

### 4.1 提 PR 前自查

- [ ] 提交信息符合 Conventional Commits 格式
- [ ] 分支名符合 `<type>/<desc>` 规范
- [ ] 代码通过 `npm run lint` 和 `npm test`
- [ ] 没有包含调试代码（`console.log`、`debugger`、TODO 注释）
- [ ] 新增 API 有对应的权限校验
- [ ] 数据库变更有对应的迁移文件
- [ ] 新增配置有对应的环境变量说明

### 4.2 PR 标题规范

PR 标题必须严格遵循 Conventional Commits 格式（例如 `feat(auth): 新增 Google OAuth2 登录`），因为 **Squash merge** 会默认使用 PR 标题作为合并到 `develop` 的提交信息。

```
# 正确示例
feat(auth): 新增 Google OAuth2 登录
fix(db): 修复迁移时外键冲突

# 错误示例（会污染 develop 历史）
修复了一些 bug
更新代码
```

### 4.3 PR 描述模板

```markdown
## 变更说明

<!-- 一句话概括 -->

## 改动清单

- [x] 模块 A：改了啥
- [x] 模块 B：改了啥

## 关联 Issue

Closes #123

## 测试说明

- [x] 单元测试
- [x] 本地手动测试
- [ ] 需要部署到测试环境验证

## 注意事项

<!-- 迁移回滚、配置变更、依赖升级等 -->
```

### 4.4 Review 原则

- **先看文件名和改动范围** — 确认是不是预期改动
- **关注逻辑正确性** — 边界条件、异常处理、并发安全
- **拒绝大 PR** — 单个 PR 超过 400 行 diff 应拆分
- **建设性反馈** — 指出问题同时给出建议方案

---

## 五、版本号规范（SemVer）

```
主版本.次版本.修订号

# 示例
v1.0.0   # 首次正式发布
v1.2.0   # 新增功能
v1.2.1   # Bug 修复
v2.0.0   # 不兼容的 API 变更
```

### Tag 命名

```bash
git tag -a v1.2.0 -m "release: v1.2.0 - 新增 OAuth2 登录"
git push origin v1.2.0
```

---

## 六、常用命令速查

```bash
# 查看当前分支和状态
git status

# 简洁的日志视图
git log --oneline --graph --all -20

# 查看某次提交详情
git show <commit-hash>

# 暂存当前工作
git stash
git stash pop

# 撤销工作区修改（谨慎）
git checkout -- <file>

# 修改最近一次提交信息（仅未推送时）
git commit --amend -m "新消息"

# 交互式 rebase（仅本地分支）
git rebase -i HEAD~3

# 变基同步上游（feature 分支同步 develop）
git rebase develop

# 清理本地已合并分支
git branch -d feature/user-login

# 清理远程已删除分支的本地引用
git fetch -p
```

---

## 七、项目特殊约定

1. **提交语言**：提交信息统一使用中文（subject + body），语言简洁准确。
2. **提交粒度**：按逻辑原子化提交（One Atomic Commit per Action），禁止积压大提交。
3. **排错逻辑**：修复 Bug 前先定位根本原因，禁止盲目"试一下"式提交。
4. **提交不带 Co-Authored-By**，不需要署名协作信息。
5. **分支生命周期**：功能开发完成并通过 CR 后，及时提 PR/MR 合并到 `develop` 分支，验收通过后删除本地与远程的 `feature/*` 分支，不要长期积压未合并的代码。
6. **安全红线**：严禁提交 API 密钥、数据库密码、私钥等明文敏感信息。环境配置文件（如 `.env.local`、`.env.development`）必须写入 `.gitignore`，仅提交 `.env.example` 作为模板。

---

## 八、自动化卡点（推荐）

靠人肉规范难以 100% 杜绝不规范提交，建议引入 Git 钩子工程化卡点。

### 8.1 提交信息校验（commitlint）

```bash
# 安装
npm install --save-dev @commitlint/cli @commitlint/config-conventional

# 配置 commitlint.config.js
echo "export default { extends: ['@commitlint/config-conventional'] }" > commitlint.config.js

# 挂载到 husky commit-msg（Husky v9+，直接写文件）
echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

配置后，`git commit -m "fix bug"` 会被自动拦截，提示格式不符合规范。

### 8.2 代码质量校验（lint-staged）

```bash
# 安装
npm install --save-dev lint-staged

# package.json 中配置
# "lint-staged": {
#   "*.{js,ts,vue}": ["eslint --fix", "prettier --write"],
#   "*.{md,json,yaml}": ["prettier --write"]
# }

# 挂载到 husky pre-commit（Husky v9+，直接写文件）
echo 'npx lint-staged' > .husky/pre-commit
```

提交前自动修复代码格式和 ESLint 错误，不符合规范的代码无法提交。

### 8.3 当前项目状态（均未启用）

| 卡点 | 状态 | 说明 |
|------|------|------|
| husky | ✅ 已安装 | hooks 目录在 `.husky/` |
| commitlint | ❌ 未配置 | 无 `commit-msg` hook，无 `commitlint.config.js` |
| lint-staged | ❌ 未启用 | `pre-commit` hook 被注释，`lint-staged` 未安装 |

> ⚠️ **当前项目以上卡点均未实际启用**，提交信息的规范校验完全依赖人工遵守。如需启用，请按 8.1 和 8.2 的步骤配置。

---

## 附录：.gitignore 安全配置

与第 7 节第 6 条安全红线配合，防止敏感文件意外提交：

```gitignore
# 敏感环境变量
.env
.env.*
!.env.example

# 本地调试与密钥
*.pem
*.key
id_rsa
*.local

# IDE 配置
.vscode/
.idea/
*.swp
*.swo

# 依赖与构建
node_modules/
dist/
build/
```