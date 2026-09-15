/**
 * OAuth 2.1 CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- oauth clients   # 查看 OAuth 客户端
 *   npm run cli -- oauth tokens    # 查看 Token 统计
 *   npm run cli -- oauth stats     # OAuth 统计
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getModels } from '../../../framework/db/models.js';
import { printTable, printInfo, printLine } from '../../../framework/cli/index.js';
import { logStdout } from '../../../framework/log/index.js';

/**
 * 查看 OAuth 客户端
 */
async function listClients() {
  const { OauthClient } = getModels();

  const clients = await OauthClient.findAll({
    order: [['created_at', 'DESC']]
  });

  if (clients.length === 0) {
    printInfo('暂无 OAuth 客户端');
    return;
  }

  logStdout('\n🔑 OAuth 客户端：');
  printTable(
    ['Client ID', '名称', '类型', '创建时间'],
    clients.map(c => [
      c.client_id,
      c.client_name,
      c.application_type || 'web',
      new Date(c.createdAt).toLocaleString('zh-CN')
    ])
  );
}

/**
 * 查看 Token 统计
 */
async function tokenStats() {
  const { OauthToken } = getModels();

  try {
    const total = await OauthToken.count();

    logStdout('\n🎟️ Token 统计：');
    printLine();
    logStdout(`  总数: ${total}`);
    printLine();
  } catch {
    printInfo('Token 统计暂不可用');
  }
}

/**
 * OAuth 统计
 */
async function oauthStats() {
  const { OauthClient, OauthApproval, OauthToken } = getModels();

  const [clientCount, approvalCount, tokenCount] = await Promise.all([
    OauthClient.count(),
    OauthApproval.count().catch(() => 0),
    OauthToken.count().catch(() => 0)
  ]);

  logStdout('\n📊 OAuth 统计：');
  printLine();
  logStdout(`  客户端数:   ${clientCount}`);
  logStdout(`  授权记录:   ${approvalCount}`);
  logStdout(`  Token 数:   ${tokenCount}`);
  printLine();
}

// 导出 CLI 插件配置
const oauth21CliConfig = {
  command: 'oauth',
  appName: 'oauth21',
  description: 'OAuth 2.1 授权中心',
  subcommands: {
    clients: { description: '查看 OAuth 客户端', handler: listClients },
    tokens: { description: '查看 Token 统计', handler: tokenStats },
    stats: { description: 'OAuth 统计', handler: oauthStats }
  }
};

export default oauth21CliConfig;
