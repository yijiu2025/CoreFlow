/**
 * OAuth 客户端数据访问层
 *
 * 提供客户端的增删查操作，替代原内存 Map 存储。
 * 底层通过 Sequelize 模型访问 oauth_clients 表。
 */
import bcrypt from 'bcryptjs';
import sequelize from '../../db/index.js';

/** 获取 OauthClient 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthClient;

const ClientDao = {
  /**
   * 根据客户端 ID 查找客户端
   * @param {string} clientId 客户端唯一标识
   * @returns {Promise<object|null>} 客户端数据或 null
   */
  async findById(clientId) {
    const model = getModel();
    const client = await model.findByPk(clientId);
    return client ? client.toJSON() : null;
  },

  /**
   * 创建新客户端
   * @param {object} params 客户端参数
   * @param {string} params.client_name 客户端名称
   * @param {string[]} [params.redirect_uris] 回调地址列表
   * @param {string[]} [params.grant_types] 授权类型列表
   * @param {string} [params.scope] 权限范围
   * @param {string} [params.application_type] 应用类型
   * @returns {Promise<object>} 创建的客户端数据 (首次创建时，client_secret 为明文返回以便展示)
   */
  async create({ client_name, redirect_uris, grant_types, scope, application_type }) {
    const { v4: uuidv4 } = await import('uuid');
    const crypto = await import('node:crypto');

    const client_id = `client-${uuidv4().slice(0, 8)}`;
    // 生成原始明文 client_secret
    const rawSecret = application_type === 'service'
      ? crypto.randomBytes(32).toString('base64url')
      : null;

    // 对 client_secret 进行安全哈希存储 (bcrypt)
    const hashedSecret = rawSecret ? bcrypt.hashSync(rawSecret, 10) : null;

    const model = getModel();
    const client = await model.create({
      client_id,
      client_name,
      client_secret: hashedSecret,
      redirect_uris: redirect_uris ?? [],
      grant_types: grant_types ?? ['authorization_code'],
      response_types: ['code'],
      scope: scope ?? 'openid profile',
      token_endpoint_auth_method: rawSecret ? 'client_secret_basic' : 'none',
      application_type: application_type ?? 'web'
    });

    const clientData = client.toJSON();
    // 首次创建时返回明文秘钥，以便前端/调用方记录
    if (rawSecret) {
      clientData.client_secret = rawSecret;
    }
    return clientData;
  },

  /**
   * 列出所有客户端（不含 secret）
   * @returns {Promise<object[]>} 客户端列表
   */
  async list() {
    const model = getModel();
    const clients = await model.findAll();
    return clients.map((c) => {
      const { client_secret, ...rest } = c.toJSON();
      return rest;
    });
  }
};

export default ClientDao;
