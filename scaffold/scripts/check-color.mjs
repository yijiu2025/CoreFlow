/**
 * 校验颜色派生与覆盖校验（纯函数关卡）
 *
 * 为什么要有：这两块是"改坏了看不出来"的典型 ——
 *   · 派生把对比度算错 ⇒ 用户选了色，按钮上的字看不清，但页面不报错；
 *   · 覆盖把半透明吃掉 ⇒ 侧栏变成实心块，玻璃质感没了；
 *   · 校验放水 ⇒ localStorage 里一条脏值写进 `style`，那一项直接失效。
 *
 * 三个函数都是纯函数（不碰 DOM），所以能直接用 Node 加载 `.ts` 跑（Node 22.6+ 的类型剥离）。
 *
 * 用法：node scripts/check-color.mjs
 */
import { contrastRatio, deriveAccent, normalizeHex, toPickerHex, withOriginalAlpha } from '../src/theme/color.ts';
import { isValidOverride, normalizeOverrides } from '../src/theme/overrides.ts';

let failed = 0;
let total = 0;

/**
 * 断言
 *
 * @param {boolean} ok 条件
 * @param {string} message 描述
 */
function check(ok, message) {
  total += 1;
  if (ok) return;
  failed += 1;
  console.error(`✗ ${message}`);
}

/* ── ① 归一化 ───────────────────────────────────────────── */
check(normalizeHex('#ABC') === '#aabbcc', '三位 hex 应展开成六位');
check(normalizeHex('2c8500') === '#2c8500', '不带 # 也应接受');
check(normalizeHex('#12345') === null, '五位 hex 应拒绝');
check(normalizeHex('red') === null, '颜色关键字应拒绝（只收 hex）');

/* ── ② 派生：对比度必须达标 ──────────────────────────────── */
const light = deriveAccent('#ffe066', 'light');
check(light !== null, '浅黄应能派生');
check(
  light && contrastRatio(light.primary, '#ffffff') >= 4.4,
  `浅色下主色对白底应 ≥ 4.4（实际 ${light && contrastRatio(light.primary, '#ffffff').toFixed(2)}）`
);
check(light && light.tint === '#ffe066', 'tint 应保留原色（大面积浅底用鲜色）');
check(light && light.adjusted === true, '浅黄应被标记为"已调整"');

const dark = deriveAccent('#ffe066', 'dark');
check(
  dark && contrastRatio(dark.primary, '#161a1d') >= 4.4,
  `深色下主色对暗底应 ≥ 4.4（实际 ${dark && contrastRatio(dark.primary, '#161a1d').toFixed(2)}）`
);
check(dark && dark.onPrimary === '#101418', '亮主色上的字应是深墨（白字只有 1.3:1）');

const deep = deriveAccent('#2c8500', 'light');
check(deep && deep.adjusted === false, '已达标的主色不该被改动');
check(deep && deep.primary === '#2c8500', '已达标的主色应原样保留');
check(deep && deep.onPrimary === '#ffffff', '深主色上的字应是白色');

/* 中等明度：白字与深字都不到 4.5，应取更高的那个 */
const mid = deriveAccent('#0b8f45', 'light');
check(
  mid && contrastRatio(mid.onPrimary, mid.primary) === Math.max(
    contrastRatio('#ffffff', mid.primary),
    contrastRatio('#101418', mid.primary)
  ),
  '中等明度主色应取"白与深墨里对比更高"的一方'
);

/* ── ③ 取色器转换与 alpha 保留 ──────────────────────────── */
check(toPickerHex('rgba(255, 255, 255, 0.72)') === '#ffffff', 'rgba 应转成 hex');
check(toPickerHex('#2c8500') === '#2c8500', 'hex 应原样返回');

const kept = withOriginalAlpha('rgba(255, 255, 255, 0.72)', '#00ff00');
check(kept === 'rgba(0, 255, 0, 0.72)', `改色应保留 alpha（实际 ${kept}）`);
check(withOriginalAlpha('#ffffff', '#00ff00') === '#00ff00', '原本不透明就保持不透明');

/* ── ④ 覆盖校验：白名单与类型 ──────────────────────────── */
check(isValidOverride('--mauth-panel-bg', '#ffffff'), '合法颜色应通过');
check(isValidOverride('--mauth-panel-bg', 'rgba(0, 0, 0, 0.5)'), 'rgba 应通过');
check(!isValidOverride('--mauth-panel-bg', 'red; background: url(x)'), '注入串应拒绝');
check(!isValidOverride('--mauth-panel-bg', ''), '空值应拒绝');
check(!isValidOverride('--mauth-not-exist', '#ffffff'), '清单外的键应拒绝');
check(isValidOverride('--mauth-radius-md', '14px'), '长度应通过');
check(!isValidOverride('--mauth-radius-md', '14'), '长度缺单位应拒绝');
check(!isValidOverride('--mauth-radius-md', '#ffffff'), '长度项收到颜色应拒绝');

const clean = normalizeOverrides({
  '--mauth-panel-bg': '#ff0000',
  '--mauth-not-exist': '#ffffff',
  '--mauth-radius-md': '999px',
  '--mauth-bg': 42
});
check(Object.keys(clean).length === 2, `脏数据应被过滤（实际 ${Object.keys(clean).join(',')}）`);
check(clean['--mauth-panel-bg'] === '#ff0000', '合法项应保留');
check(normalizeOverrides(null) && Object.keys(normalizeOverrides(null)).length === 0, 'null 应归一成空表');

if (failed === 0) {
  console.log(`OK · 颜色派生与覆盖校验 ${total} 项通过`);
  process.exit(0);
}
console.error(`\n✗ ${failed} 项失败`);
process.exit(1);
