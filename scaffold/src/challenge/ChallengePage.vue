<script setup lang="ts">
/**
 * 管理后台 · 人机挑战页
 *
 * 与 `admin/`、`firewall/` 共用 `challenge-client`（PoW 求解、issue/verify、状态机、
 * 卡片 UI），本文件只做三件宿主该做的事：
 *
 *   1. **API 根**：挑战接口在 `/api/firewall/v1/challenge/*`，与业务前缀 `/admin` 不同源。
 *      这里用裸 fetch（库内部实现），**不走** `api/http.ts` —— 那套实例带 428 跳转
 *      拦截器，会把挑战请求再次弹回本页，形成死循环。
 *   2. **`?return=` 校验**：只放行站内相对路径（`resolveReturnPath`），防开放重定向。
 *   3. **主题值**：本页不挂主题状态机，`--mauth-*` 在这里不存在，所以把卡片消费的
 *      6 个变量按 `palette.ts` 的浅/深值写死（数值与后台白/黑两套配色一致）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { ChallengeCard, resolveReturnPath, useChallenge } from 'challenge-client';

/** dev 走 vite 代理（`/api/firewall` 已在 vite.config.ts 里代理到后端），生产同源 */
const API_ROOT = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL || '';

const params = new URLSearchParams(window.location.search);
const returnPath = resolveReturnPath(params.get('return'), '/');

const { phase, progress, reason, retries, maxAutoRetry, difficulty, passTtlSec, provider, siteKey, retry, submitToken } = useChallenge({
  baseURL: API_ROOT,
  onSuccess: () => {
    window.location.replace(returnPath);
  }
});
</script>

<template>
  <main class="challenge-page">
    <ChallengeCard
      :phase="phase"
      :progress="progress"
      :reason="reason"
      :retries="retries"
      :max-retries="maxAutoRetry"
      :difficulty="difficulty"
      :pass-ttl-sec="passTtlSec"
      :provider="provider"
      :site-key="siteKey"
      :return-path="returnPath"
      product-name="管理后台"
      trigger-label="请求频率超出阈值"
      @retry="retry"
      @submit-token="submitToken"
    />
  </main>
</template>

<style>
/*
 * 本页没有主题注入，卡片消费的 6 个变量在这里给具体值。
 * 数值来自 `src/theme/palette.ts`（LIGHT_TOKENS / DARK_TOKENS），
 * 改配色时请一并同步 —— 这是唯一一处"手抄"色值的地方，已在文件头说明原因。
 */
.challenge-page {
  --text: #101418;
  --muted: #596368;
  --primary: #236de9;
  --modal-bg: #ffffff;
  --modal-border: rgba(46, 58, 62, 0.09);
  --border-radius-lg: 20px;

  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background:
    radial-gradient(900px 460px at 12% -10%, rgba(35, 109, 233, 0.1), transparent 60%),
    radial-gradient(700px 400px at 92% 108%, rgba(130, 221, 45, 0.12), transparent 62%),
    #f6f8f7;
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

@media (prefers-color-scheme: dark) {
  .challenge-page {
    --text: #eef2f1;
    --muted: #a8b3b1;
    --primary: #6ea8ff;
    --modal-bg: #161a1d;
    --modal-border: rgba(255, 255, 255, 0.1);

    background:
      radial-gradient(900px 460px at 12% -10%, rgba(110, 168, 255, 0.12), transparent 60%),
      #0f1214;
  }
}
</style>
