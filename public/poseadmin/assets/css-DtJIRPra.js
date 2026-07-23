import {
  $ as e,
  $t as t,
  At as n,
  B as r,
  C as i,
  Ct as a,
  Et as o,
  F as s,
  G as c,
  Gt as l,
  H as u,
  Ht as d,
  J as f,
  Jt as p,
  Kt as m,
  Lt as h,
  Ot as g,
  P as _,
  Q as v,
  Qt as y,
  Tt as b,
  V as x,
  W as S,
  Wt as C,
  X as w,
  Y as T,
  Z as E,
  _ as D,
  _t as O,
  a as k,
  an as A,
  bt as j,
  c as M,
  cn as N,
  ct as P,
  en as F,
  et as ee,
  f as I,
  fn as L,
  ft as R,
  gt as z,
  i as te,
  in as B,
  jt as ne,
  lt as re,
  mt as V,
  n as ie,
  nt as H,
  ot as ae,
  p as oe,
  qt as U,
  r as se,
  rn as ce,
  rt as le,
  sn as W,
  st as ue,
  t as de,
  tn as fe,
  tt as G,
  u as pe,
  un as me,
  vt as he,
  y as ge,
  yt as _e,
  zt as K
} from './index-qAhX_anO.js';
import {
  A as q,
  At as ve,
  B as ye,
  Cn as be,
  Ct as xe,
  D as Se,
  E as Ce,
  Et as we,
  G as Te,
  H as Ee,
  I as De,
  K as Oe,
  L as ke,
  M as Ae,
  P as je,
  R as Me,
  S as Ne,
  Sn as Pe,
  V as Fe,
  W as Ie,
  Wt as Le,
  _ as Re,
  _t as J,
  b as ze,
  c as Be,
  dt as Ve,
  f as He,
  g as Ue,
  gt as We,
  h as Y,
  ht as Ge,
  j as Ke,
  k as qe,
  kt as Je,
  l as Ye,
  lt as Xe,
  m as Ze,
  mt as Qe,
  n as $e,
  nt as et,
  o as tt,
  p as nt,
  rt,
  st as it,
  t as at,
  tt as ot,
  u as st,
  v as ct,
  vt as X,
  wt as lt,
  x as Z,
  xt as ut,
  y as dt,
  yt as ft,
  z as pt
} from './css-1h04YQ5P.js';
import {
  C as mt,
  D as ht,
  E as gt,
  O as _t,
  S as vt,
  T as yt,
  _ as bt,
  b as xt,
  g as St,
  h as Ct,
  k as wt,
  l as Tt,
  m as Et,
  p as Dt,
  s as Ot,
  w as kt,
  x as At,
  y as jt
} from './axios-BbkQ5DQD.js';
var Mt = 1,
  Nt = 4;
function Pt(e) {
  return kt(e, Mt | Nt);
}
var Ft = J({
    ...J({ size: { type: String, values: Pe }, disabled: Boolean }),
    model: Object,
    rules: { type: X(Object) },
    labelPosition: { type: String, values: [`left`, `right`, `top`], default: `right` },
    requireAsteriskPosition: { type: String, values: [`left`, `right`], default: `left` },
    labelWidth: { type: [String, Number], default: `` },
    labelSuffix: { type: String, default: `` },
    inline: Boolean,
    inlineMessage: Boolean,
    statusIcon: Boolean,
    showMessage: { type: Boolean, default: !0 },
    validateOnRuleChange: { type: Boolean, default: !0 },
    hideRequiredAsterisk: Boolean,
    scrollToError: Boolean,
    scrollIntoViewOptions: { type: X([Object, Boolean]), default: !0 }
  }),
  It = { validate: (e, t, n) => (y(e) || B(e)) && ut(t) && B(n) },
  Lt = J({
    label: String,
    labelWidth: { type: [String, Number] },
    labelPosition: { type: String, values: [`left`, `right`, `top`, ``], default: `` },
    prop: { type: X([String, Array]) },
    required: { type: Boolean, default: void 0 },
    rules: { type: X([Object, Array]) },
    error: String,
    validateStatus: { type: String, values: [``, `error`, `validating`, `success`] },
    for: String,
    inlineMessage: { type: Boolean, default: void 0 },
    showMessage: { type: Boolean, default: !0 },
    size: { type: String, values: Pe }
  }),
  Rt = `ElForm`;
function zt() {
  let e = K([]),
    t = f(() => {
      if (!e.value.length) return `0`;
      let t = Math.max(...e.value);
      return t ? `${t}px` : ``;
    });
  function n(n) {
    let r = e.value.indexOf(n);
    return (r === -1 && t.value === `0` && Ge(Rt, `unexpected width ${n}`), r);
  }
  function r(t, r) {
    if (t && r) {
      let i = n(r);
      e.value.splice(i, 1, t);
    } else t && e.value.push(t);
  }
  function i(t) {
    let r = n(t);
    r > -1 && e.value.splice(r, 1);
  }
  return { autoLabelWidth: t, registerLabelWidth: r, deregisterLabelWidth: i };
}
var Bt = (e, t) => {
    let n = yt(t).map(e => (y(e) ? e.join(`.`) : e));
    return n.length > 0 ? e.filter(e => e.propString && n.includes(e.propString)) : e;
  },
  Vt = `ElForm`,
  Ht = H({
    name: Vt,
    __name: `form`,
    props: Ft,
    emits: It,
    setup(e, { expose: t, emit: n }) {
      let r = e,
        i = n,
        a = K(),
        o = h([]),
        s = new Map(),
        c = ct(),
        u = Fe(`form`),
        d = f(() => {
          let { labelPosition: e, inline: t } = r;
          return [u.b(), u.m(c.value || `default`), { [u.m(`label-${e}`)]: e, [u.m(`inline`)]: t }];
        }),
        m = e => Bt(o, [e])[0],
        _ = e => {
          (o.includes(e) || o.push(e),
            e.propString &&
              (s.has(e.propString) ? e.setInitialValue(s.get(e.propString)) : s.set(e.propString, Pt(e.fieldValue))));
        },
        b = (e, t) => {
          if (t) {
            s.delete(t);
            return;
          }
          let n = o.indexOf(e);
          n > -1 && (o.splice(n, 1), e.propString && s.set(e.propString, Pt(e.getInitialValue())));
        },
        x = e => {
          if (!r.model) {
            Ge(Vt, `model is required for setInitialValues to work.`);
            return;
          }
          if (!e) {
            Ge(Vt, `initModel is required for setInitialValues to work.`);
            return;
          }
          for (let t of s.keys()) s.set(t, Pt(ft(e, t).value));
          o.forEach(t => {
            t.prop && t.setInitialValue(ft(e, t.prop).value);
          });
        },
        S = (e = []) => {
          if (!r.model) {
            Ge(Vt, `model is required for resetFields to work.`);
            return;
          }
          Bt(o, e).forEach(e => e.resetField());
          let t = new Set(o.map(e => e.propString).filter(Boolean)),
            n = e.length > 0 ? yt(e).map(e => (y(e) ? e.join(`.`) : e)) : [...s.keys()];
          for (let e of n) !t.has(e) && s.has(e) && (ft(r.model, e).value = Pt(s.get(e)));
        },
        C = (e = []) => {
          Bt(o, e).forEach(e => e.clearValidate());
        },
        w = f(() => {
          let e = !!r.model;
          return (e || Ge(Vt, `model is required for validate to work.`), e);
        }),
        T = e => {
          if (o.length === 0) return [];
          let t = Bt(o, e);
          return t.length ? t : (Ge(Vt, `please pass correct props!`), []);
        },
        E = async e => k(void 0, e),
        D = async (e = []) => {
          if (!w.value) return !1;
          let t = T(e);
          if (t.length === 0) return !0;
          let n = {};
          for (let e of t)
            try {
              (await e.validate(``), e.validateState === `error` && !e.error && e.resetField());
            } catch (e) {
              n = { ...n, ...e };
            }
          return Object.keys(n).length === 0 ? !0 : Promise.reject(n);
        },
        k = async (e = [], t) => {
          let n = !1,
            i = !F(t);
          try {
            return ((n = await D(e)), n === !0 && (await t?.(n)), n);
          } catch (e) {
            if (e instanceof Error) throw e;
            let o = e;
            return (
              r.scrollToError &&
                a.value &&
                a.value.querySelector(`.${u.b()}-item.is-error`)?.scrollIntoView(r.scrollIntoViewOptions),
              !n && (await t?.(!1, o)),
              i && Promise.reject(o)
            );
          }
        },
        M = e => {
          let t = m(e);
          t && t.$el?.scrollIntoView(r.scrollIntoViewOptions);
        };
      return (
        g(
          () => r.rules,
          () => {
            r.validateOnRuleChange && E().catch(p);
          },
          { deep: !0, flush: `post` }
        ),
        he(
          dt,
          h({
            ...l(r),
            emit: i,
            resetFields: S,
            clearValidate: C,
            validateField: k,
            getField: m,
            addField: _,
            removeField: b,
            setInitialValues: x,
            ...zt()
          })
        ),
        t({
          validate: E,
          validateField: k,
          resetFields: S,
          clearValidate: C,
          scrollToField: M,
          getField: m,
          fields: o,
          setInitialValues: x
        }),
        (e, t) => (O(), v(`form`, { ref_key: `formRef`, ref: a, class: A(d.value) }, [j(e.$slots, `default`)], 2))
      );
    }
  }),
  Ut = `ElLabelWrap`,
  Wt = H({
    name: Ut,
    props: { isAutoWidth: Boolean, updateAll: Boolean },
    setup(e, { slots: t }) {
      let n = ae(dt, void 0),
        r = ae(ze);
      r || We(Ut, `usage: <el-form-item><label-wrap /></el-form-item>`);
      let i = Fe(`form`),
        a = K(),
        o = K(0),
        s = () => {
          if (a.value?.firstElementChild) {
            let e = window.getComputedStyle(a.value.firstElementChild).width;
            return Math.ceil(Number.parseFloat(e));
          } else return 0;
        },
        c = (r = `update`) => {
          re(() => {
            t.default &&
              e.isAutoWidth &&
              (r === `update` ? (o.value = s()) : r === `remove` && n?.deregisterLabelWidth(o.value));
          });
        },
        l = () => c(`update`);
      return (
        V(() => {
          l();
        }),
        R(() => {
          c(`remove`);
        }),
        z(() => l()),
        g(o, (t, r) => {
          e.updateAll && n?.registerLabelWidth(t, r);
        }),
        it(
          f(() => a.value?.firstElementChild ?? null),
          l
        ),
        () => {
          if (!t) return null;
          let { isAutoWidth: s } = e;
          if (s) {
            let e = n?.autoLabelWidth,
              s = r?.hasLabel,
              c = {};
            if (s && e && e !== `auto`) {
              let t = Math.max(0, Number.parseInt(e, 10) - o.value),
                i = (r.labelPosition || n.labelPosition) === `left` ? `marginRight` : `marginLeft`;
              t && (c[i] = `${t}px`);
            }
            return G(`div`, { ref: a, class: [i.be(`item`, `label-wrap`)], style: c }, [t.default?.()]);
          } else return G(S, { ref: a }, [t.default?.()]);
        }
      );
    }
  });
function Gt() {
  return (
    (Gt = Object.assign
      ? Object.assign.bind()
      : function (e) {
          for (var t = 1; t < arguments.length; t++) {
            var n = arguments[t];
            for (var r in n) Object.prototype.hasOwnProperty.call(n, r) && (e[r] = n[r]);
          }
          return e;
        }),
    Gt.apply(this, arguments)
  );
}
function Kt(e, t) {
  ((e.prototype = Object.create(t.prototype)), (e.prototype.constructor = e), Jt(e, t));
}
function qt(e) {
  return (
    (qt = Object.setPrototypeOf
      ? Object.getPrototypeOf.bind()
      : function (e) {
          return e.__proto__ || Object.getPrototypeOf(e);
        }),
    qt(e)
  );
}
function Jt(e, t) {
  return (
    (Jt = Object.setPrototypeOf
      ? Object.setPrototypeOf.bind()
      : function (e, t) {
          return ((e.__proto__ = t), e);
        }),
    Jt(e, t)
  );
}
function Yt() {
  if (typeof Reflect > `u` || !Reflect.construct || Reflect.construct.sham) return !1;
  if (typeof Proxy == `function`) return !0;
  try {
    return (Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})), !0);
  } catch {
    return !1;
  }
}
function Xt(e, t, n) {
  return (
    (Xt = Yt()
      ? Reflect.construct.bind()
      : function (e, t, n) {
          var r = [null];
          r.push.apply(r, t);
          var i = new (Function.bind.apply(e, r))();
          return (n && Jt(i, n.prototype), i);
        }),
    Xt.apply(null, arguments)
  );
}
function Zt(e) {
  return Function.toString.call(e).indexOf(`[native code]`) !== -1;
}
function Qt(e) {
  var t = typeof Map == `function` ? new Map() : void 0;
  return (
    (Qt = function (e) {
      if (e === null || !Zt(e)) return e;
      if (typeof e != `function`) throw TypeError(`Super expression must either be null or a function`);
      if (t !== void 0) {
        if (t.has(e)) return t.get(e);
        t.set(e, n);
      }
      function n() {
        return Xt(e, arguments, qt(this).constructor);
      }
      return (
        (n.prototype = Object.create(e.prototype, {
          constructor: { value: n, enumerable: !1, writable: !0, configurable: !0 }
        })),
        Jt(n, e)
      );
    }),
    Qt(e)
  );
}
var $t = /%[sdj%]/g,
  en = function () {};
function tn(e) {
  if (!e || !e.length) return null;
  var t = {};
  return (
    e.forEach(function (e) {
      var n = e.field;
      ((t[n] = t[n] || []), t[n].push(e));
    }),
    t
  );
}
function nn(e) {
  var t = [...arguments].slice(1),
    n = 0,
    r = t.length;
  return typeof e == `function`
    ? e.apply(null, t)
    : typeof e == `string`
      ? e.replace($t, function (e) {
          if (e === `%%`) return `%`;
          if (n >= r) return e;
          switch (e) {
            case `%s`:
              return String(t[n++]);
            case `%d`:
              return Number(t[n++]);
            case `%j`:
              try {
                return JSON.stringify(t[n++]);
              } catch {
                return `[Circular]`;
              }
              break;
            default:
              return e;
          }
        })
      : e;
}
function rn(e) {
  return e === `string` || e === `url` || e === `hex` || e === `email` || e === `date` || e === `pattern`;
}
function an(e, t) {
  return !!(e == null || (t === `array` && Array.isArray(e) && !e.length) || (rn(t) && typeof e == `string` && !e));
}
function on(e, t, n) {
  var r = [],
    i = 0,
    a = e.length;
  function o(e) {
    (r.push.apply(r, e || []), i++, i === a && n(r));
  }
  e.forEach(function (e) {
    t(e, o);
  });
}
function sn(e, t, n) {
  var r = 0,
    i = e.length;
  function a(o) {
    if (o && o.length) {
      n(o);
      return;
    }
    var s = r;
    ((r += 1), s < i ? t(e[s], a) : n([]));
  }
  a([]);
}
function cn(e) {
  var t = [];
  return (
    Object.keys(e).forEach(function (n) {
      t.push.apply(t, e[n] || []);
    }),
    t
  );
}
var ln = (function (e) {
  Kt(t, e);
  function t(t, n) {
    var r = e.call(this, `Async Validation Error`) || this;
    return ((r.errors = t), (r.fields = n), r);
  }
  return t;
})(Qt(Error));
function un(e, t, n, r, i) {
  if (t.first) {
    var a = new Promise(function (t, a) {
      sn(cn(e), n, function (e) {
        return (r(e), e.length ? a(new ln(e, tn(e))) : t(i));
      });
    });
    return (
      a.catch(function (e) {
        return e;
      }),
      a
    );
  }
  var o = t.firstFields === !0 ? Object.keys(e) : t.firstFields || [],
    s = Object.keys(e),
    c = s.length,
    l = 0,
    u = [],
    d = new Promise(function (t, a) {
      var d = function (e) {
        if ((u.push.apply(u, e), l++, l === c)) return (r(u), u.length ? a(new ln(u, tn(u))) : t(i));
      };
      (s.length || (r(u), t(i)),
        s.forEach(function (t) {
          var r = e[t];
          o.indexOf(t) === -1 ? on(r, n, d) : sn(r, n, d);
        }));
    });
  return (
    d.catch(function (e) {
      return e;
    }),
    d
  );
}
function dn(e) {
  return !!(e && e.message !== void 0);
}
function fn(e, t) {
  for (var n = e, r = 0; r < t.length; r++) {
    if (n == null) return n;
    n = n[t[r]];
  }
  return n;
}
function pn(e, t) {
  return function (n) {
    var r = e.fullFields ? fn(t, e.fullFields) : t[n.field || e.fullField];
    return dn(n)
      ? ((n.field = n.field || e.fullField), (n.fieldValue = r), n)
      : { message: typeof n == `function` ? n() : n, fieldValue: r, field: n.field || e.fullField };
  };
}
function mn(e, t) {
  if (t) {
    for (var n in t)
      if (t.hasOwnProperty(n)) {
        var r = t[n];
        typeof r == `object` && typeof e[n] == `object` ? (e[n] = Gt({}, e[n], r)) : (e[n] = r);
      }
  }
  return e;
}
var hn = function (e, t, n, r, i, a) {
    e.required && (!n.hasOwnProperty(e.field) || an(t, a || e.type)) && r.push(nn(i.messages.required, e.fullField));
  },
  gn = function (e, t, n, r, i) {
    (/^\s+$/.test(t) || t === ``) && r.push(nn(i.messages.whitespace, e.fullField));
  },
  _n,
  vn = function () {
    if (_n) return _n;
    var e = `[a-fA-F\\d:]`,
      t = function (t) {
        return t && t.includeBoundaries ? `(?:(?<=\\s|^)(?=` + e + `)|(?<=` + e + `)(?=\\s|$))` : ``;
      },
      n = `(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}`,
      r = `[a-fA-F\\d]{1,4}`,
      i = (
        `
(?:
(?:` +
        r +
        `:){7}(?:` +
        r +
        `|:)|                                    // 1:2:3:4:5:6:7::  1:2:3:4:5:6:7:8
(?:` +
        r +
        `:){6}(?:` +
        n +
        `|:` +
        r +
        `|:)|                             // 1:2:3:4:5:6::    1:2:3:4:5:6::8   1:2:3:4:5:6::8  1:2:3:4:5:6::1.2.3.4
(?:` +
        r +
        `:){5}(?::` +
        n +
        `|(?::` +
        r +
        `){1,2}|:)|                   // 1:2:3:4:5::      1:2:3:4:5::7:8   1:2:3:4:5::8    1:2:3:4:5::7:1.2.3.4
(?:` +
        r +
        `:){4}(?:(?::` +
        r +
        `){0,1}:` +
        n +
        `|(?::` +
        r +
        `){1,3}|:)| // 1:2:3:4::        1:2:3:4::6:7:8   1:2:3:4::8      1:2:3:4::6:7:1.2.3.4
(?:` +
        r +
        `:){3}(?:(?::` +
        r +
        `){0,2}:` +
        n +
        `|(?::` +
        r +
        `){1,4}|:)| // 1:2:3::          1:2:3::5:6:7:8   1:2:3::8        1:2:3::5:6:7:1.2.3.4
(?:` +
        r +
        `:){2}(?:(?::` +
        r +
        `){0,3}:` +
        n +
        `|(?::` +
        r +
        `){1,5}|:)| // 1:2::            1:2::4:5:6:7:8   1:2::8          1:2::4:5:6:7:1.2.3.4
(?:` +
        r +
        `:){1}(?:(?::` +
        r +
        `){0,4}:` +
        n +
        `|(?::` +
        r +
        `){1,6}|:)| // 1::              1::3:4:5:6:7:8   1::8            1::3:4:5:6:7:1.2.3.4
(?::(?:(?::` +
        r +
        `){0,5}:` +
        n +
        `|(?::` +
        r +
        `){1,7}|:))             // ::2:3:4:5:6:7:8  ::2:3:4:5:6:7:8  ::8             ::1.2.3.4
)(?:%[0-9a-zA-Z]{1,})?                                             // %eth0            %1
`
      )
        .replace(/\s*\/\/.*$/gm, ``)
        .replace(/\n/g, ``)
        .trim(),
      a = RegExp(`(?:^` + n + `$)|(?:^` + i + `$)`),
      o = RegExp(`^` + n + `$`),
      s = RegExp(`^` + i + `$`),
      c = function (e) {
        return e && e.exact ? a : RegExp(`(?:` + t(e) + n + t(e) + `)|(?:` + t(e) + i + t(e) + `)`, `g`);
      };
    ((c.v4 = function (e) {
      return e && e.exact ? o : RegExp(`` + t(e) + n + t(e), `g`);
    }),
      (c.v6 = function (e) {
        return e && e.exact ? s : RegExp(`` + t(e) + i + t(e), `g`);
      }));
    var l = `(?:(?:[a-z]+:)?//)`,
      u = `(?:\\S+(?::\\S*)?@)?`,
      d = c.v4().source,
      f = c.v6().source,
      p =
        `(?:` +
        l +
        `|www\\.)` +
        u +
        `(?:localhost|` +
        d +
        `|` +
        f +
        `|(?:(?:[a-z\\u00a1-\\uffff0-9][-_]*)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))(?::\\d{2,5})?(?:[/?#][^\\s"]*)?`;
    return ((_n = RegExp(`(?:^` + p + `$)`, `i`)), _n);
  },
  yn = {
    email:
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+\.)+[a-zA-Z\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]{2,}))$/,
    hex: /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i
  },
  bn = {
    integer: function (e) {
      return bn.number(e) && parseInt(e, 10) === e;
    },
    float: function (e) {
      return bn.number(e) && !bn.integer(e);
    },
    array: function (e) {
      return Array.isArray(e);
    },
    regexp: function (e) {
      if (e instanceof RegExp) return !0;
      try {
        return !!new RegExp(e);
      } catch {
        return !1;
      }
    },
    date: function (e) {
      return (
        typeof e.getTime == `function` &&
        typeof e.getMonth == `function` &&
        typeof e.getYear == `function` &&
        !isNaN(e.getTime())
      );
    },
    number: function (e) {
      return isNaN(e) ? !1 : typeof e == `number`;
    },
    object: function (e) {
      return typeof e == `object` && !bn.array(e);
    },
    method: function (e) {
      return typeof e == `function`;
    },
    email: function (e) {
      return typeof e == `string` && e.length <= 320 && !!e.match(yn.email);
    },
    url: function (e) {
      return typeof e == `string` && e.length <= 2048 && !!e.match(vn());
    },
    hex: function (e) {
      return typeof e == `string` && !!e.match(yn.hex);
    }
  },
  xn = function (e, t, n, r, i) {
    if (e.required && t === void 0) {
      hn(e, t, n, r, i);
      return;
    }
    var a = [`integer`, `float`, `array`, `regexp`, `object`, `method`, `email`, `number`, `date`, `url`, `hex`],
      o = e.type;
    a.indexOf(o) > -1
      ? bn[o](t) || r.push(nn(i.messages.types[o], e.fullField, e.type))
      : o && typeof t !== e.type && r.push(nn(i.messages.types[o], e.fullField, e.type));
  },
  Sn = function (e, t, n, r, i) {
    var a = typeof e.len == `number`,
      o = typeof e.min == `number`,
      s = typeof e.max == `number`,
      c = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
      l = t,
      u = null,
      d = typeof t == `number`,
      f = typeof t == `string`,
      p = Array.isArray(t);
    if ((d ? (u = `number`) : f ? (u = `string`) : p && (u = `array`), !u)) return !1;
    (p && (l = t.length),
      f && (l = t.replace(c, `_`).length),
      a
        ? l !== e.len && r.push(nn(i.messages[u].len, e.fullField, e.len))
        : o && !s && l < e.min
          ? r.push(nn(i.messages[u].min, e.fullField, e.min))
          : s && !o && l > e.max
            ? r.push(nn(i.messages[u].max, e.fullField, e.max))
            : o && s && (l < e.min || l > e.max) && r.push(nn(i.messages[u].range, e.fullField, e.min, e.max)));
  },
  Cn = `enum`,
  Q = {
    required: hn,
    whitespace: gn,
    type: xn,
    range: Sn,
    enum: function (e, t, n, r, i) {
      ((e[Cn] = Array.isArray(e[Cn]) ? e[Cn] : []),
        e[Cn].indexOf(t) === -1 && r.push(nn(i.messages[Cn], e.fullField, e[Cn].join(`, `))));
    },
    pattern: function (e, t, n, r, i) {
      e.pattern &&
        (e.pattern instanceof RegExp
          ? ((e.pattern.lastIndex = 0),
            e.pattern.test(t) || r.push(nn(i.messages.pattern.mismatch, e.fullField, t, e.pattern)))
          : typeof e.pattern == `string` &&
            (new RegExp(e.pattern).test(t) || r.push(nn(i.messages.pattern.mismatch, e.fullField, t, e.pattern))));
    }
  },
  wn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t, `string`) && !e.required) return n();
      (Q.required(e, t, r, a, i, `string`),
        an(t, `string`) ||
          (Q.type(e, t, r, a, i),
          Q.range(e, t, r, a, i),
          Q.pattern(e, t, r, a, i),
          e.whitespace === !0 && Q.whitespace(e, t, r, a, i)));
    }
    n(a);
  },
  Tn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t) && !e.required) return n();
      (Q.required(e, t, r, a, i), t !== void 0 && Q.type(e, t, r, a, i));
    }
    n(a);
  },
  En = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if ((t === `` && (t = void 0), an(t) && !e.required)) return n();
      (Q.required(e, t, r, a, i), t !== void 0 && (Q.type(e, t, r, a, i), Q.range(e, t, r, a, i)));
    }
    n(a);
  },
  Dn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t) && !e.required) return n();
      (Q.required(e, t, r, a, i), t !== void 0 && Q.type(e, t, r, a, i));
    }
    n(a);
  },
  On = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t) && !e.required) return n();
      (Q.required(e, t, r, a, i), an(t) || Q.type(e, t, r, a, i));
    }
    n(a);
  },
  kn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t) && !e.required) return n();
      (Q.required(e, t, r, a, i), t !== void 0 && (Q.type(e, t, r, a, i), Q.range(e, t, r, a, i)));
    }
    n(a);
  },
  An = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t) && !e.required) return n();
      (Q.required(e, t, r, a, i), t !== void 0 && (Q.type(e, t, r, a, i), Q.range(e, t, r, a, i)));
    }
    n(a);
  },
  jn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (t == null && !e.required) return n();
      (Q.required(e, t, r, a, i, `array`), t != null && (Q.type(e, t, r, a, i), Q.range(e, t, r, a, i)));
    }
    n(a);
  },
  Mn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t) && !e.required) return n();
      (Q.required(e, t, r, a, i), t !== void 0 && Q.type(e, t, r, a, i));
    }
    n(a);
  },
  Nn = `enum`,
  Pn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t) && !e.required) return n();
      (Q.required(e, t, r, a, i), t !== void 0 && Q[Nn](e, t, r, a, i));
    }
    n(a);
  },
  Fn = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t, `string`) && !e.required) return n();
      (Q.required(e, t, r, a, i), an(t, `string`) || Q.pattern(e, t, r, a, i));
    }
    n(a);
  },
  In = function (e, t, n, r, i) {
    var a = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t, `date`) && !e.required) return n();
      if ((Q.required(e, t, r, a, i), !an(t, `date`))) {
        var o = t instanceof Date ? t : new Date(t);
        (Q.type(e, o, r, a, i), o && Q.range(e, o.getTime(), r, a, i));
      }
    }
    n(a);
  },
  Ln = function (e, t, n, r, i) {
    var a = [],
      o = Array.isArray(t) ? `array` : typeof t;
    (Q.required(e, t, r, a, i, o), n(a));
  },
  Rn = function (e, t, n, r, i) {
    var a = e.type,
      o = [];
    if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
      if (an(t, a) && !e.required) return n();
      (Q.required(e, t, r, o, i, a), an(t, a) || Q.type(e, t, r, o, i));
    }
    n(o);
  },
  zn = {
    string: wn,
    method: Tn,
    number: En,
    boolean: Dn,
    regexp: On,
    integer: kn,
    float: An,
    array: jn,
    object: Mn,
    enum: Pn,
    pattern: Fn,
    date: In,
    url: Rn,
    hex: Rn,
    email: Rn,
    required: Ln,
    any: function (e, t, n, r, i) {
      var a = [];
      if (e.required || (!e.required && r.hasOwnProperty(e.field))) {
        if (an(t) && !e.required) return n();
        Q.required(e, t, r, a, i);
      }
      n(a);
    }
  };
function Bn() {
  return {
    default: `Validation error on field %s`,
    required: `%s is required`,
    enum: `%s must be one of %s`,
    whitespace: `%s cannot be empty`,
    date: {
      format: `%s date %s is invalid for format %s`,
      parse: `%s date could not be parsed, %s is invalid `,
      invalid: `%s date %s is invalid`
    },
    types: {
      string: `%s is not a %s`,
      method: `%s is not a %s (function)`,
      array: `%s is not an %s`,
      object: `%s is not an %s`,
      number: `%s is not a %s`,
      date: `%s is not a %s`,
      boolean: `%s is not a %s`,
      integer: `%s is not an %s`,
      float: `%s is not a %s`,
      regexp: `%s is not a valid %s`,
      email: `%s is not a valid %s`,
      url: `%s is not a valid %s`,
      hex: `%s is not a valid %s`
    },
    string: {
      len: `%s must be exactly %s characters`,
      min: `%s must be at least %s characters`,
      max: `%s cannot be longer than %s characters`,
      range: `%s must be between %s and %s characters`
    },
    number: {
      len: `%s must equal %s`,
      min: `%s cannot be less than %s`,
      max: `%s cannot be greater than %s`,
      range: `%s must be between %s and %s`
    },
    array: {
      len: `%s must be exactly %s in length`,
      min: `%s cannot be less than %s in length`,
      max: `%s cannot be greater than %s in length`,
      range: `%s must be between %s and %s in length`
    },
    pattern: { mismatch: `%s value %s does not match pattern %s` },
    clone: function () {
      var e = JSON.parse(JSON.stringify(this));
      return ((e.clone = this.clone), e);
    }
  };
}
var Vn = Bn(),
  Hn = (function () {
    function e(e) {
      ((this.rules = null), (this._messages = Vn), this.define(e));
    }
    var t = e.prototype;
    return (
      (t.define = function (e) {
        var t = this;
        if (!e) throw Error(`Cannot configure a schema with no rules`);
        if (typeof e != `object` || Array.isArray(e)) throw Error(`Rules must be an object`);
        ((this.rules = {}),
          Object.keys(e).forEach(function (n) {
            var r = e[n];
            t.rules[n] = Array.isArray(r) ? r : [r];
          }));
      }),
      (t.messages = function (e) {
        return (e && (this._messages = mn(Bn(), e)), this._messages);
      }),
      (t.validate = function (t, n, r) {
        var i = this;
        (n === void 0 && (n = {}), r === void 0 && (r = function () {}));
        var a = t,
          o = n,
          s = r;
        if ((typeof o == `function` && ((s = o), (o = {})), !this.rules || Object.keys(this.rules).length === 0))
          return (s && s(null, a), Promise.resolve(a));
        function c(e) {
          var t = [],
            n = {};
          function r(e) {
            if (Array.isArray(e)) {
              var n;
              t = (n = t).concat.apply(n, e);
            } else t.push(e);
          }
          for (var i = 0; i < e.length; i++) r(e[i]);
          t.length ? ((n = tn(t)), s(t, n)) : s(null, a);
        }
        if (o.messages) {
          var l = this.messages();
          (l === Vn && (l = Bn()), mn(l, o.messages), (o.messages = l));
        } else o.messages = this.messages();
        var u = {};
        (o.keys || Object.keys(this.rules)).forEach(function (e) {
          var n = i.rules[e],
            r = a[e];
          n.forEach(function (n) {
            var o = n;
            (typeof o.transform == `function` && (a === t && (a = Gt({}, a)), (r = a[e] = o.transform(r))),
              (o = typeof o == `function` ? { validator: o } : Gt({}, o)),
              (o.validator = i.getValidationMethod(o)),
              o.validator &&
                ((o.field = e),
                (o.fullField = o.fullField || e),
                (o.type = i.getType(o)),
                (u[e] = u[e] || []),
                u[e].push({ rule: o, value: r, source: a, field: e })));
          });
        });
        var d = {};
        return un(
          u,
          o,
          function (t, n) {
            var r = t.rule,
              i =
                (r.type === `object` || r.type === `array`) &&
                (typeof r.fields == `object` || typeof r.defaultField == `object`);
            ((i &&= r.required || (!r.required && t.value)), (r.field = t.field));
            function s(e, t) {
              return Gt({}, t, {
                fullField: r.fullField + `.` + e,
                fullFields: r.fullFields ? [].concat(r.fullFields, [e]) : [e]
              });
            }
            function c(c) {
              c === void 0 && (c = []);
              var l = Array.isArray(c) ? c : [c];
              (!o.suppressWarning && l.length && e.warning(`async-validator:`, l),
                l.length && r.message !== void 0 && (l = [].concat(r.message)));
              var u = l.map(pn(r, a));
              if (o.first && u.length) return ((d[r.field] = 1), n(u));
              if (!i) n(u);
              else {
                if (r.required && !t.value)
                  return (
                    r.message === void 0
                      ? o.error && (u = [o.error(r, nn(o.messages.required, r.field))])
                      : (u = [].concat(r.message).map(pn(r, a))),
                    n(u)
                  );
                var f = {};
                (r.defaultField &&
                  Object.keys(t.value).map(function (e) {
                    f[e] = r.defaultField;
                  }),
                  (f = Gt({}, f, t.rule.fields)));
                var p = {};
                Object.keys(f).forEach(function (e) {
                  var t = f[e];
                  p[e] = (Array.isArray(t) ? t : [t]).map(s.bind(null, e));
                });
                var m = new e(p);
                (m.messages(o.messages),
                  t.rule.options && ((t.rule.options.messages = o.messages), (t.rule.options.error = o.error)),
                  m.validate(t.value, t.rule.options || o, function (e) {
                    var t = [];
                    (u && u.length && t.push.apply(t, u), e && e.length && t.push.apply(t, e), n(t.length ? t : null));
                  }));
              }
            }
            var l;
            if (r.asyncValidator) l = r.asyncValidator(r, t.value, c, t.source, o);
            else if (r.validator) {
              try {
                l = r.validator(r, t.value, c, t.source, o);
              } catch (e) {
                (console.error == null || console.error(e),
                  o.suppressValidatorError ||
                    setTimeout(function () {
                      throw e;
                    }, 0),
                  c(e.message));
              }
              l === !0
                ? c()
                : l === !1
                  ? c(
                      typeof r.message == `function`
                        ? r.message(r.fullField || r.field)
                        : r.message || (r.fullField || r.field) + ` fails`
                    )
                  : l instanceof Array
                    ? c(l)
                    : l instanceof Error && c(l.message);
            }
            l &&
              l.then &&
              l.then(
                function () {
                  return c();
                },
                function (e) {
                  return c(e);
                }
              );
          },
          function (e) {
            c(e);
          },
          a
        );
      }),
      (t.getType = function (e) {
        if (
          (e.type === void 0 && e.pattern instanceof RegExp && (e.type = `pattern`),
          typeof e.validator != `function` && e.type && !zn.hasOwnProperty(e.type))
        )
          throw Error(nn(`Unknown rule type %s`, e.type));
        return e.type || `string`;
      }),
      (t.getValidationMethod = function (e) {
        if (typeof e.validator == `function`) return e.validator;
        var t = Object.keys(e),
          n = t.indexOf(`message`);
        return (
          n !== -1 && t.splice(n, 1),
          t.length === 1 && t[0] === `required` ? zn.required : zn[this.getType(e)] || void 0
        );
      }),
      e
    );
  })();
((Hn.register = function (e, t) {
  if (typeof t != `function`) throw Error(`Cannot register a validator by type, validator is not a function`);
  zn[e] = t;
}),
  (Hn.warning = en),
  (Hn.messages = Vn),
  (Hn.validators = zn));
var Un = [`role`, `aria-labelledby`],
  Wn = H({
    name: `ElFormItem`,
    __name: `form-item`,
    props: Lt,
    setup(e, { expose: t }) {
      let r = e,
        i = o(),
        c = ae(dt, void 0),
        u = ae(ze, void 0),
        d = ct(void 0, { formItem: !1 }),
        p = Fe(`form-item`),
        m = ke().value,
        _ = K([]),
        b = K(``),
        x = Ve(b, 100),
        S = K(``),
        C = K(),
        D,
        k = !1,
        M = f(() => r.labelPosition || c?.labelPosition),
        P = f(() => (M.value === `top` ? {} : { width: Ie(r.labelWidth ?? c?.labelWidth) })),
        I = f(() => {
          if (M.value === `top` || c?.inline || (!r.label && !r.labelWidth && oe)) return {};
          let e = Ie(r.labelWidth ?? c?.labelWidth);
          return !r.label && !i.label ? { marginLeft: e } : {};
        }),
        L = f(() => [
          p.b(),
          p.m(d.value),
          p.is(`error`, b.value === `error`),
          p.is(`validating`, b.value === `validating`),
          p.is(`success`, b.value === `success`),
          p.is(`required`, de.value || r.required),
          p.is(`no-asterisk`, c?.hideRequiredAsterisk),
          c?.requireAsteriskPosition === `right` ? `asterisk-right` : `asterisk-left`,
          { [p.m(`feedback`)]: c?.statusIcon, [p.m(`label-${M.value}`)]: M.value }
        ]),
        z = f(() => (ut(r.inlineMessage) ? r.inlineMessage : c?.inlineMessage || !1)),
        te = f(() => [p.e(`error`), { [p.em(`error`, `inline`)]: z.value }]),
        B = f(() => (r.prop ? (y(r.prop) ? r.prop.join(`.`) : r.prop) : ``)),
        ne = f(() => !!(r.label || i.label)),
        ie = f(() => r.for ?? (_.value.length === 1 ? _.value[0] : void 0)),
        H = f(() => !ie.value && ne.value),
        oe = !!u,
        se = f(() => {
          let e = c?.model;
          if (!(!e || !r.prop)) return ft(e, r.prop).value;
        }),
        ce = f(() => {
          let { required: e } = r,
            t = [];
          r.rules && t.push(...yt(r.rules));
          let n = c?.rules;
          if (n && r.prop) {
            let e = ft(n, r.prop).value;
            e && t.push(...yt(e));
          }
          if (e !== void 0) {
            let n = t.map((e, t) => [e, t]).filter(([e]) => `required` in e);
            if (n.length > 0) for (let [r, i] of n) r.required !== e && (t[i] = { ...r, required: e });
            else t.push({ required: e });
          }
          return t;
        }),
        le = f(() => ce.value.length > 0),
        ue = e =>
          ce.value
            .filter(t => (!t.trigger || !e ? !0 : y(t.trigger) ? t.trigger.includes(e) : t.trigger === e))
            .map(({ trigger: e, ...t }) => t),
        de = f(() => ce.value.some(e => e.required)),
        fe = f(() => x.value === `error` && r.showMessage && (c?.showMessage ?? !0)),
        pe = f(() => `${r.label || ``}${c?.labelSuffix || ``}`),
        me = e => {
          b.value = e;
        },
        ge = e => {
          let { errors: t, fields: n } = e;
          ((!t || !n) && console.error(e),
            me(`error`),
            (S.value = t ? (t?.[0]?.message ?? `${r.prop} is required`) : ``),
            c?.emit(`validate`, r.prop, !1, S.value));
        },
        _e = () => {
          (me(`success`), c?.emit(`validate`, r.prop, !0, ``));
        },
        q = async e => {
          let t = B.value;
          return new Hn({ [t]: e })
            .validate({ [t]: se.value }, { firstFields: !0 })
            .then(() => (_e(), !0))
            .catch(e => (ge(e), Promise.reject(e)));
        },
        ve = async (e, t) => {
          if (k || !r.prop) return !1;
          let n = F(t);
          if (!le.value) return (t?.(!1), !1);
          let i = ue(e);
          return i.length === 0
            ? (t?.(!0), !0)
            : (me(`validating`),
              q(i)
                .then(() => (t?.(!0), !0))
                .catch(e => {
                  let { fields: r } = e;
                  return (t?.(!1, r), n ? !1 : Promise.reject(r));
                }));
        },
        ye = () => {
          (me(``), (S.value = ``), (k = !1));
        },
        be = async () => {
          let e = c?.model;
          if (!e || !r.prop) return;
          let t = ft(e, r.prop);
          ((k = !0), (t.value = Pt(D)), await re(), ye(), (k = !1));
        },
        xe = e => {
          _.value.includes(e) || _.value.push(e);
        },
        Se = e => {
          _.value = _.value.filter(t => t !== e);
        },
        Ce = e => {
          D = Pt(e);
        },
        we = () => D;
      (g(
        () => r.error,
        e => {
          ((S.value = e || ``), me(e ? `error` : ``));
        },
        { immediate: !0 }
      ),
        g(
          () => r.validateStatus,
          e => me(e || ``)
        ));
      let Te = h({
        ...l(r),
        $el: C,
        size: d,
        validateMessage: S,
        validateState: b,
        labelId: m,
        inputIds: _,
        isGroup: H,
        hasLabel: ne,
        fieldValue: se,
        addInputId: xe,
        removeInputId: Se,
        resetField: be,
        clearValidate: ye,
        validate: ve,
        propString: B,
        setInitialValue: Ce,
        getInitialValue: we
      });
      return (
        he(ze, Te),
        g(B, (e, t) => {
          !c || !t || (c.removeField(Te, t), e && (Ce(se.value), c.addField(Te)));
        }),
        V(() => {
          r.prop && (Ce(se.value), c?.addField(Te));
        }),
        R(() => {
          c?.removeField(Te);
        }),
        t({
          size: d,
          validateMessage: S,
          validateState: b,
          validate: ve,
          clearValidate: ye,
          resetField: be,
          setInitialValue: Ce
        }),
        (t, r) => (
          O(),
          v(
            `div`,
            {
              ref_key: `formItemRef`,
              ref: C,
              class: A(L.value),
              role: H.value ? `group` : void 0,
              'aria-labelledby': H.value ? U(m) : void 0
            },
            [
              G(
                U(Wt),
                { 'is-auto-width': P.value.width === `auto`, 'update-all': U(c)?.labelWidth === `auto` },
                {
                  default: n(() => [
                    e.label || t.$slots.label
                      ? (O(),
                        w(
                          a(ie.value ? `label` : `div`),
                          { key: 0, id: U(m), for: ie.value, class: A(U(p).e(`label`)), style: W(P.value) },
                          {
                            default: n(() => [j(t.$slots, `label`, { label: pe.value }, () => [ee(N(pe.value), 1)])]),
                            _: 3
                          },
                          8,
                          [`id`, `for`, `class`, `style`]
                        ))
                      : E(`v-if`, !0)
                  ]),
                  _: 3
                },
                8,
                [`is-auto-width`, `update-all`]
              ),
              T(
                `div`,
                { class: A(U(p).e(`content`)), style: W(I.value) },
                [
                  j(t.$slots, `default`),
                  G(
                    s,
                    { name: `${U(p).namespace.value}-zoom-in-top` },
                    {
                      default: n(() => [
                        fe.value
                          ? j(t.$slots, `error`, { key: 0, error: S.value }, () => [
                              T(`div`, { class: A(te.value) }, N(S.value), 3)
                            ])
                          : E(`v-if`, !0)
                      ]),
                      _: 3
                    },
                    8,
                    [`name`]
                  )
                ],
                6
              )
            ],
            10,
            Un
          )
        )
      );
    }
  }),
  Gn = Se(Ht, { FormItem: Wn }),
  Kn = qe(Wn),
  qn = [`hours`, `minutes`, `seconds`],
  Jn = `EP_PICKER_BASE`,
  Yn = `ElPopperOptions`,
  Xn = Symbol(`commonPickerContextKey`),
  Zn = `HH:mm:ss`,
  Qn = `YYYY-MM-DD`,
  $n = {
    date: Qn,
    dates: Qn,
    week: `gggg[w]ww`,
    year: `YYYY`,
    years: `YYYY`,
    month: `YYYY-MM`,
    months: `YYYY-MM`,
    datetime: `${Qn} ${Zn}`,
    monthrange: `YYYY-MM`,
    yearrange: `YYYY`,
    daterange: Qn,
    datetimerange: `${Qn} ${Zn}`
  },
  $ = L(
    me((e, t) => {
      (function (n, r) {
        typeof e == `object` && t !== void 0
          ? (t.exports = r())
          : typeof define == `function` && define.amd
            ? define(r)
            : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs = r());
      })(e, function () {
        var e = 1e3,
          t = 6e4,
          n = 36e5,
          r = `millisecond`,
          i = `second`,
          a = `minute`,
          o = `hour`,
          s = `day`,
          c = `week`,
          l = `month`,
          u = `quarter`,
          d = `year`,
          f = `date`,
          p = `Invalid Date`,
          m = /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/,
          h = /\[([^\]]+)]|YYYY|YY|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,
          g = {
            name: `en`,
            weekdays: `Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday`.split(`_`),
            months: `January_February_March_April_May_June_July_August_September_October_November_December`.split(`_`),
            ordinal: function (e) {
              var t = [`th`, `st`, `nd`, `rd`],
                n = e % 100;
              return `[` + e + (t[(n - 20) % 10] || t[n] || t[0]) + `]`;
            }
          },
          _ = function (e, t, n) {
            var r = String(e);
            return !r || r.length >= t ? e : `` + Array(t + 1 - r.length).join(n) + e;
          },
          v = {
            s: _,
            z: function (e) {
              var t = -e.utcOffset(),
                n = Math.abs(t),
                r = Math.floor(n / 60),
                i = n % 60;
              return (t <= 0 ? `+` : `-`) + _(r, 2, `0`) + `:` + _(i, 2, `0`);
            },
            m: function e(t, n) {
              if (t.date() < n.date()) return -e(n, t);
              var r = 12 * (n.year() - t.year()) + (n.month() - t.month()),
                i = t.clone().add(r, l),
                a = n - i < 0,
                o = t.clone().add(r + (a ? -1 : 1), l);
              return +(-(r + (n - i) / (a ? i - o : o - i)) || 0);
            },
            a: function (e) {
              return e < 0 ? Math.ceil(e) || 0 : Math.floor(e);
            },
            p: function (e) {
              return (
                { M: l, y: d, w: c, d: s, D: f, h: o, m: a, s: i, ms: r, Q: u }[e] ||
                String(e || ``)
                  .toLowerCase()
                  .replace(/s$/, ``)
              );
            },
            u: function (e) {
              return e === void 0;
            }
          },
          y = `en`,
          b = {};
        b[y] = g;
        var x = `$isDayjsObject`,
          S = function (e) {
            return e instanceof E || !(!e || !e[x]);
          },
          C = function e(t, n, r) {
            var i;
            if (!t) return y;
            if (typeof t == `string`) {
              var a = t.toLowerCase();
              (b[a] && (i = a), n && ((b[a] = n), (i = a)));
              var o = t.split(`-`);
              if (!i && o.length > 1) return e(o[0]);
            } else {
              var s = t.name;
              ((b[s] = t), (i = s));
            }
            return (!r && i && (y = i), i || (!r && y));
          },
          w = function (e, t) {
            if (S(e)) return e.clone();
            var n = typeof t == `object` ? t : {};
            return ((n.date = e), (n.args = arguments), new E(n));
          },
          T = v;
        ((T.l = C),
          (T.i = S),
          (T.w = function (e, t) {
            return w(e, { locale: t.$L, utc: t.$u, x: t.$x, $offset: t.$offset });
          }));
        var E = (function () {
            function g(e) {
              ((this.$L = C(e.locale, null, !0)), this.parse(e), (this.$x = this.$x || e.x || {}), (this[x] = !0));
            }
            var _ = g.prototype;
            return (
              (_.parse = function (e) {
                ((this.$d = (function (e) {
                  var t = e.date,
                    n = e.utc;
                  if (t === null) return new Date(NaN);
                  if (T.u(t)) return new Date();
                  if (t instanceof Date) return new Date(t);
                  if (typeof t == `string` && !/Z$/i.test(t)) {
                    var r = t.match(m);
                    if (r) {
                      var i = r[2] - 1 || 0,
                        a = (r[7] || `0`).substring(0, 3);
                      return n
                        ? new Date(Date.UTC(r[1], i, r[3] || 1, r[4] || 0, r[5] || 0, r[6] || 0, a))
                        : new Date(r[1], i, r[3] || 1, r[4] || 0, r[5] || 0, r[6] || 0, a);
                    }
                  }
                  return new Date(t);
                })(e)),
                  this.init());
              }),
              (_.init = function () {
                var e = this.$d;
                ((this.$y = e.getFullYear()),
                  (this.$M = e.getMonth()),
                  (this.$D = e.getDate()),
                  (this.$W = e.getDay()),
                  (this.$H = e.getHours()),
                  (this.$m = e.getMinutes()),
                  (this.$s = e.getSeconds()),
                  (this.$ms = e.getMilliseconds()));
              }),
              (_.$utils = function () {
                return T;
              }),
              (_.isValid = function () {
                return this.$d.toString() !== p;
              }),
              (_.isSame = function (e, t) {
                var n = w(e);
                return this.startOf(t) <= n && n <= this.endOf(t);
              }),
              (_.isAfter = function (e, t) {
                return w(e) < this.startOf(t);
              }),
              (_.isBefore = function (e, t) {
                return this.endOf(t) < w(e);
              }),
              (_.$g = function (e, t, n) {
                return T.u(e) ? this[t] : this.set(n, e);
              }),
              (_.unix = function () {
                return Math.floor(this.valueOf() / 1e3);
              }),
              (_.valueOf = function () {
                return this.$d.getTime();
              }),
              (_.startOf = function (e, t) {
                var n = this,
                  r = !!T.u(t) || t,
                  u = T.p(e),
                  p = function (e, t) {
                    var i = T.w(n.$u ? Date.UTC(n.$y, t, e) : new Date(n.$y, t, e), n);
                    return r ? i : i.endOf(s);
                  },
                  m = function (e, t) {
                    return T.w(n.toDate()[e].apply(n.toDate(`s`), (r ? [0, 0, 0, 0] : [23, 59, 59, 999]).slice(t)), n);
                  },
                  h = this.$W,
                  g = this.$M,
                  _ = this.$D,
                  v = `set` + (this.$u ? `UTC` : ``);
                switch (u) {
                  case d:
                    return r ? p(1, 0) : p(31, 11);
                  case l:
                    return r ? p(1, g) : p(0, g + 1);
                  case c:
                    var y = this.$locale().weekStart || 0,
                      b = (h < y ? h + 7 : h) - y;
                    return p(r ? _ - b : _ + (6 - b), g);
                  case s:
                  case f:
                    return m(v + `Hours`, 0);
                  case o:
                    return m(v + `Minutes`, 1);
                  case a:
                    return m(v + `Seconds`, 2);
                  case i:
                    return m(v + `Milliseconds`, 3);
                  default:
                    return this.clone();
                }
              }),
              (_.endOf = function (e) {
                return this.startOf(e, !1);
              }),
              (_.$set = function (e, t) {
                var n,
                  c = T.p(e),
                  u = `set` + (this.$u ? `UTC` : ``),
                  p = ((n = {}),
                  (n[s] = u + `Date`),
                  (n[f] = u + `Date`),
                  (n[l] = u + `Month`),
                  (n[d] = u + `FullYear`),
                  (n[o] = u + `Hours`),
                  (n[a] = u + `Minutes`),
                  (n[i] = u + `Seconds`),
                  (n[r] = u + `Milliseconds`),
                  n)[c],
                  m = c === s ? this.$D + (t - this.$W) : t;
                if (c === l || c === d) {
                  var h = this.clone().set(f, 1);
                  (h.$d[p](m), h.init(), (this.$d = h.set(f, Math.min(this.$D, h.daysInMonth())).$d));
                } else p && this.$d[p](m);
                return (this.init(), this);
              }),
              (_.set = function (e, t) {
                return this.clone().$set(e, t);
              }),
              (_.get = function (e) {
                return this[T.p(e)]();
              }),
              (_.add = function (r, u) {
                var f,
                  p = this;
                r = Number(r);
                var m = T.p(u),
                  h = function (e) {
                    var t = w(p);
                    return T.w(t.date(t.date() + Math.round(e * r)), p);
                  };
                if (m === l) return this.set(l, this.$M + r);
                if (m === d) return this.set(d, this.$y + r);
                if (m === s) return h(1);
                if (m === c) return h(7);
                var g = ((f = {}), (f[a] = t), (f[o] = n), (f[i] = e), f)[m] || 1,
                  _ = this.$d.getTime() + r * g;
                return T.w(_, this);
              }),
              (_.subtract = function (e, t) {
                return this.add(-1 * e, t);
              }),
              (_.format = function (e) {
                var t = this,
                  n = this.$locale();
                if (!this.isValid()) return n.invalidDate || p;
                var r = e || `YYYY-MM-DDTHH:mm:ssZ`,
                  i = T.z(this),
                  a = this.$H,
                  o = this.$m,
                  s = this.$M,
                  c = n.weekdays,
                  l = n.months,
                  u = n.meridiem,
                  d = function (e, n, i, a) {
                    return (e && (e[n] || e(t, r))) || i[n].slice(0, a);
                  },
                  f = function (e) {
                    return T.s(a % 12 || 12, e, `0`);
                  },
                  m =
                    u ||
                    function (e, t, n) {
                      var r = e < 12 ? `AM` : `PM`;
                      return n ? r.toLowerCase() : r;
                    };
                return r.replace(h, function (e, r) {
                  return (
                    r ||
                    (function (e) {
                      switch (e) {
                        case `YY`:
                          return String(t.$y).slice(-2);
                        case `YYYY`:
                          return T.s(t.$y, 4, `0`);
                        case `M`:
                          return s + 1;
                        case `MM`:
                          return T.s(s + 1, 2, `0`);
                        case `MMM`:
                          return d(n.monthsShort, s, l, 3);
                        case `MMMM`:
                          return d(l, s);
                        case `D`:
                          return t.$D;
                        case `DD`:
                          return T.s(t.$D, 2, `0`);
                        case `d`:
                          return String(t.$W);
                        case `dd`:
                          return d(n.weekdaysMin, t.$W, c, 2);
                        case `ddd`:
                          return d(n.weekdaysShort, t.$W, c, 3);
                        case `dddd`:
                          return c[t.$W];
                        case `H`:
                          return String(a);
                        case `HH`:
                          return T.s(a, 2, `0`);
                        case `h`:
                          return f(1);
                        case `hh`:
                          return f(2);
                        case `a`:
                          return m(a, o, !0);
                        case `A`:
                          return m(a, o, !1);
                        case `m`:
                          return String(o);
                        case `mm`:
                          return T.s(o, 2, `0`);
                        case `s`:
                          return String(t.$s);
                        case `ss`:
                          return T.s(t.$s, 2, `0`);
                        case `SSS`:
                          return T.s(t.$ms, 3, `0`);
                        case `Z`:
                          return i;
                      }
                      return null;
                    })(e) ||
                    i.replace(`:`, ``)
                  );
                });
              }),
              (_.utcOffset = function () {
                return 15 * -Math.round(this.$d.getTimezoneOffset() / 15);
              }),
              (_.diff = function (r, f, p) {
                var m,
                  h = this,
                  g = T.p(f),
                  _ = w(r),
                  v = (_.utcOffset() - this.utcOffset()) * t,
                  y = this - _,
                  b = function () {
                    return T.m(h, _);
                  };
                switch (g) {
                  case d:
                    m = b() / 12;
                    break;
                  case l:
                    m = b();
                    break;
                  case u:
                    m = b() / 3;
                    break;
                  case c:
                    m = (y - v) / 6048e5;
                    break;
                  case s:
                    m = (y - v) / 864e5;
                    break;
                  case o:
                    m = y / n;
                    break;
                  case a:
                    m = y / t;
                    break;
                  case i:
                    m = y / e;
                    break;
                  default:
                    m = y;
                }
                return p ? m : T.a(m);
              }),
              (_.daysInMonth = function () {
                return this.endOf(l).$D;
              }),
              (_.$locale = function () {
                return b[this.$L];
              }),
              (_.locale = function (e, t) {
                if (!e) return this.$L;
                var n = this.clone(),
                  r = C(e, t, !0);
                return (r && (n.$L = r), n);
              }),
              (_.clone = function () {
                return T.w(this.$d, this);
              }),
              (_.toDate = function () {
                return new Date(this.valueOf());
              }),
              (_.toJSON = function () {
                return this.isValid() ? this.toISOString() : null;
              }),
              (_.toISOString = function () {
                return this.$d.toISOString();
              }),
              (_.toString = function () {
                return this.$d.toUTCString();
              }),
              g
            );
          })(),
          D = E.prototype;
        return (
          (w.prototype = D),
          [
            [`$ms`, r],
            [`$s`, i],
            [`$m`, a],
            [`$H`, o],
            [`$W`, s],
            [`$M`, l],
            [`$y`, d],
            [`$D`, f]
          ].forEach(function (e) {
            D[e[1]] = function (t) {
              return this.$g(t, e[0], e[1]);
            };
          }),
          (w.extend = function (e, t) {
            return ((e.$i ||= (e(t, E, w), !0)), w);
          }),
          (w.locale = C),
          (w.isDayjs = S),
          (w.unix = function (e) {
            return w(1e3 * e);
          }),
          (w.en = b[y]),
          (w.Ls = b),
          (w.p = {}),
          w
        );
      });
    })(),
    1
  ),
  er = (e, t) => [e > 0 ? e - 1 : void 0, e, e < t ? e + 1 : void 0],
  tr = e => Array.from(Array.from({ length: e }).keys()),
  nr = e =>
    e
      .replace(/\W?m{1,2}|\W?ZZ/g, ``)
      .replace(/\W?h{1,2}|\W?s{1,3}|\W?a/gi, ``)
      .trim(),
  rr = e => e.replace(/\W?D{1,2}|\W?Do|\W?d{1,4}|\W?M{1,4}|\W?Y{2,4}/g, ``).trim(),
  ir = function (e, n) {
    let r = t(e),
      i = t(n);
    return r && i ? e.getTime() === n.getTime() : !r && !i ? e === n : !1;
  },
  ar = function (e, t) {
    let n = y(e),
      r = y(t);
    return n && r ? (e.length === t.length ? e.every((e, n) => ir(e, t[n])) : !1) : !n && !r ? ir(e, t) : !1;
  },
  or = function (e, t, n) {
    let r = xe(t) || t === `x` ? (0, $.default)(e).locale(n) : (0, $.default)(e, t).locale(n);
    return r.isValid() ? r : void 0;
  },
  sr = function (e, t, n) {
    return xe(t) ? e : t === `x` ? +e : (0, $.default)(e).locale(n).format(t);
  },
  cr = (e, t) => {
    let n = [],
      r = t?.();
    for (let t = 0; t < e; t++) n.push(r?.includes(t) ?? !1);
    return n;
  },
  lr = e => (y(e) ? e.map(e => e.toDate()) : e.toDate()),
  ur = J({
    disabledHours: { type: X(Function) },
    disabledMinutes: { type: X(Function) },
    disabledSeconds: { type: X(Function) }
  }),
  dr = J({
    visible: Boolean,
    actualVisible: { type: Boolean, default: void 0 },
    format: { type: String, default: `` }
  }),
  fr = J({
    automaticDropdown: { type: Boolean, default: !0 },
    id: { type: X([Array, String]) },
    name: { type: X([Array, String]) },
    popperClass: Ye.popperClass,
    popperStyle: Ye.popperStyle,
    format: String,
    valueFormat: String,
    dateFormat: String,
    timeFormat: String,
    type: { type: String, default: `` },
    clearable: { type: Boolean, default: !0 },
    clearIcon: { type: X([String, Object]), default: M },
    editable: { type: Boolean, default: !0 },
    saveOnBlur: { type: Boolean, default: !0 },
    prefixIcon: { type: X([String, Object]), default: `` },
    size: je,
    readonly: Boolean,
    disabled: { type: Boolean, default: void 0 },
    placeholder: { type: String, default: `` },
    popperOptions: { type: X(Object), default: () => ({}) },
    modelValue: { type: X([Date, Array, String, Number]), default: `` },
    rangeSeparator: { type: String, default: `-` },
    startPlaceholder: String,
    endPlaceholder: String,
    defaultValue: { type: X([Date, Array]) },
    defaultTime: { type: X([Date, Array]) },
    isRange: Boolean,
    ...ur,
    disabledDate: { type: Function },
    cellClassName: { type: Function },
    shortcuts: { type: Array, default: () => [] },
    arrowControl: Boolean,
    tabindex: { type: X([String, Number]), default: 0 },
    validateEvent: { type: Boolean, default: !0 },
    unlinkPanels: Boolean,
    singlePanel: Boolean,
    placement: { type: X(String), values: Me, default: `bottom` },
    fallbackPlacements: { type: X(Array), default: [`bottom`, `top`, `right`, `left`] },
    ...Ae,
    ...q([`ariaLabel`]),
    showNow: { type: Boolean, default: !0 },
    showConfirm: { type: Boolean, default: !0 },
    showFooter: { type: Boolean, default: !0 },
    showWeekNumber: Boolean
  }),
  pr = J({
    id: { type: X(Array) },
    name: { type: X(Array) },
    modelValue: { type: X([Array, String]) },
    startPlaceholder: String,
    endPlaceholder: String,
    disabled: Boolean
  }),
  mr = (e, t) => {
    let { lang: n } = Ee(),
      r = K(!1),
      i = K(!1),
      a = K(null),
      o = f(() => {
        let { modelValue: t } = e;
        return !t || (y(t) && !t.filter(Boolean).length);
      }),
      s = r => {
        if (!ar(e.modelValue, r)) {
          let i;
          (y(r) ? (i = r.map(t => sr(t, e.valueFormat, n.value))) : r && (i = sr(r, e.valueFormat, n.value)),
            t(_t, r && i, n.value));
        }
      },
      c = f(() => {
        let t;
        if (
          (o.value
            ? l.value.getDefaultValue && (t = l.value.getDefaultValue())
            : (t = y(e.modelValue)
                ? e.modelValue.map(t => or(t, e.valueFormat, n.value))
                : or(e.modelValue ?? ``, e.valueFormat, n.value)),
          l.value.getRangeAvailableTime)
        ) {
          let e = l.value.getRangeAvailableTime(t);
          ve(e, t) || ((t = e), o.value || s(lr(t)));
        }
        return (y(t) && t.some(e => !e) && (t = []), t);
      }),
      l = K({});
    return {
      parsedValue: c,
      pickerActualVisible: i,
      pickerOptions: l,
      pickerVisible: r,
      userInput: a,
      valueIsEmpty: o,
      emitInput: s,
      onCalendarChange: e => {
        t(`calendar-change`, e);
      },
      onPanelChange: (e, n, r) => {
        t(`panel-change`, e, n, r);
      },
      onPick: (e = ``, t = !1) => {
        r.value = t;
        let n;
        ((n = y(e) ? e.map(e => e.toDate()) : e && e.toDate()), (a.value = null), s(n));
      },
      onSetPickerOption: e => {
        ((l.value[e[0]] = e[1]), (l.value.panelReady = !0));
      }
    };
  },
  hr = [`id`, `name`, `placeholder`, `value`, `disabled`],
  gr = [`id`, `name`, `placeholder`, `value`, `disabled`],
  _r = H({
    name: `PickerRangeTrigger`,
    inheritAttrs: !1,
    __name: `picker-range-trigger`,
    props: pr,
    emits: [
      `mouseenter`,
      `mouseleave`,
      `click`,
      `touchstart`,
      `focus`,
      `blur`,
      `startInput`,
      `endInput`,
      `startChange`,
      `endChange`
    ],
    setup(e, { expose: t, emit: n }) {
      let r = e,
        i = n,
        { formItem: a } = Y(),
        { inputId: o } = Ue(h({ id: f(() => r.id?.[0]) }), { formItemContext: a }),
        s = At(),
        c = Fe(`date`),
        l = Fe(`range`),
        u = K(),
        d = K(),
        { wrapperRef: p, isFocused: m } = Ct(u, { disabled: f(() => r.disabled) }),
        g = e => {
          i(`click`, e);
        },
        _ = e => {
          i(`mouseenter`, e);
        },
        y = e => {
          i(`mouseleave`, e);
        },
        b = e => {
          i(`touchstart`, e);
        },
        x = e => {
          i(`startInput`, e);
        },
        S = e => {
          i(`endInput`, e);
        },
        C = e => {
          i(`startChange`, e);
        },
        w = e => {
          i(`endChange`, e);
        };
      return (
        t({
          focus: () => {
            u.value?.focus();
          },
          blur: () => {
            (u.value?.blur(), d.value?.blur());
          }
        }),
        (e, t) => (
          O(),
          v(
            `div`,
            {
              ref_key: `wrapperRef`,
              ref: p,
              class: A([U(c).is(`active`, U(m)), e.$attrs.class]),
              style: W(e.$attrs.style),
              onClick: g,
              onMouseenter: _,
              onMouseleave: y,
              onTouchstartPassive: b
            },
            [
              j(e.$slots, `prefix`),
              T(
                `input`,
                P(U(s), {
                  id: U(o),
                  ref_key: `inputRef`,
                  ref: u,
                  name: e.name && e.name[0],
                  placeholder: e.startPlaceholder,
                  value: e.modelValue && e.modelValue[0],
                  class: U(l).b(`input`),
                  disabled: e.disabled,
                  onInput: x,
                  onChange: C
                }),
                null,
                16,
                hr
              ),
              j(e.$slots, `range-separator`),
              T(
                `input`,
                P(U(s), {
                  id: e.id && e.id[1],
                  ref_key: `endInputRef`,
                  ref: d,
                  name: e.name && e.name[1],
                  placeholder: e.endPlaceholder,
                  value: e.modelValue && e.modelValue[1],
                  class: U(l).b(`input`),
                  disabled: e.disabled,
                  onInput: S,
                  onChange: w
                }),
                null,
                16,
                gr
              ),
              j(e.$slots, `suffix`)
            ],
            38
          )
        )
      );
    }
  }),
  vr = H({
    name: `Picker`,
    __name: `picker`,
    props: fr,
    emits: [_t, gt, `focus`, `blur`, `clear`, `calendar-change`, `panel-change`, `visible-change`, `keydown`],
    setup(e, { expose: t, emit: r }) {
      let i = e,
        o = r,
        s = b(),
        c = Fe(`date`),
        l = Fe(`input`),
        d = Fe(`range`),
        { formItem: m } = Y(),
        h = ae(Yn, {}),
        _ = Ke(i, null),
        v = K(),
        x = K(),
        S = K(null),
        C = !1,
        D = Re(),
        M = mr(i, o),
        {
          parsedValue: F,
          pickerActualVisible: ee,
          userInput: I,
          pickerVisible: L,
          pickerOptions: z,
          valueIsEmpty: te,
          emitInput: B,
          onPick: ne,
          onSetPickerOption: V,
          onCalendarChange: ie,
          onPanelChange: H
        } = M,
        {
          isFocused: oe,
          handleFocus: se,
          handleBlur: ce
        } = Ct(x, {
          disabled: D,
          beforeFocus() {
            return i.readonly;
          },
          afterFocus() {
            i.automaticDropdown && (L.value = !0);
          },
          beforeBlur(e) {
            return !C && v.value?.isFocusInsideContent(e);
          },
          afterBlur() {
            (we.value && !i.saveOnBlur ? te.value || z.value.handleCancel?.() : Ve(),
              (L.value = !1),
              (C = !1),
              i.validateEvent && m?.validate(`blur`).catch(p));
          }
        }),
        le = K(!1),
        ue = f(() => [
          c.b(`editor`),
          c.bm(`editor`, i.type),
          l.e(`wrapper`),
          c.is(`disabled`, D.value),
          c.is(`active`, L.value),
          d.b(`editor`),
          Le ? d.bm(`editor`, Le.value) : ``,
          s.class
        ]),
        de = f(() => [l.e(`icon`), d.e(`close-icon`), ke.value ? `` : d.em(`close-icon`, `hidden`)]);
      g(L, e => {
        e
          ? re(() => {
              e && (S.value = i.modelValue);
            })
          : ((I.value = null),
            re(() => {
              fe(i.modelValue);
            }));
      });
      let fe = (e, t) => {
          (t || !ar(e, S.value)) && (o(gt, e), t && (S.value = e), i.validateEvent && m?.validate(`change`).catch(p));
        },
        G = e => {
          o(`keydown`, e);
        },
        me = f(() => (x.value ? Array.from(x.value.$el.querySelectorAll(`input`)) : [])),
        ge = (e, t, n) => {
          let r = me.value;
          r.length &&
            (!n || n === `min`
              ? (r[0].setSelectionRange(e, t), r[0].focus())
              : n === `max` && (r[1].setSelectionRange(e, t), r[1].focus()));
        },
        _e = () => {
          ee.value = !0;
        },
        q = () => {
          o(`visible-change`, !0);
        },
        ve = () => {
          ((ee.value = !1), (L.value = !1), o(`visible-change`, !1));
        },
        ye = () => {
          L.value = !0;
        },
        xe = () => {
          L.value = !1;
        },
        Se = f(() => {
          let e = Ue(F.value);
          return y(I.value)
            ? [I.value[0] ?? (e && e[0]) ?? ``, I.value[1] ?? (e && e[1]) ?? ``]
            : I.value === null
              ? (we.value && te.value && !i.saveOnBlur) || (!we.value && te.value) || (!L.value && te.value)
                ? ``
                : e
                  ? Te.value || Ee.value || De.value
                    ? e.join(`, `)
                    : e
                  : ``
              : I.value;
        }),
        Ce = f(() => i.type.includes(`time`)),
        we = f(() => i.type.startsWith(`time`)),
        Te = f(() => i.type === `dates`),
        Ee = f(() => i.type === `months`),
        De = f(() => i.type === `years`),
        Oe = f(() => i.prefixIcon || (Ce.value ? pe : k)),
        ke = f(() => i.clearable && !D.value && !i.readonly && !te.value && (le.value || oe.value)),
        Ae = e => {
          i.readonly ||
            D.value ||
            (ke.value &&
              (e?.stopPropagation(),
              z.value.handleClear ? z.value.handleClear() : B(_.valueOnClear.value),
              fe(_.valueOnClear.value, !0),
              ve()),
            o(`clear`));
        },
        je = async e => {
          i.readonly ||
            D.value ||
            ((e.target?.tagName !== `INPUT` || oe.value || !i.automaticDropdown) && (L.value = !0));
        },
        Me = () => {
          i.readonly || D.value || (!te.value && i.clearable && (le.value = !0));
        },
        Ne = () => {
          le.value = !1;
        },
        Pe = e => {
          i.readonly ||
            D.value ||
            ((e.touches[0].target?.tagName !== `INPUT` || oe.value || !i.automaticDropdown) && (L.value = !0));
        },
        Ie = f(() => i.type.includes(`range`)),
        Le = ct(),
        J = f(() => U(v)?.popperRef?.contentRef),
        ze = et(x, e => {
          let t = U(J),
            n = rt(x);
          (t && (e.target === t || e.composedPath().includes(t))) ||
            e.target === n ||
            (n && e.composedPath().includes(n)) ||
            (L.value = !1);
        });
      R(() => {
        ze?.();
      });
      let Ve = () => {
          if (we.value && !i.saveOnBlur) return;
          let e = y(I.value) && I.value.every(e => e === ``);
          if (I.value && !e) {
            let e = He(Se.value);
            e && (We(e) && B(lr(e)), (I.value = null));
          }
          (I.value === `` || e) && (B(_.valueOnClear.value), fe(_.valueOnClear.value, !0), (I.value = null));
        },
        He = e => (e ? z.value.parseUserInput(e) : null),
        Ue = e => (e ? (y(e) ? e.map(e => e.format(i.format)) : e.format(i.format)) : null),
        We = e => z.value.isValidValue(e),
        Ge = async e => {
          if (i.readonly || D.value) return;
          let t = pt(e);
          if ((G(e), t === be.esc)) {
            L.value === !0 && ((L.value = !1), e.preventDefault(), e.stopPropagation());
            return;
          }
          if (
            t === be.down &&
            (z.value.handleFocusPicker && (e.preventDefault(), e.stopPropagation()),
            L.value === !1 && ((L.value = !0), await re()),
            z.value.handleFocusPicker)
          ) {
            z.value.handleFocusPicker();
            return;
          }
          if (t === be.tab) {
            C = !0;
            return;
          }
          if (t === be.enter || t === be.numpadEnter) {
            (L.value
              ? (I.value === null || I.value === `` || We(He(Se.value))) && (Ve(), (L.value = !1))
              : (L.value = !0),
              e.preventDefault(),
              e.stopPropagation());
            return;
          }
          if (I.value) {
            e.stopPropagation();
            return;
          }
          z.value.handleKeydownInput && z.value.handleKeydownInput(e);
        },
        qe = e => {
          ((I.value = e), (L.value ||= !0));
        },
        Je = e => {
          let t = e.target;
          I.value ? (I.value = [t.value, I.value[1]]) : (I.value = [t.value, null]);
        },
        Ye = e => {
          let t = e.target;
          I.value ? (I.value = [I.value[0], t.value]) : (I.value = [null, t.value]);
        },
        Xe = () => {
          let e = I.value,
            t = He(e && e[0]),
            n = U(F);
          if (t && t.isValid()) {
            I.value = [Ue(t), Se.value?.[1] || null];
            let e = [t, n && (n[1] || null)];
            We(e) && (B(lr(e)), (I.value = null));
          }
        },
        Ze = () => {
          let e = U(I),
            t = He(e && e[1]),
            n = U(F);
          if (t && t.isValid()) {
            I.value = [U(Se)?.[0] || null, Ue(t)];
            let e = [n && n[0], t];
            We(e) && (B(lr(e)), (I.value = null));
          }
        };
      return (
        he(Jn, { props: i, emptyValues: _ }),
        he(Xn, M),
        t({
          focus: () => {
            x.value?.focus();
          },
          blur: () => {
            x.value?.blur();
          },
          handleOpen: ye,
          handleClose: xe,
          onPick: ne
        }),
        (e, t) => (
          O(),
          w(
            U(Be),
            P({ ref_key: `refPopper`, ref: v, visible: U(L), effect: `light`, pure: ``, trigger: `click` }, e.$attrs, {
              role: `dialog`,
              teleported: ``,
              transition: `${U(c).namespace.value}-zoom-in-top`,
              'popper-class': [`${U(c).namespace.value}-picker__popper`, e.popperClass],
              'popper-style': e.popperStyle,
              'popper-options': U(h),
              'fallback-placements': e.fallbackPlacements,
              'gpu-acceleration': !1,
              placement: e.placement,
              'stop-popper-mouse-event': !1,
              'hide-after': 0,
              persistent: ``,
              onBeforeShow: _e,
              onShow: q,
              onHide: ve
            }),
            {
              default: n(() => [
                Ie.value
                  ? (O(),
                    w(
                      _r,
                      {
                        key: 1,
                        id: e.id,
                        ref_key: `inputRef`,
                        ref: x,
                        'model-value': Se.value,
                        name: e.name,
                        disabled: U(D),
                        readonly: !e.editable || e.readonly,
                        'start-placeholder': e.startPlaceholder,
                        'end-placeholder': e.endPlaceholder,
                        class: A(ue.value),
                        style: W(e.$attrs.style),
                        'aria-label': e.ariaLabel,
                        tabindex: e.tabindex,
                        autocomplete: `off`,
                        role: `combobox`,
                        onClick: je,
                        onFocus: U(se),
                        onBlur: U(ce),
                        onStartInput: Je,
                        onStartChange: Xe,
                        onEndInput: Ye,
                        onEndChange: Ze,
                        onMousedown: je,
                        onMouseenter: Me,
                        onMouseleave: Ne,
                        onTouchstartPassive: Pe,
                        onKeydown: Ge
                      },
                      {
                        prefix: n(() => [
                          Oe.value
                            ? (O(),
                              w(
                                U(Z),
                                { key: 0, class: A([U(l).e(`icon`), U(d).e(`icon`)]) },
                                { default: n(() => [(O(), w(a(Oe.value)))]), _: 1 },
                                8,
                                [`class`]
                              ))
                            : E(`v-if`, !0)
                        ]),
                        'range-separator': n(() => [
                          j(e.$slots, `range-separator`, {}, () => [
                            T(`span`, { class: A(U(d).b(`separator`)) }, N(e.rangeSeparator), 3)
                          ])
                        ]),
                        suffix: n(() => [
                          e.clearIcon
                            ? (O(),
                              w(
                                U(Z),
                                { key: 0, class: A(de.value), onMousedown: u(U(p), [`prevent`]), onClick: Ae },
                                { default: n(() => [(O(), w(a(e.clearIcon)))]), _: 1 },
                                8,
                                [`class`, `onMousedown`]
                              ))
                            : E(`v-if`, !0)
                        ]),
                        _: 3
                      },
                      8,
                      [
                        `id`,
                        `model-value`,
                        `name`,
                        `disabled`,
                        `readonly`,
                        `start-placeholder`,
                        `end-placeholder`,
                        `class`,
                        `style`,
                        `aria-label`,
                        `tabindex`,
                        `onFocus`,
                        `onBlur`
                      ]
                    ))
                  : (O(),
                    w(
                      U(Et),
                      {
                        key: 0,
                        id: e.id,
                        ref_key: `inputRef`,
                        ref: x,
                        'container-role': `combobox`,
                        'model-value': Se.value,
                        name: e.name,
                        size: U(Le),
                        disabled: U(D),
                        placeholder: e.placeholder,
                        class: A([U(c).b(`editor`), U(c).bm(`editor`, e.type), U(c).is(`focus`, U(L)), e.$attrs.class]),
                        style: W(e.$attrs.style),
                        readonly: !e.editable || e.readonly || Te.value || Ee.value || De.value || e.type === `week`,
                        'aria-label': e.ariaLabel,
                        tabindex: e.tabindex,
                        'validate-event': !1,
                        onInput: qe,
                        onFocus: U(se),
                        onBlur: U(ce),
                        onKeydown: Ge,
                        onChange: Ve,
                        onMousedown: je,
                        onMouseenter: Me,
                        onMouseleave: Ne,
                        onTouchstartPassive: Pe,
                        onClick: (t[0] ||= u(() => {}, [`stop`]))
                      },
                      {
                        prefix: n(() => [
                          Oe.value
                            ? (O(),
                              w(
                                U(Z),
                                {
                                  key: 0,
                                  class: A(U(l).e(`icon`)),
                                  onMousedown: u(je, [`prevent`]),
                                  onTouchstartPassive: Pe
                                },
                                { default: n(() => [(O(), w(a(Oe.value)))]), _: 1 },
                                8,
                                [`class`]
                              ))
                            : E(`v-if`, !0)
                        ]),
                        suffix: n(() => [
                          ke.value && e.clearIcon
                            ? (O(),
                              w(
                                U(Z),
                                {
                                  key: 0,
                                  class: A(`${U(l).e(`icon`)} clear-icon`),
                                  onMousedown: u(U(p), [`prevent`]),
                                  onClick: Ae
                                },
                                { default: n(() => [(O(), w(a(e.clearIcon)))]), _: 1 },
                                8,
                                [`class`, `onMousedown`]
                              ))
                            : E(`v-if`, !0)
                        ]),
                        _: 1
                      },
                      8,
                      [
                        `id`,
                        `model-value`,
                        `name`,
                        `size`,
                        `disabled`,
                        `placeholder`,
                        `class`,
                        `style`,
                        `readonly`,
                        `aria-label`,
                        `tabindex`,
                        `onFocus`,
                        `onBlur`
                      ]
                    ))
              ]),
              content: n(() => [
                j(e.$slots, `default`, {
                  visible: U(L),
                  actualVisible: U(ee),
                  parsedValue: U(F),
                  format: e.format,
                  dateFormat: e.dateFormat,
                  timeFormat: e.timeFormat,
                  unlinkPanels: e.unlinkPanels,
                  type: e.type,
                  defaultValue: e.defaultValue,
                  showNow: e.showNow,
                  showConfirm: e.showConfirm,
                  showFooter: e.showFooter,
                  showWeekNumber: e.showWeekNumber,
                  singlePanel: e.singlePanel,
                  onPick: (t[1] ||= (...e) => U(ne) && U(ne)(...e)),
                  onSelectRange: ge,
                  onSetPickerOption: (t[2] ||= (...e) => U(V) && U(V)(...e)),
                  onCalendarChange: (t[3] ||= (...e) => U(ie) && U(ie)(...e)),
                  onClear: Ae,
                  onPanelChange: (t[4] ||= (...e) => U(H) && U(H)(...e)),
                  onMousedown: (t[5] ||= u(() => {}, [`stop`]))
                })
              ]),
              _: 3
            },
            16,
            [
              `visible`,
              `transition`,
              `popper-class`,
              `popper-style`,
              `popper-options`,
              `fallback-placements`,
              `placement`
            ]
          )
        )
      );
    }
  }),
  yr = `_RepeatClick`,
  br = {
    beforeMount(e, t) {
      let n = t.value,
        { interval: r = 100, delay: i = 600 } = F(n) ? {} : n,
        a,
        o,
        s = () => (F(n) ? n() : n.handler()),
        c = () => {
          ((o &&= (clearTimeout(o), void 0)), (a &&= (clearInterval(a), void 0)));
        },
        l = e => {
          e.button === 0 &&
            (c(),
            s(),
            document.addEventListener(`mouseup`, c, { once: !0 }),
            (o = setTimeout(() => {
              a = setInterval(() => {
                s();
              }, r);
            }, i)));
        };
      ((e[yr] = { start: l, clear: c }), e.addEventListener(`mousedown`, l));
    },
    unmounted(e) {
      if (!e[yr]) return;
      let { start: t, clear: n } = e[yr];
      (t && e.removeEventListener(`mousedown`, t),
        n && (n(), document.removeEventListener(`mouseup`, n)),
        (e[yr] = null));
    }
  },
  xr = J({ ...dr, datetimeRole: String, parsedValue: { type: X(Object) } }),
  Sr = ({ getAvailableHours: e, getAvailableMinutes: t, getAvailableSeconds: n }) => {
    let r = (r, i, a, o) => {
        let s = { hour: e, minute: t, second: n },
          c = r;
        return (
          [`hour`, `minute`, `second`].forEach(e => {
            if (s[e]) {
              let t,
                n = s[e];
              switch (e) {
                case `minute`:
                  t = n(c.hour(), i, o);
                  break;
                case `second`:
                  t = n(c.hour(), c.minute(), i, o);
                  break;
                default:
                  t = n(i, o);
                  break;
              }
              if (t?.length && !t.includes(c[e]())) {
                let n = a ? 0 : t.length - 1;
                c = c[e](t[n]);
              }
            }
          }),
          c
        );
      },
      i = {};
    return {
      timePickerOptions: i,
      getAvailableTime: r,
      onSetOption: ([e, t]) => {
        i[e] = t;
      }
    };
  },
  Cr = e => e.map((e, t) => e || t).filter(e => e !== !0),
  wr = (e, t, n) => ({
    getHoursList: (t, n) => cr(24, e && (() => e?.(t, n))),
    getMinutesList: (e, n, r) => cr(60, t && (() => t?.(e, n, r))),
    getSecondsList: (e, t, r, i) => cr(60, n && (() => n?.(e, t, r, i)))
  }),
  Tr = (e, t, n) => {
    let { getHoursList: r, getMinutesList: i, getSecondsList: a } = wr(e, t, n);
    return {
      getAvailableHours: (e, t) => Cr(r(e, t)),
      getAvailableMinutes: (e, t, n) => Cr(i(e, t, n)),
      getAvailableSeconds: (e, t, n, r) => Cr(a(e, t, n, r))
    };
  },
  Er = (e, t) => {
    let n = K(e.parsedValue);
    return (
      g(
        () => e.visible,
        r => {
          let i = m(t.modelValue),
            a = m(t.valueOnClear);
          if (r && i === a) {
            n.value = a;
            return;
          }
          r || (n.value = e.parsedValue);
        }
      ),
      n
    );
  },
  Dr = J({
    role: { type: String, required: !0 },
    spinnerDate: { type: X(Object), required: !0 },
    showSeconds: { type: Boolean, default: !0 },
    arrowControl: Boolean,
    amPmMode: { type: X(String), default: `` },
    ...ur
  }),
  Or = [`onClick`],
  kr = [`onMouseenter`],
  Ar = H({
    __name: `basic-time-spinner`,
    props: Dr,
    emits: [gt, `select-range`, `set-option`],
    setup(e, { emit: t }) {
      let r = e,
        { isRange: i, format: a, saveOnBlur: o } = ae(Jn).props,
        s = t,
        c = Fe(`time`),
        {
          getHoursList: l,
          getMinutesList: u,
          getSecondsList: d
        } = wr(r.disabledHours, r.disabledMinutes, r.disabledSeconds),
        p = !1,
        m = { hours: !1, minutes: !1, seconds: !1 },
        h = K(),
        _ = { hours: K(), minutes: K(), seconds: K() },
        y = f(() => (r.showSeconds ? qn : qn.slice(0, 2))),
        b = f(() => {
          let { spinnerDate: e } = r;
          return { hours: e.hour(), minutes: e.minute(), seconds: e.second() };
        }),
        x = f(() => {
          let { hours: e, minutes: t } = U(b),
            { role: n, spinnerDate: a } = r,
            o = i ? void 0 : a;
          return { hours: l(n, o), minutes: u(e, n, o), seconds: d(e, t, n, o) };
        }),
        C = f(() => {
          let { hours: e, minutes: t, seconds: n } = U(b);
          return { hours: er(e, 23), minutes: er(t, 59), seconds: er(n, 59) };
        }),
        D = mt(e => {
          ((p = !1), M(e));
        }, 200),
        k = e => {
          if (!r.amPmMode) return ``;
          let t = r.amPmMode === `A`,
            n = e < 12 ? ` am` : ` pm`;
          return (t && (n = n.toUpperCase()), n);
        },
        j = e => {
          let t = [0, 0],
            n = a || `HH:mm:ss`,
            r = n.indexOf(`HH`),
            i = n.indexOf(`mm`),
            o = n.indexOf(`ss`);
          switch (e) {
            case `hours`:
              r !== -1 && (t = [r, r + 2]);
              break;
            case `minutes`:
              i !== -1 && (t = [i, i + 2]);
              break;
            case `seconds`:
              o !== -1 && (t = [o, o + 2]);
              break;
          }
          let [c, l] = t;
          (s(`select-range`, c, l), (h.value = e));
        },
        M = e => {
          I(e, U(b)[e]);
        },
        P = () => {
          (M(`hours`), M(`minutes`), M(`seconds`));
        },
        F = e => e.querySelector(`.${c.namespace.value}-scrollbar__wrap`),
        I = (e, t) => {
          if (r.arrowControl) return;
          let n = U(_[e]);
          n &&
            n.$el &&
            (o ||
              ((m[e] = !0),
              jt(() => {
                m[e] = !1;
              })),
            (F(n.$el).scrollTop = Math.max(0, t * L(e))));
        },
        L = e => {
          let t = U(_[e])?.$el.querySelector(`li`);
          return (t && Number.parseFloat(Te(t, `height`))) || 0;
        },
        R = () => {
          B(1);
        },
        z = () => {
          B(-1);
        },
        B = e => {
          h.value || j(`hours`);
          let t = h.value,
            n = U(b)[t],
            r = ie(t, n, e, h.value === `hours` ? 24 : 60);
          (H(t, r), I(t, r), re(() => j(t)));
        },
        ie = (e, t, n, r) => {
          let i = (t + n + r) % r,
            a = U(x)[e];
          for (; a[i] && i !== t; ) i = (i + n + r) % r;
          return i;
        },
        H = (e, t) => {
          if (U(x)[e][t]) return;
          let { hours: n, minutes: i, seconds: a } = U(b),
            o;
          switch (e) {
            case `hours`:
              o = r.spinnerDate.hour(t).minute(i).second(a);
              break;
            case `minutes`:
              o = r.spinnerDate.hour(n).minute(t).second(a);
              break;
            case `seconds`:
              o = r.spinnerDate.hour(n).minute(i).second(t);
              break;
          }
          s(gt, o);
        },
        oe = (e, { value: t, disabled: n }) => {
          n || (H(e, t), j(e), I(e, t));
        },
        se = e => {
          if (!o && m[e]) return;
          let t = U(_[e]);
          t &&
            ((p = !0),
            D(e),
            H(
              e,
              Math.min(Math.round((F(t.$el).scrollTop - (ce(e) * 0.5 - 10) / L(e) + 3) / L(e)), e === `hours` ? 23 : 59)
            ));
        },
        ce = e => U(_[e]).$el.offsetHeight,
        le = () => {
          let e = e => {
            let t = U(_[e]);
            t &&
              t.$el &&
              (F(t.$el).onscroll = () => {
                se(e);
              });
          };
          (e(`hours`), e(`minutes`), e(`seconds`));
        };
      V(() => {
        re(() => {
          (!r.arrowControl && le(), P(), r.role === `start` && j(`hours`));
        });
      });
      let W = (e, t) => {
        _[t].value = e ?? void 0;
      };
      return (
        s(`set-option`, [`${r.role}_scrollDown`, B]),
        s(`set-option`, [`${r.role}_emitSelectRange`, j]),
        g(
          () => r.spinnerDate,
          () => {
            p || P();
          }
        ),
        (e, t) => (
          O(),
          v(
            `div`,
            { class: A([U(c).b(`spinner`), { 'has-seconds': e.showSeconds }]) },
            [
              e.arrowControl
                ? E(`v-if`, !0)
                : (O(!0),
                  v(
                    S,
                    { key: 0 },
                    _e(
                      y.value,
                      t => (
                        O(),
                        w(
                          U(Dt),
                          {
                            key: t,
                            ref_for: !0,
                            ref: e => W(e, t),
                            class: A(U(c).be(`spinner`, `wrapper`)),
                            'wrap-style': `max-height: inherit;`,
                            'view-class': U(c).be(`spinner`, `list`),
                            noresize: ``,
                            tag: `ul`,
                            onMouseenter: e => j(t),
                            onMousemove: e => M(t)
                          },
                          {
                            default: n(() => [
                              (O(!0),
                              v(
                                S,
                                null,
                                _e(
                                  x.value[t],
                                  (n, r) => (
                                    O(),
                                    v(
                                      `li`,
                                      {
                                        key: r,
                                        class: A([
                                          U(c).be(`spinner`, `item`),
                                          U(c).is(`active`, r === b.value[t]),
                                          U(c).is(`disabled`, n)
                                        ]),
                                        onClick: e => oe(t, { value: r, disabled: n })
                                      },
                                      [
                                        t === `hours`
                                          ? (O(),
                                            v(
                                              S,
                                              { key: 0 },
                                              [ee(N((`0` + (e.amPmMode ? r % 12 || 12 : r)).slice(-2)) + N(k(r)), 1)],
                                              64
                                            ))
                                          : (O(), v(S, { key: 1 }, [ee(N((`0` + r).slice(-2)), 1)], 64))
                                      ],
                                      10,
                                      Or
                                    )
                                  )
                                ),
                                128
                              ))
                            ]),
                            _: 2
                          },
                          1032,
                          [`class`, `view-class`, `onMouseenter`, `onMousemove`]
                        )
                      )
                    ),
                    128
                  )),
              e.arrowControl
                ? (O(!0),
                  v(
                    S,
                    { key: 1 },
                    _e(
                      y.value,
                      t => (
                        O(),
                        v(
                          `div`,
                          {
                            key: t,
                            class: A([U(c).be(`spinner`, `wrapper`), U(c).is(`arrow`)]),
                            onMouseenter: e => j(t)
                          },
                          [
                            ne(
                              (O(),
                              w(
                                U(Z),
                                { class: A([`arrow-up`, U(c).be(`spinner`, `arrow`)]) },
                                { default: n(() => [G(U(te))]), _: 1 },
                                8,
                                [`class`]
                              )),
                              [[U(br), z]]
                            ),
                            ne(
                              (O(),
                              w(
                                U(Z),
                                { class: A([`arrow-down`, U(c).be(`spinner`, `arrow`)]) },
                                { default: n(() => [G(U(de))]), _: 1 },
                                8,
                                [`class`]
                              )),
                              [[U(br), R]]
                            ),
                            T(
                              `ul`,
                              { class: A(U(c).be(`spinner`, `list`)) },
                              [
                                (O(!0),
                                v(
                                  S,
                                  null,
                                  _e(
                                    C.value[t],
                                    (n, r) => (
                                      O(),
                                      v(
                                        `li`,
                                        {
                                          key: r,
                                          class: A([
                                            U(c).be(`spinner`, `item`),
                                            U(c).is(`active`, n === b.value[t]),
                                            U(c).is(`disabled`, x.value[t][n])
                                          ])
                                        },
                                        [
                                          U(lt)(n)
                                            ? (O(),
                                              v(
                                                S,
                                                { key: 0 },
                                                [
                                                  t === `hours`
                                                    ? (O(),
                                                      v(
                                                        S,
                                                        { key: 0 },
                                                        [
                                                          ee(
                                                            N((`0` + (e.amPmMode ? n % 12 || 12 : n)).slice(-2)) +
                                                              N(k(n)),
                                                            1
                                                          )
                                                        ],
                                                        64
                                                      ))
                                                    : (O(), v(S, { key: 1 }, [ee(N((`0` + n).slice(-2)), 1)], 64))
                                                ],
                                                64
                                              ))
                                            : E(`v-if`, !0)
                                        ],
                                        2
                                      )
                                    )
                                  ),
                                  128
                                ))
                              ],
                              2
                            )
                          ],
                          42,
                          kr
                        )
                      )
                    ),
                    128
                  ))
                : E(`v-if`, !0)
            ],
            2
          )
        )
      );
    }
  }),
  jr = H({
    __name: `panel-time-pick`,
    props: xr,
    emits: [`pick`, `select-range`, `set-picker-option`],
    setup(e, { emit: t }) {
      let r = e,
        i = t,
        a = ae(Jn),
        { arrowControl: o, disabledHours: s, disabledMinutes: c, disabledSeconds: l, defaultValue: u } = a.props,
        { getAvailableHours: d, getAvailableMinutes: p, getAvailableSeconds: m } = Tr(s, c, l),
        h = Fe(`time`),
        { t: g, lang: y } = Ee(),
        b = K([0, 2]),
        x = Er(r, {
          modelValue: f(() => a.props.modelValue),
          valueOnClear: f(() => (a?.emptyValues ? a.emptyValues.valueOnClear.value : null))
        }),
        S = f(() => (we(r.actualVisible) ? `${h.namespace.value}-zoom-in-top` : ``)),
        C = f(() => r.format.includes(`ss`)),
        D = f(() => (r.format.includes(`A`) ? `A` : r.format.includes(`a`) ? `a` : ``)),
        k = e => {
          let t = (0, $.default)(e).locale(y.value),
            n = te(t);
          return t.isSame(n);
        },
        j = () => {
          let e = x.value;
          (i(`pick`, e, !1),
            re(() => {
              x.value = e;
            }));
        },
        M = (e = !1, t = !1) => {
          t || i(`pick`, r.parsedValue, e);
        },
        P = e => {
          r.visible && i(`pick`, te(e).millisecond(0), !0);
        },
        F = (e, t) => {
          (i(`select-range`, e, t), (b.value = [e, t]));
        },
        ee = e => {
          let t = r.format,
            n = t.indexOf(`HH`),
            i = t.indexOf(`mm`),
            a = t.indexOf(`ss`),
            o = [],
            s = [];
          (n !== -1 && (o.push(n), s.push(`hours`)),
            i !== -1 && (o.push(i), s.push(`minutes`)),
            a !== -1 && C.value && (o.push(a), s.push(`seconds`)));
          let c = (o.indexOf(b.value[0]) + e + o.length) % o.length;
          L.start_emitSelectRange(s[c]);
        },
        I = e => {
          let t = pt(e),
            { left: n, right: r, up: i, down: a } = be;
          if ([n, r].includes(t)) {
            (ee(t === n ? -1 : 1), e.preventDefault());
            return;
          }
          if ([i, a].includes(t)) {
            let n = t === i ? -1 : 1;
            (L.start_scrollDown(n), e.preventDefault());
            return;
          }
        },
        {
          timePickerOptions: L,
          onSetOption: R,
          getAvailableTime: z
        } = Sr({ getAvailableHours: d, getAvailableMinutes: p, getAvailableSeconds: m }),
        te = e => z(e, r.datetimeRole || ``, !0);
      return (
        i(`set-picker-option`, [`isValidValue`, k]),
        i(`set-picker-option`, [`parseUserInput`, e => (e ? (0, $.default)(e, r.format).locale(y.value) : null)]),
        i(`set-picker-option`, [`handleKeydownInput`, I]),
        i(`set-picker-option`, [`getRangeAvailableTime`, te]),
        i(`set-picker-option`, [`getDefaultValue`, () => (0, $.default)(u).locale(y.value)]),
        i(`set-picker-option`, [`handleCancel`, j]),
        (e, t) => (
          O(),
          w(
            _,
            { name: S.value },
            {
              default: n(() => [
                e.actualVisible || e.visible
                  ? (O(),
                    v(
                      `div`,
                      { key: 0, class: A(U(h).b(`panel`)) },
                      [
                        T(
                          `div`,
                          { class: A([U(h).be(`panel`, `content`), { 'has-seconds': C.value }]) },
                          [
                            G(
                              Ar,
                              {
                                ref: `spinner`,
                                role: e.datetimeRole || `start`,
                                'arrow-control': U(o),
                                'show-seconds': C.value,
                                'am-pm-mode': D.value,
                                'spinner-date': e.parsedValue,
                                'disabled-hours': U(s),
                                'disabled-minutes': U(c),
                                'disabled-seconds': U(l),
                                onChange: P,
                                onSetOption: U(R),
                                onSelectRange: F
                              },
                              null,
                              8,
                              [
                                `role`,
                                `arrow-control`,
                                `show-seconds`,
                                `am-pm-mode`,
                                `spinner-date`,
                                `disabled-hours`,
                                `disabled-minutes`,
                                `disabled-seconds`,
                                `onSetOption`
                              ]
                            )
                          ],
                          2
                        ),
                        T(
                          `div`,
                          { class: A(U(h).be(`panel`, `footer`)) },
                          [
                            T(
                              `button`,
                              { type: `button`, class: A([U(h).be(`panel`, `btn`), `cancel`]), onClick: j },
                              N(U(g)(`el.datepicker.cancel`)),
                              3
                            ),
                            T(
                              `button`,
                              {
                                type: `button`,
                                class: A([U(h).be(`panel`, `btn`), `confirm`]),
                                onClick: (t[0] ||= e => M())
                              },
                              N(U(g)(`el.datepicker.confirm`)),
                              3
                            )
                          ],
                          2
                        )
                      ],
                      2
                    ))
                  : E(`v-if`, !0)
              ]),
              _: 1
            },
            8,
            [`name`]
          )
        )
      );
    }
  }),
  Mr = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_customParseFormat = r());
    })(e, function () {
      var e = {
          LTS: `h:mm:ss A`,
          LT: `h:mm A`,
          L: `MM/DD/YYYY`,
          LL: `MMMM D, YYYY`,
          LLL: `MMMM D, YYYY h:mm A`,
          LLLL: `dddd, MMMM D, YYYY h:mm A`
        },
        t = /(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,
        n = /\d/,
        r = /\d\d/,
        i = /\d\d?/,
        a = /\d*[^-_:/,()\s\d]+/,
        o = {},
        s = function (e) {
          return (e = +e) + (e > 68 ? 1900 : 2e3);
        },
        c = function (e) {
          return function (t) {
            this[e] = +t;
          };
        },
        l = [
          /[+-]\d\d:?(\d\d)?|Z/,
          function (e) {
            (this.zone ||= {}).offset = (function (e) {
              if (!e || e === `Z`) return 0;
              var t = e.match(/([+-]|\d\d)/g),
                n = 60 * t[1] + (+t[2] || 0);
              return n === 0 ? 0 : t[0] === `+` ? -n : n;
            })(e);
          }
        ],
        u = function (e) {
          var t = o[e];
          return t && (t.indexOf ? t : t.s.concat(t.f));
        },
        d = function (e, t) {
          var n,
            r = o.meridiem;
          if (r) {
            for (var i = 1; i <= 24; i += 1)
              if (e.indexOf(r(i, 0, t)) > -1) {
                n = i > 12;
                break;
              }
          } else n = e === (t ? `pm` : `PM`);
          return n;
        },
        f = {
          A: [
            a,
            function (e) {
              this.afternoon = d(e, !1);
            }
          ],
          a: [
            a,
            function (e) {
              this.afternoon = d(e, !0);
            }
          ],
          Q: [
            n,
            function (e) {
              this.month = 3 * (e - 1) + 1;
            }
          ],
          S: [
            n,
            function (e) {
              this.milliseconds = 100 * e;
            }
          ],
          SS: [
            r,
            function (e) {
              this.milliseconds = 10 * e;
            }
          ],
          SSS: [
            /\d{3}/,
            function (e) {
              this.milliseconds = +e;
            }
          ],
          s: [i, c(`seconds`)],
          ss: [i, c(`seconds`)],
          m: [i, c(`minutes`)],
          mm: [i, c(`minutes`)],
          H: [i, c(`hours`)],
          h: [i, c(`hours`)],
          HH: [i, c(`hours`)],
          hh: [i, c(`hours`)],
          D: [i, c(`day`)],
          DD: [r, c(`day`)],
          Do: [
            a,
            function (e) {
              var t = o.ordinal,
                n = e.match(/\d+/);
              if (((this.day = n[0]), t))
                for (var r = 1; r <= 31; r += 1) t(r).replace(/\[|\]/g, ``) === e && (this.day = r);
            }
          ],
          w: [i, c(`week`)],
          ww: [r, c(`week`)],
          M: [i, c(`month`)],
          MM: [r, c(`month`)],
          MMM: [
            a,
            function (e) {
              var t = u(`months`),
                n =
                  (
                    u(`monthsShort`) ||
                    t.map(function (e) {
                      return e.slice(0, 3);
                    })
                  ).indexOf(e) + 1;
              if (n < 1) throw Error();
              this.month = n % 12 || n;
            }
          ],
          MMMM: [
            a,
            function (e) {
              var t = u(`months`).indexOf(e) + 1;
              if (t < 1) throw Error();
              this.month = t % 12 || t;
            }
          ],
          Y: [/[+-]?\d+/, c(`year`)],
          YY: [
            r,
            function (e) {
              this.year = s(e);
            }
          ],
          YYYY: [/\d{4}/, c(`year`)],
          Z: l,
          ZZ: l
        };
      function p(n) {
        for (
          var r = n,
            i = o && o.formats,
            a = (n = r.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g, function (t, n, r) {
              var a = r && r.toUpperCase();
              return (
                n ||
                i[r] ||
                e[r] ||
                i[a].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g, function (e, t, n) {
                  return t || n.slice(1);
                })
              );
            })).match(t),
            s = a.length,
            c = 0;
          c < s;
          c += 1
        ) {
          var l = a[c],
            u = f[l],
            d = u && u[0],
            p = u && u[1];
          a[c] = p ? { regex: d, parser: p } : l.replace(/^\[|\]$/g, ``);
        }
        return function (e) {
          for (var t = {}, n = 0, r = 0; n < s; n += 1) {
            var i = a[n];
            if (typeof i == `string`) r += i.length;
            else {
              var o = i.regex,
                c = i.parser,
                l = e.slice(r),
                u = o.exec(l)[0];
              (c.call(t, u), (e = e.replace(u, ``)));
            }
          }
          return (
            (function (e) {
              var t = e.afternoon;
              if (t !== void 0) {
                var n = e.hours;
                (t ? n < 12 && (e.hours += 12) : n === 12 && (e.hours = 0), delete e.afternoon);
              }
            })(t),
            t
          );
        };
      }
      return function (e, t, n) {
        ((n.p.customParseFormat = !0), e && e.parseTwoDigitYear && (s = e.parseTwoDigitYear));
        var r = t.prototype,
          i = r.parse;
        r.parse = function (e) {
          var t = e.date,
            r = e.utc,
            a = e.args;
          this.$u = r;
          var s = a[1];
          if (typeof s == `string`) {
            var c = !0 === a[2],
              l = !0 === a[3],
              u = c || l,
              d = a[2];
            (l && (d = a[2]),
              (o = this.$locale()),
              !c && d && (o = n.Ls[d]),
              (this.$d = (function (e, t, n, r) {
                try {
                  if ([`x`, `X`].indexOf(t) > -1) return new Date((t === `X` ? 1e3 : 1) * e);
                  var i = p(t)(e),
                    a = i.year,
                    o = i.month,
                    s = i.day,
                    c = i.hours,
                    l = i.minutes,
                    u = i.seconds,
                    d = i.milliseconds,
                    f = i.zone,
                    m = i.week,
                    h = new Date(),
                    g = s || (a || o ? 1 : h.getDate()),
                    _ = a || h.getFullYear(),
                    v = 0;
                  (a && !o) || (v = o > 0 ? o - 1 : h.getMonth());
                  var y,
                    b = c || 0,
                    x = l || 0,
                    S = u || 0,
                    C = d || 0;
                  return f
                    ? new Date(Date.UTC(_, v, g, b, x, S, C + 60 * f.offset * 1e3))
                    : n
                      ? new Date(Date.UTC(_, v, g, b, x, S, C))
                      : ((y = new Date(_, v, g, b, x, S, C)), m && (y = r(y).week(m).toDate()), y);
                } catch {
                  return new Date(``);
                }
              })(t, s, r, n)),
              this.init(),
              d && !0 !== d && (this.$L = this.locale(d).$L),
              u && t != this.format(s) && (this.$d = new Date(``)),
              (o = {}));
          } else if (s instanceof Array)
            for (var f = s.length, m = 1; m <= f; m += 1) {
              a[1] = s[m - 1];
              var h = n.apply(this, a);
              if (h.isValid()) {
                ((this.$d = h.$d), (this.$L = h.$L), this.init());
                break;
              }
              m === f && (this.$d = new Date(``));
            }
          else i.call(this, e);
        };
      };
    });
  }),
  Nr = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_localeData = r());
    })(e, function () {
      return function (e, t, n) {
        var r = t.prototype,
          i = function (e) {
            return e && (e.indexOf ? e : e.s);
          },
          a = function (e, t, n, r, a) {
            var o = e.name ? e : e.$locale(),
              s = i(o[t]),
              c = i(o[n]),
              l =
                s ||
                c.map(function (e) {
                  return e.slice(0, r);
                });
            if (!a) return l;
            var u = o.weekStart;
            return l.map(function (e, t) {
              return l[(t + (u || 0)) % 7];
            });
          },
          o = function () {
            return n.Ls[n.locale()];
          },
          s = function (e, t) {
            return (
              e.formats[t] ||
              (function (e) {
                return e.replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g, function (e, t, n) {
                  return t || n.slice(1);
                });
              })(e.formats[t.toUpperCase()])
            );
          },
          c = function () {
            var e = this;
            return {
              months: function (t) {
                return t ? t.format(`MMMM`) : a(e, `months`);
              },
              monthsShort: function (t) {
                return t ? t.format(`MMM`) : a(e, `monthsShort`, `months`, 3);
              },
              firstDayOfWeek: function () {
                return e.$locale().weekStart || 0;
              },
              weekdays: function (t) {
                return t ? t.format(`dddd`) : a(e, `weekdays`);
              },
              weekdaysMin: function (t) {
                return t ? t.format(`dd`) : a(e, `weekdaysMin`, `weekdays`, 2);
              },
              weekdaysShort: function (t) {
                return t ? t.format(`ddd`) : a(e, `weekdaysShort`, `weekdays`, 3);
              },
              longDateFormat: function (t) {
                return s(e.$locale(), t);
              },
              meridiem: this.$locale().meridiem,
              ordinal: this.$locale().ordinal
            };
          };
        ((r.localeData = function () {
          return c.bind(this)();
        }),
          (n.localeData = function () {
            var e = o();
            return {
              firstDayOfWeek: function () {
                return e.weekStart || 0;
              },
              weekdays: function () {
                return n.weekdays();
              },
              weekdaysShort: function () {
                return n.weekdaysShort();
              },
              weekdaysMin: function () {
                return n.weekdaysMin();
              },
              months: function () {
                return n.months();
              },
              monthsShort: function () {
                return n.monthsShort();
              },
              longDateFormat: function (t) {
                return s(e, t);
              },
              meridiem: e.meridiem,
              ordinal: e.ordinal
            };
          }),
          (n.months = function () {
            return a(o(), `months`);
          }),
          (n.monthsShort = function () {
            return a(o(), `monthsShort`, `months`, 3);
          }),
          (n.weekdays = function (e) {
            return a(o(), `weekdays`, null, null, e);
          }),
          (n.weekdaysShort = function (e) {
            return a(o(), `weekdaysShort`, `weekdays`, 3, e);
          }),
          (n.weekdaysMin = function (e) {
            return a(o(), `weekdaysMin`, `weekdays`, 2, e);
          }));
      };
    });
  }),
  Pr = J({
    valueFormat: String,
    dateFormat: String,
    timeFormat: String,
    disabled: { type: Boolean, default: void 0 },
    modelValue: { type: X([Date, Array, String, Number]), default: `` },
    defaultValue: { type: X([Date, Array]) },
    defaultTime: { type: X([Date, Array]) },
    isRange: Boolean,
    ...ur,
    disabledDate: { type: Function },
    cellClassName: { type: Function },
    shortcuts: { type: Array, default: () => [] },
    arrowControl: Boolean,
    unlinkPanels: Boolean,
    showNow: { type: Boolean, default: !0 },
    showConfirm: Boolean,
    showFooter: Boolean,
    showWeekNumber: Boolean,
    type: { type: X(String), default: `date` },
    clearable: { type: Boolean, default: !0 },
    border: { type: Boolean, default: !0 },
    editable: { type: Boolean, default: !0 }
  }),
  Fr = Symbol(`rootPickerContextKey`),
  Ir = `ElIsDefaultFormat`,
  Lr = [`date`, `dates`, `year`, `years`, `month`, `months`, `week`, `range`],
  Rr = J({
    cellClassName: { type: X(Function) },
    disabledDate: { type: X(Function) },
    date: { type: X(Object), required: !0 },
    minDate: { type: X(Object) },
    maxDate: { type: X(Object) },
    parsedValue: { type: X([Object, Array]) },
    rangeState: { type: X(Object), default: () => ({ endDate: null, selecting: !1 }) },
    disabled: Boolean
  }),
  zr = J({
    type: { type: X(String), required: !0, values: wt },
    dateFormat: String,
    timeFormat: String,
    showNow: { type: Boolean, default: !0 },
    showConfirm: Boolean,
    showFooter: { type: Boolean, default: !0 },
    showWeekNumber: Boolean,
    border: Boolean,
    disabled: Boolean,
    editable: { type: Boolean, default: !0 }
  }),
  Br = J({
    unlinkPanels: Boolean,
    visible: { type: Boolean, default: !0 },
    showConfirm: Boolean,
    showFooter: { type: Boolean, default: !0 },
    border: Boolean,
    disabled: Boolean,
    parsedValue: { type: X(Array) },
    singlePanel: Boolean
  }),
  Vr = e => ({ type: String, values: Lr, default: e }),
  Hr = J({
    ...zr,
    parsedValue: { type: X([Object, Array]) },
    visible: { type: Boolean, default: !0 },
    format: { type: String, default: `` }
  }),
  Ur = e => {
    if (!y(e)) return !1;
    let [t, n] = e;
    return (
      $.default.isDayjs(t) &&
      $.default.isDayjs(n) &&
      (0, $.default)(t).isValid() &&
      (0, $.default)(n).isValid() &&
      t.isSameOrBefore(n)
    );
  },
  Wr = (e, { lang: t, step: n = 1, unit: r, unlinkPanels: i }) => {
    let a;
    if (y(e)) {
      let [a, o] = e.map(e => (0, $.default)(e).locale(t));
      return (i || (o = a.add(n, r)), [a, o]);
    } else a = e ? (0, $.default)(e) : (0, $.default)();
    return ((a = a.locale(t)), [a, a.add(n, r)]);
  },
  Gr = (
    e,
    t,
    {
      columnIndexOffset: n,
      startDate: r,
      nextEndDate: i,
      now: a,
      unit: o,
      relativeDateGetter: s,
      setCellMetadata: c,
      setRowMetadata: l
    }
  ) => {
    for (let u = 0; u < e.row; u++) {
      let d = t[u];
      for (let t = 0; t < e.column; t++) {
        let l = d[t + n];
        l ||= { row: u, column: t, type: `normal`, inRange: !1, start: !1, end: !1 };
        let f = s(u * e.column + t);
        ((l.dayjs = f),
          (l.date = f.toDate()),
          (l.timestamp = f.valueOf()),
          (l.type = `normal`),
          (l.inRange =
            !!(r && f.isSameOrAfter(r, o) && i && f.isSameOrBefore(i, o)) ||
            !!(r && f.isSameOrBefore(r, o) && i && f.isSameOrAfter(i, o))),
          r?.isSameOrAfter(i)
            ? ((l.start = !!i && f.isSame(i, o)), (l.end = r && f.isSame(r, o)))
            : ((l.start = !!r && f.isSame(r, o)), (l.end = !!i && f.isSame(i, o))),
          f.isSame(a, o) && (l.type = `today`),
          c?.(l, { rowIndex: u, columnIndex: t }),
          (d[t + n] = l));
      }
      l?.(d);
    }
  },
  Kr = (e, t, n, r) => {
    let i = (0, $.default)()
      .locale(r)
      .startOf(`month`)
      .month(n)
      .year(t)
      .hour(e.hour())
      .minute(e.minute())
      .second(e.second());
    return tr(i.daysInMonth()).map(e => i.add(e, `day`).toDate());
  },
  qr = (e, t, n, r, i) => {
    let a = (0, $.default)().year(t).month(n).startOf(`month`).hour(e.hour()).minute(e.minute()).second(e.second()),
      o = Kr(e, t, n, r).find(e => !i?.(e));
    return o ? (0, $.default)(o).locale(r) : a.locale(r);
  },
  Jr = (e, t, n) => {
    let r = e.year();
    if (!n?.(e.toDate())) return e.locale(t);
    let i = e.month();
    if (!Kr(e, r, i, t).every(n)) return qr(e, r, i, t, n);
    for (let i = 0; i < 12; i++) if (!Kr(e, r, i, t).every(n)) return qr(e, r, i, t, n);
    return e;
  },
  Yr = (e, t, n, r) => {
    if (y(e)) return e.map(e => Yr(e, t, n, r));
    if (B(e)) {
      let n = r?.value ? (0, $.default)(e) : (0, $.default)(e, t);
      if (!n.isValid()) return n;
    }
    return (0, $.default)(e, t).locale(n);
  },
  Xr = J({ ...Rr, showWeekNumber: Boolean, selectionMode: Vr(`date`) }),
  Zr = [`changerange`, `pick`, `select`],
  Qr = (e = ``) => [`normal`, `today`].includes(e),
  $r = (e, t) => {
    let { lang: n } = Ee(),
      r = K(),
      i = K(),
      a = K(),
      o = K(),
      s = K([[], [], [], [], [], []]),
      c = !1,
      l = e.date.$locale().weekStart || 7,
      u = e.date
        .locale(`en`)
        .localeData()
        .weekdaysShort()
        .map(e => e.toLowerCase()),
      d = f(() => (l > 3 ? 7 - l : -l)),
      p = f(() => {
        let t = e.date.startOf(`month`);
        return t.subtract(t.day() || 7, `day`);
      }),
      m = f(() => u.concat(u).slice(l, l + 7)),
      h = f(() => Le(U(C)).some(e => e.isCurrent)),
      _ = f(() => {
        let t = e.date.startOf(`month`);
        return {
          startOfMonthDay: t.day() || 7,
          dateCountOfMonth: t.daysInMonth(),
          dateCountOfLastMonth: t.subtract(1, `month`).daysInMonth()
        };
      }),
      v = f(() => (e.selectionMode === `dates` ? nt(e.parsedValue) : [])),
      b = (e, { count: t, rowIndex: n, columnIndex: r }) => {
        let { startOfMonthDay: i, dateCountOfMonth: a, dateCountOfLastMonth: o } = U(_),
          s = U(d);
        if (n >= 0 && n <= 1) {
          let a = i + s < 0 ? 7 + i + s : i + s;
          if (r + n * 7 >= a) return ((e.text = t), !0);
          ((e.text = o - (a - (r % 7)) + 1 + n * 7), (e.type = `prev-month`));
        } else return (t <= a ? (e.text = t) : ((e.text = t - a), (e.type = `next-month`)), !0);
        return !1;
      },
      x = (t, { columnIndex: n, rowIndex: r }, i) => {
        let { disabledDate: a, cellClassName: o } = e,
          s = U(v),
          c = b(t, { count: i, rowIndex: r, columnIndex: n }),
          l = t.dayjs.toDate();
        return (
          (t.selected = s.find(e => e.isSame(t.dayjs, `day`))),
          (t.isSelected = !!t.selected),
          (t.isCurrent = T(t)),
          (t.disabled = a?.(l)),
          (t.customClass = o?.(l)),
          c
        );
      },
      S = t => {
        if (e.selectionMode === `week`) {
          let [n, r] = e.showWeekNumber ? [1, 7] : [0, 6],
            i = I(t[n + 1]);
          ((t[n].inRange = i), (t[n].start = i), (t[r].inRange = i), (t[r].end = i));
        }
      },
      C = f(() => {
        let { minDate: t, maxDate: r, rangeState: i, showWeekNumber: a } = e,
          o = U(d),
          c = U(s),
          l = 1;
        if (
          (Gr({ row: 6, column: 7 }, c, {
            startDate: t,
            columnIndexOffset: +!!a,
            nextEndDate: i.endDate || r || (i.selecting && t) || null,
            now: (0, $.default)().locale(U(n)).startOf(`day`),
            unit: `day`,
            relativeDateGetter: e => U(p).add(e - o, `day`),
            setCellMetadata: (...e) => {
              x(...e, l) && (l += 1);
            },
            setRowMetadata: S
          }),
          a)
        )
          for (let e = 0; e < 6; e++) c[e][1].dayjs && (c[e][0] = { type: `week`, text: c[e][1].dayjs.week() });
        return c;
      });
    g(
      () => e.date,
      async () => {
        U(r)?.contains(document.activeElement) && (await re(), await w());
      }
    );
    let w = async () => U(i)?.focus(),
      T = t => e.selectionMode === `date` && Qr(t.type) && E(t, e.parsedValue),
      E = (t, r) =>
        r
          ? (0, $.default)(r)
              .locale(U(n))
              .isSame(e.date.date(Number(t.text)), `day`)
          : !1,
      D = (t, n) => {
        let r = U(_).startOfMonthDay,
          i = U(d),
          a = r + i < 0 ? 7 + r + i : r + i,
          o = t * 7 + (n - +!!e.showWeekNumber);
        return e.date.startOf(`month`).subtract(a, `day`).add(o, `day`);
      },
      O = n => {
        if (!e.rangeState.selecting) return;
        let r = n.target;
        if (
          (r.tagName === `SPAN` && (r = r.parentNode?.parentNode),
          r.tagName === `DIV` && (r = r.parentNode),
          r.tagName !== `TD`)
        )
          return;
        let i = r.parentNode.rowIndex - 1,
          s = r.cellIndex;
        U(C)[i][s].disabled ||
          ((i !== U(a) || s !== U(o)) &&
            ((a.value = i), (o.value = s), t(`changerange`, { selecting: !0, endDate: D(i, s) })));
      },
      k = e => (!U(h) && e?.text === 1 && Qr(e.type)) || e.isCurrent,
      A = t => {
        c || U(h) || e.selectionMode !== `date` || ee(t, !0);
      },
      j = e => {
        e.target.closest(`td`) && (c = !0);
      },
      M = e => {
        e.target.closest(`td`) && (c = !1);
      },
      N = n => {
        !e.rangeState.selecting || !e.minDate
          ? (t(`pick`, { minDate: n, maxDate: null }), t(`select`, !0))
          : (n >= e.minDate
              ? t(`pick`, { minDate: e.minDate, maxDate: n })
              : t(`pick`, { minDate: n, maxDate: e.minDate }),
            t(`select`, !1));
      },
      P = e => {
        let n = e.week(),
          r = `${e.year()}w${n}`;
        t(`pick`, { year: e.year(), week: n, value: r, date: e.startOf(`week`) });
      },
      F = (n, r) => {
        t(`pick`, r ? nt(e.parsedValue).filter(e => e?.valueOf() !== n.valueOf()) : nt(e.parsedValue).concat([n]));
      },
      ee = (n, r = !1) => {
        if (e.disabled) return;
        let i = n.target.closest(`td`);
        if (!i) return;
        let a = i.parentNode.rowIndex - 1,
          o = i.cellIndex,
          s = U(C)[a][o];
        if (s.disabled || s.type === `week`) return;
        let c = D(a, o);
        switch (e.selectionMode) {
          case `range`:
            N(c);
            break;
          case `date`:
            t(`pick`, c, r);
            break;
          case `week`:
            P(c);
            break;
          case `dates`:
            F(c, !!s.selected);
            break;
          default:
            break;
        }
      },
      I = t => {
        if (e.selectionMode !== `week`) return !1;
        let n = e.date.startOf(`day`);
        if (
          (t.type === `prev-month` && (n = n.subtract(1, `month`)),
          t.type === `next-month` && (n = n.add(1, `month`)),
          (n = n.date(Number.parseInt(t.text, 10))),
          e.parsedValue && !y(e.parsedValue))
        ) {
          let t = ((e.parsedValue.day() - l + 7) % 7) - 1;
          return e.parsedValue.subtract(t, `day`).isSame(n, `day`);
        }
        return !1;
      };
    return {
      WEEKS: m,
      rows: C,
      tbodyRef: r,
      currentCellRef: i,
      focus: w,
      isCurrent: T,
      isWeekActive: I,
      isSelectedCell: k,
      handlePickDate: ee,
      handleMouseUp: M,
      handleMouseDown: j,
      handleMouseMove: O,
      handleFocus: A
    };
  },
  ei = (e, { isCurrent: t, isWeekActive: n }) => {
    let r = Fe(`date-table`),
      { t: i } = Ee();
    return {
      tableKls: f(() => [r.b(), r.is(`week-mode`, e.selectionMode === `week` && !e.disabled)]),
      tableLabel: f(() => i(`el.datepicker.dateTablePrompt`)),
      weekHeaderClass: r.e(`week-header`),
      getCellClasses: n => {
        let r = [];
        return (
          Qr(n.type) && !n.disabled ? (r.push(`available`), n.type === `today` && r.push(`today`)) : r.push(n.type),
          t(n) && r.push(`current`),
          n.inRange &&
            (Qr(n.type) || e.selectionMode === `week`) &&
            (r.push(`in-range`), n.start && r.push(`start-date`), n.end && r.push(`end-date`)),
          (n.disabled || e.disabled) && r.push(`disabled`),
          n.selected && r.push(`selected`),
          n.customClass && r.push(n.customClass),
          r.join(` `)
        );
      },
      getRowKls: e => [r.e(`row`), { current: n(e) }],
      t: i
    };
  },
  ti = H({
    name: `ElDatePickerCell`,
    props: J({ cell: { type: X(Object) } }),
    setup(e) {
      let t = Fe(`date-table-cell`),
        { slots: n } = ae(Fr);
      return () => {
        let { cell: r } = e;
        return j(n, `default`, { ...r }, () => [
          G(`div`, { class: t.b() }, [G(`span`, { class: t.e(`text`) }, [r?.renderText ?? r?.text])])
        ]);
      };
    }
  }),
  ni = [`aria-label`],
  ri = [`aria-label`],
  ii = [`aria-current`, `aria-selected`, `tabindex`, `aria-disabled`],
  ai = H({
    __name: `basic-date-table`,
    props: Xr,
    emits: Zr,
    setup(e, { expose: t, emit: n }) {
      let r = e,
        {
          WEEKS: i,
          rows: a,
          tbodyRef: o,
          currentCellRef: s,
          focus: c,
          isCurrent: l,
          isWeekActive: u,
          isSelectedCell: d,
          handlePickDate: f,
          handleMouseUp: p,
          handleMouseDown: m,
          handleMouseMove: h,
          handleFocus: g
        } = $r(r, n),
        {
          tableLabel: _,
          tableKls: y,
          getCellClasses: b,
          getRowKls: x,
          weekHeaderClass: C,
          t: w
        } = ei(r, { isCurrent: l, isWeekActive: u }),
        D = !1;
      return (
        R(() => {
          D = !0;
        }),
        t({ focus: c }),
        (e, t) => (
          O(),
          v(
            `table`,
            {
              'aria-label': U(_),
              class: A(U(y)),
              cellspacing: `0`,
              cellpadding: `0`,
              role: `grid`,
              onClick: (t[1] ||= (...e) => U(f) && U(f)(...e)),
              onMousemove: (t[2] ||= (...e) => U(h) && U(h)(...e)),
              onMousedown: (t[3] ||= (...e) => U(m) && U(m)(...e)),
              onMouseup: (t[4] ||= (...e) => U(p) && U(p)(...e))
            },
            [
              T(
                `tbody`,
                { ref_key: `tbodyRef`, ref: o },
                [
                  T(`tr`, null, [
                    e.showWeekNumber
                      ? (O(), v(`th`, { key: 0, scope: `col`, class: A(U(C)) }, null, 2))
                      : E(`v-if`, !0),
                    (O(!0),
                    v(
                      S,
                      null,
                      _e(
                        U(i),
                        (e, t) => (
                          O(),
                          v(
                            `th`,
                            { key: t, 'aria-label': U(w)(`el.datepicker.weeksFull.` + e), scope: `col` },
                            N(U(w)(`el.datepicker.weeks.` + e)),
                            9,
                            ri
                          )
                        )
                      ),
                      128
                    ))
                  ]),
                  (O(!0),
                  v(
                    S,
                    null,
                    _e(
                      U(a),
                      (n, r) => (
                        O(),
                        v(
                          `tr`,
                          { key: r, class: A(U(x)(e.showWeekNumber ? n[2] : n[1])) },
                          [
                            (O(!0),
                            v(
                              S,
                              null,
                              _e(
                                n,
                                (n, i) => (
                                  O(),
                                  v(
                                    `td`,
                                    {
                                      key: `${r}.${i}`,
                                      ref_for: !0,
                                      ref: e => !U(D) && U(d)(n) && (s.value = e),
                                      class: A(U(b)(n)),
                                      'aria-current': n.isCurrent ? `date` : void 0,
                                      'aria-selected': n.isCurrent,
                                      tabindex: e.disabled ? void 0 : U(d)(n) ? 0 : -1,
                                      'aria-disabled': e.disabled,
                                      onFocus: (t[0] ||= (...e) => U(g) && U(g)(...e))
                                    },
                                    [G(U(ti), { cell: n }, null, 8, [`cell`])],
                                    42,
                                    ii
                                  )
                                )
                              ),
                              128
                            ))
                          ],
                          2
                        )
                      )
                    ),
                    128
                  ))
                ],
                512
              )
            ],
            42,
            ni
          )
        )
      );
    }
  }),
  oi = J({ ...Rr, selectionMode: Vr(`month`) }),
  si = [`aria-label`],
  ci = [`aria-selected`, `aria-label`, `tabindex`, `onKeydown`],
  li = H({
    __name: `basic-month-table`,
    props: oi,
    emits: [`changerange`, `pick`, `select`],
    setup(e, { expose: t, emit: n }) {
      let r = e,
        i = n,
        a = Fe(`month-table`),
        { t: o, lang: s } = Ee(),
        c = K(),
        l = K(),
        d = K(
          r.date
            .locale(`en`)
            .localeData()
            .monthsShort()
            .map(e => e.toLowerCase())
        ),
        p = K([[], [], []]),
        m = K(),
        h = K(),
        _ = f(() => {
          let e = p.value,
            t = (0, $.default)().locale(s.value).startOf(`month`);
          for (let n = 0; n < 3; n++) {
            let i = e[n];
            for (let e = 0; e < 4; e++) {
              let a = (i[e] ||= {
                row: n,
                column: e,
                type: `normal`,
                inRange: !1,
                start: !1,
                end: !1,
                text: -1,
                disabled: !1,
                isSelected: !1,
                customClass: void 0,
                date: void 0,
                dayjs: void 0,
                isCurrent: void 0,
                selected: void 0,
                renderText: void 0,
                timestamp: void 0
              });
              a.type = `normal`;
              let o = n * 4 + e,
                s = r.date.startOf(`year`).month(o),
                c = r.rangeState.endDate || r.maxDate || (r.rangeState.selecting && r.minDate) || null;
              ((a.inRange =
                !!(r.minDate && s.isSameOrAfter(r.minDate, `month`) && c && s.isSameOrBefore(c, `month`)) ||
                !!(r.minDate && s.isSameOrBefore(r.minDate, `month`) && c && s.isSameOrAfter(c, `month`))),
                r.minDate?.isSameOrAfter(c)
                  ? ((a.start = !!(c && s.isSame(c, `month`))), (a.end = r.minDate && s.isSame(r.minDate, `month`)))
                  : ((a.start = !!(r.minDate && s.isSame(r.minDate, `month`))),
                    (a.end = !!(c && s.isSame(c, `month`)))),
                t.isSame(s) && (a.type = `today`));
              let l = s.toDate();
              ((a.text = o),
                (a.disabled = r.disabledDate?.(l) || !1),
                (a.date = l),
                (a.customClass = r.cellClassName?.(l)),
                (a.dayjs = s),
                (a.timestamp = s.valueOf()),
                (a.isSelected = C(a)));
            }
          }
          return e;
        }),
        y = () => {
          l.value?.focus();
        },
        b = e => {
          let t = {},
            n = r.date.year(),
            i = new Date(),
            a = e.text;
          return (
            (t.disabled = r.disabled || (r.disabledDate ? Kr(r.date, n, a, s.value).every(r.disabledDate) : !1)),
            (t.current = nt(r.parsedValue).some(e => $.default.isDayjs(e) && e.year() === n && e.month() === a)),
            (t.today = i.getFullYear() === n && i.getMonth() === a),
            e.customClass && (t[e.customClass] = !0),
            e.inRange && ((t[`in-range`] = !0), e.start && (t[`start-date`] = !0), e.end && (t[`end-date`] = !0)),
            t
          );
        },
        C = e => {
          let t = r.date.year(),
            n = e.text;
          return nt(r.date).some(e => e.year() === t && e.month() === n);
        },
        w = e => {
          if (!r.rangeState.selecting) return;
          let t = e.target;
          if (
            (t.tagName === `SPAN` && (t = t.parentNode?.parentNode),
            t.tagName === `DIV` && (t = t.parentNode),
            t.tagName !== `TD`)
          )
            return;
          let n = t.parentNode.rowIndex,
            a = t.cellIndex;
          _.value[n][a].disabled ||
            ((n !== m.value || a !== h.value) &&
              ((m.value = n),
              (h.value = a),
              i(`changerange`, { selecting: !0, endDate: r.date.startOf(`year`).month(n * 4 + a) })));
        },
        E = e => {
          if (r.disabled) return;
          let t = e.target?.closest(`td`);
          if (t?.tagName !== `TD` || Oe(t, `disabled`)) return;
          let n = t.cellIndex,
            a = t.parentNode.rowIndex * 4 + n,
            o = r.date.startOf(`year`).month(a);
          if (r.selectionMode === `months`) {
            if (e.type === `keydown`) {
              i(`pick`, nt(r.parsedValue), !1);
              return;
            }
            let n = qr(r.date, r.date.year(), a, s.value, r.disabledDate);
            i(
              `pick`,
              Oe(t, `current`)
                ? nt(r.parsedValue).filter(e => e?.year() !== n.year() || e?.month() !== n.month())
                : nt(r.parsedValue).concat([(0, $.default)(n)])
            );
          } else
            r.selectionMode === `range`
              ? r.rangeState.selecting
                ? (r.minDate && o >= r.minDate
                    ? i(`pick`, { minDate: r.minDate, maxDate: o })
                    : i(`pick`, { minDate: o, maxDate: r.minDate }),
                  i(`select`, !1))
                : (i(`pick`, { minDate: o, maxDate: null }), i(`select`, !0))
              : i(`pick`, a);
        };
      return (
        g(
          () => r.date,
          async () => {
            c.value?.contains(document.activeElement) && (await re(), l.value?.focus());
          }
        ),
        t({ focus: y }),
        (e, t) => (
          O(),
          v(
            `table`,
            {
              role: `grid`,
              'aria-label': U(o)(`el.datepicker.monthTablePrompt`),
              class: A(U(a).b()),
              onClick: E,
              onMousemove: w
            },
            [
              T(
                `tbody`,
                { ref_key: `tbodyRef`, ref: c },
                [
                  (O(!0),
                  v(
                    S,
                    null,
                    _e(
                      _.value,
                      (e, t) => (
                        O(),
                        v(`tr`, { key: t }, [
                          (O(!0),
                          v(
                            S,
                            null,
                            _e(
                              e,
                              (e, t) => (
                                O(),
                                v(
                                  `td`,
                                  {
                                    key: t,
                                    ref_for: !0,
                                    ref: t => e.isSelected && (l.value = t),
                                    class: A(b(e)),
                                    'aria-selected': !!e.isSelected,
                                    'aria-label': U(o)(`el.datepicker.month${+e.text + 1}`),
                                    tabindex: e.isSelected ? 0 : -1,
                                    onKeydown: [
                                      x(u(E, [`prevent`, `stop`]), [`space`]),
                                      x(u(E, [`prevent`, `stop`]), [`enter`])
                                    ]
                                  },
                                  [
                                    G(
                                      U(ti),
                                      { cell: { ...e, renderText: U(o)(`el.datepicker.months.` + d.value[e.text]) } },
                                      null,
                                      8,
                                      [`cell`]
                                    )
                                  ],
                                  42,
                                  ci
                                )
                              )
                            ),
                            128
                          ))
                        ])
                      )
                    ),
                    128
                  ))
                ],
                512
              )
            ],
            42,
            si
          )
        )
      );
    }
  }),
  ui = J({ ...Rr, selectionMode: Vr(`year`) }),
  di = [`aria-label`],
  fi = [`aria-selected`, `aria-label`, `tabindex`, `onKeydown`],
  pi = H({
    __name: `basic-year-table`,
    props: ui,
    emits: [`changerange`, `pick`, `select`],
    setup(e, { expose: t, emit: n }) {
      let r = (e, t) => {
          let n = (0, $.default)(String(e)).locale(t).startOf(`year`);
          return tr(n.endOf(`year`).dayOfYear()).map(e => n.add(e, `day`).toDate());
        },
        i = e,
        a = n,
        o = Fe(`year-table`),
        { t: s, lang: c } = Ee(),
        l = K(),
        d = K(),
        p = f(() => Math.floor(i.date.year() / 10) * 10),
        m = K([[], [], []]),
        h = K(),
        _ = K(),
        y = f(() => {
          let e = m.value,
            t = (0, $.default)().locale(c.value).startOf(`year`);
          for (let n = 0; n < 3; n++) {
            let r = e[n];
            for (let e = 0; e < 4 && !(n * 4 + e >= 10); e++) {
              let a = r[e];
              ((a ||= {
                row: n,
                column: e,
                type: `normal`,
                inRange: !1,
                start: !1,
                end: !1,
                text: -1,
                disabled: !1,
                isSelected: !1,
                customClass: void 0,
                date: void 0,
                dayjs: void 0,
                isCurrent: void 0,
                selected: void 0,
                renderText: void 0,
                timestamp: void 0
              }),
                (a.type = `normal`));
              let o = n * 4 + e + p.value,
                s = (0, $.default)().year(o),
                c = i.rangeState.endDate || i.maxDate || (i.rangeState.selecting && i.minDate) || null;
              ((a.inRange =
                !!(i.minDate && s.isSameOrAfter(i.minDate, `year`) && c && s.isSameOrBefore(c, `year`)) ||
                !!(i.minDate && s.isSameOrBefore(i.minDate, `year`) && c && s.isSameOrAfter(c, `year`))),
                i.minDate?.isSameOrAfter(c)
                  ? ((a.start = !!(c && s.isSame(c, `year`))), (a.end = !!(i.minDate && s.isSame(i.minDate, `year`))))
                  : ((a.start = !!(i.minDate && s.isSame(i.minDate, `year`))), (a.end = !!(c && s.isSame(c, `year`)))),
                t.isSame(s) && (a.type = `today`),
                (a.text = o));
              let l = s.toDate();
              ((a.disabled = i.disabledDate?.(l) || !1),
                (a.date = l),
                (a.customClass = i.cellClassName?.(l)),
                (a.dayjs = s),
                (a.timestamp = s.valueOf()),
                (a.isSelected = w(a)),
                (r[e] = a));
            }
          }
          return e;
        }),
        b = () => {
          d.value?.focus();
        },
        C = e => {
          let t = {},
            n = (0, $.default)().locale(c.value),
            a = e.text;
          return (
            (t.disabled = i.disabled || (i.disabledDate ? r(a, c.value).every(i.disabledDate) : !1)),
            (t.today = n.year() === a),
            (t.current = nt(i.parsedValue).some(e => e.year() === a)),
            e.customClass && (t[e.customClass] = !0),
            e.inRange && ((t[`in-range`] = !0), e.start && (t[`start-date`] = !0), e.end && (t[`end-date`] = !0)),
            t
          );
        },
        w = e => {
          let t = e.text;
          return nt(i.date).some(e => e.year() === t);
        },
        E = e => {
          if (i.disabled) return;
          let t = e.target?.closest(`td`);
          if (!t || !t.textContent || Oe(t, `disabled`)) return;
          let n = t.cellIndex,
            r = t.parentNode.rowIndex * 4 + n + p.value,
            o = (0, $.default)().year(r);
          if (i.selectionMode === `range`)
            i.rangeState.selecting
              ? (i.minDate && o >= i.minDate
                  ? a(`pick`, { minDate: i.minDate, maxDate: o })
                  : a(`pick`, { minDate: o, maxDate: i.minDate }),
                a(`select`, !1))
              : (a(`pick`, { minDate: o, maxDate: null }), a(`select`, !0));
          else if (i.selectionMode === `years`) {
            if (e.type === `keydown`) {
              a(`pick`, nt(i.parsedValue), !1);
              return;
            }
            let n = Jr(o.startOf(`year`), c.value, i.disabledDate);
            a(
              `pick`,
              Oe(t, `current`) ? nt(i.parsedValue).filter(e => e?.year() !== r) : nt(i.parsedValue).concat([n])
            );
          } else a(`pick`, r);
        },
        D = e => {
          if (!i.rangeState.selecting) return;
          let t = e.target?.closest(`td`);
          if (!t) return;
          let n = t.parentNode.rowIndex,
            r = t.cellIndex;
          y.value[n][r].disabled ||
            ((n !== h.value || r !== _.value) &&
              ((h.value = n),
              (_.value = r),
              a(`changerange`, {
                selecting: !0,
                endDate: (0, $.default)()
                  .year(p.value)
                  .add(n * 4 + r, `year`)
              })));
        };
      return (
        g(
          () => i.date,
          async () => {
            l.value?.contains(document.activeElement) && (await re(), d.value?.focus());
          }
        ),
        t({ focus: b }),
        (e, t) => (
          O(),
          v(
            `table`,
            {
              role: `grid`,
              'aria-label': U(s)(`el.datepicker.yearTablePrompt`),
              class: A(U(o).b()),
              onClick: E,
              onMousemove: D
            },
            [
              T(
                `tbody`,
                { ref_key: `tbodyRef`, ref: l },
                [
                  (O(!0),
                  v(
                    S,
                    null,
                    _e(
                      y.value,
                      (e, t) => (
                        O(),
                        v(`tr`, { key: t }, [
                          (O(!0),
                          v(
                            S,
                            null,
                            _e(
                              e,
                              (e, n) => (
                                O(),
                                v(
                                  `td`,
                                  {
                                    key: `${t}_${n}`,
                                    ref_for: !0,
                                    ref: t => e.isSelected && (d.value = t),
                                    class: A([`available`, C(e)]),
                                    'aria-selected': e.isSelected,
                                    'aria-label': String(e.text),
                                    tabindex: e.isSelected ? 0 : -1,
                                    onKeydown: [
                                      x(u(E, [`prevent`, `stop`]), [`space`]),
                                      x(u(E, [`prevent`, `stop`]), [`enter`])
                                    ]
                                  },
                                  [G(U(ti), { cell: e }, null, 8, [`cell`])],
                                  42,
                                  fi
                                )
                              )
                            ),
                            128
                          ))
                        ])
                      )
                    ),
                    128
                  ))
                ],
                512
              )
            ],
            42,
            di
          )
        )
      );
    }
  }),
  mi = [`disabled`, `onClick`],
  hi = [`aria-label`, `disabled`],
  gi = [`aria-label`, `disabled`],
  _i = [`tabindex`, `aria-disabled`],
  vi = [`tabindex`, `aria-disabled`],
  yi = [`aria-label`, `disabled`],
  bi = [`aria-label`, `disabled`],
  xi = H({
    __name: `panel-date-pick`,
    props: Hr,
    emits: [`pick`, `set-picker-option`, `panel-change`],
    setup(e, { emit: t }) {
      let i = (e, t, n) => !0,
        a = e,
        s = t,
        c = Fe(`picker-panel`),
        l = Fe(`date-picker`),
        u = b(),
        d = o(),
        { t: p, lang: m } = Ee(),
        h = ae(Jn),
        _ = ae(Ir, void 0),
        { shortcuts: D, disabledDate: k, cellClassName: M, defaultTime: P } = h.props,
        L = C(h.props, `defaultValue`),
        R = K(),
        z = K((0, $.default)().locale(m.value)),
        te = K(!1),
        B = !1,
        V = f(() => (0, $.default)(P).locale(m.value)),
        H = f(() => z.value.month()),
        ce = f(() => z.value.year()),
        le = K([]),
        W = K(null),
        ue = K(null),
        de = e => (le.value.length > 0 ? i(e, le.value, a.format || `HH:mm:ss`) : !0),
        fe = e =>
          P && !Be.value && !te.value && !B
            ? V.value.year(e.year()).month(e.month()).date(e.date())
            : Ae.value
              ? e.millisecond(0)
              : e.startOf(`day`),
        pe = (e, ...t) => {
          (e ? (y(e) ? s(`pick`, e.map(fe), ...t) : s(`pick`, fe(e), ...t)) : s(`pick`, e, ...t),
            (W.value = null),
            (ue.value = null),
            (te.value = !1),
            (B = !1));
        },
        me = async (e, t) => {
          if (xe.value === `date` && $.default.isDayjs(e)) {
            let n = Ze(a.parsedValue),
              r = n ? n.year(e.year()).month(e.month()).date(e.date()) : e;
            (de(r) || (r = le.value[0][0].year(e.year()).month(e.month()).date(e.date())),
              (z.value = r),
              pe(r, Ae.value || t));
          } else xe.value === `week` ? pe(e.date) : xe.value === `dates` && pe(e, !0);
        },
        he = e => {
          let t = e ? `add` : `subtract`;
          ((z.value = z.value[t](1, `month`)), rt(`month`));
        },
        ge = e => {
          let t = z.value,
            n = e ? `add` : `subtract`;
          ((z.value = q.value === `year` ? t[n](10, `year`) : t[n](1, `year`)), rt(`year`));
        },
        q = K(`date`),
        ve = f(() => {
          let e = p(`el.datepicker.year`);
          if (q.value === `year`) {
            let t = Math.floor(ce.value / 10) * 10;
            return e ? `${t} ${e} - ${t + 9} ${e}` : `${t} - ${t + 9}`;
          }
          return `${ce.value} ${e}`;
        }),
        ye = e => {
          let t = F(e.value) ? e.value() : e.value;
          if (t) {
            ((B = !0), pe((0, $.default)(t).locale(m.value)));
            return;
          }
          e.onClick && e.onClick({ attrs: u, slots: d, emit: s });
        },
        xe = f(() => {
          let { type: e } = a;
          return [`week`, `month`, `months`, `year`, `years`, `dates`].includes(e) ? e : `date`;
        }),
        Se = f(() => xe.value === `dates` || xe.value === `months` || xe.value === `years`),
        Ce = f(() => (xe.value === `date` ? q.value : xe.value)),
        we = f(() => !!D.length),
        Te = async (e, t) => {
          (xe.value === `month`
            ? ((z.value = qr(z.value, z.value.year(), e, m.value, k)), pe(z.value, !1))
            : xe.value === `months`
              ? pe(e, t ?? !0)
              : ((z.value = qr(z.value, z.value.year(), e, m.value, k)),
                (q.value = `date`),
                [`month`, `year`, `date`, `week`].includes(xe.value) && (pe(z.value, !0), await re(), Qe())),
            rt(`month`));
        },
        De = async (e, t) => {
          (xe.value === `year`
            ? ((z.value = Jr(z.value.startOf(`year`).year(e), m.value, k)), pe(z.value, !1))
            : xe.value === `years`
              ? pe(e, t ?? !0)
              : ((z.value = Jr(z.value.year(e), m.value, k)),
                (q.value = `month`),
                [`month`, `year`, `date`, `week`].includes(xe.value) && (pe(z.value, !0), await re(), Qe())),
            rt(`year`));
        },
        Oe = Re(),
        ke = async e => {
          Oe.value || ((q.value = e), await re(), Qe());
        },
        Ae = f(() => a.type === `datetime` || a.type === `datetimerange`),
        je = f(() => {
          let e = Ae.value || xe.value === `dates`,
            t = xe.value === `years`,
            n = xe.value === `months`,
            r = q.value === `date`,
            i = q.value === `year`,
            a = q.value === `month`;
          return (e && r) || (t && i) || (n && a);
        }),
        Me = f(() => (!Se.value && a.showNow) || a.showConfirm),
        Ne = f(() =>
          k ? (a.parsedValue ? (y(a.parsedValue) ? k(a.parsedValue[0].toDate()) : k(a.parsedValue.toDate())) : !0) : !1
        ),
        Pe = () => {
          if (Se.value) pe(a.parsedValue);
          else {
            let e = Ze(a.parsedValue);
            if (!e) {
              let t = (0, $.default)(P).locale(m.value),
                n = Xe();
              e = t.year(n.year()).month(n.month()).date(n.date());
            }
            ((z.value = e), pe(e));
          }
        },
        Ie = f(() => (k ? k((0, $.default)().locale(m.value).toDate()) : !1)),
        Le = () => {
          let e = (0, $.default)().locale(m.value).toDate();
          ((te.value = !0), (!k || !k(e)) && de(e) && ((z.value = (0, $.default)().locale(m.value)), pe(z.value)));
        },
        J = f(() => a.timeFormat || rr(a.format) || `HH:mm:ss`),
        ze = f(() => a.dateFormat || nr(a.format) || `YYYY-MM-DD`),
        Be = f(() => {
          if (ue.value) return ue.value;
          if (!(!a.parsedValue && !L.value)) return (Ze(a.parsedValue) || z.value).format(J.value);
        }),
        Ve = f(() => {
          if (W.value) return W.value;
          if (!(!a.parsedValue && !L.value)) return (Ze(a.parsedValue) || z.value).format(ze.value);
        }),
        He = K(!1),
        Ue = () => {
          He.value = !0;
        },
        We = () => {
          He.value = !1;
        },
        Y = e => ({
          hour: e.hour(),
          minute: e.minute(),
          second: e.second(),
          year: e.year(),
          month: e.month(),
          date: e.date()
        }),
        Ge = (e, t, n) => {
          let { hour: r, minute: i, second: o } = Y(e),
            s = Ze(a.parsedValue);
          ((z.value = s ? s.hour(r).minute(i).second(o) : e), pe(z.value, !0), n || (He.value = t));
        },
        Ke = e => {
          let t = (0, $.default)(e, J.value).locale(m.value);
          if (t.isValid() && de(t)) {
            let { year: e, month: n, date: r } = Y(z.value);
            ((z.value = t.year(e).month(n).date(r)), (ue.value = null), (He.value = !1), pe(z.value, !0));
          }
        },
        qe = e => {
          let t = Yr(e, ze.value, m.value, _);
          if (t.isValid()) {
            if (k && k(t.toDate())) return;
            let { hour: e, minute: n, second: r } = Y(z.value);
            ((z.value = t.hour(e).minute(n).second(r)), (W.value = null), pe(z.value, !0));
          }
        },
        Je = e => $.default.isDayjs(e) && e.isValid() && (k ? !k(e.toDate()) : !0),
        Ye = e => Yr(e, a.format, m.value, _),
        Xe = () => {
          let e = (0, $.default)(L.value).locale(m.value);
          if (!L.value) {
            let e = V.value;
            return (0, $.default)().hour(e.hour()).minute(e.minute()).second(e.second()).locale(m.value);
          }
          return e;
        },
        Qe = () => {
          [`week`, `month`, `year`, `date`].includes(xe.value) && R.value?.focus();
        },
        et = () => {
          (Qe(), xe.value === `week` && nt(be.down));
        },
        tt = e => {
          let t = pt(e);
          ([be.up, be.down, be.left, be.right, be.home, be.end, be.pageUp, be.pageDown].includes(t) &&
            (nt(t), e.stopPropagation(), e.preventDefault()),
            [be.enter, be.space, be.numpadEnter].includes(t) &&
              W.value === null &&
              ue.value === null &&
              (e.preventDefault(), pe(z.value, !1)));
        },
        nt = e => {
          let { up: t, down: n, left: r, right: i, home: a, end: o, pageUp: c, pageDown: l } = be,
            u = {
              year: { [t]: -4, [n]: 4, [r]: -1, [i]: 1, offset: (e, t) => e.setFullYear(e.getFullYear() + t) },
              month: { [t]: -4, [n]: 4, [r]: -1, [i]: 1, offset: (e, t) => e.setMonth(e.getMonth() + t) },
              week: { [t]: -1, [n]: 1, [r]: -1, [i]: 1, offset: (e, t) => e.setDate(e.getDate() + t * 7) },
              date: {
                [t]: -7,
                [n]: 7,
                [r]: -1,
                [i]: 1,
                [a]: e => -e.getDay(),
                [o]: e => -e.getDay() + 6,
                [c]: e => -new Date(e.getFullYear(), e.getMonth(), 0).getDate(),
                [l]: e => new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate(),
                offset: (e, t) => e.setDate(e.getDate() + t)
              }
            },
            d = z.value.toDate();
          for (; Math.abs(z.value.diff(d, `year`, !0)) < 1; ) {
            let t = u[Ce.value];
            if (!t) return;
            if ((t.offset(d, F(t[e]) ? t[e](d) : (t[e] ?? 0)), k && k(d))) break;
            let n = (0, $.default)(d).locale(m.value);
            ((z.value = n), s(`pick`, n, !0));
            break;
          }
        },
        rt = e => {
          s(`panel-change`, z.value.toDate(), e, q.value);
        };
      return (
        g(
          () => xe.value,
          e => {
            if ([`month`, `year`].includes(e)) {
              q.value = e;
              return;
            } else if (e === `years`) {
              q.value = `year`;
              return;
            } else if (e === `months`) {
              q.value = `month`;
              return;
            }
            q.value = `date`;
          },
          { immediate: !0 }
        ),
        g(
          () => L.value,
          e => {
            e && (z.value = Xe());
          },
          { immediate: !0 }
        ),
        g(
          () => a.parsedValue,
          e => {
            if (e) {
              if (Se.value || y(e)) return;
              z.value = e;
            } else z.value = Xe();
          },
          { immediate: !0 }
        ),
        s(`set-picker-option`, [`isValidValue`, Je]),
        s(`set-picker-option`, [`parseUserInput`, Ye]),
        s(`set-picker-option`, [`handleFocusPicker`, et]),
        (e, t) => (
          O(),
          v(
            `div`,
            {
              class: A([
                U(c).b(),
                U(l).b(),
                U(c).is(`border`, e.border),
                U(c).is(`disabled`, U(Oe)),
                { 'has-sidebar': e.$slots.sidebar || we.value, 'has-time': Ae.value }
              ])
            },
            [
              T(
                `div`,
                { class: A(U(c).e(`body-wrapper`)) },
                [
                  j(e.$slots, `sidebar`, { class: A(U(c).e(`sidebar`)) }),
                  we.value
                    ? (O(),
                      v(
                        `div`,
                        { key: 0, class: A(U(c).e(`sidebar`)) },
                        [
                          (O(!0),
                          v(
                            S,
                            null,
                            _e(
                              U(D),
                              (e, t) => (
                                O(),
                                v(
                                  `button`,
                                  {
                                    key: t,
                                    type: `button`,
                                    disabled: U(Oe),
                                    class: A(U(c).e(`shortcut`)),
                                    onClick: t => ye(e)
                                  },
                                  N(e.text),
                                  11,
                                  mi
                                )
                              )
                            ),
                            128
                          ))
                        ],
                        2
                      ))
                    : E(`v-if`, !0),
                  T(
                    `div`,
                    { class: A(U(c).e(`body`)) },
                    [
                      Ae.value
                        ? (O(),
                          v(
                            `div`,
                            { key: 0, class: A(U(l).e(`time-header`)) },
                            [
                              T(
                                `span`,
                                { class: A(U(l).e(`editor-wrap`)) },
                                [
                                  G(
                                    U(Et),
                                    {
                                      placeholder: U(p)(`el.datepicker.selectDate`),
                                      'model-value': Ve.value,
                                      size: `small`,
                                      'validate-event': !1,
                                      disabled: U(Oe),
                                      readonly: !e.editable,
                                      onInput: (t[0] ||= e => (W.value = e)),
                                      onChange: qe
                                    },
                                    null,
                                    8,
                                    [`placeholder`, `model-value`, `disabled`, `readonly`]
                                  )
                                ],
                                2
                              ),
                              ne(
                                (O(),
                                v(
                                  `span`,
                                  { class: A(U(l).e(`editor-wrap`)) },
                                  [
                                    G(
                                      U(Et),
                                      {
                                        placeholder: U(p)(`el.datepicker.selectTime`),
                                        'model-value': Be.value,
                                        size: `small`,
                                        'validate-event': !1,
                                        disabled: U(Oe),
                                        readonly: !e.editable,
                                        onFocus: Ue,
                                        onInput: (t[1] ||= e => (ue.value = e)),
                                        onChange: Ke
                                      },
                                      null,
                                      8,
                                      [`placeholder`, `model-value`, `disabled`, `readonly`]
                                    ),
                                    G(
                                      U(jr),
                                      { visible: He.value, format: J.value, 'parsed-value': z.value, onPick: Ge },
                                      null,
                                      8,
                                      [`visible`, `format`, `parsed-value`]
                                    )
                                  ],
                                  2
                                )),
                                [[U(at), We]]
                              )
                            ],
                            2
                          ))
                        : E(`v-if`, !0),
                      ne(
                        T(
                          `div`,
                          {
                            class: A([
                              U(l).e(`header`),
                              (q.value === `year` || q.value === `month`) && U(l).em(`header`, `bordered`)
                            ])
                          },
                          [
                            T(
                              `span`,
                              { class: A(U(l).e(`prev-btn`)) },
                              [
                                T(
                                  `button`,
                                  {
                                    type: `button`,
                                    'aria-label': U(p)(`el.datepicker.prevYear`),
                                    class: A([`d-arrow-left`, U(c).e(`icon-btn`)]),
                                    disabled: U(Oe),
                                    onClick: (t[2] ||= e => ge(!1))
                                  },
                                  [
                                    j(e.$slots, `prev-year`, {}, () => [
                                      G(U(Z), null, { default: n(() => [G(U(I))]), _: 1 })
                                    ])
                                  ],
                                  10,
                                  hi
                                ),
                                ne(
                                  T(
                                    `button`,
                                    {
                                      type: `button`,
                                      'aria-label': U(p)(`el.datepicker.prevMonth`),
                                      class: A([U(c).e(`icon-btn`), `arrow-left`]),
                                      disabled: U(Oe),
                                      onClick: (t[3] ||= e => he(!1))
                                    },
                                    [
                                      j(e.$slots, `prev-month`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(ie))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    gi
                                  ),
                                  [[r, q.value === `date`]]
                                )
                              ],
                              2
                            ),
                            T(
                              `span`,
                              {
                                role: `button`,
                                class: A(U(l).e(`header-label`)),
                                'aria-live': `polite`,
                                tabindex: e.disabled ? void 0 : 0,
                                'aria-disabled': e.disabled,
                                onKeydown: (t[4] ||= x(e => ke(`year`), [`enter`])),
                                onClick: (t[5] ||= e => ke(`year`))
                              },
                              N(ve.value),
                              43,
                              _i
                            ),
                            ne(
                              T(
                                `span`,
                                {
                                  role: `button`,
                                  'aria-live': `polite`,
                                  tabindex: e.disabled ? void 0 : 0,
                                  'aria-disabled': e.disabled,
                                  class: A([U(l).e(`header-label`), { active: q.value === `month` }]),
                                  onKeydown: (t[6] ||= x(e => ke(`month`), [`enter`])),
                                  onClick: (t[7] ||= e => ke(`month`))
                                },
                                N(U(p)(`el.datepicker.month${H.value + 1}`)),
                                43,
                                vi
                              ),
                              [[r, q.value === `date`]]
                            ),
                            T(
                              `span`,
                              { class: A(U(l).e(`next-btn`)) },
                              [
                                ne(
                                  T(
                                    `button`,
                                    {
                                      type: `button`,
                                      'aria-label': U(p)(`el.datepicker.nextMonth`),
                                      class: A([U(c).e(`icon-btn`), `arrow-right`]),
                                      disabled: U(Oe),
                                      onClick: (t[8] ||= e => he(!0))
                                    },
                                    [
                                      j(e.$slots, `next-month`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(se))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    yi
                                  ),
                                  [[r, q.value === `date`]]
                                ),
                                T(
                                  `button`,
                                  {
                                    type: `button`,
                                    'aria-label': U(p)(`el.datepicker.nextYear`),
                                    class: A([U(c).e(`icon-btn`), `d-arrow-right`]),
                                    disabled: U(Oe),
                                    onClick: (t[9] ||= e => ge(!0))
                                  },
                                  [
                                    j(e.$slots, `next-year`, {}, () => [
                                      G(U(Z), null, { default: n(() => [G(U(oe))]), _: 1 })
                                    ])
                                  ],
                                  10,
                                  bi
                                )
                              ],
                              2
                            )
                          ],
                          2
                        ),
                        [[r, q.value !== `time`]]
                      ),
                      T(
                        `div`,
                        { class: A(U(c).e(`content`)), onKeydown: tt },
                        [
                          q.value === `date`
                            ? (O(),
                              w(
                                ai,
                                {
                                  key: 0,
                                  ref_key: `currentViewRef`,
                                  ref: R,
                                  'selection-mode': xe.value,
                                  date: z.value,
                                  'parsed-value': e.parsedValue,
                                  'disabled-date': U(k),
                                  disabled: U(Oe),
                                  'cell-class-name': U(M),
                                  'show-week-number': e.showWeekNumber,
                                  onPick: me
                                },
                                null,
                                8,
                                [
                                  `selection-mode`,
                                  `date`,
                                  `parsed-value`,
                                  `disabled-date`,
                                  `disabled`,
                                  `cell-class-name`,
                                  `show-week-number`
                                ]
                              ))
                            : E(`v-if`, !0),
                          q.value === `year`
                            ? (O(),
                              w(
                                pi,
                                {
                                  key: 1,
                                  ref_key: `currentViewRef`,
                                  ref: R,
                                  'selection-mode': xe.value,
                                  date: z.value,
                                  'disabled-date': U(k),
                                  disabled: U(Oe),
                                  'parsed-value': e.parsedValue,
                                  'cell-class-name': U(M),
                                  onPick: De
                                },
                                null,
                                8,
                                [
                                  `selection-mode`,
                                  `date`,
                                  `disabled-date`,
                                  `disabled`,
                                  `parsed-value`,
                                  `cell-class-name`
                                ]
                              ))
                            : E(`v-if`, !0),
                          q.value === `month`
                            ? (O(),
                              w(
                                li,
                                {
                                  key: 2,
                                  ref_key: `currentViewRef`,
                                  ref: R,
                                  'selection-mode': xe.value,
                                  date: z.value,
                                  'parsed-value': e.parsedValue,
                                  'disabled-date': U(k),
                                  disabled: U(Oe),
                                  'cell-class-name': U(M),
                                  onPick: Te
                                },
                                null,
                                8,
                                [
                                  `selection-mode`,
                                  `date`,
                                  `parsed-value`,
                                  `disabled-date`,
                                  `disabled`,
                                  `cell-class-name`
                                ]
                              ))
                            : E(`v-if`, !0)
                        ],
                        34
                      )
                    ],
                    2
                  )
                ],
                2
              ),
              e.showFooter && je.value && Me.value
                ? (O(),
                  v(
                    `div`,
                    { key: 0, class: A(U(c).e(`footer`)) },
                    [
                      ne(
                        G(
                          U($e),
                          { text: ``, size: `small`, class: A(U(c).e(`link-btn`)), disabled: Ie.value, onClick: Le },
                          { default: n(() => [ee(N(U(p)(`el.datepicker.now`)), 1)]), _: 1 },
                          8,
                          [`class`, `disabled`]
                        ),
                        [[r, !Se.value && e.showNow]]
                      ),
                      e.showConfirm
                        ? (O(),
                          w(
                            U($e),
                            {
                              key: 0,
                              plain: ``,
                              size: `small`,
                              class: A(U(c).e(`link-btn`)),
                              disabled: Ne.value,
                              onClick: Pe
                            },
                            { default: n(() => [ee(N(U(p)(`el.datepicker.confirm`)), 1)]), _: 1 },
                            8,
                            [`class`, `disabled`]
                          ))
                        : E(`v-if`, !0)
                    ],
                    2
                  ))
                : E(`v-if`, !0)
            ],
            2
          )
        )
      );
    }
  }),
  Si = J({ ...zr, ...Br }),
  Ci = e => {
    let { emit: t } = le(),
      n = b(),
      r = o();
    return i => {
      let a = F(i.value) ? i.value() : i.value;
      if (a) {
        t(`pick`, [(0, $.default)(a[0]).locale(e.value), (0, $.default)(a[1]).locale(e.value)]);
        return;
      }
      i.onClick && i.onClick({ attrs: n, slots: r, emit: t });
    };
  },
  wi = (e, { defaultValue: t, defaultTime: n, leftDate: r, rightDate: i, step: a, unit: o, sortDates: s }) => {
    let { emit: c } = le(),
      { pickerNs: l } = ae(Fr),
      u = Fe(`date-range-picker`),
      { t: d, lang: f } = Ee(),
      p = Ci(f),
      m = K(),
      h = K(),
      _ = K({ endDate: null, selecting: !1 }),
      v = e => {
        _.value = e;
      },
      b = (e = !1) => {
        let t = U(m),
          n = U(h);
        Ur([t, n]) && c(`pick`, [t, n], e);
      },
      x = e => {
        ((_.value.selecting = e), e || (_.value.endDate = null));
      },
      S = e => {
        if (y(e) && e.length === 2) {
          let [t, n] = e;
          ((m.value = t), (r.value = t), (h.value = n), s(U(m), U(h)));
        } else C();
      },
      C = () => {
        let [s, c] = Wr(U(t), { lang: U(f), step: a, unit: o, unlinkPanels: e.unlinkPanels }),
          l = e => e.diff(e.startOf(`d`), `ms`),
          u = U(n);
        if (u) {
          let e = 0,
            t = 0;
          if (y(u)) {
            let [n, r] = u.map($.default);
            ((e = l(n)), (t = l(r)));
          } else {
            let n = l((0, $.default)(u));
            ((e = n), (t = n));
          }
          ((s = s.startOf(`d`).add(e, `ms`)), (c = c.startOf(`d`).add(t, `ms`)));
        }
        ((m.value = void 0), (h.value = void 0), (r.value = s), (i.value = c));
      };
    return (
      g(
        t,
        e => {
          e && C();
        },
        { immediate: !0 }
      ),
      g(
        () => e.parsedValue,
        e => {
          (!e?.length || !ve(e, [m.value, h.value])) && S(e);
        },
        { immediate: !0 }
      ),
      g(
        () => e.visible,
        () => {
          e.visible && S(e.parsedValue);
        },
        { immediate: !0 }
      ),
      {
        minDate: m,
        maxDate: h,
        rangeState: _,
        lang: f,
        ppNs: l,
        drpNs: u,
        handleChangeRange: v,
        handleRangeConfirm: b,
        handleShortcutClick: p,
        onSelect: x,
        parseValue: S,
        t: d
      }
    );
  },
  Ti = (e, t, n, r) => {
    let i = K(`date`),
      a = K(),
      o = K(`date`),
      s = K(),
      { disabledDate: c } = ae(Jn).props,
      { t: l, lang: u } = Ee(),
      d = f(() => n.value.year()),
      p = f(() => n.value.month()),
      m = f(() => r.value.year()),
      h = f(() => r.value.month());
    function g(e, t) {
      let n = l(`el.datepicker.year`);
      if (e.value === `year`) {
        let e = Math.floor(t.value / 10) * 10;
        return n ? `${e} ${n} - ${e + 9} ${n}` : `${e} - ${e + 9}`;
      }
      return `${t.value} ${n}`;
    }
    function _(e) {
      e?.focus();
    }
    async function v(t, n) {
      if (e.disabled) return;
      let r = t === `left` ? i : o,
        c = t === `left` ? a : s;
      ((r.value = n), await re(), _(c.value));
    }
    async function y(t, l, d) {
      if (e.disabled) return;
      let f = l === `left`,
        p = f ? n : r,
        m = f ? r : n,
        h = f ? i : o,
        g = f ? a : s;
      (t === `year` && (p.value = Jr(p.value.year(d), u.value, c)),
        t === `month` && (p.value = qr(p.value, p.value.year(), d, u.value, c)),
        e.unlinkPanels || (m.value = l === `left` ? p.value.add(1, `month`) : p.value.subtract(1, `month`)),
        (h.value = t === `year` ? `month` : `date`),
        await re(),
        _(g.value),
        b(t));
    }
    function b(e) {
      t(`panel-change`, [n.value.toDate(), r.value.toDate()], e);
    }
    function x(e, t, n) {
      let r = n ? `add` : `subtract`;
      return e === `year` ? t[r](10, `year`) : t[r](1, `year`);
    }
    return {
      leftCurrentView: i,
      rightCurrentView: o,
      leftCurrentViewRef: a,
      rightCurrentViewRef: s,
      leftYear: d,
      rightYear: m,
      leftMonth: p,
      rightMonth: h,
      leftYearLabel: f(() => g(i, d)),
      rightYearLabel: f(() => g(o, m)),
      showLeftPicker: e => v(`left`, e),
      showRightPicker: e => v(`right`, e),
      handleLeftYearPick: e => y(`year`, `left`, e),
      handleRightYearPick: e => y(`year`, `right`, e),
      handleLeftMonthPick: e => y(`month`, `left`, e),
      handleRightMonthPick: e => y(`month`, `right`, e),
      handlePanelChange: b,
      adjustDateByView: x
    };
  },
  Ei = [`disabled`, `onClick`],
  Di = [`aria-label`, `disabled`],
  Oi = [`aria-label`, `disabled`],
  ki = [`disabled`, `aria-label`],
  Ai = [`disabled`, `aria-label`],
  ji = [`tabindex`, `aria-disabled`],
  Mi = [`tabindex`, `aria-disabled`],
  Ni = [`disabled`, `aria-label`],
  Pi = [`disabled`, `aria-label`],
  Fi = [`aria-label`, `disabled`],
  Ii = [`disabled`, `aria-label`],
  Li = [`tabindex`, `aria-disabled`],
  Ri = [`tabindex`, `aria-disabled`],
  zi = `month`,
  Bi = H({
    __name: `panel-date-range`,
    props: Si,
    emits: [`pick`, `set-picker-option`, `calendar-change`, `panel-change`, `clear`],
    setup(e, { emit: t }) {
      let i = e,
        a = t,
        o = ae(Jn),
        s = ae(Ir, void 0),
        { disabledDate: c, cellClassName: l, defaultTime: u, clearable: d } = o.props,
        p = C(o.props, `format`),
        m = C(o.props, `shortcuts`),
        h = C(o.props, `defaultValue`),
        { lang: _ } = Ee(),
        y = K((0, $.default)().locale(_.value)),
        b = K((0, $.default)().locale(_.value).add(1, zi)),
        {
          minDate: D,
          maxDate: k,
          rangeState: M,
          ppNs: P,
          drpNs: F,
          handleChangeRange: L,
          handleRangeConfirm: R,
          handleShortcutClick: z,
          onSelect: te,
          parseValue: B,
          t: V
        } = wi(i, { defaultValue: h, defaultTime: u, leftDate: y, rightDate: b, unit: zi, sortDates: ut });
      g(
        () => i.visible,
        e => {
          !e && M.value.selecting && (B(i.parsedValue), te(!1));
        }
      );
      let H = K({ min: null, max: null }),
        ce = K({ min: null, max: null }),
        {
          leftCurrentView: le,
          rightCurrentView: W,
          leftCurrentViewRef: ue,
          rightCurrentViewRef: de,
          leftYear: fe,
          rightYear: pe,
          leftMonth: me,
          rightMonth: he,
          leftYearLabel: ge,
          rightYearLabel: q,
          showLeftPicker: ve,
          showRightPicker: ye,
          handleLeftYearPick: be,
          handleRightYearPick: xe,
          handleLeftMonthPick: Se,
          handleRightMonthPick: Ce,
          handlePanelChange: we,
          adjustDateByView: Te
        } = Ti(i, a, y, b),
        De = f(() => !!m.value.length),
        Oe = f(() => (H.value.min === null ? (D.value ? D.value.format(Ne.value) : ``) : H.value.min)),
        ke = f(() =>
          H.value.max === null ? (k.value || D.value ? (k.value || D.value).format(Ne.value) : ``) : H.value.max
        ),
        Ae = f(() => (ce.value.min === null ? (D.value ? D.value.format(Me.value) : ``) : ce.value.min)),
        je = f(() =>
          ce.value.max === null ? (k.value || D.value ? (k.value || D.value).format(Me.value) : ``) : ce.value.max
        ),
        Me = f(() => i.timeFormat || rr(p.value || ``) || `HH:mm:ss`),
        Ne = f(() => i.dateFormat || nr(p.value || ``) || `YYYY-MM-DD`),
        Pe = e => Ur(e) && (c ? !c(e[0].toDate()) && !c(e[1].toDate()) : !0),
        Fe = () => {
          ((y.value = Te(le.value, y.value, !1)), i.unlinkPanels || (b.value = y.value.add(1, `month`)), we(`year`));
        },
        Ie = () => {
          ((y.value = y.value.subtract(1, `month`)),
            i.unlinkPanels || (b.value = y.value.add(1, `month`)),
            we(`month`));
        },
        Le = () => {
          (i.unlinkPanels
            ? (b.value = Te(W.value, b.value, !0))
            : ((y.value = Te(W.value, y.value, !0)), (b.value = y.value.add(1, `month`))),
            we(`year`));
        },
        J = () => {
          (i.unlinkPanels
            ? (b.value = b.value.add(1, `month`))
            : ((y.value = y.value.add(1, `month`)), (b.value = y.value.add(1, `month`))),
            we(`month`));
        },
        ze = () => {
          ((y.value = Te(le.value, y.value, !0)), we(`year`));
        },
        Be = () => {
          ((y.value = y.value.add(1, `month`)), we(`month`));
        },
        Ve = () => {
          ((b.value = Te(W.value, b.value, !1)), we(`year`));
        },
        He = () => {
          ((b.value = b.value.subtract(1, `month`)), we(`month`));
        },
        Ue = f(() => {
          let e = (me.value + 1) % 12,
            t = +(me.value + 1 >= 12);
          return i.singlePanel || (i.unlinkPanels && new Date(fe.value + t, e) < new Date(pe.value, he.value));
        }),
        We = f(
          () => i.singlePanel || (i.unlinkPanels && pe.value * 12 + he.value - (fe.value * 12 + me.value + 1) >= 12)
        ),
        Y = Re(),
        Ge = f(() => !(D.value && k.value && !M.value.selecting && Ur([D.value, k.value]) && !Y.value)),
        Ke = f(() => i.type === `datetime` || i.type === `datetimerange`),
        qe = (e, t) => {
          if (e)
            return u
              ? (0, $.default)(u[t] || u)
                  .locale(_.value)
                  .year(e.year())
                  .month(e.month())
                  .date(e.date())
              : e;
        },
        Je = (e, t = !0) => {
          let n = e.minDate,
            r = e.maxDate,
            i = qe(n, 0),
            o = qe(r, 1);
          (k.value === o && D.value === i) ||
            (a(`calendar-change`, [n.toDate(), r && r.toDate()]),
            (k.value = o),
            (D.value = i),
            !Ke.value && t && (t = !i || !o),
            R(t));
        },
        Ye = K(!1),
        Xe = K(!1),
        Ze = () => {
          Ye.value = !1;
        },
        Qe = () => {
          Xe.value = !1;
        },
        et = (e, t) => {
          if (!c || !c(e.toDate())) return e;
          let n = e.isBefore(t),
            r = e;
          for (; n ? r.isBefore(t) : r.isAfter(t); )
            if (((r = n ? r.add(1, `day`) : r.subtract(1, `day`)), !c(r.toDate()))) return r;
          return e;
        },
        tt = (e, t) => {
          H.value[t] = e;
          let n = (0, $.default)(e, Ne.value).locale(_.value);
          if (n.isValid()) {
            if (c && c(n.toDate())) return;
            if (t === `min`) {
              if (
                ((y.value = n),
                (D.value = (D.value || y.value).year(n.year()).month(n.month()).date(n.date())),
                !i.unlinkPanels && !k.value)
              ) {
                let e = et(D.value.add(1, `month`), D.value);
                ((b.value = e), (k.value = e));
              }
            } else if (
              ((b.value = n),
              (k.value = (k.value || b.value).year(n.year()).month(n.month()).date(n.date())),
              !i.unlinkPanels && !D.value)
            ) {
              let e = et(k.value.subtract(1, `month`), k.value);
              ((y.value = e), (D.value = e));
            }
            (ut(D.value, k.value), R(!0));
          }
        },
        nt = (e, t) => {
          if (((H.value[t] = null), t === `min`)) {
            if (!i.unlinkPanels && k.value && D.value && k.value.isBefore(D.value)) {
              let e = et(D.value.add(1, `month`), D.value);
              ((b.value = e), (k.value = e));
            }
          } else if (!i.unlinkPanels && D.value && k.value && D.value.isAfter(k.value)) {
            let e = et(k.value.subtract(1, `month`), k.value);
            ((y.value = e), (D.value = e));
          }
          (ut(D.value, k.value), R(!0));
        },
        rt = (e, t) => {
          ce.value[t] = e;
          let n = (0, $.default)(e, Me.value).locale(_.value);
          n.isValid() &&
            (t === `min`
              ? ((Ye.value = !0),
                (D.value = (D.value || y.value).hour(n.hour()).minute(n.minute()).second(n.second())),
                (y.value = D.value))
              : ((Xe.value = !0),
                (k.value = (k.value || b.value).hour(n.hour()).minute(n.minute()).second(n.second())),
                (b.value = k.value)));
        },
        it = (e, t) => {
          ((ce.value[t] = null),
            t === `min`
              ? ((y.value = D.value), (Ye.value = !1), (!k.value || k.value.isBefore(D.value)) && (k.value = D.value))
              : ((b.value = k.value), (Xe.value = !1), k.value && k.value.isBefore(D.value) && (D.value = k.value)),
            R(!0));
        },
        ot = (e, t, n) => {
          ce.value.min ||
            (e && (D.value = (D.value || y.value).hour(e.hour()).minute(e.minute()).second(e.second())),
            n || (Ye.value = t),
            (!k.value || k.value.isBefore(D.value)) &&
              ((k.value = D.value),
              (b.value = e),
              re(() => {
                B(i.parsedValue);
              })),
            R(!0));
        },
        st = (e, t, n) => {
          ce.value.max ||
            (e && (k.value = (k.value || b.value).hour(e.hour()).minute(e.minute()).second(e.second())),
            n || (Xe.value = t),
            k.value && k.value.isBefore(D.value) && (D.value = k.value),
            R(!0));
        },
        ct = () => {
          (X(), a(`clear`));
        },
        X = () => {
          let e = null;
          (o?.emptyValues && (e = o.emptyValues.valueOnClear.value),
            (y.value = Wr(U(h), { lang: U(_), unit: `month`, unlinkPanels: i.unlinkPanels })[0]),
            (b.value = y.value.add(1, `month`)),
            (k.value = void 0),
            (D.value = void 0),
            R(!0),
            a(`pick`, e));
        },
        lt = e => Yr(e, p.value || ``, _.value, s);
      function ut(e, t) {
        if (i.unlinkPanels && t) {
          let n = e?.year() || 0,
            r = e?.month() || 0,
            i = t.year(),
            a = t.month();
          b.value = n === i && r === a ? t.add(1, zi) : t;
        } else
          ((b.value = y.value.add(1, zi)),
            t && (b.value = b.value.hour(t.hour()).minute(t.minute()).second(t.second())));
      }
      return (
        a(`set-picker-option`, [`isValidValue`, Pe]),
        a(`set-picker-option`, [`parseUserInput`, lt]),
        a(`set-picker-option`, [`handleClear`, X]),
        (e, t) => (
          O(),
          v(
            `div`,
            {
              class: A([
                U(P).b(),
                U(F).b(),
                U(P).is(`border`, e.border),
                U(P).is(`disabled`, U(Y)),
                { 'has-sidebar': e.$slots.sidebar || De.value, 'has-time': Ke.value, 'single-panel': e.singlePanel }
              ])
            },
            [
              T(
                `div`,
                { class: A(U(P).e(`body-wrapper`)) },
                [
                  j(e.$slots, `sidebar`, { class: A(U(P).e(`sidebar`)) }),
                  De.value
                    ? (O(),
                      v(
                        `div`,
                        { key: 0, class: A(U(P).e(`sidebar`)) },
                        [
                          (O(!0),
                          v(
                            S,
                            null,
                            _e(
                              m.value,
                              (e, t) => (
                                O(),
                                v(
                                  `button`,
                                  {
                                    key: t,
                                    type: `button`,
                                    disabled: U(Y),
                                    class: A(U(P).e(`shortcut`)),
                                    onClick: t => U(z)(e)
                                  },
                                  N(e.text),
                                  11,
                                  Ei
                                )
                              )
                            ),
                            128
                          ))
                        ],
                        2
                      ))
                    : E(`v-if`, !0),
                  T(
                    `div`,
                    { class: A(U(P).e(`body`)) },
                    [
                      Ke.value
                        ? (O(),
                          v(
                            `div`,
                            { key: 0, class: A(U(F).e(`time-header`)) },
                            [
                              T(
                                `span`,
                                { class: A(U(F).e(`editors-wrap`)) },
                                [
                                  T(
                                    `span`,
                                    { class: A(U(F).e(`time-picker-wrap`)) },
                                    [
                                      G(
                                        U(Et),
                                        {
                                          size: `small`,
                                          disabled: U(M).selecting || U(Y),
                                          placeholder: U(V)(`el.datepicker.startDate`),
                                          class: A(U(F).e(`editor`)),
                                          'model-value': Oe.value,
                                          'validate-event': !1,
                                          readonly: !e.editable,
                                          onInput: (t[0] ||= e => tt(e, `min`)),
                                          onChange: (t[1] ||= e => nt(e, `min`))
                                        },
                                        null,
                                        8,
                                        [`disabled`, `placeholder`, `class`, `model-value`, `readonly`]
                                      )
                                    ],
                                    2
                                  ),
                                  ne(
                                    (O(),
                                    v(
                                      `span`,
                                      { class: A(U(F).e(`time-picker-wrap`)) },
                                      [
                                        G(
                                          U(Et),
                                          {
                                            size: `small`,
                                            class: A(U(F).e(`editor`)),
                                            disabled: U(M).selecting || U(Y),
                                            placeholder: U(V)(`el.datepicker.startTime`),
                                            'model-value': Ae.value,
                                            'validate-event': !1,
                                            readonly: !e.editable,
                                            onFocus: (t[2] ||= e => (Ye.value = !0)),
                                            onInput: (t[3] ||= e => rt(e, `min`)),
                                            onChange: (t[4] ||= e => it(e, `min`))
                                          },
                                          null,
                                          8,
                                          [`class`, `disabled`, `placeholder`, `model-value`, `readonly`]
                                        ),
                                        G(
                                          U(jr),
                                          {
                                            visible: Ye.value,
                                            format: Me.value,
                                            'datetime-role': `start`,
                                            'parsed-value': U(D) || y.value,
                                            onPick: ot
                                          },
                                          null,
                                          8,
                                          [`visible`, `format`, `parsed-value`]
                                        )
                                      ],
                                      2
                                    )),
                                    [[U(at), Ze]]
                                  )
                                ],
                                2
                              ),
                              T(`span`, null, [G(U(Z), null, { default: n(() => [G(U(se))]), _: 1 })]),
                              T(
                                `span`,
                                { class: A([U(F).e(`editors-wrap`), `is-right`]) },
                                [
                                  T(
                                    `span`,
                                    { class: A(U(F).e(`time-picker-wrap`)) },
                                    [
                                      G(
                                        U(Et),
                                        {
                                          size: `small`,
                                          class: A(U(F).e(`editor`)),
                                          disabled: U(M).selecting || U(Y),
                                          placeholder: U(V)(`el.datepicker.endDate`),
                                          'model-value': ke.value,
                                          readonly: !U(D) || !e.editable,
                                          'validate-event': !1,
                                          onInput: (t[5] ||= e => tt(e, `max`)),
                                          onChange: (t[6] ||= e => nt(e, `max`))
                                        },
                                        null,
                                        8,
                                        [`class`, `disabled`, `placeholder`, `model-value`, `readonly`]
                                      )
                                    ],
                                    2
                                  ),
                                  ne(
                                    (O(),
                                    v(
                                      `span`,
                                      { class: A(U(F).e(`time-picker-wrap`)) },
                                      [
                                        G(
                                          U(Et),
                                          {
                                            size: `small`,
                                            class: A(U(F).e(`editor`)),
                                            disabled: U(M).selecting || U(Y),
                                            placeholder: U(V)(`el.datepicker.endTime`),
                                            'model-value': je.value,
                                            readonly: !U(D) || !e.editable,
                                            'validate-event': !1,
                                            onFocus: (t[7] ||= e => U(D) && (Xe.value = !0)),
                                            onInput: (t[8] ||= e => rt(e, `max`)),
                                            onChange: (t[9] ||= e => it(e, `max`))
                                          },
                                          null,
                                          8,
                                          [`class`, `disabled`, `placeholder`, `model-value`, `readonly`]
                                        ),
                                        G(
                                          U(jr),
                                          {
                                            'datetime-role': `end`,
                                            visible: Xe.value,
                                            format: Me.value,
                                            'parsed-value': U(k) || b.value,
                                            onPick: st
                                          },
                                          null,
                                          8,
                                          [`visible`, `format`, `parsed-value`]
                                        )
                                      ],
                                      2
                                    )),
                                    [[U(at), Qe]]
                                  )
                                ],
                                2
                              )
                            ],
                            2
                          ))
                        : E(`v-if`, !0),
                      T(
                        `div`,
                        { class: A([U(P).e(`content`), U(F).e(`content`), U(F).is(`left`, !e.singlePanel)]) },
                        [
                          T(
                            `div`,
                            { class: A(U(F).e(`header`)) },
                            [
                              T(
                                `button`,
                                {
                                  type: `button`,
                                  class: A([U(P).e(`icon-btn`), `d-arrow-left`]),
                                  'aria-label': U(V)(`el.datepicker.prevYear`),
                                  disabled: U(Y),
                                  onClick: Fe
                                },
                                [
                                  j(e.$slots, `prev-year`, {}, () => [
                                    G(U(Z), null, { default: n(() => [G(U(I))]), _: 1 })
                                  ])
                                ],
                                10,
                                Di
                              ),
                              ne(
                                T(
                                  `button`,
                                  {
                                    type: `button`,
                                    class: A([U(P).e(`icon-btn`), `arrow-left`]),
                                    'aria-label': U(V)(`el.datepicker.prevMonth`),
                                    disabled: U(Y),
                                    onClick: Ie
                                  },
                                  [
                                    j(e.$slots, `prev-month`, {}, () => [
                                      G(U(Z), null, { default: n(() => [G(U(ie))]), _: 1 })
                                    ])
                                  ],
                                  10,
                                  Oi
                                ),
                                [[r, U(le) === `date`]]
                              ),
                              e.unlinkPanels || e.singlePanel
                                ? (O(),
                                  v(
                                    `button`,
                                    {
                                      key: 0,
                                      type: `button`,
                                      disabled: !We.value || U(Y),
                                      class: A([
                                        [U(P).e(`icon-btn`), U(P).is(`disabled`, !We.value || U(Y))],
                                        `d-arrow-right`
                                      ]),
                                      'aria-label': U(V)(`el.datepicker.nextYear`),
                                      onClick: ze
                                    },
                                    [
                                      j(e.$slots, `next-year`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(oe))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    ki
                                  ))
                                : E(`v-if`, !0),
                              (e.unlinkPanels && U(le) === `date`) || e.singlePanel
                                ? (O(),
                                  v(
                                    `button`,
                                    {
                                      key: 1,
                                      type: `button`,
                                      disabled: !Ue.value || U(Y),
                                      class: A([
                                        [U(P).e(`icon-btn`), U(P).is(`disabled`, !Ue.value || U(Y))],
                                        `arrow-right`
                                      ]),
                                      'aria-label': U(V)(`el.datepicker.nextMonth`),
                                      onClick: Be
                                    },
                                    [
                                      j(e.$slots, `next-month`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(se))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    Ai
                                  ))
                                : E(`v-if`, !0),
                              T(`div`, null, [
                                T(
                                  `span`,
                                  {
                                    role: `button`,
                                    class: A(U(F).e(`header-label`)),
                                    'aria-live': `polite`,
                                    tabindex: e.disabled ? void 0 : 0,
                                    'aria-disabled': e.disabled,
                                    onKeydown: (t[10] ||= x(e => U(ve)(`year`), [`enter`])),
                                    onClick: (t[11] ||= e => U(ve)(`year`))
                                  },
                                  N(U(ge)),
                                  43,
                                  ji
                                ),
                                ne(
                                  T(
                                    `span`,
                                    {
                                      role: `button`,
                                      'aria-live': `polite`,
                                      tabindex: e.disabled ? void 0 : 0,
                                      'aria-disabled': e.disabled,
                                      class: A([U(F).e(`header-label`), { active: U(le) === `month` }]),
                                      onKeydown: (t[12] ||= x(e => U(ve)(`month`), [`enter`])),
                                      onClick: (t[13] ||= e => U(ve)(`month`))
                                    },
                                    N(U(V)(`el.datepicker.month${y.value.month() + 1}`)),
                                    43,
                                    Mi
                                  ),
                                  [[r, U(le) === `date`]]
                                )
                              ])
                            ],
                            2
                          ),
                          U(le) === `date`
                            ? (O(),
                              w(
                                ai,
                                {
                                  key: 0,
                                  ref_key: `leftCurrentViewRef`,
                                  ref: ue,
                                  'selection-mode': `range`,
                                  date: y.value,
                                  'min-date': U(D),
                                  'max-date': U(k),
                                  'range-state': U(M),
                                  'disabled-date': U(c),
                                  'cell-class-name': U(l),
                                  'show-week-number': e.showWeekNumber,
                                  disabled: U(Y),
                                  onChangerange: U(L),
                                  onPick: Je,
                                  onSelect: U(te)
                                },
                                null,
                                8,
                                [
                                  `date`,
                                  `min-date`,
                                  `max-date`,
                                  `range-state`,
                                  `disabled-date`,
                                  `cell-class-name`,
                                  `show-week-number`,
                                  `disabled`,
                                  `onChangerange`,
                                  `onSelect`
                                ]
                              ))
                            : E(`v-if`, !0),
                          U(le) === `year`
                            ? (O(),
                              w(
                                pi,
                                {
                                  key: 1,
                                  ref_key: `leftCurrentViewRef`,
                                  ref: ue,
                                  'selection-mode': `year`,
                                  date: y.value,
                                  'disabled-date': U(c),
                                  'parsed-value': e.parsedValue,
                                  disabled: U(Y),
                                  onPick: U(be)
                                },
                                null,
                                8,
                                [`date`, `disabled-date`, `parsed-value`, `disabled`, `onPick`]
                              ))
                            : E(`v-if`, !0),
                          U(le) === `month`
                            ? (O(),
                              w(
                                li,
                                {
                                  key: 2,
                                  ref_key: `leftCurrentViewRef`,
                                  ref: ue,
                                  'selection-mode': `month`,
                                  date: y.value,
                                  'parsed-value': e.parsedValue,
                                  'disabled-date': U(c),
                                  disabled: U(Y),
                                  onPick: U(Se)
                                },
                                null,
                                8,
                                [`date`, `parsed-value`, `disabled-date`, `disabled`, `onPick`]
                              ))
                            : E(`v-if`, !0)
                        ],
                        2
                      ),
                      e.singlePanel
                        ? E(`v-if`, !0)
                        : (O(),
                          v(
                            `div`,
                            { key: 1, class: A([[U(P).e(`content`), U(F).e(`content`)], `is-right`]) },
                            [
                              T(
                                `div`,
                                { class: A(U(F).e(`header`)) },
                                [
                                  e.unlinkPanels
                                    ? (O(),
                                      v(
                                        `button`,
                                        {
                                          key: 0,
                                          type: `button`,
                                          disabled: !We.value || U(Y),
                                          class: A([
                                            [U(P).e(`icon-btn`), U(P).is(`disabled`, !We.value || U(Y))],
                                            `d-arrow-left`
                                          ]),
                                          'aria-label': U(V)(`el.datepicker.prevYear`),
                                          onClick: Ve
                                        },
                                        [
                                          j(e.$slots, `prev-year`, {}, () => [
                                            G(U(Z), null, { default: n(() => [G(U(I))]), _: 1 })
                                          ])
                                        ],
                                        10,
                                        Ni
                                      ))
                                    : E(`v-if`, !0),
                                  e.unlinkPanels && U(W) === `date`
                                    ? (O(),
                                      v(
                                        `button`,
                                        {
                                          key: 1,
                                          type: `button`,
                                          disabled: !Ue.value || U(Y),
                                          class: A([
                                            [U(P).e(`icon-btn`), U(P).is(`disabled`, !Ue.value || U(Y))],
                                            `arrow-left`
                                          ]),
                                          'aria-label': U(V)(`el.datepicker.prevMonth`),
                                          onClick: He
                                        },
                                        [
                                          j(e.$slots, `prev-month`, {}, () => [
                                            G(U(Z), null, { default: n(() => [G(U(ie))]), _: 1 })
                                          ])
                                        ],
                                        10,
                                        Pi
                                      ))
                                    : E(`v-if`, !0),
                                  T(
                                    `button`,
                                    {
                                      type: `button`,
                                      'aria-label': U(V)(`el.datepicker.nextYear`),
                                      class: A([U(P).e(`icon-btn`), `d-arrow-right`]),
                                      disabled: U(Y),
                                      onClick: Le
                                    },
                                    [
                                      j(e.$slots, `next-year`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(oe))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    Fi
                                  ),
                                  ne(
                                    T(
                                      `button`,
                                      {
                                        type: `button`,
                                        class: A([U(P).e(`icon-btn`), `arrow-right`]),
                                        disabled: U(Y),
                                        'aria-label': U(V)(`el.datepicker.nextMonth`),
                                        onClick: J
                                      },
                                      [
                                        j(e.$slots, `next-month`, {}, () => [
                                          G(U(Z), null, { default: n(() => [G(U(se))]), _: 1 })
                                        ])
                                      ],
                                      10,
                                      Ii
                                    ),
                                    [[r, U(W) === `date`]]
                                  ),
                                  T(`div`, null, [
                                    T(
                                      `span`,
                                      {
                                        role: `button`,
                                        class: A(U(F).e(`header-label`)),
                                        'aria-live': `polite`,
                                        tabindex: e.disabled ? void 0 : 0,
                                        'aria-disabled': e.disabled,
                                        onKeydown: (t[14] ||= x(e => U(ye)(`year`), [`enter`])),
                                        onClick: (t[15] ||= e => U(ye)(`year`))
                                      },
                                      N(U(q)),
                                      43,
                                      Li
                                    ),
                                    ne(
                                      T(
                                        `span`,
                                        {
                                          role: `button`,
                                          'aria-live': `polite`,
                                          tabindex: e.disabled ? void 0 : 0,
                                          'aria-disabled': e.disabled,
                                          class: A([U(F).e(`header-label`), { active: U(W) === `month` }]),
                                          onKeydown: (t[16] ||= x(e => U(ye)(`month`), [`enter`])),
                                          onClick: (t[17] ||= e => U(ye)(`month`))
                                        },
                                        N(U(V)(`el.datepicker.month${b.value.month() + 1}`)),
                                        43,
                                        Ri
                                      ),
                                      [[r, U(W) === `date`]]
                                    )
                                  ])
                                ],
                                2
                              ),
                              U(W) === `date`
                                ? (O(),
                                  w(
                                    ai,
                                    {
                                      key: 0,
                                      ref_key: `rightCurrentViewRef`,
                                      ref: de,
                                      'selection-mode': `range`,
                                      date: b.value,
                                      'min-date': U(D),
                                      'max-date': U(k),
                                      'range-state': U(M),
                                      'disabled-date': U(c),
                                      'cell-class-name': U(l),
                                      'show-week-number': e.showWeekNumber,
                                      disabled: U(Y),
                                      onChangerange: U(L),
                                      onPick: Je,
                                      onSelect: U(te)
                                    },
                                    null,
                                    8,
                                    [
                                      `date`,
                                      `min-date`,
                                      `max-date`,
                                      `range-state`,
                                      `disabled-date`,
                                      `cell-class-name`,
                                      `show-week-number`,
                                      `disabled`,
                                      `onChangerange`,
                                      `onSelect`
                                    ]
                                  ))
                                : E(`v-if`, !0),
                              U(W) === `year`
                                ? (O(),
                                  w(
                                    pi,
                                    {
                                      key: 1,
                                      ref_key: `rightCurrentViewRef`,
                                      ref: de,
                                      'selection-mode': `year`,
                                      date: b.value,
                                      'disabled-date': U(c),
                                      'parsed-value': e.parsedValue,
                                      disabled: U(Y),
                                      onPick: U(xe)
                                    },
                                    null,
                                    8,
                                    [`date`, `disabled-date`, `parsed-value`, `disabled`, `onPick`]
                                  ))
                                : E(`v-if`, !0),
                              U(W) === `month`
                                ? (O(),
                                  w(
                                    li,
                                    {
                                      key: 2,
                                      ref_key: `rightCurrentViewRef`,
                                      ref: de,
                                      'selection-mode': `month`,
                                      date: b.value,
                                      'parsed-value': e.parsedValue,
                                      'disabled-date': U(c),
                                      disabled: U(Y),
                                      onPick: U(Ce)
                                    },
                                    null,
                                    8,
                                    [`date`, `parsed-value`, `disabled-date`, `disabled`, `onPick`]
                                  ))
                                : E(`v-if`, !0)
                            ],
                            2
                          ))
                    ],
                    2
                  )
                ],
                2
              ),
              e.showFooter && Ke.value && (e.showConfirm || U(d))
                ? (O(),
                  v(
                    `div`,
                    { key: 0, class: A(U(P).e(`footer`)) },
                    [
                      U(d)
                        ? (O(),
                          w(
                            U($e),
                            { key: 0, text: ``, size: `small`, class: A(U(P).e(`link-btn`)), onClick: ct },
                            { default: n(() => [ee(N(U(V)(`el.datepicker.clear`)), 1)]), _: 1 },
                            8,
                            [`class`]
                          ))
                        : E(`v-if`, !0),
                      e.showConfirm
                        ? (O(),
                          w(
                            U($e),
                            {
                              key: 1,
                              plain: ``,
                              size: `small`,
                              class: A(U(P).e(`link-btn`)),
                              disabled: Ge.value,
                              onClick: (t[18] ||= e => U(R)(!1))
                            },
                            { default: n(() => [ee(N(U(V)(`el.datepicker.confirm`)), 1)]), _: 1 },
                            8,
                            [`class`, `disabled`]
                          ))
                        : E(`v-if`, !0)
                    ],
                    2
                  ))
                : E(`v-if`, !0)
            ],
            2
          )
        )
      );
    }
  }),
  Vi = J({ ...Br }),
  Hi = [`pick`, `set-picker-option`, `calendar-change`],
  Ui = ({ unlinkPanels: e, leftDate: t, rightDate: n }) => {
    let { t: r } = Ee();
    return {
      leftPrevYear: () => {
        ((t.value = t.value.subtract(1, `year`)), e.value || (n.value = n.value.subtract(1, `year`)));
      },
      rightNextYear: () => {
        (e.value || (t.value = t.value.add(1, `year`)), (n.value = n.value.add(1, `year`)));
      },
      leftNextYear: () => {
        t.value = t.value.add(1, `year`);
      },
      rightPrevYear: () => {
        n.value = n.value.subtract(1, `year`);
      },
      leftLabel: f(() => `${t.value.year()} ${r(`el.datepicker.year`)}`),
      rightLabel: f(() => `${n.value.year()} ${r(`el.datepicker.year`)}`),
      leftYear: f(() => t.value.year()),
      rightYear: f(() => (n.value.year() === t.value.year() ? t.value.year() + 1 : n.value.year()))
    };
  },
  Wi = [`disabled`, `onClick`],
  Gi = [`disabled`],
  Ki = [`disabled`],
  qi = [`disabled`],
  Ji = [`disabled`],
  Yi = `year`,
  Xi = H({
    name: `DatePickerMonthRange`,
    __name: `panel-month-range`,
    props: Vi,
    emits: Hi,
    setup(e, { emit: t }) {
      let r = e,
        i = t,
        { lang: a } = Ee(),
        o = ae(Jn),
        s = ae(Ir, void 0),
        { shortcuts: c, disabledDate: l, cellClassName: u } = o.props,
        d = C(o.props, `format`),
        p = C(o.props, `defaultValue`),
        m = K((0, $.default)().locale(a.value)),
        h = K((0, $.default)().locale(a.value).add(1, Yi)),
        {
          minDate: _,
          maxDate: y,
          rangeState: b,
          ppNs: x,
          drpNs: w,
          handleChangeRange: D,
          handleRangeConfirm: k,
          handleShortcutClick: M,
          onSelect: P,
          parseValue: F
        } = wi(r, { defaultValue: p, leftDate: m, rightDate: h, unit: Yi, sortDates: le }),
        ee = f(() => !!c.length),
        {
          leftPrevYear: L,
          rightNextYear: R,
          leftNextYear: z,
          rightPrevYear: te,
          leftLabel: B,
          rightLabel: ne,
          leftYear: re,
          rightYear: V
        } = Ui({ unlinkPanels: C(r, `unlinkPanels`), leftDate: m, rightDate: h }),
        ie = f(() => r.singlePanel || (r.unlinkPanels && V.value > re.value + 1)),
        H = (e, t = !0) => {
          let n = e.minDate,
            r = e.maxDate;
          (y.value === r && _.value === n) ||
            (i(`calendar-change`, [n.toDate(), r && r.toDate()]), (y.value = r), (_.value = n), t && k());
        },
        se = () => {
          let e = null;
          (o?.emptyValues && (e = o.emptyValues.valueOnClear.value),
            (m.value = Wr(U(p), { lang: U(a), unit: `year`, unlinkPanels: r.unlinkPanels })[0]),
            (h.value = m.value.add(1, `year`)),
            i(`pick`, e));
        },
        ce = e => Yr(e, d.value, a.value, s);
      function le(e, t) {
        r.unlinkPanels && t
          ? (h.value = (e?.year() || 0) === t.year() ? t.add(1, Yi) : t)
          : (h.value = m.value.add(1, Yi));
      }
      let W = Re();
      return (
        g(
          () => r.visible,
          e => {
            !e && b.value.selecting && (F(r.parsedValue), P(!1));
          }
        ),
        i(`set-picker-option`, [`isValidValue`, Ur]),
        i(`set-picker-option`, [`parseUserInput`, ce]),
        i(`set-picker-option`, [`handleClear`, se]),
        (e, t) => (
          O(),
          v(
            `div`,
            {
              class: A([
                U(x).b(),
                U(w).b(),
                U(x).is(`border`, e.border),
                U(x).is(`disabled`, U(W)),
                { 'has-sidebar': !!e.$slots.sidebar || ee.value, 'single-panel': e.singlePanel }
              ])
            },
            [
              T(
                `div`,
                { class: A(U(x).e(`body-wrapper`)) },
                [
                  j(e.$slots, `sidebar`, { class: A(U(x).e(`sidebar`)) }),
                  ee.value
                    ? (O(),
                      v(
                        `div`,
                        { key: 0, class: A(U(x).e(`sidebar`)) },
                        [
                          (O(!0),
                          v(
                            S,
                            null,
                            _e(
                              U(c),
                              (e, t) => (
                                O(),
                                v(
                                  `button`,
                                  {
                                    key: t,
                                    type: `button`,
                                    class: A(U(x).e(`shortcut`)),
                                    disabled: U(W),
                                    onClick: t => U(M)(e)
                                  },
                                  N(e.text),
                                  11,
                                  Wi
                                )
                              )
                            ),
                            128
                          ))
                        ],
                        2
                      ))
                    : E(`v-if`, !0),
                  T(
                    `div`,
                    { class: A(U(x).e(`body`)) },
                    [
                      T(
                        `div`,
                        { class: A([U(x).e(`content`), U(w).e(`content`), U(w).is(`left`, !e.singlePanel)]) },
                        [
                          T(
                            `div`,
                            { class: A(U(w).e(`header`)) },
                            [
                              T(
                                `button`,
                                {
                                  type: `button`,
                                  class: A([U(x).e(`icon-btn`), `d-arrow-left`]),
                                  disabled: U(W),
                                  onClick: (t[0] ||= (...e) => U(L) && U(L)(...e))
                                },
                                [
                                  j(e.$slots, `prev-year`, {}, () => [
                                    G(U(Z), null, { default: n(() => [G(U(I))]), _: 1 })
                                  ])
                                ],
                                10,
                                Gi
                              ),
                              e.unlinkPanels || e.singlePanel
                                ? (O(),
                                  v(
                                    `button`,
                                    {
                                      key: 0,
                                      type: `button`,
                                      disabled: !ie.value || U(W),
                                      class: A([
                                        [U(x).e(`icon-btn`), U(x).is(`disabled`, !ie.value || U(W))],
                                        `d-arrow-right`
                                      ]),
                                      onClick: (t[1] ||= (...e) => U(z) && U(z)(...e))
                                    },
                                    [
                                      j(e.$slots, `next-year`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(oe))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    Ki
                                  ))
                                : E(`v-if`, !0),
                              T(`div`, null, N(U(B)), 1)
                            ],
                            2
                          ),
                          G(
                            li,
                            {
                              'selection-mode': `range`,
                              date: m.value,
                              'min-date': U(_),
                              'max-date': U(y),
                              'range-state': U(b),
                              'disabled-date': U(l),
                              disabled: U(W),
                              'cell-class-name': U(u),
                              onChangerange: U(D),
                              onPick: H,
                              onSelect: U(P)
                            },
                            null,
                            8,
                            [
                              `date`,
                              `min-date`,
                              `max-date`,
                              `range-state`,
                              `disabled-date`,
                              `disabled`,
                              `cell-class-name`,
                              `onChangerange`,
                              `onSelect`
                            ]
                          )
                        ],
                        2
                      ),
                      e.singlePanel
                        ? E(`v-if`, !0)
                        : (O(),
                          v(
                            `div`,
                            { key: 0, class: A([[U(x).e(`content`), U(w).e(`content`)], `is-right`]) },
                            [
                              T(
                                `div`,
                                { class: A(U(w).e(`header`)) },
                                [
                                  e.unlinkPanels
                                    ? (O(),
                                      v(
                                        `button`,
                                        {
                                          key: 0,
                                          type: `button`,
                                          disabled: !ie.value || U(W),
                                          class: A([
                                            [U(x).e(`icon-btn`), U(x).is(`disabled`, !ie.value || U(W))],
                                            `d-arrow-left`
                                          ]),
                                          onClick: (t[2] ||= (...e) => U(te) && U(te)(...e))
                                        },
                                        [
                                          j(e.$slots, `prev-year`, {}, () => [
                                            G(U(Z), null, { default: n(() => [G(U(I))]), _: 1 })
                                          ])
                                        ],
                                        10,
                                        qi
                                      ))
                                    : E(`v-if`, !0),
                                  T(
                                    `button`,
                                    {
                                      type: `button`,
                                      class: A([U(x).e(`icon-btn`), `d-arrow-right`]),
                                      disabled: U(W),
                                      onClick: (t[3] ||= (...e) => U(R) && U(R)(...e))
                                    },
                                    [
                                      j(e.$slots, `next-year`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(oe))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    Ji
                                  ),
                                  T(`div`, null, N(U(ne)), 1)
                                ],
                                2
                              ),
                              G(
                                li,
                                {
                                  'selection-mode': `range`,
                                  date: h.value,
                                  'min-date': U(_),
                                  'max-date': U(y),
                                  'range-state': U(b),
                                  'disabled-date': U(l),
                                  disabled: U(W),
                                  'cell-class-name': U(u),
                                  onChangerange: U(D),
                                  onPick: H,
                                  onSelect: U(P)
                                },
                                null,
                                8,
                                [
                                  `date`,
                                  `min-date`,
                                  `max-date`,
                                  `range-state`,
                                  `disabled-date`,
                                  `disabled`,
                                  `cell-class-name`,
                                  `onChangerange`,
                                  `onSelect`
                                ]
                              )
                            ],
                            2
                          ))
                    ],
                    2
                  )
                ],
                2
              )
            ],
            2
          )
        )
      );
    }
  }),
  Zi = J({ ...Br }),
  Qi = [`pick`, `set-picker-option`, `calendar-change`],
  $i = ({ unlinkPanels: e, leftDate: t, rightDate: n }) => ({
    leftPrevYear: () => {
      ((t.value = t.value.subtract(10, `year`)), e.value || (n.value = n.value.subtract(10, `year`)));
    },
    rightNextYear: () => {
      (e.value || (t.value = t.value.add(10, `year`)), (n.value = n.value.add(10, `year`)));
    },
    leftNextYear: () => {
      t.value = t.value.add(10, `year`);
    },
    rightPrevYear: () => {
      n.value = n.value.subtract(10, `year`);
    },
    leftLabel: f(() => {
      let e = Math.floor(t.value.year() / 10) * 10;
      return `${e}-${e + 9}`;
    }),
    rightLabel: f(() => {
      let e = Math.floor(n.value.year() / 10) * 10;
      return `${e}-${e + 9}`;
    }),
    leftYear: f(() => Math.floor(t.value.year() / 10) * 10 + 9),
    rightYear: f(() => Math.floor(n.value.year() / 10) * 10)
  }),
  ea = [`disabled`, `onClick`],
  ta = [`disabled`],
  na = [`disabled`],
  ra = [`disabled`],
  ia = [`disabled`],
  aa = 10,
  oa = `year`,
  sa = H({
    name: `DatePickerYearRange`,
    __name: `panel-year-range`,
    props: Zi,
    emits: Qi,
    setup(e, { emit: t }) {
      let r = e,
        i = t,
        { lang: a } = Ee(),
        s = K((0, $.default)().locale(a.value)),
        c = K((0, $.default)().locale(a.value).add(aa, oa)),
        l = ae(Ir, void 0),
        u = ae(Jn),
        { shortcuts: d, disabledDate: p, cellClassName: m } = u.props,
        h = C(u.props, `format`),
        _ = C(u.props, `defaultValue`),
        {
          minDate: y,
          maxDate: b,
          rangeState: x,
          ppNs: w,
          drpNs: D,
          handleChangeRange: k,
          handleRangeConfirm: M,
          handleShortcutClick: P,
          onSelect: F,
          parseValue: ee
        } = wi(r, { defaultValue: _, leftDate: s, rightDate: c, step: aa, unit: oa, sortDates: me }),
        {
          leftPrevYear: L,
          rightNextYear: R,
          leftNextYear: z,
          rightPrevYear: te,
          leftLabel: B,
          rightLabel: ne,
          leftYear: re,
          rightYear: V
        } = $i({ unlinkPanels: C(r, `unlinkPanels`), leftDate: s, rightDate: c }),
        ie = Re(),
        H = f(() => !!d.length),
        se = f(() => [
          w.b(),
          D.b(),
          w.is(`border`, r.border),
          w.is(`disabled`, ie.value),
          { 'has-sidebar': !!o().sidebar || H.value, 'single-panel': r.singlePanel }
        ]),
        ce = f(() => ({
          content: [w.e(`content`), D.e(`content`), D.is(`left`, !r.singlePanel)],
          arrowLeftBtn: [w.e(`icon-btn`), `d-arrow-left`],
          arrowRightBtn: [w.e(`icon-btn`), w.is(`disabled`, !W.value || ie.value), `d-arrow-right`]
        })),
        le = f(() => ({
          content: [w.e(`content`), D.e(`content`), `is-right`],
          arrowLeftBtn: [w.e(`icon-btn`), w.is(`disabled`, !W.value || ie.value), `d-arrow-left`],
          arrowRightBtn: [w.e(`icon-btn`), `d-arrow-right`]
        })),
        W = f(() => r.singlePanel || (r.unlinkPanels && V.value > re.value + 1)),
        ue = (e, t = !0) => {
          let n = e.minDate,
            r = e.maxDate;
          (b.value === r && y.value === n) ||
            (i(`calendar-change`, [n.toDate(), r && r.toDate()]), (b.value = r), (y.value = n), t && M());
        },
        de = e => Yr(e, h.value, a.value, l),
        fe = e => Ur(e) && (p ? !p(e[0].toDate()) && !p(e[1].toDate()) : !0),
        pe = () => {
          let e = null;
          u?.emptyValues && (e = u.emptyValues.valueOnClear.value);
          let t = Wr(U(_), { lang: U(a), step: aa, unit: oa, unlinkPanels: r.unlinkPanels });
          ((s.value = t[0]), (c.value = t[1]), i(`pick`, e));
        };
      function me(e, t) {
        if (r.unlinkPanels && t) {
          let n = e?.year() || 0,
            r = t.year();
          c.value = n + aa > r ? t.add(aa, oa) : t;
        } else c.value = s.value.add(aa, oa);
      }
      return (
        g(
          () => r.visible,
          e => {
            !e && x.value.selecting && (ee(r.parsedValue), F(!1));
          }
        ),
        i(`set-picker-option`, [`isValidValue`, fe]),
        i(`set-picker-option`, [`parseUserInput`, de]),
        i(`set-picker-option`, [`handleClear`, pe]),
        (e, t) => (
          O(),
          v(
            `div`,
            { class: A(se.value) },
            [
              T(
                `div`,
                { class: A(U(w).e(`body-wrapper`)) },
                [
                  j(e.$slots, `sidebar`, { class: A(U(w).e(`sidebar`)) }),
                  H.value
                    ? (O(),
                      v(
                        `div`,
                        { key: 0, class: A(U(w).e(`sidebar`)) },
                        [
                          (O(!0),
                          v(
                            S,
                            null,
                            _e(
                              U(d),
                              (e, t) => (
                                O(),
                                v(
                                  `button`,
                                  {
                                    key: t,
                                    type: `button`,
                                    class: A(U(w).e(`shortcut`)),
                                    disabled: U(ie),
                                    onClick: t => U(P)(e)
                                  },
                                  N(e.text),
                                  11,
                                  ea
                                )
                              )
                            ),
                            128
                          ))
                        ],
                        2
                      ))
                    : E(`v-if`, !0),
                  T(
                    `div`,
                    { class: A(U(w).e(`body`)) },
                    [
                      T(
                        `div`,
                        { class: A(ce.value.content) },
                        [
                          T(
                            `div`,
                            { class: A(U(D).e(`header`)) },
                            [
                              T(
                                `button`,
                                {
                                  type: `button`,
                                  class: A(ce.value.arrowLeftBtn),
                                  disabled: U(ie),
                                  onClick: (t[0] ||= (...e) => U(L) && U(L)(...e))
                                },
                                [
                                  j(e.$slots, `prev-year`, {}, () => [
                                    G(U(Z), null, { default: n(() => [G(U(I))]), _: 1 })
                                  ])
                                ],
                                10,
                                ta
                              ),
                              e.unlinkPanels || e.singlePanel
                                ? (O(),
                                  v(
                                    `button`,
                                    {
                                      key: 0,
                                      type: `button`,
                                      disabled: !W.value || U(ie),
                                      class: A(ce.value.arrowRightBtn),
                                      onClick: (t[1] ||= (...e) => U(z) && U(z)(...e))
                                    },
                                    [
                                      j(e.$slots, `next-year`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(oe))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    na
                                  ))
                                : E(`v-if`, !0),
                              T(`div`, null, N(U(B)), 1)
                            ],
                            2
                          ),
                          G(
                            pi,
                            {
                              'selection-mode': `range`,
                              date: s.value,
                              'min-date': U(y),
                              'max-date': U(b),
                              'range-state': U(x),
                              'disabled-date': U(p),
                              disabled: U(ie),
                              'cell-class-name': U(m),
                              onChangerange: U(k),
                              onPick: ue,
                              onSelect: U(F)
                            },
                            null,
                            8,
                            [
                              `date`,
                              `min-date`,
                              `max-date`,
                              `range-state`,
                              `disabled-date`,
                              `disabled`,
                              `cell-class-name`,
                              `onChangerange`,
                              `onSelect`
                            ]
                          )
                        ],
                        2
                      ),
                      e.singlePanel
                        ? E(`v-if`, !0)
                        : (O(),
                          v(
                            `div`,
                            { key: 0, class: A(le.value.content) },
                            [
                              T(
                                `div`,
                                { class: A(U(D).e(`header`)) },
                                [
                                  e.unlinkPanels
                                    ? (O(),
                                      v(
                                        `button`,
                                        {
                                          key: 0,
                                          type: `button`,
                                          disabled: !W.value || U(ie),
                                          class: A(le.value.arrowLeftBtn),
                                          onClick: (t[2] ||= (...e) => U(te) && U(te)(...e))
                                        },
                                        [
                                          j(e.$slots, `prev-year`, {}, () => [
                                            G(U(Z), null, { default: n(() => [G(U(I))]), _: 1 })
                                          ])
                                        ],
                                        10,
                                        ra
                                      ))
                                    : E(`v-if`, !0),
                                  T(
                                    `button`,
                                    {
                                      type: `button`,
                                      class: A(le.value.arrowRightBtn),
                                      disabled: U(ie),
                                      onClick: (t[3] ||= (...e) => U(R) && U(R)(...e))
                                    },
                                    [
                                      j(e.$slots, `next-year`, {}, () => [
                                        G(U(Z), null, { default: n(() => [G(U(oe))]), _: 1 })
                                      ])
                                    ],
                                    10,
                                    ia
                                  ),
                                  T(`div`, null, N(U(ne)), 1)
                                ],
                                2
                              ),
                              G(
                                pi,
                                {
                                  'selection-mode': `range`,
                                  date: c.value,
                                  'min-date': U(y),
                                  'max-date': U(b),
                                  'range-state': U(x),
                                  'disabled-date': U(p),
                                  disabled: U(ie),
                                  'cell-class-name': U(m),
                                  onChangerange: U(k),
                                  onPick: ue,
                                  onSelect: U(F)
                                },
                                null,
                                8,
                                [
                                  `date`,
                                  `min-date`,
                                  `max-date`,
                                  `range-state`,
                                  `disabled-date`,
                                  `disabled`,
                                  `cell-class-name`,
                                  `onChangerange`,
                                  `onSelect`
                                ]
                              )
                            ],
                            2
                          ))
                    ],
                    2
                  )
                ],
                2
              )
            ],
            2
          )
        )
      );
    }
  }),
  ca = function (e) {
    switch (e) {
      case `daterange`:
      case `datetimerange`:
        return Bi;
      case `monthrange`:
        return Xi;
      case `yearrange`:
        return sa;
      default:
        return xi;
    }
  },
  la = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_advancedFormat = r());
    })(e, function () {
      return function (e, t) {
        var n = t.prototype,
          r = n.format;
        n.format = function (e) {
          var t = this,
            n = this.$locale();
          if (!this.isValid()) return r.bind(this)(e);
          var i = this.$utils(),
            a = (e || `YYYY-MM-DDTHH:mm:ssZ`).replace(
              /\[([^\]]+)]|Q|wo|ww|w|WW|W|zzz|z|gggg|GGGG|Do|X|x|k{1,2}|S/g,
              function (e) {
                switch (e) {
                  case `Q`:
                    return Math.ceil((t.$M + 1) / 3);
                  case `Do`:
                    return n.ordinal(t.$D);
                  case `gggg`:
                    return t.weekYear();
                  case `GGGG`:
                    return t.isoWeekYear();
                  case `wo`:
                    return n.ordinal(t.week(), `W`);
                  case `w`:
                  case `ww`:
                    return i.s(t.week(), e === `w` ? 1 : 2, `0`);
                  case `W`:
                  case `WW`:
                    return i.s(t.isoWeek(), e === `W` ? 1 : 2, `0`);
                  case `k`:
                  case `kk`:
                    return i.s(String(t.$H === 0 ? 24 : t.$H), e === `k` ? 1 : 2, `0`);
                  case `X`:
                    return Math.floor(t.$d.getTime() / 1e3);
                  case `x`:
                    return t.$d.getTime();
                  case `z`:
                    return `[` + t.offsetName() + `]`;
                  case `zzz`:
                    return `[` + t.offsetName(`long`) + `]`;
                  default:
                    return e;
                }
              }
            );
          return r.bind(this)(a);
        };
      };
    });
  }),
  ua = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_weekOfYear = r());
    })(e, function () {
      var e = `week`,
        t = `year`;
      return function (n, r, i) {
        var a = r.prototype;
        ((a.week = function (n) {
          if ((n === void 0 && (n = null), n !== null)) return this.add(7 * (n - this.week()), `day`);
          var r = this.$locale().yearStart || 1;
          if (this.month() === 11 && this.date() > 25) {
            var a = i(this).startOf(t).add(1, t).date(r),
              o = i(this).endOf(e);
            if (a.isBefore(o)) return 1;
          }
          var s = i(this).startOf(t).date(r).startOf(e).subtract(1, `millisecond`),
            c = this.diff(s, e, !0);
          return c < 0 ? i(this).startOf(`week`).week() : Math.ceil(c);
        }),
          (a.weeks = function (e) {
            return (e === void 0 && (e = null), this.week(e));
          }));
      };
    });
  }),
  da = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_weekYear = r());
    })(e, function () {
      return function (e, t) {
        t.prototype.weekYear = function () {
          var e = this.month(),
            t = this.week(),
            n = this.year();
          return t === 1 && e === 11 ? n + 1 : e === 0 && t >= 52 ? n - 1 : n;
        };
      };
    });
  }),
  fa = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_dayOfYear = r());
    })(e, function () {
      return function (e, t, n) {
        t.prototype.dayOfYear = function (e) {
          var t = Math.round((n(this).startOf(`day`) - n(this).startOf(`year`)) / 864e5) + 1;
          return e == null ? t : this.add(e - t, `day`);
        };
      };
    });
  }),
  pa = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_isSameOrAfter = r());
    })(e, function () {
      return function (e, t) {
        t.prototype.isSameOrAfter = function (e, t) {
          return this.isSame(e, t) || this.isAfter(e, t);
        };
      };
    });
  }),
  ma = me((e, t) => {
    (function (n, r) {
      typeof e == `object` && t !== void 0
        ? (t.exports = r())
        : typeof define == `function` && define.amd
          ? define(r)
          : ((n = typeof globalThis < `u` ? globalThis : n || self).dayjs_plugin_isSameOrBefore = r());
    })(e, function () {
      return function (e, t) {
        t.prototype.isSameOrBefore = function (e, t) {
          return this.isSame(e, t) || this.isBefore(e, t);
        };
      };
    });
  }),
  ha = L(Mr(), 1),
  ga = L(Nr(), 1),
  _a = L(la(), 1),
  va = L(ua(), 1),
  ya = L(da(), 1),
  ba = L(fa(), 1),
  xa = L(pa(), 1),
  Sa = L(ma(), 1);
function Ca(e) {
  return typeof e == `function` || (Object.prototype.toString.call(e) === `[object Object]` && !ue(e));
}
($.default.extend(ga.default),
  $.default.extend(_a.default),
  $.default.extend(ha.default),
  $.default.extend(va.default),
  $.default.extend(ya.default),
  $.default.extend(ba.default),
  $.default.extend(xa.default),
  $.default.extend(Sa.default));
var wa = Se(
    H({
      name: `ElDatePickerPanel`,
      install: null,
      inheritAttrs: !1,
      props: Pr,
      emits: [_t, `calendar-change`, `panel-change`, `visible-change`, `clear`],
      setup(e, { slots: t, emit: n, attrs: r }) {
        let i = Fe(`picker-panel`);
        (we(ae(`EP_PICKER_BASE`, void 0)) && he(Jn, { props: h({ ...l(e) }) }), he(Fr, { slots: t, pickerNs: i }));
        let {
          parsedValue: a,
          onCalendarChange: o,
          onPanelChange: s,
          onSetPickerOption: c,
          onPick: u
        } = ae(Xn, () => mr(e, n), !0);
        return () =>
          G(
            ca(e.type),
            P(vt(r, `onPick`), e, {
              parsedValue: a.value,
              'onSet-picker-option': c,
              'onCalendar-change': o,
              'onPanel-change': s,
              onClear: () => n(`clear`),
              onPick: u
            }),
            Ca(t) ? t : { default: () => [t] }
          );
      }
    })
  ),
  Ta = J({ ...fr, type: { type: X(String), default: `date` } });
function Ea(e) {
  return typeof e == `function` || (Object.prototype.toString.call(e) === `[object Object]` && !ue(e));
}
var Da = Se(
    H({
      name: `ElDatePicker`,
      install: null,
      props: Ta,
      emits: [_t],
      setup(e, { expose: t, emit: n, slots: r }) {
        (he(
          Ir,
          f(() => !e.format)
        ),
          he(Yn, h(C(e, `popperOptions`))));
        let i = K();
        t({
          focus: () => {
            i.value?.focus();
          },
          blur: () => {
            i.value?.blur();
          },
          handleOpen: () => {
            i.value?.handleOpen();
          },
          handleClose: () => {
            i.value?.handleClose();
          }
        });
        let a = e => {
          n(_t, e);
        };
        return () =>
          G(
            vr,
            P(e, { format: e.format ?? ($n[e.type] || `YYYY-MM-DD`), type: e.type, ref: i, 'onUpdate:modelValue': a }),
            {
              default: t =>
                G(
                  wa,
                  P({ disabled: e.disabled, editable: e.editable, border: !1 }, t),
                  Ea(r) ? r : { default: () => [r] }
                ),
              'range-separator': r[`range-separator`]
            }
          );
      }
    })
  ),
  Oa = J({
    center: Boolean,
    alignCenter: { type: Boolean, default: void 0 },
    closeIcon: { type: Ce },
    draggable: { type: Boolean, default: void 0 },
    overflow: { type: Boolean, default: void 0 },
    fullscreen: Boolean,
    headerClass: String,
    bodyClass: String,
    footerClass: String,
    showClose: { type: Boolean, default: !0 },
    title: { type: String, default: `` },
    ariaLevel: { type: String, default: `2` }
  }),
  ka = { close: () => !0 },
  Aa = { alignCenter: void 0, draggable: void 0, overflow: void 0, showClose: !0, title: ``, ariaLevel: `2` },
  ja = J({
    ...Oa,
    appendToBody: Boolean,
    appendTo: { type: X([String, Object]), default: `body` },
    beforeClose: { type: X(Function) },
    destroyOnClose: Boolean,
    closeOnClickModal: { type: Boolean, default: !0 },
    closeOnPressEscape: { type: Boolean, default: !0 },
    lockScroll: { type: Boolean, default: !0 },
    modal: { type: Boolean, default: !0 },
    modalPenetrable: Boolean,
    openDelay: { type: Number, default: 0 },
    closeDelay: { type: Number, default: 0 },
    top: { type: String },
    modelValue: Boolean,
    modalClass: String,
    headerClass: String,
    bodyClass: String,
    footerClass: String,
    width: { type: [String, Number] },
    zIndex: { type: Number },
    trapFocus: Boolean,
    headerAriaLevel: { type: String, default: `2` },
    transition: { type: X([String, Object]), default: void 0 }
  }),
  Ma = {
    open: () => !0,
    opened: () => !0,
    close: () => !0,
    closed: () => !0,
    [_t]: e => ut(e),
    openAutoFocus: () => !0,
    closeAutoFocus: () => !0
  };
({ ...Aa });
var Na = Symbol(`dialogInjectionKey`),
  Pa = `dialog-fade`,
  Fa = `ElDialog`,
  Ia = (e, t) => {
    let n = le().emit,
      { nextZIndex: r } = De(),
      i = ``,
      a = ke(),
      o = ke(),
      s = K(!1),
      c = K(!1),
      l = K(!1),
      u = K(e.zIndex ?? r()),
      d = K(!1),
      p,
      m,
      h = tt(),
      _ = f(() => h.value?.namespace ?? `el`),
      v = f(() => h.value?.dialog),
      b = f(() => {
        let t = {},
          n = `--${_.value}-dialog`;
        if (!e.fullscreen) {
          e.top && (t[`${n}-margin-top`] = e.top);
          let r = Ie(e.width);
          r && (t[`${n}-width`] = r);
        }
        return t;
      }),
      x = f(() => (e.draggable ?? v.value?.draggable ?? !1) && !e.fullscreen),
      S = f(() => e.alignCenter ?? v.value?.alignCenter ?? !1),
      C = f(() => e.overflow ?? v.value?.overflow ?? !1),
      w = f(() => e.modalPenetrable && !e.modal && !e.fullscreen),
      T = f(() => (S.value ? { display: `flex` } : {})),
      E = f(() => {
        let t = e.transition ?? v.value?.transition ?? `dialog-fade`,
          n = { name: t, onAfterEnter: D, onBeforeLeave: k, onAfterLeave: O };
        if (fe(t)) {
          let e = { ...t },
            n = (e, t) => n => {
              (y(e)
                ? e.forEach(e => {
                    F(e) && e(n);
                  })
                : F(e) && e(n),
                t());
            };
          return (
            (e.onAfterEnter = n(e.onAfterEnter, D)),
            (e.onBeforeLeave = n(e.onBeforeLeave, k)),
            (e.onAfterLeave = n(e.onAfterLeave, O)),
            e.name ||
              ((e.name = Pa), Ge(Fa, `transition.name is missing when using object syntax, fallback to '${Pa}'`)),
            e
          );
        }
        return n;
      });
    function D() {
      n(`opened`);
    }
    function O() {
      (n(`closed`), n(_t, !1), e.destroyOnClose && (l.value = !1), (d.value = !1));
    }
    function k() {
      ((d.value = !0), n(`close`));
    }
    function A() {
      (m?.(), p?.(), e.openDelay && e.openDelay > 0 ? ({ stop: p } = Qe(() => P(), e.openDelay)) : P());
    }
    function j() {
      (p?.(), m?.(), e.closeDelay && e.closeDelay > 0 ? ({ stop: m } = Qe(() => ee(), e.closeDelay)) : ee());
    }
    function M() {
      function t(e) {
        e || ((c.value = !0), (s.value = !1));
      }
      e.beforeClose ? e.beforeClose(t) : j();
    }
    function N() {
      e.closeOnClickModal && M();
    }
    function P() {
      Xe && (s.value = !0);
    }
    function ee() {
      s.value = !1;
    }
    function I() {
      n(`openAutoFocus`);
    }
    function L() {
      n(`closeAutoFocus`);
    }
    function R(e) {
      e.detail?.focusReason === `pointer` && e.preventDefault();
    }
    e.lockScroll && bt(s);
    function z() {
      e.closeOnPressEscape && M();
    }
    function te() {
      !s.value || !w.value || e.zIndex !== void 0 || (u.value = r());
    }
    return (
      g(
        () => e.zIndex,
        () => {
          u.value = e.zIndex ?? r();
        }
      ),
      g(
        () => e.modelValue,
        i => {
          i
            ? ((c.value = !1),
              (d.value = !1),
              A(),
              (l.value = !0),
              (u.value = e.zIndex ?? r()),
              re(() => {
                (n(`open`),
                  t.value &&
                    ((t.value.parentElement.scrollTop = 0),
                    (t.value.parentElement.scrollLeft = 0),
                    (t.value.scrollTop = 0)));
              }))
            : s.value && j();
        }
      ),
      g(
        () => e.fullscreen,
        e => {
          t.value &&
            (e ? ((i = t.value.style.transform), (t.value.style.transform = ``)) : (t.value.style.transform = i));
        }
      ),
      V(() => {
        e.modelValue && ((s.value = !0), (l.value = !0), A());
      }),
      {
        afterEnter: D,
        afterLeave: O,
        beforeLeave: k,
        handleClose: M,
        onModalClick: N,
        close: j,
        doClose: ee,
        onOpenAutoFocus: I,
        onCloseAutoFocus: L,
        onCloseRequested: z,
        onFocusoutPrevented: R,
        bringToFront: te,
        titleId: a,
        bodyId: o,
        closed: c,
        style: b,
        overlayDialogStyle: T,
        rendered: l,
        visible: s,
        zIndex: u,
        transitionConfig: E,
        _draggable: x,
        _alignCenter: S,
        _overflow: C,
        closing: d,
        penetrable: w
      }
    );
  },
  La =
    (...e) =>
    t => {
      e.forEach(e => {
        e.value = t;
      });
    },
  Ra = [`aria-level`],
  za = [`aria-label`],
  Ba = [`id`],
  Va = H({
    name: `ElDialogContent`,
    __name: `dialog-content`,
    props: Oa,
    emits: ka,
    setup(e, { expose: t }) {
      let { t: r } = Ee(),
        { Close: i } = Ne,
        o = e,
        { dialogRef: s, headerRef: c, bodyId: l, ns: u, style: d } = ae(Na),
        { focusTrapRef: p } = ae(He),
        m = La(p, s),
        h = f(() => !!o.draggable),
        {
          resetPosition: g,
          updatePosition: _,
          isDragging: y
        } = xt(
          s,
          c,
          h,
          f(() => !!o.overflow)
        ),
        b = f(() => [
          u.b(),
          u.is(`fullscreen`, o.fullscreen),
          u.is(`draggable`, h.value),
          u.is(`dragging`, y.value),
          u.is(`align-center`, !!o.alignCenter),
          { [u.m(`center`)]: o.center }
        ]);
      return (
        t({ resetPosition: g, updatePosition: _ }),
        (t, o) => (
          O(),
          v(
            `div`,
            { ref: U(m), class: A(b.value), style: W(U(d)), tabindex: `-1` },
            [
              T(
                `header`,
                {
                  ref_key: `headerRef`,
                  ref: c,
                  class: A([U(u).e(`header`), e.headerClass, { 'show-close': e.showClose }])
                },
                [
                  j(t.$slots, `header`, {}, () => [
                    T(
                      `span`,
                      { role: `heading`, 'aria-level': e.ariaLevel, class: A(U(u).e(`title`)) },
                      N(e.title),
                      11,
                      Ra
                    )
                  ]),
                  e.showClose
                    ? (O(),
                      v(
                        `button`,
                        {
                          key: 0,
                          'aria-label': U(r)(`el.dialog.close`),
                          class: A(U(u).e(`headerbtn`)),
                          type: `button`,
                          onClick: (o[0] ||= e => t.$emit(`close`))
                        },
                        [
                          G(
                            U(Z),
                            { class: A(U(u).e(`close`)) },
                            { default: n(() => [(O(), w(a(e.closeIcon || U(i))))]), _: 1 },
                            8,
                            [`class`]
                          )
                        ],
                        10,
                        za
                      ))
                    : E(`v-if`, !0)
                ],
                2
              ),
              T(`div`, { id: U(l), class: A([U(u).e(`body`), e.bodyClass]) }, [j(t.$slots, `default`)], 10, Ba),
              t.$slots.footer
                ? (O(),
                  v(`footer`, { key: 0, class: A([U(u).e(`footer`), e.footerClass]) }, [j(t.$slots, `footer`)], 2))
                : E(`v-if`, !0)
            ],
            6
          )
        )
      );
    }
  }),
  Ha = [`aria-label`, `aria-labelledby`, `aria-describedby`],
  Ua = Se(
    H({
      name: `ElDialog`,
      inheritAttrs: !1,
      __name: `dialog`,
      props: ja,
      emits: Ma,
      setup(t, { expose: i }) {
        let a = t,
          s = o();
        ot(
          {
            scope: `el-dialog`,
            from: `the title slot`,
            replacement: `the header slot`,
            version: `3.0.0`,
            ref: `https://element-plus.org/en-US/component/dialog.html#slots`
          },
          f(() => !!s.title)
        );
        let l = Fe(`dialog`),
          u = K(),
          d = K(),
          p = K(),
          {
            visible: m,
            titleId: h,
            bodyId: g,
            style: v,
            overlayDialogStyle: y,
            rendered: b,
            transitionConfig: x,
            zIndex: S,
            _draggable: C,
            _alignCenter: D,
            _overflow: k,
            penetrable: M,
            handleClose: N,
            onModalClick: F,
            onOpenAutoFocus: ee,
            onCloseAutoFocus: I,
            onCloseRequested: L,
            onFocusoutPrevented: R,
            bringToFront: z,
            closing: te
          } = Ia(a, u);
        he(Na, { dialogRef: u, headerRef: d, bodyId: g, ns: l, rendered: b, style: v });
        let B = St(F);
        return (
          i({
            visible: m,
            dialogContentRef: p,
            resetPosition: () => {
              p.value?.resetPosition();
            },
            handleClose: N
          }),
          (i, a) => (
            O(),
            w(
              c,
              { to: t.appendTo, disabled: t.appendTo === `body` ? !t.appendToBody : !1 },
              [
                G(
                  _,
                  P(U(x), { persisted: `` }),
                  {
                    default: n(() => [
                      ne(
                        G(
                          U(Tt),
                          {
                            'custom-mask-event': ``,
                            mask: t.modal,
                            'overlay-class': [
                              t.modalClass ?? ``,
                              `${U(l).namespace.value}-modal-dialog`,
                              U(l).is(`penetrable`, U(M))
                            ],
                            'z-index': U(S)
                          },
                          {
                            default: n(() => [
                              T(
                                `div`,
                                {
                                  role: `dialog`,
                                  'aria-modal': `true`,
                                  'aria-label': t.title || void 0,
                                  'aria-labelledby': t.title ? void 0 : U(h),
                                  'aria-describedby': U(g),
                                  class: A([`${U(l).namespace.value}-overlay-dialog`, U(l).is(`closing`, U(te))]),
                                  style: W(U(y)),
                                  onClick: (a[0] ||= (...e) => U(B).onClick && U(B).onClick(...e)),
                                  onMousedown: (a[1] ||= (...e) => U(B).onMousedown && U(B).onMousedown(...e)),
                                  onMouseup: (a[2] ||= (...e) => U(B).onMouseup && U(B).onMouseup(...e))
                                },
                                [
                                  G(
                                    U(st),
                                    {
                                      loop: ``,
                                      trapped: U(m),
                                      'focus-start-el': `container`,
                                      onFocusAfterTrapped: U(ee),
                                      onFocusAfterReleased: U(I),
                                      onFocusoutPrevented: U(R),
                                      onReleaseRequested: U(L)
                                    },
                                    {
                                      default: n(() => [
                                        U(b)
                                          ? (O(),
                                            w(
                                              Va,
                                              P({ key: 0, ref_key: `dialogContentRef`, ref: p }, i.$attrs, {
                                                center: t.center,
                                                'align-center': U(D),
                                                'close-icon': t.closeIcon,
                                                draggable: U(C),
                                                overflow: U(k),
                                                fullscreen: t.fullscreen,
                                                'header-class': t.headerClass,
                                                'body-class': t.bodyClass,
                                                'footer-class': t.footerClass,
                                                'show-close': t.showClose,
                                                title: t.title,
                                                'aria-level': t.headerAriaLevel,
                                                onClose: U(N),
                                                onMousedown: U(z)
                                              }),
                                              e(
                                                {
                                                  header: n(() => [
                                                    i.$slots.title
                                                      ? j(i.$slots, `title`, { key: 1 })
                                                      : j(i.$slots, `header`, {
                                                          key: 0,
                                                          close: U(N),
                                                          titleId: U(h),
                                                          titleClass: U(l).e(`title`)
                                                        })
                                                  ]),
                                                  default: n(() => [j(i.$slots, `default`)]),
                                                  _: 2
                                                },
                                                [
                                                  i.$slots.footer
                                                    ? { name: `footer`, fn: n(() => [j(i.$slots, `footer`)]), key: `0` }
                                                    : void 0
                                                ]
                                              ),
                                              1040,
                                              [
                                                `center`,
                                                `align-center`,
                                                `close-icon`,
                                                `draggable`,
                                                `overflow`,
                                                `fullscreen`,
                                                `header-class`,
                                                `body-class`,
                                                `footer-class`,
                                                `show-close`,
                                                `title`,
                                                `aria-level`,
                                                `onClose`,
                                                `onMousedown`
                                              ]
                                            ))
                                          : E(`v-if`, !0)
                                      ]),
                                      _: 3
                                    },
                                    8,
                                    [
                                      `trapped`,
                                      `onFocusAfterTrapped`,
                                      `onFocusAfterReleased`,
                                      `onFocusoutPrevented`,
                                      `onReleaseRequested`
                                    ]
                                  )
                                ],
                                46,
                                Ha
                              )
                            ]),
                            _: 3
                          },
                          8,
                          [`mask`, `overlay-class`, `z-index`]
                        ),
                        [[r, U(m)]]
                      )
                    ]),
                    _: 3
                  },
                  16
                )
              ],
              8,
              [`to`, `disabled`]
            )
          )
        );
      }
    })
  ),
  Wa = J({
    id: { type: String, default: void 0 },
    step: { type: Number, default: 1 },
    stepStrictly: Boolean,
    max: { type: Number, default: 2 ** 53 - 1 },
    min: { type: Number, default: -(2 ** 53 - 1) },
    modelValue: { type: [Number, null] },
    readonly: Boolean,
    disabled: { type: Boolean, default: void 0 },
    size: je,
    controls: { type: Boolean, default: !0 },
    controlsPosition: { type: String, default: ``, values: [``, `right`] },
    valueOnClear: {
      type: X([String, Number, null]),
      validator: e => e === null || lt(e) || [`min`, `max`].includes(e),
      default: null
    },
    name: String,
    placeholder: String,
    precision: { type: Number, validator: e => e >= 0 && e === Number.parseInt(`${e}`, 10) },
    validateEvent: { type: Boolean, default: !0 },
    ...q([`ariaLabel`]),
    inputmode: { type: X(String), default: void 0 },
    align: { type: X(String), default: `center` },
    disabledScientific: Boolean,
    formatter: { type: Function },
    parser: { type: Function },
    tabindex: { type: [String, Number], default: 0 }
  }),
  Ga = {
    [gt]: (e, t) => t !== e,
    blur: e => e instanceof FocusEvent,
    focus: e => e instanceof FocusEvent,
    [ht]: e => lt(e) || Je(e),
    [_t]: e => lt(e) || Je(e)
  },
  Ka = [`aria-label`],
  qa = [`aria-label`],
  Ja = Se(
    H({
      name: `ElInputNumber`,
      __name: `input-number`,
      props: Wa,
      emits: Ga,
      setup(t, { expose: r, emit: a }) {
        let o = t,
          s = a,
          { t: c } = Ee(),
          l = Fe(`input-number`),
          d = K(),
          m = h({ currentValue: o.modelValue, userInput: null }),
          { formItem: _ } = Y(),
          y = f(() => lt(o.modelValue) && o.modelValue <= o.min),
          b = f(() => lt(o.modelValue) && o.modelValue >= o.max),
          S = f(() => {
            let e = N(o.step);
            return we(o.precision)
              ? Math.max(N(o.modelValue), e)
              : (e > o.precision && Ge(`InputNumber`, `precision should not be less than the decimal places of step`),
                o.precision);
          }),
          C = f(() => o.controls && o.controlsPosition === `right`),
          T = ct(),
          D = Re(),
          k = f(() => {
            if (m.userInput !== null) return m.userInput;
            let e = m.currentValue;
            if (Je(e)) return ``;
            if (lt(e)) {
              if (Number.isNaN(e)) return ``;
              we(o.precision) || (e = e.toFixed(o.precision));
            }
            return e;
          }),
          M = (e, t) => {
            if ((we(t) && (t = S.value), t === 0)) return Math.round(e);
            let n = String(e),
              r = n.indexOf(`.`);
            if (r === -1 || !n.replace(`.`, ``).split(``)[r + t]) return e;
            let i = n.length;
            return (
              n.charAt(i - 1) === `5` && (n = `${n.slice(0, Math.max(0, i - 1))}6`),
              Number.parseFloat(Number(n).toFixed(t))
            );
          },
          N = e => {
            if (Je(e)) return 0;
            let t = e.toString(),
              n = t.indexOf(`.`),
              r = 0;
            return (n !== -1 && (r = t.length - n - 1), r);
          },
          P = (e, t = 1) =>
            lt(e)
              ? e >= 2 ** 53 - 1 && t === 1
                ? (Ge(`InputNumber`, `The value has reached the maximum safe integer limit.`), e)
                : e <= -(2 ** 53 - 1) && t === -1
                  ? (Ge(`InputNumber`, `The value has reached the minimum safe integer limit.`), e)
                  : M(e + o.step * t)
              : m.currentValue,
          F = e => {
            let t = pt(e),
              n = ye(e);
            if (o.disabledScientific && [`e`, `E`].includes(n)) {
              e.preventDefault();
              return;
            }
            switch (t) {
              case be.up:
                (e.preventDefault(), ee());
                break;
              case be.down:
                (e.preventDefault(), I());
                break;
            }
          },
          ee = () => {
            o.readonly || D.value || b.value || (R(P(Number(k.value) || 0)), s(ht, m.currentValue), ce());
          },
          I = () => {
            o.readonly || D.value || y.value || (R(P(Number(k.value) || 0, -1)), s(ht, m.currentValue), ce());
          },
          L = (e, t) => {
            let { max: n, min: r, step: i, precision: a, stepStrictly: c, valueOnClear: l } = o;
            n < r && We(`InputNumber`, `min should not be greater than max.`);
            let u = e ? Number.parseFloat(String(e)) : Number(e);
            if (Je(e) || Number.isNaN(u)) return null;
            if (e === ``) {
              if (l === null) return null;
              u = B(l) ? { min: r, max: n }[l] : l;
            }
            return (
              c && ((u = M(Math.round(M(u / i)) * i, a)), u !== e && t && s(`update:modelValue`, u)),
              we(a) || (u = M(u, a)),
              (u > n || u < r) && ((u = u > n ? n : r), t && s(`update:modelValue`, u)),
              u
            );
          },
          R = (e, t = !0) => {
            let n = m.currentValue,
              r = L(e);
            if (!t) {
              s(_t, r);
              return;
            }
            ((m.userInput = null),
              !(n === r && e) &&
                (s(_t, r),
                n !== r && s(gt, r, n),
                o.validateEvent && _?.validate?.(`change`).catch(p),
                (m.currentValue = r)));
          },
          re = e => {
            m.userInput = e;
            let t = e === `` ? null : Number.parseFloat(e);
            (Number.isNaN(t) && (t = null), s(ht, t), R(t, !1));
          },
          ie = e => {
            let t = e === `` ? `` : Number.parseFloat(e);
            (((lt(t) && !Number.isNaN(t)) || (o.formatter && Number.isNaN(t)) || t === ``) && R(t),
              ce(),
              (m.userInput = null));
          },
          H = () => {
            d.value?.focus?.();
          },
          ae = () => {
            d.value?.blur?.();
          },
          oe = e => {
            s(`focus`, e);
          },
          se = e => {
            ((m.userInput = null),
              m.currentValue === null && d.value?.input && (d.value.input.value = o.formatter?.(``) ?? ``),
              s(`blur`, e),
              o.validateEvent && _?.validate?.(`blur`).catch(p));
          },
          ce = () => {
            m.currentValue !== o.modelValue && (m.currentValue = o.modelValue);
          },
          le = e => {
            document.activeElement === e.target && e.preventDefault();
          };
        return (
          g(
            () => o.modelValue,
            (e, t) => {
              let n = L(e, !0);
              m.userInput === null && n !== t && (m.currentValue = n);
            },
            { immediate: !0 }
          ),
          g(
            () => o.precision,
            () => {
              m.currentValue = L(o.modelValue);
            }
          ),
          V(() => {
            let { min: e, max: t, modelValue: n } = o,
              r = d.value?.input;
            if (
              (r.setAttribute(`role`, `spinbutton`),
              Number.isFinite(t) ? r.setAttribute(`aria-valuemax`, String(t)) : r.removeAttribute(`aria-valuemax`),
              Number.isFinite(e) ? r.setAttribute(`aria-valuemin`, String(e)) : r.removeAttribute(`aria-valuemin`),
              r.setAttribute(`aria-valuenow`, m.currentValue || m.currentValue === 0 ? String(m.currentValue) : ``),
              r.setAttribute(`aria-disabled`, String(D.value)),
              !lt(n) && n != null)
            ) {
              let e = Number(n);
              (Number.isNaN(e) && (e = null), s(_t, e));
            }
            r.addEventListener(`wheel`, le, { passive: !1 });
          }),
          z(() => {
            d.value?.input?.setAttribute(`aria-valuenow`, `${m.currentValue ?? ``}`);
          }),
          r({ focus: H, blur: ae }),
          (r, a) => (
            O(),
            v(
              `div`,
              {
                class: A([
                  U(l).b(),
                  U(l).m(U(T)),
                  U(l).is(`disabled`, U(D)),
                  U(l).is(`without-controls`, !t.controls),
                  U(l).is(`controls-right`, C.value),
                  U(l).is(t.align, !!t.align)
                ]),
                onDragstart: (a[0] ||= u(() => {}, [`prevent`]))
              },
              [
                t.controls
                  ? ne(
                      (O(),
                      v(
                        `span`,
                        {
                          key: 0,
                          role: `button`,
                          'aria-label': U(c)(`el.inputNumber.decrease`),
                          class: A([U(l).e(`decrease`), U(l).is(`disabled`, y.value)]),
                          onKeydown: x(I, [`enter`])
                        },
                        [
                          j(r.$slots, `decrease-icon`, {}, () => [
                            G(U(Z), null, {
                              default: n(() => [C.value ? (O(), w(U(de), { key: 0 })) : (O(), w(U(ge), { key: 1 }))]),
                              _: 1
                            })
                          ])
                        ],
                        42,
                        Ka
                      )),
                      [[U(br), I]]
                    )
                  : E(`v-if`, !0),
                t.controls
                  ? ne(
                      (O(),
                      v(
                        `span`,
                        {
                          key: 1,
                          role: `button`,
                          'aria-label': U(c)(`el.inputNumber.increase`),
                          class: A([U(l).e(`increase`), U(l).is(`disabled`, b.value)]),
                          onKeydown: x(ee, [`enter`])
                        },
                        [
                          j(r.$slots, `increase-icon`, {}, () => [
                            G(U(Z), null, {
                              default: n(() => [C.value ? (O(), w(U(te), { key: 0 })) : (O(), w(U(i), { key: 1 }))]),
                              _: 1
                            })
                          ])
                        ],
                        42,
                        qa
                      )),
                      [[U(br), ee]]
                    )
                  : E(`v-if`, !0),
                G(
                  U(Et),
                  {
                    id: t.id,
                    ref_key: `input`,
                    ref: d,
                    type: t.formatter ? `text` : `number`,
                    step: t.step,
                    'model-value': k.value,
                    placeholder: t.placeholder,
                    readonly: t.readonly,
                    disabled: U(D),
                    size: U(T),
                    max: t.max,
                    min: t.min,
                    name: t.name,
                    'aria-label': t.ariaLabel,
                    'validate-event': !1,
                    inputmode: t.inputmode,
                    formatter: t.formatter,
                    parser: t.parser,
                    tabindex: t.tabindex,
                    onKeydown: F,
                    onBlur: se,
                    onFocus: oe,
                    onInput: re,
                    onChange: ie
                  },
                  e({ _: 2 }, [
                    r.$slots.prefix ? { name: `prefix`, fn: n(() => [j(r.$slots, `prefix`)]), key: `0` } : void 0,
                    r.$slots.suffix ? { name: `suffix`, fn: n(() => [j(r.$slots, `suffix`)]), key: `1` } : void 0
                  ]),
                  1032,
                  [
                    `id`,
                    `type`,
                    `step`,
                    `model-value`,
                    `placeholder`,
                    `readonly`,
                    `disabled`,
                    `size`,
                    `max`,
                    `min`,
                    `name`,
                    `aria-label`,
                    `inputmode`,
                    `formatter`,
                    `parser`,
                    `tabindex`
                  ]
                )
              ],
              34
            )
          )
        );
      }
    })
  ),
  Ya = J({
    modelValue: { type: [Boolean, String, Number], default: !1 },
    disabled: { type: Boolean, default: void 0 },
    loading: Boolean,
    size: { type: String, validator: Ot },
    width: { type: [String, Number], default: `` },
    inlinePrompt: Boolean,
    inactiveActionIcon: { type: Ce },
    activeActionIcon: { type: Ce },
    activeIcon: { type: Ce },
    inactiveIcon: { type: Ce },
    activeText: { type: String, default: `` },
    inactiveText: { type: String, default: `` },
    activeValue: { type: [Boolean, String, Number], default: !0 },
    inactiveValue: { type: [Boolean, String, Number], default: !1 },
    name: { type: String, default: `` },
    validateEvent: { type: Boolean, default: !0 },
    beforeChange: { type: X(Function) },
    id: String,
    tabindex: { type: [String, Number] },
    ...q([`ariaLabel`])
  }),
  Xa = { [_t]: e => ut(e) || B(e) || lt(e), [gt]: e => ut(e) || B(e) || lt(e), [ht]: e => ut(e) || B(e) || lt(e) },
  Za = [
    `id`,
    `aria-checked`,
    `aria-disabled`,
    `aria-label`,
    `name`,
    `true-value`,
    `false-value`,
    `disabled`,
    `tabindex`
  ],
  Qa = [`aria-hidden`],
  $a = { key: 1 },
  eo = { key: 1 },
  to = [`aria-hidden`],
  no = `ElSwitch`,
  ro = Se(
    H({
      name: no,
      __name: `switch`,
      props: Ya,
      emits: Xa,
      setup(e, { expose: t, emit: r }) {
        let i = e,
          o = r,
          { formItem: s } = Y(),
          c = ct(),
          l = Fe(`switch`),
          { inputId: m } = Ue(i, { formItemContext: s }),
          h = Re(
            f(() => {
              if (i.loading) return !0;
            })
          ),
          _ = K(i.modelValue !== !1),
          y = d(),
          b = f(() => [l.b(), l.m(c.value), l.is(`disabled`, h.value), l.is(`checked`, P.value)]),
          S = f(() => [l.e(`label`), l.em(`label`, `left`), l.is(`active`, !P.value)]),
          C = f(() => [l.e(`label`), l.em(`label`, `right`), l.is(`active`, P.value)]),
          k = f(() => ({ width: Ie(i.width) }));
        g(
          () => i.modelValue,
          () => {
            _.value = !0;
          }
        );
        let M = f(() => (_.value ? i.modelValue : !1)),
          P = f(() => M.value === i.activeValue);
        ([i.activeValue, i.inactiveValue].includes(M.value) ||
          (Ge(no, `model-value must be active-value or inactive-value`),
          o(_t, i.inactiveValue),
          o(gt, i.inactiveValue),
          o(ht, i.inactiveValue)),
          g(P, e => {
            ((y.value.checked = e), i.validateEvent && s?.validate?.(`change`).catch(p));
          }));
        let F = () => {
            let e = P.value ? i.inactiveValue : i.activeValue;
            (o(_t, e),
              o(gt, e),
              o(ht, e),
              re(() => {
                y.value.checked = P.value;
              }));
          },
          ee = () => {
            if (h.value) return;
            let { beforeChange: e } = i;
            if (!e) {
              F();
              return;
            }
            let t = e();
            ([ce(t), ut(t)].includes(!0) || We(no, 'beforeChange must return type `Promise<boolean>` or `boolean`'),
              ce(t)
                ? t
                    .then(e => {
                      e && F();
                    })
                    .catch(e => {
                      Ge(no, `some error occurred: ${e}`);
                    })
                : t && F());
          };
        return (
          V(() => {
            y.value.checked = P.value;
          }),
          t({
            focus: () => {
              y.value?.focus?.();
            },
            checked: P
          }),
          (t, r) => (
            O(),
            v(
              `div`,
              { class: A(b.value), onClick: u(ee, [`prevent`]) },
              [
                T(
                  `input`,
                  {
                    id: U(m),
                    ref_key: `input`,
                    ref: y,
                    class: A(U(l).e(`input`)),
                    type: `checkbox`,
                    role: `switch`,
                    'aria-checked': P.value,
                    'aria-disabled': U(h),
                    'aria-label': e.ariaLabel,
                    name: e.name,
                    'true-value': e.activeValue,
                    'false-value': e.inactiveValue,
                    disabled: U(h),
                    tabindex: e.tabindex,
                    onChange: F,
                    onKeydown: x(ee, [`enter`])
                  },
                  null,
                  42,
                  Za
                ),
                !e.inlinePrompt && (e.inactiveIcon || e.inactiveText || t.$slots.inactive)
                  ? (O(),
                    v(
                      `span`,
                      { key: 0, class: A(S.value) },
                      [
                        j(t.$slots, `inactive`, {}, () => [
                          e.inactiveIcon
                            ? (O(), w(U(Z), { key: 0 }, { default: n(() => [(O(), w(a(e.inactiveIcon)))]), _: 1 }))
                            : E(`v-if`, !0),
                          !e.inactiveIcon && e.inactiveText
                            ? (O(), v(`span`, { key: 1, 'aria-hidden': P.value }, N(e.inactiveText), 9, Qa))
                            : E(`v-if`, !0)
                        ])
                      ],
                      2
                    ))
                  : E(`v-if`, !0),
                T(
                  `span`,
                  { class: A(U(l).e(`core`)), style: W(k.value) },
                  [
                    e.inlinePrompt
                      ? (O(),
                        v(
                          `div`,
                          { key: 0, class: A(U(l).e(`inner`)) },
                          [
                            P.value
                              ? (O(),
                                v(
                                  `div`,
                                  { key: 1, class: A(U(l).e(`inner-wrapper`)) },
                                  [
                                    j(t.$slots, `active`, {}, () => [
                                      e.activeIcon
                                        ? (O(),
                                          w(U(Z), { key: 0 }, { default: n(() => [(O(), w(a(e.activeIcon)))]), _: 1 }))
                                        : E(`v-if`, !0),
                                      !e.activeIcon && e.activeText
                                        ? (O(), v(`span`, eo, N(e.activeText), 1))
                                        : E(`v-if`, !0)
                                    ])
                                  ],
                                  2
                                ))
                              : (O(),
                                v(
                                  `div`,
                                  { key: 0, class: A(U(l).e(`inner-wrapper`)) },
                                  [
                                    j(t.$slots, `inactive`, {}, () => [
                                      e.inactiveIcon
                                        ? (O(),
                                          w(
                                            U(Z),
                                            { key: 0 },
                                            { default: n(() => [(O(), w(a(e.inactiveIcon)))]), _: 1 }
                                          ))
                                        : E(`v-if`, !0),
                                      !e.inactiveIcon && e.inactiveText
                                        ? (O(), v(`span`, $a, N(e.inactiveText), 1))
                                        : E(`v-if`, !0)
                                    ])
                                  ],
                                  2
                                ))
                          ],
                          2
                        ))
                      : E(`v-if`, !0),
                    T(
                      `div`,
                      { class: A(U(l).e(`action`)) },
                      [
                        e.loading
                          ? (O(),
                            w(
                              U(Z),
                              { key: 0, class: A(U(l).is(`loading`)) },
                              { default: n(() => [G(U(D))]), _: 1 },
                              8,
                              [`class`]
                            ))
                          : P.value
                            ? j(t.$slots, `active-action`, { key: 1 }, () => [
                                e.activeActionIcon
                                  ? (O(),
                                    w(U(Z), { key: 0 }, { default: n(() => [(O(), w(a(e.activeActionIcon)))]), _: 1 }))
                                  : E(`v-if`, !0)
                              ])
                            : P.value
                              ? E(`v-if`, !0)
                              : j(t.$slots, `inactive-action`, { key: 2 }, () => [
                                  e.inactiveActionIcon
                                    ? (O(),
                                      w(
                                        U(Z),
                                        { key: 0 },
                                        { default: n(() => [(O(), w(a(e.inactiveActionIcon)))]), _: 1 }
                                      ))
                                    : E(`v-if`, !0)
                                ])
                      ],
                      2
                    )
                  ],
                  6
                ),
                !e.inlinePrompt && (e.activeIcon || e.activeText || t.$slots.active)
                  ? (O(),
                    v(
                      `span`,
                      { key: 1, class: A(C.value) },
                      [
                        j(t.$slots, `active`, {}, () => [
                          e.activeIcon
                            ? (O(), w(U(Z), { key: 0 }, { default: n(() => [(O(), w(a(e.activeIcon)))]), _: 1 }))
                            : E(`v-if`, !0),
                          !e.activeIcon && e.activeText
                            ? (O(), v(`span`, { key: 1, 'aria-hidden': !P.value }, N(e.activeText), 9, to))
                            : E(`v-if`, !0)
                        ])
                      ],
                      2
                    ))
                  : E(`v-if`, !0)
              ],
              2
            )
          )
        );
      }
    })
  );
export { Gn as a, Da as i, Ja as n, Kn as o, Ua as r, ro as t };
