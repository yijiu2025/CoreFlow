# CI/CD {#cicd}

## GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env: { MYSQL_ROOT_PASSWORD: test, MYSQL_DATABASE: test }
        ports: ['3306:3306']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test -- --coverage
        env:
          DB_HOST: localhost
          DB_USER: root
          DB_PASS: test
          DB_NAME: test
          JWT_SECRET: test-secret-key-for-ci-only-32chars
          FIREWALL_SECRET: test-firewall-secret-ci-only

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: cd firewall && npm ci && npm run build
      - run: npm run build
```

## Swagger / OpenAPI

```bash
npm install @fastify/swagger @fastify/swagger-ui
```

```js
// src/app.js
await app.register(swagger, {
  openapi: {
    info: { title: 'Antigravity API', version: '2.0.0' },
    servers: [{ url: 'http://localhost:3000' }]
  }
});

await app.register(swaggerUI, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list' }
});
```

访问 `http://localhost:3000/docs` 查看交互式 API 文档。
