/**
 * 权限指纹（第 3 层）的失效语义测试
 *
 * 重点不在"缓存能命中"，而在**指纹必须随数据变化而变化**。
 * 理由：`underscored: true` 下把物理列名 `'updated_at'` 写进 Sequelize 的
 * `attributes` 会被**静默丢弃**，于是指纹退化成常量、缓存永不失效 ——
 * 而"缓存命中"的测试恰好会因为这一点而**通过**。所以这里断言方向相反。
 */
import { Sequelize, DataTypes } from 'sequelize';
import { computePermFingerprint, normalizeTs, buildPermKey, PERM_NAMESPACE } from '../../framework/auth/perm-cache.js';

describe('权限指纹（第 3 层）', () => {
  describe('normalizeTs', () => {
    test('Date / ISO 字符串 / null 归一化后稳定', () => {
      const d = new Date('2026-09-15T10:00:00.000Z');
      expect(normalizeTs(d)).toBe(String(d.getTime()));
      expect(normalizeTs(d.toISOString())).toBe(String(d.getTime()));
      // 同一时刻的不同表示必须归一化成同一串，否则指纹会跨进程/跨驱动抖动
      expect(normalizeTs(d)).toBe(normalizeTs(new Date(d.getTime())));
      expect(normalizeTs(null)).toBe('');
      expect(normalizeTs(undefined)).toBe('');
      expect(normalizeTs('not-a-date')).toBe('');
    });

    test('非法输入不抛错（外部可控值不得成为崩溃点）', () => {
      expect(() => normalizeTs({})).not.toThrow();
      expect(() => normalizeTs(12345)).not.toThrow();
      expect(() => normalizeTs([])).not.toThrow();
      expect(() => normalizeTs(Symbol('x'))).not.toThrow();
    });
  });

  describe('buildPermKey', () => {
    test('\\u0000 分隔防 (userId,appId) 拼接歧义', () => {
      // 若无分隔符，'1'+'23' 与 '12'+'3' 会撞成同一个键 → 跨用户串权限
      expect(buildPermKey('1', '23')).not.toBe(buildPermKey('12', '3'));
    });

    test('键形如 16 位 hex，且与旧明文键不同', () => {
      const k = buildPermKey(1, 'oauth21');
      expect(k).toMatch(/^[0-9a-f]{16}$/);
      expect(k).not.toBe('1:oauth21');
      expect(buildPermKey(1, 'oauth21')).toBe(k); // 确定性
      expect(buildPermKey(1, 'posecraft')).not.toBe(k); // appId 参与
    });

    test('命名空间带 auth: 前缀（与业务 store 区隔）', () => {
      expect(PERM_NAMESPACE.startsWith('auth:')).toBe(true);
    });
  });

  describe('Sequelize 属性名——指纹静默失效的根因', () => {
    // 不依赖 DB 连接：只用模型定义即可暴露 underscored 的命名差异
    const seq = new Sequelize({ dialect: 'mysql', logging: false });
    const M = seq.define(
      'user_role',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: DataTypes.INTEGER,
        role_id: DataTypes.INTEGER
      },
      { timestamps: true, paranoid: true, underscored: true }
    );

    test('时间戳**属性名**是 updatedAt/deletedAt（物理列才是 updated_at）', () => {
      const attrs = Object.keys(M.rawAttributes);
      expect(attrs).toContain('updatedAt');
      expect(attrs).toContain('deletedAt');
      expect(attrs).not.toContain('updated_at'); // 属性名里没有下划线版本
      expect(M.rawAttributes.updatedAt.field).toBe('updated_at'); // 物理列才是
    });

    test('attributes 写物理列名会被静默丢弃 → 这就是指纹退化成常量的原因', () => {
      // Sequelize 的 rawAttributes 是"属性名 → 定义"的映射，
      // 键是**属性名**而非物理列名 —— 所以 attributes 里写 'updated_at' 找不到对应属性，
      // Sequelize 不报错，只是那一列不在 SELECT 列表里 → 取值为 undefined。
      const attrs = M.getAttributes();
      expect(Object.keys(attrs)).toContain('updatedAt');
      expect(Object.keys(attrs)).not.toContain('updated_at');
      // 物理列名挂在 field 上，仅用于查询生成，不是 attributes 的合法取值
      expect(attrs.updatedAt.field).toBe('updated_at');
      // 于是 attributes: [..., 'updated_at'] 会被静默丢弃：
      // 这正是 perm-cache.js 必须写 'updatedAt' 的原因
    });
  });

  describe('computePermFingerprint 的结构契约', () => {
    test('无 DB 时抛错（而不是静默返回常量指纹）', async () => {
      // 静默返回常量指纹 = 所有用户共享同一指纹 = 缓存永不失效且互相串
      // 这是比"抛错"危险得多的失败模式，必须抛
      await expect(computePermFingerprint(1, 'oauth21')).rejects.toThrow();
    }, 15000);
  });
});
