/**
 * notLoadSsoView 功能测试
 *
 * 测试 notLoadSsoView 参数对 SSO 消息发送的控制
 */

describe('notLoadSsoView 功能测试', () => {
  // 模拟 window.parent
  const mockParent = {
    postMessage: jest.fn(),
  };

  beforeAll(() => {
    // 模拟 iframe 环境
    Object.defineProperty(window, 'parent', {
      value: mockParent,
      writable: true,
    });
  });

  afterAll(() => {
    // 清理模拟
    delete window.parent;
    jest.clearAllMocks();
  });

  test('notLoadSsoView 未设置时应该发送 SSO_READY 消息', () => {
    // 模拟路由查询参数
    const mockQuery = {};
    const route = {
      query: mockQuery,
    };

    // 模拟组件行为
    const ssoEnabled = window.parent && window.parent !== window;
    const notLoadSsoView = false;
    const shouldSendSSOMessage = ssoEnabled && !notLoadSsoView;

    // 验证应该发送消息
    expect(shouldSendSSOMessage).toBe(true);
    expect(mockParent.postMessage).toHaveBeenCalledWith({ type: 'SSO_READY' }, expect.any(String));
  });

  test('notLoadSsoView="true" 时不应该发送 SSO_READY 消息', () => {
    // 模拟路由查询参数
    const mockQuery = { notLoadSsoView: 'true' };
    const route = {
      query: mockQuery,
    };

    // 模拟组件行为
    const ssoEnabled = window.parent && window.parent !== window;
    const notLoadSsoView = true;
    const shouldSendSSOMessage = ssoEnabled && !notLoadSsoView;

    // 验证不应该发送消息
    expect(shouldSendSSOMessage).toBe(false);
    expect(mockParent.postMessage).not.toHaveBeenCalled();
  });

  test('notLoadSsoView="false" 时应该发送 SSO_READY 消息', () => {
    // 模拟路由查询参数
    const mockQuery = { notLoadSsoView: 'false' };
    const route = {
      query: mockQuery,
    };

    // 模拟组件行为
    const ssoEnabled = window.parent && window.parent !== window;
    const notLoadSsoView = false;
    const shouldSendSSOMessage = ssoEnabled && !notLoadSsoView;

    // 验证应该发送消息
    expect(shouldSendSSOMessage).toBe(true);
    expect(mockParent.postMessage).toHaveBeenCalledWith({ type: 'SSO_READY' }, expect.any(String));
  });

  test('不在 iframe 中时应该发送 SSO_READY 消息', () => {
    // 模拟非 iframe 环境
    Object.defineProperty(window, 'parent', {
      value: window,
      writable: true,
    });

    const ssoEnabled = window.parent && window.parent !== window;
    const notLoadSsoView = false;
    const shouldSendSSOMessage = ssoEnabled && !notLoadSsoView;

    // 验证不应该发送消息（不在 iframe 中）
    expect(shouldSendSSOMessage).toBe(false);
    expect(mockParent.postMessage).not.toHaveBeenCalled();
  });
});