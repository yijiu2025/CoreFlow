<script setup lang="ts">
/**
 * 应用接口开关（整页）
 *
 * === 为什么从抽屉改成整页 ===
 * 抽屉宽度只有 680px，而一个应用的接口数可以到三位数（管理后台 101 个）。在那么窄的
 * 容器里，接口名与路径必然被截断成 `console:app:listP...`，只能一条条往下滚，既比不出
 * 同一模块下几个接口的差异，也没地方放搜索与筛选。整页之后宽度不再是瓶颈：路径能完整
 * 显示、表头能吸顶、组内权限码可以只写一次。
 *
 * === 为什么不走 `<ThemeView>` ===
 * 同 `views/system/Apps.vue` 与 `views/settings/Theme.vue`：这是运维侧的配置面板，
 * 列与列之间是数据关系（接口 / 路径 / 权限码 / 开关），不需要每个主题包 × 设备各写一份
 * 版式。版式逻辑收在 `AppApiPanel`（`mode="inline"`），本文件只负责取应用名与外壳。
 *
 * === 为什么走真路由而不是抽屉 ===
 * 能深链（把"某应用的接口开关"发给同事）、能按返回键回到列表、能进历史栈。
 * `meta.stack: true` 让外壳把汉堡换成返回箭头。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, RefreshCw } from 'lucide-vue-next';
import { listApps, type AppOverview } from '@/api/system';
import AppApiPanel from '@/components/business/AppApiPanel.vue';

const route = useRoute();
const router = useRouter();

/** 路由里的应用标识（`/system/app/:appId/apis`） */
const appId = computed(() => String(route.params.appId || ''));

/** 应用清单：只用来取显示名与统计（接口树由面板自己拉） */
const apps = ref<AppOverview[]>([]);
const loading = ref(false);

/** 当前应用的元信息（找不到时退回用 appId 当名字） */
const app = computed<AppOverview | null>(() => apps.value.find(a => a.appId === appId.value) || null);
const appName = computed(() => app.value?.name || appId.value);

/**
 * 面包屑式的说明行：让"这一页属于哪个应用"一眼可见
 *
 * 深链进来时用户看不到列表页，标题里必须带应用名，否则只写"接口开关"等于没说是谁的。
 */
const summary = computed(() => {
  if (!app.value) return '';
  const c = app.value.counts;
  return `${appId.value} · ${app.value.apis?.total ?? 0} 个接口（${app.value.apis?.disabled ?? 0} 关） · ${c.permissionCodes} 权限码`;
});

/** 拉应用清单（失败不阻断：面板自己会拉接口树，这里只影响标题） */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listApps();
    apps.value = res.apps;
  } catch {
    /* 忽略：标题退回 appId 即可，不因为清单失败挡住主功能 */
  } finally {
    loading.value = false;
  }
}

/** 返回应用列表 */
function back(): void {
  void router.push({ name: 'system-app' });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="app-apis">
    <header class="app-apis__head">
      <button class="app-apis__back" type="button" @click="back">
        <ArrowLeft :size="15" />
        应用管理
      </button>
      <div class="app-apis__titles">
        <h1 class="app-apis__title">接口开关 · {{ appName }}</h1>
        <p v-if="summary" class="app-apis__sub">{{ summary }}</p>
      </div>
      <button class="btn btn--ghost btn--sm" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="14" :class="{ 'is-spin': loading }" />
        刷新
      </button>
    </header>

    <!-- 面板自己拉接口树，这里不再重复请求 -->
    <AppApiPanel :app-id="appId" :app-name="appName" mode="inline" @changed="load" />
  </div>
</template>

<style scoped>
.app-apis {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 1180px;
}

.app-apis__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-apis__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: var(--mauth-radius-sm);
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
  cursor: pointer;
}

.app-apis__back:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.app-apis__titles {
  min-width: 0;
  flex: 1;
}

.app-apis__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--mauth-text);
}

.app-apis__sub {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.is-spin {
  animation: app-apis-spin 0.9s linear infinite;
}

@keyframes app-apis-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
