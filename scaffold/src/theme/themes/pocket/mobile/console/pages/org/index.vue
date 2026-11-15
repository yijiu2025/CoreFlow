<script setup lang="ts">
/**
 * 通讯录 —— 微信「通讯录」栏目根页
 *
 * 为什么住在主题包里而不是 `views/`：这一屏是**版式骨架的一部分**，不是业务页面。
 * 它只回答"后台那几个页面在手机上怎么排"，用的是微信的 cell 语言（彩色方块图标 +
 * 发丝线切行 + 分组标题）；珍珠玻璃主题下根本没有这一屏 —— 路由上的
 * `meta.themePkg = 'pocket'` 会让它跳回工作台。业务页面正好相反：它们一行都不知道
 * 自己长什么样，全靠 `kit/` 按 `data-page` 适配。
 *
 * 分组照微信通讯录：先"组织架构"（人 / 部门 / 岗位），再"权限与导航"
 * （角色 / 菜单）。微信通讯录的组标题里不会写"这一组能干什么"，所以说明文字一律
 * 是短词，只用来区分同组的两个陌生名词，不解释机制。
 *
 * 入口按**权限码**过滤（判据取路由 `meta.permission`，与守卫同一份）：进不去的
 * 直接不出现，不留"点一下换个 /no-access"的死入口。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Briefcase, ChevronRight, ListTree, Network, ShieldCheck, Users } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

/** 一条入口 */
interface Entry {
  path: string;
  title: string;
  /** 右侧短说明（≤7 字，只为区分名词，不解释机制） */
  note: string;
  icon: typeof Users;
  /** 图标底色（微信靠彩色方块做识别，不靠线条图标区分） */
  color: string;
}

/** 分组：组标题 → 入口（顺序 = 组织结构的自然顺序） */
const GROUPS: Array<{ title: string; items: Entry[] }> = [
  {
    title: '组织架构',
    items: [
      { path: '/system/user', title: '用户', note: '账号与状态', icon: Users, color: '#07c160' },
      { path: '/system/dept', title: '部门', note: '层级与负责人', icon: Network, color: '#2f7cf6' },
      { path: '/system/post', title: '岗位', note: '职务名称', icon: Briefcase, color: '#fa9d3b' }
    ]
  },
  {
    title: '权限与导航',
    items: [
      { path: '/system/role', title: '角色', note: '谁能看什么', icon: ShieldCheck, color: '#7d5cf6' },
      { path: '/system/menu', title: '菜单', note: '导航与页面', icon: ListTree, color: '#10b981' }
    ]
  }
];

/**
 * 当前账号进得去的分组（空组整组消失 —— 只剩标题比没有更让人困惑）
 *
 * 判据与 `AppShell.can` 一致：路由未注册 → 藏；路由声明了权限码而账号没有 → 藏。
 */
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
</script>

<template>
  <div>
    <template v-for="group in groups" :key="group.title">
      <p class="wxcells__head">{{ group.title }}</p>
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
