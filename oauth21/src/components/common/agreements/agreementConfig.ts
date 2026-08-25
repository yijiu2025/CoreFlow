/**
 * 协议统一配置
 * 集中维护运营主体信息、生效日期等可变字段，避免散落在多个协议文件里。
 * 上线前把带【】或占位的字段改成真实值即可全项目同步。
 * 注意：网信办/工信部检查会逐项核对处理者身份信息、保存期限、响应时限、SDK 清单等，
 *       务必填写真实值，留空或写占位会被认定为"未公开收集使用规则"。
 */
export const agreementConfig = {
  /** 运营主体全称（落款处显示，也是法律主体名） */
  OPERATOR: '【平台运营主体】',
  /** 注册地址（隐私政策"我们是谁"与"联系我们"使用） */
  CONTACT_ADDRESS: '',
  /** 统一社会信用代码 */
  CREDIT_CODE: '【请填写】',
  /** 个人信息保护负责人（DPO）联系邮箱 */
  DPO_EMAIL: '【如 dpo@yourdomain.com】',
  /** 客服/联系邮箱 */
  CONTACT_EMAIL: '241849626@qq.com',
  /** 客服电话 */
  CONTACT_PHONE: '【请填写】',
  /** 服务协议生效日期（YYYY年M月D日） */
  SERVICE_EFFECTIVE_DATE: '2026年1月1日',
  /** 隐私政策发布及生效日期 */
  PRIVACY_EFFECTIVE_DATE: '2026年1月1日',
  /** 隐私政策更新日期 */
  PRIVACY_UPDATE_DATE: '2026年1月1日',
  /** 隐私政策版本号 */
  PRIVACY_VERSION: 'V1.0',
  /** 个人信息权利响应时限（工作日） */
  RESPONSE_DAYS: '15个工作日',
  /** 账号注销后信息删除时限 */
  DELETE_AFTER_DELETE_DAYS: '15日/30日',
  /** 日志信息保存期限 */
  LOG_RETENTION: '6个月',
  /** 交易与订单信息保存期限 */
  ORDER_RETENTION: '3年'
} as const;

export type AgreementType = 'service' | 'privacy';
