/**
 * 字符串解析工具
 *
 * 目前只有一件职责：把「逗号分隔的环境变量」解析成数组。
 *
 * 为什么值得单独抽：全仓有 6 处各写一遍 `.split(',').map(trim).filter(Boolean)`，
 * 但**默认值策略**不同（CORS 白名单空 = 拒绝全部跨域；trustProxy 空 = 回退回环地址；
 * 设备类型空 = 全部互顶），这正是最容易在复制粘贴中丢掉语义的地方。
 * 现在的写法强制调用方显式声明 fallback —— 不写就是空数组，不会被"顺手"给一个安全默认值。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/**
 * 解析逗号分隔的列表
 *
 * @param {string|undefined|null} raw - 原始值（环境变量 / 配置字段）
 * @param {object} [options]
 * @param {string} [options.separator=','] - 分隔符
 * @param {string[]} [options.fallback=[]] - 未配置或全为空白项时的返回值（会被浅拷贝，调用方改不到内部常量）
 * @returns {string[]} 去空白、去空项后的列表
 */
function parseCsvList(raw, { separator = ',', fallback = [] } = {}) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return [...fallback];

  const items = text
    .split(separator)
    .map(s => s.trim())
    .filter(Boolean);

  return items.length > 0 ? items : [...fallback];
}

export { parseCsvList };
