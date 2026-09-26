/**
 * 主题内核的**常量与白名单** —— 设备 / 页面 / 包 / 配色的取值集合
 *
 * 这些值原先散在 `oauth21/src/theme/index.ts`，2026-09-26 抽包 Stage 1 移到这里。
 * 它们是**跨层共享的词汇表**：配色注册表、版式注册表工厂、参数读取、store、
 * 以及目录口径关卡（`.tmp-probe/verify-theme-dirs.mjs`）全部按这几个常量对齐，
 * 所以必须**只有一个来源** —— 改这里，其余各处跟着变。
 *
 * ⚠️ 本文件**零依赖**（不 import 任何东西），也不碰 DOM / 构建器 / 路由：
 *    这是 `mauth-theme-core` 能被任意前端复用的前提（见
 *    docs/frontend/theme-package-extraction.md 的「〇、一条原则」）。
 *
 * @author yijiu2025
 */

/**
 * 目录名 / id 的白名单正则
 *
 * 同时作用于**主题包名**、**配色 id**、**版式 id**、**页面名** —— 它们都会进
 * `data-*` 属性与 CSS 属性选择器，因此只允许小写字母、数字、短横线。
 * 不合规的目录**静默跳过**（一个写坏的目录不该让整页起不来），所以排查
 * "加了主题没生效"时，第一件事就是核这条正则。
 */
export const THEME_ID_RE = /^[a-z0-9-]+$/;

/**
 * 空记录（registered 目录尚未产出任何记录）的占位配色 id
 *
 * ⚠️ 它**不再**表示"默认配色"：自 2026-09-24 起黑白是各设备下**具名的正式配色**
 * （`<页面>/colors/{black,white}/`）。**默认配色**是下面的 `DEFAULT_THEME_COLOR`。
 * 这里只用于空记录占位。
 */
export const DEFAULT_THEME_ID = 'default';

/**
 * 内置默认**主题包** id
 *
 * 它用在版式侧：该包的版式由容器**静态引入**（首屏零请求），其它包才需要惰性加载。
 * 见 `theme/views/registry.ts`。
 */
export const DEFAULT_THEME_PACKAGE = 'default';

/**
 * 设备维度：主题包内的一级目录，决定"这套配色/版式给哪种设备用"
 *
 * 三值是三种**平级**的设备形态，与桌面分发器的形态判定一一对应：
 *   • `mobile`   —— 手机端（窄视口 / 真机 UA）
 *   • `standard` —— 桌面主窗口（宽视口，双栏卡片）
 *   • `mini`     —— iframe 紧凑版（`?from=mini` / `/mini-login` 路由）
 * `mini` 不是 `standard` 下的「变体子目录」，而是独立设备：它有自己的配色目录
 * （`mini/<页面>/colors/`），与 `standard` 完全并列。
 */
export const THEME_DEVICES = ['mobile', 'standard', 'mini'] as const;

export type ThemeDevice = (typeof THEME_DEVICES)[number];

/** 兜底设备：设备无法判定时按手机端处理（与 `utils/device.ts` 的口径一致） */
export const DEFAULT_THEME_DEVICE: ThemeDevice = 'mobile';

/**
 * 兜底页面：注册表类函数在调用点没给页面时的默认值
 *
 * 取 `login` 是因为它是认证流程的默认入口（未指定页面时最可能问的就是它）。
 * 有明确页面的调用点（容器、面板）都应显式传 `page`，不要依赖这个兜底。
 */
export const DEFAULT_THEME_PAGE = 'login';

/**
 * 兜底**配色** id：该范围内没有更具体的指定时用它（2026-09-26 定）
 *
 * 用户口径：**默认版式 = `default` 包，默认配色 = `white`**。
 * 配色注册表先找它；只有该范围里根本没有这套色（如以后某个版式只提供一套自命名的
 * 配色）才退回「该范围 id 字母序第一」。
 *
 * ⚠️ 在它之前，兜底口径是"字母序第一"，而 `black < blue < cyan < rainbow < white`
 *    → "默认外观"实际落在**黑系**，再靠首屏系别对齐纠正成白系。"两步走"有两个坑：
 *      ① 语义撕裂：基线 SCSS 的 `:root` 是浅底，兜底却是深色配色；
 *      ② **静默事故**：新增一个比 `black` 更靠前的配色 id（如 `amber`）会改掉默认外观。
 *    写死成 `white` 后，"默认"是一个**可读的显式值**，不再依赖命名巧合。
 */
export const DEFAULT_THEME_COLOR = 'white';

/**
 * 兜底**暗系**配色 id：明暗联动切到「暗」时的标配
 *
 * 与 `DEFAULT_THEME_COLOR` 成对（用户 2026-09-25 定：切「明」→白系、切「暗」→黑系）。
 * 该范围内没有它时退回**该系别**字母序第一套，绝不跨系别硬凑。
 */
export const DEFAULT_THEME_DARK_COLOR = 'black';

/**
 * 基础版式的**逻辑** id（与版式注册表工厂的默认 `baseId` 是同一约定值）
 *
 * ⚠️ 它**不是**配色注册表里的 view 值：配色记录里的 view 段恒等于包名
 * （一个主题包 = 一种版式），`'base'` 永远不会出现在配色键里。
 * 外部 `?view=base` 由版式选择器归一化到当前包名，到不了配色注册表。
 *
 * 保留它只是为了版式工厂的默认值；新增代码不要拿它当配色查找的 view 参数。
 */
export const BASE_VIEW_ID = 'base';
