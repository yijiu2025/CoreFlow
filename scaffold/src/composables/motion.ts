/**
 * 动效唯一入口（移植自参考项目 `composables/motion.ts` 的图谱子集）
 *
 * 只保留图谱与批量操作需要的部分：弹簧物理、帧循环、浮条进出、行级联。
 * 页面转场、弹窗 morph、按压涟漪等页面级动效不在本文件范围内 —— 需要时再增补，
 * 避免把整套动效体系一次性搬进来（每多一条曲线就多一处永远测不到的代码）。
 *
 * 每条动效都要能说出能量语态：蓄 Charge（输入）/ 放 Discharge（开始工作）/
 * 导 Conduct（进行中）/ 结 Crystallize（交付落定）/ 停摆 Halt（停止、恢复默认）。
 * 说不出语态的就是装饰，不做。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { gsap } from 'gsap';

/** 缓动曲线（语义化命名，避免各处硬写字符串） */
export const EASE = Object.freeze({
  reveal: 'expo.out',
  glide: 'power4.out',
  exit: 'power2.in',
  swap: 'power2.inOut',
  settle: 'back.out(1.6)'
});

/** 常用时长（秒） */
export const DUR = Object.freeze({
  press: 0.14,
  release: 0.46,
  hoverIn: 0.34,
  hoverOut: 0.42,
  slide: 0.52
});

const reducedQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * 系统是否要求减少动态效果
 *
 * @returns 是否偏好减少动效
 */
export function prefersReducedMotion(): boolean {
  return Boolean(reducedQuery?.matches);
}

/**
 * 是否跳过动效（减少动效偏好，或页面在后台 —— 后台 rAF 被节流，补间会停在中途）
 *
 * @returns 是否直接给终态
 */
function skipMotion(): boolean {
  return prefersReducedMotion() || (typeof document !== 'undefined' && document.hidden);
}

/**
 * 对外暴露的跳过判定（组件里判断"要不要画动画帧"时用）
 *
 * @returns 是否跳过动效
 */
export function motionSkipped(): boolean {
  return skipMotion();
}

// 切到后台时把进行中的补间走完，回到前台不会看到停在半路的浮层
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    gsap.globalTimeline.getChildren(false, true, true).forEach(t => t.progress(1, false));
  });
}

/* ── 底部浮条（未保存变更）：从底部升起（放），收回时下沉（停摆） ── */
export function floatBarEnter(el: Element, done: () => void): void {
  if (skipMotion()) {
    done();
    return;
  }
  gsap.fromTo(
    el,
    { y: 40, opacity: 0, scale: 0.96 },
    { y: 0, opacity: 1, scale: 1, duration: 0.56, ease: EASE.settle, clearProps: 'transform', onComplete: done }
  );
}

export function floatBarLeave(el: Element, done: () => void): void {
  if (skipMotion()) {
    done();
    return;
  }
  gsap.to(el, { y: 30, opacity: 0, duration: 0.22, ease: EASE.exit, onComplete: done });
}

/* ── 群组进场：列表行按阅读序（结 Crystallize） ── */
export function revealRows(rows: ArrayLike<Element>): void {
  if (skipMotion() || !rows.length) return;
  const list = Array.from(rows).slice(0, 14);
  gsap.fromTo(
    list,
    { opacity: 0, y: 6 },
    {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: EASE.reveal,
      stagger: { each: 0.025, from: 'start' },
      clearProps: 'opacity,transform'
    }
  );
}

/** 状态确认：一次 back.out 的 scale 弹入（不用 opacity 脉冲） */
export function settlePop(el: Element | null): void {
  if (!el || skipMotion()) return;
  gsap.fromTo(el, { scale: 0.6 }, { scale: 1, duration: 0.42, ease: EASE.settle, clearProps: 'transform' });
}

/* ── 关系图与常驻动画的物理底座 ──────────────────────────────── */

/** 弹簧状态：x 当前值，v 速度 */
export interface SpringState {
  x: number;
  v: number;
}

/**
 * 新建弹簧状态
 *
 * @param x 初始值
 * @returns 状态对象
 */
export const springOf = (x: number): SpringState => ({ x, v: 0 });

/**
 * 临界阻尼弹簧：每帧把 state 推向 target
 *
 * @param state 状态
 * @param target 目标值
 * @param dt 帧间隔（秒）
 * @param k 刚度（越大越硬，62 ≈ 0.5s 落定）
 * @returns 新值
 */
export function spring(state: SpringState, target: number, dt: number, k = 62): number {
  const c = 2 * Math.sqrt(k);
  state.v += (-k * (state.x - target) - c * state.v) * dt;
  state.x += state.v * dt;
  return state.x;
}

/**
 * 三次贝塞尔上 u 处的坐标分量
 *
 * @param p0 起点
 * @param p1 控制点 1
 * @param p2 控制点 2
 * @param p3 终点
 * @param u 参数 0–1
 * @returns 坐标
 */
export function bezierAt(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const m = 1 - u;
  return m * m * m * p0 + 3 * m * m * u * p1 + 3 * m * u * u * p2 + u * u * u * p3;
}

/**
 * 常驻帧循环：挂在 gsap.ticker 上
 *
 * 页面隐藏或元素离开视口时停帧（导 Conduct）—— 离线页面不烧 CPU。
 * 回调拿到 dt（秒，限制在 1/30 内）与累计时间 t；单帧出错只报一次，不让循环停摆。
 *
 * @param step 每帧回调
 * @returns start / stop / flush / time
 */
export function createFrameLoop(step: (dt: number, t: number) => void) {
  let target: Element | null = null;
  let offscreen = false;
  let frames = 0;
  let running = false;
  let last = 0;
  let time = 0;
  let warned = false;

  const run = (force: boolean): void => {
    if (document.hidden && !force) {
      last = 0;
      return;
    }
    // 每 20 帧量一次位置：离开视口就停帧（比 IntersectionObserver 更不受过渡与隐藏祖先影响）
    if (target && (offscreen || frames++ % 20 === 0)) {
      const r = target.getBoundingClientRect();
      offscreen = r.width === 0 || r.bottom < 0 || r.top > window.innerHeight;
    }
    if (offscreen && !force) {
      last = 0;
      return;
    }
    const now = performance.now();
    const dt = last ? Math.max(0, Math.min(1 / 30, (now - last) / 1000)) : 1 / 60;
    last = now;
    time += dt;
    try {
      step(dt, time);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.error(error);
      }
    }
  };

  const tick = (): void => run(false);

  return {
    start(el?: Element | null): void {
      if (running) return;
      running = true;
      last = 0;
      target = el ?? null;
      gsap.ticker.add(tick);
    },
    stop(): void {
      running = false;
      gsap.ticker.remove(tick);
      target = null;
    },
    /** 立即执行一帧（减少动效时用来直接画到终态） */
    flush(): void {
      run(true);
    },
    get time(): number {
      return time;
    }
  };
}

export { gsap };
