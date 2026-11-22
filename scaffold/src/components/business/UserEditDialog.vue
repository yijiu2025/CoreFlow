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
 * === 版面：单栏纵向流 ===
 * 曾试过"左栏资料 / 右栏例外"的两栏版式，实拍结论是：右栏只装例外时 60% 是空白，
 * 而左栏必须滚动才能看全 —— 一半空间浪费、另一半不够用。改成单栏后
 * **阅读顺序 = 填写顺序**（基本资料 → 角色与岗位 → 权限例外），也省掉视线在两栏间跳的成本。
 * 宽度相应收到 800：单栏 920 会把每条输入拉成一条长缝。
 *
 * === 关闭守卫 ===
 * 这张表单动辄七八个字段外加若干例外条目，误触遮罩就全丢。所有关闭途径
 * （遮罩 / X / 取消 / ESC）统一走 `requestClose()`：**脏才问**，保存成功则不再问
 * （此时父级正等着卸载，再问一次就成了"保存完还问你要不要放弃"）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-vue-next';
import { createUser, permissionCatalog, setUserPermission, updateUser, userOptions, userProfile } from '@/api/system';
import type { UserEditTarget, UserOptions } from '@/api/types';
import RolePicker from '@/components/ui/RolePicker.vue';
import PostPicker from '@/components/ui/PostPicker.vue';
import { useAuthStore } from '@/stores/auth';
import { useConfirmStore } from '@/stores/confirm';
import { createFocusTrap } from '@/composables/useFocusTrap';

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

/** 保存阶段：idle → saving → saved */
type Phase = 'idle' | 'saving' | 'saved';
const phase = ref<Phase>('idle');

/**
 * 是否提交中（由 `phase` 派生）
 *
 * 不再单独维护一个 `submitting` ref：两个真相各自被赋值，迟早会漏掉一处
 * （"资料成功、例外失败"那条提前 return 的分支最容易漏），模板上的 disabled
 * 就会和按钮文案对不上。
 */
const submitting = computed(() => phase.value === 'saving');

/** 就地错误（不弹 toast：表单里的错误要贴着表单看） */
const errorMessage = ref('');

/** 字段级错误（与 footer 的 errorMessage 分开：这些要紧贴输入框） */
const accountError = ref('');
const emailError = ref('');
const passwordError = ref('');
/** 邮箱格式：只拦"明显打错"的，不追求 RFC 全覆盖（过严会把合法地址挡在门外） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 新建时的初始密码是否可见（输入框比的是"看得见的错字"，比看不出来更省事） */
const showPassword = ref(false);

/** 选项：外部给了就用外部的，否则自己拉一份 */
const options = ref<UserOptions>(props.options ?? { depts: [], roles: [], posts: [] });

const auth = useAuthStore();
const confirm = useConfirmStore();

/**
 * 是否在编辑**自己**的账号
 *
 * 自己改自己有两档限制（后端同一条判据，这里只是提前置灰，避免"改完点保存才 403"）：
 *   · 普通用户：角色只读，其余资料可改；
 *   · 超管：**账号、邮箱、部门、岗位可改**；状态、职级、角色只读 ——
 *     超管默认拥有全部权限，角色没有调整意义；冻结/降级自己会自锁。
 */
const isSelf = computed(() => !!props.target && Number(props.target.id) === Number(auth.me?.id));

/** 当前操作者是不是超管 */
const isSuper = computed(
  () => (auth.me?.roles || []).includes('superadmin') || auth.hasPermission('*')
);

/** 超管自改：账号 / 邮箱 / 部门 / 岗位可改，状态 / 职级 / 角色只读 */
const selfSuperLimited = computed(() => isSelf.value && isSuper.value);

/** 自己改自己：角色一律只读（超管默认全权限，普通用户需更高职级的人调整） */
const selfRoleLocked = computed(() => isSelf.value);
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
/**
 * 选项加载状态（喂给角色 / 岗位选择器）
 *
 * 三态而不是一个布尔：选择器要能区分"还没到"（骨架 + 搜索禁用）、"拉失败"（给重试）
 * 与"确实是空的"（才允许说「暂无可分配角色」）。混成一个 `loading` 会让拉失败看起来
 * 像"这个人没有角色"，而这一页的结论正是"他有哪些角色"。
 */
const optionsStatus = ref<'loading' | 'ready' | 'error'>(optionsReady.value ? 'ready' : 'loading');
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
      optionsStatus.value = 'ready';
    }
  }
);

/**
 * 拉选项（父级没给或给的是空表时发生）
 *
 * 失败不阻断：部门 / 岗位下拉为空即可，编辑资料本身仍可保存。
 * 选择器那头会显示"没加载出来 + 重试"，而不是一个空列表。
 */
async function ensureOptions(): Promise<void> {
  if (optionsReady.value) {
    optionsStatus.value = 'ready';
    return;
  }
  if (optionsLoading) return;
  optionsLoading = true;
  optionsStatus.value = 'loading';
  try {
    const fresh = await userOptions();
    /*
     * 拉回来的仍是空表就别覆盖：保留外部那份（可能刚好在渲染间被填上）。
     * `fresh` 也要判空 —— 与目录同一种异常信封（200 + null）会让 `.roles` 直接抛错。
     */
    if (fresh && (fresh.roles.length || fresh.depts.length || fresh.posts.length)) {
      options.value = fresh;
      optionsReady.value = true;
    }
    // 请求成功（哪怕是空表）：这是"数据为空"，不是"还没到"
    optionsStatus.value = 'ready';
  } catch {
    /* 选项拉取失败不阻塞表单：对应下拉为空即可，选择器自己显示重试 */
    optionsStatus.value = 'error';
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
/** 读取失败（与添加行的校验错误分开：读取失败要**禁用**添加行，校验错误不能） */
const exceptionsError = ref('');
/** 添加行的校验错误（未知码 / 重复码），贴在添加行下方 */
const excAddError = ref('');
const excCode = ref('');
const excEffect = ref<'allow' | 'deny'>('allow');
/** 权限码目录（提供 domain，用来推出 appId） */
const excCatalog = ref<Array<{ domain: string; domainName: string; code: string; label: string }>>([]);

/**
 * 例外读取失败时锁住添加行
 *
 * 读不到现有策略就往里加，等于在"不知道他本来有什么"的前提下做授权 ——
 * 保存时那条 PUT 可能刚好覆盖掉一条本来正确的 deny。
 */
const exceptionsUnreadable = computed(() => exceptionsError.value !== '');

/** 权限码目录是否还没到位（空表 = 请求失败，或后端根本没配目录） */
const catalogMissing = computed(() => excCatalog.value.length === 0);

/**
 * 添加行是否锁死
 *
 * 两种"不能加"的理由分别来自上面两条：读不到现有策略、或没有目录可校验。
 * 合成一个 computed 再给模板用，就不会出现"输入框禁了、按钮忘了禁"的半截状态。
 */
const excAddLocked = computed(() => exceptionsUnreadable.value || catalogMissing.value);

/**
 * `<datalist>` 的 id
 *
 * 用 `useId()` 而不是写死字符串：弹窗可能同时存在两个实例（列表页一个、
 * 详情页一个），写死 id 会让两个 input 的候选表互相串。
 */
const catalogListId = useId();

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

/** 例外列表与打开时的快照是否不同（不看加载状态） */
const exceptionsSnapshotDirty = computed(
  () => snapshotExceptions(formExceptions.value) !== exceptionsBaseline.value
);

/**
 * 权限例外是否算"脏"
 *
 * 读着 / 读失败时不算：读失败后列表恒为空，否则会被误算成"把这些例外全删了"。
 *
 * 🔴 全组件只用这一个：区头「已改」药丸、footer 文案、dirtyCount、关闭守卫若各算一套，
 *    迟早出现"药丸说改了、footer 说没改"这种自相矛盾的提示。
 */
const exceptionsDirty = computed(
  () => !exceptionsLoading.value && !exceptionsUnreadable.value && exceptionsSnapshotDirty.value
);

/**
 * 读取某用户的现有例外
 *
 * @param id 用户 ID
 * @returns 无
 */
async function loadExceptions(id: number): Promise<void> {
  exceptionsLoading.value = true;
  exceptionsError.value = '';
  /*
   * 两条请求分开结算（allSettled 而不是 all）：
   *   · profile 决定"他有哪些例外" —— 读不到就真的不知道，只能清空并禁止添加；
   *   · catalog 只决定"能不能新增" —— 它失败时列表仍然成立（数据来自 profile，
   *     appLabel 也自带），把列表一起抹掉会让用户看到"没有例外"这个**错误结论**，
   *     进而以为此人没有个人策略，重复授权或误判权限来源。
   */
  const [profileRes, catalogRes] = await Promise.allSettled([
    userProfile(id),
    excCatalog.value.length ? Promise.resolve(excCatalog.value) : permissionCatalog()
  ]);
  try {
    if (catalogRes.status === 'fulfilled') {
      /*
       * 契约上目录是数组，但网关/降级链路可能给出 `code:200 + data:null` 的信封。
       * 直接赋 null 会让模板在 `excCatalog.length` 上抛错、整棵弹窗渲染中断（实测过：
       * 遮罩都不出现，看起来像"点了没反应"）。异常形态按"目录为空"降级，
       * 由 `catalogMissing` 去禁用添加行。
       */
      excCatalog.value = Array.isArray(catalogRes.value) ? catalogRes.value : [];
    }
    if (profileRes.status === 'rejected') {
      throw profileRes.reason;
    }
    const list: PermissionException[] = [];
    for (const item of profileRes.value.inline ?? []) {
      item.allow.forEach(code => list.push({ code, effect: 'allow', appId: item.appId, appLabel: item.appLabel }));
      item.deny.forEach(code => list.push({ code, effect: 'deny', appId: item.appId, appLabel: item.appLabel }));
    }
    formExceptions.value = list;
    exceptionsBaseline.value = snapshotExceptions(list);
  } catch (err) {
    // 读不到策略不该挡住改资料：例外区降级成"不可读"，其他字段照常保存
    exceptionsError.value = err instanceof Error ? err.message : '权限例外读取失败';
    formExceptions.value = [];
    exceptionsBaseline.value = '[]';
  } finally {
    exceptionsLoading.value = false;
  }
}

/** 取权限码的中文名（目录里没有就留空，不编一个出来） */
function labelOf(code: string): string {
  return excCatalog.value.find(item => item.code === code)?.label ?? '';
}

/** 添加行里已输入的内容（去空格后） */
const excQuery = computed(() => excCode.value.trim());

/**
 * 输入内容能匹配到的权限码数量
 *
 * 只比权限码，不比中文名：原生 datalist 是按 `value`（也就是码）过滤的，
 * 这里若把中文名也算进来，就会出现"提示匹配 3 个、候选框里一个都没有"的自相矛盾。
 */
const matchCount = computed(() => {
  const q = excQuery.value.toLowerCase();
  if (!q) return 0;
  return excCatalog.value.filter(item => item.code.toLowerCase().includes(q)).length;
});

/** 匹配结果的文案（0 条时换成明确的"没匹配上"） */
const matchText = computed(() => (matchCount.value > 0 ? `匹配 ${matchCount.value} 个` : '没有匹配的权限码'));

/**
 * 编辑距离（Levenshtein）
 *
 * 只用来猜"你大概想输哪个码"，算的是字符级差异 —— 权限码都是 ASCII，
 * 不需要按字素簇处理。
 *
 * @param a 串 a（已转小写）
 * @param b 串 b（已转小写）
 * @returns 编辑距离
 */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 猜几个"你大概想输"的权限码
 *
 * 两级：先按前缀捞（少打一段最常见），前缀捞不到再全表算编辑距离（打错一个字母）。
 * 最多给 3 个 —— 真正的记错单词靠候选救不回来，给多了只会让人多读三行。
 *
 * @param code 用户输入的码
 * @returns 候选码（可能为空）
 */
function suggestCodes(code: string): string[] {
  const q = code.toLowerCase();
  // 两个字符就猜会猜出一堆噪音，不如直接说"从候选中选择"
  if (q.length < 3) return [];
  const prefixed = excCatalog.value.filter(item => item.code.toLowerCase().startsWith(q.slice(0, 2)));
  const pool = prefixed.length ? prefixed : excCatalog.value;
  return pool
    .map(item => ({ code: item.code, distance: editDistance(q, item.code.toLowerCase()) }))
    .filter(item => item.distance <= 2)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(item => item.code);
}

/**
 * 从权限码的 domain 推 appId，再补上应用名
 *
 * 三种失败分开报：目录没到 / 只差大小写 / 真的没有这个码。混成一句"不存在"，
 * 用户只会去反复改拼写。
 */
function addException(): void {
  if (exceptionsUnreadable.value) return;
  const code = excCode.value.trim();
  if (!code) return;
  /*
   * 🔴 目录为空 ≠ 这个码不存在。目录没拉到时任何码都查不到，若照"不在目录里"报，
   *    用户会怀疑自己拼错 —— 真正该说的是"现在还不能加"。
   */
  if (catalogMissing.value) {
    excAddError.value = '权限码目录还没加载出来，暂时不能添加。';
    return;
  }
  const hit = excCatalog.value.find(item => item.code === code);
  if (!hit) {
    // 只差大小写：告诉目录里的真实写法，但**不**替用户改 —— 权限码是后端精确匹配的标识
    const caseOnly = excCatalog.value.find(item => item.code.toLowerCase() === code.toLowerCase());
    if (caseOnly) {
      excAddError.value = `权限码区分大小写，目录里是 ${caseOnly.code}`;
      return;
    }
    const suggestions = suggestCodes(code);
    excAddError.value = suggestions.length
      ? `「${code}」不在权限码目录里 —— 你可能是想：${suggestions.join('、')}`
      : `「${code}」不在权限码目录里，请从候选中选择`;
    return;
  }
  if (formExceptions.value.some(e => e.code === code && e.appId === hit.domain)) {
    excAddError.value = `「${code}」已经在例外列表里`;
    return;
  }
  formExceptions.value.push({ code, effect: excEffect.value, appId: hit.domain, appLabel: hit.domainName });
  excCode.value = '';
  excAddError.value = '';
}

/**
 * 添加行的回车
 *
 * 🔴 中文输入法下按 Enter 只是"上屏"，不是提交意图。不判组字状态的话，拼音串会被
 *    当成权限码提交，然后弹一条"不在目录里"，用户完全不知道刚才发生了什么。
 *    `keyCode === 229` 是部分浏览器（旧 WebKit / 安卓）在组字时不置 `isComposing` 的兜底。
 *
 * @param event 键盘事件
 */
function onExcEnter(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) return;
  addException();
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

/* ── 字段校验 ─────────────────────────────────────────────── */

/**
 * 校验账号
 *
 * @returns 是否通过
 */
function validateAccount(): boolean {
  accountError.value = form.username.trim() ? '' : '请填写账号';
  return !accountError.value;
}

/**
 * 校验邮箱
 *
 * 允许留空（后端不强制），只有"填了但格式明显不对"才算错。
 *
 * @returns 是否通过
 */
function validateEmail(): boolean {
  const email = form.email.trim();
  emailError.value = !email || EMAIL_RE.test(email) ? '' : '邮箱格式看起来不对，例如 name@company.com';
  return !emailError.value;
}

/**
 * 校验初始密码（仅新建）
 *
 * @returns 是否通过
 */
function validatePassword(): boolean {
  if (isEdit.value) return true;
  passwordError.value = form.password.length >= 8 ? '' : '初始密码至少 8 位';
  return !passwordError.value;
}

/* ── 职级步进 ─────────────────────────────────────────────── */

/**
 * 职级上一次的有效值
 *
 * 输入框被清空后失焦要能回到它 —— 回填 0 等于"悄悄把这个人降成最低职级"，
 * 而降职级在这套系统里是要写授权流水的动作。
 */
let lastValidRank = 0;

/**
 * 夹到 0-99
 *
 * @param n 原始数值
 * @returns 合法职级
 */
function clampRank(n: number): number {
  return Math.min(99, Math.max(0, Math.trunc(n)));
}

/**
 * 输入时夹值
 *
 * 清空不夹（等失焦统一回填），否则"删到空"这一步会被立刻写回 0，光标跳回行首。
 *
 * @param event 输入事件
 */
function onRankInput(event: Event): void {
  const el = event.target as HTMLInputElement;
  if (el.value.trim() === '') return;
  const n = Number(el.value);
  if (!Number.isFinite(n)) return;
  const next = clampRank(n);
  form.rankLevel = next;
  lastValidRank = next;
  /*
   * 直接写回 DOM：夹到边界时 form 的值可能与上一帧相同（99 → 输入 999 → 99），
   * Vue 比对新旧 vnode 值一致就不重绘，输入框会留着越界的数字。
   */
  if (el.value !== String(next)) el.value = String(next);
}

/**
 * 失焦时收口：空值 / 乱值回填上一次的有效值
 *
 * @param event 失焦事件
 */
function onRankBlur(event: Event): void {
  const el = event.target as HTMLInputElement;
  const n = Number(el.value);
  const next = el.value.trim() === '' || !Number.isFinite(n) ? lastValidRank : clampRank(n);
  form.rankLevel = next;
  lastValidRank = next;
  el.value = String(next);
}

/**
 * 步进按钮
 *
 * @param delta +1 / -1
 */
function bumpRank(delta: number): void {
  const next = clampRank(Number(form.rankLevel || 0) + delta);
  form.rankLevel = next;
  lastValidRank = next;
}

/* ── 状态分段 ─────────────────────────────────────────────── */

/** 一个状态段 */
interface StatusChoice {
  value: number;
  label: string;
  /** 状态点色档：正常 / 冻结 / 非常规值 */
  tone: 'ok' | 'danger' | 'muted';
  /** 只用于展示的原值（不可选） */
  locked?: boolean;
}

/**
 * 非常规状态的文案
 *
 * @param status 状态值
 * @returns 文案
 */
function statusLabel(status: number): string {
  if (status === -1) return '已注销';
  if (status === -2) return '待注销';
  return `状态 ${status}`;
}

/**
 * 状态可选项
 *
 * 🔴 后端只写 1 / 0，但历史数据会有 -1（已注销），列表筛选还会派生出 -2（待注销）。
 *    若不在控件里给它一段，三段全不选中 —— 用户看到的是"这个人没有状态"，
 *    存一次就把原值覆盖成正常，等于凭空复活一个注销账号。
 */
const statusOptions = computed<StatusChoice[]>(() => {
  const base: StatusChoice[] = [
    { value: 1, label: '正常', tone: 'ok' },
    { value: 0, label: '冻结', tone: 'danger' }
  ];
  if (form.status !== 1 && form.status !== 0) {
    base.push({ value: form.status, label: statusLabel(form.status), tone: 'muted', locked: true });
  }
  return base;
});

/** 切成冻结且原值不是冻结时提醒：冻结的后果（掉线）在保存那一刻才发生，得先说到 */
const showFreezeHint = computed(() => form.status === 0 && (props.target?.status ?? 1) !== 0);

/** 身份带 / 只说一句给读屏听的状态描述 */
const statusText = computed(() => (form.status === 1 ? '正常' : form.status === 0 ? '冻结' : statusLabel(form.status)));

/** 头像首字母（没有任何字符时给 ?，别渲染成空白圆圈） */
const initial = computed(() => {
  const first = form.username.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
});

/**
 * 身份带里的部门名
 *
 * 三种情况分开说：`null` 是真的没分配；**有 id 但选项里没有**时不能写"未分配"
 * （那是在撒谎，用户会以为部门被清空了），选项还没到就显示占位符。
 */
const deptName = computed(() => {
  if (form.deptId === null) return '未分配';
  const hit = options.value.depts.find(dept => dept.id === form.deptId);
  if (hit) return hit.name;
  return optionsReady.value ? `#${form.deptId}` : '—';
});

/* ── 脏判定 ───────────────────────────────────────────────── */

/** 打开时的表单基线（逐项比较，用来数"改了几项"） */
interface FormBaseline {
  username: string;
  email: string;
  deptId: number | null;
  status: number;
  rankLevel: number;
  roleKey: string;
  postKey: string;
  passwordFilled: boolean;
}

/**
 * ID 集合的归一化键
 *
 * 排序后 join：勾选顺序变了不算改过（否则"先取消再勾回来"会被算成脏）。
 *
 * @param ids ID 列表
 * @returns 归一化键
 */
function idKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',');
}

/**
 * 取当前表单的基线
 *
 * @returns 基线
 */
function snapshotForm(): FormBaseline {
  return {
    username: form.username.trim(),
    email: form.email.trim(),
    deptId: form.deptId ?? null,
    status: Number(form.status),
    rankLevel: Number(form.rankLevel),
    roleKey: idKey(form.roleIds),
    postKey: idKey(form.postIds),
    passwordFilled: form.password.length > 0
  };
}

const baseline = ref<FormBaseline>(snapshotForm());

/**
 * 资料项的未保存计数（不含权限例外）
 *
 * 按"项"数而不是按字段数：角色选了 5 个只算 1 项 —— 说"有 5 项未保存"会让人
 * 以为要存五次。只读项（超管自改时的状态 / 职级 / 角色）根本改不动，计进去
 * 只会让提示常驻在那里。
 */
const formDirtyCount = computed(() => {
  const base = baseline.value;
  let count = 0;
  if (form.username.trim() !== base.username) count += 1;
  if (form.email.trim() !== base.email) count += 1;
  if (!isEdit.value && (form.password.length > 0) !== base.passwordFilled) count += 1;
  if ((form.deptId ?? null) !== base.deptId) count += 1;
  if (!selfSuperLimited.value && Number(form.status) !== base.status) count += 1;
  if (!selfSuperLimited.value && Number(form.rankLevel) !== base.rankLevel) count += 1;
  if (!selfRoleLocked.value && idKey(form.roleIds) !== base.roleKey) count += 1;
  if (idKey(form.postIds) !== base.postKey) count += 1;
  return count;
});

/** 未保存项数（资料 + 例外，例外汇总成 1 项）：关闭守卫按这个数告诉用户"会丢几项" */
const dirtyCount = computed(() => formDirtyCount.value + (exceptionsDirty.value ? 1 : 0));

/**
 * footer 的脏提示文案
 *
 * 资料脏与例外脏要分开说：例外是保存时逐条 PUT 的独立提交，把"1 条例外"和
 * "3 个字段"混成同一个数字，会让人以为例外也要一条条点保存。只有两者都脏时
 * 才点明"其中 1 项是权限例外"。
 */
const dirtyText = computed(() => {
  if (dirtyCount.value === 0) return '';
  if (formDirtyCount.value === 0) return '权限例外有未保存的改动';
  if (exceptionsDirty.value) return `有 ${dirtyCount.value} 项未保存的修改，其中 1 项是权限例外`;
  return `有 ${dirtyCount.value} 项未保存的修改`;
});

/**
 * 放弃修改时的确认正文
 *
 * 同上：只说"1 项修改"时，用户不一定意识到那一条是权限例外（例外是独立接口、
 * 独立落库，感觉上不像"表单里的一项"）。只脏例外就直接点名，两者都脏才顺带提一句。
 */
const discardMessage = computed(() => {
  if (formDirtyCount.value === 0) return '权限例外的改动会丢失，且不会写入任何记录。';
  const base = `关闭后，这 ${dirtyCount.value} 项修改会丢失，且不会写入任何记录`;
  return exceptionsDirty.value ? `${base}（含权限例外）。` : `${base}。`;
});

/* ── 打开 / 关闭 ──────────────────────────────────────────── */

/** 账号输入框（打开时聚焦、校验失败时把视线拉过去） */
const usernameInput = ref<HTMLInputElement | null>(null);
const emailInput = ref<HTMLInputElement | null>(null);
const passwordInput = ref<HTMLInputElement | null>(null);

/** 弹窗根（焦点陷阱容器） */
const panel = ref<HTMLElement | null>(null);
/** 每个实例一条陷阱（模块级栈负责多层嵌套） */
const trap = createFocusTrap();

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
  excAddError.value = '';
  excCode.value = '';
  excEffect.value = 'allow';
  errorMessage.value = '';
  accountError.value = '';
  emailError.value = '';
  passwordError.value = '';
  showPassword.value = false;
  lastValidRank = form.rankLevel;
}

watch(
  () => props.open,
  async open => {
    if (!open) {
      trap.deactivate();
      return;
    }
    phase.value = 'idle';
    resetForm();
    // 基线必须在 resetForm 之后取：它记的是"刚打开时长什么样"
    baseline.value = snapshotForm();
    void ensureOptions();
    if (props.target) void loadExceptions(props.target.id);

    await nextTick();
    trap.activate(panel.value);
    /*
     * 桌面端打开就聚焦账号框（列表页点"编辑"后通常直接改账号）；
     * 触屏设备不自动聚焦 —— 否则一打开就弹软键盘，把半屏表单顶掉。
     */
    if (!window.matchMedia('(pointer: coarse)').matches) {
      usernameInput.value?.focus({ preventScroll: true });
    }
  },
  { immediate: true }
);

/**
 * 关闭前守卫（遮罩 / X / 取消 / ESC 共用这一条路）
 *
 * 三分支的顺序就是语义：提交中不许关（请求回来时组件已卸载，错误无处显示）、
 * 已保存不再问（父级正等着关）、有脏数据才确认。
 */
async function requestClose(): Promise<void> {
  if (phase.value === 'saving') return;
  if (phase.value === 'saved') {
    emit('close');
    return;
  }
  if (dirtyCount.value > 0) {
    const ok = await confirm.ask({
      title: '放弃未保存的修改？',
      message: discardMessage.value,
      confirmText: '放弃修改',
      danger: true
    });
    if (!ok) return;
  }
  emit('close');
}

/**
 * ESC 关闭
 *
 * 只处理栈顶：详情页抽屉里再开这个弹窗时，一次 ESC 不该把两层一起关掉。
 *
 * @param event 键盘事件
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.open) return;
  // 确认框有自己的 ESC 处理（它已经 preventDefault 了），这里别再关一层
  if (confirm.pending || event.defaultPrevented) return;
  if (!trap.isTop()) return;
  void requestClose();
}

onMounted(() => window.addEventListener('keydown', onKeydown));

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  // 父级直接卸载（列表页 `v-if`）时 open 不会再变，收尾只能在这里做
  trap.deactivate();
});

/** 提交（新建 / 编辑） */
async function submit(): Promise<void> {
  if (phase.value !== 'idle') return;
  errorMessage.value = '';

  // 三个字段都要判完再决定报哪个：只报第一个会让人来回点三次保存
  const accountOk = validateAccount();
  const emailOk = validateEmail();
  const passwordOk = validatePassword();
  if (!accountOk) {
    usernameInput.value?.focus();
    return;
  }
  if (!emailOk) {
    emailInput.value?.focus();
    return;
  }
  if (!passwordOk) {
    passwordInput.value?.focus();
    return;
  }

  phase.value = 'saving';
  try {
    if (props.target) {
      const targetId = props.target.id;
      /*
       * 自己改自己时角色原样回传：`submittableRoleIds` 会按"能不能管理"过滤，
       * 过滤后集合变化会被后端判定成"改自己角色"而 403。
       */
      const roleIds = selfRoleLocked.value ? [...(props.target.roleIds ?? [])] : submittableRoleIds.value;
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
        // 先落"已保存"再 emit：这条分支也意味着本次保存结束，别再弹"放弃修改"
        phase.value = 'saved';
        emit('close');
        emit('saved', `资料已保存，但权限例外未全部生效：${err instanceof Error ? err.message : '未知错误'}`);
        return;
      }
      phase.value = 'saved';
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
      phase.value = 'saved';
      emit('close');
      emit('saved', '已创建');
    }
  } catch (err) {
    // 失败必须退回 idle：否则按钮会永远停在"已保存"，再点也发不出请求
    phase.value = 'idle';
    // 就地显示：账号重复这类错误必须贴着输入框，弹到页面角落会被忽略
    errorMessage.value = err instanceof Error ? err.message : '保存失败';
  }
}
</script>

<template>
  <div v-if="open" class="modal-mask" v-mask-close="requestClose">
    <div
      ref="panel"
      class="modal modal--lg user-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="uec-title"
      :aria-describedby="isEdit ? 'uec-desc' : undefined"
      :aria-busy="phase === 'saving' || undefined"
    >
      <header class="modal__head">
        <div class="modal__heading">
          <h3 id="uec-title" class="modal__title">{{ isEdit ? '编辑用户' : '新建用户' }}</h3>
          <!-- 副标题跟输入实时联动：编辑时多半正是在改账号，改完要能立刻核对 -->
          <span v-if="isEdit" class="modal__sub mono">{{ form.username }}</span>
        </div>
        <button
          class="btn btn--ghost btn--sm btn--icon uec-close"
          type="button"
          aria-label="关闭"
          :disabled="submitting"
          @click="requestClose"
        >
          <X :size="16" />
        </button>
      </header>

      <!-- 身份带：head 的兄弟节点、body 之外 —— 滚表单时"我在改谁"始终可见 -->
      <div v-if="isEdit" class="uec-ident">
        <span class="uec-ident__avatar" aria-hidden="true">{{ initial }}</span>
        <div class="uec-ident__text">
          <span class="uec-ident__name mono">{{ form.username || '—' }}</span>
          <span class="uec-ident__meta">
            部门 {{ deptName }} · 职级 {{ form.rankLevel }} · 角色 {{ form.roleIds.length }} · 岗位
            {{ form.postIds.length }}
          </span>
        </div>
      </div>
      <!-- 状态**不**放进身份带：真值只在下面的分段控件里，否则"改成冻结未保存、带里还写正常" -->
      <p v-if="isEdit" id="uec-desc" class="sr-only">
        正在编辑 {{ form.username || '未命名账号' }}，部门 {{ deptName }}，
        {{ form.roleIds.length }} 个角色，状态{{ statusText }}
      </p>

      <div class="modal__body">
        <section class="form-section">
          <header class="form-section__head">
            <h3 class="form-section__title">基本信息</h3>
          </header>
          <!-- 超管自改：状态 / 职级 / 角色只读，账号与联系信息可改 -->
          <p v-if="selfSuperLimited" class="uec-hint">
            超管默认拥有全部权限：自己的账号可修改账号名、邮箱、部门与岗位；状态、职级与角色只读。
          </p>
          <div class="form-grid">
            <label class="field">
              <span class="field__label">账号</span>
              <input
                ref="usernameInput"
                v-model="form.username"
                class="input"
                maxlength="50"
                autocomplete="off"
                spellcheck="false"
                :aria-invalid="accountError ? 'true' : undefined"
                :aria-describedby="accountError ? 'uec-account-error' : undefined"
                @input="accountError = ''"
                @blur="validateAccount"
              />
              <span v-if="accountError" id="uec-account-error" class="field__error">{{ accountError }}</span>
            </label>
            <label class="field">
              <span class="field__label">邮箱</span>
              <input
                ref="emailInput"
                v-model="form.email"
                class="input"
                type="email"
                inputmode="email"
                maxlength="100"
                autocomplete="off"
                spellcheck="false"
                :aria-invalid="emailError ? 'true' : undefined"
                :aria-describedby="emailError ? 'uec-email-error' : undefined"
                @input="emailError = ''"
                @blur="validateEmail"
              />
              <span v-if="emailError" id="uec-email-error" class="field__error">{{ emailError }}</span>
            </label>
            <div v-if="!isEdit" class="field is-wide">
              <div class="uec-labelrow">
                <label for="uec-password">初始密码</label>
                <span class="uec-range">至少 8 位</span>
              </div>
              <div class="uec-pw">
                <input
                  id="uec-password"
                  ref="passwordInput"
                  v-model="form.password"
                  class="input"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  maxlength="128"
                  :aria-invalid="passwordError ? 'true' : undefined"
                  :aria-describedby="passwordError ? 'uec-password-error' : undefined"
                  @input="passwordError = ''"
                  @blur="validatePassword"
                />
                <button
                  class="uec-pw__toggle"
                  type="button"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? '隐藏' : '显示' }}
                </button>
              </div>
              <span v-if="passwordError" id="uec-password-error" class="field__error">{{ passwordError }}</span>
            </div>
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
              用 div 而不是 label 包住按钮：按钮在 label 里点一下会连带触发 input 的默认行为。
            -->
            <div class="field">
              <div class="uec-labelrow">
                <label for="uec-rank">职级</label>
                <span class="uec-range">0–99</span>
              </div>
              <div class="uec-stepper">
                <input
                  id="uec-rank"
                  class="input uec-num"
                  type="number"
                  min="0"
                  max="99"
                  inputmode="numeric"
                  autocomplete="off"
                  :value="form.rankLevel"
                  :disabled="selfSuperLimited"
                  @input="onRankInput"
                  @blur="onRankBlur"
                />
                <div class="uec-steps">
                  <button
                    class="uec-step"
                    type="button"
                    aria-label="职级加一"
                    :disabled="selfSuperLimited || Number(form.rankLevel) >= 99"
                    @click="bumpRank(1)"
                  >
                    <ChevronUp :size="13" />
                  </button>
                  <button
                    class="uec-step"
                    type="button"
                    aria-label="职级减一"
                    :disabled="selfSuperLimited || Number(form.rankLevel) <= 0"
                    @click="bumpRank(-1)"
                  >
                    <ChevronDown :size="13" />
                  </button>
                </div>
              </div>
            </div>
            <div class="field">
              <div class="uec-labelrow">
                <span>状态</span>
              </div>
              <div
                :class="['uec-seg', { 'is-locked': selfSuperLimited }]"
                role="radiogroup"
                aria-label="账号状态"
              >
                <button
                  v-for="opt in statusOptions"
                  :key="opt.value"
                  class="tab"
                  type="button"
                  role="radio"
                  :class="{ 'is-on': form.status === opt.value }"
                  :aria-checked="form.status === opt.value"
                  :disabled="selfSuperLimited || opt.locked"
                  @click="form.status = opt.value"
                >
                  <span class="uec-dot" :data-tone="opt.tone" aria-hidden="true"></span>
                  {{ opt.label }}
                </button>
              </div>
              <p v-if="showFreezeHint" class="uec-freeze">冻结后该账号的现有会话会立即失效</p>
            </div>
          </div>
        </section>

        <section class="form-section">
          <header class="form-section__head">
            <h3 class="form-section__title">角色与岗位</h3>
            <!-- 已选数量只在选择器内部的摘要条上说一次：同一个数字摆两处，
                 两处迟早会因为延迟一拍而互相矛盾 -->
            <span v-if="selfRoleLocked" class="tag tag--off">只读</span>
          </header>
          <!-- 只读原因只写一处：原先两段二选一分别贴在角色与岗位下面，等于说两遍 -->
          <p v-if="selfRoleLocked" class="uec-hint">
            {{
              selfSuperLimited
                ? '超管默认拥有全部权限，角色不需要在这里调整。'
                : '不能修改自己账号的角色 —— 请让职级更高的管理员调整。'
            }}
          </p>
          <div class="field">
            <span class="field__label">角色</span>
            <!-- 自己的角色只读：超管默认全权限，普通用户需由更高职级的人调整 -->
            <RolePicker
              v-model="form.roleIds"
              class="uec-picker"
              :roles="options.roles"
              :disabled="selfRoleLocked"
              :status="optionsStatus"
              @retry="ensureOptions"
            />
          </div>
          <div class="field">
            <span class="field__label">岗位</span>
            <PostPicker
              v-model="form.postIds"
              class="uec-picker"
              :posts="options.posts"
              :status="optionsStatus"
              @retry="ensureOptions"
            />
          </div>
        </section>

        <!-- 权限例外（仅编辑）：角色之外的单独允许 / 拒绝。
             放在这里而不是详情页，是因为它必须随「保存」一起提交 ——
             没有保存步骤的写控件等于点错就落库。 -->
        <section v-if="isEdit" class="form-section">
          <header class="form-section__head">
            <h3 class="form-section__title">权限例外</h3>
            <span class="form-section__note">{{ formExceptions.length }} 条 · 角色之外</span>
            <span v-if="exceptionsDirty" class="uec-dirty-note">· 已改</span>
          </header>
          <p class="uec-hint">
            日常授权请改角色；这里只放必须的例外。「拒绝」优先于角色授予，用来临时收回某个权限。
          </p>

          <!-- 骨架条而不是 40px 高的 .empty：这行高度最终会被真实行占掉，跳版越小越好 -->
          <div v-if="exceptionsLoading" class="uec-skeletons">
            <div class="skeleton-row uec-skeleton"></div>
            <div class="skeleton-row uec-skeleton"></div>
          </div>
          <template v-else>
            <template v-if="exceptionsUnreadable">
              <p class="uec-loaderror">{{ exceptionsError }}</p>
              <p class="uec-hint">读取成功前不能添加例外，避免与现有策略冲突</p>
            </template>
            <p v-else-if="!formExceptions.length" class="exc-empty">
              没有例外 —— 该账号的权限完全来自角色。
            </p>
            <TransitionGroup v-else name="excrow" tag="ul" class="exc-list">
              <li v-for="(item, i) in formExceptions" :key="`${item.appId}-${item.code}`" class="exc" :data-effect="item.effect">
                <div class="exc__main">
                  <div class="exc__row1">
                    <span class="exc__dot" aria-hidden="true"></span>
                    <span class="exc__code mono" :title="item.code">{{ item.code }}</span>
                    <span class="exc__app">{{ item.appLabel }}</span>
                  </div>
                  <!-- 目录里查不到这个码时不留空行：empty 态用 v-if 而不是 :empty，
                       空文本节点是否算"没有子节点"各浏览器不一致 -->
                  <span v-if="labelOf(item.code)" class="exc__label">{{ labelOf(item.code) }}</span>
                </div>
                <!-- 处置用分段按钮而不是下拉：一眼看到「允许/拒绝」，点一下就换 -->
                <div class="exc-toggle" role="group" :aria-label="`${item.code} 的处置`">
                  <button
                    type="button"
                    :class="['exc-toggle__btn', { 'is-on': item.effect === 'allow' }]"
                    :aria-pressed="item.effect === 'allow'"
                    @click="item.effect = 'allow'"
                  >
                    允许
                  </button>
                  <button
                    type="button"
                    :class="['exc-toggle__btn', 'is-deny', { 'is-on': item.effect === 'deny' }]"
                    :aria-pressed="item.effect === 'deny'"
                    @click="item.effect = 'deny'"
                  >
                    拒绝
                  </button>
                </div>
                <button
                  class="exc__remove"
                  type="button"
                  :aria-label="`移除 ${item.code} 的例外`"
                  @click="formExceptions.splice(i, 1)"
                >
                  <X :size="14" />
                </button>
              </li>
            </TransitionGroup>

            <div class="exc-add">
              <input
                v-model="excCode"
                class="input"
                :list="catalogListId"
                :disabled="excAddLocked"
                :placeholder="catalogMissing ? '权限码目录未加载' : '权限码，如 admin:user:delete'"
                autocomplete="off"
                spellcheck="false"
                @keydown.enter="onExcEnter"
                @input="excAddError = ''"
              />
              <!-- 保留原生 datalist：浏览器自带过滤与键盘操作，自建下拉要走一套自己的
                   焦点/边界/移动端适配，收益远小于维护成本 -->
              <datalist :id="catalogListId">
                <option v-for="item in excCatalog" :key="item.code" :value="item.code">
                  {{ item.label }} · {{ item.domainName }}
                </option>
              </datalist>
              <div class="exc-toggle" role="group" aria-label="新增例外的处置">
                <button
                  type="button"
                  :class="['exc-toggle__btn', { 'is-on': excEffect === 'allow' }]"
                  :aria-pressed="excEffect === 'allow'"
                  @click="excEffect = 'allow'"
                >
                  允许
                </button>
                <button
                  type="button"
                  :class="['exc-toggle__btn', 'is-deny', { 'is-on': excEffect === 'deny' }]"
                  :aria-pressed="excEffect === 'deny'"
                  @click="excEffect = 'deny'"
                >
                  拒绝
                </button>
              </div>
              <button
                class="btn btn--sm"
                type="button"
                :disabled="excAddLocked || !excCode.trim()"
                @click="addException"
              >
                <Plus :size="13" /> 添加
              </button>
            </div>
            <p class="uec-catalog">
              共 {{ excCatalog.length }} 个权限码可选<template v-if="excQuery">
                · <span :class="{ 'is-bad': matchCount === 0 }">{{ matchText }}</span>
              </template>
            </p>
            <p v-if="excAddError" class="field__error">{{ excAddError }}</p>
          </template>
        </section>
      </div>

      <footer class="modal__foot uec-foot">
        <div class="uec-foot__meta">
          <p v-if="dirtyCount > 0 && phase !== 'saved'" class="uec-dirty">{{ dirtyText }}</p>
          <!-- 长错误压到两行以内：它一撑高就会把右侧按钮顶下去，按钮位置跳动最招人误点 -->
          <p v-if="errorMessage" class="uec-error" role="alert">{{ errorMessage }}</p>
        </div>
        <button class="btn btn--ghost" type="button" :disabled="submitting" @click="requestClose">取消</button>
        <button class="btn btn--primary" type="button" :disabled="submitting || phase === 'saved'" @click="submit">
          {{ phase === 'saving' ? '保存中…' : phase === 'saved' ? '已保存' : isEdit ? '保存' : '创建' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/*
 * 宽度由 `.modal--lg` 统一提供（800）；新建/编辑同宽，避免形态切换时弹窗横向跳动。
 */
.user-modal {
  /* 定位锚点：.sr-only 用的是 absolute，没有它就会被当成相对视口定位 */
  position: relative;
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
  color: var(--mauth-text-soft);
}

/* 关闭按钮：垫到最右，且只用一个图标宽度（全局 .btn--icon.btn--sm 已经给了 28×28） */
.uec-close {
  margin-left: auto;
}

/* ── 身份带 ─────────────────────────────────────────────────
 * 放在 head 与 body 之间、body 之外：滚动的是 body，这一条不跟着走 ——
 * 长表单滚到"权限例外"时，仍然看得见正在改谁。
 */
.uec-ident {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--mauth-border);
  background: color-mix(in srgb, var(--mauth-text) 3%, var(--mauth-surface));
}

.uec-ident__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--mauth-text) 5%, var(--mauth-surface));
  color: var(--mauth-text-mid);
  font-size: 12px;
  font-weight: 650;
}

.uec-ident__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.uec-ident__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
  color: var(--mauth-text);
}

.uec-ident__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-soft);
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
  flex-wrap: wrap;
  gap: 8px;
}

/*
 * 分节标题保持 eyebrow 的 faint 档
 *
 * 这不是"要读的说明"而是版面骨架（全仓 `--mauth-track-eyebrow` 都配 faint：
 * LogPurgeDialog、dashboard 的 res dt 同理），加深会跟正文抢注意力。
 */
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

/*
 * 选择器列表高度：编辑弹窗里有纵向空间，给到 320
 *
 * 详情页默认 264、批量授权 240 —— 同一个选择器在三种容器里的可视行数不同，
 * 由宿主给变量而不是让组件去猜自己在哪。
 */
.uec-picker {
  --rp-list-max: 320px;
}

/* 例外区被改过：只给一个字，不占版面 */
.uec-dirty-note {
  font-size: 11px;
  color: var(--mauth-primary);
}

/*
 * 说明文字统一走 .uec-hint
 *
 * 全局 `.field__hint` / `.form-hint` 用的是 faint 档 —— 那是"附注"的色阶，
 * 而这里几段说明（职级规则、超管限制、例外用途）是**要读**的正文级信息，
 * 用 faint 会让人直接跳过。顺手也避开了与全局类的同权重覆盖问题。
 */
.uec-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--mauth-text-soft);
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

/*
 * 字段标签在本组件里统一加深一档
 *
 * 全局是 `--mauth-text-soft`，和下面的说明文字同一个色阶，扫读时分不出"这是标签"
 * 还是"这是注"。用后代选择器是为了稳赢全局 `.field__label`（同权重只靠顺序，不可靠）。
 */
.modal__body .field__label {
  font-size: 12px;
  color: var(--mauth-text-mid);
}

/* 标签行：左标签、右刻度量程 / 长度要求 */
.uec-labelrow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--mauth-text-mid);
}

.uec-range {
  font-size: 11px;
  color: var(--mauth-text-soft);
  font-variant-numeric: tabular-nums;
}

/*
 * 只读态：全局没有 `.input:disabled` 的样式，读起来跟可编辑的一模一样。
 * 带上 `.modal__body` 是为了压过全局的 `.input:hover` —— 同权重只靠顺序，飘得很。
 */
.modal__body .input:disabled,
.modal__body .select:disabled {
  background: color-mix(in srgb, var(--mauth-text) 4%, var(--mauth-surface));
  border-color: var(--mauth-border);
  color: var(--mauth-text-soft);
  cursor: not-allowed;
}

/* ── 职级步进 ─────────────────────────────────────────────── */
.uec-stepper {
  position: relative;
  display: block;
}

/* 两个 26 宽的步进按钮横排 + 4 右边距 = 58，正好留出让开按钮的内距 */
.uec-stepper .uec-num {
  padding-right: 58px;
}

/* 隐藏原生 spinner：自己画的两个按钮已经覆盖"加一/减一"，还多一层皮肤差异 */
.uec-num {
  appearance: textfield;
  -moz-appearance: textfield;
}

.uec-num::-webkit-outer-spin-button,
.uec-num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.uec-steps {
  position: absolute;
  top: 50%;
  right: 4px;
  display: flex;
  gap: 2px;
  transform: translateY(-50%);
}

.uec-step {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.uec-step:hover:not(:disabled) {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.uec-step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 状态分段 ───────────────────────────────────────────────
 * 容器沿用 .tabbar 的视觉，但撑满整格、去掉 12px 下边距（它是字段本体，不是筛选条）。
 */
.uec-seg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  width: 100%;
  height: var(--control-h);
  padding: 3px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 8px;
  background: var(--mauth-tabbar-bg, var(--mauth-surface-2));
}

.uec-seg .tab {
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
}

/*
 * 选中态不用主色
 *
 * 全局 `.tab.is-on` 是 `color: var(--mauth-primary)`，但这段控件的选项里
 * "冻结"本身就是危险语义 —— 一个控件里同时出现主色和高亮白块，读起来像
 * "允许 / 不允许"。这里改成中性白块 + 正文字色，把颜色语义留给状态点。
 */
.uec-seg .tab.is-on {
  background: var(--mauth-surface);
  color: var(--mauth-text);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--mauth-text) 12%, transparent);
}

.uec-seg .tab:disabled {
  cursor: not-allowed;
}

/*
 * 整段只读：**不**整体降透明度
 *
 * 只读恰恰发生在"最需要读到值"的时候 —— 超管自改自己时状态只读，而"这账号现在是正常
 * 还是冻结"就是他最该确认的一条。整体 opacity .55 会把选中段和未选中段压成一样淡，
 * 等于把这条信息抹掉（实拍已证实看不出选中项）。
 * 改成"灰化容器 + 未选中段更淡 + 选中段留白块与内描边"：读得出值，也看得出不能点。
 * 按钮本身仍是 disabled（见模板），这里只负责让它看起来是"只读"而不是"禁用"。
 */
.uec-seg.is-locked {
  /* 与只读输入框同一种"灰化"语言：底色降一档，描边收到正常档，不再整体降透明度 */
  background: color-mix(in srgb, var(--mauth-text) 4%, var(--mauth-surface));
  border-color: var(--mauth-border);
  pointer-events: none;
}

/* 未选中段：弱化到只剩轮廓 */
.uec-seg.is-locked .tab {
  color: var(--mauth-text-faint);
}

/* 选中段：必须仍是一块能看出"被选中"的白，否则只读时读不出当前值 */
.uec-seg.is-locked .tab.is-on {
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--mauth-border-strong);
}

.uec-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--mauth-text-faint);
}

.uec-dot[data-tone='ok'] {
  background: var(--mauth-success);
}

.uec-dot[data-tone='danger'] {
  background: var(--mauth-danger);
}

.uec-dot[data-tone='muted'] {
  background: var(--mauth-text-faint);
}

/* .field 的 6px 间距占掉 2px，净剩 4px —— 提示要紧贴控件，不能看着像下个字段的标签 */
.uec-freeze {
  margin: -2px 0 0;
  font-size: 12px;
  color: var(--mauth-danger);
}

/* ── 初始密码 ─────────────────────────────────────────────── */
.uec-pw {
  position: relative;
  display: block;
}

.uec-pw .input {
  padding-right: 46px;
}

/* 文字按钮而不是 .btn：这里只需要"能点的一行字"，多一个边框会跟输入框抢注意力 */
.uec-pw__toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 11px;
  cursor: pointer;
  transform: translateY(-50%);
  transition: color 0.16s var(--ease);
}

.uec-pw__toggle:hover {
  color: var(--mauth-text);
}

/* ── 权限例外 ───────────────────────────────────────────────── */

/* 骨架：借全局 .skeleton-row 的渐变，只改尺寸（复合选择器是为了稳赢全局的同权重规则） */
.uec-skeletons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.uec-skeleton.skeleton-row {
  height: 34px;
  margin: 0;
  border-radius: var(--mauth-radius-xs);
}

.uec-loaderror {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-danger);
}

.exc-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一条两行：上行权限码 + 应用，下行中文名；右侧固定放处置与移除 */
.exc {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
}

/* 拒绝行整体染危险底：一屏里哪几条是"收回权限"必须扫一眼就分出来 */
.exc[data-effect='deny'] {
  background: color-mix(in srgb, var(--mauth-danger) 5%, transparent);
  border-color: color-mix(in srgb, var(--mauth-danger) 22%, transparent);
}

.exc__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.exc__row1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* 状态点：允许=成功色、拒绝=危险色，比读文字快 */
.exc__dot {
  flex: none;
  width: 5px;
  height: 5px;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--mauth-text);
}

.exc__app {
  flex: none;
  font-size: 10.5px;
  color: var(--mauth-text-soft);
}

.exc__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--mauth-text-soft);
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
  color: var(--mauth-text-soft);
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
  color: var(--mauth-text-soft);
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
  color: var(--mauth-text-soft);
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
  min-width: 160px;
}

/*
 * 同行控件等高
 *
 * 与全局 `.filterbar .btn--sm` 是同一条规则：36 高的输入框旁边放 30 高的小按钮，
 * 两者边框会错开 3px，看起来像排版事故。改成跟 --control-h 走，密度切档也自动跟上。
 */
.exc-add .btn {
  height: var(--control-h);
}

.uec-catalog {
  margin: 0;
  font-size: 11px;
  color: var(--mauth-text-soft);
}

/* 一个都没匹配上时这句话要变色：它是"你打的字有问题"的即时反馈 */
.uec-catalog .is-bad {
  color: var(--mauth-danger);
}

/* 行进出动画：只动透明度与 4px 位移，避免行高变化把整节内容顶来顶去 */
.excrow-enter-active {
  transition:
    opacity 0.18s var(--ease),
    transform 0.18s var(--ease);
}

.excrow-leave-active {
  transition: opacity 0.12s var(--ease);
}

.excrow-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.excrow-leave-to {
  opacity: 0;
}

.excrow-move {
  transition: transform 0.2s var(--ease);
}

/* ── footer ───────────────────────────────────────────────── */

/* 允许换行：窄屏时脏提示要能独占一行，不被两个按钮挤成三截 */
.uec-foot {
  flex-wrap: wrap;
}

.uec-foot__meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin-right: auto;
}

/* 手机上全局把按钮做成 flex:1 均分，脏提示再抢一份就会两边都难看 */
@media (max-width: 820px) {
  .uec-foot__meta {
    flex: 1 1 100%;
    margin-right: 0;
  }
}

.uec-dirty {
  margin: 0;
  font-size: 11.5px;
  color: var(--mauth-text-soft);
}

/* 错误条限高两行：再长就截断，不然它一撑高会把右侧按钮挤到第二行 */
.uec-error {
  margin: 0;
  max-height: 2.9em;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.45;
  color: var(--mauth-danger);
}

/* 项目里没有全局 .sr-only（只有 DeltaPill 内部定义过），这里补一份自用 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
