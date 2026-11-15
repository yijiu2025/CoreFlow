/**
 * 命令面板（⌘/Ctrl + K）
 *
 * === 它解决什么 ===
 * 后台功能的入口藏在侧栏的两级菜单里。熟练用户想"去岗位管理"要先用眼睛找、再点两下；
 * 命令面板把它变成"按 Ctrl+K，打两个字，回车"。
 *
 * === 四组结果 ===
 * | 分组 | 什么时候出现 | 数据来源 |
 * | --- | --- | --- |
 * | 最近访问 | 还没输入时 | localStorage `mauth:recent`（每次路由变化记录，最多 5 条） |
 * | 页面 | 始终 | `useNavGroups().pages`（与侧栏同一份，规则只写一次） |
 * | 用户 | 输入了关键字且**有读权限** | `listUsers({ keyword })`，防抖 220ms |
 * | 动作 | 始终 | 切明暗 / 外观与主题 / 个人设置 / 退出登录 |
 *
 * 🔴 **不重复实现导航过滤**：页面清单必须与侧栏同源（`useNavGroups`），
 *    否则会出现"侧栏藏了、面板搜得到"的错位。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { listUsers } from '@/api/system';
import { useNavGroups } from '@/composables/useNavGroups';

/** 一条可执行的结果 */
export interface PaletteEntry {
  /** 稳定 key（v-for 与键盘定位都用它） */
  key: string;
  /** 所属分组标题 */
  group: string;
  /** 主文案 */
  label: string;
  /** 副文案（路径、部门、说明） */
  sub?: string;
  /** 图标名（走 `AppIcon` 的注册表） */
  icon?: string;
  /** 头像首字（用户分组用；有值时优先于 icon） */
  initial?: string;
  /** 回车时执行 */
  run: () => void;
}

/** 最近访问的存储键（与 `mauth:accent` 同族） */
const RECENT_KEY = 'mauth:recent';

/** 最多记 5 个最近页面 */
const RECENT_MAX = 5;

/** 用户搜索防抖时长（毫秒） */
const SEARCH_DEBOUNCE = 220;

/**
 * 面板是否打开（**模块级**，全站唯一）
 *
 * 为什么不能放在 `useCommandPalette()` 里：`App.vue` 要绑全局快捷键（它只关心"打开"），
 * 而面板组件要读状态。两边各调一次 composable 会拿到**两个独立的 ref** ——
 * 按了 Ctrl+K 什么都不会发生（这是最容易写错、也最难查的一处）。
 */
const open = ref(false);

/** 打开面板（全局快捷键调用；query 的清空由组件侧在 watch 里做） */
export function openCommandPalette(): void {
  open.value = true;
}

/** 关闭面板 */
export function closeCommandPalette(): void {
  open.value = false;
}

/**
 * 读最近访问
 *
 * @returns 路径列表（最近的在前）
 */
function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 写最近访问
 *
 * @param list 路径列表
 */
function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // 隐私模式：记不住就算了，不影响使用
  }
}

export function useCommandPalette(): {
  open: Ref<boolean>;
  query: Ref<string>;
  activeIndex: Ref<number>;
  entries: ComputedRef<PaletteEntry[]>;
  grouped: ComputedRef<Array<{ name: string; items: PaletteEntry[] }>>;
  searching: Ref<boolean>;
  openPalette: () => void;
  closePalette: () => void;
  move: (delta: number) => void;
  commit: (index?: number) => void;
} {
  const router = useRouter();
  const route = useRoute();
  const auth = useAuthStore();
  const themeStore = useThemeStore();
  const { pages } = useNavGroups();

  const query = ref('');
  const activeIndex = ref(0);
  const searching = ref(false);
  const recent = ref<string[]>(readRecent());
  /*
   * 用户表**没有 nickname 字段**（`UserRow` 只有 username / dept_name / role_names），
   * 所以主文案直接用账号名，副文案给部门 —— 不要为了"看起来像姓名"去猜字段。
   */
  const foundUsers = ref<Array<{ id: number; username: string; dept: string }>>([]);

  /** 每次路由变化记一条最近访问（登录页与错误页不算） */
  watch(
    () => route.fullPath,
    () => {
      if (!route.meta?.title || route.name === 'not-found' || route.name === 'login') return;
      const path = route.path;
      recent.value = [path, ...recent.value.filter(item => item !== path)].slice(0, RECENT_MAX);
      writeRecent(recent.value);
    },
    { immediate: true }
  );

  /** 有没有搜人的权限（没有就不发请求，也不显示分组） */
  const canSearchUsers = computed(() => auth.hasPermission('admin:user:read'));

  /** 一个防抖定时器（同一时刻只该有一个待发请求） */
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch([query, open], () => {
    if (timer) clearTimeout(timer);
    const keyword = query.value.trim();
    if (!open.value || !keyword || !canSearchUsers.value) {
      foundUsers.value = [];
      searching.value = false;
      return;
    }
    searching.value = true;
    timer = setTimeout(async () => {
      timer = null;
      try {
        const page = await listUsers({ keyword, pageNum: 1, pageSize: 5 });
        // 期间用户又改了关键字：丢弃这次结果
        if (query.value.trim() !== keyword) return;
        foundUsers.value = page.rows.map(row => ({
          id: row.id,
          username: row.username,
          dept: row.dept_name || '未分配部门'
        }));
      } catch {
        // 搜人失败不该让整个面板报错：页面与动作仍然可用
        foundUsers.value = [];
      } finally {
        searching.value = false;
      }
    }, SEARCH_DEBOUNCE);
  });

  /**
   * 跳到某个路径并关闭面板
   *
   * @param path 目标路径
   */
  function go(path: string): void {
    closePalette();
    if (route.path !== path) void router.push(path);
  }

  const entries = computed<PaletteEntry[]>(() => {
    const keyword = query.value.trim().toLowerCase();
    const out: PaletteEntry[] = [];
    const hit = (text: string): boolean => text.toLowerCase().includes(keyword);

    // ① 最近访问：只在没输入时出现，且排除当前页
    if (!keyword) {
      recent.value
        .filter(path => path !== route.path)
        .slice(0, RECENT_MAX)
        .forEach(path => {
          const page = pages.value.find(item => item.path === path);
          if (!page) return;
          out.push({
            key: `recent-${path}`,
            group: '最近访问',
            label: page.name,
            sub: page.group,
            icon: page.icon,
            run: () => go(path)
          });
        });
    }

    // ② 页面
    pages.value
      .filter(page => !keyword || hit(page.name) || hit(page.group) || page.path.toLowerCase().includes(keyword))
      .forEach(page => {
        out.push({
          key: `page-${page.path}`,
          group: '页面',
          label: page.name,
          sub: page.group,
          icon: page.icon,
          run: () => go(page.path)
        });
      });

    // ③ 用户（只在有权限时才有数据）
    foundUsers.value.forEach(user => {
      out.push({
        key: `user-${user.id}`,
        group: '用户',
        label: user.username,
        sub: user.dept,
        initial: user.username.slice(0, 1).toUpperCase(),
        run: () => {
          closePalette();
          void router.push({ path: '/system/user', query: { keyword: user.username } });
        }
      });
    });

    // ④ 动作
    const dark = themeStore.isDark;
    const actions: PaletteEntry[] = [
      {
        key: 'action-theme',
        group: '动作',
        label: dark ? '切换到浅色外观' : '切换到深色外观',
        icon: dark ? 'sun' : 'moon',
        run: () => {
          themeStore.setMode(dark ? 'light' : 'dark');
          closePalette();
        }
      },
      {
        key: 'action-appearance',
        group: '动作',
        label: '外观与主题',
        sub: '背景、颜色、版式、自定义',
        icon: 'palette',
        run: () => go('/settings/theme')
      },
      {
        key: 'action-profile',
        group: '动作',
        label: '个人设置',
        sub: '昵称、头像、登录设备',
        icon: 'user',
        run: () => go('/settings/profile')
      },
      {
        key: 'action-logout',
        group: '动作',
        label: '退出登录',
        icon: 'logout',
        run: () => {
          closePalette();
          void auth.logout();
        }
      }
    ];
    actions.filter(action => !keyword || hit(action.label) || hit(action.sub ?? '')).forEach(action => out.push(action));

    return out;
  });

  /** 按分组归并（渲染时每组一个标题） */
  const grouped = computed<Array<{ name: string; items: PaletteEntry[] }>>(() => {
    const groups: Array<{ name: string; items: PaletteEntry[] }> = [];
    entries.value.forEach(entry => {
      let group = groups.find(item => item.name === entry.group);
      if (!group) {
        group = { name: entry.group, items: [] };
        groups.push(group);
      }
      group.items.push(entry);
    });
    return groups;
  });

  /** 结果变化时把高亮拉回第一项（否则会停在一个已消失的索引上） */
  watch(entries, () => {
    activeIndex.value = 0;
  });

  /** 打开面板（清空上一次的输入与高亮） */
  function openPalette(): void {
    query.value = '';
    activeIndex.value = 0;
    openCommandPalette();
  }

  /** 关闭面板 */
  function closePalette(): void {
    closeCommandPalette();
    query.value = '';
  }

  /**
   * 上下移动高亮（到头绕回）
   *
   * @param delta +1 下移 / -1 上移
   */
  function move(delta: number): void {
    const total = entries.value.length;
    if (total === 0) return;
    activeIndex.value = (activeIndex.value + delta + total) % total;
  }

  /**
   * 执行当前高亮项（或指定项）
   *
   * @param index 目标索引（不给则用当前高亮）
   */
  function commit(index?: number): void {
    const target = entries.value[index ?? activeIndex.value];
    target?.run();
  }

  return {
    open,
    query,
    activeIndex,
    entries,
    grouped,
    searching,
    openPalette,
    closePalette,
    move,
    commit
  };
}
