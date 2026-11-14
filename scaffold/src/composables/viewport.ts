/**
 * 画布视口：拖拽平移 + 滚轮以指针为中心缩放
 *
 * 组织画布与关系图共用。状态 {x, y, k} 由本组合函数维护，
 * 渲染路径由各组件决定（直接 transform）。
 *
 * 滚轮语义由 `wheelZooms` 决定：
 *   • true  —— 滚轮直接缩放（画布/地图类工具的常见手感），组织架构用这个；
 *   • false —— 滚轮平移，Ctrl / ⌘ + 滚轮才缩放（关系图用这个，它需要长距离浏览）。
 *
 * 移植自参考项目 scaffold-vue 的同名文件。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { reactive } from 'vue'

/* ============================================================
   画布视口：拖拽平移 + 滚轮以指针为中心缩放，
   组织画布与关系图共用。状态 {x, y, k} 由本组合函数维护，
   渲染路径由各组件在 apply 回调里自行决定（quickTo 动画或直接 transform）。
   ============================================================ */
export interface ViewState { x: number; y: number; k: number }

export interface ViewportPanOptions {
  /** 监听手势与滚轮的容器元素 */
  el: () => HTMLElement | null
  /** 视口变化后的渲染回调；animate=false 表示拖拽 / 滚轮直写 */
  apply?: (view: ViewState, animate: boolean) => void
  /** 命中该选择器的子元素时不启动平移（节点、控件、面板） */
  exclude?: string
  /** 普通滚轮是否平移（false 时仅 Ctrl / ⌘ + 滚轮缩放），默认 true */
  wheelPans?: boolean
  /**
   * 普通滚轮直接缩放（优先于 `wheelPans`），默认 false
   *
   * 画布类界面（组织架构）用户的预期就是"滚一下变大变小"；页面本身已不需要滚动，
   * 普通滚轮再拿来平移只会让人觉得"推不动"。
   */
  wheelZooms?: boolean
  /** 是否启用平移缩放（如 RelationGraph 的 pannable），默认启用 */
  enabled?: () => boolean
  minK?: number
  maxK?: number
}

export function useViewportPan(options: ViewportPanOptions) {
  const view = reactive<ViewState>({ x: 0, y: 0, k: 1 })
  const minK = options.minK ?? 0.3
  const maxK = options.maxK ?? 2
  const render = (animate: boolean) => options.apply?.(view, animate)
  const enabled = () => (options.enabled ? options.enabled() : true)

  let pan: { id: number; x: number; y: number; vx: number; vy: number; moved: boolean } | null = null

  /** 本次按下是否真的拖动过（区分"点击"与"拖拽"，见 `didPan`） */
  let moved = false

  /** 判定为拖拽的最小位移（px）：小于它仍算点击，避免手抖把选中吞掉 */
  const DRAG_THRESHOLD = 3

  function onPointerDown(event: PointerEvent) {
    if (!enabled() || event.button !== 0) return
    if (options.exclude && (event.target as Element).closest(options.exclude)) return
    moved = false
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false }
    /*
     * 🔴 这里**不能** `setPointerCapture`：一旦捕获，后续的 click 会派发给容器而不是
     *    最初的元素 —— 节点上的 `@click` 收不到，表现就是"能拖了但点不中了"。
     *    捕获挪到真正越过阈值的那一次 pointermove（见下）。
     */
  }

  function onPointerMove(event: PointerEvent) {
    if (!pan || pan.id !== event.pointerId) return
    if (!pan.moved && Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > DRAG_THRESHOLD) {
      pan.moved = true
      moved = true
      const el = options.el()
      /*
       * 确认是拖拽后才捕获：保证拖出画布外仍能继续跟随；纯点击不捕获，
       * click 才会正常落到节点上。捕获失败（元素已卸载 / 合成事件）不该中断平移。
       */
      try {
        el?.setPointerCapture(event.pointerId)
      } catch {
        /* 忽略 */
      }
      el?.classList.add('is-panning')
    }
    view.x = pan.vx + event.clientX - pan.x
    view.y = pan.vy + event.clientY - pan.y
    render(false)
  }

  function onPointerUp(event: PointerEvent) {
    if (!pan || pan.id !== event.pointerId) return
    const el = options.el()
    if (el?.hasPointerCapture?.(event.pointerId)) {
      try {
        el.releasePointerCapture(event.pointerId)
      } catch {
        /* 忽略 */
      }
    }
    // 松开后浏览器还会补一个 click：宿主用 `didPan()` 决定要不要当成点击
    pan = null
    el?.classList.remove('is-panning')
  }

  /**
   * 上一次按下是否发生了拖拽
   *
   * 用途：节点同时支持"点击选中"与"按住拖动平移"，松开后浏览器必定再发一次 click，
   * 靠这个标记把拖拽后的 click 吞掉，否则一拖就顺手选中了鼠标下面的节点。
   *
   * @returns {boolean} 是否拖拽过
   */
  function didPan(): boolean {
    return moved
  }

  /**
   * 以某个点为中心缩放
   *
   * @param factor 缩放倍率（>1 放大）
   * @param cx 容器内横坐标（缺省为容器中心）
   * @param cy 容器内纵坐标
   * @param animate 是否走补间：滚轮传 false，直写更跟手（也避免连续滚动堆补间）
   */
  function zoomAt(factor: number, cx?: number, cy?: number, animate = true) {
    const box = options.el()?.getBoundingClientRect()
    if (!box) return
    const px = cx ?? box.width / 2
    const py = cy ?? box.height / 2
    const k = Math.min(maxK, Math.max(minK, view.k * factor))
    view.x = px - ((px - view.x) / view.k) * k
    view.y = py - ((py - view.y) / view.k) * k
    view.k = k
    render(animate)
  }

  function onWheel(event: WheelEvent) {
    if (!enabled()) return
    const box = options.el()?.getBoundingClientRect()
    if (!box) return
    // Ctrl / ⌘ 永远缩放（触控板捏合也会带 ctrlKey）；wheelZooms 让普通滚轮同样缩放
    if (event.ctrlKey || event.metaKey || options.wheelZooms === true) {
      event.preventDefault()
      /*
       * 触控板捏合的 deltaY 很小、鼠标滚轮一格约 ±100：指数映射让两者都顺手
       * （一格约 ±20%），且不会因为加速滚动一下跳到边界。
       */
      // 滚轮缩放直写：连续滚动时逐帧起补间会有一层"拖后腿"的黏滞感
      zoomAt(Math.exp(-event.deltaY * 0.0022), event.clientX - box.left, event.clientY - box.top, false)
    } else if (options.wheelPans !== false) {
      event.preventDefault()
      view.x -= event.deltaX
      view.y -= event.deltaY
      render(false)
    }
  }

  function reset(animate = true) {
    view.x = 0
    view.y = 0
    view.k = 1
    render(animate)
  }

  function bind() {
    options.el()?.addEventListener('wheel', onWheel, { passive: false })
  }
  function unbind() {
    options.el()?.removeEventListener('wheel', onWheel)
  }

  return { view, zoomAt, reset, bind, unbind, onPointerDown, onPointerMove, onPointerUp, didPan }
}
