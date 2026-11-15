<script setup lang="ts">
/**
 * 登录页版式 · wechat / **mobile**
 *
 * 微信的登录页只有三件事：一个标识、一个操作面、一句说明。
 * 所以这里把珍珠版的「承台 + 柔光 + 网格 + 卖点段落」全部去掉，只留：
 *
 *   标识区（绿色圆角块 + 名称）
 *   白色块里的 SSO iframe（微信把可操作的东西都放在白块里）
 *   失败提示 —— 灰底上的白条 + 红色图标，不用阴影浮层
 *
 * 纯展示：只读 `ctx`、只调 `ctx.reload()` / `ctx.onIframeLoad()`。
 * 业务逻辑（握手、Cookie、跳转）全在 `views/auth/Login.vue`，本文件不碰。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { AlertCircle, Loader2, RotateCw, ShieldOff } from 'lucide-vue-next';
import type { LoginViewProps } from '@/theme/views/login';

defineProps<LoginViewProps>();
</script>

<template>
  <div class="wxlogin">
    <header class="wxlogin__brand">
      <span class="wxlogin__mark" aria-hidden="true">C</span>
      <h1 class="wxlogin__name">管理后台</h1>
      <span class="wxlogin__env" :class="{ 'is-dev': ctx.isDev }">
        {{ ctx.isDev ? '开发环境' : '生产环境' }}
      </span>
    </header>

    <div class="wxlogin__card">
      <iframe
        :ref="ctx.bindIframe"
        :src="ctx.loginUrl"
        class="wxlogin__iframe"
        title="统一身份认证"
        allow="payment"
        @load="ctx.onIframeLoad"
      ></iframe>

      <!-- 加载态：骨架条比转圈更能表达"正在变成什么" -->
      <div v-if="ctx.loading || ctx.busy" class="wxlogin__mask">
        <div class="wxlogin__skeleton" aria-hidden="true">
          <span class="wxlogin__bone wxlogin__bone--mark"></span>
          <span class="wxlogin__bone wxlogin__bone--title"></span>
          <span class="wxlogin__bone wxlogin__bone--input"></span>
          <span class="wxlogin__bone wxlogin__bone--input"></span>
          <span class="wxlogin__bone wxlogin__bone--btn"></span>
        </div>
        <p class="wxlogin__mask-text">
          <Loader2 class="wxlogin__spin" :size="15" />
          {{ ctx.busy ? '正在建立会话…' : '正在加载安全登录…' }}
        </p>
      </div>
    </div>

    <!-- 失败提示：403 与其它故障分开说，动作也不同 -->
    <div v-if="ctx.errorMessage" class="wxlogin__alert" :class="{ 'is-denied': ctx.denied }" role="alert">
      <ShieldOff v-if="ctx.denied" :size="17" class="wxlogin__alert-icon" />
      <AlertCircle v-else :size="17" class="wxlogin__alert-icon" />
      <div class="wxlogin__alert-body">
        <p class="wxlogin__alert-title">{{ ctx.denied ? '没有访问权限' : '登录未完成' }}</p>
        <p class="wxlogin__alert-text">{{ ctx.errorMessage }}</p>
      </div>
      <button class="wxlogin__retry" type="button" @click="ctx.reload">
        <RotateCw :size="14" />
        {{ ctx.denied ? '换账号' : '重试' }}
      </button>
    </div>

    <p class="wxlogin__hint">没有账号？请联系管理员开通并分配角色</p>

    <footer class="wxlogin__meta">
      <span>CoreFlow · 管理后台</span>
      <span>认证服务 oauth21</span>
    </footer>
  </div>
</template>

<style scoped>
/* 灰底、纵向居中偏上 —— 手机上拇指够得着键盘，品牌区不抢注意力 */
.wxlogin {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: env(safe-area-inset-top) 0 calc(16px + env(safe-area-inset-bottom));
  background: var(--mauth-bg);
  color: var(--mauth-text);
  -webkit-text-size-adjust: 100%;
}

.wxlogin__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 52px 24px 24px;
}

/* 标识：绿色圆角块 + 首字母（微信的应用图标就是这个形制） */
.wxlogin__mark {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--mauth-tint);
  /*
   * 🔴 这里**故意**用固定深墨而不是 `--mauth-on-primary`：
   *    `--mauth-tint` 的语义就是"鲜色"（品牌绿 #82dd2d），两种明暗下都很亮，
   *    白字在它上面只有 1.6:1 —— 而 on-primary 是按 primary（深档）算出来的白色，套过来正好错。
   */
  color: #101418;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.wxlogin__name {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
}

.wxlogin__env {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--mauth-surface);
  color: var(--mauth-text-soft);
  font-size: 11px;
}

.wxlogin__env.is-dev {
  background: var(--mauth-danger-soft);
  color: var(--mauth-danger);
}

/* 白块：SSO 卡片住在这里；窄屏用 16px 边距，和微信的列表块一致 */
.wxlogin__card {
  position: relative;
  margin: 0 16px;
  border-radius: var(--mauth-radius-lg);
  background: var(--mauth-surface);
  overflow: hidden;
}

.wxlogin__iframe {
  display: block;
  width: 100%;
  height: 420px;
  border: 0;
  background: var(--mauth-surface);
}

/* 加载遮罩：白底 + 骨架，不用半透明黑（黑罩会让白块"变脏"） */
.wxlogin__mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--mauth-surface);
}

.wxlogin__skeleton {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0 28px;
}

.wxlogin__bone {
  display: block;
  border-radius: 6px;
  background: var(--mauth-surface-2);
  animation: wxlogin-pulse 1.4s var(--ease) infinite;
}

.wxlogin__bone--mark {
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

.wxlogin__bone--title {
  width: 44%;
  height: 14px;
}

.wxlogin__bone--input {
  width: 100%;
  height: 38px;
}

.wxlogin__bone--btn {
  width: 100%;
  height: 40px;
  margin-top: 4px;
  border-radius: var(--mauth-radius-sm);
}

.wxlogin__mask-text {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
}

.wxlogin__spin {
  animation: wxlogin-spin 1s linear infinite;
}

/* 失败提示：灰底上的一条白块，左侧图标着色 */
.wxlogin__alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 16px 0;
  padding: 12px 14px;
  border-radius: var(--mauth-radius-md);
  background: var(--mauth-surface);
}

.wxlogin__alert-icon {
  flex: none;
  margin-top: 1px;
  color: var(--mauth-danger);
}

.wxlogin__alert-body {
  flex: 1 1 auto;
  min-width: 0;
}

.wxlogin__alert-title {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 500;
}

.wxlogin__alert-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--mauth-text-soft);
  word-break: break-word;
}

.wxlogin__retry {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--mauth-primary);
  font-size: 13px;
  cursor: pointer;
}

.wxlogin__retry:active {
  background: var(--mauth-press);
}

.wxlogin__hint {
  margin: 16px 16px 0;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
  color: var(--mauth-text-soft);
}

.wxlogin__meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  padding-top: 24px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

@keyframes wxlogin-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@keyframes wxlogin-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
