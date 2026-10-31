---
layout: home

hero:
  name: CoreFlow
  text: Enterprise Node.js backend framework
  tagline: Fastify v5 + Sequelize v6, with authentication, PBAC permissions, a five-layer firewall and OAuth 2.1 built in — bring any frontend
  actions:
    - theme: brand
      text: Quick start
      link: /en/guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/yijiu2025/CoreFlow

features:
  - icon: 🔐
    title: Enterprise authentication
    details: Session + JWT in one framework, RSA-encrypted login, HMAC-signed cookies, automatic renewal, multi-device management
  - icon: 🛡️
    title: PBAC permission engine
    details: Policy-based access control with wildcards, deny-before-allow, role inheritance, weight precedence and app isolation
  - icon: 🔥
    title: Five-layer firewall
    details: Connection tracking → global blocking → human challenge → bot detection → geo-fencing; malicious traffic is stopped automatically
  - icon: 🌐
    title: OAuth 2.1
    details: Authorization code + PKCE, JWT issuance, client management, fine-grained scopes, refresh-token rotation with reuse detection
  - icon: 📦
    title: Modular architecture
    details: An app is a directory — config, permissions, models, routes and business logic in one place
  - icon: 🚀
    title: Runs out of the box
    details: Users, notifications, CAPTCHA, envelope-encrypted keys, Docker and CI artifacts included — clone and boot
  - icon: 🔌
    title: Frontend-agnostic
    details: Coupled only through an HTTP wire protocol (session cookie / signature header / CSRF); this repository ships no frontend code
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #6366f1 30%, #06b6d4);
}
</style>
