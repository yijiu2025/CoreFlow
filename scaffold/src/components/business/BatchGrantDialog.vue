<script setup lang="ts">
/**
 * 批量授权（弹窗）
 *
 * 对**选中的多个用户**追加或移除同一组角色。
 *
 * 🔴 刻意只提供「追加 / 移除」，不提供「覆盖」：覆盖式批量一次误操作就能把
 *    一批人原有角色全冲掉，而授权流水只能事后解释、无法恢复。需要覆盖时逐个编辑。
 *
 * 后端会先整体预检（例如批量移除会摘掉操作人自己的全部管理权限 → 直接中止，
 * 一个用户都不改），所以这里的失败提示是"什么都没做"而非"部分成功"。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, ref } from 'vue';
import { batchGrantRoles } from '@/api/system';

const props = defineProps<{
  /** 选中的用户（只用 id + username） */
  users: Array<{ id: number; username: string }>;
  /** 可选角色 */
  roles: Array<{ id: number; code: string; name: string; app_id: string; rank_level: number }>;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>();

const mode = ref<'add' | 'remove'>('add');
const picked = ref<Set<number>>(new Set());
const keyword = ref('');
const submitting = ref(false);
const errorMessage = ref('');

/** 按关键词过滤角色（名称 / 编码 / 应用） */
const visibleRoles = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const list = [...props.roles].sort((a, b) => b.rank_level - a.rank_level || a.id - b.id);
  if (!kw) return list;
  return list.filter(r => r.name.toLowerCase().includes(kw) || r.code.toLowerCase().includes(kw) || r.app_id.toLowerCase().includes(kw));
});

/** 已选角色数 */
const pickedCount = computed(() => picked.value.size);

/**
 * 勾选 / 取消
 *
 * @param id 角色 ID
 */
function toggle(id: number): void {
  const next = new Set(picked.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  picked.value = next;
}

/** 提交 */
async function submit(): Promise<void> {
  if (picked.value.size === 0) {
    errorMessage.value = '请至少选择一个角色';
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    await batchGrantRoles({
      userIds: props.users.map(u => u.id),
      roleIds: [...picked.value],
      mode: mode.value
    });
    emit('done');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '批量授权失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal batch-modal">
      <header class="modal__head">
        <span class="modal__title">批量授权 · 已选 {{ users.length }} 人</span>
      </header>

      <div class="modal__body">
        <p class="batch-note">
          <template v-if="mode === 'add'">给这些用户<strong>追加</strong>下列角色，原有角色保持不变。</template>
          <template v-else>从这些用户身上<strong>移除</strong>下列角色，其他角色不受影响。</template>
        </p>

        <div class="tabbar" role="tablist" aria-label="操作方式">
          <button type="button" role="tab" :aria-selected="mode === 'add'" :class="['tab', { 'is-on': mode === 'add' }]" @click="mode = 'add'">追加角色</button>
          <button type="button" role="tab" :aria-selected="mode === 'remove'" :class="['tab', { 'is-on': mode === 'remove' }]" @click="mode = 'remove'">移除角色</button>
        </div>

        <label class="field">
          <span class="field__label">筛选角色</span>
          <input v-model="keyword" class="input" placeholder="角色名 / 编码 / 应用" />
        </label>

        <div class="batch-roles">
          <label v-for="role in visibleRoles" :key="role.id" :class="['batch-role', { 'is-picked': picked.has(role.id) }]">
            <input type="checkbox" :checked="picked.has(role.id)" @change="toggle(role.id)" />
            <span class="batch-role__name">{{ role.name }}</span>
            <span class="batch-role__code mono">{{ role.code }}</span>
            <span v-if="role.app_id !== 'GLOBAL'" class="tag tag--info">{{ role.app_id }}</span>
          </label>
          <p v-if="visibleRoles.length === 0" class="batch-empty">没有匹配的角色</p>
        </div>

        <p v-if="errorMessage" class="field__error">{{ errorMessage }}</p>
      </div>

      <footer class="modal__foot">
        <span class="batch-summary mono">已选 {{ pickedCount }} 个角色</span>
        <button class="btn btn--ghost" type="button" @click="emit('close')">取消</button>
        <button class="btn btn--primary" type="button" :disabled="submitting || pickedCount === 0" @click="submit">
          {{ submitting ? '提交中…' : mode === 'add' ? '追加授权' : '移除授权' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.batch-modal {
  width: min(640px, 100%);
}

.batch-note {
  margin: 0;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
}

.batch-roles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
}

.batch-role {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--mauth-radius-xs);
  cursor: pointer;
}

.batch-role:hover {
  background: var(--mauth-hover);
}

.batch-role.is-picked {
  background: var(--mauth-primary-soft);
}

.batch-role input {
  flex: none;
  accent-color: var(--mauth-primary);
}

.batch-role__name {
  font-size: 13px;
}

.batch-role__code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.batch-empty {
  margin: 0;
  padding: 16px;
  text-align: center;
  font-size: 12.5px;
  color: var(--mauth-text-faint);
}

.batch-summary {
  margin-right: auto;
  font-size: 12px;
  color: var(--mauth-text-faint);
}
</style>
