/**
 * 微信主题包（wechat）—— **包定义**
 *
 * 与 `default`（珍珠玻璃）、`spotlight`（聚光）平级的第三套设计。
 * 与前两套只换登录页不同，本包换的是**后台壳本身**：手机端从「侧栏 + 顶栏」变成
 * 「导航栏 + 底部 TabBar + cell 列表」，操作方式也换（点 cell 压栈、左缘右滑返回、
 * 二级页收 TabBar）。
 *
 * === 目录 ===
 *   `mobile/console/index.vue`   微信壳骨架（导航栏 / TabBar / 手势 / 面板）
 *   `mobile/console/kit/*.css`   **设计层**：块 / 控件 / 列表 / 浮层 / 组件 / 逐页差异
 *                               —— 全站适配都在这里，业务页面一行不改
 *   `mobile/console/pages/*`     **本包专属页面**：通讯录 / 发现 / 我（TabBar 的三个
 *                               栏目根页）。它们不是业务页面，是版式骨架的一部分，
 *                               所以住在包里；路由在 `src/router/index.ts` 静态声明，
 *                               并用 `meta.themePkg = 'wechat'` 标出归属 —— 换成别的包
 *                               时这三条路径自动不存在（守卫送回工作台）
 *   `mobile/console/colors/*`    手机端配色（white / black）
 *   `mobile/login/index.vue`     微信风登录页（灰底 + 白块 + iframe）
 *   `standard/console/colors/*`  桌面端**只有配色**：本包没有桌面版式，
 *                                `ThemeView` 会回退 default 包的壳（侧栏 + 顶栏），
 *                                只是颜色换成微信的灰白 + 绿
 *   `{mobile,standard}/login/colors/*`  登录页配色
 *
 * 🔴 `pages/` 必须放在 `<设备>/<页面>/` 之下（这里是 `mobile/console/pages/`），
 *    不能放 `themes/wechat/pages/`：构建期扫描按 `包/设备/页面` 三段下降，
 *    包下面第一层会被当成**设备名**，`pages/` 会被误注册成设备。放在 console 下
 *    则扫描到第三段就停了，不会再往下看（`kit/` 同理）。
 *
 * 🔴 版式可以缺，**配色不能缺**：`getThemeRecord` 只在「同包同设备同页」里找，
 *    找不到就返回空记录 —— 那样停留在这页时 token 一个都注入不了，整站退化成无样式。
 *    所以本包虽然只在手机端有壳版式，四个设备×页面的配色一个都不能少
 *    （`?th=wechat` 也会作用于登录页，而登录页要在任何设备上都渲染得出来）。
 *
 * 切换：`?th=wechat`，或「我 / 个人设置 → 界面风格」（落本地，下次启动恢复）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import type { MauthThemePackage } from 'skinsuite';

export default {
  meta: {
    id: 'wechat',
    name: '微信',
    description: '手机端换微信式导航：居中标题 + 底部 TabBar + cell 列表，绿色主操作',
    preview: { primary: '#07c160', accent: '#0b8f45' }
  },
  /**
   * 覆盖两个设备、两个页面：配色齐了才不会出现"某页无样式"。
   * 版式只声明 console（且只有 mobile 目录）—— 没声明的页面回退 default。
   */
  coverage: {
    devices: ['mobile', 'standard'],
    pages: ['console', 'login']
  }
} satisfies MauthThemePackage;
