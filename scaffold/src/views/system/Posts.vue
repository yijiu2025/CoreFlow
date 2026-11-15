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
import { createPost, listPosts, removePost, updatePost } from '@/api/system';
import { useListPage } from '@/composables/useListPage';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';
import { ThemeView } from 'skinsuite/vue';
import type { PostRow, PostsViewContext } from '@/theme/views/posts';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';

const auth = useAuthStore();

/**
 * 当前渲染设备
 *
 * 只决定"这张列表怎么画"：桌面走表格，手机走紧凑卡片（标题 + 在岗 + 一行操作）。
 * 岗位只有 4 个字段，卡片装得下 —— 不需要再开一层详情页。
 */
const device = useRenderDevice();

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
/* 全局轻提示：样式 / 时长 / 悬停暂停都在 stores/toast.ts 一处 */
const toastStore = useToastStore();
const confirmStore = useConfirmStore();

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toastStore.push(message);
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
  const ok = await confirmStore.ask({
    title: '删除岗位',
    message: `确认删除岗位「${row.post_name}」？有在岗成员时后端会拒绝。`,
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;
  try {
    await removePost(row.id);
    notify('已删除');
    await list.load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(list.load);

/**
 * 版式上下文
 *
 * 全部字段都是"容器算好的结论"：权限在这里判一次（`can*`），版式不再碰 store；
 * 弹窗与表单状态留在这里，版式只是把它画出来。
 */
const ctx: PostsViewContext = {
  list,
  altView,
  device,
  ladderPosts,
  ladder: PostLadder,
  canCreate: auth.hasPermission('admin:post:create'),
  canUpdate: auth.hasPermission('admin:post:update'),
  canDelete: auth.hasPermission('admin:post:delete'),
  dialogOpen,
  editingId,
  form,
  openCreate,
  openEdit,
  editFromLadder,
  submit,
  remove
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/posts/`），容器只准备 ctx -->
  <ThemeView page="posts" :device="device" :ctx="ctx" scope="inherit" />
</template>
