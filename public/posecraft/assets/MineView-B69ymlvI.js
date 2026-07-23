import {
  d as ie,
  c as i,
  n as d,
  F as R,
  r as Y,
  t as c,
  o as n,
  i as ze,
  A as Ae,
  u as Pe,
  C as Fe,
  b as t,
  p as Ue,
  f as l,
  e as g,
  y as C,
  w as U,
  v as je,
  q as X,
  j as Z,
  E as Ee,
  T as He,
  z as We,
  O as qe,
  l as f,
  k as j,
  P as M,
  s as J,
  h as Ne
} from './index-C531BqZY.js';
import { u as Oe } from './useHome-R4pP8npN.js';
import { S as Ge, P as Qe } from './SkeletonCard-DNRU_iEi.js';
import { c as Xe, _ as re } from './_plugin-vue_export-helper-DTPmx0_K.js';
import { userApi as le } from './user-6MceWoQF.js';
import { workApi as oe } from './work-CSZq0nvF.js';
import { templateApi as ne } from './template-C3FhZP8t.js';
import { P as Ze, S as Je, C as Ke } from './search-oUkp4cYT.js';
import { L as K, X as Ye } from './x-dxW7U81h.js';
import { C as et } from './camera-nl1SqI33.js';
import './useLocation-BzKEbus-.js';
import './map-pin-CeIDkRSF.js';
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const tt = Xe('folder', [
    [
      'path',
      {
        d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
        key: '1kt360'
      }
    ]
  ]),
  st = ie({
    __name: 'BioTooltip',
    props: { bioLines: {}, isDark: { type: Boolean } },
    setup(E) {
      return (ee, o) => (
        n(),
        i(
          'div',
          { class: d(['bio-tooltip-card', { 'dark-mode': E.isDark }]) },
          [
            (n(!0),
            i(
              R,
              null,
              Y(E.bioLines, (H, W) => (n(), i('div', { key: W, class: 'bio-tooltip-line' }, c(H), 1))),
              128
            ))
          ],
          2
        )
      );
    }
  }),
  at = re(st, [['__scopeId', 'data-v-7d91f1c0']]),
  lt = { class: 'profile-header-wrapper' },
  ot = { class: 'profile-header-content' },
  nt = { class: 'avatar-wrapper' },
  it = ['src'],
  rt = { class: 'user-info-main' },
  ut = { class: 'user-name-row' },
  dt = { class: 'username' },
  ct = { class: 'stats-row' },
  vt = { class: 'stat-item' },
  pt = { class: 'stat-val' },
  mt = { class: 'stat-item' },
  bt = { class: 'stat-val' },
  ft = { class: 'stat-item' },
  kt = { class: 'stat-val' },
  gt = { class: 'stat-item' },
  yt = { class: 'stat-val' },
  ht = { class: 'meta-info-row' },
  Ct = { key: 0 },
  wt = { class: 'bio-short-text' },
  _t = { class: 'header-right-actions' },
  xt = { class: 'save-login-switch' },
  Mt = { class: 'switch' },
  $t = { class: 'tabs-outer-container' },
  Lt = { class: 'profile-tabs' },
  Tt = { key: 0 },
  Dt = { key: 0 },
  St = { class: 'tab-lock' },
  Bt = { class: 'tabs-right-actions' },
  It = { key: 0, class: 'sub-tabs-container' },
  Rt = { class: 'sub-tabs' },
  Vt = { class: 'sub-lock' },
  zt = { class: 'sub-lock' },
  At = { class: 'sub-right-actions' },
  Pt = { class: 'tab-search-wrapper' },
  Ft = { class: 'date-filter-wrapper' },
  Ut = { key: 0, class: 'date-dropdown-menu' },
  jt = { class: 'content-container' },
  Et = { key: 0, class: 'waterfall-grid' },
  Ht = { key: 1, class: 'waterfall-grid' },
  Wt = ['onClick'],
  qt = { key: 0, class: 'card-checkbox-overlay' },
  Nt = { key: 0, class: 'checkbox-tick' },
  Ot = ['onClick'],
  Gt = ['onClick'],
  Qt = { key: 2, class: 'empty-state' },
  Xt = { class: 'batch-bar-content' },
  Zt = { class: 'batch-info' },
  Jt = { class: 'highlight-count' },
  Kt = { class: 'batch-actions' },
  Yt = ['disabled'],
  es = ['disabled'],
  ts = { class: 'edit-modal-header' },
  ss = { class: 'edit-avatar-section' },
  as = ['src'],
  ls = { key: 0, class: 'avatar-spinner' },
  os = { key: 1, class: 'camera-icon' },
  ns = { class: 'edit-avatar-hint' },
  is = { class: 'edit-form-body' },
  rs = { class: 'edit-field-group' },
  us = { class: 'edit-input-wrapper' },
  ds = { class: 'edit-char-count' },
  cs = { class: 'edit-field-group' },
  vs = { class: 'edit-bio-count' },
  ps = { class: 'edit-modal-footer' },
  ms = ['disabled'],
  bs = ie({
    __name: 'MineView',
    setup(E) {
      const ee = Ne(),
        o = ze(),
        {
          openDetail: H,
          handleLike: W,
          handleCollect: ue,
          showToast: y,
          userProfile: v,
          followingCount: de,
          followersCount: ce,
          likesCount: ve,
          mutualCount: pe,
          fetchUserProfile: fs,
          updateUserProfile: ks,
          activeNav: me,
          loading: be
        } = Oe();
      Ae(async () => {
        ((me.value = 'mine'), await o.fetchMyWorks());
      });
      const V = Pe(),
        r = f('works'),
        p = f('public');
      Fe(
        () => ee.query.tab,
        s => {
          s && typeof s == 'string' && (r.value = s);
        },
        { immediate: !0 }
      );
      const q = j({ get: () => o.saveLoginInfo, set: s => o.updateSaveLoginInfo(s) }),
        z = f(''),
        $ = f('all'),
        te = f('全部时间'),
        L = f(!1),
        h = f(!1),
        u = f([]),
        fe = j(() => {
          var e;
          const s = (e = v.value) == null ? void 0 : e.bio;
          return s
            ? s
                .split(
                  `
`
                )
                .map(a => a.trim())
                .filter(Boolean)
            : [
                '✈️已飞0个国家❗️',
                '梦想是环游世界🌍',
                '中国留子👧',
                '个人存款0.000000千万💵',
                '人生是干饭💤',
                '梦游国家40+ | 我命由我不由天🌚',
                '火锅品鉴师🍪 | 5G冲浪达人🏄',
                'pdd资深买手🛍️ | 草莓🍓狂热粉丝',
                '雅思托福没考📚 清华北大没考📖',
                '国家级证件持有者(身份证)💳'
              ];
        }),
        ke = j(() => {
          var a;
          const s = (a = v.value) == null ? void 0 : a.bio;
          if (!s) return '✈️已飞0个国家❗️ | 梦想是环游世界🌍 | 中国留子...';
          const e = s
            .split(
              `
`
            )
            .map(m => m.trim())
            .filter(Boolean)
            .join(' | ');
          return e.length > 40 ? e.slice(0, 40) + '...' : e;
        }),
        N = f(null),
        ge = s => {
          const e = N.value;
          if (!e) return;
          const a = e.$el;
          if (!a) return;
          const m = s.currentTarget,
            b = m.querySelector('.bio-more'),
            w = b ? b.getBoundingClientRect() : m.getBoundingClientRect();
          ((a.style.left = w.right - 280 + 'px'), (a.style.top = w.bottom + 8 + 'px'), (a.style.display = 'block'));
        },
        ye = () => {
          const s = N.value;
          s && s.$el && (s.$el.style.display = 'none');
        },
        he = () => {
          y(q.value ? '已开启保存登录信息' : '已关闭保存登录信息');
        },
        A = f(!1),
        T = f(!1),
        k = f({ username: '', avatar: '', bio: '' }),
        se = f(null),
        D = f(''),
        S = f(!1),
        Ce = async s => {
          var m;
          const e = s.target,
            a = (m = e.files) == null ? void 0 : m[0];
          if (a) {
            ((D.value = URL.createObjectURL(a)), (S.value = !0));
            try {
              const b = await le.uploadAvatar(a),
                w = (b == null ? void 0 : b.avatar) || b;
              (w && ((k.value.avatar = w), (v.value = { ...v.value, avatar: w })), y('头像上传成功 🎉'));
            } catch (b) {
              ((D.value = ''), y((b == null ? void 0 : b.message) || '头像上传失败，请重试'));
            } finally {
              ((S.value = !1), e && (e.value = ''));
            }
          }
        },
        we = () => {
          ((D.value = ''),
            (k.value = { username: v.value.username || '', avatar: v.value.avatar || '', bio: v.value.bio || '' }),
            (A.value = !0));
        },
        O = () => {
          ((D.value = ''), (A.value = !1));
        },
        _e = async () => {
          T.value = !0;
          try {
            const s = await le.updateProfile({ username: k.value.username, bio: k.value.bio });
            ((v.value = {
              ...v.value,
              username: (s == null ? void 0 : s.username) ?? k.value.username,
              bio: (s == null ? void 0 : s.bio) ?? k.value.bio
            }),
              y('个人资料已保存 ✅'),
              (A.value = !1));
          } catch (s) {
            y((s == null ? void 0 : s.message) || '保存失败，请重试');
          } finally {
            T.value = !1;
          }
        },
        B = M(o, 'myWorks'),
        ae = M(o, 'myTemplates'),
        G = M(o, 'myRecommendations'),
        Q = M(o, 'myLikes'),
        I = M(o, 'myCollects'),
        xe = M(o, 'myHistory'),
        x = s => {
          ((r.value = s),
            F(),
            (p.value = s === 'templates' ? 'all' : 'public'),
            s === 'templates'
              ? o.fetchMyTemplates()
              : s === 'works'
                ? o.fetchMyWorks()
                : s === 'recommend'
                  ? o.fetchMyRecommendations()
                  : s === 'likes'
                    ? o.fetchMyLikes()
                    : s === 'collect'
                      ? o.fetchMyCollects()
                      : s === 'history' && o.fetchMyHistory());
        },
        P = (s, e) => {
          (($.value = s), (te.value = e), (L.value = !1));
        },
        Me = s => {
          if ($.value === 'all') return !0;
          const e = new Date(),
            a = new Date(s),
            m = Math.abs(e.getTime() - a.getTime()),
            b = Math.ceil(m / (1e3 * 60 * 60 * 24));
          return $.value === 'week' ? b <= 7 : $.value === 'month' ? b <= 30 : $.value === 'year' ? b <= 365 : !0;
        },
        $e = () => {
          ((h.value = !h.value), h.value || (u.value = []));
        },
        F = () => {
          ((h.value = !1), (u.value = []));
        },
        Le = s => {
          if (h.value) {
            const e = u.value.indexOf(s.id);
            e > -1 ? u.value.splice(e, 1) : u.value.push(s.id);
          } else H(s);
        },
        Te = () => {
          u.value.length === _.value.length ? (u.value = []) : (u.value = _.value.map(s => s.id));
        },
        De = () => {
          u.value.length &&
            ((B.value = B.value.map(s => (u.value.includes(s.id) ? { ...s, is_private: !s.is_private } : s))),
            y(`成功将选中的 ${u.value.length} 项作品修改了可见性`),
            F());
        },
        Se = async s => {
          if (confirm(`确定要删除「${s.title || '该作品'}」吗？删除后不可恢复。`))
            try {
              const e = Number(s.id);
              (s.type === 'template' || r.value === 'templates'
                ? (await ne.delete(e), (o.templatesCount = Math.max(0, o.templatesCount - 1)))
                : (await oe.delete(e), (o.worksCount = Math.max(0, o.worksCount - 1))),
                Ie(e),
                y('删除成功'));
            } catch (e) {
              y(e.message || '删除失败');
            }
        },
        Be = async s => {
          try {
            (await o.cancelRecommendation({
              workId: s.type === 'work' ? Number(s.target_id) : void 0,
              templateId: s.type === 'template' ? Number(s.target_id) : void 0
            }),
              y('已取消推荐'));
          } catch (e) {
            y(e.message || '取消推荐失败');
          }
        },
        Ie = s => {
          ((B.value = B.value.filter(e => e.id !== s)),
            (G.value = G.value.filter(e => e.target_id !== s)),
            (Q.value = Q.value.filter(e => e.id !== s)),
            (I.value = I.value.filter(e => e.id !== s)),
            (u.value = u.value.filter(e => e !== s)));
        },
        Re = async () => {
          if (!u.value.length) return;
          const s = u.value.length;
          if (!confirm(`确定要删除选中的 ${s} 项内容吗？删除后不可恢复。`)) return;
          let e = 0,
            a = 0;
          try {
            for (const m of u.value) {
              const b = Number(m),
                w = _.value.find(Ve => Number(Ve.id) === b);
              (w == null ? void 0 : w.type) === 'template' || r.value === 'templates'
                ? (await ne.delete(b), a++)
                : (await oe.delete(b).catch(() => {}), e++);
            }
            ((o.worksCount = Math.max(0, o.worksCount - e)),
              (o.templatesCount = Math.max(0, o.templatesCount - a)),
              y(`已成功删除选中的 ${s} 项内容`),
              F());
          } catch (m) {
            y(m.message || '删除失败');
          }
        },
        _ = j(() => {
          let s = [];
          if (r.value === 'works') {
            const e = B.value.filter(a => a.type !== 'template' && !a.is_template_work);
            (p.value === 'public'
              ? (s = e.filter(a => a.status === 1))
              : p.value === 'private'
                ? (s = e.filter(a => a.status === 0))
                : p.value === 'collection' && (s = I.value.filter(a => a.work_id)),
              (s = s.filter(a => Me(a.created_at))));
          } else
            r.value === 'templates'
              ? p.value === 'all'
                ? (s = ae.value)
                : p.value === 'private'
                  ? (s = ae.value.filter(e => e.status === 0))
                  : p.value === 'collected' && (s = I.value.filter(e => e.template_id))
              : r.value === 'recommend'
                ? (s = G.value)
                : r.value === 'likes'
                  ? (s = Q.value)
                  : r.value === 'collect'
                    ? (s = I.value)
                    : r.value === 'history' && (s = xe.value);
          if (z.value.trim()) {
            const e = z.value.toLowerCase();
            s = s.filter(
              a =>
                (a.title && a.title.toLowerCase().includes(e)) ||
                (a.description && a.description.toLowerCase().includes(e))
            );
          }
          return s;
        });
      return (s, e) => (
        n(),
        i(
          'div',
          { class: d(['mine-page-container', { 'dark-mode': l(V).isDark }]) },
          [
            t('div', lt, [
              t(
                'div',
                {
                  class: 'profile-bg-cover',
                  style: Ue({
                    backgroundImage: `${l(V).isDark ? 'linear-gradient(to left, rgba(18, 18, 20, 0) 10%, rgba(18, 18, 20, 1) 90%)' : 'linear-gradient(to left, rgba(255, 255, 255, 0) 10%, rgba(255, 255, 255, 1) 90%)'}, url(${l(o).safeAvatar})`
                  })
                },
                null,
                4
              ),
              t('div', ot, [
                t('div', nt, [t('img', { src: l(o).safeAvatar, alt: 'avatar', class: 'user-avatar' }, null, 8, it)]),
                t('div', rt, [
                  t('div', ut, [
                    t('h1', dt, c(l(v).username || '摄影小王'), 1),
                    t('span', { class: 'edit-icon', onClick: we }, [g(l(Ze), { size: 16 })])
                  ]),
                  t('div', ct, [
                    t('div', vt, [
                      e[23] || (e[23] = t('span', { class: 'stat-label' }, '关注', -1)),
                      t('span', pt, c(l(de)), 1)
                    ]),
                    t('div', mt, [
                      e[24] || (e[24] = t('span', { class: 'stat-label' }, '粉丝', -1)),
                      t('span', bt, c(l(ce)), 1)
                    ]),
                    t('div', ft, [
                      e[25] || (e[25] = t('span', { class: 'stat-label' }, '互关', -1)),
                      t('span', kt, c(l(pe)), 1)
                    ]),
                    t('div', gt, [
                      e[26] || (e[26] = t('span', { class: 'stat-label' }, '获赞', -1)),
                      t('span', yt, c(l(ve)), 1)
                    ])
                  ]),
                  t('div', ht, [
                    t('span', null, 'ID: ' + c(l(v).personal_id || l(v).id || '未知ID'), 1),
                    l(v).gender || l(v).age
                      ? (n(),
                        i(
                          'span',
                          Ct,
                          c(l(v).gender === 1 ? '♂️' : l(v).gender === 2 ? '♀️' : '') +
                            ' ' +
                            c(l(v).age ? l(v).age + '岁' : ''),
                          1
                        ))
                      : C('', !0),
                    t('span', null, c(l(v).city || '北京 · 朝阳'), 1)
                  ]),
                  t(
                    'div',
                    { class: 'bio-row', onMouseenter: ge, onMouseleave: ye },
                    [t('span', wt, c(ke.value), 1), e[27] || (e[27] = t('span', { class: 'bio-more' }, '更多', -1))],
                    32
                  )
                ]),
                t('div', _t, [
                  t('div', xt, [
                    e[29] || (e[29] = t('span', null, '保存登录信息', -1)),
                    t('label', Mt, [
                      U(
                        t(
                          'input',
                          {
                            type: 'checkbox',
                            'onUpdate:modelValue': e[0] || (e[0] = a => (q.value = a)),
                            onChange: he
                          },
                          null,
                          544
                        ),
                        [[je, q.value]]
                      ),
                      e[28] || (e[28] = t('span', { class: 'slider' }, null, -1))
                    ])
                  ])
                ])
              ])
            ]),
            t('div', $t, [
              t('div', Lt, [
                t(
                  'button',
                  { onClick: e[1] || (e[1] = a => x('works')), class: d(['tab-btn', { active: r.value === 'works' }]) },
                  [
                    e[30] || (e[30] = t('span', null, '作品', -1)),
                    l(o).worksCount > 0 ? (n(), i('span', Tt, c(l(o).worksCount), 1)) : C('', !0)
                  ],
                  2
                ),
                t(
                  'button',
                  {
                    onClick: e[2] || (e[2] = a => x('templates')),
                    class: d(['tab-btn', { active: r.value === 'templates' }])
                  },
                  [
                    e[31] || (e[31] = t('span', null, '模板', -1)),
                    l(o).templatesCount > 0 ? (n(), i('span', Dt, c(l(o).templatesCount), 1)) : C('', !0)
                  ],
                  2
                ),
                t(
                  'button',
                  {
                    onClick: e[3] || (e[3] = a => x('recommend')),
                    class: d(['tab-btn', { active: r.value === 'recommend' }])
                  },
                  [...(e[32] || (e[32] = [t('span', null, '推荐', -1)]))],
                  2
                ),
                t(
                  'button',
                  { onClick: e[4] || (e[4] = a => x('likes')), class: d(['tab-btn', { active: r.value === 'likes' }]) },
                  [...(e[33] || (e[33] = [t('span', null, '喜欢', -1)]))],
                  2
                ),
                t(
                  'button',
                  {
                    onClick: e[5] || (e[5] = a => x('collect')),
                    class: d(['tab-btn', { active: r.value === 'collect' }])
                  },
                  [...(e[34] || (e[34] = [t('span', null, '收藏', -1)]))],
                  2
                ),
                t(
                  'button',
                  {
                    onClick: e[6] || (e[6] = a => x('history')),
                    class: d(['tab-btn', { active: r.value === 'history' }])
                  },
                  [...(e[35] || (e[35] = [t('span', null, '观看历史', -1)]))],
                  2
                ),
                t(
                  'button',
                  {
                    onClick: e[7] || (e[7] = a => x('watch-later')),
                    class: d(['tab-btn', { active: r.value === 'watch-later' }])
                  },
                  [e[36] || (e[36] = t('span', null, '稍后再看', -1)), t('span', St, [g(l(K), { size: 12 })])],
                  2
                )
              ]),
              t('div', Bt, [t('button', { class: 'manage-btn', onClick: $e }, c(h.value ? '取消管理' : '批量管理'), 1)])
            ]),
            r.value === 'works' || r.value === 'templates'
              ? (n(),
                i('div', It, [
                  t('div', Rt, [
                    r.value === 'works'
                      ? (n(),
                        i(
                          R,
                          { key: 0 },
                          [
                            t(
                              'button',
                              {
                                class: d(['sub-tab-btn', { active: p.value === 'public' }]),
                                onClick: e[8] || (e[8] = a => (p.value = 'public'))
                              },
                              ' 作品 ',
                              2
                            ),
                            t(
                              'button',
                              {
                                class: d(['sub-tab-btn', { active: p.value === 'private' }]),
                                onClick: e[9] || (e[9] = a => (p.value = 'private'))
                              },
                              [
                                e[37] || (e[37] = t('span', null, '私密作品', -1)),
                                t('span', Vt, [g(l(K), { size: 11 })])
                              ],
                              2
                            ),
                            t(
                              'button',
                              {
                                class: d(['sub-tab-btn', { active: p.value === 'collection' }]),
                                onClick: e[10] || (e[10] = a => (p.value = 'collection'))
                              },
                              ' 合集 ',
                              2
                            )
                          ],
                          64
                        ))
                      : r.value === 'templates'
                        ? (n(),
                          i(
                            R,
                            { key: 1 },
                            [
                              t(
                                'button',
                                {
                                  class: d(['sub-tab-btn', { active: p.value === 'all' }]),
                                  onClick: e[11] || (e[11] = a => (p.value = 'all'))
                                },
                                ' 模板 ',
                                2
                              ),
                              t(
                                'button',
                                {
                                  class: d(['sub-tab-btn', { active: p.value === 'private' }]),
                                  onClick: e[12] || (e[12] = a => (p.value = 'private'))
                                },
                                [
                                  e[38] || (e[38] = t('span', null, '私密模板', -1)),
                                  t('span', zt, [g(l(K), { size: 11 })])
                                ],
                                2
                              ),
                              t(
                                'button',
                                {
                                  class: d(['sub-tab-btn', { active: p.value === 'collected' }]),
                                  onClick: e[13] || (e[13] = a => (p.value = 'collected'))
                                },
                                ' 收藏的模板 ',
                                2
                              )
                            ],
                            64
                          ))
                        : C('', !0)
                  ]),
                  t('div', At, [
                    t('div', Pt, [
                      g(l(Je), { class: 'tab-search-icon', size: 14 }),
                      U(
                        t(
                          'input',
                          {
                            type: 'text',
                            'onUpdate:modelValue': e[14] || (e[14] = a => (z.value = a)),
                            placeholder: '搜索我发布的作品',
                            class: 'tab-search-input'
                          },
                          null,
                          512
                        ),
                        [[X, z.value]]
                      )
                    ]),
                    e[39] || (e[39] = t('span', { class: 'divider-line' }, '|', -1)),
                    t('div', Ft, [
                      t('button', { class: 'date-filter-btn', onClick: e[15] || (e[15] = a => (L.value = !L.value)) }, [
                        t('span', null, [g(l(Ke), { size: 13 }), Z(' ' + c(te.value), 1)]),
                        t('span', { class: d(['arrow-icon', { open: L.value }]) }, '▼', 2)
                      ]),
                      L.value
                        ? (n(),
                          i('div', Ut, [
                            t('button', { onClick: e[16] || (e[16] = a => P('all', '全部时间')) }, '全部时间'),
                            t('button', { onClick: e[17] || (e[17] = a => P('week', '近一周')) }, '近一周'),
                            t('button', { onClick: e[18] || (e[18] = a => P('month', '近一月')) }, '近一月'),
                            t('button', { onClick: e[19] || (e[19] = a => P('year', '近一年')) }, '近一年')
                          ]))
                        : C('', !0)
                    ])
                  ])
                ]))
              : C('', !0),
            t('div', jt, [
              l(be) && _.value.length === 0
                ? (n(),
                  i('div', Et, [
                    (n(),
                    i(
                      R,
                      null,
                      Y(8, a => g(Ge, { key: a })),
                      64
                    ))
                  ]))
                : _.value.length > 0
                  ? (n(),
                    i('div', Ht, [
                      (n(!0),
                      i(
                        R,
                        null,
                        Y(
                          _.value,
                          a => (
                            n(),
                            i(
                              'div',
                              {
                                key: a.id,
                                class: d([
                                  'manageable-card-wrapper',
                                  { 'manage-active': h.value, selected: u.value.includes(a.id) }
                                ]),
                                onClick: m => Le(a)
                              },
                              [
                                h.value
                                  ? (n(),
                                    i('div', qt, [
                                      t(
                                        'div',
                                        { class: d(['custom-checkbox', { checked: u.value.includes(a.id) }]) },
                                        [u.value.includes(a.id) ? (n(), i('span', Nt, '✓')) : C('', !0)],
                                        2
                                      )
                                    ]))
                                  : C('', !0),
                                h.value && r.value !== 'recommend'
                                  ? (n(),
                                    i(
                                      'button',
                                      {
                                        key: 1,
                                        class: 'card-delete-btn',
                                        title: '删除',
                                        onClick: J(m => Se(a), ['stop'])
                                      },
                                      [
                                        ...(e[40] ||
                                          (e[40] = [
                                            t(
                                              'svg',
                                              {
                                                width: '14',
                                                height: '14',
                                                viewBox: '0 0 24 24',
                                                fill: 'none',
                                                stroke: 'currentColor',
                                                'stroke-width': '2',
                                                'stroke-linecap': 'round',
                                                'stroke-linejoin': 'round'
                                              },
                                              [
                                                t('polyline', { points: '3 6 5 6 21 6' }),
                                                t('path', {
                                                  d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'
                                                })
                                              ],
                                              -1
                                            )
                                          ]))
                                      ],
                                      8,
                                      Ot
                                    ))
                                  : C('', !0),
                                h.value && r.value === 'recommend'
                                  ? (n(),
                                    i(
                                      'button',
                                      {
                                        key: 2,
                                        class: 'card-cancel-btn',
                                        title: '取消推荐',
                                        onClick: J(m => Be(a), ['stop'])
                                      },
                                      [
                                        ...(e[41] ||
                                          (e[41] = [
                                            t(
                                              'svg',
                                              {
                                                width: '14',
                                                height: '14',
                                                viewBox: '0 0 24 24',
                                                fill: 'none',
                                                stroke: 'currentColor',
                                                'stroke-width': '2',
                                                'stroke-linecap': 'round',
                                                'stroke-linejoin': 'round'
                                              },
                                              [
                                                t('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
                                                t('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
                                              ],
                                              -1
                                            )
                                          ]))
                                      ],
                                      8,
                                      Gt
                                    ))
                                  : C('', !0),
                                g(Qe, { item: a, onLike: l(W), onCollect: l(ue) }, null, 8, [
                                  'item',
                                  'onLike',
                                  'onCollect'
                                ])
                              ],
                              10,
                              Wt
                            )
                          )
                        ),
                        128
                      ))
                    ]))
                  : (n(),
                    i('div', Qt, [
                      g(l(tt), { class: 'empty-icon', size: 54 }),
                      e[42] || (e[42] = t('div', { class: 'empty-text' }, '当前分类或时间范围内没有找到作品', -1))
                    ]))
            ]),
            t(
              'div',
              { class: d(['batch-management-bar', { visible: h.value }]) },
              [
                t('div', Xt, [
                  t('div', Zt, [
                    e[43] || (e[43] = Z(' 已选择 ', -1)),
                    t('span', Jt, c(u.value.length), 1),
                    e[44] || (e[44] = Z(' 项 ', -1))
                  ]),
                  t('div', Kt, [
                    t(
                      'button',
                      { class: 'batch-btn select-all-btn', onClick: Te },
                      c(u.value.length === _.value.length && _.value.length > 0 ? '取消全选' : '全选'),
                      1
                    ),
                    t(
                      'button',
                      { class: 'batch-btn privacy-btn', onClick: De, disabled: !u.value.length },
                      ' 公开 / 私密 ',
                      8,
                      Yt
                    ),
                    t(
                      'button',
                      { class: 'batch-btn delete-btn', onClick: Re, disabled: !u.value.length },
                      ' 删除 ',
                      8,
                      es
                    ),
                    t('button', { class: 'batch-btn cancel-btn', onClick: F }, ' 取消 ')
                  ])
                ])
              ],
              2
            ),
            g(
              He,
              { name: 'modal-fade' },
              {
                default: Ee(() => [
                  A.value
                    ? (n(),
                      i('div', { key: 0, class: 'edit-modal-overlay', onClick: J(O, ['self']) }, [
                        t(
                          'div',
                          { class: d(['edit-modal-card', { 'dark-mode': l(V).isDark }]) },
                          [
                            t('div', ts, [
                              e[45] || (e[45] = t('span', { class: 'edit-modal-title' }, '编辑资料', -1)),
                              t('button', { class: 'edit-modal-close', onClick: O }, [g(l(Ye), { size: 16 })])
                            ]),
                            t('div', ss, [
                              t(
                                'input',
                                {
                                  ref_key: 'avatarFileInput',
                                  ref: se,
                                  type: 'file',
                                  accept: 'image/jpeg,image/png,image/webp,image/gif',
                                  style: { display: 'none' },
                                  onChange: Ce
                                },
                                null,
                                544
                              ),
                              t(
                                'div',
                                {
                                  class: 'edit-avatar-wrapper',
                                  onClick:
                                    e[20] ||
                                    (e[20] = a => {
                                      var m;
                                      return (m = se.value) == null ? void 0 : m.click();
                                    })
                                },
                                [
                                  t(
                                    'img',
                                    {
                                      src: D.value || k.value.avatar || l(o).safeAvatar,
                                      alt: 'avatar',
                                      class: 'edit-avatar-img'
                                    },
                                    null,
                                    8,
                                    as
                                  ),
                                  t(
                                    'div',
                                    { class: d(['edit-avatar-mask', { uploading: S.value }]) },
                                    [
                                      S.value
                                        ? (n(), i('span', ls, '⟳'))
                                        : (n(), i('span', os, [g(l(et), { size: 20 })]))
                                    ],
                                    2
                                  )
                                ]
                              ),
                              t('p', ns, c(S.value ? '上传中...' : '点击修改头像'), 1)
                            ]),
                            t('div', is, [
                              t('div', rs, [
                                e[46] || (e[46] = t('label', { class: 'edit-field-label' }, '名字', -1)),
                                t('div', us, [
                                  U(
                                    t(
                                      'input',
                                      {
                                        'onUpdate:modelValue': e[21] || (e[21] = a => (k.value.username = a)),
                                        type: 'text',
                                        maxlength: '20',
                                        class: 'edit-input',
                                        placeholder: '请输入昵称'
                                      },
                                      null,
                                      512
                                    ),
                                    [[X, k.value.username]]
                                  ),
                                  t('span', ds, c((k.value.username || '').length) + '/20', 1)
                                ])
                              ]),
                              t('div', cs, [
                                e[47] || (e[47] = t('label', { class: 'edit-field-label' }, '简介', -1)),
                                U(
                                  t(
                                    'textarea',
                                    {
                                      'onUpdate:modelValue': e[22] || (e[22] = a => (k.value.bio = a)),
                                      maxlength: '300',
                                      rows: '5',
                                      class: 'edit-textarea',
                                      placeholder: '介绍一下自己吧...'
                                    },
                                    null,
                                    512
                                  ),
                                  [[X, k.value.bio]]
                                ),
                                t('span', vs, c((k.value.bio || '').length) + '/300', 1)
                              ])
                            ]),
                            t('div', ps, [
                              t('button', { class: 'edit-btn-cancel', onClick: O }, '取消'),
                              t(
                                'button',
                                { class: d(['edit-btn-save', { saving: T.value }]), disabled: T.value, onClick: _e },
                                c(T.value ? '保存中...' : '保存'),
                                11,
                                ms
                              )
                            ])
                          ],
                          2
                        )
                      ]))
                    : C('', !0)
                ]),
                _: 1
              }
            ),
            (n(),
            We(qe, { to: 'body' }, [
              g(at, { ref_key: 'bioTooltipRef', ref: N, 'bio-lines': fe.value, 'is-dark': l(V).isDark }, null, 8, [
                'bio-lines',
                'is-dark'
              ])
            ]))
          ],
          2
        )
      );
    }
  }),
  Ss = re(bs, [['__scopeId', 'data-v-fde89fbe']]);
export { Ss as default };
