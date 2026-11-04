/**
 * 通过令牌（pass）的语义：**只豁免「再次挑战」，不豁免计数**
 *
 * 旧行为：命中 pass 时 `onRequest` 直接 return，连 `trackRequestCount()` 都不跑 ——
 * 于是 120 秒窗口内的请求完全不进频次窗口，实测「持 pass 连发 260 次，第 121 次才触发挑战」。
 * 也就是说 2 分钟是"免监控窗口"，不是"配额"。
 *
 * 现在：pass 命中后仍然进第 3 阶段，只有 Bot 挑战判定被跳过（skipChallenge）。
 * 本测试守住两条：
 *   ① skipChallenge=true 时，计数照常累计，且不因超阈值触发挑战；
 *   ② 同一 IP 一旦改成正常判定，超阈值的流量立刻被挑战（说明前面的计数是真的）。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { describe, it, expect } from '@jest/globals';
import { registerSettingsReader } from '../framework/firewall/interface/config-access.js';
import { DEFAULT_SECURITY_SETTINGS } from '../framework/firewall/config/defaults.js';

// 检测器依赖配置读取器（生产由 05-firewall / dao 注册）。裸测试进程必须自己注册，
// 否则 getConfig() 抛错 → 管道按「未知错误 = 硬封禁」处理，测出来全是 429。
registerSettingsReader(() => DEFAULT_SECURITY_SETTINGS);

const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const { runDetectionPipeline } = await import('../framework/firewall/engine/pipeline.js');
const { trackRequestCount } = await import('../framework/firewall/engine/detectors/rate-limiter.js');

/** 最小 reply 替身（挑战路径只需 type / headers / code / send） */
function makeReply(ip) {
  const reply = {
    statusCode: 200,
    responseHeaders: {},
    sentType: undefined,
    sentBody: undefined,
    request: { ip, headers: { 'user-agent': UA_BROWSER, accept: 'application/json' }, method: 'GET', url: '/api/x' },
    code(c) {
      reply.statusCode = c;
      return reply;
    },
    headers(h) {
      Object.assign(reply.responseHeaders, h);
      return reply;
    },
    header(k, v) {
      reply.responseHeaders[k] = v;
      return reply;
    },
    type(t) {
      reply.sentType = t;
      return reply;
    },
    send(b) {
      reply.sentBody = b;
      return reply;
    }
  };
  return reply;
}

/** 打 N 次检测管道，返回是否被拦 */
async function hammer(ip, times, options) {
  const reply = makeReply(ip);
  let blocked = false;
  for (let i = 0; i < times; i++) {
    blocked = await runDetectionPipeline(ip, UA_BROWSER, '/api/x', { blocked: false }, 'fp-test', reply, null, options);
    if (blocked) break;
  }
  return { blocked, reply };
}

describe('通过令牌只豁免挑战判定，不豁免计数', () => {
  it('skipChallenge=true：连打 130 次（浏览器阈值 120）不被挑战，但计数确实涨到阈值以上', async () => {
    const ip = '198.51.100.71';
    const before = trackRequestCount(ip); // 第 1 次（也用于把窗口建起来）

    const { blocked } = await hammer(ip, 130, { skipChallenge: true });
    expect(blocked).toBe(false);

    // 反证「计数没被跳过」：这里的返回值就是窗口内条数
    const after = trackRequestCount(ip);
    expect(after).toBeGreaterThan(120);
    expect(after).toBeGreaterThan(before);
  });

  it('同一批累计流量换成正常判定 → 立刻挑战（证明计数真实生效）', async () => {
    const ip = '198.51.100.72';
    // 先用 skipChallenge 把窗口灌满
    const first = await hammer(ip, 125, { skipChallenge: true });
    expect(first.blocked).toBe(false);

    // 再走正常路径：窗口里已有 >120 条 ⇒ 必须挑战
    const second = await hammer(ip, 1, { skipChallenge: false });
    expect(second.blocked).toBe(true);
    expect(second.reply.statusCode).toBe(428); // XHR 视角
  });

  it('未超阈值时正常路径也不挑战（防止把 skipChallenge 的语义搞反）', async () => {
    const ip = '198.51.100.73';
    const { blocked } = await hammer(ip, 3, { skipChallenge: false });
    expect(blocked).toBe(false);
  });
});
