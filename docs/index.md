---
layout: home

hero:
  name: Antigravity
  text: 企业级 Node.js 全栈框架
  tagline: 基于 Fastify + Sequelize + Vue 3 构建的现代化 Web 应用框架，内置认证、权限、防火墙、OAuth 2.1
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/quick-start
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/yijiu2025/nodejsFaster

features:
  - icon: 🔐
    title: 企业级认证
    details: Session + JWT 双模式认证，RSA 加密登录，HMAC Cookie 签名，自动续期，多设备管理
  - icon: 🛡️
    title: PBAC 权限引擎
    details: 基于策略的访问控制，通配符匹配，Deny 优先，角色继承，权重压制，应用隔离
  - icon: 🔥
    title: 五层防火墙
    details: 连接追踪 → 全局封禁 → 人机挑战 → Bot 检测 → 地理围栏，全自动拦截恶意流量
  - icon: 🌐
    title: OAuth 2.1 授权
    details: 完整的 OAuth 2.1 实现，PKCE 支持，JWT 签发，多客户端管理，Scope 精细控制
  - icon: 📦
    title: 模块化架构
    details: 应用即插件，一个目录 = 一个完整应用，包含配置、权限、模型、路由、业务逻辑
  - icon: 🚀
    title: 开箱即用
    details: 内置用户管理、通知系统、验证码、防火墙管理面板，Vue 3 前端开箱即用
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #6366f1 30%, #06b6d4);
}
</style>
