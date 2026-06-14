/**
 * 输入工具模块
 * 封装 readline 交互式输入，支持密码隐藏、确认提示、列表选择
 *
 * @module scripts/lib/input
 */
import readline from 'readline';

/**
 * 创建 readline 接口
 * @returns {import('readline').Interface}
 */
export function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * 关闭 readline 接口
 * @param {import('readline').Interface} rl
 */
export function closeRl(rl) {
  if (rl) {
    rl.close();
  }
}

/**
 * 提示用户输入
 * @param {import('readline').Interface} rl - readline 实例
 * @param {string} question - 提示问题
 * @param {boolean} hidden - 是否隐藏输入（密码）
 * @returns {Promise<string>}
 */
export function ask(rl, question, hidden = false) {
  if (hidden) {
    return askPassword(question);
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * 密码输入（隐藏字符，显示 * 号）
 * @param {string} question - 提示问题
 * @returns {Promise<string>}
 */
function askPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let password = '';

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (char) => {
      switch (char) {
        case '\n':
        case '\r':
          // 回车确认
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          break;

        case '':
          // Ctrl+C
          process.exit(0);
          break;

        case '':
        case '\b':
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;

        default:
          password += char;
          process.stdout.write('*');
          break;
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * 确认操作（y/N）
 * @param {import('readline').Interface} rl - readline 实例
 * @param {string} message - 确认信息
 * @param {boolean} defaultValue - 默认值（默认 false）
 * @returns {Promise<boolean>}
 */
export async function confirm(rl, message, defaultValue = false) {
  const suffix = defaultValue ? '(Y/n)' : '(y/N)';
  const answer = await ask(rl, `${message} ${suffix}: `);

  if (!answer) return defaultValue;
  return answer.toLowerCase() === 'y';
}

/**
 * 从列表中选择
 * @param {import('readline').Interface} rl - readline 实例
 * @param {string} title - 列表标题
 * @param {Array<{label: string, value: any}>} items - 选项列表
 * @returns {Promise<any>} 选中的值，无效选择返回 null
 */
export async function select(rl, title, items) {
  console.log(`\n${title}`);
  items.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.label}`);
  });

  const input = await ask(rl, '\n请输入序号: ');
  const index = parseInt(input, 10);

  if (isNaN(index) || index < 1 || index > items.length) {
    console.error('❌ 无效的选择');
    return null;
  }

  return items[index - 1].value;
}

/**
 * 多选列表
 * @param {import('readline').Interface} rl - readline 实例
 * @param {string} title - 列表标题
 * @param {Array<{label: string, value: any}>} items - 选项列表
 * @returns {Promise<any[]>} 选中的值数组
 */
export async function multiSelect(rl, title, items) {
  console.log(`\n${title}`);
  console.log('  （输入序号，多个用逗号分隔，如: 1,3,5）\n');
  items.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.label}`);
  });

  const input = await ask(rl, '\n请输入序号: ');
  const indices = input.split(',').map((s) => parseInt(s.trim(), 10));

  const selected = [];
  for (const index of indices) {
    if (index >= 1 && index <= items.length) {
      selected.push(items[index - 1].value);
    }
  }

  return selected;
}

/**
 * 带默认值的输入
 * @param {import('readline').Interface} rl - readline 实例
 * @param {string} question - 提示问题
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string>}
 */
export async function askWithDefault(rl, question, defaultValue) {
  const answer = await ask(rl, `${question} [${defaultValue}]: `);
  return answer || defaultValue;
}
