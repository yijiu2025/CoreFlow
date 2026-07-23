import { ref } from 'vue';
import { useCanvasStore, useToolStore } from '@/stores/editor';
import * as fabricLib from 'fabric';

// 兼容并加载 Fabric 实例
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib;

/**
 * 文本操作管理 Composable
 * 负责创建文本对象、更新选中文字的属性（如字号、字体、粗斜体、对齐方式、下划线、删除线等）
 */
export function useText(saveState: () => void) {
  const canvasStore = useCanvasStore();
  const toolStore = useToolStore();

  // ═══ 文本默认与实时属性设置 ═══
  const textFontSize = ref(24); // 字体大小
  const textFontFamily = ref('Arial'); // 字体系列
  const textLineHeight = ref(120); // 行高 (%)
  const textLetterSpacing = ref(0); // 字间距 (px)
  const textBold = ref(false); // 粗体标志
  const textItalic = ref(false); // 斜体标志
  const textUnderline = ref(false); // 下划线标志
  const textStrikethrough = ref(false); // 删除线标志
  const textAlign = ref('left'); // 对齐方式 (left | center | right)
  const warpStyle = ref('none'); // 文字变形样式

  /**
   * 向画布中心添加一个可双击编辑的 Fabric IText 文本元素
   * @param text 文本的初始显示内容
   */
  const addText = (text: string = '双击编辑') => {
    const fCanvas = canvasStore.fCanvas;
    if (!fCanvas) return;

    // 获取画布的物理中心坐标
    const c = fCanvas.getCenter();

    // 实例化 Fabric IText 元素
    const textObj = new fabric.IText(text, {
      left: c.left,
      top: c.top,
      fontSize: textFontSize.value,
      fontFamily: textFontFamily.value,
      lineHeight: textLineHeight.value / 100, // Fabric 行高按比例值计算
      charSpacing: textLetterSpacing.value * 10, // Fabric 字间距单位较小，通常扩大 10 倍
      fontWeight: textBold.value ? 'bold' : 'normal',
      fontStyle: textItalic.value ? 'italic' : 'normal',
      underline: textUnderline.value,
      linethrough: textStrikethrough.value,
      textAlign: textAlign.value,
      fill: toolStore.currentColor, // 填充颜色取自主描边颜色
      originX: 'center',
      originY: 'center',
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      erasable: true // 允许被橡皮擦工具擦除
    });

    // 添加并设置为选中激活对象
    fCanvas.add(textObj);
    fCanvas.setActiveObject(textObj);
    fCanvas.renderAll();

    // 保存当前历史状态
    saveState();
  };

  /**
   * 更新选中文字的属性。支持局部文本编辑更新以及整体元素属性更新。
   * @param prop 更新的属性名，例如 'fontSize', 'fontFamily' 等
   * @param value 属性的对应新数值
   */
  const updateTextProperty = (prop: string, value: any) => {
    const fCanvas = canvasStore.fCanvas;
    const obj = fCanvas?.getActiveObject();
    if (!obj || !obj.isType?.('i-text')) return;

    // 如果当前文本处于输入编辑状态，且选中了部分字符，则仅修改被选中的子文本样式
    if (obj.isEditing && typeof obj.setSelectionStyles === 'function' && obj.getSelectedText()) {
      obj.setSelectionStyles({ [prop]: value });
    } else {
      // 否则直接更新整个文本元素对象的属性
      obj.set(prop, value);
    }

    fCanvas.renderAll();
    saveState();
  };

  return {
    textFontSize,
    textFontFamily,
    textLineHeight,
    textLetterSpacing,
    textBold,
    textItalic,
    textUnderline,
    textStrikethrough,
    textAlign,
    warpStyle,
    addText,
    updateTextProperty
  };
}
