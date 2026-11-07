/**
 * 通知数据访问层
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import Logger from '../../../framework/support/log/index.js';
import { encryptSecret, decryptSecret, isMasked } from '../../../framework/security/crypto/symmetric.js';

/** 默认通道配置 */
const DEFAULT_CHANNELS = [
  { id: 'email', name: '邮件通知', enabled: true },
  { id: 'dingtalk', name: '钉钉机器人', enabled: false },
  { id: 'wechat', name: '微信推送', enabled: false },
  { id: 'sms', name: '短信通知', enabled: false }
];

/** 默认邮件模板 */
const DEFAULT_TEMPLATES = {
  verification_code: {
    name: '验证码',
    subject: '【验证中心】您的验证码为：{code}',
    content: `<div style="padding:20px;background:#f5f5f5;font-family:sans-serif;">
  <div style="background:#fff;padding:40px;border-radius:12px;max-width:500px;margin:0 auto;">
    <h2 style="color:#4A90E2;text-align:center;">验证码校验</h2>
    <p style="color:#666;font-size:16px;">您正在执行敏感操作，请使用以下验证码完成身份验证：</p>
    <div style="background:#F8FBFF;border:1px solid #E1EDFF;padding:25px;text-align:center;font-size:36px;font-weight:bold;color:#007AFF;letter-spacing:8px;margin:30px 0;border-radius:8px;">
      {code}
    </div>
    <p style="color:#999;font-size:13px;border-top:1px solid #eee;padding-top:20px;">
      * 该验证码有效期为 {ttl} 分钟，请勿泄露给他人。<br>
      * 如果这不是您本人发起的请求，请忽略此邮件。
    </p>
  </div>
</div>`
  },
  welcome: {
    name: '欢迎邮件',
    subject: '欢迎注册 {appName}',
    content: `<div style="padding:20px;font-family:sans-serif;">
  <div style="background:#fff;padding:40px;border-radius:12px;max-width:500px;margin:0 auto;">
    <h2 style="color:#4A90E2;">欢迎，{username}！</h2>
    <p style="color:#666;">您的账号已成功注册，开始使用吧。</p>
  </div>
</div>`
  }
  // 🔴 已移除 password_reset（"新密码为：{newPassword}"）默认模板：
  // 本仓的重置流程是验证码/链接模式（前端带 RSA 密文调 reset 接口），
  // **从不**通过邮件下发明文新密码 —— 留着这个模板就是给未来调用方
  // 埋"把明文密码发进邮箱"的坑。真要实现类似能力，应发重置链接而非密码本体。
};

class NoticeDao {
  /**
   * 获取通知配置（凭据字段为**明文**，仅供本进程发信/校验使用）
   *
   * 🔴 任何 HTTP 出参都必须先掩码 —— 路由层已把 `pass` 替换为 `SMTP_PASS_MASK`
   * （见 `api/notice/v1/config.js`）。本函数不自己做掩码，是因为保存端要靠
   * "前端回传的就是那个固定掩码"来判断"用户没改密码"，两处必须同一口径。
   *
   * @param {string} type 'email' | 'dingtalk' | 'wechat' | 'sms'
   * @returns {Promise<object>}
   */
  async getConfig(type) {
    const NoticeConfig = getModel('NoticeConfig');
    if (!NoticeConfig) return {};

    if (type === 'email') {
      // 密文入库、明文入内存：decryptSecret 对历史明文/解密失败原样返回，平滑兼容存量数据
      const rawPass = await NoticeConfig.getVal('smtp_password', '');
      const pass = rawPass ? decryptSecret(rawPass) : '';
      return {
        host: await NoticeConfig.getVal('smtp_server', 'smtp.163.com'),
        port: parseInt(await NoticeConfig.getVal('smtp_port', '465')),
        user: await NoticeConfig.getVal('smtp_user', ''),
        pass,
        from: await NoticeConfig.getVal('smtp_from', ''),
        secure: (await NoticeConfig.getVal('smtp_use_ssl', 'true')) === 'true'
      };
    }
    return {};
  }

  /**
   * 保存通知配置
   * @param {string} type 通道类型
   * @param {object} config 配置对象
   * @returns {Promise<boolean>}
   */
  async saveConfig(type, config) {
    const NoticeConfig = getModel('NoticeConfig');
    if (!NoticeConfig) throw new Error('NoticeConfig model not found');

    Logger.info(`[Notice:Dao] 更新 ${type} 配置`);

    if (type === 'email') {
      const mappings = {
        host: 'smtp_server',
        port: 'smtp_port',
        user: 'smtp_user',
        pass: 'smtp_password',
        from: 'smtp_from',
        secure: 'smtp_use_ssl'
      };

      for (const [prop, key] of Object.entries(mappings)) {
        if (config[prop] !== undefined) {
          // 掩码回传（含 `*`）= "沿用库里旧值"：绝不能把掩码本身写进库
          //（否则真凭据被自己的掩码覆盖，永久不可恢复，且发信会 535 认证失败）
          if (prop === 'pass' && isMasked(config[prop])) continue;

          let value = config[prop].toString();
          // 🔴 SMTP 密码不明文落库：加密失败就**拒绝保存**并显式报错，
          // 不做"静默存明文"的降级（那正是本次要修的问题）。
          if (prop === 'pass' && value) {
            try {
              value = encryptSecret(value);
            } catch (err) {
              throw new Error(`NOTICE_CONFIG_FAILED:${err.message}`, { cause: err });
            }
          }
          await NoticeConfig.setVal(key, value, '', 'email');
        }
      }
    }
    return true;
  }

  /**
   * 获取所有可用的通知通道（从 DB 读取，支持动态启用/禁用）
   * @returns {Promise<Array<{id: string, name: string, enabled: boolean}>>}
   */
  async getAvailableChannels() {
    const NoticeConfig = getModel('NoticeConfig');
    if (!NoticeConfig) return DEFAULT_CHANNELS;

    // 尝试从 DB 读取通道配置
    const channelsConfig = await NoticeConfig.getVal('notification_channels', null);
    if (channelsConfig) {
      try {
        return JSON.parse(channelsConfig);
      } catch {
        // 配置损坏时使用默认值
      }
    }
    return DEFAULT_CHANNELS;
  }

  /**
   * 更新通道配置
   * @param {Array} channels 通道列表
   */
  async updateChannels(channels) {
    const NoticeConfig = getModel('NoticeConfig');
    if (!NoticeConfig) throw new Error('NoticeConfig model not found');
    await NoticeConfig.setVal('notification_channels', JSON.stringify(channels), '通知通道配置', 'system');
  }

  /**
   * 获取邮件模板
   * @param {string} templateId 模板 ID
   * @returns {Promise<object|null>}
   */
  async getTemplate(templateId) {
    const NoticeConfig = getModel('NoticeConfig');
    if (!NoticeConfig) return DEFAULT_TEMPLATES[templateId] || null;

    const saved = await NoticeConfig.getVal(`template_${templateId}`, null);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* 使用默认 */
      }
    }
    return DEFAULT_TEMPLATES[templateId] || null;
  }

  /**
   * 保存邮件模板
   * @param {string} templateId 模板 ID
   * @param {object} template 模板对象 { name, subject, content }
   */
  async saveTemplate(templateId, template) {
    const NoticeConfig = getModel('NoticeConfig');
    if (!NoticeConfig) throw new Error('NoticeConfig model not found');
    await NoticeConfig.setVal(
      `template_${templateId}`,
      JSON.stringify(template),
      `邮件模板: ${template.name}`,
      'template'
    );
  }

  /**
   * 获取所有模板
   * @returns {Promise<object>}
   */
  async getAllTemplates() {
    const NoticeConfig = getModel('NoticeConfig');
    if (!NoticeConfig) return DEFAULT_TEMPLATES;

    const result = { ...DEFAULT_TEMPLATES };
    const configs = await NoticeConfig.findAll({
      where: { category: 'template' }
    });

    for (const config of configs) {
      try {
        const templateId = config.key.replace('template_', '');
        result[templateId] = JSON.parse(config.value);
      } catch {
        /* 跳过损坏的模板 */
      }
    }

    return result;
  }
}

const noticeDao = new NoticeDao();

export default noticeDao;
