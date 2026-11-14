/**
 * 防火墙监控页面域声明（page: firewall）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 本页是只读监控：版式只需把容器算好的汇总与封禁名单画出来，没有任何动作闭环。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';

/** 一条生效中的封禁（字段来自防火墙运行期，形状不固定，按只读展示处理） */
export type FirewallBlock = Record<string, unknown>;

/** 防火墙页版式上下文（版式只读它） */
export interface FirewallViewContext {
  /** 汇总读数（后端异常时容器兜成空对象，版式直接读字段即可） */
  summary: Ref<Record<string, number>>;
  /** 生效中的封禁（前 50 条） */
  blocks: Ref<FirewallBlock[]>;
  /** 封禁条数（汇总里的「生效封禁」用） */
  total: Ref<number>;
  loading: Ref<boolean>;
  /** 加载失败文案（空串 = 正常） */
  errorMessage: Ref<string>;
  /** 当前渲染设备：`'mobile'` 走卡片，其余走表格 */
  device: Ref<string>;
  /** 数值格式化（大数字加千分位，非数字显示破折号） */
  num: (value: unknown) => string;
  /** 重新取数 */
  load: () => Promise<void>;
}

/** 页面域声明（`<ThemeView page="firewall">` 依赖它） */
defineThemePage({ page: 'firewall' });
