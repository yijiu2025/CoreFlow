import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ConsentPanel from '@/components/auth/ConsentPanel.vue';

// 创建简单的国际化
const i18n = createI18n({
  legacy: false,
  locale: 'zh_cn',
  messages: {
    zh_cn: {
      login: {
        third_party: '第三方应用',
        requesting_auth: '正在请求授权',
        requesting_permissions: '请求的权限',
        deny: '拒绝',
        approve: '批准'
      }
    }
  }
});

describe('ConsentPanel.vue', () => {
  const mockConsentState = {
    consentKey: 'test-consent-123',
    client_name: '测试应用',
    scopeDetails: [
      {
        id: 'read_profile',
        name: '读取个人信息',
        desc: '读取您的个人资料信息',
        required: true
      },
      {
        id: 'read_contacts',
        name: '读取联系人',
        desc: '读取您的联系人列表',
        required: false
      }
    ]
  };

  it('正确渲染授权确认面板', () => {
    const wrapper = mount(ConsentPanel, {
      props: {
        consentState: mockConsentState,
        submitting: false,
        onDeny: vi.fn(),
        onApprove: vi.fn()
      },
      global: {
        plugins: [i18n]
      }
    });

    expect(wrapper.find('.bg-slate-50').exists()).toBe(true);
    expect(wrapper.text()).toContain('测试应用');
    expect(wrapper.text()).toContain('正在请求授权');
    expect(wrapper.text()).toContain('请求的权限');
    expect(wrapper.text()).toContain('读取个人信息');
    expect(wrapper.text()).toContain('读取联系人');
    expect(wrapper.text()).toContain('（必需）');
  });

  it('点击拒绝按钮触发回调', async () => {
    const mockDeny = vi.fn();
    const wrapper = mount(ConsentPanel, {
      props: {
        consentState: mockConsentState,
        submitting: false,
        onDeny: mockDeny,
        onApprove: vi.fn()
      },
      global: {
        plugins: [i18n]
      }
    });

    await wrapper.find('button:first-child').trigger('click');
    expect(mockDeny).toHaveBeenCalled();
  });

  it('点击批准按钮触发回调', async () => {
    const mockApprove = vi.fn();
    const wrapper = mount(ConsentPanel, {
      props: {
        consentState: mockConsentState,
        submitting: false,
        onDeny: vi.fn(),
        onApprove: mockApprove
      },
      global: {
        plugins: [i18n]
      }
    });

    await wrapper.find('button:last-child').trigger('click');
    expect(mockApprove).toHaveBeenCalled();
  });

  it('提交时禁用批准按钮', () => {
    const wrapper = mount(ConsentPanel, {
      props: {
        consentState: mockConsentState,
        submitting: true,
        onDeny: vi.fn(),
        onApprove: vi.fn()
      },
      global: {
        plugins: [i18n]
      }
    });

    const approveButton = wrapper.find('button:last-child');
    expect(approveButton.attributes('disabled')).toBeDefined();
    expect(approveButton.find('.animate-spin').exists()).toBe(true);
  });

  it('不传递 consentState 时显示默认文本', () => {
    const wrapper = mount(ConsentPanel, {
      props: {
        consentState: undefined,
        submitting: false,
        onDeny: vi.fn(),
        onApprove: vi.fn()
      },
      global: {
        plugins: [i18n]
      }
    });

    expect(wrapper.text()).toContain('第三方应用');
    expect(wrapper.text()).toContain('正在请求授权');
    expect(wrapper.findAll('li').length).toBe(0);
  });

  it('不传递 scopeDetails 时正确处理', () => {
    const wrapper = mount(ConsentPanel, {
      props: {
        consentState: {
          consentKey: 'test-consent-123',
          client_name: '测试应用'
        },
        submitting: false,
        onDeny: vi.fn(),
        onApprove: vi.fn()
      },
      global: {
        plugins: [i18n]
      }
    });

    expect(wrapper.text()).toContain('测试应用');
    expect(wrapper.findAll('li').length).toBe(0);
  });
});