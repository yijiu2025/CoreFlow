/**
 * RetroWeb 任务 API（S1 真实读写）
 *
 * 数据模型：一个任务 = 一个目标分子 + 整棵逆合成路线树（gzip 存 snapshot）。
 *
 * 🔴 统计列（node_count / step_count / depth / scheme_count）由后端从快照**派生**，
 *    不信任前端传值（见 utils/stats.js）。
 * 🔴 配额：新建前 `assertCanCreate`（普通 2 / 会员 50），快照更新**不做**配额校验。
 * 🔴 软删任务仍占配额（paranoid + countTasks 用 paranoid:false）。
 *
 * @since 2026-10-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { RETROWEB_PERMISSIONS } from '../../../app/retroweb/permission/index.js';
import taskDao from '../../../app/retroweb/dao/task.dao.js';
import { quotaOf, assertCanCreate } from '../../../app/retroweb/services/quota.service.js';

async function registerTaskRoutes(fastify) {
  registerGroupMetadata({
    name: 'task',
    description: '任务（一个目标分子 + 整棵路线树）',
    prefix: '/v1'
  });

  // 探活：不碰数据库，用来确认应用已被加载、登录态可用
  registerSecureRoute(fastify, {
    name: 'retrowebPing',
    alias: 'RetroWeb 探活',
    method: 'GET',
    url: '/ping',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.READ,
    handler: async (request, reply) => {
      return reply.result.success('retroweb 模块已加载', {
        app: 'retroweb',
        stage: 'S1',
        userId: request.state.user?.userId ?? null
      });
    }
  });

  // 列表：只回元数据（含统计列，不含 snapshot）
  registerSecureRoute(fastify, {
    name: 'listRetrowebTasks',
    alias: '获取任务列表',
    method: 'GET',
    url: '/tasks',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', maxLength: 20 },
          keyword: { type: 'string', maxLength: 100 },
          sort: { type: 'string', maxLength: 20 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { status, keyword, sort, limit, offset } = request.query;
      const { rows, count } = await taskDao.findByUser(userId, { status, keyword, sort, limit, offset });
      return reply.result.paginated(rows, count, Math.floor(offset / limit) + 1, limit);
    }
  });

  // 配额：新建前前端可先查"还剩几个"
  registerSecureRoute(fastify, {
    name: 'getRetrowebQuota',
    alias: '查询任务配额',
    method: 'GET',
    url: '/tasks/quota',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.READ,
    handler: async (request, reply) => {
      const quota = await quotaOf(request.state.user);
      return reply.result.success(null, { quota });
    }
  });

  // 新建
  registerSecureRoute(fastify, {
    name: 'createRetrowebTask',
    alias: '新建任务',
    method: 'POST',
    url: '/tasks',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.CREATE,
    schema: {
      body: {
        type: 'object',
        required: ['target'],
        properties: {
          name: { type: 'string', maxLength: 200 },
          target: { type: 'string', maxLength: 10000 },
          model: { type: 'string', maxLength: 64 },
          status: { type: 'string', enum: ['running', 'incomplete', 'done'] },
          client_id: { type: 'string', maxLength: 64 },
          snapshot: { type: 'object' },
          sig: { type: 'string', maxLength: 64 }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { name, target, model, status, client_id, snapshot, sig } = request.body;

      // 配额（超限抛 QuotaExceededError）
      let quota;
      try {
        quota = await assertCanCreate(request.state.user);
      } catch (err) {
        if (err.name === 'QuotaExceededError') {
          return reply.result.tooManyRequests(
            `任务数已达上限（${err.limit} 个，当前 ${err.used} 个）。请删除旧任务或升级会员后再新建。`
          );
        }
        throw err;
      }

      const created = await taskDao.create({
        user_id: userId,
        client_id: client_id ?? null,
        name: name ?? '',
        target,
        model: model ?? null,
        status: status ?? 'incomplete',
        snapshot: snapshot ?? { rootId: null, nodes: {}, params: {} },
        sig: sig ?? null
      });

      return reply.result.created({ task: created, quota });
    }
  });

  // 详情（含解压后的 snapshot）
  registerSecureRoute(fastify, {
    name: 'getRetrowebTask',
    alias: '获取任务详情',
    method: 'GET',
    url: '/tasks/:id',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.READ,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { id } = request.params;
      const task = await taskDao.findById(id, userId);
      if (!task) return reply.result.notFound('任务不存在');
      return reply.result.success(null, { task });
    }
  });

  // 更新（改名 / 存快照 / 改状态，带乐观锁）
  registerSecureRoute(fastify, {
    name: 'updateRetrowebTask',
    alias: '保存任务',
    method: 'PATCH',
    url: '/tasks/:id',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.UPDATE,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 200 },
          target: { type: 'string', maxLength: 10000 },
          status: { type: 'string', enum: ['running', 'incomplete', 'done'] },
          snapshot: { type: 'object' },
          sig: { type: 'string', maxLength: 64 },
          expected_sig: { type: 'string', maxLength: 64 }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { id } = request.params;
      const { name, target, status, snapshot, sig, expected_sig } = request.body;

      const task = await taskDao.findById(id, userId);
      if (!task) return reply.result.notFound('任务不存在');

      // 乐观锁：客户端带了期望签名，不匹配则 409 + 服务端当前版本
      if (expected_sig !== undefined && task.sig && task.sig !== expected_sig) {
        return reply.result.conflict('任务已被其它端修改，请先刷新');
      }

      const patch = {};
      if (name !== undefined) patch.name = name;
      if (target !== undefined) patch.target = target;
      if (status !== undefined) patch.status = status;

      if (snapshot !== undefined) {
        // 快照路径：统计列由快照派生，sig 一起更新
        const updated = await taskDao.updateSnapshot(id, userId, snapshot, { sig });
        if (!updated) return reply.result.notFound('任务不存在');
      } else if (Object.keys(patch).length) {
        if (sig !== undefined) patch.sig = sig;
        await taskDao.updateIfMatch(id, userId, patch, null);
      }

      const fresh = await taskDao.findById(id, userId);
      return reply.result.success(null, { task: fresh });
    }
  });

  // 软删
  registerSecureRoute(fastify, {
    name: 'deleteRetrowebTask',
    alias: '删除任务',
    method: 'DELETE',
    url: '/tasks/:id',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.DELETE,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { id } = request.params;
      const ok = await taskDao.softDelete(id, userId);
      if (!ok) return reply.result.notFound('任务不存在');
      return reply.result.success();
    }
  });

  // 本地迁移上传：幂等（按 client_id upsert）
  registerSecureRoute(fastify, {
    name: 'importRetrowebTasks',
    alias: '导入本地任务',
    method: 'POST',
    url: '/tasks/import',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.IMPORT,
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['client_id', 'target'],
              properties: {
                client_id: { type: 'string', maxLength: 64 },
                name: { type: 'string', maxLength: 200 },
                target: { type: 'string', maxLength: 10000 },
                model: { type: 'string', maxLength: 64 },
                status: { type: 'string', enum: ['running', 'incomplete', 'done'] },
                snapshot: { type: 'object' },
                sig: { type: 'string', maxLength: 64 }
              }
            }
          }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { items } = request.body;

      const results = [];
      for (const item of items) {
        const { client_id, name, target, model, status, snapshot, sig } = item;
        const { id, created } = await taskDao.importOne(userId, {
          clientId: client_id,
          name: name ?? '',
          target,
          model: model ?? null,
          status: status ?? 'incomplete',
          snapshot: snapshot ?? { rootId: null, nodes: {}, params: {} },
          sig: sig ?? null
        });
        results.push({ client_id, id, created });
      }

      const quota = await quotaOf(request.state.user);
      return reply.result.success(null, { imported: results, quota });
    }
  });
}

export default registerTaskRoutes;
