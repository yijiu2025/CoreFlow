/**
 * 主题运行时：把主题包 token 与外部来源（后端下发 / 父应用 postMessage）的 token
 * 校验后注入为 CSS 变量，实现「不改前端代码即可换配色」与「组件级 UI 定制」。
 *
 * === 本文件现在只管"往 DOM 写"，不管"该不该写"（2026-09-26 抽包 Stage 1）===
 * 白名单校验（token 名 / 取值 / 逐条过滤）已迁到内核包 `mauth-theme-core` 的
 * `tokens.ts`：那部分是**纯函数**，与 DOM 无关，能被任何前端复用。这里保留的是
 * 注入动作本身（读 `documentElement`、差集清理、写入顺序），仍然属于应用侧。
 * 本文件把校验函数**原样转发**出去，所以 `@/theme/runtime` 的导入面没有变化。
 *
 * === 为什么必须校验（细节见包内 `tokens.ts`）===
 * CSS 自定义属性是能直接改变渲染的输入。未校验就 `setProperty` 等于把 CSS 注入的
 * 口子交给后端或父页面（外发请求 / 闭合规则注入任意样式）。所以走白名单，不走黑名单。
 * 主题包自己的 theme.scss 不走这条通道 —— 那是构建期就在仓库里的受信代码。
 *
 * === 分层与优先级（低 → 高）===
 *   1. SCSS 基线          :root / html.dark / 断点块
 *   2. 主题包 tokens      getThemeRecord(...).tokens
 *   3. 外部覆写 tokens    后端下发 / 父应用同步
 * 第 2、3 层都写在根节点的 inline style 上（优先级高于任何选择器），层间顺序靠
 * **写入顺序**保证：先写主题包，再写外部覆写，同名后者胜。
 *
 * === tokens 是**一组扁平值**，不分明暗档（2026-09-25 改）===
 * 每套配色**自带完整底色**，选谁就是谁 —— 不会出现「选了黑再选蓝，底色还是黑」。
 * 需要深色版品牌色？**另加一个颜色目录**（如 `navy`），而不是做"某配色的深色档"。
 * 明暗偏好仍然存在（见 `./mode`），但它只在**基线 SCSS** 那层生效。
 *
 * @author yijiu2025
 */

import { sanitizeOverrides } from 'mauth-theme-core';
import type { ThemeTokenLayers, ThemeTokenOverrides } from 'mauth-theme-core';

/**
 * token 形态与白名单校验 —— **从内核包原样转发**（2026-09-26 抽包 Stage 1）
 *
 * 保留这些名字是为了 `@/theme/runtime` 这个导入面不变：验收脚本会在页面里
 * `import('/src/theme/runtime.ts')` 直接测 `isSafeTokenEntry`，容器与 store 也从这个
 * 路径取 `ThemeTokenOverrides`。实现只有一份，在 `packages/theme-core/src/tokens.ts`。
 */
export {
  isSafeTokenName,
  isSafeTokenValue,
  isSafeTokenEntry,
  sanitizeOverrides
} from 'mauth-theme-core';
export type { ThemeTokenOverrides, SanitizeResult, ThemeTokenLayers } from 'mauth-theme-core';

/** 上一次注入到 inline style 的变量名，用于下次注入前清理，避免换配色后残留旧值 */
let injectedNames: string[] = [];

/** 清掉上一次注入的所有主题变量 */
export function clearThemeTokens(): void {
  const root = document.documentElement;
  for (const name of injectedNames) root.style.removeProperty(name);
  injectedNames = [];
}

/**
 * 应用分层 token（主题包 + 外部覆写）
 *
 * 每次调用都是「把两层重算一遍，再与上一轮的变量名做差集清理」：
 *   • 换配色时不会残留上一轮的值（差集里被移除的会被 removeProperty）
 *   • 只动自己写过的变量名，不碰别人留在 html 上的 inline style
 *
 * 层内顺序：先 theme 后 external，同名后者胜 —— 这就是「后端覆写压过主题默认」。
 *
 * ⚠️ 不接收 `isDark` 参数（2026-09-25 改）：tokens 已是一组扁平值，
 *    与明暗偏好无关。明暗只影响 SCSS 基线那层（`html.dark` 选择器），
 *    由样式表自己处理，不需要经过这里。
 *
 * @param layers  分层 token；两层都可以为 null（表示只用 SCSS 基线）
 * @returns 被拒绝的条目（空数组表示全部合法）
 */
export function applyThemeLayers(layers: ThemeTokenLayers): string[] {
  const theme = sanitizeOverrides(layers.theme);
  const external = sanitizeOverrides(layers.external);

  const root = document.documentElement;
  const nextNames = new Set([...Object.keys(theme.tokens), ...Object.keys(external.tokens)]);
  for (const name of injectedNames) {
    if (!nextNames.has(name)) root.style.removeProperty(name);
  }

  const applied: string[] = [];
  for (const [name, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(name, value);
    applied.push(name);
  }
  for (const [name, value] of Object.entries(external.tokens)) {
    root.style.setProperty(name, value);
    applied.push(name);
  }
  injectedNames = applied;

  return [...theme.rejected, ...external.rejected];
}

/**
 * 只应用外部覆写（等价于 applyThemeLayers({ external })，保留给单层调用点）
 *
 * @param overrides 覆写表；传 null 表示撤销（回到主题包 / SCSS 基线）
 * @returns 被拒绝的条目（空数组表示全部合法）
 */
export function applyThemeTokens(overrides: ThemeTokenOverrides | null): string[] {
  return applyThemeLayers({ external: overrides });
}

/** 当前已注入的变量名（供验收脚本与单测断言注入是否真的发生） */
export function getInjectedTokenNames(): readonly string[] {
  return injectedNames;
}

/** 重置模块级状态（HMR / 单测用） */
export function resetThemeRuntime(): void {
  clearThemeTokens();
}
