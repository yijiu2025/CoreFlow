/**
 * U12 队列原子性复验 —— 子进程
 *
 * 一个进程只扮演一种角色，通过 PROBE_MODE 选择：
 *
 *   seed-fifo  往 FIFO 队列 push N 条（id = `<label>-<i>`）
 *   drain-fifo 先"探一下空队列"（这一步会触发旧实现的 meta 本地缓存），等到统一起跑
 *              时刻后一直 shift 到空，打印收到的全部 id
 *   seed-ring  往环形队列 push N 条
 *   read-ring  先 toArray 一次（同样会触发旧实现的缓存），等到起跑时刻再 toArray
 *
 * 「先探空队列」不是多余的仪式：旧实现的 `_metaCache` 就是在这一步被写成
 * `{head:0,tail:0}`，之后无论别的进程写多少条，本地都认为队列是空的，
 * 并且下一次写回 meta 会把 tail 直接改回 0 —— 队列里的消息全部变成"指针走不到"。
 * 没有这一步，缓存早就在 push 时被真实值填满，缺陷就藏起来了。
 *
 * 输出（父进程解析最后一行）：
 *   SEEDED <n>
 *   RESULT <label> <count> <id1,id2,...>
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { createQueue, createRingQueue } from '../../src/framework/redis/index.js';

const MODE = process.env.PROBE_MODE;
const PREFIX = process.env.PROBE_PREFIX;
const LABEL = process.env.PROBE_LABEL || MODE;
const COUNT = Number(process.env.PROBE_COUNT || 300);
const MAX = Number(process.env.PROBE_MAX || 100);
const AT = Number(process.env.PROBE_AT || 0);
const DEADLINE_MS = Number(process.env.PROBE_DEADLINE_MS || 20000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 等到统一起跑时刻（epoch ms），让多个子进程真的同时动手 */
async function waitForStart() {
  const delta = AT - Date.now();
  if (delta > 0) await sleep(delta);
}

function emit(line) {
  // 单独一行人读，父进程按行尾匹配
  process.stdout.write(`${line}\n`);
}

async function run() {
  if (!PREFIX) throw new Error('缺少 PROBE_PREFIX');
  if (!['seed-fifo', 'drain-fifo', 'seed-ring', 'read-ring'].includes(MODE)) {
    throw new Error(`未知 PROBE_MODE: ${MODE}`);
  }

  const isFifo = MODE.endsWith('fifo');
  const handle = isFifo
    ? createQueue(PREFIX, { backend: 'redis', maxSize: Math.max(COUNT * 4, 1000) })
    : createRingQueue(PREFIX, { backend: 'redis', maxSize: MAX });

  try {
    if (MODE === 'seed-fifo' || MODE === 'seed-ring') {
      for (let i = 0; i < COUNT; i++) {
        await handle.push(`${LABEL}-${i}`);
      }
      emit(`SEEDED ${COUNT}`);
      return;
    }

    if (MODE === 'drain-fifo') {
      // 触发一次 meta 读取（旧实现会在此刻把空 meta 缓存下来）
      await handle.length();
      await waitForStart();

      const ids = [];
      let misses = 0;
      const deadline = Date.now() + DEADLINE_MS;
      while (Date.now() < deadline) {
        const msg = await handle.shift();
        if (msg === null) {
          // 连续 5 次空才算真的空：并发消费时另一个进程可能刚好还没写回指针
          if (++misses >= 5) break;
          await sleep(50);
          continue;
        }
        misses = 0;
        ids.push(msg.data);
      }
      emit(`RESULT ${LABEL} ${ids.length} ${ids.join(',')}`);
      return;
    }

    // read-ring
    await handle.toArray(0); // 触发缓存
    await waitForStart();
    const items = await handle.toArray(0);
    const ids = items.map(it => it.data);
    emit(`RESULT ${LABEL} ${ids.length} ${ids.join(',')}`);
  } finally {
    // 不在这里 clear：清了会让同批其他进程读到空队列，清理由父进程统一做
  }
}

run().then(
  () => process.exit(0),
  err => {
    console.error(`CHILD_ERROR ${err?.message || err}`);
    process.exit(1);
  }
);
