#!/usr/bin/env node
/**
 * 构建期生产依赖自证（Dockerfile deps 阶段 `node docker/verify-deps.mjs`）
 *
 * === 为什么需要它 ===
 * 2026-10-15 事故：`COPY package*.json` 把入库的 lockfile 带进镜像，npm install
 * 照 lock 给 `wb-logkit` / `stable-deviceid` 建出**悬空软链**（指向容器里不存在
 * 的 packages/ 目录）—— 安装退出码 0、"added 311 packages" 一路绿灯，运行期
 * import 才 ERR_MODULE_NOT_FOUND。构建期原先只 resolve 三个"确定存在"的包
 * （fastify/sequelize/redis），对这类"装上了但解析不到"全无察觉，直到 E2E
 * 冒烟的 migrate 步骤才炸（连红一周，2026-10-08 起）。
 *
 * 本脚本把两个本地 workspace 包（镜像里从 registry 取的已发布版）也纳入构建期
 * 校验：import 成功 + 具名导出存在，才算数。与 tini 的 `--version` 自证同一思路
 * —— **构建期能暴露的问题不要留到运行期**。
 *
 * 为什么独立成文件而不是 Dockerfile 内联 `node -e`：
 * Dockerfile 的续行不进入引号字符串，多行 `-e` 脚本会被解析器当成新的
 * instruction（实测 `unknown instruction: await`）；且校验清单会随依赖增长，
 * 脚本可本机跑、可进版本控制Review。
 *
 * @author yijiu2025
 * @since 2026-10-15
 */

/** 只需"能 import"的核心依赖（历史校验项） */
const IMPORTABLE = ['fastify', 'sequelize', 'redis'];

/**
 * 包名 → 必须存在的具名导出。
 * import 成功但导出缺失同样是静默故障（如包发了空 dist、exports 映射漂移），
 * 所以关键包逐个核对导出名。BASE62_CHARS 是 string、ENCODED_TS_LENGTH 是
 * number，统一按"非 undefined"判定，不卡具体类型。
 */
const NAMED_EXPORTS = {
  'wb-logkit': ['createLogger'],
  'stable-deviceid/base62-timestamp': [
    'BASE62_CHARS',
    'ENCODED_TS_LENGTH',
    'encodeTimestamp',
    'decodeTimestamp'
  ]
};

let failed = 0;

for (const spec of IMPORTABLE) {
  try {
    await import(spec);
    console.log(`  ✓ ${spec}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${spec} → ${e.code || e.message}`);
  }
}

for (const [spec, names] of Object.entries(NAMED_EXPORTS)) {
  try {
    const mod = await import(spec);
    for (const name of names) {
      if (mod[name] === undefined) {
        failed += 1;
        console.error(`  ✗ ${spec} 缺少导出 ${name}`);
      } else {
        console.log(`  ✓ ${spec} → ${name}`);
      }
    }
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${spec} → ${e.code || e.message}`);
  }
}

if (failed > 0) {
  console.error(`❌ 生产依赖校验失败：${failed} 项不通过`);
  process.exit(1);
}
console.log('✅ 生产依赖校验通过（含 wb-logkit / stable-deviceid 解析）');
