/**
 * 防火墙核心配置文件
 * 定义持久化路径、外部解析 API、默认节点位置、安全防御策略矩阵
 * 阈值参数支持环境变量覆盖
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIREWALL_FILE = path.resolve(
  __dirname,
  '../../../data/firewall_config.json'
);

export const CHALLENGE_SECRET = process.env.FIREWALL_SECRET;

if (!CHALLENGE_SECRET) {
  console.error('[Firewall] FIREWALL_SECRET 环境变量未设置');
  if (process.env.NODE_ENV === 'production') {
    console.error('[Firewall] 生产环境必须设置 FIREWALL_SECRET，系统退出');
    process.exit(1);
  }
}

export const DEFAULT_SERVER_NODE = {
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

export const DEFAULT_IP_APIS = [
  {
    id: 'ipinfo',
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    isText: false,
    parse: (data) => {
      if (data.error || data.status === 429)
        throw new Error(data.error?.message || '请求被限流');
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
    parse: (data) => {
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
    parse: (text) => {
      const match = text.match(/returnCitySN\s*=\s*(\{.+\})/);
      if (!match) throw new Error('解析失败');
      const data = JSON.parse(match[1]);
      if (!data.cip || data.cip === '127.0.0.1')
        throw new Error('获取到的是本地地址');
      const city = (data.cid || '').replace(
        /省|市|自治区|壮族|回族|维吾尔|特别行政区/g,
        ''
      );
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
    parse: (data) => {
      if (data.code === 'KeyDisabled' || data.code === 'InvalidKey')
        throw new Error('API Key 未配置');
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

export const DEFAULT_IP_API = DEFAULT_IP_APIS.find((api) => api.id === 'sohu');

/**
 * 默认安全策略矩阵
 * 阈值参数支持环境变量覆盖，格式: FW_<大写参数名>
 */
export const DEFAULT_SECURITY_SETTINGS = {
  activeIpApi: process.env.FW_ACTIVE_IP_API || 'sohu',
  showTrajectory: true,

  defense: {
    manualBlacklistIps: [],
    manualBlacklistUsers: [],
    manualWhitelistIps: [],

    // --- 扫描检测 ---
    enableAutoBlacklist: true,
    maxNotFoundAttempts: parseInt(process.env.FW_SCAN_THRESHOLD || '10'),
    blacklistDuration: parseInt(process.env.FW_BLACKLIST_DURATION || '3600'),
    notFoundWindow: parseInt(process.env.FW_SCAN_WINDOW || '60'),
    safePaths: [
      '/health',
      '/favicon.ico',
      '/robots.txt',
      '/__fw/',
      '/api/firewall/'
    ],

    internalIpPrefixes: [
      '127.',
      '10.',
      '192.168.',
      '::1',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.20.',
      '172.21.',
      '172.22.',
      '172.23.',
      '172.24.',
      '172.25.',
      '172.26.',
      '172.27.',
      '172.28.',
      '172.29.',
      '172.30.',
      '172.31.'
    ],

    idcIpPrefixes: [
      '100.104.',
      '101.37.',
      '47.88.',
      '162.14.',
      '101.36.',
      '52.82.'
    ],

    // --- 全局限频 ---
    enableRateLimit: true,
    rateLimitRequests: parseInt(process.env.FW_RATE_LIMIT || '60'),
    rateLimitWindow: parseInt(process.env.FW_RATE_WINDOW || '60'),

    // --- 用户级限频 ---
    enableUserRateLimit: true,
    userRateLimitRequests: parseInt(process.env.FW_USER_RATE_LIMIT || '120'),
    userRateLimitWindow: 60,

    // --- 暴力破解防护 ---
    enableBruteForce: true,
    bruteLimit: parseInt(process.env.FW_BRUTE_LIMIT || '5'),
    bruteWindow: 300,
    accountLockTime: parseInt(process.env.FW_LOCK_TIME || '900'),
    ipBlockTime: 600,
    bruteIpLimit: parseInt(process.env.FW_BRUTE_IP_LIMIT || '10'),

    // --- 并发连接 ---
    enableConnLimit: true,
    maxConn: parseInt(process.env.FW_MAX_CONN || '100'),

    // --- 地理围栏 ---
    enableGeoFilter: process.env.FW_GEO_FILTER === 'true',
    geoRules: {
      // 敏感路径（逗号分隔，环境变量覆盖）
      sensitivePaths: process.env.FW_SENSITIVE_PATHS
        ? process.env.FW_SENSITIVE_PATHS.split(',')
        : ['/api/admin', '/api/payment', '/api/user/delete'],
      internalPrefixes: ['/internal/'],
      overseasLimit: 10,
      overseasWindow: 60,
      overseasBlockTime: 3600
    },

    // --- 端点级限频（可配置数组） ---
    endpointRateLimits: [
      { path: '/api/sms', limit: 3, window: 600, blockTime: 1800 },
      { path: '/api/order', limit: 10, window: 60, blockTime: 1800 },
      { path: '/api/verify', limit: 10, window: 60, blockTime: 300 }
    ],

    // --- Bot 检测（支持字符串和正则表达式） ---
    // 环境变量 FW_BOT_PATTERNS 可追加自定义模式（逗号分隔）
    botPatterns: [
      'python-requests',
      'scrapy',
      'httpclient',
      'go-http-client',
      'java/',
      'libcurl',
      'wget',
      'axios',
      'node-fetch',
      'headless',
      'phantomjs',
      'selenium',
      ...(process.env.FW_BOT_PATTERNS
        ? process.env.FW_BOT_PATTERNS.split(',')
        : [])
    ],
    browserPatterns: ['chrome', 'firefox', 'safari', 'edge', 'opera'],
    botChallengeNoUaLimit: parseInt(process.env.FW_BOT_NOUA_LIMIT || '10'),
    botChallengeBotLimit: parseInt(process.env.FW_BOT_LIMIT || '30'),
    botChallengeBrowserLimit: parseInt(process.env.FW_BROWSER_LIMIT || '120')
  }
};
