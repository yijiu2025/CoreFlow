/**
 * localStorage 安全封装（包内唯一存储访问出口）
 *
 * 统一 try/catch 兜底：隐私模式 / 配额溢出 / 被禁用时全部静默降级为
 * 模块级内存 Map（会话内稳定），不向调用方抛异常、不中断请求链路。
 * device-id 与 device-sync 的所有存储操作都走本模块，禁止绕行直连 localStorage。
 *
 * 实现为纯 JS（而非 TS）：根 Jest 配置 transform: {}（纯 ESM 不编译 TS），
 * 单元测试直接 import 本文件（与 base62-timestamp.js 同一约定）。
 *
 * @author yijiu2025
 * @since 2026-09-04
 */

/** 内存降级存储（localStorage 不可用时的会话内兜底） */
const memoryStore = new Map();

/** localStorage 是否可用（首次探测后缓存；null = 未探测） */
let localStorageAvailable = null;

/**
 * 探测 localStorage 是否真实可用
 * Safari 隐私模式下访问 localStorage 不抛错但写入抛错，故用写删探测
 * @returns {boolean} 是否可用
 */
function detectLocalStorage() {
  try {
    const probeKey = '__shared_device_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * 当前生效的后端存储（惰性探测 + 缓存）
 * 非浏览器环境（SSR / Jest node 环境）直接走内存降级
 * @returns {'localStorage'|'memory'} 生效后端
 */
function backingStorage() {
  if (localStorageAvailable === null) {
    localStorageAvailable =
      typeof window !== 'undefined' && typeof window.localStorage !== 'undefined' && detectLocalStorage();
  }
  return localStorageAvailable ? 'localStorage' : 'memory';
}

/**
 * 读取键值（不可用时读内存降级层）
 * @param {string} key 存储键
 * @returns {string|null} 值；不存在返回 null
 */
export function safeGetItem(key) {
  try {
    if (backingStorage() === 'localStorage') {
      return window.localStorage.getItem(key);
    }
  } catch {
    /* 探测结果过期（如中途进入隐私模式），落入内存层 */
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

/**
 * 写入键值（不可用时写内存降级层）
 * @param {string} key 存储键
 * @param {string} value 值
 */
export function safeSetItem(key, value) {
  try {
    if (backingStorage() === 'localStorage') {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    /* 配额溢出等写入失败，落入内存层 */
  }
  memoryStore.set(key, value);
}

/**
 * 移除键值（两层都清，避免降级切换后残留脏值）
 * @param {string} key 存储键
 */
export function safeRemoveItem(key) {
  memoryStore.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* 忽略 */
  }
}

/** 仅测试使用：重置探测缓存与内存层，隔离用例间状态 */
export function __resetStorageForTest() {
  memoryStore.clear();
  localStorageAvailable = null;
}
