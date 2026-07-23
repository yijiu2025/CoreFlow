import { u as y } from './useHome-R4pP8npN.js';
import { S as C, P as g } from './SkeletonCard-DNRU_iEi.js';
import { L as h } from './loader-circle-BU5vGQ8h.js';
import { U as L } from './users-BaaIlyJv.js';
import {
  d as b,
  L as x,
  c as o,
  b as n,
  f as e,
  F as l,
  r as m,
  z as p,
  y as V,
  t as w,
  e as _,
  o as s
} from './index-C531BqZY.js';
import { _ as B } from './_plugin-vue_export-helper-DTPmx0_K.js';
import './work-CSZq0nvF.js';
import './useLocation-BzKEbus-.js';
import './map-pin-CeIDkRSF.js';
const F = { class: 'friends-page-container' },
  N = { class: 'content-container' },
  z = { key: 0, class: 'waterfall-grid' },
  S = { class: 'waterfall-grid' },
  D = { key: 0, class: 'load-more-container' },
  I = ['disabled'],
  M = { key: 1, class: 'load-more-container' },
  P = { key: 2, class: 'empty-state' },
  U = b({
    __name: 'FriendsView',
    setup(A) {
      const {
        activeNav: d,
        filteredItems: i,
        hasMore: k,
        loading: r,
        loadMore: c,
        openDetail: f,
        handleLike: u,
        handleCollect: v
      } = y();
      return (
        (d.value = 'friends'),
        x(() => {
          d.value = 'friends';
        }),
        (E, a) => (
          s(),
          o('div', F, [
            n('div', N, [
              e(r) && e(i).length === 0
                ? (s(),
                  o('div', z, [
                    (s(),
                    o(
                      l,
                      null,
                      m(8, t => _(C, { key: t })),
                      64
                    ))
                  ]))
                : e(i).length > 0
                  ? (s(),
                    o(
                      l,
                      { key: 1 },
                      [
                        n('div', S, [
                          (s(!0),
                          o(
                            l,
                            null,
                            m(
                              e(i),
                              t => (
                                s(),
                                p(
                                  g,
                                  { key: t._key ?? t.id, item: t, onClick: e(f), onLike: e(u), onCollect: e(v) },
                                  null,
                                  8,
                                  ['item', 'onClick', 'onLike', 'onCollect']
                                )
                              )
                            ),
                            128
                          ))
                        ]),
                        e(k)
                          ? (s(),
                            o('div', D, [
                              n(
                                'button',
                                {
                                  class: 'load-more-btn',
                                  onClick: a[0] || (a[0] = (...t) => e(c) && e(c)(...t)),
                                  disabled: e(r)
                                },
                                [
                                  e(r) ? (s(), p(e(h), { key: 0, class: 'animate-spin', size: 16 })) : V('', !0),
                                  n('span', null, w(e(r) ? '加载中...' : '加载更多'), 1)
                                ],
                                8,
                                I
                              )
                            ]))
                          : (s(),
                            o('div', M, [
                              ...(a[1] || (a[1] = [n('span', { class: 'no-more-text' }, '已加载全部朋友动态', -1)]))
                            ]))
                      ],
                      64
                    ))
                  : (s(),
                    o('div', P, [
                      _(e(L), { class: 'empty-icon', size: 54 }),
                      a[2] || (a[2] = n('div', { class: 'empty-text' }, '您的朋友们最近很低调，什么都没发', -1))
                    ]))
            ])
          ])
        )
      );
    }
  }),
  T = B(U, [['__scopeId', 'data-v-954ad87a']]);
export { T as default };
