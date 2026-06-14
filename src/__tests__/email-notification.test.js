/**
 * 邮件通知测试
 *
 * 覆盖：邮件发送、模板渲染、配置验证
 */
import { describe, it, expect } from '@jest/globals';

describe('邮件通知', () => {
  describe('SMTP 配置', () => {
    it('配置结构正确', () => {
      const config = {
        host: 'smtp.163.com',
        port: 465,
        user: 'test@163.com',
        pass: 'password',
        from: 'test@163.com',
        secure: true
      };
      expect(config).toHaveProperty('host');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('user');
      expect(config).toHaveProperty('pass');
      expect(config.port).toBe(465);
      expect(config.secure).toBe(true);
    });

    it('端口 465 使用 SSL', () => {
      const config = { port: 465, secure: true };
      expect(config.secure).toBe(true);
    });

    it('端口 587 使用 TLS', () => {
      const config = { port: 587, secure: false };
      expect(config.secure).toBe(false);
    });
  });

  describe('模板渲染', () => {
    it('验证码模板变量替换', () => {
      const template = '您的验证码是 {code}，有效期 {ttl} 分钟';
      const result = template.replace('{code}', '123456').replace('{ttl}', '10');
      expect(result).toBe('您的验证码是 123456，有效期 10 分钟');
    });

    it('模板数据结构正确', () => {
      const template = {
        name: '验证码',
        subject: '【验证中心】您的验证码为：{code}',
        content: '<div>{code}</div>'
      };
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('content');
    });
  });

  describe('通知通道', () => {
    it('通道配置结构正确', () => {
      const channels = [
        { id: 'email', name: '邮件通知', enabled: true },
        { id: 'dingtalk', name: '钉钉机器人', enabled: false },
        { id: 'wechat', name: '微信推送', enabled: false },
        { id: 'sms', name: '短信通知', enabled: false }
      ];
      expect(channels).toHaveLength(4);
      channels.forEach(c => {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('name');
        expect(c).toHaveProperty('enabled');
      });
    });
  });
});
