<script setup lang="ts">
/**
 * 批量导入用户（CSV）
 *
 * 流程：下载模板 → 选文件 → 本地解析并逐行校验 → 提交 → 展示逐行结果。
 *
 * 🔴 CSV 在**浏览器**解析，后端只收结构化行：后端不该关心引号转义/BOM/CRLF 这些
 *    表格软件的脾气；同时解析放在这里，用户能在提交前就看到哪一行有问题。
 *
 * 🔴 部门与角色按**名称**导入，不要求填 id —— 没人能凭记忆写出角色主键。
 *    名称到 id 的映射在后端做（一次读全表，不逐行查库）；映射不到即该行失败，
 *    不做"猜一个最近似的"。
 *
 * 单行失败不影响其他行：导入 200 条里有 3 条邮箱重复，剩下 197 条应当落库。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed, ref, watch } from 'vue';
import { CircleAlert, Download, FileUp, Upload, X } from 'lucide-vue-next';
import { importUsers } from '@/api/system';
import type { UserImportResult, UserImportRow } from '@/api/system';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', created: number): void }>();

/** 可导入的列 */
type ColumnKey = 'username' | 'email' | 'password' | 'dept' | 'roles';

/** 解析后的一行 */
interface ParsedRow {
  line: number;
  username: string;
  email: string;
  password: string;
  dept: string;
  roles: string[];
  /** 行级错误（结构/必填/格式）；非空则该行不可提交 */
  errors: string[];
}

/** 默认列序（无表头时按这个顺序读） */
const DEFAULT_ORDER: ColumnKey[] = ['username', 'email', 'password', 'dept', 'roles'];

/** 表头别名 → 列键（中英文都认，容忍"用户名/帐号"这类写法） */
const HEADER_ALIASES: Record<string, ColumnKey> = {
  账号: 'username',
  帐号: 'username',
  用户名: 'username',
  username: 'username',
  邮箱: 'email',
  邮件: 'email',
  email: 'email',
  初始密码: 'password',
  密码: 'password',
  password: 'password',
  部门: 'dept',
  dept: 'dept',
  department: 'dept',
  角色: 'roles',
  roles: 'roles',
  role: 'roles'
};

const parsing = ref(false);
const submitting = ref(false);
const rows = ref<ParsedRow[]>([]);
const fileName = ref('');
const parseError = ref('');
const result = ref<UserImportResult | null>(null);
const submitError = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

/** 有效行（无结构错误） */
const validRows = computed(() => rows.value.filter(row => row.errors.length === 0));
/** 有问题的行数 */
const invalidCount = computed(() => rows.value.length - validRows.value.length);

/** 能否提交：有有效行，且没有结构错误（有错先改文件，避免"部分导入"说不清） */
const canSubmit = computed(
  () => !submitting.value && validRows.value.length > 0 && invalidCount.value === 0
);

/** 关闭时重置，下一次打开是干净状态 */
watch(
  () => props.open,
  open => {
    if (open) return;
    rows.value = [];
    fileName.value = '';
    parseError.value = '';
    submitError.value = '';
    result.value = null;
    parsing.value = false;
  }
);

/**
 * 解析 CSV 文本（支持引号包裹、双引号转义、CRLF、BOM）
 *
 * @param text 文件内容
 * @returns 二维单元格
 */
function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

/**
 * 判断某行是否是表头
 *
 * @param cells 首行单元格
 * @returns 是否识别为表头
 */
function looksLikeHeader(cells: string[]): boolean {
  return cells.some(cell => HEADER_ALIASES[String(cell).trim().toLowerCase()] !== undefined);
}

/**
 * 按表头生成列序
 *
 * @param header 表头单元格
 * @returns 列键数组
 */
function orderFromHeader(header: string[]): ColumnKey[] {
  return header.map(cell => HEADER_ALIASES[String(cell).trim().toLowerCase()] ?? 'username');
}

/**
 * 基础校验（只做本地能判的；部门/角色是否存在交给后端）
 *
 * @param row 行数据
 * @returns 错误列表
 */
function validate(row: Omit<ParsedRow, 'errors'>): string[] {
  const errors: string[] = [];
  if (!row.username) errors.push('账号为空');
  else if (row.username.length > 50) errors.push('账号超过 50 字');
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('邮箱格式不对');
  if (!row.password) errors.push('密码为空');
  else if (row.password.length < 8) errors.push('密码不足 8 位');
  return errors;
}

/**
 * 解析文件内容
 *
 * @param text CSV 文本
 * @param name 文件名（仅用于展示）
 */
function loadText(text: string, name: string): void {
  parseError.value = '';
  result.value = null;
  const table = parseCsv(text).filter(cells => cells.some(cell => String(cell).trim() !== ''));
  if (table.length === 0) {
    parseError.value = '文件是空的';
    rows.value = [];
    return;
  }

  const hasHeader = looksLikeHeader(table[0]);
  const order = hasHeader ? orderFromHeader(table[0]) : DEFAULT_ORDER;
  const body = hasHeader ? table.slice(1) : table;

  const parsed: ParsedRow[] = [];
  body.forEach((cells, index) => {
    // 以 # 开头的是说明/示例行，不参与导入
    if (String(cells[0] || '').trim().startsWith('#')) return;
    const get = (key: ColumnKey): string => {
      const pos = order.indexOf(key);
      return pos >= 0 ? String(cells[pos] ?? '').trim() : '';
    };
    const base = {
      line: index + (hasHeader ? 2 : 1),
      username: get('username'),
      email: get('email'),
      password: get('password'),
      dept: get('dept'),
      roles: get('roles')
        .split(/[|、;；]/)
        .map(item => item.trim())
        .filter(Boolean)
    };
    parsed.push({ ...base, errors: validate(base) });
  });

  rows.value = parsed;
  fileName.value = name;
  if (parsed.length === 0) parseError.value = '没有可导入的数据行';
  else if (parsed.length > 500) parseError.value = `一次最多 500 行，当前 ${parsed.length} 行，请拆分后再导入`;
}

/**
 * 选文件
 *
 * @param event 文件选择事件
 */
async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  parsing.value = true;
  try {
    loadText(await file.text(), file.name);
  } catch {
    parseError.value = '读取文件失败，确认是 UTF-8 编码的 CSV';
  } finally {
    parsing.value = false;
  }
}

/** 下载模板（带一条以 # 开头的示例，导入时会被跳过） */
function downloadTemplate(): void {
  const lines = [
    '账号,邮箱,初始密码,部门,角色',
    '# 说明：账号与初始密码必填（密码至少 8 位）；部门与角色写名称，多个角色用 | 分隔；以 # 开头的行会被忽略',
    '#zhangsan,zhangsan@example.com,Passw0rd!,技术部,普通用户'
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '用户导入模板.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/** 提交导入 */
async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  submitError.value = '';
  try {
    const payload: UserImportRow[] = validRows.value.map(row => ({
      username: row.username,
      email: row.email || undefined,
      password: row.password,
      dept: row.dept || undefined,
      roles: row.roles
    }));
    result.value = await importUsers(payload);
    emit('done', result.value.created);
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : '导入失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="modal-mask" v-mask-close="() => emit('close')">
    <div class="modal import-modal">
      <header class="modal__head">
        <span class="modal__title">批量导入用户</span>
        <span v-if="fileName" class="mono import-file">{{ fileName }}</span>
        <button class="modal__close" type="button" aria-label="关闭" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div class="modal__body">
        <!-- 结果页：导入完只看结果，不再显示表单 -->
        <template v-if="result">
          <div class="import-summary">
            <span class="tag tag--ok">成功 {{ result.created }} 条</span>
            <span :class="['tag', result.failed.length ? 'tag--warn' : 'tag--off']">
              失败 {{ result.failed.length }} 条
            </span>
          </div>
          <div v-if="result.failed.length" class="import-failed">
            <p class="form-hint">以下行未导入，按原因修正后可重新选择文件导入（已成功的不会重复创建）。</p>
            <ul class="failed-list">
              <li v-for="item in result.failed" :key="item.line" class="failed-item">
                <span class="mono failed-item__line">第 {{ item.line }} 行</span>
                <span class="failed-item__name">{{ item.username || '（无账号）' }}</span>
                <span class="failed-item__reason">{{ item.reason }}</span>
              </li>
            </ul>
          </div>
          <p v-else class="form-hint">全部导入成功。</p>
        </template>

        <template v-else>
          <p class="form-hint">
            支持 UTF-8 编码的 CSV。列顺序：账号、邮箱、初始密码、部门、角色；有表头时按表头名称识别。
            部门与角色写名称即可，多个角色用 <code class="mono">|</code> 分隔。
          </p>

          <div class="import-actions">
            <button class="btn btn--ghost btn--sm" type="button" @click="downloadTemplate">
              <Download :size="14" /> 下载模板
            </button>
            <button class="btn btn--sm" type="button" :disabled="parsing" @click="fileInput?.click()">
              <FileUp :size="14" /> {{ parsing ? '读取中…' : '选择 CSV 文件' }}
            </button>
            <input
              ref="fileInput"
              type="file"
              accept=".csv,text/csv"
              class="import-input"
              @change="onPick"
            />
          </div>

          <p v-if="parseError" class="field__error">{{ parseError }}</p>

          <template v-if="rows.length">
            <div class="import-stats">
              <span>共 {{ rows.length }} 行</span>
              <span class="tag tag--ok">可导入 {{ validRows.length }}</span>
              <span v-if="invalidCount" class="tag tag--warn">有问题 {{ invalidCount }}</span>
            </div>

            <div class="import-preview">
              <table class="table">
                <thead>
                  <tr>
                    <th class="col-line">行</th>
                    <th>账号</th>
                    <th>邮箱</th>
                    <th>部门</th>
                    <th>角色</th>
                    <th>校验</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in rows.slice(0, 50)" :key="row.line">
                    <td class="mono col-line">{{ row.line }}</td>
                    <td>{{ row.username || '—' }}</td>
                    <td class="mono">{{ row.email || '—' }}</td>
                    <td>{{ row.dept || '—' }}</td>
                    <td>{{ row.roles.length ? row.roles.join(' / ') : '—' }}</td>
                    <td>
                      <span v-if="row.errors.length" class="import-bad">
                        <CircleAlert :size="13" /> {{ row.errors.join('；') }}
                      </span>
                      <span v-else class="tag tag--ok">可导入</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="rows.length > 50" class="form-hint">只预览前 50 行，提交时会导入全部 {{ rows.length }} 行。</p>
            </div>
          </template>

          <p v-if="submitError" class="field__error">{{ submitError }}</p>
        </template>
      </div>

      <footer class="modal__foot">
        <template v-if="result">
          <button class="btn btn--ghost" type="button" @click="rows = []; result = null; fileName = ''">
            再导入一批
          </button>
          <button class="btn btn--primary" type="button" @click="emit('close')">完成</button>
        </template>
        <template v-else>
          <button class="btn btn--ghost" type="button" @click="emit('close')">取消</button>
          <button class="btn btn--primary" type="button" :disabled="!canSubmit" @click="submit">
            <Upload :size="14" /> {{ submitting ? '导入中…' : `导入 ${validRows.length} 条` }}
          </button>
        </template>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.import-modal {
  width: min(880px, 100%);
}

.modal__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  cursor: pointer;
}

.modal__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.import-file {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.import-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 原生 file 控件太丑，用按钮触发；保留在 DOM 里才能被 click() */
.import-input {
  display: none;
}

.import-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mauth-text-soft);
}

.import-preview {
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
}

.import-preview .table {
  margin: 0;
}

.col-line {
  width: 56px;
}

.import-bad {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--mauth-danger);
  font-size: 11.5px;
}

.import-summary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.failed-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow: auto;
}

.failed-item {
  display: grid;
  grid-template-columns: 72px 140px minmax(0, 1fr);
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
  font-size: 12px;
}

.failed-item__line {
  color: var(--mauth-text-faint);
  font-size: 11px;
}

.failed-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.failed-item__reason {
  color: var(--mauth-danger);
}
</style>
