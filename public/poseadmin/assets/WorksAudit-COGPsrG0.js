import {
  At as e,
  Q as t,
  V as n,
  X as r,
  Y as i,
  _t as a,
  et as o,
  jt as s,
  mt as c,
  nt as l,
  tt as u,
  xt as d,
  zt as f
} from './index-qAhX_anO.js';
import { n as p, x as m } from './css-1h04YQ5P.js';
import { a as h, c as g, f as _, i as v, m as y, n as b, o as x, r as S, t as C } from './axios-BbkQ5DQD.js';
import { t as w } from './css-D5-QsHoJ.js';
import { n as T, t as E } from './css-BhRj5d5w.js';
import './css-B6D8VRp3.js';
var D = { class: `p-6 h-full flex flex-col gap-4` },
  O = { class: `flex items-center justify-between` },
  k = { class: `flex gap-2` },
  A = { key: 0, class: `flex items-center justify-center gap-2` },
  j = { class: `flex justify-end pt-4` },
  M = l({
    __name: `WorksAudit`,
    setup(l) {
      let M = f(!1),
        N = f([]),
        P = f(0),
        F = f({ page: 1, pageSize: 20, status: 2, keyword: `` }),
        I = async () => {
          M.value = !0;
          try {
            let e = await C.get(`/posecraft/v1/admin/works`, { params: F.value });
            e.data.code === 200
              ? ((N.value = e.data.data), (P.value = e.data.total))
              : S.error(e.data.message || `获取列表失败`);
          } catch (e) {
            S.error(e.message || `获取列表失败`);
          } finally {
            M.value = !1;
          }
        },
        L = async (e, t) => {
          let n = t === 1 ? `通过` : `驳回`;
          try {
            await b.confirm(`确定要${n}该作品吗？`, `审核确认`, { type: t === 1 ? `success` : `warning` });
            let r = await C.put(`/posecraft/v1/admin/works/${e}/audit`, { status: t });
            r.data.code === 200 ? (S.success(`审核成功`), I()) : S.error(r.data.message || `审核失败`);
          } catch (e) {
            e !== `cancel` && console.error(e);
          }
        },
        R = e => {
          ((F.value.pageSize = e), I());
        },
        z = e => {
          ((F.value.page = e), I());
        };
      return (
        c(() => {
          I();
        }),
        (c, l) => {
          let f = E,
            b = T,
            S = d(`Search`),
            C = m,
            B = p,
            V = y,
            H = x,
            U = w,
            W = _,
            G = h,
            K = g,
            q = v;
          return (
            a(),
            t(`div`, D, [
              i(`div`, O, [
                u(
                  b,
                  {
                    modelValue: F.value.status,
                    'onUpdate:modelValue': (l[0] ||= e => (F.value.status = e)),
                    onChange: I
                  },
                  {
                    default: e(() => [
                      u(f, { value: 2 }, { default: e(() => [...(l[4] ||= [o(`待审核`, -1)])]), _: 1 }),
                      u(f, { value: 1 }, { default: e(() => [...(l[5] ||= [o(`已公开`, -1)])]), _: 1 }),
                      u(f, { value: -2 }, { default: e(() => [...(l[6] ||= [o(`已驳回`, -1)])]), _: 1 }),
                      u(f, { value: 0 }, { default: e(() => [...(l[7] ||= [o(`私密`, -1)])]), _: 1 })
                    ]),
                    _: 1
                  },
                  8,
                  [`modelValue`]
                ),
                i(`div`, k, [
                  u(
                    V,
                    {
                      modelValue: F.value.keyword,
                      'onUpdate:modelValue': (l[1] ||= e => (F.value.keyword = e)),
                      placeholder: `搜索标题/描述`,
                      clearable: ``,
                      onKeyup: n(I, [`enter`]),
                      class: `w-64`
                    },
                    {
                      append: e(() => [
                        u(
                          B,
                          { onClick: I },
                          { default: e(() => [u(C, null, { default: e(() => [u(S)]), _: 1 })]), _: 1 }
                        )
                      ]),
                      _: 1
                    },
                    8,
                    [`modelValue`]
                  )
                ])
              ]),
              s(
                (a(),
                r(
                  G,
                  { data: N.value, border: ``, class: `w-full flex-1`, height: `100%` },
                  {
                    default: e(() => [
                      u(H, { prop: `id`, label: `ID`, width: `80`, align: `center` }),
                      u(
                        H,
                        { label: `预览图`, width: `120`, align: `center` },
                        {
                          default: e(({ row: e }) => [
                            u(
                              U,
                              {
                                class: `w-16 h-16 rounded cursor-pointer`,
                                src: e.thumbnail_url,
                                'preview-src-list': [e.thumbnail_url, e.image_url].filter(Boolean),
                                fit: `cover`,
                                'preview-teleported': ``
                              },
                              null,
                              8,
                              [`src`, `preview-src-list`]
                            )
                          ]),
                          _: 1
                        }
                      ),
                      u(H, { prop: `title`, label: `标题`, 'min-width': `150`, 'show-overflow-tooltip': `` }),
                      u(H, { prop: `description`, label: `描述`, 'min-width': `200`, 'show-overflow-tooltip': `` }),
                      u(H, { prop: `user_id`, label: `作者ID`, width: `100`, align: `center` }),
                      u(H, { prop: `created_at`, label: `创建时间`, width: `170`, align: `center` }),
                      u(
                        H,
                        { label: `操作`, width: `160`, fixed: `right`, align: `center` },
                        {
                          default: e(({ row: n }) => [
                            n.status === 2
                              ? (a(),
                                t(`div`, A, [
                                  u(
                                    B,
                                    { type: `success`, size: `small`, plain: ``, onClick: e => L(n.id, 1) },
                                    { default: e(() => [...(l[8] ||= [o(`通过`, -1)])]), _: 1 },
                                    8,
                                    [`onClick`]
                                  ),
                                  u(
                                    B,
                                    { type: `danger`, size: `small`, plain: ``, onClick: e => L(n.id, -2) },
                                    { default: e(() => [...(l[9] ||= [o(`驳回`, -1)])]), _: 1 },
                                    8,
                                    [`onClick`]
                                  )
                                ]))
                              : n.status === 1
                                ? (a(),
                                  r(
                                    W,
                                    { key: 1, type: `success` },
                                    { default: e(() => [...(l[10] ||= [o(`已通过`, -1)])]), _: 1 }
                                  ))
                                : n.status === -2
                                  ? (a(),
                                    r(
                                      W,
                                      { key: 2, type: `danger` },
                                      { default: e(() => [...(l[11] ||= [o(`已驳回`, -1)])]), _: 1 }
                                    ))
                                  : (a(),
                                    r(
                                      W,
                                      { key: 3, type: `info` },
                                      { default: e(() => [...(l[12] ||= [o(`已处理`, -1)])]), _: 1 }
                                    ))
                          ]),
                          _: 1
                        }
                      )
                    ]),
                    _: 1
                  },
                  8,
                  [`data`]
                )),
                [[q, M.value]]
              ),
              i(`div`, j, [
                u(
                  K,
                  {
                    'current-page': F.value.page,
                    'onUpdate:currentPage': (l[2] ||= e => (F.value.page = e)),
                    'page-size': F.value.pageSize,
                    'onUpdate:pageSize': (l[3] ||= e => (F.value.pageSize = e)),
                    'page-sizes': [10, 20, 50, 100],
                    background: ``,
                    layout: `total, sizes, prev, pager, next, jumper`,
                    total: P.value,
                    onSizeChange: R,
                    onCurrentChange: z
                  },
                  null,
                  8,
                  [`current-page`, `page-size`, `total`]
                )
              ])
            ])
          );
        }
      );
    }
  });
export { M as default };
