/**
 * 布局视口自救（兜底）：内核不认 viewport meta 时，让页面仍按「设备宽度」排版
 *
 * === 问题（2026-09-23 夸克真机实测）===
 * 部分国产内核会**整条丢弃** index.html 的 viewport meta（跨行写法丢过、带实验键
 * `interactive-widget` 也丢过），退化成「桌面站点式」渲染：**布局视口 980px**，
 * 再把整页等比缩放到屏幕宽度（缩放比 = 物理宽 / 980，实测夸克 1.2245 倍）。
 * 按 1200 物理 px 的截图逐项量测：字段高 57 / 按钮高 59（正常应为 144）、
 * 字段宽却拉满到 1134 —— 用户看到的就是"字小、控件扁、比例不对"，
 * 而桌面 Chrome 完全没有这个布局视口，所以永远复现不出来。
 *
 * === 判据：visualViewport.scale ===
 * 「布局被缩小过」这件事只有 `visualViewport.scale` 直接暴露：
 *   · 正常渲染（meta 生效）     → clientWidth 400 / scale 1
 *   · 布局视口异常（被缩进屏）  → clientWidth 980 / scale 0.4082 ← 与真机缩放比一致
 *
 * ⚠️ **不能用 clientWidth 判**：`<head>` 解析期连正常页面的 clientWidth 都是 980
 *    （meta 要到首次布局才生效）。实测（.tmp-probe/probe-vp-signals.mjs）：
 *    正常页面 head-parse 也是 980，用它会**在正常手机上误触发**。
 * ⚠️ **不能用 screen.width 判**：有的内核把它报成物理像素（1200 而非 400），
 *    除以 dpr 归一又会把 iPad（1024 CSS px / dpr 2 → 512）误判成手机。
 * scale 判据与 screen.width / dpr / UA 全部无关，且**正常页面恒为 1**，零误伤。
 * 实测（.tmp-probe/probe-vp-module-time.mjs）：正常 α：scale=1；异常 β：scale=0.4082。
 *
 * === 修法 ===
 * 既然内核已经替我们缩了一次，就把缩掉的倍数乘回来：`zoom = 1 / scale`。
 * `zoom` 实测行为（Chromium，980 视口）：
 *   · 百分比宽度按「容器宽 / zoom」解析 → 页面自动变回"设备宽度"的逻辑宽度 ✅
 *   · 长度（padding / height / font-size）整体乘 zoom ✅
 *   · **viewport 单位不会被除** → `100dvh` 会被多乘一次（页高 2640 → 6468）❌
 * 所以样式里必须配套写 `height: calc(100dvh / k)`，见 mobile-auth.scss §13。
 * 修完与 400×880@dpr3 的正常渲染逐像素一致（.tmp-probe/verify-vpfix.mjs）。
 *
 * === 调用时机 ===
 * 必须在 **Vue 挂载之前**（实测此刻 `.mauth-page` 还不存在）执行：
 * 既不会"先画出错版式再跳变"，首帧就是对的；挂载后再改会看到明显跳变。
 * 因此放在 main.ts 最前面调用。
 *
 * ⚠️ 只在 `html[data-mauth-vpfix]` 下生效：正常手机 / 桌面都匹配不到 → 零影响。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */

/** 触发自救的 scale 区间：明显被缩小（< 0.95），但没到"异常极端值"（> 0.2） */
const MIN_SCALE = 0.2;
const MAX_SCALE = 0.95;

/** 修正倍数下限：小于它说明布局视口本来就正常，不必动 */
const MIN_FACTOR = 1.05;

/** 修正倍数上限：超过它说明不是"桌面回退缩放"，宁可不动（不动 = 现状，不会更差） */
const MAX_FACTOR = 4;

/** 横竖屏切换后 scale 需要一点时间才稳定 */
const ROTATE_SETTLE_MS = 300;

/** 把自救标记与倍数写到 <html> 上（对应样式 rules 在 mobile-auth.scss §13） */
function applyFix(k: number): void {
  const doc = document.documentElement;
  doc.setAttribute('data-mauth-vpfix', '');
  doc.style.setProperty('--mauth-vpfix-k', String(k));
}

function clearFix(): void {
  const doc = document.documentElement;
  doc.removeAttribute('data-mauth-vpfix');
  doc.style.removeProperty('--mauth-vpfix-k');
}

/**
 * 检查并按需启用 / 撤销自救。
 * 横屏时 980 ≈ 设备宽度，本就无需自救，所以要能撤销（不然会残留一个错的倍数）。
 */
export function syncViewportFix(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const vv = window.visualViewport;
  // 内核不支持 visualViewport 就没有可信判据 → 什么都不做（退化 = 现状）
  if (!vv) return;

  const scale = vv.scale;
  if (!(scale > MIN_SCALE && scale < MAX_SCALE)) {
    clearFix();
    return;
  }
  const k = 1 / scale;
  if (!(k > MIN_FACTOR) || k > MAX_FACTOR) {
    clearFix();
    return;
  }
  applyFix(k);
}

/** 应用启动时调用一次（务必在挂载前）；方向切换后再重算一次 */
export function setupViewportFix(): void {
  syncViewportFix();
  if (typeof window === 'undefined') return;
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(syncViewportFix);
    window.setTimeout(syncViewportFix, ROTATE_SETTLE_MS);
  });
}
