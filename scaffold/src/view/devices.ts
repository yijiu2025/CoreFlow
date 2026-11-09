/**
 * 设备词汇（宿主事实）—— 单一来源
 *
 * 与 oauth21 的 `src/view/devices.ts` 同位置、同职责：有哪些设备、怎么称呼、URL 键。
 * 数组序 = 优先级，**末条 = 兜底设备**。
 *
 * 🔴 本文件不 import 任何主题库的东西 —— 词汇是宿主事实，机制在 skinsuite。
 *    词汇经 `createThemeState({ devices })` 注入主题 store，判定由
 *    `useRenderDevice` 负责（库零判定）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { DeviceVocab } from 'skinsuite';

export const DEVICES: DeviceVocab[] = [
  { id: 'mobile', label: '手机端', urlKey: 'mobile' },
  { id: 'standard', label: '桌面端', urlKey: 'std' }
];
