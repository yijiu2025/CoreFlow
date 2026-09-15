/**
 * 防火墙「设备维度」API 契约测试
 *
 * 覆盖本次新增/改动的四条设备路由与导入导出中的设备分支 ——
 * 这些是**唯一与 IP 无关**的身份维度，也是「换 IP 重来」的唯一解法，
 * 一旦接线错误（漏权限、漏 requireLogin、type 分派写错）都不会有编译期报错。
 *
 * 做法：用 guard-unit.test.js 的同一套 idiom —— mock 掉守卫配置 DAO，
 * 把 `registerSecureRoute` 注册进一个**捕获路由**的假 Fastify，然后：
 *   ① 断言路由表（路径 / requireLogin / preHandler）；
 *   ② 直接调用捕获到的 **真身 handler**，断言它真的改到了封禁存储。
 * 这样既不依赖真实 HTTP 服务与数据库，又不是在测副本。
 *
 * @author yijiu2025
 * @since 2026-09-15
 */
import { describe, it, expect, jest } from '@jest/globals';

// 守卫的配置 DAO 会尝试连库；这里替换成内存桩（同 guard-unit.test.js）
jest.unstable_mockModule('../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    loadFromDB: async () => ({ configs: {}, version: 0, versions: {} }),
    saveToDB: async () => ({ maxVersion: 1, updated: [], versions: {} })
  }
}));

const { setRegistrationContext } = await import('../api/guard.js');
const { default: registerMonitorRoutes } = await import('../api/firewall/v1/monitor.js');
const { default: registerExportRoutes } = await import('../api/firewall/v1/export.js');
const { getActiveBlocks, getActiveWhitelist } = await import('../app/firewall/engine/dao/block-manager.js');
const { generateServerSideDeviceId } = await import('../framework/auth/device-id-service.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

/**
 * 捕获注册进来的路由（key = `METHOD url`）
 *
 * 注意 `registerSecureRoute` 用的是 Fastify 的**对象形式**：
 *   `fastify.get(url, { schema, config, preHandler, handler })`
 * 处理器在 options 里，不是第三个位置参数 —— 所以要从 `opts.handler` 取。
 */
function mockFastify() {
  const routes = new Map();
  const capture = method => (url, opts) => {
    routes.set(`${method} ${url}`, { method, url, opts });
  };
  return {
    routes,
    get: capture('GET'),
    post: capture('POST'),
    put: capture('PUT'),
    delete: capture('DELETE'),
    patch: capture('PATCH')
  };
}

/** 捕获 reply.result.success / badRequest 的载荷 */
function mockReply() {
  const reply = { statusCode: 200, payload: null, rejected: null };
  reply.result = {
    success: (message, data) => {
      reply.payload = { message, data };
      return reply;
    },
    badRequest: message => {
      reply.rejected = message;
      return reply;
    }
  };
  reply.code = c => {
    reply.statusCode = c;
    return reply;
  };
  reply.send = () => reply;
  return reply;
}

/** 注册 monitor + export 两组路由，返回捕获表（整文件只注册一次 —— 守卫自带重复注册检测） */
async function registerRoutes() {
  setRegistrationContext('firewall');
  const app = mockFastify();
  await registerMonitorRoutes(app);
  await registerExportRoutes(app);
  return app.routes;
}

const ROUTES = await registerRoutes();

describe('设备维度 API：路由面与鉴权要求', () => {
  it.each([
    ['POST /v1/monitor/blocks/device', 'POST /v1/monitor/blocks/device'],
    ['DELETE /v1/monitor/blocks/device/:deviceId', 'DELETE /v1/monitor/blocks/device/:deviceId'],
    ['POST /v1/monitor/whitelist/device', 'POST /v1/monitor/whitelist/device'],
    ['DELETE /v1/monitor/whitelist/device/:deviceId', 'DELETE /v1/monitor/whitelist/device/:deviceId']
  ])('%s 已注册且要求登录、带级联守卫', (_label, key) => {
    const route = ROUTES.get(key);
    expect(route).toBeDefined();
    // requireLogin 必须同时出现在「路由 config」里 —— 🔵-17 的匿名短路正是读它
    expect(route.opts.config.requireLogin).toBe(true);
    expect(typeof route.opts.preHandler).toBe('function');
  });

  it('新增设备路由没有覆盖或挤掉既有 IP / 指纹路由', () => {
    expect(ROUTES.has('POST /v1/monitor/blocks')).toBe(true);
    expect(ROUTES.has('POST /v1/monitor/whitelist')).toBe(true);
  });
});

describe('设备维度 API：处理器真实写入存储', () => {
  it('POST /blocks/device → 写入设备封禁（换 IP 也拦得住）', async () => {
    const deviceId = generateServerSideDeviceId(UA);
    const reply = mockReply();

    await ROUTES.get('POST /v1/monitor/blocks/device').opts.handler({ body: { deviceId, permanent: true } }, reply);

    expect(reply.rejected).toBeNull();
    expect(reply.payload.message).toContain('永久封禁');

    const entry = (await getActiveBlocks()).find(b => b.deviceId === deviceId);
    expect(entry).toBeDefined();
    expect(entry.type).toBe('device');
    expect(entry.permanent).toBe(true);
  });

  it('缺 deviceId → 拒绝而不是静默成功', async () => {
    const reply = mockReply();
    await ROUTES.get('POST /v1/monitor/blocks/device').opts.handler({ body: {} }, reply);
    expect(reply.rejected).toBe('缺少设备 ID 参数');
    expect(reply.payload).toBeNull();
  });

  it('DELETE /blocks/device/:deviceId → 解封后列表与状态都不残留', async () => {
    const deviceId = generateServerSideDeviceId(UA);
    await ROUTES.get('POST /v1/monitor/blocks/device').opts.handler(
      { body: { deviceId, permanent: true } },
      mockReply()
    );
    expect((await getActiveBlocks()).find(b => b.deviceId === deviceId)).toBeDefined();

    const reply = mockReply();
    await ROUTES.get('DELETE /v1/monitor/blocks/device/:deviceId').opts.handler({ params: { deviceId } }, reply);

    expect(reply.payload.message).toContain('解除');
    expect((await getActiveBlocks()).find(b => b.deviceId === deviceId)).toBeUndefined();
  });

  it('POST + DELETE /whitelist/device → 设备白名单可增可删', async () => {
    const deviceId = generateServerSideDeviceId(UA);

    await ROUTES.get('POST /v1/monitor/whitelist/device').opts.handler(
      { body: { deviceId, duration: 600 } },
      mockReply()
    );
    expect((await getActiveWhitelist()).find(w => w.deviceId === deviceId)?.type).toBe('device');

    const reply = mockReply();
    await ROUTES.get('DELETE /v1/monitor/whitelist/device/:deviceId').opts.handler({ params: { deviceId } }, reply);
    expect(reply.payload.message).toContain('已移除');
    expect((await getActiveWhitelist()).find(w => w.deviceId === deviceId)).toBeUndefined();
  });
});

describe('设备维度 API：导入 / 导出', () => {
  it('导入 type=device 的条目会写到设备维度（而不是被当成 IP）', async () => {
    const deviceId = generateServerSideDeviceId(UA);
    const reply = mockReply();

    await ROUTES.get('POST /v1/export/blocks').opts.handler(
      { body: { blocks: [{ type: 'device', deviceId, permanent: true, reason: '批量导入' }] } },
      reply
    );

    expect(reply.payload.data).toMatchObject({ imported: 1, skipped: 0 });
    const entry = (await getActiveBlocks()).find(b => b.deviceId === deviceId);
    expect(entry).toBeDefined();
    expect(entry.type).toBe('device');
  });

  it('缺标识字段的条目计入 skipped 并带出失败原因（不静默丢弃）', async () => {
    const reply = mockReply();
    await ROUTES.get('POST /v1/export/blocks').opts.handler(
      { body: { blocks: [{ type: 'device', reason: '没有 deviceId' }] } },
      reply
    );

    expect(reply.payload.data.skipped).toBe(1);
    expect(reply.payload.data.failures[0].message).toContain('缺少 ip / fingerprint / deviceId');
  });

  it('导出把设备条目标成 type=device，并带上剩余有效期', async () => {
    const deviceId = generateServerSideDeviceId(UA);
    await ROUTES.get('POST /v1/export/blocks').opts.handler(
      { body: { blocks: [{ type: 'device', deviceId, permanent: true }] } },
      mockReply()
    );

    const reply = mockReply();
    await ROUTES.get('GET /v1/export/blocks').opts.handler({}, reply);

    const exported = reply.payload.data.blocks.find(b => b.deviceId === deviceId);
    expect(exported).toBeDefined();
    expect(exported.type).toBe('device');
    expect(exported).toHaveProperty('duration');
    // 永久条目 duration 为 null（导入端据此还原 permanent，而不是当成 0 秒）
    expect(exported.duration).toBeNull();
  });
});
