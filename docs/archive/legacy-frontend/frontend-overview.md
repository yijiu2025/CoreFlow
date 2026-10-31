> **⚠️ 已迁出本仓（仅作历史参考）**
>
> 本文描述的前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`）
> 已于 2026-10-31 从本仓库移除，改为独立维护。**文中出现的源码路径、目录结构与 npm 命令均已失效**，
> 接入或改造时请以对应前端仓自身的文档为准（`oauth21` → https://github.com/yijiu2025/oauth-web ）。
>
> 本仓只保留**后端**相关规范；后端侧的认证集成契约见 [auth-integration](../../standards/auth-integration.md)。

---

# 前端架构 {#frontend-overview}

## 技术栈

| 类别     | 标准                  | 说明                                         |
| -------- | --------------------- | -------------------------------------------- |
| 框架     | Vue 3.5+              | Composition API + `<script setup lang="ts">` |
| 构建     | Vite 5+               | 统一插件配置                                 |
| 样式     | Tailwind CSS 3 + SCSS | HSL 变量驱动主题                             |
| 状态     | Pinia 3+              | Composition API 风格                         |
| 路由     | Vue Router 4+         | NProgress + 权限守卫                         |
| HTTP     | Axios                 | 工厂模式 + 401 刷新队列                      |
| 国际化   | Vue I18n 9+           | 中/英双语起步                                |
| 工具库   | @vueuse/core          | useColorMode, usePreferredDark               |
| 自动导入 | unplugin-auto-import  | 消除样板 import                              |

## 目录结构

```text
src/
├── main.ts                    # 极简入口
├── bootstrap.ts               # 启动编排器
├── App.vue                    # 根组件
├── style.css                  # 全局样式 + CSS 变量
│
├── api/                       # 接口请求模块
│   └── [module].ts
│
├── stores/                    # Pinia 状态管理
│   ├── auth.ts                # 认证 + 权限（必须）
│   ├── theme.ts               # 主题管理（必须）
│   └── [module].ts
│
├── composables/               # 组合式函数
│   ├── useCache.ts            # 本地缓存封装
│   └── auto-imports/
│
├── directives/                # Vue 全局指令
│   ├── auth.ts                # v-auth 权限指令
│   └── role.ts                # v-role 角色指令
│
├── components/
│   ├── ui/                    # 原子 UI 组件
│   ├── layout/                # 布局组件
│   └── [module]/              # 业务组件
│
├── views/                     # 页面视图
├── router/                    # 路由配置
├── i18n/                      # 国际化
├── types/                     # 类型定义
└── utils/                     # 工具函数
```

## 启动流程

```typescript
// main.ts
import './bootstrap';

// bootstrap.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import i18n from './i18n';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.directive('auth', authDirective);
app.directive('role', roleDirective);
router.isReady().then(() => app.mount('#app'));
```

## 各前端端口分配

| 前端     | 开发端口 | 代理目标                | 构建输出             |
| -------- | -------- | ----------------------- | -------------------- |
| oauth21  | 5174     | `http://localhost:3000` | `../public/sso`      |
| firewall | 5173     | `http://localhost:3000` | `../public/firewall` |
| admin    | 5175     | `http://localhost:3000` | `../public/admin`    |

## 缓存前缀

| 前端     | 前缀   |
| -------- | ------ |
| firewall | `fw_`  |
| oauth21  | `sso_` |
| admin    | `adm_` |
