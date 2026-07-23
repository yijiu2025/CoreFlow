const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f || (m.f = ['assets/interaction-BQbDjw-F.js', 'assets/index-C531BqZY.js', 'assets/index-kHUfwutH.css'])
) => i.map(i => d[i]);
import {
  a0 as x,
  u as Be,
  i as Ne,
  a1 as Oe,
  C as P,
  A as $e,
  B as Re,
  a2 as qe,
  l,
  _ as Y,
  k as r,
  g as Ke,
  h as Ve,
  a3 as Ye
} from './index-C531BqZY.js';
import { workApi as m } from './work-CSZq0nvF.js';
import { u as je } from './useLocation-BzKEbus-.js';
const xe = { getActive: () => x.get('/posecraft/v1/banner-configs/active') },
  Qe = { getList: () => x.get('/posecraft/v1/config/channels') },
  j = Symbol('HomeState');
function Ze() {
  const I = qe(j, null);
  if (I) return I;
  const f = Ke(),
    Q = Ve(),
    G = Be(),
    a = Ne(),
    E = l(typeof window < 'u' ? window.innerWidth : 1200),
    M = r(() => E.value <= 1024),
    J = l(!1),
    S = l(!1),
    H = l(!1),
    T = l(''),
    z = l(!1),
    i = l('recommend'),
    y = l('recommend'),
    X = l(null),
    Z = l(null),
    W = Oe(),
    ee = r({ get: () => W.settings.showTemplate, set: e => W.setSetting('showTemplate', e) }),
    te = l(!1),
    ae = l(!1),
    ne = l('general'),
    oe = r({
      get: () => a.saveLoginInfo,
      set: e => {
        a.updateSaveLoginInfo(e);
      }
    }),
    se = l(!0),
    le = r({
      get: () => a.followingCount,
      set: e => {
        a.followingCount = e;
      }
    }),
    re = r({
      get: () => a.followersCount,
      set: e => {
        a.followersCount = e;
      }
    }),
    ie = r({
      get: () => a.worksCount,
      set: e => {
        a.worksCount = e;
      }
    }),
    ce = r({
      get: () => a.likesCount,
      set: e => {
        a.likesCount = e;
      }
    }),
    ue = r({
      get: () => a.mutualCount,
      set: e => {
        a.mutualCount = e;
      }
    }),
    fe = r({
      get: () => a.templatesCount,
      set: e => {
        a.templatesCount = e;
      }
    }),
    ge = r({
      get: () => a.recommendationsCount,
      set: e => {
        a.recommendationsCount = e;
      }
    }),
    de = r({
      get: () => a.collectsCount,
      set: e => {
        a.collectsCount = e;
      }
    }),
    ve = r({
      get: () => a.userProfile,
      set: e => {
        a.userProfile = e;
      }
    }),
    b = l(''),
    k = e => {
      ((b.value = e),
        setTimeout(() => {
          b.value === e && (b.value = '');
        }, 2e3));
    },
    F = l({}),
    D = () => (i.value === 'featured' ? `channel:${y.value}` : `nav:${i.value}`),
    he = l([]),
    c = l([]),
    g = l([]),
    L = l(1),
    h = l(!0),
    p = l(!1),
    { autoLocate: pe } = je(),
    U = l(null),
    we = [
      '画图编程代码',
      '画图生成建模',
      '画图出数模',
      'mermaid代码',
      '画图自动生成模型',
      '画图生成电子签名',
      '画图生成设计',
      '画图生成3d代码',
      '画图生成图纸',
      '画图制作文字',
      '人体骨骼姿势提取',
      'WebGL 3D人体建模'
    ],
    d = l([]),
    v = r(() => d.value.find(e => e.value === y.value) || null),
    me = r(() => {
      var e;
      return ((e = v.value) == null ? void 0 : e.url) || '';
    }),
    ye = r(() => {
      var e;
      return ((e = v.value) == null ? void 0 : e.has_banner) === !0 && y.value === 'recommend';
    }),
    ke = r(() => (v.value && v.value.category) || 'all'),
    Ce = () => {
      switch (i.value) {
        case 'featured':
          return '精选姿势';
        case 'recommend':
          return '推荐内容';
        case 'nearby':
          return '附近创作者';
        case 'ai-search':
          return 'AI 智能探索';
        case 'following':
          return '我的关注';
        case 'friends':
          return '朋友动态';
        case 'mine':
          return '我的空间';
        default:
          return 'PoseCraft';
      }
    },
    Se = r(() => {
      const e = he.value.map(n => ({ ...n, type: 'template', _key: `template-${n.id}` })),
        o = c.value.map(n => ({ ...n, type: 'work', _key: `work-${n.id}` }));
      let t = [...e, ...o];
      if (T.value.trim()) {
        const n = T.value.toLowerCase();
        t = t.filter(
          s =>
            (s.title && s.title.toLowerCase().includes(n)) || (s.description && s.description.toLowerCase().includes(n))
        );
      }
      return t;
    }),
    be = e => (e ? (e >= 1e4 ? (e / 1e4).toFixed(1) + '万' : e.toString()) : '0'),
    Le = () => {
      a.isLoggedIn ? f.push('/editor') : f.push('/login');
    },
    _e = e => {
      e.type === 'template' ? f.push(`/template/${e.id}`) : f.push(`/work/${e.id}`);
    },
    B = e => {
      const o = [c.value, a.myWorks, a.myTemplates, a.myLikes, a.myCollects];
      for (const t of o) {
        const n = t.find(s => s.id === e);
        if (n) return n;
      }
      return null;
    },
    _ = () => [...c.value, ...a.myWorks, ...a.myTemplates, ...a.myLikes, ...a.myCollects],
    Ae = async e => {
      if (!a.isLoggedIn) return f.push('/login');
      const o = B(e.id);
      if (!o) return;
      const t = !o.liked;
      _()
        .filter(n => n.id === e.id)
        .forEach(n => {
          ((n.liked = t), (n.likes_count = (n.likes_count || 0) + (t ? 1 : -1)));
        });
      try {
        const { interactionApi: n } = await Y(
          async () => {
            const { interactionApi: s } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: s };
          },
          __vite__mapDeps([0, 1, 2])
        );
        await n.toggleLike({ workId: e.id, like: t });
      } catch {
        (_()
          .filter(s => s.id === e.id)
          .forEach(s => {
            ((s.liked = !t), (s.likes_count = (s.likes_count || 0) + (t ? -1 : 1)));
          }),
          k('操作失败，请重试'));
      }
    },
    Pe = async e => {
      if (!a.isLoggedIn) return f.push('/login');
      const o = B(e.id);
      if (!o) return;
      const t = !o.collected;
      _()
        .filter(n => n.id === e.id)
        .forEach(n => {
          n.collected = t;
        });
      try {
        const { interactionApi: n } = await Y(
          async () => {
            const { interactionApi: s } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: s };
          },
          __vite__mapDeps([0, 1, 2])
        );
        await n.toggleCollect({ workId: e.id, collect: t });
      } catch {
        (_()
          .filter(s => s.id === e.id)
          .forEach(s => {
            s.collected = !t;
          }),
          k('操作失败，请重试'));
      }
    },
    Ee = () => {
      f.push('/login');
    },
    Te = () => {
      setTimeout(() => {
        z.value = !1;
      }, 150);
    },
    ze = () => {
      M.value ? f.push('/search') : (z.value = !0);
    },
    Ie = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    Me = () => {
      const e = v.value;
      if (!e) return {};
      const o = {};
      return (e.category && e.category !== 'all' && (o.category = e.category), o);
    },
    N = async e => {
      var n;
      const o = i.value;
      let t;
      switch (o) {
        case 'friends':
          if (!a.isLoggedIn) {
            t = { list: [] };
            break;
          }
          t = await m.getFriendsWorks({ page: e.page, pageSize: e.pageSize });
          break;
        case 'following':
          if (!a.isLoggedIn) {
            t = { list: [] };
            break;
          }
          t = await m.getFollowingWorks({ page: e.page, pageSize: e.pageSize });
          break;
        case 'mine':
          if (!a.isLoggedIn || !((n = a.user) != null && n.id)) {
            t = { list: [] };
            break;
          }
          t = await m.getMyWorks({ page: e.page, pageSize: e.pageSize });
          break;
        case 'nearby': {
          const s = U.value;
          if (!s) {
            t = { list: [] };
            break;
          }
          t = await m.getNearbyWorks({ page: e.page, pageSize: e.pageSize, lat: s.lat, lng: s.lng, radius: 50 });
          break;
        }
        case 'recommend':
          t = await m.getList({ page: e.page, pageSize: e.pageSize, sort: 'recommended' });
          break;
        default:
          t = await m.getList(e);
          break;
      }
      return {
        list: (t == null ? void 0 : t.list) || [],
        totalPages: (t == null ? void 0 : t.totalPages) || 1,
        page: (t == null ? void 0 : t.page) || e.page,
        pageSize: (t == null ? void 0 : t.pageSize) || e.pageSize
      };
    },
    O = async e => {
      var o;
      if (!p.value) {
        p.value = !0;
        try {
          let t = [],
            n = 1;
          const s = Me(),
            V = { page: e, pageSize: 12, ...s };
          if ((o = v.value) != null && o.has_banner && i.value === 'featured') {
            const [u, A] = await Promise.allSettled([N(V), xe.getActive().catch(() => null)]);
            if (u.status === 'fulfilled') {
              const w = u.value;
              ((t = (w == null ? void 0 : w.list) || []), (n = (w == null ? void 0 : w.totalPages) || 1));
            }
            A.status === 'fulfilled' && A.value ? (g.value = Array.isArray(A.value) ? A.value : []) : (g.value = []);
          } else {
            const u = await N(V);
            ((t = (u == null ? void 0 : u.list) || []), (n = (u == null ? void 0 : u.totalPages) || 1), (g.value = []));
          }
          (e === 1 ? (c.value = t) : (c.value = [...c.value, ...t]), (h.value = e < n));
          const Ue = D();
          F.value[Ue] = { works: [...c.value], hasMore: h.value, currentPage: e, banners: [...g.value] };
        } catch (t) {
          console.error('加载数据失败:', t);
        } finally {
          p.value = !1;
        }
      }
    },
    He = () => {
      const e = D(),
        o = F.value[e];
      return o
        ? ((c.value = [...o.works]),
          (h.value = o.hasMore),
          (L.value = o.currentPage),
          (g.value = o.banners ? [...o.banners] : []),
          !0)
        : !1;
    },
    C = () => {
      He() || ((L.value = 1), (h.value = !0), (c.value = []), (g.value = []), (p.value = !1), O(1));
    },
    We = () => {
      !h.value || p.value || (L.value++, O(L.value));
    },
    $ = async () => {
      var e;
      a.initialized
        ? a.isLoggedIn && !((e = a.userProfile) != null && e.uid) && (await a.fetchUserProfile())
        : await a.checkSession();
    },
    Fe = () => a.fetchMyStats(),
    De = async e => ((await a.updateUserProfile(e)) ? (k('个人资料更新成功'), !0) : (k('更新资料失败，请重试'), !1)),
    R = [
      { value: 'recommend', label: '推荐', icon: 'flame', type: 'content', has_banner: !0 },
      { value: 'pose', label: '姿势', icon: 'user', type: 'content', category: 'pose' },
      { value: 'creative', label: '创意', icon: 'lightbulb', type: 'content', category: 'creative' },
      {
        value: 'scenery',
        label: '风景',
        icon: 'camera',
        type: 'iframe',
        url: 'https://cn.bing.com/images/search?q=%E9%A3%8E%E6%99%AF'
      },
      { value: 'sports', label: '运动', icon: 'trophy', type: 'content', category: 'sports' },
      { value: 'composition', label: '构图', icon: 'ruler', type: 'content', category: 'composition' },
      { value: 'technique', label: '技巧', icon: 'wrench', type: 'content', category: 'technique' }
    ],
    q = async () => {
      try {
        const e = await Qe.getList();
        Array.isArray(e) && e.length > 0 ? (d.value = e) : (d.value = R);
      } catch (e) {
        (console.warn('获取动态频道配置失败，使用默认配置', e), (d.value = R));
      } finally {
        C();
      }
    };
  (P(y, () => {
    d.value.length !== 0 && C();
  }),
    P(
      () => Q.path,
      e => {
        const t = {
          '/': 'featured',
          '/recommend': 'recommend',
          '/nearby': 'nearby',
          '/following': 'following',
          '/friends': 'friends',
          '/mine': 'mine'
        }[e];
        (t && t !== i.value && (i.value = t), e === '/' && d.value.length > 0 && C());
      }
    ),
    P(i, (e, o) => {
      d.value.length === 0 || e === o || (e !== 'featured' && ((g.value = []), C()));
    }),
    $e(async () => {
      (await q(),
        await $(),
        pe()
          .then(n => {
            n && (U.value = { lat: n.lat, lng: n.lng });
          })
          .catch(() => {}));
      const e = () => {
        E.value = window.innerWidth;
      };
      window.addEventListener('resize', e, { passive: !0 });
      const o = 62,
        t = () => {
          ((H.value = window.scrollY > 100), i.value === 'featured' && (S.value = window.scrollY > o));
        };
      (window.addEventListener('scroll', t, { passive: !0 }),
        P(i, n => {
          n !== 'featured' ? (S.value = !1) : (S.value = window.scrollY > o);
        }),
        (window.__cleanupHome = () => {
          (window.removeEventListener('resize', e), window.removeEventListener('scroll', t));
        }));
    }),
    Re(() => {
      window.__cleanupHome && window.__cleanupHome();
    }));
  const K = {
    themeStore: G,
    authStore: a,
    windowWidth: E,
    isMobile: M,
    sidebarOpen: J,
    showNavSearch: S,
    showBackToTop: H,
    searchQuery: T,
    searchFocused: z,
    activeNav: i,
    activeChannel: y,
    searchStickyHeader: X,
    searchSentinel: Z,
    showTemplate: ee,
    showSettingsModal: te,
    showAboutModal: ae,
    settingsActiveSection: ne,
    saveLoginInfo: oe,
    isVip: se,
    followingCount: le,
    followersCount: re,
    worksCount: ie,
    likesCount: ce,
    mutualCount: ue,
    templatesCount: fe,
    recommendationsCount: ge,
    collectsCount: de,
    userProfile: ve,
    fetchUserProfile: $,
    fetchMyStats: Fe,
    updateUserProfile: De,
    toastMsg: b,
    showToast: k,
    channels: d,
    currentChannel: v,
    currentChannelUrl: me,
    currentChannelShowBanner: ye,
    currentCategoryFilter: ke,
    getNavTitle: Ce,
    filteredItems: Se,
    formatLikes: be,
    handleStartCreate: Le,
    openDetail: _e,
    handleLike: Ae,
    handleCollect: Pe,
    toggleProfileModal: Ee,
    onSearchBlur: Te,
    goToSearch: ze,
    scrollToTop: Ie,
    hasMore: h,
    loading: p,
    refreshData: C,
    loadMore: We,
    loadChannels: q,
    searchSuggestions: we,
    activeBanners: g
  };
  return (Ye(j, K), K);
}
export { Ze as u };
