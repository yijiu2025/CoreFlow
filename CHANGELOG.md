# Changelog

本仓库（CoreFlow）遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：major（破坏性变更）/ minor（新增功能，向后兼容）/ patch（修复）。

> 子前端（oauth-web、retroweb、posecraft 等）各自维护独立的 CHANGELOG 与 tag 线，不在本文件内记录。
> 发版流程见 `docs/standards/git-release-rules.md` 与 fullstack-rules 技能的 `references/release-checklist.md`。

## 未发布（Unreleased）

## 2.28.1 — 2026-10-16

### 修复

- **tar 6.2.1 → 7.5.22**：修复 2 个 critical 漏洞告警
- **根 lock 同步 workspace 依赖**：恢复 `npm ci` 可用

### 依赖

- 新增 `dependabot.yml` 统一依赖更新策略
- posecraft 子仓依赖批量 bump：`brace-expansion` / `fast-uri` / `postcss-selector-parser` / `tailwindcss` / `@vue/server-renderer` / `source-map-js` / `axios`

## 2.28.0 — 2026-10-16

### 新增

- **retroweb 业务模块**：骨架（S0）→ 任务真实读写 → LLM 双来源（用户自建 / 系统官方）→ S3 算法中转（同步转发 + job 落库 + SSE 透传 + stale）→ LLM 双来源「选择 UI」（官方/自建可切换，偏好落服务端；官方凭据服务端注入，永不出前端）

### 修复

- CI：钉死 cookie 链版本 + 删除失效的 frontend job，修复四 job 齐红
- CI：安装路径不读 lock + submodule 精确 init
- Docker：构建期自证脚本化（修复 `RUN` 内联多行 `-e` 解析错误）；lockfile 不再进镜像（修复 E2E 冒烟 migrate 悬空软链）
- retroweb：task 表 target 索引改 191 前缀长度，修复 MySQL 迁移失败
- lint：check-browser-baseline 5 处全角空格改半角

### 文档

- 文档体系重组：通用规范收进 `docs/standards/`
- 新增前端主题替换规范、统一 Git 发版规则与通用发布脚本（子前端可复用）

### 杂项

- oauth21 拆分为独立仓库 oauth-web（各自维护版本线）
