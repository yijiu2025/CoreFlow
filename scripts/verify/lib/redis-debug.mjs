/**
 * 关卡调试辅助：让 node-redis 的编码错误带上命令名
 *
 * node-redis（v5）在把命令写进 socket 前会逐参数校验 `string | Buffer`，
 * 失败时抛的却是：
 *
 *   TypeError: "arguments[1]" must be of type "string | Buffer", got number instead.
 *
 * 只有一个**索引号**，没有命令名、没有值 —— 在 CI 日志里等于没线索：
 * 索引 1 到底是 EVAL 的脚本、SELECT 的库号，还是别的命令的第一个参数？
 * 2026-10-30 排查 queue-atomic 时就卡在这里：日志里只有这条错误和一个
 * 与业务代码毫无关系的调用栈（错误在 socket 写入路径上抛出）。
 *
 * 本模块把编码器的 `default` 导出包一层，只做一件事：出错时把
 * **命令名 + 前几个参数的类型**拼进消息。不改行为、不吞异常。
 *
 * 用法（在建立任何 Redis 连接之前调用一次）：
 *
 *   import { explainRedisEncodeErrors } from './lib/redis-debug.mjs';
 *   explainRedisEncodeErrors();
 *
 * 找不到目标模块时静默返回：这是排障辅助，不能因为包结构变化就让关卡跑不起来。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { createRequire } from 'node:module';

/** 把参数列表压成一行可读的类型摘要（避免把 payload 全文打进日志） */
function summarizeArgs(args) {
  if (!Array.isArray(args)) return String(args);
  return args
    .slice(0, 6)
    .map(arg => {
      if (typeof arg === 'string') return `str(${arg.length})`;
      if (arg instanceof Uint8Array) return `buf(${arg.length})`;
      return `${typeof arg}:${String(arg).slice(0, 24)}`;
    })
    .join(' ');
}

/**
 * 给 node-redis 的 RESP 编码器加一层"错误解释"
 *
 * @returns {boolean} 是否成功打上补丁（false = 包结构变了，已跳过）
 */
function explainRedisEncodeErrors() {
  const require = createRequire(import.meta.url);
  let encoder;
  try {
    encoder = require('@redis/client/dist/lib/RESP/encoder.js');
  } catch {
    return false;
  }
  const original = encoder?.default;
  if (typeof original !== 'function' || original.__explained) return false;

  const wrapped = args => {
    try {
      return original(args);
    } catch (err) {
      const command = Array.isArray(args) && typeof args[0] === 'string' ? args[0] : '(未知命令)';
      err.message = `${err.message}\n  ↳ 命令 ${command}，参数：${summarizeArgs(args)}`;
      throw err;
    }
  };
  wrapped.__explained = true;
  encoder.default = wrapped;
  return true;
}

export { explainRedisEncodeErrors };
