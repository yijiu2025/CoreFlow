/**
 * 归档统计合并的守卫
 *
 * 「清除日志」会把明细删掉，统计改由「明细 + 归档」相加得到（见
 * `src/app/admin/console/dao/log.dao.js` 的 archiveStats / mergeBuckets）。
 * 这里钉住三条容易写错的性质：同名桶相加、时间序、脏值不放大。
 *
 * 不连库：被测的是一条纯函数，加载的是真实实现（不是手抄一份）。
 */
import { describe, it, expect } from '@jest/globals';
import { mergeBuckets, buildLoginAnomalySql } from '../app/admin/console/dao/log.dao.js';

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

describe('buildLoginAnomalySql —— 异常来源必须「明细 ∪ 归档」后再去重', () => {
  const sql = buildLoginAnomalySql(7, 0);

  /** 取出两侧共用那段 `(明细 UNION ALL 归档) t` 的子查询体 */
  function pairsOf(text) {
    const from = text.indexOf('FROM (');
    const to = text.lastIndexOf(') t');
    return text.slice(from + 'FROM ('.length, to);
  }

  it('两段都在 (ip, 账号) 这一层先聚合，再 UNION ALL', () => {
    const pairs = pairsOf(sql.ip);
    expect(pairs).toContain('UNION ALL');
    // 两个分支各一句 GROUP BY 1, 2 —— 少了任何一句，spread 就会被算成两段相加
    expect(pairs.match(/GROUP BY 1, 2/g)).toHaveLength(2);
    expect(pairs).toContain('session_logs');
    expect(pairs).toContain('log_stats_login_pairs');
  });

  it('spread 只在整个集合上 distinct 一次（不是两段各算一次再相加）', () => {
    expect(sql.ip).toContain('COUNT(DISTINCT NULLIF(t.user_id, 0)) AS spread');
    expect(sql.user).toContain('COUNT(DISTINCT t.ip) AS spread');
    // 出现两次就说明回到了"两段各 distinct 一次"的错法
    expect(sql.ip.match(/AS spread/g)).toHaveLength(1);
    expect(sql.user.match(/AS spread/g)).toHaveLength(1);
  });

  it('归档侧用 bucket_start 做窗口，与明细的 created_at 走同一条时间轴', () => {
    const pairs = pairsOf(sql.ip);
    expect(pairs).toContain('p.bucket_start');
    expect(pairs).toContain('l.created_at');
  });

  it('翻页 offset 对两侧同时生效（否则会「明细是上一周、归档是这一周」）', () => {
    const paged = buildLoginAnomalySql(7, 1);
    const pairs = pairsOf(paged.ip);
    // offset=1、span=7 → 两侧都应是 [7,14) 天前
    expect(pairs.match(/INTERVAL 14 DAY/g)).toHaveLength(2);
    expect(pairs.match(/INTERVAL 7 DAY/g)).toHaveLength(2);
  });

  it('账号维度按真实账号聚合（JOIN 掉匿名行），IP 维度不 JOIN', () => {
    expect(sql.user).toContain('JOIN user_user u ON u.id = t.user_id');
    expect(sql.ip).not.toContain('user_user');
  });

  it('上榜首仍按失败次数、阈值占位符不写死', () => {
    expect(sql.ip).toContain('HAVING failed >= :threshold');
    expect(sql.ip).toContain('ORDER BY failed DESC');
    expect(sql.ip).toContain('LIMIT 20');
  });
});
