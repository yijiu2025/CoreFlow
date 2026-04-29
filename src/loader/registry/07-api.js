// src/loader/registry/05-api.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { registerSystemMetadata, setRegistrationContext } from '../../api/guard.js';

export default async (app) => {
  // 指向 src/api 目录
  const apiRoot = path.resolve(__dirname, '../../api');

  console.log('🛣️  [Loader] 启动 API 递归加载引擎...');

  /**
   * 递归扫描函数 (增加 System 自动识别)
   */
  async function scanDir(currentPath, isSystemRoot = false) {
    try {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      // 1. 如果是系统根目录 (api/ 文件夹下的第一级)，自动尝试加载 system.json
      if (isSystemRoot) {
        const folderName = path.basename(currentPath);
        const hasSystemJson = items.find((i) => i.name === 'system.json');

        let systemKey = folderName; // 默认使用文件夹名
        let config = {};

        if (hasSystemJson) {
          const systemConfigPath = path.join(currentPath, 'system.json');
          const content = await fs.readFile(systemConfigPath, 'utf-8');
          config = JSON.parse(content);

          // 【核心】优先使用 system.json 里的 name 作为系统标识名
          if (config.name) systemKey = config.name;

          config.prefix = config.prefix || '';
          registerSystemMetadata(systemKey, config);
        }

        // 设置当前系统的注册上下文，供后续 registerGroupMetadata 自动推导
        setRegistrationContext(systemKey);

        if (hasSystemJson) {
          console.log(
            `🛡️  [Guard] 自动注册系统: ${systemKey} [${config.alias || '未命名'}] -> ${config.prefix || '/'}`
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
      console.warn(`⚠️ [Loader] 读取目录失败: ${currentPath}`, err.message);
    }
  }

  /**
   * 单个文件加载逻辑
   */
  async function loadRouteFile(filePath) {
    try {
      const fileUrl = pathToFileURL(filePath).href;
      const { default: routerPlugin } = await import(fileUrl);

      if (typeof routerPlugin === 'function') {
        await app.register(routerPlugin);
        const relativePath = path.relative(apiRoot, filePath);
        console.log(`✅ [API Registered]: /${relativePath.replace(/\\/g, '/')}`);
      }
    } catch (err) {
      console.error(`❌ [API Error] 文件加载失败: ${filePath}`, err.message);
    }
  }

  // 1. 先扫描 apiRoot 下的一级子文件夹 (识别系统)
  const systemFolders = await fs.readdir(apiRoot, { withFileTypes: true });
  for (const folder of systemFolders) {
    if (folder.isDirectory()) {
      await scanDir(path.join(apiRoot, folder.name), true); 
    }
  }
};
