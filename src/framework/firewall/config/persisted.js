/**
 * 防火墙持久化配置的**启动期读取**（framework 层）
 *
 * 为什么这件事必须住在 framework：防护核心（`05-firewall`）要在 `08-api` **之前**注册
 * `@fastify/rate-limit`（该插件用 `onRoute` 钩子给「之后注册的路由」挂限流配置），
 * 而核心在**注册期**就要读 `defense.enableRateLimit` 来决定「注册不注册 / 全局桶开不开」。
 * 配置加载原先住在 app 层（`app/firewall/dao` 的 `initDao`），只能等 `10-apps` 才跑 ——
 * 于是框架要么拿默认值误判开关，要么反过来 import app（依赖方向颠倒）。
 * 现在读取下沉到这里，`05-firewall` 不再需要认识 app。
 *
 * ── 分工（两层各管一段，互不依赖）──
 *   framework（本文件）：启动期**读**一次 + 注册读取器 —— 保证核心拿到真实策略；
 *   app/firewall/dao：加载时重读同一文件并**覆盖**读取器（`registerSettingsReader`
 *     的覆盖语义是刻意的），随后负责面板写入 / 落盘 / 名单同步。
 * 两者读同一个文件，值一致；app 被卸载时本文件仍能给出完整策略。
 *
 * @author yijiu2025
 * @since 2026-11-02
 */
import fs from 'node:fs';
import { DEFAULT_SECURITY_SETTINGS } from './defaults.js';
import { dataFile } from '../../paths.js';
import { dropMisplacedDefenseKeys } from './validate.js';
import { registerSettingsReader } from '../interface/config-access.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.firewall.config.persisted');

/**
 * 持久化文件路径（`data/firewall_config.json`，仓库根的运行期数据目录）
 *
 * 单一来源：app 层的 `config/config.js` 从这里 re-export，避免两处各写一份相对路径
 * （写错一层 `../` 就会静默读不到文件、回退默认策略）。
 */
const FIREWALL_FILE = dataFile('firewall_config.json');

/** 当前生效的安全策略（初值为出厂默认；加载成功后是在其上的深合并结果） */
let settings = clone(DEFAULT_SECURITY_SETTINGS);

/** 深拷贝（仅处理 plain object / array；其余按值返回） */
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}

/**
 * 深合并：plain object 递归，其余（含数组）由 source 覆盖 target
 *
 * 数组整体替换而不是拼接 —— 名单类配置若拼接，删过的条目会「复活」。
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
 * 从磁盘加载持久化策略并注册配置读取器
 *
 * 幂等：可重复调用（app 层加载后再次调用会以文件为准重建）。
 * 文件缺失 / 解析失败都不抛错 —— 防护核心必须能带默认策略启动，只是会少掉面板配置。
 *
 * @returns {boolean} 是否成功读到磁盘配置
 */
function loadPersistedSettings() {
  let loaded = false;
  try {
    if (fs.existsSync(FIREWALL_FILE)) {
      const raw = JSON.parse(fs.readFileSync(FIREWALL_FILE, 'utf-8'));
      if (raw?.securitySettings) {
        // 形状校验：属于 defense 的键写在顶层 → 剔除 + 告警一次（不迁移、不兼容）。
        // 这类值没有任何读取点，留着只会让人以为它生效了。
        const { settings: normalized, misplaced } = dropMisplacedDefenseKeys(raw.securitySettings);
        if (misplaced.length > 0) {
          log.warn(
            `⚠️ [Firewall] ${FIREWALL_FILE} 里这些 defense 键写在了 securitySettings 顶层：` +
              `${misplaced.join(', ')} —— 顶层值已忽略（生效值见 securitySettings.defense.*）。` +
              `请把它们移到 defense 下`
          );
        }
        settings = deepMerge(DEFAULT_SECURITY_SETTINGS, normalized);
        loaded = true;
      }
    }
  } catch (err) {
    log.warn(`⚠️ [Firewall] 读取持久化配置失败，回退默认策略: ${err.message}`);
  }

  // 覆盖式注册：先于 app 生效；app 层 dao 加载后会用同一文件的单例再覆盖一次
  registerSettingsReader(() => settings);
  return loaded;
}

export { FIREWALL_FILE, loadPersistedSettings };
