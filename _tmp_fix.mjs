import fs from 'node:fs';
const p = 'src/auth/session.js';
let s = fs.readFileSync(p, 'utf8');
const marker = "import { DEVICE_TYPE, detectDeviceType } from './device.js';";
if (!s.includes(marker)) { console.error('marker not found'); process.exit(1); }
const block = [
  '',
  '/** 认证调试开关 */',
  "const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';",
  'function _debug(...args) {',
  "  if (DEBUG_AUTH) console.log('[Auth Debug]', ...args);",
  '}',
  '',
  '// 统一存储实例（getStore 自动处理 Redis/MapStore、超时、序列化）',
  "const sessionStore = getStore('session');",
  "const refreshStore = getStore('refresh');",
  "const userRefreshStore = getStore('user_refresh');",
  ''
].join('\r\n');
// 替换：marker + 其后到 /** 之间的空行 → marker + block
const re = /import \{ DEVICE_TYPE, detectDeviceType \} from '\.\/device\.js';\r?\n+(?=\/\*\*\r?\n \* 踢掉同设备类型)/;
if (!re.test(s)) { console.error('context not matched'); process.exit(1); }
s = s.replace(re, marker + '\r\n' + block);
fs.writeFileSync(p, s);
console.log('restored, length', s.length);
