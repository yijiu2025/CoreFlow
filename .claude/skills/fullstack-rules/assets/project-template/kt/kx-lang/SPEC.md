# KX 页面描述语言规范 v1.2

> **一种让 AI 读懂页面架构、自动生成 Vue 3 代码的声明式 DSL。**
> 结构化语法、零歧义、从骨架到细节逐层展开。

## 设计原则

1. **人类可读**：像写大纲一样描述页面，层级即语义。
2. **AI 可解析**：`@<类型> <名称> {}` 块式结构，无歧义。
3. **代码可生成**：一句描述即可输出组件、接口、路由。
4. **渐进增强**：从布局骨架到交互细节逐层叠加。
5. **块级语义**：所有结构均用 `@` 指令明确表达。

---

## 一、语法结构

### 1. 注释与业务说明

```kx
// 单行注释（编译时忽略）
/* 多行注释 */
@note 显式业务规则，AI 必须参考
```

`@note` 与普通注释不同——它是**业务约束声明**，生成器必须将其视为实现依据。

### 2. 文件引用（@ref）

```kx
@ref ./models/user.kx          // 文件级：引用模型文件
@ref ./components/modals.kx    // 文件级：引用组件文件
```

```kx
@button 打开弹窗 {
  @ref ./components/modals.kx  // 内联级：在组件内部引用
  @navigate click -> @ref
}
```

`@ref` 用于跨文件引用，支持两种方式：

| 方式   | 位置     | 用途                              |
| ------ | -------- | --------------------------------- |
| 文件级 | 文件顶部 | 声明该文件依赖的模型、布局、组件  |
| 内联级 | 组件内部 | 按钮打开弹窗、面板引用 API 定义等 |

`@navigate click -> @ref` 表示点击时导航到引用文件的内容。

### 3. 页面与布局

```kx
@page /path (标题) extends AppLayout {
  @icon HomeOutlined
  @meta title="..." description="..."
  @param id: string { from: route }
  @slot main { ... }
}

@layout 布局名 {
  @slot left (role: aside) { ... }
  @slot top (role: header) { ... }
  @slot main (role: main) { ... }
}
```

| 元素      | 说明                                        |
| :-------- | :------------------------------------------ |
| `@page`   | 页面定义，path 为路由路径，括号内为中文标题 |
| `@icon`   | 页面/菜单图标（Ant Design / Arco 图标名）   |
| `@meta`   | SEO meta 信息                               |
| `extends` | 继承布局，子页面填充对应 @slot              |
| `@layout` | 文件级布局定义，可跨页面复用                |
| `@slot`   | 插槽占位，声明 role 标识区域类型            |

### 3. 数据声明

```kx
@model User {                      // 数据模型定义
  @field id: number
  @field username: string
  @field avatar: string
}

@state page: number = 1               // 页面级响应式状态
@prop item: Work                       // 组件 prop 类型声明
@param id: string { from: route }     // 路由参数（route / query）
@state activeTool: string = 'select'  // 带默认值
@param template_id: string { from: query }
```

- `@model`：声明数据模型，包含多个 `@field` 字段，放在 `models/` 目录下。
- `@field`：模型内的字段定义，格式 `@field 字段名: 类型`。
- `@state`：声明响应式变量，支持 `string | number | boolean | object | array` 类型。
- `@prop`：声明组件接收的 props（用于循环内子组件）。
- `@param`：声明路由参数来源（`from: route` 路径参数，`from: query` 查询参数）。
- `@model` 定义在独立的 `models/*.kx` 文件中，通过 `@ref` 被页面引用。

### 4. 数据交互

#### @api — 接口请求

```kx
@api GET /path (query: page, keyword) -> works
@api POST /path (body: { id, title })
@api PUT /works/:id (bind: id)
@api GET /works/:id (query: camera=true) -> works(append)
```

| 语法                                     | 说明                    |
| :--------------------------------------- | :---------------------- |
| `GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS` | HTTP 方法               |
| `/works/:id`                             | 路径参数                |
| `(query: a, b)`                          | 查询参数列表            |
| `(body: { ... })`                        | 请求体                  |
| `(bind: var)`                            | 绑定变量到路径 `:param` |
| `(formData: file)`                       | 文件上传参数            |
| `-> stateName`                           | 结果写入状态            |
| `-> stateName(append)`                   | 追加到数组（加载更多）  |

#### @mutation — 本地状态变更

```kx
@mutation set user.username = editForm.username
@mutation set works.find(w => w.id === id).likes_count += 1
@mutation set works.find(w => w.id === id).liked = true
@mutation filter works = works.filter(w => w.id !== item.id)
@mutation remove works.filter(w => w.author.id === id)
```

| 动词     | 说明                                  | 示例                                                      |
| :------- | :------------------------------------ | :-------------------------------------------------------- |
| `set`    | 赋值或更新属性（支持 `.find()` 定位） | `@mutation set user.name = 'new'`                         |
| `set`    | 数组头部插入（展开语法）              | `@mutation set items = [newItem, ...items]`               |
| `set`    | 数组追加（展开语法）                  | `@mutation set items = [...items, newItem]`               |
| `set`    | 通过 find 定位更新                    | `@mutation set items.find(i => i.id === id).name = 'new'` |
| `filter` | 过滤数组                              | `@mutation filter items = items.filter(i => i.id !== id)` |
| `remove` | 移除元素（语法糖，等价 filter）       | `@mutation remove items.filter(i => i.author.id === id)`  |

#### @sync — 计算属性

```kx
@sync isVip = user.level >= 5
@sync filteredItems = works.filter(w => w.title.includes(keyword))
@sync holdingCount = holdings.length
```

| 规则                                     | 说明 |
| :--------------------------------------- | :--- |
| `@sync` 是**只读计算属性**，不是变量赋值 |
| 右侧必须是纯表达式（无副作用）           |
| 自动依赖追踪，依赖变化时重新计算         |

**✅ 正确用法：**

```kx
@sync filtered = list.filter(w => w.active)     // 计算属性
@sync total = price * quantity                   // 表达式计算
@sync count = items.length                       // 长度计算
```

**❌ 错误用法（反例）：**

```kx
@sync = 'all'                                    // 不是计算，是常量赋值
@sync = 'favorites'                              // 同上，Tab 切换应使用 @state + @navigate
```

**Tab 切换的正确写法：**

```kx
@state activeTab: string = 'all'                 // 声明状态
@menu 全部 { @navigate click -> @state activeTab = 'all' }   // 切换
@menu 自选 { @navigate click -> @state activeTab = 'favorites' }
```

### 5. 组件类型（23 种）

#### 布局组件

| 指令       | 说明       | 典型用途             |
| :--------- | :--------- | :------------------- |
| `@header`  | 顶部栏     | 导航、工具栏         |
| `@sidebar` | 侧边栏     | 左侧菜单、工具面板   |
| `@banner`  | 横幅区     | 首页轮播、活动推广   |
| `@detail`  | 详情容器   | 作品详情、编辑器主体 |
| `@social`  | 社交信息流 | 右侧评论区、元数据   |
| `@logo`    | 品牌 Logo  | 侧边栏顶部、登录页   |

#### 内容组件

| 指令      | 说明       | 典型用途                 |
| :-------- | :--------- | :----------------------- |
| `@card`   | 卡片       | 作品卡片、评论项         |
| `@list`   | 列表容器   | 瀑布流、评论列表、动态流 |
| `@text`   | 文本       | 标题、描述、统计值       |
| `@media`  | 图片/视频  | 封面、视频、相机取景     |
| `@badge`  | 角标       | 状态标签、距离标签       |
| `@avatar` | 头像       | 用户头像、作者头像       |
| `@author` | 作者信息卡 | 含头像、统计、关注按钮   |
| `@stat`   | 统计数字   | 粉丝数、作品数           |

#### 交互组件

| 指令      | 说明     | 典型用途             |
| :-------- | :------- | :------------------- |
| `@button` | 按钮     | 提交、导航、操作触发 |
| `@input`  | 输入框   | 搜索、表单、滑块     |
| `@tab`    | 选项卡   | 频道切换、面板切换   |
| `@menu`   | 菜单     | 导航菜单、下拉菜单   |
| `@action` | 操作栏   | 底部工具栏、互动栏   |
| `@form`   | 表单容器 | 编辑表单、注册表单   |

#### 反馈组件

| 指令        | 说明   | 典型用途                   |
| :---------- | :----- | :------------------------- |
| `@modal`    | 弹窗   | 确认框、表单弹窗、帮助     |
| `@popover`  | 悬浮卡 | 头像卡、预览卡、颜色选择器 |
| `@toast`    | 轻提示 | 操作反馈、错误提示         |
| `@empty`    | 空状态 | 无数据占位                 |
| `@skeleton` | 骨架屏 | 加载占位（`count: 8`）     |

#### 循环与属性绑定

```kx
@card 卡片 (v-for: item in works) { ... }
@media 封面 (bind: item.cover_url)
@text 标题 (bind: item.title)
@stat 粉丝 (bind: user.followersCount)
```

#### 组件接口定义（@prop + @note）

复杂组件（如 K 线图、图表）应明确定义 props 和接口，避免仅用 @note 描述功能：

```kx
// ✅ 正确：定义组件接口
@detail KLineChart {
  @prop klineData: KLineData[]     // 必填：K 线数据
  @prop indicators: string[]       // 可选：指标列表
  @prop theme: string = 'default'  // 可选：主题（带默认值）

  @note 基于 ECharts 渲染，不支持 SSR
  @note 十字光标 hover 显示精确 OHLC 值
  @note 鼠标滚轮缩放 + 拖拽平移
}

// ❌ 错误：仅用 @note 描述，没有接口定义
@note K 线图组件，基于 ECharts 渲染
@note 支持：日K/周K/月K切换
```

**接口定义规则：**

| 规则                                 | 说明                             |
| :----------------------------------- | :------------------------------- |
| 每个 `@prop` 声明组件接收的一个属性  | `@prop data: Type`               |
| 带默认值的 prop 生成时可选           | `@prop count: number = 10`       |
| 复杂交互用 `@note` 补充说明          | 行为和限制说明                   |
| 纯视觉装饰（如占位骨架）可省略 props | `@skeleton 表格骨架 (count: 10)` |

### 6. 条件渲染与循环

```kx
@render when: works.length > 0
@render when: item.status === 'published'
@render when: isVip
@render unless: !works.length
@render when: activeTool === 'draw'
@render when: showOverlay && work.image_url
@render when: !hasMore && works.length > 0
```

- `when:` — 条件为真时渲染。
- `unless:` — 条件为假时渲染。
- 支持比较、逻辑运算符（`&&` `||` `===` `!==` `>` `<`）。

### 7. 事件与导航

#### @navigate — 路由跳转

```kx
@navigate click -> /editor?id={item.id}
@navigate click -> /work/:id
@navigate click -> @modal 删除确认
@navigate click -> @popover 颜色选择器
@navigate success -> /
@navigate click -> back
@navigate click -> @action saveData
@navigate prefetch -> /work/:id
@navigate click -> @state show = true
```

| 目标类型  | 示例                      | 说明             |
| :-------- | :------------------------ | :--------------- |
| 路径      | `-> /work/:id`            | 路径参数自动替换 |
| 路径+查询 | `-> /editor?id={item.id}` | 查询拼接         |
| @action   | `-> @action saveData`     | 触发 action      |
| @popover  | `-> @popover 颜色选择器`  | 展开浮窗         |
| @modal    | `-> @modal 删除确认`      | 打开弹窗         |
| @prefetch | `-> @prefetch`            | 预加载路由       |
| @state    | `-> @state show = true`   | 切换状态         |
| back      | `-> back`                 | 浏览器后退       |
| success   | `-> success`              | 成功后导航       |

#### @event — DOM 事件

```kx
@event click -> @api retry
@event submit -> @mutation set submitted = true
```

### 8. 悬浮交互

#### 自动托管模式

```kx
@avatar 头像 {
  @hover -> @popover 头像悬浮卡
}
```

#### 手动控制模式

```kx
@hover {
  @state show = true
  @delay show: 300ms
}
@leave {
  @delay hide: 200ms
}
@popover 详情浮窗 {
  @render when: show
  @anchor @card 作品卡片
  @position bottom
}
```

| 指令        | 说明                              |
| :---------- | :-------------------------------- |
| `@hover`    | 悬停触发容器                      |
| `@leave`    | 离开触发容器                      |
| `@delay`    | 延迟显示/隐藏（格式化：`300ms`）  |
| `@anchor`   | 浮窗锚定目标组件                  |
| `@position` | 浮窗位置（top/bottom/left/right） |

### 9. 权限与守卫

```kx
@button 投稿 {
  @permission posecraft:work:create
  @login
}
```

提供三种模式：

| 模式   | 写法               | 行为                   |
| :----- | :----------------- | :--------------------- |
| 仅登录 | `@login`           | 未登录跳转登录页       |
| 仅权限 | `@permission code` | 无权限隐藏元素         |
| 组合   | 两者叠加           | 先校验登录，再校验权限 |

### 10. 状态容器

```kx
@list 作品列表 {
  @loading {
    @skeleton 卡片骨架 (count: 8)
  }
  @empty {
    @empty 空状态 {
      @icon 📂
      @text 暂无内容
      @button 立即投稿 { @navigate click -> /editor }
    }
  }
  @error {
    @toast "加载失败，点击重试"
    @event click -> @api retry
  }
  @card 作品卡片 (v-for: item in works) { ... }
}
```

`@loading` / `@empty` / `@error` 是 `@list` 内部的生命周期容器，分别对应加载中、无数据、接口异常三种状态。

**重要规则：`@empty` 必须定义在 `@list` / `@detail` 等容器内部**，不能独立存在。非容器需要空状态提示时，使用 `@render when` + `@text` 替代：

```kx
// ✅ 正确：@empty 在 @list 内部
@list 作品列表 {
  @empty { @text 暂无数据 }
}

// ✅ 正确：非容器场景用 @render + @text
@render when: !selectedStock
@text 提示 { @text 请先选择一只股票 }

// ❌ 错误：@empty 独立存在
@empty 未选择 { @text 提示文字 }
```

---

## 二、完整实战示例

### 示例 1：全局布局（app.kx）

```kx
@layout PosecraftLayout {
  @slot left (role: aside) {
    @sidebar 侧边栏 {
      @logo Logo { @navigate click -> / }
      @menu 发现 {
        @menu 精选 @navigate click -> /
        @menu 推荐 @navigate click -> /recommend
      }
      @menu 社交 {
        @menu 我的 @navigate click -> /mine @login
      }
    }
  }
  @slot top (role: header) {
    @header 顶部栏 {
      @input 搜索框 {
        @api GET /works (query: keyword) -> results
      }
      @avatar 头像 {
        @hover -> @popover 头像悬浮卡
        @navigate click -> /mine @login
      }
    }
  }
  @slot main (role: main) { }
}

@popover 头像悬浮卡 {
  @avatar 头像 (bind: user.avatar)
  @text 用户名 (bind: user.username)
  @stat 粉丝 (bind: user.followersCount)
  @menu 退出登录 {
    @api POST /auth/logout
    @navigate success -> /login
  }
}
```

### 示例 2：首页频道页

```kx
@page / (精选) extends PosecraftLayout {
  @icon HomeOutlined
  @meta title="精选姿势"

  @slot main {
    @tab 频道Tab {
      @api GET /config/channels -> channels
      @state activeChannel: string = 'recommend'
    }
    @list 作品瀑布流 {
      @api GET /works (query: page, pageSize, channel: activeChannel) -> works
      @loading { @skeleton 卡片骨架 (count: 8) }
      @empty {
        @empty 空状态 {
          @text 暂无内容
          @button 立即投稿 { @navigate click -> /editor }
        }
      }
      @card 作品卡片 (v-for: item in works) {
        @prop item: Work
        @media 封面图 (bind: item.cover_url)
        @text 标题 (bind: item.title)
        @badge 模板 { @render when: item.is_template }
        @action 操作栏 {
          @button 点赞 (bind: item.likes_count) {
            @api POST /works/:id/like
            @mutation set works.find(w => w.id === id).likes_count += 1
            @login
          }
        }
        @navigate click -> /work/:id
      }
      @button 加载更多 {
        @api GET /works (page: nextPage) -> works(append)
        @render when: hasMore
      }
    }
  }
}
```

### 示例 3：作品详情页

```kx
@page /work/:id (作品详情) extends PosecraftLayout {
  @param id: string { from: route }

  @slot main {
    @detail 作品详情 {
      @media 图片浏览区 {
        @api GET /works/:id (bind: id) -> work
        @media 主图 (bind: work.image_url)
        @media 视频 (bind: work.video_url) { @render when: work.video_url }
      }
      @author 作者信息卡 {
        @avatar 作者头像 (bind: work.author.avatar) {
          @hover -> @popover 作者悬浮卡
          @navigate click -> /user/:id
        }
        @text 作者名 (bind: work.author.username)
        @button 关注 {
          @api POST /follow/:userId (bind: work.author.id)
          @render when: !isOwner
          @login
        }
      }
      @list 评论列表 {
        @input 评论输入框
        @button 发送 {
          @api POST /interaction/comment
          @login
        }
        @card 评论项 (v-for: comment in comments) {
          @avatar 头像 (bind: comment.author)
          @text 内容 (bind: comment.text)
        }
        @empty { @text 💬 还没有人评论 }
      }
    }
  }
}

@popover 作者悬浮卡 {
  @prop author: User
  @avatar 头像 (bind: author.avatar)
  @text 用户名 (bind: author.name)
  @stat 粉丝 (bind: author.stats.followers)
  @button 关注 { @api POST /follow/:userId @login }
}
```

---

## 三、AI 生成映射表

| KX 语法                              | Vue 3 输出                                        |
| :----------------------------------- | :------------------------------------------------ |
| `@page /path (标题) extends Layout`  | `router.ts` 路由 + `<router-view>` + 布局组件     |
| `@layout Name { @slot main }`        | Vue SFC 布局组件 + `<slot name="main">`           |
| `@ref ./path/to/file.kx`             | 加载文件，注入类型和组件定义，等价于 `import`     |
| `@model Name { @field id: type }`    | TypeScript 类型定义 `interface Name { id: type }` |
| `@field name: type`                  | 接口字段 `name: type`                             |
| `@header`                            | `<header>` sticky 顶部                            |
| `@sidebar`                           | `<aside>` 固定宽度侧边栏                          |
| `@avatar (bind: url)`                | `<img>` + 圆形样式                                |
| `@media (bind: url)`                 | `<img>` / `<video>`                               |
| `@card`                              | 卡片容器（hover 阴影）                            |
| `@list`                              | 列表容器 + 瀑布流 column                          |
| `@tab`                               | Tabs 组件 + 内部切换                              |
| `@button`                            | `<button>` 或 `<a-button>`                        |
| @input                               | `<input>` / `<textarea>` / `<slider>`             |
| `@menu`                              | 菜单列表 + 子菜单                                 |
| `@action`                            | 操作栏容器（flex）                                |
| `@modal`                             | Modal 弹窗（teleport body）                       |
| `@popover`                           | Popover / Tooltip（绝对定位）                     |
| `@badge`                             | 角标组件（absolute 右上角）                       |
| `@stat`                              | 统计数字 + 单位                                   |
| `@banner`                            | 轮播图（Carousel）                                |
| `@logo`                              | Logo 链接                                         |
| `@author`                            | 作者信息卡（头像+统计+关注）                      |
| `@toast`                             | Toast 轻提示                                      |
| `@empty`                             | 空状态占位组件                                    |
| `@skeleton`                          | Skeleton 骨架屏                                   |
| `@detail`                            | 详情容器（双栏布局）                              |
| `@social`                            | 社交信息流容器                                    |
| `@form`                              | `<form>` 表单容器                                 |
| `@state count: number = 0`           | `const count = ref(0)`                            |
| `@prop item: Work`                   | `defineProps<{ item: Work }>()`                   |
| `@param id: string { from: route }`  | `useRoute().params.id`                            |
| `@api GET /works -> works`           | `axios.get()` + `const works = ref()`             |
| `@mutation set works.find(...)`      | `works.value.find(...)` 赋值                      |
| `@sync filtered = works.filter(...)` | `const filtered = computed(...)`                  |
| `@render when: cond`                 | `v-if="cond"`                                     |
| `@render unless: cond`               | `v-if="!cond"`                                    |
| `@hover -> @popover Card`            | `@mouseenter` + popover 显示                      |
| `@delay show: 300ms`                 | `setTimeout(show, 300)`                           |
| `@anchor @card`                      | 浮窗锚定目标 ref                                  |
| `@navigate click -> /path`           | `router.push('/path')`                            |
| `@navigate success -> /`             | 成功后 `router.push('/')`                         |
| `@permission code`                   | 权限判断 `v-if`                                   |
| `@login`                             | 未登录 `router.push('/login')`                    |
| `@loading { @skeleton }`             | 加载状态分支                                      |
| `@empty { @empty }`                  | 空状态分支                                        |
| `@error { @toast }`                  | 错误状态分支                                      |
| `v-for: item in works`               | `v-for="item in works"`                           |
| `bind: item.title`                   | `:src="item.title"` / 文本插值                    |
| `-> works(append)`                   | push 追加到数组                                   |
| `-> stateName`                       | 返回值赋值给状态                                  |

---

## 四、文件组织

### 4.1 目录结构

```
<项目名>/
└── guide/                     # 需求与设计文档根目录
    ├── index.kx               # 项目入口文件：概述、数据模型、API 总览、文件引用
    ├── layouts/               # 布局文件目录
    │   ├── main.kx            # 主布局
    │   └── auth.kx            # 登录/注册布局
    ├── pages/                 # 页面文件目录
    │   ├── home.kx            # 首页（对应 @page /）
    │   ├── detail.kx          # 详情页（对应 @page /:id）
    │   ├── editor.kx          # 编辑器页
    │   └── login.kx           # 登录页
    ├── models/                # 数据模型定义目录
    │   ├── user.kx            # 用户模型
    │   ├── work.kx            # 作品模型
    │   └── api.kx             # API 接口定义
    └── components/            # 共享组件定义目录
        ├── popovers.kx        # 全局浮窗/悬浮卡
        └── shared.kx          # 跨页面通用组件
```

### 4.2 文件间引用（@ref）

不同 `.kx` 文件之间通过 `@ref` 指令相互引用，AI 根据 `@ref` 路径自动定位到对应文件。

**两种使用方式：**

| 方式   | 位置             | 示例                    | 用途                       |
| ------ | ---------------- | ----------------------- | -------------------------- |
| 文件级 | 文件顶部（推荐） | `@ref ./models/work.kx` | 声明该文件依赖的模型、布局 |
| 内联级 | 任意组件内部     | `@ref ./models/work.kx` | 在特定组件上下文中引用模型 |

**文件级引用**（在文件顶部统一声明所有依赖）：

```kx
// pages/home.kx
@ref ../layouts/main.kx      // 引用主布局
@ref ../models/work.kx       // 使用 Work 模型
```

**内联级引用**（在组件内部引用，AI 在该组件上下文中加载对应文件）：

```kx
@button 管理模型 {
  @ref ./models/work.kx         // 加载 work.kx 模型文件，按钮可操作该模型
  @navigate click -> @ref       // 打开引用文件内容
}
```

```kx
@button 打开弹窗 {
  @ref ./components/modals.kx   // 加载弹窗组件文件
  @navigate click -> @ref       // 点击时打开该弹窗
}
```

```kx
@modal 编辑作品 {
  @ref ../models/work.kx        // 弹窗内引用模型
  @form 编辑表单 { ... }
}
```

> 内联 `@ref` 适用于：按钮打开弹窗、按钮关联数据模型、面板引用 API 定义等场景。`@navigate click -> @ref` 表示点击时导航到引用文件。AI 在解析该组件时自动加载对应文件。

### 4.3 文件职责划分

| 文件              | 内容                                               | 示例                 |
| ----------------- | -------------------------------------------------- | -------------------- |
| `index.kx`        | 项目概述、数据模型总览、API 总览、所有 `@ref` 引用 | 项目全局入口         |
| `layouts/*.kx`    | 布局定义（`@layout`）、全局插槽                    | 主布局、侧边栏、顶栏 |
| `pages/*.kx`      | 页面定义（`@page`）、路由、页面组件                | 首页、详情页等       |
| `models/*.kx`     | 数据模型（`@model`）、字段定义、关联关系           | User、Work 模型      |
| `components/*.kx` | 共享组件（`@popover`、`@card` 等）                 | 全局浮窗、通用组件   |

### 4.4 数据模型定义（@model）

在 `models/` 目录下的 `.kx` 文件中定义数据结构：

```kx
// models/user.kx
@model User {
  @field id: number             // 用户 ID
  @field username: string       // 用户名
  @field avatar: string         // 头像 URL
  @field role: string           // 角色
  @field created_at: string     // 创建时间
}

@model Work {
  @field id: number
  @field title: string          // 作品标题
  @field cover_url: string      // 封面图
  @field author: User           // 关联 User 模型
  @field likes_count: number
  @field status: number         // 状态：1公开 0私密
}
```

**`@model` 命名规范：**

| 规则                                               | 示例                                                |
| :------------------------------------------------- | :-------------------------------------------------- |
| `@model` 只用于定义**数据模型**（实体/值对象）     | `@model User`, `@model Work`                        |
| API 接口定义使用 `@model API` 作为容器             | `@model API { @api GET ... }`                       |
| 不要用 `@model XxxAPI` 或 `@model XxxService` 命名 | ❌ `@model UserAPI` → ✅ 用 `@model API` 加注释分组 |
| 一个文件可定义多个 `@model`                        | 建议不超过 5 个，超限拆分文件                       |

### 4.5 API 定义（@api）

在 `models/api.kx` 中集中定义所有 API 接口：

```kx
// models/api.kx
@model API {
  // 作品相关
  @api GET /api/v1/works (query: page, pageSize, channel) -> works
  @api GET /api/v1/works/:id (bind: id) -> work
  @api POST /api/v1/works/:id/like -> void

  // 用户相关
  @api GET /api/v1/user/profile -> userProfile
  @api POST /api/v1/auth/login -> token

  // 配置相关
  @api GET /api/v1/config/channels -> channels
}
```

### 4.6 首页入口示例（index.kx）

```kx
// ============================================================
// 项目：PoseCraft
// 描述：3D 角色姿势分享平台
// ============================================================

@note 项目入口文件，所有页面和模型在此引用

@ref ./layouts/main.kx
@ref ./pages/home.kx
@ref ./pages/detail.kx
@ref ./pages/editor.kx
@ref ./pages/login.kx
@ref ./models/user.kx
@ref ./models/work.kx
@ref ./models/api.kx

@note 数据模型总览：
//  User  - 用户（username, avatar, role）
//  Work  - 作品（title, cover_url, author → User, likes_count）
//  API   - 接口定义

@note 路由总览：
//  /             → home.kx      首页
//  /work/:id     → detail.kx    详情页
//  /editor       → editor.kx    编辑器
//  /login        → login.kx     登录页
```

### 4.7 约定

- **一个 `.kx` 文件对应一个页面或一个独立模块**
- **`index.kx`** 为项目入口文件，描述架构全貌，不包含 `@ref` 和 `@note` 指令
- **页面文件**通过 `@ref` 引用其使用的模型文件，生成器据此定位数据模型
- **`models/`** 目录下定义数据模型和 API，通过 `@ref` 被页面引用
- **`@ref`** 路径相对于当前文件，使用 Unix 路径格式（`./`、`../`）
- AI 根据 `@ref` 自动加载对应文件，无需手动指定
- **布局文件（layouts/）** 可定义全局状态，页面通过 `extends` 继承
- 请勿使用 `@model XxxAPI` 命名 API 分组，统一使用 `@model API`

### 4.8 全局状态管理

跨页面共享的状态定义在布局文件中（因其始终挂载）：

```kx
// layouts/main.kx
@layout MainLayout {
  @state isLoggedIn: boolean = false     // 登录状态
  @state user: object = {}               // 当前用户信息
  @state searchResults: array = []       // 全局搜索结果

  @slot main (role: main) { }            // 子页面填充
}
```

| 状态类型       | 定义位置            | 访问方式                            |
| :------------- | :------------------ | :---------------------------------- |
| 页面私有状态   | 页面自身的 `@state` | 页面内直接使用                      |
| 跨页面共享状态 | 布局文件的 `@state` | 子页面通过 `extends` 继承访问       |
| 路由参数       | 页面的 `@param`     | `@param id: string { from: route }` |

---

## 五、常见错误（反例速查）

| 错误                       | 反例                                     | 正确写法                                                     |
| :------------------------- | :--------------------------------------- | :----------------------------------------------------------- |
| `@sync` 用于常量赋值       | `@menu 全部 { @sync = 'all' }`           | `@menu 全部 { @navigate click -> @state activeTab = 'all' }` |
| `@empty` 独立存在          | `@empty 未选择 { @text 提示 }`           | 改为 `@render when` + `@text`                                |
| `@mutation` 使用 JS 方法名 | `@mutation set trades.unshift(newTrade)` | `@mutation set trades = [newTrade, ...trades]`               |
| `@model` 命名 API 分组     | `@model StockAPI { @api ... }`           | 统一用 `@model API { @api ... }`                             |
| 组件只有 @note 无接口      | `@note K线图组件，基于 ECharts`          | `@detail KLineChart { @prop klineData }`                     |
| 硬编码循环中的名称         | `@card 上证指数 (v-for: idx in indexes)` | `@card 指数卡片 (v-for: idx in indexes)`                     |
| @note 和 // 注释混用       | 同一场景有时用 @note 有时用 //           | 业务约束用 @note，描述用 //                                  |
| 页面未引用模型             | 页面代码无 @ref                          | 顶部加 `@ref ../models/xxx.kx`                               |

---

## 六、版本历史

| 版本 | 日期    | 功能                                                                                                                                                                               |
| :--- | :------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2025-06 | 基础指令集：`@page` `@slot` `@button` `@api` `@navigate`                                                                                                                           |
| v1.1 | 2025-08 | 新增 `@mutation` `@sync` `@render` `@state` `@prop` `@param`                                                                                                                       |
| v1.2 | 2025-10 | 新增 `@hover` `@leave` `@anchor` `@position` `@delay` `@permission` `@login` `@event` `@form` `@switch` `@summary` `@section` `@social` `@error` `@prefetch`；扩展组件类型至 23 种 |
| v1.3 | 2026-07 | 补充 `@sync` 计算属性规范、`@mutation` 数组操作语法、`@empty` 容器约束、`@model` 命名规范；新增组件接口定义模式、全局状态管理、常见错误反例速查表；更新 `@ref` 约定                |

---

## 七、许可证

MIT License

Copyright (c) 2025 KX Language Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this specification and associated documentation files, to deal in the specification without restriction, including without limitation the rights to use, copy, modify, merge, publish, and distribute.
