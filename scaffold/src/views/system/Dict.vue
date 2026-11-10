<script setup lang="ts">
/**
 * 字典管理（左类型 / 右字典项）
 *
 * 同一类型下只允许一个默认项：设新默认时后端会自动清掉旧默认。
 * 业务下拉走 `/dict/options/:type`（只返回启用项），不请求管理接口。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { onMounted, reactive, ref } from 'vue';
import { Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import {
  createDictData,
  createDictType,
  listDictData,
  listDictTypes,
  removeDictData,
  removeDictType,
  updateDictType
} from '@/api/system';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

interface DictTypeRow {
  id: number;
  dict_name: string;
  dict_type: string;
  status: number;
  remark: string | null;
  item_count: number;
}

interface DictItem {
  id: number;
  dict_type: string;
  label: string;
  value: string;
  sort: number;
  status: number;
  tone: string | null;
  is_default: number;
}

const types = ref<DictTypeRow[]>([]);
const items = ref<DictItem[]>([]);
const activeType = ref<DictTypeRow | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');

const typeDialog = ref(false);
const typeForm = reactive({ dictName: '', dictType: '', status: 1, remark: '' });

const itemDialog = ref(false);
const itemForm = reactive({ label: '', value: '', sort: 0, status: 1, tone: '', isDefault: 0 });

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 加载类型列表 */
async function loadTypes(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listDictTypes<DictTypeRow>({ pageNum: 1, pageSize: 200 });
    types.value = result.rows;
    if (!activeType.value && types.value.length > 0) await selectType(types.value[0]);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 选中类型并加载其字典项
 *
 * @param row 类型行
 */
async function selectType(row: DictTypeRow): Promise<void> {
  activeType.value = row;
  try {
    items.value = (await listDictData(row.dict_type)) as unknown as DictItem[];
  } catch (err) {
    notify(err instanceof Error ? err.message : '字典项加载失败');
  }
}

/** 打开新建类型 */
function openTypeDialog(): void {
  Object.assign(typeForm, { dictName: '', dictType: '', status: 1, remark: '' });
  typeDialog.value = true;
}

/** 保存类型 */
async function submitType(): Promise<void> {
  if (!typeForm.dictName.trim() || !typeForm.dictType.trim()) {
    notify('名称与标识都要填');
    return;
  }
  try {
    await createDictType({ ...typeForm });
    typeDialog.value = false;
    notify('已创建');
    await loadTypes();
  } catch (err) {
    notify(err instanceof Error ? err.message : '创建失败');
  }
}

/**
 * 切换类型启用状态
 *
 * @param row 类型行
 */
async function toggleType(row: DictTypeRow): Promise<void> {
  try {
    await updateDictType(row.id, { status: row.status === 1 ? 0 : 1 });
    row.status = row.status === 1 ? 0 : 1;
    notify('已更新');
  } catch (err) {
    notify(err instanceof Error ? err.message : '更新失败');
  }
}

/**
 * 删除类型
 *
 * @param row 类型行
 */
async function removeType(row: DictTypeRow): Promise<void> {
  if (!window.confirm(`删除字典「${row.dict_name}」及其全部字典项？`)) return;
  try {
    await removeDictType(row.id);
    if (activeType.value?.id === row.id) {
      activeType.value = null;
      items.value = [];
    }
    notify('已删除');
    await loadTypes();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

/** 打开新建字典项 */
function openItemDialog(): void {
  Object.assign(itemForm, { label: '', value: '', sort: 0, status: 1, tone: '', isDefault: 0 });
  itemDialog.value = true;
}

/** 保存字典项 */
async function submitItem(): Promise<void> {
  if (!activeType.value) return;
  if (!itemForm.label.trim() || !itemForm.value.trim()) {
    notify('标签与值都要填');
    return;
  }
  try {
    await createDictData({ dictType: activeType.value.dict_type, ...itemForm, tone: itemForm.tone || null });
    itemDialog.value = false;
    notify('已创建');
    await selectType(activeType.value);
    await loadTypes();
  } catch (err) {
    notify(err instanceof Error ? err.message : '创建失败');
  }
}

/**
 * 删除字典项
 *
 * @param item 字典项
 */
async function removeItem(item: DictItem): Promise<void> {
  if (!window.confirm(`删除字典项「${item.label}」？`)) return;
  try {
    await removeDictData(item.id);
    notify('已删除');
    if (activeType.value) await selectType(activeType.value);
    await loadTypes();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(loadTypes);
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">字典管理</h2>
      <span class="page__sub">共 {{ types.length }} 个类型</span>
    </div>

    <div class="toolbar">
      <button class="btn btn--sm" type="button" :disabled="loading" @click="loadTypes"><RefreshCw :size="15" /> 刷新</button>
      <span class="toolbar__spacer"></span>
      <button v-if="auth.hasPermission('admin:dict:create')" class="btn btn--primary btn--sm" type="button" @click="openTypeDialog">
        <Plus :size="15" /> 新建类型
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <div class="dict-grid">
      <section class="panel">
        <header class="panel__head"><span class="panel__title">类型</span></header>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>名称</th>
                <th>标识</th>
                <th>项数</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in types"
                :key="row.id"
                :style="activeType?.id === row.id ? { background: 'var(--mauth-primary-soft)' } : undefined"
                @click="selectType(row)"
              >
                <td>{{ row.dict_name }}</td>
                <td class="mono">{{ row.dict_type }}</td>
                <td class="mono">{{ row.item_count }}</td>
                <td class="col-actions">
                  <button class="btn btn--ghost btn--sm" type="button" @click.stop="toggleType(row)">
                    {{ row.status === 1 ? '停用' : '启用' }}
                  </button>
                  <button
                    v-if="auth.hasPermission('admin:dict:delete')"
                    class="btn btn--danger btn--sm"
                    type="button"
                    @click.stop="removeType(row)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
              <tr v-if="types.length === 0"><td colspan="4"><div class="empty">暂无字典类型</div></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">字典项 · {{ activeType?.dict_name || '未选择' }}</span>
          <span class="toolbar__spacer"></span>
          <button
            v-if="activeType && auth.hasPermission('admin:dict:create')"
            class="btn btn--sm"
            type="button"
            @click="openItemDialog"
          >
            <Plus :size="14" /> 新建项
          </button>
        </header>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>标签</th>
                <th>值</th>
                <th>默认</th>
                <th>状态</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>{{ item.label }}</td>
                <td class="mono">{{ item.value }}</td>
                <td>{{ item.is_default === 1 ? '是' : '—' }}</td>
                <td>
                  <span class="tag" :class="item.status === 1 ? 'tag--ok' : 'tag--off'">{{ item.status === 1 ? '启用' : '停用' }}</span>
                </td>
                <td class="col-actions">
                  <button
                    v-if="auth.hasPermission('admin:dict:delete')"
                    class="btn btn--danger btn--sm"
                    type="button"
                    @click="removeItem(item)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
              <tr v-if="items.length === 0"><td colspan="5"><div class="empty">该类型下暂无字典项</div></td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div v-if="typeDialog" class="modal-mask" @click.self="typeDialog = false">
      <div class="modal" style="width: min(460px, 100%)">
        <header class="modal__head"><span class="modal__title">新建字典类型</span></header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">名称</span>
            <input v-model="typeForm.dictName" class="input" maxlength="100" />
          </label>
          <label class="field">
            <span class="field__label">标识（业务代码引用，创建后不可改）</span>
            <input v-model="typeForm.dictType" class="input" maxlength="100" placeholder="user_status" />
          </label>
          <label class="field">
            <span class="field__label">备注</span>
            <input v-model="typeForm.remark" class="input" maxlength="255" />
          </label>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="typeDialog = false">取消</button>
          <button class="btn btn--primary" type="button" @click="submitType">保存</button>
        </footer>
      </div>
    </div>

    <div v-if="itemDialog" class="modal-mask" @click.self="itemDialog = false">
      <div class="modal" style="width: min(460px, 100%)">
        <header class="modal__head"><span class="modal__title">新建字典项</span></header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">标签</span>
            <input v-model="itemForm.label" class="input" maxlength="100" />
          </label>
          <label class="field">
            <span class="field__label">值</span>
            <input v-model="itemForm.value" class="input" maxlength="100" />
          </label>
          <label class="field">
            <span class="field__label">排序</span>
            <input v-model.number="itemForm.sort" class="input" type="number" min="0" />
          </label>
          <label class="field">
            <span class="field__label">色调用（cat-1 ~ cat-5）</span>
            <input v-model="itemForm.tone" class="input" maxlength="20" />
          </label>
          <label class="field">
            <span class="field__label">设为默认项</span>
            <select v-model.number="itemForm.isDefault" class="select">
              <option :value="0">否</option>
              <option :value="1">是</option>
            </select>
          </label>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="itemDialog = false">取消</button>
          <button class="btn btn--primary" type="button" @click="submitItem">保存</button>
        </footer>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.dict-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 14px;
}

@media (max-width: 980px) {
  .dict-grid {
    grid-template-columns: 1fr;
  }
}
</style>
