/**
 * 协议统一配置
 * 集中维护运营主体信息、生效日期等可变字段，避免散落在多个协议文件里。
 *
 * ⚠️ TODO[兑位-上线前必填]
 * 上线前必须把所有占位符（【】/「如 dpo@yourdomain.com」）改成真实值！
 * 网信办/工信部检查会逐项核对处理者身份信息、保存期限、响应时限、SDK 清单等，
 * 留空或写占位会被认定为"未公开收集使用规则"，罚款/下架风险。
 *
 * 必须填的项（按优先级）：
 * 1. OPERATOR - 运营主体全称（落款处显示，也是法律主体名）
 * 2. CONTACT_ADDRESS - 注册地址（隐私政策"我们是谁"与"联系我们"使用）
 * 3. CREDIT_CODE - 统一社会信用代码（必填，工信部备案要求）
 * 4. DPO_EMAIL - 个人信息保护负责人邮箱（个保法要求必填）
 * 5. CONTACT_PHONE - 客服电话（工信部备案要求）
 * 6. SERVICE_EFFECTIVE_DATE/PRIVACY_EFFECTIVE_DATE/PRIVACY_UPDATE_DATE - 生效/更新日期
 *
 * 检查清单：
 *   □ OPERATOR 不是【】   □ CONTACT_ADDRESS 不是空字符串
 *   □ CREDIT_CODE 不是【请填写】   □ DPO_EMAIL 是企业域名邮箱（不是 qq/163/gmail）
 *   □ CONTACT_PHONE 不是【】   □ PRIVACY_UPDATE_DATE 不早于当前日期
 *   □ 通知template里占位的TODO已经替换（搜【可知，搜「如 dpo@」）
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
