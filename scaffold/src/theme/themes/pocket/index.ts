/**
 * 口袋版主题包（pocket）—— **包定义**
 *
 * === 为什么它叫 pocket，而不叫「微信」 ===
 * 命名规则（与 oauth21 同一套）：**包 = 版式**，一个包 = 一种布局；只换颜色不换布局的，
 * 属于同包下的**另一种配色**。所以：
 *
 *   · 「桌面端灰白 + 绿」= 珍珠玻璃版式 + `wechat` 配色（`default/standard/.../colors/wechat/`）
 *     —— 不是包。桌面端从来没有"另一种 DOM"，只有另一种颜色；
 *   · 本包是**真的另一套布局**：手机端从「侧栏 + 顶栏」变成「导航栏 + 底部 TabBar + cell 列表」，
 *     交互也换（点 cell 压栈、左缘右滑返回、二级页收 TabBar）。它要独立演进、独立打包
 *     （后续做 App 外壳），所以给它自己的名字与目录，而不是借用某个 IM 的品牌名。
 *
 * === 目录 ===
 *   `mobile/console/index.vue`   口袋版壳骨架（导航栏 / TabBar / 手势 / 面板）
 *   `mobile/console/kit/*.css`   **设计层**：块 / 控件 / 列表 / 浮层 / 组件 / 逐页差异
 *                               —— 全站适配都在这里，业务页面一行不改
 *   `mobile/console/pages/*`     **本包专属页面**：通讯录 / 发现 / 我（TabBar 的三个
 *                               栏目根页）。它们不是业务页面，是版式骨架的一部分，
 *                               所以住在包里；路由在 `src/router/index.ts` 静态声明，
 *                               并用 `meta.themePkg = 'pocket'` 标出归属 —— 换成别的包
 *                               时这三条路径自动不存在（守卫送回工作台）
 *   `mobile/console/colors/*`    手机端配色（white / black / star）
 *   `mobile/login/index.vue`     口袋版登录页（灰底 + 白块 + iframe）
 *   `mobile/<页面>/index.vue`    其余页面**转发**到珍珠玻璃的手机版式（`default/mobile/…`），
 *                               只携带本包身份（`data-mauth-view`）与配色归属
 *
 * 🔴 本包**只有手机端**：桌面宽度下用别的包（珍珠玻璃 / 极光）。以前这里还有一个
 *    `standard/` 目录，里面全是"转发到 default 桌面壳"的空壳 + 一套绿配色 —— 那正是
 *    "把颜色当成了包"。现在桌面绿配色搬到 `default/standard/<设备>/colors/wechat/`。
 *
 * 🔴 `pages/` 必须放在 `<设备>/<页面>/` 之下（这里是 `mobile/console/pages/`），
 *    不能放 `themes/pocket/pages/`：构建期扫描按 `包/设备/页面` 三段下降，
 *    包下面第一层会被当成**设备名**，`pages/` 会被误注册成设备。放在 console 下
 *    则扫描到第三段就停了，不会再往下看（`kit/` 同理）。
 *
 * 切换：`?th=pocket`，或「个人设置 → 界面风格」（落本地，下次启动恢复）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import type { MauthThemePackage } from 'skinsuite';

export default {
  meta: {
    id: 'pocket',
    name: '口袋版',
    description: '手机端独立布局：居中标题 + 底部 TabBar + cell 列表，绿色主操作',
    preview: { primary: '#07c160', accent: '#0b8f45' }
  },
  /**
   * 只覆盖手机端：本包没有桌面版式。
   *
   * 配色按「包 × 设备 × 页面」各存一份（见 `mobile/<页面>/colors/`）—— 一个都不能少，
   * 因为 `getThemeRecord` 找不到记录时会返回空记录，那一页的 `--mauth-*` 全部失效。
   */
  coverage: {
    devices: ['mobile'],
    pages: ['console', 'login']
  },
  /**
   * 宿主联动项：选中本包时顺手把主色切到这套绿（内核不解释这个字段）。
   * 写在包定义里，宿主就不用再单独维护一张"包 → 主色"的表。
   */
  accent: 'wechat'
} satisfies MauthThemePackage;
