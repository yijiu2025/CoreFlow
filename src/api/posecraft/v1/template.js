/**
 * PoseCraft 模板 API
 * 负责模板的查询、创建、更新、删除及管理员审核流程。
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import TemplateDao from '../../../app/posecraft/dao/template.dao.js';

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
    handler: async (request, reply) => {
      const { category, keyword, page = 1, pageSize = 20, status } = request.query;

      const user = request.state?.user;
      const isAdmin = checkDataPermission({ user_id: -1 }, user); // 借用权限助手检测是否为管理员

      const templates = await TemplateDao.findAll({
        category,
        keyword,
        status,
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      }, user, isAdmin);

      return reply.result.success('获取成功', templates);
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

      // 机密信息保护：pose_data 只有创建者本人、管理员、或具备相关权限的用户才能获取
      const isCreator = template.user_id == user?.userId;
      // 这里可以按需配置专门的权限点，比如 'posecraft:template:purchase' 或 'posecraft:vip:premium_templates'
      const hasPrivilege = user?.permissions?.allows?.some((p) => 
        ['posecraft:work:read', 'posecraft:vip:premium_templates', 'posecraft:template:purchase'].includes(p)
      );

      if (!isCreator && !isAdmin && !hasPrivilege) {
        // 如果没有权限获取机密信息，则剥离 pose_data
        template.setDataValue('pose_data', undefined);
      }

      return reply.result.success('获取成功', template);
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
      const { title, description, category, image_url, thumbnail_url, pose_data, tags } = request.body;
      const user = request.state.user;

      const template = await TemplateDao.create({
        title,
        description,
        category: category || 'general',
        image_url,
        thumbnail_url,
        pose_data,
        tags,
        user_id: user.userId,
        status: 2, // 默认 2 - 待审核，不可直接公开
        delete_version: 0
      });

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
        return reply.code(400).send({ error: '无效的审核状态，仅支持 1 (通过/公开) 或 -2 (拒绝)' });
      }

      const updated = await TemplateDao.update(id, { status: Number(status) });
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
      return reply.result.success('删除成功');
    }
  });
}
