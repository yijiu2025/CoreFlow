const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f ||
    (m.f = [
      'assets/SettingsModal-B158CpRX.js',
      'assets/Icon.vue_vue_type_script_setup_true_lang-D-OxR9Ey.js',
      'assets/loader-circle-BU5vGQ8h.js',
      'assets/_plugin-vue_export-helper-DTPmx0_K.js',
      'assets/index-C531BqZY.js',
      'assets/index-kHUfwutH.css',
      'assets/x-dxW7U81h.js',
      'assets/triangle-alert-htK-bCwW.js',
      'assets/user-Cti-8Le8.js',
      'assets/search-oUkp4cYT.js',
      'assets/wrench-CXNTiZy0.js',
      'assets/message-circle-C3r4ZyRP.js',
      'assets/aperture-CMAIhw8p.js',
      'assets/users-BaaIlyJv.js',
      'assets/heart-DQGPeVSk.js',
      'assets/map-pin-CeIDkRSF.js',
      'assets/sparkles-CSDhrUXU.js',
      'assets/camera-nl1SqI33.js',
      'assets/SettingsModal-SvLx07g7.css',
      'assets/AboutModal-CErjBX2-.js',
      'assets/AboutModal-D0D3pBOm.css'
    ])
) => i.map(i => d[i]);
import {
  d as U,
  u as ss,
  a as O,
  c as d,
  n as S,
  b as s,
  e as a,
  f as e,
  t as p,
  m as V,
  g as q,
  h as ts,
  o as i,
  i as es,
  j as C,
  F as B,
  r as z,
  w as I,
  v as hs,
  k as os,
  l as F,
  p as ws,
  q as bs,
  s as E,
  x as G,
  y as L,
  z as A,
  A as ks,
  B as fs,
  C as j,
  D as H,
  E as Cs,
  G as R,
  H as Y,
  I as ys,
  K as $s,
  J as X,
  _ as Z
} from './index-C531BqZY.js';
import { u as ns } from './useHome-R4pP8npN.js';
import {
  G as Ss,
  S as Ms,
  W as Ts,
  K as xs,
  C as Bs,
  H as zs,
  I as Ls,
  P as As,
  a as Is,
  b as Ps,
  c as Hs,
  B as Os,
  F as Vs
} from './wrench-CXNTiZy0.js';
import { S as _ } from './sparkles-CSDhrUXU.js';
import { M as Fs } from './map-pin-CeIDkRSF.js';
import { H as is } from './heart-DQGPeVSk.js';
import { U as Us } from './users-BaaIlyJv.js';
import { U as Ns, B as Ws, S as Qs } from './user-Cti-8Le8.js';
import { c as Ds, _ as N } from './_plugin-vue_export-helper-DTPmx0_K.js';
import './work-CSZq0nvF.js';
import './useLocation-BzKEbus-.js';
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const Es = Ds('contrast', [
    ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
    ['path', { d: 'M12 18a6 6 0 0 0 0-12v12z', key: 'j4l70d' }]
  ]),
  js = { class: 'sidebar-top' },
  Rs = { class: 'sidebar-menu' },
  Gs = { class: 'menu-group' },
  qs = { class: 'menu-group' },
  Ks = { class: 'sidebar-bottom' },
  Js = { class: 'bottom-menu-wrapper' },
  Ys = { class: 'bottom-item' },
  Xs = { class: 'hover-dropdown-menu' },
  Zs = { class: 'bottom-menu-wrapper' },
  _s = { class: 'bottom-item' },
  st = { class: 'hover-dropdown-menu' },
  tt = U({
    __name: 'Sidebar',
    props: V(
      { isMobile: { type: Boolean } },
      { sidebarOpen: { type: Boolean, required: !0 }, sidebarOpenModifiers: {} }
    ),
    emits: V(['showToast'], ['update:sidebarOpen']),
    setup(m) {
      const y = q(),
        M = ts(),
        n = ss(),
        { showSettingsModal: T, settingsActiveSection: x, showAboutModal: g } = ns(),
        b = l => {
          ((x.value = l), (T.value = !0));
        },
        k = O(m, 'sidebarOpen'),
        f = l => (l === '/' ? M.path === '/' : M.path.startsWith(l)),
        v = l => {
          y.push(l);
        },
        h = () => {
          y.push('/');
        };
      return (l, t) => (
        i(),
        d(
          'aside',
          { class: S(['side-bar', { open: k.value && m.isMobile }]) },
          [
            s('div', js, [
              s('div', { class: 'brand-header', onClick: h }, [
                ...(t[14] || (t[14] = [s('div', { class: 'brand-logo' }, 'PoseCraft', -1)]))
              ]),
              s('nav', Rs, [
                s('div', Gs, [
                  t[18] || (t[18] = s('span', { class: 'group-title' }, '发现', -1)),
                  s(
                    'button',
                    { onClick: t[0] || (t[0] = r => v('/')), class: S(['menu-item', { active: f('/') }]) },
                    [
                      a(e(Ss), { class: 'menu-icon', size: 18 }),
                      t[15] || (t[15] = s('span', { class: 'menu-label' }, '精选', -1))
                    ],
                    2
                  ),
                  s(
                    'button',
                    {
                      onClick: t[1] || (t[1] = r => v('/recommend')),
                      class: S(['menu-item', { active: f('/recommend') }])
                    },
                    [
                      a(e(_), { class: 'menu-icon', size: 18 }),
                      t[16] || (t[16] = s('span', { class: 'menu-label' }, '推荐', -1))
                    ],
                    2
                  ),
                  s(
                    'button',
                    { onClick: t[2] || (t[2] = r => v('/nearby')), class: S(['menu-item', { active: f('/nearby') }]) },
                    [
                      a(e(Fs), { class: 'menu-icon', size: 18 }),
                      t[17] || (t[17] = s('span', { class: 'menu-label' }, '附近', -1))
                    ],
                    2
                  )
                ]),
                t[23] || (t[23] = s('div', { class: 'menu-divider' }, null, -1)),
                s('div', qs, [
                  t[22] || (t[22] = s('span', { class: 'group-title' }, '社交', -1)),
                  s(
                    'button',
                    {
                      onClick: t[3] || (t[3] = r => v('/following')),
                      class: S(['menu-item', { active: f('/following') }])
                    },
                    [
                      a(e(is), { class: 'menu-icon', size: 18 }),
                      t[19] || (t[19] = s('span', { class: 'menu-label' }, '关注', -1))
                    ],
                    2
                  ),
                  s(
                    'button',
                    {
                      onClick: t[4] || (t[4] = r => v('/friends')),
                      class: S(['menu-item', { active: f('/friends') }])
                    },
                    [
                      a(e(Us), { class: 'menu-icon', size: 18 }),
                      t[20] || (t[20] = s('span', { class: 'menu-label' }, '朋友', -1))
                    ],
                    2
                  ),
                  s(
                    'button',
                    { onClick: t[5] || (t[5] = r => v('/mine')), class: S(['menu-item', { active: f('/mine') }]) },
                    [
                      a(e(Ns), { class: 'menu-icon', size: 18 }),
                      t[21] || (t[21] = s('span', { class: 'menu-label' }, '我的', -1))
                    ],
                    2
                  )
                ])
              ])
            ]),
            s('div', Ks, [
              s('div', Js, [
                s('button', Ys, [
                  a(e(Ms), { class: 'bottom-icon', size: 16 }),
                  t[24] || (t[24] = s('span', null, '设置', -1))
                ]),
                s('div', Xs, [
                  t[30] || (t[30] = s('div', { class: 'dropdown-header' }, '系统设置', -1)),
                  s('button', { class: 'dropdown-item', onClick: t[6] || (t[6] = r => e(n).toggleTheme()) }, [
                    a(e(Es), { class: 'item-icon', size: 16 }),
                    s('span', null, p(e(n).isDark ? '浅色模式' : '深色模式'), 1)
                  ]),
                  s('button', { class: 'dropdown-item', onClick: t[7] || (t[7] = r => b('general')) }, [
                    a(e(Ts), { class: 'item-icon', size: 16 }),
                    t[25] || (t[25] = s('span', null, '通用设置', -1))
                  ]),
                  s('button', { class: 'dropdown-item', onClick: t[8] || (t[8] = r => b('ai')) }, [
                    a(e(Ws), { class: 'item-icon', size: 16 }),
                    t[26] || (t[26] = s('span', null, 'AI设置', -1))
                  ]),
                  s('button', { class: 'dropdown-item', onClick: t[9] || (t[9] = r => b('shortcuts')) }, [
                    a(e(xs), { class: 'item-icon', size: 16 }),
                    t[27] || (t[27] = s('span', null, '键盘快捷键', -1))
                  ]),
                  s('button', { class: 'dropdown-item', onClick: t[10] || (t[10] = r => b('faq')) }, [
                    a(e(Bs), { class: 'item-icon', size: 16 }),
                    t[28] || (t[28] = s('span', null, '常见问题', -1))
                  ]),
                  s(
                    'button',
                    { class: 'dropdown-item', onClick: t[11] || (t[11] = r => l.$emit('showToast', '我的客服')) },
                    [a(e(zs), { class: 'item-icon', size: 16 }), t[29] || (t[29] = s('span', null, '我的客服', -1))]
                  )
                ])
              ]),
              s('div', Zs, [
                s('button', _s, [
                  a(e(Ls), { class: 'bottom-icon', size: 16 }),
                  t[31] || (t[31] = s('span', null, '关于', -1))
                ]),
                s('div', st, [
                  t[34] || (t[34] = s('div', { class: 'dropdown-header' }, '关于我们', -1)),
                  s('button', { class: 'dropdown-item', onClick: t[12] || (t[12] = r => (g.value = !0)) }, [
                    a(e(_), { class: 'item-icon', size: 16 }),
                    t[32] || (t[32] = s('span', null, '关于 PoseCraft', -1))
                  ]),
                  s('button', { class: 'dropdown-item', onClick: t[13] || (t[13] = r => (g.value = !0)) }, [
                    a(e(As), { class: 'item-icon', size: 16 }),
                    t[33] || (t[33] = s('span', null, '联系我们', -1))
                  ])
                ])
              ])
            ])
          ],
          2
        )
      );
    }
  }),
  et = N(tt, [['__scopeId', 'data-v-f2206064']]),
  ot = { class: 'avatar-hover-card' },
  nt = ['src'],
  it = { class: 'card-user-detail' },
  lt = { class: 'card-username' },
  at = { class: 'card-social-stats' },
  rt = { class: 'stat-highlight' },
  dt = { class: 'stat-highlight' },
  ut = { class: 'card-menu-list' },
  vt = { class: 'card-menu-title' },
  ct = { class: 'title-left' },
  pt = { class: 'card-menu-count' },
  mt = { class: 'card-thumbnails-wrapper' },
  gt = { class: 'card-likes-thumbnails' },
  ht = ['src'],
  wt = { class: 'thumb-title' },
  bt = { class: 'card-menu-title' },
  kt = { class: 'title-left' },
  ft = { class: 'card-menu-count' },
  Ct = { class: 'card-thumbnails-wrapper' },
  yt = { class: 'card-likes-thumbnails' },
  $t = ['src'],
  St = { class: 'thumb-title' },
  Mt = { class: 'card-menu-title' },
  Tt = { class: 'title-left' },
  xt = { class: 'card-menu-count' },
  Bt = { class: 'card-thumbnails-wrapper' },
  zt = { class: 'card-likes-thumbnails' },
  Lt = ['src'],
  At = { class: 'thumb-title' },
  It = { class: 'card-menu-title' },
  Pt = { class: 'title-left' },
  Ht = { class: 'card-menu-count' },
  Ot = { class: 'card-thumbnails-wrapper' },
  Vt = { class: 'card-likes-thumbnails' },
  Ft = ['src'],
  Ut = { class: 'thumb-title' },
  Nt = { class: 'card-menu-title' },
  Wt = { class: 'title-left' },
  Qt = { class: 'card-menu-count' },
  Dt = { class: 'card-thumbnails-wrapper' },
  Et = { class: 'card-likes-thumbnails' },
  jt = ['src'],
  Rt = { class: 'thumb-title' },
  Gt = { class: 'card-footer' },
  qt = { class: 'card-save-login' },
  Kt = { class: 'card-switch' },
  Jt = U({
    __name: 'AvatarHoverCard',
    emits: ['showToast'],
    setup(m, { emit: y }) {
      const M = q(),
        n = es(),
        T = os({ get: () => n.saveLoginInfo, set: l => n.updateSaveLoginInfo(l) }),
        x = F([]),
        g = F([]),
        b = y,
        k = () => {
          b('showToast', T.value ? '已开启保存登录信息' : '已关闭保存登录信息');
        },
        f = () => {
          M.push('/mine');
        },
        v = l => {
          M.push({ path: '/mine', query: { tab: l } });
        },
        h = () => {
          (n.logout(), b('showToast', '已退出登录'));
        };
      return (l, t) => {
        var r, $;
        return (
          i(),
          d('div', ot, [
            s('div', { class: 'card-user-info', onClick: f }, [
              s('img', { src: e(n).safeAvatar, alt: 'avatar', class: 'card-avatar' }, null, 8, nt),
              s('div', it, [
                s(
                  'div',
                  lt,
                  p(
                    ((r = e(n).userProfile) == null ? void 0 : r.username) ||
                      (($ = e(n).user) == null ? void 0 : $.username) ||
                      '用户'
                  ),
                  1
                ),
                s('div', at, [
                  s('span', null, [t[8] || (t[8] = C('关注 ', -1)), s('strong', rt, p(e(n).followingCount), 1)]),
                  t[10] || (t[10] = s('span', { class: 'social-divider' }, '|', -1)),
                  s('span', null, [t[9] || (t[9] = C('粉丝 ', -1)), s('strong', dt, p(e(n).followersCount), 1)])
                ])
              ])
            ]),
            s('div', ut, [
              s('div', { class: 'card-menu-group', onClick: t[0] || (t[0] = o => v('likes')) }, [
                s('div', vt, [
                  s('span', ct, [a(e(is), { size: 14 }), t[11] || (t[11] = C(' 我的喜欢', -1))]),
                  s('span', pt, [
                    C(p(e(n).likedWorksCount) + ' ', 1),
                    t[12] ||
                      (t[12] = s(
                        'svg',
                        { class: 'arrow-svg', viewBox: '0 0 24 24', width: '14', height: '14' },
                        [
                          s('path', {
                            fill: 'currentColor',
                            d: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z'
                          })
                        ],
                        -1
                      ))
                  ])
                ]),
                s('div', mt, [
                  s('div', gt, [
                    (i(!0),
                    d(
                      B,
                      null,
                      z(
                        e(n).myLikes.slice(0, 3),
                        o => (
                          i(),
                          d('div', { key: o.id, class: 'thumb-item' }, [
                            s('img', { src: o.thumbnail_url, alt: 'thumb', class: 'thumb-img' }, null, 8, ht),
                            s('span', wt, p(o.title), 1)
                          ])
                        )
                      ),
                      128
                    ))
                  ])
                ])
              ]),
              s('div', { class: 'card-menu-group', onClick: t[1] || (t[1] = o => v('collect')) }, [
                s('div', bt, [
                  s('span', kt, [a(e(Qs), { size: 14 }), t[13] || (t[13] = C(' 我的收藏', -1))]),
                  s('span', ft, [
                    C(p(e(n).collectsCount) + ' ', 1),
                    t[14] ||
                      (t[14] = s(
                        'svg',
                        { class: 'arrow-svg', viewBox: '0 0 24 24', width: '14', height: '14' },
                        [
                          s('path', {
                            fill: 'currentColor',
                            d: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z'
                          })
                        ],
                        -1
                      ))
                  ])
                ]),
                s('div', Ct, [
                  s('div', yt, [
                    (i(!0),
                    d(
                      B,
                      null,
                      z(
                        e(n).myCollects.slice(0, 3),
                        o => (
                          i(),
                          d('div', { key: o.id, class: 'thumb-item' }, [
                            s('img', { src: o.thumbnail_url, alt: 'thumb', class: 'thumb-img' }, null, 8, $t),
                            s('span', St, p(o.title), 1)
                          ])
                        )
                      ),
                      128
                    ))
                  ])
                ])
              ]),
              s('div', { class: 'card-menu-group', onClick: t[2] || (t[2] = o => v('history')) }, [
                s('div', Mt, [
                  s('span', Tt, [a(e(Is), { size: 14 }), t[15] || (t[15] = C(' 观看历史', -1))]),
                  s('span', xt, [
                    C(p(e(n).historyText) + ' ', 1),
                    t[16] ||
                      (t[16] = s(
                        'svg',
                        { class: 'arrow-svg', viewBox: '0 0 24 24', width: '14', height: '14' },
                        [
                          s('path', {
                            fill: 'currentColor',
                            d: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z'
                          })
                        ],
                        -1
                      ))
                  ])
                ]),
                s('div', Bt, [
                  s('div', zt, [
                    (i(!0),
                    d(
                      B,
                      null,
                      z(
                        x.value,
                        o => (
                          i(),
                          d('div', { key: o.id, class: 'thumb-item' }, [
                            s('img', { src: o.thumbnail_url, alt: 'thumb', class: 'thumb-img' }, null, 8, Lt),
                            s('span', At, p(o.title), 1)
                          ])
                        )
                      ),
                      128
                    ))
                  ])
                ])
              ]),
              s('div', { class: 'card-menu-group', onClick: t[3] || (t[3] = o => v('watch-later')) }, [
                s('div', It, [
                  s('span', Pt, [a(e(Ps), { size: 14 }), t[17] || (t[17] = C(' 稍后再看', -1))]),
                  s('span', Ht, [
                    C(p(e(n).watchLaterCount) + ' ', 1),
                    t[18] ||
                      (t[18] = s(
                        'svg',
                        { class: 'arrow-svg', viewBox: '0 0 24 24', width: '14', height: '14' },
                        [
                          s('path', {
                            fill: 'currentColor',
                            d: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z'
                          })
                        ],
                        -1
                      ))
                  ])
                ]),
                s('div', Ot, [
                  s('div', Vt, [
                    (i(!0),
                    d(
                      B,
                      null,
                      z(
                        g.value,
                        o => (
                          i(),
                          d('div', { key: o.id, class: 'thumb-item' }, [
                            s('img', { src: o.thumbnail_url, alt: 'thumb', class: 'thumb-img' }, null, 8, Ft),
                            s('span', Ut, p(o.title), 1)
                          ])
                        )
                      ),
                      128
                    ))
                  ])
                ])
              ]),
              s('div', { class: 'card-menu-group', onClick: t[4] || (t[4] = o => v('works')) }, [
                s('div', Nt, [
                  s('span', Wt, [a(e(Hs), { size: 14 }), t[19] || (t[19] = C(' 我的作品', -1))]),
                  s('span', Qt, [
                    C(p(e(n).worksCount || 14) + ' ', 1),
                    t[20] ||
                      (t[20] = s(
                        'svg',
                        { class: 'arrow-svg', viewBox: '0 0 24 24', width: '14', height: '14' },
                        [
                          s('path', {
                            fill: 'currentColor',
                            d: 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z'
                          })
                        ],
                        -1
                      ))
                  ])
                ]),
                s('div', Dt, [
                  s('div', Et, [
                    (i(!0),
                    d(
                      B,
                      null,
                      z(
                        e(n).myWorks.slice(0, 3),
                        o => (
                          i(),
                          d('div', { key: o.id, class: 'thumb-item' }, [
                            s('img', { src: o.thumbnail_url, alt: 'thumb', class: 'thumb-img' }, null, 8, jt),
                            s('span', Rt, p(o.title), 1)
                          ])
                        )
                      ),
                      128
                    ))
                  ])
                ])
              ]),
              s('div', { class: 'card-menu-item', onClick: t[5] || (t[5] = o => l.$emit('showToast', '我的预约')) }, [
                a(e(Os), { class: 'menu-icon', size: 15 }),
                t[21] || (t[21] = s('span', null, '我的预约', -1))
              ]),
              s('div', { class: 'card-menu-item', onClick: t[6] || (t[6] = o => l.$emit('showToast', '我的订单')) }, [
                a(e(Vs), { class: 'menu-icon', size: 15 }),
                t[22] || (t[22] = s('span', null, '我的订单', -1))
              ])
            ]),
            s('div', Gt, [
              s('button', { class: 'btn-card-logout', onClick: h }, [
                ...(t[23] ||
                  (t[23] = [
                    s(
                      'svg',
                      {
                        class: 'logout-icon',
                        viewBox: '0 0 24 24',
                        width: '16',
                        height: '16',
                        fill: 'none',
                        stroke: 'currentColor',
                        'stroke-width': '2'
                      },
                      [s('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' })],
                      -1
                    ),
                    s('span', null, '退出登录', -1)
                  ]))
              ]),
              s('div', qt, [
                t[25] || (t[25] = s('span', null, '保存登录信息', -1)),
                s('label', Kt, [
                  I(
                    s(
                      'input',
                      { type: 'checkbox', 'onUpdate:modelValue': t[7] || (t[7] = o => (T.value = o)), onChange: k },
                      null,
                      544
                    ),
                    [[hs, T.value]]
                  ),
                  t[24] || (t[24] = s('span', { class: 'card-slider' }, null, -1))
                ])
              ])
            ])
          ])
        );
      };
    }
  }),
  Yt = N(Jt, [['__scopeId', 'data-v-8474ca49']]),
  Xt = { class: 'nav-left' },
  Zt = { class: 'search-bar-right' },
  _t = { key: 1, class: 'search-kbd' },
  se = { class: 'nav-suggestions-panel' },
  te = { class: 'suggest-panel-header' },
  ee = { class: 'suggest-list' },
  oe = ['onMousedown'],
  ne = ['innerHTML'],
  ie = { class: 'nav-right' },
  le = { key: 0, class: 'vip-badge-outline' },
  ae = { class: 'avatar-wrapper' },
  re = ['src'],
  de = { key: 1 },
  ue = U({
    __name: 'TopNav',
    props: V(
      {
        pageTitle: {},
        showNavSearch: { type: Boolean },
        transparentTop: { type: Boolean },
        windowWidth: {},
        isVip: { type: Boolean },
        searchSuggestions: {}
      },
      {
        sidebarOpen: { type: Boolean, required: !0 },
        sidebarOpenModifiers: {},
        searchFocused: { type: Boolean, default: !1 },
        searchFocusedModifiers: {},
        searchQuery: { required: !0 },
        searchQueryModifiers: {}
      }
    ),
    emits: V(
      ['showToast', 'handleStartCreate', 'toggleProfileModal', 'goToSearch'],
      ['update:sidebarOpen', 'update:searchFocused', 'update:searchQuery']
    ),
    setup(m, { emit: y }) {
      const M = q(),
        n = es(),
        T = () => {
          M.push('/mine');
        },
        x = O(m, 'sidebarOpen');
      O(m, 'searchFocused');
      const g = O(m, 'searchQuery'),
        b = y,
        k = F(!1),
        f = () => {
          setTimeout(() => {
            k.value = !1;
          }, 150);
        },
        v = (l, t) => {
          if (!t || !t.trim()) return `<span>${l}</span>`;
          const r = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $ = new RegExp(`(${r})`, 'gi');
          return l.replace($, '<span class="highlight">$1</span>');
        },
        h = () => {
          b('goToSearch');
        };
      return (l, t) => {
        var r, $, o;
        return (
          i(),
          d(
            'header',
            { class: 'top-nav', style: ws(m.transparentTop ? { background: 'transparent', boxShadow: 'none' } : {}) },
            [
              s('div', Xt, [
                s(
                  'button',
                  { class: 'sidebar-toggle-btn', onClick: t[0] || (t[0] = c => (x.value = !x.value)), title: '菜单' },
                  [
                    ...(t[10] ||
                      (t[10] = [
                        s(
                          'svg',
                          {
                            width: '22',
                            height: '22',
                            viewBox: '0 0 24 24',
                            fill: 'none',
                            stroke: 'currentColor',
                            'stroke-width': '2.2',
                            'stroke-linecap': 'round'
                          },
                          [
                            s('line', { x1: '3', y1: '6', x2: '21', y2: '6' }),
                            s('line', { x1: '3', y1: '12', x2: '21', y2: '12' }),
                            s('line', { x1: '3', y1: '18', x2: '21', y2: '18' })
                          ],
                          -1
                        )
                      ]))
                  ]
                )
              ]),
              s(
                'div',
                { class: S(['nav-search-inline', { visible: m.showNavSearch && m.windowWidth >= 760 }]) },
                [
                  s(
                    'div',
                    { class: S(['inline-search-bar', { 'is-focused': k.value }]) },
                    [
                      t[12] ||
                        (t[12] = s(
                          'div',
                          { class: 'search-icon-wrap' },
                          [
                            s(
                              'svg',
                              {
                                width: '15',
                                height: '15',
                                viewBox: '0 0 24 24',
                                fill: 'none',
                                stroke: 'currentColor',
                                'stroke-width': '2.5',
                                'stroke-linecap': 'round'
                              },
                              [
                                s('circle', { cx: '11', cy: '11', r: '8' }),
                                s('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
                              ]
                            )
                          ],
                          -1
                        )),
                      I(
                        s(
                          'input',
                          {
                            'onUpdate:modelValue': t[1] || (t[1] = c => (g.value = c)),
                            type: 'text',
                            placeholder: '搜索姿势、构图、技法...',
                            class: 'inline-search-input',
                            onFocus: t[2] || (t[2] = c => (k.value = !0)),
                            onBlur: f
                          },
                          null,
                          544
                        ),
                        [[bs, g.value]]
                      ),
                      s('div', Zt, [
                        g.value
                          ? (i(),
                            d(
                              'button',
                              {
                                key: 0,
                                class: 'search-clear-btn',
                                onMousedown: t[3] || (t[3] = E(c => (g.value = ''), ['prevent'])),
                                title: '清除'
                              },
                              [
                                ...(t[11] ||
                                  (t[11] = [
                                    s(
                                      'svg',
                                      {
                                        width: '12',
                                        height: '12',
                                        viewBox: '0 0 24 24',
                                        fill: 'none',
                                        stroke: 'currentColor',
                                        'stroke-width': '2.8',
                                        'stroke-linecap': 'round'
                                      },
                                      [
                                        s('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
                                        s('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
                                      ],
                                      -1
                                    )
                                  ]))
                              ],
                              32
                            ))
                          : (i(), d('kbd', _t, '/'))
                      ]),
                      t[13] ||
                        (t[13] = s(
                          'button',
                          { class: 'inline-search-btn' },
                          [
                            s(
                              'svg',
                              {
                                width: '14',
                                height: '14',
                                viewBox: '0 0 24 24',
                                fill: 'none',
                                stroke: 'currentColor',
                                'stroke-width': '2.5',
                                'stroke-linecap': 'round'
                              },
                              [
                                s('circle', { cx: '11', cy: '11', r: '8' }),
                                s('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
                              ]
                            )
                          ],
                          -1
                        ))
                    ],
                    2
                  ),
                  I(
                    s(
                      'div',
                      se,
                      [
                        s('div', te, [
                          t[14] || (t[14] = s('span', { class: 'suggest-label' }, '猜你想搜', -1)),
                          s(
                            'span',
                            {
                              class: 'suggest-close',
                              onMousedown: t[4] || (t[4] = E(c => (k.value = !1), ['prevent']))
                            },
                            '收起',
                            32
                          )
                        ]),
                        s('div', ee, [
                          (i(!0),
                          d(
                            B,
                            null,
                            z(
                              m.searchSuggestions.slice(0, 8),
                              c => (
                                i(),
                                d(
                                  'button',
                                  {
                                    key: c,
                                    class: 'suggest-list-item',
                                    onMousedown: E(
                                      ls => {
                                        ((g.value = c), (k.value = !1));
                                      },
                                      ['prevent']
                                    )
                                  },
                                  [
                                    t[15] ||
                                      (t[15] = s(
                                        'svg',
                                        {
                                          class: 'suggest-item-icon',
                                          width: '13',
                                          height: '13',
                                          viewBox: '0 0 24 24',
                                          fill: 'none',
                                          stroke: 'currentColor',
                                          'stroke-width': '2',
                                          'stroke-linecap': 'round'
                                        },
                                        [
                                          s('circle', { cx: '11', cy: '11', r: '8' }),
                                          s('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
                                        ],
                                        -1
                                      )),
                                    s('span', { innerHTML: v(c, g.value) }, null, 8, ne)
                                  ],
                                  40,
                                  oe
                                )
                              )
                            ),
                            128
                          ))
                        ])
                      ],
                      512
                    ),
                    [[G, k.value]]
                  )
                ],
                2
              ),
              s('div', ie, [
                I(
                  s(
                    'button',
                    { class: 'nav-action-btn nav-search-mobile', onClick: h, title: '搜索' },
                    [
                      ...(t[16] ||
                        (t[16] = [
                          s(
                            'svg',
                            {
                              width: '18',
                              height: '18',
                              viewBox: '0 0 24 24',
                              fill: 'none',
                              stroke: 'currentColor',
                              'stroke-width': '2.5'
                            },
                            [
                              s('circle', { cx: '11', cy: '11', r: '8' }),
                              s('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
                            ],
                            -1
                          )
                        ]))
                    ],
                    512
                  ),
                  [[G, m.windowWidth < 760 && m.showNavSearch]]
                ),
                e(n).isLoggedIn && m.isVip
                  ? (i(),
                    d('div', le, [
                      ...(t[17] ||
                        (t[17] = [
                          s(
                            'svg',
                            {
                              class: 'vip-svg',
                              width: '13',
                              height: '13',
                              viewBox: '0 0 24 24',
                              fill: 'none',
                              stroke: 'currentColor',
                              'stroke-width': '2.2',
                              'stroke-linecap': 'round',
                              'stroke-linejoin': 'round'
                            },
                            [s('path', { d: 'M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z' }), s('path', { d: 'M3 20h18' })],
                            -1
                          ),
                          s('span', { class: 'vip-text' }, 'VIP 会员', -1)
                        ]))
                    ]))
                  : L('', !0),
                s(
                  'button',
                  {
                    class: 'nav-action-btn',
                    onClick: t[5] || (t[5] = c => l.$emit('showToast', '通知中心')),
                    title: '通知'
                  },
                  [
                    ...(t[18] ||
                      (t[18] = [
                        s(
                          'svg',
                          {
                            class: 'nav-svg-icon',
                            width: '20',
                            height: '20',
                            viewBox: '0 0 24 24',
                            fill: 'none',
                            stroke: 'currentColor',
                            'stroke-width': '2',
                            'stroke-linecap': 'round',
                            'stroke-linejoin': 'round'
                          },
                          [
                            s('path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }),
                            s('path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' })
                          ],
                          -1
                        ),
                        s('span', { class: 'badge-dot' }, null, -1)
                      ]))
                  ]
                ),
                s(
                  'button',
                  {
                    class: 'nav-action-btn',
                    onClick: t[6] || (t[6] = c => l.$emit('showToast', '私信列表')),
                    title: '私信'
                  },
                  [
                    ...(t[19] ||
                      (t[19] = [
                        s(
                          'svg',
                          {
                            class: 'nav-svg-icon',
                            width: '20',
                            height: '20',
                            viewBox: '0 0 24 24',
                            fill: 'none',
                            stroke: 'currentColor',
                            'stroke-width': '2',
                            'stroke-linecap': 'round',
                            'stroke-linejoin': 'round'
                          },
                          [s('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })],
                          -1
                        )
                      ]))
                  ]
                ),
                s('button', { class: 'btn-upload', onClick: t[7] || (t[7] = c => l.$emit('handleStartCreate')) }, [
                  ...(t[20] ||
                    (t[20] = [
                      s(
                        'svg',
                        {
                          class: 'upload-svg',
                          width: '16',
                          height: '16',
                          viewBox: '0 0 24 24',
                          fill: 'none',
                          stroke: 'currentColor',
                          'stroke-width': '2.5',
                          'stroke-linecap': 'round',
                          'stroke-linejoin': 'round'
                        },
                        [
                          s('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
                          s('polyline', { points: '17 8 12 3 7 8' }),
                          s('line', { x1: '12', y1: '3', x2: '12', y2: '15' })
                        ],
                        -1
                      ),
                      s('span', null, '投稿', -1)
                    ]))
                ]),
                s('div', ae, [
                  e(n).isLoggedIn
                    ? (i(),
                      d('div', { key: 0, class: 'user-avatar-btn', onClick: T }, [
                        (r = e(n).userProfile) != null && r.avatar
                          ? (i(),
                            d(
                              'img',
                              { key: 0, src: e(n).userProfile.avatar, alt: 'avatar', class: 'user-avatar-img' },
                              null,
                              8,
                              re
                            ))
                          : (i(),
                            d(
                              'span',
                              de,
                              p(
                                (
                                  (($ = e(n).userProfile) == null ? void 0 : $.username) ||
                                  ((o = e(n).user) == null ? void 0 : o.username) ||
                                  'U'
                                )
                                  .charAt(0)
                                  .toUpperCase()
                              ),
                              1
                            ))
                      ]))
                    : (i(),
                      d(
                        'div',
                        {
                          key: 1,
                          class: 'user-avatar-btn guest',
                          onClick: t[8] || (t[8] = c => l.$emit('toggleProfileModal'))
                        },
                        ' ? '
                      )),
                  e(n).isLoggedIn
                    ? (i(), A(Yt, { key: 2, onShowToast: t[9] || (t[9] = c => l.$emit('showToast', c)) }))
                    : L('', !0)
                ])
              ])
            ],
            4
          )
        );
      };
    }
  }),
  ve = N(ue, [['__scopeId', 'data-v-bd121eba']]),
  ce = { class: 'main-container' },
  pe = { class: 'main-content-area' },
  me = { class: 'router-wrap' },
  ge = { key: 3, class: 'toast-tip' },
  he = U({
    __name: 'HomeView',
    setup(m) {
      const y = Y(null),
        M = async () => (
          y.value ||
            (y.value = X(() =>
              Z(
                () => import('./SettingsModal-B158CpRX.js'),
                __vite__mapDeps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
              )
            )),
          y.value
        ),
        n = Y(null),
        T = async () => (
          n.value ||
            (n.value = X(() =>
              Z(() => import('./AboutModal-CErjBX2-.js'), __vite__mapDeps([19, 4, 5, 10, 3, 11, 13, 20]))
            )),
          n.value
        ),
        x = ss(),
        g = ts(),
        b = F(!0),
        k = os(() => g.path === '/mine' || g.path.endsWith('/mine')),
        f = () => {
          k.value && (b.value = window.scrollY < 10);
        };
      (ks(() => window.addEventListener('scroll', f, { passive: !0 })),
        fs(() => window.removeEventListener('scroll', f)),
        j(
          () => g.path,
          () => {
            b.value = !0;
          }
        ));
      const {
        isMobile: v,
        sidebarOpen: h,
        showNavSearch: l,
        windowWidth: t,
        searchQuery: r,
        searchFocused: $,
        activeNav: o,
        activeChannel: c,
        searchSentinel: ls,
        showTemplate: we,
        showSettingsModal: W,
        showAboutModal: Q,
        settingsActiveSection: as,
        saveLoginInfo: be,
        isVip: rs,
        followingCount: ke,
        followersCount: fe,
        toastMsg: K,
        showToast: D,
        channels: Ce,
        currentChannelUrl: ye,
        getNavTitle: ds,
        filteredItems: $e,
        handleStartCreate: us,
        openDetail: Se,
        likeItem: Me,
        toggleProfileModal: vs,
        onSearchBlur: Te,
        goToSearch: cs,
        scrollToTop: J,
        hasMore: xe,
        loading: Be,
        loadMore: ze,
        showBackToTop: ps,
        searchSuggestions: ms
      } = ns();
      return (
        j(
          W,
          P => {
            P && M();
          },
          { immediate: !0 }
        ),
        j(
          Q,
          P => {
            P && T();
          },
          { immediate: !0 }
        ),
        (P, u) => {
          const gs = ys('router-view');
          return (
            i(),
            d(
              'div',
              { class: S(['home-layout', { 'dark-mode': e(x).isDark }]) },
              [
                a(
                  et,
                  {
                    sidebarOpen: e(h),
                    'onUpdate:sidebarOpen': u[0] || (u[0] = w => (H(h) ? (h.value = w) : null)),
                    'is-mobile': e(v),
                    onShowToast: e(D)
                  },
                  null,
                  8,
                  ['sidebarOpen', 'is-mobile', 'onShowToast']
                ),
                s('div', ce, [
                  a(
                    ve,
                    {
                      sidebarOpen: e(h),
                      'onUpdate:sidebarOpen': u[1] || (u[1] = w => (H(h) ? (h.value = w) : null)),
                      searchFocused: e($),
                      'onUpdate:searchFocused': u[2] || (u[2] = w => (H($) ? ($.value = w) : null)),
                      searchQuery: e(r),
                      'onUpdate:searchQuery': u[3] || (u[3] = w => (H(r) ? (r.value = w) : null)),
                      'page-title': e(ds)(),
                      'show-nav-search': e(o) === 'featured' ? e(l) : !0,
                      'transparent-top': k.value && b.value,
                      'window-width': e(t),
                      'is-vip': e(rs),
                      'search-suggestions': e(ms),
                      onShowToast: e(D),
                      onHandleStartCreate: e(us),
                      onToggleProfileModal: e(vs),
                      onGoToSearch: e(cs)
                    },
                    null,
                    8,
                    [
                      'sidebarOpen',
                      'searchFocused',
                      'searchQuery',
                      'page-title',
                      'show-nav-search',
                      'transparent-top',
                      'window-width',
                      'is-vip',
                      'search-suggestions',
                      'onShowToast',
                      'onHandleStartCreate',
                      'onToggleProfileModal',
                      'onGoToSearch'
                    ]
                  ),
                  s('main', pe, [
                    s('div', me, [
                      a(gs, null, {
                        default: Cs(({ Component: w }) => [(i(), A($s, null, [(i(), A(R(w)))], 1024))]),
                        _: 1
                      })
                    ])
                  ]),
                  I(
                    s(
                      'button',
                      {
                        class: 'back-to-top-btn',
                        onClick: u[4] || (u[4] = (...w) => e(J) && e(J)(...w)),
                        title: '回到顶部'
                      },
                      [
                        ...(u[8] ||
                          (u[8] = [
                            s(
                              'svg',
                              {
                                width: '20',
                                height: '20',
                                viewBox: '0 0 24 24',
                                fill: 'none',
                                stroke: 'currentColor',
                                'stroke-width': '2.5',
                                'stroke-linecap': 'round',
                                'stroke-linejoin': 'round'
                              },
                              [s('polyline', { points: '18 15 12 9 6 15' })],
                              -1
                            )
                          ]))
                      ],
                      512
                    ),
                    [[G, e(ps)]]
                  )
                ]),
                e(h) && e(v)
                  ? (i(), d('div', { key: 0, class: 'sidebar-overlay', onClick: u[5] || (u[5] = w => (h.value = !1)) }))
                  : L('', !0),
                e(W)
                  ? (i(),
                    A(
                      R(y.value),
                      {
                        key: 1,
                        'active-section': e(as),
                        onClose: u[6] || (u[6] = w => (W.value = !1)),
                        onShowToast: e(D)
                      },
                      null,
                      40,
                      ['active-section', 'onShowToast']
                    ))
                  : L('', !0),
                e(Q)
                  ? (i(), A(R(n.value), { key: 2, onClose: u[7] || (u[7] = w => (Q.value = !1)) }, null, 32))
                  : L('', !0),
                e(K) ? (i(), d('div', ge, [s('span', null, p(e(K)), 1)])) : L('', !0)
              ],
              2
            )
          );
        }
      );
    }
  }),
  Qe = N(he, [['__scopeId', 'data-v-f04ae469']]);
export { Qe as default };
