<script setup lang="ts">
/**
 * 珍珠玻璃 · 部门管理版式
 *
 * 版式只负责"长什么样"：树形列表 / 组织架构画布、成员条、变更溯源与表单弹窗都由
 * 容器算好（`views/system/Depts.vue`），契约见 `theme/views/depts.ts`。
 * 展平、过滤、折叠、成员累加只算一次，版式不各自 walk 一遍树。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ChevronRight, History, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next';
import UserPicker from '@/components/ui/UserPicker.vue';
import DeptHistoryDialog from '@/components/business/DeptHistoryDialog.vue';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import type { DeptsViewContext } from '@/theme/views/depts';

const props = defineProps<{ ctx: DeptsViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  device,
  canvas,
  trees,
  loading,
  errorMessage,
  collapsed,
  altView,
  selectedId,
  query,
  dialogOpen,
  submitting,
  historyTarget,
  editingId,
  form,
  errors,
  filtering,
  rows,
  summary,
  selectedPath,
  selected,
  members,
  membersTotal,
  membersLoading,
  parentOptions,
  canCreate,
  canUpdate,
  canDelete,
  load,
  barWidth,
  membersOf,
  descendantsOf,
  toggle,
  expandAll,
  collapseAll,
  openCreate,
  openEdit,
  onLeaderPicked,
  submit,
  remove
} = props.ctx;
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">部门管理</h2>
      <ReadOnlyTag code="admin:dept:update" scope="部门" />
    </div>

    <!--
      读数：先给整棵树的概况，再让人往下看细节。
      组织架构视图不显示这一排 —— 画布吃满剩余高度，而"部门读数"面板里已经有同口径的数字；
      两条信息重复，还各占一行高度。
    -->
    <div v-if="altView === 'table'" class="stats dept-stats">
      <div class="stat">
        <div class="stat__label">部门总数</div>
        <div class="stat__value">{{ summary.count }}</div>
        <div class="stat__hint">{{ summary.roots }} 个顶级</div>
      </div>
      <div class="stat">
        <div class="stat__label">成员合计</div>
        <div class="stat__value">{{ summary.members }}</div>
        <div class="stat__hint">含下属成员</div>
      </div>
      <div class="stat">
        <div class="stat__label">最大层级</div>
        <div class="stat__value">{{ summary.depth }}</div>
        <div class="stat__hint">层数越深，数据权限越窄</div>
      </div>
      <div class="stat">
        <div class="stat__label">停用部门</div>
        <div class="stat__value">{{ summary.disabled }}</div>
        <div class="stat__hint">停用后不可选</div>
      </div>
    </div>

    <!--
      视图切换与筛选/操作放在同一行：分两行时一行只有一个分段控件、一行只有搜索框，
      中间还各带一段下边距，占的高度比内容还多。
      分段控件必须始终渲染（组织架构视图也要靠它切回来），所以只对其它控件用 v-if。
    -->
    <div class="toolbar dept-bar">
      <div class="tabbar" role="tablist" aria-label="视图">
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
          :aria-selected="altView === 'canvas'"
          :class="['tab', { 'is-on': altView === 'canvas' }]"
          @click="altView = 'canvas'"
        >
          组织架构
        </button>
      </div>
      <template v-if="altView === 'table'">
        <span class="input-wrap">
          <Search :size="14" class="input-wrap__icon" />
          <input v-model="query.keyword" class="input" style="width: 220px" placeholder="部门名称 / 负责人 / 电话" />
        </span>
        <select v-model="query.status" class="select" style="width: 118px">
          <option value="">全部状态</option>
          <option :value="1">启用</option>
          <option :value="0">停用</option>
        </select>
        <button
          v-if="query.keyword || query.status !== ''"
          class="btn btn--ghost btn--sm"
          type="button"
          @click="
            query.keyword = '';
            query.status = '';
          "
        >
          清空
        </button>
        <!--
          展开 / 收起放在**左侧控件区**（与「列表 / 组织架构」同侧），不进右侧动作组：
          它们改的是"这棵树怎么显示"，跟视图切换是一类；右侧只留刷新、新建部门这种
          会打接口 / 改数据的动作。与菜单页的「展开全部」同一套位置与边框。
        -->
        <span class="toolbar__group">
          <button class="btn btn--sm" type="button" @click="expandAll">展开</button>
          <button class="btn btn--sm" type="button" @click="collapseAll">收起</button>
        </span>
        <span class="toolbar__spacer"></span>
        <!-- 刷新：实边框 + 图标文字，与其它页同一形态（纯图标只留给行内小操作） -->
        <button class="btn btn--sm dept-refresh" type="button" :disabled="loading" @click="load">
          <RefreshCw :size="15" :class="{ 'is-spinning': loading }" /> 刷新
        </button>
        <button
          v-if="canCreate"
          class="btn btn--primary btn--sm"
          type="button"
          @click="openCreate()"
        >
          <Plus :size="15" /> 新建部门
        </button>
      </template>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table dept-table">
          <thead>
            <tr>
              <th>部门</th>
              <th class="dept-col-members">成员</th>
              <th class="dept-col-status">状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.node.id" class="dept-row">
              <td>
                <div class="dept-cell">
                  <!-- 层级引导线：每深一层一条竖线，比纯缩进更容易看清从属 -->
                  <span v-for="d in item.depth" :key="d" class="dept-guide" aria-hidden="true"></span>
                  <button
                    v-if="item.hasChildren"
                    class="dept-toggle"
                    type="button"
                    :aria-expanded="filtering || !collapsed.has(item.node.id)"
                    :aria-label="`展开或收起 ${item.node.name}`"
                    @click="toggle(item.node.id)"
                  >
                    <ChevronRight :size="14" :class="{ 'is-open': filtering || !collapsed.has(item.node.id) }" />
                  </button>
                  <span v-else class="dept-toggle is-empty"></span>

                  <span class="dept-cell__body">
                    <span class="dept-cell__title">
                      {{ item.node.name }}
                      <span v-if="item.hasChildren" class="dept-badge">{{ item.node.children.length }}</span>
                    </span>
                    <!-- 次要信息压到第二行：列少一半，扫视成本低一半 -->
                    <span class="dept-cell__sub">
                      {{ item.node.leader || '未指定负责人' }}
                      <template v-if="item.node.phone"> · {{ item.node.phone }}</template>
                      <template v-if="item.node.email"> · {{ item.node.email }}</template>
                    </span>
                  </span>
                </div>
              </td>
              <td class="dept-col-members">
                <div class="dept-members">
                  <span class="dept-members__num tnum">{{ membersOf(item.node) }}</span>
                  <span class="dept-members__hint">直属 {{ item.node.user_count }}</span>
                  <span class="dept-members__bar" aria-hidden="true">
                    <i :style="{ width: barWidth(item.node) }"></i>
                  </span>
                </div>
              </td>
              <td class="dept-col-status">
                <span class="tag" :class="item.node.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ item.node.status === 1 ? '启用' : '停用' }}
                </span>
              </td>
              <td class="col-actions">
                <button
                  v-if="canCreate"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="新增下级部门"
                  aria-label="新增下级部门"
                  @click="openCreate(item.node)"
                >
                  <Plus :size="14" />
                </button>
                <button
                  v-if="canUpdate"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="编辑"
                  aria-label="编辑"
                  @click="openEdit(item.node)"
                >
                  <Pencil :size="14" />
                </button>
                <button
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="变更历史（谁在什么时候改了什么）"
                  aria-label="变更历史"
                  @click="historyTarget = item.node"
                >
                  <History :size="14" />
                </button>
                <button
                  v-if="canDelete"
                  class="btn btn--danger btn--sm btn--icon"
                  type="button"
                  title="删除"
                  aria-label="删除"
                  @click="remove(item.node)"
                >
                  <Trash2 :size="14" />
                </button>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="4">
                <div class="empty">{{ filtering ? '没有匹配的部门' : '暂无部门' }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        手机端：一行一张"缩进卡片"。
        层级仍靠缩进表达（每层 12px），展开箭头留在名字左边，
        成员数与状态压进标题行，操作单独一行 —— 4 个按钮在 390px 上排得下。
      -->
      <ul v-else class="mlist">
        <li v-for="item in rows" :key="item.node.id" class="mcard">
          <div class="mcard__head">
            <div class="mcard__main">
              <span class="mcard__title" :style="{ paddingLeft: `${item.depth * 12}px` }">
                <button
                  v-if="item.hasChildren"
                  class="mgroup__twist"
                  type="button"
                  :aria-expanded="filtering || !collapsed.has(item.node.id)"
                  :aria-label="`展开或收起 ${item.node.name}`"
                  @click="toggle(item.node.id)"
                >
                  <ChevronRight :size="14" :class="{ 'is-open': filtering || !collapsed.has(item.node.id) }" />
                </button>
                <span v-else class="mcard__indent" aria-hidden="true"></span>
                <span class="mcard__title-text">{{ item.node.name }}</span>
                <span v-if="item.hasChildren" class="dept-badge">{{ item.node.children.length }}</span>
                <span class="tag" :class="item.node.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ item.node.status === 1 ? '启用' : '停用' }}
                </span>
              </span>
              <span class="mcard__sub" :style="{ paddingLeft: `${12 + item.depth * 12}px` }">
                {{ item.node.leader || '未指定负责人' }}
                <template v-if="item.node.phone"> · {{ item.node.phone }}</template>
              </span>
              <span class="mcard__meta" :style="{ paddingLeft: `${12 + item.depth * 12}px` }">
                <span>直属 <b class="tnum">{{ item.node.user_count }}</b> 人</span>
                <span>含下级 <b class="tnum">{{ membersOf(item.node) }}</b> 人</span>
              </span>
            </div>
          </div>
          <div class="mcard__acts">
            <button
              v-if="canCreate"
              class="btn btn--sm"
              type="button"
              @click="openCreate(item.node)"
            >
              <Plus :size="13" /> 下级
            </button>
            <button
              v-if="canUpdate"
              class="btn btn--sm"
              type="button"
              @click="openEdit(item.node)"
            >
              <Pencil :size="13" /> 编辑
            </button>
            <button class="btn btn--sm" type="button" @click="historyTarget = item.node">
              <History :size="13" /> 历史
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
        <li v-if="!loading && rows.length === 0" class="mlist__hint">
          {{ filtering ? '没有匹配的部门' : '暂无部门' }}
        </li>
      </ul>
    </section>

    <!-- 组织架构画布：拖拽平移 / 滚轮缩放，四角浮动面板 -->
    <section v-if="altView === 'canvas'">
      <component :is="canvas"
        :tree="trees"
        :selected-id="selectedId"
        :creatable="canCreate"
        @select="selectedId = $event.id"
        @create="openCreate"
        @refresh="load"
      >
        <template #tl>
          <section v-if="selected" class="org-card m-float">
            <span class="dept-eyebrow">{{
              selectedPath
                ?.slice(0, -1)
                .map(d => d.name)
                .join(' / ') || '根部门'
            }}</span>
            <h2 class="org-card-title">{{ selected.name }}</h2>
            <dl class="org-card-rows">
              <dt>负责人</dt>
              <dd>{{ selected.leader || '—' }}</dd>
              <dt>电话</dt>
              <dd class="tnum">{{ selected.phone || '—' }}</dd>
              <dt>邮箱</dt>
              <dd>{{ selected.email || '—' }}</dd>
              <dt>状态</dt>
              <dd>
                <span class="tag" :class="selected.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ selected.status === 1 ? '启用' : '停用' }}
                </span>
              </dd>
            </dl>
          </section>
        </template>

        <template #tr>
          <section v-if="selected" class="org-card m-float">
            <span class="dept-eyebrow">部门读数</span>
            <dl class="org-card-rows">
              <dt>本部门</dt>
              <dd class="tnum">{{ selected.user_count }} 人</dd>
              <dt>含下级</dt>
              <dd class="tnum">{{ membersOf(selected) }} 人</dd>
              <dt>下级部门</dt>
              <dd class="tnum">{{ descendantsOf(selected) }} 个</dd>
              <dt>层级</dt>
              <dd class="tnum">第 {{ selectedPath?.length ?? 1 }} 层</dd>
            </dl>
          </section>
        </template>

        <template #bl>
          <section v-if="selected" class="org-card m-float">
            <span class="dept-eyebrow">成员 · 共 {{ membersTotal }} 人</span>
            <ul class="dept-members">
              <li v-for="u in members" :key="u.id">
                <span class="dept-members__name">{{ u.username }}</span>
                <span class="dept-members__meta">{{ u.email || '—' }}</span>
              </li>
              <li v-if="!members.length" class="dept-members__empty">
                {{ membersLoading ? '加载中…' : '暂无直属成员' }}
              </li>
            </ul>
          </section>
        </template>

        <template #br>
          <!--
            🔴 面板不能整体挂在 `v-if="selected"` 上：组织架构视图里没选中任何节点
            （包括"一个部门都还没有"的首次使用）时，就没有任何新建入口，只能切回列表页。
            所以「新建部门」（根级）常驻；「新增下级 / 编辑 / 删除」才依赖选中项。
          -->
          <section v-if="canCreate || selected" class="org-card org-actions m-float">
            <button
              v-if="canCreate"
              class="btn btn--primary btn--sm"
              type="button"
              @click="openCreate()"
            >
              <Plus :size="14" /> 新建部门
            </button>
            <button
              v-if="selected && canCreate"
              class="btn btn--ghost btn--sm"
              type="button"
              @click="openCreate(selected)"
            >
              <Plus :size="14" /> 新增下级
            </button>
            <button
              v-if="selected && canUpdate"
              class="btn btn--ghost btn--sm"
              type="button"
              @click="openEdit(selected)"
            >
              <Pencil :size="14" /> 编辑
            </button>
            <button
              v-if="selected && canDelete"
              class="btn btn--danger btn--sm"
              type="button"
              @click="remove(selected)"
            >
              <Trash2 :size="14" /> 删除
            </button>
          </section>
        </template>
      </component>
    </section>

    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal modal--sm">
        <header class="modal__head">
          <span class="modal__title">{{ editingId ? '编辑部门' : '新建部门' }}</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">上级部门</span>
            <select v-model.number="form.parentId" class="select">
              <option :value="0">无（顶级部门）</option>
              <option v-for="opt in parentOptions" :key="opt.id" :value="opt.id">
                {{ '　'.repeat(opt.depth) }}{{ opt.label }}
              </option>
            </select>
            <span v-if="editingId" class="field__hint">不能选自己或自己的下级（会造成循环）</span>
          </label>
          <label class="field">
            <span class="field__label">部门名称 *</span>
            <input v-model="form.name" class="input" maxlength="50" placeholder="如：研发中心" />
            <span v-if="errors.name" class="field__error">{{ errors.name }}</span>
          </label>
          <div class="field">
            <span class="field__label">负责人</span>
            <!--
              必须从系统账号里选（`strict`）：负责人要能反查到具体的人 ——
              部门邮箱由他带出、通知发给他、离职时也要能一眼看出哪个部门要换人。
              允许手打名字的结果是"名单上有个查无此人的负责人"，比留空更糟。
            -->
            <UserPicker
              v-model="form.leader"
              v-model:id="form.leaderUserId"
              strict
              :maxlength="50"
              placeholder="搜索账号选人"
              @pick="onLeaderPicked"
            />
            <span class="field__hint">只能从系统账号里选；负责人的邮箱会自动带到下方</span>
          </div>
          <label class="field">
            <span class="field__label">联系电话</span>
            <input v-model="form.phone" class="input" maxlength="20" placeholder="选填" />
            <span v-if="errors.phone" class="field__error">{{ errors.phone }}</span>
          </label>
          <label class="field">
            <span class="field__label">邮箱</span>
            <!--
              邮箱属于负责人，不另填一份：手填的地址系统里可能查无此人，
              既发不出通知也反查不到人。选完负责人自动带出，他只绑了手机号就留空。
            -->
            <input
              v-model="form.email"
              class="input"
              type="email"
              readonly
              :disabled="!form.leaderUserId"
              :placeholder="form.leaderUserId ? '取自负责人账号' : '选择负责人后自动带出'"
            />
            <span class="field__hint">
              {{ form.leaderUserId ? '来自负责人账号；为空说明该账号还没绑邮箱，可在用户管理里补' : '选好负责人后自动带出' }}
            </span>
            <span v-if="errors.email" class="field__error">{{ errors.email }}</span>
          </label>
          <label class="field">
            <span class="field__label">显示排序</span>
            <input v-model.number="form.sort" class="input" type="number" min="0" max="9999" />
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
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="submit">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- 变更历史：谁在什么时候把这棵树改成了什么样 -->
    <DeptHistoryDialog
      :dept-id="historyTarget?.id ?? null"
      :dept-name="historyTarget?.name ?? ''"
      @close="historyTarget = null"
    />

  </div>
</template>

<style scoped>
/* 部门列：引导线 + 折叠箭头 + 两行正文（名称 / 负责人·电话·邮箱） */
.dept-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: var(--row-h);
}

.dept-cell__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.dept-cell__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 550;
  letter-spacing: -0.01em;
}

/* 次要信息压到第二行：比多两列更容易扫，也扛得住窄屏 */
.dept-cell__sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.dept-stats {
  margin-bottom: 2px;
}

/*
 * 视图切换 + 筛选/操作同一行。
 * 上边距比默认工具条更大：这一行紧贴读数卡，贴太近会让人以为筛选属于卡片的一部分。
 */
.dept-bar {
  margin-top: 18px;
  row-gap: 8px;
}

/* 工具条按钮高度由全局 `.toolbar .btn--sm` 统一到 `--control-h`，这里不再单钉 */

/*
 * 刷新中的旋转：点击之后图标必须动起来，否则"点了没反应"与"正在加载"分不清。
 * 0.9s 一圈偏慢但足够稳；减少动效偏好下直接停转。
 */
.dept-refresh .is-spinning {
  animation: dept-spin 0.9s linear infinite;
}

@keyframes dept-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dept-refresh .is-spinning {
    animation: none;
  }
}

.dept-col-members {
  width: 172px;
}

.dept-col-status {
  width: 86px;
}

.dept-members {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dept-members__num {
  min-width: 24px;
  font-size: 13px;
  font-weight: 620;
}

.dept-members__hint {
  font-size: 11px;
  color: var(--mauth-text-faint);
  white-space: nowrap;
}

/* 迷你占比条：同一棵树内横向可比，比一串数字更快看出"哪里人多" */
.dept-members__bar {
  flex: 1;
  min-width: 30px;
  height: 4px;
  border-radius: 999px;
  background: var(--mauth-hover);
  overflow: hidden;
}

.dept-members__bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--mauth-primary);
  opacity: 0.72;
}

/* 层级引导线：每深一层多一条竖虚线，比纯缩进更容易看清从属关系 */
.dept-guide {
  align-self: stretch;
  width: 16px;
  margin-right: 2px;
  border-left: 1px dashed var(--mauth-border-strong);
}

/* 下级数量徽标（只在有子部门时出现） */
.dept-badge {
  flex: none;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-faint);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 17px;
}

.dept-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--mauth-text-mid);
  cursor: pointer;
}

.dept-toggle:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.dept-toggle.is-empty {
  cursor: default;
}

.dept-toggle svg {
  transition: transform 0.16s ease;
}

.dept-toggle svg.is-open {
  transform: rotate(90deg);
}

/* 工具条右侧的成组按钮：组内紧凑，与其他组之间留白 */
.toolbar__group {
  display: inline-flex;
  gap: 4px;
}

.dept-eyebrow {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--mauth-text-faint);
}

.dept-members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.dept-members li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
}

.dept-members__name {
  font-weight: 500;
}

.dept-members__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.dept-members__empty {
  font-size: 12.5px;
  color: var(--mauth-text-faint);
}
</style>
