# Firewall 前端页面流转与交互关系图 (User Flow & Interactions)

本文件使用 Mermaid.js 拓扑连线图定义了防火墙平台 `firewall` 前端的所有控制页面流转和核心 API 交互逻辑。

---

## 1. 全景页面连线图 (Flowchart)

```mermaid
flowchart TD
    %% 页面节点声明
    Dashboard[安全仪表盘 DashboardView.vue]
    FirewallList[名单拦截管理 FirewallView.vue]
    Console[安全控制台 ConsoleView.vue]
    Logs[防护日志审计 LogsView.vue]
    Settings[全局防护设置 SettingsView.vue]

    %% 交互连线与流转逻辑
    Dashboard -->|点击侧栏: 拦截规则| FirewallList
    Dashboard -->|点击侧栏: 交互控制| Console
    Dashboard -->|点击侧栏: 日志审计| Logs
    Dashboard -->|点击侧栏: 设置中心| Settings

    FirewallList -->|点击 '新增黑/白名单' -> 触发创建API| CreateRule[POST /api/v1/firewall/rules/add]
    FirewallList -->|点击 '解除封禁' -> 触发删除API| DeleteRule[DELETE /api/v1/firewall/rules/delete]

    Console -->|点击 '触发全站挑战' -> 强制降级| TriggerChallenge[POST /api/v1/firewall/action/challenge]
    Console -->|点击 '清空拦截统计'| ClearStats[POST /api/v1/firewall/action/clear]

    Settings -->|修改安全等级/GeoIP围栏 -> 触发保存| SaveSettings[POST /api/v1/firewall/config/save]
```

---

## 2. 核心功能及交互提示 (Functional Tooltips)

- **安全仪表盘 (`DashboardView.vue`)**：
  - _功能_：实时统计并渲染防火墙拦截的流量环形图（QPS 监控、Bot 攻击数、IP 区域分布）。
- **名单拦截管理 (`FirewallView.vue`)**：
  - _功能_：对 IP 白名单和黑名单进行增删改查。当防火墙误拦某 IP 时，管理员可在此快速将该 IP 解除封禁或加入白名单。
- **安全控制台 (`ConsoleView.vue`)**：
  - _功能_：提供应急响应下的防御操作（例如一键对全站所有未登录请求开启五层人机识别验证码挑战）。
