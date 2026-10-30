# CI/CD {#cicd}

> ## ✅ 实现状态：已落地（2026-09-20）
>
> | 文件 | 触发 | 做什么 |
> | --- | --- | --- |
> | `.github/workflows/ci.yml` | push 到 main、所有 PR | lint 门禁 / Jest 全量 / **跨进程关卡**（真 Redis） |
> | `.github/workflows/release-docker.yml` | push 到 main、打 `v*` tag、手动 | 构建镜像推 GHCR + **compose 全栈端到端冒烟**（workflow name 显示为 `Publish Image`） |
> | `.github/workflows/docs.yml` | push 到 main（`docs/**` 变化）、手动 | 构建文档站并发布到 <https://yijiu2025.github.io/CoreFlow/> |
>
> 本页此前是**未落地的示例**（2026-09-19 核实：仓库内没有 `.github/`）。
> 当时的真实自动化只有 `.husky/pre-commit` + lint-staged（提交时对 `src/**`
> 跑 eslint --fix 与 prettier）—— 也就是说，**lint 与测试没有强制门禁**，
> 全量测试只靠开发者本地自觉执行。

---

## 先讲清楚：CI 和 CD 分别是什么

### CI（Continuous Integration，持续集成）

**每次有人把代码合进主干，机器就把"能不能用"重新验证一遍。**

它的核心不是"跑脚本"，而是**把验证从人身上挪到机器上**。在没有 CI 的项目里，
质量取决于"这次提交的人记不记得跑测试" —— 而人一定会忘，尤其是在赶进度的时候。
CI 的价值就是把这件事变成**不可协商**的：门禁不通过，代码就进不去主干。

典型的 CI 做三件事：

1. **静态检查**（lint / 类型检查）：风格、易错写法、项目自定义约定；
2. **自动化测试**：单元、集成、契约；
3. **构建**：证明"这份代码真的能打出产物"，而不是只在本机 `npm run dev` 能跑。

### CD：两个常被混在一起的缩写

| 缩写 | 全称 | 含义 | 关键区别 |
| --- | --- | --- | --- |
| **Continuous Delivery** | 持续**交付** | 流水线始终把产物准备好，**发布动作由人按一下** | 上线与否是决策，不是自动的 |
| **Continuous Deployment** | 持续**部署** | 通过所有关卡后**自动**上生产 | 决策也交给流水线 |

多数团队实际需要的是 **Delivery**（产物随时可发，但发布时机由人决定）。
两者共用同一套流水线，差别只在最后一步是否有人工卡点。

### 一张图看清"哪一步省掉了什么"

```
不带 CI/CD：
  改代码 → 本地手动跑几个测试（大概记得的话）→ 提交 → 直接上线 → 出问题靠用户反馈

带 CI/CD：
  改代码 → 推送 → 机器验证（lint → 测试 → 跨进程不变量 → 构建 → 冒烟）
                        │
                        ├─ 失败：代码进不去主干（问题在你手上，不在用户手上）
                        └─ 通过：自动产出可部署产物 → （人工/自动）发布
```

**真正的收益不是"省了手动步骤"，而是"把发现问题的时刻从上线后提前到合并前"。**
一个 bug 在 CI 阶段被拦下，修复成本是分钟级；在线上被发现，成本是小时级加信任损耗。

---

## 本项目的流水线

| 工作流 | 作业 | 拦什么 |
| --- | --- | --- |
| `ci.yml` | lint | 风格/约定漂移、文档死链、文档站构建不出来 |
| `ci.yml` | test | 单元 / 契约 / 结构守卫回归 |
| `ci.yml` | verify | 只在多进程下才暴露的并发缺陷 |
| `docs.yml` | build → deploy | 文档站发布到 GitHub Pages |
| `release-docker.yml` | publish | 镜像产物与启动冒烟 |

`ci.yml` 是**唯一门禁入口**（分支保护只认它的三个作业名）；`docs.yml` 负责发布，
不参与 PR 判定 —— 发布需要 `pages: write`，而 fork 来的 PR 拿不到这个权限。

### 1. `ci.yml` / lint —— 约定门禁

```bash
node scripts/verify/doc-links.mjs                 # 文档相对链接（零依赖，最先跑）
npx eslint src scripts migrations docker index.js  # 风格与约定
DOCS_BASE=/CoreFlow/ npx vitepress build docs      # 文档站必须能构建
```

跑的是项目自己的规则，其中有几条是**这个仓库特有的**，从别处抄不来：

- **导出位置**：所有 `export` 必须收拢到文件末尾（`no-restricted-syntax`）；
- **禁 `console.*`**：后端代码统一走 `src/framework/log`；
- **测试有效性约定**等由 `src/__tests__/conventions/` 里的结构守卫覆盖（跑在 test 作业里）。

为什么只扫这几个目录：仓库里还住着 `phonecopy/`（8 万文件的第三方快照）
与三个独立前端工程。把它们扫进来，这条流水线会常年红灯 ——
**长期亮红灯的检查等于没有检查**，这条原则在本仓库反复出现。

文档那两步各有分工，缺一个都会漏：

- **死链扫描**（`doc-links.mjs`）只看相对链接，零依赖所以放在装依赖之前。
  它的判据是"目标会不会出现在干净检出里"——`docs/` 内的必须存在，
  `docs/` 外且未被 git 跟踪的（`oauth21/` 独立仓、`phonecopy/` 嵌套仓）算外部指针跳过。
  用 `existsSync` 判会得到"本地绿、CI 红"，2026-10-30 就这么红过一次。
- **文档站构建**用与发布**完全相同的 base**（`/CoreFlow/`）。base 错的表现是
  "构建成功、部署后站内链接全 404"，只有按子路径构建一次才会暴露。

### 2. `ci.yml` / test —— 全量测试

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --ci
```

必须带 `--experimental-vm-modules`：项目是 ESM 且测试大量使用
`jest.unstable_mockModule`，丢掉这个标志会大面积失败（本地 `npx jest` 同理）。

**这个作业需要 Redis，不需要 MySQL** —— 不是随口定的，是两条实测结论：

- `framework/db` 在测试环境检测到缺 DB 配置会**跳过**而非终止进程，所以 MySQL 可以不提供；
- Redis **必须提供**：`framework/redis` 的集成套件在"没有 Redis"时会整体跳过，
  而"跳过"在 CI 里的语义是**通过** —— 这正是 U19 记录的假绿：
  断言全绿，实际一行 Redis 代码没跑。

因此 test 作业声明 `redis:7` service（`--health-cmd "redis-cli ping"`），
并在 `env` 里写 `REDIS_DB: '15'`（与本地开发库隔离）+ `EXPECT_REDIS: 'true'`。
`src/__tests__/framework/redis/redis-ci-guard.test.js` 会读这个变量：
**一旦有人把 service 或 env 删掉，它当场变红**，而不是静默退回跳过。

> 这条守卫的存在理由值得记住：让测试"可选依赖真实服务"等于让它随时可以被无声降级。
> 需要外部服务的断言要么带守卫强制在 CI 提供，要么承认它不是回归门禁。

### 3. `ci.yml` / verify —— 跨进程不变量（真 Redis）

```bash
node scripts/verify/lock-mutex.mjs        # E1：分布式锁互斥
node scripts/verify/ws-fanout.mjs         # E3：WS 广播跨实例扇出
node scripts/verify/stats-aggregation.mjs # E3：遥测统计跨实例聚合
node scripts/verify/queue-atomic.mjs      # U12：队列指针 Lua 原子性（不重不漏不倒退）
```

这三件事**在单进程里都能被单例状态"伪装成正确"**，只有真实多进程 + 真实 Redis
才能证伪。它们此前只靠人记得手动跑 —— 结果就是长期没人跑（2026-09-20 复核时，
这两个 E3 关卡在 Redis 不可达环境下直接挂死，而不是给出结论）。放进 CI 才算真有了门禁。

退出码语义刻意分级，CI 里对每一级给出不同的排障提示：

| 码 | 含义 | CI 怎么看 |
| --- | --- | --- |
| 0 | 通过 | 继续 |
| 1 | 断言失败（真回归） | 失败，查代码 |
| 2 | 回滚不完整 | 失败，且**需要人工检查数据** |
| 3 | 环境不可用 | CI 里也失败 —— service 是我们自己声明的，取不到只可能是流水线坏了 |

### 4. `docs.yml` —— 文档站发布（GitHub Pages）

站点地址：<https://yijiu2025.github.io/CoreFlow/>

```
push main（docs/**、package.json 变化）
   → vitepress build docs（DOCS_BASE=/CoreFlow/）
   → 校验产物里真的带 /CoreFlow/ 前缀
   → upload-pages-artifact → deploy-pages
```

几个刻意的选择：

- **项目站点 = 子路径**。仓库名 `CoreFlow` 决定站点落在 `/CoreFlow/` 而不是域名根，
  所以构建必须给 `DOCS_BASE`；`head` 里的资源路径（favicon）是原样输出的，
  得在 `config.ts` 里自己拼前缀（站内链接由 vitepress 自动补）。
- **不取消进行中的发布**（`cancel-in-progress: false`）。构建被 kill 会让线上版本
  与仓库内容不一致一段时间，而文档站没有"回滚"按钮。
- **发布与验证分家**。PR 上跑构建（lint 作业），main 上才发布；合并起来就得给 PR
  开 `pages: write`，或者让发布在 PR 上必然失败。
- **不跑 `npm ci`**：理由同后端三个作业（根 lock 把 `wb-logkit` 记为 link→不入库的嵌套仓）。

一次性配置：仓库 Settings → Pages → Source 选 **GitHub Actions**。
缺这一步时 `deploy-pages` 会报 `Get Pages site failed`，与本工作流无关。

### 5. `release-docker.yml`（Publish Image）—— CD 的产物与冒烟

```
构建镜像（带 gha 层缓存 + SBOM + provenance）
   → 推 GHCR（分支名 / commit sha / semver 三类标签）
   → compose 起 mysql + redis
   → 跑迁移
   → 起应用
   → 轮询 /v1/health/ready 直到 200
```

**为什么"构建成功"不算交付成功**：这个镜像有四个只有真跑起来才暴露的失败点 ——

1. `npm install --workspaces=false` 漏装某个生产依赖 → 启动即崩；
2. entrypoint 的依赖等待逻辑写错 → 容器永远卡在"等待数据库"；
3. 迁移没跑 → 表不存在，就绪探针 503；
4. 探针路径写错（`/health/live` vs 真实的 `/v1/health/live`）→ 健康检查恒失败。

所以最后一步用**仓库里的 `docker-compose.yml` 真的把全栈拉起来**，
等 `/v1/health/ready` 返回 200 才算通过 —— 这也是唯一能验证
compose / entrypoint / 健康探针三者彼此对齐的方式。

> 发布到具体环境（SSH、K8s、Watchtower）**没有做**，因为那需要目标环境凭据与
> 一套只有你们知道的发布策略。流水线在"镜像已推送到 registry"处结束，
> 接续方式见下节。

---

## 需要人工配置的部分

CI 文件进了仓库不等于门禁生效，还需要在 GitHub 上做两步：

1. **分支保护**（Settings → Branches → Branch protection rules）：
   要求 `Lint` / `Test` / `Verify` 三个 check 通过才能合并到 main。
   没有这一步，流水线只是"一个会亮灯的页面"，红灯也能合。
2. **GHCR 权限**：`release-docker.yml` 用内置 `GITHUB_TOKEN` 推包，
   `permissions: packages: write` 已声明。若组织策略禁用了它，
   需要改用 PAT 并放进 `secrets`。

### 接上真正的部署（示例，未落地）

```yaml
# 在 release-docker.yml 末尾追加一个 job
deploy:
  needs: [smoke]
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: production        # GitHub Environments 可加人工审批 = 回到 Delivery
  steps:
    - uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.DEPLOY_HOST }}
        username: ${{ secrets.DEPLOY_USER }}
        key: ${{ secrets.DEPLOY_KEY }}
        script: |
          cd /srv/nodeservers
          docker compose --env-file .env.docker pull
          docker compose --env-file .env.docker run --rm migrate
          docker compose --env-file .env.docker up -d app
```

---

## 尚未落地

**Swagger / OpenAPI 交互式文档没有做**：`@fastify/swagger` 与
`@fastify/swagger-ui` 都不在 `package.json` 里。
本仓库的 API 契约目前分散在 `src/api/<domain>/system.json` 与各路由的
`registerSecureRoute` 声明中。真要做的话，注意项目特有的两点约束：

- 路由统一经 `registerSecureRoute` 注册，schema 应挂在那里而不是逐个 endpoint 手写；
- `/docs` 这类公开端点要过一遍防火墙与 `requireLogin` 口径，别把内网拓扑暴露出去。
