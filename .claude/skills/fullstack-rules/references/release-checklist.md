# 前端 Web 应用端到端发布 checklist

> **权威判据**（major/minor/patch、tag 命名、分支闸）见仓库内 `docs/standards/git-release-rules.md`；
> 本文聚焦「一次完整发布」的**动作顺序**：从更新 CHANGELOG 到镜像上线后的校验。
> 适用：oauth-web、retroweb 等**打 tag 发版 + 推镜像**的前端仓。纯静态仓 / 无镜像仓自动跳过对应步骤。
> 根仓 CoreFlow 发版走 `scripts/release.mjs`（三通道），步骤结构相同、无镜像环节，CHANGELOG 提升与版本号对齐能力两个脚本一致。

---

## 〇、发布前准备

```bash
cd <仓库目录>                # 嵌套仓必须在自己的目录里做（根仓 git commit 对它无效）
git checkout main && git pull
git status --porcelain       # 应干净；有并行任务遗留改动时发版要 --allow-dirty
```

- [ ] 在 `main` 分支，已 pull 最新；
- [ ] CI 门禁绿（quality / docs-pages / 仓库专属关卡）；
- [ ] 本次要发的变更**已全部提交并推送**到 `main`。

## 一、更新 CHANGELOG

1. 打开 `CHANGELOG.md`，在**「未发布（Unreleased）」**区块按分组补本次变更：

   | 分组 | 放什么 |
   | --- | --- |
   | `### 新增` | feat（新功能 / 新页面 / 新机制） |
   | `### 修复` | fix / perf（缺陷修复、性能优化） |
   | `### 依赖` | 依赖升级（skinsuite、tailwind、vite……） |
   | `### 文档与社区设施` | README / docs / SUPPORT 等 |

2. 敏感修复的措辞：标题写「加固 / hardening」，细节放提交 body，**不进 CHANGELOG 正文**（对公网可见）。

> 发版脚本会在 `--apply` 时**自动把「未发布」区块提升**为 `## X.Y.Z — YYYY-MM-DD` 并重建空区块；
> 区块为空时脚本**不提升**、只在预览里警告——所以这步必须在打 tag 前完成。

## 二、完善文档

- [ ] `docs/` 下与本次变更相关的文档已同步（新功能指南、API 对齐、部署说明）；
- [ ] 文档里的**版本号引用**已更新（如 `deployment.md` 的镜像地址表、`release.md` 的命令示例）；
- [ ] 有 docs 索引校验的仓跑一遍：`node scripts/check-docs-index.mjs docs`（退出码 0 方可提交）；
- [ ] 文档改动提交：`docs: 更新 XXX 文档`。

## 三、对齐版本号

- 版本源是 **git tag**，`package.json` 的 `version` 单向跟随。
- 发版脚本 `--apply` 时**自动对齐** `package.json` / `package-lock.json` 到新 tag，不再手动改。
- 预览（dry-run）会展示「将对齐 X.Y.Z → A.B.C」，确认无误即可。

## 四、跑门禁（发布前最后一道闸）

```bash
npm run lint && npm test && npm run build   # 或仓库的 npm run verify
```

- [ ] lint / test / build 全绿；
- [ ] 若有改动：提交并推送 `main`（发版闸要求 main 干净）。

## 五、发版（打 tag + 建 Release）

```bash
node scripts/release-web.mjs            # ① 预览：确认版本判定、CHANGELOG 提升、敏感词
node scripts/release-web.mjs --apply    # ② 执行：CHANGELOG 提升 → package.json 对齐 → tag → push → Release
```

脚本按顺序自动做五件事（前端仓两通道 + 收尾）：

1. **CHANGELOG 提升**：`未发布` → `X.Y.Z — 日期`，重建空未发布区块；
2. **package.json 对齐**：`version` 跟随新 tag（含 lock 文件）；
3. **打 annotated tag**：`git tag -a vX.Y.Z`；
4. **推送**：`main` + `tag`，随后 `git ls-remote` 核对远端（不信退出码）；
5. **建 GitHub Release**：说明由提交分类自动生成（敏感词单独列出要求确认）。

## 六、镜像发布（有 Docker 的仓）

打 tag `v*` 会自动触发 `docker-publish` workflow，推 **GHCR + Docker Hub** 两个仓库的 `<version>` / `:latest`。

- [ ] 等待 workflow 完成（Actions 页面或 API 查 `conclusion: success`）；
- [ ] 验证 tag 列表：

```bash
# Docker Hub（匿名）
curl -s "https://hub.docker.com/v2/repositories/<user>/<repo>/tags?page_size=20"

# GHCR（匿名 token 流程，验证 public 状态）
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:<owner>/<repo>:pull" | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -H "Authorization: Bearer $TOKEN" "https://ghcr.io/v2/<owner>/<repo>/tags/list"
```

- [ ] 确认 `latest` 已指向最新版本（两个仓库都要）。

> GHCR 包默认 **private**，首次发布后要去 Packages 页设成 public，否则匿名 pull 401。

## 七、发布后校验

- [ ] GitHub Release 说明符合预期（尤其敏感词提交是否已改写）；
- [ ] 远端核对：`git ls-remote origin main` 与本地一致，tag 已上远端；
- [ ] 镜像：Docker Hub / GHCR 的 `<version>` 与 `latest` 均存在且时间戳为本次发布；
- [ ] 文档站（如有）已自动部署且页面正常。

## 八、回退与修复

- `git revert` **只撤回代码，不会撤回已推的镜像**——已发布的包留在原地；
- Docker Hub 删 tag **永久不可恢复**；GHCR 删 version 30 天内可恢复（公开包下载 >5000 次不可删）；
- 正确做法：**发一个修复版 tag**（`vX.Y.Z+1`），旧 tag 保留，`latest` 指向修复版。

---

## 一句话流程

> **CHANGELOG → 文档 → 跑门禁 → 预览 → `--apply`（自动 CHANGELOG/版本号/tag/Release）→ 等镜像 → 校验。**
