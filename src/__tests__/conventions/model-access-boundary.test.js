/**
 * 数据访问边界：业务层不直接 `getModel`
 *
 * 为什么要有这条：`getModel('User')` 散在 12 个 service 里各查各的，字段口径必然
 * 漂移 —— 实际已经出现过 `dept_id` / `deptId` 混用、`status` 一会儿数字一会儿字符串。
 * 收进 DAO 不是为了"多一层"，是为了让**同一个模型的查询只有一个出口**。
 *
 * 边界怎么划：
 * - `**\/dao/` 里的调用是正常的，**不检查**（那儿就是干这个的）；
 * - `src/framework/**` 也**不检查** —— 框架不能反向依赖 app 的 DAO，否则分层反过来；
 * - `src/api/**` 与 `src/app/**` 的其余文件属于业务层，新增调用即视为违规。
 *
 * 🔴 基线**只减不增**：这份数字是收敛的进度条，不是许可额度。
 *    收敛一处就把对应行删掉或调小，别原地放宽 —— 放宽等于把守卫关了。
 *
 * 只读源码不 import 模块：断言对象是"有没有直接拿模型"，注册表里看不到这个区别
 * （已登记 STRUCTURAL_GUARD_WHITELIST）。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { describe, expect, test } from '@jest/globals';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/**
 * 存量基线：路径（相对 src/）→ { max 允许次数, why 为什么允许保留 }
 *
 * 🔴 **只减不增**，且**每条都必须写清理由**。
 *    没有理由的条目等于黑名单：下一个看到的人不知道该不该动它，只能继续往上堆数字。
 *    收敛完之后整条删掉，不要留下 `max: 0`。
 */
const BASELINE = {
  'api/admin/user/v1/sessions.js': {
    max: 2,
    why: 'SessionToken 属 session 域，admin 域没有对应 DAO；另一处是踢人前的目标账号快照。**暂不收**：会话操作是认证核心路径，这两个接口目前没有行为测试，先补测试再搬（否则改错就是"踢不掉/登不上"）'
  },
  'api/user/v1/sessions.js': {
    max: 4,
    why: '会话表的直接读写（列表 / 踢单条 / 踢设备 / 清已撤销 / 全踢）：六条路由共用一张表，但每条的 where 与副作用都不同。**暂不收**：同样是认证核心路径且无行为测试，先把接口测试补上，再考虑搬进 framework 的 session 层'
  },
  'app/admin/services/device-account.service.js': {
    max: 2,
    why: 'SessionToken + include User 的关联查询：DAO 化需要先给两张表挂 association，属于模型层的改动，不在收敛范围'
  },
  'app/console/services/access-scope.service.js': {
    max: 3,
    why: '**权限判据本身**（User / Role / UserRole）：查询与判定必须在一起，拆进 DAO 会把判据拆成两半，可读性反而更差'
  },
  'app/console/services/button-grant.service.js': {
    max: 1,
    why: "菜单快照扫描 `getModel('console.SysMenu')`：这是一次性全量读，且要按 id 建祖先映射，menu.dao 的 tree 形态不适合"
  },
  'app/console/services/data-scope.service.js': {
    max: 6,
    why: '**数据范围判据本身**（UserRole / Role / User / RoleDept / RoleApp）：与 access-scope 同理，判据不拆'
  },
  'app/console/services/stepup.service.js': {
    max: 2,
    why: '二次验证要读 User + UserIdentity 的实时状态（锁定次数 / 锁定截止）。与 guard 那份**不是重复**：本份把挑战绑定到 `action + targetId` 并一次性消费，guard 那份绑定 `patchHash` 并签发票据 —— 二者语义不同，合并会破坏"一次授权只用于那一次操作"'
  },
  'app/console/services/user-danger.service.js': {
    max: 1,
    why: '只剩 `safeFindAll(modelName)` 的通用容错查询：模型可能按部署裁剪掉，缺表时降级成空数组而不是整页 500 —— 这是刻意的动态取模型，不是越界'
  },
  'app/console/services/user-profile.service.js': {
    max: 5,
    why: 'InlinePolicy 的读写、SysUserPost / SysPost 关联表、AuditLog / SessionLog 的原生聚合 SQL —— 都是各自域的附属表，console 侧没有对应 DAO'
  },
  'app/guard/services/stepup.service.js': {
    max: 2,
    why: '同 console 那份读的是同一对模型（User / UserIdentity），但挑战绑定的是 `patchHash`（一次授权只能用于被批准的那次变更）。guard 属框架侧目录，也不能反向依赖 app 的 DAO'
  },
  'app/posecraft/services/profile.service.js': {
    max: 4,
    why: '跨应用读用户公开资料 + 作品/收藏/推荐计数：posecraft 域自己的表有 DAO，但 User 是共享模型'
  },
  'app/posecraft/utils/preview.js': {
    max: 1,
    why: '预览渲染时要按 id 取模板，处在一个纯函数工具里，引入 DAO 会把它变成有状态模块'
  },
  'app/retroweb/services/quota.service.js': {
    max: 1,
    why: '配额统计要对 retroweb.Task 做聚合，任务 DAO 目前只有列表查询'
  },
  'app/user/permission/seeder.js': {
    max: 1,
    why: '角色种子数据初始化：一次性脚本性质，写死模型名是为了在 seeder 里保持自包含'
  },
  'app/user/services/deactivation.service.js': {
    max: 20,
    why: '**跨域清理编排**（User / UserIdentity / oauth21.* / session.* / iam.* / 应用私有表）：用模型名字符串刻意避免静态依赖别的 app，收进 user 的 DAO 会破坏 app 隔离；且每张表只在这里出现一次，不存在口径漂移'
  }
};

/**
 * 去掉注释行，只留代码
 *
 * 注释里写 `getModel('User')` 举例不算违规 —— 否则解释"为什么不该这么写"的
 * 那段注释自己就会把测试弄红。
 *
 * @param {string} source 源码
 * @returns {string} 代码行
 */
function codeOnly(source) {
  return source
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

/**
 * 递归列出待检查的源码文件
 *
 * @returns {string[]} 相对 `src/` 的路径（正斜杠）
 */
function listFiles() {
  const out = [];
  for (const root of ['app', 'api']) {
    for (const entry of readdirSync(`${SRC}${root}`, { recursive: true })) {
      const rel = `${root}/${String(entry).replace(/\\/g, '/')}`;
      if (!rel.endsWith('.js')) continue;
      if (rel.includes('__tests__')) continue;
      // DAO 就是收口点，不检查
      if (rel.includes('/dao/')) continue;
      out.push(rel);
    }
  }
  return out;
}

/** 每个文件的直接 getModel 次数 */
function countByFile() {
  const counts = new Map();
  for (const rel of listFiles()) {
    const code = codeOnly(readFileSync(`${SRC}${rel}`, 'utf8'));
    const hits = (code.match(/getModel\(/g) || []).length;
    if (hits > 0) counts.set(rel, hits);
  }
  return counts;
}

describe('数据访问边界', () => {
  test('业务层没有新增的直接 getModel 调用（基线只减不增）', () => {
    const counts = countByFile();
    const violations = [];
    for (const [rel, hits] of counts) {
      const allowed = BASELINE[rel]?.max ?? 0;
      if (hits > allowed) {
        violations.push(`${rel}: ${hits} 处（基线 ${allowed}）`);
      }
    }
    expect(violations).toEqual([]);
  });

  test('每条基线都写了理由（没有理由的基线就是黑名单）', () => {
    const blank = Object.entries(BASELINE)
      .filter(([, item]) => !item || !Number.isInteger(item.max) || String(item.why || '').trim().length < 10)
      .map(([rel]) => rel);
    expect(blank).toEqual([]);
  });

  test('基线条目对应的文件都还在（别留僵尸条目）', () => {
    /*
     * 只兜"文件改名 / 删除后基线没跟着改"这一种情况。
     *
     * 实际次数**少于**基线是收敛成果，不判失败（否则每收一处都要改两遍测试）；
     * 多于基线的在第一条用例里拦。
     */
    const missing = Object.keys(BASELINE).filter(rel => !existsSync(`${SRC}${rel}`));
    expect(missing).toEqual([]);
  });
});
