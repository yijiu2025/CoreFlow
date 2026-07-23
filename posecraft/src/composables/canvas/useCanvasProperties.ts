import { Ref } from 'vue';
import { useToolStore } from '@/stores/editor';
import * as fabricLib from 'fabric';

const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib;

/**
 * 画布元素样式修改与更新 Composable
 * 负责当用户调节侧边栏/调色盘属性时，将新样式（如主色、填充色、线条线型、不透明度、圆角）
 * 动态应用至当前选中的 Fabric.js 元素或多选组中，并刷新画布显示。
 */
export function useCanvasProperties(fCanvas: Ref<any>) {
  const toolStore = useToolStore();

  /**
   * 判断对象是否属于自由绘制（画笔/路径）类型
   */
  const isBrushObject = (obj: any) => {
    if (!obj) return false;
    return obj.type === 'path' || obj.isUserStroke || obj.isInkLayer;
  };

  /**
   * 通用工具：将选中的单/多元素应用新属性值
   * @param props 要更新的键值对属性
   */
  const applyToSelected = (props: Record<string, any>) => {
    const obj = fCanvas.value?.getActiveObject();
    if (!obj) return;

    const applyProps = (target: any) => {
      target.set(props);
      target.setCoords();
      target.dirty = true;
    };

    if (obj.type === 'activeSelection' || obj.type === 'group') {
      obj.getObjects().forEach(applyProps);
      if (obj.type === 'activeSelection') {
        obj.addWithUpdate();
      } else {
        obj.dirty = true;
      }
    } else {
      applyProps(obj);
    }
    fCanvas.value.renderAll();
  };

  /**
   * 将 Hex 或 RGB 颜色转换为带透明度的 RGBA 字符串格式
   * @param colorStr 原始 Hex 码 (#6366f1) 或 rgb 字符串
   * @param opacity 缩放透明度，取值 0 到 1
   */
  const toRgba = (colorStr: string, opacity: number) => {
    let r = 0,
      g = 0,
      b = 0;
    if (colorStr.startsWith('#')) {
      const hex = colorStr.replace('#', '');
      if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      }
    } else if (colorStr.startsWith('rgb')) {
      const match = colorStr.match(/[\d.]+/g);
      if (match && match.length >= 3) {
        r = parseInt(match[0]);
        g = parseInt(match[1]);
        b = parseInt(match[2]);
      }
    }
    return `rgba(${r},${g},${b},${opacity})`;
  };

  /**
   * 更新当前描边颜色（主线条色）
   * 对文字对象更新 fill；对笔迹更新 stroke 与 shadow 颜色；对常规形状更新 stroke。
   */
  const updateCurrentColor = (color: string, applyColorToImage: (obj: any, color: string) => void) => {
    toolStore.currentColor = color;
    const activeObj = fCanvas.value?.getActiveObject();
    if (!activeObj) return;

    const processObject = (obj: any) => {
      if (obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') {
        obj.set({ fill: color });
      } else if (isBrushObject(obj)) {
        if (obj.type === 'image') {
          applyColorToImage(obj, color);
        } else {
          obj.set({ stroke: color });
          if (obj.shadow) {
            obj.set(
              'shadow',
              new fabric.Shadow({
                color: color,
                blur: obj.shadow.blur,
                offsetX: obj.shadow.offsetX,
                offsetY: obj.shadow.offsetY
              })
            );
          }
        }
      } else {
        obj.set({ stroke: toRgba(color, toolStore.strokeOpacity / 100) });
      }
      obj.setCoords();
      obj.dirty = true;
    };

    if (activeObj.type === 'activeSelection' || activeObj.type === 'group') {
      activeObj.getObjects().forEach(processObject);
      activeObj.addWithUpdate();
    } else {
      processObject(activeObj);
    }
    fCanvas.value.renderAll();
  };

  /**
   * 更新形状填充颜色
   */
  const updateFillColor = (color: string) => {
    toolStore.fillColor = color;
    applyToSelected({ fill: toRgba(color, toolStore.fillOpacity / 100) });
  };

  /**
   * 更新形状是否无填充的布尔控制
   */
  const updateNoFill = (val: boolean) => {
    toolStore.noFill = val;
    applyToSelected({ fill: val ? 'transparent' : toRgba(toolStore.fillColor, toolStore.fillOpacity / 100) });
  };

  /**
   * 更新形状描边宽度（粗细），同时同步画笔粗细
   */
  const updateStrokeWidth = (val: number) => {
    toolStore.strokeWidth = val;
    toolStore.brushSize = val; // 同步画笔粗细
    applyToSelected({ strokeWidth: val });
  };

  /**
   * 更新描边粗细不透明度百分比
   */
  const updateStrokeOpacity = (val: number) => {
    toolStore.strokeOpacity = val;
    toolStore.brushOpacity = val; // 同步画笔不透明度
    const activeObj = fCanvas.value?.getActiveObject();
    if (!activeObj) return;

    const processObject = (obj: any) => {
      if (isBrushObject(obj)) {
        obj.set({ opacity: val / 100 });
      } else {
        obj.set({ stroke: toRgba(toolStore.currentColor, val / 100) });
      }
      obj.setCoords();
      obj.dirty = true;
    };

    if (activeObj.type === 'activeSelection' || activeObj.type === 'group') {
      activeObj.getObjects().forEach(processObject);
      if (activeObj.type === 'activeSelection') {
        activeObj.addWithUpdate();
      } else {
        activeObj.dirty = true;
      }
    } else {
      processObject(activeObj);
    }
    fCanvas.value.renderAll();
  };

  /**
   * 更新填充颜色不透明度百分比
   */
  const updateFillOpacity = (val: number) => {
    toolStore.fillOpacity = val;
    applyToSelected({ fill: toolStore.noFill ? 'transparent' : toRgba(toolStore.fillColor, val / 100) });
  };

  /**
   * 更新形状（如矩形）的圆角半径
   */
  const updateCornerRadius = (val: number) => {
    toolStore.cornerRadius = val;
    applyToSelected({ rx: val, ry: val });
  };

  /**
   * 更新形状和画笔线条样式 (solid | dashed | dotted)
   */
  const updateLineStyle = (val: string) => {
    toolStore.lineStyle = val;
    toolStore.brushStyle = val; // 同步画笔虚线样式
    const dashArray = val === 'dashed' ? [10, 5] : val === 'dotted' ? [3, 5] : undefined;
    applyToSelected({ strokeDashArray: dashArray });
  };

  return {
    applyToSelected,
    toRgba,
    updateCurrentColor,
    updateFillColor,
    updateNoFill,
    updateStrokeWidth,
    updateStrokeOpacity,
    updateFillOpacity,
    updateCornerRadius,
    updateLineStyle
  };
}
