import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Antigravity',
  description: '企业级 Node.js 全栈框架',

  head: [
    ['link', { rel: 'icon', href: '/logo.svg' }]
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '指南', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: '核心', link: '/core/architecture', activeMatch: '/core/' },
      { text: '开发', link: '/development/app-module', activeMatch: '/development/' },
      { text: '前端', link: '/frontend/overview', activeMatch: '/frontend/' },
      { text: '部署', link: '/deployment/docker', activeMatch: '/deployment/' },
      { text: '路线图', link: '/roadmap/', activeMatch: '/roadmap/' },
      {
        text: '相关链接',
        items: [
          { text: 'GitHub', link: 'https://github.com/yijiu2025/nodejsFaster' },
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
          { text: '项目结构', link: '/guide/project-structure' }
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
          { text: '应用模块开发', link: '/development/app-module' },
          { text: '数据模型', link: '/development/models' },
          { text: 'API 路由', link: '/development/api-routes' },
          { text: '命名规范', link: '/development/naming' },
          { text: '数据库迁移', link: '/development/migrations' }
        ]
      },
      {
        text: '前端开发',
        items: [
          { text: '前端架构', link: '/frontend/overview' },
          { text: '认证集成', link: '/frontend/auth-integration' },
          { text: '主题系统', link: '/frontend/theme' }
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
        text: '最佳实践',
        items: [
          { text: '安全', link: '/best-practices/security' },
          { text: '性能优化', link: '/best-practices/performance' },
          { text: '测试', link: '/best-practices/testing' }
        ]
      },
      {
        text: '路线图',
        items: [
          { text: '升级路线图', link: '/roadmap/' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/yijiu2025/nodejsFaster' }
    ],

    footer: {
      message: '基于 MIT 许可发布',
      copyright: 'Copyright © 2026 Antigravity'
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
      pattern: 'https://github.com/yijiu2025/nodejsFaster/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页面'
    }
  }
})
