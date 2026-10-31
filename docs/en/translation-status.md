# Translation status {#translation-status}

The documentation site is **Chinese-first**. English pages are translated incrementally, on
demand — the Chinese page is always the canonical source.

> If an English page and its Chinese counterpart disagree, **the Chinese page wins** (it is the
> one maintained alongside the code). Please open an issue when you spot drift.

## Translated

| Page | Chinese |
| --- | --- |
| [Introduction](/en/guide/introduction) | [项目简介](/guide/introduction) |
| [Quick start](/en/guide/quick-start) | [快速上手](/guide/quick-start) |
| [Project structure](/en/guide/project-structure) | [项目结构](/guide/project-structure) |
| [Architecture](/en/core/architecture) | [架构总览](/core/architecture) |
| [Auth integration](/en/standards/auth-integration) | [认证集成](/standards/auth-integration) |
| [Docker deployment](/en/deployment/docker) | [Docker 部署](/deployment/docker) |

## Chinese only (not translated yet)

| Page | Topic |
| --- | --- |
| [命令行工具](/guide/cli) | interactive admin CLI |
| [CLI 插件开发](/guide/cli-plugins) | writing CLI plugins |
| [AI 辅助开发](/guide/ai-development) | AI prompts for backend scaffolding |
| [请求处理流水线](/core/request-pipeline) | the full request path |
| [认证系统](/core/auth) | session / JWT internals |
| [权限系统 (PBAC)](/core/permission) | permission model |
| [三级守卫](/core/guard) | guard levels |
| [开发规范总纲](/development/development-standards) | coding conventions |
| [应用模块开发](/development/app-module) | building an app module |
| [数据模型](/development/models) | Sequelize models |
| [API 路由](/development/api-routes) | route conventions |
| [命名规范](/development/naming) | naming |
| [数据库迁移](/development/migrations) | migrations |
| [代码审查标准与流程](/development/code-review) | code review |
| [注册登录全链路流程图](/development/注册登录全链路流程图) | registration/login sequence diagrams |
| [OAuth 2.1 API 报告](/oauth21-api-report) | endpoint inventory |
| [Git 提交与发版规则](/standards/git-release-rules) | commits and releases |
| [安全最佳实践](/standards/best-practices/security) | security checklist |
| [性能最佳实践](/standards/best-practices/performance) | performance |
| [测试最佳实践](/standards/best-practices/testing) | testing |
| [私钥信封加密](/deployment/key-encryption) | envelope encryption for private keys |
| [多服务器架构](/deployment/multi-server) | multi-server roles |
| [CI/CD](/deployment/cicd) | pipelines |
| [升级路线图](/roadmap/) | roadmap |

## Want a page translated?

Open an issue titled `docs(en): <page>` — or send a PR adding `docs/en/<path>.md` and a row to
the table above. Keep the heading anchors identical to the Chinese page so cross-links and
`#anchors` keep working.
