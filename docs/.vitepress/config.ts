import { defineConfig } from 'vitepress';

/**
 * 部署子路径（GitHub Pages 项目站点是 `/<repo>/`，不是域名根）
 *
 * 本地 `npm run docs:dev` 走 `/`；CI 构建站点时用 `DOCS_BASE=/CoreFlow/`。
 * 站点内链由 vitepress 自动补前缀，但 `head` 里的资源路径是原样输出的，
 * 所以下面统一用 `BASE` 拼接，避免把 `/logo.svg` 写死成"根目录资源"
 * （部署到 /CoreFlow/ 后它就变成 404，浏览器标签页静默丢图标）。
 */
const BASE = process.env.DOCS_BASE || '/';

// 校验而不是"猜一个能用的值"：base 写错的表现是**部署后站内链接全 404**，
// 而构建本身完全成功 —— 静默回退到 '/' 只会把问题推到线上。
// 典型踩法：Git Bash / MSYS 会把 `DOCS_BASE=/CoreFlow/` 转成 `D:/.../CoreFlow/`，
// 于是这里拿到的是 Windows 绝对路径（含盘符冒号）。本地验证请用
//   MSYS_NO_PATHCONV=1 DOCS_BASE=/CoreFlow/ npx vitepress build docs
if (!/^\/[\w./-]*$/.test(BASE) || BASE.includes(':')) {
  throw new Error(
    `DOCS_BASE 必须是站点绝对路径（形如 /CoreFlow/），当前为 "${BASE}"。\n` +
      'Windows 本地构建若被 MSYS 改写成盘符路径，请加 MSYS_NO_PATHCONV=1 前缀。'
  );
}

/**
 * 死链检查放行名单
 *
 * 这些目标都在 **docs/ 之外**（workspace 包 `packages/*`、仓库根 `AGENTS.md`、独立前端仓）——
 * 文档里用相对路径指过去是**有意为之**：给开发者指路到真实源码。
 * 但 vitepress 只能解析 docs 内的文档路由，本来就无法校验这类目标，
 * 于是 `docs:build` 会因这几条报错而失败（文档站无法构建）。
 *
 * 这里按前缀精确放行，**不覆盖 docs 内部的链接** —— 站内真死链依旧会拦住 build。
 *
 * 允许 0–3 层 `../`：`archive/legacy-frontend/` 下的归档文档比主目录深两层，
 * 指向仓库根的写法是 `../../../packages/...`。
 */
const IGNORE_DEAD_LINKS = [/^\.\/?\.\.?\/(\.\.\/){0,3}(AGENTS|oauth21|posecraft|packages)(\/|$)/];

const SOCIAL_LINKS = [{ icon: 'github', link: 'https://github.com/yijiu2025/CoreFlow' }];

/**
 * 中文（默认语言，站点根路径）
 *
 * 中文是**主语言**：内容与代码同步维护，英文页按需增量翻译（见 /translation-status）。
 */
const ZH_THEME = {
  // themeConfig 里的图片/logo 由 vitepress 按 base 处理，保持站点绝对路径即可
  logo: '/logo.svg',

  nav: [
    { text: '指南', link: '/guide/introduction', activeMatch: '/guide/' },
    { text: '核心', link: '/core/architecture', activeMatch: '/core/' },
    { text: '开发', link: '/development/app-module', activeMatch: '/development/' },
    { text: '规范', link: '/standards/git-release-rules', activeMatch: '/standards/' },
    { text: '部署', link: '/deployment/docker', activeMatch: '/deployment/' },
    { text: '路线图', link: '/roadmap/', activeMatch: '/roadmap/' },
    {
      text: '相关链接',
      items: [
        { text: 'GitHub', link: 'https://github.com/yijiu2025/CoreFlow' },
        { text: 'OAuth 前端仓（oauth-web）', link: 'https://github.com/yijiu2025/oauth-web' },
        { text: 'Fastify', link: 'https://fastify.dev/' },
        { text: 'Sequelize', link: 'https://sequelize.org/' }
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
        { text: '数据库迁移', link: '/development/migrations' },
        { text: '代码审查标准与流程', link: '/development/code-review' },
        { text: '注册登录全链路流程图', link: '/development/注册登录全链路流程图' },
        { text: 'OAuth 2.1 API 报告', link: '/oauth21-api-report' }
      ]
    },
    {
      text: '后端规范',
      items: [
        { text: 'Git 提交与发版规则', link: '/standards/git-release-rules' },
        { text: '认证集成（前后端线协议）', link: '/standards/auth-integration' },
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
        { text: '私钥信封加密', link: '/deployment/key-encryption' },
        { text: '多服务器架构', link: '/deployment/multi-server' },
        { text: 'CI/CD', link: '/deployment/cicd' }
      ]
    },
    {
      text: '路线图',
      items: [{ text: '升级路线图', link: '/roadmap/' }]
    },
    {
      text: '归档（不再维护）',
      items: [{ text: '归档索引（含已迁出的前端文档）', link: '/archive/' }]
    }
  ],

  socialLinks: SOCIAL_LINKS,

  footer: {
    // 许可证必须与仓库根 LICENSE 一致：根包与 LICENSE 都是 GPL-3.0
    message: '基于 GPL-3.0 许可发布',
    copyright: 'Copyright © 2026 CoreFlow'
  },

  search: {
    provider: 'local' as const,
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
    level: [2, 3] as [number, number]
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
};

/**
 * 英文（`/en/` 前缀）
 *
 * 只挂**已经翻译过**的页面 —— 目录里没有的页面不进侧边栏，避免造出一批死链。
 * 未翻译的页面统一由 /en/translation-status 给出中文入口。
 */
const EN_THEME = {
  logo: '/logo.svg',

  nav: [
    { text: 'Guide', link: '/en/guide/introduction', activeMatch: '/en/guide/' },
    { text: 'Core', link: '/en/core/architecture', activeMatch: '/en/core/' },
    { text: 'Integration', link: '/en/standards/auth-integration', activeMatch: '/en/standards/' },
    { text: 'Deployment', link: '/en/deployment/docker', activeMatch: '/en/deployment/' },
    { text: 'Translation status', link: '/en/translation-status', activeMatch: '/en/translation-status' },
    {
      text: 'Links',
      items: [
        { text: 'GitHub', link: 'https://github.com/yijiu2025/CoreFlow' },
        { text: 'OAuth frontend (oauth-web)', link: 'https://github.com/yijiu2025/oauth-web' },
        { text: 'Fastify', link: 'https://fastify.dev/' },
        { text: 'Sequelize', link: 'https://sequelize.org/' }
      ]
    }
  ],

  sidebar: [
    {
      text: 'Getting started',
      items: [
        { text: 'Introduction', link: '/en/guide/introduction' },
        { text: 'Quick start', link: '/en/guide/quick-start' },
        { text: 'Project structure', link: '/en/guide/project-structure' }
      ]
    },
    {
      text: 'Core concepts',
      items: [
        { text: 'Architecture', link: '/en/core/architecture' },
        { text: 'Authentication', link: '/en/core/auth' },
        { text: 'Permissions (PBAC)', link: '/en/core/permission' },
        { text: 'Three-level guard', link: '/en/core/guard' }
      ]
    },
    {
      text: 'Development',
      items: [{ text: 'Building an app module', link: '/en/development/app-module' }]
    },
    {
      text: 'Integration',
      items: [{ text: 'Auth integration (wire protocol)', link: '/en/standards/auth-integration' }]
    },
    {
      text: 'Best practices',
      items: [{ text: 'Security', link: '/en/standards/best-practices/security' }]
    },
    {
      text: 'Deployment',
      items: [{ text: 'Docker', link: '/en/deployment/docker' }]
    },
    {
      text: 'Reference',
      items: [{ text: 'Translation status', link: '/en/translation-status' }]
    }
  ],

  socialLinks: SOCIAL_LINKS,

  footer: {
    message: 'Released under the GPL-3.0 license',
    copyright: 'Copyright © 2026 CoreFlow'
  },

  search: {
    provider: 'local' as const,
    options: {
      translations: {
        button: { buttonText: 'Search docs', buttonAriaLabel: 'Search docs' },
        modal: {
          noResultsText: 'No results found',
          resetButtonTitle: 'Reset search',
          footer: { selectText: 'select', navigateText: 'navigate', closeText: 'close' }
        }
      }
    }
  },

  outline: {
    label: 'On this page',
    level: [2, 3] as [number, number]
  },

  docFooter: {
    prev: 'Previous page',
    next: 'Next page'
  },

  lastUpdated: {
    text: 'Last updated'
  },

  editLink: {
    pattern: 'https://github.com/yijiu2025/CoreFlow/edit/main/docs/:path',
    text: 'Edit this page on GitHub'
  }
};

export default defineConfig({
  base: BASE,

  /**
   * 多语言：`root` = 中文（主语言，站点根路径），`en` = 英文（`/en/` 前缀）。
   *
   * 语言切换器由 vitepress 依据 `locales` 自动生成，不需要手写。
   * 新增语种只需：① 在此加一个 locale；② 建 `docs/<lang>/` 目录；
   * ③ 在该语言的 themeConfig 里只挂已翻译页面。
   */
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'CoreFlow',
      description: '企业级 Node.js 后端框架：认证 · PBAC 权限 · 五层防火墙 · OAuth 2.1',
      themeConfig: ZH_THEME
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'CoreFlow',
      description:
        'Enterprise Node.js backend framework: authentication, PBAC permissions, five-layer firewall, OAuth 2.1',
      themeConfig: EN_THEME
    }
  },

  ignoreDeadLinks: IGNORE_DEAD_LINKS,

  head: [['link', { rel: 'icon', href: `${BASE}logo.svg` }]]
});
