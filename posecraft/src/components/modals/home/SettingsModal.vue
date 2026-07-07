<template>
  <div class="modal-overlay animate-fade-in" @click.self="$emit('close')">
    <div class="settings-modal-card">
      <!-- 头部 -->
      <div class="modal-header">
        <div class="header-title-group">
          <span class="header-icon">⚙️</span>
          <h3>系统设置</h3>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <!-- 内容区分左右栏 -->
      <div class="modal-body-container">
        <!-- 左侧菜单导航 -->
        <aside class="settings-sidebar">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="['tab-btn', { active: currentSection === tab.id }]"
            @click="scrollToTab(tab.id)"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.name }}</span>
          </button>
        </aside>

        <!-- 右侧内容区域（带平滑滚动监测） -->
        <main class="settings-content" ref="scrollContainer" @scroll="handleScroll">
          <!-- 通用设置 -->
          <section id="settings-sec-general" class="settings-section">
            <h4 class="section-title">🛠️ 通用设置</h4>
            
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认显示模板骨骼</div>
                <div class="setting-desc">在浏览列表及作品卡片时，默认加载并显示姿势骨骼层。若关闭此项，将不加载骨骼层图片，仅加载底图，可节省服务器带宽。</div>
              </div>
              <label class="switch-label">
                <input type="checkbox" v-model="showTemplate" class="switch-input" />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">启用高画质预览</div>
                <div class="setting-desc">优先加载未压缩 of 原始底图以保证视觉细节，网络条件较差时建议关闭。</div>
              </div>
              <label class="switch-label">
                <input type="checkbox" v-model="highQuality" class="switch-input" />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">界面语言 (Language)</div>
                <div class="setting-desc">更改应用程序所展示的文字语言。</div>
              </div>
              <select class="setting-select" v-model="language">
                <option value="zh">简体中文</option>
                <option value="en">English (US)</option>
              </select>
            </div>
          </section>

          <div class="section-divider"></div>

          <!-- AI设置 -->
          <section id="settings-sec-ai" class="settings-section">
            <h4 class="section-title">🤖 AI 辅助设置</h4>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">自动进行姿态分析</div>
                <div class="setting-desc">导入或拍摄完底图后，AI 自动检测并绘制人体参考骨架线。</div>
              </div>
              <label class="switch-label">
                <input type="checkbox" v-model="autoAnalysis" class="switch-input" />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="setting-row block-layout">
              <div class="setting-info">
                <div class="setting-label">AI 关键点敏感度 ({{ sensitivity }}%)</div>
                <div class="setting-desc">设置检测关键点时的阈值，数值越高对边缘模糊的关节识别越苛刻。</div>
              </div>
              <div class="range-wrapper">
                <input type="range" min="10" max="100" v-model="sensitivity" class="setting-range" />
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">优先使用本地计算</div>
                <div class="setting-desc">开启后将尝试利用您设备的 WebGL/GPU 进行 AI 运算，关闭则提交给云端。</div>
              </div>
              <label class="switch-label">
                <input type="checkbox" v-model="preferLocal" class="switch-input" />
                <span class="switch-slider"></span>
              </label>
            </div>
          </section>

          <div class="section-divider"></div>

          <!-- 键盘快捷键 -->
          <section id="settings-sec-shortcuts" class="settings-section">
            <h4 class="section-title">⌨️ 键盘快捷键</h4>
            <div class="shortcuts-grid">
              <div class="shortcut-item">
                <span class="shortcut-action">撤销上一步</span>
                <span class="shortcut-key">Ctrl + Z</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-action">重做下一步</span>
                <span class="shortcut-key">Ctrl + Y</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-action">平移参考画布</span>
                <span class="shortcut-key">空格键 Space</span>
              </div>
              <div class="shortcut-item">
                <span class="shortcut-action">删除选中的骨骼节点</span>
                <span class="shortcut-key">Backspace / Delete</span>
              </div>
            </div>
          </section>

          <div class="section-divider"></div>

          <!-- 常见问题 -->
          <section id="settings-sec-faq" class="settings-section">
            <h4 class="section-title">❓ 常见问题 FAQ</h4>
            <div class="faq-list">
              <div class="faq-item">
                <div class="faq-q">Q: 为什么拍照后骨骼没有完全对齐？</div>
                <div class="faq-a">A: 辅助拍照时请尽量让被摄者与屏幕上的骨骼对齐。系统会自动记录当时拍摄的视口及缩放比例（保存在 edit_data 内），并在详情页跨屏幕尺寸百分百等比例还原，无需担心对不齐问题。</div>
              </div>
              <div class="faq-item">
                <div class="faq-q">Q: 全局开关关闭后会发生什么？</div>
                <div class="faq-a">A: 关闭全局模板显示后，首页所有列表将**不再加载**透明骨架图片，只加载照片原图，节省约 90% 的带宽。您依然可以随时在作品详情页中单独点击开关加载和渲染骨架。</div>
              </div>
              <div class="faq-item">
                <div class="faq-q">Q: 能自主上传参考模板吗？</div>
                <div class="faq-a">A: 可以的。点击左侧菜单“发现”底下的投稿按钮，或在编辑器中设计好骨架姿势，直接上传底图和参考线，提交给管理员审核通过后即成为公共姿势模板。</div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps<{
  activeSection: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'showToast', msg: string): void
}>()

const showTemplate = defineModel<boolean>('showTemplate', { required: true })

const currentSection = ref('general')
const scrollContainer = ref<HTMLElement | null>(null)

// 用户习惯设置 state
const highQuality = ref(true)
const language = ref('zh')
const autoAnalysis = ref(true)
const sensitivity = ref(60)
const preferLocal = ref(false)

const tabs = [
  { id: 'general', name: '通用设置', icon: '🛠️' },
  { id: 'ai', name: 'AI 辅助', icon: '🤖' },
  { id: 'shortcuts', name: '快捷键', icon: '⌨️' },
  { id: 'faq', name: '常见问题', icon: '❓' }
]

const scrollToTab = (sectionId: string) => {
  currentSection.value = sectionId
  const element = document.getElementById(`settings-sec-${sectionId}`)
  if (element && scrollContainer.value) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 监听滑块滚动，更新左侧激活的 tab 标签
const handleScroll = () => {
  if (!scrollContainer.value) return
  const container = scrollContainer.value
  const scrollTop = container.scrollTop

  for (const tab of tabs) {
    const el = document.getElementById(`settings-sec-${tab.id}`)
    if (el) {
      const offsetTop = el.offsetTop - container.offsetTop
      // 设置约 30px 的容差
      if (scrollTop >= offsetTop - 30 && scrollTop < offsetTop + el.clientHeight - 30) {
        currentSection.value = tab.id
        break
      }
    }
  }
}

// 挂载时，根据传入的 activeSection 自动滚动到对应位置
onMounted(() => {
  if (props.activeSection) {
    // 延迟 100ms 保证 Modal 弹窗 DOM 渲染完成
    setTimeout(() => {
      scrollToTab(props.activeSection)
    }, 100)
  }
})

// 监听 activeSection 变化，再次滚动
watch(() => props.activeSection, (newVal) => {
  if (newVal) {
    scrollToTab(newVal)
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.settings-modal-card {
  width: 100%;
  max-width: 780px;
  height: 520px;
  background: #ffffff;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.dark-mode .settings-modal-card {
  background: #18181b;
  border-color: #27272a;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

/* 头部样式 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-b: 1px solid #f1f5f9;
}

.dark-mode .modal-header {
  border-color: #27272a;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 18px;
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: inherit;
}

.close-btn {
  font-size: 24px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  line-height: 1;
}

.close-btn:hover {
  color: #ff2442;
}

/* 左右分栏 */
.modal-body-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 左侧栏 */
.settings-sidebar {
  width: 180px;
  background: #f8fafc;
  border-right: 1px solid #f1f5f9;
  padding: 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dark-mode .settings-sidebar {
  background: #121214;
  border-color: #27272a;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: #64748b;
  font-size: 13.5px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dark-mode .tab-btn {
  color: #a1a1aa;
}

.tab-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.dark-mode .tab-btn:hover {
  background: #27272a;
  color: #ffffff;
}

.tab-btn.active {
  background: #6366f1;
  color: #ffffff;
}

/* 右侧内容区 */
.settings-content {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding: 24px;
}

.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 3px;
}

.dark-mode .settings-content::-webkit-scrollbar-thumb {
  background-color: #3f3f46;
}

.settings-section {
  padding-bottom: 24px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 20px;
  color: #3b82f6;
}

.section-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 16px 0 24px;
}

.dark-mode .section-divider {
  background: #27272a;
}

/* 设置项卡片 */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 20px;
}

.setting-row.block-layout {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.setting-info {
  flex: 1;
}

.setting-label {
  font-size: 13.5px;
  font-weight: 600;
  color: inherit;
  margin-bottom: 4px;
}

.setting-desc {
  font-size: 11px;
  line-height: 1.4;
  color: #94a3b8;
}

/* Switch 开关样式 */
.switch-label {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.switch-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #cbd5e1;
  border-radius: 22px;
  transition: .25s ease;
}

.dark-mode .switch-slider {
  background-color: #3f3f46;
}

.switch-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: .25s ease;
}

.switch-input:checked + .switch-slider {
  background-color: #10b981;
}

.switch-input:checked + .switch-slider:before {
  transform: translateX(18px);
}

/* 选择下拉框 */
.setting-select {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: inherit;
  font-size: 13px;
  outline: none;
}

.dark-mode .setting-select {
  background: #27272a;
  border-color: #3f3f46;
}

/* 范围滑块 */
.range-wrapper {
  width: 100%;
}

.setting-range {
  width: 100%;
  accent-color: #6366f1;
}

/* 快捷键表格 */
.shortcuts-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
}

.dark-mode .shortcut-item {
  background: #1c1c1e;
  border-color: #27272a;
}

.shortcut-action {
  font-size: 13px;
  color: inherit;
}

.shortcut-key {
  font-size: 11.5px;
  font-weight: 700;
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 4px;
  color: #334155;
  font-family: monospace;
}

.dark-mode .shortcut-key {
  background: #3a3a3c;
  color: #e2e8f0;
}

/* FAQ 列表 */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.faq-item {
  border-bottom: 1px dashed #e2e8f0;
  padding-bottom: 12px;
}

.dark-mode .faq-item {
  border-color: #27272a;
}

.faq-item:last-child {
  border-bottom: none;
}

.faq-q {
  font-size: 13px;
  font-weight: 700;
  color: inherit;
  margin-bottom: 6px;
}

.faq-a {
  font-size: 11.5px;
  line-height: 1.5;
  color: #64748b;
}

.dark-mode .faq-a {
  color: #a1a1aa;
}

/* 动效 */
.animate-fade-in {
  animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
</style>
