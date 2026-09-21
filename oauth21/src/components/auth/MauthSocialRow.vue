<script setup lang="ts">
/**
 * 移动端第三方登录行（分割线 + 圆形图标横排 + 「上次登录」弱提示）
 *
 * 对应参考设计里「其他登录方式」那一行：一条极细分割线 + 居中的圆形图标。
 *
 * === providers 为空时整行不渲染任何 DOM ===
 * 这不是「顺手加个 v-if」，而是这套能力能安全落地的前提：本仓还没有第三方登录的
 * 后端实现，默认状态下这一行必须完全不存在 —— 于是默认外观零变化，
 * 之前用逐像素比对得出的回归结论不用重做。有配置才出现。
 *
 * === 关于图标 ===
 * 图标是**符号化的功能图形**（沿用全站一致的 stroke 风格：fill:none + stroke:currentColor），
 * 靠品牌墨色 + 图标下方品牌名共同表达「这是哪个平台」。
 * 刻意没有复刻各家的官方 logo：品牌标识的使用需要各自的授权，凭空画一个近似版本
 * 既可能不合规，也容易画得不像。正式上线时把对应平台的**授权素材**替换
 * `<svg>` 节点即可，颜色由 `--mauth-social-ink-<id>` 控制、尺寸由 `--mauth-social-size` 控制，
 * 换图不需要改样式。
 *
 * === 「上次登录」徽标 ===
 * 贴在命中项的图标**正上方居中**，不向右偏：`.mauth-page` 是 `overflow-y: auto`，
 * 按 CSS 规范另一轴会被计算为 auto —— 徽标若横向出界就会给整页加出横向滚动条。
 * 向上出界只会被裁（页面中部不会超出 .mauth-page 边界），所以只向上溢出，
 * 由行容器的 padding-top 留出空间。
 *
 * 样式不写在组件里：统一在 assets/styles/mobile-auth.scss 的 `mauth-social-*`，
 * 与其余移动端认证页样式同一处维护。
 *
 * @author yijiu2025
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SocialProviderId } from '@/composables/useSocialLogin';

const props = withDefaults(
  defineProps<{
    /** 本次要显示的 provider（空数组 → 整行不渲染） */
    providers: SocialProviderId[];
    /** 上次登录用的 provider，命中时在该图标上加徽标 */
    lastProvider?: SocialProviderId | null;
    /** 分割线文案覆盖；不传用内置文案 */
    label?: string;
    /** 表单提交中禁用整行 */
    disabled?: boolean;
  }>(),
  { lastProvider: null, label: '', disabled: false }
);

const emit = defineEmits<{ select: [id: SocialProviderId] }>();

const { t } = useI18n();

const dividerText = computed(() => props.label || t('login.social_divider'));

/** 无障碍名称：把「上次登录」这层信息也读出来，不能只靠视觉徽标 */
function ariaFor(id: SocialProviderId): string {
  const name = t(`login.social_${id}`);
  return id === props.lastProvider ? `${name}（${t('login.social_last')}）` : name;
}
</script>

<template>
  <div v-if="providers.length" class="mauth-social">
    <div class="mauth-social-divider"><span>{{ dividerText }}</span></div>

    <div class="mauth-social-row">
      <button
        v-for="id in providers"
        :key="id"
        type="button"
        class="mauth-social-btn"
        :class="`mauth-social-btn--${id}`"
        :disabled="disabled"
        :aria-label="ariaFor(id)"
        @click="emit('select', id)"
      >
        <span class="mauth-social-icon">
          <!-- 微信：聊天气泡 -->
          <svg
            v-if="id === 'wechat'"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <!-- 支付宝：钱包 -->
          <svg
            v-else-if="id === 'alipay'"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
          </svg>
          <!-- QQ：账号 -->
          <svg
            v-else-if="id === 'qq'"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <!-- 微博：公开广播 -->
          <svg
            v-else-if="id === 'weibo'"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <!-- GitHub：分支 -->
          <svg
            v-else-if="id === 'github'"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <!-- Apple：⌘（Apple 的经典符号） -->
          <svg
            v-else
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z" />
          </svg>

          <span v-if="id === lastProvider" class="mauth-social-badge">{{ t('login.social_last') }}</span>
        </span>

        <span class="mauth-social-name">{{ t(`login.social_${id}`) }}</span>
      </button>
    </div>
  </div>
</template>
