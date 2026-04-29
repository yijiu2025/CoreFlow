// src/loader/engine.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runEngine(app) {
  // 锁定扫描当前模块下的 registry 文件夹
  const registryDir = path.resolve(__dirname, './registry');
  const files = await fs.readdir(registryDir);
  const sortedFiles = files.filter((f) => f.endsWith('.js')).sort();

  for (const file of sortedFiles) {
    const fileUrl = pathToFileURL(path.join(registryDir, file)).href;
    try {
      const { default: register } = await import(fileUrl);
      if (typeof register === 'function') {
        // 传入 app 实例，执行注册
        await register(app);
      }
    } catch (err) {
      // 拦截错误：单个注册失败不影响模块整体和其他注册项
      console.error(`⚠️ [Loader Engine] 注册项 [${file}] 加载失败:`, err.message);
    }
  }
}
