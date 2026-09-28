/**
 * theme store 行为守卫（P1-1 拆分前的**安全网**）
 *
 * === 这个文件存在的理由 ===
 * `stores/theme.ts` 是「明暗 ≡ 配色系别」状态机的唯一实现，901 行、6 个 watch
 * 互相咬合。任何按"存储层 / 派生层 / 副作用层"的拆分都必须**证明行为不变** ——
 * 而在这之前，这个文件里除了注释没有任何可执行的契约。
 *
 * 因此本测试只锁**不变量**，不锁实现细节：
 *   • 不 assert "某函数被调用" —— 拆分会重命名/移动函数，那是允许的；
 *   • 只 assert 对外可观察的结果（`themeId` / `mode` / `activeTone` / `isDark`）。
 * 这样它是"重构的安全网"，而不是"重构的绊脚石"。
 *
 * === 为什么不 mock `@/theme` ===
 * 真实加载注册表才能验证"意图 → 可渲染配色"这条链本身（含跨设备回落、
 * 同系别回落）。mock 掉它 = 测试的是我手写的常量，不是被测代码。
 *
 * ⚠️ 每个用例都要**重置模块**：store 在 `defineStore(...)()` 当场读
 *    `window.location.search` 与 `localStorage`，是"创建即快照"的语义。
 *    复用 pinia 会让上个用例的 URL/落盘污染下个用例。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/** 默认包 / 设备 / 页面（与 skinsuite 的 constants 同口径） */
const DEFAULT_PKG = 'default';
const MOBILE = 'mobile';

/**
 * 在指定 URL 下新建一个 store
 *
 * `vi.resetModules()` 让每次 `import('@/stores/theme')` 都拿到一份新的 store 定义，
 * 从而重新执行"读 URL / 读 localStorage / 建 watch"的初始化。
 */
async function freshStore(search = '') {
  vi.resetModules();
  window.history.replaceState({}, '', search || '/');
  const { useThemeStore } = await import('@/stores/theme');
  return useThemeStore();
}

/** 让 store 内的 watch 冲刷一轮（Vue 的 watch 默认异步批处理） */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('theme store 行为守卫', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.mauthTheme;
    setActivePinia(createPinia());
  });

  afterEach(() => {
    document.getElementById('mauth-theme-css')?.remove();
  });

  describe('初始状态', () => {
    it('无任何 URL / 落盘时，mode 为 system、配色为默认色 white', async () => {
      const store = await freshStore();
      expect(store.mode).toBe('system');
      expect(store.themeId).toBe('white');
    });

    it('落盘的配色能恢复（theme-id 键）', async () => {
      localStorage.setItem('theme-id', 'blue');
      const store = await freshStore();
      expect(store.themeId).toBe('blue');
    });

    it('落盘的非法配色被忽略，回落到默认色', async () => {
      localStorage.setItem('theme-id', 'not-a-real-color');
      const store = await freshStore();
      expect(store.themeId).toBe('white');
    });

    it('旧键 theme-skin 作为迁移兜底被读取', async () => {
      localStorage.setItem('theme-skin', 'cyan');
      const store = await freshStore();
      expect(store.themeId).toBe('cyan');
    });
  });

  describe('明暗 ≡ 配色系别（核心不变量）', () => {
    it('点黑卡（black）→ mode 变成 dark、isDark 为 true', async () => {
      const store = await freshStore();
      expect(store.setTheme('black')).toBe(true);
      expect(store.mode).toBe('dark');
      expect(store.isDark).toBe(true);
      expect(store.activeTone).toBe('dark');
    });

    it('点白卡（white）→ mode 变成 light、isDark 为 false', async () => {
      const store = await freshStore();
      store.setTheme('black');
      expect(store.setTheme('white')).toBe(true);
      expect(store.mode).toBe('light');
      expect(store.isDark).toBe(false);
    });

    it('蓝是白系 → 点蓝 mode 为 light', async () => {
      const store = await freshStore();
      store.setTheme('blue');
      expect(store.mode).toBe('light');
      expect(store.isDark).toBe(false);
    });

    it('未登记的配色 setTheme 返回 false 且不改现状', async () => {
      const store = await freshStore();
      const before = store.themeId;
      expect(store.setTheme('nope-not-registered')).toBe(false);
      expect(store.themeId).toBe(before);
    });
  });

  describe('会话级记忆槽（切走前记一套，不持久化）', () => {
    it('黑（默认）点「明」→ 落到标配 white，而不是字母序第一的 blue', async () => {
      const store = await freshStore();
      store.setTheme('black');
      // 桌面/移动端的白系标配是 white；若退化成"字母序第一套"就会落到 blue
      store.setMode('light');
      await flush();
      expect(store.themeId).toBe('white');
    });

    it('用 blue 时切黑再切回明 → 恢复 blue（槽记住切走前那套）', async () => {
      const store = await freshStore();
      store.setTheme('blue');
      expect(store.themeId).toBe('blue');
      store.setMode('dark');
      await flush();
      expect(store.isDark).toBe(true);
      store.setMode('light');
      await flush();
      expect(store.themeId).toBe('blue');
    });

    it('点色卡会打断记忆链：白系下点黑卡后切明不再恢复历史色', async () => {
      const store = await freshStore();
      store.setTheme('blue'); // 白系 + 记住 blue 是"当前用的"
      store.setTheme('black'); // 显式点黑卡 → 清空对侧(白系)槽
      store.setMode('light'); // 切明：没有白系槽 → 落标配
      await flush();
      expect(store.themeId).toBe('white');
    });
  });

  describe('URL 意图（按设备锁定）', () => {
    it('?theme=blue 被默认设备（mobile）采用', async () => {
      const store = await freshStore('?theme=blue');
      expect(store.themeId).toBe('blue');
    });

    it('?theme.mobile=blue 锁定 mobile 那一条（按设备解析出该端配色）', async () => {
      const store = await freshStore('?theme.mobile=blue');
      store.setActiveDevice(MOBILE);
      await flush();
      expect(store.themeRecordFor(undefined, MOBILE, 'login').meta.id).toBe('blue');
    });

    it('?skin.<设备> 是 theme 的兼容别名', async () => {
      const store = await freshStore('?skin.mobile=cyan');
      store.setActiveDevice(MOBILE);
      await flush();
      expect(store.themeRecordFor(undefined, MOBILE, 'login').meta.id).toBe('cyan');
    });

    it('空串 = 未指定：?theme.mobile= 不吞掉通用键 ?theme=blue', async () => {
      // 这是 2026-09-26 修过的真实缺陷：'' ?? anyScope 仍是 ''，会让通用键一起失效
      const store = await freshStore('?theme.mobile=&theme=blue');
      store.setActiveDevice(MOBILE);
      await flush();
      expect(store.themeRecordFor(undefined, MOBILE, 'login').meta.id).toBe('blue');
    });

    it('?mode=dark 直接定下明暗意图', async () => {
      const store = await freshStore('?mode=dark');
      expect(store.mode).toBe('dark');
    });

    it('用户显式 setTheme 会清掉当前设备的 URL 覆盖（显式操作压过链接）', async () => {
      const store = await freshStore('?theme.mobile=blue');
      store.setActiveDevice(MOBILE);
      await flush();
      expect(store.themeRecordFor(undefined, MOBILE, 'login').meta.id).toBe('blue');
      // 显式操作后 URL 覆盖被清 → 生效配色改为刚设的 cyan（cyan 在 mobile/login 有登记）
      store.setTheme('cyan');
      await flush();
      expect(store.themeRecordFor(undefined, MOBILE, 'login').meta.id).toBe('cyan');
    });
  });

  describe('切版式 → 重置配色到新包默认色', () => {
    it('从 default 包切到 compact 包，配色重置（视图换包）', async () => {
      const store = await freshStore();
      store.setActiveDevice(MOBILE);
      store.setActivePageView('register', DEFAULT_PKG);
      store.setTheme('cyan');
      expect(store.themeId).toBe('cyan');
      store.setActivePageView('register', 'compact');
      await flush();
      expect(store.themeId).toBe('white');
    });

    it('切版式重置**不落盘**（切回旧版式应恢复用户上次自选色）', async () => {
      const store = await freshStore();
      store.setActiveDevice(MOBILE);
      store.setActivePageView('register', DEFAULT_PKG);
      store.setTheme('cyan');
      store.setActivePageView('register', 'compact');
      await flush();
      expect(localStorage.getItem('theme-id')).toBe('cyan');
    });
  });

  describe('外部覆写（后端下发 / 父应用）', () => {
    it('applyThemeConfig 能改配色但不写 localStorage', async () => {
      const store = await freshStore();
      localStorage.clear();
      store.applyThemeConfig({ theme: 'cyan' });
      expect(store.themeId).toBe('cyan');
      expect(localStorage.getItem('theme-id')).toBeNull();
    });

    it('URL 锁定配色时，后端下发不覆盖该设备', async () => {
      const store = await freshStore('?theme.mobile=blue');
      store.setActiveDevice(MOBILE);
      store.applyThemeConfig({ theme: 'cyan' });
      expect(store.themeId).toBe('blue');
    });

    it('外部 tokens 可撤销（传 null 回到主题包 tokens）', async () => {
      const store = await freshStore();
      store.applyThemeConfig({ tokens: { '--mauth-primary': '#123456' } });
      expect(store.externalTokens).toMatchObject({ '--mauth-primary': '#123456' });
      store.applyThemeConfig(null);
      expect(store.externalTokens).toBeNull();
    });

    it('applyTheme(dark) 等价于 setMode("dark")', async () => {
      const store = await freshStore();
      store.applyTheme(true);
      expect(store.mode).toBe('dark');
      store.applyTheme(false);
      expect(store.mode).toBe('light');
    });
  });

  describe('导出面完整（拆分不得缩水公开 API）', () => {
    it('对外方法/状态一个不少', async () => {
      const store = await freshStore();
      const api = [
        'mode', 'isDark', 'themeId', 'packageId', 'device', 'activeDevice',
        'activePage', 'activeView', 'activeTone', 'themes', 'systemDark',
        'themeTokens', 'externalTokens', 'lightColor', 'darkColor',
        'themeRecordFor', 'setActiveDevice', 'setActivePageView', 'setMode',
        'cycleMode', 'toggleTheme', 'setTheme', 'viewFor', 'applyThemeConfig',
        'applyTheme', 'dispose'
      ];
      for (const key of api) {
        expect(store, `store 缺少导出：${key}`).toHaveProperty(key);
      }
    });
  });

  describe('DOM 副作用（token 注入与属性写入）', () => {
    it('生效配色会写到 html 的 data-mauth-theme', async () => {
      const store = await freshStore();
      store.setActiveDevice(MOBILE);
      store.setActivePageView('login', DEFAULT_PKG);
      store.setTheme('blue');
      await flush();
      expect(document.documentElement.dataset.mauthTheme).toBe('blue');
    });

    it('深色时给 html 挂 dark 类', async () => {
      const store = await freshStore();
      store.setTheme('black');
      await flush();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('dispose 摘除系统偏好监听（不再响应 change）', async () => {
      // happy-dom 的 matchMedia 每次返回**新实例**，spy 打不到 store 内部那一个。
      // 改成：在 store 创建前把 window.matchMedia 换成返回**同一个稳定 mock**，
      // 这样 add/removeEventListener 都落在我们手里这一个对象上。
      const realMatchMedia = window.matchMedia.bind(window);
      const listeners = new Set<(e: MediaQueryListEvent) => void>();
      const mockMq = {
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb)
      } as unknown as MediaQueryList;

      const addSpy = vi.spyOn(mockMq, 'addEventListener');
      const removeSpy = vi.spyOn(mockMq, 'removeEventListener');
      window.matchMedia = (() => mockMq) as typeof window.matchMedia;

      try {
        const store = await freshStore();
        expect(addSpy).toHaveBeenCalled();
        expect(listeners.size).toBe(1);

        store.dispose();
        await flush();

        expect(removeSpy).toHaveBeenCalled();
        expect(listeners.size).toBe(0);
      } finally {
        window.matchMedia = realMatchMedia;
      }
    });
  });
});
