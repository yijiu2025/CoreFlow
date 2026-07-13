# 前端数据加载规则

> 核心原则：**展示什么才获取什么，所有请求必须通过 API 文件**。数据必须在用户即将看到它的那一刻才发起请求，禁止在父级 mount 时预取子级数据；所有 HTTP 请求必须在 `posecraft/src/api/` 下按功能分类的 API 文件中定义，禁止直接在组件或 composable 中调用 `service.get()`。

## 规则 1：按可见性触发请求

| 数据 | 触发时机 | 说明 |
|---|---|---|
| 频道配置 `channels` | 首页 `onMounted` 优先 | 例外：必须优先加载（决定 Tab 结构） |
| Banner + 作品 | `channels` 加载后仅一次 | 仅 `recommend` 频道才请求 banner |
| 用户资料 / 统计 | 进入"我的"页面或需要展示用户信息时 | 不在首页 mount 预取 |
| 作品列表 | 进入"我的 → 作品"Tab 时 | 不提前加载 |
| 模板列表 | 进入"我的 → 模板"Tab 时 | 不提前加载 |
| 喜欢 / 收藏 / 历史 / 推荐 | 进入对应 Tab 时 | 不提前加载 |

## 规则 2：父组件不预取子组件数据

```js
// ❌ 错误：父组件 mount 时拉取子组件数据
onMounted(() => {
  fetchUserProfile()     // 用户资料
  fetchMyWorks()         // 我的作品
  fetchMyTemplates()     // 我的模板
})

// ✅ 正确：各组件自行按需加载
// FeaturedView.vue
onMounted(() => {
  activeNav.value = 'featured'
  // 不拉用户资料，由子组件需要时自行调用
})

// MineView.vue（"我的"页面）
onMounted(() => {
  activeNav.value = 'mine'
  authStore.fetchMyWorks()  // 确定要展示才加载
})
```

## 规则 3：Tab 切换按需加载

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

## 规则 4：并行请求优化

当多个数据同时需要展示时，使用 `Promise.allSettled` 并行请求，单个失败不影响其他：

```js
// ✅ 正确：recommend 频道 banner + works 并行
const [workResult, bannerResult] = await Promise.allSettled([
  workApi.getList({ page, pageSize: 12 }),
  bannerConfigApi.getActive().catch(() => null)  // 失败兜底 null
])
```

## 规则 5：错误兜底

非关键数据（如 Banner）加载失败时静默降级，不阻塞关键数据渲染：

```js
// ✅ 正确：banner 失败不影响 works
activeBanners.value = (bannerResult.status === 'fulfilled' && bannerResult.value) || []
```

## 规则 6：避免重复请求

- 首页生命周期内数据只自动加载 **1 次**（首次进入时）
- 切换菜单 **不触发** 数据刷新
- 用户主动下拉刷新 / 点击加载更多时才重新请求

```js
// ❌ 错误：watch(activeNav) 触发 refreshData → 切换菜单重复请求
watch(activeNav, () => refreshData())

// ✅ 正确：watch 只管 UI 状态（如搜索框显隐），不触发数据加载
watch(activeNav, (newNav) => {
  showNavSearch.value = newNav !== 'featured'
})
```

## 规则 7：骨架屏占位

数据加载期间显示骨架屏（SkeletonCard），避免白屏：

```html
<template v-if="loading && filteredItems.length === 0">
  <div class="waterfall-grid">
    <SkeletonCard v-for="n in 8" :key="n" />
  </div>
</template>
```

## 规则 8：所有请求必须通过 API 文件

❌ **禁止**在组件 / composable 中直接调用 `service.get()` / `service.post()`：

```js
// ❌ 错误：绕过 API 文件直接发请求
const res = await service.get('/posecraft/v1/config/channels')
const res = await axios.post('/posecraft/v1/works', data)
```

✅ **正确**：所有请求必须在 `posecraft/src/api/` 下按功能分类的 API 文件中定义：

```js
// posecraft/src/api/bannerConfig.ts
export const bannerConfigApi = {
  getActive: () => service.get('/posecraft/v1/banner-configs/active')
}

// posecraft/src/api/channel.ts（不存在则新建）
export const channelApi = {
  getList: () => service.get('/posecraft/v1/config/channels')
}

// composable 中导入使用
import { channelApi } from '@/api/channel'
const res = await channelApi.getList()
```

现有 API 文件结构：

```
posecraft/src/api/
├── bannerConfig.ts    # Banner 配置
├── work.ts            # 作品
├── template.ts        # 模板
├── follow.ts          # 关注
├── interaction.ts     # 互动（点赞/收藏/历史）
├── recommendation.ts  # 推荐
├── user.ts            # 用户资料
└── profile.ts         # 个人统计
```

新增 API 时按功能归类，不属于现有文件的**新建文件**再写。

## 检查清单

新增 API 调用前确认：

- [ ] 是否已在对应的 API 文件中定义？（无则新建文件）
- [ ] 数据是否即将展示给用户？
- [ ] 是否可以在用户切换到对应 Tab / 页面时才加载？
- [ ] 多个数据同时需要时是否并行请求？
- [ ] 非关键数据失败时是否有兜底？
- [ ] 是否避免了重复请求？
