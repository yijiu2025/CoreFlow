import {
  At as e,
  Q as t,
  X as n,
  Y as r,
  _t as i,
  cn as a,
  et as o,
  jt as s,
  mt as c,
  nt as l,
  tt as u,
  zt as d
} from './index-qAhX_anO.js';
import { n as f } from './css-1h04YQ5P.js';
import { a as p, c as m, i as h, m as g, n as _, o as v, r as y, t as b } from './axios-BbkQ5DQD.js';
import { a as x, i as S, n as C, o as w, r as T, t as E } from './css-DtJIRPra.js';
import { t as D } from './css-D5-QsHoJ.js';
var O = {
    list: (e = {}) => b.get(`/posecraft/v1/admin/banner-configs`, { params: e }),
    create: e => b.post(`/posecraft/v1/admin/banner-configs`, e),
    update: (e, t) => b.put(`/posecraft/v1/admin/banner-configs/${e}`, t),
    remove: e => b.delete(`/posecraft/v1/admin/banner-configs/${e}`)
  },
  k = { class: `p-6 h-full flex flex-col gap-4` },
  A = { class: `flex items-center justify-between` },
  j = { key: 1, class: `text-gray-400 text-xs` },
  M = { class: `flex justify-end pt-2` },
  N = l({
    __name: `BannerManage`,
    setup(l) {
      let b = d(!1),
        N = d([]),
        P = d(0),
        F = d(!1),
        I = d(``),
        L = d(!1),
        R = d({}),
        z = d({ page: 1, pageSize: 20 }),
        B = async () => {
          b.value = !0;
          try {
            let e = await O.list(z.value);
            e.data.code === 200
              ? ((N.value = e.data.data), (P.value = e.data.total))
              : y.error(e.data.message || `获取列表失败`);
          } catch (e) {
            y.error(e.message || `获取列表失败`);
          } finally {
            b.value = !1;
          }
        },
        V = () => {
          R.value = {
            title: ``,
            description: ``,
            badge_text: ``,
            button_text: ``,
            image_url: ``,
            link_url: ``,
            sort_order: 0,
            enabled: !0,
            start_at: null,
            end_at: null
          };
        },
        H = () => {
          (V(), (I.value = `新建 Banner`), (F.value = !0));
        },
        U = e => {
          ((R.value = {
            ...e,
            start_at: e.start_at ? new Date(e.start_at) : null,
            end_at: e.end_at ? new Date(e.end_at) : null
          }),
            (I.value = `编辑 Banner`),
            (F.value = !0));
        },
        W = async () => {
          if (!R.value.title) {
            y.warning(`标题不能为空`);
            return;
          }
          L.value = !0;
          try {
            let e = { ...R.value };
            ((e.start_at &&= new Date(e.start_at).toISOString()),
              (e.end_at &&= new Date(e.end_at).toISOString()),
              e.id ? (await O.update(e.id, e), y.success(`更新成功`)) : (await O.create(e), y.success(`创建成功`)),
              (F.value = !1),
              B());
          } catch (e) {
            y.error(e.message || `保存失败`);
          } finally {
            L.value = !1;
          }
        },
        G = async e => {
          try {
            (await _.confirm(`确定要删除该 Banner 吗？`, `删除确认`, { type: `warning` }),
              await O.remove(e),
              y.success(`删除成功`),
              B());
          } catch (e) {
            e !== `cancel` && console.error(e);
          }
        },
        K = async e => {
          try {
            (await O.update(e.id, { enabled: e.enabled }), y.success(`已更新`));
          } catch (t) {
            (y.error(t.message || `更新失败`), (e.enabled = !e.enabled));
          }
        },
        q = e => {
          ((z.value.pageSize = e), B());
        },
        J = e => {
          ((z.value.page = e), B());
        },
        Y = e => (e ? new Date(e).toLocaleString() : `—`);
      return (
        c(() => {
          B();
        }),
        (c, l) => {
          let d = f,
            _ = v,
            y = D,
            O = E,
            B = p,
            V = m,
            X = g,
            Z = w,
            Q = C,
            $ = S,
            ee = x,
            te = T,
            ne = h;
          return (
            i(),
            t(`div`, k, [
              r(`div`, A, [
                (l[15] ||= r(`h2`, { class: `text-lg font-semibold text-gray-800` }, `Banner 管理`, -1)),
                u(
                  d,
                  { type: `primary`, onClick: H },
                  { default: e(() => [...(l[14] ||= [o(`+ 新建 Banner`, -1)])]), _: 1 }
                )
              ]),
              s(
                (i(),
                n(
                  B,
                  { data: N.value, border: ``, class: `w-full flex-1`, height: `100%` },
                  {
                    default: e(() => [
                      u(_, { prop: `id`, label: `ID`, width: `70`, align: `center` }),
                      u(_, { prop: `title`, label: `标题`, 'min-width': `180`, 'show-overflow-tooltip': `` }),
                      u(_, { prop: `badge_text`, label: `Badge`, width: `100`, 'show-overflow-tooltip': `` }),
                      u(_, { prop: `button_text`, label: `按钮`, width: `100`, 'show-overflow-tooltip': `` }),
                      u(
                        _,
                        { label: `背景图`, width: `90`, align: `center` },
                        {
                          default: e(({ row: e }) => [
                            e.image_url
                              ? (i(),
                                n(
                                  y,
                                  {
                                    key: 0,
                                    class: `w-12 h-12 rounded`,
                                    src: e.image_url,
                                    'preview-src-list': [e.image_url],
                                    fit: `cover`,
                                    'preview-teleported': ``
                                  },
                                  null,
                                  8,
                                  [`src`, `preview-src-list`]
                                ))
                              : (i(), t(`span`, j, `无`))
                          ]),
                          _: 1
                        }
                      ),
                      u(
                        _,
                        { label: `启用`, width: `70`, align: `center` },
                        {
                          default: e(({ row: e }) => [
                            u(
                              O,
                              {
                                modelValue: e.enabled,
                                'onUpdate:modelValue': t => (e.enabled = t),
                                onChange: t => K(e)
                              },
                              null,
                              8,
                              [`modelValue`, `onUpdate:modelValue`, `onChange`]
                            )
                          ]),
                          _: 1
                        }
                      ),
                      u(_, { prop: `sort_order`, label: `排序`, width: `70`, align: `center` }),
                      u(
                        _,
                        { label: `开始时间`, width: `150`, align: `center` },
                        { default: e(({ row: e }) => [o(a(Y(e.start_at)), 1)]), _: 1 }
                      ),
                      u(
                        _,
                        { label: `结束时间`, width: `150`, align: `center` },
                        { default: e(({ row: e }) => [o(a(Y(e.end_at)), 1)]), _: 1 }
                      ),
                      u(
                        _,
                        { label: `操作`, width: `140`, fixed: `right`, align: `center` },
                        {
                          default: e(({ row: t }) => [
                            u(
                              d,
                              { type: `primary`, link: ``, size: `small`, onClick: e => U(t) },
                              { default: e(() => [...(l[16] ||= [o(`编辑`, -1)])]), _: 1 },
                              8,
                              [`onClick`]
                            ),
                            u(
                              d,
                              { type: `danger`, link: ``, size: `small`, onClick: e => G(t.id) },
                              { default: e(() => [...(l[17] ||= [o(`删除`, -1)])]), _: 1 },
                              8,
                              [`onClick`]
                            )
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
                [[ne, b.value]]
              ),
              r(`div`, M, [
                u(
                  V,
                  {
                    'current-page': z.value.page,
                    'onUpdate:currentPage': (l[0] ||= e => (z.value.page = e)),
                    'page-size': z.value.pageSize,
                    'onUpdate:pageSize': (l[1] ||= e => (z.value.pageSize = e)),
                    'page-sizes': [10, 20, 50],
                    background: ``,
                    layout: `total, sizes, prev, pager, next, jumper`,
                    total: P.value,
                    onSizeChange: q,
                    onCurrentChange: J
                  },
                  null,
                  8,
                  [`current-page`, `page-size`, `total`]
                )
              ]),
              u(
                te,
                {
                  modelValue: F.value,
                  'onUpdate:modelValue': (l[13] ||= e => (F.value = e)),
                  title: I.value,
                  width: `600px`,
                  'destroy-on-close': ``
                },
                {
                  footer: e(() => [
                    u(
                      d,
                      { onClick: (l[12] ||= e => (F.value = !1)) },
                      { default: e(() => [...(l[18] ||= [o(`取消`, -1)])]), _: 1 }
                    ),
                    u(
                      d,
                      { type: `primary`, loading: L.value, onClick: W },
                      { default: e(() => [...(l[19] ||= [o(`保存`, -1)])]), _: 1 },
                      8,
                      [`loading`]
                    )
                  ]),
                  default: e(() => [
                    u(
                      ee,
                      { model: R.value, 'label-width': `100px` },
                      {
                        default: e(() => [
                          u(
                            Z,
                            { label: `标题`, required: `` },
                            {
                              default: e(() => [
                                u(
                                  X,
                                  {
                                    modelValue: R.value.title,
                                    'onUpdate:modelValue': (l[2] ||= e => (R.value.title = e)),
                                    placeholder: `Banner 大标题`
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `描述` },
                            {
                              default: e(() => [
                                u(
                                  X,
                                  {
                                    modelValue: R.value.description,
                                    'onUpdate:modelValue': (l[3] ||= e => (R.value.description = e)),
                                    type: `textarea`,
                                    rows: 2,
                                    placeholder: `描述文本`
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `Badge 文案` },
                            {
                              default: e(() => [
                                u(
                                  X,
                                  {
                                    modelValue: R.value.badge_text,
                                    'onUpdate:modelValue': (l[4] ||= e => (R.value.badge_text = e)),
                                    placeholder: `如：每日精选`
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `按钮文案` },
                            {
                              default: e(() => [
                                u(
                                  X,
                                  {
                                    modelValue: R.value.button_text,
                                    'onUpdate:modelValue': (l[5] ||= e => (R.value.button_text = e)),
                                    placeholder: `如：立即探索`
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `背景图 URL` },
                            {
                              default: e(() => [
                                u(
                                  X,
                                  {
                                    modelValue: R.value.image_url,
                                    'onUpdate:modelValue': (l[6] ||= e => (R.value.image_url = e)),
                                    placeholder: `如 /posecraft/banner.jpg`
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `跳转 URL` },
                            {
                              default: e(() => [
                                u(
                                  X,
                                  {
                                    modelValue: R.value.link_url,
                                    'onUpdate:modelValue': (l[7] ||= e => (R.value.link_url = e)),
                                    placeholder: `按钮点击跳转地址（可空）`
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `排序权重` },
                            {
                              default: e(() => [
                                u(
                                  Q,
                                  {
                                    modelValue: R.value.sort_order,
                                    'onUpdate:modelValue': (l[8] ||= e => (R.value.sort_order = e)),
                                    min: 0
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `启用` },
                            {
                              default: e(() => [
                                u(
                                  O,
                                  {
                                    modelValue: R.value.enabled,
                                    'onUpdate:modelValue': (l[9] ||= e => (R.value.enabled = e))
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `开始时间` },
                            {
                              default: e(() => [
                                u(
                                  $,
                                  {
                                    modelValue: R.value.start_at,
                                    'onUpdate:modelValue': (l[10] ||= e => (R.value.start_at = e)),
                                    type: `datetime`,
                                    placeholder: `不限`,
                                    'value-format': `YYYY-MM-DD HH:mm:ss`,
                                    style: { width: `100%` }
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          ),
                          u(
                            Z,
                            { label: `结束时间` },
                            {
                              default: e(() => [
                                u(
                                  $,
                                  {
                                    modelValue: R.value.end_at,
                                    'onUpdate:modelValue': (l[11] ||= e => (R.value.end_at = e)),
                                    type: `datetime`,
                                    placeholder: `不限`,
                                    'value-format': `YYYY-MM-DD HH:mm:ss`,
                                    style: { width: `100%` }
                                  },
                                  null,
                                  8,
                                  [`modelValue`]
                                )
                              ]),
                              _: 1
                            }
                          )
                        ]),
                        _: 1
                      },
                      8,
                      [`model`]
                    )
                  ]),
                  _: 1
                },
                8,
                [`modelValue`, `title`]
              )
            ])
          );
        }
      );
    }
  });
export { N as default };
