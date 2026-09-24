# 页面版式（UI）目录

`themes/` 下有两层**正交**的呈现可换项：

| 层 | 目录 | 换的是什么 | 换法 |
| --- | --- | --- | --- |
| 皮肤 | `themes/<id>/` | 颜色 / 圆角 / 背景图 / 字体，**同一套 DOM** | `?theme=` / 后端下发 / localStorage |
| 版式 | `themes/app/<page>/<id>/` | **DOM 结构与交互组织**，同一套业务 | `?view=` / 主题包 `views` / `VITE_<PAGE>_VIEW` |

两者可任意组合：`?theme=ocean&view=compact` 就是"海蓝配色 + 轻版式"。

两层的 id **都取自目录名**：皮肤 = `themes/<目录名>/`，版式 = `themes/app/<page>/<目录名>/`。
目录名只允许 `[a-z0-9-]`，并且**就是** `data-mauth-theme` / `data-mauth-view` 的属性值
—— 所以目录名是唯一真源，包/组件里再写一个别的 id 不会生效（会被目录名覆盖或直接对不上选择器）。

## 业务容器 + 版式

```
view/app/<page>/index.vue                业务容器：状态 / 校验 / 请求 / 路由 / 浮层 / 倒计时
       │  传 ctx（<Page>ViewContext）
       ▼
themes/app/<page>/base/index.vue         基础版式（默认，容器**静态引入**）
themes/app/<page>/<variant>/index.vue    变体（`import.meta.glob` **惰性**加载）

已接入：register（base + compact）· login（base）· forgot-password（base）
```

- **业务只有一份**，永远在容器里；版式只读 `ctx`、只调 `ctx.actions`。
- **版式里不要写**：任何请求、校验、`router.push`、store 读写，以及"该不该拦"的判断。
- **版式里可以写**：布局、样式、静态装饰，以及纯展示用的局部状态（如密码明文开关）。

## 目录结构

```
themes/app/
├── registry.ts                版式注册表工厂（本文件是机制，一般不用动）
├── pages.ts                   汇总各页注册表（供 ?debug=theme 面板列出，**新增页面不用改**）
├── register/                  <page> = 目录名 = 路由 path 末段
│   ├── types.ts               该页的契约（纯类型，**唯一接口**）
│   ├── registry.ts            本页的注册表 + 选择优先级
│   ├── base/index.vue         **基础版式**：容器静态引入，默认路径零额外请求
│   └── compact/index.vue      变体：惰性加载，切成独立 chunk
├── login/                     { types.ts, registry.ts, base/ }
└── forgot-password/           { types.ts, registry.ts, base/ }
```

⚠️ 目录名含连字符时，主题包里声明版式的键名必须与目录名**逐字一致**：
`views: { 'forgot-password': '<id>' }`（写成驼峰或下划线都匹配不上）。

⚠️ 本目录**不要放 `index.ts`**：`themes/index.ts` 的主题扫描器扫「一层子目录 + `index.ts`」，
会把它当成一个 id 为 `app` 的主题。汇总文件叫 `pages.ts` 就是为了避开这个。

`base` 刻意**不**进 `import.meta.glob` 的变体表 —— 它是绝大多数访问的默认路径，
让它多等一个网络往返不划算。

## 选择优先级（高 → 低）

1. URL `?view=<id>`
2. 主题包声明 `themes/<id>/index.ts` 的 `views: { register: '<id>' }`
3. `VITE_<PAGE>_VIEW`（部署级默认，整站换 UI 不动代码）
4. `base`

`<PAGE>` 为大写下划线形式，各页一枚：`VITE_REGISTER_VIEW` / `VITE_LOGIN_VIEW` /
`VITE_FORGOT_PASSWORD_VIEW`（定义在各页 `registry.ts` 顶部的 `ENV_VIEW`）。

⚠️ 第 1 档**非法值不回退**：`?view=typo` 直接落基础版式，而不是被第 2/3 档接管 ——
显式参数写错时静默换成另一套 UI，比看到默认版式更难排查。

## 加一套版式

1. 建目录 `themes/app/<page>/<id>/` —— **目录名就是版式 id**（只能 `[a-z0-9-]`，
   会成为 `data-mauth-view` 的属性值）。**不用改该页的 `registry.ts`**：
   它用 `import.meta.glob` 扫同层目录，新目录自动登记。
2. 写 `index.vue`：`const props = defineProps<<Page>ViewProps>()`，然后照着 `ctx` 渲染，
   且**只调 `ctx.actions.*`**（不要在版式里碰请求 / 校验 / 路由）。
3. 需要自己的结构样式就写 `<style lang="scss" scoped>`，**取值一律用 `--mauth-*` token**
   （裸色值会在换皮肤 / 切深色时漏色）；能复用的（字段、按钮、摘要、协议、页脚）
   直接复用 `assets/styles/mobile-auth.scss` 的 `mauth-*` 类。
4. **重启 dev server**（`import.meta.glob` 在启动时静态扫描，新目录热更新发现不了）。
5. 访问 `?view=<id>` 看效果（组合验证：`?theme=ocean&view=<id>` ）。

参考实现照抄 `register/compact/`（目前唯一落地的变体）；三页的 `base/` 是"忠实搬运原模板、
不带 `<style>`"的范例。

## 两条容易踩的线

- **基础版式不要自带 `<style>`**：它是三页（登录 / 注册 / 重置密码）共用样式
  `assets/styles/mobile-auth.scss` 的消费方，自带样式块会让各页各自漂移 ——
  历史上"两页看起来不一样"都源于此。变体不受这条约束（它本来就是"另一套 UI"），
  但要遵守上面的 token 规则。
- **改契约要同步两边**：容器组装 `ctx` 时有编译期自检（`assertRegisterContract` /
  `assertLoginContract` / `assertForgotPasswordContract`，各页一枚，在容器 `index.vue` 里），
  改 `types.ts` 后容器与所有版式都会在类型检查时报错，不会悄悄跑偏。
- **契约要能"真的拦住"**：类型闸门自身也可能空转（见 `docs/frontend/coding-standard.md`
  的「类型闸门必须是"真检查"」）。改完 `types.ts` 临时写一行 `export const __p: number = 'x';`，
  跑 `npm run type-check` 必须报错，撤销后恢复绿 —— 恒绿的闸门等于没有闸门。
