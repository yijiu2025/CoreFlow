# well-skill

[English](./README.md) | [简体中文](./README.zh-CN.md)

> 本仓库是 **fullstack-rules** 技能的官方发布仓库——一套面向 AI 编码助手（Claude Code / ZCode / Codex 等）的全栈开发规范技能，让 AI 在你的代码库里**按需精准加载规范、复用历史事故经验、编排其他专项技能**。

## Why

AI 编码助手的能力瓶颈往往不是"会不会写代码"，而是：

1. **规范全量加载**——把几百行规范一股脑塞进上下文，关键指令被稀释
2. **指令与代码库漂移**——文档里的路径/签名过时，AI 照抄直接报错
3. **没有历史记忆**——同一类事故反复踩，AI 不会从上次的教训里学习
4. **单打独斗**——明明环境里装了安全测试/UI 设计等专项技能，主流程却不知道调度它们

well-skill（fullstack-rules）针对这四点逐一工程化。

## Features

- **分层加载**：SKILL.md 核心层 ≤160 行（铁律/执行顺序/行为准则/检查清单），15+ 按需加载的 references（主题文档），日常会话只占最小上下文
- **端到端剧本**：6 大高频任务（新增 API / 新增页面 / 对接外部 API / 修 Bug / 代码审查 / 安全审查）各有步骤与验收清单
- **事故复盘库**：12 条真实生产事故的结构化复盘（现象→根因→规则→防回归），AI 修 Bug 前先扫描，不重蹈覆辙
- **技能编排**：内置决策表，在固定节点调度安全测试 / UI 设计 / Redis 等其他专项技能做深度执行，结果回填主流程；技能缺失时自动降级为人工清单
- **检查工具箱**：检查金字塔（语法→单元→集成→安全→全量）+ 场景化命令矩阵 + 提交前清单，验证命令单一来源
- **自检脚本**：`doctor.mjs` 机器校验技能健康度（链接可达性 / 禁用模式 / 行数上限 / 必需文件），防止文档随代码库演进腐化

## Structure

```
well-skill/
├── SKILL.md              # 核心层（每次会话加载）：铁律、执行顺序、行为准则、检查清单
├── references/           # 按需加载层（15+ 主题文档）
│   ├── workflows.md      #   六大端到端任务剧本
│   ├── pitfalls.md       #   项目事故复盘库
│   ├── orchestration.md  #   技能编排决策表
│   ├── toolbox.md        #   代码检查工具箱
│   ├── anti-patterns.md  #   反例速查 + 企业级审查清单
│   ├── requirement-intake.md / kx.md   # 需求确认流程 / KX 架构 DSL
│   ├── note.md / naming-convention.md / testing.md / security.md / git-patterns.md / code-review.md
│   ├── backend/          #   Fastify 路由模板 / Redis 规范
│   └── frontend/         #   Vue 3 规范 / Remotion
├── scripts/doctor.mjs    # 技能自检脚本
└── assets/               # KX SPEC 等
```

## Install

**方式一：克隆进项目的技能目录（推荐）**

```bash
# 在你的项目根目录
mkdir -p .claude/skills
git clone https://github.com/yijiu2025/well-skill .claude/skills/fullstack-rules
```

**方式二：作为子模块跟随仓库**

```bash
git submodule add https://github.com/yijiu2025/well-skill .claude/skills/fullstack-rules
```

安装后在支持 Agent Skills 的环境中（Claude Code / ZCode 等）即可自动按 `whenToUse` 触发；
也可以手动让 AI"读取 .claude/skills/fullstack-rules/SKILL.md 并按其执行"。

## Verify

```bash
node .claude/skills/fullstack-rules/scripts/doctor.mjs
```

doctor 会校验：文档内链接可达性、禁用模式（旧路径 / 虚构配置项）、SKILL.md 行数上限、
frontmatter 完整性、必需文件清单。**修改 skill 后必须重跑。**

## Customization

技能中的路径规范、检查命令、事故库条目以本仓库作者的项目为背景。
引入你自己的项目后建议做一次本地化：

1. `references/backend/*.md` 与 `references/frontend/*.md` 中的路径、端口、表名前缀替换为你的项目值
2. `pitfalls.md` 清空模板条目，随你的项目逐步积累真实事故
3. `orchestration.md` 的编排表按你环境中实际安装的技能调整
4. 每次提交后按 `anti-patterns.md` 的"提交后复盘"三问迭代技能本身

## License

[MIT](./LICENSE) © 2026 qirly
