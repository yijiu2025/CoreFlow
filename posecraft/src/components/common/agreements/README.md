# agreements/ 协议模块

用户服务协议、隐私政策等法律文档的**单一数据源**模块。

## 文件结构

```
agreements/
├── agreementConfig.ts       # 可变字段配置（运营主体、地址、邮箱、生效日期）
├── ServiceAgreement.vue      # 用户服务协议（15 条完整版）
├── PrivacyPolicy.vue         # 隐私政策（5 章完整版）
└── README.md                 # 本说明
```

上层入口：[../AgreementModals.vue](../AgreementModals.vue) —— 封装 DocModal 弹窗壳 + 懒加载本目录下的协议组件。

## 设计原则

1. **单一数据源**：协议正文只在本目录维护。所有登录/注册页（5 处）统一通过 `AgreementModals` 引用，避免多处副本不一致。
2. **懒加载**：`AgreementModals` 用 `defineAsyncComponent(() => import('./ServiceAgreement.vue'))` 引入，Vite 自动把每份协议拆成独立 chunk，**用户首次点开协议时才请求对应文件**，长篇正文不进主包。
3. **可变字段外置**：运营主体、地址、邮箱、生效日期等会变的信息集中在 `agreementConfig.ts`，改一处全项目同步。

## 用法

### 在登录/注册页引入

```vue
<script setup lang="ts">
import { ref } from 'vue';
import AgreementModals from '@/components/common/AgreementModals.vue';

// 协议弹窗状态：null 关闭，'service' / 'privacy' 打开对应协议
const docType = ref<'service' | 'privacy' | null>(null);
</script>

<template>
  <!-- 协议链接：点击设置 docType -->
  <a @click.stop.prevent="docType = 'service'">《服务协议》</a>
  <a @click.stop.prevent="docType = 'privacy'">《隐私政策》</a>

  <!-- 弹窗组件（关闭时自动把 docType 置 null） -->
  <AgreementModals v-model:type="docType" />
</template>
```

### 修改协议正文

直接编辑 `ServiceAgreement.vue` / `PrivacyPolicy.vue` 即可，所有引用处自动同步。

### 修改运营主体 / 联系方式 / 日期

编辑 `agreementConfig.ts`：

```ts
export const agreementConfig = {
  OPERATOR: 'XX科技有限公司',        // ← 上线前改成真实主体全称
  CONTACT_ADDRESS: 'XX省XX市XX区...', // ← 真实地址
  CONTACT_EMAIL: 'support@example.com',
  SERVICE_EFFECTIVE_DATE: '2026年1月1日',
  PRIVACY_EFFECTIVE_DATE: '2026年1月1日',
  PRIVACY_UPDATE_DATE: '2026年1月1日'
} as const;
```

## 上线前 checklist

- [ ] `agreementConfig.ts` 的 `OPERATOR` / `CONTACT_ADDRESS` / `CONTACT_EMAIL` 替换为真实值
- [ ] `ServiceAgreement.vue` 第四条 4.1 服务内容已按实际业务填写
- [ ] `ServiceAgreement.vue` 第十四条 14.2 管辖法院写法合规（已用"合同履行地或被告住所地"，避免"平台所在地"被认定无效）
- [ ] 涉及未成年人服务时，第八条按业务实际细化（必要时单独制定《儿童个人信息保护规则》）
- [ ] 协议重大变更（争议解决、责任限制）采用弹窗显著方式获取用户明示同意，不要仅靠"继续使用视为同意"
