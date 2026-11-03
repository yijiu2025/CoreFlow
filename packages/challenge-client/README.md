# challenge-client

人机挑战页共享库 —— 供 `admin/` 与 `firewall/` 两个前端复用。

## 为什么存在

被边界防护判为 `CHALLENGE` 的客户端会收到 **428 + `X-Firewall-Challenge`**，
前端需要跳到一个挑战页：算一次工作量证明（PoW），拿 `fw_verified` cookie，然后回到原页面。

这件事在两个前端里是**同一件事**（PoW 算法、issue/verify 调用、失败重试、卡片 UI）。
复制两份必然漂移，而它直接决定"被拦的用户能不能自解"，所以抽成共享库。

## 怎么被引入（重要）

**纯源码共享，不登记进 npm workspace。**

两个 app 通过下面两处指向本目录，**没有** `package.json`、**没有**构建步骤：

- `vite.config.*` → `resolve.alias['challenge-client'] = ../packages/challenge-client/src/index.ts`
- `tsconfig.json` → `paths` 同名映射 + `include` 本目录的 `*.ts` / `*.vue`

刻意不写成 workspace 包：一旦成为 workspace 包，根 `package-lock.json` 必须同步
（`npm ci` 会校验），而这段代码不值得为此动锁文件。

## 导出

| 导出 | 作用 |
| --- | --- |
| `sha256Hex` / `solvePow` | 浏览器端 SHA-256 与分片求解（与服务端 `util/pow-sha256.js` 逐字节等价） |
| `issueChallenge` / `verifyChallenge` | 调 `POST /api/firewall/v1/challenge/{issue,verify}`（裸 fetch + cookie，不走业务 axios 拦截器） |
| `useChallenge` | 状态机：`idle → solving → verifying → ok / error`，含取消与自动重试封顶 |
| `resolveReturnPath` | 校验 `?return=`（只放行站内相对路径，防开放重定向） |
| `ChallengeCard` | 卡片 UI（纯展示，跟随宿主主题变量） |

## 页面怎么用

```vue
<script setup lang="ts">
import { ChallengeCard, resolveReturnPath, useChallenge } from 'challenge-client';

const returnPath = resolveReturnPath(new URLSearchParams(location.search).get('return'), '/');
const { phase, progress, reason, retries, maxAutoRetry, difficulty, retry } = useChallenge({
  baseURL: '', // 跨域开发时填后端地址
  onSuccess: () => location.replace(returnPath)
});
</script>

<template>
  <ChallengeCard
    :phase="phase" :progress="progress" :reason="reason" :retries="retries"
    :max-retries="maxAutoRetry" :difficulty="difficulty" :return-path="returnPath"
    @retry="retry"
  />
</template>
```

## 与服务端的契约（改任一侧都要同步）

| 项 | 值 |
| --- | --- |
| 题目 | `sha256(challengeId + ':' + salt + ':' + answer)` 前导 `difficulty` 个 `0` |
| 载荷 | 只存服务端，TTL 300s，**一次性消费**（`GET+DEL`） |
| 签发前提 | **只在挑战态签发**（非挑战态 → 403 `Not Challenged`，防"预先解一次换免检"） |
| 绑定 | IP + 请求指纹 + 设备 ID，三者都参与校验 |
| 通过令牌 | `fw_verified`（HttpOnly）：**已登录 30 分钟 / 匿名 2 分钟**（按登录态分档，匿名不给长期通行证） |
| 挑战页豁免 | `/firewall/challenge.html`、`/admin/challenge.html`、`/challenge.html` 及其 `assets/` 前缀（见 `pipeline.js` 的 `CHALLENGE_PAGE_PATHS`） |

> 挑战页是**独立构建入口**（各自的 `challenge.html`），不是 SPA 深链路由：后端没有 SPA
> 回退，且主 app 启动即请求业务接口，会立刻撞上 428 而自我打死。
