/**
 * 终端输出格式化模块
 * 提供表格打印、彩色输出、进度显示等功能
 *
 * @module scripts/lib/table
 */

// ============== ANSI 颜色常量 ==============

/**
 * ANSI 颜色代码
 * @type {object}
 */
export const colors = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  italic:    '\x1b[3m',
  underline: '\x1b[4m',

  // 前景色
  black:   '\x1b[30m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',

  // 背景色
  bgRed:     '\x1b[41m',
  bgGreen:   '\x1b[42m',
  bgYellow:  '\x1b[43m',
  bgBlue:    '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan:    '\x1b[46m',
};

// ============== 表格打印 ==============

/**
 * 打印表格
 * @param {string[]} headers - 表头数组
 * @param {Array<Array<string>>} rows - 数据行数组
 * @param {object} [options={}] - 配置选项
 * @param {number} [options.padding=2] - 单元格内边距
 * @param {number} [options.maxWidth=50] - 列最大宽度
 * @param {boolean} [options.showIndex=false] - 是否显示行号
 *
 * @example
 * printTable(
 *   ['ID', '名称', '状态'],
 *   [[1, '测试', '✅'], [2, '示例', '❌']],
 *   { showIndex: true }
 * );
 */
export function printTable(headers, rows, options = {}) {
  const { padding = 2, maxWidth = 50, showIndex = false } = options;

  // 添加行号列
  if (showIndex) {
    headers = ['#', ...headers];
    rows = rows.map((row, i) => [String(i + 1), ...row]);
  }

  // 计算每列宽度
  const widths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => {
      const cellLen = getDisplayLength(String(row[i] || ''));
      return Math.max(max, cellLen);
    }, 0);
    return Math.min(Math.max(getDisplayLength(h), maxRow) + padding, maxWidth);
  });

  // 生成分隔线
  const line = '─'.repeat(widths.reduce((a, b) => a + b, 0) + headers.length - 1);

  // 打印表头
  console.log(line);
  console.log(headers.map((h, i) => padRight(h, widths[i])).join('│'));
  console.log(line);

  // 打印数据行
  rows.forEach((row) => {
    console.log(row.map((cell, i) => padRight(String(cell || ''), widths[i])).join('│'));
  });

  console.log(line);
}

/**
 * 获取字符串显示长度（正确处理中文字符和 ANSI 颜色代码）
 * @param {string} str - 输入字符串
 * @returns {number} 显示宽度
 * @private
 */
function getDisplayLength(str) {
  // 移除 ANSI 颜色代码
  const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  let length = 0;
  for (const char of cleanStr) {
    // 中文字符占 2 个宽度
    length += char.charCodeAt(0) > 255 ? 2 : 1;
  }
  return length;
}

/**
 * 右填充字符串到指定宽度
 * @param {string} str - 输入字符串
 * @param {number} width - 目标宽度
 * @returns {string} 填充后的字符串
 * @private
 */
function padRight(str, width) {
  const displayLen = getDisplayLength(str);
  const padding = Math.max(0, width - displayLen);
  return str + ' '.repeat(padding);
}

// ============== 彩色输出 ==============

/**
 * 带颜色打印文本
 * @param {string} color - 颜色名（colors 对象中的键）
 * @param {string} text - 文本内容
 */
export function colorPrint(color, text) {
  const colorCode = colors[color] || '';
  console.log(`${colorCode}${text}${colors.reset}`);
}

/**
 * 打印成功信息（绿色）
 * @param {string} text - 信息内容
 */
export function printSuccess(text) {
  colorPrint('green', `✅ ${text}`);
}

/**
 * 打印信息（青色）
 * @param {string} text - 信息内容
 */
export function printInfo(text) {
  colorPrint('cyan', `ℹ️  ${text}`);
}

/**
 * 打印警告（黄色）
 * @param {string} text - 警告内容
 */
export function printWarning(text) {
  colorPrint('yellow', `⚠️  ${text}`);
}

/**
 * 打印错误（红色）
 * @param {string} text - 错误内容
 */
export function printError(text) {
  colorPrint('red', `❌ ${text}`);
}

/**
 * 打印标题（加粗）
 * @param {string} text - 标题内容
 */
export function printBold(text) {
  colorPrint('bold', text);
}

// ============== 格式化输出 ==============

/**
 * 打印分隔线
 * @param {number} [length=60] - 线长度
 * @param {string} [char='─'] - 分隔字符
 */
export function printLine(length = 60, char = '─') {
  console.log(char.repeat(length));
}

/**
 * 打印标题框
 * @param {string} text - 标题文本
 */
export function printTitle(text) {
  const width = getDisplayLength(text) + 4;
  console.log('');
  console.log('╔' + '═'.repeat(width) + '╗');
  console.log('║  ' + text + '  ║');
  console.log('╚' + '═'.repeat(width) + '╝');
  console.log('');
}

/**
 * 打印小标题
 * @param {string} text - 标题文本
 */
export function printSubtitle(text) {
  console.log('');
  console.log(`  ${colors.bold}${text}${colors.reset}`);
  console.log('  ' + '─'.repeat(text.length));
}

// ============== 进度显示 ==============

/**
 * 打印进度条
 * @param {number} current - 当前进度
 * @param {number} total - 总数
 * @param {number} [width=30] - 进度条宽度
 */
export function printProgress(current, total, width = 30) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  process.stdout.write(`\r  [${bar}] ${percent}% (${current}/${total})`);

  if (current === total) {
    process.stdout.write('\n');
  }
}

/**
 * 打印加载动画帧
 * @param {number} frame - 帧序号
 * @param {string} [message=''] - 附加消息
 */
export function printSpinner(frame, message = '') {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const char = frames[frame % frames.length];
  process.stdout.write(`\r  ${colors.cyan}${char}${colors.reset} ${message}`);
}

// ============== 列表输出 ==============

/**
 * 打印无序列表
 * @param {string[]} items - 列表项
 * @param {string} [bullet='•'] - 列表符号
 */
export function printList(items, bullet = '•') {
  items.forEach((item) => {
    console.log(`  ${bullet} ${item}`);
  });
}

/**
 * 打印键值对
 * @param {Array<[string, string]>} pairs - 键值对数组
 * @param {number} [keyWidth=15] - 键名宽度
 */
export function printKeyValue(pairs, keyWidth = 15) {
  pairs.forEach(([key, value]) => {
    console.log(`  ${colors.dim}${key.padEnd(keyWidth)}${colors.reset} ${value}`);
  });
}

// ============== JSON 输出 ==============

/**
 * 格式化打印 JSON
 * @param {object} obj - JSON 对象
 * @param {number} [indent=2] - 缩进空格数
 */
export function printJson(obj, indent = 2) {
  console.log(JSON.stringify(obj, null, indent));
}

// ============== 日期格式化 ==============

/**
 * 格式化日期为本地字符串
 * @param {Date|string|number} date - 日期对象、字符串或时间戳
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date) {
  if (!date) return '未知';
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 格式化运行时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时间
 */
export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);

  return parts.join(' ');
}
