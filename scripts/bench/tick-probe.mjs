/**
 * 压测基线 —— 服务器进程内的事件循环探针
 *
 * === 为什么要有它 ===
 * 本仓库 S 系列修复的核心是「请求路径上不得有阻塞调用」（bcryptjs 冻结 774ms、
 * scrypt 阻塞 22ms、generateKeyPairSync…）。吞吐量数字看不出这类问题：
 * 一个被冻结 700ms 的服务照样能跑出漂亮的 RPS，只是尾延迟爆炸。
 * **量「事件循环被冻结多久」只能用 tick 间隔法**：跑一个 10ms 心跳，取相邻
 * tick 的最大间隔 —— 阻塞多久，空隙就是多久。
 * ⚠️ 不要用 `monitorEventLoopDelay`：按固定分辨率采样，实测会把 774ms 的
 * 一次性冻结报成 17ms（详见 framework/auth/password-hash.js 的注释）。
 *
 * === 为什么是独立文件 + `--import` 注入 ===
 * 压测探针不该出现在生产代码里。`node --import <本文件> index.js` 让它
 * 只在压测的子进程里生效，业务代码零侵入。
 *
 * === 为什么写文件而不是等 SIGTERM ===
 * Windows 上 `child.kill()` 走 TerminateProcess，子进程的信号监听**不会执行**。
 * 所以探针每秒把当前结果落盘（unref 定时器，不阻止退出），压测器杀掉服务后
 * 直接读最后一次的文件内容即可，跨平台且无信号时序问题。
 *
 * 输出格式（每行 `KEY=VALUE`）：
 *   TICK_MAX_GAP=<ms>   相邻 tick 的最大间隔（= 事件循环最长冻结）
 *   TICK_AVG_GAP=<ms>   平均间隔（含定时器固有漂移，仅参考）
 *   TICK_SAMPLES=<n>    采样次数
 *   TICK_NOISE_MS=<ms>  采样间隔设定值（10）
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';

const file = process.env.BENCH_TICK_FILE;
const resetFile = process.env.BENCH_TICK_RESET_FILE;

if (file) {
  const NOISE = 10;
  let last = performance.now();
  let max = 0;
  let sum = 0;
  let samples = 0;

  const iv = setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    samples++;
    sum += gap;
    if (gap > max) max = gap;
  }, NOISE);
  iv.unref(); // 探针绝不阻止服务退出

  const flush = setInterval(() => {
    // 阶段重置：压测器在「应用就绪」后创建重置标记文件，把启动期的
    // 模块加载 / 模型同步冻结从稳态数字里剥离（那部分单独留档）。
    if (resetFile && existsSync(resetFile)) {
      try {
        unlinkSync(resetFile);
      } catch {
        /* ignore */
      }
      last = performance.now();
      max = 0;
      sum = 0;
      samples = 0;
    }
    try {
      writeFileSync(
        file,
        `TICK_MAX_GAP=${max.toFixed(1)}\n` +
          `TICK_AVG_GAP=${samples ? (sum / samples).toFixed(2) : '0'}\n` +
          `TICK_SAMPLES=${samples}\n` +
          `TICK_NOISE_MS=${NOISE}\n`
      );
    } catch {
      /* 写不进去就等下一次 */
    }
  }, 1000);
  flush.unref();
}
