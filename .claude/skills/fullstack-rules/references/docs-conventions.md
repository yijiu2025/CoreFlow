# 文档规范（docs-conventions）

> 适用范围：所有仓库的 `docs/` 目录与文档级 README。
> 核心问题：**文档散落不可发现 = 不存在**。每条规范都服务于一个判据：新人 / AI
> 能不能从唯一入口找到该找的文档、并看懂它是干嘛的。

## 0. 铁律

1. **每个仓的 `docs/` 必须有总入口 `README.md`**：声明自己是入口（"写文档前先读本文决定
   放哪；找文档也从本文进"）+ 逐文档登记「路径 + 一句话用途」
2. **新文档先登记进入口，再提交**——漏登记 = 文档不可发现，与没写等价
3. 入口是**活跃维护件**：新增 / 改名 / 归档文档时同步改入口，随同一提交完成

## 1. 两级入口体系

文档多了以后，总入口逐文件列会膨胀。分两层：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 总入口 | `docs/README.md` | 分类地图：文档分几类、各类住哪、放置决策顺序 |
| 二级入口 | `<子目录>/README.md` | 逐文件登记：路径 + 一句话用途 |

**目录级判据（可执行化）**：

- 子目录含 **≥2 个 md** ⇒ 必须自持 `README.md`（二级入口逐文件登记）
- 子目录只 **1 个 md** ⇒ 不建二级入口，由上级 README 展开登记（避免一个文件配一个索引）
- 总入口只做分类与指路，**不复制二级入口的文件表**（两处维护必漂移）

CoreFlow 的落地形态：`docs/README.md`（总入口）→ `guide/ core/ development/
deployment/ standards/ archive/` 各持 README；`standards/best-practices/` 3 个文件
同样自持 README；`roadmap/` 单文件由总入口展开。

## 2. 放置决策顺序

新文档放哪，按序问：

1. **别的项目 / 新前端也要遵守** → `docs/standards/`（master 在 CoreFlow，子项目持副本，见 §5）
2. **本项目自己的事** → `docs/guide/`（入门）`docs/core/`（原理）`docs/development/`（开发）
   `docs/deployment/`（部署）`docs/roadmap/`（规划）
3. **某个前端项目的实例文档** → 该项目仓的 `docs/`（如 oauth-web 的 `multi-theme.md`）
4. **只服务某个模块** → 与代码共置 `src/<模块>/docs/`（被代码注释 / 脚本以同目录方式引用的，
   刻意不集中）
5. **一次性报告 / 已过期的计划** → `docs/archive/`，入口里标注「不再维护」，**勿删**（查证价值）

## 3. 命名

- 小写连字符：`theme-replacement.md`、`how-to-read-diff.md`
- 不用下划线、不用全大写文件名
- 一次性报告可带日期后缀：`healthcheck-2026-10-09.md`、`test-audit-2026-10-15.md`
- 中文文档允许（面向内部集成的模板类），但**文件名**仍优先英文连字符；确需中文时保持全库一致

## 4. 链接口径

- **站内互链用相对路径且必须带 `.md` 后缀**：`[命名规范](./naming-convention.md)`。
  VitePress 允许省略 `.md`，但 GitHub 点不开 ⇒ 判据是 **GitHub 可点**
- 跨仓引用：独立仓（oauth-web）文档用完整 GitHub URL（外部用户没有 CoreFlow 上下文）；
  本仓文档引用兄弟仓可用 `../../<项目>/...` 相对路径
- 死链零容忍：见 §6 校验脚本第 ③ 项

## 5. 双写（master / 副本）

通用规范的 master 在 CoreFlow `docs/standards/`。独立仓持自包含副本：

| 副本 | master |
| --- | --- |
| oauth-web `docs/theme-replacement.md` | CoreFlow `docs/standards/theme-replacement.md` |
| oauth-web `docs/git-release-rules.md` | CoreFlow `docs/standards/git-release-rules.md` |

**改规范 = 两处同改**（master + 副本），且**入口索引同步双写**（oauth-web 的 `docs/README.md`
持副本登记表）。防副本静默过期——过期的副本比没有更坏（照着错规范写代码）。

## 6. 可执行校验

skill 资产 `assets/docs/check-docs-index.mjs`（可拷到任意仓），三条判据全自动：

```bash
node check-docs-index.mjs docs .vitepress public   # 后跟忽略目录（构建产物等）
```

① 目录级入口强制（≥2 文件必须自持 README）② 每个 md 必须被最近的祖先入口登记
③ 相对链接无死链。退出码 0/1，可直接挂 npm script 或 CI。

**改造既有 docs 的标准动作**：建总入口 → 补二级入口 → 跑校验修到绿 → 提交。

## 7. 新仓接入清单（5 分钟）

1. 建 `docs/README.md` 总入口（照抄本文 §0 的三条铁律作开头）
2. 已有文档逐个登记进总入口（或分子目录后建二级入口）
3. 拷 `check-docs-index.mjs` 到 `scripts/`，跑绿
4. `package.json` 加 script：`"verify:docs": "node scripts/check-docs-index.mjs docs <忽略目录>"`
5. CI 专属关卡里加一步 `npm run verify:docs`（命名规范见 ci-conventions.md）

## 8. FAQ

**Q：docs 里放 API 文档吗？**
不放。API 文档随代码走（路由文件头注释 / OpenAPI 产物），跨端契约才进 docs。

**Q：VitePress 站点首页（index.md frontmatter）算入口吗？**
不算。它是站点封面（hero / features），不是导航；总入口恒为 `README.md`。

**Q：子仓 README 要抄总入口的分类吗？**
不抄。子仓只登记自己的文档 + 一段「其他项目的文档在哪」指回 CoreFlow 总入口即可。
