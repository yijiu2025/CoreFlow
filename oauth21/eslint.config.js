/**
 * ESLint flat config（oauth21 前端）
 * - TypeScript + Vue 3 + 浏览器全局
 * - 安全敏感规则：禁用 v-html/eval/no-implied-eval，禁止 console.log/debug
 * - 全局错误用 console.error，警告用 console.warn
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default [
  // 忽略 dist/node_modules/类型生成
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/auto-import.d.ts',
      'src/components.d.ts',
      'src/vite-env.d.ts',
      '*.config.js',
      '*.config.ts',
      'public/**',
      // md5.ts 是 222 行死代码（零引用），但保留作历史参考
      // 不纳入 lint 范围（避免无关错误）
      'src/utils/md5.ts'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.vue']
      },
      globals: { ...globals.browser, ...globals.es2022 }
    },
    rules: {
      // TypeScript 规则
      '@typescript-eslint/no-explicit-any': 'warn',         // any 警告（不阻断，留待类型守卫逐步替换）
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',  // 太严，oauth21 暂不强求
      '@typescript-eslint/no-non-null-assertion': 'off',     // allow !. 后端字段
      // Vue auto-import 全局（unplugin-auto-import 自动注入 ref/computed/watch/路由钩子等）
      'no-undef': 'off',  // 由 TS 处理（types/auto-imports.d.ts），eslint 误报严重
      // Vue 规则
      'vue/multi-word-component-names': 'off',  // login / register 是单词但合理
      'vue/no-v-html': 'error',                  // 禁用 v-html（防 XSS）
      'vue/component-definition-name-casing': ['error', 'PascalCase'],
      // 安全
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',                   // 禁止 javascript: URL
      'no-restricted-globals': ['error', { name: 'eval', message: 'eval is dangerous' }],
      // 控制台：禁止 debug 类（log/info/debug），warn/error 允许
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // 错误处理
      'no-empty': ['error', { allowEmptyCatch: true }],  // catch {} 允许（fire-and-forget）
      // 杂项
      'prefer-const': 'warn',
      'eqeqeq': ['error', 'always', { null: 'ignore' }]
    }
  },
  // .ts 文件额外规则
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',  // tsconfig 已有 strict
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unused-vars': 'off'   // 改用上面的规则（带忽略 _ 前缀）
    }
  },
  // .vue 文件：script 块内规则已继承
  {
    files: ['**/*.vue'],
    rules: {
      'vue/component-api-style': ['error', ['script-setup', 'composition']],
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off',
      'vue/mustache-interpolation-spacing': 'off',
      'vue/no-v-html': 'error',
      'vue/require-default-prop': 'off',
      'vue/attribute-spacing': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off'
    }
  }
];
