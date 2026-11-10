/**
 * 设备词汇（宿主事实）—— 单一来源
 *
 * 职责：有哪些设备、怎么称呼、URL 键。数组序 = 优先级，**末条 = 兜底设备**。
 *
 * 📁 位置说明：本文件原在 `src/view/`（与 `views/` 只差一个字母，极易混淆），
 *    2026-11-10 起并入 `src/views/device/` —— 页面按业务域分目录，**非页面的视图层
 *    基础设施**（设备词汇、视口判定）统一收在这一个目录里。oauth21 仍用 `src/view/`，
 *    两个前端目录形态不同，跨仓对照时按职责找、不要按路径找。
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
