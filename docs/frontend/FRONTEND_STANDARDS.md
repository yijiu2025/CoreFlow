# 前端统一规范文档

> 适用项目：`oauth21`、`firewall`、`admin`  
> 目标：统一前端工程结构、代码风格、安全实践、可维护性与交付标准。

---

## 1. 总览与范围

### 1.1 项目职责
- `oauth21`：OAuth 2.1 / SSO 登录、授权、找回密码、移动端登录注册页。
- `firewall`：防火墙控制台，监控、策略、日志、系统设置。
- `admin`：管理后台，用户与权限管理基础能力。

### 1.2 统一技术栈
| 能力 | 统一要求 |
|------|----------|
| 框架 | Vue 3 |
| 语言 | TypeScript |
| 构建 | Vite |
| 路由 | Vue Router 4 |
| 状态 | Pinia |
| UI 样式 | Tailwind CSS |
| 校验 | Zod + vee-validate |
| 工具 | @vueuse/core、dayjs |
| 网络 | axios |
| 国际化 | vue-i18n |
| 代码质量 | ESLint + Prettier + TypeScript 类型检查 |

> 例外需在对应项目 README 明确记录原因，不允许静默引入第二套方案。

---

## 2. 目录结构规范

### 2.1 推荐结构
```text
src/
├── assets/                 # 静态资源
│   ├── images/
│   └── styles/
│       └── main.scss
├── components/             # 公共组件
│   ├── common/
│   └── business/
├── composables/            # 组合式函数
├── config/                 # 前端配置
├── directives/             # 自定义指令
├── i18n/                   # 国际化
├── layouts/                # 布局
├── router/                 # 路由
├── stores/                 # 状态管理
├── types/                  # 类型定义
├── utils/                  # 工具函数
├── views/                  # 页面
├── App.vue
├── main.ts
└── style.css
```

### 2.2 分层边界
- `views/`：只放页面级组件，业务编排。
- `components/`：可复用组件，按通用和业务拆分。
- `composables/`：与 UI 解耦的逻辑抽取。
- `stores/`：跨页面共享状态。
- `utils/`：纯函数与通用能力。

---

## 3. 命名规范

### 3.1 文件命名
- 目录：`kebab-case`
- 组件文件：`PascalCase.vue`
- 工具/逻辑文件：`camelCase.ts`
- 样式文件：`kebab-case.scss`

### 3.2 代码命名
- 组件名：`PascalCase`
- 变量/函数：`camelCase`
- 常量：`UPPER_SNAKE_CASE`
- 类型/接口：`PascalCase`
- 布尔值：`is/has/should` 前缀

### 3.3 示例
```text
components/common/AuthContainer.vue
composables/useMessage.ts
utils/request.ts
stores/auth.ts
```

---

## 4. TypeScript 规范

### 4.1 类型定义
- 优先使用 `interface` 定义对象类型，`type` 用于联合类型、工具类型。
- 禁止 `any`，数据边界处使用 `unknown` 后显式收窄。
- 导出类型统一放在 `types/`。

### 4.2 响应式类型
- 推荐泛型约束表单、API 响应、分页结构。
- 避免模板中隐式 `any`。

### 4.3 示例
```ts
export interface LoginPayload {
  username?: string
  password?: string
  type: 'sms' | 'pwd' | 'email'
}
```

---

## 5. 组件规范

### 5.1 组件结构
- 单文件组件统一顺序：`<template>`、`<script setup lang="ts">`、`<style scoped>`。
- 复杂组件拆分 `ChildPanel.vue` + `useXxx.ts`。
- 单个文件超过 500 行必须拆分。

### 5.2 Props 与事件
- Props 必须定义类型和必填性。
- 事件名统一 `kebab-case`，避免 DOM 事件冲突。
- 暴露接口使用 `defineExpose`。

### 5.3 模板规范
- 不使用 `v-html`，除非内容可控且经过安全审查。
- 复杂逻辑下沉到 `composables` 或方法。
- 列表渲染必须有稳定 `:key`。

---

## 6. 状态管理规范

### 6.1 Store 职责
- 每个 store 只负责一个业务域。
- 禁止把 UI 临时状态与业务状态混放。
- 持久化状态统一走 `pinia-plugin-persistedstate` 或统一缓存工具。

### 6.2 命名
- store 文件：`useXxxStore`
- state/getter/action 语义化，避免缩写。

### 6.3 示例
```ts
export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref<User | null>(null)

  async function login(payload: LoginPayload) { ... }
  function logout() { ... }

  return { token, user, login, logout }
})
```

---

## 7. 网络请求规范

### 7.1 统一封装
- 三个项目统一使用 axios，并收敛到 `utils/request.ts` 或 `api/xxx.ts`。
- 统一拦截器处理：`Authorization`、统一错误码、401/403 处理、请求取消。

### 7.2 接口规范
- 后端统一响应结构：`{ code, message, data }`。
- 统一异常映射为 `ApiError`，避免把 `AxiosError` 直接抛给页面。

### 7.3 Token 刷新
- 多个并发 401 只允许一次刷新。
- 刷新失败统一清理状态并跳转登录。

### 7.4 各项目现状问题与修复要求
| 项目 | 问题 | 修复要求 |
|------|------|----------|
| `oauth21` | `utils/request.ts` 401 使用空 token 继续请求 | 接入 `authApi.refreshToken`，失败跳登录 |
| `firewall` | 401 处理与 Queue 已有实现，但缺少统一 Error Class | 抽离 `ApiError`，补异常类型 |
| `admin` | 401 逻辑为 TODO，存在假刷新 | 接入真实刷新接口并增加失败兜底 |

---

## 8. 安全规范

### 8.1 认证与会话
- 优先使用后端 Session + HttpOnly Cookie。
- JWT 仅用于对外 API，禁止本地存储敏感 token。

### 8.2 请求签名
- `oauth21` 已要求 H5 签名：`X-Sign`、`X-Timestamp`、`X-Nonce`。
- 禁止前端保存私钥、密钥、密码明文。

### 8.3 防护
- 生产关闭不必要 `console.*`，统一接入日志服务。
- 危险操作加二次确认，防抖/节流公共能力统一封装。
- CSP 与安全 Header 由后端统一配置，前端避免引入内联脚本。

---

## 9. 路由规范

### 9.1 配置
- 路由元信息统一字段：`title`、`requiresAuth`、`roles`、`permissions`。
- 路由懒加载统一使用 `() => import()`。

### 9.2 守卫
- 全局路由守卫统一在 `router/index.ts`。
- 鉴权失败统一跳转，避免各处散落 `window.location.href`。

---

## 10. 样式规范

### 10.1 Tailwind
- 类名顺序建议：`布局 -> 间距 -> 字体 -> 颜色 -> 边框 -> 交互`。
- 禁止硬编码颜色值，优先使用 `tailwind.config.js` 扩展色板。
- 深色模式统一通过 `dark:` 处理。

### 10.2 SCSS
- 少量复杂组件可保留 `scoped`，禁止全局污染。
- 变量统一在 `assets/styles/variables.scss` 定义。

---

## 11. 国际化规范

### 11.1 文件组织
- 统一放在 `i18n/`，按语言拆分 `zh-CN.ts`、`en-US.ts`。
- 禁止模板硬编码中文。

### 11.2 命名
- key 统一 `业务域.页面.组件.文案`。
- 动态插值统一命名，避免模板拼接。

---

## 12. 日志与错误处理

### 12.1 统一错误上报
- 全局 `errorHandler` 只上报和提示，不吞异常。
- 后端错误统一按码提示，禁止显示裸异常。

### 12.2 用户提示
- 统一 Toast/Message 工具：`useMessage.ts`。
- 防止同一操作连续弹出多条相同提示。

---

## 13. 构建与代码质量

### 13.1 统一命令
| 命令 | 作用 |
|------|------|
| `npm run dev` | 本地开发 |
| `npm run build` | 生产构建 |
| `npm run type-check` | TS 类型检查 |
| `npm run lint` | ESLint 修复 |
| `npm run format` | Prettier 格式化 |
| `npm run preview` | 构建后预览 |

### 13.2 必须开启
- `vue-tsc --noEmit`
- ESLint：`vue/multi-word-component-names` 按项目统一策略
- Prettier：单引号、尾逗号、无分号按项目配置落地

### 13.3 提交前检查
- 统一 `lint-staged`：
```json
[
  "eslint --fix",
  "prettier --write"
]
```

---

## 14. 三项目现状问题清单

### 14.1 后端
| 问题 | 位置 | 影响 | 修复建议 |
|------|------|------|----------|
| `guard.js` 中文注释乱码 | `src/api/guard.js` | 可读性差 | 统一 UTF-8 注释 |
| `isIpMatch` 仅 IPv4 | `src/api/guard.js` | IPv6 失败 | 替换为成熟 IP 匹配库 |
| 缺少统一 API 版本目录定义 | `src/api` | 版本治理弱 | 建立 `v1/` 规范 |
| 无统一异常类型 | 多个路由文件 | 错误处理不一致 | 统一 `AppError` |

### 14.2 `oauth21`
| 问题 | 位置 | 影响 | 修复建议 |
|------|------|------|----------|
| 401 处理假刷新 | `src/utils/request.ts` | 请求失败 | 接 `authApi.refreshToken` |
| `MiniLogin.vue` 过大 | `src/view/web/login/MiniLogin.vue` | 维护成本高 | 拆分表单/协议/样式 |
| 表单与视图耦合 | 多个页面 | 复用差 | 抽离 `composables/useLogin` |
| 多登录视图重复 | `StandardLogin.vue`、`MiniLogin.vue` | 重复逻辑 | 提取共享组件与验证 |

### 14.3 `firewall`
| 问题 | 位置 | 影响 | 修复建议 |
|------|------|------|----------|
| `SystemSettingsModal.vue` 过大 | `src/components/modals/SystemSettingsModal.vue` | 难维护 | 拆分模块与表单 |
| `i18n/index.ts` 过大 | `src/i18n/index.ts` | 性能与可维护性 | 拆分子语言/业务模块 |
| Token 刷新与 `api/firewall.ts` 逻辑耦合 | `src/api/firewall.ts` | 可测试性差 | 拆到 `composables/useAuth` |
| 地图数据文件过大 | `src/assets/maps/*.json` | 首屏 | 懒加载/静态托管 |

### 14.4 `admin`
| 问题 | 位置 | 影响 | 修复建议 |
|------|------|------|----------|
| 401 为 TODO | `src/utils/request.ts` | 认证失效 | 补真实刷新逻辑 |
| 路由无鉴权守卫 | `src/router/index.ts` | 安全问题 | 增加前置守卫 |
| 组件库复用低 | `src/view/users/index.vue` | 样式与逻辑重复 | 抽象 `UserTable.vue` |

---

## 15. 建议落地顺序

### 第一阶段：规范对齐
1. 统一 `request` 封装和 401 逻辑。
2. 统一 Tailwind 与 TypeScript 规则。
3. 统一路由守卫和错误提示。

### 第二阶段：结构与拆分
1. 拆分 `oauth21` 登录页面。
2. 拆分 `firewall` 大组件与大 i18n。
3. 补齐 `admin` 鉴权与基础组件。

### 第三阶段：工程化强化
1. 引入 `vue-tsc` 严格检查。
2. 增加组件与工具单测。
3. 构建产物分析与性能优化。

---

## 16. 验收标准

- 三项目均能通过 `npm run lint`、`npm run type-check`。
- 无 `any`、无硬编码密钥、无裸 API Key。
- 登录态过期后自动刷新或回到登录页。
- 页面中文文案全部走 `i18n`。
- 单组件不超过 500 行。

---

## 17. 维护说明

- 本文档随项目演进持续更新。
- 新建前端项目必须直接满足本规范。
- 任何偏离本规范的技术方案必须记录原因与到期时间。
