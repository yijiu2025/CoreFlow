/**
 * 启动期调优配置体检的**接线**判据
 *
 * 为什么需要这条：`validateAppConfig(config = {})` 的形参有默认值，于是
 * `validateAppConfig()`（不传参）不会报错、不会告警、直接返回 `[]` ——
 * 入口里写这一行看起来像在体检，实际一条判据都没跑。
 * 这个 bug 在默认配置（`APP_CONFIG = {}`）下**永远看不出来**：真跑和假跑输出完全一致。
 *
 * 所以这里把 schema 打桩，只观察"调用时到底传了什么"：
 * 传 `undefined` = 判据失效，传 `APP_CONFIG` = 接线正确。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { describe, it, expect, jest } from '@jest/globals';

/** 记录每次 validateAppConfig 收到的实参（未传参时记录到 undefined） */
const received = [];

jest.unstable_mockModule('../../../../framework/config/app-config-schema.js', () => ({
  // 门面必须给全：只导一个函数会让加载方拿到 undefined 并在别处炸（窄 mock 的经典坑）
  NUMBER_RULES: [],
  KNOWN_SECTIONS: {},
  validateAppConfig: config => {
    received.push(config);
    // 与真实实现的语义保持一致：没拿到配置对象就没什么可校验 → 零问题。
    // 这样"无参调用"这条接线错误会在**两条**用例上同时暴露，而不是只靠第一条。
    if (config === undefined || config === null) return [];
    return ['stub: 未知配置段 "https"'];
  }
}));

const { reportAppConfigWarnings } = await import('../../../../framework/lifecycle/startup/config-check.js');
const { APP_CONFIG } = await import('../../../../framework/config/app-config.js');

describe('reportAppConfigWarnings', () => {
  it('🔴 必须把 APP_CONFIG 传给 validateAppConfig（无参 = 校验 {} = 判据静默失效）', () => {
    received.length = 0;

    const count = reportAppConfigWarnings();

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(APP_CONFIG);
    expect(received[0]).not.toBeUndefined();
    expect(count).toBe(1);
  });

  it('返回问题条数（调用方/测试可据此断言"确实体检过"）', () => {
    received.length = 0;
    expect(reportAppConfigWarnings()).toBe(1);
    expect(received).toHaveLength(1);
  });
});
