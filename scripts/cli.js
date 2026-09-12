// CoreFlow CLI v2.0
// - 内置命令：用户、角色、数据库、Redis、管理员、系统
// - 应用插件：自动加载 src/app/<app>/cli/index.js
import 'dotenv/config';
import { loadAllModels, closeDb } from './lib/db.js';
import { loadAppCommands, mergeCommands } from './lib/plugin.js';
import { printError, printInfo } from './lib/table.js';
import { createRl, ask, closeRl } from './lib/input.js';

// 导入内置命令模块
import {
  listUsers,
  createUser,
  resetPassword,
  disableUser,
  enableUser,
  viewUser,
  deleteUser
} from './commands/user.js';

import { listRoles, viewRole, assignRole, revokeRole, roleStats } from './commands/role.js';

import { dbStatus, dbMigrate, dbRollback, dbTableInfo, dbOptimize } from './commands/database.js';

import { redisStatus, clearAllSessions, clearCacheByPattern, listRedisKeys } from './commands/cache.js';

import { healthCheck, systemInfo, cleanupExpiredData } from './commands/system.js';

import { listSuperadmins, setupSuperadmin, revokeSuperadmin } from './commands/admin.js';
import { createLogger } from '../src/framework/log/index.js';

const log = createLogger('scripts.cli');

// ============== 内置命令注册 ==============

const builtinCommands = {
  // 用户管理
  user: {
    description: '用户管理',
    subcommands: {
      list: { handler: listUsers, desc: '列出所有用户' },
      create: { handler: createUser, desc: '创建新用户' },
      view: { handler: viewUser, desc: '查看用户详情' },
      'reset-password': { handler: resetPassword, desc: '重置用户密码' },
      disable: { handler: disableUser, desc: '禁用用户' },
      enable: { handler: enableUser, desc: '启用用户' },
      delete: { handler: deleteUser, desc: '删除用户（软删除）' }
    }
  },

  // 角色管理
  role: {
    description: '角色管理',
    subcommands: {
      list: { handler: listRoles, desc: '列出所有角色' },
      view: { handler: viewRole, desc: '查看角色详情' },
      assign: { handler: assignRole, desc: '分配角色给用户' },
      revoke: { handler: revokeRole, desc: '撤销用户角色' },
      stats: { handler: roleStats, desc: '角色统计' }
    }
  },

  // 数据库操作
  db: {
    description: '数据库操作',
    subcommands: {
      status: { handler: dbStatus, desc: '查看数据库状态' },
      migrate: { handler: dbMigrate, desc: '执行数据库迁移' },
      rollback: { handler: dbRollback, desc: '回滚最近一次迁移' },
      tables: { handler: dbTableInfo, desc: '查看所有表结构' },
      optimize: { handler: dbOptimize, desc: '优化数据库表' }
    }
  },

  // Redis 操作
  redis: {
    description: 'Redis 操作',
    subcommands: {
      status: { handler: redisStatus, desc: '查看 Redis 状态' },
      clear: { handler: clearAllSessions, desc: '清除所有 session' },
      pattern: { handler: clearCacheByPattern, desc: '按模式清除缓存' },
      keys: { handler: listRedisKeys, desc: '查看 key 列表' }
    }
  },

  // 管理员管理
  admin: {
    description: '管理员管理',
    subcommands: {
      list: { handler: listSuperadmins, desc: '列出超级管理员' },
      setup: { handler: setupSuperadmin, desc: '初始化超级管理员' },
      revoke: { handler: revokeSuperadmin, desc: '撤销超级管理员' }
    }
  },

  // 系统操作
  system: {
    description: '系统操作',
    subcommands: {
      health: { handler: healthCheck, desc: '系统健康检查' },
      info: { handler: systemInfo, desc: '查看系统信息' },
      cleanup: { handler: cleanupExpiredData, desc: '清理过期数据' }
    }
  }
};

// ============== 帮助信息 ==============

/**
 * 显示帮助信息
 * @param {object} commands - 所有可用命令
 */
function showHelp(commands) {
  log.stdout('');
  log.stdout('╔════════════════════════════════════════════════════════════╗');
  log.stdout('║           CoreFlow 命令行管理工具 v2.0                 ║');
  log.stdout('╚════════════════════════════════════════════════════════════╝');
  log.stdout('');
  log.stdout('用法: npm run cli -- <command> [subcommand]');
  log.stdout('');

  // 内置命令
  log.stdout('内置命令:');
  log.stdout('');
  for (const [cmd, config] of Object.entries(builtinCommands)) {
    log.stdout(`  ${cmd.padEnd(15)} ${config.description}`);
    for (const [sub, subConfig] of Object.entries(config.subcommands)) {
      log.stdout(`    ${sub.padEnd(20)} ${subConfig.desc}`);
    }
    log.stdout('');
  }

  // 应用插件命令
  const appCommands = Object.entries(commands).filter(([key]) => !builtinCommands[key]);
  if (appCommands.length > 0) {
    log.stdout('应用插件命令:');
    log.stdout('');
    for (const [cmd, config] of appCommands) {
      log.stdout(`  ${cmd.padEnd(15)} ${config.description}`);
      for (const [sub, subConfig] of Object.entries(config.subcommands)) {
        log.stdout(`    ${sub.padEnd(20)} ${subConfig.description || subConfig.desc}`);
      }
      log.stdout('');
    }
  }

  // 快捷命令
  log.stdout('快捷命令:');
  log.stdout('');
  log.stdout('  npm run cli -- health          系统健康检查');
  log.stdout('  npm run cli -- user list        列出所有用户');
  log.stdout('  npm run cli -- role list        列出所有角色');
  log.stdout('  npm run cli -- admin list       列出超级管理员');
  log.stdout('');

  // 示例
  log.stdout('示例:');
  log.stdout('');
  log.stdout('  npm run cli                     # 交互式菜单');
  log.stdout('  npm run cli -- user create      # 创建用户');
  log.stdout('  npm run cli -- role assign      # 分配角色');
  log.stdout('  npm run cli -- db migrate       # 执行迁移');
  log.stdout('  npm run cli -- redis clear      # 清除 session');
  log.stdout('');
}

// ============== 交互式菜单 ==============

/**
 * 显示主菜单
 * @param {object} commands - 所有可用命令
 */
async function showMainMenu(commands) {
  log.stdout('');
  log.stdout('╔══════════════════════════════════════╗');
  log.stdout('║    CoreFlow 命令行管理工具        ║');
  log.stdout('╚══════════════════════════════════════╝');
  log.stdout('');

  // 构建菜单项
  const menuItems = [];
  for (const [cmd, config] of Object.entries(commands)) {
    menuItems.push({ label: `${cmd} - ${config.description}`, value: cmd });
  }

  log.stdout('请选择模块：');
  menuItems.forEach((item, i) => {
    log.stdout(`  ${i + 1}. ${item.label}`);
  });
  log.stdout('  h. 帮助');
  log.stdout('  0. 退出');
  log.stdout('');

  const rl = createRl();
  try {
    const choice = await ask(rl, '请输入序号: ');

    if (choice === '0') {
      log.stdout('再见！');
      process.exit(0);
    }

    if (choice === 'h') {
      showHelp(commands);
      return;
    }

    const index = parseInt(choice, 10) - 1;
    if (index >= 0 && index < menuItems.length) {
      const cmd = menuItems[index].value;
      await showSubMenu(commands, cmd);
    } else {
      log.stdout('无效的选择');
    }
  } finally {
    closeRl(rl);
  }
}

/**
 * 显示子菜单
 * @param {object} commands - 所有可用命令
 * @param {string} category - 命令类别
 */
async function showSubMenu(commands, category) {
  const config = commands[category];
  if (!config) return;

  log.stdout('');
  log.stdout(`${config.description}：`);

  const subEntries = Object.entries(config.subcommands);
  subEntries.forEach(([sub, subConfig], i) => {
    log.stdout(`  ${i + 1}. ${sub} - ${subConfig.description || subConfig.desc}`);
  });
  log.stdout('  0. 返回');
  log.stdout('');

  const rl = createRl();
  try {
    const choice = await ask(rl, '请输入序号: ');

    if (choice === '0') return;

    const index = parseInt(choice, 10) - 1;
    if (index >= 0 && index < subEntries.length) {
      const [sub, subConfig] = subEntries[index];
      await subConfig.handler();
    } else {
      log.stdout('无效的选择');
    }
  } finally {
    closeRl(rl);
  }
}

// ============== 主入口 ==============

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  // 加载模型
  await loadAllModels();

  // 加载应用插件
  const { commands: appCommands, errors, count } = await loadAppCommands();

  if (errors.length > 0) {
    errors.forEach(err => log.warn(`警告: ${err}`));
  }

  if (count > 0) {
    printInfo(`已加载 ${count} 个应用插件`);
  }

  // 合并命令
  const allCommands = mergeCommands(builtinCommands, appCommands);

  // 显示帮助
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (!command) {
      // 无参数，显示交互式菜单
      while (true) {
        await showMainMenu(allCommands);
      }
    } else {
      showHelp(allCommands);
    }
    return;
  }

  // 执行命令
  const cmdConfig = allCommands[command];
  if (!cmdConfig) {
    printError(`未知命令: ${command}`);
    showHelp(allCommands);
    return;
  }

  if (!subcommand) {
    // 没有子命令，显示该命令的子命令列表
    log.stdout('');
    log.stdout(`${cmdConfig.description} 可用命令：`);
    log.stdout('');
    for (const [sub, subConfig] of Object.entries(cmdConfig.subcommands)) {
      log.stdout(`  ${sub.padEnd(20)} ${subConfig.description || subConfig.desc}`);
    }
    log.stdout('');
    return;
  }

  const subConfig = cmdConfig.subcommands[subcommand];
  if (!subConfig) {
    printError(`未知子命令: ${command} ${subcommand}`);
    log.stdout('');
    log.stdout('可用子命令：');
    log.stdout('');
    for (const [sub, config] of Object.entries(cmdConfig.subcommands)) {
      log.stdout(`  ${sub.padEnd(20)} ${config.description || config.desc}`);
    }
    log.stdout('');
    return;
  }

  // 执行子命令
  await subConfig.handler();
}

// 运行主程序
main()
  .catch(err => {
    printError(err.message);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
