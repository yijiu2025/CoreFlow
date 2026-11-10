<script setup lang="ts">
/**
 * 菜单管理（表格 + 树形缩进）
 *
 * 菜单决定侧栏可见性；`permission` 是按钮权限码，后端接口放行仍看 PBAC policy。
 * 删除有子菜单或仍被角色引用时会被后端拒绝（前端只展示原因）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import { createMenu, menuTree, removeMenu, updateMenu } from '@/api/system';
import type { MenuNode } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

/**
 * 导航星系：异步加载
 *
 * 它连带 Canvas 舞台与 gsap（约 70KB），而菜单页首屏是表格 —— 不该为
 * 「可能不点的一档视图」付这个体积。
 */
const MenuStarMap = defineAsyncComponent(() => import('@/components/business/MenuStarMap.vue'));

/** 视图档位：表格 / 导航星系 */
const altView = ref<'table' | 'star'>('table');

const trees = ref<MenuNode[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');

const dialogOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  parentId: 0,
  name: '',
  type: 'menu',
  icon: 'Circle',
  path: '',
  component: '',
  permission: '',
  sort: 0,
  visible: 1,
  status: 1
});

/** 扁平化（缩进展示） */
const flat = computed(() => {
  const out: Array<{ node: MenuNode; depth: number }> = [];
  const walk = (nodes: MenuNode[], depth: number): void => {
    for (const node of nodes) {
      out.push({ node, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(trees.value, 0);
  return out;
});

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 加载菜单树 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    trees.value = await menuTree();
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 打开新建表单
 *
 * @param parent 上级菜单（从星图进入时带上，未传则为根）
 */
function openCreate(parent?: MenuNode): void {
  editingId.value = null;
  Object.assign(form, {
    parentId: parent?.id ?? 0,
    name: '',
    type: 'menu',
    icon: 'Circle',
    path: '',
    component: '',
    permission: '',
    sort: 0,
    visible: 1,
    status: 1
  });
  dialogOpen.value = true;
}

/**
 * 打开编辑表单
 *
 * @param node 菜单节点
 */
function openEdit(node: MenuNode): void {
  editingId.value = node.id;
  Object.assign(form, {
    parentId: node.parent_id,
    name: node.name,
    type: node.type,
    icon: node.icon || 'Circle',
    path: node.path || '',
    component: node.component || '',
    permission: node.permission || '',
    sort: node.sort,
    visible: node.visible,
    status: node.status
  });
  dialogOpen.value = true;
}

/** 保存 */
async function submit(): Promise<void> {
  if (!form.name.trim()) {
    notify('请填写菜单名称');
    return;
  }
  try {
    const payload = { ...form };
    if (editingId.value) {
      await updateMenu(editingId.value, payload);
      notify('已保存');
    } else {
      await createMenu(payload);
      notify('已创建');
    }
    dialogOpen.value = false;
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  }
}

/**
 * 删除菜单
 *
 * @param node 菜单节点
 */
async function remove(node: MenuNode): Promise<void> {
  if (!window.confirm(`确认删除菜单「${node.name}」？`)) return;
  try {
    await removeMenu(node.id);
    notify('已删除');
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">菜单管理</h2>
      <span class="page__sub">共 {{ flat.length }} 项 · 决定侧栏可见性</span>
    </div>

    <div class="tabbar" role="tablist" aria-label="视图">
      <button type="button" role="tab" :aria-selected="altView === 'table'" :class="['tab', { 'is-on': altView === 'table' }]" @click="altView = 'table'">列表</button>
      <button type="button" role="tab" :aria-selected="altView === 'star'" :class="['tab', { 'is-on': altView === 'star' }]" @click="altView = 'star'">导航星系</button>
    </div>

    <div v-show="altView === 'table'" class="toolbar">
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
      <span class="toolbar__spacer"></span>
      <button v-if="auth.hasPermission('admin:menu:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate()">
        <Plus :size="15" /> 新建菜单
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>路由</th>
              <th>权限码</th>
              <th>排序</th>
              <th>可见</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in flat" :key="item.node.id">
              <td :style="{ paddingLeft: `${16 + item.depth * 18}px` }">{{ item.node.name }}</td>
              <td>
                <span class="tag tag--info">
                  {{ item.node.type === 'dir' ? '目录' : item.node.type === 'btn' ? '按钮' : '页面' }}
                </span>
              </td>
              <td class="mono">{{ item.node.path || '—' }}</td>
              <td class="mono">{{ item.node.permission || '—' }}</td>
              <td class="mono">{{ item.node.sort }}</td>
              <td>{{ item.node.visible === 1 ? '是' : '否' }}</td>
              <td class="col-actions">
                <button v-if="auth.hasPermission('admin:menu:update')" class="btn btn--ghost btn--sm" type="button" @click="openEdit(item.node)">
                  <Pencil :size="14" /> 编辑
                </button>
                <button v-if="auth.hasPermission('admin:menu:delete')" class="btn btn--danger btn--sm" type="button" @click="remove(item.node)">
                  <Trash2 :size="14" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="!loading && flat.length === 0">
              <td colspan="7"><div class="empty">暂无菜单</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 导航星系：目录 / 页面 / 按钮的三层星图（复用同一份菜单树） -->
    <section v-if="altView === 'star'">
      <MenuStarMap :tree="trees" @edit="openEdit" @create="openCreate" />
    </section>

    <div v-if="dialogOpen" class="modal-mask" @click.self="dialogOpen = false">
      <div class="modal">
        <header class="modal__head"><span class="modal__title">{{ editingId ? '编辑菜单' : '新建菜单' }}</span></header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">上级菜单 ID（0 为根）</span>
            <input v-model.number="form.parentId" class="input" type="number" min="0" />
          </label>
          <label class="field">
            <span class="field__label">名称</span>
            <input v-model="form.name" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">类型</span>
            <select v-model="form.type" class="select">
              <option value="dir">目录</option>
              <option value="menu">页面</option>
              <option value="btn">按钮</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">图标名（lucide）</span>
            <input v-model="form.icon" class="input" maxlength="64" />
          </label>
          <label class="field">
            <span class="field__label">路由</span>
            <input v-model="form.path" class="input" maxlength="200" />
          </label>
          <label class="field">
            <span class="field__label">视图键</span>
            <input v-model="form.component" class="input" maxlength="200" />
          </label>
          <label class="field">
            <span class="field__label">权限码（按钮必填）</span>
            <input v-model="form.permission" class="input" maxlength="100" placeholder="admin:user:read" />
          </label>
          <label class="field">
            <span class="field__label">排序</span>
            <input v-model.number="form.sort" class="input" type="number" min="0" />
          </label>
          <label class="field">
            <span class="field__label">侧栏可见</span>
            <select v-model.number="form.visible" class="select">
              <option :value="1">可见</option>
              <option :value="0">隐藏</option>
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

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
