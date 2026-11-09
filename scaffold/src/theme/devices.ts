/**
 * 设备词汇（宿主事实）
 *
 * 一条 = `id` / `label` / `urlKey`。数组序即优先级，末条为兜底设备。
 * 🔴 本文件不 import 任何主题库的东西 —— 词汇是宿主事实，机制在 skinsuite。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { DeviceVocab } from 'skinsuite';

export const DEVICES: DeviceVocab[] = [
  { id: 'mobile', label: '手机端', urlKey: 'mobile' },
  { id: 'standard', label: '桌面端', urlKey: 'std' }
];
