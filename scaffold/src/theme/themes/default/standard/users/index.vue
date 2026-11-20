<script setup lang="ts">
/**
 * 珍珠玻璃 · 用户管理版式
 *
 * 版式只负责"长什么样"：左侧部门树、筛选条、表格 / 卡片、批量条、四个弹窗都由
 * 容器算好（`views/system/Users.vue`），契约见 `theme/views/users.ts`。
 * 「能不能删 / 能不能改」的判断全在容器（`can*` 与 `verdictOf/hintOf`），版式只显示结论。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { Download, Pencil, Plus, Search, ShieldAlert, ShieldCheck, Upload, UserCheck, UserX } from 'lucide-vue-next';
import AppIcon from '@/components/ui/AppIcon.vue';
import GrantHistoryDialog from '@/components/business/GrantHistoryDialog.vue';
import BatchGrantDialog from '@/components/business/BatchGrantDialog.vue';
import UserDangerDialog from '@/components/business/UserDangerDialog.vue';
import UserProfileDrawer from '@/components/business/UserProfileDrawer.vue';
import UserEditDialog from '@/components/business/UserEditDialog.vue';
import UserImportDialog from '@/components/business/UserImportDialog.vue';
import type { UsersViewContext } from '@/theme/views/users';

const props = defineProps<{ ctx: UsersViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  device, rows, total, loading, errorMessage, query, options, filterMode, collapsedDept,
  profileId, deptFlat, currentDeptName, selected, allSelected, someSelected, selectedUsers,
  grantTarget, dangerTarget, batchOpen, importOpen, editingTarget, dialogOpen, pageCount,
  grantAdjustable, canCreate, canUpdate, canExport, canImport, canGrants, canRead,
  canDeleteUser, canTempPassword, canDeactivateApp, canOpenDanger,
  verdictOf, hintOf, deletionHint, initialOf, toggleDept, switchFilterMode, pickDept, openProfile,
  load, search, resetQuery, toggleNoRole, turnPage, toggleSelect, toggleSelectAll, openGrants, openDanger,
  refreshAfterDanger, onImported, adjustFromGrants, onBatchDone, openCreate, openEdit,
  onUserSaved, toggleStatus, exportCsv
} = props.ctx;
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">用户管理</h2>
      <span class="page__sub">共 {{ total }} 人</span>
    </div>

    <!--
      工具栏通栏（100% 宽），**不放在右侧主列里**：部门树只在「按部门」时出现，
      若工具栏与它同列，切模式时整行会横向平移；放在这里则宽度恒定、位置恒定，
      部门树出现时只在下方让出左侧一列。
    -->
    <div class="toolbar">
      <!-- 分段控件与角色页同一套样式（.tabbar/.tab）：外圈带边框 + 内层选中胶囊 -->
      <div class="tabbar" role="tablist" aria-label="筛选方式">
        <button
          type="button"
          role="tab"
          :aria-selected="filterMode === 'all'"
          :class="['tab', { 'is-on': filterMode === 'all' }]"
          @click="switchFilterMode('all')"
        >
          全部用户
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="filterMode === 'dept'"
          :class="['tab', { 'is-on': filterMode === 'dept' }]"
          @click="switchFilterMode('dept')"
        >
          按部门
        </button>
      </div>
      <!--
        一个框搜三样：账号 / 邮箱 / 设备码（后端 `keyword` 三选一命中）。
        设备码原本是第二个输入框 —— 但用户并不知道自己想找的是"人"还是"机器"，
        分成两个框只会让人先猜一次；合并后输入什么都能找到。
      -->
      <input
        v-model="query.keyword"
        class="input user-search"
        placeholder="账号 / 邮箱 / 设备码"
        title="账号、邮箱、设备码（含片段）任一项匹配；设备码会连同历史会话一起找"
        @keyup.enter="search"
      />
      <!--
        子应用筛选：候选来自 userOptions().apps（后端按角色上的 app_id 去重并翻译成
        中文名）。没有候选时整块不渲染 —— 一个只有"全部应用"的下拉没有信息量。
      -->
      <select v-if="options.apps?.length" v-model="query.appId" class="select" style="width: 150px">
        <option :value="null">全部应用</option>
        <option v-for="app in options.apps" :key="app.id" :value="app.id">{{ app.label }}</option>
      </select>
      <select v-model.number="query.status" class="select" style="width: 130px">
        <option :value="null">全部状态</option>
        <option :value="1">正常</option>
        <option :value="0">冻结</option>
        <option :value="-2">待注销</option>
        <option :value="-1">注销</option>
      </select>
      <!-- 无角色：维修入口（见容器 toggleNoRole），不在"日常筛选"的心智里 -->
      <button
        class="btn btn--sm"
        :class="{ 'btn--primary': query.noRole }"
        type="button"
        :aria-pressed="query.noRole"
        title="只看一个有效角色都没有的账号。这类账号对非超管不可见，是补授权的入口"
        @click="toggleNoRole"
      >
        <ShieldAlert :size="15" /> 无角色
      </button>
      <button class="btn btn--sm" type="button" @click="search"><Search :size="15" /> 查询</button>
      <!-- 清空筛选：与其它页同一形态（ghost 无边框 + 纯文字），不挂图标 -->
      <button class="btn btn--ghost btn--sm" type="button" @click="resetQuery">清空</button>

      <!--
        操作组整块靠右。不用 `toolbar__spacer` 撑开：换行时撑开的空白会把
        下一个按钮顶到**行首**（实测「新建用户」会孤零零落到左侧），
        而整组带 `margin-left:auto` 换行后依然贴右，视觉上始终是一组操作。
      -->
      <div class="toolbar__actions">
        <button
          v-if="canUpdate && selected.size > 0"
          class="btn btn--primary btn--sm"
          type="button"
          @click="batchOpen = true"
        >
          <ShieldCheck :size="15" /> 批量授权（{{ selected.size }}）
        </button>
        <button
          v-if="canImport"
          class="btn btn--sm"
          type="button"
          title="按 CSV 批量创建账号"
          @click="importOpen = true"
        >
          <Upload :size="15" /> 导入
        </button>
        <button
          v-if="canExport"
          class="btn btn--sm"
          type="button"
          title="按当前筛选条件导出 CSV"
          @click="exportCsv"
        >
          <Download :size="15" /> 导出
        </button>
        <button
          v-if="canCreate"
          class="btn btn--primary btn--sm"
          type="button"
          @click="openCreate"
        >
          <Plus :size="15" /> 新建用户
        </button>
      </div>
    </div>

    <div class="users-body">
      <!-- 部门树：只有「按部门」模式才出现（不占工具栏的位置，工具栏在它上方通栏） -->
      <aside v-if="filterMode === 'dept'" class="dept" aria-label="部门筛选">
        <header class="dept__head">
          <span class="dept__title">部门</span>
          <span v-if="query.deptId !== null" class="dept__current">{{ currentDeptName }}</span>
        </header>
        <div class="dept__list" role="tree">
          <button
            type="button"
            role="treeitem"
            :aria-selected="query.deptId === null"
            :class="['dept__item', { 'is-on': query.deptId === null }]"
            @click="pickDept(null)"
          >
            <span class="dept__name">全部用户</span>
          </button>
          <div v-for="item in deptFlat" :key="item.node.id" class="dept__row">
            <button
              v-if="item.hasChildren"
              type="button"
              class="dept__twist"
              :aria-label="collapsedDept.has(item.node.id) ? '展开' : '收起'"
              :aria-expanded="!collapsedDept.has(item.node.id)"
              :style="{ marginLeft: `${2 + item.depth * 14}px` }"
              @click.stop="toggleDept(item.node.id)"
            >
              <AppIcon name="chevronRight" :size="12" :class="{ 'is-open': !collapsedDept.has(item.node.id) }" />
            </button>
            <span v-else class="dept__twist is-leaf" :style="{ marginLeft: `${2 + item.depth * 14}px` }" />
            <button
              type="button"
              role="treeitem"
              :aria-selected="query.deptId === item.node.id"
              :class="['dept__item', { 'is-on': query.deptId === item.node.id }]"
              @click="pickDept(item.node.id)"
            >
              <span class="dept__name">{{ item.node.name }}</span>
            </button>
          </div>
          <p v-if="deptFlat.length === 0" class="dept__empty">暂无部门</p>
        </div>
      </aside>

      <div class="users-body__main">
        <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

        <section class="panel">
          <div v-if="device !== 'mobile'" class="table-wrap">
            <table class="table">
              <colgroup>
                <col style="width: 36px" />
                <col style="width: 95px" />
                <col style="width: 122px" />
                <col style="width: 78px" />
                <col style="width: 110px" />
                <col style="width: 70px" />
                <col style="width: 58px" />
                <col style="width: 168px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-check">
                    <input
                      type="checkbox"
                      :checked="allSelected"
                      :indeterminate.prop="someSelected"
                      aria-label="全选本页"
                      @change="toggleSelectAll"
                    />
                  </th>
                  <th>账号</th>
                  <th>邮箱</th>
                  <th>部门</th>
                  <th>角色</th>
                  <th>岗位</th>
                  <th>状态</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rows"
                  :key="row.id"
                  :class="{ 'is-picked': selected.has(row.id), 'is-locked': row.manageable === false }"
                  class="row-clickable"
                  @click="openProfile(row)"
                >
                  <!-- 勾选不该连带打开详情抽屉：click 冒泡到 tr 上会触发 openProfile -->
                  <td class="col-check" @click.stop>
                    <input
                      type="checkbox"
                      :checked="selected.has(row.id)"
                      :aria-label="`选择 ${row.username}`"
                      @change="toggleSelect(row.id)"
                    />
                  </td>
                  <td>{{ row.username }}</td>
                  <td>{{ row.email || '—' }}</td>
                  <td>{{ row.dept_name || '—' }}</td>
                  <td>
                    <!-- 无角色不是"没填"，是"对非超管不存在"：必须显式标出来，否则看着像数据缺失 -->
                    <span
                      v-if="!row.role_names"
                      class="tag tag--warn"
                      title="没有任何有效角色：非超管看不到该账号，需要补授权"
                      >无角色</span
                    >
                    <template v-else>{{ row.role_names }}</template>
                  </td>
                  <td>{{ row.post_names || '—' }}</td>
                  <td>
                    <!-- 待执行删除：必须在列表里看得见，否则管理员会以为没删成功又点一次 -->
                    <span
                      v-if="row.deletion"
                      class="tag tag--warn"
                      :title="`${row.deletion.scope === 'all' ? '账号删除' : row.deletion.app_id + ' 注销'} · 到期 ${row.deletion.scheduled_at}`"
                    >
                      待注销 · {{ deletionHint(row.deletion.scheduled_at) }}
                    </span>
                    <span v-else-if="row.status === -2" class="tag tag--warn">待注销</span>
                    <span v-else class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">
                      {{ row.status === 1 ? '正常' : row.status === 0 ? '冻结' : '注销' }}
                    </span>
                  </td>
                  <td class="col-actions" @click.stop>
                    <button
                      v-if="canGrants"
                      class="btn btn--ghost btn--sm btn--icon"
                      type="button"
                      title="授权记录"
                      aria-label="授权记录"
                      @click="openGrants(row)"
                    >
                      <ShieldCheck :size="14" />
                    </button>
                    <!--
                  高危入口：删除账号 / 注销应用账号 / 临时密码。
                  按 isSuper + 权限码隐藏（普通管理员不显示），服务端才是闸门。
                -->
                    <button
                      v-if="canOpenDanger && !row.deletion"
                      class="btn btn--ghost btn--sm btn--icon danger-trigger"
                      type="button"
                      :disabled="!verdictOf(row).ok"
                      :title="
                        verdictOf(row).ok ? '账号高危操作（删除 / 应用注销 / 临时密码）' : hintOf(row, '高危操作')
                      "
                      aria-label="高危操作"
                      @click="openDanger(row)"
                    >
                      <ShieldAlert :size="14" />
                    </button>
                    <button
                      v-else-if="canOpenDanger && row.deletion"
                      class="btn btn--ghost btn--sm btn--icon danger-trigger"
                      type="button"
                      title="查看/撤销待执行的注销"
                      aria-label="查看待执行注销"
                      @click="openDanger(row)"
                    >
                      <ShieldAlert :size="14" />
                    </button>
                    <button
                      v-if="canUpdate"
                      class="btn btn--ghost btn--sm btn--icon"
                      type="button"
                      :disabled="!verdictOf(row).ok"
                      :title="hintOf(row, '编辑')"
                      aria-label="编辑"
                      @click="openEdit(row)"
                    >
                      <Pencil :size="14" />
                    </button>
                    <button
                      v-if="canUpdate"
                      class="btn btn--ghost btn--sm btn--icon"
                      type="button"
                      :disabled="!verdictOf(row).ok"
                      :title="hintOf(row, row.status === 1 ? '冻结' : '启用')"
                      :aria-label="row.status === 1 ? '冻结' : '启用'"
                      @click="toggleStatus(row)"
                    >
                      <UserX v-if="row.status === 1" :size="14" />
                      <UserCheck v-else :size="14" />
                    </button>
                  </td>
                </tr>
                <tr v-if="!loading && rows.length === 0">
                  <td colspan="8">
                    <div class="empty">没有符合条件的用户</div>
                  </td>
                </tr>
                <tr v-if="loading">
                  <td colspan="8"><div class="empty">加载中…</div></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!--
            手机端：一条一行。桌面表格在手机上会退化成「每行 6 个 label/value」的卡片，
            一屏只放得下一个人；这里只留「谁 + 怎么联系 + 是否可用」，
            其余信息点进详情页看（压栈，可返回）。
          -->
          <ul v-else class="mlist">
            <li
              v-for="row in rows"
              :key="row.id"
              class="m-user"
              role="button"
              tabindex="0"
              :aria-label="`${row.username}，${row.status === 1 ? '正常' : '冻结'}，查看详情`"
              @click="openProfile(row)"
              @keydown.enter.prevent="openProfile(row)"
            >
              <span class="m-user__avatar">
                <img v-if="row.avatar" :src="row.avatar" alt="" />
                <span v-else>{{ initialOf(row) }}</span>
              </span>
              <span class="m-user__main">
                <span class="m-user__name">{{ row.username }}</span>
                <span class="m-user__meta">{{ row.email || row.uid }}</span>
              </span>
              <span :class="['m-user__state', row.status === 1 ? 'is-on' : 'is-off']">
                {{ row.status === 1 ? '正常' : '冻结' }}
              </span>
              <AppIcon name="chevronRight" :size="14" class="m-user__arrow" />
            </li>
            <li v-if="loading" class="mlist__hint">加载中…</li>
            <li v-else-if="rows.length === 0" class="mlist__hint">没有符合条件的用户</li>
          </ul>

          <div class="pager">
            <span class="mono">第 {{ query.pageNum }} / {{ pageCount }} 页</span>
            <button class="btn btn--sm" type="button" :disabled="query.pageNum <= 1" @click="turnPage(-1)">
              上一页
            </button>
            <button class="btn btn--sm" type="button" :disabled="query.pageNum >= pageCount" @click="turnPage(1)">
              下一页
            </button>
          </div>
        </section>
      </div>
    </div>

    <!-- 用户详情：点行打开，职级可见性由后端判 -->
    <UserProfileDrawer :user-id="profileId" @close="profileId = null" @changed="load" />

    <!-- 用户表单：新建 / 编辑共用，详情页也用同一个组件（见 UserEditDialog） -->
    <UserEditDialog
      :open="dialogOpen"
      :target="editingTarget"
      :options="options"
      @close="dialogOpen = false"
      @saved="onUserSaved"
    />

    <!-- 授权记录：单个用户的时间线 -->
    <GrantHistoryDialog
      :user-id="grantTarget?.id ?? null"
      :username="grantTarget?.username ?? ''"
      :adjustable="grantAdjustable"
      @close="grantTarget = null"
      @adjust="adjustFromGrants"
    />

    <!-- 账号高危操作：删除（缓冲期）/ 应用注销 / 临时密码 -->
    <UserDangerDialog
      :user-id="dangerTarget?.id ?? null"
      :username="dangerTarget?.username ?? ''"
      :can-delete="canDeleteUser"
      :can-deactivate-app="canDeactivateApp"
      :can-temp="canTempPassword"
      @close="dangerTarget = null"
      @changed="refreshAfterDanger"
    />

    <!-- 批量导入：CSV 在浏览器解析成行，逐行结果回显 -->
    <UserImportDialog :open="importOpen" @close="importOpen = false" @done="onImported" />

    <!-- 批量授权：追加 / 移除同一组角色 -->
    <BatchGrantDialog
      v-if="batchOpen"
      :users="selectedUsers"
      :roles="options.roles"
      @close="batchOpen = false"
      @done="onBatchDone"
    />

  </div>
</template>

<style scoped>
/* 合并后的搜索框（账号 / 邮箱 / 设备码）：比原来两个框省约 200px，一行更从容 */
.user-search {
  width: 260px;
}

/* 勾选列：只放下复选框，宽度收到最小 */
.col-check {
  width: 36px;
  padding-right: 0;
}

.col-check input {
  accent-color: var(--mauth-primary);
  cursor: pointer;
}

/* 选中行：左侧一条主色提示，便于在长列表里找回自己勾了哪几行 */
.table tbody tr.is-picked {
  background: var(--mauth-primary-soft);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--mauth-border);
  color: var(--mauth-text-soft);
  font-size: 12px;
}

/* 高危入口：常态低调，只在悬停时泛红 —— 常红会让人对红色麻木 */
.danger-trigger:hover:not(:disabled) {
  color: color-mix(in srgb, var(--mauth-danger) 78%, var(--mauth-text));
  border-color: color-mix(in srgb, #ef4444 45%, var(--mauth-border-strong));
}

/* ── 左树右表 ── */
.users-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

/* 操作按钮组：整组靠右，换行时也整组一起走（见模板注释） */
.toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex: none;
}

.dept {
  flex: none;
  width: 188px;
  padding: 6px;
  border: 1px solid var(--mauth-border);
  border-radius: 10px;
  background: var(--mauth-surface);
}

.dept__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px 8px;
}

.dept__title {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--mauth-text-faint);
}

.dept__current {
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--mauth-text-mid);
}

.dept__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 560px;
  overflow-y: auto;
}

.dept__item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--mauth-text-mid);
  cursor: pointer;
  transition:
    background 0.15s var(--ease),
    color 0.15s var(--ease);
}

.dept__item:hover {
  background: var(--mauth-surface-2);
  color: var(--mauth-text);
}

/*
 * 选中：主色浅底 + 主色文字。
 * 不用左侧那道竖条 —— 圆角行 + 直角竖条在视觉上对不齐，像贴了张标签。
 * 浅底用的是 `--mauth-primary-soft`，换主题色时跟着变。
 */
.dept__item.is-on {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-weight: 650;
}

.dept__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dept__empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.users-body__main {
  flex: 1;
  min-width: 0;
}

/* 整行可点开详情；操作列自己 @click.stop */
.row-clickable {
  cursor: pointer;
}

.row-clickable:hover td {

/* 职级不高于自己的账号：能看见、能点开详情，但按钮全部禁用（见 Users.vue 的 verdictOf） */
.is-locked > td {
  opacity: 0.6;
}

.is-locked > td.col-actions {
  opacity: 1;
}

  background: var(--mauth-surface-2);
}

@media (max-width: 900px) {
  .users-body {
    flex-direction: column;
  }

  .dept {
    width: 100%;
  }

  .dept__list {
    max-height: 160px;
  }
}

/* 树行：折叠箭头 + 名称按钮同排 */
.dept__row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dept__twist {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
}

.dept__twist:hover {
  background: var(--mauth-surface-2);
  color: var(--mauth-text);
}

.dept__twist.is-leaf {
  cursor: default;
}

.dept__twist :deep(svg) {
  transition: transform 0.15s var(--ease);
}

.dept__twist :deep(svg.is-open) {
  transform: rotate(90deg);
}

.dept__row .dept__item {
  flex: 1;
  min-width: 0;
}
/* ── 手机端：一条一行的精简列表 ────────────────────────────────
   目标是"扫一眼知道有谁"，不是"在一屏里塞下所有字段"：
   头像 + 账号 + 邮箱（放不下就省略）+ 状态，点整行进详情页看全。 */
.m-user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 78%, transparent);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.14s var(--ease);
}

.m-user:last-child {
  border-bottom: 0;
}

/* 手指按下就变色：手机上等 300ms 的 hover 才给反馈，等于没有反馈 */
.m-user:active {
  background: var(--mauth-press);
}

.m-user:focus-visible {
  outline: 2px solid var(--mauth-focus);
  outline-offset: -2px;
}

.m-user__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 13px;
  font-weight: 600;
}

.m-user__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 🔴 min-width: 0 不能省：flex 子项默认不收缩，长邮箱会把状态和箭头挤出屏幕 */
.m-user__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.m-user__name {
  flex: none;
  max-width: 48%;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--mauth-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-user__meta {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--mauth-text-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态只留一个点 + 两个字：正常＝灰字绿点（不抢注意力），冻结＝红字红点 */
.m-user__state {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 4px;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.m-user__state::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.m-user__state.is-on::before {
  background: var(--mauth-success);
}

.m-user__state.is-off {
  color: var(--mauth-danger);
}

.m-user__arrow {
  flex: none;
  color: var(--mauth-text-faint);
  opacity: 0.7;
}

/* 窄屏：部门树从"左侧一列"变成"列表上方一块"，否则 188px 会把列表压成一条 */
@media (max-width: 820px) {
  .users-body {
    display: block;
  }

  .dept {
    width: auto;
    max-height: 168px;
    margin-bottom: 10px;
    overflow-y: auto;
  }
}
</style>
