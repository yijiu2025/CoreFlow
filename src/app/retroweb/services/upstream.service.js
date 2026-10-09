/**
 * RetroWeb 算法服务上游转发工具
 *
 * Python retrochimera（Flask :8000/api）是**无状态计算层**：不认识用户、不存数据。
 * Node 中转把前端请求转发给它，并在中间做鉴权 / 落库 / 配额。
 *
 * 🔴 上游地址单一来源：`RETRO_PYTHON_URL` 环境变量（形如 `http://127.0.0.1:8000/api`）。
 *    不写死 localhost —— 生产 Python 在内网另一台机器，dev 才是本机。
 * 🔴 未配置时：转发直接失败（返回明确错误），不要静默吞掉让前端无限转圈。
 *
 * 三类调用形态：
 *   ① 同步转发（parse / depict / models / load）：`forwardJson`，直接回 JSON；
 *   ② 流式透传（SSE：analyze / conditions / followup）：`forwardStream`，逐块透传；
 *   ③ job 提交 + 轮询（predict / search）：由 job.service 落库后转发。
 *
 * @since 2026-10-09
 */

/** 上游算法服务根地址（含 /api 前缀） */
function upstreamBase() {
  const base = process.env.RETRO_PYTHON_URL || '';
  return base.replace(/\/$/, '');
}

class UpstreamUnavailableError extends Error {
  constructor() {
    super('逆合成算法服务未配置（请设置 RETRO_PYTHON_URL）');
    this.name = 'UpstreamUnavailableError';
  }
}

/**
 * 同步转发：把请求转发给上游，返回解析后的 JSON。
 *
 * @param {string} method HTTP 方法
 * @param {string} path 上游路径（相对 /api，如 `/parse`）
 * @param {object} [body] 请求体（POST/PUT 时）
 * @param {object} [query] 查询参数
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function forwardJson(method, path, body = undefined, query = undefined) {
  const base = upstreamBase();
  if (!base) throw new UpstreamUnavailableError();

  let url = base + path;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }

  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    // 上游解析/绘图可能数十秒，但别无限等：60s 是同步转发的合理上限
    signal: AbortSignal.timeout(60000)
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text; // 非 JSON（罕见），原样透传
  }
  return { ok: res.ok, status: res.status, data: payload };
}

/**
 * 流式透传：把上游的 SSE 流逐块转给前端。
 *
 * 🔴 关键约束（见规划 §6.3）：
 *    ① 客户端断开 ⇒ 必须取消上游请求（AbortSignal），否则 Python 白算；
 *    ② 背压：reply.raw 写不动时暂停读上游；
 *    ③ 不缓存整段：边读边写，内存 O(1)。
 *
 * @param {object} fastify Fastify 实例（拿 reply.raw）
 * @param {object} reply 响应对象
 * @param {string} path 上游路径
 * @param {object} [body] 请求体
 */
async function forwardStream(fastify, reply, path, body = undefined) {
  const base = upstreamBase();
  if (!base) {
    return reply.result.fail('逆合成算法服务未配置（请设置 RETRO_PYTHON_URL）', null, 503);
  }

  const upstream = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(600000) // SSE 长任务：最长 10 分钟
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return reply.result.fail(`上游算法服务返回 ${upstream.status}`, { detail: text }, 502);
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 客户端断开 ⇒ 取消上游（AbortController 联动 request.raw 的 close 事件）
  const abort = new AbortController();
  const onClose = () => abort.abort();
  reply.raw.on('close', onClose);

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!reply.raw.writable) break;
      // 背压：写不动就等 drain
      if (!reply.raw.write(value)) {
        await new Promise(resolve => reply.raw.once('drain', resolve));
      }
    }
  } finally {
    reader.releaseLock();
    reply.raw.removeListener('close', onClose);
    reply.raw.end();
  }
  return reply;
}

export { forwardJson, forwardStream, UpstreamUnavailableError, upstreamBase };
