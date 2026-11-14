<script setup lang="ts">
/**
 * 发现 —— 微信「发现」栏目根页
 *
 * 微信的「发现」是"看一眼就走"的功能格：扫一扫、看一看、搜一搜这类。后台里
 * 与之对应的是**只读的运维页**（日志、防火墙）—— 它们不需要常驻在 TabBar 上，
 * 但每天都会点一两次。
 *
 * 与「我」的分工：个人偏好只放在「我」，这里不放。上一版把「个人设置」也摆了一份，
 * 结果同一个人从两个栏目点进同一屏，这不符合"一个功能只有一个入口"。
 *
 * 组标题只在一组以上时才渲染：只有一组的时候，标题等于把页面名又说一遍。
 * 入口按路由 `meta.permission` 过滤（与守卫同一份判据），进不去的直接不出现。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, LogIn, ScrollText, ShieldAlert } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

/** 一条入口 */
interface Entry {
  path: string;
  title: string;
  /** 右侧短说明（≤7 字，说清"这一屏能查到什么"） */
  note: string;
  icon: typeof LogIn;
  color: string;
}

/** 分组：组标题 → 入口 */
const GROUPS: Array<{ title: string; items: Entry[] }> = [
  {
    title: '监控与审计',
    items: [
      { path: '/monitor/oper-log', title: '操作日志', note: '谁改了什么', icon: ScrollText, color: '#2f7cf6' },
      { path: '/monitor/login-log', title: '登录日志', note: '登录与失败', icon: LogIn, color: '#10b981' },
      { path: '/monitor/firewall', title: '防火墙', note: '拦截记录', icon: ShieldAlert, color: '#fa5151' }
    ]
  }
];

/** 过滤后的分组（空组整组消失） */
const groups = computed(() =>
  GROUPS.map(group => ({
    title: group.title,
    items: group.items.filter(item => {
      const resolved = router.resolve(item.path);
      if (resolved.name === 'not-found') return false;
      const code = (resolved.meta?.permission as string | undefined) ?? '';
      return !code || auth.hasPermission(code);
    })
  })).filter(group => group.items.length > 0)
);

/** 只有一组时不写组标题（写了等于把页面名重复一遍） */
const showGroupTitle = computed(() => groups.value.length > 1);
</script>

<template>
  <div>
    <template v-for="group in groups" :key="group.title">
      <p v-if="showGroupTitle" class="wxcells__head">{{ group.title }}</p>
      <div class="wxcells">
        <button
          v-for="item in group.items"
          :key="item.path"
          class="wxcell"
          type="button"
          @click="router.push(item.path)"
        >
          <span class="wxcell__ico" :style="{ background: item.color }">
            <component :is="item.icon" :size="17" :stroke-width="1.9" />
          </span>
          <span class="wxcell__title">{{ item.title }}</span>
          <span class="wxcell__note">{{ item.note }}</span>
          <ChevronRight class="wxcell__chev" :size="16" />
        </button>
      </div>
    </template>

    <div v-if="groups.length === 0" class="wxcells">
      <div class="wxcells__empty">当前账号没有可查看的内容</div>
    </div>
  </div>
</template>
