/**
 * Console 会话与路由接口
 *
 * GET  /admin/v1/session/me        —— 当前用户 + 角色 + 权限码 + 部门
 * GET  /admin/v1/session/routes    —— 当前用户可见菜单树
 * PUT  /admin/v1/session/password  —— 修改本人密码
 * POST /admin/v1/session/logout    —— 清除认证 Cookie
 *
 * 登录本身不在这里：走 oauth21 `/mini-login` iframe → `/auth/v1/bind-session` 换 Cookie，
 * 本模块只消费已建立的会话（`request.state.user`）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import {
  clearAuthCookies,
  hashPassword,
  verifyPassword,
  validatePasswordStrength
} from '../../../framework/security/auth/index.js';
import menuDao from '../../../app/admin/console/dao/menu.dao.js';
import userDao from '../../../app/admin/console/dao/user.dao.js';
import roleDao from '../../../app/admin/console/dao/role.dao.js';
import deptDao from '../../../app/admin/console/dao/dept.dao.js';
import profileDao from '../../../app/admin/console/dao/profile.dao.js';
import { effectiveCodes } from '../../../app/admin/console/services/button-grant.service.js';
import { getAccessPolicy, matchesAccessPolicy } from '../../../framework/security/auth/permission/app-access.js';
import { withFail } from '../../../app/admin/console/utils/respond.js';
import avatarService from '../../../app/admin/console/services/avatar.service.js';
import { hasPermissionLike } from '../../../app/admin/console/utils/permissions.js';
import { isSelfServicePath } from '../../../app/admin/console/services/menu-visibility.service.js';

/*
 * 两套判据，**不要混用**（混用就是 2026-11-22 那次"超管也看不到菜单"的成因）：
 *   · 能不能进后台 → `getAccessPolicy('admin')` + `matchesAccessPolicy`，与登录闸门同源；
 *   · 菜单可见不可见 → 角色→菜单显式授权（`isMenuExempt` 只认 `superadmin` / `*`）。
 * `admin:*` 属于第二套里的**非**豁免项：它代表接口与按钮全放行，不代表菜单全可见。
 */

async function registerSessionRoutes(fastify) {
  registerGroupMetadata({
    name: 'adminSession',
    alias: '管理后台会话',
    description: '当前用户信息、可见菜单、修改密码、退出登录',
    prefix: '/v1',
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
    const row = await profileDao.find(userId);
    return {
      nickname: row?.nickname || '',
      avatar: row?.avatar || '',
      preferences: normalizePrefs(row?.preferences)
    };
  }

  registerSecureRoute(fastify, {
    name: 'adminMe',
    alias: '当前用户',
    method: 'GET',
    url: '/session/me',
    requireLogin: true,
    /* 保护性接口：会话与菜单关掉后后台整页不可用 */
    critical: true,
    handler: withFail(async (request, reply) => {
      const user = request.state.user || {};

      /*
       * 🔴 兜底闸门：登录时已由 `bind-session` 判过准入（`app/admin/config.js` 的
       *    `access`），但会话建立之后角色仍可能被撤销 —— 权限每请求实时解析，
       *    这里再判一次，撤销后下一次刷新就进不来，而不是看到一片 403 的空壳。
       *
       * 🔴 判据必须读**同一份配置**（`getAccessPolicy`），不能在这里写死 `admin:*`：
       *    曾经两处各写一份，于是"只授了 `notice:*` 的通知管理员"能登录、却被这里
       *    判成无权限，通知中心对他们等于不存在。规则只有一份才不会分叉。
       */
      const permissionCodes = await effectiveCodes(user);
      const accessPolicy = getAccessPolicy('admin');
      const verdict = matchesAccessPolicy(accessPolicy, {
        codes: permissionCodes,
        roles: user.roles || [],
        /*
         * `requireLogin: true` 已经挡住匿名请求，能走到这里是"确实登录了"。
         * 把它显式传下去，`access.selfService` 才有判据 —— 少传这一项的表现是
         * "配置开了自助区、登录仍然 403"，而且只在没有管理角色的账号上复现。
         */
        authenticated: Boolean(user.sub)
      });
      if (!verdict.allowed) return reply.result.forbidden(accessPolicy.denyMessage);

      const row = await userDao.findByUid(user.uid, ['id', 'uid', 'username', 'email', 'avatar', 'status', 'dept_id']);
      // 部门名单独查：不给 User 模型挂 console 域的关联，避免两个 app 的模型耦合
      const dept = row?.dept_id ? await deptDao.findById(row.dept_id) : null;

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
    name: 'adminRoutes',
    alias: '可见菜单',
    method: 'GET',
    url: '/session/routes',
    requireLogin: true,
    /* 保护性接口：会话与菜单关掉后后台整页不可用 */
    critical: true,
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

      /*
       * 只取 admin 应用的菜单：同一张 `sys_menu` 现在也承载其它应用（firewall 等）的
       * 页面与按钮 —— 全量下发会让管理后台的侧栏里冒出防火墙的导航项，点了还是 404。
       * 别的应用的菜单由它们自己的界面消费。
       */
      const tree = stripHidden(await menuDao.tree({ onlyEnabled: true, appId: 'admin' }));

      /*
       * 🔴 菜单可见性 = 默认拒绝（default deny）
       *
       * 两档判据，按顺序：
       * 1. **豁免账号**：`superadmin` 角色 / 持有 `*` 通配 —— 拿整棵树。只有这两类。
       *    `admin:*` **不算豁免**：它表达的是"接口与按钮全放行"，不是"菜单全可见"。
       *    把菜单当成权限码的副产品，就等于给"新加的页面"默认发一张全员可见的门票 ——
       *    2026-11-22 实际发生：`应用管理`（menu 54）在 `sys_role_menu` 里 0 条授权，
       *    持有 `admin:*` 的账号（admin_admin）却能看见它，测试账号因此以为权限配错了。
       * 2. **其余账号**：只认「角色 → 菜单」显式授权。没授权就没有节点 —— 新建菜单默认
       *    对所有人不可见（包括各应用管理员），必须由超管在角色管理里显式勾选。
       *
       * 唯一的旁路是「自助区」`/settings/*`（个人资料 / 通知偏好 / 外观主题 / 账号与安全）：
       * 详见下方 `isSelfServicePage`，判据是**路径前缀**，不是"没写权限码"。
       */
      const isMenuExempt = user =>
        (user?.roles || []).includes('superadmin') || hasPermissionLike(user?.permissions, '*');

      if (isMenuExempt(user)) {
        return reply.result.success('获取成功', tree);
      }

      const allowed = new Set();
      for (const roleId of await roleDao.findIdsByCodes(user.roles)) {
        for (const id of await menuDao.getRoleMenuIds(roleId)) allowed.add(id);
      }

      /**
       * 是否自助区页面：`/settings/*` 是**唯一的免授权命名空间**
       *
       * 两个条件都要满足：路径在 `/settings/` 下，且没有声明权限码 —— 一旦声明，
       * 它就是管理页，按角色授权走（自助区不是管理页的后门）。
       *
       * 前缀与写入校验同在 `menu-visibility.service.js`（单一来源）：那边拒收
       * "没有权限码、又不在 /settings/ 下"的页面菜单，这边对应地放行自助页。
       * 两处各写一份就会出现"能建但看不见"或"看不见却能建"的错位。
       *
       * 🔴 判据是**路径前缀**，不是"没写权限码"：后者等于"漏写一个码就自动对
       *    所有人放行" —— 新建一个顶级页面、忘了填码，当天就全员可见。
       */
      const isSelfServicePage = node => node.type === 'menu' && node.permission == null && isSelfServicePath(node.path);

      /**
       * 顶级自助目录：**全部子项**都是自助区页面才整组放行
       *
       * 只要有一个子项带权限码 / 不在 `/settings/` 下，这一组就按授权走：
       * 混合组放行等于把管理页送给所有人，而带码子项又会被前端过滤掉，
       * 结果是一个点开空一半的目录。
       *
       * 🔴 "是否顶层"用**递归深度**判，不用 `parent_id`：后者是数据字段，
       *    漏填或被改成 0 会让一个深层目录冒充顶级自助目录 —— 判错就是
       *    "给所有人放开一组页面"。树形是递归出来的结构事实，伪造不了。
       *
       * @param {object} node 菜单节点
       * @param {number} depth 当前层级（0 = 顶级）
       * @returns {boolean} 是否自助目录
       */
      const isSelfServiceDir = (node, depth) => {
        if (depth !== 0 || node.type !== 'dir') return false;
        const children = node.children || [];
        return children.length > 0 && children.every(isSelfServicePage);
      };

      /**
       * 递归裁剪：**没被显式授权就丢弃**，父节点未授权则整枝丢弃
       *
       * 没有"默认可见"分支 —— 除了上面两条（豁免账号 / 自助区），其余全部
       * `allowed.has(id)` 说话。`allowed` 只来自用户**实际持有**的角色，
       * 角色编码匹配不上时是空集（`findIdsByCodes` 不会退化成查全部）。
       *
       * 最后一步还要**丢掉空目录**：只授了目录、没授任何子页面时，前端拿到的会是一个
       * 点开后什么都没有的分组（`admin_operator` 的"系统管理"就是这样 —— 授权 16 条里
       * 目录在内、子页面一个没有）。空分组不是"权限不足"的提示，它更像渲染出错了；
       * 目录本身也没有路由，留着没有任何用处。
       *
       * @param {Array<object>} nodes 菜单节点
       * @param {number} [depth=0] 当前层级（0 = 顶级）
       * @returns {Array<object>} 裁剪后的菜单
       */
      const prune = (nodes, depth = 0) =>
        nodes
          .filter(node => allowed.has(Number(node.id)) || isSelfServicePage(node) || isSelfServiceDir(node, depth))
          .map(node => ({ ...node, children: prune(node.children || [], depth + 1) }))
          .filter(node => node.type !== 'dir' || node.children.length > 0);

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
    name: 'adminSavePreferences',
    alias: '保存个人偏好',
    method: 'PUT',
    url: '/session/preferences',
    requireLogin: true,
    /* 保护性接口：会话与菜单关掉后后台整页不可用 */
    critical: true,
    schema: {
      body: {
        type: 'object',
        properties: {
          accent: { type: 'string', minLength: 1, maxLength: 32 },
          /* 外观另四维：配色 / 明暗 / 版式（包）/ 背景。都跟账号走，换设备也一致 */
          theme: { type: 'string', minLength: 1, maxLength: 32 },
          mode: { type: 'string', enum: ['system', 'light', 'dark'] },
          view: { type: 'string', minLength: 1, maxLength: 32 },
          bg: { type: 'string', minLength: 1, maxLength: 32 },
          density: { type: 'string', enum: ['comfy', 'regular', 'compact'] },
          /*
           * 自定义模式的逐令牌覆盖。**对象**而不是扁平键：令牌有 60+ 个，
           * 每个都开一个 schema 属性既写不完也改不动。
           * 值只做长度与类型约束，合法性由前端按令牌清单校验（服务端不认识令牌）。
           */
          overrides: {
            type: 'object',
            maxProperties: 80,
            additionalProperties: { type: 'string', maxLength: 64 }
          }
        },
        additionalProperties: false
      }
    },
    handler: withFail(async (request, reply) => {
      const row = await userDao.findByUid(request.state.user?.uid, ['id']);
      if (!row) throw new Error('NOT_FOUND:账号不存在');

      const record = await profileDao.find(row.id);
      // 合并而不是覆盖：只传 accent 时不该把将来新增的偏好键抹掉
      const next = { ...normalizePrefs(record?.preferences) };
      // 逐键合并：只写这次传上来的，其余保持不动（自动保存一次只改一个维度）
      for (const key of ['accent', 'theme', 'mode', 'view', 'bg', 'density']) {
        if (typeof request.body?.[key] === 'string') next[key] = request.body[key];
      }
      /*
       * `overrides` 是**覆盖式**而不是合并式：用户清空某一项后，别的设备必须能跟着还原。
       * 合并的话"删掉的项"永远删不掉 —— 换台电脑又回来了。
       */
      if (
        request.body?.overrides &&
        typeof request.body.overrides === 'object' &&
        !Array.isArray(request.body.overrides)
      ) {
        next.overrides = { ...request.body.overrides };
      }
      await profileDao.patch(row.id, { preferences: next });
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
    name: 'adminSaveProfile',
    alias: '保存后台个人资料',
    method: 'PUT',
    url: '/session/profile',
    requireLogin: true,
    /* 保护性接口：会话与菜单关掉后后台整页不可用 */
    critical: true,
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
      const user = await userDao.findByUid(request.state.user?.uid, ['id']);
      if (!user) throw new Error('NOT_FOUND:账号不存在');

      // 「传了才写」：undefined = 没传（自动保存只改一个维度），空串 = 清除
      const fields = {};
      if (typeof request.body?.nickname === 'string') fields.nickname = request.body.nickname.trim() || null;
      if (typeof request.body?.avatar === 'string') fields.avatar = request.body.avatar.trim() || null;
      const record = await profileDao.patch(user.id, fields);

      return reply.result.success('已保存', {
        nickname: record?.nickname || '',
        avatar: record?.avatar || ''
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
    name: 'adminUploadAvatar',
    alias: '上传头像',
    method: 'POST',
    url: '/session/avatar',
    requireLogin: true,
    /* 保护性接口：会话与菜单关掉后后台整页不可用 */
    critical: true,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: withFail(async (request, reply) => {
      const file = await request.file();
      if (!file) throw new Error('INVALID_PARAM:没有收到文件');

      const user = await userDao.findByUid(request.state.user?.uid, ['id']);
      if (!user) throw new Error('NOT_FOUND:账号不存在');

      const buffer = await file.toBuffer();
      const { url } = await avatarService.saveAvatar({ userId: user.id, buffer, mimetype: file.mimetype });

      // 上传即生效：省掉"再点一次保存头像"的一步
      await profileDao.patch(user.id, { avatar: url });

      return reply.result.success('已上传', { avatar: url });
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminChangePassword',
    alias: '修改本人密码',
    method: 'PUT',
    url: '/session/password',
    requireLogin: true,
    /* 保护性接口：会话与菜单关掉后后台整页不可用 */
    critical: true,
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

      const identity = await userDao.findPasswordIdentity(user.userId);
      if (!identity) throw new Error('NOT_FOUND:当前账号没有密码凭证，无法修改密码');

      const ok = await verifyPassword(oldPassword, identity.credential);
      if (!ok) throw new Error('INVALID_PARAM:原密码不正确');

      const validation = validatePasswordStrength(newPassword);
      if (!validation.valid) throw new Error(`INVALID_PARAM:${validation.errors[0]}`);

      const hashed = await hashPassword(newPassword);
      await userDao.updatePasswordIdentity(identity.id, hashed);
      return reply.result.success('密码已更新', null);
    })
  });

  registerSecureRoute(fastify, {
    name: 'adminLogout',
    alias: '退出登录',
    method: 'POST',
    url: '/session/logout',
    requireLogin: true,
    /* 保护性接口：会话与菜单关掉后后台整页不可用 */
    critical: true,
    handler: withFail(async (request, reply) => {
      await clearAuthCookies(reply);
      return reply.result.success('已退出登录', null);
    })
  });
}

export default registerSessionRoutes;
