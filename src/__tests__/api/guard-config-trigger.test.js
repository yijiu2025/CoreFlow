/**
 * triggerSave 的落盘边界：**缺 systemKey 时必须跳过，绝不退化成"全量写"**
 *
 * 背景（2026-11-09）：旧实现是
 *   `const keys = _dirtySystems.size > 0 ? [..._dirtySystems] : null;`
 * 而 `saveWithTimeout(null)` 的语义是"写整棵树"。于是任何一处忘传 systemKey 的调用，
 * 结果都是「改了一个系统，顺手把其他系统的运维配置一起覆盖回代码值」—— 正是
 * loadGuardConfig 里被移除的启动全量写行为，而且不报错、只有一条普通 info 日志。
 *
 * 为什么单独成文件：这条用例要等满 1 秒防抖窗口（旧实现是"1 秒后才决定写全树"），
 * 而且必须保证 `configs` 里没有非法节点（否则全量写会被 validateConfigs 提前拦下，
 * 用例就变成"因为别的原因没写"的假绿）。独立文件让模块状态从空开始，只注册一个合法系统。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

import { describe, it, expect, jest } from '@jest/globals';

/** 每次 saveToDB 的入参系统列表 */
let saveCalls = [];

jest.unstable_mockModule('../../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    async loadFromDB() {
      return { configs: {}, version: 0, versions: {} };
    },
    async saveToDB(toSave, knownVersions) {
      saveCalls.push({ keys: Object.keys(toSave), knownVersions: { ...knownVersions } });
      const versions = {};
      for (const key of Object.keys(toSave)) versions[key] = (knownVersions[key] || 0) + 1;
      return { maxVersion: Math.max(0, ...Object.values(versions)), updated: Object.keys(toSave), versions };
    }
  }
}));

const {
  registerSystemMetadata,
  registerGroupMetadata,
  registerApiMetadata,
  setGuardConfig,
  flushGuardConfig,
  __test__triggerSave
} = await import('../../api/guard-config.js');

/** 注册一个三层结构齐全、字段类型合法的系统 */
function registerValidSystem(systemKey) {
  registerSystemMetadata(systemKey, { alias: systemKey, prefix: '', enabled: true, requireLogin: false });
  registerGroupMetadata(systemKey, 'g1', { alias: 'g1', prefix: '/v1', enabled: true, requireLogin: false });
  registerApiMetadata(systemKey, 'g1', 'a1', {
    alias: 'a1',
    method: 'GET',
    url: '/probe',
    enabled: true,
    requireLogin: false
  });
}

describe('triggerSave · 落盘边界', () => {
  it('对照组：正常改配置只写被改的那个系统（证明写入通路本身是通的）', async () => {
    registerValidSystem('t-main');
    registerValidSystem('t-other');
    await flushGuardConfig(); // 清掉可能残留的脏标记
    saveCalls = [];

    setGuardConfig('t-main', { requireLogin: true });
    await flushGuardConfig();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].keys).toEqual(['t-main']);
  });

  it('缺 systemKey 时跳过，不退化成"写整棵树"', async () => {
    await flushGuardConfig();
    saveCalls = [];

    __test__triggerSave(); // 故意不传 systemKey
    // 必须等过防抖窗口（1s）：旧实现是"1 秒后才决定写全树"。
    // ⚠️ 只等 100ms 会得到恒绿的假用例 —— 已用毒丸自证（还原旧实现后本用例必须变红）。
    await new Promise(resolve => setTimeout(resolve, 1200));

    expect(saveCalls).toHaveLength(0);
  });
});
