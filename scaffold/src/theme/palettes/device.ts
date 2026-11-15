/**
 * 设备尺度微调（**不含颜色**）
 *
 * 手机端不是"另一套配色"，只有尺度不同：卡片圆角收紧一档 —— 16px 圆角在 1400px 宽的
 * 桌面上显得柔和，在 390px 宽的手机上会吃掉本来就不多的横向空间，列表看着"胖"。
 *
 * 🔴 只放「与明暗无关、只与设备有关」的值；颜色一律由 `palettes/<包>-<明暗>.ts` 决定。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 珍珠玻璃 / 极光：手机端圆角收紧一档 */
export const MOBILE_TOKENS = {
  '--mauth-radius-md': '14px',
  '--mauth-radius-lg': '18px'
};

/** 微信：手机端更紧凑（白块在 390px 上不能像药丸） */
export const WECHAT_MOBILE_TOKENS = {
  '--mauth-radius-md': '10px',
  '--mauth-radius-lg': '10px'
};
