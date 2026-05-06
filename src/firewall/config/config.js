/**
 * 防火墙核心配置文件
 * --------------------------------------------------
 * 定义了防火墙的所有持久化路径、外部解析 API、默认节点位置
 * 以及最重要的安全防御策略矩阵 (Security Defense Matrix)。
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 持久化配置文件存储路径（所有动态修改的设置都会保存在这个 JSON 文件中）
export const FIREWALL_FILE = path.resolve(__dirname, '../../../data/firewall_config.json');

// 僵尸网络挑战校验密钥（通过环境变量获取，用于生成不可伪造的验证 Token）
export const CHALLENGE_SECRET = process.env.FIREWALL_SECRET;

if (!CHALLENGE_SECRET) {
  console.error('🚨 [Firewall] FIREWALL_SECRET 环境变量未设置！');
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 [Firewall] 生产环境必须设置 FIREWALL_SECRET。系统退出。');
    process.exit(1);
  }
}

/**
 * 默认服务器节点信息
 * 用于在前端中控面板的 3D 地图上定位当前服务器。
 */
export const DEFAULT_SERVER_NODE = {
  name: '核心防御节点',   // 节点名称
  country: '中国',        // 国家
  region: '河南',         // 省份/州
  city: '郑州',           // 城市
  ip: '127.0.0.1',       // 服务器公网 IP（初始化后会自动刷新）
  lat: 34.75,            // 纬度（地图坐标）
  lon: 113.65,           // 经度（地图坐标）
  lastUpdate: null       // 上次自动定位成功的时间戳
};

/**
 * 默认 IP 解析 API 列表
 * 当服务器启动或需要重新定位时，会依次尝试以下 API 来获取服务器的地理坐标。
 */
// 国家 ISO 代码 → 中文名映射（常用）
const COUNTRY_MAP = {
  CN: '中国', US: '美国', JP: '日本', KR: '韩国', TW: '中国台湾', HK: '中国香港',
  MO: '中国澳门', SG: '新加坡', TH: '泰国', VN: '越南', MY: '马来西亚', ID: '印度尼西亚',
  PH: '菲律宾', IN: '印度', GB: '英国', DE: '德国', FR: '法国', RU: '俄罗斯',
  CA: '加拿大', AU: '澳大利亚', BR: '巴西', NZ: '新西兰', IT: '意大利', ES: '西班牙',
  NL: '荷兰', SE: '瑞典', CH: '瑞士', MX: '墨西哥', TR: '土耳其', SA: '沙特阿拉伯',
  AE: '阿联酋', IL: '以色列', EG: '埃及', ZA: '南非', NG: '尼日利亚', AR: '阿根廷',
};

export const DEFAULT_IP_APIS = [
  {
    id: 'ipinfo',
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    isText: false,
    parse: (data) => {
      if (data.error || data.status === 429) throw new Error(data.error?.message || '请求被限流，需注册 ipinfo.io');
      if (!data.ip) throw new Error('返回数据缺少 IP');
      const [lat, lon] = (data.loc || '').split(',').map(Number);
      return {
        ip: data.ip,
        country: COUNTRY_MAP[data.country] || data.country || '未知',
        region: data.region || '',
        city: data.city || '',
        lat: lat || null, lon: lon || null,
      };
    },
  },
  {
    id: 'ipapi',
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    isText: false,
    parse: (data) => {
      if (data.error || !data.ip) throw new Error(data.reason || '请求失败，可能被限流');
      return {
        ip: data.ip,
        country: COUNTRY_MAP[data.country_code] || data.country_name || '未知',
        region: data.region || '',
        city: data.city || '',
        lat: data.latitude || null, lon: data.longitude || null,
      };
    },
  },
  {
    id: 'ipapi-com',
    name: 'ip-api.com',
    url: 'http://ip-api.com/json/?lang=zh-CN',
    isText: false,
    parse: (data) => {
      if (data.status === 'fail') throw new Error(data.message || '请求失败');
      return {
        ip: data.query,
        country: data.country || '未知',
        region: data.regionName || '',
        city: data.city || '',
        lat: data.lat, lon: data.lon,
      };
    },
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
      if (!data.cip || data.cip === '127.0.0.1') throw new Error('获取到的是本地地址，需从公网访问');
      const city = (data.cid || '').replace(/省|市|自治区|壮族|回族|维吾尔|特别行政区/g, '');
      return { ip: data.cip, country: '中国', region: city || '河南', city, lat: null, lon: null };
    }
  },
  {
    id: 'baidu',
    name: '百度IP',
    url: 'https://qifu-api.baidubce.com/ip/local/geo/v1/district',
    isText: false,
    parse: (data) => {
      if (data.code === 'KeyDisabled' || data.code === 'InvalidKey') throw new Error('API Key 未配置或已禁用');
      if (!data.ip) throw new Error('返回数据缺少 IP');
      return {
        ip: data.ip,
        country: data.country || '中国',
        region: data.prov || '',
        city: data.city || '',
        lat: null, lon: null,
      };
    }
  }
];

// 默认使用的 IP 解析源
export const DEFAULT_IP_API = DEFAULT_IP_APIS.find((api) => api.id === 'sohu');

/**
 * 默认安全策略矩阵 (Security Defense Matrix)
 * 系统所有防御行为的基准阈值。
 */
export const DEFAULT_SECURITY_SETTINGS = {
  activeIpApi: 'sohu',   // 当前生效的服务器定位 API 标识符
  showTrajectory: true,  // 前端是否渲染动态访问轨迹线
  
  defense: {
    // --- 核心动态名单 ---
    manualBlacklistIps: [],     // 手动拉黑的 IP 列表（永久封禁）
    manualBlacklistUsers: [],   // 手动封禁的用户 ID/账号（该账号任何 IP 登录都将被拦截）
    manualWhitelistIps: [],     // 受信任的公网 IP 白名单（完全绕过防火墙检查）
    
    // --- 自动审计与 404/403 扫描检测 ---
    enableAutoBlacklist: true,  // 是否启用自动封禁非法扫描器
    maxNotFoundAttempts: 10,     // 在指定窗口期内，连续出现多少次 404/403 错误则判定为扫描行为
    blacklistDuration: 3600,    // 自动封禁的持续时间（秒），默认 1 小时
    notFoundWindow: 60,         // 扫描行为审计的滑动时间窗口（秒）
    
    // 安全路径：访问这些路径即使报错 404，也不会累加扫描权重（如心跳、探针等）
    safePaths: ['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/'],
    
    // 内网 IP 前缀：识别为内网访问，免除部分高性能敏感的检测
    internalIpPrefixes: [
      '127.', '10.', '192.168.', '::1',
      '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', 
      '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', 
      '172.30.', '172.31.'
    ],
    
    // 云厂商/IDC 前缀：已知的大型数据中心 IP，可独立配置限频策略
    idcIpPrefixes: ['100.104.', '101.37.', '47.88.', '162.14.', '101.36.', '52.82.'],
    
    // --- 访问频率限制 (Rate Limiting) ---
    enableRateLimit: true,      // 是否启用全局 IP 限频
    rateLimitRequests: 60,      // 每个周期允许的最大请求数
    rateLimitWindow: 60,        // 限频计算周期（秒）

    // --- 用户级限频 (User Rate Limiting) ---
    enableUserRateLimit: true,  // 是否启用已登录用户限频（独立于 IP 限频）
    userRateLimitRequests: 120, // 已登录用户每周期最大请求数（通常高于 IP 限频）
    userRateLimitWindow: 60,    // 用户限频计算周期（秒）

    // --- 登录暴力破解防护 (Anti-Brute Force) ---
    enableBruteForce: true,     // 是否启用登录保护
    bruteLimit: 5,              // 账号维度：单一账号允许连续登录失败的次数
    bruteWindow: 300,           // 失败计数窗口（秒）
    accountLockTime: 900,       // 触发保护后，锁定该账号的时间（秒）
    ipBlockTime: 600,           // 触发保护后，同时封禁该来源 IP 的时间（秒）
    bruteIpLimit: 10,           // IP 维度：单一 IP 允许全站范围内登录失败的总次数
    
    // --- 连接并发管理 ---
    enableConnLimit: true,      // 是否限制单一 IP 的并发 TCP 连接数
    maxConn: 100,               // 最大并发活跃连接数
    
    // --- 地理围栏防护 (Geo-Fencing) ---
    enableGeoFilter: false,     // 是否开启地理位置准入检查
    geoRules: {
      sensitivePaths: ['/api/admin', '/api/payment', '/api/user/delete'], // 仅限国内访问的敏感接口
      internalPrefixes: ['/internal/'], // 仅限内网访问的路径
      overseasLimit: 10,                // 境外访问敏感接口时的极低频限制
      overseasWindow: 60,               // 境外检测窗口
      overseasBlockTime: 3600           // 境外违规后的封禁时长
    },
    
    // --- 机器人与僵尸网络检测 (Bot Challenge) ---
    // 匹配这些特征的 User-Agent 被视为机器人或自动化爬虫
    botPatterns: [
      'python-requests', 'scrapy', 'httpclient',
      'go-http-client', 'java/', 'libcurl',
      'wget', 'axios', 'node-fetch',
      'headless', 'phantomjs', 'selenium'
    ],
    // 匹配这些特征的被视为合法真人浏览器
    browserPatterns: [
      'chrome', 'firefox', 'safari', 'edge', 'opera'
    ],
    botChallengeNoUaLimit: 10,    // 无 UA 访问时的挑战触发阈值
    botChallengeBotLimit: 30,     // 确认为机器人 UA 时的挑战阈值
    botChallengeBrowserLimit: 120 // 确认为真人 UA 但频率异常时的挑战阈值
  }
};
