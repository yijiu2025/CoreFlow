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
import { LayoutGrid, RefreshCw, SlidersHorizontal } from 'lucide-vue-next';
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

/**
 * 按「业务应用 / 平台内置」分组
 *
 * 守卫 / 通知 / 用户中心 / 授权中心 的 `app_id` 是权限命名空间、接口是基础设施入口，
 * 和"可以授权给业务用户的应用"不是一类东西。混在一张表里，运维会误以为它们也能
 * 配默认角色与会话准入 —— 而且它们的 0 角色 / 0 菜单看起来像"没配好"。
 * 分组后业务应用在前（默认关心的），内置项收在后面并标明不可授权。
 *
 * @returns {{key:'business'|'builtin', label:string, note:string, apps:AppOverview[]}[]} 分组（空组不返回）
 */
const appGroups = computed(() => {
  const groups = [
    {
      key: 'business' as const,
      label: '业务应用',
      note: '可授权给用户、有独立角色与菜单的应用',
      apps: filtered.value.filter(app => !app.builtin)
    },
    {
      key: 'builtin' as const,
      label: '平台内置',
      note: '认证 / 通知 / 守卫等基础设施，不作为可授权应用；仅接口开关可管',
      apps: filtered.value.filter(app => app.builtin)
    }
  ];
  return groups.filter(group => group.apps.length > 0);
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
  // 自助区准入是"准入条件的**放宽**"，跟在条件后面而不是替换它们：
  // 写成替换会让人以为原本的权限要求被取消了。
  if (app.access.selfService) parts.push('+ 登录即可进自助区');
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

/**
 * 授权数据的单行文案
 *
 * 表格里一行一个应用，四个数字横排比 2×2 更贴合本框架的表格密度（行高 30px）；
 * 具体口径写在表头与 `title` 里，不占单元格。
 *
 * @param app 应用行
 * @returns {{roles:number, menus:number, codes:number, clients:number}} 四项计数
 */
function statsOf(app: AppOverview): { roles: number; menus: number; codes: number; clients: number } {
  return {
    roles: app.counts.roles,
    menus: app.counts.menus,
    codes: app.counts.permissionCodes,
    clients: app.counts.oauthClients
  };
}

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
  <div>
    <div class="page__head">
      <h2 class="page__title">应用管理</h2>
      <span class="page__sub">共 {{ countText }} 个</span>
    </div>

    <div class="filterbar">
      <input
        v-model="keyword"
        class="input apps__search"
        type="search"
        placeholder="搜索应用标识或名称"
        aria-label="搜索应用"
      />
      <div class="filterbar__actions">
        <button class="btn btn--sm" type="button" :disabled="loading" @click="load">
          <RefreshCw :size="15" :class="{ 'is-spinning': loading }" /> 刷新
        </button>
      </div>
    </div>

    <section class="panel">
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

      <div v-else class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 26%" />
            <col style="width: 14%" />
            <col style="width: 14%" />
            <col style="width: 26%" />
            <col style="width: 12%" />
            <col style="width: 8%" />
          </colgroup>
          <thead>
            <tr>
              <th>应用</th>
              <th>权限命名空间</th>
              <th>登录准入</th>
              <th title="角色 / 菜单 / 权限码 / 客户端">授权数据</th>
              <th>默认角色</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in appGroups" :key="group.key">
              <tr class="apps__group">
                <td colspan="6">
                  <span class="apps__group-label">{{ group.label }}</span>
                  <span class="apps__group-n mono">{{ group.apps.length }}</span>
                  <span class="apps__group-note">{{ group.note }}</span>
                </td>
              </tr>
              <tr v-for="app in group.apps" :key="app.appId" :class="{ 'is-builtin': app.builtin }">
                <td>
                  <span class="apps__name">{{ app.name }}</span>
                  <span class="mono apps__id">{{ app.appId }}</span>
                  <span v-if="app.builtin" class="tag tag--off" title="平台内置：不能授权给业务用户">内置</span>
                  <span v-if="app.hosts.length > 0" class="tag" :title="app.hosts.join('\n')">
                    {{ app.hosts.length }} 域名
                  </span>
                </td>
                <td class="mono">{{ app.permissionAppId }}</td>
                <td>
                  <span v-if="app.builtin" class="apps__na" title="内置应用不是登录入口，不走会话准入">—</span>
                  <span
                    v-else
                    :class="['tag', app.access ? 'tag--info' : '']"
                    :title="app.access ? accessSummary(app) : '任何已注册账号都能登录'"
                  >
                    {{ app.access ? '受限' : '不限' }}
                  </span>
                </td>
                <td>
                  <span
                    class="apps__stats"
                    :title="`角色 ${statsOf(app).roles} · 菜单 ${statsOf(app).menus} · 权限码 ${statsOf(app).codes} · 客户端 ${statsOf(app).clients}`"
                  >
                    <span class="mono">{{ statsOf(app).roles }}</span
                    ><i>角色</i> <span class="mono">{{ statsOf(app).menus }}</span
                    ><i>菜单</i> <span class="mono">{{ statsOf(app).codes }}</span
                    ><i>权限码</i> <span class="mono">{{ statsOf(app).clients }}</span
                    ><i>客户端</i>
                  </span>
                </td>
                <td class="mono">
                  <span v-if="app.builtin" class="apps__na" title="内置应用没有默认角色">—</span>
                  <template v-else>{{ app.defaultRole || '—' }}</template>
                </td>
                <td class="col-actions">
                  <button
                    class="btn btn--ghost btn--sm btn--icon"
                    type="button"
                    :title="`打开 ${app.name} 的接口开关（${app.apis?.total ?? 0} 个接口）`"
                    :aria-label="`打开 ${app.name} 的接口开关`"
                    @click="router.push({ name: 'system-app-apis', params: { appId: app.appId } })"
                  >
                    <SlidersHorizontal :size="15" />
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <p class="apps__note">
        应用由代码声明（<code>src/app/&lt;app&gt;/config.js</code>），清单只读；新增应用或调整准入策略走代码评审。
        「权限命名空间」与「默认角色」也是代码级声明 —— 授权数据统计已算进这一行；命名空间本身不单独成行。
      </p>
    </section>
  </div>
</template>

<style scoped>
/* 搜索框：本框架的工具条里统一用 `.input`，宽度单独给（其余按组件默认） */
.apps__search {
  width: 240px;
}

/* 应用列：名称（主）+ 标识（次，等宽）+ 域名标签 */
/* ── 分组行（业务应用 / 平台内置） ─────────────────────────
   内置项是基础设施，收在后面并标明不可授权；它们的准入与默认角色显示破折号，
   而不是"不限" —— 后者会被读成"任何人都能登录"。 */
.apps__group > td {
  padding: 8px 14px;
  border-top: 1px solid var(--mauth-border);
  background: color-mix(in srgb, var(--mauth-surface-2) 55%, var(--mauth-surface));
}

/* 第一组紧接表头，表头自带下边线，这里不再画一条 */
.apps__group:first-child > td {
  border-top: 0;
}

.apps__group-label {
  color: var(--mauth-text);
  font-size: 12px;
  font-weight: 620;
}

.apps__group-n {
  margin-left: 6px;
  color: var(--mauth-text-soft);
  font-size: 10.5px;
}

.apps__group-note {
  margin-left: 10px;
  color: var(--mauth-text-soft);
  font-size: 11.5px;
}

.apps__na {
  color: var(--mauth-text-faint);
}

.apps__name {
  font-weight: 600;
}

.apps__id {
  margin-left: 8px;
  color: var(--mauth-text-faint);
  font-size: 11.5px;
}

/* 授权数据：一行四项，数字等宽、标签小号灰 —— 与表头同一行高度，不撑高行 */
.apps__stats {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-size: 12px;
  color: var(--mauth-text);
}

.apps__stats i {
  margin-right: 14px;
  color: var(--mauth-text-faint);
  font-size: 11px;
  font-style: normal;
}

/* 四态：加载 / 失败 / 空 */
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

.is-spinning {
  animation: apps-spin 0.9s linear infinite;
}

@keyframes apps-spin {
  to {
    transform: rotate(360deg);
  }
}

.apps__note {
  margin: 0;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--mauth-border);
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.7;
}

.apps__note code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--mauth-surface-2);
  font-size: 11.5px;
}

@media (max-width: 760px) {
  .apps__search {
    width: 100%;
  }
}
</style>
