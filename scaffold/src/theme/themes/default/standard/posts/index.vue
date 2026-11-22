<script setup lang="ts">
/**
 * 珍珠玻璃 · 岗位管理版式
 *
 * 版式只负责"长什么样"：数据、分页、增删改全在容器（`views/system/Posts.vue`），
 * 契约见 `theme/views/posts.ts`。这里一行请求、一个 store 都没有。
 *
 * 「表格 vs 卡片」两态留在同一份实现里（按 `ctx.device` 切）：手机端不是另一套页面，
 * 只是把一行折成一张卡，拆成两份只会让两边的字段顺序慢慢漂移。`mobile/` 目录转发到
 * 这里，正是这个理由。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import type { PostsViewContext } from '@/theme/views/posts';

const props = defineProps<{ ctx: PostsViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），所以响应性与 `.value` 写法都不变；
 * `ladder: PostLadder` 是给模板里的组件标签换个别名。
 */
const {
  list,
  altView,
  device,
  ladderPosts,
  ladder: PostLadder,
  canCreate,
  canUpdate,
  canDelete,
  dialogOpen,
  editingId,
  form,
  openCreate,
  openEdit,
  editFromLadder,
  submit,
  remove
} = props.ctx;
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">岗位管理</h2>
      <span class="page__sub">共 {{ list.total.value }} 个岗位</span>
      <ReadOnlyTag code="admin:post:update" scope="岗位" />
    </div>

    <!--
      视图切换与筛选/操作同一行：拆两行时，第一行只有两个分段按钮，
      第二行才是搜索与操作，中间还各带一段下边距，占的高度比内容多。
      分段控件必须始终渲染（阶梯视图也要靠它切回来），所以只对其它控件用 v-if。
    -->
    <div class="toolbar posts-bar">
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
          :aria-selected="altView === 'ladder'"
          :class="['tab', { 'is-on': altView === 'ladder' }]"
          @click="altView = 'ladder'"
        >
          岗位阶梯
        </button>
      </div>
      <template v-if="altView === 'table'">
        <input
          v-model="list.query.keyword"
          class="input"
          style="width: 200px"
          placeholder="编码 / 名称"
          @keyup.enter="list.search"
        />
        <button class="btn btn--sm" type="button" @click="list.search">查询</button>
        <span class="toolbar__spacer"></span>
        <!-- 刷新与新建同属动作组、靠右：筛选项在左，动作在右，全站一套 -->
        <button class="btn btn--sm" type="button" :disabled="list.loading.value" @click="list.load">
          <RefreshCw :size="15" /> 刷新
        </button>
        <button
          v-if="canCreate"
          class="btn btn--primary btn--sm"
          type="button"
          @click="openCreate"
        >
          <Plus :size="15" /> 新建岗位
        </button>
      </template>
    </div>

    <p v-if="list.errorMessage.value" class="tag tag--off">{{ list.errorMessage.value }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 140px" />
            <col style="width: 130px" />
            <col style="width: 58px" />
            <col style="width: 58px" />
            <col style="width: 58px" />
            <col style="width: 137px" />
            <col style="width: 168px" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>编码</th>
              <th>在岗</th>
              <th>排序</th>
              <th>状态</th>
              <th>备注</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in list.rows.value" :key="row.id">
              <td>{{ row.post_name }}</td>
              <td class="mono">{{ row.post_code }}</td>
              <td class="mono">{{ row.user_count }}</td>
              <td class="mono">{{ row.sort }}</td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">{{
                  row.status === 1 ? '启用' : '停用'
                }}</span>
              </td>
              <td>{{ row.remark || '—' }}</td>
              <td class="col-actions">
                <button
                  v-if="canUpdate"
                  class="btn btn--ghost btn--sm"
                  type="button"
                  @click="openEdit(row)"
                >
                  <Pencil :size="14" /> 编辑
                </button>
                <button
                  v-if="canDelete"
                  class="btn btn--danger btn--sm"
                  type="button"
                  @click="remove(row)"
                >
                  <Trash2 :size="14" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="!list.loading.value && list.rows.value.length === 0">
              <td colspan="7"><div class="empty">暂无岗位</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        手机端：一张卡一个岗位。
        标题行放「名称 + 在岗人数」，第二行是编码与备注（放不下就省略），
        操作整行铺开 —— 表格在 390px 上会退化成每个单元格一行 label，一屏只看得下一个人。
      -->
      <ul v-else class="mlist">
        <li v-for="row in list.rows.value" :key="row.id" class="mcard">
          <div class="mcard__head">
            <div class="mcard__main">
              <span class="mcard__title">
                <span class="mcard__title-text">{{ row.post_name }}</span>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ row.status === 1 ? '启用' : '停用' }}
                </span>
              </span>
              <span class="mcard__sub mono">{{ row.post_code }} · 排序 {{ row.sort }}</span>
            </div>
            <span class="mcard__meta">
              <span><b class="tnum">{{ row.user_count }}</b> 人在岗</span>
            </span>
          </div>
          <span v-if="row.remark" class="mcard__sub">{{ row.remark }}</span>
          <div v-if="canUpdate || canDelete" class="mcard__acts">
            <button
              v-if="canUpdate"
              class="btn btn--sm"
              type="button"
              @click="openEdit(row)"
            >
              <Pencil :size="13" /> 编辑
            </button>
            <button
              v-if="canDelete"
              class="btn btn--danger btn--sm"
              type="button"
              @click="remove(row)"
            >
              <Trash2 :size="13" /> 删除
            </button>
          </div>
        </li>
        <li v-if="!list.loading.value && list.rows.value.length === 0" class="mlist__hint">暂无岗位</li>
      </ul>

      <div class="pager">
        <span class="mono">第 {{ list.query.pageNum }} / {{ list.pageCount.value }} 页</span>
        <button class="btn btn--sm" type="button" :disabled="list.query.pageNum <= 1" @click="list.turnPage(-1)">
          上一页
        </button>
        <button
          class="btn btn--sm"
          type="button"
          :disabled="list.query.pageNum >= list.pageCount.value"
          @click="list.turnPage(1)"
        >
          下一页
        </button>
      </div>
    </section>

    <!-- 岗位阶梯：按 sort 自左下向右上铺开的台阶 + 在岗成员 -->
    <section v-if="altView === 'ladder'">
      <!--
        阶梯是容器经 ctx 传进来的异步组件（版式不该知道它从哪个文件来）。
        用 <component :is> 而不是 <PostLadder>：静态组件自检关卡只认本文件里
        import 过的名字，动态组件走 is 绑定，才是"版式不认识业务组件"的正确写法。
      -->
      <component :is="PostLadder" :posts="ladderPosts" :loading="list.loading.value" @edit="editFromLadder" />
    </section>

    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal modal--sm">
        <header class="modal__head">
          <span class="modal__title">{{ editingId ? '编辑岗位' : '新建岗位' }}</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">岗位编码</span>
            <input v-model="form.postCode" class="input" maxlength="50" :disabled="!!editingId" />
          </label>
          <label class="field">
            <span class="field__label">岗位名称</span>
            <input v-model="form.postName" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">排序 / 层级</span>
            <input v-model.number="form.sort" class="input" type="number" min="0" />
            <!--
              层级没有单独字段：**排序数字相同 = 同一级**。财务总经理与研发总经理都填 1，
              在阶梯里就并排在同一层；填 1 和 2 则是上下两级。多一个"职级"字段就多一处
              会不一致（职级改了、排序没改，阶梯与列表各说一套）。
            -->
            <span class="field__hint">
              列表按它升序；<b>数字相同的岗位在「岗位阶梯」里并排为同一级</b>（如财务总经理与研发总经理都填 1）
            </span>
          </label>
          <label class="field">
            <span class="field__label">状态</span>
            <select v-model.number="form.status" class="select">
              <option :value="1">启用</option>
              <option :value="0">停用</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">备注</span>
            <input v-model="form.remark" class="input" maxlength="255" />
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
</style>
