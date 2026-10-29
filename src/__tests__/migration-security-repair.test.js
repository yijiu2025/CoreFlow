import { describe, expect, it, jest } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sequelize } from 'sequelize';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USER_MIGRATIONS = path.join(ROOT, 'migrations/user');

function createGuardHarness({
  configs = JSON.stringify({ firewall: { enabled: true }, user: { enabled: false } })
} = {}) {
  const tables = new Set(['guard_configs']);
  const data = new Map([
    [
      'guard_configs',
      [{ id: 1, configs, version: 7, created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-02') }]
    ]
  ]);
  let failNextInsert = false;

  const queryInterface = {
    sequelize: {
      query: jest.fn(async sql => {
        const showTables = /^SHOW TABLES$/.exec(sql);
        if (showTables) return [[...tables].map(name => ({ table: name })), []];

        const selectOld = /^SELECT id, configs, version, created_at, updated_at FROM (\w+) LIMIT 1$/.exec(sql);
        if (selectOld) return [(data.get(selectOld[1]) || []).map(row => ({ ...row })), []];

        if (sql === 'SELECT system_key FROM guard_configs') {
          return [(data.get('guard_configs') || []).map(row => ({ system_key: row.system_key })), []];
        }

        const rename = /^RENAME TABLE (\w+) TO (\w+)$/.exec(sql);
        if (rename) {
          if (!tables.has(rename[1]) || tables.has(rename[2])) throw new Error('invalid rename');
          tables.delete(rename[1]);
          tables.add(rename[2]);
          data.set(rename[2], data.get(rename[1]));
          data.delete(rename[1]);
          return [[], []];
        }

        const drop = /^DROP TABLE (\w+)$/.exec(sql);
        if (drop) {
          tables.delete(drop[1]);
          data.delete(drop[1]);
          return [[], []];
        }

        throw new Error(`未模拟的 SQL: ${sql}`);
      })
    },
    createTable: jest.fn(async name => {
      if (tables.has(name)) throw new Error('table exists');
      tables.add(name);
      data.set(name, []);
    }),
    addIndex: jest.fn(async () => {}),
    insert: jest.fn(async (_instance, table, row) => {
      if (failNextInsert) {
        failNextInsert = false;
        throw new Error('simulated insert interruption');
      }
      data.get(table).push({ ...row });
    }),
    failNextInsert() {
      failNextInsert = true;
    },
    tables,
    data
  };

  return queryInterface;
}

const migrationSequelize = {
  BIGINT: 'BIGINT',
  STRING: size => `STRING(${size})`,
  TEXT: size => `TEXT(${size || ''})`,
  INTEGER: 'INTEGER',
  DATE: 'DATE',
  literal: value => value
};

describe('guard 配置迁移的数据安全', () => {
  it('JSON 解析失败时必须拒绝迁移，且源表尚未重命名或删除', async () => {
    const queryInterface = createGuardHarness({ configs: '{broken' });
    const { up } = await import('../../migrations/guard/20260723000001-migrate-guard-configs-to-per-system.js');

    await expect(up({ queryInterface, Sequelize: migrationSequelize })).rejects.toThrow();
    expect(queryInterface.tables.has('guard_configs')).toBe(true);
    expect(queryInterface.tables.has('guard_configs_v1')).toBe(false);
    expect(queryInterface.sequelize.query.mock.calls.some(([sql]) => /^(RENAME|DROP) TABLE/.test(sql))).toBe(false);
  });

  it('插入中断后保留备份，重跑可续传且只在完成后清理备份', async () => {
    const queryInterface = createGuardHarness();
    const { up } = await import('../../migrations/guard/20260723000001-migrate-guard-configs-to-per-system.js');
    queryInterface.failNextInsert();

    await expect(up({ queryInterface, Sequelize: migrationSequelize })).rejects.toThrow(
      'simulated insert interruption'
    );
    expect(queryInterface.tables.has('guard_configs_v1')).toBe(true);

    await up({ queryInterface, Sequelize: migrationSequelize });

    expect(queryInterface.tables.has('guard_configs')).toBe(true);
    expect(queryInterface.tables.has('guard_configs_v1')).toBe(false);
    expect(
      queryInterface.data
        .get('guard_configs')
        .map(row => row.system_key)
        .sort()
    ).toEqual(['firewall', 'user']);
  });
});

describe('手机号迁移的顺序、失败传播与回滚安全', () => {
  it('在首次加密前提供加宽迁移，并在历史迁移后提供补偿迁移', () => {
    expect(existsSync(path.join(USER_MIGRATIONS, '20260712000001-widen-phone-before-encryption.js'))).toBe(true);
    expect(existsSync(path.join(USER_MIGRATIONS, '20261028000002-repair-phone-encryption.js'))).toBe(true);
  });

  it('任一手机号加密失败都必须让迁移失败，不得吞错后记录成功', async () => {
    const sequelize = new Sequelize('database', 'user', 'password', { dialect: 'mysql', logging: false });
    sequelize.query = jest.fn(async () => [[{ id: 1, phone: '13812345678' }], []]);
    const previousKey = process.env.PHONE_ENCRYPT_KEY;
    delete process.env.PHONE_ENCRYPT_KEY;

    try {
      const { up } = await import('../../migrations/user/20260713000001-encrypt-phone.js');
      await expect(up({ queryInterface: { sequelize }, Sequelize })).rejects.toThrow('PHONE_ENCRYPT_KEY');
    } finally {
      if (previousKey === undefined) delete process.env.PHONE_ENCRYPT_KEY;
      else process.env.PHONE_ENCRYPT_KEY = previousKey;
      await sequelize.close();
    }
  });

  it('已有 TEXT 列和索引时旧加宽迁移保持幂等，不重复拆建索引', async () => {
    const queryInterface = {
      sequelize: { query: jest.fn() },
      describeTable: jest.fn(async () => ({ phone: { type: 'TEXT' } })),
      showIndex: jest.fn(async () => [{ name: 'uk_phone_delete_version' }]),
      removeIndex: jest.fn(),
      changeColumn: jest.fn(),
      addIndex: jest.fn()
    };
    const { up } = await import('../../migrations/user/20261028000001-widen-phone-column.js');

    await up({ queryInterface, Sequelize: migrationSequelize });

    expect(queryInterface.removeIndex).not.toHaveBeenCalled();
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });

  it('密文仍存在时危险 down 必须在任何 DDL 之前拒绝缩列', async () => {
    const queryInterface = {
      sequelize: { query: jest.fn(async () => [[{ count: 1 }], []]) },
      removeIndex: jest.fn(),
      changeColumn: jest.fn(),
      addIndex: jest.fn()
    };
    const { down } = await import('../../migrations/user/20261028000001-widen-phone-column.js');

    await expect(down({ queryInterface, Sequelize: migrationSequelize })).rejects.toThrow(/不能回滚|拒绝|密文/);
    expect(queryInterface.removeIndex).not.toHaveBeenCalled();
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });

  it('迁移运行器继续按 basename 判重，补偿策略不依赖重跑已执行迁移', () => {
    const runner = readFileSync(path.join(ROOT, 'src/framework/db/migrate.js'), 'utf8');
    expect(runner).toContain("entry.name.replace('.js', '')");
    expect(runner).toContain('new SequelizeStorage');
  });
});
