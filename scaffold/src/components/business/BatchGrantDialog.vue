<script setup lang="ts">
/**
 * 批量授权（弹窗）
 *
 * 对**选中的多个用户**追加或移除同一组角色。
 *
 * 🔴 刻意只提供「追加 / 移除」，不提供「覆盖」：覆盖式批量一次误操作就能把
 *    一批人原有角色全冲掉，而授权流水只能事后解释、无法恢复。需要覆盖时逐个编辑。
 *
 * 角色列表走 `<RolePicker>`：与用户编辑同一个组件、同一套分组与越权置灰规则 ——
 * 批量入口最容易变成"绕过限制"的后门，两处必须长得一样、选得一样。
 *
 * 后端会先整体预检（例如批量移除会摘掉操作人自己的全部管理权限 → 直接中止，
 * 一个用户都不改），所以这里的失败提示是"什么都没做"而非"部分成功"。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, ref } from 'vue';
import { batchGrantRoles } from '@/api/system';
import RolePicker from '@/components/ui/RolePicker.vue';
import type { RoleOption } from '@/api/types';

const props = defineProps<{
  /** 选中的用户（只用 id + username） */
  users: Array<{ id: number; username: string }>;
  /** 可选角色（含 app_label / manageable） */
  roles: RoleOption[];
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>();

const mode = ref<'add' | 'remove'>('add');
const picked = ref<number[]>([]);
const submitting = ref(false);
const errorMessage = ref('');

/** 已选角色数 */
const pickedCount = computed(() => picked.value.length);

/** 提交 */
async function submit(): Promise<void> {
  if (picked.value.length === 0) {
    errorMessage.value = '请至少选择一个角色';
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    await batchGrantRoles({
      userIds: props.users.map(u => u.id),
      roleIds: picked.value,
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

        <div class="batch-scroll">
          <RolePicker v-model="picked" :roles="roles" />
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
  width: min(680px, 100%);
}

.batch-note {
  margin: 0;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
}

/* 角色多时只让这一块滚动，弹窗本身不跟着长 */
.batch-scroll {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 2px;
}

.batch-summary {
  margin-right: auto;
  font-size: 12px;
  color: var(--mauth-text-faint);
}
</style>
