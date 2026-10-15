# 前端性能工程规则

> 核心原则：**先量后改、按需加载、防回归靠守门**。
>
> - **先量后改** —— 没有生产构建 + 真实浏览器的实测数字，不动一行构建配置；
> - **按需加载** —— 首屏只带"打开页面立刻要用"的东西，其余全部懒加载；
> - **防回归靠守门** —— 性能退化**功能一切正常、没有任何功能测试会红**，必须用预算关卡把体积钉成硬线。
>
> 本规范跨项目通用（Vite + Vue/React 单页应用均可）。落地案例：`../oauth21/docs/frontend/performance-tuning.md`（2026-10-15，含完整实测数据）。

---

## 规则 1：优化之前先量 —— 没有实测数字不动手

**dev server 的请求数与体积没有参考价值**（每个模块一次独立请求、无 tree-shaking、无压缩）。唯一有效口径 = **生产构建产物 + 真实浏览器**。

最小工具链（任何项目 10 分钟内可搭）：

```bash
npm run build                                    # 生产构建
npx vite preview --port 5189 --strictPort &      # 静态预览（自带 brotli，接近 CDN 实况）
# 用 Playwright/CDP 打开页面，记录 Network.loadingFinished.encodedDataLength（过线字节）
```

至少量四个数：**首屏请求数 / 首屏过线字节 / 首屏静态集（HTML 引用的 assets）体积 / 交互增量请求数**。

反模式（真实发生过）：

- 凭感觉把 `chunkSizeWarningLimit` 抬到 1024"消除告警"—— 告警是资产，掩盖它等于拆了仪表盘；
- 没量就给"已经是优化"的模块再加一层懒加载 —— 可能只是把加载推迟几毫秒，还多一层瀑布（见规则 3）。

---

## 规则 2：构建期优化清单（Vite）

| 项目 | 做法 | 坑 / 注意 |
| --- | --- | --- |
| **代码分割** | 路由组件全部动态 import（`() => import(...)`）；页面目录用 `import.meta.glob` 自动生成路由 | glob 路径必须是**字面量**（编译期静态分析，不能用变量拼） |
| **vendor 分包** | `manualChunks` 按「变更频率 + 体积」分组：框架层（vue/pinia/router/i18n 最稳定）/ 表单校验层 / 网络层，各归各 chunk | 分组过细只加请求数不省流量；不为"看起来整洁"拆分首屏都要用的包 |
| **压缩** | 默认 minify 已开（Oxc/esbuild）；删 console 走 **minifier 的 compress 选项** | 🔴 **Vite 8 = Rolldown + Oxc**：`build.esbuild.drop: ['console']` **已失效**，须写 `rolldownOptions.output.minify.compress.dropConsole`。且**别退回 terser**（慢 30~90x，只为删 console 不值得） |
| **sourcemap** | 生产 `sourcemap: false`（防源码泄露）；调试时临时单独开 | 开了忘了关 = 把源码贴到公网 |
| **target** | **不显式设** | Vite 8 默认 `baseline-widely-available`（≈chrome107/safari16）已是最佳平衡；手写 `es2020` 反而比它宽、还让配置落后于上游默认值 |
| **polyfill** | 按受众决策，默认可关 `build.modulePreload.polyfill` | 原生 modulepreload = Chrome 66+/Safari 16.4+。不支持的要么连 ESM 都跑不了（无从救起）、要么只损预加载加速（功能无损）。登录态/内网老 Safari 场景再打开 |
| **chunk 告警线** | 保持默认 500 KB | 它是膨胀探针。实测最大 chunk 远低于它时也不要抬高——抬高=拆除探针 |

配置注释规范：**每个非默认取值旁必须写"为什么"**（含实测数字与日期）。构建配置的坑从来不是"不会写"，而是"写过、生效条件变了、没人知道"——注释是唯一防回归的文档。

---

## 规则 3：懒加载决策树 —— 什么时候"不懒加载"才是对的

动态 import 不是免费优化，先过这张判据表：

| 场景 | 决策 | 理由 |
| --- | --- | --- |
| 路由级页面 / 弹窗 / 次要 Tab 内容 | ✅ 懒加载 | 首屏用不到 |
| 入口 HTML 静态图已覆盖的依赖 | ⛔ 不懒 | modulepreload 已并行预载，再拆只加请求 |
| **挂载时立即自动触发**的模块 | ⛔ 不懒 | 动态 import 只把加载推迟到挂载后几毫秒，还多一层瀑布，**总流量不变 = 负优化** |
| 同一 chunk 内多路由共用 | ⛔ 不懒 | 拆了互相等，谁都少不了 |
| 为"切换不闪屏"刻意预热多形态 | ✅ 可静态 | 用少量首屏流量换 0 增量请求（见规则 8 差分验证） |

判据核心：**懒加载省的是"首屏带宽"，不是"总带宽"**。如果一个模块在页面打开后 1 秒内必然被使用，懒加载它没有任何收益。

> 案例：某登录页二维码 composable（含 qrcode 库，9 KB gz）曾被判定"应该懒加载"，实测其 `onMounted` 里有 `hasAppName → generate()` 自动生成 —— 动态 import 后总流量一分不减、二维码出现还慢了一拍。**结论：不动，并把分析过程写进文档**（见附录 B）。

---

## 规则 4：资源压缩 —— SVG 安全压缩子集

对导出的 SVG（图标/插画）做**安全子集**压缩，三删三不删：

**做**：

1. 删等于默认值的属性（`fill-opacity:1`、`stroke-opacity:1`）；
2. 删与 `style` 链重复的 presentation attribute（style 永远优先，值还一样）；
3. 小数**按量级自适应**降精度：`|v| ≥ 0.1` 保留 2 位，`|v| < 0.1` 保留 4 位。

**不做**：删 filter / mask、改路径方向、合并节点 —— 都有视觉风险，而静态资源只在标签页/首屏加载一两次，不值得为它付风险。

🔴 **血泪教训（2026-10-15 实测翻车）**：无脑 `round(v, 2)` 会把 `matrix(.00324 1 1 -.00324 …)` 里的**微缩放因子归零**，装饰椭圆当场压扁，G 通道最大色差 27/255（肉眼可见）。**小于 0.1 的值往往是矩阵/比例参数，不是坐标。**

**验证方法（缺一不可）**：

1. 同文件渲染两次做**对照**，排除浏览器渲染噪声（Chrome headless 确定性渲染时对照为 0 才说明测量可信）；
2. 看差异的**量级分布**而非最大值：99.99% 像素 Δ≤7/255、个别像素位于高梯度边缘 → 放行；出现成片 Δ>15 → 回滚。

---

## 规则 5：防回归守门 —— 预算关卡（本规范最重要的复用件）

性能退化是**沉默的**：加一个同步 import、vendor 多引一个 API，功能测试全绿、页面肉眼无差，只有用户首屏流量在涨。把体积钉成硬预算，超线即红。

**关卡设计五要素**（照此模板写，任何项目可抄）：

1. **读落盘后的真实字节**，不信任构建日志的逐文件估算值（不同打包器算法会变）；
2. 压缩口径用 `zlib.gzip(level 6)` 自算 —— 与 nginx `gzip on` 默认级别、CDN 通用口径一致；
3. **预算线 = 显式性能决策**：改线必须同步改注释里的实测基线并写清理由，禁止"红了就抬线"；
4. **毒丸自证**：`--poison` 把预算线压到 -1 重跑，必须全部断言失败（exit 1）。恒绿的关卡等于没关卡；
5. 退出码语义：`0` 预算内 / `1` 超预算 / `3` 产物不存在（环境未就绪，接入统一关卡入口时按"跳过"处理而非"失败"）。

**预算线模板**（数值按本项目实测钉，留 10~25% 余量）：

| 预算项 | 建议线 | 说明 |
| --- | --- | --- |
| 首屏静态集 gzip 总量 | ≤ 150 KB | = index.html 引用的全部 assets；首屏流量的主体 |
| 首屏静态集文件数 | ≤ 12 | 防"把按需 chunk 提回静态图" |
| 单 chunk gzip / raw | ≤ 60 / 200 KB | 最大 chunk 的早期探针（比构建告警线更严） |
| dist 总量 | ≤ 1 MB | 全量产物上限 |
| index.html | ≤ 8 KB | 唯一不能长缓存的文档，必须小巧 |

参考实现：`oauth21/e2e/verify-bundle-budget.mjs`（含毒丸模式与 Top-N 体积报表，CI 日志里可直接看趋势）。

---

## 规则 6：部署层 —— 压缩与缓存分级

构建做得再好，线上不开压缩全白搭（211 KB 的 brotli 首屏在裸奔服务端是 ~580 KB）。按产物特征分级：

```nginx
# 压缩：brotli 优先（JS/CSS/SVG 再小 15~25%），gzip 兜底
brotli on;  brotli_comp_level 6;
brotli_types text/css application/javascript application/json image/svg+xml;
gzip on;    gzip_comp_level 6;
gzip_types text/css application/javascript application/json image/svg+xml;
gzip_min_length 1024;

# 缓存：/assets/ 全带内容 hash → 强缓存一年
location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
# 例外：index.html 是版本指针，sw.js 是自毁迁移载体 —— 绝不强缓存
location = /       { add_header Cache-Control "no-cache"; }
location = /sw.js  { add_header Cache-Control "no-cache"; }
# public 直出文件（favicon 等，无 hash）：短缓存 + 需验证
location ~* \.(svg|png|woff2?)$ { expires 7d; add_header Cache-Control "public, must-revalidate"; }

# SPA fallback + HTTP/2（首屏几十个请求，H2 多路复用是硬需求）
location / { try_files $uri $uri/ /index.html; }
```

> 🔴 **SPA fallback 会吃掉不存在的静态资源请求**：HTML 里引一个 `public/` 里没有的文件，浏览器拿到的是 200 的 index.html（直接丢弃），症状是"图标静默失效 + 每次访问白背几 KB HTML"，且**没有任何报错**。发版前核对 HTML 引用与 `public/` 目录。

---

## 规则 7：指标定义与目标值

**核心 Web Vitals**（Lighthouse / Chrome UX Report 口径）：

| 指标 | 目标 | 测量要点 |
| --- | --- | --- |
| LCP | ≤ 2.0s（4G 中位） | 首屏静态集体积 + 无渲染阻塞外链是主变量 |
| INP | ≤ 200ms | 轮询/定时任务密度、同步大计算是主要风险源 |
| CLS | ≤ 0.1 | 容器尺寸 CSS 锁定、图片区固定占位 |
| TTFB | ≤ 300ms（同域） | 前端侧只影响 HTML 大小，主因在后端 |

**工程指标**（可自测、可入 CI）：

| 指标 | 目标 | 工具 |
| --- | --- | --- |
| 首屏静态集 gzip | 预算关卡硬守（规则 5） | 预算关卡脚本 |
| 首屏总流量（含按需） | ≤ 220 KB | 网络清单测量脚本 |
| 视口/设备切换增量请求 | 0 | 网络清单测量（多形态预热的设计回报） |
| 非必要 chunk 首屏加载 | 0 | 浏览器请求清单差分断言 |
| 构建耗时 | ≤ 10s | `npm run build` 计时 |

监控接入：`web-vitals` 包 + 现有错误上报通道（若有 `/client-error` 类端点，改后端接收即可）；Lighthouse CI 只做趋势对比，不做绝对门槛（SPA 分数对 TTFB 敏感）。

---

## 规则 8：验证方法论 —— 让每个结论可证伪

| 手法 | 用途 | 要点 |
| --- | --- | --- |
| **正向对照** | 证明探针看得见差异、不是恒绿 | 例：不带参数时非内置包 chunk = 0，`?view=X` 时该 chunk 必须出现 |
| **差分断言** | 证明某参数不改变结果 | 例：非法参数与无参场景逐项一致 |
| **渲染对照** | 证明压缩视觉无损 | 同文件渲染两次排除噪声，再看 Δ 分布（规则 4） |
| **毒丸自证** | 证明关卡会红 | 预算归零/故意改坏实现，关卡必须失败（规则 5） |

---

## 附录 A：新项目接入清单（5 分钟）

```bash
# 1. 建基线（先量）
npm run build && npx vite preview --port 5189 --strictPort &
node measure-load-budget.mjs http://127.0.0.1:5189 dist --block-sw   # 抄 oauth21/e2e/ 下的脚本

# 2. 对清单（规则 2 表格逐项核对 vite.config，每个非默认值写"为什么"注释）

# 3. 钉预算（抄 oauth21/e2e/verify-bundle-budget.mjs，按实测钉线，跑 --poison 自证）

# 4. 接 CI（预算关卡进静态关卡组；产物不存在 → exit 3 跳过而非误红）

# 5. 核部署（nginx 片段落地，核对 HTML 引用 vs public/ 目录）
```

## 附录 B：决策记录模板 —— "刻意不动"也要写

优化文档里最有复用价值的往往不是"改了什么"，而是"分析后决定不改什么"。每项按此格式记录：

```
对象：<模块/配置>
候选动作：<想做的优化>
结论：不动
判据：<实测数字 / 调用链事实>（例：onMounted 自动触发 → 懒加载总流量不变）
风险：<如果做了会怎样>（例：多一层瀑布、二维码出现变慢）
```

三条来源：`../oauth21/docs/frontend/performance-tuning.md` §1.4 / §2.4 有完整实例（useQrLogin 不懒加载、form-vendor 不拆分、target 不显式设）。
