/**
 * 防火墙核心配置文件
 * 定义持久化路径、外部解析 API、默认节点位置、安全防御策略矩阵
 * 阈值参数支持环境变量覆盖
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.config.config');

// 持久化路径的单一来源在 framework（防护核心启动期就要读它），这里只做 re-export。
import { FIREWALL_FILE } from '../../../framework/firewall/config/persisted.js';

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

const DEFAULT_IP_APIS = [
  {
    id: 'ipinfo',
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    isText: false,
    parse: data => {
      if (data.error || data.status === 429) throw new Error(data.error?.message || '请求被限流');
      if (!data.ip) throw new Error('返回数据缺少 IP');
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
      if (data.error || !data.ip) throw new Error(data.reason || '请求失败');
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
      if (!match) throw new Error('解析失败');
      const data = JSON.parse(match[1]);
      if (!data.cip || data.cip === '127.0.0.1') throw new Error('获取到的是本地地址');
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
      if (data.code === 'KeyDisabled' || data.code === 'InvalidKey') throw new Error('API Key 未配置');
      if (!data.ip) throw new Error('返回数据缺少 IP');
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

const DEFAULT_IP_API = DEFAULT_IP_APIS.find(api => api.id === 'sohu');

// 默认安全策略矩阵已下沉 framework（单一来源：framework/firewall/config/defaults.js，
// 2026-11-02 随 05-firewall 直接启动防护核心一起迁移）。此处 re-export 维持
// dao.js 与测试的既有 import 路径不变。
export { DEFAULT_SECURITY_SETTINGS } from '../../../framework/firewall/config/defaults.js';

/**
 * 默认安全策略矩阵（re-export，定义见 framework/firewall/config/defaults.js）
 */

export { FIREWALL_FILE, CHALLENGE_SECRET, DEFAULT_SERVER_NODE, DEFAULT_IP_APIS, DEFAULT_IP_API };
