/**
 * 二维码登录 composable
 *
 * 统一封装"生成二维码 + 轮询扫码状态 + 确认后回调"流程，
 * 替代 StandardLogin/MiniLogin 两份重复实现。
 *
 * 流程：generate() → 调 authApi.generateQR 拿 qrKey + 生成二维码图片
 *       → startPolling 每 2s 查状态 → CONFIRMED 调 onSuccess(res)
 *       → EXPIRED/ERROR 标记过期
 *
 * 兼容 JWT（accessToken）与 Session（session_token）两种确认信号。
 * 组件卸载自动清理轮询定时器。
 *
 * @author yijiu2025
 * @since 2026-08-26
 */
import { ref, onUnmounted } from 'vue';
import QRCode from 'qrcode';
import { authApi } from '@/api/auth';

export type QrStatus = 'pending' | 'scanned' | 'confirmed' | 'expired';

export function useQrLogin(
  clientId: () => string,
  onSuccess: (res: any) => void,
  onExpired?: () => void
) {
  const qrKey = ref('');
  const qrDataUrl = ref('');
  const qrStatus = ref<QrStatus>('pending');
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function generate(onError?: (msg: string) => void) {
    try {
      // scope 不前端传（app 属性，后端从 client_id 查）；
      // H5 签名（timestamp/nonce/device_id/sign）由 request 拦截器自动注入
      const res: any = await authApi.generateQR({
        client_id: clientId()
      });
      qrKey.value = res.qrKey;
      qrStatus.value = 'pending';
      qrDataUrl.value = await QRCode.toDataURL(res.qrContent || res.qrKey, { width: 200, margin: 1 });
      startPolling();
    } catch {
      onError?.('二维码生成失败');
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!qrKey.value) return;
      try {
        const res: any = await authApi.checkQRStatus(qrKey.value);
        // 兼容 JWT（accessToken）与 Session（session_token）+ 状态字段
        if (res?.accessToken || res?.access_token || res?.session_token || res?.status === 'CONFIRMED') {
          qrStatus.value = 'confirmed';
          clearTimer();
          onSuccess(res);
        } else if (res?.status === 'EXPIRED' || res?.status === 'ERROR') {
          qrStatus.value = 'expired';
          clearTimer();
          onExpired?.();
        } else {
          qrStatus.value = (res?.status || 'PENDING').toLowerCase() as QrStatus;
        }
      } catch {
        // 单次轮询失败不中断后续轮询（网络抖动等）
      }
    }, 2000);
  }

  function clearTimer() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** 重置二维码状态（切回表单模式时调，停轮询 + 清数据） */
  function reset() {
    clearTimer();
    qrKey.value = '';
    qrDataUrl.value = '';
    qrStatus.value = 'pending';
  }

  onUnmounted(clearTimer);

  return { qrKey, qrDataUrl, qrStatus, generate, reset };
}
