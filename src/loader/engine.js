// src/loader/engine.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const C = { reset: '\x1b[0m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m' };

export async function runEngine(app) {
  const registryDir = path.resolve(__dirname, './registry');
  const files = await fs.readdir(registryDir);
  const sortedFiles = files.filter((f) => f.endsWith('.js')).sort();

  // 收集所有加载错误，最后一并报告（一次性看到所有问题）
  const loadErrors = [];

  for (const file of sortedFiles) {
    const fileUrl = pathToFileURL(path.join(registryDir, file)).href;
    try {
      const { default: register } = await import(fileUrl);
      if (typeof register === 'function') {
        await register(app);
      }
    } catch (err) {
      loadErrors.push({ file, message: err.message });
      // 关键错误（路由重复等）立即终止，避免后续模块"背锅"
      if (err.message && err.message.includes('路由重复注册')) {
        throw new Error(formatErrors([{ file, message: err.message }]));
      }
    }
  }

  // 非关键错误汇总报告
  if (loadErrors.length > 0) {
    const fatal = loadErrors.find((e) => e.message.includes('路由重复注册'));
    if (fatal) {
      throw new Error(formatErrors(loadErrors));
    }
    console.warn(`\n⚠️ [Loader] ${C.yellow}以下加载项出错（非致命）：${C.reset}`);
    loadErrors.forEach((e) => console.warn(`  • [${e.file}] ${e.message}`));
  }
}

/** 格式化错误清单 */
function formatErrors(errors) {
  return (
    `\n❌ 加载失败（${errors.length} 项错误）：\n` +
    errors.map((e) => `  • [${e.file}] ${e.message}`).join('\n') +
    '\n'
  );
}
