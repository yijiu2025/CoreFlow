/**
 * 通知中心 CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- notice channels  # 查看通知通道
 *   npm run cli -- notice config    # 查看通道配置
 *   npm run cli -- notice test      # 测试邮件发送
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getModels } from '../../../framework/db/models.js';
import {
  printTable,
  printSuccess,
  printInfo,
  printError,
  printLine,
  createRl,
  ask,
  closeRl
} from '../../../framework/cli/index.js';
import { logStdout } from '../../../framework/log/index.js';

/**
 * 查看通知通道
 */
async function listChannels() {
  const channels = [
    { id: 'email', name: '邮件通知', icon: '📧' },
    { id: 'dingtalk', name: '钉钉机器人', icon: '🔔' },
    { id: 'wechat', name: '微信推送', icon: '💬' },
    { id: 'sms', name: '短信通知', icon: '📱' }
  ];

  logStdout('\n📮 通知通道：');
  printLine();
  channels.forEach(ch => {
    logStdout(`  ${ch.icon} ${ch.id.padEnd(12)} ${ch.name}`);
  });
  printLine();
}

/**
 * 值里可能含凭据的配置项（如 smtp_password）—— 打印前遮蔽，避免授权码进入终端回滚区与日志
 */
const SECRET_KEY_PATTERN = /(password|passwd|secret|token|credential|api[_-]?key)/i;

/**
 * 遮蔽敏感配置值
 * @param {string} key - 配置项名
 * @param {string} value - 配置值
 * @returns {string} 可直接打印的值
 */
function maskValue(key, value) {
  if (!SECRET_KEY_PATTERN.test(key)) return value;
  const text = String(value ?? '');
  if (!text) return '(空)';
  return `${'*'.repeat(Math.min(text.length, 8))}（已遮蔽 ${text.length} 位）`;
}

/**
 * 查看通道配置
 *
 * NoticeConfig 是 key-value 配置表（key / value / description / category / updatedAt），
 * 不是 {id, type, enabled} 结构。
 */
async function showConfig() {
  const { NoticeConfig } = getModels();

  try {
    const configs = await NoticeConfig.findAll({
      order: [
        ['category', 'ASC'],
        ['key', 'ASC']
      ]
    });

    if (configs.length === 0) {
      printInfo('暂无通知配置');
      return;
    }

    logStdout('\n⚙️ 通知配置：');
    printTable(
      ['分类', '配置项', '值', '说明'],
      configs.map(c => [c.category, c.key, maskValue(c.key, c.value), c.description])
    );
  } catch (err) {
    // 不要把真实错误伪装成「模型未加载」—— 两者排查方向完全不同
    printError(`读取通知配置失败: ${err.message}`);
  }
}

/**
 * 测试邮件发送
 */
async function testEmail() {
  const rl = createRl();
  try {
    const email = await ask(rl, '📧 请输入测试邮箱: ');
    if (!email) {
      printError('邮箱不能为空');
      return;
    }

    printInfo('正在发送测试邮件...');

    try {
      const { default: emailService } = await import('../../services/email.js');
      const result = await emailService.send({
        to: email,
        subject: 'CoreFlow 测试邮件',
        html: '<h1>测试成功</h1><p>这是一封来自 CoreFlow 的测试邮件。</p>'
      });

      if (result) {
        printSuccess(`测试邮件已发送至: ${email}`);
      } else {
        printError('邮件发送失败，请检查 SMTP 配置');
      }
    } catch (err) {
      printError(`邮件发送失败: ${err.message}`);
    }
  } finally {
    closeRl(rl);
  }
}

// 导出 CLI 插件配置
const noticeCliConfig = {
  command: 'notice',
  appName: 'notice',
  description: '通知中心',
  subcommands: {
    channels: { description: '查看通知通道', handler: listChannels },
    config: { description: '查看通道配置', handler: showConfig },
    test: { description: '测试邮件发送', handler: testEmail }
  }
};

export default noticeCliConfig;
