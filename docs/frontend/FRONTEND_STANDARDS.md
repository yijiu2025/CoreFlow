# ǰ��ͳһ�淶�ĵ�

> ������Ŀ��`oauth21`��`firewall`��`admin`  
> Ŀ�꣺ͳһǰ�˹��̽ṹ�������񡢰�ȫʵ������ά�����뽻����׼��

---

## 1. �����뷶Χ

### 1.1 ��Ŀְ��

- `oauth21`��OAuth 2.1 / SSO ��¼����Ȩ���һ����롢�ƶ��˵�¼ע��ҳ��
- `firewall`������ǽ����̨����ء����ԡ���־��ϵͳ���á�
- `admin`��������̨���û���Ȩ�޹�������������

### 1.2 ͳһ����ջ

| ����     | ͳһҪ��                                 |
| -------- | ------------------------------------- |
| ���      | Vue 3                                 |
| ����     | TypeScript                            |
| ����     | Vite                                  |
| ·��      | Vue Router 4                          |
| ״̬        | Pinia                                 |
| UI ��ʽ   | Tailwind CSS                          |
| У��      | Zod + vee-validate                    |
| ����     | @vueuse/core��dayjs                   |
| ����     | axios                                 |
| ���ʻ�    | vue-i18n                              |
| �������� | ESLint + Prettier + TypeScript ���ͼ�� |

> �������ڶ�Ӧ��Ŀ README ��ȷ��¼ԭ�򣬲�������Ĭ����ڶ��׷�����

---

## 2. Ŀ¼�ṹ�淶

### 2.1 �Ƽ��ṹ

```text
src/
������ assets/                 # ��̬��Դ
��   ������ images/
��   ������ styles/
��       ������ main.scss
������ components/             # �������
��   ������ common/
��   ������ business/
������ composables/            # ���ʽ����
������ config/                 # ǰ������
������ directives/             # �Զ���ָ��
������ i18n/                   # ���ʻ�
������ layouts/                # ����
������ router/                 # ·��
������ stores/                 # ״̬����
������ types/                  # ���Ͷ���
������ utils/                  # ���ߺ���
������ views/                  # ҳ��
������ App.vue
������ main.ts
������ style.css
```

### 2.2 �ֲ�߽�

- `views/`��ֻ��ҳ�漶�����ҵ����š�
- `components/`���ɸ����������ͨ�ú�ҵ���֡�
- `composables/`���� UI ������߼���ȡ��
- `stores/`����ҳ�湲��״̬��
- `utils/`����������ͨ��������

---

## 3. �����淶

### 3.1 �ļ�����

- Ŀ¼��`kebab-case`
- ����ļ���`PascalCase.vue`
- ����/�߼��ļ���`camelCase.ts`
- ��ʽ�ļ���`kebab-case.scss`

### 3.2 ��������

- �������`PascalCase`
- ����/������`camelCase`
- ������`UPPER_SNAKE_CASE`
- ����/�ӿڣ�`PascalCase`
- ����ֵ��`is/has/should` ǰ׺

### 3.3 ʾ��

```text
components/common/AuthContainer.vue
composables/useMessage.ts
utils/request.ts
stores/auth.ts
```

---

## 4. TypeScript �淶

### 4.1 ���Ͷ���

- ����ʹ�� `interface` ����������ͣ�`type` �����������͡��������͡�
- ��ֹ `any`�����ݱ߽紦ʹ�� `unknown` ����ʽ��խ��
- ��������ͳһ���� `types/`��

### 4.2 ��Ӧʽ����

- �Ƽ�����Լ��������API ��Ӧ����ҳ�ṹ��
- ����ģ������ʽ `any`��

### 4.3 ʾ��

```ts
export interface LoginPayload {
  username?: string;
  password?: string;
  type: 'sms' | 'pwd' | 'email';
}
```

---

## 5. ����淶

### 5.1 ����ṹ

- ���ļ����ͳһ˳��`<template>`��`<script setup lang="ts">`��`<style scoped>`��
- ���������� `ChildPanel.vue` + `useXxx.ts`��
- �����ļ����� 500 �б����֡�

### 5.2 Props ���¼�

- Props ���붨�����ͺͱ����ԡ�
- �¼���ͳһ `kebab-case`������ DOM �¼���ͻ��
- ��¶�ӿ�ʹ�� `defineExpose`��

### 5.3 ģ��淶

- ��ʹ�� `v-html`���������ݿɿ��Ҿ�����ȫ��顣
- �����߼��³��� `composables` �򷽷���
- �б���Ⱦ�������ȶ� `:key`��

---

## 6. ״̬�����淶

### 6.1 Store ְ��

- ÿ�� store ֻ����һ��ҵ����
- ��ֹ�� UI ��ʱ״̬��ҵ��״̬��š�
- �־û�״̬ͳһ�� `pinia-plugin-persistedstate` ��ͳһ���湤�ߡ�

### 6.2 ����

- store �ļ���`useXxxStore`
- state/getter/action ���廯��������д��

### 6.3 ʾ��

```ts
export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref<User | null>(null)

  async function login(payload: LoginPayload) { ... }
  function logout() { ... }

  return { token, user, login, logout }
})
```

---

## 7. ��������淶

### 7.1 ͳһ��װ

- ������Ŀͳһʹ�� axios���������� `utils/request.ts` �� `api/xxx.ts`��
- ͳһ������������`Authorization`��ͳһ�����롢401/403 ����������ȡ����

### 7.2 �ӿڹ淶

- ���ͳһ��Ӧ�ṹ��`{ code, message, data }`��
- ͳһ�쳣ӳ��Ϊ `ApiError`������� `AxiosError` ֱ���׸�ҳ�档

### 7.3 Token ˢ��

- ������� 401 ֻ����һ��ˢ�¡�
- ˢ��ʧ��ͳһ����״̬����ת��¼��

### 7.4 ����Ŀ��״�������޸�Ҫ��

| ��Ŀ        | ����                                         | �޸�Ҫ��                                |
| ---------- | -------------------------------------------- | ------------------------------------- |
| `oauth21`  | `utils/request.ts` 401 ʹ�ÿ� token ��������   | ���� `authApi.refreshToken`��ʧ������¼ |
| `firewall` | 401 ������ Queue ����ʵ�֣���ȱ��ͳһ Error Class | ���� `ApiError`�����쳣����            |
| `admin`    | 401 �߼�Ϊ TODO�����ڼ�ˢ��                      | ������ʵˢ�½ӿڲ�����ʧ�ܶ���               |

---

## 8. ��ȫ�淶

### 8.1 ��֤��Ự

- ����ʹ�ú�� Session + HttpOnly Cookie��
- JWT �����ڶ��� API����ֹ���ش洢���� token��

### 8.2 ����ǩ��

- `oauth21` ��Ҫ�� H5 ǩ����`X-Sign`��`X-Timestamp`��`X-Nonce`��
- ��ֹǰ�˱���˽Կ����Կ���������ġ�

### 8.3 ����

- �����رղ���Ҫ `console.*`��ͳһ������־����
- Σ�ղ����Ӷ���ȷ�ϣ�����/������������ͳһ��װ��
- CSP �밲ȫ Header �ɺ��ͳһ���ã�ǰ�˱������������ű���

---

## 9. ·�ɹ淶

### 9.1 ����

- ·��Ԫ��Ϣͳһ�ֶΣ�`title`��`requiresAuth`��`roles`��`permissions`��
- ·��������ͳһʹ�� `() => import()`��

### 9.2 ����

- ȫ��·������ͳһ�� `router/index.ts`��
- ��Ȩʧ��ͳһ��ת���������ɢ�� `window.location.href`��

---

## 10. ��ʽ�淶

### 10.1 Tailwind

- ����˳���飺`���� -> ��� -> ���� -> ��ɫ -> �߿� -> ����`��
- ��ֹӲ������ɫֵ������ʹ�� `tailwind.config.js` ��չɫ�塣
- ��ɫģʽͳһͨ�� `dark:` ������

### 10.2 SCSS

- ������������ɱ��� `scoped`����ֹȫ����Ⱦ��
- ����ͳһ�� `assets/styles/variables.scss` ���塣

---

## 11. ���ʻ��淶

### 11.1 �ļ���֯

- ͳһ���� `i18n/`�������Բ�� `zh-CN.ts`��`en-US.ts`��
- ��ֹģ��Ӳ�������ġ�

### 11.2 ����

- key ͳһ `ҵ����.ҳ��.���.�İ�`��
- ��̬��ֵͳһ����������ģ��ƴ�ӡ�

---

## 12. ��־�������

### 12.1 ͳһ�����ϱ�

- ȫ�� `errorHandler` ֻ�ϱ�����ʾ�������쳣��
- ��˴���ͳһ������ʾ����ֹ��ʾ���쳣��

### 12.2 �û���ʾ

- ͳһ Toast/Message ���ߣ�`useMessage.ts`��
- ��ֹͬһ������������������ͬ��ʾ��

---

## 13. �������������

### 13.1 ͳһ����

| ����                 | ����           |
| -------------------- | -------------- |
| `npm run dev`        | ���ؿ���        |
| `npm run build`      | ��������       |
| `npm run type-check` | TS ���ͼ��      |
| `npm run lint`       | ESLint �޸�     |
| `npm run format`     | Prettier ��ʽ�� |
| `npm run preview`    | ������Ԥ��      |

### 13.2 ���뿪��

- `vue-tsc --noEmit`
- ESLint��`vue/multi-word-component-names` ����Ŀͳһ����
- Prettier�������š�β���š��޷ֺŰ���Ŀ�������

### 13.3 �ύǰ���

- ͳһ `lint-staged`��

```json
["eslint --fix", "prettier --write"]
```

---

## 14. ����Ŀ��״�����嵥

### 14.1 ���

| ����                   | λ��                | Ӱ��         | �޸�����          |
| ---------------------- | ------------------ | ----------- | ---------------- |
| `guard.js` ����ע������ | `src/api/guard.js` | �ɶ��Բ�      | ͳһ UTF-8 ע��     |
| `isIpMatch` �� IPv4    | `src/api/guard.js` | IPv6 ʧ��    | �滻Ϊ���� IP ƥ��� |
| ȱ��ͳһ API �汾Ŀ¼����    | `src/api`          | �汾������   | ���� `v1/` �淶   |
| ��ͳһ�쳣����            | ���·���ļ�          | ��������һ�� | ͳһ `AppError`    |

### 14.2 `oauth21`

| ����                 | λ��                                  | Ӱ��      | �޸�����                     |
| -------------------- | ------------------------------------ | -------- | --------------------------- |
| 401 ������ˢ��        | `src/utils/request.ts`               | ����ʧ��  | �� `authApi.refreshToken`   |
| `MiniLogin.vue` ���� | `src/view/web/login/MiniLogin.vue`   | ά���ɱ��� | ��ֱ���/Э��/��ʽ              |
| ��������ͼ���         | ���ҳ��                               | ���ò�    | ���� `composables/useLogin` |
| ���¼��ͼ�ظ�           | `StandardLogin.vue`��`MiniLogin.vue` | �ظ��߼�   | ��ȡ�����������֤             |

### 14.3 `firewall`

| ����                                 | λ��                                             | Ӱ��          | �޸�����                  |
| ------------------------------------ | ----------------------------------------------- | ------------ | ------------------------ |
| `SystemSettingsModal.vue` ����       | `src/components/modals/SystemSettingsModal.vue` | ��ά��        | ���ģ�������              |
| `i18n/index.ts` ����                 | `src/i18n/index.ts`                             | �������ά���� | ���������/ҵ��ģ��         |
| Token ˢ���� `api/firewall.ts` �߼���� | `src/api/firewall.ts`                           | �ɲ����Բ�     | �� `composables/useAuth` |
| ��ͼ�����ļ�����                       | `src/assets/maps/*.json`                        | ����         | ������/��̬�й�             |

### 14.4 `admin`

| ����        | λ��                        | Ӱ��         | �޸�����              |
| ----------- | -------------------------- | ----------- | -------------------- |
| 401 Ϊ TODO  | `src/utils/request.ts`     | ��֤ʧЧ       | ����ʵˢ���߼�          |
| ·���޼�Ȩ���� | `src/router/index.ts`      | ��ȫ����     | ����ǰ������          |
| ����⸴�õ�    | `src/view/users/index.vue` | ��ʽ���߼��ظ� | ���� `UserTable.vue` |

---

## 15. �������˳��

### ��һ�׶Σ��淶����

1. ͳһ `request` ��װ�� 401 �߼���
2. ͳһ Tailwind �� TypeScript ����
3. ͳһ·�������ʹ�����ʾ��

### �ڶ��׶Σ��ṹ����

1. ��� `oauth21` ��¼ҳ�档
2. ��� `firewall` �������� i18n��
3. ���� `admin` ��Ȩ����������

### �����׶Σ����̻�ǿ��

1. ���� `vue-tsc` �ϸ��顣
2. ��������빤�ߵ��⡣
3. ������������������Ż���

---

## 16. ���ձ�׼

- ����Ŀ����ͨ�� `npm run lint`��`npm run type-check`��
- �� `any`����Ӳ������Կ������ API Key��
- ��¼̬���ں��Զ�ˢ�»�ص���¼ҳ��
- ҳ�������İ�ȫ���� `i18n`��
- ����������� 500 �С�

---

## 17. ά��˵��

- ���ĵ�����Ŀ�ݽ��������¡�
- �½�ǰ����Ŀ����ֱ�����㱾�淶��
- �κ�ƫ�뱾�淶�ļ������������¼ԭ���뵽��ʱ�䡣
