/**
 * 守卫配置持久化行为回归
 *
 * 与 `guard-config-sync.test.js` 互补：那份测"别的实例改了，本实例能不能拿到"，
 * 这份测"本实例自己写库时的边界" —— 全部是**曾经真实踩过或差点踩到**的坑：
 *
 *   1. 启动时全量回写会把内存态错误固化进 DB（改成只补录未落库的系统）
 *   2. 单系统写入后 `_dbVersions` 被写成子集，导致轮询谎报"其他实例改了配置"
 *   3. 运行时字段类型非法时曾经能落库（只有结构校验），坏值静默变默认值
 *   4. 关停时无脏系统也打印"已安全写入数据库"（假绿）
 *   5. `getGuardConfig` 直接交出内部节点，任何调用方改一下就成了全局改动
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** 替身 DB：行内容与版本号分开存，便于模拟"其他实例写入"与断言写入了哪些系统 */
let dbRows = {};
let dbVersions = {};
/** 每次 saveToDB 的入参记录（keys = 本次要写的系统列表） */
let saveCalls = [];
let saveShouldThrow = false;

jest.unstable_mockModule('../../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    async loadFromDB() {
      const configs = {};
      const versions = {};
      let maxVersion = 0;
      for (const [key, value] of Object.entries(dbRows)) {
        configs[key] = value;
        versions[key] = dbVersions[key] || 0;
        maxVersion = Math.max(maxVersion, dbVersions[key] || 0);
      }
      return { configs, version: maxVersion, versions };
    },
    async saveToDB(toSave, knownVersions) {
      if (saveShouldThrow) throw new Error('模拟写入失败');
      saveCalls.push({ keys: Object.keys(toSave), knownVersions: { ...knownVersions } });
      const versions = {};
      let maxVersion = Math.max(0, ...Object.values(knownVersions));
      for (const key of Object.keys(toSave)) {
        const next = (knownVersions[key] || 0) + 1;
        dbRows[key] = toSave[key];
        dbVersions[key] = next;
        versions[key] = next;
        maxVersion = Math.max(maxVersion, next);
      }
      return { maxVersion, updated: Object.keys(toSave), versions };
    }
  }
}));

const {
  registerSystemMetadata,
  registerGroupMetadata,
  registerApiMetadata,
  getGuardConfig,
  setGuardConfig,
  loadGuardConfig,
  flushGuardConfig,
  syncGuardConfigFromDb
} = await import('../../api/guard-config.js');

/** 注册一个三层结构齐全的系统（与真实启动时的 register* 顺序一致） */
function registerTestSystem(systemKey, { apiRequireLogin = false } = {}) {
  registerSystemMetadata(systemKey, { alias: systemKey, prefix: '', enabled: true, requireLogin: false });
  registerGroupMetadata(systemKey, 'g1', { alias: 'g1', prefix: '/v1', enabled: true, requireLogin: false });
  registerApiMetadata(systemKey, 'g1', 'a1', {
    alias: 'a1',
    method: 'GET',
    url: '/probe',
    enabled: true,
    requireLogin: apiRequireLogin
  });
}

/** 构造 DB 行（结构与内存一致，仅运行时字段可能不同） */
function makeDbSystem(apiRequireLogin) {
  return {
    id: 'x',
    enabled: true,
    requireLogin: false,
    allowIps: [],
    allowRoles: [],
    groups: {
      g1: {
        enabled: true,
        requireLogin: false,
        allowIps: [],
        allowRoles: [],
        apis: {
          a1: { enabled: true, requireLogin: apiRequireLogin, allowIps: [], allowRoles: [] }
        }
      }
    }
  };
}

beforeEach(() => {
  dbRows = {};
  dbVersions = {};
  saveCalls = [];
  saveShouldThrow = false;
});

describe('启动加载：不合规的"内存态"不能污染 DB', () => {
  it('只补录 DB 里没有的系统，已有系统不回写', async () => {
    registerTestSystem('p-boot-exist');
    registerTestSystem('p-boot-new');
    dbRows = { 'p-boot-exist': makeDbSystem(true) };
    dbVersions = { 'p-boot-exist': 3 };
    saveCalls = [];

    await loadGuardConfig();

    const written = saveCalls.flatMap(c => c.keys);
    expect(written).toContain('p-boot-new');
    expect(written).not.toContain('p-boot-exist');
    // DB 里已经收紧到 requireLogin=true，内存必须保留它（而不是被代码默认值覆盖）
    expect(getGuardConfig('p-boot-exist', 'g1', 'a1').requireLogin).toBe(true);
  });

  it('一个系统字段非法时，不影响其他未落库系统的补录', async () => {
    registerSystemMetadata('p-bad-iso', { alias: 'bad', enabled: 'yes' });
    registerGroupMetadata('p-bad-iso', 'g1', { alias: 'g1' });
    registerTestSystem('p-good-iso');
    dbRows = { 'p-anchor': makeDbSystem(false) };
    dbVersions = { 'p-anchor': 1 };
    saveCalls = [];

    await loadGuardConfig();

    const written = saveCalls.flatMap(c => c.keys);
    expect(written).toContain('p-good-iso');
    expect(written).not.toContain('p-bad-iso');
  });

  it('DB 有行但版本号全为 0 时，仍按"已有数据"处理（不能误走首启分支重写）', async () => {
    registerTestSystem('p-boot-zero');
    dbRows = { 'p-boot-zero': makeDbSystem(false) };
    dbVersions = { 'p-boot-zero': 0 };
    saveCalls = [];

    await loadGuardConfig();

    expect(saveCalls.flatMap(c => c.keys)).not.toContain('p-boot-zero');
  });
});

describe('写入：版本号与脏系统边界', () => {
  it('单系统写入后，不把其他系统误判为"被别的实例改过"', async () => {
    registerTestSystem('p-sync-a');
    registerTestSystem('p-sync-b');
    dbRows = { 'p-sync-a': makeDbSystem(false), 'p-sync-b': makeDbSystem(false) };
    dbVersions = { 'p-sync-a': 2, 'p-sync-b': 4 };

    await loadGuardConfig(); // 建立本地版本基线（两个系统都已在 DB 中，不应写库）

    setGuardConfig('p-sync-a', { enabled: false });
    await flushGuardConfig();
    expect(saveCalls.flatMap(c => c.keys)).toContain('p-sync-a');

    // 本地刚写完 DB，此时轮询不应把 p-sync-b 判成"变了"
    const result = await syncGuardConfigFromDb();
    expect(result.updated).not.toContain('p-sync-b');
  });

  it('无脏系统时关停不写库（不做假绿的成功日志）', async () => {
    registerTestSystem('p-idle');
    await flushGuardConfig(); // 先清掉可能残留的脏标记
    saveCalls = [];

    await flushGuardConfig();

    expect(saveCalls).toHaveLength(0);
  });

  it('运行时字段类型非法时整次拒绝，且不触达 DAO', async () => {
    // 直接构造一个非法节点：enabled 是字符串（真实场景来自注册逻辑写错）
    registerSystemMetadata('p-bad-type', { alias: 'bad', enabled: 'yes' });
    registerGroupMetadata('p-bad-type', 'g1', { alias: 'g1' });
    saveCalls = [];

    // DB 为空 ⇒ 走首启分支（全量写），校验必须把这次写入拦下来
    await expect(loadGuardConfig()).rejects.toThrow(/校验失败/);
    expect(saveCalls).toHaveLength(0);
  });

  it('写入失败会回滚内存，不留下"内存已改 / DB 未改"的不一致', async () => {
    registerTestSystem('p-rollback');
    dbRows = { 'p-rollback': makeDbSystem(false) };
    dbVersions = { 'p-rollback': 1 };
    await loadGuardConfig();

    saveShouldThrow = true;
    setGuardConfig('p-rollback', { requireLogin: true });
    await flushGuardConfig();

    // 写失败 ⇒ 回滚到写入前：requireLogin 必须仍是 false
    expect(getGuardConfig('p-rollback', 'g1').requireLogin).toBe(false);
  });
});

describe('读取：不交出内部引用', () => {
  it('getGuardConfig 返回冻结快照，改写不会影响内部状态', () => {
    registerTestSystem('p-readonly');

    const node = getGuardConfig('p-readonly', 'g1', 'a1');
    expect(Object.isFrozen(node)).toBe(true);

    // 严格模式（ESM）下给冻结对象赋值直接抛 TypeError —— 误改会被立刻暴露，
    // 而不是像以前那样静默改掉全局鉴权状态、并在下次写入时带进 DB。
    expect(() => {
      node.requireLogin = true;
    }).toThrow();

    expect(getGuardConfig('p-readonly', 'g1', 'a1').requireLogin).toBe(false);
  });
});
