// src/loader/registry/05-api.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { registerSystemMetadata, setRegistrationContext } from '../../api/guard.js';

const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

export default async (app) => {
  const apiRoot = path.resolve(__dirname, '../../api');

  console.log(`📦 [Loader] ${C.cyan}启动 API 递归加载引擎...${C.reset}`);

  async function scanDir(currentPath, isSystemRoot = false) {
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      if (isSystemRoot) {
        const folderName = path.basename(currentPath);
        const hasSystemJson = items.find((i) => i.name === 'system.json');

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
          await scanDir(fullPath, false);
        } else if (item.name.endsWith('.js')) {
          await loadRouteFile(fullPath);
        }
      }
    } catch (err) {
      console.warn(`⚠️ [Loader] ${C.yellow}读取目录失败: ${currentPath} ${err.message}${C.reset}`);
    }
  }

  async function loadRouteFile(filePath) {
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const { default: routerPlugin } = await import(fileUrl);

      if (typeof routerPlugin === 'function') {
        await app.register(routerPlugin);
        const relativePath = path.relative(apiRoot, filePath);
        console.log(`✅ [API] ${C.green}已注册: /${relativePath.replace(/\\/g, '/')}${C.reset}`);
      }
    } catch (err) {
      console.error(`❌ [API] ${C.red}文件加载失败: ${filePath} ${err.message}${C.reset}`);
    }
  }

  const systemFolders = await fs.readdir(apiRoot, { withFileTypes: true });
  for (const folder of systemFolders) {
    if (folder.isDirectory()) {
      await scanDir(path.join(apiRoot, folder.name), true);
    }
  }
};
