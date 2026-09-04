/**
 * 设备 ID 同步工具
 *
 * 处理前端与后端设备 ID 的同步逻辑：
 * 1. 首次登录：从响应头获取新设备 ID
 * 2. 后续请求：自动携带 localStorage 中的设备 ID
 * 3. 设备 ID 更新：检测响应头中的更新标记，同步更新
 *
 * 所有存储操作走 storage.js 安全封装，隐私模式下不抛异常、
 * 不中断调用方的响应处理链路。响应头读取有长度上限与格式校验，
 * 服务端异常/被劫持返回的脏头不会进 localStorage 或日志全文。
 *
 * 实现为纯 JS（而非 TS）：根 Jest 配置 transform: {}（纯 ESM 不编译 TS），
 * 单元测试直接 import 本文件（与 base62-timestamp.js 同一约定）。
 *
 * @author yijiu2025
 * @since 2026-09-01
 * @since 2026-09-03 localStorage 安全封装；AxiosHeaders 鸭子类型兼容；STORAGE_KEY 单一来源；initDeviceSync 防重复注册
 * @since 2026-09-04 缓存一致性（写后失效 device-id 内存缓存）；setDeviceId 入口校验；头长度上限与日志截断
 */

import { parseDeviceId, validateDeviceIdFormat, invalidateCachedDeviceId, STORAGE_KEY } from './device-id.js';
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage.js';

/** 响应头单值长度上限，超过视为脏数据直接忽略（合法 ID 最长 22 字符） */
const MAX_HEADER_VALUE_LENGTH = 128;

/** 日志中外部输入的最大展示长度（防脏数据刷屏/日志注入） */
const MAX_LOG_LENGTH = 48;

/** initDeviceSync 是否已注册过全局监听（防止重复调用导致重复注册） */
let storageListenerRegistered = false;

/**
 * 截断外部输入用于日志展示
 * @param {string} value 原始值
 * @returns {string} 截断后的安全展示值
 */
function forLog(value) {
  const safe = String(value);
  return safe.length > MAX_LOG_LENGTH ? `${safe.slice(0, MAX_LOG_LENGTH)}…` : safe;
}

/**
 * 从各类响应头容器读取指定头（大小写不敏感）
 *
 * 兼容三种形态：
 * - Headers 实例（fetch）
 * - AxiosHeaders 实例（axios，也有 .get 方法且大小写不敏感，鸭子类型识别）
 * - 普通对象（小写 / 原样键）
 *
 * @param {*} headers 响应头容器
 * @param {string} lowerName 头名称（小写）
 * @returns {string|null} 头值；不存在或超长返回 null
 */
function readHeader(headers, lowerName) {
  if (typeof headers !== 'object' || headers === null) return null;

  let value;
  if (typeof headers.get === 'function') {
    value = headers.get(lowerName);
  } else {
    const pascalName = lowerName
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('-');
    value = headers[lowerName] ?? headers[pascalName];
  }

  if (value === null || value === undefined) return null;
  const str = String(value);
  // 防脏数据：合法设备 ID 最长 22 字符，超长头直接忽略
  if (str.length === 0 || str.length > MAX_HEADER_VALUE_LENGTH) return null;
  return str;
}

/**
 * 获取当前设备 ID（从存储读取，隐私模式降级层也可读）
 * @returns {string|null} 设备 ID；不存在返回 null
 */
export function getCurrentDeviceId() {
  return safeGetItem(STORAGE_KEY);
}

/**
 * 设置设备 ID 并持久化到存储（写入后使 device-id 内存缓存失效）
 *
 * 入口校验：非法格式（含超有效期/未来时间）拒绝写入，防止脏值污染
 * 存储后引发"每请求重生"循环。
 * @param {string} deviceId 设备 ID
 * @returns {boolean} 是否写入成功
 */
export function setDeviceId(deviceId) {
  const validation = validateDeviceIdFormat(deviceId);
  if (!validation.valid) {
    console.warn(`⚠️ [DeviceSync] 拒绝写入非法设备 ID（${validation.reason}）: ${forLog(deviceId)}`);
    return false;
  }

  const oldId = getCurrentDeviceId();
  safeSetItem(STORAGE_KEY, deviceId);
  invalidateCachedDeviceId();

  // 通知设备 ID 变更
  if (oldId && oldId !== deviceId && typeof window !== 'undefined') {
    window.deviceSync?.onDeviceIdChange?.(oldId, deviceId);
  }
  return true;
}

/**
 * 从响应头同步设备 ID
 * @param {*} headers HTTP 响应头（Headers / AxiosHeaders / 普通对象）
 * @param {DeviceSyncOptions} [options] 同步选项
 * @returns {string|null} 同步后的设备 ID；响应头无有效 ID 返回 null
 */
export function syncDeviceFromHeaders(headers, options = {}) {
  // 1. 获取响应头中的设备 ID 与更新标记
  const responseDeviceId = readHeader(headers, 'x-device-id');
  const hasDeviceIdUpdated = readHeader(headers, 'x-device-id-updated');

  if (!responseDeviceId) {
    return null;
  }

  // 2. 解析并验证设备 ID
  const parsed = parseDeviceId(responseDeviceId);
  if (!parsed) {
    console.warn(`⚠️ [DeviceSync] 无效的设备 ID 格式: ${forLog(responseDeviceId)}`);
    return null;
  }

  // 3. 获取当前设备 ID
  const currentId = getCurrentDeviceId();

  // 4. 判断是否需要更新
  const shouldUpdate =
    options.forceRefresh || !currentId || currentId !== responseDeviceId || hasDeviceIdUpdated === 'true';

  if (shouldUpdate) {
    setDeviceId(responseDeviceId);
  }

  return responseDeviceId;
}

/**
 * HTTP 响应拦截器集成（axios 响应对象 / fetch Response 均可）
 * @param {*} response 响应对象（需带 headers）
 * @param {DeviceSyncOptions} [options] 同步选项
 * @returns {*} 原响应对象（便于拦截器链式返回）
 */
export function handleDeviceSyncInResponse(response, options) {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !response?.headers) {
    return response;
  }

  syncDeviceFromHeaders(response.headers, options);
  return response;
}

/**
 * 初始化设备 ID 全局配置（重复调用不会重复注册监听器）
 * @param {DeviceSyncOptions} [options] 配置选项
 */ export function initDeviceSync(options = {}) {
  window.deviceSync = {
    onDeviceIdChange: options.onDeviceIdChange
  };

  if (storageListenerRegistered) return;
  storageListenerRegistered = true;

  // 监听本地存储变化（跨标签页同步；oldValue 为 null 是另一标签页首次写入，同样通知）
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && event.newValue && event.newValue !== event.oldValue) {
      invalidateCachedDeviceId();
      window.deviceSync?.onDeviceIdChange?.(event.oldValue ?? '', event.newValue);
    }
  });
}

/**
 * 清除设备 ID（存储与内存缓存同步清除）
 * 仅在需要时使用（如退出登录要求重置设备），通常保持持久化
 */
export function clearDeviceId() {
  safeRemoveItem(STORAGE_KEY);
  invalidateCachedDeviceId();
}

/**
 * 获取设备 ID 使用统计（调试用）
 * @returns {{id: string|null, info: DeviceIdInfo|null, source: 'localStorage'|'none'}} 统计信息
 */ export function getDeviceIdStats() {
  const currentId = getCurrentDeviceId();

  if (currentId) {
    return {
      id: currentId,
      info: parseDeviceId(currentId),
      source: 'localStorage'
    };
  }

  return {
    id: null,
    info: null,
    source: 'none'
  };
}

/** 仅测试使用：重置监听注册标记，隔离用例间状态 */
export function __resetDeviceSyncForTest() {
  storageListenerRegistered = false;
}
