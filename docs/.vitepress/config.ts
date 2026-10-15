import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'zh-CN',
  title: 'CoreFlow',
  description: '企业级 Node.js 全栈框架',

  /**
   * 死链检查放行名单
   *
   * 这些目标都在 **docs/ 之外**（前端源码 `.vue`、workspace 包 `packages/*`、仓库根 `AGENTS.md`）——
   * 文档里用相对路径指过去是**有意为之**：给开发者指路到真实源码。
   * 但 vitepress 只能解析 docs 内的文档路由，本来就无法校验这类目标，
   * 于是 `docs:build` 长期因这 10 条报错而失败（文档站无法构建）。
   *
   * 这里按前缀精确放行，**不覆盖 docs 内部的链接** —— 站内真死链依旧会拦住 build。
   *
   *  的由来：vitepress 会给相对链接统一补  前缀，且二级目录页
   * （、）指向仓库外需要 ，故放行到两层；
   * 只写  时这类链接逃出放行范围，会被误判成死链。
   */
  ignoreDeadLinks: [/^\.\.?\/(\.\.\/){0,2}(AGENTS|oauth21|posecraft|packages)(\/|$)/],

  head: [['link', { rel: 'icon', href: '/logo.svg' }]],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '指南', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: '核心', link: '/core/architecture', activeMatch: '/core/' },
      { text: '开发', link: '/development/app-module', activeMatch: '/development/' },
      { text: '规范', link: '/standards/frontend-standards', activeMatch: '/standards/' },
      { text: '部署', link: '/deployment/docker', activeMatch: '/deployment/' },
      { text: '路线图', link: '/roadmap/', activeMatch: '/roadmap/' },
      {
        text: '相关链接',
        items: [
          { text: 'GitHub', link: 'https://github.com/yijiu2025/CoreFlow' },
          { text: 'Fastify', link: 'https://fastify.dev/' },
          { text: 'Sequelize', link: 'https://sequelize.org/' },
          { text: 'Vue 3', link: 'https://cn.vuejs.org/' }
        ]
      }
    ],

    sidebar: [
      {
        text: '入门',
        items: [
          { text: '项目简介', link: '/guide/introduction' },
          { text: '快速上手', link: '/guide/quick-start' },
          { text: '项目结构', link: '/guide/project-structure' },
          { text: '命令行工具', link: '/guide/cli' },
          { text: 'CLI 插件开发', link: '/guide/cli-plugins' },
          { text: 'AI 辅助开发', link: '/guide/ai-development' }
        ]
      },
      {
        text: '核心概念',
        items: [
          { text: '架构总览', link: '/core/architecture' },
          { text: '请求处理流水线', link: '/core/request-pipeline' },
          { text: '认证系统', link: '/core/auth' },
          { text: '权限系统 (PBAC)', link: '/core/permission' },
          { text: '三级守卫', link: '/core/guard' }
        ]
      },
      {
        text: '开发指南',
        items: [
          { text: '开发规范总纲', link: '/development/development-standards' },
          { text: '应用模块开发', link: '/development/app-module' },
          { text: '数据模型', link: '/development/models' },
          { text: 'API 路由', link: '/development/api-routes' },
          { text: '命名规范', link: '/development/naming' },
          { text: '代码审查标准与流程', link: '/development/code-review' },
          { text: '数据库迁移', link: '/development/migrations' },
          { text: 'OAuth 2.1 API 报告', link: '/oauth21-api-report' }
        ]
      },
      {
        text: '集成指南',
        items: [
          { text: '登录流程前端开发模板', link: '/development/登录流程前端开发模板' },
          { text: '多账号免切接入模板', link: '/development/多账号免切接入模板' },
          { text: '注册登录全链路流程图', link: '/development/注册登录全链路流程图' },
          { text: '设备 ID 全链路梳理', link: '/development/设备ID全链路梳理' },
          { text: '设备 ID 稳定性评估', link: '/development/设备ID稳定性评估与架构图' }
        ]
      },
      {
        text: '通用规范（适合所有项目）',
        items: [
          { text: '前端统一规范（总纲）', link: '/standards/frontend-standards' },
          { text: '前端架构总览', link: '/standards/frontend-overview' },
          { text: '前端编码规范', link: '/standards/coding-standard' },
          { text: '跨内核渲染基线', link: '/standards/browser-baseline' },
          { text: '认证集成', link: '/standards/auth-integration' },
          { text: '主题基线（CSS 变量与明暗）', link: '/standards/theme-baseline' },
          { text: '主题替换规范（可复用）', link: '/standards/theme-replacement' },
          { text: '主题框架抽包立项', link: '/standards/theme-package-extraction' },
          { text: 'PWA 接入规范', link: '/standards/pwa-guide' },
          { text: '前端安全清单', link: '/standards/frontend-security' },
          { text: '前端数据加载规则', link: '/standards/frontend-data-loading-rules' },
          { text: '前端性能工程规则', link: '/standards/frontend-performance-rules' },
          { text: 'Git 提交与发版规则', link: '/standards/git-release-rules' },
          {
            text: '最佳实践',
            items: [
              { text: '安全', link: '/standards/best-practices/security' },
              { text: '性能优化', link: '/standards/best-practices/performance' },
              { text: '测试', link: '/standards/best-practices/testing' }
            ]
          }
        ]
      },
      {
        text: '部署',
        items: [
          { text: 'Docker 部署', link: '/deployment/docker' },
          { text: '多服务器架构', link: '/deployment/multi-server' },
          { text: 'CI/CD', link: '/deployment/cicd' }
        ]
      },
      {
        text: '路线图',
        items: [{ text: '升级路线图', link: '/roadmap/' }]
      },
      {
        text: '归档（历史文档，不再维护）',
        items: [
          { text: '架构评估（2026-09-19）', link: '/archive/architecture-review-2026-09-19' },
          { text: '后端检查规划', link: '/archive/backend-review-plan' },
          { text: '测试内联副本漂移报告', link: '/archive/test-inline-copy-drift-report' },
          { text: '注册登录漏洞修复计划', link: '/archive/注册登录漏洞修复计划' },
          { text: '编辑器属性面板结构规范', link: '/archive/editor-panel-structure' },
          { text: 'PoseCraft 重构计划', link: '/archive/posecraft-redesign' }
        ]
      }
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/yijiu2025/CoreFlow' }],

    footer: {
      message: '基于 MIT 许可发布',
      copyright: 'Copyright © 2026 CoreFlow'
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },

    outline: {
      label: '页面导航',
      level: [2, 3]
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    lastUpdated: {
      text: '最后更新于'
    },

    editLink: {
      pattern: 'https://github.com/yijiu2025/CoreFlow/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页面'
    }
  }
});
