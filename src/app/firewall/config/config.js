/**
 * 防火墙核心配置文件
 * 定义持久化路径、外部解析 API、默认节点位置、安全防御策略矩阵
 * 阈值参数支持环境变量覆盖
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.firewall.config.config');

// 持久化路径的单一来源在 framework（防护核心启动期就要读它），这里只做 re-export。
import { FIREWALL_FILE } from '../../../framework/ingress/firewall/config/persisted.js';
// 生效默认值 = **core 保底 ← 面板层内置默认 ← src/config 静态覆盖**：
// core 只含防护策略（defense）；面板展示偏好（activeIpApi / showTrajectory）的
// 内置默认在 ./panel.js，但用户在 src/config/firewall_config.js 里写了就以那份为准。
import { deepMerge } from '../../../framework/config/runtime.js';
import { DEFAULT_SECURITY_SETTINGS as CORE_SECURITY_SETTINGS } from '../../../framework/ingress/firewall/config/defaults.js';
import { DEFAULT_PANEL_SETTINGS } from './panel.js';

const CHALLENGE_SECRET = process.env.FIREWALL_SECRET;

if (!CHALLENGE_SECRET) {
  log.error('[Firewall] FIREWALL_SECRET 环境变量未设置');
  if (process.env.NODE_ENV === 'production') {
    log.error('[Firewall] 生产环境必须设置 FIREWALL_SECRET，系统退出');
    process.exit(1);
  }
}

const DEFAULT_SERVER_NODE = {
  name: '核心防御节点',
  country: '中国',
  region: '河南',
  city: '郑州',
  ip: '127.0.0.1',
  lat: 34.75,
  lon: 113.65,
  lastUpdate: null
};

const COUNTRY_MAP = {
  CN: '中国',
  US: '美国',
  JP: '日本',
  KR: '韩国',
  TW: '中国台湾',
  HK: '中国香港',
  MO: '中国澳门',
  SG: '新加坡',
  TH: '泰国',
  VN: '越南',
  MY: '马来西亚',
  ID: '印度尼西亚',
  PH: '菲律宾',
  IN: '印度',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  RU: '俄罗斯',
  CA: '加拿大',
  AU: '澳大利亚',
  BR: '巴西',
  NZ: '新西兰',
  IT: '意大利',
  ES: '西班牙',
  NL: '荷兰',
  SE: '瑞典',
  CH: '瑞士',
  MX: '墨西哥',
  TR: '土耳其',
  SA: '沙特阿拉伯',
  AE: '阿联酋',
  IL: '以色列',
  EG: '埃及',
  ZA: '南非',
  NG: '尼日利亚',
  AR: '阿根廷'
};

/**
 * 标记"数据源给不出可用结果"（本地地址 / 解析失败 / 被限流 / Key 未配置）
 *
 * 与程序故障区分开：这类失败是**常态** —— 服务器在代理或 NAT 后面时，第三方接口
 * 看到的就是内网或回环地址。调用方据此降级为提示日志，不再每次启动刷一条带 stack
 * 的 WARN（那会把真正的故障淹掉）。
 *
 * @param {string} reason 面向运维的原因描述
 * @returns {Error} 带 sourceUnavailable 标记的错误
 */
function sourceUnavailable(reason) {
  const err = new Error(reason);
  err.sourceUnavailable = true;
  return err;
}

const DEFAULT_IP_APIS = [
  {
    id: 'ipinfo',
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    isText: false,
    parse: data => {
      if (data.error || data.status === 429) throw sourceUnavailable(data.error?.message || '请求被限流');
      if (!data.ip) throw sourceUnavailable('返回数据缺少 IP');
      const [lat, lon] = (data.loc || '').split(',').map(Number);
      return {
        ip: data.ip,
        country: COUNTRY_MAP[data.country] || data.country || '未知',
        region: data.region || '',
        city: data.city || '',
        lat: lat || null,
        lon: lon || null
      };
    }
  },
  {
    id: 'ipapi',
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    isText: false,
    parse: data => {
      if (data.error || !data.ip) throw sourceUnavailable(data.reason || '请求失败');
      return {
        ip: data.ip,
        country: COUNTRY_MAP[data.country_code] || data.country_name || '未知',
        region: data.region || '',
        city: data.city || '',
        lat: data.latitude || null,
        lon: data.longitude || null
      };
    }
  },
  {
    id: 'sohu',
    name: '搜狐IP (国内)',
    url: 'http://pv.sohu.com/cityjson?ie=utf-8',
    isText: true,
    parse: text => {
      const match = text.match(/returnCitySN\s*=\s*(\{.+\})/);
      if (!match) throw sourceUnavailable('解析失败');
      const data = JSON.parse(match[1]);
      if (!data.cip || data.cip === '127.0.0.1') throw sourceUnavailable('获取到的是本地地址');
      const city = (data.cid || '').replace(/省|市|自治区|壮族|回族|维吾尔|特别行政区/g, '');
      return {
        ip: data.cip,
        country: '中国',
        region: city || '河南',
        city,
        lat: null,
        lon: null
      };
    }
  },
  {
    id: 'baidu',
    name: '百度IP',
    url: 'https://qifu-api.baidubce.com/ip/local/geo/v1/district',
    isText: false,
    parse: data => {
      if (data.code === 'KeyDisabled' || data.code === 'InvalidKey') throw sourceUnavailable('API Key 未配置');
      if (!data.ip) throw sourceUnavailable('返回数据缺少 IP');
      return {
        ip: data.ip,
        country: data.country || '中国',
        region: data.prov || '',
        city: data.city || '',
        lat: null,
        lon: null
      };
    }
  }
];

/** 面板层专有的顶层键（core 内置默认值里没有它们，见 framework/.../config/defaults.js） */
const PANEL_OWNED_KEYS = ['activeIpApi', 'showTrajectory'];

/**
 * 叠加「静态覆盖里显式写的面板层键」
 *
 * 优先级（**用户写的一律优先，非法才回落默认**）：
 *   面板层内置默认（./panel.js） ← `src/config/firewall_config.js` 里显式写的键
 *
 * 为什么可以这样判断来源：core 内置默认值（`FIREWALL_DEFAULTS`）只有 `defense.*`，
 * 面板层键**只可能**来自静态覆盖，因此「core 侧存在该键」= 用户显式写了它。
 * 非法值（枚举外的 activeIpApi、非布尔的 showTrajectory）在
 * `framework/ingress/firewall/config/defaults.js` 的 `sanitizeSecuritySettings`
 * 阶段就被丢弃并告警，所以走到这里的值一定是校验过的 —— 天然满足「不能用时才回默认」。
 *
 * @param {object} coreSettings - core 默认值（已含静态覆盖、已过校验）
 * @param {object} panelDefaults - 面板层内置默认值
 * @returns {{settings: object, overridden: string[]}} 叠加后的面板层值 + 被覆盖的键名
 */
function applyPanelOverrides(coreSettings, panelDefaults) {
  const overridden = {};
  for (const key of PANEL_OWNED_KEYS) {
    if (Object.hasOwn(coreSettings, key)) overridden[key] = coreSettings[key];
  }
  return { settings: { ...panelDefaults, ...overridden }, overridden: Object.keys(overridden) };
}

const PANEL_MERGE = applyPanelOverrides(CORE_SECURITY_SETTINGS, DEFAULT_PANEL_SETTINGS);
if (PANEL_MERGE.overridden.length > 0) {
  const detail = PANEL_MERGE.overridden.map(k => `${k}=${JSON.stringify(PANEL_MERGE.settings[k])}`).join(', ');
  log.info(`[Firewall] 面板层键已按 src/config/firewall_config.js 覆盖: ${detail}`);
}

/**
 * 默认安全策略矩阵（**本 app 的生效默认值**）
 *
 * `deepMerge(core 默认, 面板层值)` —— 方向是「core 打底、面板层补自己的键」：
 *   - `defense` 只有 core 有（52 个防护参数），面板层不复制一份；
 *   - `activeIpApi` / `showTrajectory` 由 `applyPanelOverrides` 决定：
 *     内置面板默认，除非 `src/config/firewall_config.js` 显式写了（写了的优先）。
 *
 * 消费方：`dao.js` 以它为初值，再叠磁盘 JSON（运行期热改 > 静态配置 > 内置默认）；
 * 因此面板 GET /settings 拿到的仍是 `{ activeIpApi, showTrajectory, defense }`
 * 这一完整形状（持久化 schema 未变）。
 */
const DEFAULT_SECURITY_SETTINGS = deepMerge(CORE_SECURITY_SETTINGS, PANEL_MERGE.settings);

/**
 * 生效默认 IP 数据源的对象（`activeIpApi` 对应的那一项）
 *
 * 必须跟着 `DEFAULT_SECURITY_SETTINGS.activeIpApi` 走，不能写死 id：
 * 否则静态覆盖把源换成 ipinfo/baidu 时，这里仍指向旧源，两处默认值漂移。
 */
const DEFAULT_IP_API =
  DEFAULT_IP_APIS.find(api => api.id === DEFAULT_SECURITY_SETTINGS.activeIpApi) || DEFAULT_IP_APIS[0];

export { FIREWALL_FILE, CHALLENGE_SECRET, DEFAULT_SERVER_NODE, DEFAULT_IP_APIS, DEFAULT_IP_API };
export { sourceUnavailable };
export { applyPanelOverrides };

/**
 * 默认安全策略矩阵（含 app 层展示类默认值，定义见 ./defaults.js 与
 * framework/ingress/firewall/config/defaults.js）
 */
export { DEFAULT_SECURITY_SETTINGS };
