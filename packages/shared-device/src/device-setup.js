/**
 * 设备 ID 一站式接入（axios 实例）
 *
 * 把三前端各自复制的拦截器样板收敛为包内单一实现：
 * - 请求拦截器：注入 x-device-id 头（内存缓存直读，近乎零开销）+ 按需指纹头
 * - 响应拦截器：handleDeviceSyncInResponse（服务端下发新 ID 回写 localStorage）
 * - 自动 initDeviceSync（幂等，跨标签页 storage 监听 + 变更回调）
 *
 * 新前端接入仅需：
 *   import { setupDeviceSync } from 'stable-deviceid';
 *   setupDeviceSync(axiosInstance);
 *
 * 与应用自带拦截器的共存约定：
 * - axios 请求拦截器后注册先执行（LIFO），本拦截器只读写 device 相关头，
 *   与 Authorization/签名类拦截器互不冲突；
 * - axios 响应拦截器先注册先执行，建议在创建实例后立即调用本函数，
 *   让设备同步先于业务响应处理（与现有三前端"响应拦截器首行同步"行为一致）。
 *
 * 实现为纯 JS（而非 TS）：根 Jest 配置 transform: {}（纯 ESM 不编译 TS），
 * 单元测试直接 import 本文件（与包内其他模块同一约定）。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */

import { getStableDeviceId } from './device-id.js';
import { getDeviceFingerprint, isDeviceFingerprintEnabled } from './device-fingerprint.js';
import { handleDeviceSyncInResponse, initDeviceSync } from './device-sync.js';

/** 指纹请求头（统一小写；HTTP 头不区分大小写，后端 req.headers 一律小写键） */
const FP_HEADER = 'x-device-fp';

/**
 * 一站式接入设备 ID 体系（axios 实例）
 *
 * @param {AxiosLikeInstance} axiosInstance axios 实例（axios.create() 产物；
 *   最小结构要求 interceptors.request/response 的 use/eject，真 axios 结构兼容）
 * @param {SetupDeviceSyncOptions} [options] 配置项
 * @returns {() => void} dispose 函数：eject 本函数注册的两个拦截器
 *   （单测隔离 / HMR 热更 / 动态卸载场景使用）
 */
export function setupDeviceSync(axiosInstance, options = {}) {
  if (!axiosInstance || !axiosInstance.interceptors?.request?.use || !axiosInstance.interceptors?.response?.use) {
    throw new TypeError('setupDeviceSync: 需要传入 axios 实例（含 interceptors.request/response.use）');
  }

  // initDeviceSync 幂等（监听器只注册一次），透传变更回调
  initDeviceSync({ onDeviceIdChange: options.onDeviceIdChange });

  const requestInterceptorId = axiosInstance.interceptors.request.use(async config => {
    if (config.headers) {
      config.headers['x-device-id'] = getStableDeviceId();

      // 指纹默认走环境判定（每请求判定，与现有三前端行为一致）；options.fingerprint 可强制开关
      const fingerprintEnabled = options.fingerprint ?? isDeviceFingerprintEnabled();
      if (fingerprintEnabled) {
        try {
          const fingerprint = await getDeviceFingerprint();
          if (fingerprint) config.headers[FP_HEADER] = fingerprint;
        } catch {
          // 采集失败不影响主流程（后端未启用时此头被忽略）
        }
      }
    }
    return config;
  });

  const responseInterceptorId = axiosInstance.interceptors.response.use(response => {
    handleDeviceSyncInResponse(response);
    return response;
  });

  return function dispose() {
    axiosInstance.interceptors.request.eject(requestInterceptorId);
    axiosInstance.interceptors.response.eject(responseInterceptorId);
  };
}

/**
 * 获取设备 ID 请求头（同步，供 fetch 场景与显式带头使用）
 *
 * 适用：原生 fetch 调用、绕过拦截器的特殊请求（如 verifyChallenge 需显式带
 * x-device-id 与后端验证标记对齐）、非 axios HTTP 客户端。
 *
 * @returns {Object<'x-device-id', string>} 设备 ID 请求头对象
 */
export function getDeviceHeaders() {
  return { 'x-device-id': getStableDeviceId() };
}
