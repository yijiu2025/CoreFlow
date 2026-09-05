# well-skill

[English](./README.md) | [简体中文](./README.zh-CN.md)

> This repository is the official home of the **fullstack-rules** skill — a full-stack development
> rules skill for AI coding agents (Claude Code / ZCode / Codex, etc.) that makes AI
> **load rules on demand, reuse hard-won incident experience, and orchestrate other
> specialized skills** inside your codebase.

## Why

The bottleneck of AI coding agents is rarely "can it write code". It is:

1. **Whole-rulebook loading** — hundreds of lines of rules stuffed into every context, diluting the critical instructions
2. **Docs drifting from the codebase** — stale paths/signatures in templates that make AI copy-paste failures
3. **No memory of incidents** — the same class of bug gets re-introduced because AI never learned from last time
4. **Working alone** — security-testing / UI-design skills may be installed in the environment, but the main workflow never invokes them

well-skill (fullstack-rules) engineers around each of these.

## Features

- **Tiered loading** — SKILL.md core layer ≤160 lines (iron rules / execution order / behavior / checklists), 15+ on-demand references; day-to-day sessions consume minimal context
- **End-to-end playbooks** — 6 high-frequency tasks (new API / new page / external API integration / bug fixing / code review / security review), each with steps and acceptance checklists
- **Incident retrospective library** — 12 structured real production incidents (symptom → root cause → rule → regression guard); AI scans them before bug fixing so history does not repeat
- **Skill orchestration** — a built-in decision table to invoke other installed skills (security testing / UI design / Redis deep-dives) at fixed checkpoints, with results funneled back; graceful fallback when a skill is missing
- **Verification toolbox** — the checking pyramid (syntax → unit → integration → security → full), scenario-based command matrix, and a pre-commit checklist; a single source of truth for verification commands
- **Self-check script** — `doctor.mjs` machine-verifies skill health (link reachability / forbidden patterns / line budget / required files), keeping docs from rotting as the codebase evolves

## Structure

```
well-skill/
├── SKILL.md              # Core layer (loaded every session): iron rules, order, behavior, checklists
├── references/           # On-demand layer (15+ topic docs)
│   ├── workflows.md      #   Six end-to-end playbooks
│   ├── pitfalls.md       #   Incident retrospective library
│   ├── orchestration.md  #   Skill orchestration decision table
│   ├── toolbox.md        #   Verification toolbox
│   ├── anti-patterns.md  #   Anti-pattern quick sheet + enterprise review checklist
│   ├── requirement-intake.md / kx.md   # Requirement intake / KX architecture DSL
│   ├── note.md / naming-convention.md / testing.md / security.md / git-patterns.md / code-review.md
│   ├── backend/          #   Fastify route templates / Redis rules
│   └── frontend/         #   Vue 3 rules / Remotion
├── scripts/doctor.mjs    # Skill self-check script
└── assets/               # KX SPEC, example
```

## Install

**Option 1: clone into your project's skills directory (recommended)**

```bash
# from your project root
mkdir -p .claude/skills
git clone https://github.com/yijiu2025/well-skill .claude/skills/fullstack-rules
```

**Option 2: track it as a submodule**

```bash
git submodule add https://github.com/yijiu2025/well-skill .claude/skills/fullstack-rules
```

Once installed, agents with Skills support (Claude Code / ZCode, etc.) trigger it automatically via
`whenToUse`; you can also explicitly ask the AI to "read .claude/skills/fullstack-rules/SKILL.md and follow it".

## Verify

```bash
node .claude/skills/fullstack-rules/scripts/doctor.mjs
```

doctor validates: reachability of every in-document link, forbidden patterns (stale paths /
hallucinated config keys), the SKILL.md line budget, frontmatter completeness, and the required-files
list. **Always re-run after editing the skill.**

## Customization

The paths, ports, check commands and incident entries ship with the author's project as background.
After adopting it into your own project, localize once:

1. Replace paths / ports / table prefixes in `references/backend/*.md` and `references/frontend/*.md` with your project's values
2. Empty the sample entries in `pitfalls.md` and grow it with your project's real incidents
3. Adjust the orchestration table in `orchestration.md` to the skills actually installed in your environment
4. After every commit, iterate the skill itself using the three retrospective questions in `anti-patterns.md`

## License

[MIT](./LICENSE) © 2026 qirly
