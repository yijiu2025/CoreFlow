// src/loader/engine.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const C = { reset: '\x1b[0m', red: '\x1b[31m' };

export async function runEngine(app) {
  const registryDir = path.resolve(__dirname, './registry');
  const files = await fs.readdir(registryDir);
  const sortedFiles = files.filter((f) => f.endsWith('.js')).sort();

  for (const file of sortedFiles) {
    const fileUrl = pathToFileURL(path.join(registryDir, file)).href;
    try {
      const { default: register } = await import(fileUrl);
      if (typeof register === 'function') {
        await register(app);
      }
    } catch (err) {
      console.error(`❌ [Loader] ${C.red}注册项 [${file}] 加载失败: ${err.message}${C.reset}`);
    }
  }
}
