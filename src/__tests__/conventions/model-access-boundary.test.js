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
 * 存量基线：路径（相对 src/）→ 允许的直接 getModel 次数
 *
 * 收敛完的文件从这里删掉，不要留着 0。
 */
const BASELINE = {
  'api/admin/console/v1/session.js': 10,
  'api/admin/console/v1/users.js': 1,
  'api/admin/user/v1/sessions.js': 2,
  'api/user/v1/sessions.js': 4,
  'app/admin/services/device-account.service.js': 2,
  'app/console/services/access-scope.service.js': 3,
  'app/console/services/button-grant.service.js': 2,
  'app/console/services/dashboard.service.js': 1,
  'app/console/services/data-scope.service.js': 6,
  'app/console/services/stepup.service.js': 2,
  'app/console/services/user-danger.service.js': 3,
  'app/console/services/user-profile.service.js': 10,
  'app/guard/services/stepup.service.js': 2,
  'app/posecraft/services/profile.service.js': 4,
  'app/posecraft/utils/preview.js': 1,
  'app/retroweb/services/quota.service.js': 1,
  'app/user/permission/seeder.js': 1,
  'app/user/services/deactivation.service.js': 20
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
      const allowed = BASELINE[rel] ?? 0;
      if (hits > allowed) {
        violations.push(`${rel}: ${hits} 处（基线 ${allowed}）`);
      }
    }
    expect(violations).toEqual([]);
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
