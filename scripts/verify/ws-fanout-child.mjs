/**
 * 关卡：跨实例 WS 广播 —— 接收端（子进程）
 *
 * 本进程扮演「另一个实例」：订阅 Redis 频道，并把收到的消息投给一个**假 WS 客户端**。
 * 用假客户端而不是真 WebSocket，是因为本关卡要验证的是「消息有没有跨进程送达」，
 * 与传输层实现无关；真 WebSocket 需要浏览器，反而引入无关变量。
 *
 * 协议行（父进程按行解析，其余输出视为日志噪声）：
 *   READY            订阅连接就绪 + 假客户端已注册
 *   CLIENT_RECV <j>  假客户端收到一条消息（JSON）
 *   ENV_UNAVAILABLE  Redis 不可用
 */
process.loadEnvFile(process.env.VERIFY_ENV_FILE || '.env');
// 隔离遥测落盘：默认路径 src/data/traffic_stats.json 是被 git 跟踪的文件，直写会留脏改动
process.env.FW_TRAFFIC_STATS_FILE = process.env.FW_TRAFFIC_STATS_FILE || '.tmp-probe/ws-fanout-stats.json';

const { connectStandalone, isPubSubReady } = await import('../../src/framework/redis/index.js');

const conn = await connectStandalone();
if (!conn.ready) {
  console.log(`ENV_UNAVAILABLE ${conn.reason}`);
  process.exit(3);
}

const { registerMonitorClient } = await import('../../src/app/firewall/services/monitor.service.js');

const fakeClient = {
  readyState: 1,
  on() {},
  removeListener() {},
  send(data) {
    console.log(`CLIENT_RECV ${data}`);
  }
};

registerMonitorClient(fakeClient);

// 等订阅连接真正就绪再报 READY —— 不能靠猜时间，否则父进程发的消息会落在订阅生效之前
const DEADLINE = Date.now() + 10_000;
while (!isPubSubReady() && Date.now() < DEADLINE) {
  await new Promise(r => setTimeout(r, 100));
}

if (!isPubSubReady()) {
  console.log('ENV_UNAVAILABLE 订阅连接未在 10s 内就绪');
  process.exit(3);
}

console.log('READY');
