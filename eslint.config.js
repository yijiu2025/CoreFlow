import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import jestPlugin from 'eslint-plugin-jest';

export default [
  // 1. 基础 JS 推荐规则
  js.configs.recommended,

  {
    // 2. 针对所有 JS 文件的通用配置
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
        db: 'readonly' // 允许全局调用 db
      }
    },
    plugins: {
      prettier: prettierPlugin,
      jest: jestPlugin
    },
    rules: {
      // 3. 核心业务规则
      'no-unused-vars': [
        'warn',
        {
          vars: 'all', // 变量仍然检查
          args: 'none', // 函数参数完全不报错 (解决 reply 未使用问题)
          ignoreRestSiblings: true
        }
      ],
      'no-undef': 'error',
      // 后端禁止直接使用 console（统一走 framework/log），前端与测试目录暂不限制
      'no-console': 'off',
      camelcase: 'off',
      'no-unused-expressions': 'off',

      // 4. Prettier 规则集成 (建议设为 warn 避免干扰开发)
      'prettier/prettier': [
        'warn',
        {
          printWidth: 120,
          semi: true,
          singleQuote: true,
          arrowParens: 'avoid',
          endOfLine: 'auto',
          trailingComma: 'none'
        }
      ],

      // 5. Jest 测试规则
      ...jestPlugin.configs.recommended.rules,
      'jest/no-focused-tests': 'error',
      // expectCode 是项目自定义断言 helper（内部含 expect），识别为断言函数避免 expect-expect 误报
      'jest/expect-expect': ['warn', { assertFunctionNames: ['expect', 'expectCode'] }]
    }
  },

  // 5. 后端代码强制统一日志出口：禁止 console.*，一律走 src/framework/log
  {
    files: ['index.js', 'src/**/*.js', 'migrations/**/*.js', 'scripts/**/*.js', '*.mjs'],
    rules: {
      'no-console': 'error'
    }
  },

  // 5.1 日志框架自身是 console 的唯一合法使用点（底层输出通道）
  {
    files: ['src/framework/log/**/*.js'],
    rules: {
      'no-console': 'off'
    }
  },

  // 6. 浏览器环境共享包：packages 下实现为纯 JS（供 Jest 直接测试），
  //    运行在浏览器（window/document/localStorage/crypto 等），声明 browser globals
  {
    files: ['packages/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },

  // 6.1 packages 下的 Node 构建脚本（*.mjs）使用 node globals
  {
    files: ['packages/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },

  // 7. 禁用所有与 Prettier 冲突的规则 (作为兜底，必须放在数组最后)
  prettierConfig
];
