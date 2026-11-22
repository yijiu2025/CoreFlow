<script setup lang="ts">
/**
 * 珍珠玻璃 · 菜单管理版式
 *
 * 版式只负责"长什么样"：树形表格 / 导航星系、表单弹窗都由容器算好数据
 * （`views/system/Menus.vue`），契约见 `theme/views/menus.ts`。
 * 展平、可折叠集合、上级候选都只有容器算一次，版式不各自 walk 树。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import type { MenusViewContext } from '@/theme/views/menus';

const props = defineProps<{ ctx: MenusViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  device,
  permissionOptions,
  apps,
  appFilter,
  writableApps,
  currentAppWritable,
  starMap,
  altView,
  trees,
  loading,
  errorMessage,
  dialogOpen,
  editingId,
  form,
  expandableIds,
  allCollapsed,
  totalCount,
  flat,
  parentOptions,
  TYPE_TEXT,
  dialogTitle,
  iconOptions,
  permissionWarning,
  canCreate,
  canUpdate,
  canDelete,
  appLabelOf,
  toggleCollapse,
  toggleAll,
  onAppChange,
  openCreate,
  openEdit,
  refreshAll,
  submit,
  remove,
  toggleVisible,
  onPickApp
} = props.ctx;
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">菜单管理</h2>
      <span class="page__sub">共 {{ totalCount }} 项</span>
      <ReadOnlyTag code="admin:menu:update" scope="菜单" />
    </div>

    <!--
      筛选条：视图切换 + 应用分档 + 动作压成一行。
      应用分档原来是 9 个 chip（占一整行，换行后还把刷新/折叠挤到第三行），
      改成下拉后与视图切换、右侧动作同排；不可写的应用在下拉里标「只读」。
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
          :aria-selected="altView === 'star'"
          :class="['tab', { 'is-on': altView === 'star' }]"
          @click="altView = 'star'"
        >
          导航星系
        </button>
      </div>

      <!-- 应用分档：支持多应用后，不同应用的菜单混在一棵树里会没法找 -->
      <select
        v-if="altView === 'table'"
        :value="appFilter"
        class="select filterbar__app"
        aria-label="按应用筛选"
        @change="onPickApp"
      >
        <option value="">全部应用（{{ totalCount }}）</option>
        <option v-for="app in apps" :key="app.id" :value="app.id">
          {{ app.name }}{{ app.writable === false ? '（只读）' : '' }}
        </option>
      </select>

      <!--
        展开/折叠全部放在**左侧控件区**（视图切换 + 应用分档之后），不进右侧动作组。
        它改的是「这张表怎么显示」，和「列表 / 导航星系」是同一类东西；
        右侧只留刷新、新建菜单这种"会打接口 / 改数据"的动作，边界才清楚。
        实边框（不是 `btn--ghost`）：左边紧挨着有边框的下拉，无框会显得残缺。
      -->
      <button
        v-if="altView === 'table' && expandableIds.length > 0"
        class="btn btn--sm"
        type="button"
        @click="toggleAll"
      >
        <AppIcon name="chevronRight" :size="14" :class="{ 'is-open': !allCollapsed }" />
        {{ allCollapsed ? '展开全部' : '折叠全部' }}
      </button>

      <div class="filterbar__actions">
        <button class="btn btn--sm" type="button" :disabled="loading" @click="refreshAll">
          <RefreshCw :size="15" /> 刷新
        </button>
        <button
          v-if="altView === 'table' && canCreate"
          class="btn btn--primary btn--sm"
          type="button"
          :disabled="!currentAppWritable"
          :title="currentAppWritable ? '' : '你没有该应用的管理权限'"
          @click="openCreate()"
        >
          <Plus :size="15" /> 新建菜单
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 148px" />
            <col style="width: 58px" />
            <col style="width: 120px" />
            <col style="width: 148px" />
            <col style="width: 58px" />
            <col style="width: 58px" />
            <col style="width: 58px" />
            <col style="width: 130px" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>路由</th>
              <th>权限码</th>
              <th>排序</th>
              <th>显示</th>
              <th>状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in flat" :key="item.node.id">
              <!--
                名称列带折叠箭头：目录/页面有子项时可收起来。
                没有子项的节点也放一个同宽占位，否则同一层的名字会左右错位。
              -->
              <td :style="{ paddingLeft: `${10 + item.depth * 18}px` }">
                <div class="menu-cell">
                  <button
                    v-if="item.hasChildren"
                    class="menu-twist"
                    type="button"
                    :aria-expanded="!item.isCollapsed"
                    :aria-label="item.isCollapsed ? `展开 ${item.node.name}` : `收起 ${item.node.name}`"
                    @click="toggleCollapse(item.node.id)"
                  >
                    <AppIcon name="chevronRight" :size="12" :class="{ 'is-open': !item.isCollapsed }" />
                  </button>
                  <span v-else class="menu-twist is-leaf" aria-hidden="true" />
                  <span class="menu-name" :class="{ 'is-btn': item.node.type === 'btn' }">{{ item.node.name }}</span>
                  <span v-if="appFilter === '' && item.depth === 0" class="tag tag--info app-tag">
                    {{ appLabelOf(item.node.app_id) }}
                  </span>
                  <span v-if="item.hasChildren" class="menu-count" :title="`${item.node.children?.length} 个子项`">
                    {{ item.node.children?.length }}
                  </span>
                </div>
              </td>
              <td>
                <span :class="['tag', item.node.type === 'btn' ? 'tag--off' : 'tag--info']">{{
                  TYPE_TEXT[item.node.type]
                }}</span>
              </td>
              <td class="mono">{{ item.node.path || '—' }}</td>
              <td class="mono">{{ item.node.permission || '—' }}</td>
              <td class="mono">{{ item.node.sort }}</td>
              <td>
                <!--
                  所有类型（含按钮）都由「显示」开关控制是否展示：
                  目录/页面 = 侧栏是否出现；按钮 = 是否出现在页面工具栏。
                  置 0 是"下架"，授权原样保留，重新打开即恢复。
                -->
                <AppSwitch
                  :model-value="item.node.visible === 1"
                  :label="`显示 ${item.node.name}`"
                  :disabled="!canUpdate"
                  @update:model-value="value => toggleVisible(item.node, value)"
                />
              </td>
              <td>
                <!-- 状态是记录（正常 / 停用），不是开关；停用后连授权都判否 -->
                <span :class="['tag', item.node.status === 1 ? 'tag--ok' : 'tag--off']">
                  {{ item.node.status === 1 ? '正常' : '停用' }}
                </span>
              </td>
              <td class="col-actions">
                <button
                  v-if="canCreate && item.node.type !== 'btn'"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  :title="`在「${item.node.name}」下新增${item.node.type === 'menu' ? '按钮' : '页面'}`"
                  :aria-label="`在「${item.node.name}」下新增${item.node.type === 'menu' ? '按钮' : '页面'}`"
                  @click="openCreate(item.node)"
                >
                  <Plus :size="15" />
                </button>
                <button
                  v-if="canUpdate"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="编辑"
                  aria-label="编辑"
                  @click="openEdit(item.node)"
                >
                  <Pencil :size="15" />
                </button>
                <button
                  v-if="canDelete"
                  class="btn btn--ghost btn--sm btn--icon is-danger"
                  type="button"
                  title="删除"
                  aria-label="删除"
                  @click="remove(item.node)"
                >
                  <Trash2 :size="15" />
                </button>
              </td>
            </tr>
            <tr v-if="!loading && flat.length === 0">
              <td colspan="8"><div class="empty">暂无菜单</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        手机端：缩进卡片。层级靠缩进（每层 14px）+ 折叠箭头表达，
        「显示」开关留在右侧（它是这一屏最常点的控件），其余字段压成一行副标题。
      -->
      <ul v-else class="mlist">
        <li v-for="item in flat" :key="item.node.id" class="mcard">
          <div class="mcard__head">
            <div class="mcard__main">
              <span class="mcard__title" :style="{ paddingLeft: `${item.depth * 14}px` }">
                <button
                  v-if="item.hasChildren"
                  class="mgroup__twist"
                  type="button"
                  :aria-expanded="!item.isCollapsed"
                  :aria-label="item.isCollapsed ? `展开 ${item.node.name}` : `收起 ${item.node.name}`"
                  @click="toggleCollapse(item.node.id)"
                >
                  <AppIcon name="chevronRight" :size="12" :class="{ 'is-open': !item.isCollapsed }" />
                </button>
                <span v-else class="mcard__indent" aria-hidden="true"></span>
                <span class="mcard__title-text" :class="{ 'menu-name--btn': item.node.type === 'btn' }">
                  {{ item.node.name }}
                </span>
                <span :class="['tag', item.node.type === 'btn' ? 'tag--off' : 'tag--info']">
                  {{ TYPE_TEXT[item.node.type] }}
                </span>
                <span v-if="item.hasChildren" class="menu-count">{{ item.node.children?.length }}</span>
              </span>
              <span class="mcard__sub mono" :style="{ paddingLeft: `${20 + item.depth * 14}px` }">
                {{ item.node.path || '无路由' }} · {{ item.node.permission || '无权限码' }}
              </span>
              <span class="mcard__meta" :style="{ paddingLeft: `${20 + item.depth * 14}px` }">
                <span>排序 {{ item.node.sort }}</span>
                <span v-if="appFilter === '' && item.depth === 0">{{ appLabelOf(item.node.app_id) }}</span>
                <span :class="['tag', item.node.status === 1 ? 'tag--ok' : 'tag--off']">
                  {{ item.node.status === 1 ? '正常' : '停用' }}
                </span>
              </span>
            </div>
            <!-- 显示开关：手机上它比"状态"更常用，单独留在右侧不参与换行 -->
            <AppSwitch
              :model-value="item.node.visible === 1"
              :label="`显示 ${item.node.name}`"
              :disabled="!canUpdate"
              @update:model-value="value => toggleVisible(item.node, value)"
            />
          </div>
          <div class="mcard__acts">
            <button
              v-if="canCreate && item.node.type !== 'btn'"
              class="btn btn--sm"
              type="button"
              @click="openCreate(item.node)"
            >
              <Plus :size="13" /> {{ item.node.type === 'menu' ? '按钮' : '下级' }}
            </button>
            <button
              v-if="canUpdate"
              class="btn btn--sm"
              type="button"
              @click="openEdit(item.node)"
            >
              <Pencil :size="13" /> 编辑
            </button>
            <button
              v-if="canDelete"
              class="btn btn--danger btn--sm"
              type="button"
              @click="remove(item.node)"
            >
              <Trash2 :size="13" /> 删除
            </button>
          </div>
        </li>
        <li v-if="!loading && flat.length === 0" class="mlist__hint">暂无菜单</li>
      </ul>
    </section>

    <!-- 导航星系：目录 / 页面 / 按钮的三层星图（复用同一份菜单树） -->
    <section v-if="altView === 'star'">
      <component :is="starMap" :tree="trees" @edit="openEdit" @create="openCreate" />
    </section>

    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal modal--sm">
        <header class="modal__head">
          <span class="modal__title">{{ dialogTitle }}</span>
        </header>
        <div class="modal__body">
          <!--
            归属应用决定权限码的命名空间。新建时可选；已有节点禁用 ——
            换应用要连父子一起换，单条换会造出跨应用的父子关系。
          -->
          <label class="field">
            <span class="field__label">归属应用</span>
            <select v-model="form.appId" class="select" :disabled="editingId !== null" @change="onAppChange">
              <option v-for="app in writableApps" :key="app.id" :value="app.id">{{ app.name }}</option>
            </select>
            <p v-if="editingId !== null" class="form-hint">
              已有菜单不能直接更换应用（父子必须同属一个应用），需要更换请删除后重建。
            </p>
          </label>
          <label class="field">
            <span class="field__label">上级菜单</span>
            <select v-model.number="form.parentId" class="select">
              <option :value="0">（根节点）</option>
              <option v-for="item in parentOptions" :key="item.id" :value="item.id">
                {{ '　'.repeat(item.depth) }}{{ item.name }}
              </option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">名称</span>
            <input
              v-model="form.name"
              class="input"
              maxlength="50"
              :placeholder="form.type === 'btn' ? '如：新增用户' : ''"
            />
          </label>
          <label class="field">
            <span class="field__label">类型</span>
            <select v-model="form.type" class="select">
              <option value="dir">目录</option>
              <option value="menu">页面</option>
              <option value="btn">按钮</option>
            </select>
          </label>
          <label v-if="form.type !== 'btn'" class="field">
            <span class="field__label">图标</span>
            <div class="icon-pick">
              <span class="icon-pick__preview"><AppIcon :name="form.icon" :size="16" /></span>
              <select v-model="form.icon" class="select">
                <option v-for="name in iconOptions" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
          </label>
          <label v-if="form.type !== 'btn'" class="field">
            <span class="field__label">路由</span>
            <input v-model="form.path" class="input" maxlength="200" placeholder="/system/user" />
          </label>
          <label v-if="form.type === 'menu'" class="field">
            <span class="field__label">视图键</span>
            <input v-model="form.component" class="input" maxlength="200" />
          </label>
          <label class="field">
            <span class="field__label">权限码{{ form.type === 'btn' ? '（按钮必填）' : '' }}</span>
            <input
              v-model="form.permission"
              class="input"
              maxlength="100"
              list="menu-permission-options"
              :placeholder="form.type === 'btn' ? 'admin:user:create' : 'admin:user:read'"
            />
            <datalist id="menu-permission-options">
              <option v-for="item in permissionOptions" :key="item.code" :value="item.code">
                {{ item.label }}
              </option>
            </datalist>
            <span v-if="permissionWarning" class="field__error">{{ permissionWarning }}</span>
            <span v-else class="field__hint">只能是本应用的权限码（admin: 开头），可从列表里选。</span>
          </label>
          <label class="field">
            <span class="field__label">排序</span>
            <input v-model.number="form.sort" class="input" type="number" min="0" />
          </label>
          <label v-if="form.type !== 'btn'" class="field">
            <span class="field__label">显示</span>
            <select v-model.number="form.visible" class="select">
              <option :value="1">显示</option>
              <option :value="0">隐藏（所有角色都不显示）</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">状态</span>
            <select v-model.number="form.status" class="select">
              <option :value="1">启用</option>
              <option :value="0">停用</option>
            </select>
          </label>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="dialogOpen = false">取消</button>
          <button class="btn btn--primary" type="button" @click="submit">保存</button>
        </footer>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* 筛选条骨架在 components.css（`.filterbar`），这里只钉应用下拉的宽度：
   最长的应用名是「RetroWeb 逆合成工作台」，200px 才不截断。 */
.filterbar__app {
  flex: 0 0 200px;
}

/* 顶层行标注归属应用（"全部"视图下才有意义，分档后冗余） */
.app-tag {
  margin-left: 6px;
  flex: none;
}

/* 图标选择：左边实时预览，右边下拉 —— 选之前就能看见长什么样 */
.icon-pick {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-pick__preview {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
}

.icon-pick .select {
  flex: 1;
  min-width: 0;
}

/* 操作列三个图标按钮：删除单独给红色，其余保持幽灵态 */
.btn--icon.is-danger:hover:not(:disabled) {
  color: var(--mauth-danger);
  border-color: color-mix(in srgb, var(--mauth-danger) 34%, transparent);
  background: var(--mauth-danger-soft);
}

/* ── 树形行：折叠箭头 + 名称 + 子项计数 ───────────────────────── */

.menu-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.menu-twist {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.menu-twist:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

/* 叶子节点的同宽占位：不显示但占位，保证同层名字左边缘对齐 */
.menu-twist.is-leaf {
  cursor: default;
  pointer-events: none;
}

/* 箭头旋转 90° = 已展开（与用户页的部门树同一语义） */
.menu-twist :deep(svg),
.toolbar :deep(svg) {
  transition: transform 0.16s var(--ease);
}

.menu-twist :deep(svg.is-open),
.toolbar :deep(svg.is-open) {
  transform: rotate(90deg);
}

.menu-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 按钮行弱化：它是"权限点"而不是导航项，不该和目录/页面抢注意力 */
.menu-name.is-btn {
  color: var(--mauth-text-mid);
}

/* 子项数：折叠后仍看得出藏了几个 */
.menu-count {
  flex: none;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mauth-hover);
  color: var(--mauth-text-faint);
  font-size: 10.5px;
  line-height: 16px;
  text-align: center;
}
</style>
