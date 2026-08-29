/**
 * 协议版本快照 composable
 *
 * 用途：用户注册/勾选协议时记录"用户同意的协议版本号 + 时间戳"。
 * 后端写入用户档案（user_agreement_snapshot 表），用于：
 * 1. 法律合规：证明用户某时间点同意了哪版协议
 * 2. 协议版本升级：管理员把协议从 v1.0 → v2.0，下次用户登录时检测快照
 *    不匹配 → 强制重新弹窗让用户重新确认（避免用户从未确认新协议）
 *
 * 协议版本来源：agreementConfig.ts（PRIVACY_VERSION / SERVICE_EFFECTIVE_DATE）
 *
 * @author yijiu2025
 * @since 2026-08-29
 */
import { computed, type ComputedRef } from 'vue';
import { agreementConfig } from '@/components/common/agreements/agreementConfig';

export interface AgreementVersionSnapshot {
  serviceVersion: string;   // 服务协议版本（当前用生效日期标识）
  privacyVersion: string;   // 隐私政策版本号
  acceptedAt: number;        // 时间戳
}

export interface UseAgreementVersionReturn {
  current: ComputedRef<AgreementVersionSnapshot>;
  /** 用户同意时调用，返回快照（发给后端持久化） */
  capture: () => AgreementVersionSnapshot;
}

/**
 * 协议版本 composable
 * 当前版本由 agreementConfig 编译期定值
 */
export function useAgreementVersion(): UseAgreementVersionReturn {
  const current = computed<AgreementVersionSnapshot>(() => ({
    serviceVersion: agreementConfig.SERVICE_EFFECTIVE_DATE,
    privacyVersion: agreementConfig.PRIVACY_VERSION,
    acceptedAt: Date.now()
  }));

  return {
    current,
    capture: () => ({
      serviceVersion: agreementConfig.SERVICE_EFFECTIVE_DATE,
      privacyVersion: agreementConfig.PRIVACY_VERSION,
      acceptedAt: Date.now()
    })
  };
}

/** 顶层函数：接受 composable 返回值或 snapshot，取当前快照并打 acceptedAt */
export const captureAgreementVersion = (
  source?: UseAgreementVersionReturn | AgreementVersionSnapshot
): AgreementVersionSnapshot => {
  // source 是 composable 返回值 → 读 .current.value；source 是 snapshot → 直接用
  if (source && 'current' in source && source.current) {
    return { ...source.current.value, acceptedAt: Date.now() };
  }
  if (source && 'serviceVersion' in source) {
    return { ...source, acceptedAt: Date.now() };
  }
  return {
    serviceVersion: agreementConfig.SERVICE_EFFECTIVE_DATE,
    privacyVersion: agreementConfig.PRIVACY_VERSION,
    acceptedAt: Date.now()
  };
};
