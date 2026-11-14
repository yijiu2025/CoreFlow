/**
 * 「按钮授权闸」的提供方注册位
 *
 * 背景：菜单授权（`sys_role_menu`）里的按钮节点是**角色级开关** —— 取消勾选应当让
 * 该角色的用户既不显示按钮、也调不动接口。但"哪些码是按钮码""这个用户被授了哪些
 * 按钮"只有 `console` 应用知道（`sys_menu` / `sys_role_menu` 是它的表），而
 * `api/guard.js` 被所有应用共用，不能反向依赖某一张业务表。
 *
 * 所以这里留一个**可选**的提供方：console 应用启动时注册一个函数，守卫在判定前
 * 问它一次（提供方自己带缓存）。没注册时（其它部署形态 / 单测）行为与以前完全一致
 * —— 不设闸。
 *
 * 返回形状：`{ buttonCodes: string[], menuPerms: string[] }`
 *   • `buttonCodes` = 全站按钮码（**含停用/下架**，用来回答"这个码是不是按钮码"）
 *   • `menuPerms`   = 该用户被授权且启用的按钮码
 * 返回 null 表示"这次不做闸"（例如该用户根本没有管理后台的码，或该请求不属于该应用）。
 *
 * 🔴 为什么"含停用"：若只收启用项，把按钮停用后该码就从集合里消失，判定会退化成
 *    "不是按钮码 ⇒ 只看 policy"，于是**停用等于放行**。session.js 的 buttonCodes
 *    出于同一理由也含停用项。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('auth.button-grant');

/** 当前提供方（null = 不做按钮级闸） */
let provider = null;

/** 上一次报错的时间：DB 抖动时别每秒刷一行日志 */
let lastWarnAt = 0;

/**
 * 注册提供方
 *
 * @param {((user: object) => Promise<{buttonCodes: string[], menuPerms: string[]}|null>)|null} fn 解析函数
 * @returns {void}
 */
function registerButtonGrantProvider(fn) {
  provider = typeof fn === 'function' ? fn : null;
}

/**
 * 是否已注册提供方
 *
 * @returns {boolean} 是否有提供方
 */
function hasButtonGrantProvider() {
  return provider !== null;
}

/**
 * 解析该用户的按钮授权
 *
 * 提供方抛错时**不阻断请求**：按钮授权是"减项"，读不到就退化成旧行为（只看 policy）。
 * 反过来（读不到就全部拒绝）会把整个控制台锁死 —— 连"改菜单授权"的入口都点不动，
 * 反而没法恢复。提供方自身会缓存最后一份可用快照，真正的空窗只出现在冷启动 + 库不可用。
 *
 * @param {object} user request.state.user
 * @returns {Promise<{buttonCodes?: string[], menuPerms?: string[]}|null>} 授权数据；null = 不设闸
 */
async function resolveButtonGrants(user) {
  if (!provider) return null;
  try {
    return await provider(user);
  } catch (err) {
    const now = Date.now();
    if (now - lastWarnAt > 60_000) {
      lastWarnAt = now;
      log.warn(`[ButtonGrant] 按钮授权解析失败，本次退化为只看 policy：${err?.message}`);
    }
    return null;
  }
}

/**
 * 清空提供方（**仅供测试**）
 *
 * @returns {void}
 */
function resetButtonGrantProviderForTesting() {
  provider = null;
  lastWarnAt = 0;
}

export { registerButtonGrantProvider, hasButtonGrantProvider, resolveButtonGrants, resetButtonGrantProviderForTesting };
