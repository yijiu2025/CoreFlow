<script setup lang="ts">
/**
 * 应用管理
 *
 * === 这一页为什么只读 ===
 * 应用是**代码声明**的：一个应用 = `src/app/<app>/config.js`（app_id / 准入策略 /
 * 默认角色）+ `src/api/<system>/system.json`（路由前缀与所属应用）。增删意味着加目录、
 * 改代码、重启；而 `access` / `default_role` 改错，后果是"后台对所有人敞开"或
 * "谁都进不来"。所以这里只回答"系统里有哪些应用、各自配了多少东西"，写仍走代码评审。
 *
 * === 为什么不走 `<ThemeView>` ===
 * 同 `views/settings/Theme.vue`：这张表是运维只读清单，列与列之间是数据关系，
 * 不需要每个主题包 × 设备各写一份版式。代价是自己写一点 scoped 样式（本文件底部），
 * 移动端在同一个文件里用媒体查询收成卡片。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { computed, onMounted, ref } from 'vue';
import { ChevronRight, LayoutGrid, RefreshCw, Search } from 'lucide-vue-next';
import { listApps, type AppOverview } from '@/api/system';
import { useRouter } from 'vue-router';

/** 清单（接口不带分页：应用数量是个位数到十几个，前端过滤足够） */
const apps = ref<AppOverview[]>([]);
/** 加载中：首次与刷新共用（刷新不清空表格，避免闪一下空白） */
const loading = ref(false);
/** 首屏失败信息（刷新失败只轻提示，不把已有表格擦掉） */
const error = ref('');
/** 搜索词：命中 appId / 名称 */
const keyword = ref('');
/**
 * 接口开关改成真路由页（`system-app-apis`）
 *
 * 原来是在这里弹一个 680px 的抽屉，一百多个接口只能贴着边滚。整页之后宽度不再是瓶颈，
 * 也能深链/返回。列表页只管"有哪些应用、各自多少接口"。
 */
const router = useRouter();

/** 过滤后的清单 */
const filtered = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  if (!key) return apps.value;
  return apps.value.filter(app => app.appId.toLowerCase().includes(key) || app.name.toLowerCase().includes(key));
});

/** 是否存在"命名空间与 appId 不同"的应用（console → admin），用于决定是否显示提示 */
const hasNamespaceAlias = computed(() => apps.value.some(app => app.permissionAppId !== app.appId));

/**
 * 准入策略的一行摘要
 *
 * 不限制时显示"不限"而不是空白：空白在这张表里等于"没配"，语义不同。
 *
 * @param app 应用行
 * @returns 摘要文本
 */
function accessSummary(app: AppOverview): string {
  if (!app.access) return '不限';
  const parts = [...app.access.anyPermission, ...app.access.anyRole.map(role => `@${role}`)];
  return parts.length > 0 ? parts.join(' · ') : '不限';
}

/**
 * 计数文案
 *
 * 没有筛选时只给总数 —— "5 / 5" 要人先做一次比较才知道"没被筛掉"。
 *
 * @returns {string} `5` 或 `2 / 5`
 */
const countText = computed(() =>
  keyword.value.trim() ? `${filtered.value.length} / ${apps.value.length}` : String(apps.value.length)
);

/** 拉取清单 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const res = await listApps();
    apps.value = res.apps;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
    throw err;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  /* 首次失败由 `error` 渲染成整块提示；这里吞掉拒绝，避免控制台出现未捕获异常 */
  void load().catch(() => undefined);
});
</script>

<template>
  <div class="apps">
    <header class="apps__head">
      <div class="apps__heading">
        <h2 class="apps__title">应用管理</h2>
        <p class="apps__sub">
          应用由代码声明（<code>src/app/&lt;app&gt;/config.js</code>），这里的清单是只读的 ——
          新增或调整准入策略要走代码评审。
        </p>
      </div>
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="15" :class="{ 'is-spinning': loading }" /> 刷新
      </button>
    </header>

    <section class="panel">
      <div class="panel__head">
        <span class="panel__title">已接入应用</span>
        <span class="apps__count">{{ countText }}</span>
        <label class="apps__search">
          <Search :size="14" />
          <input v-model="keyword" type="search" placeholder="搜索应用标识或名称" />
        </label>
      </div>

      <div v-if="error && apps.length === 0" class="apps__state">
        <p class="apps__state-title">加载失败</p>
        <p class="apps__state-desc">{{ error }}</p>
        <button class="btn btn--sm" type="button" @click="load">重试</button>
      </div>

      <div v-else-if="loading && apps.length === 0" class="apps__state">
        <p class="apps__state-desc">正在加载应用清单…</p>
      </div>

      <div v-else-if="filtered.length === 0" class="apps__state">
        <LayoutGrid :size="22" class="apps__state-ico" />
        <p class="apps__state-desc">{{ apps.length === 0 ? '还没有登记任何应用' : '没有匹配的应用' }}</p>
      </div>

      <!-- 桌面：定宽表格（列宽由 colgroup 决定，翻页/筛选时列不跳） -->
      <div v-else class="table-wrap">
        <table class="table apps__table">
          <colgroup>
            <col style="width: 268px" />
            <col style="width: 132px" />
            <col style="width: 196px" />
            <col />
            <col style="width: 124px" />
            <col style="width: 112px" />
          </colgroup>
          <thead>
            <tr>
              <th>应用</th>
              <th>权限命名空间</th>
              <th>登录准入</th>
              <th>授权数据</th>
              <th>默认角色</th>
              <th>接口</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in filtered" :key="app.appId">
              <td>
                <div class="apps__app">
                  <span class="apps__avatar" aria-hidden="true">{{ app.name.slice(0, 1) }}</span>
                  <span class="apps__ident">
                    <span class="apps__name">{{ app.name }}</span>
                    <code class="apps__id">{{ app.appId }}</code>
                  </span>
                  <span v-if="app.hosts.length > 0" class="apps__hosts" :title="app.hosts.join('\n')">
                    {{ app.hosts.length }} 域名
                  </span>
                </div>
              </td>
              <td>
                <code
                  v-if="app.permissionAppId !== app.appId"
                  class="apps__ns"
                  :title="'角色/菜单/权限码挂在 admin 命名空间'"
                >
                  {{ app.permissionAppId }}
                </code>
                <span v-else class="apps__mut">同应用</span>
              </td>
              <td>
                <span :class="['apps__policy', { 'is-open': !app.access }]" :title="app.access?.denyMessage || ''">
                  {{ accessSummary(app) }}
                </span>
              </td>
              <td>
                <span class="apps__stats">
                  <span :class="{ 'is-muted': app.counts.roles === 0 }"
                    ><b>{{ app.counts.roles }}</b> 角色</span
                  >
                  <span :class="{ 'is-muted': app.counts.menus === 0 }"
                    ><b>{{ app.counts.menus }}</b> 菜单</span
                  >
                  <span :class="{ 'is-muted': app.counts.permissionCodes === 0 }"
                    ><b>{{ app.counts.permissionCodes }}</b> 权限码</span
                  >
                  <span :class="{ 'is-muted': app.counts.oauthClients === 0 }"
                    ><b>{{ app.counts.oauthClients }}</b> 客户端</span
                  >
                </span>
              </td>
              <td>
                <code v-if="app.defaultRole" class="apps__ns">{{ app.defaultRole }}</code>
                <span v-else class="apps__mut" title="该应用没有声明默认角色">—</span>
              </td>
              <td>
                <button
                  class="apps__apis"
                  type="button"
                  :title="`打开 ${app.name} 的接口开关`"
                  @click="router.push({ name: 'system-app-apis', params: { appId: app.appId } })"
                >
                  {{ app.apis?.total ?? 0 }} 个
                  <span v-if="app.apis?.disabled" class="apps__apis-off">{{ app.apis.disabled }} 关</span>
                  <ChevronRight :size="13" class="apps__apis-arrow" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="hasNamespaceAlias" class="apps__note">
        权限命名空间与 appId 不同时（如 console → admin），角色 / 菜单 / 权限码挂在**命名空间**下，
        统计已算进这一行；命名空间本身不单独成行（它不是可登录的应用）。
      </p>
    </section>
  </div>
</template>

<style scoped>
.apps {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.apps__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.apps__heading {
  flex: 1;
  min-width: 0;
}

.apps__title {
  margin: 0;
  font-size: 18px;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.apps__sub {
  margin: 4px 0 0;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
  line-height: 1.6;
}

.apps__sub code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--mauth-surface-2);
  font-size: 12px;
}

/* 搜索框贴右：与「共 N 个」同一行，避免再开一条工具栏 */
.apps__search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 5px 10px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-faint);
}

.apps__search input {
  width: 180px;
  border: 0;
  outline: 0;
  background: none;
  color: var(--mauth-text);
  font: inherit;
  font-size: 12.5px;
}

/* 四态：加载 / 失败 / 空 —— 都在面板内部，不撑出整页高度 */
.apps__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 36px 16px;
  text-align: center;
}

.apps__state-ico {
  color: var(--mauth-text-faint);
}

.apps__state-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.apps__state-desc {
  margin: 0 0 4px;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
}

/* 分组计数：`3 / 5` 一眼看出"筛选后还剩几个" */
.apps__count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

/* ── 应用列：头像 + 名称/标识 + 域名 ────────────────────── */
.apps__app {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

/* 字母头像：一列里全是文字时，它是最省事的"视觉锚点" */
.apps__avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--mauth-primary) 10%, var(--mauth-surface));
  color: var(--mauth-primary);
  font-size: 12.5px;
  font-weight: 600;
}

.apps__ident {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.apps__name {
  overflow: hidden;
  font-weight: 600;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apps__id {
  width: fit-content;
  color: var(--mauth-text-faint);
  font-size: 11.5px;
  letter-spacing: 0.2px;
}

.apps__hosts {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-faint);
  font-size: 11.5px;
}

.apps__ns {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 12px;
}

.apps__mut {
  color: var(--mauth-text-faint);
  font-size: 12px;
}

/* 准入：不限制时用"淡"的样式，别让人误以为配了什么 */
.apps__policy {
  display: inline-block;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apps__policy.is-open {
  color: var(--mauth-text-faint);
}

/*
 * 四个统计用两列网格，不用"数字 + 圆点"横排：
 * 列宽固定后横排必然在窄屏折行，折出来的行首会留一个孤零零的圆点。
 * 两列网格无论宽度多少都是整齐的 2×2，数字还能靠右对齐形成一列。
 */
.apps__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, max-content));
  gap: 2px 18px;
  color: var(--mauth-text-soft);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.apps__stats > span {
  white-space: nowrap;
}

.apps__stats b {
  margin-right: 3px;
  color: var(--mauth-text);
  font-weight: 620;
}

.apps__stats .is-muted {
  color: var(--mauth-text-faint);
}

.apps__stats .is-muted b {
  color: var(--mauth-text-faint);
}

.apps__apis {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.apps__apis:hover {
  border-color: var(--mauth-primary);
  color: var(--mauth-primary);
}

.apps__apis-off {
  color: var(--mauth-danger, #d9534f);
  font-size: 11px;
}

.apps__apis-arrow {
  margin-left: -2px;
  color: var(--mauth-text-faint);
  transition: transform 0.12s ease;
}

.apps__apis:hover .apps__apis-arrow {
  color: var(--mauth-primary);
  transform: translateX(1px);
}

.apps__note {
  margin: 0;
  padding: 10px 16px 14px;
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.65;
}

.is-spinning {
  animation: apps-spin 0.9s linear infinite;
}

@keyframes apps-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 窄屏：表格收成卡片 ─────────────────────────────────── */
/*
 * 定宽表格在手机上只能横向滚动，扫读时列标题会滚出视野。窄屏把一个应用折成
 * 一张卡：第一行名称 + 标识，第二行四个计数，第三行准入与命名空间。
 */
@media (max-width: 720px) {
  .apps__sub {
    font-size: 12px;
  }

  .apps__search {
    width: 100%;
    margin: 8px 0 0;
  }

  .apps__search input {
    width: 100%;
  }

  .apps__table thead {
    display: none;
  }

  .apps__table,
  .apps__table tbody,
  .apps__table tr,
  .apps__table td {
    display: block;
    width: 100%;
  }

  .apps__table tr {
    padding: 10px 12px;
    border-bottom: 1px solid var(--mauth-border);
  }

  .apps__table td {
    height: auto;
    padding: 0;
    border: 0;
    white-space: normal;
  }

  .apps__stats {
    margin-top: 6px;
    flex-wrap: wrap;
  }
}
</style>
