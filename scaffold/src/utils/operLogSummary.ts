/**
 * 审计事件 → 一句人话
 *
 * `audit_logs.event` 是英文事件码，`details` 是各业务自己塞的 JSON。运维要回答的
 * 是「谁对谁做了什么、从什么改成什么」，不是读一串 `PERMISSION_CHANGE`。
 *
 * 🔴 **只翻译 details 里真实存在的字段，缺的就说缺**。这里最容易犯的错是"看起来
 *    像"：比如 `details.method` 在 `STEPUP_CHALLENGE` 里是二次验证方式、在别的事件
 *    里可能是 HTTP 方法，模板里绝不能按同一个标签渲染。同理，没有人名/对象名的
 *    事件就只说"记录了 N 个字段"，不猜。
 *
 * 未收录的事件码走通用兜底：把 details 的标量字段拼成 `键=值` 列表，仍然比一行
 * 事件码有用，且不会因为后端新增事件就显示空白。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */

/** 摘要输入（列表行与详情弹窗共用，只要这两个字段） */
export interface OperSummaryInput {
  action: string;
  /** 后端 `JSON.stringify(details)` */
  detail?: string;
}

/** 二次验证方式的中文名 */
const STEPUP_METHOD: Record<string, string> = { password: '密码', email: '邮箱验证码' };

/**
 * 应用标识 → 中文名
 *
 * 摘要里写「应用 admin」等于没翻译；未知标识原样返回，不硬猜。
 */
const APP_LABEL: Record<string, string> = {
  console: '管理后台',
  admin: '管理后台',
  GLOBAL: '全局',
  oauth21: 'OAuth',
  firewall: '防火墙',
  posecraft: 'Posecraft',
  retroweb: 'RetroWeb',
  notice: '通知'
};

/**
 * 应用显示名
 *
 * @param id 应用标识
 * @returns 中文名或原标识
 */
function appText(id: string): string {
  if (!id) return '';
  return APP_LABEL[id] || id;
}

/**
 * 解析 details
 *
 * @param raw JSON 字符串
 * @returns 对象（解析失败为空对象，绝不抛）
 */
function parse(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * 取第一个有值的键（后端不同写入点用的字段名不完全一致）
 *
 * @param source 载荷
 * @param keys 候选键
 * @returns 字符串值或空串
 */
function pick(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return String(value);
  }
  return '';
}

/**
 * 字段变更 → `allowRoles: a,b → admin`
 *
 * @param change 后端 `changes[]` 的一项
 * @returns 可读片段
 */
function changeText(change: unknown): string {
  if (!change || typeof change !== 'object') return '';
  const item = change as Record<string, unknown>;
  const field = String(item.field || item.key || '');
  const from = item.from;
  const to = item.to;
  const show = (value: unknown): string => {
    if (value === null || value === undefined) return '空';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '空';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  if (!field) return '';
  // 值没变（direction=unchanged）时不写成 "a → a"，那是噪音
  if (show(from) === show(to)) return `${field} 保持 ${show(to)}`;
  return `${field}: ${show(from)} → ${show(to)}`;
}

/**
 * 清除日志的筛选条件 → 可读片段
 *
 * 清除是**不可逆**的操作，留痕必须让人一眼看出"按什么范围删的"。
 * 六七个键逐条写成 `startTime=..., username=...` 没人读得下去，所以按维度翻成人话。
 *
 * @param filters 后端留痕里的 conditions
 * @returns 条件描述（无条件时返回空串）
 */
function filterText(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  const from = pick(filters, ['startTime']);
  const to = pick(filters, ['endTime']);
  if (from || to) {
    const fmt = (value: string): string => (value ? value.replace('T', ' ').slice(0, 16) : '不限');
    parts.push(`时间 ${fmt(from)} ~ ${fmt(to)}`);
  }
  const username = pick(filters, ['username']);
  if (username) parts.push(`账号含「${username}」`);
  const ip = pick(filters, ['ip']);
  if (ip) parts.push(`IP 前缀 ${ip}`);
  const action = pick(filters, ['event', 'action']);
  if (action) parts.push(`事件 ${action}`);
  const status = pick(filters, ['status']);
  if (status) parts.push(status === '1' ? '仅成功记录' : '仅失败记录');
  const keyword = pick(filters, ['keyword']);
  if (keyword) parts.push(`关键词「${keyword}」`);
  return parts.join('、');
}

/**
 * 通用兜底：把标量字段拼成 `键=值`
 *
 * @param details 载荷
 * @returns 一句话（载荷为空时给空串）
 */
function fallback(details: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text) continue;
    parts.push(`${key}=${text.length > 40 ? `${text.slice(0, 40)}…` : text}`);
    if (parts.length >= 4) break;
  }
  return parts.join('，');
}

/**
 * 事件 → 摘要
 *
 * @param row 事件的 action 与 detail
 * @returns 一句中文说明
 */
export function summarizeOperEvent(row: OperSummaryInput): string {
  const details = parse(row.detail);
  const action = String(row.action || '');
  const target = pick(details, ['targetUsername', 'targetName', 'username', 'target', 'email']);
  const actorTarget = target ? `「${target}」` : '该对象';

  switch (action) {
    /* ── 二次验证：payload 里的 action 才是"要做什么"，method 是验证方式 ── */
    case 'STEPUP_CHALLENGE': {
      const intent = pick(details, ['action']) || '未知操作';
      const by = STEPUP_METHOD[pick(details, ['method'])] || pick(details, ['method']) || '未记录方式';
      return `为「${intent}」发起二次验证：目标 ${actorTarget}，方式 ${by}`;
    }

    /* ── 临时密码 ── */
    case 'USER_TEMP_PASSWORD': {
      const uses = pick(details, ['maxUses']);
      const until = pick(details, ['expiresAt']);
      const reason = pick(details, ['reason']);
      const bits = [`为 ${actorTarget} 签发临时密码`];
      if (uses) bits.push(`${uses} 次有效`);
      if (until) bits.push(`至 ${until.slice(0, 16).replace('T', ' ')}`);
      if (reason) bits.push(`原因：${reason}`);
      return bits.join('，');
    }

    /* ── 权限/配置变更：changes 是唯一能回答"改成什么"的字段 ── */
    case 'PERMISSION_CHANGE': {
      const path = pick(details, ['path', 'scope', 'target']);
      const list = Array.isArray(details.changes) ? details.changes.map(changeText).filter(Boolean) : [];
      const reason = pick(details, ['reason']);
      const head = path ? `修改 ${path}` : '修改权限';
      const body = list.length ? `：${list.join('；')}` : '（未记录字段级变化）';
      return `${head}${body}${reason ? `。原因：${reason}` : ''}`;
    }

    /* ── 部门变更：name 是部门名，有 changes 时再补"改了什么" ── */
    case 'DEPT_UPDATE': {
      const name = pick(details, ['name']);
      const list = Array.isArray(details.changes) ? details.changes.map(changeText).filter(Boolean) : [];
      const head = name ? `修改部门「${name}」` : '修改部门';
      return list.length ? `${head}：${list.join('；')}` : head;
    }

    /* ── 权限例外：给某个人单独加/收一个权限码（角色之外） ── */
    case 'USER_PERMISSION_INLINE': {
      const targetId = pick(details, ['targetId']);
      const targetName = pick(details, ['targetUsername']);
      const code = pick(details, ['code']);
      const app = pick(details, ['appId']);
      const effect = pick(details, ['effect']);
      const who = targetName ? `「${targetName}」` : targetId ? `用户 #${targetId}` : '该用户';
      const what = effect === 'allow' ? '单独允许' : effect === 'deny' ? '单独拒绝' : '恢复继承';
      return `为${who}${what}权限 ${code}${app ? `（${appText(app)}）` : ''}`;
    }

    /* ── 角色分配 ── */
    case 'ROLE_ASSIGNED': {
      const uid = pick(details, ['targetUid']);
      const roleId = pick(details, ['roleId']);
      return `为用户（${uid || '未知 uid'}）分配角色${roleId ? ` #${roleId}` : ''}`;
    }

    /* ── 踢设备下线：谁把谁的哪台设备踢了 ── */
    case 'SESSION_KICK_DEVICE': {
      const device = pick(details, ['deviceId']);
      const who = pick(details, ['targetUsername']);
      const app = pick(details, ['targetAppId']);
      const kicked = pick(details, ['kicked']);
      // 完整设备码 20 字符上下，摘要里缩成「前 12…后 4」，完整值在详情里
      const short = device.length > 18 ? `${device.slice(0, 12)}…${device.slice(-4)}` : device;
      if (details.self === true) return `下线了自己的设备「${short || '无设备码'}」`;
      const head = who
        ? `将「${who}」的设备「${short || '无设备码'}」下线`
        : `下线设备「${short || '无设备码'}」`;
      return `${head}${app ? `（${appText(app)}）` : ''}${kicked ? `，踢出 ${kicked} 个会话` : ''}`;
    }

    case 'USER_TEMP_PASSWORD_USED':
      return `临时密码已被使用${target ? `（${target}）` : ''}`;

    /* ── 批量导入 ── */
    case 'USER_IMPORT': {
      const total = pick(details, ['total']) || '0';
      const created = pick(details, ['created']) || '0';
      const failed = pick(details, ['failed']) || '0';
      return `批量导入用户：共 ${total} 条，成功 ${created} 条${failed !== '0' ? `，失败 ${failed} 条` : ''}`;
    }

    /* ── 注销申请 ── */
    case 'user.delete.request':
    case 'USER_DELETE_REQUEST': {
      const until = pick(details, ['scheduledAt']);
      const reason = pick(details, ['reason']);
      return `提交注销申请：目标 ${actorTarget}${until ? `，${until.slice(0, 10)} 执行` : ''}${reason ? `，原因：${reason}` : ''}`;
    }

    /* ── 注册 ── */
    case 'REGISTER_SUCCESS':
      return `新账号注册成功${target ? `（${target}）` : ''}`;
    case 'REGISTER_FAILED': {
      const reason = pick(details, ['reason']);
      return `注册失败${target ? `（${target}）` : ''}${reason ? `：${reason}` : ''}`;
    }

    /* ── 清除日志：不可逆，摘要必须带"删了多少 + 按什么范围" ── */
    case 'LOG_PURGE': {
      const scope = pick(details, ['scope']) === 'login' ? '登录日志' : '操作日志';
      const removed = pick(details, ['removed']) || '0';
      const filters = details.filters && typeof details.filters === 'object' ? (details.filters as Record<string, unknown>) : {};
      const condition = filterText(filters);
      return `清除了 ${removed} 条${scope}${condition ? `，条件：${condition}` : ''}`;
    }

    /* ── 会话类（正常不会出现在操作日志里，出现说明排除条件漏了） ── */
    case 'LOGIN_SUCCESS':
    case 'LOGIN':
      return '登录成功（该事件属登录日志，不应出现在这里）';

    default: {
      const extra = fallback(details);
      return extra ? `${action}：${extra}` : `${action}（未附带详情）`;
    }
  }
}
