<template>
  <aside class="right-panel" v-show="canvasStore.bgImageUploaded">
    <AiPanel
      v-show="toolStore.activeTool === 'ai' || toolStore.canvasTool === 'crop'"
      :isAnalyzing="canvasStore.isAnalyzing"
      v-model="canvasStore.detectionType"
      :activeTool="toolStore.canvasTool"
      :canvasTool="toolStore.canvasTool"
      v-model:bgOpacity="canvasStore.bgOpacity"
      :detectionTypes="detectionTypes"
      @autoAnalyze="emit('autoAnalyze')"
      @setTool="emit('setTool', $event)"
      @setDrawTool="emit('setDrawTool', $event)"
      @clearAnalysis="emit('clearAnalysis')"
      @saveHistory="emit('saveState')"
    />

    <SelectPanel
      v-show="toolStore.activeTool === 'select'"
      :selectedObject="toolStore.selectedObject"
      :pathBlur="toolStore.pathBlur"
      @deleteSelected="emit('deleteSelected')"
      @bringToFront="emit('bringToFront')"
      @sendToBack="emit('sendToBack')"
      @moveUp="emit('moveUp')"
      @moveDown="emit('moveDown')"
      @copySelected="emit('copySelected')"
      @pasteClipboard="emit('pasteClipboard')"
      @update:pathStrokeWidth="emit('updatePathStrokeWidth', $event)"
      @update:pathBlur="emit('updatePathBlur', $event)"
      @update:pathScale="emit('updatePathScale', $event)"
      @saveState="emit('saveState')"
    />

    <DrawPanel
      v-show="toolStore.activeTool === 'draw'"
      v-model:brushSize="toolStore.brushSize"
      v-model:brushOpacity="toolStore.brushOpacity"
      v-model:brushFeather="toolStore.brushFeather"
      v-model:brushStyle="toolStore.brushStyle"
      v-model:brushBlend="toolStore.brushBlend"
      v-model:currentColor="toolStore.currentColor"
      :presetColors="toolStore.presetColors"
      @saveState="emit('saveState')"
    />

    <EraserPanel
      v-show="toolStore.activeTool === 'eraser'"
      v-model:eraserSize="toolStore.eraserSize"
      v-model:eraserOpacity="toolStore.eraserOpacity"
      v-model:eraserHardness="toolStore.eraserHardness"
      v-model:eraserShape="toolStore.eraserShape"
      v-model:eraserMode="toolStore.eraserMode"
      @saveState="emit('saveState')"
    />

    <ShapesPanel
      v-show="toolStore.activeTool === 'shapes'"
      :canvasTool="toolStore.canvasTool"
      :activeGuides="toolStore.activeGuides"
      @toggleGuide="emit('toggleGuide', $event)"
      @setDrawTool="emit('setDrawTool', $event)"
    />

    <TextPanel
      v-show="toolStore.activeTool === 'text'"
      :fontSize="fontSize"
      :fontFamily="fontFamily"
      :lineHeight="lineHeight"
      :letterSpacing="letterSpacing"
      :bold="bold"
      :italic="italic"
      :underline="underline"
      :strikethrough="strikethrough"
      :textAlign="textAlign"
      :warpStyle="warpStyle"
      @addText="emit('addText', $event)"
      @saveState="emit('saveState')"
      @update:fontSize="emit('update:fontSize', $event)"
      @update:fontFamily="emit('update:fontFamily', $event)"
      @update:lineHeight="emit('update:lineHeight', $event)"
      @update:letterSpacing="emit('update:letterSpacing', $event)"
      @update:bold="emit('update:bold', $event)"
      @update:italic="emit('update:italic', $event)"
      @update:underline="emit('update:underline', $event)"
      @update:strikethrough="emit('update:strikethrough', $event)"
      @update:textAlign="emit('update:textAlign', $event)"
    />

    <HandPanel
      v-show="toolStore.activeTool === 'hand'"
      :zoomPercent="canvasStore.zoomPercent"
      v-model:zoomSlider="canvasStore.zoomSlider"
      @zoomIn="emit('zoomIn')"
      @zoomOut="emit('zoomOut')"
      @resetZoom="emit('resetZoom')"
      @fitToScreen="emit('fitToScreen')"
    />

    <ImagePanel
      v-show="toolStore.activeTool === 'image' && canvasStore.bgImageUploaded && !isCropping"
      :bgOpacity="canvasStore.bgOpacity"
      :cropAspectRatio="toolStore.cropAspectRatio"
      @replaceImage="emit('replaceImage')"
      @cropImage="emit('cropImage')"
      @update:bgOpacity="emit('updateBgOpacity', $event)"
      @update:cropAspectRatio="toolStore.cropAspectRatio = $event"
      @saveHistory="emit('saveState')"
    />

    <CropPanel
      v-show="isCropping"
      :cropAspectRatio="toolStore.cropAspectRatio"
      @update:cropAspectRatio="emit('updateCropAspectRatio', $event)"
      @confirmCrop="emit('confirmCrop')"
      @cancelCrop="emit('cancelCrop')"
    />
  </aside>
</template>

<script setup lang="ts">
import { useCanvasStore, useToolStore } from '@/stores/editor';
import AiPanel from '@/components/panels/editor/AiPanel.vue';
import SelectPanel from '@/components/panels/editor/SelectPanel.vue';
import DrawPanel from '@/components/panels/editor/DrawPanel.vue';
import EraserPanel from '@/components/panels/editor/EraserPanel.vue';
import ShapesPanel from '@/components/panels/editor/ShapesPanel.vue';
import TextPanel from '@/components/panels/editor/TextPanel.vue';
import HandPanel from '@/components/panels/editor/HandPanel.vue';
import ImagePanel from '@/components/panels/editor/ImagePanel.vue';
import CropPanel from '@/components/panels/editor/CropPanel.vue';

const canvasStore = useCanvasStore();
const toolStore = useToolStore();

withDefaults(
  defineProps<{
    isCropping?: boolean;
    detectionTypes?: any[];

    fontSize?: number;
    fontFamily?: string;
    lineHeight?: number;
    letterSpacing?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    textAlign?: string;
    warpStyle?: string;
  }>(),
  {
    isCropping: false,
    detectionTypes: () => [],
    fontSize: 24,
    fontFamily: 'Arial',
    lineHeight: 120,
    letterSpacing: 0,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    textAlign: 'left',
    warpStyle: 'none'
  }
);

const emit = defineEmits([
  'autoAnalyze',
  'setTool',
  'setDrawTool',
  'clearAnalysis',
  'saveState',
  'deleteSelected',
  'bringToFront',
  'sendToBack',
  'moveUp',
  'moveDown',
  'copySelected',
  'pasteClipboard',
  'updatePathStrokeWidth',
  'updatePathBlur',
  'updatePathScale',
  'toggleGuide',
  'addText',
  'update:fontSize',
  'update:fontFamily',
  'update:lineHeight',
  'update:letterSpacing',
  'update:bold',
  'update:italic',
  'update:underline',
  'update:strikethrough',
  'update:textAlign',
  'zoomIn',
  'zoomOut',
  'resetZoom',
  'fitToScreen',
  'replaceImage',
  'cropImage',
  'updateBgOpacity',
  'updateCropAspectRatio',
  'confirmCrop',
  'cancelCrop'
]);
</script>

<style scoped>
/* ── 右侧面板主体 ── */
.right-panel {
  width: 260px;
  background: rgba(15, 15, 25, 0.95);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  overflow-y: auto;
  flex-shrink: 0;
}

.panel-section {
  padding: 0px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* ── 裁剪框提示文本 ── */
.hint-text {
  font-size: 11px;
  color: #4a5568;
  text-align: center;
  margin-top: 8px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
}
</style>
