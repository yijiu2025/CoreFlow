/**
 * 环境变量集中校验测试
 *
 * ⚠️ 本文件历史上是一个**虚假覆盖**测试：通篇定义局部对象字面量再断言这些字面量，
 * 没有 import 任何被测代码 —— 把被测模块删掉它依然全绿。因此它长期挂在
 * `KNOWN_INEFFECTIVE_TESTS` 冻结清单里（"配置校验从未被真正测试过"）。
 *
 * 现改为真实加载 `framework/config/env.js` 并驱动其公开接口。
 * 可毒丸复验：把 validateEnv 改成恒返回 `{ok:true,errors:[],warnings:[],notes:[]}`，
 * 下面所有"必须报错"的用例会立刻变红。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-19 由虚假覆盖改造为真实驱动
 */

import { describe, it, expect } from '@jest/globals';
import { validateEnv, describePoolCapacity, SCHEMA, MIN_SECRET_LENGTH } from '../framework/config/env.js';

/** 一份可用的基准环境（生产），各用例在其上做单点改动 */
const STRONG = 'x'.repeat(MIN_SECRET_LENGTH + 8);

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DB_HOST: '127.0.0.1',
    DB_NAME: 'app',
    DB_USER: 'root',
    APP_SECRET: STRONG,
    SESSION_SECRET: STRONG,
    FIREWALL_SECRET: STRONG,
    ...overrides
  };
}

/** 便捷断言：结果里是否存在指向某键的错误 */
const hasError = (result, key) => result.errors.some(e => e.key === key);

describe('环境变量校验 · 合法配置', () => {
  it('基准配置通过校验', () => {
    const result = validateEnv(baseEnv(), { isProduction: true });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('未配置的可选键走 fallback，不产生问题', () => {
    const result = validateEnv(baseEnv(), { isProduction: true });
    // PORT / LOG_LEVEL / DB_POOL_* 都没给，但都有安全默认值
    for (const key of ['PORT', 'LOG_LEVEL', 'DB_POOL_MAX', 'REDIS_ENABLED']) {
      expect(hasError(result, key)).toBe(false);
      expect(result.warnings.some(w => w.key === key)).toBe(false);
    }
  });
});

describe('环境变量校验 · 缺失必需项（分级处置）', () => {
  it('生产环境缺少密钥 → 致命错误', () => {
    const env = baseEnv();
    delete env.APP_SECRET;
    const result = validateEnv(env, { isProduction: true });
    expect(hasError(result, 'APP_SECRET')).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('非生产环境缺少密钥 → 仅告警，不拦启动', () => {
    const env = baseEnv({ NODE_ENV: 'development' });
    delete env.APP_SECRET;
    const result = validateEnv(env, { isProduction: false });
    expect(hasError(result, 'APP_SECRET')).toBe(false);
    expect(result.warnings.some(w => w.key === 'APP_SECRET')).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('缺少数据库三件套 → 生产环境致命；本地仅告警', () => {
    const env = baseEnv();
    delete env.DB_HOST;
    expect(hasError(validateEnv(env, { isProduction: true }), 'DB_HOST')).toBe(true);
    expect(hasError(validateEnv({ ...env, NODE_ENV: 'development' }, { isProduction: false }), 'DB_HOST')).toBe(false);
  });

  it('isProduction 缺省时按 NODE_ENV 推断', () => {
    const env = baseEnv();
    delete env.SESSION_SECRET;
    // 未显式传 isProduction，env.NODE_ENV=production → 应当致命
    expect(hasError(validateEnv(env), 'SESSION_SECRET')).toBe(true);
  });
});

describe('环境变量校验 · 配错的值（任何环境都判错）', () => {
  it('密钥长度不足 → 错误', () => {
    const result = validateEnv(baseEnv({ APP_SECRET: 'short' }), { isProduction: true });
    expect(hasError(result, 'APP_SECRET')).toBe(true);
    expect(result.errors.find(e => e.key === 'APP_SECRET').message).toContain('长度不足');
  });

  it('密钥是已知的不安全默认值 → 错误，且提示可操作', () => {
    const result = validateEnv(baseEnv({ APP_SECRET: 'your_super_secret_key_2026' }), {
      isProduction: true
    });
    const err = result.errors.find(e => e.key === 'APP_SECRET');
    expect(err).toBeDefined();
    // 提示要说清"这是已知弱值"，而不只是泛泛的"不合法"
    expect(err.message).toContain('不安全默认值');
  });

  it('端口越界 / 非数字 → 错误（即使是非生产环境也拦）', () => {
    expect(hasError(validateEnv(baseEnv({ PORT: '99999' }), { isProduction: false }), 'PORT')).toBe(true);
    expect(hasError(validateEnv(baseEnv({ PORT: 'abc' }), { isProduction: false }), 'PORT')).toBe(true);
  });

  it('布尔开关取值非法 → 错误', () => {
    expect(hasError(validateEnv(baseEnv({ REDIS_ENABLED: 'yes' }), { isProduction: false }), 'REDIS_ENABLED')).toBe(
      true
    );
  });

  it('日志级别不在白名单 → 错误', () => {
    expect(hasError(validateEnv(baseEnv({ LOG_LEVEL: 'verbose' }), { isProduction: false }), 'LOG_LEVEL')).toBe(true);
  });

  it('超时配置为负数 → 错误', () => {
    expect(
      hasError(
        validateEnv(baseEnv({ HTTP_REQUEST_TIMEOUT_MS: '-1' }), { isProduction: false }),
        'HTTP_REQUEST_TIMEOUT_MS'
      )
    ).toBe(true);
  });
});

describe('环境变量校验 · 跨字段关系（散落校验做不到的部分）', () => {
  it('REDIS_ENABLED=true 却缺 REDIS_HOST → 错误', () => {
    const result = validateEnv(baseEnv({ REDIS_ENABLED: 'true' }), { isProduction: false });
    expect(hasError(result, 'REDIS_HOST')).toBe(true);
    // 命中原因要说清"会静默降级"，否则运维只会以为连接失败
    expect(result.errors.find(e => e.key === 'REDIS_HOST').message).toContain('静默降级');
  });

  it('REDIS_ENABLED=true 且给了 REDIS_HOST → 通过', () => {
    const result = validateEnv(baseEnv({ REDIS_ENABLED: 'true', REDIS_HOST: '10.0.0.1' }), {
      isProduction: true
    });
    expect(hasError(result, 'REDIS_HOST')).toBe(false);
  });

  it('连接池下限大于上限 → 错误', () => {
    const result = validateEnv(baseEnv({ DB_POOL_MIN: '50', DB_POOL_MAX: '10' }), { isProduction: false });
    expect(hasError(result, 'DB_POOL_MIN')).toBe(true);
  });
});

describe('环境变量校验 · 边界声明', () => {
  it('未列入 schema 的键不被校验（明确本模块的能力边界）', () => {
    const result = validateEnv(baseEnv({ SOME_UNKNOWN_KEY_XYZ: 'whatever' }), { isProduction: true });
    expect(result.ok).toBe(true);
  });

  it('是纯函数：把错误塞进传入的对象即可，无需改动全局 process.env', () => {
    const before = process.env.PORT;
    const result = validateEnv(baseEnv({ PORT: 'not-a-port' }), { isProduction: false });
    expect(hasError(result, 'PORT')).toBe(true);
    expect(process.env.PORT).toBe(before); // 未被本模块污染
  });

  it('schema 覆盖三个密钥项，且都带弱值检查', () => {
    const secretItems = SCHEMA.filter(i => i.group === 'security');
    expect(secretItems.map(i => i.key).sort()).toEqual(['APP_SECRET', 'FIREWALL_SECRET', 'SESSION_SECRET']);
    for (const item of secretItems) {
      expect(item.required).toBe('production');
      expect(typeof item.validate).toBe('function');
    }
  });

  it('连接池容量提示给出"每实例 × 实例数"的算式', () => {
    const text = describePoolCapacity({ DB_POOL_MAX: '10' });
    expect(text).toContain('10');
    expect(text).toContain('实例数');
    expect(text).toContain('max_connections');
  });
});
