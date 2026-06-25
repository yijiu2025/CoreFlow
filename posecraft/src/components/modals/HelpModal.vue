<template>
  <Transition name="fade">
    <div v-if="isOpen" class="help-overlay" @click.self="$emit('close')">
      <div class="help-modal">
        <div class="help-header">
          <h2>快捷键与使用说明</h2>
          <button class="help-close" @click="$emit('close')">✕</button>
        </div>
        <div class="help-body">
          <div class="help-section">
            <h3>🛠️ 工具切换</h3>
            <div class="shortcut-grid">
              <div class="shortcut-item"><kbd>H</kbd><span>抓手工具</span></div>
              <div class="shortcut-item"><kbd>空格</kbd><span>临时抓手（按住）</span></div>
              <div class="shortcut-item"><kbd>Delete</kbd><span>删除选中</span></div>
            </div>
          </div>

          <div class="help-section">
            <h3>📝 编辑操作</h3>
            <div class="shortcut-grid">
              <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>Z</kbd><span>撤销</span></div>
              <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>Y</kbd><span>重做</span></div>
              <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd><span>重做</span></div>
            </div>
          </div>

          <div class="help-section">
            <h3>🔍 缩放操作</h3>
            <div class="shortcut-grid">
              <div class="shortcut-item"><kbd>滚轮</kbd><span>缩放（鼠标中心）</span></div>
              <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>=</kbd><span>放大</span></div>
              <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>-</kbd><span>缩小</span></div>
              <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>0</kbd><span>重置缩放</span></div>
            </div>
          </div>

          <div class="help-section">
            <h3>📖 使用说明</h3>
            <ul class="help-list">
              <li>上传图片后，点击 <b>智能分析</b> 自动检测姿势、面部、手部</li>
              <li>选择识别类型后，使用 <b>框选识别</b> 进行局部分析</li>
              <li><b>抓手工具</b> 可拖拽画布，按住空格键可临时切换</li>
              <li>参考线（三分法、黄金比例等）在 <b>形状</b> 面板中</li>
              <li>所有操作支持撤销（Ctrl+Z）</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

defineEmits(['close'])
</script>

<style scoped>
.help-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.help-modal {
  width: 100%; max-width: 520px; max-height: 80vh;
  background: linear-gradient(145deg, #1a1a2e, #16162a);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
  overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.help-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.help-header h2 { font-size: 16px; font-weight: 600; color: #e2e8f0; margin: 0; }
.help-close {
  width: 28px; height: 28px; background: none; border: none;
  color: #64748b; cursor: pointer; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.help-close:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.help-body { padding: 20px; overflow-y: auto; }
.help-section { margin-bottom: 20px; }
.help-section:last-child { margin-bottom: 0; }
.help-section h3 { font-size: 13px; font-weight: 600; color: #94a3b8; margin: 0 0 12px 0; }
.shortcut-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.shortcut-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
.shortcut-item kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 24px; height: 22px; padding: 0 6px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px; font-size: 11px; font-family: 'Inter', monospace; color: #94a3b8;
}
.shortcut-item span { margin-left: auto; }
.help-list { margin: 0; padding: 0 0 0 16px; }
.help-list li { font-size: 13px; color: #94a3b8; line-height: 1.8; }
.help-list li b { color: #e2e8f0; }
</style>
