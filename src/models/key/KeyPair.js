/**
 * 密钥对模型
 *
 * 存储 RSA 密钥对，支持按名称查询和轮转。
 * 私钥以 PEM 格式存储（PKCS#8），公钥以 PEM（SPKI）+ JWK 双格式存储。
 * 通过 name 字段寻址，允许同一个签发者使用多个密钥对（kid 轮转）。
 *
 * @author yijiu
 * @since 2026-08-14
 */

import { Model } from 'sequelize';

export default function (sequelize, DataTypes) {
  class KeyPair extends Model {
    static associate(models) {
      // 无关联
    }
  }

  KeyPair.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(64), allowNull: false, comment: '密钥对名称' },
      algorithm: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'RS256', comment: '签名算法' },
      private_key: { type: DataTypes.TEXT, allowNull: false, comment: '私钥 PEM' },
      public_key: { type: DataTypes.TEXT, allowNull: false, comment: '公钥 PEM' },
      jwk: { type: DataTypes.TEXT, allowNull: true, comment: 'JWK 公钥 JSON' },
      active: { type: DataTypes.BOOLEAN, defaultValue: true, comment: '是否启用' },
      remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' }
    },
    {
      sequelize,
      tableName: 'oauth_key_pairs',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['name'] }]
    }
  );

  return KeyPair;
}
