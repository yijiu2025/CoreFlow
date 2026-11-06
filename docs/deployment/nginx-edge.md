# 边缘层（nginx）与挑战页部署

> 状态：**✅ 配置片段与文档已落地**（2026-11-06）。片段本身需要你按部署改三处标 ⟨改⟩ 的地方。

配置文件：[`deployment/nginx/firewall-edge.conf`](../../deployment/nginx/firewall-edge.conf)

## 这一层到底解决什么

应用层（Node）已经有全局限流、端点级限频、扫描陷阱、封禁、人机挑战。边缘再加一层，
只为两件事：

| 目的 | 做法 |
| --- | --- |
| 在流量到达 Node 之前掐掉明显洪水 | `limit_req`（按 IP）+ `limit_conn` |
| 兜住"应用层还没反应过来"的突发 | 同上，但阈值**比应用层宽** |

它**不**做任何语义判定：不懂挑战、不懂封禁、不认 token。判断"这是不是机器人"永远是
应用层的事。

## 三条不能反过来的规则

1. **边缘阈值必须比应用层宽（片段里取 2 倍）**。
   挑战端点应用层是 `issue 10/min + verify 20/min`，边缘给 `40r/m`；
   全局限流应用层 600/min，边缘给 `1200r/m`。
   反过来（边缘更严）的后果很具体：**用户拿到 429，面板里查无此人** —— 这是最难排障的
   一类问题，只能靠 `firewall.access.log` 对账。片段里已经写进注释。

2. **挑战相关响应绝不能被缓存**。
   挑战页内联了本次的 `challengeId/salt`，302/428 也带 `no-store`。边缘若缓存住，
   等于把同一份题发给所有人：先解的通过，其余全部 `Challenge Expired`。
   所以片段里对该路径显式 `proxy_ignore_headers Cache-Control` + `add_header no-store`。

3. **`X-Forwarded-For` 必须与后端 `PROXY_TRUST_CIDR` 成对配置**。
   缺任一半，`request.ip` 会全是反代地址：
   - 指纹含 IP → 一个人通过挑战，**120s 内全站共享通过态**
   - 限流/封禁按 IP → 全员共用一个"IP"，误伤所有人

   后端启动时会打 `describeProxyTrustRisk` 的告警，别忽略。

## 怎么接进现有站点

```nginx
# /etc/nginx/nginx.conf 的 http{} 里
include /etc/nginx/conf.d/firewall-edge-zones.conf;   # ← 片段中 ①② 的 zone/map

# 你的站点 server{} 里
include /etc/nginx/conf.d/firewall-edge-locations.conf;  # ← 片段中 ③④⑤ 的 location
```

配置里把 `root` 指到前端 `dist` 的部署目录（CI 产物，**不进后端镜像**）。
前端挂在哪个路径由构建时的 `VITE_BASE` 决定（默认 `/firewall/`），
后端代码里**零处**引用该路径，换目录/换域名不需要改后端。

## 上线后怎么确认它真的生效

```bash
# ① 挑战接口带 no-store（两层都要有）
curl -sI https://example.com/api/firewall/v1/challenge/issue | grep -i cache-control

# ② 真实 IP 透传到了后端（面板「实时流量日志」里的 IP 不能全是 127.0.0.1）
curl -s https://example.com/api/firewall/v1/monitor/records -b '<admin cookie>' | head

# ③ 边缘限流能触发但不误伤（连打 50 次，前 ~20 次应放行）
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://example.com/api/firewall/v1/challenge/verify
done; echo
```

第三条如果**每次都是 429**，说明 `burst` 太小或 zone 被别的 location 共用；
如果**一次都不限**，说明 include 没生效（`nginx -T | grep fw_challenge` 可以确认）。

## 与面板/观测的关系

边缘拒绝**不会**出现在面板里（它根本没到应用层）。所以：

- 片段里保留了 `access_log`，排障时以它为准；
- 如果某天"用户说被拦、面板没有记录"，先查 `firewall.access.log` 有没有 429/444；
- 长期看，如果边缘限流命中率一直很高，说明应用层阈值该调，而不是继续加码边缘。

## 待办

- [ ] 恶意 UA/路径的 `map`（片段中 ② ⑥）默认注释：先观察一个月再开，
      否则容易误杀监控探针与脚本客户端；
- [ ] 若前端上 CDN：`no-store` 要在 CDN 侧也配一遍，并**保留** `Set-Cookie` 透传
      （否则 `fw_verified` 落不下来，用户会陷入"通过后又被挑战"的循环）。
