/**
 * PoseCraft 作品视图服务
 *
 * 从 api/posecraft/v1/work.js 下沉：作品公共序列化（列表/详情共用）。
 * 只返回前端需要的字段，排除 user_id/analysis_data/delete_version/edit_data 等。
 *
 * @author yijiu
 * @since 2026-08-16
 */

/**
 * 作品公共序列化（列表/详情共用，不含 views_count 明细）
 * @param {object} work - 作品 Sequelize 实例或普通对象
 * @param {boolean} [isOwner=false] - 是否作者本人（作者可见 views_count）
 * @returns {object|null} 格式化后的作品对象
 */
export function formatWork(work, isOwner = false) {
  if (!work) return null;
  const data = work.toJSON ? work.toJSON() : work;
  return {
    id: data.id,
    template_id: data.template_id,
    title: data.title,
    description: data.description,
    image_url: data.image_url,
    thumbnail_url: data.thumbnail_url,
    type: data.is_template_work ? 'template' : 'work',
    status: data.status,
    // 计数（集中管理）
    count: {
      likes: data.likes_count,
      collects: data.collects_count || 0,
      shares: data.shares_count || 0,
      comments: data.comments_count || 0,
      views: isOwner ? data.views_count : undefined // 仅作者可见
    },
    // 当前用户互动状态
    userInteraction: {
      liked: !!data.liked,
      collected: !!data.collected,
      shared: !!data.shared
    },
    address: {
      publication: data.publication_address || null,
      work: data.work_address || null
    },
    created_at: data.createdAt,
    updated_at: data.updatedAt,
    author: data.author
      ? {
          uid: data.author.uid,
          username: data.author.username,
          avatar: data.author.avatar
        }
      : undefined,
    // 关联模板状态（null=正常/无模板, -1=已删除, 0=私密, -2=审核拒绝）
    template_status: data.template?.status ?? null,
    template_deleted: data.template ? data.template.delete_version !== 0 : false
  };
}

/**
 * 作品详情序列化（含完整地址 + GPS）
 * @param {object} work
 * @param {boolean} [isOwner=false] 是否作者本人
 * @returns {object|null}
 */
export function formatWorkDetail(work, isOwner = false) {
  const base = formatWork(work, isOwner);
  if (!base) return null;
  const data = work.toJSON ? work.toJSON() : work;
  // 地址详情（含 GPS）
  base.address = {
    publication: data.publication_address || null,
    publication_lat: data.publication_lat ? Number(data.publication_lat) : null,
    publication_lng: data.publication_lng ? Number(data.publication_lng) : null,
    publication_source: data.publication_source || null,
    work: data.work_address || null,
    work_lat: data.work_lat ? Number(data.work_lat) : null,
    work_lng: data.work_lng ? Number(data.work_lng) : null,
    work_address_source: data.work_address_source || null
  };
  return base;
}

/**
 * 批量结构化输出
 * @param {Array<object>} workList - 作品实例数组
 * @returns {Array<object>}
 */
export function formatWorkList(list) {
  return (list || []).map(w => formatWork(w));
}
