import { ref, computed, watch, markRaw, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import * as fabricLib from 'fabric';
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib;

/**
 * 画布初始化与管理 Composable
 * 负责 Fabric 画布实例化、窗口适配、滚轮缩放、平移等核心画布操作
 */
export function useCanvasInit(canvasContainer: Ref<HTMLElement | null>, eraserSize: Ref<number>) {
  // Fabric 画布实例
  const fCanvas = ref<any>(null);

  // 缩放比例状态
  const currentZoom = ref(1);
  const zoomSlider = ref(100);
  const zoomPercent = computed(() => Math.round(currentZoom.value * 100));

  let canvasScale = 1;
  let canvasTranslateX = 0;
  let canvasTranslateY = 0;

  // 墨迹和橡皮擦光标对象
  let inkCanvas: HTMLCanvasElement | null = null;
  let inkCtx: CanvasRenderingContext2D | null = null;
  let inkLayer: any = null;
  let eraserCursor: any = null;

  // 监听缩放滑块的变化，同步更新画布的缩放尺寸
  watch(zoomSlider, newVal => {
    const zoom = newVal / 100;
    currentZoom.value = zoom;
    syncCanvasDimensions(zoom);
  });

  // 监听橡皮擦大小变化，实时同步更新橡皮擦光标的半径
  watch(eraserSize, newVal => {
    if (!fCanvas.value || !eraserCursor) return;
    eraserCursor.set({ radius: newVal / 2 });
    fCanvas.value.renderAll();
  });

  /**
   * 应用画布的 CSS 变换（缩放与平移）
   */
  const applyCanvasTransform = () => {
    if (!fCanvas.value) return;
    const wrapper = fCanvas.value.wrapperEl;
    if (wrapper) {
      wrapper.style.transformOrigin = 'center center';
      wrapper.style.transform = `translate(${canvasTranslateX}px, ${canvasTranslateY}px) scale(${canvasScale})`;
    }
  };

  /**
   * 同步画布的缩放尺寸
   */
  const syncCanvasDimensions = (zoom: number) => {
    canvasScale = zoom;
    applyCanvasTransform();
  };

  /**
   * 重置画布缩放与平移位置至 100%
   */
  const resetZoom = () => {
    canvasScale = 1;
    canvasTranslateX = 0;
    canvasTranslateY = 0;
    applyCanvasTransform();
    zoomSlider.value = 100;
  };

  /**
   * 缩放画布以完美适配当前屏幕区域
   */
  const fitToScreen = () => {
    if (!fCanvas.value || !canvasContainer.value) return;
    const canvas = fCanvas.value;
    const container = canvasContainer.value;
    const containerWidth = container.clientWidth - 80;
    const containerHeight = container.clientHeight - 80;
    const canvasWidth = canvas.getWidth();
    const canvasHeight = canvas.getHeight();

    if (canvasWidth === 0 || canvasHeight === 0) return;
    const zoom = Math.min(containerWidth / canvasWidth, containerHeight / canvasHeight);

    canvasScale = zoom;
    canvasTranslateX = 0;
    canvasTranslateY = 0;
    applyCanvasTransform();
    zoomSlider.value = Math.round(zoom * 100);
  };

  /**
   * 放大画布 (按 1.2 倍步长)
   */
  const zoomIn = () => {
    const zoom = Math.min(currentZoom.value * 1.2, 5);
    currentZoom.value = zoom;
    zoomSlider.value = Math.round(zoom * 100);
    syncCanvasDimensions(zoom);
  };

  /**
   * 缩小画布 (按 1.2 倍步长)
   */
  const zoomOut = () => {
    const zoom = Math.max(currentZoom.value / 1.2, 0.1);
    currentZoom.value = zoom;
    zoomSlider.value = Math.round(zoom * 100);
    syncCanvasDimensions(zoom);
  };

  /**
   * 处理鼠标滚轮缩放事件
   */
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!fCanvas.value || !canvasContainer.value) return;
    const delta = e.deltaY;
    let zoom = currentZoom.value;
    const factor = 1.1;

    if (delta < 0) {
      zoom = Math.min(zoom * factor, 5);
    } else {
      zoom = Math.max(zoom / factor, 0.1);
    }
    currentZoom.value = zoom;
    zoomSlider.value = Math.round(zoom * 100);
    syncCanvasDimensions(zoom);
  };

  // 监听画布容器 DOM，动态绑定和卸载滚轮缩放事件，解决异步组件挂载时 ref 为 null 的问题
  watch(
    canvasContainer,
    (newContainer, oldContainer) => {
      if (oldContainer) {
        oldContainer.removeEventListener('wheel', handleWheel);
      }
      if (newContainer) {
        newContainer.addEventListener('wheel', handleWheel, { passive: false });
      }
    },
    { immediate: true }
  );

  onUnmounted(() => {
    if (canvasContainer.value) {
      canvasContainer.value.removeEventListener('wheel', handleWheel);
    }
  });

  /**
   * 窗口尺寸改变时，重算并调整画布大小
   */
  const resizeCanvas = () => {
    if (!fCanvas.value || !canvasContainer.value) return;
    const width = canvasContainer.value.clientWidth;
    const height = canvasContainer.value.clientHeight || 600;
    const bg = fCanvas.value.backgroundImage;
    if (bg && bg.width) {
      const scale = Math.min(width / bg.width, height / bg.height) * 0.95;
      const newW = bg.width * scale,
        newH = bg.height * scale;
      fCanvas.value.setWidth(newW);
      fCanvas.value.setHeight(newH);
      bg.set({ scaleX: scale, scaleY: scale, left: newW / 2, top: newH / 2, originX: 'center', originY: 'center' });
      if (inkCanvas) {
        inkCanvas.width = newW;
        inkCanvas.height = newH;
      }
    } else {
      fCanvas.value.setWidth(width);
      fCanvas.value.setHeight(height);
    }
    fCanvas.value.renderAll();
  };

  /**
   * 初始化 Fabric 画布及图层配置
   */
  const initCanvas = () => {
    const c = new fabric.Canvas('editor-canvas', {
      width: canvasContainer.value?.clientWidth || 800,
      height: canvasContainer.value?.clientHeight || 600,
      selection: true,
      preserveObjectStacking: true,
      isDrawingMode: false,
      backgroundColor: 'rgba(0,0,0,0)',
      perPixelTargetFind: true,
      targetFindTolerance: 15
    });
    fCanvas.value = markRaw(c);

    const w = fCanvas.value.width,
      h = fCanvas.value.height;
    inkCanvas = document.createElement('canvas');
    inkCanvas.width = w;
    inkCanvas.height = h;
    inkCtx = inkCanvas.getContext('2d', { willReadFrequently: true });
    inkLayer = new fabric.Image(inkCanvas, {
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      erasable: false
    });
    inkLayer.isInkLayer = true;
    fCanvas.value.add(inkLayer);

    eraserCursor = new fabric.Circle({
      radius: eraserSize.value / 2,
      fill: 'rgba(255,255,255,0.2)',
      stroke: 'rgba(255,255,255,0.8)',
      strokeWidth: 1,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      visible: false,
      isEraserCursor: true,
      excludeFromExport: true
    });
    fCanvas.value.add(eraserCursor);
  };

  const getCanvasDeps = () => {
    return {
      get canvasScale() {
        return canvasScale;
      },
      set canvasScale(v) {
        canvasScale = v;
      },
      get canvasTranslateX() {
        return canvasTranslateX;
      },
      set canvasTranslateX(v) {
        canvasTranslateX = v;
      },
      get canvasTranslateY() {
        return canvasTranslateY;
      },
      set canvasTranslateY(v) {
        canvasTranslateY = v;
      },
      get inkCanvas() {
        return inkCanvas;
      },
      get inkCtx() {
        return inkCtx;
      },
      get inkLayer() {
        return inkLayer;
      },
      get eraserCursor() {
        return eraserCursor;
      }
    };
  };

  return {
    fCanvas,
    currentZoom,
    zoomSlider,
    zoomPercent,
    initCanvas,
    resizeCanvas,
    resetZoom,
    fitToScreen,
    zoomIn,
    zoomOut,
    handleWheel,
    applyCanvasTransform,
    syncCanvasDimensions,
    getCanvasDeps
  };
}
