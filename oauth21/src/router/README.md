# 路由系统优化说明

## 架构改进

### 1. 类型安全
- 扩展了 `RouteMeta` 接口，提供完整的类型支持
- 所有路由元数据都有 TypeScript 类型检查

### 2. 路由拆分
将路由配置拆分为多个模块：
- `authRoutes` - 认证相关路由（登录、注册、忘记密码）
- `mobileRoutes` - 移动端路由
- `authFlowRoutes` - 授权流程路由
- `errorRoutes` - 错误页面路由

### 3. 安全增强
- **开放重定向防护**：`sanitizeRedirect` 函数只允许站内相对路径
- **认证守卫**：`setupAuthGuard` 处理需要认证的路由
- **404 监控**：自动上报未找到的路径，便于发现安全问题

## 使用方法

### 添加新路由
```typescript
// 在 routes.ts 中添加
export const newRoutes: RouteRecordRaw[] = [
  {
    path: 'new-page',
    name: 'NewPage',
    component: () => import('@/view/new-page/index.vue'),
    meta: { 
      title: '新页面',
      requiresAuth: true,
      keepAlive: 'NewPage'
    }
  }
];
```

### 认证状态检查
```typescript
import { isAuthenticated } from './router/auth-checker';

// 在组件中使用
if (isAuthenticated()) {
  // 已登录逻辑
}
```

### 路由守卫配置
```typescript
// 在路由配置中设置认证要求
{
  path: 'dashboard',
  name: 'Dashboard',
  component: () => import('@/view/dashboard/index.vue'),
  meta: {
    title: '仪表板',
    requiresAuth: true,
    guestOnly: false
  }
}
```

## 路由元数据说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 页面标题（必填） |
| `requiresAuth` | boolean | 是否需要登录认证 |
| `guestOnly` | boolean | 是否仅限已登录用户访问 |
| `keepAlive` | string | 组件缓存名称（配合 `<keep-alive>`） |
| `device` | 'mobile' | 'desktop' | 'all' | 设备端标识 |

## 安全特性

### 1. 开放重定向防护
所有重定向都会通过 `sanitizeRedirect` 函数检查：
- 只允许 `/` 开头的相对路径
- 阻止协议相对路径（`//evil.com`）
- 阻止绝对路径

### 2. 认证检查
- 当前使用 cookie 检查（`sid`）
- 预留了 Pinia store 集成点
- 支持 requiresAuth 和 guestOnly 两种认证模式

### 3. 404 监控
- 自动记录未找到的路径
- 包含来源页面信息
- 便于发现爬虫扫描和死链