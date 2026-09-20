#!/usr/bin/env node
/**
 * 容器入口：等待依赖 → 可选迁移 → 启动应用并转发信号
 *
 * === 为什么需要它，而不是直接 `CMD ["node","index.js"]` ===
 * 1. **启动顺序**：`docker compose up` 里 `depends_on: service_healthy` 只保证
 *    容器健康，不保证应用能立刻连上（MySQL 首次初始化要 20~60s，期间
 *    `service_healthy` 恰好还没通过；而 Redis 抖动时应用会静默降级到内存模式，
 *    表面能启、语义已错）。这里显式等待，把"到底连上了没"变成一条日志。
 * 2. **有界**：等待必须有上限。无上限的等待会让编排层以为容器在正常启动，
 *    排障时看不到任何失败信号（本仓库在 `connectStandalone` 上踩过同一个坑：
 *    一个"永不返回"的等待比一次明确失败更难查）。
 * 3. **迁移解耦**：默认**不跑**迁移。多副本同时启动时并发跑迁移会互相打架，
 *    生产应使用独立的一次性任务（见 docs/deploy/docker.md）。`RUN_MIGRATIONS=true`
 *    只是给单机 / 演示场景留的便利开关。
 *
 * === 依赖等待策略（刻意不对称） ===
 * - **DB 等不到 → 直接失败退出**：`framework/db` 在非测试环境缺配置会终止进程，
 *   与其等应用自己崩，不如这里给出可读原因，让编排重启并打点。
 * - **Redis 等不到 → 警告后继续**：Redis 不可用时访问层会降级到进程内 MapStore，
 *   这是**设计内的合法降级**。把降级路径判为致命，等于把一次可选组件的抖动
 *   升级成整个服务不可用。
 *
 * @author yijiu2025
 * @since 2026-09-20
 */

import { spawn } from 'node:child_process';
import { probeTcp } from '../src/framework/redis/probe.js';
import { planDependencyWaits, classifyWaitOutcome } from '../src/framework/ops/dependency-plan.js';

const ENABLE_WAIT = (process.env.WAIT_FOR_DEPS || 'true') === 'true';
const DEP_WAIT_TIMEOUT_MS = Number.parseInt(process.env.DEP_WAIT_TIMEOUT_MS || '90000', 10) || 90_000;
const RUN_MIGRATIONS = (process.env.RUN_MIGRATIONS || 'false') === 'true';
const RETRY_INTERVAL_MS = 1_000;

const out = text => process.stdout.write(`${text}\n`);

/**
 * 轮询等待某个 TCP 端点可达，直到超时
 *
 * @param {object} opts
 * @param {string} opts.label - 日志里的依赖名
 * @param {string} opts.host - 主机
 * @param {number} opts.port - 端口
 * @param {number} opts.timeoutMs - 等待上限（毫秒）
 * @returns {Promise<{ok: boolean, ms: number, code?: string}>}
 */
async function waitForTcp({ label, host, port, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let lastCode;
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const probe = await probeTcp(host, port, Math.min(3_000, Math.max(500, timeoutMs)));
    if (probe.ok) {
      out(`✅ [entrypoint] ${label} 已就绪（${host}:${port}，第 ${attempt} 次探测，${probe.ms}ms）`);
      return { ok: true, ms: probe.ms };
    }
    lastCode = probe.code;

    if (Date.now() >= deadline) {
      return { ok: false, ms: Date.now() - deadline, code: lastCode ?? 'UNKNOWN' };
    }
    await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
  }
}

/**
 * 执行数据库迁移（独立子进程，继承 stdio）
 *
 * @returns {Promise<number>} 子进程退出码
 */
function runMigrations() {
  return new Promise(resolve => {
    out('🛠️  [entrypoint] RUN_MIGRATIONS=true，开始执行数据库迁移...');
    const child = spawn(process.execPath, ['src/framework/db/migrate.js'], {
      stdio: 'inherit',
      env: process.env
    });
    child.once('exit', code => resolve(code ?? 1));
    child.once('error', err => {
      out(`❌ [entrypoint] 迁移进程启动失败：${err.message}`);
      resolve(1);
    });
  });
}

/**
 * 启动应用并把信号转发给它
 *
 * 应用自己是 PID 1 的子进程（PID 1 是 tini，见 Dockerfile），因此这里必须
 * 显式转发信号 —— 否则 `docker stop` 的 SIGTERM 会发给 tini 而被吞掉，
 * 应用精心实现的优雅关闭（WS 关闭帧 → DB/Redis 关闭 → 退出）不会被执行。
 *
 * @returns {Promise<never>} 永远不 resolve；应用退出时以同一退出码结束本进程
 */
function startApp() {
  return new Promise(() => {
    const child = spawn(process.execPath, ['index.js'], { stdio: 'inherit', env: process.env });

    const forward = signal => {
      out(`📦 [entrypoint] 收到 ${signal}，转发给应用进程...`);
      try {
        child.kill(signal);
      } catch (err) {
        out(`⚠️  [entrypoint] 信号转发失败：${err.message}`);
      }
    };
    process.on('SIGTERM', () => forward('SIGTERM'));
    process.on('SIGINT', () => forward('SIGINT'));

    child.once('exit', (code, signal) => {
      const reason = signal ? `信号 ${signal}` : `退出码 ${code}`;
      out(`🔚 [entrypoint] 应用已结束（${reason}）`);
      // 应用被信号终止时没有 exit code，按惯例用 128+signal 表达，这里统一记 0/非 0
      process.exit(code ?? (signal ? 1 : 0));
    });
    child.once('error', err => {
      out(`🚨 [entrypoint] 应用进程启动失败：${err.message}`);
      process.exit(1);
    });
  });
}

async function main() {
  out('🚀 [entrypoint] 容器启动，开始编排');

  if (ENABLE_WAIT) {
    // 依赖清单与「硬依赖 / 可降级」的判定都在 src/ 里（dependency-plan.js），
    // 入口脚本只负责执行与输出 —— 那段策略被测试钉住了，见同名测试文件。
    const plan = planDependencyWaits(process.env);

    if (plan.length === 0) {
      out('ℹ️  [entrypoint] 无可等待的依赖（未配置 DB_HOST，且 Redis 未启用）');
    }

    for (const dep of plan) {
      const result = await waitForTcp({
        label: dep.name,
        host: dep.host,
        port: dep.port,
        timeoutMs: DEP_WAIT_TIMEOUT_MS
      });
      const action = classifyWaitOutcome({ ok: result.ok, required: dep.required });

      if (action === 'ready') continue;

      if (action === 'fail') {
        out(`⛔ [entrypoint] 等待${dep.name}超时（${dep.host}:${dep.port}，最后错误 ${result.code}）`);
        out('   数据库是硬依赖：缺连接池的应用能监听端口却会拒绝所有请求，');
        out('   让它"启动成功"是最糟的失败形态（监控全绿、用户全错）。直接失败让编排重试。');
        process.exit(1);
      }

      // degrade：可降级依赖，告警后继续
      out(`⚠️  [entrypoint] ${dep.name} 等待超时（最后错误 ${result.code}），继续启动。`);
      out('   应用会降级到进程内 MapStore：限流/验证码/会话在单实例内仍然工作，');
      out('   但跨实例共享与持久化能力缺失。请确认这是预期状态。');
    }
  } else {
    out('ℹ️  [entrypoint] WAIT_FOR_DEPS=false，跳过依赖等待');
  }

  if (RUN_MIGRATIONS) {
    const code = await runMigrations();
    if (code !== 0) {
      out(`⛔ [entrypoint] 迁移失败（退出码 ${code}），不启动应用`);
      process.exit(code);
    }
    out('✅ [entrypoint] 迁移完成');
  }

  out('▶️  [entrypoint] 启动应用：node index.js');
  await startApp();
}

main().catch(err => {
  out(`🚨 [entrypoint] 未预期错误：${err && err.message}`);
  process.exit(1);
});
