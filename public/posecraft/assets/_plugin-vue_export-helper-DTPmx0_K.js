import { a4 as l } from './index-C531BqZY.js';
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const p = t => {
  for (const e in t) if (e.startsWith('aria-') || e === 'role' || e === 'title') return !0;
  return !1;
};
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const d = t => t === '';
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const g = (...t) =>
  t
    .filter((e, r, o) => !!e && e.trim() !== '' && o.indexOf(e) === r)
    .join(' ')
    .trim();
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const w = t => t.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const m = t => t.replace(/^([A-Z])|[\s-_]+(\w)/g, (e, r, o) => (o ? o.toUpperCase() : r.toLowerCase()));
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const C = t => {
  const e = m(t);
  return e.charAt(0).toUpperCase() + e.slice(1);
};
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var n = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round'
};
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const k = (
  {
    name: t,
    iconNode: e,
    absoluteStrokeWidth: r,
    'absolute-stroke-width': o,
    strokeWidth: s,
    'stroke-width': u,
    size: c = n.width,
    color: h = n.stroke,
    ...i
  },
  { slots: a }
) =>
  l(
    'svg',
    {
      ...n,
      ...i,
      width: c,
      height: c,
      stroke: h,
      'stroke-width':
        d(r) || d(o) || r === !0 || o === !0
          ? (Number(s || u || n['stroke-width']) * 24) / Number(c)
          : s || u || n['stroke-width'],
      class: g('lucide', i.class, ...(t ? [`lucide-${w(C(t))}-icon`, `lucide-${w(t)}`] : ['lucide-icon'])),
      ...(!a.default && !p(i) && { 'aria-hidden': 'true' })
    },
    [...e.map(f => l(...f)), ...(a.default ? [a.default()] : [])]
  );
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const _ =
    (t, e) =>
    (r, { slots: o, attrs: s }) =>
      l(k, { ...s, ...r, iconNode: e, name: t }, o),
  x = (t, e) => {
    const r = t.__vccOpts || t;
    for (const [o, s] of e) r[o] = s;
    return r;
  };
export { x as _, _ as c };
