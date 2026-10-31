> **⚠️ 已迁出本仓（仅作历史参考）**
>
> 本文描述的前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`）
> 已于 2026-10-31 从本仓库移除，改为独立维护。**文中的源码路径、目录结构与 npm 命令均已失效**。
>
> 本仓只保留后端；后端侧的认证契约见 [auth-integration](../../standards/auth-integration.md)。

---

# 前端 AI 提示词（已归档）

这些提示词原先写在 [AI 辅助开发](../../guide/ai-development.md) 里。前端迁出后本仓不再涉及前端代码，
故移到这里留档：如果要在**独立前端仓**里用 AI 写页面，可参考下列模板，但目录名、请求封装、
权限指令等以对应前端仓的现状为准。

## 前端代码生成

### 生成 API 模块

```
帮我创建博客系统的前端 API 模块，接口：
- GET /blog/v1/posts — 获取文章列表
- POST /blog/v1/posts — 创建文章
- GET /blog/v1/posts/:id — 获取文章详情
- PUT /blog/v1/posts/:id — 更新文章
- DELETE /blog/v1/posts/:id — 删除文章
- GET /blog/v1/posts/:id/comments — 获取评论
- POST /blog/v1/posts/:id/comments — 发表评论
```

AI 会生成：

```typescript
// api/blog.ts
import service from '@/utils/request';

export const blogApi = {
  // 文章
  getPosts: (params?: { page?: number; pageSize?: number }) => service.get('/blog/v1/posts', { params }),
  getPost: (id: number) => service.get(`/blog/v1/posts/${id}`),
  createPost: (data: { title: string; content: string }) => service.post('/blog/v1/posts', data),
  updatePost: (id: number, data: { title?: string; content?: string; status?: number }) =>
    service.put(`/blog/v1/posts/${id}`, data),
  deletePost: (id: number) => service.delete(`/blog/v1/posts/${id}`),

  // 评论
  getComments: (postId: number) => service.get(`/blog/v1/posts/${postId}/comments`),
  createComment: (postId: number, data: { content: string }) => service.post(`/blog/v1/posts/${postId}/comments`, data)
};
```

### 生成 Store

```
帮我创建博客系统的 Pinia store，功能：
- 文章列表和详情的缓存
- 创建/更新/删除文章的乐观更新
- 登录状态检查
```

### 生成页面组件

```
帮我创建博客文章列表页面，要求：
- 使用 Vue 3 Composition API + <script setup lang="ts">
- 表格展示文章列表（标题、作者、状态、创建时间）
- 支持分页
- 有新增、编辑、删除按钮
- 使用 v-auth 指令控制按钮权限
- 支持深色模式
```

### 生成表单组件

```
帮我创建文章编辑表单组件，要求：
- 使用 vee-validate + zod 做表单验证
- 字段：标题（必填，最大200字）、内容（富文本）、状态（下拉选择）
- 提交时调用 blogApi.createPost 或 blogApi.updatePost
- 支持 i18n
```

---

---

### 前端页面生成提示词

```markdown
请根据以下需求生成前端页面代码：

## 项目框架信息

- 框架：Vue 3 + TypeScript + Pinia + Vue Router
- HTTP：Axios（withCredentials: true）
- 认证：Cookie 自动携带，authStore 管理状态
- 权限：v-auth="权限编码" 指令
- 样式：Tailwind CSS + HSL 变量

## 后端接口

[接口列表]

## 需求描述

[页面功能需求]

## 输出要求

1. 使用 <script setup lang="ts">
2. 使用 Composition API
3. 包含完整的类型定义
4. 支持深色模式
5. 包含 i18n 翻译 key
```

---
