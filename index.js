// index.js (根目录)
import 'dotenv/config';
import { execSync } from 'child_process';

// 解决 Windows 终端中文乱码问题
if (process.platform === 'win32' && process.stdout.isTTY) {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误
  }
}

// import Koa from 'koa';
// import { initGlobalModels } from './src/dal/loader.js'
import { createApp } from './src/app.js';

const start = async () => {
  // 1. 核心数据层预加载（你的多应用聚合 db.appA）
  //   await initGlobalModels()

  // 2. 初始化核心 App
  const app = await createApp();

  const PORT = parseInt(process.env.PORT || 3000, 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`🚀 Server on http://localhost:${PORT}`);
  });
};

start();
