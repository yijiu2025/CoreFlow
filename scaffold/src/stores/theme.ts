/**
 * 主题状态 store（**宿主壳**：Pinia 包装 + 设备词汇注入）
 *
 * 状态机本体在 `skinsuite/vue` 的 `createThemeState`：明暗三态、系统偏好监听、
 * 持久化（`mauth:mode` / `mauth:theme`）、URL 参数意图。
 *
 * === 为什么本前端没有 `themes/` 目录 ===
 * skinsuite 的「主题包」解决的是一套前端**多套设计并存**（石墨 / 紧凑 / 珍珠…）的
 * 问题：包 = 版式 + 配色。console 只交付**一套设计**（珍珠玻璃），且不存在
 * 「同一页面按包换成另一套 DOM」的需求，因此不建 `themes/<包>/<设备>/<页面>/colors/`，
 * 配色直接落 `assets/styles/tokens.css`（`:root` 浅色 / `.dark` 深色）。
 *
 * 🔴 将来真要加第二套设计时，正确做法是：建 `src/theme/themes/<包>/…`、
 *    vite 挂 `themeAssets()`、页面容器改用 `<ThemeView>` —— 而不是在 CSS 里
 *    用 `[data-skin]` 手写分支（那会成为与主题机制并行的第二套真相）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { defineStore } from 'pinia';
import { createThemeState } from 'skinsuite/vue';
import { DEVICES } from '@/theme/devices';

export const useThemeStore = defineStore('theme', () => createThemeState({ devices: DEVICES }));
