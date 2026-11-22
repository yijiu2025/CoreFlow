/**
 * 通知模板服务
 *
 * 占位符统一用 `{{name}}`（双花括号）。仓库里旧的邮件模板用的是单花括号 `{code}`，
 * 这里是**新表新规则**：双花括号不会被正文里常见的 JSON / CSS 花括号误伤，
 * 也让"渲染"与"模板"的边界一眼可辨。
 *
 * 投递时按「事件编码」或「事件编码.渠道」找启用中的模板；找不到就用兜底正文，
 * 保证闭环可用（否则管理员没建模板时所有通知都静默失败，像功能没上线）。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import noticeCenterDao from '../dao/notice-center.dao.js';
import { getChannel } from '../constants.js';

/** 占位符：字母/数字开头，允许点、下划线、短横线（如 {{user.name}}） */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_][a-zA-Z0-9_.-]*)\s*\}\}/g;

/** 编码格式：与事件 code 同形，便于把两者对齐 */
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * 提取文本里出现的变量名（去重）
 *
 * @param {string} text 模板文本
 * @returns {string[]} 变量名数组
 */
function extractVariables(text) {
  const found = new Set();
  for (const match of String(text ?? '').matchAll(PLACEHOLDER_PATTERN)) found.add(match[1]);
  return [...found];
}

/**
 * HTML 转义
 *
 * 为什么必须转义：payload 里可能是用户名、邮箱等用户可控内容，直接拼进 HTML
 * 邮件等于把"邮件正文"变成注入面（收件人客户端会渲染任意标签）。
 *
 * @param {unknown} value 原始值
 * @returns {string} 转义后的文本
 */
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

/**
 * 渲染模板（纯文本替换，不做转义）
 *
 * 缺失变量直接抛错而不是留空：留空会发出"您好，您的验证码是："这种没有内容的
 * 邮件，收件人只会当成垃圾/故障；抛错则能在日志里明确写出缺哪个变量。
 *
 * @param {string} text 模板文本
 * @param {object} payload 变量值
 * @returns {string} 渲染结果
 * @throws {Error} 变量缺失
 */
function renderTemplate(text, payload = {}) {
  return String(text ?? '').replace(PLACEHOLDER_PATTERN, (match, name) => {
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, name)) {
      throw new Error(`模板变量缺失: ${name}`);
    }
    return String(payload[name] ?? '');
  });
}

/**
 * 渲染 HTML 正文（变量值做 HTML 转义）
 *
 * @param {string} text 模板文本
 * @param {object} payload 变量值
 * @returns {string} 渲染结果
 */
function renderHtml(text, payload = {}) {
  return String(text ?? '').replace(PLACEHOLDER_PATTERN, (match, name) => {
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, name)) {
      throw new Error(`模板变量缺失: ${name}`);
    }
    return escapeHtml(payload[name]);
  });
}

/**
 * 分析正文/标题里的变量与声明是否一致
 *
 * @param {object} input 输入
 * @param {string} [input.subject] 标题
 * @param {string} [input.body] 正文
 * @param {string[]} [input.variables] 声明变量
 * @returns {{declared: string[], undeclared: string[]}} 声明列表与未声明列表
 * @throws {Error} variables 不是字符串数组
 */
function analyzeTemplate({ subject, body, variables } = {}) {
  if (variables !== undefined && variables !== null && !Array.isArray(variables)) {
    throw new Error('variables 必须是字符串数组');
  }
  const declared = [];
  for (const item of variables || []) {
    if (typeof item !== 'string' || !item.trim()) throw new Error('variables 里不能有空项');
    const name = item.trim();
    if (!declared.includes(name)) declared.push(name);
  }
  const used = [...new Set([...extractVariables(subject), ...extractVariables(body)])];
  return { declared, undeclared: used.filter(name => !declared.includes(name)) };
}

/**
 * 校验并规范化模板写入字段
 *
 * @param {object} payload 请求体
 * @param {object} [options] 选项
 * @param {boolean} [options.requireCode] 是否要求 code（新建时 true）
 * @param {boolean} [options.strictVariables] 是否在此处判定未声明变量（部分更新时交给合并后判定）
 * @returns {object} 可直接写库的字段
 */
function normalizeTemplatePayload(payload, { requireCode = false, strictVariables = true } = {}) {
  const result = {};

  if (requireCode || payload.code !== undefined) {
    const code = String(payload.code || '').trim();
    if (!code) throw new Error('模板编码不能为空');
    if (code.length > 64) throw new Error('模板编码不能超过 64 个字符');
    if (!CODE_PATTERN.test(code)) throw new Error('模板编码只能包含字母、数字、点、下划线与短横线');
    result.code = code;
  }

  if (requireCode || payload.name !== undefined) {
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('模板名称不能为空');
    if (name.length > 64) throw new Error('模板名称不能超过 64 个字符');
    result.name = name;
  }

  if (requireCode || payload.channel !== undefined) {
    const channel = String(payload.channel || '').trim();
    if (!getChannel(channel)) throw new Error(`未知渠道: ${channel}`);
    result.channel = channel;
  }

  if (requireCode || payload.body !== undefined) {
    const body = String(payload.body ?? '');
    if (!body.trim()) throw new Error('模板正文不能为空');
    result.body = body;
  }

  if (payload.subject !== undefined) {
    const subject = payload.subject === null ? null : String(payload.subject);
    if (subject !== null && subject.length > 200) throw new Error('标题不能超过 200 个字符');
    result.subject = subject;
  }

  if (payload.variables !== undefined || payload.subject !== undefined || payload.body !== undefined) {
    const { declared, undeclared } = analyzeTemplate({
      subject: payload.subject,
      body: payload.body,
      variables: payload.variables
    });
    if (strictVariables && undeclared.length > 0) {
      throw new Error(`正文使用了未声明的变量: ${undeclared.join(', ')}`);
    }
    if (payload.variables !== undefined) result.variables = declared;
  }

  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') throw new Error('enabled 必须是布尔值');
    result.enabled = payload.enabled;
  }

  return result;
}

/**
 * 模板列表
 *
 * @param {object} [params] 过滤
 * @param {string} [params.channel] 渠道 id
 * @returns {Promise<Array<object>>} plain object 列表
 */
async function list({ channel } = {}) {
  const rows = await noticeCenterDao.listTemplates({ channel });
  return rows.map(row => row.get({ plain: true }));
}

/**
 * 新建模板
 *
 * @param {object} payload 请求体
 * @returns {Promise<object>} 新模板（plain object）
 */
async function create(payload = {}) {
  const fields = normalizeTemplatePayload(payload, { requireCode: true });
  if (await noticeCenterDao.findTemplateByCode(fields.code)) {
    throw new Error(`模板编码已存在: ${fields.code}`);
  }
  const created = await noticeCenterDao.createTemplate({
    subject: null,
    variables: [],
    enabled: true,
    ...fields
  });
  return created.get({ plain: true });
}

/**
 * 更新模板
 *
 * @param {number} id 模板 id
 * @param {object} payload 请求体
 * @returns {Promise<object>} 更新后的模板（plain object）
 */
async function update(id, payload = {}) {
  const template = await noticeCenterDao.findTemplate(id);
  if (!template) throw new Error('模板不存在');

  const fields = normalizeTemplatePayload(payload, { strictVariables: false });
  // 变量校验需要"合并后的全文"：只改 body 时也要拿库里的 subject/variables 一起判。
  // 只在正文/标题/变量真的出现在本次提交时才判 —— 否则改个 enabled 也会被历史脏模板卡住。
  if (fields.subject !== undefined || fields.body !== undefined || fields.variables !== undefined) {
    const merged = {
      subject: fields.subject !== undefined ? fields.subject : template.subject,
      body: fields.body !== undefined ? fields.body : template.body,
      variables: fields.variables !== undefined ? fields.variables : template.variables
    };
    const { undeclared } = analyzeTemplate(merged);
    if (undeclared.length > 0) throw new Error(`正文使用了未声明的变量: ${undeclared.join(', ')}`);
  }

  if (fields.code && fields.code !== template.code) {
    if (await noticeCenterDao.findTemplateByCode(fields.code)) {
      throw new Error(`模板编码已存在: ${fields.code}`);
    }
  }

  const updated = await noticeCenterDao.updateTemplate(template, fields);
  return updated.get({ plain: true });
}

/**
 * 删除模板
 *
 * @param {number} id 模板 id
 * @returns {Promise<void>}
 */
async function remove(id) {
  const template = await noticeCenterDao.findTemplate(id);
  if (!template) throw new Error('模板不存在');
  await noticeCenterDao.removeTemplate(template);
}

/**
 * 取某事件在某渠道下启用中的模板（渲染时用）
 *
 * @param {string} eventCode 事件 code
 * @param {string} channel 渠道 id
 * @returns {Promise<{subject: string|null, body: string, variables: string[]}|null>}
 */
async function findForEvent(eventCode, channel) {
  const template = await noticeCenterDao.findEnabledTemplate(eventCode, channel);
  if (!template) return null;
  return {
    subject: template.subject,
    body: template.body,
    variables: Array.isArray(template.variables) ? template.variables : []
  };
}

export {
  extractVariables,
  escapeHtml,
  renderTemplate,
  renderHtml,
  analyzeTemplate,
  list,
  create,
  update,
  remove,
  findForEvent
};
