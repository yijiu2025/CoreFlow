# 前端数据加载规则

> 核心原则：**分层加载 + 所有请求必须通过 API 文件**。
>
> 数据分两层：
>
> - **底层基础数据**（用户身份 / 权限 / 统计 / 频道配置）— 首次加载页面时请求，全局共享
> - **展示层数据**（作品 / 模板 / Banner / 列表）— 切换到对应页面 / Tab 时才请求
>
> 所有 HTTP 请求必须在 `posecraft/src/api/` 下按功能分类的 API 文件中定义，禁止直接在组件或 composable 中调用 `service.get()`。

## 规则 1：底层基础数据 — 首次加载时请求

> 用户身份、权限、统计等**全局共享、体积小、影响 UI 决策**的数据，在进入首页时统一请求一次。

| 数据                              | 触发时机                             | 说明                    |
| --------------------------------- | ------------------------------------ | ----------------------- |
| 频道配置 `channels`               | 首页 `onMounted` 优先                | 决定 Tab 结构           |
| 用户资料 `userProfile`            | 首页 `onMounted`（与 channels 并行） | 影响"我的"入口显示      |
| 权限 `permissions` / 角色 `roles` | 登录后首次进入首页                   | 影响按钮/操作显隐       |
| 个人统计 `myStats`                | 首页 `onMounted`（与 channels 并行） | 关注/粉丝/获赞数等      |
| 个人设置 `settings`               | 首页 `onMounted`（与 channels 并行） | showTemplate 等 UI 偏好 |

```js
// ✅ 正确：首页 mount 时并行加载底层数据
onMounted(async () => {
  await loadChannels(); // 频道配置（阻塞后续）
  await Promise.all([
    fetchUserProfile(), // 用户资料（并行）
    fetchMyStats(), // 个人统计（并行）
    fetchUserSettings() // 个人设置（并行）
  ]);
  // 展示数据（banner + works）在 channels 加载后触发
});
```

**判断标准**（满足任一即属于底层数据）：

- 体积 < 1KB，请求耗时 < 100ms
- 被 3 个以上组件/Tab 共享
- 影响 UI 元素显隐或权限控制

## 规则 2：展示层数据 — 页面显示时才请求

> 作品列表、模板、Banner 等**体积大、仅特定页面需要**的数据，必须在用户即将看到时才请求。

| 数据                      | 触发时机                                                  | 说明             |
| ------------------------- | --------------------------------------------------------- | ---------------- |
| Banner                    | `channels` 加载后，仅 `recommend` 频道                    | 仅首页推荐位需要 |
| 作品列表                  | `channels` 加载后（recommend 频道）或进入"我的 → 作品"Tab | 按需加载         |
| 模板列表                  | 进入"我的 → 模板"Tab 时                                   | 不提前加载       |
| 喜欢 / 收藏 / 历史 / 推荐 | 进入对应 Tab 时                                           | 不提前加载       |

## 规则 3：父组件不预取子组件数据

```js
// ❌ 错误：父组件 mount 时拉取子组件数据
onMounted(() => {
  fetchUserProfile(); // 用户资料
  fetchMyWorks(); // 我的作品
  fetchMyTemplates(); // 我的模板
});

// ✅ 正确：各组件自行按需加载
// FeaturedView.vue
onMounted(() => {
  activeNav.value = 'featured';
  // 不拉用户资料，由子组件需要时自行调用
});

// MineView.vue（"我的"页面）
onMounted(() => {
  activeNav.value = 'mine';
  authStore.fetchMyWorks(); // 确定要展示才加载
});
```

## 规则 4：Tab 切换按需加载

```js
// ✅ 正确：切换 Tab 时加载对应数据
const changeTab = (tabName: string) => {
  activeTab.value = tabName
  if (tabName === 'works') authStore.fetchMyWorks()
  else if (tabName === 'templates') authStore.fetchMyTemplates()
  else if (tabName === 'likes') authStore.fetchMyLikes()
  else if (tabName === 'collects') authStore.fetchMyCollects()
  else if (tabName === 'history') authStore.fetchMyHistory()
  else if (tabName === 'recommend') authStore.fetchMyRecommendations()
}
```

## 规则 5：并行请求优化

当多个数据同时需要展示时，使用 `Promise.allSettled` 并行请求，单个失败不影响其他：

```js
// ✅ 正确：recommend 频道 banner + works 并行
const [workResult, bannerResult] = await Promise.allSettled([
  workApi.getList({ page, pageSize: 12 }),
  bannerConfigApi.getActive().catch(() => null) // 失败兜底 null
]);
```

## 规则 6：错误兜底

非关键数据（如 Banner）加载失败时静默降级，不阻塞关键数据渲染：

```js
// ✅ 正确：banner 失败不影响 works
activeBanners.value = (bannerResult.status === 'fulfilled' && bannerResult.value) || [];
```

## 规则 7：避免重复请求

- 首页生命周期内数据只自动加载 **1 次**（首次进入时）
- 切换菜单 **不触发** 数据刷新
- 用户主动下拉刷新 / 点击加载更多时才重新请求

```js
// ❌ 错误：watch(activeNav) 触发 refreshData → 切换菜单重复请求
watch(activeNav, () => refreshData());

// ✅ 正确：watch 只管 UI 状态（如搜索框显隐），不触发数据加载
watch(activeNav, newNav => {
  showNavSearch.value = newNav !== 'featured';
});
```

## 规则 8：骨架屏占位

数据加载期间显示骨架屏（SkeletonCard），避免白屏：

```html
<template v-if="loading && filteredItems.length === 0">
  <div class="waterfall-grid">
    <SkeletonCard v-for="n in 8" :key="n" />
  </div>
</template>
```

## 规则 9：所有请求必须通过 API 文件

❌ **禁止**在组件 / composable 中直接调用 `service.get()` / `service.post()`：

```js
// ❌ 错误：绕过 API 文件直接发请求
const res = await service.get('/posecraft/v1/config/channels');
const res = await axios.post('/posecraft/v1/works', data);
```

✅ **正确**：所有请求必须在 `posecraft/src/api/` 下按功能分类的 API 文件中定义：

```js
// posecraft/src/api/bannerConfig.ts
export const bannerConfigApi = {
  getActive: () => service.get('/posecraft/v1/banner-configs/active')
};

// posecraft/src/api/channel.ts（不存在则新建）
export const channelApi = {
  getList: () => service.get('/posecraft/v1/config/channels')
};

// composable 中导入使用
import { channelApi } from '@/api/channel';
const res = await channelApi.getList();
```

现有 API 文件结构：

```
posecraft/src/api/
├── bannerConfig.ts    # Banner 配置
├── channel.ts         # 频道配置（待新建）
├── work.ts            # 作品
├── template.ts        # 模板
├── follow.ts          # 关注
├── interaction.ts     # 互动（点赞/收藏/历史）
├── recommendation.ts  # 推荐
├── user.ts            # 用户资料
├── profile.ts         # 个人统计
└── settings.ts        # 个人设置
```

新增 API 时按功能归类，不属于现有文件的**新建文件**再写。

## 检查清单

新增 API 调用前确认：

- [ ] 是否已在对应的 API 文件中定义？（无则新建文件）
- [ ] 数据属于"底层基础"还是"展示层"？
  - [ ] 底层 → 首页 `onMounted` 并行请求？
  - [ ] 展示 → 页面/Tab 切换时才请求？
- [ ] 数据是否即将展示给用户？
- [ ] 多个数据同时需要时是否并行请求？
- [ ] 非关键数据失败时是否有兜底？
- [ ] 是否避免了重复请求？

## 附录：常见数据分类参考

| 底层基础数据（首页加载）      | 展示层数据（按需加载） |
| ----------------------------- | ---------------------- |
| 频道配置 channels             | Banner 列表            |
| 用户资料 userProfile          | 作品列表 works         |
| 个人统计 myStats              | 模板列表 templates     |
| 权限 permissions / 角色 roles | 喜欢列表 likes         |
| 个人设置 settings             | 收藏列表 collects      |
| 关注统计（关注数/粉丝数）     | 历史记录 history       |
| 互关数 mutual                 | 推荐列表 recommend     |
| 推荐数 recommendations        | —                      |
