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
          // 必须与 .prettierrc.json / .gitattributes 同为 lf：
          // 写成 'auto' 时 `eslint --fix` 会保留 CRLF，与仓库「只允许 LF」的判据打架。
          endOfLine: 'lf',
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

  // 2.1 ESLint flat config 的 `**/*.js` 不匹配 `.mjs`，ESM 脚本因此拿不到 Node globals，
  //     process / fetch 等一律报 no-undef。此处单独补齐（仅补 globals，不扩大规则面）。
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: 'readonly' // Node 18+ 全局，部分 globals 版本未收录
      }
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
    files: ['src/framework/support/log/**/*.js'],
    rules: {
      'no-console': 'off'
    }
  },

  // 5.2 导出位置约定：所有 export 一律收拢到文件末尾，定义处不写 export 关键字。
  //     正确：function foo() {}  ...  export { foo };  /  export default foo;
  //     禁止：export function foo() {}  /  export default () => {}  /  export const x = 1
  //     理由见 docs/development/development-standards.md「导出位置」：定义与导出分离，导出面一眼可见，
  //     避免导出散落各处导致模块契约难以审计。
  {
    files: ['src/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > FunctionDeclaration',
          message: '导出须放在文件末尾：去掉定义处的 `export`，改为在文件末尾统一 `export { name };`'
        },
        {
          selector: 'ExportNamedDeclaration > ClassDeclaration',
          message: '导出须放在文件末尾：去掉定义处的 `export`，改为在文件末尾统一 `export { Name };`'
        },
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration',
          message: '导出须放在文件末尾：去掉定义处的 `export`，改为在文件末尾统一 `export { name };`'
        },
        {
          selector: 'ExportDefaultDeclaration:not(:has(> Identifier))',
          message: '默认导出须放在文件末尾：先把值命名（`const x = ...`）或把函数具名化，再在末尾 `export default x;`'
        }
      ]
    }
  },

  // 5.3 vendored 镜像文件：`scripts/jest/shims/*.cjs` 是上游包的 CJS 逐字镜像
  //     （由 scripts/jest/shims/build-cookie-shim.mjs 生成，文件头明确"请勿手改"），
  //     不该按本仓风格改写 —— 改它就等于让镜像与真包行为不一致。
  //     这里只关掉与"生成代码"冲突的三条规则，其余检查照常。
  //     （2026-11-08：这三条让 CI 的 Lint 关卡长期变红，而本地 `eslint <file>` 才会暴露）
  {
    files: ['scripts/jest/shims/**/*.cjs'],
    rules: {
      'no-case-declarations': 'off',
      'no-useless-escape': 'off',
      'no-unused-vars': ['warn', { vars: 'all', args: 'none', ignoreRestSiblings: true }]
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
