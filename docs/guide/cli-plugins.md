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
  command: 'myapp', // 主命令名
  appName: 'myapp', // 应用名称
  description: '我的应用管理', // 命令描述
  subcommands: {
    list: {
      description: '列出数据',
      handler: listItems
    },
    create: {
      description: '创建数据',
      handler: createItem
    }
  }
};
```

### 2. 创建命令模块

```js
// src/app/myapp/cli/items.js
import { getModels } from '../../../framework/db/models.js';
import {
  printBold,
  printTable,
  printSuccess,
  printError,
  createRl,
  ask,
  closeRl
} from '../../../framework/cli/index.js';

/**
 * 列出数据
 */
async function listItems() {
  const { MyModel } = getModels();
  const items = await MyModel.findAll();

  printBold('\n📋 数据列表：');
  printTable(
    ['ID', '名称', '状态'],
    items.map(item => [item.id, item.name, item.status])
  );
}

/**
 * 创建数据
 */
async function createItem() {
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

export { listItems, createItem };
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

所有工具都在 `src/` 内，从 `src/app/{app_name}/cli/` 出发统一使用 `../../../framework/...` 前缀。

> **不要在 `src/` 下 import `scripts/`**：`scripts/` 是可选宿主，不一定随部署一起安装。
> 应用插件必须自给自足，只依赖 `src/`。

### 数据库工具

```js
import { getModels, getSequelize } from '../../../framework/db/models.js';

const { User, Role } = getModels();
const sequelize = getSequelize();
```

CLI 进程会在启动时调用 `loadAllModels()`，递归扫描 `src/models/` 并建立关联，
因此 `getModels()` 返回的是全量模型（含 `key/`、`posecraft/` 等子命名空间）。

### Redis 工具

CLI 不启动 Fastify，Redis 插件不会注册，需要自行建立连接：

```js
import { connectStandalone, disconnectStandalone, getStore } from '../../../framework/redis/index.js';
import { printWarning } from '../../../framework/cli/index.js';

const { ready, reason } = await connectStandalone();
if (!ready) {
  printWarning(`Redis 不可用（${reason}），本次操作不会写入 Redis`);
  return;
}

try {
  // getStore 按前缀隔离命名空间，自带超时包装与降级
  const store = getStore('myapp');
  await store.set('probe', JSON.stringify({ at: Date.now() }));
} finally {
  // CLI 必须显式断开，否则内置的重连策略会让进程退不出去
  await disconnectStandalone();
}
```

Redis 不可用时请**明确报错**而不是静默退化到进程内内存 —— 对一次性 CLI 而言，
写内存等于写完即丢（没有任何后续请求会读到它），却仍然打印「成功」。

### 输入工具

```js
import { createRl, ask, confirm, select, closeRl } from '../../../framework/cli/index.js';

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
  printTable,
  printSuccess,
  printInfo,
  printWarning,
  printError,
  printLine,
  printTitle
} from '../../../framework/cli/index.js';

printTitle('我的应用');
printSuccess('操作成功');
printInfo('提示信息');
printWarning('警告信息');
printError('错误信息');
printLine();

// 打印表格
printTable(
  ['ID', '名称'],
  [
    [1, '测试'],
    [2, '示例']
  ]
);
```

面向人的输出一律走这些工具（底层是 `logStdout`，直写 stdout、不加时间戳、不受 `LOG_LEVEL` 门控）。
排查留档才用 `log.info` / `log.error` —— 用错会导致生产环境收敛日志级别后**静默无输出**。

## 完整示例

### 防火墙应用 CLI

```
src/app/firewall/cli/
├── index.js      # 插件入口
├── redis-boot.js # Redis 生命周期封装（连接不可用时明确拒绝）
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

| 规则       | 说明                                                          |
| ---------- | ------------------------------------------------------------- |
| 入口文件   | `cli/index.js` 必须存在                                       |
| 导出格式   | `export default { command, description, subcommands }`        |
| 命令名     | 全局唯一，不能与内置命令冲突                                  |
| handler    | 必须是 async 函数                                             |
| 工具导入   | 从 `src/framework/` 导入，禁止在 `src/` 内 import `scripts/`   |
| 导出位置   | 定义处不写 `export`，统一在文件末尾 `export { ... };`         |
| 输出通道   | 面向人用 `src/framework/cli` 的 `print*`，禁止 `console.*`     |

## 内置命令列表

| 命令     | 说明       |
| -------- | ---------- |
| `user`   | 用户管理   |
| `role`   | 角色管理   |
| `db`     | 数据库操作 |
| `redis`  | Redis 操作 |
| `admin`  | 管理员管理 |
| `system` | 系统操作   |
| `help`   | 帮助信息   |

应用自定义命令会自动加载，与内置命令使用方式相同。
