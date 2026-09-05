# 技能编排规范（Skill Orchestration）

> fullstack-rules 是**主规范层**（始终生效），其他专项 skill 是**深度执行层**（按需调度）。
> 本文件定义：什么时候调度专项 skill、怎么调用、结果如何回填主流程。

## 编排原则

1. **主规范先行**：先按 SKILL.md 固定执行顺序与剧本走主流程；专项 skill 用于在特定阶段**加深**，不是替代主流程。
2. **按场景调度**：任务命中下方编排表时，用 Agent 的 Skill 工具调用对应专项技能（如 `Skill(skill="<name>", args="<上下文>")`）。
3. **结果回填**：专项 skill 的产出（漏洞清单/评分/设计稿）必须**回填主流程**——漏洞进修复流程（剧本 D）、问题进企业级审查清单、设计决策进需求文档。
4. **降级容错**：专项 skill 不存在（环境未安装）时，跳过调度，改用本 skill 的对应 manual 清单人工执行（如 security.md 审查清单），并在输出中注明"深度扫描未执行"。
5. **防循环**：专项 skill 执行期间不要回调 fullstack-rules；编排只发生在主流程的固定节点。

## 编排决策表

| 场景 | 调度的专项 skill | 触发条件 | 产出回填 |
| --- | --- | --- | --- |
| 大型功能上线前的深度安全审查 | `find-security-vulnerabilities-in-code` | 攻击面大的新模块（支付/上传/权限变更）合入前 | 漏洞清单 → 剧本 D 修复流程 |
| API 接口安全测试 | `api-security-testing` | 新增对外 API 域、鉴权逻辑变更 | 越权/注入发现 → 修复流程 |
| OWASP Top 10 合规自查 | `owasp-top-10-testing` | 发布前对暴露面做例行体检 | 按 risk 分级进审查清单 |
| Web 应用渗透测试 | `web-app-penetration-testing` / `penetration-testing-with-strix` | 重大版本发布前 / 定期体检 | 渗透报告 → 修复排期 |
| 修复安全漏洞后回归验证 | `fix-security-vulnerabilities-with-strix` | 剧本 D 修复安全类 bug 后 | 复测结果 → 验收记录 |
| CI 流水线安全扫描 | `ci-security-scanning-with-strix` | 搭建 CI 时 / PR 门禁需求 | SARIF/报告 → PR 评论 |
| UI/UX 设计（新项目/新页面） | `penpot-uiux-design` | requirement-intake Step 3 架构确认后 | 设计稿/设计 Token → 前端实现 |
| Redis 设计疑难（集群/内存/语义缓存） | `redis-core` / `redis-clustering` / `redis-semantic-cache` 等 | 键设计/容量/性能问题超出 redis.md 常规规范 | 设计结论 → 注释与文档 |
| 创建/迭代新 skill | `skill-creator` | 编写新的专项 skill 时 | SKILL.md → 新技能目录 |
| 浏览器端到端验证 / GUI 测试 | `browser-use:control-browser` / `web-gui-tester` | 全链路验证需要真实浏览器操作时 | 操作截图/结果 → 验收记录 |
| Android 壳/混合应用调试 | `android-emulator:android-dev` | 涉及 Capacitor/移动端壳 | 运行结果 → 验收记录 |

> 上表技能名以作者环境为准；**可用性取决于你的 Agent 环境**。环境中没有的技能直接走降级路径。

## 调用时机示例

```text
场景：新支付模块合入前
主流程：剧本 A（新增 API）→ 全链路验证通过
编排节点：合入前 → 调度 find-security-vulnerabilities-in-code（输入：新模块文件列表）
回填：漏洞清单 → 逐条进剧本 D 修复 → 修复完复测 → 企业级审查清单加"本次安全扫描发现"段
```

## 明确不编排的场景

- 日常小改动 / 文档修改（主规范清单足够）
- 只需要常规 lint/test（走 toolbox.md 检查金字塔）
- 专项 skill 与主规范结论冲突时——**以本仓库主规范为准**，并在复盘时记录冲突
