# KX 页面描述语言规范 v1.0

> 让 AI 读懂页面架构、自动生成代码的声明式 DSL

## 设计原则

1. **人类可读**：像写大纲一样描述页面
2. **AI 可解析**：结构化语法，无歧义
3. **代码可生成**：一句描述 → 一个组件/一段逻辑
4. **渐进增强**：从骨架到细节逐层展开

---

## 语法结构

### 1. 页面定义

```
@page <路由路径> (<显示标题>) {
  @slot <区域名> (<布局类型>) {
    ...
  }
}
```

### 2. 区域/插槽

```
@slot <名称> (layout: flex|grid|absolute, role: main|aside|header) {
  @component ...
}
```

### 3. 组件

```
@component <类型> <名称> {
  @prop <名>: <类型> = <默认值>
  @state <名>: <类型> = <默认值>
  @event <名>(<参数>) -> <处理>
  @navigate <触发> -> <目标路由>
  @permission <权限码>
  @api <方法> <路径> -> <本地状态>
  @render <条件>
}
```

### 4. 组件类型关键词

| 关键词 | 含义 | Vue 映射 |
|---|---|---|
| `header` | 顶部栏 | `<header>` |
| `sidebar` | 侧边栏 | `<aside>` |
| `main` | 主内容区 | `<main>` |
| `list` | 瀑布流/列表 | `v-for` |
| `card` | 卡片 | 卡片组件 |
| `tab` | 选项卡 | `el-tabs` |
| `button` | 按钮 | `<button>` |
| `input` | 输入框 | `<input>` |
| `modal` | 弹窗 | `<el-dialog>` |
| `menu` | 菜单项 | 导航项 |
| `badge` | 角标 | 数字角标 |
| `avatar` | 头像 | 圆形头像 |
| `form` | 表单 | `<el-form>` |
| `media` | 媒体图/视频 | `<img>` / `<video>` |
| `action` | 操作按钮区 | 操作组 |
| `stat` | 统计数字 | 数字展示 |

### 5. 导航

```
@navigate click -> /page/:id
@navigate click -> @{同级页面名}
```

### 6. 权限

```
@permission posecraft:work:create      # 需要登录
@permission role:admin                 # 需要管理员
@login                                 # 仅需登录
```

### 7. 数据流

```
@api GET /posecraft/v1/works -> works    # 获取数据写入本地状态
@api DELETE /posecraft/v1/works/:id      # 触发请求
@mutation works DELETE id                # 本地数组删除项
@sync tabCount = works.length            # Tab 数字同步数组长度
```

### 8. 条件渲染

```
@render when: loading                   # loading 时显示
@render when: works.length > 0          # 有数据时显示
@render when: loggedIn                  # 登录后显示
@render unless: searchQuery             # 无搜索条件时显示
```

---

## 完整示例

```kx
@page / (PoseCraft 主页) {
  
  @slot top (layout: flex, role: header) {
    @component header TopNav {
      @component button 会员功能
      @component button 通知
      @component button 私信
      @component button 投稿 @navigate click -> /editor
      @component avatar 头像 @navigate click -> /mine
    }
  }

  @slot left (layout: flex, role: aside) {
    @component logo Logo
    @component menu Sidebar {
      @component menu 精选 @navigate click -> /featured
      @component menu 推荐 @navigate click -> /recommend
      @component menu 附近 @navigate click -> /nearby
      @component menu 关注 @navigate click -> /following
      @component menu 朋友 @navigate click -> /friends
      @component menu 我的 @navigate click -> /mine
    }
  }

  @slot main (layout: flex, role: main) {
    @component tab ChannelTabs {
      @api GET /posecraft/v1/config/channels -> channels
    }
    @component banner HomeBanner @api GET /posecraft/v1/banner-configs/active
    @component list Waterfall {
      @api GET /posecraft/v1/works -> works
      @component card PoseCard (v-for: item in works) {
        @prop item: Work
        @api POST /posecraft/v1/works/:id/like @mutation works[item].liked
        @component avatar 作者 (bind: item.author)
        @component badge 模板 (if: item.is_template_work)
      }
      @component skeleton SkeletonCard (count: 8) @render when: loading
      @component empty EmptyState @render unless: works.length
    }
  }
}

@page /mine (我的空间) {
  @slot main {
    @component header ProfileHeader {
      @api GET /user/v1/profile -> userProfile
      @component avatar 头像 (bind: userProfile.avatar)
      @component stat 关注 (bind: followingCount) @navigate click -> /following
      @component stat 粉丝 (bind: followersCount) @navigate click -> /followers
      @component stat 互关 (bind: mutualCount)
      @component stat 获赞 (bind: likesCount)
    }
    @component tab SubTabs {
      @component menu 作品 @sync = myWorks.length
      @component menu 模板 @sync = myTemplates.length
    }
    @component list Content {
      @api GET /posecraft/v1/works/mine -> myWorks
      @api GET /posecraft/v1/templates/mine -> myTemplates
      @component card PoseCard (v-for)
      @component action 删除 @api DELETE /works/:id @mutation myWorks DELETE
    }
  }
}
```

---

## AI 生成映射表

| KX 语法 | Vue 3 生成结果 |
|---|---|
| `@page /path` | `router/index.ts` 路由定义 + `views/XXXView.vue` 模板 |
| `@slot main` | `<main>` 区域 |
| `@component card X` | 引用 `components/cards/XCard.vue` |
| `@prop item: Work` | `defineProps<{ item: Work }>()` |
| `@state loading: boolean` | `const loading = ref(false)` |
| `@api GET /path -> works` | `const { data } = await worksApi.getList()` |
| `@navigate click -> /page` | `@click="router.push('/page')"` |
| `@permission posecraft:work:create` | `v-if="authStore.hasPermission('posecraft:work:create')"` |
| `@mutation works DELETE id` | `works.value = works.value.filter(w => w.id !== id)` |
| `@sync = myWorks.length` | `computed(() => myWorks.value.length)` |
| `@render when: loading` | `v-if="loading"` |
| `@render unless: works.length` | `v-if="works.length === 0"` |

---

## 文件组织

```
架构文件/
├── SPEC.md                    # 本规范
├── posecraft/
│   ├── app.kx                 # 全局架构（所有页面）
│   ├── homepage.kx            # 主页
│   ├── mine.kx                # 我的空间
│   ├── work-detail.kx         # 作品详情页
│   └── ...                    # 其他页面
```
