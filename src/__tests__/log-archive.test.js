/**
 * 归档统计合并的守卫
 *
 * 「清除日志」会把明细删掉，统计改由「明细 + 归档」相加得到（见
 * `src/app/console/dao/log.dao.js` 的 archiveStats / mergeBuckets）。
 * 这里钉住三条容易写错的性质：同名桶相加、时间序、脏值不放大。
 *
 * 不连库：被测的是一条纯函数，加载的是真实实现（不是手抄一份）。
 */
import { describe, it, expect } from '@jest/globals';
import { mergeBuckets } from '../app/console/dao/log.dao.js';

describe('mergeBuckets 明细 + 归档', () => {
  it('同名时间桶相加，不同桶各自保留', () => {
    const raw = [{ bucket: '11-17 10:00', total: 2, failed: 1 }];
    const archived = [
      { bucket: '11-17 10:00', total: 3, failed: 0 },
      { bucket: '11-17 11:00', total: 5, failed: 2 }
    ];
    expect(mergeBuckets(raw, archived)).toEqual([
      { bucket: '11-17 10:00', total: 5, failed: 1 },
      { bucket: '11-17 11:00', total: 5, failed: 2 }
    ]);
  });

  it('按桶名升序 —— 桶名是 %m-%d 或 %m-%d %H:00，字典序即时间序', () => {
    const rows = mergeBuckets(
      [{ bucket: '11-17 12:00', total: 1, failed: 0 }],
      [
        { bucket: '11-16 09:00', total: 1, failed: 0 },
        { bucket: '11-17 08:00', total: 1, failed: 0 }
      ]
    );
    expect(rows.map(r => r.bucket)).toEqual(['11-16 09:00', '11-17 08:00', '11-17 12:00']);
  });

  it('两侧为空时返回空数组（清除前没有明细、也没有归档）', () => {
    expect(mergeBuckets([], [])).toEqual([]);
    expect(mergeBuckets()).toEqual([]);
  });

  it('SUM() 的 NULL / 字符串数字按 0 / 数值处理，不产生 NaN', () => {
    const rows = mergeBuckets([{ bucket: '11-17', total: null, failed: '2' }], [{ bucket: '11-17', total: '3' }]);
    expect(rows[0].total).toBe(3);
    expect(rows[0].failed).toBe(2);
    expect(Number.isNaN(rows[0].total)).toBe(false);
  });
});
