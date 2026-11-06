/**
 * 第三方人机验证组件的坐标与脚本加载
 *
 * 从 `ProviderWidget.vue` 里抽出来有两个原因：
 *   1. `<script setup>` **不能导出类型**，而 `WidgetProvider` 要给 `ChallengeCard` / 页面共用；
 *   2. 脚本加载是纯 DOM 逻辑，与 Vue 无关，单独放便于测（也可以被非 Vue 页面复用）。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */

/** 前端渲染所需的 provider 取值（与后端 `defense.challengeProvider` 对齐） */
export type WidgetProvider = 'turnstile' | 'hcaptcha' | 'google';

/** 一家 provider 的脚本坐标 */
export interface WidgetSpec {
  /** 官方脚本地址 */
  scriptSrc: string;
  /** 脚本暴露的全局对象名 */
  globalName: string;
}

/**
 * 三家 provider 的脚本坐标（唯一需要区分的地方）
 *
 * `scriptSrc` 可以被页面覆盖：国内部署常把脚本走自家反代（或私有化部署在内网），
 * 而"硬编码官方域名"在那种场景下就是"组件永远渲不出来"。
 */
export const WIDGET_SPECS: Record<WidgetProvider, WidgetSpec> = {
  turnstile: {
    scriptSrc: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    globalName: 'turnstile'
  },
  hcaptcha: { scriptSrc: 'https://js.hcaptcha.com/1/api.js?render=explicit', globalName: 'hcaptcha' },
  google: { scriptSrc: 'https://www.google.com/recaptcha/api.js?render=explicit', globalName: 'grecaptcha' }
};

/** 已加载脚本的缓存（挂 window 上，跨组件实例共享；key = 脚本地址） */
const LOADED_KEY = '__fw_challenge_widget_scripts__';

/**
 * 取全局对象（脚本加载后由它暴露 `render` / `remove`）
 *
 * @param globalName 全局对象名
 * @returns 该全局对象；不存在返回 undefined
 */
export function widgetApi(globalName: string): Record<string, (...args: unknown[]) => unknown> | undefined {
  return (window as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>)[globalName];
}

/**
 * 加载脚本（按 URL 幂等）
 *
 * 为什么要去重：挑战页会被反复重挂（重试、路由切换），重复插 `<script>` 会让全局对象
 * 被覆盖、旧 widget 变成孤儿。失败时**必须从缓存里删掉**，否则一次网络抖动会让这个页面
 * 永远认为"脚本坏着"，连点重试也没用。
 *
 * @param src 脚本地址
 * @returns 加载完成（失败会 reject）
 */
export function loadWidgetScript(src: string): Promise<void> {
  const store = ((window as unknown as Record<string, unknown>)[LOADED_KEY] ??= new Map<string, Promise<void>>()) as Map<
    string,
    Promise<void>
  >;

  const cached = store.get(src);
  if (cached) return cached;

  const task = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      store.delete(src);
      reject(new Error('widget_script_load_failed'));
    };
    document.head.appendChild(el);
  });

  store.set(src, task);
  return task;
}
