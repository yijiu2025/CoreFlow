# 新前端接入主题库（skinsuite）完整指南

> ⚠️ **权威内容已迁入主题包**，本文是**薄壳入口**，避免两份漂移。
> 完整接入指南（每一步的 API 与代码）见主题包内文档：
>
> **`packages/theme-core/docs/onboarding.md`**
> （随 `skinsuite` 包一起发布，包内路径为 `docs/onboarding.md`，README 有链接）

## 一句话概览

`skinsuite` 是零运行时依赖的多主题 / 多版式机制，分三个入口：

| 入口 | 作用 |
| --- | --- |
| `skinsuite` | 纯内核：常量、类型、token 校验、设备/配色取值 |
| `skinsuite/vue` | Vue 绑定：`<ThemeView>` / `<ThemeRoot>` / `createThemeState` / 设备域 |
| `skinsuite/vite` | 构建期插件：`themeAssets` 扫主题目录生成 `virtual:theme` |

接入的完整步骤（安装 → 目录约定 → 写主题资产 → 写声明文件 → `vite.config.ts` →
`bootstrap.ts` → store → `App.vue` → 路由与容器 → 验证清单 → 常见坑）都在上面那份
包内文档里，按步照抄即可。

## 几个最重要的边界（提炼，详见包内文档）

- **主题域是自足目录**：`themes/` + `views/` + `theme.config.ts` 三个固定名，位置由
  `VITE_THEME_DIR` 决定，换目录只改 env。
- **状态机已下沉、pinia 不下沉**：宿主 `defineStore('theme', () => createThemeState())`
  一行包起来即可。
- **`import 'virtual:theme'` 触发全部装配**，宿主不要再手动 import 任何 `@/theme/views/*`。
- **`resolveDeviceOverride` 是宿主 URL 词汇的通用注入点**：`?device=` 等参数名不进库。
- **容器禁手写 `setActiveDevice` / `setActivePageView`**，全交给 `<ThemeView>`。

## 相关规范（本仓）

- [theme-package-extraction.md](./theme-package-extraction.md) — 抽包立项与注入点契约
- [theme-replacement.md](./theme-replacement.md) — 主题替换规范
- [theme-view-component-design.md](./theme-view-component-design.md) — 版式契约设计
