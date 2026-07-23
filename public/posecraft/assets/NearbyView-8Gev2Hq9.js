import { u as v } from './useHome-R4pP8npN.js';
import { S as C, P as b } from './SkeletonCard-DNRU_iEi.js';
import { L as g } from './loader-circle-BU5vGQ8h.js';
import { M as h } from './map-pin-CeIDkRSF.js';
import {
  d as L,
  L as N,
  c as t,
  b as n,
  f as e,
  F as l,
  r as m,
  z as p,
  y as x,
  t as V,
  e as _,
  o
} from './index-C531BqZY.js';
import { _ as w } from './_plugin-vue_export-helper-DTPmx0_K.js';
import './work-CSZq0nvF.js';
import './useLocation-BzKEbus-.js';
const B = { class: 'nearby-page-container' },
  M = { class: 'content-container' },
  z = { key: 0, class: 'waterfall-grid' },
  P = { class: 'waterfall-grid' },
  S = { key: 0, class: 'load-more-container' },
  D = ['disabled'],
  F = { key: 1, class: 'load-more-container' },
  I = { key: 2, class: 'empty-state' },
  A = L({
    __name: 'NearbyView',
    setup(E) {
      const {
        activeNav: d,
        filteredItems: i,
        hasMore: k,
        loading: r,
        loadMore: c,
        openDetail: y,
        handleLike: u,
        handleCollect: f
      } = v();
      return (
        (d.value = 'nearby'),
        N(() => {
          d.value = 'nearby';
        }),
        (H, a) => (
          o(),
          t('div', B, [
            n('div', M, [
              e(r) && e(i).length === 0
                ? (o(),
                  t('div', z, [
                    (o(),
                    t(
                      l,
                      null,
                      m(8, s => _(C, { key: s })),
                      64
                    ))
                  ]))
                : e(i).length > 0
                  ? (o(),
                    t(
                      l,
                      { key: 1 },
                      [
                        n('div', P, [
                          (o(!0),
                          t(
                            l,
                            null,
                            m(
                              e(i),
                              s => (
                                o(),
                                p(
                                  b,
                                  { key: s._key ?? s.id, item: s, onClick: e(y), onLike: e(u), onCollect: e(f) },
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
                          ? (o(),
                            t('div', S, [
                              n(
                                'button',
                                {
                                  class: 'load-more-btn',
                                  onClick: a[0] || (a[0] = (...s) => e(c) && e(c)(...s)),
                                  disabled: e(r)
                                },
                                [
                                  e(r) ? (o(), p(e(g), { key: 0, class: 'animate-spin', size: 16 })) : x('', !0),
                                  n('span', null, V(e(r) ? '加载中...' : '加载更多'), 1)
                                ],
                                8,
                                D
                              )
                            ]))
                          : (o(),
                            t('div', F, [
                              ...(a[1] || (a[1] = [n('span', { class: 'no-more-text' }, '已加载全部附近创作', -1)]))
                            ]))
                      ],
                      64
                    ))
                  : (o(),
                    t('div', I, [
                      _(e(h), { class: 'empty-icon', size: 54 }),
                      a[2] || (a[2] = n('div', { class: 'empty-text' }, '附近暂时没有发布的创作', -1))
                    ]))
            ])
          ])
        )
      );
    }
  }),
  T = w(A, [['__scopeId', 'data-v-88481fa4']]);
export { T as default };
