/**
 * 角色定义（`src/app/<app>/permission/roles.js`）与 Role 模型的一致性守卫
 *
 * 背景（2026-10-30，由 publish-image 的 compose 冒烟发现）：
 * `posecraft_admin` 的 `rank_level` 写成了 100，而 `models/iam/Role.js` 的
 * 校验区间是 `{ min: 0, max: 99 }`。`Role.findOrCreate()` 在**库里还没有这个角色**
 * 时才真正 insert，于是：
 *
 *   - 本地库：角色早就落库 → 走 `!created` 分支只改 policy → **永远绿**；
 *   - 空库（CI 的 compose 全栈冒烟 / 新环境首次部署）→ insert 触发 Sequelize 校验
 *     → `SequelizeValidationError: Validation max on rank_level failed`
 *     → appsLoader 是 fail-fast 的 → 应用**起不来**（容器退出码 1）。
 *
 * 这类「只在空库炸」的缺陷靠人工 review 抓不住，因此这里做两件事：
 *   1. 真实 import 每个应用的 `roles.js`，把它们注册进 `roleRegistry` 的真身，
 *      再用模型自己的 `validate` 边界去量它们（边界从模型派生，不手抄 0/99）；
 *   2. 顺带约束 `(app_id, code)` 唯一 —— findOrCreate 的 where 就是这两列，
 *      重复定义会让两个角色互相覆盖 policy。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { DataTypes } from 'sequelize';

import defineRole from '../../models/iam/Role.js';
import { roleRegistry } from '../../utils/PbacRegistry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const APP_DIR = path.join(ROOT, 'src/app');

/**
 * 从 Role 模型定义里取出 `rank_level` 的校验边界。
 *
 * 用一个只记录 attributes 的假 sequelize 调一次 `defineRole`，拿到**生产代码里写的**
 * `{ min, max }` —— 手抄一份 0/99 会让守卫在模型改动后静默失效。
 */
function readRankLevelBounds() {
  let captured = null;
  const fakeSequelize = {
    define: (_name, attributes) => {
      captured = attributes;
      return { addHook() {}, associate() {} };
    }
  };

  defineRole(fakeSequelize, DataTypes);

  return captured.rank_level.validate;
}

/** 所有带 `permission/roles.js` 的应用目录名 */
function appNamesWithRoles() {
  return fs
    .readdirSync(APP_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => fs.existsSync(path.join(APP_DIR, name, 'permission', 'roles.js')));
}

/** 越界角色的可读描述；空数组表示全部合法 */
function outOfRange(roles, bounds) {
  return roles
    .filter(role => !(role.rank_level >= bounds.min && role.rank_level <= bounds.max))
    .map(
      role =>
        `${role.app_id}/${role.code} = ${role.rank_level}（模型允许 ${bounds.min}~${bounds.max}）` +
        ' —— 空库首次插入会抛 SequelizeValidationError，应用起不来'
    );
}

/** 重复的 (app_id, code)；findOrCreate 按这两列匹配 */
function duplicates(roles) {
  const seen = new Map();
  const dupes = [];

  for (const role of roles) {
    const key = `${role.app_id}/${role.code}`;
    if (seen.has(key)) dupes.push(key);
    seen.set(key, true);
  }

  return dupes;
}

// 动态 import 各应用的 roles.js：它们只做 defineRoles() 注册，不碰 DB/网络，
// 但数量随应用增减，静态 import 会让"新增应用忘加一行"变成静默漏检。
beforeAll(async () => {
  for (const name of appNamesWithRoles()) {
    const file = path.join(APP_DIR, name, 'permission', 'roles.js');
    await import(pathToFileURL(file).href);
  }
});

describe('角色定义守卫：rank_level 必须落在 Role 模型的校验区间内', () => {
  it('确实扫到了各应用的 roles.js（防止路径写错导致守卫空转）', () => {
    expect(appNamesWithRoles().length).toBeGreaterThanOrEqual(5);
    expect(roleRegistry.length).toBeGreaterThanOrEqual(15);
  });

  it('每个已注册角色的 rank_level 都在模型允许的区间内', () => {
    const bounds = readRankLevelBounds();
    expect(bounds).toEqual(expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }));

    expect(outOfRange(roleRegistry, bounds).join('\n')).toBe('');
  });

  it('检测器有牙：超出上限的职级必须被抓到', () => {
    const bounds = readRankLevelBounds();
    const bad = [{ app_id: 'demo', code: 'demo_admin', rank_level: bounds.max + 1 }];

    expect(outOfRange(bad, bounds)).toHaveLength(1);
    // 边界值本身合法（max 是允许值，不是排除值）
    expect(outOfRange([{ app_id: 'demo', code: 'demo_admin', rank_level: bounds.max }], bounds)).toHaveLength(0);
    expect(outOfRange([{ app_id: 'demo', code: 'demo_admin', rank_level: bounds.min }], bounds)).toHaveLength(0);
  });

  it('(app_id, code) 不重复 —— findOrCreate 只按这两列匹配，重复会互相覆盖 policy', () => {
    expect(duplicates(roleRegistry).join('\n')).toBe('');
    expect(
      duplicates([
        { app_id: 'a', code: 'x' },
        { app_id: 'a', code: 'x' }
      ])
    ).toHaveLength(1);
  });
});
