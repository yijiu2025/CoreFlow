/**
 * 加载器失败分级测试（1.2）
 *
 * 覆盖：关键加载器失败 → 终止启动；可降级加载器失败 → 只记录并进 /health/ready 明细。
 *
 * 【为什么用 fixture 目录而不是 mock】
 * `engine.js` 内部是 `await import(pathToFileURL(file))` 的动态导入，对 jest 的
 * `unstable_mockModule` 并不友好（mock 注册的是模块说明符，不是运行时 URL）。
 * 因此这里**真实加载 `runEngine`**，用 `options.registryDir` 指向夹具目录 ——
 * 走的是与生产完全相同的「读目录 → 排序 → 逐个 import → 调用 register」路径，
 * 只是目录内容是可控的。
 *
 * 【反例保护】
 * 若把 engine 的 catch 分支改回"所有错误一律降级"，则「关键失败必须抛出」的
 * 两条用例会立即变红；反之若把 OPTIONAL 判定去掉，可降级那条会变红。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runEngine, getLoaderStatus, isOptionalLoader } from '../framework/loader/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => path.resolve(__dirname, '__fixtures__', name);

describe('加载器失败分级', () => {
  beforeEach(() => {
    // 摘要状态是进程级的，用例之间必须重新跑一次加载才能观察，故不重置、只按顺序断言
  });

  it('可降级加载器失败：不抛错，明细进摘要且 completed=true', async () => {
    const summary = await runEngine({}, { registryDir: fixture('loader-ok') });

    // 00-globals 成功、01-monitor 失败 → 总数 2、失败 1
    expect(summary.total).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.loadErrors).toHaveLength(1);
    expect(summary.loadErrors[0].file).toBe('01-monitor.js');
    expect(summary.loadErrors[0].message).toBe('monitor boom');

    const status = getLoaderStatus();
    expect(status.optionalFailed).toBe(1);
    expect(status.criticalFailed).toBe(0);
    expect(status.completed).toBe(true);
  });

  it('关键加载器失败：抛出原错误，且带上加载器上下文', async () => {
    await expect(runEngine({}, { registryDir: fixture('loader-critical-fail') })).rejects.toThrow('api boom');

    const status = getLoaderStatus();
    expect(status.criticalFailed).toBe(1);
    expect(status.completed).toBe(false);
    expect(status.failed).toBe(1);
  });

  it('未声明名单的加载器失败：按默认关键处理（拦住启动）', async () => {
    let caught;
    try {
      await runEngine({}, { registryDir: fixture('loader-unknown-fail') });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.message).toBe('unknown loader boom');
    // 上下文让上层日志能直接指出是哪个文件拦住了启动
    expect(caught.loaderFile).toBe('99-unknown.js');
    expect(caught.loaderCritical).toBe(true);
  });

  it('registry 目录不存在：抛错且信息里带目录路径', async () => {
    await expect(runEngine({}, { registryDir: fixture('not-exist-dir') })).rejects.toThrow(/注册表目录不存在/);
  });
});

describe('可降级名单边界', () => {
  it('名单内的加载器判定为可选', () => {
    ['01-monitor.js', '02-redis.js', '03-db.js', '09-notice.js'].forEach(file => {
      expect(isOptionalLoader(file)).toBe(true);
    });
  });

  it('承载核心能力的加载器不是可选（缺失即 fail-fast）', () => {
    ['00-globals.js', '04-auth.js', '05-firewall.js', '06-models.js', '07-keys.js', '08-api.js', '10-apps.js'].forEach(
      file => {
        expect(isOptionalLoader(file)).toBe(false);
      }
    );
  });

  it('未声明的文件名默认按关键处理', () => {
    expect(isOptionalLoader('99-unknown.js')).toBe(false);
  });
});
