/**
 * PoseCraft 模板 API
 * 负责模板的查询、创建、更新、删除及管理员审核流程。
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import TemplateDao from '../../../app/posecraft/dao/template.dao.js';
import { generateSvgFromFabric } from '../../../app/posecraft/utils/preview.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../../../public/uploads/posecraft');

export default async function (fastify) {
  registerGroupMetadata({
    name: 'template',
    description: '模板管理',
    prefix: '/v1'
  });

  /**
   * 细粒度数据级权限校验通用助手
   * 1. 资源创建者本人：允许对其自己创建的模板进行修改/删除。
   * 2. 管理员（包含 posecraft_admin 角色、全局 admin 角色或拥有 posecraft:work:audit 权限）：允许越权管理任何用户的模板。
   * @param {object} item - 资源对象，需包含 user_id 字段
   * @param {object} user - 当前登录用户（session 用户对象）
   * @returns {boolean} 是否拥有数据级操作权限
   */
  const checkDataPermission = (item, user) => {
    if (!item || !user) return false;
    
    // 如果是创建者本人，通过
    if (item.user_id === user.userId) return true;
    
    // 如果是管理员/运营角色或拥有审核/删单权限，通过
    const userRoles = user.roles || [];
    const userPermissions = user.permissions?.allows || [];
    return (
      userRoles.includes('posecraft_admin') ||
      userRoles.includes('posecraft_operator') ||
      userRoles.includes('admin') ||
      userPermissions.includes('posecraft:work:audit') ||
      userPermissions.includes('posecraft:work:delete_any')
    );
  };

  /**
   * GET /templates - 获取模板列表
   * 1. 未登录用户：仅可见公开状态的模板 (status = 1)
   * 2. 已登录普通用户：可见公开模板 (status = 1) 以及自己上传的所有状态的模板
   * 3. 管理员用户：可见所有状态的模板，并且可通过 status 参数进行过滤
   */
  registerSecureRoute(fastify, {
    name: 'getTemplates',
    alias: '获取模板列表',
    method: 'GET',
    url: '/templates',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          category: { type: 'string', maxLength: 50 },
          keyword: { type: 'string', maxLength: 100 },
          status: { type: 'integer' }
        }
      }
    },
    handler: async (request, reply) => {
      const { category, keyword, page, pageSize, status } = request.query;

      const user = request.state?.user;
      const isAdmin = checkDataPermission({ user_id: -1 }, user); // 借用权限助手检测是否为管理员

      const result = await TemplateDao.findAll({
        category,
        keyword,
        status,
        page,
        pageSize
      }, user, isAdmin);

      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  /**
   * GET /templates/popular - 获取热门模板（仅展示公开且审核通过的）
   */
  registerSecureRoute(fastify, {
    name: 'getPopularTemplates',
    alias: '获取热门模板',
    method: 'GET',
    url: '/templates/popular',
    handler: async (request, reply) => {
      const { limit = 10 } = request.query;

      const templates = await TemplateDao.findPopular(parseInt(limit));

      return reply.result.success('获取成功', templates);
    }
  });

  /**
   * GET /templates/mine - 获取当前登录用户自己上传的模板
   * 从 session 识别用户，无需传 id
   */
  registerSecureRoute(fastify, {
    name: 'getMyTemplates',
    alias: '获取我的模板',
    method: 'GET',
    url: '/templates/mine',
    requireLogin: true,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.userId) {
        return reply.result.fail('未登录', null, 401);
      }
      const { page, pageSize } = request.query;
      const result = await TemplateDao.findByUser(user.userId, { page, pageSize });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  /**
   * GET /templates/:id - 获取模板详情
   * 包含访问权限校验：非公开模板只有其创建者或管理员才允许访问。
   */
  registerSecureRoute(fastify, {
    name: 'getTemplate',
    alias: '获取模板详情',
    method: 'GET',
    url: '/templates/:id',
    handler: async (request, reply) => {
      const { id } = request.params;
      const { camera } = request.query || {};

      const template = await TemplateDao.findById(id);

      if (!template) {
        return reply.result.fail('模板不存在');
      }

      // 安全校验：未审核通过/非公开模板的可见度检查
      const user = request.state?.user;
      const isAdmin = checkDataPermission({ user_id: -1 }, user);
      
      if (template.status !== 1) {
        if (template.user_id !== user?.userId && !isAdmin) {
          return reply.result.forbidden('无权查看此未公开或审核中的模板');
        }
      }

      // 机密信息保护：pose_data 只有在辅助拍照并且有权限时才返回，其它普通浏览情况一律剥离
      const isCreator = template.user_id == user?.userId;
      const hasPrivilege = user?.permissions?.allows?.some((p) => 
        ['posecraft:work:read', 'posecraft:vip:premium_templates', 'posecraft:template:purchase'].includes(p)
      );
      const isAuthorized = isCreator || isAdmin || hasPrivilege;

      if ((camera === 'true' || camera === true) && isAuthorized) {
        // 辅助拍照且有权限时，只返回 pose_data 纯模板数据，不需要返回底图
        template.setDataValue('image_url', undefined);
        template.setDataValue('thumbnail_url', undefined);
      } else {
        // 其它任何情况下，均不向前端返回 pose_data 骨骼明文数据，只能加载渲染图
        template.setDataValue('pose_data', undefined);
      }

      return reply.result.success('获取成功', template);
    }
  });

  /**
   * GET /templates/:id/preview - 后端实时合成模板预览图
   */
  registerSecureRoute(fastify, {
    name: 'getTemplatePreview',
    alias: '获取模板实时预览图',
    method: 'GET',
    url: '/templates/:id/preview',
    handler: async (request, reply) => {
      const { id } = request.params;
      const template = await TemplateDao.findById(id);
      if (!template) {
        return reply.code(404).send('Template not found');
      }

      // 获取 pose_data 和 fabricData
      let poseData = template.pose_data;
      if (typeof poseData === 'string') {
        try { poseData = JSON.parse(poseData); } catch (e) {}
      }
      let fabricData = poseData?.fabricData;
      if (typeof fabricData === 'string') {
        try { fabricData = JSON.parse(fabricData); } catch (e) {}
      }

      let width = fabricData?.width || 800;
      let height = fabricData?.height || 600;

      // 1. 初始化透明背景图 (预览图应为透明背景的纯模板/骨架数据)
      const bgImg = sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 } // 透明背景
        }
      });

      // 2. 如果存在骨骼数据，生成 SVG 并进行合成
      if (fabricData) {
        const svgBuffer = generateSvgFromFabric(fabricData);
        try {
          const compositeBuffer = await bgImg
            .composite([{ input: svgBuffer, top: 0, left: 0 }])
            .png()
            .toBuffer();
          reply.type('image/png');
          return reply.send(compositeBuffer);
        } catch (err) {
          fastify.log.error(err, 'Composite transparent template image failed');
        }
      }

      const finalBuffer = await bgImg.png().toBuffer();
      reply.type('image/png');
      return reply.send(finalBuffer);
    }
  });

  /**
   * POST /templates - 创建并发布模板（需要登录）
   * 发布后默认状态为 2 (待审核)，需由管理员进行审核后才能公开可见。
   */
  registerSecureRoute(fastify, {
    name: 'createTemplate',
    alias: '创建模板',
    method: 'POST',
    url: '/templates',
    requireLogin: true,
    permission: 'posecraft:work:create', // 已合并模板与作品权限
    handler: async (request, reply) => {
      const {
        title, description, category, image_url, pose_data, tags,
        publication_address, publication_lat, publication_lng, publication_source,
        work_address, work_lat, work_lng, work_address_source
      } = request.body;
      const user = request.state.user;

      // 从 pose_data 中提取旧版兼容字段（如果有）
      const pd = pose_data || {};

      const template = await TemplateDao.create({
        title,
        description,
        category: category || 'general',
        image_url,
        pose_data,
        tags,
        user_id: user.userId,
        status: 2, // 默认 2 - 待审核，不可直接公开
        delete_version: 0,
        // 地址字段（优先用顶层字段，否则回退到 pose_data 里的旧数据）
        publication_address: publication_address || pd.locationName || null,
        publication_lat: publication_lat || pd.coords?.lat || null,
        publication_lng: publication_lng || pd.coords?.lng || null,
        publication_source: publication_source || (pd.coords ? 'gps' : null),
        work_address: work_address || pd.locationName || null,
        work_lat: work_lat || pd.coords?.lat || null,
        work_lng: work_lng || pd.coords?.lng || null,
        work_address_source: work_address_source || (pd.exifInfo?.latitude ? 'exif' : pd.coords ? 'manual' : null)
      });

      // 同步保存底图为一个单独的作品 (Work)
      await TemplateDao.syncCreateWork(template, user.userId);

      return reply.result.success('发布成功，已提交管理员审核', template);
    }
  });

  /**
   * POST /templates/:id/audit - 管理员审核模板接口（需要特定 work:audit 操作权限）
   */
  registerSecureRoute(fastify, {
    name: 'auditTemplate',
    alias: '审核模板',
    method: 'POST',
    url: '/templates/:id/audit',
    requireLogin: true,
    permission: 'posecraft:work:audit', // 明确的管理员操作权限校验
    handler: async (request, reply) => {
      const { id } = request.params;
      const { status } = request.body; // status 应为：1 (通过/公开) 或 -2 (审核拒绝)

      const template = await TemplateDao.findById(id);

      if (!template) {
        return reply.result.fail('模板不存在');
      }

      if (![1, -2].includes(Number(status))) {
        return reply.result.fail('无效的审核状态，仅支持 1 (通过/公开) 或 -2 (拒绝)', null, 400);
      }

      const updated = await TemplateDao.update(id, { status: Number(status) });

      // 审核通过/拒绝后，同步更新对应底图作品的状态
      await TemplateDao.syncAuditWork(id, Number(status));

      return reply.result.success('审核处理完成', updated);
    }
  });

  /**
   * PUT /templates/:id - 更新模板（需要登录）
   * 数据级权限校验：允许创建者修改个人模板，或管理员修改任何人的模板。
   */
  registerSecureRoute(fastify, {
    name: 'updateTemplate',
    alias: '更新模板',
    method: 'PUT',
    url: '/templates/:id',
    requireLogin: true,
    permission: 'posecraft:work:update',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;
      const data = request.body;

      const template = await TemplateDao.findById(id);

      if (!template) {
        return reply.result.fail('模板不存在');
      }

      // 数据级权限检验：创建者或管理员放行
      if (!checkDataPermission(template, user)) {
        return reply.result.forbidden('无权编辑他人的模板');
      }

      // 修改后如果需要重新审核，在此处将 status 重置为 2（非管理员修改后重置）
      const isAdmin = checkDataPermission({ user_id: -1 }, user);
      if (data.status === undefined && !isAdmin) {
        data.status = 2; 
      }

      const updated = await TemplateDao.update(id, data);

      // 若 pose_data 发生变化，重新生成骨架预览图
      if (data.pose_data !== undefined) {
        const { generateSkeletonPreview } = await import('../../../app/posecraft/utils/preview.js');
        const skeletonUrl = await generateSkeletonPreview(updated.pose_data);
        if (skeletonUrl) {
          await TemplateDao.update(id, { thumbnail_url: skeletonUrl });
        }
      }

      // 同步更新或创建对应的底图作品 (Work)
      await TemplateDao.syncUpdateWork(id, data, template);

      return reply.result.success(
        isAdmin ? '更新成功' : '更新成功，已进入重新审核阶段',
        updated
      );
    }
  });

  /**
   * DELETE /templates/:id - 删除模板（需要登录）
   * 数据级权限校验：只允许模板创建者本身删除其个人模板，或管理员删除任何人的违规项目。
   */
  registerSecureRoute(fastify, {
    name: 'deleteTemplate',
    alias: '删除模板',
    method: 'DELETE',
    url: '/templates/:id',
    requireLogin: true,
    permission: 'posecraft:work:delete',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;

      const template = await TemplateDao.findById(id);

      // 数据级权限检验：创建者或管理员放行
      if (!template || !checkDataPermission(template, user)) {
        return reply.result.forbidden('删除失败，模板不存在或无权限');
      }

      // Admin or owner deleting
      await TemplateDao.delete(id, template.user_id);

      // 同步级联删除关联的模板底图作品
      await TemplateDao.syncDeleteWork(id);

      return reply.result.success('删除成功');
    }
  });
}
