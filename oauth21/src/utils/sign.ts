/**
 * 请求签名工具（学闲鱼 generateSign 模式：固定 appKey 前后端共享）
 *
 * 签名机制：
 * - appKey 写在前端 .env（VITE_SIGN_APP_KEY）+ 后端 .env（SIGN_APP_KEY），前后端同一值
 * - sign = sha256(`${appKey}&${timestamp}&${nonce}&${urlPath}&${paramsStr}&${bodyStr}`)
 * - 前端计算 sign 注入 X-Sign/X-Timestamp/X-Nonce 头 + query，后端用同一 appKey 重算验签
 *
 * 安全边界：appKey 在前端是公开的（代码可反编译），本机制是弱防爬设计
 * （防接口被简单灌水/篡改 query），不是防伪造。真正敏感操作仍靠登录态+权限校验。
 *
 * 与原 h5TokenMd5（后端下发 cookie）的区别：不依赖 cookie，跨域 iframe 场景更稳；
 * 但密钥固定不变，安全性不增反降，仅作防爬用。
 *
 * @author yijiu2025
 * @since 2026-08-27
 */
import { sha256 } from './sha256';

/** 前后端共享的 appKey（从 env 读，编译期定值） */
const APP_KEY = import.meta.env.VITE_SIGN_APP_KEY || '';

/**
 * 生成签名（双因子：sessionKey + appKey）
 * sign = sha256(`${sessionKey}&${appKey}&${timestamp}&${nonce}&${urlPath}&${paramsStr}&${bodyStr}`)
 * @param sessionKey 会话密钥（h5TokenMd5，后端下发 cookie，会话变）
 * @param timestamp 时间戳
 * @param nonce 随机串（防重放）
 * @param urlPath 请求路径（不含 query）
 * @param paramsStr params 序列化串（按 key 排序，见 serializeParamsForSign）
 * @param bodyStr body JSON 串
 * @returns sha256 hex
 */
export async function generateSignWithKey(
  sessionKey: string,
  timestamp: number,
  nonce: string,
  urlPath: string,
  paramsStr: string,
  bodyStr: string
): Promise<string> {
  if (!APP_KEY) {
    console.warn('[Sign] VITE_SIGN_APP_KEY 未配置，签名将失效');
  }
  const msg = `${sessionKey}&${APP_KEY}&${timestamp}&${nonce}&${urlPath}&${paramsStr}&${bodyStr}`;
  return sha256(msg);
}

/**
 * 生成签名（学闲鱼 generateSign，但用 sha256 + 含 nonce/url/params/body）
 * 仅用 appKey（无 sessionKey），用于无 cookie 场景
 * @param timestamp 时间戳
 * @param nonce 随机串（防重放）
 * @param urlPath 请求路径（不含 query）
 * @param paramsStr params 序列化串（按 key 排序，见 serializeParamsForSign）
 * @param bodyStr body JSON 串
 * @returns sha256 hex
 */
export async function generateSign(
  timestamp: number,
  nonce: string,
  urlPath: string,
  paramsStr: string,
  bodyStr: string
): Promise<string> {
  if (!APP_KEY) {
    console.warn('[Sign] VITE_SIGN_APP_KEY 未配置，签名将失效');
  }
  const msg = `${APP_KEY}&${timestamp}&${nonce}&${urlPath}&${paramsStr}&${bodyStr}`;
  return sha256(msg);
}

/**
 * 序列化 params 用于签名（按 key 字典序排序，key=value，value encodeURIComponent，& 连接）
 * 与后端 signature.js serializeQueryForSign 必须完全一致。
 * 只支持扁平 key-value；数组/嵌套对象不保证一致。
 */
export function serializeParamsForSign(params: any): string {
  if (!params) return '';
  if (params instanceof URLSearchParams) {
    const pairs: [string, string][] = [];
    params.forEach((v, k) => pairs.push([k, v]));
    if (pairs.length === 0) return '';
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  }
  if (typeof params !== 'object') return '';
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null);
  if (keys.length === 0) return '';
  keys.sort();
  return keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
}

/** 获取 appKey（供外部判断是否配置） */
export function getAppKey(): string {
  return APP_KEY;
}

/**
 * 生成设备ID（学闲鱼 generate_device_id，RFC4122 v4 UUID + userId 后缀）
 * 注意：此实现用 Math.random（非密码学安全），仅作设备标识防爬用，不用于安全场景。
 * 现有设备码推荐用 device-id.ts 的 getStableDeviceId（crypto.randomUUID + localStorage 持久）。
 * @param userId 用户 ID（拼在 UUID 后，跨用户区分）
 */
export function generateDeviceId(userId: string | number = 0): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const result: string[] = [];
  for (let i = 0; i < 36; i++) {
    if ([8, 13, 18, 23].includes(i)) {
      result.push('-');
    } else if (i === 14) {
      result.push('4');
    } else if (i === 19) {
      const randVal = Math.floor(16 * Math.random());
      result.push(chars[(randVal & 0x3) | 0x8]);
    } else {
      const randVal = Math.floor(16 * Math.random());
      result.push(chars[randVal]);
    }
  }
  return `${result.join('')}-${userId}`;
}

/**
 * 生成 mid（学闲鱼 generateMid，随机数+时间戳）
 * 用于请求追踪标识，非安全场景
 */
export function generateMid(): string {
  const randomPart = Math.floor(1000 * Math.random());
  const timestamp = Date.now();
  return `${randomPart}${timestamp} 0`;
}

/**
 * 生成 uuid（学闲鱼 generateUuid，时间戳+1）
 * 简单时间戳型 uuid，非 RFC4122，仅作追踪用
 */
export function generateUuid(): string {
  const timestamp = Date.now();
  return `-${timestamp}1`;
}
