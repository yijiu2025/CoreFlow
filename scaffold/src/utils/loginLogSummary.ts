/**
 * 会话事件 → 一句人话
 *
 * `session_logs.event` 是英文事件码，`details` 是写入方塞进去的 JSON。运维要回答的
 * 是「这次登录/退出/续期到底发生了什么」，不是读 `SESSION_REFRESH`。
 *
 * 🔴 **只翻译 details 里真实存在的字段，缺的就说缺**。实测库里的形态（96 条）：
 *
 * ```
 * LOGIN            {rememberMe, deviceId, deviceType}
 * KICK             {reason, count}          ← 41 条，最多的一类
 * SESSION_REFRESH  {oldSessionId, newSessionId, rotatedRefreshToken, reason}
 * ```
 *
 * 其中 `KICK` 最容易误判：它每次登录后都会紧跟着出现一条，看着像"有人被踢"，其实
 * 是「单设备单登录」把上一次的旧会话顶掉 —— 新登录踢旧的，属正常行为。所以这里
 * 必须按 `reason` 分开说，不能统一写"会话被踢出"。
 *
 * 未收录的事件码走通用兜底：把 details 的标量字段拼成 `键=值`，仍然比一行事件码
 * 有用，且后端新增事件时不会变成空白。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */

/** 摘要输入（列表行与详情弹窗共用） */
export interface LoginSummaryInput {
  event: string;
  details?: Record<string, unknown> | null;
}

/** KICK 的原因 → 中文说明 */
const KICK_REASONS: Record<string, string> = {
  single_device_login: '同应用同设备类型的新登录，把上一次的旧会话顶下线（单设备单登录）',
  kick_by_device_id: '管理员按设备远程下线',
  user_kicked: '管理员主动下线该会话',
  kick_all: '该用户全部会话被清空（改密 / 注销 / 管理员操作）'
};

/** 设备类型 → 中文名 */
const DEVICE_TYPES: Record<string, string> = {
  browser: '浏览器',
  mobile: '手机',
  tablet: '平板',
  mini: '小程序',
  standard: '标准端',
  desktop: '桌面端'
};

/**
 * 事件中文名
 *
 * @param event 事件码
 * @returns 中文名（未收录时原样返回，不编造）
 */
export function loginEventLabel(event: string): string {
  const map: Record<string, string> = {
    LOGIN: '登录',
    LOGIN_SUCCESS: '登录成功',
    LOGIN_FAILED: '登录失败',
    LOGOUT: '退出登录',
    KICK: '会话下线',
    SESSION_REFRESH: '会话续期',
    FORBIDDEN: '访问被拒'
  };
  return map[event] || event;
}

/**
 * 取 details 里的字符串值
 *
 * @param source 载荷
 * @param key 键名
 * @returns 字符串（缺失或非标量时为空串）
 */
function str(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

/**
 * 一句话说明这次事件意味着什么
 *
 * @param row 含事件码与 details 的行
 * @returns 说明文案（永不返回空串）
 */
export function describeLoginEvent(row: LoginSummaryInput): string {
  const details = row.details || {};
  const reason = str(details, 'reason');
  const event = row.event;

  if (event === 'LOGIN' || event === 'LOGIN_SUCCESS') {
    const parts = ['登录成功，已创建新会话'];
    const device = str(details, 'deviceType');
    if (device) parts.push(`设备 ${DEVICE_TYPES[device] || device}`);
    const deviceId = str(details, 'deviceId');
    if (deviceId) parts.push(`标识 ${deviceId}`);
    if (details.rememberMe === true) parts.push('勾选了记住登录');
    return `${parts.join('，')}。`;
  }

  if (event === 'LOGIN_FAILED') {
    const map: Record<string, string> = {
      bad_password: '账号或密码错误',
      user_not_found: '账号不存在',
      user_disabled: '账号已被冻结',
      user_locked: '账号因连续失败被临时锁定',
      captcha_invalid: '验证码错误',
      mfa_invalid: '二次验证码错误'
    };
    return `登录失败（${map[reason] || reason || '原因未记录'}）。`;
  }

  if (event === 'LOGOUT') return '主动退出，会话已注销。';

  if (event === 'KICK') {
    const base = KICK_REASONS[reason] || `会话被下线（${reason || '原因未记录'}）`;
    // 🔴 只有 details 里**真的有 count** 才提数量。缺这个字段时按 0 处理会凭空
    //    说出"当时没有活跃会话"，把一个没记录的事实编成结论。
    const rawCount = details.count;
    const count = Number(rawCount);
    if (rawCount !== undefined && rawCount !== null && Number.isFinite(count)) {
      // count = 0 是真实存在的情况（kick_all 在没有活跃会话时被调用），要明说
      if (count > 0) return `${base}；共下线 ${count} 个会话。`;
      return `${base}；当时没有活跃会话，实际下线 0 个。`;
    }
    return `${base}。`;
  }

  if (event === 'SESSION_REFRESH') {
    const rotated = details.rotatedRefreshToken === true;
    const why = reason === 'cookie_expired_auto_refresh' ? '会话 cookie 到期，前端主动续期' : reason || '原因未记录';
    return `会话静默续期（${why}）${rotated ? '，刷新令牌已轮换' : ''}。`;
  }

  if (event === 'FORBIDDEN') return `访问被拒${reason ? `（${reason}）` : ''}。`;

  // 兜底：把标量字段拼出来，至少让人看到这条记录带了什么
  const pairs = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .slice(0, 4)
    .map(([key, value]) => `${key}=${String(value)}`);
  if (!pairs.length) return '该事件未附带可解释的字段。';
  return `${event}：${pairs.join('，')}。`;
}
