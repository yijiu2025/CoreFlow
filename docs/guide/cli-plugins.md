# CLI 插件开发 {#cli-plugins}

开发者可以为自己的应用模块添加自定义 CLI 命令，实现应用级的命令行管理。

## 目录结构

```
src/app/{app_name}/
├── cli/                        # CLI 命令目录
│   ├── index.js                # 插件入口（必须）
│   ├── command1.js             # 命令模块（可选）
│   └── command2.js             # 命令模块（可选）
├── config.js                   # 应用配置
├── permission/                 # 权限定义
└── ...
```

## 快速开始

### 1. 创建插件入口

```js
// src/app/myapp/cli/index.js
import { listItems, createItem } from './items.js';

export default {
  command: 'myapp',           // 主命令名
  appName: 'myapp',           // 应用名称
  description: '我的应用管理', // 命令描述
  subcommands: {
    'list': {
      description: '列出数据',
      handler: listItems
    },
    'create': {
      description: '创建数据',
      handler: createItem
    }
  }
};
```

### 2. 创建命令模块

```js
// src/app/myapp/cli/items.js
import { getModels } from '../../../../scripts/lib/db.js';
import { printTable, printSuccess, printError } from '../../../../scripts/lib/table.js';
import { createRl, ask, closeRl } from '../../../../scripts/lib/input.js';

/**
 * 列出数据
 */
export async function listItems() {
  const { MyModel } = getModels();
  const items = await MyModel.findAll();

  console.log('\n📋 数据列表：');
  printTable(
    ['ID', '名称', '状态'],
    items.map((item) => [item.id, item.name, item.status])
  );
}

/**
 * 创建数据
 */
export async function createItem() {
  const { MyModel } = getModels();
  const rl = createRl();

  try {
    const name = await ask(rl, '请输入名称: ');
    if (!name) {
      printError('名称不能为空');
      return;
    }

    await MyModel.create({ name });
    printSuccess('创建成功');
  } finally {
    closeRl(rl);
  }
}
```

### 3. 使用命令

```bash
# 查看应用命令
npm run cli -- myapp

# 执行子命令
npm run cli -- myapp list
npm run cli -- myapp create
```

## 工具库

### 数据库工具

```js
import { getModels, getSequelize } from '../../../../scripts/lib/db.js';

const { User, Role } = getModels();
const sequelize = getSequelize();
```

### Redis 工具

```js
import { connectRedis, closeRedis, clearUserSessions } from '../../../../scripts/lib/redis.js';

const redis = await connectRedis();
if (redis) {
  // 使用 redis
  await closeRedis(redis);
}
```

### 输入工具

```js
import { createRl, ask, confirm, select, closeRl } from '../../../../scripts/lib/input.js';

const rl = createRl();
try {
  // 文本输入
  const name = await ask(rl, '请输入名称: ');

  // 密码输入（隐藏）
  const password = await ask(rl, '请输入密码: ', true);

  // 确认操作
  const ok = await confirm(rl, '确认删除？');

  // 从列表选择
  const value = await select(rl, '请选择:', [
    { label: '选项1', value: 1 },
    { label: '选项2', value: 2 }
  ]);
} finally {
  closeRl(rl);
}
```

### 输出工具

```js
import {
  printTable, printSuccess, printInfo,
  printWarning, printError, printLine, printTitle
} from '../../../../scripts/lib/table.js';

printTitle('我的应用');
printSuccess('操作成功');
printInfo('提示信息');
printWarning('警告信息');
printError('错误信息');
printLine();

// 打印表格
printTable(
  ['ID', '名称'],
  [[1, '测试'], [2, '示例']]
);
```

## 完整示例

### 防火墙应用 CLI

```
src/app/firewall/cli/
├── index.js      # 插件入口
├── status.js     # 状态查看
├── blocks.js     # 封禁管理
├── whitelist.js  # 白名单管理
└── stats.js      # 流量统计
```

使用：

```bash
npm run cli -- firewall status     # 查看防火墙状态
npm run cli -- firewall blocks     # 查看封禁列表
npm run cli -- firewall ban        # 添加封禁
npm run cli -- firewall unban      # 解除封禁
npm run cli -- firewall whitelist  # 查看白名单
npm run cli -- firewall stats      # 流量统计
```

## 插件规范

| 规则 | 说明 |
|------|------|
| 入口文件 | `cli/index.js` 必须存在 |
| 导出格式 | `export default { command, description, subcommands }` |
| 命令名 | 全局唯一，不能与内置命令冲突 |
| handler | 必须是 async 函数 |
| 工具导入 | 使用相对路径导入 `scripts/lib/` 下的工具 |

## 内置命令列表

| 命令 | 说明 |
|------|------|
| `user` | 用户管理 |
| `role` | 角色管理 |
| `db` | 数据库操作 |
| `redis` | Redis 操作 |
| `admin` | 管理员管理 |
| `system` | 系统操作 |
| `help` | 帮助信息 |

应用自定义命令会自动加载，与内置命令使用方式相同。
