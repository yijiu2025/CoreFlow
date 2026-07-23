import { Ref } from 'vue';
import { useCanvasStore, useToolStore } from '@/stores/editor';
import * as fabricLib from 'fabric';

const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib;

/**
 * 画布选中元素属性同步 Composable
 * 负责当画布上有元素被选中、修改或取消选中时，将该元素的所有物理样式属性（填充、描边、圆角、字号字体等）
 * 实时同步回 Pinia store 或对应的面板面板中，保持 UI 与数据完全一致。
 */
export function useCanvasSelection(
  fCanvas: Ref<any>,
  textProperties: {
    textFontSize: Ref<number>;
    textFontFamily: Ref<string>;
    textLineHeight: Ref<number>;
    textLetterSpacing: Ref<number>;
    textBold: Ref<boolean>;
    textItalic: Ref<boolean>;
    textUnderline: Ref<boolean>;
    textStrikethrough: Ref<boolean>;
    textAlign: Ref<string>;
  }
) {
  const toolStore = useToolStore();

  /**
   * 判断对象是否属于自由绘制（画笔/路径）类型
   */
  const isBrushObject = (obj: any) => {
    if (!obj) return false;
    return obj.type === 'path' || obj.isUserStroke || obj.isInkLayer;
  };

  /**
   * 核心属性同步函数
   */
  const updateSelection = () => {
    if (!fCanvas.value) return;
    const obj = fCanvas.value.getActiveObject() || null;
    toolStore.selectedObject = obj;

    // 如果是画笔路径对象，并且包含阴影羽化，则解析羽化值同步至模糊度滑块
    if (isBrushObject(obj) && obj.shadow) {
      toolStore.pathBlur = Math.round(obj.shadow.blur / 2);
    } else {
      toolStore.pathBlur = 0;
    }

    if (obj) {
      let targetObj = obj;
      // 若当前选中为一个组合(Group)，则尝试找出子元素中有颜色的代表进行颜色解析
      if (obj.type === 'group') {
        targetObj = obj.getObjects().find((o: any) => o.stroke || o.fill) || obj;
      }

      /**
       * 辅助函数：统一解析 Fabric.js 中的 Hex 或 RGBA 颜色字串并提取透明度
       */
      const parseColor = (colorStr: any) => {
        if (!colorStr || colorStr === 'transparent') return null;
        if (colorStr.startsWith('#')) {
          return { hex: colorStr, opacity: 1 };
        } else if (colorStr.startsWith('rgb')) {
          const match = colorStr.match(/[\d.]+/g);
          if (match && match.length >= 3) {
            const r = parseInt(match[0]);
            const g = parseInt(match[1]);
            const b = parseInt(match[2]);
            const a = match[3] !== undefined ? parseFloat(match[3]) : 1;
            const hexR = r.toString(16).padStart(2, '0');
            const hexG = g.toString(16).padStart(2, '0');
            const hexB = b.toString(16).padStart(2, '0');
            return { hex: `#${hexR}${hexG}${hexB}`, opacity: a };
          }
        }
        return null;
      };

      // 如果选中对象是 IText 文本元素，特殊处理字体样式与排版对齐
      if (targetObj.type === 'i-text' || targetObj.type === 'textbox' || targetObj.type === 'text') {
        const activeStyles =
          targetObj.isEditing && typeof targetObj.getActiveStyles === 'function'
            ? targetObj.getActiveStyles() || {}
            : {};

        const textFill = activeStyles.fill || targetObj.fill;
        const parsed = parseColor(textFill);
        if (parsed) {
          toolStore.currentColor = parsed.hex;
        }

        // 同步文字的所有排版属性回 useText 暴露的响应式变量中
        textProperties.textFontSize.value = activeStyles.fontSize || targetObj.fontSize || 24;
        textProperties.textFontFamily.value = activeStyles.fontFamily || targetObj.fontFamily || 'Arial';
        textProperties.textLineHeight.value = Math.round((targetObj.lineHeight || 1.2) * 100);
        textProperties.textLetterSpacing.value = Math.round(
          (activeStyles.charSpacing !== undefined ? activeStyles.charSpacing : targetObj.charSpacing || 0) / 10
        );
        textProperties.textBold.value = (activeStyles.fontWeight || targetObj.fontWeight) === 'bold';
        textProperties.textItalic.value = (activeStyles.fontStyle || targetObj.fontStyle) === 'italic';
        textProperties.textUnderline.value =
          activeStyles.underline !== undefined ? activeStyles.underline : targetObj.underline || false;
        textProperties.textStrikethrough.value =
          activeStyles.linethrough !== undefined ? activeStyles.linethrough : targetObj.linethrough || false;
        textProperties.textAlign.value = targetObj.textAlign || 'left';
      } else {
        // 对于普通几何形状或绘图路径
        const parsedStroke = parseColor(targetObj.stroke);
        if (parsedStroke) {
          toolStore.currentColor = parsedStroke.hex;
          if (targetObj.type !== 'path') {
            toolStore.strokeOpacity = Math.round(parsedStroke.opacity * 100);
          }
        }

        // 填充状态同步
        if (targetObj.fill === 'transparent' || !targetObj.fill) {
          toolStore.noFill = true;
        } else {
          toolStore.noFill = false;
          const parsedFill = parseColor(targetObj.fill);
          if (parsedFill) {
            toolStore.fillColor = parsedFill.hex;
            toolStore.fillOpacity = Math.round(parsedFill.opacity * 100);
          }
        }
      }

      // 同步几何外框参数 (描边粗细、透明度、圆角、虚实线样式)
      if (targetObj.strokeWidth !== undefined) {
        toolStore.strokeWidth = targetObj.strokeWidth;
      }
      if (targetObj.type === 'path' && targetObj.opacity !== undefined) {
        toolStore.strokeOpacity = Math.round(targetObj.opacity * 100);
      } else if (targetObj.strokeOpacity !== undefined) {
        toolStore.strokeOpacity = Math.round(targetObj.strokeOpacity * 100);
      }
      if (targetObj.fillOpacity !== undefined) {
        toolStore.fillOpacity = Math.round(targetObj.fillOpacity * 100);
      }
      if (targetObj.rx !== undefined) {
        toolStore.cornerRadius = targetObj.rx;
      }

      // 解析虚线格式
      if (targetObj.strokeDashArray) {
        if (targetObj.strokeDashArray.length > 0 && targetObj.strokeDashArray[0] === 10) {
          toolStore.lineStyle = 'dashed';
        } else if (targetObj.strokeDashArray.length > 0 && targetObj.strokeDashArray[0] === 3) {
          toolStore.lineStyle = 'dotted';
        } else {
          toolStore.lineStyle = 'solid';
        }
      } else {
        toolStore.lineStyle = 'solid';
      }
    }

    // ═══ 骨架节点选中特效 ═══
    // 自动为选中的骨骼连接节点添加荧光阴影特效，增强交互反馈
    fCanvas.value.getObjects().forEach((o: any) => {
      if (o.isSkeleton && o._selectedEffect) {
        o.set({ shadow: null, strokeWidth: 3 });
        o._selectedEffect = false;
      }
    });
    if (obj?.isSkeleton) {
      obj.set({
        shadow: new fabric.Shadow({ color: '#6366f1', blur: 10, offsetX: 0, offsetY: 0 }),
        strokeWidth: 4
      });
      obj._selectedEffect = true;
      fCanvas.value.renderAll();
    }
  };

  return {
    updateSelection
  };
}
