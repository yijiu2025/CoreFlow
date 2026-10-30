/**
 * 数据库模型定义契约（真实模型文件驱动）
 *
 * 旧版本手写 `{ id, uid, username }` 之类的对象再断言它有这些键 —— 生产模型
 * 改列名、删索引、关掉软删除都照样全绿。
 *
 * 本版加载真实的 `defineXxx(sequelize, DataTypes)`，用一个只做记录的 sequelize 桩
 * 捕获**实际传给 Sequelize 的定义**，断言的是真正决定行为的约束：
 * - 软删除安全唯一索引（email/phone + delete_version，`_uk_` 必须 unique）
 * - 手机号密文列必须是 TEXT（明文 ≤20 字节，密文 100+）
 * - 会话表的查询索引（token / family_id / user+app+device）——删了就是全表扫
 * - 软删除钩子与手机号加解密钩子的挂载（丢一个就会写出明文手机号）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Sequelize, DataTypes } from 'sequelize';

import defineUser from '../models/user/User.js';
import defineSessionToken from '../models/session/SessionToken.js';
import defineKeyPair from '../models/key/KeyPair.js';

/**
 * 记录型 sequelize 桩：不连库，只保留 define 收到的参数与注册的钩子。
 * 模型文件用到的 API 只有 define / addHook / beforeValidate / afterFind。
 */
function createRecorder() {
  const defined = [];

  function define(name, attributes, options) {
    const record = { name, attributes, options, hooks: {} };
    const model = {
      name,
      addHook(kind, fn) {
        (record.hooks[kind] ||= []).push(fn);
      },
      beforeValidate(fn) {
        model.addHook('beforeValidate', fn);
      },
      afterFind(fn) {
        model.addHook('afterFind', fn);
      }
    };
    record.model = model;
    defined.push(record);
    return model;
  }

  return { define, defined };
}

const recorder = createRecorder();
const User = defineUser(recorder, DataTypes);
// 只关心它注册出来的定义（recorded），模型对象本身不需要引用
defineSessionToken(recorder, DataTypes);

const userDef = recorder.defined.find(d => d.name === 'User');
const sessionDef = recorder.defined.find(d => d.name === 'SessionToken');

/** 按索引名取定义 */
function indexByName(def, name) {
  return (def.options.indexes || []).find(i => i.name === name);
}

describe('User 模型', () => {
  it('表名与软删除配置', () => {
    expect(userDef.options.tableName).toBe('user_user');
    expect(userDef.options.paranoid).toBe(true);
    expect(userDef.options.timestamps).toBe(true);
  });

  it('email / phone 唯一性靠联合索引，不用字段级 unique（软删除会让 NULL 穿透）', () => {
    expect(userDef.attributes.email.unique).toBeUndefined();
    expect(userDef.attributes.phone.unique).toBeUndefined();

    const emailIdx = indexByName(userDef, 'uk_email_delete_version');
    expect(emailIdx).toMatchObject({ unique: true, fields: ['email', 'delete_version'] });

    const phoneIdx = indexByName(userDef, 'uk_phone_delete_version');
    expect(phoneIdx).toMatchObject({ unique: true, fields: ['phone', 'delete_version'] });
  });

  it('手机号列必须是 TEXT（存的是密文不是明文）', () => {
    expect(userDef.attributes.phone.type.key).toBe('TEXT');
  });

  it('delete_version 非空且默认 0（唯一索引的参与列不能为 NULL）', () => {
    expect(userDef.attributes.delete_version.allowNull).toBe(false);
    expect(userDef.attributes.delete_version.defaultValue).toBe(0);
  });

  it('软删除钩子已挂载：禁止硬删 / 禁止手动改 delete_version', () => {
    expect(userDef.hooks.beforeDestroy?.length).toBeGreaterThan(0);
    expect(userDef.hooks.beforeRestore?.length).toBeGreaterThan(0);
    expect(userDef.hooks.beforeUpdate?.length).toBeGreaterThan(0);
    expect(userDef.hooks.beforeBulkDestroy?.length).toBeGreaterThan(0);
  });

  it('手机号加解密钩子已挂载', () => {
    expect(userDef.hooks.beforeValidate?.length).toBeGreaterThan(0);
    expect(userDef.hooks.afterFind?.length).toBeGreaterThan(0);
  });

  it('模型上有供迁移脚本调用的静态加解密方法', () => {
    expect(typeof User.encryptPhoneStatic).toBe('function');
    expect(typeof User.decryptPhoneStatic).toBe('function');
  });
});

describe('SessionToken 模型', () => {
  it('表名 + 时间戳，且不做 paranoid（吊销走 revoked 列）', () => {
    expect(sessionDef.options.tableName).toBe('session_tokens');
    expect(sessionDef.options.timestamps).toBe(true);
    expect(sessionDef.options.paranoid).toBeUndefined();
  });

  it('关键查询索引齐全（删任一条都会退化成全表扫）', () => {
    expect(indexByName(sessionDef, 'idx_session_token_identifier')).toMatchObject({ fields: ['token'] });
    expect(indexByName(sessionDef, 'idx_session_token_family')).toMatchObject({ fields: ['family_id'] });
    expect(indexByName(sessionDef, 'idx_user_app_device')).toMatchObject({
      fields: ['user_id', 'app_id', 'device_id']
    });
  });

  it('revoked / remember_me 默认值决定"新会话默认有效且短期"', () => {
    expect(sessionDef.attributes.revoked.defaultValue).toBe(false);
    expect(sessionDef.attributes.remember_me.defaultValue).toBe(false);
    expect(sessionDef.attributes.remember_me.allowNull).toBe(false);
  });

  it('token 存的是哈希，列宽足够（sha256 hex = 64）', () => {
    expect(sessionDef.attributes.token.allowNull).toBe(false);
    const { type } = sessionDef.attributes.token;
    expect(type.options?.length ?? Number(type.options)).toBeGreaterThanOrEqual(64);
  });
});

describe('KeyPair 模型（真实 Sequelize init）', () => {
  let sequelize;

  beforeAll(() => {
    // 只构造实例，不发起连接：Sequelize 的连接池是懒的
    sequelize = new Sequelize({
      dialect: 'mysql',
      host: '127.0.0.1',
      username: 'u',
      password: 'p',
      database: 'd',
      logging: false
    });
  });

  afterAll(() => {
    sequelize?.close();
  });

  it('表名、下划线命名与 name 唯一索引', () => {
    const KeyPair = defineKeyPair(sequelize, DataTypes);
    expect(KeyPair.getTableName()).toBe('oauth_key_pairs');
    expect(KeyPair.options.underscored).toBe(true);
    expect(KeyPair.options.indexes).toEqual([expect.objectContaining({ unique: true, fields: ['name'] })]);
  });

  it('私钥/公钥列是 TEXT，且都不可为空', () => {
    const KeyPair = defineKeyPair(sequelize, DataTypes);
    expect(KeyPair.rawAttributes.private_key.type.key).toBe('TEXT');
    expect(KeyPair.rawAttributes.private_key.allowNull).toBe(false);
    expect(KeyPair.rawAttributes.public_key.type.key).toBe('TEXT');
    expect(KeyPair.rawAttributes.public_key.allowNull).toBe(false);
  });
});
