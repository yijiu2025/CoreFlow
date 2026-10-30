/**
 * 邮件通知服务（真实服务模块驱动）
 *
 * 旧版本只断言自己手写的 `{ host, port, secure }` 常量有某字段，生产代码
 * （framework/notice/services/email.js）改坏也全绿。
 *
 * 本版加载真实 EmailService，只把外部依赖（nodemailer / notice DAO）换成可控实现，
 * 断言真实行为：
 * - 非 SSL 端口必须 requireTLS（否则 SMTP 凭据明文上网）
 * - 证书校验必须开启（rejectUnauthorized）
 * - 配置不全时 send() 返回 false，不抛到调用方
 * - 配置变更后重建 transporter（否则改 SMTP 要重启进程）
 * - 模板占位符全量替换（同一变量出现多次）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** 可控的 SMTP 配置与模板 */
const state = {
  config: {
    host: 'smtp.example.com',
    port: 465,
    user: 'bot@example.com',
    pass: 'secret',
    from: 'no-reply@example.com',
    secure: true
  },
  template: null,
  sent: [],
  failSend: false,
  transportOptions: []
};

jest.unstable_mockModule('../app/notice/dao/notice.js', () => ({
  default: {
    getConfig: async () => state.config,
    getTemplate: async () => state.template
  }
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: options => {
      state.transportOptions.push(options);
      return {
        sendMail: async mail => {
          if (state.failSend) throw new Error('SMTP 连接失败');
          state.sent.push(mail);
          return { messageId: `mid-${state.sent.length}` };
        }
      };
    }
  }
}));

const { default: emailService } = await import('../framework/notice/services/email.js');

beforeEach(() => {
  state.sent.length = 0;
  state.transportOptions.length = 0;
  state.failSend = false;
  state.template = null;
  // 每次换 host 让配置哈希变化 → 强制重建 transporter，保证用例互不依赖
  state.config = {
    host: `smtp-${Math.random().toString(36).slice(2)}.example.com`,
    port: 465,
    user: 'bot@example.com',
    pass: 'secret',
    from: 'no-reply@example.com',
    secure: true
  };
});

describe('transporter 安全选项', () => {
  it('465（SSL）→ secure=true, requireTLS=false', async () => {
    await emailService.send('user@example.com', 's', '<p>h</p>', 0);
    const opts = state.transportOptions.at(-1);
    expect(opts.secure).toBe(true);
    expect(opts.requireTLS).toBe(false);
  });

  it('587（明文端口）→ 强制 STARTTLS', async () => {
    state.config = { ...state.config, port: 587, secure: false };
    await emailService.send('user@example.com', 's', '<p>h</p>', 0);
    const opts = state.transportOptions.at(-1);
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(true);
  });

  it('始终校验证书并设置连接/问候/socket 超时', async () => {
    await emailService.send('user@example.com', 's', '<p>h</p>', 0);
    const opts = state.transportOptions.at(-1);
    expect(opts.tls).toEqual({ rejectUnauthorized: true });
    expect(opts.connectionTimeout).toBeGreaterThan(0);
    expect(opts.greetingTimeout).toBeGreaterThan(0);
    expect(opts.socketTimeout).toBeGreaterThan(0);
  });

  it('配置变更后重建 transporter（无需重启进程）', async () => {
    await emailService.send('user@example.com', 's', '<p>h</p>', 0);
    const first = state.transportOptions.length;

    state.config = { ...state.config, host: 'smtp-new.example.com' };
    await emailService.send('user@example.com', 's', '<p>h</p>', 0);

    expect(state.transportOptions.length).toBe(first + 1);
    expect(state.transportOptions.at(-1).host).toBe('smtp-new.example.com');
  });
});

describe('发送失败的处理', () => {
  it('配置不完整时返回 false，不抛异常', async () => {
    state.config = { ...state.config, user: '' };
    await expect(emailService.send('user@example.com', 's', '<p>h</p>', 0)).resolves.toBe(false);
    expect(state.sent).toHaveLength(0);
  });

  it('SMTP 抛错时返回 false 并清空缓存（下次重连）', async () => {
    state.failSend = true;
    await expect(emailService.send('user@example.com', 's', '<p>h</p>', 0)).resolves.toBe(false);

    state.failSend = false;
    const before = state.transportOptions.length;
    await expect(emailService.send('user@example.com', 's', '<p>h</p>', 0)).resolves.toBe(true);
    // 缓存被清 → 重新创建 transporter
    expect(state.transportOptions.length).toBe(before + 1);
  });
});

describe('模板发送', () => {
  it('模板不存在时返回 false，不发信', async () => {
    state.template = null;
    await expect(emailService.sendWithTemplate('user@example.com', 'not_exist', {})).resolves.toBe(false);
    expect(state.sent).toHaveLength(0);
  });

  it('占位符全量替换（同一变量出现多次）', async () => {
    state.template = {
      subject: '验证码 {code}',
      content: '<p>{code}</p><p>再次提醒：{code}，{ttl} 分钟内有效</p>'
    };
    await emailService.sendWithTemplate('user@example.com', 'verification_code', { code: '123456', ttl: '10' });

    expect(state.sent).toHaveLength(1);
    const mail = state.sent[0];
    expect(mail.subject).toBe('验证码 123456');
    expect(mail.html).not.toContain('{code}');
    expect(mail.html).not.toContain('{ttl}');
    expect(mail.html.match(/123456/g)).toHaveLength(2);
    expect(mail.to).toBe('user@example.com');
    expect(mail.from).toBe(state.config.from);
  });
});

describe('异步队列状态', () => {
  it('初始为空闲', () => {
    expect(emailService.getQueueStatus()).toEqual({ pending: 0, processing: false });
  });
});
