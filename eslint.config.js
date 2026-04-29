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
          arrowParens: 'always',
          endOfLine: 'auto',
          trailingComma: 'none'
        }
      ],

      // 5. Jest 测试规则
      ...jestPlugin.configs.recommended.rules,
      'jest/no-focused-tests': 'error'
    }
  },

  // 7. 禁用所有与 Prettier 冲突的规则 (作为兜底，必须放在数组最后)
  prettierConfig
];
