<script setup lang="ts">
/**
 * 岗位管理
 *
 * 岗位编码唯一且创建后不建议修改（历史审计按编码回溯可读性依赖它）。
 * 有在岗成员时删除会被后端拒绝。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import { createPost, listPosts, removePost, updatePost } from '@/api/system';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import { useListPage } from '@/composables/useListPage';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

/**
 * 当前渲染设备
 *
 * 只决定"这张列表怎么画"：桌面走表格，手机走紧凑卡片（标题 + 在岗 + 一行操作）。
 * 岗位只有 4 个字段，卡片装得下 —— 不需要再开一层详情页。
 */
const device = useRenderDevice();

interface PostRow {
  id: number;
  post_code: string;
  post_name: string;
  sort: number;
  status: number;
  remark: string | null;
  user_count: number;
}

const list = useListPage<PostRow>(query => listPosts<PostRow>(query), { keyword: '' });

/**
 * 岗位阶梯：异步加载
 *
 * 连带 Canvas 舞台与 gsap（约 70KB），岗位页首屏是表格 —— 不该为
 * 「可能不点的一档视图」付这个体积。
 */
const PostLadder = defineAsyncComponent(() => import('@/components/business/PostLadder.vue'));

/** 视图档位：表格 / 阶梯 */
const altView = ref<'table' | 'ladder'>('table');

/** 阶梯输入：行 → 阶梯需要的字段名 */
const ladderPosts = computed(() =>
  list.rows.value.map(row => ({
    id: row.id,
    postName: row.post_name,
    postCode: row.post_code,
    sort: row.sort,
    status: row.status,
    userCount: row.user_count
  }))
);

const dialogOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({ postCode: '', postName: '', sort: 0, status: 1, remark: '' });
const toast = ref('');

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 打开新建 */
function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { postCode: '', postName: '', sort: 0, status: 1, remark: '' });
  dialogOpen.value = true;
}

/**
 * 打开编辑（阶梯回调：用 id 找回原始行）
 *
 * @param post 阶梯节点数据
 */
function editFromLadder(post: { id: number }): void {
  const row = list.rows.value.find(r => r.id === post.id);
  if (row) openEdit(row);
}

/**
 * 打开编辑
 *
 * @param row 岗位行
 */
function openEdit(row: PostRow): void {
  editingId.value = row.id;
  Object.assign(form, {
    postCode: row.post_code,
    postName: row.post_name,
    sort: row.sort,
    status: row.status,
    remark: row.remark || ''
  });
  dialogOpen.value = true;
}

/** 保存 */
async function submit(): Promise<void> {
  if (!form.postCode.trim() || !form.postName.trim()) {
    notify('编码与名称都要填');
    return;
  }
  try {
    if (editingId.value) {
      await updatePost(editingId.value, { ...form });
      notify('已保存');
    } else {
      await createPost({ ...form });
      notify('已创建');
    }
    dialogOpen.value = false;
    await list.load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  }
}

/**
 * 删除岗位
 *
 * @param row 岗位行
 */
async function remove(row: PostRow): Promise<void> {
  if (!window.confirm(`确认删除岗位「${row.post_name}」？`)) return;
  try {
    await removePost(row.id);
    notify('已删除');
    await list.load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(list.load);
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
          v-if="auth.hasPermission('admin:post:create')"
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
                  v-if="auth.hasPermission('admin:post:update')"
                  class="btn btn--ghost btn--sm"
                  type="button"
                  @click="openEdit(row)"
                >
                  <Pencil :size="14" /> 编辑
                </button>
                <button
                  v-if="auth.hasPermission('admin:post:delete')"
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
          <div v-if="auth.hasPermission('admin:post:update') || auth.hasPermission('admin:post:delete')" class="mcard__acts">
            <button
              v-if="auth.hasPermission('admin:post:update')"
              class="btn btn--sm"
              type="button"
              @click="openEdit(row)"
            >
              <Pencil :size="13" /> 编辑
            </button>
            <button
              v-if="auth.hasPermission('admin:post:delete')"
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
      <PostLadder :posts="ladderPosts" :loading="list.loading.value" @edit="editFromLadder" />
    </section>

    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal">
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

    <div v-if="toast" class="toast">{{ toast }}</div>
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
