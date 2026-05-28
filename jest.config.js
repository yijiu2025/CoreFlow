export default {
  testEnvironment: 'node',
  transform: {}, // ESM 下通常不需要 Babel 转译
  testMatch: ['**/src/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/api/**/*.js',
    'src/auth/**/*.js',
    'src/firewall/engine/**/*.js',
    'src/redis/**/*.js',
    'src/log/**/*.js',
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
