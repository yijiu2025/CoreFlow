# 编辑器属性面板结构规范

所有右侧属性面板遵循统一结构，确保 UI 一致性和可维护性。

## 面板结构模板

```vue
<div v-show="activeTab === 'xxx'" class="panel-section">
  <!-- 1. 面板标题 -->
  <div class="panel-title">
    <svg>...</svg>
    面板名称
  </div>

  <!-- 2. 主要操作区 -->
  <div class="xxx-main-area">
    <!-- 主按钮/核心功能 -->
  </div>

  <div class="panel-divider"></div>

  <!-- 3. 工具/选项区 -->
  <div class="section-label">分组标题</div>
  <div class="tool-grid / type-grid / detection-types">
    <!-- 按钮组 -->
  </div>

  <div class="panel-divider"></div>

  <!-- 4. 参数调节区 -->
  <div class="slider-group">
    <label class="slider-label">参数名称</label>
    <div class="slider-row">
      <input type="range" v-model="xxx" min="0" max="100" />
      <span class="slider-val">{{ xxx }}%</span>
    </div>
  </div>

  <div class="panel-divider"></div>

  <!-- 5. 快捷键区 -->
  <div class="section-label">快捷键</div>
  <div class="shortcut-grid">
    <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>Z</kbd><span>撤销</span></div>
    <div class="shortcut-item"><kbd>H</kbd><span>抓手工具</span></div>
  </div>
</div>
```

## 各面板结构对照

### AI 面板
```
├── 面板标题: AI 智能分析
├── 主操作: 智能分析按钮 (ai-hero-btn)
├── 分隔线
├── 分组: 识别类型 (type-grid)
├── 分隔线
├── 分组: 局部识别 (crop-btn)
├── 分隔线
├── 参数: 背景透明度 (slider)
├── 分隔线
└── 快捷键: 滚轮/H
```

### 标注面板
```
├── 面板标题: 标注工具
├── 工具: 选择/画笔/直线/橡皮擦 (tool-grid)
├── 分隔线
├── 参数: 画笔粗细 (slider)
├── 参数: 橡皮擦大小 (slider)
├── 分隔线
├── 颜色: 拾色器 + 预设色块
├── 分隔线
└── 快捷键: Ctrl+Z/Y, Delete, H
```

### 形状面板
```
├── 面板标题: 形状工具
├── 分组: 基础形状 (tool-grid)
├── 分隔线
├── 分组: 构图参考线 (tool-grid)
├── 分隔线
├── 操作: 清除参考线
├── 操作: 清空画布
├── 分隔线
└── 快捷键: Ctrl+Z, Delete, H, 滚轮
```

### 抓手面板
```
├── 面板标题: 视图控制
├── 显示: 缩放百分比
├── 操作: 缩小/重置/放大 (zoom-btns)
├── 分隔线
├── 参数: 缩放比例 (slider)
├── 分隔线
├── 提示: 操作说明 (hand-tips)
├── 分隔线
└── 快捷键: 滚轮/拖拽/Ctrl+=/-/0/H
```

## CSS 类名规范

| 类名 | 用途 | 示例 |
|------|------|------|
| `.panel-section` | 面板容器 | `v-show="activeTab === 'xxx'"` |
| `.panel-title` | 面板标题 | 图标 + 文字 |
| `.panel-divider` | 分隔线 | 水平线 |
| `.section-label` | 分组标题 | 大写字母，灰色 |
| `.section-desc` | 说明文字 | 小字，灰色 |
| `.tool-grid` | 2列网格按钮 | 矩形/圆形等 |
| `.type-grid` | 类型选择卡片 | 识别类型 |
| `.slider-group` | 滑块参数组 | 透明度/粗细 |
| `.shortcut-grid` | 快捷键网格 | 2列布局 |
| `.hand-tips` | 操作提示卡片 | 抓手说明 |

## 新增面板步骤

1. 在 `<aside class="right-panel">` 中添加 `<div v-show="...">`
2. 按模板结构组织内容
3. 添加 CSS 样式
4. 添加快捷键说明
