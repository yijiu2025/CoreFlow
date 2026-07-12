/**
 * PoseCraft 作品 API
 * 负责作品的查询、创建、删除及互动。
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import workDao from '../../../app/posecraft/dao/work.dao.js';
import sequelize from '../../../db/index.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../../../public/uploads/posecraft');

function generateSvgFromFabric(fabricData) {
  const width = fabricData.width || 800;
  const height = fabricData.height || 600;
  let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  const objects = fabricData.objects || [];
  for (const obj of objects) {
    if (obj.type === 'line') {
      const x1 = obj.x1;
      const y1 = obj.y1;
      const x2 = obj.x2;
      const y2 = obj.y2;
      const stroke = obj.stroke || '#6366f1';
      const strokeWidth = obj.strokeWidth || 3;
      const opacity = obj.opacity !== undefined ? obj.opacity : 1;
      svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" />`;
    } else if (obj.type === 'circle') {
      const radius = obj.radius || 8;
      const originX = obj.originX || 'left';
      const originY = obj.originY || 'top';
      const cx = originX === 'center' ? obj.left : obj.left + radius;
      const cy = originY === 'center' ? obj.top : obj.top + radius;
      const fill = obj.fill || '#ffffff';
      const stroke = obj.stroke || '#6366f1';
      const strokeWidth = obj.strokeWidth || 3;
      const opacity = obj.opacity !== undefined ? obj.opacity : 1;
      svgContent += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
    } else if (obj.type === 'path') {
      const stroke = obj.stroke || '#6366f1';
      const strokeWidth = obj.strokeWidth || 3;
      const fill = obj.fill || 'none';
      const opacity = obj.opacity !== undefined ? obj.opacity : 1;
      let pathD = '';
      if (Array.isArray(obj.path)) {
        pathD = obj.path.map(cmd => cmd.join(' ')).join(' ');
      } else if (typeof obj.path === 'string') {
        pathD = obj.path;
      }
      if (pathD) {
        svgContent += `<path d="${pathD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round" />`;
      }
    }
  }
  svgContent += `</svg>`;
  return Buffer.from(svgContent);
}

/**
 * 作品结构化输出：只返回前端需要的字段
 * 排除：user_id、analysis_data、delete_version、deleted_at、edit_data
 */
function formatWork(work) {
  if (!work) return null;
  const data = work.toJSON ? work.toJSON() : work;
  return {
    id: data.id,
    template_id: data.template_id,
    title: data.title,
    description: data.description,
    image_url: data.image_url,
    thumbnail_url: data.thumbnail_url,
    is_template_work: data.is_template_work,
    status: data.status,
    likes_count: data.likes_count,
    views_count: data.views_count,
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    author: data.author ? {
      uid: data.author.uid,
      username: data.author.username,
      avatar: data.author.avatar
    } : undefined
  };
}

/** 批量结构化输出 */
function formatWorkList(list) {
  return (list || []).map(formatWork);
}

export default async function (fastify) {
  registerGroupMetadata({
    name: 'work',
    description: '作品管理',
    prefix: '/v1'
  });

  /**
   * 细粒度数据级权限校验通用助手
   * 1. 资源创建者本人：允许对其自己创建的作品进行操作。
   * 2. 管理员（包含 posecraft_admin 角色、全局 admin 角色或拥有 posecraft:work:audit 权限）：允许越权管理任何用户的作品。
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

  // 获取作品列表（公开）
  registerSecureRoute(fastify, {
    name: 'getWorks',
    alias: '获取作品列表',
    method: 'GET',
    url: '/works',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          keyword: { type: 'string', maxLength: 100 }
        }
      }
    },
    handler: async (request, reply) => {
      const { keyword, page, pageSize } = request.query;

      const result = await workDao.findAll({
        keyword,
        page,
        pageSize
      });

      return reply.result.paginated(formatWorkList(result.list), result.total, result.page, result.pageSize);
    }
  });

  // 获取推荐作品（公开）
  registerSecureRoute(fastify, {
    name: 'getRecommendedWorks',
    alias: '获取推荐作品',
    method: 'GET',
    url: '/works/recommended',
    handler: async (request, reply) => {
      const { limit = 20 } = request.query;

      const works = await workDao.findRecommended(parseInt(limit));

      return reply.result.success('获取成功', formatWorkList(works));
    }
  });

  // 获取用户作品（公开）
  registerSecureRoute(fastify, {
    name: 'getUserWorks',
    alias: '获取用户作品',
    method: 'GET',
    url: '/works/user/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'integer' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { userId } = request.params;
      const { page, pageSize } = request.query;

      const result = await workDao.findByUser(userId, {
        page,
        pageSize
      });

      return reply.result.paginated(formatWorkList(result.list), result.total, result.page, result.pageSize);
    }
  });

  // 获取当前登录用户自己的作品（从 session 识别用户，无需传 id）
  registerSecureRoute(fastify, {
    name: 'getMyWorks',
    alias: '获取我的作品',
    method: 'GET',
    url: '/works/mine',
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
      const result = await workDao.findByUser(user.userId, { page, pageSize });
      return reply.result.paginated(formatWorkList(result.list), result.total, result.page, result.pageSize);
    }
  });

  // 获取其他用户作品（通过 uid/personal_id）
  registerSecureRoute(fastify, {
    name: 'getUserWorks',
    alias: '获取用户作品',
    method: 'GET',
    url: '/works/user/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'integer' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { userId } = request.params;
      const { page, pageSize } = request.query;
      const result = await workDao.findByUser(userId, { page, pageSize });
      return reply.result.paginated(formatWorkList(result.list), result.total, result.page, result.pageSize);
    }
  });

  // 获取作品详情（公开）
  registerSecureRoute(fastify, {
    name: 'getWork',
    alias: '获取作品详情',
    method: 'GET',
    url: '/works/:id',
    handler: async (request, reply) => {
      const { id } = request.params;

      const work = await workDao.findById(id);

      if (!work) {
        return reply.result.fail('作品不存在');
      }

      // 增加浏览量
      await workDao.incrementViews(id);

      return reply.result.success('获取成功', formatWork(work));
    }
  });

  registerSecureRoute(fastify, {
    name: 'getWorkPreview',
    alias: '获取作品实时预览图',
    method: 'GET',
    url: '/works/:id/preview',
    handler: async (request, reply) => {
      const { id } = request.params;
      const work = await workDao.findById(id);
      if (!work) {
        return reply.code(404).send('Work not found');
      }

      // 1. 获取关联模板的骨骼数据来进行合成
      if (work.template_id) {
        const { Template } = sequelize.models;
        const template = await Template.findOne({ where: { id: work.template_id, delete_version: 0 } });
        if (template) {
          let poseData = template.pose_data;
          if (typeof poseData === 'string') {
            try { poseData = JSON.parse(poseData); } catch (e) {}
          }
          let fabricData = poseData?.fabricData;
          if (typeof fabricData === 'string') {
            try { fabricData = JSON.parse(fabricData); } catch (e) {}
          }

          if (fabricData) {
            const width = fabricData.width || 800;
            const height = fabricData.height || 600;

            // 创建透明画布
            const bgImg = sharp({
              create: {
                width,
                height,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 } // 透明
              }
            });

            const svgBuffer = generateSvgFromFabric(fabricData);
            try {
              const compositeBuffer = await bgImg
                .composite([{ input: svgBuffer, top: 0, left: 0 }])
                .png()
                .toBuffer();
              reply.type('image/png');
              return reply.send(compositeBuffer);
            } catch (err) {
              fastify.log.error(err, 'Composite transparent work image failed');
            }
          }
        }
      }

      // 兜底返回 1x1 透明图片
      const fallback = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      }).png().toBuffer();
      reply.type('image/png');
      return reply.send(fallback);
    }
  });

  // 创建作品（需要登录）
  registerSecureRoute(fastify, {
    name: 'createWork',
    alias: '创建作品',
    method: 'POST',
    url: '/works',
    requireLogin: true,
    permission: 'posecraft:work:create',
    handler: async (request, reply) => {
      const { title, description, template_id, image_url, analysis_data, edit_data } = request.body;
      const user = request.state.user;

      // 作品的 thumbnail_url = 底图原图压缩版（WebP 70%，尺寸不变，省带宽）
      // 模板底图作品的创建走 TemplateDao.syncCreateWork，不在本接口
      const { generateImageThumbnail } = await import('../../../app/posecraft/utils/preview.js');
      const thumbUrl = (image_url && (await generateImageThumbnail(image_url))) || image_url || '';

      const work = await workDao.create({
        title,
        description,
        template_id,
        image_url,
        thumbnail_url: thumbUrl,
        analysis_data,
        edit_data,
        is_template_work: false,
        user_id: user.userId,
        status: 1,
        delete_version: 0
      });

      return reply.result.success('创建成功', work);
    }
  });

  // 删除作品（需要登录）
  // 数据级权限校验：只允许作品创建者本人，或管理员删除任何人的作品。
  registerSecureRoute(fastify, {
    name: 'deleteWork',
    alias: '删除作品',
    method: 'DELETE',
    url: '/works/:id',
    requireLogin: true,
    permission: 'posecraft:work:delete',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;

      const work = await workDao.findById(id);

      // 数据级权限校验：创建者本人或管理员放行
      if (!work || !checkDataPermission(work, user)) {
        return reply.result.forbidden('删除失败，作品不存在或无权限');
      }

      await workDao.delete(id, work.user_id);
      return reply.result.success('删除成功');
    }
  });

  // 点赞作品（需要登录）
  registerSecureRoute(fastify, {
    name: 'likeWork',
    alias: '点赞作品',
    method: 'POST',
    url: '/works/:id/like',
    requireLogin: true,
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;

      const work = await workDao.findById(id);

      if (!work) {
        return reply.result.fail('点赞失败，作品不存在');
      }

      await workDao.incrementLikes(id);
      
      return reply.result.success('点赞成功');
    }
  });
  // 获取关注者的作品
  registerSecureRoute(fastify, {
    name: 'getFollowingWorks',
    alias: '获取关注者的作品',
    method: 'GET',
    url: '/works/following',
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
      const { page, pageSize } = request.query;
      const user = request.state.user;

      const result = await workDao.findFollowingWorks(user.userId, {
        page,
        pageSize
      });

      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });
}
