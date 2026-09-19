/**
 * UserDao.registerUser 的角色写入契约
 *
 * 覆盖 0.2 修复：多角色分配从「循环单条 create（N 次往返）」改为
 * 「一次 bulkCreate（单条多值 INSERT）」。
 *
 * 【为什么必须真实加载被测模块】
 * 本文件 `await import('../app/user/dao/user.js')` 加载真身，只把 DB 层与
 * 加解密层换成替身。断言的是「真身实际发出的调用形态」（bulkCreate 一次 /
 * 逐条 create 零次），而不是把实现抄一遍再断言副本 —— 后者在实现改回
 * 循环 create 后依然会绿。
 *
 * 【为什么 mock 必须镜像真身的全部导出】
 * ESM 是链接期解析：真身 `framework/db/index.js` 同时被 `import sequelize`
 * （default）与 `import { getModel }`（named）使用，替身两个都要给，
 * 否则整套件会以 "does not provide an export named" 直接 failed to run。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/** 记录 UserRole 的两种写入方式，用于断言走的是哪一条路径 */
const bulkCreate = jest.fn(async () => []);
const roleCreate = jest.fn(async () => ({}));

const models = {
  User: { create: jest.fn(async () => ({ id: 42 })) },
  UserIdentity: { create: jest.fn(async () => ({})) },
  UserRole: { create: roleCreate, bulkCreate },
  Role: { findOne: jest.fn(async () => ({ id: 7 })) }
};

const mockSequelize = {
  transaction: async callback => callback({ __mockTx: true })
};

jest.unstable_mockModule('../framework/db/index.js', () => ({
  default: mockSequelize,
  sequelize: mockSequelize,
  getModel: name => models[name]
}));

jest.unstable_mockModule('../app/oauth21/crypto/encryption.js', () => ({
  decrypt: async () => 'Passw0rdOk'
}));

jest.unstable_mockModule('../app/admin/dao/iam.dao.js', () => ({
  default: {}
}));

const { default: userDao } = await import('../app/user/dao/user.js');

/** 构造一次注册请求（密码由 decrypt 替身固定返回，满足复杂度策略） */
const registerRequest = extra => ({
  body: { email: 'someone@example.com', password: 'encrypted-blob', kid: 'kid-1', ...extra }
});

describe('registerUser 角色写入路径', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('多角色：只走一次 bulkCreate，不再逐条 create', async () => {
    await userDao.registerUser(registerRequest({ role_ids: [1, 2, 3] }));

    expect(bulkCreate).toHaveBeenCalledTimes(1);
    expect(roleCreate).not.toHaveBeenCalled();

    const [rows, options] = bulkCreate.mock.calls[0];
    expect(rows).toEqual([
      { user_id: 42, role_id: 1, app_id: 'GLOBAL' },
      { user_id: 42, role_id: 2, app_id: 'GLOBAL' },
      { user_id: 42, role_id: 3, app_id: 'GLOBAL' }
    ]);
    // 必须与用户创建同事务，否则失败时会留下无角色的半成品用户
    expect(options.transaction).toBeDefined();
  });

  it('单角色：同样批量写入且只产生一行', async () => {
    await userDao.registerUser(registerRequest({ role_ids: [9] }));

    expect(bulkCreate).toHaveBeenCalledTimes(1);
    expect(bulkCreate.mock.calls[0][0]).toEqual([{ user_id: 42, role_id: 9, app_id: 'GLOBAL' }]);
    expect(roleCreate).not.toHaveBeenCalled();
  });

  it('未传角色：落到默认 guest 角色，仍只写一条（单条路径不受影响）', async () => {
    await userDao.registerUser(registerRequest());

    expect(models.Role.findOne).toHaveBeenCalledTimes(1);
    expect(roleCreate).toHaveBeenCalledTimes(1);
    expect(roleCreate.mock.calls[0][0]).toMatchObject({ user_id: 42, role_id: 7, app_id: 'GLOBAL' });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it('默认角色缺失：抛 REGISTER_FAILED，不产生任何角色行', async () => {
    models.Role.findOne.mockResolvedValueOnce(null);

    await expect(userDao.registerUser(registerRequest())).rejects.toThrow('默认角色未初始化');

    expect(roleCreate).not.toHaveBeenCalled();
    expect(bulkCreate).not.toHaveBeenCalled();
  });
});
