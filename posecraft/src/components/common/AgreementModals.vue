<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import DocModal from './DocModal.vue';

/**
 * 协议弹窗（服务协议 / 隐私政策）统一组件
 * 用法：<AgreementModals v-model:type="docType" />
 *   - docType: ref<'service' | 'privacy' | null>
 *   - 点击协议链接时 docType.value = 'service' / 'privacy'，关闭时置 null
 * 协议正文拆成独立文件懒加载（用户首次点开时才请求对应 chunk，不进主包）：
 *   - agreements/ServiceAgreement.vue
 *   - agreements/PrivacyPolicy.vue
 * 注意：本组件与 oauth21 项目的同名组件内容一致，修改协议正文时两处需同步。
 */
const props = defineProps<{ type: 'service' | 'privacy' | null }>();
const emit = defineEmits<{ 'update:type': [value: null] }>();

// 懒加载：Vite 自动将每个协议拆成独立 chunk，首次打开时才加载
const ServiceAgreement = defineAsyncComponent(() => import('./agreements/ServiceAgreement.vue'));
const PrivacyPolicy = defineAsyncComponent(() => import('./agreements/PrivacyPolicy.vue'));

const openService = computed(() => props.type === 'service');
const openPrivacy = computed(() => props.type === 'privacy');

const close = () => emit('update:type', null);
</script>

<template>
  <DocModal :is-open="openService" title="用户服务协议" @close="close">
    <ServiceAgreement />
  </DocModal>

  <DocModal :is-open="openPrivacy" title="隐私政策" @close="close">
    <PrivacyPolicy />
  </DocModal>
</template>
