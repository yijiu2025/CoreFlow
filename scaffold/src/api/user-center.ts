/**
 * 个人中心接口（访问令牌 / 第三方账号绑定）
 *
 * 路径前缀 `/user/v1`：只操作**当前登录用户自己**的数据，服务端按会话里的 userId
 * 过滤，前端不需要、也不能传 userId。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { del, get, post } from './http';

const BASE = '/user/v1';

/* ── 访问令牌 ─────────────────────────────────────────────── */

/** 令牌行（永不包含明文与哈希） */
export interface ApiTokenRow {
  id: number;
  name: string;
  /** 明文前 12 字符，仅用于识别 */
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  /** 是否已过期（判定口径在服务端） */
  expired: boolean;
}

/** 作用域候选（来自后端 oauth21 scope 注册表） */
export interface TokenScopeOption {
  id: string;
  label: string;
  description: string;
  required: boolean;
}

/** 令牌列表响应 */
export interface ApiTokenList {
  tokens: ApiTokenRow[];
  availableScopes: TokenScopeOption[];
  maxTokens: number;
}

/** 新建令牌响应：`token` 是唯一一次明文 */
export interface ApiTokenCreated extends ApiTokenRow {
  token: string;
  /** 服务端固定提示：这串令牌只显示一次 */
  warning: string;
}

/** 我的令牌列表 */
export function listMyTokens(): Promise<ApiTokenList> {
  return get(`${BASE}/tokens`);
}

/** 新建令牌（明文只在这一条响应里出现） */
export function createMyToken(body: {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
}): Promise<ApiTokenCreated> {
  return post(`${BASE}/tokens`, body);
}

/** 吊销令牌（软删除） */
export function revokeMyToken(id: number): Promise<{ id: number }> {
  return del(`${BASE}/tokens/${id}`);
}

/* ── 第三方账号 ───────────────────────────────────────────── */

/** 已绑定的第三方账号 */
export interface BoundIdentityRow {
  id: number;
  provider: string;
  providerLabel: string;
  displayName: string | null;
  /** 打码后的第三方账号标识 */
  account: string;
  boundAt: string | null;
}

/** 可绑定 provider（未接入的 `available=false` 且带原因） */
export interface IdentityProviderOption {
  provider: string;
  label: string;
  available: boolean;
  reason: string | null;
  /** 当前用户是否已绑定该 provider */
  bound: boolean;
}

/** 绑定列表响应 */
export interface IdentityList {
  identities: BoundIdentityRow[];
  providers: IdentityProviderOption[];
}

/** 我的第三方绑定 + 可绑定清单 */
export function listMyIdentities(): Promise<IdentityList> {
  return get(`${BASE}/identities`);
}

/** 解绑第三方账号（唯一登录方式会被服务端拒绝） */
export function unbindMyIdentity(id: number): Promise<{ id: number }> {
  return del(`${BASE}/identities/${id}`);
}
