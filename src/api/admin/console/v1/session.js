/**
 * Console 会话与路由接口
 *
 * GET  /admin/console/v1/session/me        —— 当前用户 + 角色 + 权限码 + 部门
 * GET  /admin/console/v1/session/routes    —— 当前用户可见菜单树
 * PUT  /admin/console/v1/session/password  —— 修改本人密码
 * POST /admin/console/v1/session/logout    —— 清除认证 Cookie
 *
 * 登录本身不在这里：走 oauth21 `/mini-login` iframe → `/auth/v1/bind-session` 换 Cookie，
 * 本模块只消费已建立的会话（`request.state.user`）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { getModel } from '../../../../framework/persistence/db/index.js';
import {
  clearAuthCookies,
  hashPassword,
  verifyPassword,
  validatePasswordStrength
} from '../../../../framework/security/auth/index.js';
import menuDao from '../../../../app/console/dao/menu.dao.js';
import { isSuperViewer, effectiveCodes } from '../../../../app/console/services/button-grant.service.js';
import { withFail } from '../../../../app/console/utils/respond.js';
import avatarService from '../../../../app/console/services/avatar.service.js';
import { hasAnyPermissionIn } from '../../../../app/console/utils/permissions.js';

// `isSuperViewer` 从 button-grant.service 引入（单一来源）：它与"按钮授权闸"共用同一个
// 判据 —— 超管不看菜单授权。两处各写一份，改一处就会让前端和服务端对不上。

async function registerSessionRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleSession',
    alias: '管理后台会话',
    description: '当前用户信息、可见菜单、修改密码、退出登录',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * 归一化偏好对象
   *
   * 🔴 踩过的坑：`raw: true` 读 JSON 列时拿到的是**字符串**，直接 `{ ...value }`
   *    会把字符摊成 `{0:'{',1:'"',…}` 写回库里 —— 一个坏掉的偏好就这么产生了。
   *    这里把三种历史形态都收敛成纯对象：字符串 / 数字键对象（脏数据）/ 正常对象。
   *
   * @param {unknown} value 原始值
   * @returns {Record<string, unknown>} 干净的偏好对象
   */
  function normalizePrefs(value) {
    let doc = value;
    if (typeof doc === 'string') {
      try {
        doc = JSON.parse(doc);
      } catch {
        return {};
      }
    }
    /*
     * 数字键 = 字符串被展开后的脏数据（`{ ...'{"accent":"teal"}' }`）。
     * 拼回去再解析；这种坏死可能叠了不止一层，所以最多剥三层，
     * 仍剥不干净就丢弃 —— 返回 `{0:'{',…}` 这种对象比返回空对象更糟。
     */
    for (let depth = 0; depth < 3; depth += 1) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {};
      const keys = Object.keys(doc);
      if (keys.length === 0) return doc;
      if (!keys.every(key => /^\d+$/.test(key))) return doc;
      try {
        doc = JSON.parse(Object.values(doc).join(''));
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * 读取某用户在后台管理里的个人资料（昵称 / 头像 / 偏好）
   *
   * 这张表**只属于 console**（`console_user_profile`）。全局身份仍在 `user_user`，
   * 这里的字段为空时由调用方回落到全局值。
   *
   * @param {number} userId 用户内部 ID
   * @returns {Promise<{nickname: string, avatar: string, preferences: object}>} 个人资料
   */
  async function readConsoleProfile(userId) {
    const empty = { nickname: '', avatar: '', preferences: {} };
    if (!userId) return empty;
    const row = await getModel('ConsoleUserProfile').findOne({
      where: { user_id: Number(userId) },
      raw: true
    });
    return {
      nickname: row?.nickname || '',
      avatar: row?.avatar || '',
      preferences: normalizePrefs(row?.preferences)
    };
  }

  /**
   * 取或建该用户的 console 资料行
   *
   * @param {number} userId 用户内部 ID
   * @returns {Promise<object>} Sequelize 实例
   */
  async function ensureConsoleProfile(userId) {
    const [record] = await getModel('ConsoleUserProfile').findOrCreate({
      where: { user_id: Number(userId) },
      defaults: { user_id: Number(userId), nickname: null, avatar: null, preferences: {} }
    });
    return record;
  }

  registerSecureRoute(fastify, {
    name: 'consoleMe',
    alias: '当前用户',
    method: 'GET',
    url: '/session/me',
    requireLogin: true,
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};

      // 🔴 兜底闸门：登录时已由 `bind-session` 判过准入（`app/console/config.js` 的
      //    `access`），但会话建立之后角色仍可能被撤销 —— 权限每请求实时解析，
      //    这里再判一次，撤销后下一次刷新就进不来，而不是看到一片 403 的空壳。
      if (!hasAnyPermissionIn(user.permissions, 'admin') && !isSuperViewer(user)) {
        return reply.result.forbidden('该账号没有管理后台的访问权限，请联系管理员分配角色后再试');
      }

      const row = await getModel('User').findOne({
        where: { uid: user.uid },
        attributes: ['id', 'uid', 'username', 'email', 'avatar', 'status', 'dept_id']
      });
      // 部门名单独查：不给 User 模型挂 console 域的关联，避免两个 app 的模型耦合
      const dept = row?.dept_id ? await getModel('console.SysDept').findByPk(row.dept_id) : null;

      /*
       * 权限码：**只下发一份"最终生效"的清单**，不在前端拼语义
       *
       * 早先这里发三个东西（policy 的 allows + 全站按钮码 + 该用户被授的按钮码），
       * 让前端自己算"按钮码还要被菜单授权命中"。问题是同一套判定写了两遍（前端 / 守卫），
       * 一旦有一边改动就会分叉：按钮看得见、点了 403，或者按钮没了、接口其实通着。
       *
       * 现在减法在**下发前**做完（`effectiveCodes`：把"角色有码但按钮没授权/停用"的码摘掉），
       * 前端只拿到一份码表，`hasPermission` 就是一次匹配。守卫那边读的是同一份口径
       * （`resolveButtonGate`），所以两边永远同进同退。
       */
      const consoleProfile = await readConsoleProfile(row?.id);
      const permissionCodes = await effectiveCodes(user);

      return reply.result.success('获取成功', {
        id: row?.id || user.userId || null,
        uid: user.uid,
        username: row?.username || user.username || '',
        email: row?.email || user.email || '',
        avatar: row?.avatar || user.avatar || '',
        status: row?.status ?? user.status ?? 1,
        deptId: row?.dept_id || null,
        deptName: dept?.name || '',
        roles: user.roles || [],
        permissions: permissionCodes,
        /** 本应用的界面偏好（登录后由前端读取以恢复主题色等） */
        preferences: consoleProfile.preferences,
        /** 后台内的展示身份：昵称为空回落到全局 username，头像同理 */
        profile: {
          nickname: consoleProfile.nickname || user.username,
          avatar: consoleProfile.avatar || user.avatar || ''
        }
      });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleRoutes',
    alias: '可见菜单',
    method: 'GET',
    url: '/session/routes',
    requireLogin: true,
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};
      /*
       * 已下架的节点不下发。
       *
       * `visible=0` 的语义是"从导航里撤掉"，**优先于授权**：关了显示之后，
       * 有权限的人也不该再看到它 —— 否则这个开关就是假的。
       * 必须在下面两个分支之前做：超管拿的是整棵树，同样要过这一刀。
       */
      const stripHidden = nodes =>
        nodes
          .filter(node => Number(node.visible) !== 0)
          .map(node => ({ ...node, children: stripHidden(node.children || []) }));

      const tree = stripHidden(await menuDao.tree({ onlyEnabled: true }));

      // 全量管理员直接拿整棵树；其余按「角色 → 菜单」过滤，未授权的分支整枝剪掉
      if (isSuperViewer(user)) {
        return reply.result.success('获取成功', tree);
      }

      const Role = getModel('Role');
      const roles = await Role.findAll({
        where: { code: (user.roles || []).length > 0 ? user.roles : ['__none__'] },
        attributes: ['id']
      });
      const allowed = new Set();
      for (const role of roles) {
        for (const id of await menuDao.getRoleMenuIds(role.id)) allowed.add(id);
      }

      /**
       * 递归裁剪：父节点未授权则整枝丢弃
       *
       * @param {Array<object>} nodes 菜单节点
       * @returns {Array<object>} 裁剪后的菜单
       */
      const prune = nodes =>
        nodes
          .filter(node => allowed.has(Number(node.id)))
          .map(node => ({ ...node, children: prune(node.children || []) }));

      return reply.result.success('获取成功', prune(tree));
    })
  });

  /*
   * 保存个人偏好（目前只有主题色）
   *
   * 为什么单独开一个 self-service 接口而不是复用 `PUT /users/:id`：
   * 那个接口要 `admin:user:update` 权限、走职级校验 —— 改自己的界面颜色不该要求
   * 管理员权限，也不该被"不能改同级"的规则挡住。这里只认当前会话的 uid。
   *
   * 合并语义（不是覆盖）：只传 `accent` 时不能把将来新增的偏好键抹掉。
   */
  registerSecureRoute(fastify, {
    name: 'consoleSavePreferences',
    alias: '保存个人偏好',
    method: 'PUT',
    url: '/session/preferences',
    requireLogin: true,
    schema: {
      body: {
        type: 'object',
        properties: {
          accent: { type: 'string', minLength: 1, maxLength: 32 }
        },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const row = await getModel('User').findOne({ where: { uid: request.state.user?.uid }, attributes: ['id'] });
      if (!row) throw new Error('NOT_FOUND:账号不存在');

      const record = await ensureConsoleProfile(row.id);
      // 合并而不是覆盖：只传 accent 时不该把将来新增的偏好键抹掉
      const next = { ...normalizePrefs(record.preferences) };
      if (typeof request.body?.accent === 'string') next.accent = request.body.accent;
      record.preferences = next;
      await record.save();
      return reply.result.success('已保存', next);
    })
  });

  /*
   * 保存后台内的展示身份（昵称 / 头像）
   *
   * 只影响 console：全局 username / avatar 不动 —— 那是所有应用共享的身份，
   * 用户在这里改的只是"后台里显示成什么"。
   *
   * 传空串 = 清除该字段（回落到全局值）。用 `undefined` 区分"没传"和"清空"，
   * 否则自动保存会每次把未修改的字段也写一遍。
   */
  registerSecureRoute(fastify, {
    name: 'consoleSaveProfile',
    alias: '保存后台个人资料',
    method: 'PUT',
    url: '/session/profile',
    requireLogin: true,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        properties: {
          nickname: { type: 'string', maxLength: 64 },
          avatar: { type: 'string', maxLength: 255 }
        },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const user = await getModel('User').findOne({ where: { uid: request.state.user?.uid }, attributes: ['id'] });
      if (!user) throw new Error('NOT_FOUND:账号不存在');

      const record = await ensureConsoleProfile(user.id);
      if (typeof request.body?.nickname === 'string') record.nickname = request.body.nickname.trim() || null;
      if (typeof request.body?.avatar === 'string') record.avatar = request.body.avatar.trim() || null;
      await record.save();

      return reply.result.success('已保存', {
        nickname: record.nickname || '',
        avatar: record.avatar || ''
      });
    })
  });

  /*
   * 上传头像（multipart）
   *
   * 走上传而不是"填外链"：外链会随对方站点失效/防盗链变成裂图。
   * 文件落 `public/console/u/<userId>/`，由静态资源服务直出；文件名由服务端生成，
   * 类型按 MIME 白名单 + 文件头魔数双重校验（见 avatar.service）。
   */
  registerSecureRoute(fastify, {
    name: 'consoleUploadAvatar',
    alias: '上传头像',
    method: 'POST',
    url: '/session/avatar',
    requireLogin: true,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: withFail(async (request, reply) => {
      const file = await request.file();
      if (!file) throw new Error('INVALID_PARAM:没有收到文件');

      const user = await getModel('User').findOne({ where: { uid: request.state.user?.uid }, attributes: ['id'] });
      if (!user) throw new Error('NOT_FOUND:账号不存在');

      const buffer = await file.toBuffer();
      const { url } = await avatarService.saveAvatar({ userId: user.id, buffer, mimetype: file.mimetype });

      // 上传即生效：省掉"再点一次保存头像"的一步
      const record = await ensureConsoleProfile(user.id);
      record.avatar = url;
      await record.save();

      return reply.result.success('已上传', { avatar: url });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleChangePassword',
    alias: '修改本人密码',
    method: 'PUT',
    url: '/session/password',
    requireLogin: true,
    schema: {
      body: {
        type: 'object',
        required: ['oldPassword', 'newPassword'],
        properties: {
          oldPassword: { type: 'string', minLength: 1, maxLength: 128 },
          newPassword: { type: 'string', minLength: 8, maxLength: 128 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};
      const { oldPassword, newPassword } = request.body;

      const identity = await getModel('UserIdentity').findOne({
        where: { user_id: user.userId, identity_type: 'password' }
      });
      if (!identity) throw new Error('NOT_FOUND:当前账号没有密码凭证，无法修改密码');

      const ok = await verifyPassword(oldPassword, identity.credential);
      if (!ok) throw new Error('INVALID_PARAM:原密码不正确');

      const validation = validatePasswordStrength(newPassword);
      if (!validation.valid) throw new Error(`INVALID_PARAM:${validation.errors[0]}`);

      const hashed = await hashPassword(newPassword);
      await getModel('UserIdentity').update({ credential: hashed }, { where: { id: identity.id } });
      return reply.result.success('密码已更新', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleLogout',
    alias: '退出登录',
    method: 'POST',
    url: '/session/logout',
    requireLogin: true,
    handler: withFail(async (request, reply) => {
      await clearAuthCookies(reply);
      return reply.result.success('已退出登录', null);
    })
  });
}

export default registerSessionRoutes;
