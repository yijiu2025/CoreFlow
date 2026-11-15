<script setup lang="ts">
/**
 * 我 —— 微信「我」栏目根页
 *
 * 微信的「我」= 身份 → 设置项 → 退出。这个页面就三件事：
 *   · 我是谁（头像 / 昵称 / 账号）
 *   · 界面怎么长（界面风格、深色模式）
 *   · 怎么走（退出登录）
 *
 * 排版照微信的**设置页**，不是通讯录：左侧没有彩色图标，只有文字 + 右侧的
 * 值 / 开关 / 对勾。上一版每行都挂同一枚 Palette 图标，五个方块排下来既重复又抢
 * 注意力，正是"看起来不搭"的来源之一。
 *
 * 「界面风格」只显示名字 + 对勾，不显示那句"桌面侧栏 + 顶栏…"的技术描述 ——
 * 那是给维护者看的，用户只需要知道"点哪个变哪个"。要看详细差异去个人设置。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Check, ChevronRight, LogOut, Moon, UserRound } from 'lucide-vue-next';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import { shellPackageOptions, useThemePackage } from '@/composables/useThemePackage';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const auth = useAuthStore();
const router = useRouter();
const themeStore = useThemeStore();

/**
 * 界面风格选择器（写 store + 落本地 + 主色联动，见 composable）
 *
 * `shellPackageOptions` 只留"在这台设备上真能换掉这个壳"的包：只有登录页版式的包
 * （聚光）在这里点了不会变，列出来只会让人以为坏了。
 */
const { current, pick } = useThemePackage();
const packages = shellPackageOptions(useRenderDevice().value);

/** 深色开关（三态里的"跟随系统"在手机上不给入口：这个开关只表达当前明暗） */
const isDark = computed(() => themeStore.isDark);

/** 头像加载失败标记（换头像 / 文件被清理时回落到首字母） */
const avatarBroken = ref(false);
watch(
  () => auth.me?.profile?.avatar,
  () => {
    avatarBroken.value = false;
  }
);

/** 展示名（没设昵称时后端已回落到 username，这里再兜一次） */
const displayName = computed(() => auth.me?.profile?.nickname || auth.me?.username || '未登录');

/** 头像地址（头像可能是空的 → 走首字母） */
const avatarUrl = computed(() => auth.me?.profile?.avatar || '');

/** 首字母（头像缺省时的占位） */
const initial = computed(() => displayName.value.slice(0, 1).toUpperCase());

/** 退出登录 */
async function signOut(): Promise<void> {
  await auth.logout();
  router.replace('/login');
}
</script>

<template>
  <div>
    <!-- 身份块：头像 + 名字 + 账号，整块可点（微信的头像区就是这个位） -->
    <button class="wxme" type="button" @click="router.push('/settings/profile')">
      <span class="wxme__avatar">
        <img v-if="avatarUrl && !avatarBroken" :src="avatarUrl" alt="" @error="avatarBroken = true" />
        <template v-else>{{ initial }}</template>
      </span>
      <span class="wxme__text">
        <span class="wxme__name">{{ displayName }}</span>
        <span class="wxme__sub">账号 {{ auth.me?.username || '—' }}</span>
      </span>
      <ChevronRight class="wxme__act" :size="16" />
    </button>

    <p class="wxcells__head">通用</p>
    <div class="wxcells">
      <div class="wxcell wxcell--static">
        <span class="wxcell__ico" style="background: #4a5a75">
          <Moon :size="17" :stroke-width="1.9" />
        </span>
        <span class="wxcell__title">深色模式</span>
        <AppSwitch :model-value="isDark" label="深色模式" @update:model-value="themeStore.toggleTheme()" />
      </div>
      <button class="wxcell" type="button" @click="router.push('/settings/profile')">
        <span class="wxcell__ico" style="background: #2f7cf6">
          <UserRound :size="17" :stroke-width="1.9" />
        </span>
        <span class="wxcell__title">个人资料</span>
        <ChevronRight class="wxcell__chev" :size="16" />
      </button>
    </div>

    <p class="wxcells__head">界面风格</p>
    <div class="wxcells">
      <button
        v-for="item in packages"
        :key="item.id"
        class="wxcell"
        type="button"
        @click="pick(item.id)"
      >
        <span class="wxcell__title">{{ item.name }}</span>
        <Check v-if="current === item.id" class="wxcell__tick" :size="18" :stroke-width="2.2" />
      </button>
    </div>

    <div class="wxcells">
      <button class="wxcell wxcell--danger" type="button" @click="signOut">
        <LogOut :size="16" :stroke-width="1.9" />
        <span class="wxcell__title">退出登录</span>
      </button>
    </div>
  </div>
</template>
