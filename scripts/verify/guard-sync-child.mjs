/**
 * E2 守卫配置跨进程同步复验 —— 观测进程
 *
 * 由 `guard-sync.mjs` 拉起，**不要单独运行**（缺少 PROBE_* 环境变量）。
 *
 * 本进程**从不写库**，只做观测：对配置的修改全部由父进程在另一个进程里完成 ——
 * 这正是要验证的跨实例场景。
 *
 * 两个必须注意的点（都踩过）：
 *
 * 1. **必须先 `loadAllModels()`**。CLI 下没有 loader 注册模型，`getModel('GuardConfig')`
 *    会抛「模型不存在」，而 `loadGuardConfig()` 会**吞掉**这个错误、退回代码级配置 ——
 *    表现为「看起来正常启动，但同步永远失败」。
 *
 * 2. **刻意不调用 `loadGuardConfig()`**。本进程只登记了目标系统的最小结构，
 *    而 `loadGuardConfig()` 末尾会把内存配置**写回 DB**，等于用最小结构覆盖线上完整配置
 *    （仓库里记过这个坑）。改为手动 `syncGuardConfigFromDb()` 一次来吸收当前 DB 状态，
 *    效果等价于「实例启动时加载配置」，但零写副作用。
 *
 * 输出协议（每行一条，父进程按行等待）：
 *   READY / OBSERVED_VERSION / OBSERVED_CONTENT / OBSERVED_IDLE / DONE / TIMEOUT / SYNC_ERROR
 */
const SYSTEM = process.env.PROBE_SYSTEM;
const GROUP = process.env.PROBE_GROUP;
const API = process.env.PROBE_API;
const IP_MARKER = process.env.PROBE_IP_MARKER;
const POLL_MS = Number(process.env.PROBE_POLL_MS || 400);
const MAX_POLLS = Number(process.env.PROBE_MAX_POLLS || 80);

if (!SYSTEM || !GROUP || !API || !IP_MARKER) {
  console.log('READY_ERROR missing_env（本文件应由 guard-sync.mjs 拉起）');
  process.exit(2);
}

const { loadAllModels, closeDb } = await import('../../src/framework/db/models.js');

await loadAllModels();

const {
  registerSystemMetadata,
  registerGroupMetadata,
  registerApiMetadata,
  syncGuardConfigFromDb,
  getAllGuardConfigs
} = await import('../../src/api/guard-config.js');

// 模拟 loader 在启动时登记路由元数据。这是**夹具**，不是被测逻辑 ——
// 被测的是 syncGuardConfigFromDb / mergeDbConfig 本身，此处只是让它们有结构可合并。
registerSystemMetadata(SYSTEM, {
  name: SYSTEM,
  prefix: `/${SYSTEM.toLowerCase()}`,
  enabled: true,
  requireLogin: false
});
registerGroupMetadata(SYSTEM, GROUP, { name: GROUP, prefix: '', enabled: true, requireLogin: false });
registerApiMetadata(SYSTEM, GROUP, API, {
  name: API,
  alias: API,
  method: 'GET',
  url: `/${API}`,
  enabled: true,
  requireLogin: false,
  allowIps: [],
  allowRoles: []
});

function readAllowIps() {
  const all = getAllGuardConfigs();
  return all?.[SYSTEM]?.groups?.[GROUP]?.apis?.[API]?.allowIps ?? null;
}

// 吸收一次当前 DB 状态 = 等价于「启动时已加载配置」，且不写库
await syncGuardConfigFromDb();
console.log(`READY allowIps=${JSON.stringify(readAllowIps())}`);

let sawVersion = false;
let sawContent = false;
let idleSyncs = 0;
let lastWasEmpty = false;

for (let i = 0; i < MAX_POLLS; i++) {
  await new Promise(r => setTimeout(r, POLL_MS));

  let res;
  try {
    res = await syncGuardConfigFromDb();
  } catch (err) {
    console.log(`SYNC_ERROR ${err.message}`);
    continue;
  }

  if (res.updated.length === 0) {
    idleSyncs++;
    lastWasEmpty = true;
  } else {
    lastWasEmpty = false;
    if (!sawVersion && res.updated.includes(SYSTEM)) {
      sawVersion = true;
      console.log(`OBSERVED_VERSION updated=[${res.updated.join(',')}] 用时≈${(i + 1) * POLL_MS}ms`);
    }
  }

  const ips = readAllowIps();
  if (!sawContent && Array.isArray(ips) && ips.includes(IP_MARKER)) {
    sawContent = true;
    console.log(`OBSERVED_CONTENT allowIps=${JSON.stringify(ips)} 用时≈${(i + 1) * POLL_MS}ms`);
  }

  // 内容看到后再多轮询几次，用于验证「版本没变大就不重复合并」
  if (sawVersion && sawContent && idleSyncs >= 3) {
    console.log(`OBSERVED_IDLE 连续 ${idleSyncs} 次空轮询（版本未变 → 不重复合并）`);
    console.log('DONE');
    await closeDb();
    process.exit(0);
  }
}

console.log(`TIMEOUT version=${sawVersion} content=${sawContent} idle=${idleSyncs} lastEmpty=${lastWasEmpty}`);
await closeDb();
process.exit(1);
