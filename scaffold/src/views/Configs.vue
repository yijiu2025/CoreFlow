<script setup lang="ts">
/**
 * 参数管理
 *
 * 只维护**业务参数**（sys_config）。运行期配置（data/*.json）不在这里 ——
 * 那套配置由后端按「显式写的优先、不合法才回落默认」维护，搬进数据库会成为第二套真相。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { onMounted, reactive, ref } from 'vue';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import { createConfig, listConfigs, removeConfig, updateConfig } from '@/api/system';
import { useListPage } from '@/composables/useListPage';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

interface ConfigRow {
  id: number;
  config_key: string;
  config_value: string | null;
  type: string;
  builtin: number;
  remark: string | null;
}

const list = useListPage<ConfigRow>(query => listConfigs<ConfigRow>(query), { keyword: '', type: '' });
const dialogOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({ configKey: '', configValue: '', type: 'N', remark: '' });
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
  Object.assign(form, { configKey: '', configValue: '', type: 'N', remark: '' });
  dialogOpen.value = true;
}

/**
 * 打开编辑
 *
 * @param row 参数行
 */
function openEdit(row: ConfigRow): void {
  editingId.value = row.id;
  Object.assign(form, {
    configKey: row.config_key,
    configValue: row.config_value || '',
    type: row.type,
    remark: row.remark || ''
  });
  dialogOpen.value = true;
}

/** 保存 */
async function submit(): Promise<void> {
  if (!form.configKey.trim()) {
    notify('请填写参数键');
    return;
  }
  try {
    if (editingId.value) {
      await updateConfig(editingId.value, { configValue: form.configValue, remark: form.remark });
      notify('已保存');
    } else {
      await createConfig({ ...form });
      notify('已创建');
    }
    dialogOpen.value = false;
    await list.load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  }
}

/**
 * 删除（内置项后端会拒绝）
 *
 * @param row 参数行
 */
async function remove(row: ConfigRow): Promise<void> {
  if (!window.confirm(`确认删除参数「${row.config_key}」？`)) return;
  try {
    await removeConfig(row.id);
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
      <h2 class="page__title">参数管理</h2>
      <span class="page__sub">共 {{ list.total.value }} 项 · 仅业务参数，运行期配置在 data/*.json</span>
    </div>

    <div class="toolbar">
      <input v-model="list.query.keyword" class="input" style="width: 220px" placeholder="键 / 备注" @keyup.enter="list.search" />
      <select v-model="list.query.type" class="select" style="width: 140px" @change="list.search">
        <option value="">全部类型</option>
        <option value="Y">内置（Y）</option>
        <option value="N">业务（N）</option>
      </select>
      <button class="btn btn--sm" type="button" @click="list.search">查询</button>
      <button class="btn btn--ghost btn--sm" type="button" :disabled="list.loading.value" @click="list.load">
        <RefreshCw :size="15" /> 刷新
      </button>
      <span class="toolbar__spacer"></span>
      <button v-if="auth.hasPermission('admin:config:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate">
        <Plus :size="15" /> 新建参数
      </button>
    </div>

    <p v-if="list.errorMessage.value" class="tag tag--off">{{ list.errorMessage.value }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>参数键</th>
              <th>值</th>
              <th>类型</th>
              <th>备注</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in list.rows.value" :key="row.id">
              <td class="mono">
                {{ row.config_key }}
                <span v-if="row.builtin === 1" class="tag tag--info" style="margin-left: 6px">内置</span>
              </td>
              <td class="mono">{{ row.config_value || '—' }}</td>
              <td>{{ row.type }}</td>
              <td>{{ row.remark || '—' }}</td>
              <td class="col-actions">
                <button v-if="auth.hasPermission('admin:config:update')" class="btn btn--ghost btn--sm" type="button" @click="openEdit(row)">
                  <Pencil :size="14" /> 编辑
                </button>
                <button
                  v-if="row.builtin !== 1 && auth.hasPermission('admin:config:delete')"
                  class="btn btn--danger btn--sm"
                  type="button"
                  @click="remove(row)"
                >
                  <Trash2 :size="14" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="!list.loading.value && list.rows.value.length === 0">
              <td colspan="5"><div class="empty">暂无参数</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="mono">第 {{ list.query.pageNum }} / {{ list.pageCount.value }} 页</span>
        <button class="btn btn--sm" type="button" :disabled="list.query.pageNum <= 1" @click="list.turnPage(-1)">上一页</button>
        <button class="btn btn--sm" type="button" :disabled="list.query.pageNum >= list.pageCount.value" @click="list.turnPage(1)">
          下一页
        </button>
      </div>
    </section>

    <div v-if="dialogOpen" class="modal-mask" @click.self="dialogOpen = false">
      <div class="modal" style="width: min(520px, 100%)">
        <header class="modal__head"><span class="modal__title">{{ editingId ? '编辑参数' : '新建参数' }}</span></header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">参数键</span>
            <input v-model="form.configKey" class="input" maxlength="100" :disabled="!!editingId" placeholder="mail.from" />
          </label>
          <label class="field">
            <span class="field__label">参数值</span>
            <input v-model="form.configValue" class="input" maxlength="4000" />
          </label>
          <label v-if="!editingId" class="field">
            <span class="field__label">类型（Y 内置 / N 业务）</span>
            <select v-model="form.type" class="select">
              <option value="N">业务（N）</option>
              <option value="Y">内置（Y）</option>
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
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 12px;
}
</style>
