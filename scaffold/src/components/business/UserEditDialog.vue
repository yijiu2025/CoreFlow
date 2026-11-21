<script setup lang="ts">
/**
 * 用户编辑 / 新建弹窗
 *
 * 为什么单独成组件：这张表单有两个入口 —— **用户列表**（桌面表格行内按钮）
 * 与 **用户详情页**（手机端压栈页的操作区）。原先它长在 `Users.vue` 里，
 * 详情页要"编辑"就只能把整套表单连同权限例外、角色岗位选择器、差量提交逻辑
 * 再抄一遍；抄出来的第二份必然与第一份漂移（字段加了、校验改了、异常文案不同）。
 *
 * === 数据来源 ===
 * 只吃 `target`（`UserEditTarget`）：账号 / 邮箱 / 部门 / 状态 / 角色 ID / 岗位 ID。
 * **不复用 `UserRow` 也不复用 `UserProfile`** —— 两个页面各自把自己手上那份
 * 挤成这七项，组件不必知道"列表长什么样""详情里有什么"。
 *
 * 🔴 角色 / 岗位只认 ID：名字会重名、可改名、还可能带逗号（GROUP_CONCAT 分隔符），
 *    拿名字反查会静默选错，保存后把真实授权覆盖掉。
 *
 * === 权限例外（仅编辑） ===
 * 角色之外的单独允许 / 拒绝。提交是**差量**的：只有真正改过的码才发请求 ——
 * 后端没有事务批量接口，逐条 PUT 在 0~3 条的量级上足够。
 *
 * === 与列表 `options` 的关系 ===
 * 列表页把它已经拉过的 `userOptions()` 传进来（省一次请求，也保证判定口径一致）；
 * 详情页没有这份数据，传 `null` 让组件自拉。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed, reactive, ref, watch } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import { createUser, permissionCatalog, setUserPermission, updateUser, userOptions, userProfile } from '@/api/system';
import type { UserEditTarget, UserOptions } from '@/api/types';
import RolePicker from '@/components/ui/RolePicker.vue';
import PostPicker from '@/components/ui/PostPicker.vue';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  /** 是否打开（`v-if` 之外再留一层，便于做关闭动画与状态复位） */
  open: boolean;
  /** 编辑目标；`null` = 新建 */
  target: UserEditTarget | null;
  /** 列表页已拉好的选项（不传 = 组件自拉） */
  options?: UserOptions | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  /** 保存成功；参数是给用户看的提示语 */
  (e: 'saved', message: string): void;
}>();

/** 表单值（新建与编辑共用同一份，切换时整体覆盖） */
const form = reactive({
  username: '',
  email: '',
  password: '',
  deptId: null as number | null,
  status: 1,
  /** 人员职级（0-99） */
  rankLevel: 0,
  roleIds: [] as number[],
  postIds: [] as number[]
});

/** 是否编辑态（`target` 有 id） */
const isEdit = computed(() => props.target !== null);

const submitting = ref(false);
/** 就地错误（不弹 toast：表单里的错误要贴着表单看） */
const errorMessage = ref('');

/** 选项：外部给了就用外部的，否则自己拉一份 */
const options = ref<UserOptions>(props.options ?? { depts: [], roles: [], posts: [] });

const auth = useAuthStore();

/**
 * 是否在编辑**自己**的账号
 *
 * 自己的角色只能由职级更高的管理员调整（后端同一条判据）：这里把角色选择器换成只读，
 * 避免"选完点保存才 403"。资料 / 邮箱 / 部门 / 密码仍然可改。
 */
const isSelf = computed(() => !!props.target && Number(props.target.id) === Number(auth.me?.id));

/** 自己当前持有的角色名（只读展示用；ID 来自 target，名字只用于显示） */
const selfRoleNames = computed(() => {
  const byId = new Map(options.value.roles.map(role => [Number(role.id), role]));
  return (props.target?.roleIds ?? []).map(id => byId.get(Number(id))?.name || `#${id}`);
});
/**
 * 选项是否真的可用
 *
 * 🔴 判据是"三张表里有没有内容"，不是"props.options 是不是对象"：列表页传进来的
 *    永远是个对象（初始值就是空数组），按存在性判断会让组件**永不自己拉取** ——
 *    列表还在加载、或 `/users/options` 失败时，弹窗里角色与岗位就是空的，
 *    而"角色选择器为空"看起来像"这个人没角色"，是会被误认为数据正确的假象。
 */
const optionsReady = ref(
  Boolean(props.options && (props.options.roles.length || props.options.depts.length || props.options.posts.length))
);
/** 自拉请求是否在飞（防重复） */
let optionsLoading = false;

/**
 * 外部选项稍后才到（列表页 onMounted 里异步拉）
 *
 * 到了就接管，避免"弹窗已经用空选项渲染、列表才拉完"的时序问题。
 */
watch(
  () => props.options,
  next => {
    if (!next) return;
    if (next.roles.length || next.depts.length || next.posts.length) {
      options.value = next;
      optionsReady.value = true;
    }
  }
);

/**
 * 拉选项（父级没给或给的是空表时发生）
 *
 * 失败不阻断：部门 / 岗位下拉为空即可，编辑资料本身仍可保存。
 */
async function ensureOptions(): Promise<void> {
  if (optionsReady.value || optionsLoading) return;
  optionsLoading = true;
  try {
    const fresh = await userOptions();
    // 拉回来的仍是空表就别覆盖：保留外部那份（可能刚好在渲染间被填上）
    if (fresh.roles.length || fresh.depts.length || fresh.posts.length) {
      options.value = fresh;
      optionsReady.value = true;
    }
  } catch {
    /* 选项拉取失败不阻塞表单：对应下拉为空即可 */
  } finally {
    optionsLoading = false;
  }
}

/* ── 权限例外 ─────────────────────────────────────────────── */

interface PermissionException {
  code: string;
  effect: 'allow' | 'deny';
  /** 落库分区键：与权限码的 domain 一致（`admin:*` → `admin`） */
  appId: string;
  appLabel: string;
}

const formExceptions = ref<PermissionException[]>([]);
/** 打开时的快照（JSON），保存时用来算差量 */
const exceptionsBaseline = ref('[]');
const exceptionsLoading = ref(false);
const exceptionsError = ref('');
const excCode = ref('');
const excEffect = ref<'allow' | 'deny'>('allow');
/** 权限码目录（提供 domain，用来推出 appId） */
const excCatalog = ref<Array<{ domain: string; domainName: string; code: string; label: string }>>([]);

/**
 * 例外列表的快照
 *
 * 排序后再序列化：列表顺序会随增删变动，不排序会把"顺序变了"当成"改过了"，
 * 凭空多发几条请求。
 *
 * @param list 例外列表
 * @returns 快照字符串
 */
function snapshotExceptions(list: PermissionException[]): string {
  return JSON.stringify([...list].sort((a, b) => `${a.appId}|${a.code}`.localeCompare(`${b.appId}|${b.code}`)));
}

/**
 * 读取某用户的现有例外
 *
 * @param id 用户 ID
 * @returns 无
 */
async function loadExceptions(id: number): Promise<void> {
  exceptionsLoading.value = true;
  exceptionsError.value = '';
  try {
    const [profile, catalog] = await Promise.all([
      userProfile(id),
      excCatalog.value.length ? Promise.resolve(excCatalog.value) : permissionCatalog()
    ]);
    excCatalog.value = catalog;
    const list: PermissionException[] = [];
    for (const item of profile.inline ?? []) {
      item.allow.forEach(code => list.push({ code, effect: 'allow', appId: item.appId, appLabel: item.appLabel }));
      item.deny.forEach(code => list.push({ code, effect: 'deny', appId: item.appId, appLabel: item.appLabel }));
    }
    formExceptions.value = list;
    exceptionsBaseline.value = snapshotExceptions(list);
  } catch (err) {
    // 读不到不该挡住改资料：例外区降级成"不可读"，其他字段照常保存
    exceptionsError.value = err instanceof Error ? err.message : '权限例外读取失败';
    formExceptions.value = [];
    exceptionsBaseline.value = '[]';
  } finally {
    exceptionsLoading.value = false;
  }
}

/** 加一条例外（appId 从权限码的 domain 推出来） */
function addException(): void {
  const code = excCode.value.trim();
  if (!code) return;
  const hit = excCatalog.value.find(item => item.code === code);
  if (!hit) {
    exceptionsError.value = `「${code}」不在权限码目录里，请从候选中选择`;
    return;
  }
  if (formExceptions.value.some(e => e.code === code && e.appId === hit.domain)) {
    exceptionsError.value = `「${code}」已经在例外列表里`;
    return;
  }
  formExceptions.value.push({ code, effect: excEffect.value, appId: hit.domain, appLabel: hit.domainName });
  excCode.value = '';
  exceptionsError.value = '';
}

/**
 * 提交例外差量
 *
 * @param id 用户 ID
 * @returns 实际提交的条数
 */
async function saveExceptions(id: number): Promise<number> {
  const before = JSON.parse(exceptionsBaseline.value || '[]') as PermissionException[];
  const beforeMap = new Map(before.map(e => [`${e.appId}|${e.code}`, e.effect]));
  const afterMap = new Map(formExceptions.value.map(e => [`${e.appId}|${e.code}`, e.effect]));

  const tasks: Array<{ appId: string; code: string; effect: 'allow' | 'deny' | 'inherit' }> = [];
  for (const item of formExceptions.value) {
    const key = `${item.appId}|${item.code}`;
    if (beforeMap.get(key) !== item.effect) tasks.push({ appId: item.appId, code: item.code, effect: item.effect });
  }
  // 从列表里移除 = 恢复继承（摘掉这条个人策略）
  for (const item of before) {
    if (!afterMap.has(`${item.appId}|${item.code}`)) {
      tasks.push({ appId: item.appId, code: item.code, effect: 'inherit' });
    }
  }

  for (const task of tasks) await setUserPermission(id, task);
  return tasks.length;
}

/**
 * 可提交的角色 ID
 *
 * 只提交自己**能管**的角色：越权的 id 后端会整单拒绝（而不是静默忽略），
 * 表单里那些置灰勾选表示"他本来就有这个角色"，不该由这次保存去动它。
 *
 * 🔴 选项没加载出来（`roles` 为空）时**原样提交**：否则一次拉取失败就会把用户的
 *    角色全清空，而清空是可写进授权流水的"真实操作"，事后只能靠流水解释。
 */
const submittableRoleIds = computed(() => {
  if (options.value.roles.length === 0) return form.roleIds;
  const byId = new Map(options.value.roles.map(role => [role.id, role]));
  return form.roleIds.filter(id => byId.get(id)?.manageable !== false);
});

/* ── 打开 / 关闭 ──────────────────────────────────────────── */

/**
 * 按目标复位表单
 *
 * 新建时把每一项都写回初值 —— 不复位会带上上一个人的残留（尤其 `roleIds`，
 * 那会变成"给新用户直接授予前一个人的角色"）。
 */
function resetForm(): void {
  const target = props.target;
  Object.assign(form, {
    username: target?.username ?? '',
    email: target?.email ?? '',
    password: '',
    deptId: target?.deptId ?? null,
    status: target?.status ?? 1,
    rankLevel: target?.rankLevel ?? 0,
    roleIds: target ? [...target.roleIds] : [],
    postIds: target ? [...target.postIds] : []
  });
  formExceptions.value = [];
  exceptionsBaseline.value = '[]';
  exceptionsError.value = '';
  excCode.value = '';
  excEffect.value = 'allow';
  errorMessage.value = '';
}

watch(
  () => props.open,
  open => {
    if (!open) return;
    resetForm();
    void ensureOptions();
    if (props.target) void loadExceptions(props.target.id);
  },
  { immediate: true }
);

/** 关闭（提交中不允许关：否则请求回来时组件已卸载，错误无处显示） */
function close(): void {
  if (submitting.value) return;
  emit('close');
}

/** 提交（新建 / 编辑） */
async function submit(): Promise<void> {
  if (!form.username.trim()) {
    errorMessage.value = '请填写账号';
    return;
  }
  if (!isEdit.value && form.password.length < 8) {
    errorMessage.value = '初始密码至少 8 位';
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  try {
    if (props.target) {
      const targetId = props.target.id;
      /*
       * 改自己时角色原样回传：`submittableRoleIds` 会按"能不能管理"过滤，
       * 而自己的角色里可能有够不着的项 —— 过滤后集合变化，后端会判定成"改自己角色"而 403。
       */
      const roleIds = isSelf.value ? [...(props.target.roleIds ?? [])] : submittableRoleIds.value;
      await updateUser(targetId, {
        username: form.username,
        email: form.email,
        deptId: form.deptId,
        status: form.status,
        rankLevel: form.rankLevel,
        roleIds,
        postIds: form.postIds
      });
      /*
       * 例外是**独立接口**（一次一条），不像资料那样能整单回滚。
       * 所以这里分开报：资料已经落库，例外失败时要如实说"一半成功"，
       * 否则用户会以为整个保存都没生效，重新点一次又把资料覆盖一遍。
       */
      let changed = 0;
      try {
        changed = await saveExceptions(targetId);
      } catch (err) {
        emit('close');
        emit('saved', `资料已保存，但权限例外未全部生效：${err instanceof Error ? err.message : '未知错误'}`);
        return;
      }
      emit('close');
      emit('saved', changed ? `已保存（含 ${changed} 项权限例外）` : '已保存');
    } else {
      await createUser({
        username: form.username,
        email: form.email,
        password: form.password,
        deptId: form.deptId,
        status: form.status,
        rankLevel: form.rankLevel,
        roleIds: submittableRoleIds.value,
        postIds: form.postIds
      });
      emit('close');
      emit('saved', '已创建');
    }
  } catch (err) {
    // 就地显示：账号重复这类错误必须贴着输入框，弹到页面角落会被忽略
    errorMessage.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="modal-mask" v-mask-close="close">
    <div class="modal user-modal" :class="{ 'is-compact': !isEdit }">
      <header class="modal__head">
        <div class="modal__heading">
          <span class="modal__title">{{ isEdit ? '编辑用户' : '新建用户' }}</span>
          <span v-if="isEdit" class="modal__sub mono">{{ form.username }}</span>
        </div>
        <button class="modal__close" type="button" aria-label="关闭" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="modal__body user-form-body" :class="{ 'is-single': !isEdit }">
        <div class="user-form-col">
          <section class="form-section">
            <h3 class="form-section__title">基本信息</h3>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">账号</span>
                <input v-model="form.username" class="input" maxlength="50" />
              </label>
              <label class="field">
                <span class="field__label">邮箱</span>
                <input v-model="form.email" class="input" maxlength="100" />
              </label>
              <label v-if="!isEdit" class="field is-wide">
                <span class="field__label">初始密码（至少 8 位）</span>
                <input v-model="form.password" class="input" type="password" maxlength="128" />
              </label>
              <label class="field">
                <span class="field__label">部门</span>
                <select v-model.number="form.deptId" class="select">
                  <option :value="null">未分配</option>
                  <option v-for="dept in options.depts" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
                </select>
              </label>
              <!--
                新建与编辑都显示：新建时它是"起点"，最终值取 max(填的, 角色里的最高权重)；
                编辑时改它才是**唯一**能降职级的途径（收回角色不自动降）。
              -->
              <label class="field">
                <span class="field__label">职级（0-99）</span>
                <input v-model.number="form.rankLevel" class="input" type="number" min="0" max="99" />
                <span class="field__hint">
                  决定能管理多高的人。角色里的最高权重是下限（授角色会自动抬高），收起角色不会自动降
                </span>
              </label>
              <label class="field">
                <span class="field__label">状态</span>
                <select v-model.number="form.status" class="select">
                  <option :value="1">正常</option>
                  <option :value="0">冻结</option>
                </select>
              </label>
            </div>
          </section>

          <section class="form-section">
            <h3 class="form-section__title">角色与岗位</h3>
            <div class="field">
              <span class="field__label">角色</span>
              <!-- 自己的角色只读：角色变更等于权限变更，必须由职级更高的人操作 -->
              <template v-if="isSelf">
                <p class="field__hint">
                  不能修改自己账号的角色 —— 请让职级更高的管理员调整。当前角色：{{ selfRoleNames.join('、') || '无' }}
                </p>
              </template>
              <RolePicker v-else v-model="form.roleIds" :roles="options.roles" />
            </div>
            <div class="field">
              <span class="field__label">岗位</span>
              <PostPicker v-model="form.postIds" :posts="options.posts" />
            </div>
          </section>
        </div>

        <div v-if="isEdit" class="user-form-col">
          <!-- 权限例外（仅编辑）：角色之外的单独允许 / 拒绝。
               放在这里而不是详情页，是因为它必须随「保存」一起提交 ——
               没有保存步骤的写控件等于点错就落库。 -->
          <section class="form-section">
            <header class="form-section__head">
              <h3 class="form-section__title">权限例外</h3>
              <span class="form-section__note">{{ formExceptions.length }} 条 · 角色之外</span>
            </header>
            <p class="form-hint">
              日常授权请改角色；这里只放必须的例外。「拒绝」优先于角色授予，用来临时收回某个权限。
            </p>

            <div v-if="exceptionsLoading" class="empty">权限例外加载中…</div>
            <template v-else>
              <p v-if="!formExceptions.length" class="exc-empty">没有例外 —— 该账号的权限完全来自角色。</p>
              <ul v-else class="exc-list">
                <li
                  v-for="(item, i) in formExceptions"
                  :key="`${item.appId}-${item.code}`"
                  class="exc"
                  :data-effect="item.effect"
                >
                  <span class="exc__dot" aria-hidden="true"></span>
                  <span class="mono exc__code">{{ item.code }}</span>
                  <span class="exc__app">{{ item.appLabel }}</span>
                  <!-- 处置用分段按钮而不是下拉：一眼看到「允许/拒绝」，点一下就换 -->
                  <div class="exc-toggle" role="group" :aria-label="`${item.code} 的处置`">
                    <button
                      type="button"
                      :class="['exc-toggle__btn', { 'is-on': item.effect === 'allow' }]"
                      @click="item.effect = 'allow'"
                    >
                      允许
                    </button>
                    <button
                      type="button"
                      :class="['exc-toggle__btn', 'is-deny', { 'is-on': item.effect === 'deny' }]"
                      @click="item.effect = 'deny'"
                    >
                      拒绝
                    </button>
                  </div>
                  <button
                    class="exc__remove"
                    type="button"
                    title="移除这条例外"
                    aria-label="移除"
                    @click="formExceptions.splice(i, 1)"
                  >
                    <X :size="14" />
                  </button>
                </li>
              </ul>

              <div class="exc-add">
                <input
                  v-model="excCode"
                  class="input"
                  list="exc-catalog"
                  placeholder="权限码，如 admin:user:delete"
                  @keyup.enter="addException"
                />
                <datalist id="exc-catalog">
                  <option v-for="item in excCatalog" :key="item.code" :value="item.code">{{ item.label }}</option>
                </datalist>
                <div class="exc-toggle" role="group" aria-label="新增例外的处置">
                  <button
                    type="button"
                    :class="['exc-toggle__btn', { 'is-on': excEffect === 'allow' }]"
                    @click="excEffect = 'allow'"
                  >
                    允许
                  </button>
                  <button
                    type="button"
                    :class="['exc-toggle__btn', 'is-deny', { 'is-on': excEffect === 'deny' }]"
                    @click="excEffect = 'deny'"
                  >
                    拒绝
                  </button>
                </div>
                <button class="btn btn--sm" type="button" :disabled="!excCode.trim()" @click="addException">
                  <Plus :size="13" /> 添加
                </button>
              </div>
            </template>

            <p v-if="exceptionsError" class="field__error">{{ exceptionsError }}</p>
          </section>
        </div>
      </div>

      <footer class="modal__foot">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <button class="btn btn--ghost" type="button" @click="close">取消</button>
        <button class="btn btn--primary" type="button" :disabled="submitting" @click="submit">
          {{ submitting ? '保存中…' : '保存' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/*
 * 表单宽度：编辑态两栏（资料 + 例外），新建态单列。
 * 920 的单列表单每条输入都会拉成一条长缝，所以新建时收到 600。
 */
.user-modal {
  width: min(920px, 100%);
}

.user-modal.is-compact {
  width: min(600px, 100%);
}

/* 左栏装基本信息与角色岗位，右栏装例外；新建时右栏不存在，退回单列 */
.user-form-body {
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  align-items: start;
  gap: 18px;
}

.user-form-body.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.user-form-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* 窄屏回单列：两栏挤到 400px 以下时输入框会短到没法用 */
@media (max-width: 820px) {
  .user-form-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 标题 + 账号副标题：编辑时要能一眼确认"我正在改谁" */
.modal__heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.modal__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.modal__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.modal__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

/* 分节：基本信息 / 角色与岗位 / 权限例外 —— 用细分隔线断开，避免一长条表单 */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-section + .form-section {
  padding-top: 14px;
  border-top: 1px solid var(--mauth-border);
}

.form-section__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.form-section__title {
  margin: 0;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: var(--mauth-track-eyebrow);
  color: var(--mauth-text-faint);
}

.form-section__note {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

/* 表单里的灰色说明 */
.form-hint {
  margin: 4px 0 8px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--mauth-text-faint);
}

/* 两列网格：窄屏自动落回单列（表单在手机上仍是竖排更好填） */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.form-grid .is-wide {
  grid-column: 1 / -1;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ── 权限例外 ───────────────────────────────────────────────── */

.exc-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一行一条：状态点 / 权限码 / 应用 / 允许拒绝 / 移除 */
.exc {
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
}

/* 状态点：允许=成功色、拒绝=危险色，比读文字快 */
.exc__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--mauth-text-faint);
}

.exc[data-effect='allow'] .exc__dot {
  background: var(--mauth-success);
}

.exc[data-effect='deny'] .exc__dot {
  background: var(--mauth-danger);
}

.exc__code {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
}

.exc__app {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

/* 允许 / 拒绝分段：点一下就换，不用展开下拉 */
.exc-toggle {
  display: inline-flex;
  flex: none;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  overflow: hidden;
}

.exc-toggle__btn {
  height: 22px;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: var(--mauth-text-faint);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.exc-toggle__btn:hover {
  color: var(--mauth-text);
}

.exc-toggle__btn.is-on {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-weight: 600;
}

/* 拒绝态用危险色：这是"收回权限"，视觉上必须与允许区分开 */
.exc-toggle__btn.is-deny.is-on {
  background: var(--mauth-danger-soft);
  color: var(--mauth-danger);
}

.exc__remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.exc__remove:hover {
  background: var(--mauth-danger-soft);
  color: var(--mauth-danger);
}

/* 空态：与列表行同高，避免"没有例外"一句话把整节高度塌掉 */
.exc-empty {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--mauth-radius-xs);
  background: color-mix(in srgb, var(--mauth-text) 3%, transparent);
  color: var(--mauth-text-faint);
  font-size: 12px;
}

.exc-add {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.exc-add .input {
  flex: 1;
  min-width: 140px;
}

/* 底部错误条：贴在按钮左边，不打断视线又能读到 */
.form-error {
  margin: 0 auto 0 0;
  font-size: 12px;
  color: var(--mauth-danger);
  text-align: left;
}
</style>
