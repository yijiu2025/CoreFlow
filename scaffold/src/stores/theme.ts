/**
 * 主题状态 store（**宿主壳**：Pinia 包装 + 设备词汇注入）
 *
 * 状态机本体在 `skinsuite/vue` 的 `createThemeState`：明暗三态、系统偏好监听、
 * 持久化（`mauth:mode` / `mauth:theme`）、URL 参数意图。
 *
 * === 目录与 oauth21 同构 ===
 *   `src/theme/theme.config.ts`                       主题域清单（调试面板档位）
 *   `src/theme/themes/pearl/<设备>/<页面>/colors/<配色>/`  主题包 × 设备 × 页面 × 配色
 *   `src/theme/views/<page>.ts`                      页面域声明（defineThemePage）
 *   `src/views/device/devices.ts`                    设备词汇（宿主事实，不 import 主题库）
 *
 * 🔴 console 只交付**一套设计**（珍珠玻璃），所以壳层用 `<ThemeScope page="console">`
 *    只取 token、不渲染版式组件；要「同一壳换一套 DOM」时新建主题包并在包定义里声明
 *    `views.console`，不要在 AppShell 里写 `if (pkg === …)`。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { defineStore } from 'pinia';
import { createThemeState } from 'skinsuite/vue';
import { DEVICES } from '@/views/device/devices';
// 🔴 副作用 import：装配色注册表 + 清单单例。漏了它 = 主题机制全程走空兜底
//    （页面能渲染、只是没有任何配色），dev 下会有一条 console.warn 提示。
import 'virtual:theme';

export const useThemeStore = defineStore('theme', () => createThemeState({ devices: DEVICES }));
