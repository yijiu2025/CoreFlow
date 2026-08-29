# 前端统一规范文档

> 适用项目：`oauth21`（登录/注册 SSO 中心）、`firewall`（防火墙）、`admin`（管理后台）、`posecraft`（AI 姿势分析）
> 目标：统一前端工程结构、组件、服务、安全实践，提升可维护性与交接效率
> 配套文档：[PWA_GUIDE.md](./PWA_GUIDE.md)（PWA 接入规范）、[theme.md](./theme.md)（主题规范）、[coding-standard.md](./coding-standard.md)（编码风格）、[auth-integration.md](./auth-integration.md)（认证集成）、[overview.md](./overview.md)（架构总览）

> **历史说明**：旧版本文档（`FRONTEND_STANDARDS.md.corrupted`）因编辑工具双重编码损坏，已不可读但保留在 git 历史中可查。本文为重写版，按当前项目实际实践沉淀。

---

## 1. 适用范围

### 1.1 项目职责

- `oauth21`：OAuth 2.1 / SSO 登录授权中心。一方应用嵌入登录页（iframe），三方应用走标准 authorize 流程
- `firewall`：防火墙防御后台（人机验证、数据大盘）
- `admin`：管理后台（用户/角色/权限/审计）
- `posecraft`：AI 姿势分析 + 图片编辑（[PWA 启用](./PWA_GUIDE.md)）

### 1.2 统一技术栈

| 项 | 选型 |
|---|---|
| 框架 | Vue 3 + `<script setup>` + TypeScript |
| 构建 | Vite 5 |
| 路由 | vue-router 4 |
| 状态 | Pinia |
| UI | Tailwind CSS + daisyui 工具类 |
| i18n | vue-i18n 9 |
| HTTP | axios（统一封装在 `src/utils/request.ts`） |
| 表单 | vee-validate + zod（[Zod discriminatedUnion](https://zod.dev/?id=discriminated-unions) 区分登录/注册模式） |
| 图标 | lucide-vue-next + 内联 SVG |
| 自动导入 | unplugin-auto-import / unplugin-vue-components |
| PWA | [vite-plugin-pwa](./PWA_GUIDE.md)（posecraft 默认启用） |

---

## 2. 目录结构规范

### 2.1 推荐结构

```
<app>/
├── public/                  # 静态资源（favicon、图标、SW 资源）
├── src/
│   ├── api/                # 按域分文件夹的 API 路由
│   ├── assets/             # 全局样式（main.scss）
│   ├── components/         # 通用组件（common/、业务组件）
│   │   ├── common/         # 跨页面通用（AuthContainer、GraphicCaptcha、SliderCaptcha）
│   │   └── ...
│   ├── composables/        # 组合式函数（use*，业务逻辑封装）
│   ├── i18n/               # 多语言
│   ├── layouts/            # 路由布局（BlankLayout 等）
│   ├── router/             # 路由
│   ├── stores/             # Pinia 状态
│   ├── utils/              # 工具函数（request、crypto、sign、device）
│   ├── view/               # 页面（按平台/功能分子目录）
│   │   ├── web/            # PC 端页面
│   │   ├── app/            # 移动端页面
│   │   └── ...
│   ├── App.vue
│   └── main.ts
├── .env / .env.example
├── vite.config.ts
└── package.json
```

### 2.2 分层边界

- **components 职责单一**：一个组件只负责一个功能域（如 `SearchHero` 只管搜索框，不管 Tab）
- **不内嵌其他模块**：组件 A 中不出现组件 B 的 UI/逻辑
- **状态归属**：由消费方（父组件）管理状态，不内嵌数据
- **跨模块通信**：通过 props / emit / v-model / 共享 composable，禁止反向依赖

---

## 3. 命名规范

### 3.1 文件命名

- 组件：`PascalCase.vue`（`AuthContainer.vue`）
- 页面：`PascalCase.vue`（`MiniLogin.vue`）或场景化（`forgot-password/index.vue`）
- composable：`useCamelCase.ts`（`useLoginFlow.ts`）
- 工具函数：`camelCase.ts`（`device-fingerprint.ts` 用 kebab-case 也可，保持项目一致）
- 类型：`PascalCase.ts`（专门类型文件）

### 3.2 标识符命名

- 组件名：`PascalCase`（多词组合，如 `GraphicCaptcha`）
- 变量/函数：`camelCase`（`loginType`、`executeLogin`）
- 常量：`UPPER_SNAKE_CASE`（`DEFAULT_SCOPE`、`MAX_SESSIONS`）
- 类型/接口：`PascalCase`（`LoginPayload`、`UseLoginFlowOptions`）
- 布尔：`is/has/can` 前缀（`isCountingDown`、`hasAppName`）
- 事件：`update:xxx` 模式（`update:showQR`）

---

## 4. TypeScript 规范

### 4.1 严格模式

`tsconfig.app.json` 必须开启：
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noImplicitAny: true`
- `noFallthroughCasesInSwitch: true`

### 4.2 响应式变量

- 原始类型：`const count = ref(0)`
- 对象：`const user = ref<User | null>(null)`
- 解构模板自动 unwrap：`const { active, remaining } = useCountdown()` 在 `<template>` 直接用，在 `<script>` 用 `.value`

### 4.3 类型定义原则

- **优先具体类型**：`ref<User | null>(null)` 优于 `ref<any>(null)`
- **判别联合**替代 `any`：
  ```ts
  type LoginResponse =
    | { action: 'consent'; consentKey: string }
    | { action: 'needs_email_verify'; verifyToken: string }
    | { action: 'max_sessions'; sessions: any[] }
    | LoginSuccessResponse;
  ```
- **未知类型用 `unknown` + 类型守卫**，不用 `any`
- **API 响应类型**：后端 DTO + zod 推导（[z.infer](https://zod.dev/?id=type-inference)），不写 `any`

### 4.4 类型检查

CI 必跑 `vue-tsc --noEmit`（零错误零警告），不通过禁止合并。

---

## 5. 组件规范

### 5.1 单文件组件结构

```vue
<script setup lang="ts">
// 1. imports
// 2. composables / stores
// 3. 响应式状态
// 4. 计算属性
// 5. 方法
// 6. 生命周期
</script>

<template>
  <!-- 单一根元素（避免 <Transition> 警告） -->
</template>

<style scoped>
/* 局部样式 */
</style>
```

### 5.2 Props 与事件

```ts
interface Props {
  isOpen: boolean;
  email?: string;
  type: 'register' | 'login' | 'reset';
}
const props = withDefaults(defineProps<Props>(), {
  email: '',
  type: 'register'
});

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  success: [data: { captchaKey: string }];
}>();
```

### 5.3 composable 抽取时机

满足任一条件，逻辑就抽到 `composables/`：

- 在 2+ 个组件重复出现（如 `setInterval` 倒计时、图形码流程）
- 单组件内状态机复杂（弹窗开关 + 异步回调 + 多状态切换）
- 涉及定时器/资源需要 `onUnmounted` 清理

参考实现：
- `useCountdown`（8 处倒计时统一）
- `useCaptchaFlow`（5 处图形码统一）
- `useQrLogin`（2 处二维码登录统一）
- `useLoginFlow`（3 处登录流程统一 ~200 行×3 消除）
- `useRecaptcha`（hCaptcha 实例隔离 + SDK 加载超时）

---

## 6. 状态管理规范

### 6.1 Store 职责

Pinia store 一个只管一块：
- `useAuthStore` — 登录态、token、user
- `useThemeStore` — 主题（dark/light）
- 业务 store 按需（不滥用 Pinia，跨组件数据用 props/emits）

### 6.2 跨域通信

- 父子组件：`props` + `emit`
- 跨层级：composable（`useXxx` 返回 ref）
- 跨域（iframe）：`postMessage` + origin 白名单（`utils/parent.ts`）

---

## 7. 错误处理规范

### 7.1 异步错误

- `try/catch` 必带 `err: any` 处理后通过 `useMessage().error()` 提示用户
- 网络错误给友好提示，不抛技术细节
- 关键操作失败要 console.error 留痕（便于排查）

### 7.2 全局错误处理

`main.ts` 注册 `app.config.errorHandler` 兜底未捕获错误。

### 7.3 401 跳转

Session 模式：401 → 跳登录页（sid_r 过期或未登录）。不重发请求（避免死循环）。
JWT 模式：401 → 调 `/oauth2.1/token` 用 refresh_token 刷新，重发原请求。

### 7.4 风险拦截（`__risk__`）

后端响应 `403 + __risk__` → 前端弹人机验证（`SliderCaptcha.vue`）。
- 带 `x-verify-token` 头的请求豁免（验证端点不能拦自己）
- `info` 级不拦（IP 变指纹不变 = 梯子），但响应体注入 `__risk__` 提示前端

---

## 8. 性能与可维护性

### 8.1 文件大小限制

单 JS/Vue 文件不超过 1000 行（含空行注释）。接近 800 行时主动规划拆分。

### 8.2 避免重复代码

- 相似逻辑 ≥ 2 处 → 抽 composable
- UI 相似 ≥ 3 处 → 抽通用组件
- 字符串/常量散落多处 → 抽 config 文件

### 8.3 死代码

定期清理：
- 零引用的组件/函数
- 已废弃的 API 调用
- 占位 TODO（确认无意义后删或转 issue）

---

## 9. 安全规范

### 9.1 Token 存储

- **oauth21 自身不落 token 到 localStorage**（防 XSS）
- token 通过 postMessage 递给父应用
- 父应用优先用 `httpOnly Cookie`（`bind-session`），不直接落 localStorage

### 9.2 postMessage origin 校验

`utils/parent.ts` 双向校验：
- 白名单（`VITE_ALLOWED_PARENT_ORIGINS`）
- `location.ancestorOrigins[0]`（不可伪造）
- 拒绝非白名单（fail-closed）

### 9.3 请求签名（防爬）

[utils/sign.ts](../oauth21/src/utils/sign.ts)（学闲鱼 generateSign）：
- `appKey` 前后端共享（`.env` 配置）
- 签名串：sha256(`sessionKey & appKey & timestamp & nonce & url & params & body`)
- params 按 key 排序序列化纳入签名（防 query 篡改）
- nonce 用 `crypto.getRandomValues`（防重放）

### 9.4 设备码

- `device_id`（cookie）+ `device_fingerprint`（sha256 of device_id+UA+uid）
- 跨账号复用 device_id（localStorage 持久）
- 风险检测基准从 Redis 读（零 DB 查询）

### 9.5 XSS 防护

- **禁止**在模板用 `v-html` 渲染用户输入
- 协议/帮助文档等富文本用专用 `DocModal` 组件，不直接渲染 HTML
- emoji 不在 UI 用（CLAUDE.md 规范），但协议正文中按需保留

---

## 10. i18n 规范

### 10.1 key 命名

层级结构 + 业务域：
- `login.welcome` / `login.consent_title` / `register.step1` / `forgot.code_sent`
- 通用：`validation.email_invalid` / `common.cancel`

### 10.2 使用方式

```vue
<template>
  <button>{{ t('login.submit') }}</button>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>
```

### 10.3 兜底

```ts
t('login.perm_email', { email: '保密' }) || '获取您的电子邮箱地址'
```

中英文双语同步更新，避免漏译。

---

## 11. 测试规范

### 11.1 单元测试

- 关键 composable（useLoginFlow、useCountdown）覆盖率 ≥ 80%
- 工具函数（sign、device）覆盖率 ≥ 90%

### 11.2 集成测试

- 关键用户路径（登录、注册、二次验证）有 e2e 测试
- 跨域 iframe SSO 流程有端到端验证

### 11.3 手动验证

每次发版前手动验证：
- 邮箱登录全流程
- 密码登录 + 图形码 + 二次验证
- 二维码登录
- 多账号切换
- 主题切换（深/浅）
- PWA 安装（posecraft）

---

## 12. 构建与部署

### 12.1 构建命令

```bash
npm run dev        # 开发（nodemon + .env）
npm run build      # 生产构建
npx vite build     # 纯构建
```

### 12.2 关键检查

- `npx vue-tsc --noEmit` 零错误零警告
- 构建产物 `dist/` 包含（按需）：
  - `index.html`
  - `sw.js` + `workbox-*.js`（PWA）
  - `manifest.webmanifest`（PWA）
  - `assets/`（JS/CSS 哈希化）

### 12.3 部署路径

- `posecraft`：build 产物到 `../public/posecraft/`（后端静态服务），base `/posecraft/`
- `oauth21`/`firewall`/`admin`：同模式（base 对齐子路径）

---

## 13. 国际化与可访问性

- 所有交互元素有 `aria-label`（图标按钮）
- 表单 `<label>` 与 `<input>` 关联
- 颜色对比度 ≥ 4.5:1（WCAG AA）
- 键盘可导航（Tab/Enter/Esc）

---

## 14. 协议与法律合规

参考 [components/common/agreements/](../oauth21/src/components/common/agreements/)：
- 协议配置集中在 [agreementConfig.ts](../oauth21/src/components/common/agreements/agreementConfig.ts)
- **上线前**必须填真实值（OPERATOR、注册地址、统一社会信用代码、DPO 邮箱、客服电话、版本号、响应时限、保存期限）
- 网信办/工信部检查会逐项核对处理者身份，**留空或写占位符会被认定为"未公开收集使用规则"**

---

## 15. 改造阶段参考

> 本节为新前端项目 / 老项目大改时的阶段性参考（基于 oauth21 9 批重构实践）

### 第一阶段：基础补强

1. 统一 Tailwind + TypeScript 配置
2. 统一路由、状态、组件库

### 第二阶段：结构清晰

1. 抽登录页、注册页
2. 抽 composables（useCountdown、useCaptchaFlow、useQrLogin、useLoginFlow）
3. 抽通用组件（AgreementModals、SliderCaptcha、MessageToast）

### 第三阶段：质量提升

1. `vue-tsc` 严格校验
2. 重复代码抽取
3. 性能与无障碍优化

---

## 16. 验收标准

- 项目必通过 `npm run lint` + `npm run type-check`
- 禁止 `any`、硬编码敏感字段、API Key
- 登录态失效自动刷新或跳转登录页
- 页面文案必须走 `i18n`
- 控制器方法不超过 500 行

---

## 17. 维护说明

- 本文档随项目演进滚动更新
- 新建前端项目直接套用本规范
- 任何偏离规范的实现必须记录原因并加到临时备忘
- 旧版损坏文件（`FRONTEND_STANDARDS.md.corrupted`）保留作历史参考
