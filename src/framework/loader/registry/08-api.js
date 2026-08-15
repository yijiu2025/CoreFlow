// src/loader/registry/05-api.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  registerSystemMetadata,
  setRegistrationContext,
  getRegistrationContext,
  restoreRegistrationContext
} from '../../../api/guard.js';
import { C } from '../../../utils/colors.js';

export default async app => {
  const apiRoot = path.resolve(__dirname, '../../../api');

  console.log(`📦 [Loader] ${C.cyan}启动 API 递归加载引擎...${C.reset}`);

  async function scanDir(currentPath, isSystemRoot = false) {
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      if (isSystemRoot) {
        const folderName = path.basename(currentPath);
        const hasSystemJson = items.find(i => i.name === 'system.json');

        let systemKey = folderName;
        let config = {};

        if (hasSystemJson) {
          const systemConfigPath = path.join(currentPath, 'system.json');
          const content = await fs.readFile(systemConfigPath, 'utf-8');
          config = JSON.parse(content);

          if (config.name) systemKey = config.name;

          config.prefix = config.prefix || '';
          registerSystemMetadata(systemKey, config);
        }

        setRegistrationContext(systemKey);

        if (hasSystemJson) {
          console.log(
            `🛡️ [Guard] ${C.cyan}自动注册系统: ${systemKey} [${config.alias || '未命名'}] -> ${config.prefix || '/'}${C.reset}`
          );
        }
      }

      for (const item of items) {
        const fullPath = path.join(currentPath, item.name);

        if (item.isDirectory()) {
          // 如果子目录有 index.js，只加载 index.js（由它组合子模块）
          // 否则递归扫描
          const subFiles = await fs.readdir(fullPath).catch(() => []);
          const hasIndexFile = subFiles.includes('index.js');

          if (hasIndexFile) {
            await loadRouteFile(path.join(fullPath, 'index.js'));
          } else {
            await scanDir(fullPath, false);
          }
        } else if (item.name.endsWith('.js')) {
          await loadRouteFile(fullPath);
        }
      }
    } catch (err) {
      console.warn(`⚠️ [Loader] ${C.yellow}读取目录失败: ${currentPath} ${err.message}${C.reset}`);
    }
  }

  async function loadRouteFile(filePath) {
    const fileUrl = pathToFileURL(filePath).href;
    const { default: routerPlugin } = await import(fileUrl);

    if (typeof routerPlugin !== 'function') return;

    // 保存当前上下文：防止插件内部调用 registerGroupMetadata 修改 currentPrefix 后泄漏到下一个文件
    const ctxBefore = getRegistrationContext();

    try {
      // 路由注册失败直接抛出，由 engine.js 统一收集；禁止静默吞错导致后续模块"背锅"
      await app.register(routerPlugin);
    } finally {
      // 无论成功/失败，恢复上下文到加载该文件前的状态（根治状态泄漏）
      restoreRegistrationContext(ctxBefore);
    }

    const relativePath = path.relative(apiRoot, filePath);
    console.log(`✅ [API] ${C.green}已注册: /${relativePath.replace(/\\/g, '/')}${C.reset}`);
  }

  const systemFolders = await fs.readdir(apiRoot, { withFileTypes: true });
  for (const folder of systemFolders) {
    if (folder.isDirectory()) {
      await scanDir(path.join(apiRoot, folder.name), true);
    }
  }
};
