# PoseCraft 前端页面流转与交互关系图 (User Flow & Interactions)

本文件使用 Mermaid.js 拓扑连线图定义了 `posecraft` (动作捕获工作台) 前端的所有页面流转与核心 API 交互逻辑，供 AI 和开发者进行功能边界分析。

---

## 1. 全景页面连线图 (Flowchart)

```mermaid
flowchart TD
    %% 页面节点声明
    Login[登录页 LoginView.vue]
    Callback[登录回调页 CallbackView.vue]
    Home[工作台首页 HomeView.vue]
    Profile[个人主页 ProfileView.vue]
    Editor[动作画布编辑器 EditorView.vue]
    Camera[相机捕获页 CameraView.vue]
    TemplateDetail[模板动作详情 TemplateDetail.vue]
    WorkDetail[作品详情 WorkDetail.vue]

    %% 交互连线与流转逻辑
    Login -->|点击登录/扫码| Callback
    Callback -->|校验凭证成功| Home
    
    Home -->|点击导航 '个人中心'| Profile
    Home -->|点击动作列表卡片| TemplateDetail
    Home -->|点击 '新建动作' 按钮| Editor
    Home -->|点击关注流作品| WorkDetail
    
    TemplateDetail -->|点击 '以此套用模版'| Editor
    TemplateDetail -->|点击 '返回'| Home
    
    WorkDetail -->|点击 '作者头像'| Profile
    WorkDetail -->|点击 '返回'| Home
    
    Editor -->|点击 '开启相机捕获'| Camera
    Editor -->|点击 '保存/发布' -> 调用保存API| SavePose[POST /api/v1/pose/save]
    Editor -->|点击 '返回'| Home
    
    Camera -->|完成识别导出坐标| Editor
    Camera -->|点击 '取消'| Editor
    
    Profile -->|点击作品列表卡片| WorkDetail
    Profile -->|点击 '返回首页'| Home
```

---

## 2. 核心功能及交互提示 (Functional Tooltips)

*   **工作台首页 (`HomeView.vue`)**：
    *   *功能*：聚合了推荐动作模版列表、用户个人近期动作以及关注作者的作品流。
    *   *跳转*：点击模版进入详情，点击新建进入空白画布，点击关注作品进入播放详情。
*   **动作画布编辑器 (`EditorView.vue`)**：
    *   *功能*：支持二维人体骨骼点（关节）的拖拽微调。内置 Undo/Redo 历史栈。
    *   *跳转*：可以通过上方按钮启动相机进行骨骼动作识别捕获 (`CameraView.vue`)，捕捉完毕后将坐标回填至画布。
*   **相机捕获页 (`CameraView.vue`)**：
    *   *功能*：调用本地摄像头，通过 WebGL 渲染和手势/骨骼识别算法实时提取人体关节点坐标。
    *   *交互*：捕捉完成后生成 JSON 数据，回传并跳转回编辑器。

---

## 3. 主界面布局与功能分区结构 (HomeView Layout Structure)

下面使用 Mermaid 拓扑嵌套子图定义了主页面 `HomeView.vue` 内部各功能模块和布局层次的分配关系：

```mermaid
flowchart TB
    subgraph HomeView["工作台主页 HomeView.vue 布局结构"]
        direction LR
        
        subgraph Sidebar["左侧侧边栏 .side-bar"]
            direction TB
            Logo["Brand Header (Logo: PoseCraft)"]
            
            subgraph DiscoveryGroup["发现分类"]
                Featured["💎 精选 (featured)"]
                Recommend["✨ 推荐 (recommend)"]
                Nearby["📍 附近 (nearby)"]
                AiSearch["🔍 AI 搜索 (ai-search)"]
            end
            
            subgraph SocialGroup["社交分类"]
                Following["❤️ 关注 (following)"]
                Friends["👥 朋友 (friends)"]
                Mine["👤 我的 (mine)"]
            end
            
            subgraph BottomMenu["底部悬浮设置"]
                Settings["⚙️ 设置 (主题/通用/AI)"]
                About["ℹ️ 关于我们"]
            end
        end

        subgraph MainContainer["右侧主内容容器 .main-container"]
            direction TB
            
            subgraph TopNav["顶部通栏导航 .top-nav"]
                ToggleBtn["☰ 菜单折叠/展开"]
                PageTitle["页面标题"]
                SearchInline["🔍 紧凑搜索框"]
                NavActions["VIP / 消息 🔔 / 私信 ✉️"]
                Avatar["👤 头像下拉个人菜单"]
            end
            
            subgraph ContentArea["主体内容区 .content-area"]
                direction TB
                PoseWaterfall["姿势卡片瀑布流 (Masonry Grid)"]
                EmptyState["空数据占位视图"]
                LoadingState["骨架屏加载占位"]
            end
        end
        
        Sidebar --- MainContainer
    end
```

