/// <reference types="vite/client" />

/** vue-tsc 识别 .vue 单文件组件 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/** skinsuite 构建插件产出的虚拟模块（主题注册表 / 清单 / 版式加载表） */
declare module 'virtual:theme' {
  const mod: unknown;
  export default mod;
}

interface ImportMetaEnv {
  readonly VITE_PORT?: string;
  readonly VITE_API_TARGET?: string;
  readonly VITE_SSO_URL?: string;
  /** 登录页版式（≡ oauth21 主题包名），透传为 iframe 的 `?th=` */
  readonly VITE_SSO_THEME_VIEW?: string;
  /** 登录页配色 id，透传为 iframe 的 `?th_color=` */
  readonly VITE_SSO_THEME_COLOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
