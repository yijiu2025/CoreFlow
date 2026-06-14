/**
 * 防火墙应用 CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- firewall status     # 查看防火墙状态
 *   npm run cli -- firewall blocks     # 查看封禁列表
 *   npm run cli -- firewall whitelist  # 查看白名单
 *   npm run cli -- firewall ban        # 添加封禁
 *   npm run cli -- firewall unban      # 解除封禁
 *   npm run cli -- firewall allow      # 添加白名单
 *   npm run cli -- firewall stats      # 流量统计
 */

import { status } from './status.js';
import { listBlocks, addBlock, removeBlock } from './blocks.js';
import { listWhitelist, addWhitelist } from './whitelist.js';
import { trafficStats } from './stats.js';

// 导出 CLI 插件配置
export default {
  command: 'firewall',
  appName: 'firewall',
  description: '防火墙管理',
  subcommands: {
    'status':    { description: '查看防火墙状态', handler: status },
    'blocks':    { description: '查看封禁列表',   handler: listBlocks },
    'whitelist': { description: '查看白名单',     handler: listWhitelist },
    'ban':       { description: '添加封禁 IP',    handler: addBlock },
    'unban':     { description: '解除封禁 IP',    handler: removeBlock },
    'allow':     { description: '添加白名单 IP',  handler: addWhitelist },
    'stats':     { description: '流量统计',       handler: trafficStats },
  }
};
