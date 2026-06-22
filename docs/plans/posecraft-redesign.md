# PoseCraft 重构计划

## 项目概述

**PoseCraft** 是一个 AI 姿势分析 + 图片编辑应用，使用 TensorFlow.js 实现：
- 人体姿态检测 (MoveNet)
- 面部特征识别
- 手部追踪
- 人体分割
- Fabric.js 图片编辑

## 现状分析

### 当前架构
```
phonecopy/
├── src/                    # Vue 3 前端
│   ├── views/              # 6 个页面
│   ├── components/         # 组件
│   ├── utils/auth.js       # 独立认证
│   └── router/index.js     # 路由
├── backend/                # Express + SQLite 独立后端
└── android/                # Capacitor 移动端
```

### 问题
1. 独立后端（Express + SQLite），未接入 CoreFlow
2. 独立认证系统，未使用 CoreFlow Session/PBAC
3. 前端未遵循 CoreFlow 规范（无 Pinia、无权限指令）
4. 数据库未统一管理

---

## 重构方案

### Phase 1: 后端接入 CoreFlow（1-2天）

#### 1.1 创建应用模块

```
src/app/posecraft/
├── config.js               # 应用配置
├── permission/
│   ├── index.js            # 权限常量
│   └── roles.js            # 角色定义
├── cli/
│   └── index.js            # CLI 命令
├── dao/
│   ├── template.dao.js     # 模板数据访问
│   └── work.dao.js         # 作品数据访问
└── services/
    └── ai.service.js       # AI 分析服务
```

#### 1.2 数据模型

```js
// src/models/posecraft/Template.js
// 模板表：存储姿势模板

// src/models/posecraft/Work.js
// 作品表：存储用户创作

// src/models/posecraft/Analysis.js
// 分析记录表：存储 AI 分析结果
```

#### 1.3 API 路由

```
src/api/posecraft/
├── system.json
└── v1/
    ├── template.js         # 模板 CRUD
    ├── work.js             # 作品 CRUD
    ├── analysis.js         # AI 分析
    └── upload.js           # 文件上传
```

### Phase 2: 前端重构（3-5天）

#### 2.1 目录结构

```
posecraft/                  # 独立前端项目
├── src/
│   ├── main.ts
│   ├── bootstrap.ts
│   ├── App.vue
│   │
│   ├── api/
│   │   ├── auth.ts         # 认证 API
│   │   ├── template.ts     # 模板 API
│   │   ├── work.ts         # 作品 API
│   │   └── analysis.ts     # AI 分析 API
│   │
│   ├── stores/
│   │   ├── auth.ts         # 认证状态（接入 CoreFlow）
│   │   ├── editor.ts       # 编辑器状态
│   │   └── camera.ts       # 相机状态
│   │
│   ├── composables/
│   │   ├── useAI.ts        # TensorFlow.js 封装
│   │   ├── useCamera.ts    # 相机控制
│   │   └── useEditor.ts    # Fabric.js 编辑器
│   │
│   ├── views/
│   │   ├── HomeView.vue    # 首页（推荐/附近/画廊）
│   │   ├── EditorView.vue  # 编辑器
│   │   ├── CameraView.vue  # 相机
│   │   ├── ProfileView.vue # 个人中心
│   │   ├── LoginView.vue   # 登录（接入 CoreFlow SSO）
│   │   └── AdminView.vue   # 管理后台
│   │
│   ├── components/
│   │   ├── ui/             # 基础组件
│   │   ├── editor/         # 编辑器组件
│   │   └── camera/         # 相机组件
│   │
│   └── utils/
│       ├── request.ts      # Axios 封装
│       └── ai-engine.ts    # AI 引擎
│
├── vite.config.ts
├── tsconfig.json
└── package.json
```

#### 2.2 认证集成

```ts
// stores/auth.ts
// 接入 CoreFlow Session 认证
// 使用 Cookie 自动携带，iframe SSO 登录
```

#### 2.3 核心功能

| 功能 | 技术方案 |
|------|----------|
| 姿势检测 | TensorFlow.js MoveNet |
| 面部识别 | TensorFlow.js FaceMesh |
| 手部追踪 | TensorFlow.js HandPose |
| 人体分割 | TensorFlow.js BodySegmentation |
| 图片编辑 | Fabric.js 5.x |
| 相机捕获 | Capacitor Camera API |
| 文件存储 | CoreFlow OSS/本地存储 |

### Phase 3: 数据库设计（0.5天）

```sql
-- 模板表
CREATE TABLE posecraft_template (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  thumbnail_url VARCHAR(500),
  template_data JSON,
  user_id BIGINT,
  status TINYINT DEFAULT 1,
  likes_count INT DEFAULT 0,
  uses_count INT DEFAULT 0,
  delete_version BIGINT DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME
);

-- 作品表
CREATE TABLE posecraft_work (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  template_id BIGINT,
  title VARCHAR(200),
  image_url VARCHAR(500),
  thumbnail_url VARCHAR(500),
  analysis_data JSON,
  edit_data JSON,
  status TINYINT DEFAULT 1,
  delete_version BIGINT DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME
);

-- 分析记录表
CREATE TABLE posecraft_analysis (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT,
  image_url VARCHAR(500),
  analysis_type VARCHAR(50),
  result_data JSON,
  created_at DATETIME
);
```

### Phase 4: CLI 命令（0.5天）

```bash
npm run cli -- posecraft stats      # 统计
npm run cli -- posecraft templates  # 模板列表
npm run cli -- posecraft works      # 作品列表
npm run cli -- posecraft analyze    # 测试 AI 分析
```

### Phase 5: 测试与优化（1-2天）

1. 功能测试
2. 性能优化（AI 模型懒加载）
3. 移动端适配
4. 文档更新

---

## 技术栈对照

| 组件 | 旧方案 | 新方案 |
|------|--------|--------|
| 后端 | Express + SQLite | CoreFlow (Fastify + MySQL) |
| 认证 | 独立 JWT | CoreFlow Session + PBAC |
| 数据库 | SQLite | MySQL + Sequelize |
| 前端框架 | Vue 3 (JS) | Vue 3 + TypeScript |
| 状态管理 | 无 | Pinia |
| 路由 | Vue Router | Vue Router + 权限守卫 |
| HTTP | fetch | Axios + 401 刷新队列 |
| AI | TensorFlow.js | TensorFlow.js（保留） |
| 编辑器 | Fabric.js | Fabric.js（保留） |
| 移动端 | Capacitor | Capacitor（保留） |

---

## 实施时间线

```
Day 1-2:   Phase 1 - 后端接入 CoreFlow
Day 3-5:   Phase 2 - 前端重构
Day 5:     Phase 3 - 数据库设计
Day 5-6:   Phase 4 - CLI 命令
Day 6-7:   Phase 5 - 测试与优化
```

总计：约 1 周
