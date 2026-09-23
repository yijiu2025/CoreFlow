# 页面版式（UI）目录

`themes/` 下有两层**正交**的呈现可换项：

| 层 | 目录 | 换的是什么 | 换法 |
| --- | --- | --- | --- |
| 皮肤 | `themes/<id>/` | 颜色 / 圆角 / 背景图 / 字体，**同一套 DOM** | `?theme=` / 后端下发 / localStorage |
| 版式 | `themes/app/<page>/<id>/` | **DOM 结构与交互组织**，同一套业务 | `?view=` / 主题包 `views` / `VITE_<PAGE>_VIEW` |

两者可任意组合：`?theme=ocean&view=compact` 就是"海蓝配色 + 轻版式"。

## 业务容器 + 版式

```
view/app/register/index.vue            业务容器：状态 / 校验 / 请求 / 路由 / 验证码 / 倒计时
       │  传 ctx（RegisterViewContext）
       ▼
themes/app/register/base/index.vue     基础版式（默认）
themes/app/register/compact/index.vue  变体（懒加载）
```

- **业务只有一份**，永远在容器里；版式只读 `ctx`、只调 `ctx.actions`。
- **版式里不要写**：任何请求、校验、`router.push`、store 读写，以及"该不该拦"的判断。
- **版式里可以写**：布局、样式、静态装饰，以及纯展示用的局部状态（如密码明文开关）。

## 目录结构

```
themes/app/
├── registry.ts                版式注册表工厂（本文件是机制，一般不用动）
└── register/                  <page> 与页面同名
    ├── types.ts               该页的契约（纯类型，**唯一接口**）
    ├── registry.ts            本页的注册表 + 选择优先级
    ├── base/index.vue         **基础版式**：容器静态引入，默认路径零额外请求
    └── compact/index.vue      变体：惰性加载，切成独立 chunk
```

`base` 刻意**不**进 `import.meta.glob` 的变体表 —— 它是绝大多数访问的默认路径，
让它多等一个网络往返不划算。

## 选择优先级（高 → 低）

1. URL `?view=<id>`
2. 主题包声明 `themes/<id>/index.ts` 的 `views: { register: '<id>' }`
3. `VITE_REGISTER_VIEW`（部署级默认）
4. `base`

⚠️ 第 1 档**非法值不回退**：`?view=typo` 直接落基础版式，而不是被第 2/3 档接管 ——
显式参数写错时静默换成另一套 UI，比看到默认版式更难排查。

## 加一套版式

1. 建目录 `themes/app/<page>/<id>/`（`<id>` 只能 [a-z0-9-]，会成为 `data-mauth-view` 的值）。
2. 写 `index.vue`：`const props = defineProps<RegisterViewProps>()`，然后照着 `ctx` 渲染。
3. 需要自己的结构样式就写 `<style lang="scss" scoped>`，**取值一律用 `--mauth-*` token**
   （裸色值会在换皮肤 / 切深色时漏色）；能复用的（字段、按钮、摘要、协议、页脚）
   直接复用 `assets/styles/mobile-auth.scss` 的 `mauth-*` 类。
4. **重启 dev server**（`import.meta.glob` 在启动时静态扫描，新目录热更新发现不了）。
5. 访问 `?view=<id>` 看效果。

参考实现照抄 `register/compact/` 即可。

## 两条容易踩的线

- **基础版式不要自带 `<style>`**：它是三页（登录 / 注册 / 重置密码）共用样式
  `assets/styles/mobile-auth.scss` 的消费方，自带样式块会让各页各自漂移 ——
  历史上"两页看起来不一样"都源于此。变体不受这条约束（它本来就是"另一套 UI"），
  但要遵守上面的 token 规则。
- **改契约要同步两边**：容器组装 `ctx` 时有编译期自检（`assertRegisterContract`），
  改 `types.ts` 后容器与所有版式都会在类型检查时报错，不会悄悄跑偏。
