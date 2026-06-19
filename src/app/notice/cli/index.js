/**
 * 通知中心 CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- notice channels  # 查看通知通道
 *   npm run cli -- notice config    # 查看通道配置
 *   npm run cli -- notice test      # 测试邮件发送
 */
import { getModels } from '../../../../scripts/lib/db.js';
import { printTable, printSuccess, printInfo, printWarning, printError, printLine } from '../../../../scripts/lib/table.js';
import { createRl, ask, closeRl } from '../../../../scripts/lib/input.js';

/**
 * 查看通知通道
 */
async function listChannels() {
  const channels = [
    { id: 'email',   name: '邮件通知',   icon: '📧' },
    { id: 'dingtalk', name: '钉钉机器人', icon: '🔔' },
    { id: 'wechat',  name: '微信推送',   icon: '💬' },
    { id: 'sms',     name: '短信通知',   icon: '📱' }
  ];

  console.log('\n📮 通知通道：');
  printLine();
  channels.forEach((ch) => {
    console.log(`  ${ch.icon} ${ch.id.padEnd(12)} ${ch.name}`);
  });
  printLine();
}

/**
 * 查看通道配置
 */
async function showConfig() {
  const { NoticeConfig } = getModels();

  try {
    const configs = await NoticeConfig.findAll({
      order: [['type', 'ASC']]
    });

    if (configs.length === 0) {
      printInfo('暂无通知配置');
      return;
    }

    console.log('\n⚙️ 通知通道配置：');
    printTable(
      ['ID', '类型', '启用', '更新时间'],
      configs.map((c) => [
        c.id,
        c.type,
        c.enabled ? '✅ 是' : '❌ 否',
        new Date(c.updated_at).toLocaleString('zh-CN')
      ])
    );
  } catch {
    printWarning('NoticeConfig 模型未加载');
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
export default {
  command: 'notice',
  appName: 'notice',
  description: '通知中心',
  subcommands: {
    'channels': { description: '查看通知通道', handler: listChannels },
    'config':   { description: '查看通道配置', handler: showConfig },
    'test':     { description: '测试邮件发送', handler: testEmail }
  }
};
