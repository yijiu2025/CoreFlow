export default {
  testEnvironment: 'node',
  transform: {}, // ESM 下通常不需要 Babel 转译
  // `cookie@2` 是纯 ESM，而 `light-my-request@6`（fastify `app.inject()` 的实现）是 CJS，
  // 里面静态 `require('cookie')`：Node ≥ 24.9 时 jest 30 能原生 require(esm)，
  // Node 22.x 会落到 `createRequireEsmError` → 凡走 app.inject() 的用例全部挂在
  // `node_modules/light-my-request/lib/cookies.js:3`（"Must use import to load ES Module"）。
  // 映射到 CJS 镜像（`.cjs` 保证按 CJS 加载，不受根 package.json "type":"module" 影响）。
  // 语义来源与维护约定见 scripts/jest/shims/cookie.cjs 头注释；真包升级会由
  // src/__tests__/test-env-cookie-shim.test.js 拦下。
  moduleNameMapper: {
    '^cookie$': '<rootDir>/scripts/jest/shims/cookie.cjs'
  },
  // 两个测试根：
  //   src/__tests__/**  服务端运行时代码
  //   scripts/**        构建/发布工具（纯函数逻辑住 scripts/lib/，测试与它同目录）
  // 工具类逻辑不再为了「能被 jest 收集」而塞进 src/ —— 那会把发布逻辑伪装成框架能力。
  testMatch: ['**/src/__tests__/**/*.test.js', '**/scripts/**/*.test.js'],
  // ⚠️ 必须显式排除 `.tmp-probe/`：那是仓库唯一约定的临时目录，
  //    而 `**/src/__tests__/**` 会匹配到其中**任意一份仓库副本**里的测试
  //    （探测脚本常用 `git archive` 造副本）。后果不是"多跑几个用例"，而是
  //    jest-haste-map 报模块重名（两份 package.json 同名）乃至
  //      Error: Cannot parse .../package.json as JSON: Unexpected end of JSON input
  //    直接把整次 `npm test` 打断 —— 本地看着像代码坏了，实际只是探测残留。
  //    实测 2026-09-21。
  testPathIgnorePatterns: ['/node_modules/', '/\\.tmp-probe/'],
  modulePathIgnorePatterns: ['/\\.tmp-probe/'],
  // 覆盖范围按**当前目录结构**收集。
  // 旧配置写的是 src/auth、src/firewall/engine、src/redis、src/log —— 这四个目录
  // 在 2026-09 的 framework 重整里已经搬到 src/framework/* 与 src/app/firewall/engine，
  // 留下来等于 `--coverage` 只统计 src/api 一处、其余静默为空，覆盖率数字是假的高。
  collectCoverageFrom: [
    'src/api/**/*.js',
    'src/app/**/*.js',
    'src/framework/**/*.js',
    'src/utils/**/*.js',
    'src/shared/**/*.js',
    '!src/**/__tests__/**',
    '!src/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 40,
      lines: 40,
      statements: 40
    }
  }
};
