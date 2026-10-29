/**
 * 用户资料接口安全契约：头像只能经专用上传流程更新。
 */
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const routes = [];
const updateProfile = jest.fn(async () => ({ id: 42, username: 'updated' }));

jest.unstable_mockModule('../api/guard.js', () => ({
  registerGroupMetadata: jest.fn(),
  registerSecureRoute: (_fastify, route) => routes.push(route)
}));

jest.unstable_mockModule('../app/user/dao/user.js', () => ({
  default: { updateProfile }
}));

const { default: registerUserRoutes } = await import('../api/user/v1/user.js');

beforeAll(async () => {
  await registerUserRoutes({});
});

describe('PUT /user/v1/update', () => {
  beforeEach(() => {
    updateProfile.mockClear();
  });

  it('忽略客户端直接提交的 avatar，仅透传资料白名单字段', async () => {
    const route = routes.find(item => item.name === 'updateUserProfile');
    const reply = { result: { success: jest.fn() } };

    await route.handler(
      {
        state: { user: { userId: 42 } },
        body: { username: 'updated', avatar: '/uploads/../../outside.txt', gender: 2 }
      },
      reply
    );

    expect(updateProfile).toHaveBeenCalledTimes(1);
    const [userId, data] = updateProfile.mock.calls[0];
    expect(userId).toBe(42);
    expect(data).toMatchObject({ username: 'updated', gender: 2 });
    expect(data).not.toHaveProperty('avatar');
  });
});
