<script setup lang="ts">
/**
 * tablet（平板）登录容器 —— **业务零复制**的薄转发
 *
 * === 为什么这个文件只有 4 行 ===
 * tablet 的业务与 standard（桌面）**完全一致**（都是桌面登录表单 + 二维码 + 授权确认），
 * 区别只在「设备身份」—— 它决定主题作用域（配色从 `themes/<包>/tablet/` 找）与
 * 版式加载（`themes/<包>/tablet/login/index.vue`）。
 *
 * 所以这里不复制 StandardLogin 的 ~370 行业务，而是：
 *   ① 转发 StandardLogin（业务 + 契约组装只有一份，见 multi-theme.md 职责红线）
 *   ② 用 `device="tablet"` prop 覆盖它的设备身份（StandardLogin 里 THEME_DEVICE 默认
 *      standard，本容器显式传 tablet，让它读 `?view.tablet`、按 tablet 作用域加载版式）
 *
 * 这正是「加一种设备」的真实落地形态：清单加一条 + 写这个 4 行容器 + 写主题目录，
 * 业务代码**一行都不复制**。
 *
 * @author yijiu2025
 * @since 2026-09-27
 */
import StandardLogin from '@/view/web/login/StandardLogin.vue';
</script>

<template>
  <StandardLogin device="tablet" />
</template>
