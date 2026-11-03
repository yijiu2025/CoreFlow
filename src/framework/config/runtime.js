/**
 * 运行时配置热改层（默认值 + JSON 覆盖 + mtime 热加载）
 *
 * ── 四层分工（这是本项目配置体系的总纲）──
 *   各 core 模块               保底默认值（写在使用处，带注释；src/config 全空也能跑）
 *   src/config/*.js           静态覆盖（可选，只写要改的键；经 overrides.js 容错加载）
 *   本文件                     机制（deepMerge / mtime 轮询 / 缓存），framework 层
 *   src/data/*_config.json    运行时覆盖（面板或运维可写，**热改无需重启**）
 *
 * ── 热改语义（不可丢）──
 * `get()` 内部按 `reloadMs` 节流检查 mtime：文件变了就重新深合并一次，
 * 之后的读取立刻拿到新值。因此消费方**必须在每次使用时调用 `get()`**，
 * 不能把返回值缓存成模块级常量 —— 那样就退回"改完要重启"了。
 *
 * ── 容错 ──
 *   文件缺失      → 纯默认值（不告警，属于正常状态）
 *   JSON 解析失败 → 保留上一份可用配置 + log.warn（配置写坏了不该打死服务）
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../log/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 运行时覆盖文件的默认目录（src/data，随 app-data 卷持久化） */
const DATA_DIR = path.resolve(__dirname, '../../data');

const log = createLogger('framework.config.runtime');

/** 深拷贝（配置都是纯数据，JSON 往返足够且能顺手剔除 undefined） */
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * 深合并：对象递归合并，**数组整体替换**
 *
 * 数组不拼接是刻意的：名单类配置若拼接，删掉的条目会在下次启动时"复活"。
 *
 * @param {object} target - 基准（默认值）
 * @param {object} source - 覆盖（JSON）
 * @returns {object} 合并结果（新对象，不改入参）
 */
function deepMerge(target, source) {
  const out = clone(target);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const [key, val] of Object.entries(source)) {
    const base = out[key];
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      base &&
      typeof base === 'object' &&
      !Array.isArray(base)
    ) {
      out[key] = deepMerge(base, val);
    } else {
      out[key] = clone(val);
    }
  }
  return out;
}

/**
 * 原地深写：让已导出的配置对象**引用不变**地拿到新值
 *
 * 为什么要原地：消费方通常是 `import verifyConfig from '...'` 后随时读属性，
 * 若每次热改都换新对象，他们手里的旧引用永远读不到新值。原地写保证零改动热生效。
 *
 * @param {object} target - 目标对象（会被修改）
 * @param {object} next - 新配置
 */
function applyInPlace(target, next) {
  for (const key of Object.keys(target)) {
    if (!(key in next)) delete target[key]; // JSON 里显式删除的键要跟着消失
  }
  for (const [key, val] of Object.entries(next)) {
    const cur = target[key];
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      cur &&
      typeof cur === 'object' &&
      !Array.isArray(cur)
    ) {
      applyInPlace(cur, val);
    } else {
      target[key] = clone(val);
    }
  }
}

/**
 * 创建一份可热改的运行时配置
 *
 * @param {object} options
 * @param {string} options.name - 名称（日志用，如 'auth'）
 * @param {object} options.defaults - **core 保底默认值**（写在使用处，`src/config` 缺失也能跑）
 * @param {object} [options.overrides] - 静态覆盖（来自 src/config/*.js，可缺省）
 * @param {string} [options.fileName] - 运行时覆盖文件名（默认 `<name>_config.json`，位于 src/data/）
 * @param {number} [options.reloadMs] - mtime 检查节流（毫秒，默认 1000）
 * @returns {{ get: () => object, reload: () => object, bind: (target: object) => object }}
 */
function createRuntimeConfig({ name, defaults, overrides, fileName, reloadMs = 1_000 }) {
  const file = path.resolve(DATA_DIR, fileName || `${name}_config.json`);
  // 基准 = core 保底 ← 静态覆盖（src/config）；运行期 JSON 覆盖再叠在这之上
  const base = overrides ? deepMerge(defaults, overrides) : clone(defaults);
  let current = clone(base);
  /** 上次读取的文件指纹（mtime + size）：只比 mtime 会漏掉"同时间戳但内容变了"的写入 */
  let currentSignature = '';
  let lastCheck = 0;
  let lastError = '';
  /** 已绑定的导出对象：热改后总要原地同步，保证消费方手里的引用读到新值 */
  const boundTargets = [];

  function publish() {
    for (const target of boundTargets) applyInPlace(target, current);
  }

  function readFromDisk() {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      if (currentSignature !== '') {
        // 文件被删 → 退回纯默认值（运维撤销覆盖的正常路径，不刷告警）
        current = clone(base);
        currentSignature = '';
        publish();
      }
      return current;
    }
    // mtime + size 双指纹：某些文件系统时间戳粒度粗（1s），同秒内改两次只靠 mtime 会漏
    const signature = `${stat.mtimeMs}:${stat.size}`;
    if (signature === currentSignature) return current;

    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      current = deepMerge(base, raw);
      currentSignature = signature;
      lastError = '';
      publish();
      log.info(`ℹ️ [RuntimeConfig] ${name} 覆盖已生效（${path.basename(file)}）`);
    } catch (err) {
      // 解析失败：保留上一份可用配置，只告警（同一错误只报一次，避免刷屏）
      if (err.message !== lastError) {
        lastError = err.message;
        log.warn(`⚠️ [RuntimeConfig] ${name} 覆盖文件解析失败，沿用上一份配置：${err.message}`);
      }
    }
    return current;
  }

  return {
    /** 取当前生效配置（按 reloadMs 节流检查文件变化） */
    get() {
      const now = Date.now();
      if (now - lastCheck >= reloadMs) {
        lastCheck = now;
        readFromDisk();
      }
      return current;
    },
    /** 强制立即重读（测试与启动期用） */
    reload() {
      lastCheck = Date.now();
      return readFromDisk();
    },
    /**
     * 绑定到一个已导出的对象：之后每次热改都原地更新它，
     * 消费方按 `import { cfg }` 读属性即可，无需改造成 getter
     *
     * @param {object} target - 通常是模块顶层导出的配置对象
     * @returns {object} 同一个 target
     */
    bind(target) {
      if (!boundTargets.includes(target)) boundTargets.push(target);
      applyInPlace(target, this.reload());
      return target;
    }
  };
}

export { createRuntimeConfig, deepMerge, applyInPlace };
