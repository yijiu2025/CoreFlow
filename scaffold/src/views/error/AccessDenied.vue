<script setup lang="ts">
/**
 * 无访问权限页（**已认证但没被授予后台角色**）
 *
 * 与 `NoAccess.vue` 的分工：
 *   · `NoAccess.vue`  —— 已进后台，但缺某个具体权限码（挂在 AppShell 里，侧栏还在）
 *   · `AccessDenied.vue`（本页）—— 连后台都进不去（`/session/me` 403），没有侧栏可用
 *
 * 为什么必须单独一页而不是"回登录页"：这类账号的 SSO 身份是有效的，回登录页再登
 * 一次结果完全相同 —— 用户会以为是自己密码打错了，反复重试。这里把原因说清楚，
 * 并给两条真正的出路：换账号 / 退出。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { ThemeView } from 'skinsuite/vue';
import type { AccessDeniedViewContext } from '@/theme/views/access-denied';

const router = useRouter();
const auth = useAuthStore();
const device = useRenderDevice();

/**
 * 退出并去登录页（换账号）
 *
 * 失败也要跳：Cookie 清不掉时留在本页只会让用户卡住，跳过去至少能重新走一遍
 * SSO（`bind-session` 会用新身份覆盖旧会话）。
 */
async function switchAccount(): Promise<void> {
  try {
    await auth.logout();
  } finally {
    await router.replace('/login');
  }
}
/** 后端给的说明（版式不碰 store，这里算好再给） */
const message = auth.deniedMessage || '该账号没有管理后台的访问权限，请联系管理员分配角色后再试。';


/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: AccessDeniedViewContext = {
  device,
  message,
  switchAccount
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/access-denied/`），容器只准备 ctx -->
  <ThemeView page="access-denied" :device="device" :ctx="ctx" />
</template>
