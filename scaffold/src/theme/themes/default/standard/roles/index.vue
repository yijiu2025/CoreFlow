<script setup lang="ts">
/**
 * 珍珠玻璃 · 角色管理版式
 *
 * 版式只负责"长什么样"：列表（按应用分组）、权限矩阵、授权溯源、授权/表单弹窗都由
 * 容器算好（`views/system/Roles.vue`），契约见 `theme/views/roles.ts`。
 * 分组、展平、矩阵列、通配展开只算一次，版式不各自 walk 一遍菜单树。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ChevronRight, KeyRound, LockKeyhole, Pencil, Plus, RefreshCw, SearchX, Trash2 } from 'lucide-vue-next';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import type { RolesViewContext } from '@/theme/views/roles';

const props = defineProps<{ ctx: RolesViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  device,
  matrix,
  trace,
  rows,
  total,
  loading,
  errorMessage,
  keyword,
  appFilter,
  matrixKeyword,
  matrixType,
  hasFilter,
  altView,
  traceFocus,
  matrixSaving,
  appTabs,
  roleGroups,
  isCollapsed,
  toggleCollapse,
  clearFilters,
  trees,
  dialogOpen,
  activeRole,
  checked,
  saving,
  flatMenus,
  hiddenMenuCount,
  toggleMenu,
  openMenus,
  submitMenus,
  remove,
  formOpen,
  formBuiltin,
  formError,
  submitting,
  form,
  isEditing,
  SCOPE_OPTIONS,
  currentScopeHint,
  scopeConfigurable,
  rankLocked,
  deptFlat,
  scopeAppOptions,
  catalogLoading,
  permKeyword,
  catalogGroups,
  builtinGroups,
  permissionCount,
  isWildcard,
  permChecked,
  togglePerm,
  allChecked,
  toggleGroup,
  appFilteredCount,
  matrixRoles,
  matrixGrants,
  saveMatrix,
  canEdit,
  canReadMenu,
  canCreate,
  canDelete,
  load,
  notify,
  openCreate,
  openFormEdit,
  submitForm,
  appLabelOf
} = props.ctx;
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">角色管理</h2>
      <span class="page__sub">
        共 {{ total }} 个角色<template v-if="appFilteredCount !== null"> · 当前应用 {{ appFilteredCount }} 个</template>
      </span>
      <!-- 只读标记与按钮同一个判据（`admin:role:update`），见 ui/ReadOnlyTag.vue -->
      <ReadOnlyTag code="admin:role:update" scope="角色" />
    </div>

    <!--
      筛选条：视图切换 + 关键词 + 应用分档 + 矩阵筛选，压在同一行。
      应用分档原来是 8 个 chip（占一整行、还会换行），改成下拉后与其它控件同排；
      窄屏靠 flex-wrap 自动换行，不硬撑成横向滚动条。
    -->
    <div class="filterbar">
      <div class="tabbar filterbar__views" role="tablist" aria-label="视图">
        <button
          type="button"
          role="tab"
          :aria-selected="altView === 'table'"
          :class="['tab', { 'is-on': altView === 'table' }]"
          @click="altView = 'table'"
        >
          列表
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="altView === 'matrix'"
          :class="['tab', { 'is-on': altView === 'matrix' }]"
          @click="altView = 'matrix'"
        >
          权限矩阵
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="altView === 'trace'"
          :class="['tab', { 'is-on': altView === 'trace' }]"
          @click="altView = 'trace'"
        >
          授权溯源
        </button>
      </div>

      <!--
        筛选控件只在列表/矩阵出现 —— **视图切换本身必须始终可见**。
        （曾经把整条筛选条 v-show 掉，切到「授权溯源」后连切回来的按钮一起消失。）
      -->
      <template v-if="altView !== 'trace'">
        <!-- 搜索/刷新对列表和矩阵都生效（矩阵列就是角色） -->
        <input
          v-model="keyword"
          class="input filterbar__kw"
          placeholder="名称 / 编码"
          aria-label="角色名称或编码"
          @keyup.enter="load"
        />

        <select v-model="appFilter" class="select filterbar__app" aria-label="按应用筛选">
          <option value="">全部应用（{{ rows.length }}）</option>
          <option v-for="tab in appTabs" :key="tab.id" :value="tab.id">{{ tab.label }}（{{ tab.count }}）</option>
        </select>

        <!-- 矩阵专属：菜单行太多时先筛再勾 -->
        <template v-if="altView === 'matrix'">
          <input
            v-model="matrixKeyword"
            class="input filterbar__kw"
            placeholder="菜单名 / 权限码"
            aria-label="菜单名或权限码"
          />
          <select
            v-model="matrixType"
            class="select filterbar__type"
            aria-label="菜单类型（不选 = 全部）"
            title="菜单类型（不选 = 全部）"
          >
            <option value="">类型</option>
            <option value="dir">目录</option>
            <option value="menu">页面</option>
            <option value="btn">按钮</option>
          </select>
        </template>

        <button
          v-if="hasFilter"
          class="btn btn--ghost btn--sm"
          type="button"
          @click="clearFilters"
        >
          清空
        </button>
      </template>

      <!--
        「刷新 + 新建角色」**同一行、同一组、靠右**，且放在筛选条上（不是页头）。
        曾经刷新单独挂在这里、新建在页头：筛选条一换行，刷新就掉到新建正下方，
        右边竖着堆两个按钮，看着像被挤坏的残次品。
        这一组在「授权溯源」档也要留着 —— 新建角色与视图无关，别跟着筛选项一起消失。
        刷新统一成「图标 + 文字」：全站七处刷新按钮一个形态，纯图标只留行内小操作。
      -->
      <div class="filterbar__actions">
        <button
          v-if="altView !== 'trace'"
          class="btn btn--sm"
          type="button"
          :disabled="loading"
          @click="load"
        >
          <RefreshCw :size="15" /> 刷新
        </button>
        <button
          v-if="canCreate"
          class="btn btn--primary btn--sm"
          type="button"
          @click="openCreate"
        >
          <Plus :size="15" /> 新建角色
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 210px" />
            <col style="width: 150px" />
            <col style="width: 70px" />
            <col style="width: 70px" />
            <col style="width: 82px" />
            <col style="width: 70px" />
            <col style="width: 128px" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>编码</th>
              <!-- 门槛 = 要多大职级的人才能把这个角色授出去（不是持有者的层级） -->
              <th>授予门槛</th>
              <th>成员</th>
              <th>权限码</th>
              <th>菜单</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in roleGroups" :key="group.appId">
              <!--
                分组标题行：应用名 + 角色数，扫视时先定位"哪个应用"。
                整行可点收起 —— 一屏里通常只关心两三个应用，收不起的"分组"只是分隔线。
              -->
              <tr class="role-group-row" @click="toggleCollapse(group.appId)">
                <td colspan="7">
                  <div class="role-group">
                    <button
                      class="role-group__twist"
                      type="button"
                      :aria-expanded="!isCollapsed(group.appId)"
                      :aria-label="`${group.label}（${group.rows.length} 个角色），${isCollapsed(group.appId) ? '展开' : '收起'}`"
                      @click.stop="toggleCollapse(group.appId)"
                    >
                      <ChevronRight :size="13" :class="{ 'is-open': !isCollapsed(group.appId) }" />
                    </button>
                    <span class="role-group__label">{{ group.label }}</span>
                    <span class="role-group__count">{{ group.rows.length }}</span>
                    <!-- 应用 id 保留但压到最弱：排查"这条属于哪个应用"时要它，扫读时不该抢标题 -->
                    <span class="role-group__id mono">{{ group.appId }}</span>
                  </div>
                </td>
              </tr>
              <template v-if="!isCollapsed(group.appId)">
                <tr v-for="row in group.rows" :key="row.id">
                  <!--
                    名称列缩进一格：角色与所属应用的关系靠"缩进"表达，
                    而不是在每行重复一遍应用名（应用只在分组标题出现）。
                  -->
                  <td class="role-name" :title="row.name">
                    <span class="role-name__text">{{ row.name }}</span>
                    <span v-if="row.builtin" class="role-name__tag" title="系统内置角色，不可删除">内置</span>
                  </td>
                  <td class="mono" :title="row.code">{{ row.code }}</td>
                  <td class="mono" :title="`要 ${row.rank_level} 级以上才能把这个角色授予他人`">
                    {{ row.rank_level }}
                  </td>
                  <td class="mono" :class="{ 'cell-zero': !row.user_count }">{{ row.user_count }}</td>
                  <td class="mono" :class="{ 'cell-zero': !row.permissions.length }">
                    {{ row.permissions.length }}
                  </td>
                  <td class="mono" :class="{ 'cell-zero': !row.menu_ids.length }">{{ row.menu_ids.length }}</td>
                  <td class="col-actions">
                    <button
                      v-if="canEdit"
                      class="btn btn--ghost btn--sm btn--icon"
                      type="button"
                      :disabled="row.manageable === false"
                      :title="row.manageable === false ? '不在你的管理范围（应用域不允许，或门槛不低于你的职级）' : '编辑角色'"
                      aria-label="编辑角色"
                      @click="openFormEdit(row)"
                    >
                      <Pencil :size="14" />
                    </button>
                    <!-- 授权：超管的菜单固定为全部（后端直接拒），按钮不该可点 ——
                       能点开却只有一列灰掉的矩阵，等于让人白点一次。
                       写权限没有时整颗按钮不出现（只读用户不该看到"点了会 403"的东西） -->
                    <button
                      v-if="canEdit"
                      class="btn btn--ghost btn--sm btn--icon"
                      type="button"
                      :disabled="row.manageable === false || row.menuLocked"
                      :title="
                        row.menuLocked
                          ? '超级管理员的菜单固定为全部，不可修改'
                          : row.manageable === false
                            ? '不在你的管理范围（应用域不允许，或门槛不低于你的职级）'
                            : '菜单授权'
                      "
                      aria-label="菜单授权"
                      @click="openMenus(row)"
                    >
                      <KeyRound :size="14" />
                    </button>
                    <button
                      v-if="!row.builtin && canDelete"
                      class="btn btn--ghost btn--sm btn--icon role-del"
                      type="button"
                      :disabled="row.manageable === false"
                      :title="row.manageable === false ? '不在你的管理范围（应用域不允许，或门槛不低于你的职级）' : '删除角色'"
                      aria-label="删除角色"
                      @click="remove(row)"
                    >
                      <Trash2 :size="14" />
                    </button>
                  </td>
                </tr>
              </template>
            </template>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="7"><div class="empty">暂无角色</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        手机端：应用分组 + 角色卡片。
        分组行仍可点收起（一屏里通常只关心一两个应用）；卡片里名称与「内置」同行、
        编码与三个计数压成一行副标题，操作单独成行 —— 「内置」标签不会被挤掉。
      -->
      <ul v-else class="mlist">
        <template v-for="group in roleGroups" :key="group.appId">
          <li class="mgroup" @click="toggleCollapse(group.appId)">
            <button
              class="mgroup__twist"
              type="button"
              :aria-expanded="!isCollapsed(group.appId)"
              :aria-label="`${group.label}（${group.rows.length} 个角色），${isCollapsed(group.appId) ? '展开' : '收起'}`"
              @click.stop="toggleCollapse(group.appId)"
            >
              <ChevronRight :size="13" :class="{ 'is-open': !isCollapsed(group.appId) }" />
            </button>
            <span class="mgroup__label">{{ group.label }}</span>
            <span class="mgroup__count">{{ group.rows.length }}</span>
            <span class="mgroup__id mono">{{ group.appId }}</span>
          </li>
          <template v-if="!isCollapsed(group.appId)">
            <li v-for="row in group.rows" :key="row.id" class="mcard">
              <div class="mcard__head">
                <div class="mcard__main">
                  <span class="mcard__title">
                    <span class="mcard__title-text">{{ row.name }}</span>
                    <!-- 内置：系统定义的角色，不可删除 —— 必须在小屏上也看得见 -->
                    <span v-if="row.builtin" class="role-name__tag">内置</span>
                  </span>
                  <span class="mcard__sub mono">{{ row.code }}</span>
                  <span class="mcard__meta">
                    <span>需 <b class="tnum">{{ row.rank_level }}</b> 级授予</span>
                    <span><b class="tnum">{{ row.user_count }}</b> 成员</span>
                    <span><b class="tnum">{{ row.permissions.length }}</b> 权限码</span>
                    <span><b class="tnum">{{ row.menu_ids.length }}</b> 菜单</span>
                  </span>
                </div>
              </div>
              <div class="mcard__acts">
                <button
                  v-if="canEdit"
                  class="btn btn--sm"
                  type="button"
                  :disabled="row.manageable === false"
                  :title="row.manageable === false ? '不在你的管理范围（应用域不允许，或门槛不低于你的职级）' : '编辑角色'"
                  @click="openFormEdit(row)"
                >
                  <Pencil :size="13" /> 编辑
                </button>
                <button
                  v-if="canEdit"
                  class="btn btn--sm"
                  type="button"
                  :disabled="row.manageable === false || row.menuLocked"
                  :title="row.menuLocked ? '超级管理员的菜单固定为全部，不可修改' : '菜单授权'"
                  @click="openMenus(row)"
                >
                  <KeyRound :size="13" /> 菜单
                </button>
                <button
                  v-if="!row.builtin && canDelete"
                  class="btn btn--danger btn--sm"
                  type="button"
                  :disabled="row.manageable === false"
                  @click="remove(row)"
                >
                  <Trash2 :size="13" /> 删除
                </button>
              </div>
            </li>
          </template>
        </template>
        <li v-if="!loading && rows.length === 0" class="mlist__hint">暂无角色</li>
      </ul>
    </section>

    <!-- 权限矩阵：菜单 × 角色，勾选即菜单可见性（接口权限看权限码）。
         没有菜单读取权限时不去请求菜单树，而是说明缺哪个码 —— 见 canReadMenu -->
    <section v-if="altView === 'matrix'">
      <component :is="matrix"
        v-if="canReadMenu && matrixRoles.length"
        v-model:keyword="matrixKeyword"
        v-model:type-filter="matrixType"
        :menus="trees"
        :roles="matrixRoles"
        :grants="matrixGrants"
        :editable="canEdit"
        :saving="matrixSaving"
        @save="saveMatrix"
        @blocked="notify"
      />
      <!-- 筛空了要给出口：矩阵没有列时就是一片空白，看着像页面坏了 -->
      <div v-else-if="canReadMenu" class="panel matrix-locked">
        <p class="matrix-locked__title"><SearchX :size="16" /> 当前筛选下没有角色</p>
        <p class="matrix-locked__hint">
          把上方应用分档切回「全部」，或清空搜索关键词后再看。矩阵的列就是角色，没有角色就没有可勾的格子。
        </p>
      </div>
      <div v-else class="panel matrix-locked">
        <p class="matrix-locked__title"><LockKeyhole :size="16" /> 权限矩阵需要「查看菜单」权限</p>
        <p class="matrix-locked__hint">
          矩阵的行就是菜单树。当前账号只有角色查看权限，没有读取菜单的
          <code class="mono">admin:menu:read</code>，因此这里无法渲染。请联系管理员分配后再看。
        </p>
      </div>
    </section>

    <!-- 授权溯源：用户 → 角色 → 菜单 三层下钻（图谱舞台） -->
    <section v-if="altView === 'trace'">
      <component :is="trace" v-model:focus="traceFocus" />
    </section>

    <!-- 角色表单（新建 / 编辑，含权限码） -->
    <div v-if="formOpen" class="modal-mask" v-mask-close="() => (formOpen = false)">
      <div class="modal modal--wide">
        <header class="modal__head">
          <span class="modal__title">{{ isEditing ? `编辑角色 · ${form.name}` : '新建角色' }}</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">角色名称</span>
            <input v-model="form.name" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">角色编码{{ isEditing ? '（不可修改）' : '' }}</span>
            <input
              v-model="form.code"
              class="input mono"
              :disabled="isEditing"
              maxlength="50"
              placeholder="如 ops_admin"
            />
          </label>
          <label class="field">
            <span class="field__label">所属应用{{ isEditing ? '（不可修改）' : '' }}</span>
            <input
              v-model="form.appId"
              class="input mono"
              :disabled="isEditing"
              maxlength="64"
              placeholder="GLOBAL = 全局"
            />
          </label>
          <label class="field">
            <!--
              授予门槛必须**严格低于**自己的职级（同级也不行）：同级角色在列表里是 manageable=false，
              后端写接口同样拒（`assertRankBelowActor`）。这里写清楚，别让人填完才吃 403。
              上限是 98 而不是 99 —— 99 只属于代码声明的角色（superadmin / poseadmin）。
            -->
            <span class="field__label">
              授予门槛（0–99，必须低于你自己的最高职级）{{ rankLocked ? '（超管固定，不可修改）' : '' }}
            </span>
            <input
              v-model.number="form.rankLevel"
              class="input"
              type="number"
              min="0"
              max="98"
              :disabled="rankLocked"
              title="门槛不低于你的职级的角色你不能管，所以新门槛必须严格低于你自己的最高职级"
            />
          </label>

          <!--
            数据范围 = 行级数据权限：决定这个角色的人**能看到哪些行**。
            与上面的权限码是两件事：权限码管"能不能调接口"，这里管"调通后能看到谁"。
          -->
          <div class="field">
            <span class="field__label">数据范围（能看哪些数据）</span>
            <!--
              下拉而不是五张单选卡：这五项是同一个维度的枚举，卡片会把弹窗撑得很长，
              而"自定义"只是其中一种取值，不该让所有选项都占满版面。
            -->
            <select v-model.number="form.dataScope" class="select" :disabled="!scopeConfigurable" aria-label="数据范围">
              <option v-for="opt in SCOPE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <p class="form-hint">
              {{
                scopeConfigurable
                  ? currentScopeHint
                  : '该角色只能看本人数据 —— 只有管理员 / 审核员 / 观察者可配置数据范围。'
              }}
            </p>

            <div v-if="form.dataScope === 2" class="scope__depts">
              <p class="form-hint">勾选可见部门（自动包含其下级部门）：</p>
              <label
                v-for="item in deptFlat"
                :key="item.node.id"
                class="scope__dept"
                :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
              >
                <input v-model="form.deptIds" type="checkbox" :value="item.node.id" />
                {{ item.node.name }}
              </label>
              <p v-if="deptFlat.length === 0" class="form-hint">暂无可选部门</p>
            </div>

            <!--
              应用范围（数据维度的第二轴）：只准看这些应用的账号。
              与部门是**并列**关系（取交集），且不依附于档位 ——
              「全部数据、但只看 posecraft」是合法配置。
              🔴 **不勾 = 一个应用都不授权**（fail-closed）：该角色的人会看不到任何用户，
                 这是刻意的 —— "没配"不该等于"默认全量"。
            -->
            <div class="scope__depts">
              <p class="form-hint">限定可见应用（不勾 = 不授予任何应用数据）：</p>
              <label v-for="app in scopeAppOptions" :key="app.id" class="scope__dept">
                <input v-model="form.dataAppIds" type="checkbox" :value="app.id" />
                {{ app.name }}
              </label>
              <p v-if="scopeAppOptions.length === 0" class="form-hint">暂无可用应用清单</p>
            </div>
          </div>
          <label class="field">
            <span class="field__label">说明</span>
            <input v-model="form.description" class="input" maxlength="255" />
          </label>

          <div class="field">
            <!--
              内置角色：权限码由代码声明（`roleRegistry` → policy），这里**只展示它实际
              持有的那些**，不给勾选框。列全量 135 条再全部置灰，会让人误以为"还能选，
              只是现在不让点"，也让真正的权限集合淹没在无关项里。
            -->
            <template v-if="formBuiltin">
              <span class="field__label">
                权限码（由代码声明）· 共 <span class="mono">{{ permissionCount }}</span> 项
              </span>
              <p class="form-hint">内置角色的权限码不可在此修改；名称、授予门槛、说明仍可维护。</p>
              <div class="perm-panel perm-panel--static">
                <div v-if="catalogLoading" class="empty">权限码加载中…</div>
                <section v-for="group in builtinGroups" :key="group.domain" class="perm-group">
                  <header class="perm-group__head">
                    <span class="perm-group__title">
                      {{ group.domainName }}
                      <span class="mono perm-group__count">{{ group.items.length }}</span>
                    </span>
                  </header>
                  <div class="perm-items">
                    <div v-for="perm in group.items" :key="perm.code" class="perm-item perm-item--static">
                      <!-- 目录里查不到的码（通配 / 新增）没有中文名，只显示编码，不要重复两遍 -->
                      <span class="perm-item__text">
                        <span v-if="perm.label" class="perm-item__label" :title="perm.label">{{ perm.label }}</span>
                        <code
                          class="perm-item__code"
                          :class="{ 'perm-item__code--solo': !perm.label }"
                          :title="perm.code"
                        >
                          {{ perm.code }}
                        </code>
                      </span>
                    </div>
                  </div>
                </section>
                <div v-if="!catalogLoading && builtinGroups.length === 0" class="empty">该角色未持有权限码</div>
              </div>
            </template>

            <!-- 自定义角色：全量目录，可勾选 -->
            <template v-else>
              <span class="field__label">
                权限码（接口放行依据）· 已选 <span class="mono">{{ permissionCount }}</span>
                <span v-if="form.permissions.some(isWildcard)" class="perm-wild-hint">（含通配符，已自动合并）</span>
              </span>
              <input v-model="permKeyword" class="input" style="margin-bottom: 8px" placeholder="搜索权限码 / 名称" />
              <div class="perm-panel">
                <div v-if="catalogLoading" class="empty">权限码加载中…</div>
                <section v-for="group in catalogGroups" :key="group.domain" class="perm-group">
                  <header class="perm-group__head">
                    <span class="perm-group__title">
                      {{ group.domainName }}
                      <span class="mono perm-group__count">{{ group.items.length }}</span>
                    </span>
                    <button
                      class="btn btn--ghost btn--sm"
                      type="button"
                      @click="toggleGroup(group.items, !allChecked(group.items))"
                    >
                      {{ allChecked(group.items) ? '清空' : '全选' }}
                    </button>
                  </header>
                  <div class="perm-items">
                    <label
                      v-for="perm in group.items"
                      :key="perm.code"
                      class="perm-item"
                      :class="{ 'is-on': form.permissions.includes(perm.code) }"
                    >
                      <!--
                        受控勾选：勾选态由 `permChecked` 派生（被通配覆盖也算勾上），
                        所以不能用 `v-model` 直接绑数组 —— 合并成通配后具体码就不在数组里了。
                      -->
                      <input
                        type="checkbox"
                        :checked="permChecked(perm.code)"
                        @change="event => togglePerm(perm.code, (event.target as HTMLInputElement).checked)"
                      />
                      <!--
                        中文名与编码分两行：同一行里编码是 flex-shrink:0 的长串，
                        会把中文名挤成「创建…」「为…」—— 看不出这条权限到底是什么。
                      -->
                      <span class="perm-item__text">
                        <span class="perm-item__label" :title="perm.label">{{ perm.label }}</span>
                        <code class="perm-item__code" :title="perm.code">{{ perm.code }}</code>
                      </span>
                    </label>
                  </div>
                </section>
                <div v-if="!catalogLoading && catalogGroups.length === 0" class="empty">没有匹配的权限码</div>
              </div>
            </template>
          </div>

          <p v-if="formError" class="tag tag--off">{{ formError }}</p>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="formOpen = false">取消</button>
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="submitForm">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- 菜单授权 -->
    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal">
        <header class="modal__head">
          <span class="modal__title">菜单授权 · {{ activeRole?.name }}</span>
        </header>
        <div class="modal__body">
          <p class="field__label">
            勾选 = 该角色可用：取消勾选某个按钮后，该角色的这个操作接口也会 403。能力上限由「权限码」决定。
          </p>
          <p v-if="hiddenMenuCount > 0" class="field__label">
            另有 {{ hiddenMenuCount }} 项该角色没有对应权限码，已隐藏 ——
            {{
              activeRole?.builtin
                ? '内置角色的码由代码声明（src/app/*/permission/roles.js），改完重启后端才生效。'
                : '先去「角色编辑 → 权限码」补上，它们才会出现在这里。'
            }}
          </p>
          <div class="menu-list">
            <label
              v-for="item in flatMenus"
              :key="item.node.id"
              class="menu-item"
              :style="{ paddingLeft: `${item.depth * 16}px` }"
            >
              <input
                type="checkbox"
                :checked="checked.includes(item.node.id)"
                @change="toggleMenu(item.node.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ item.node.name }}</span>
              <span class="tag" style="margin-left: 6px">{{
                item.node.type === 'dir' ? '目录' : item.node.type === 'btn' ? '按钮' : '页面'
              }}</span>
            </label>
            <div v-if="flatMenus.length === 0" class="empty">菜单树为空，请先在菜单管理里创建</div>
          </div>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="dialogOpen = false">取消</button>
          <button class="btn btn--primary" type="button" :disabled="saving" @click="submitMenus">
            {{ saving ? '保存中…' : '保存授权' }}
          </button>
        </footer>
      </div>
    </div>

  </div>
</template>

<style scoped>
.menu-list {
  max-height: 320px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--mauth-radius-xs);
  font-size: 13px;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--mauth-hover);
}

/* 角色表单：权限码面板 */
.modal--wide {
  max-width: 720px;
}

.form-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--mauth-text-mid);
}

.perm-panel {
  max-height: 320px;
  overflow-y: auto;
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.perm-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.perm-group__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.perm-group__count {
  font-weight: 400;
  opacity: 0.7;
}

.perm-items {
  display: grid;
  /* 220 起：名称与编码已经分两行，中文名独占一行足够显示；再大会掉成一列 */
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 4px;
}

.perm-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--mauth-radius-xs);
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
}

/* 勾选框对齐首行文字（两行结构下 align-items:center 会飘到中间） */
.perm-item > input[type='checkbox'] {
  flex: none;
  margin: 2px 0 0;
  accent-color: var(--mauth-primary);
  cursor: pointer;
}

/* 名称 + 编码竖排容器：名称完整可读，编码退成次要信息 */
.perm-item__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.perm-item:hover {
  background: var(--mauth-hover);
}

.perm-item.is-on {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
}

.perm-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

/*
 * 只读展示（内置角色的权限码）：没有勾选框，所以既不该有 hover 反馈，
 * 也不该用"禁用"那种发灰 —— 发灰读起来像"权限被停用了"，而它只是不可改。
 */
.perm-item--static {
  cursor: default;
  border-color: var(--mauth-border);
  background: var(--mauth-surface);
}

/* 没有中文名的权限码独占一行并左对齐（否则它会贴在右侧，看着像缺了内容） */
.perm-item__code--solo {
  font-size: 11.5px;
  opacity: 0.75;
}

.perm-item--static:hover {
  background: var(--mauth-surface);
}

.perm-panel--static {
  background: var(--mauth-surface);
}

.perm-item__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mauth-text);
}

.perm-item__code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.4;
  opacity: 0.6;
}

/* 通配提示：说明"已选 N"里包含整组授权，避免与可见的勾选行数不一致时被当成 bug */
.perm-wild-hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* ── 筛选条（公共骨架在 components.css，这里只留本页宽度）───────── */

/*
 * 输入/下拉都给一个可收缩的基准宽度而不是死宽：窗口窄的时候一起变瘦，
 * 实在放不下才整体换行（flex-wrap），不会把最后一个控件孤零零甩到第二行。
 */
.filterbar__kw,
.filterbar__app {
  flex: 0 1 138px;
  min-width: 108px;
}

/* .select 全局是 width:100%，塞进工具栏会被拉成整行 —— 这里钉死上限。
   文案用「类型」而不是「全部类型」：后者在 90px 里会被原生箭头挤成「全部类」。 */
.filterbar__type {
  flex: 0 0 82px;
}

/* 页头不再放按钮：刷新与新建都在筛选条的动作组里（见模板注释） */

/* ── 分组标题行 ────────────────────────────────────────────────
   应用分组是这张表的骨架，不是一条彩色分隔带：
   行高 42px（比角色行的 48px 略矮）、标题 13px/620、数量做成胶囊。
   旧版是"6px 内边距的灰条 + 12px 字 + 与数字挤在一起的 appId"，
   读起来像表格被切开一道口子，也看不出角色属于哪个应用。 */
.table .role-group-row td {
  /* 高度交给内层 flex：td 自带 --row-h，否则分组会和角色行一样重 */
  height: auto;
  padding: 0 12px 0 8px;
  background: var(--mauth-surface-2);
  border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 78%, transparent);
  cursor: pointer;
  user-select: none;
}

.table .role-group-row:hover td {
  background: var(--mauth-hover);
}

.role-group {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  min-width: 0;
}

/* 折叠箭头：与菜单树的 twist 同形，展开时转 90° */
.role-group__twist {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.role-group__twist:hover {
  background: var(--mauth-press);
  color: var(--mauth-text);
}

.role-group__twist svg {
  transition: transform 0.16s var(--ease);
}

.role-group__twist svg.is-open {
  transform: rotate(90deg);
}

.role-group__label {
  font-size: 13px;
  font-weight: 620;
  letter-spacing: -0.01em;
  color: var(--mauth-text);
}

/* 角色数：做成胶囊，与右侧表格的数字列区分开 —— 那是数据，这是计数 */
.role-group__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mauth-text) 6%, transparent);
  color: var(--mauth-text-soft);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* appId 留着（排查"这角色属于哪个应用"时要它），但压到最弱，扫读时不抢标题 */
.role-group__id {
  min-width: 0;
  overflow: hidden;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--mauth-text-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 角色行（分组的子项） ───────────────────────────────────── */

/*
 * 名称列：只靠缩进表达"我属于上面那个应用"。
 *
 * 特异性要压过 components.css 的 `.table td:first-child`（它给 20px 左内边距），
 * 否则缩进会被那条通用规则吃掉。
 */
.table tbody td.role-name {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 40px;
}

.role-name__text {
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  color: var(--mauth-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 内置标记：比 .tag 薄一档 —— 它是"出身"这个属性，不是可点的状态胶囊 */
.role-name__tag {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mauth-hover);
  color: var(--mauth-text-soft);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1;
}

/* 0 也是信息（没有成员 / 没有权限码），但它是"没有"，压淡一档让人先看见非零 */
.table td.cell-zero {
  color: var(--mauth-text-faint);
}

/* 删除：平时是普通图标，悬停才泛红 —— 一排按钮里不该有个常驻的红点抢视线 */
.role-del:hover:not(:disabled) {
  color: color-mix(in srgb, var(--mauth-danger) 78%, var(--mauth-text));
  border-color: color-mix(in srgb, #ef4444 45%, var(--mauth-border-strong));
}

/* 窄屏（≤820px）表格变卡片：缩进是"列内层级"的隐喻，卡片模式下没有列，去掉 */
@media (max-width: 820px) {
  .table tbody td.role-name {
    padding-left: 12px;
  }

  .table .role-group-row td {
    padding: 0 12px;
  }
}

/* 数据范围：下拉 + 自定义时展开的部门勾选 */
.scope__depts {
  margin-top: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding: 8px 4px;
  border: 1px dashed var(--mauth-border);
  border-radius: 8px;
}

.scope__dept {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  padding-bottom: 4px;
  font-size: 12.5px;
  color: var(--mauth-text-mid);
}

/* 矩阵不可用时的说明面板：读起来要像"缺一个条件"，不是"权限出错" */
.matrix-locked {
  display: grid;
  gap: 6px;
  padding: 20px 22px;
}

.matrix-locked__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 620;
  color: var(--mauth-text);
}

.matrix-locked__hint {
  margin: 0;
  max-width: 60ch;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--mauth-text-mid);
}

.matrix-locked__hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--mauth-surface-2);
  font-size: 11.5px;
}
</style>
