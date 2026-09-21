/**
 * 移动端键盘避让：输入框聚焦时把它滚进可视区
 *
 * === 解决什么问题 ===
 * iOS Safari 的虚拟键盘**只覆盖、不改变视口高度**，浏览器也不会自动把聚焦的输入框
 * 滚到键盘之上 —— 当输入框位于页面下半部（注册第二步的确认密码、或键盘较高时），
 * 用户看到的是「正在输入的框被键盘盖住」。Android Chrome 在 viewport 配了
 * `interactive-widget=resizes-content` 后视口会真的缩小，浏览器能自行处理，
 * 所以这个 composable 主要救 iOS，对 Android 是无害的兜底。
 *
 * === 为什么用 focusin 而不是 focus ===
 * focus 不冒泡，要在每个输入框上单独绑定；focusin 会冒泡到 document，
 * 一个监听器覆盖页面上所有输入框（含动态渲染出来的验证码框、二次验证框）。
 *
 * === 为什么延迟 300ms ===
 * 键盘有弹出动画，期间视口高度还在变。立即 scrollIntoView 会按旧高度计算，
 * 滚到位后键盘才占位，结果还是被盖住。等动画基本结束再滚才准。
 * 配合样式里 `.mauth-cell` 的 scroll-margin（上避开 header、下避开键盘）留出余量。
 *
 * @author yijiu2025
 */
import { onMounted, onUnmounted } from 'vue';

/** 键盘弹出动画的等待时长：短了算错高度，长了用户已经看到被遮挡的中间态 */
const KEYBOARD_SETTLE_MS = 300;

/**
 * 在当前页面启用键盘避让
 *
 * 用法：在移动端认证页（/m/login、/m/register）的 setup 中调用。
 * 只应在整屏移动端页面上使用 —— 桌面/嵌入场景不会弹虚拟键盘，无副作用但没意义。
 */
export function useKeyboardAvoid(): void {
  function handleFocusIn(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const tag = target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
    // 只处理可编辑控件：disabled / readonly 不会唤起键盘
    if ((target as HTMLInputElement).disabled || (target as HTMLInputElement).readOnly) return;

    window.setTimeout(() => {
      // 期间用户可能已经切走焦点，避免把页面滚到已失焦的位置
      if (document.activeElement !== target) return;
      // block:'center' 让输入框落在可视区中部，上下都有余量（比 'nearest' 更稳）
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, KEYBOARD_SETTLE_MS);
  }

  onMounted(() => {
    document.addEventListener('focusin', handleFocusIn);
  });

  onUnmounted(() => {
    document.removeEventListener('focusin', handleFocusIn);
  });
}
