import { ref, onMounted, onUnmounted } from 'vue';
import { useCanvasStore, useToolStore } from '@/stores/editor';

/**
 * 键盘快捷键管理 Composable
 * 负责全局注册/解绑键盘按键监听事件，实现空格抓手、删除元素、撤销、重做及快捷缩放操作
 */
export function useKeyboard(actions: {
  undo: () => void; // 撤销动作
  redo: () => void; // 重做动作
  deleteSelected: () => void; // 删除选中元素
  zoomIn: () => void; // 放大画布
  zoomOut: () => void; // 缩小画布
  resetZoom: () => void; // 重置缩放
  saveState: () => void; // 保存状态快照
}) {
  const canvasStore = useCanvasStore();
  const toolStore = useToolStore();

  // 空格键按下状态，用于临时切换为抓手拖拽工具
  const spacePressed = ref(false);

  /**
   * 处理键盘按下事件
   */
  const handleKeydown = (e: KeyboardEvent) => {
    const fCanvas = canvasStore.fCanvas;
    if (!fCanvas) return;

    // 如果当前正在双击编辑文字对象，捕获特定的回车或退出编辑行为
    const activeObj = fCanvas.getActiveObject();
    if (activeObj && activeObj.isType?.('i-text') && activeObj.isEditing) {
      // Ctrl+Enter 或 Escape 键完成文字编辑
      if (((e.ctrlKey || e.metaKey) && e.key === 'Enter') || e.key === 'Escape') {
        e.preventDefault();
        activeObj.exitEditing(); // 退出文字编辑模式
        fCanvas.discardActiveObject(); // 取消选中元素
        fCanvas.renderAll();
        actions.saveState();
        return;
      }
    }

    // 若当前输入焦点在输入框/文本域中，则屏蔽全局画布快捷键，防止干扰打字输入
    const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
    if (isInput) return;

    // Space (空格键) 临时切换抓手操作
    if (e.code === 'Space') {
      e.preventDefault();
      if (!spacePressed.value) {
        spacePressed.value = true;
        fCanvas.defaultCursor = 'grab';
      }
      return;
    }

    // 字母键 'h' 切换抓手/选择工具模式
    if (e.key === 'h') {
      e.preventDefault();
      if (toolStore.activeTool === 'hand') {
        toolStore.activeTool = 'select';
        fCanvas.isDrawingMode = false;
        fCanvas.selection = true;
        fCanvas.defaultCursor = 'default';
      } else {
        toolStore.activeTool = 'hand';
        fCanvas.isDrawingMode = false;
        fCanvas.selection = false;
        fCanvas.defaultCursor = 'grab';
      }
      return;
    }

    // Ctrl + Z (撤销)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      actions.undo();
    }
    // Ctrl + Y 或 Ctrl + Shift + Z (重做)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      actions.redo();
    }
    // Delete 或 Backspace (删除选中对象)
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      actions.deleteSelected();
    }
    // Ctrl + 加号/等号 (放大画布)
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      actions.zoomIn();
    }
    // Ctrl + 减号 (缩小画布)
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      actions.zoomOut();
    }
    // Ctrl + 0 (重置画布尺寸)
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      actions.resetZoom();
    }
  };

  /**
   * 处理键盘弹起事件
   */
  const handleKeyup = (e: KeyboardEvent) => {
    const fCanvas = canvasStore.fCanvas;
    // 释放空格键时，恢复默认光标
    if (e.code === 'Space') {
      spacePressed.value = false;
      if (fCanvas && toolStore.activeTool !== 'hand') {
        fCanvas.defaultCursor = 'default';
      }
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('keyup', handleKeyup);
  });

  return {
    spacePressed
  };
}
