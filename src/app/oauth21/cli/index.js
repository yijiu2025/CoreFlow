/**
 * OAuth 2.1 CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- oauth clients   # 查看 OAuth 客户端
 *   npm run cli -- oauth tokens    # 查看 Token 统计
 *   npm run cli -- oauth stats     # OAuth 统计
 */
import { getModels } from '../../../../scripts/lib/db.js';
import { printTable, printInfo, printLine } from '../../../../scripts/lib/table.js';

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

  console.log('\n🔑 OAuth 客户端：');
  printTable(
    ['Client ID', '名称', '类型', '创建时间'],
    clients.map((c) => [
      c.client_id,
      c.client_name,
      c.application_type || 'web',
      new Date(c.created_at).toLocaleString('zh-CN')
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

    console.log('\n🎟️ Token 统计：');
    printLine();
    console.log(`  总数: ${total}`);
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

  console.log('\n📊 OAuth 统计：');
  printLine();
  console.log(`  客户端数:   ${clientCount}`);
  console.log(`  授权记录:   ${approvalCount}`);
  console.log(`  Token 数:   ${tokenCount}`);
  printLine();
}

// 导出 CLI 插件配置
export default {
  command: 'oauth',
  appName: 'oauth21',
  description: 'OAuth 2.1 授权中心',
  subcommands: {
    'clients': { description: '查看 OAuth 客户端', handler: listClients },
    'tokens':  { description: '查看 Token 统计',   handler: tokenStats },
    'stats':   { description: 'OAuth 统计',         handler: oauthStats }
  }
};
