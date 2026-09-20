# CI/CD {#cicd}

> ## ✅ 实现状态：已落地（2026-09-20）
>
> | 文件 | 触发 | 做什么 |
> | --- | --- | --- |
> | `.github/workflows/ci.yml` | push 到 main、所有 PR | lint 门禁 / Jest 全量 / **跨进程关卡**（真 Redis） |
> | `.github/workflows/publish-image.yml` | push 到 main、打 `v*` tag、手动 | 构建镜像推 GHCR + **compose 全栈端到端冒烟** |
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

## 本项目的三条流水线

### 1. `ci.yml` / lint —— 约定门禁

```bash
npx eslint src scripts migrations docker index.js
```

跑的是项目自己的规则，其中有几条是**这个仓库特有的**，从别处抄不来：

- **导出位置**：所有 `export` 必须收拢到文件末尾（`no-restricted-syntax`）；
- **禁 `console.*`**：后端代码统一走 `src/framework/log`；
- **测试有效性约定**等由 `src/__tests__/conventions/` 里的结构守卫覆盖（跑在 test 作业里）。

为什么只扫这几个目录：仓库里还住着 `phonecopy/`（8 万文件的第三方快照）
与三个独立前端工程。把它们扫进来，这条流水线会常年红灯 ——
**长期亮红灯的检查等于没有检查**，这条原则在本仓库反复出现。

### 2. `ci.yml` / test —— 全量测试

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --ci
```

必须带 `--experimental-vm-modules`：项目是 ESM 且测试大量使用
`jest.unstable_mockModule`，丢掉这个标志会大面积失败（本地 `npx jest` 同理）。

**这个作业不需要 MySQL / Redis** —— 这不是图省事，是实测结论：

- `framework/db` 在测试环境检测到缺 DB 配置会**跳过**而非终止进程；
- Redis 不可用时访问层降级到进程内 MapStore。

本机在没有 DB / Redis 的情况下 1066 个用例全绿。给 CI 硬塞 services
只会让流水线更慢、更脆，且掩盖"测试本应自足"这个事实。

### 3. `ci.yml` / verify —— 跨进程不变量（真 Redis）

```bash
node scripts/verify/lock-mutex.mjs        # E1：分布式锁互斥
node scripts/verify/ws-fanout.mjs         # E3：WS 广播跨实例扇出
node scripts/verify/stats-aggregation.mjs # E3：遥测统计跨实例聚合
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

### 4. `publish-image.yml` —— CD 的产物与冒烟

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
2. **GHCR 权限**：`publish-image.yml` 用内置 `GITHUB_TOKEN` 推包，
   `permissions: packages: write` 已声明。若组织策略禁用了它，
   需要改用 PAT 并放进 `secrets`。

### 接上真正的部署（示例，未落地）

```yaml
# 在 publish-image.yml 末尾追加一个 job
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
