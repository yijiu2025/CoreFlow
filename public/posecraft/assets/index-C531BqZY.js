const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f ||
    (m.f = [
      'assets/HomeView-Hlm7Y1Kp.js',
      'assets/useHome-R4pP8npN.js',
      'assets/work-CSZq0nvF.js',
      'assets/useLocation-BzKEbus-.js',
      'assets/wrench-CXNTiZy0.js',
      'assets/_plugin-vue_export-helper-DTPmx0_K.js',
      'assets/sparkles-CSDhrUXU.js',
      'assets/map-pin-CeIDkRSF.js',
      'assets/heart-DQGPeVSk.js',
      'assets/users-BaaIlyJv.js',
      'assets/user-Cti-8Le8.js',
      'assets/HomeView-CdTDUYUa.css',
      'assets/FeaturedView-CC_C4xE-.js',
      'assets/Icon.vue_vue_type_script_setup_true_lang-D-OxR9Ey.js',
      'assets/loader-circle-BU5vGQ8h.js',
      'assets/x-dxW7U81h.js',
      'assets/triangle-alert-htK-bCwW.js',
      'assets/search-oUkp4cYT.js',
      'assets/message-circle-C3r4ZyRP.js',
      'assets/aperture-CMAIhw8p.js',
      'assets/camera-nl1SqI33.js',
      'assets/SkeletonCard-DNRU_iEi.js',
      'assets/SkeletonCard-DvM7cnK4.css',
      'assets/FeaturedView-Bumdnjxv.css',
      'assets/RecommendView-Beyhd1RM.js',
      'assets/RecommendView-DADCQhoV.css',
      'assets/NearbyView-8Gev2Hq9.js',
      'assets/NearbyView-DptpNDvo.css',
      'assets/FollowingView-BmjAisWe.js',
      'assets/FollowingView-DbEd2Glb.css',
      'assets/FriendsView-aFqeewWt.js',
      'assets/FriendsView-fAiYrGQY.css',
      'assets/MineView-B69ymlvI.js',
      'assets/user-6MceWoQF.js',
      'assets/template-C3FhZP8t.js',
      'assets/MineView-C9yLIzD_.css',
      'assets/EditorView-CFRR2zLQ.js',
      'assets/fabric-B2jl7k7A.js',
      'assets/EditorView-lS_5aZWz.css',
      'assets/CameraView-Cfkh8XaV.js',
      'assets/LoginView-BAxi1SSb.js',
      'assets/auth-B31mPbwd.js',
      'assets/LoginView-BHXFmpkt.css',
      'assets/CallbackView-fAESdZJ9.js',
      'assets/WorkDetail-Bsx1ONlD.js',
      'assets/WorkDetail-12CDK__S.css'
    ])
) => i.map(i => d[i]);
(function () {
  const t = document.createElement('link').relList;
  if (t && t.supports && t.supports('modulepreload')) return;
  for (const s of document.querySelectorAll('link[rel="modulepreload"]')) r(s);
  new MutationObserver(s => {
    for (const o of s)
      if (o.type === 'childList')
        for (const i of o.addedNodes) i.tagName === 'LINK' && i.rel === 'modulepreload' && r(i);
  }).observe(document, { childList: !0, subtree: !0 });
  function n(s) {
    const o = {};
    return (
      s.integrity && (o.integrity = s.integrity),
      s.referrerPolicy && (o.referrerPolicy = s.referrerPolicy),
      s.crossOrigin === 'use-credentials'
        ? (o.credentials = 'include')
        : s.crossOrigin === 'anonymous'
          ? (o.credentials = 'omit')
          : (o.credentials = 'same-origin'),
      o
    );
  }
  function r(s) {
    if (s.ep) return;
    s.ep = !0;
    const o = n(s);
    fetch(s.href, o);
  }
})();
/**
 * @vue/shared v3.5.38
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/ function Ai(e) {
  const t = Object.create(null);
  for (const n of e.split(',')) t[n] = 1;
  return n => n in t;
}
const _e = {},
  Bn = [],
  Ft = () => {},
  yc = () => !1,
  Hs = e => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && (e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97),
  $s = e => e.startsWith('onUpdate:'),
  Ve = Object.assign,
  Ti = (e, t) => {
    const n = e.indexOf(t);
    n > -1 && e.splice(n, 1);
  },
  gd = Object.prototype.hasOwnProperty,
  ve = (e, t) => gd.call(e, t),
  Z = Array.isArray,
  Wn = e => or(e) === '[object Map]',
  sr = e => or(e) === '[object Set]',
  ua = e => or(e) === '[object Date]',
  _d = e => or(e) === '[object RegExp]',
  oe = e => typeof e == 'function',
  Ce = e => typeof e == 'string',
  gt = e => typeof e == 'symbol',
  Ee = e => e !== null && typeof e == 'object',
  Ec = e => (Ee(e) || oe(e)) && oe(e.then) && oe(e.catch),
  bc = Object.prototype.toString,
  or = e => bc.call(e),
  yd = e => or(e).slice(8, -1),
  vc = e => or(e) === '[object Object]',
  js = e => Ce(e) && e !== 'NaN' && e[0] !== '-' && '' + parseInt(e, 10) === e,
  wr = Ai(
    ',key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted'
  ),
  Bs = e => {
    const t = Object.create(null);
    return n => t[n] || (t[n] = e(n));
  },
  Ed = /-\w/g,
  tt = Bs(e => e.replace(Ed, t => t.slice(1).toUpperCase())),
  bd = /\B([A-Z])/g,
  tn = Bs(e => e.replace(bd, '-$1').toLowerCase()),
  Ws = Bs(e => e.charAt(0).toUpperCase() + e.slice(1)),
  _o = Bs(e => (e ? `on${Ws(e)}` : '')),
  qe = (e, t) => !Object.is(e, t),
  Gn = (e, ...t) => {
    for (let n = 0; n < e.length; n++) e[n](...t);
  },
  Sc = (e, t, n, r = !1) => {
    Object.defineProperty(e, t, { configurable: !0, enumerable: !1, writable: r, value: n });
  },
  Gs = e => {
    const t = parseFloat(e);
    return isNaN(t) ? e : t;
  },
  vd = e => {
    const t = Ce(e) ? Number(e) : NaN;
    return isNaN(t) ? e : t;
  };
let fa;
const Ks = () =>
  fa ||
  (fa =
    typeof globalThis < 'u'
      ? globalThis
      : typeof self < 'u'
        ? self
        : typeof window < 'u'
          ? window
          : typeof global < 'u'
            ? global
            : {});
function wi(e) {
  if (Z(e)) {
    const t = {};
    for (let n = 0; n < e.length; n++) {
      const r = e[n],
        s = Ce(r) ? wd(r) : wi(r);
      if (s) for (const o in s) t[o] = s[o];
    }
    return t;
  } else if (Ce(e) || Ee(e)) return e;
}
const Sd = /;(?![^(]*\))/g,
  Ad = /:([^]+)/,
  Td = /\/\*[^]*?\*\//g;
function wd(e) {
  const t = {};
  return (
    e
      .replace(Td, '')
      .split(Sd)
      .forEach(n => {
        if (n) {
          const r = n.split(Ad);
          r.length > 1 && (t[r[0].trim()] = r[1].trim());
        }
      }),
    t
  );
}
function qs(e) {
  let t = '';
  if (Ce(e)) t = e;
  else if (Z(e))
    for (let n = 0; n < e.length; n++) {
      const r = qs(e[n]);
      r && (t += r + ' ');
    }
  else if (Ee(e)) for (const n in e) e[n] && (t += n + ' ');
  return t.trim();
}
const Od = 'itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly',
  Rd = Ai(Od);
function Ac(e) {
  return !!e || e === '';
}
function Cd(e, t) {
  if (e.length !== t.length) return !1;
  let n = !0;
  for (let r = 0; n && r < e.length; r++) n = ir(e[r], t[r]);
  return n;
}
function ir(e, t) {
  if (e === t) return !0;
  let n = ua(e),
    r = ua(t);
  if (n || r) return n && r ? e.getTime() === t.getTime() : !1;
  if (((n = gt(e)), (r = gt(t)), n || r)) return e === t;
  if (((n = Z(e)), (r = Z(t)), n || r)) return n && r ? Cd(e, t) : !1;
  if (((n = Ee(e)), (r = Ee(t)), n || r)) {
    if (!n || !r) return !1;
    const s = Object.keys(e).length,
      o = Object.keys(t).length;
    if (s !== o) return !1;
    for (const i in e) {
      const a = e.hasOwnProperty(i),
        l = t.hasOwnProperty(i);
      if ((a && !l) || (!a && l) || !ir(e[i], t[i])) return !1;
    }
  }
  return String(e) === String(t);
}
function Oi(e, t) {
  return e.findIndex(n => ir(n, t));
}
const Tc = e => !!(e && e.__v_isRef === !0),
  Ld = e =>
    Ce(e)
      ? e
      : e == null
        ? ''
        : Z(e) || (Ee(e) && (e.toString === bc || !oe(e.toString)))
          ? Tc(e)
            ? Ld(e.value)
            : JSON.stringify(e, wc, 2)
          : String(e),
  wc = (e, t) =>
    Tc(t)
      ? wc(e, t.value)
      : Wn(t)
        ? { [`Map(${t.size})`]: [...t.entries()].reduce((n, [r, s], o) => ((n[yo(r, o) + ' =>'] = s), n), {}) }
        : sr(t)
          ? { [`Set(${t.size})`]: [...t.values()].map(n => yo(n)) }
          : gt(t)
            ? yo(t)
            : Ee(t) && !Z(t) && !vc(t)
              ? String(t)
              : t,
  yo = (e, t = '') => {
    var n;
    return gt(e) ? `Symbol(${(n = e.description) != null ? n : t})` : e;
  };
/**
 * @vue/reactivity v3.5.38
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/ let $e;
class Oc {
  constructor(t = !1) {
    ((this.detached = t),
      (this._active = !0),
      (this._on = 0),
      (this.effects = []),
      (this.cleanups = []),
      (this._isPaused = !1),
      (this._warnOnRun = !0),
      (this.__v_skip = !0),
      !t &&
        $e &&
        ($e.active
          ? ((this.parent = $e), (this.index = ($e.scopes || ($e.scopes = [])).push(this) - 1))
          : ((this._active = !1), (this._warnOnRun = !1))));
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = !0;
      let t, n;
      if (this.scopes) for (t = 0, n = this.scopes.length; t < n; t++) this.scopes[t].pause();
      for (t = 0, n = this.effects.length; t < n; t++) this.effects[t].pause();
    }
  }
  resume() {
    if (this._active && this._isPaused) {
      this._isPaused = !1;
      let t, n;
      if (this.scopes) for (t = 0, n = this.scopes.length; t < n; t++) this.scopes[t].resume();
      for (t = 0, n = this.effects.length; t < n; t++) this.effects[t].resume();
    }
  }
  run(t) {
    if (this._active) {
      const n = $e;
      try {
        return (($e = this), t());
      } finally {
        $e = n;
      }
    }
  }
  on() {
    ++this._on === 1 && ((this.prevScope = $e), ($e = this));
  }
  off() {
    if (this._on > 0 && --this._on === 0) {
      if ($e === this) $e = this.prevScope;
      else {
        let t = $e;
        for (; t; ) {
          if (t.prevScope === this) {
            t.prevScope = this.prevScope;
            break;
          }
          t = t.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(t) {
    if (this._active) {
      this._active = !1;
      let n, r;
      for (n = 0, r = this.effects.length; n < r; n++) this.effects[n].stop();
      for (this.effects.length = 0, n = 0, r = this.cleanups.length; n < r; n++) this.cleanups[n]();
      if (((this.cleanups.length = 0), this.scopes)) {
        for (n = 0, r = this.scopes.length; n < r; n++) this.scopes[n].stop(!0);
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !t) {
        const s = this.parent.scopes.pop();
        s && s !== this && ((this.parent.scopes[this.index] = s), (s.index = this.index));
      }
      this.parent = void 0;
    }
  }
}
function Ri(e) {
  return new Oc(e);
}
function Ci() {
  return $e;
}
function Rc(e, t = !1) {
  $e && $e.cleanups.push(e);
}
let Oe;
const Eo = new WeakSet();
class Cc {
  constructor(t) {
    ((this.fn = t),
      (this.deps = void 0),
      (this.depsTail = void 0),
      (this.flags = 5),
      (this.next = void 0),
      (this.cleanup = void 0),
      (this.scheduler = void 0),
      $e && ($e.active ? $e.effects.push(this) : (this.flags &= -2)));
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    this.flags & 64 && ((this.flags &= -65), Eo.has(this) && (Eo.delete(this), this.trigger()));
  }
  notify() {
    (this.flags & 2 && !(this.flags & 32)) || this.flags & 8 || Nc(this);
  }
  run() {
    if (!(this.flags & 1)) return this.fn();
    ((this.flags |= 2), da(this), Ic(this));
    const t = Oe,
      n = Rt;
    ((Oe = this), (Rt = !0));
    try {
      return this.fn();
    } finally {
      (Pc(this), (Oe = t), (Rt = n), (this.flags &= -3));
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let t = this.deps; t; t = t.nextDep) Ii(t);
      ((this.deps = this.depsTail = void 0), da(this), this.onStop && this.onStop(), (this.flags &= -2));
    }
  }
  trigger() {
    this.flags & 64 ? Eo.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
  }
  runIfDirty() {
    Wo(this) && this.run();
  }
  get dirty() {
    return Wo(this);
  }
}
let Lc = 0,
  Or,
  Rr;
function Nc(e, t = !1) {
  if (((e.flags |= 8), t)) {
    ((e.next = Rr), (Rr = e));
    return;
  }
  ((e.next = Or), (Or = e));
}
function Li() {
  Lc++;
}
function Ni() {
  if (--Lc > 0) return;
  if (Rr) {
    let t = Rr;
    for (Rr = void 0; t; ) {
      const n = t.next;
      ((t.next = void 0), (t.flags &= -9), (t = n));
    }
  }
  let e;
  for (; Or; ) {
    let t = Or;
    for (Or = void 0; t; ) {
      const n = t.next;
      if (((t.next = void 0), (t.flags &= -9), t.flags & 1))
        try {
          t.trigger();
        } catch (r) {
          e || (e = r);
        }
      t = n;
    }
  }
  if (e) throw e;
}
function Ic(e) {
  for (let t = e.deps; t; t = t.nextDep)
    ((t.version = -1), (t.prevActiveLink = t.dep.activeLink), (t.dep.activeLink = t));
}
function Pc(e) {
  let t,
    n = e.depsTail,
    r = n;
  for (; r; ) {
    const s = r.prevDep;
    (r.version === -1 ? (r === n && (n = s), Ii(r), Nd(r)) : (t = r),
      (r.dep.activeLink = r.prevActiveLink),
      (r.prevActiveLink = void 0),
      (r = s));
  }
  ((e.deps = t), (e.depsTail = n));
}
function Wo(e) {
  for (let t = e.deps; t; t = t.nextDep)
    if (t.dep.version !== t.version || (t.dep.computed && (Dc(t.dep.computed) || t.dep.version !== t.version)))
      return !0;
  return !!e._dirty;
}
function Dc(e) {
  if (
    (e.flags & 4 && !(e.flags & 16)) ||
    ((e.flags &= -17), e.globalVersion === xr) ||
    ((e.globalVersion = xr), !e.isSSR && e.flags & 128 && ((!e.deps && !e._dirty) || !Wo(e)))
  )
    return;
  e.flags |= 2;
  const t = e.dep,
    n = Oe,
    r = Rt;
  ((Oe = e), (Rt = !0));
  try {
    Ic(e);
    const s = e.fn(e._value);
    (t.version === 0 || qe(s, e._value)) && ((e.flags |= 128), (e._value = s), t.version++);
  } catch (s) {
    throw (t.version++, s);
  } finally {
    ((Oe = n), (Rt = r), Pc(e), (e.flags &= -3));
  }
}
function Ii(e, t = !1) {
  const { dep: n, prevSub: r, nextSub: s } = e;
  if (
    (r && ((r.nextSub = s), (e.prevSub = void 0)),
    s && ((s.prevSub = r), (e.nextSub = void 0)),
    n.subs === e && ((n.subs = r), !r && n.computed))
  ) {
    n.computed.flags &= -5;
    for (let o = n.computed.deps; o; o = o.nextDep) Ii(o, !0);
  }
  !t && !--n.sc && n.map && n.map.delete(n.key);
}
function Nd(e) {
  const { prevDep: t, nextDep: n } = e;
  (t && ((t.nextDep = n), (e.prevDep = void 0)), n && ((n.prevDep = t), (e.nextDep = void 0)));
}
let Rt = !0;
const xc = [];
function zt() {
  (xc.push(Rt), (Rt = !1));
}
function Qt() {
  const e = xc.pop();
  Rt = e === void 0 ? !0 : e;
}
function da(e) {
  const { cleanup: t } = e;
  if (((e.cleanup = void 0), t)) {
    const n = Oe;
    Oe = void 0;
    try {
      t();
    } finally {
      Oe = n;
    }
  }
}
let xr = 0;
class Id {
  constructor(t, n) {
    ((this.sub = t),
      (this.dep = n),
      (this.version = n.version),
      (this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0));
  }
}
class Ys {
  constructor(t) {
    ((this.computed = t),
      (this.version = 0),
      (this.activeLink = void 0),
      (this.subs = void 0),
      (this.map = void 0),
      (this.key = void 0),
      (this.sc = 0),
      (this.__v_skip = !0));
  }
  track(t) {
    if (!Oe || !Rt || Oe === this.computed) return;
    let n = this.activeLink;
    if (n === void 0 || n.sub !== Oe)
      ((n = this.activeLink = new Id(Oe, this)),
        Oe.deps
          ? ((n.prevDep = Oe.depsTail), (Oe.depsTail.nextDep = n), (Oe.depsTail = n))
          : (Oe.deps = Oe.depsTail = n),
        kc(n));
    else if (n.version === -1 && ((n.version = this.version), n.nextDep)) {
      const r = n.nextDep;
      ((r.prevDep = n.prevDep),
        n.prevDep && (n.prevDep.nextDep = r),
        (n.prevDep = Oe.depsTail),
        (n.nextDep = void 0),
        (Oe.depsTail.nextDep = n),
        (Oe.depsTail = n),
        Oe.deps === n && (Oe.deps = r));
    }
    return n;
  }
  trigger(t) {
    (this.version++, xr++, this.notify(t));
  }
  notify(t) {
    Li();
    try {
      for (let n = this.subs; n; n = n.prevSub) n.sub.notify() && n.sub.dep.notify();
    } finally {
      Ni();
    }
  }
}
function kc(e) {
  if ((e.dep.sc++, e.sub.flags & 4)) {
    const t = e.dep.computed;
    if (t && !e.dep.subs) {
      t.flags |= 20;
      for (let r = t.deps; r; r = r.nextDep) kc(r);
    }
    const n = e.dep.subs;
    (n !== e && ((e.prevSub = n), n && (n.nextSub = e)), (e.dep.subs = e));
  }
}
const Ss = new WeakMap(),
  Ln = Symbol(''),
  Go = Symbol(''),
  kr = Symbol('');
function et(e, t, n) {
  if (Rt && Oe) {
    let r = Ss.get(e);
    r || Ss.set(e, (r = new Map()));
    let s = r.get(n);
    (s || (r.set(n, (s = new Ys())), (s.map = r), (s.key = n)), s.track());
  }
}
function Gt(e, t, n, r, s, o) {
  const i = Ss.get(e);
  if (!i) {
    xr++;
    return;
  }
  const a = l => {
    l && l.trigger();
  };
  if ((Li(), t === 'clear')) i.forEach(a);
  else {
    const l = Z(e),
      c = l && js(n);
    if (l && n === 'length') {
      const u = Number(r);
      i.forEach((f, d) => {
        (d === 'length' || d === kr || (!gt(d) && d >= u)) && a(f);
      });
    } else
      switch (((n !== void 0 || i.has(void 0)) && a(i.get(n)), c && a(i.get(kr)), t)) {
        case 'add':
          l ? c && a(i.get('length')) : (a(i.get(Ln)), Wn(e) && a(i.get(Go)));
          break;
        case 'delete':
          l || (a(i.get(Ln)), Wn(e) && a(i.get(Go)));
          break;
        case 'set':
          Wn(e) && a(i.get(Ln));
          break;
      }
  }
  Ni();
}
function Pd(e, t) {
  const n = Ss.get(e);
  return n && n.get(t);
}
function Fn(e) {
  const t = me(e);
  return t === e ? t : (et(t, 'iterate', kr), pt(e) ? t : t.map(Ct));
}
function Xs(e) {
  return (et((e = me(e)), 'iterate', kr), e);
}
function Dt(e, t) {
  return Zt(e) ? qn(Yt(e) ? Ct(t) : t) : Ct(t);
}
const Dd = {
  __proto__: null,
  [Symbol.iterator]() {
    return bo(this, Symbol.iterator, e => Dt(this, e));
  },
  concat(...e) {
    return Fn(this).concat(...e.map(t => (Z(t) ? Fn(t) : t)));
  },
  entries() {
    return bo(this, 'entries', e => ((e[1] = Dt(this, e[1])), e));
  },
  every(e, t) {
    return Ut(this, 'every', e, t, void 0, arguments);
  },
  filter(e, t) {
    return Ut(this, 'filter', e, t, n => n.map(r => Dt(this, r)), arguments);
  },
  find(e, t) {
    return Ut(this, 'find', e, t, n => Dt(this, n), arguments);
  },
  findIndex(e, t) {
    return Ut(this, 'findIndex', e, t, void 0, arguments);
  },
  findLast(e, t) {
    return Ut(this, 'findLast', e, t, n => Dt(this, n), arguments);
  },
  findLastIndex(e, t) {
    return Ut(this, 'findLastIndex', e, t, void 0, arguments);
  },
  forEach(e, t) {
    return Ut(this, 'forEach', e, t, void 0, arguments);
  },
  includes(...e) {
    return vo(this, 'includes', e);
  },
  indexOf(...e) {
    return vo(this, 'indexOf', e);
  },
  join(e) {
    return Fn(this).join(e);
  },
  lastIndexOf(...e) {
    return vo(this, 'lastIndexOf', e);
  },
  map(e, t) {
    return Ut(this, 'map', e, t, void 0, arguments);
  },
  pop() {
    return hr(this, 'pop');
  },
  push(...e) {
    return hr(this, 'push', e);
  },
  reduce(e, ...t) {
    return ha(this, 'reduce', e, t);
  },
  reduceRight(e, ...t) {
    return ha(this, 'reduceRight', e, t);
  },
  shift() {
    return hr(this, 'shift');
  },
  some(e, t) {
    return Ut(this, 'some', e, t, void 0, arguments);
  },
  splice(...e) {
    return hr(this, 'splice', e);
  },
  toReversed() {
    return Fn(this).toReversed();
  },
  toSorted(e) {
    return Fn(this).toSorted(e);
  },
  toSpliced(...e) {
    return Fn(this).toSpliced(...e);
  },
  unshift(...e) {
    return hr(this, 'unshift', e);
  },
  values() {
    return bo(this, 'values', e => Dt(this, e));
  }
};
function bo(e, t, n) {
  const r = Xs(e),
    s = r[t]();
  return (
    r !== e &&
      !pt(e) &&
      ((s._next = s.next),
      (s.next = () => {
        const o = s._next();
        return (o.done || (o.value = n(o.value)), o);
      })),
    s
  );
}
const xd = Array.prototype;
function Ut(e, t, n, r, s, o) {
  const i = Xs(e),
    a = i !== e && !pt(e),
    l = i[t];
  if (l !== xd[t]) {
    const f = l.apply(e, o);
    return a ? Ct(f) : f;
  }
  let c = n;
  i !== e &&
    (a
      ? (c = function (f, d) {
          return n.call(this, Dt(e, f), d, e);
        })
      : n.length > 2 &&
        (c = function (f, d) {
          return n.call(this, f, d, e);
        }));
  const u = l.call(i, c, r);
  return a && s ? s(u) : u;
}
function ha(e, t, n, r) {
  const s = Xs(e),
    o = s !== e && !pt(e);
  let i = n,
    a = !1;
  s !== e &&
    (o
      ? ((a = r.length === 0),
        (i = function (c, u, f) {
          return (a && ((a = !1), (c = Dt(e, c))), n.call(this, c, Dt(e, u), f, e));
        }))
      : n.length > 3 &&
        (i = function (c, u, f) {
          return n.call(this, c, u, f, e);
        }));
  const l = s[t](i, ...r);
  return a ? Dt(e, l) : l;
}
function vo(e, t, n) {
  const r = me(e);
  et(r, 'iterate', kr);
  const s = r[t](...n);
  return (s === -1 || s === !1) && Js(n[0]) ? ((n[0] = me(n[0])), r[t](...n)) : s;
}
function hr(e, t, n = []) {
  (zt(), Li());
  const r = me(e)[t].apply(e, n);
  return (Ni(), Qt(), r);
}
const kd = Ai('__proto__,__v_isRef,__isVue'),
  Fc = new Set(
    Object.getOwnPropertyNames(Symbol)
      .filter(e => e !== 'arguments' && e !== 'caller')
      .map(e => Symbol[e])
      .filter(gt)
  );
function Fd(e) {
  gt(e) || (e = String(e));
  const t = me(this);
  return (et(t, 'has', e), t.hasOwnProperty(e));
}
class Mc {
  constructor(t = !1, n = !1) {
    ((this._isReadonly = t), (this._isShallow = n));
  }
  get(t, n, r) {
    if (n === '__v_skip') return t.__v_skip;
    const s = this._isReadonly,
      o = this._isShallow;
    if (n === '__v_isReactive') return !s;
    if (n === '__v_isReadonly') return s;
    if (n === '__v_isShallow') return o;
    if (n === '__v_raw')
      return r === (s ? (o ? Kd : $c) : o ? Hc : Vc).get(t) || Object.getPrototypeOf(t) === Object.getPrototypeOf(r)
        ? t
        : void 0;
    const i = Z(t);
    if (!s) {
      let l;
      if (i && (l = Dd[n])) return l;
      if (n === 'hasOwnProperty') return Fd;
    }
    const a = Reflect.get(t, n, Pe(t) ? t : r);
    if ((gt(n) ? Fc.has(n) : kd(n)) || (s || et(t, 'get', n), o)) return a;
    if (Pe(a)) {
      const l = i && js(n) ? a : a.value;
      return s && Ee(l) ? Fr(l) : l;
    }
    return Ee(a) ? (s ? Fr(a) : qr(a)) : a;
  }
}
class Uc extends Mc {
  constructor(t = !1) {
    super(!1, t);
  }
  set(t, n, r, s) {
    let o = t[n];
    const i = Z(t) && js(n);
    if (!this._isShallow) {
      const c = Zt(o);
      if ((!pt(r) && !Zt(r) && ((o = me(o)), (r = me(r))), !i && Pe(o) && !Pe(r))) return (c || (o.value = r), !0);
    }
    const a = i ? Number(n) < t.length : ve(t, n),
      l = Reflect.set(t, n, r, Pe(t) ? t : s);
    return (t === me(s) && (a ? qe(r, o) && Gt(t, 'set', n, r) : Gt(t, 'add', n, r)), l);
  }
  deleteProperty(t, n) {
    const r = ve(t, n);
    t[n];
    const s = Reflect.deleteProperty(t, n);
    return (s && r && Gt(t, 'delete', n, void 0), s);
  }
  has(t, n) {
    const r = Reflect.has(t, n);
    return ((!gt(n) || !Fc.has(n)) && et(t, 'has', n), r);
  }
  ownKeys(t) {
    return (et(t, 'iterate', Z(t) ? 'length' : Ln), Reflect.ownKeys(t));
  }
}
class Md extends Mc {
  constructor(t = !1) {
    super(!0, t);
  }
  set(t, n) {
    return !0;
  }
  deleteProperty(t, n) {
    return !0;
  }
}
const Ud = new Uc(),
  Vd = new Md(),
  Hd = new Uc(!0);
const Ko = e => e,
  ss = e => Reflect.getPrototypeOf(e);
function $d(e, t, n) {
  return function (...r) {
    const s = this.__v_raw,
      o = me(s),
      i = Wn(o),
      a = e === 'entries' || (e === Symbol.iterator && i),
      l = e === 'keys' && i,
      c = s[e](...r),
      u = n ? Ko : t ? qn : Ct;
    return (
      !t && et(o, 'iterate', l ? Go : Ln),
      Ve(Object.create(c), {
        next() {
          const { value: f, done: d } = c.next();
          return d ? { value: f, done: d } : { value: a ? [u(f[0]), u(f[1])] : u(f), done: d };
        }
      })
    );
  };
}
function os(e) {
  return function (...t) {
    return e === 'delete' ? !1 : e === 'clear' ? void 0 : this;
  };
}
function jd(e, t) {
  const n = {
    get(s) {
      const o = this.__v_raw,
        i = me(o),
        a = me(s);
      e || (qe(s, a) && et(i, 'get', s), et(i, 'get', a));
      const { has: l } = ss(i),
        c = t ? Ko : e ? qn : Ct;
      if (l.call(i, s)) return c(o.get(s));
      if (l.call(i, a)) return c(o.get(a));
      o !== i && o.get(s);
    },
    get size() {
      const s = this.__v_raw;
      return (!e && et(me(s), 'iterate', Ln), s.size);
    },
    has(s) {
      const o = this.__v_raw,
        i = me(o),
        a = me(s);
      return (e || (qe(s, a) && et(i, 'has', s), et(i, 'has', a)), s === a ? o.has(s) : o.has(s) || o.has(a));
    },
    forEach(s, o) {
      const i = this,
        a = i.__v_raw,
        l = me(a),
        c = t ? Ko : e ? qn : Ct;
      return (!e && et(l, 'iterate', Ln), a.forEach((u, f) => s.call(o, c(u), c(f), i)));
    }
  };
  return (
    Ve(
      n,
      e
        ? { add: os('add'), set: os('set'), delete: os('delete'), clear: os('clear') }
        : {
            add(s) {
              const o = me(this),
                i = ss(o),
                a = me(s),
                l = !t && !pt(s) && !Zt(s) ? a : s;
              return (
                i.has.call(o, l) ||
                  (qe(s, l) && i.has.call(o, s)) ||
                  (qe(a, l) && i.has.call(o, a)) ||
                  (o.add(l), Gt(o, 'add', l, l)),
                this
              );
            },
            set(s, o) {
              !t && !pt(o) && !Zt(o) && (o = me(o));
              const i = me(this),
                { has: a, get: l } = ss(i);
              let c = a.call(i, s);
              c || ((s = me(s)), (c = a.call(i, s)));
              const u = l.call(i, s);
              return (i.set(s, o), c ? qe(o, u) && Gt(i, 'set', s, o) : Gt(i, 'add', s, o), this);
            },
            delete(s) {
              const o = me(this),
                { has: i, get: a } = ss(o);
              let l = i.call(o, s);
              (l || ((s = me(s)), (l = i.call(o, s))), a && a.call(o, s));
              const c = o.delete(s);
              return (l && Gt(o, 'delete', s, void 0), c);
            },
            clear() {
              const s = me(this),
                o = s.size !== 0,
                i = s.clear();
              return (o && Gt(s, 'clear', void 0, void 0), i);
            }
          }
    ),
    ['keys', 'values', 'entries', Symbol.iterator].forEach(s => {
      n[s] = $d(s, e, t);
    }),
    n
  );
}
function Pi(e, t) {
  const n = jd(e, t);
  return (r, s, o) =>
    s === '__v_isReactive'
      ? !e
      : s === '__v_isReadonly'
        ? e
        : s === '__v_raw'
          ? r
          : Reflect.get(ve(n, s) && s in r ? n : r, s, o);
}
const Bd = { get: Pi(!1, !1) },
  Wd = { get: Pi(!1, !0) },
  Gd = { get: Pi(!0, !1) };
const Vc = new WeakMap(),
  Hc = new WeakMap(),
  $c = new WeakMap(),
  Kd = new WeakMap();
function qd(e) {
  switch (e) {
    case 'Object':
    case 'Array':
      return 1;
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return 2;
    default:
      return 0;
  }
}
function qr(e) {
  return Zt(e) ? e : Di(e, !1, Ud, Bd, Vc);
}
function jc(e) {
  return Di(e, !1, Hd, Wd, Hc);
}
function Fr(e) {
  return Di(e, !0, Vd, Gd, $c);
}
function Di(e, t, n, r, s) {
  if (!Ee(e) || (e.__v_raw && !(t && e.__v_isReactive)) || e.__v_skip || !Object.isExtensible(e)) return e;
  const o = s.get(e);
  if (o) return o;
  const i = qd(yd(e));
  if (i === 0) return e;
  const a = new Proxy(e, i === 2 ? r : n);
  return (s.set(e, a), a);
}
function Yt(e) {
  return Zt(e) ? Yt(e.__v_raw) : !!(e && e.__v_isReactive);
}
function Zt(e) {
  return !!(e && e.__v_isReadonly);
}
function pt(e) {
  return !!(e && e.__v_isShallow);
}
function Js(e) {
  return e ? !!e.__v_raw : !1;
}
function me(e) {
  const t = e && e.__v_raw;
  return t ? me(t) : e;
}
function xi(e) {
  return (!ve(e, '__v_skip') && Object.isExtensible(e) && Sc(e, '__v_skip', !0), e);
}
const Ct = e => (Ee(e) ? qr(e) : e),
  qn = e => (Ee(e) ? Fr(e) : e);
function Pe(e) {
  return e ? e.__v_isRef === !0 : !1;
}
function le(e) {
  return Bc(e, !1);
}
function zs(e) {
  return Bc(e, !0);
}
function Bc(e, t) {
  return Pe(e) ? e : new Yd(e, t);
}
class Yd {
  constructor(t, n) {
    ((this.dep = new Ys()),
      (this.__v_isRef = !0),
      (this.__v_isShallow = !1),
      (this._rawValue = n ? t : me(t)),
      (this._value = n ? t : Ct(t)),
      (this.__v_isShallow = n));
  }
  get value() {
    return (this.dep.track(), this._value);
  }
  set value(t) {
    const n = this._rawValue,
      r = this.__v_isShallow || pt(t) || Zt(t);
    ((t = r ? t : me(t)), qe(t, n) && ((this._rawValue = t), (this._value = r ? t : Ct(t)), this.dep.trigger()));
  }
}
function Xt(e) {
  return Pe(e) ? e.value : e;
}
const Xd = {
  get: (e, t, n) => (t === '__v_raw' ? e : Xt(Reflect.get(e, t, n))),
  set: (e, t, n, r) => {
    const s = e[t];
    return Pe(s) && !Pe(n) ? ((s.value = n), !0) : Reflect.set(e, t, n, r);
  }
};
function Wc(e) {
  return Yt(e) ? e : new Proxy(e, Xd);
}
class Jd {
  constructor(t) {
    ((this.__v_isRef = !0), (this._value = void 0));
    const n = (this.dep = new Ys()),
      { get: r, set: s } = t(n.track.bind(n), n.trigger.bind(n));
    ((this._get = r), (this._set = s));
  }
  get value() {
    return (this._value = this._get());
  }
  set value(t) {
    this._set(t);
  }
}
function Gc(e) {
  return new Jd(e);
}
function zd(e) {
  const t = Z(e) ? new Array(e.length) : {};
  for (const n in e) t[n] = Kc(e, n);
  return t;
}
class Qd {
  constructor(t, n, r) {
    ((this._object = t),
      (this._defaultValue = r),
      (this.__v_isRef = !0),
      (this._value = void 0),
      (this._key = gt(n) ? n : String(n)),
      (this._raw = me(t)));
    let s = !0,
      o = t;
    if (!Z(t) || gt(this._key) || !js(this._key))
      do s = !Js(o) || pt(o);
      while (s && (o = o.__v_raw));
    this._shallow = s;
  }
  get value() {
    let t = this._object[this._key];
    return (this._shallow && (t = Xt(t)), (this._value = t === void 0 ? this._defaultValue : t));
  }
  set value(t) {
    if (this._shallow && Pe(this._raw[this._key])) {
      const n = this._object[this._key];
      if (Pe(n)) {
        n.value = t;
        return;
      }
    }
    this._object[this._key] = t;
  }
  get dep() {
    return Pd(this._raw, this._key);
  }
}
class Zd {
  constructor(t) {
    ((this._getter = t), (this.__v_isRef = !0), (this.__v_isReadonly = !0), (this._value = void 0));
  }
  get value() {
    return (this._value = this._getter());
  }
}
function eh(e, t, n) {
  return Pe(e) ? e : oe(e) ? new Zd(e) : Ee(e) && arguments.length > 1 ? Kc(e, t, n) : le(e);
}
function Kc(e, t, n) {
  return new Qd(e, t, n);
}
class th {
  constructor(t, n, r) {
    ((this.fn = t),
      (this.setter = n),
      (this._value = void 0),
      (this.dep = new Ys(this)),
      (this.__v_isRef = !0),
      (this.deps = void 0),
      (this.depsTail = void 0),
      (this.flags = 16),
      (this.globalVersion = xr - 1),
      (this.next = void 0),
      (this.effect = this),
      (this.__v_isReadonly = !n),
      (this.isSSR = r));
  }
  notify() {
    if (((this.flags |= 16), !(this.flags & 8) && Oe !== this)) return (Nc(this, !0), !0);
  }
  get value() {
    const t = this.dep.track();
    return (Dc(this), t && (t.version = this.dep.version), this._value);
  }
  set value(t) {
    this.setter && this.setter(t);
  }
}
function nh(e, t, n = !1) {
  let r, s;
  return (oe(e) ? (r = e) : ((r = e.get), (s = e.set)), new th(r, s, n));
}
const is = {},
  As = new WeakMap();
let wn;
function rh(e, t = !1, n = wn) {
  if (n) {
    let r = As.get(n);
    (r || As.set(n, (r = [])), r.push(e));
  }
}
function sh(e, t, n = _e) {
  const { immediate: r, deep: s, once: o, scheduler: i, augmentJob: a, call: l } = n,
    c = g => (s ? g : pt(g) || s === !1 || s === 0 ? Kt(g, 1) : Kt(g));
  let u,
    f,
    d,
    h,
    p = !1,
    y = !1;
  if (
    (Pe(e)
      ? ((f = () => e.value), (p = pt(e)))
      : Yt(e)
        ? ((f = () => c(e)), (p = !0))
        : Z(e)
          ? ((y = !0),
            (p = e.some(g => Yt(g) || pt(g))),
            (f = () =>
              e.map(g => {
                if (Pe(g)) return g.value;
                if (Yt(g)) return c(g);
                if (oe(g)) return l ? l(g, 2) : g();
              })))
          : oe(e)
            ? t
              ? (f = l ? () => l(e, 2) : e)
              : (f = () => {
                  if (d) {
                    zt();
                    try {
                      d();
                    } finally {
                      Qt();
                    }
                  }
                  const g = wn;
                  wn = u;
                  try {
                    return l ? l(e, 3, [h]) : e(h);
                  } finally {
                    wn = g;
                  }
                })
            : (f = Ft),
    t && s)
  ) {
    const g = f,
      C = s === !0 ? 1 / 0 : s;
    f = () => Kt(g(), C);
  }
  const S = Ci(),
    A = () => {
      (u.stop(), S && S.active && Ti(S.effects, u));
    };
  if (o && t) {
    const g = t;
    t = (...C) => {
      const I = g(...C);
      return (A(), I);
    };
  }
  let T = y ? new Array(e.length).fill(is) : is;
  const E = g => {
    if (!(!(u.flags & 1) || (!u.dirty && !g)))
      if (t) {
        const C = u.run();
        if (g || s || p || (y ? C.some((I, D) => qe(I, T[D])) : qe(C, T))) {
          d && d();
          const I = wn;
          wn = u;
          try {
            const D = [C, T === is ? void 0 : y && T[0] === is ? [] : T, h];
            ((T = C), l ? l(t, 3, D) : t(...D));
          } finally {
            wn = I;
          }
        }
      } else u.run();
  };
  return (
    a && a(E),
    (u = new Cc(f)),
    (u.scheduler = i ? () => i(E, !1) : E),
    (h = g => rh(g, !1, u)),
    (d = u.onStop =
      () => {
        const g = As.get(u);
        if (g) {
          if (l) l(g, 4);
          else for (const C of g) C();
          As.delete(u);
        }
      }),
    t ? (r ? E(!0) : (T = u.run())) : i ? i(E.bind(null, !0), !0) : u.run(),
    (A.pause = u.pause.bind(u)),
    (A.resume = u.resume.bind(u)),
    (A.stop = A),
    A
  );
}
function Kt(e, t = 1 / 0, n) {
  if (t <= 0 || !Ee(e) || e.__v_skip || ((n = n || new Map()), (n.get(e) || 0) >= t)) return e;
  if ((n.set(e, t), t--, Pe(e))) Kt(e.value, t, n);
  else if (Z(e)) for (let r = 0; r < e.length; r++) Kt(e[r], t, n);
  else if (sr(e) || Wn(e))
    e.forEach(r => {
      Kt(r, t, n);
    });
  else if (vc(e)) {
    for (const r in e) Kt(e[r], t, n);
    for (const r of Object.getOwnPropertySymbols(e)) Object.prototype.propertyIsEnumerable.call(e, r) && Kt(e[r], t, n);
  }
  return e;
}
/**
 * @vue/runtime-core v3.5.38
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/ function Yr(e, t, n, r) {
  try {
    return r ? e(...r) : e();
  } catch (s) {
    Xr(s, t, n);
  }
}
function St(e, t, n, r) {
  if (oe(e)) {
    const s = Yr(e, t, n, r);
    return (
      s &&
        Ec(s) &&
        s.catch(o => {
          Xr(o, t, n);
        }),
      s
    );
  }
  if (Z(e)) {
    const s = [];
    for (let o = 0; o < e.length; o++) s.push(St(e[o], t, n, r));
    return s;
  }
}
function Xr(e, t, n, r = !0) {
  const s = t ? t.vnode : null,
    { errorHandler: o, throwUnhandledErrorInProduction: i } = (t && t.appContext.config) || _e;
  if (t) {
    let a = t.parent;
    const l = t.proxy,
      c = `https://vuejs.org/error-reference/#runtime-${n}`;
    for (; a; ) {
      const u = a.ec;
      if (u) {
        for (let f = 0; f < u.length; f++) if (u[f](e, l, c) === !1) return;
      }
      a = a.parent;
    }
    if (o) {
      (zt(), Yr(o, null, 10, [e, l, c]), Qt());
      return;
    }
  }
  oh(e, n, s, r, i);
}
function oh(e, t, n, r = !0, s = !1) {
  if (s) throw e;
  console.error(e);
}
const lt = [];
let Pt = -1;
const Kn = [];
let cn = null,
  Vn = 0;
const qc = Promise.resolve();
let Ts = null;
function ar(e) {
  const t = Ts || qc;
  return e ? t.then(this ? e.bind(this) : e) : t;
}
function ih(e) {
  let t = Pt + 1,
    n = lt.length;
  for (; t < n; ) {
    const r = (t + n) >>> 1,
      s = lt[r],
      o = Mr(s);
    o < e || (o === e && s.flags & 2) ? (t = r + 1) : (n = r);
  }
  return t;
}
function ki(e) {
  if (!(e.flags & 1)) {
    const t = Mr(e),
      n = lt[lt.length - 1];
    (!n || (!(e.flags & 2) && t >= Mr(n)) ? lt.push(e) : lt.splice(ih(t), 0, e), (e.flags |= 1), Yc());
  }
}
function Yc() {
  Ts || (Ts = qc.then(Jc));
}
function ah(e) {
  (Z(e) ? Kn.push(...e) : cn && e.id === -1 ? cn.splice(Vn + 1, 0, e) : e.flags & 1 || (Kn.push(e), (e.flags |= 1)),
    Yc());
}
function pa(e, t, n = Pt + 1) {
  for (; n < lt.length; n++) {
    const r = lt[n];
    if (r && r.flags & 2) {
      if (e && r.id !== e.uid) continue;
      (lt.splice(n, 1), n--, r.flags & 4 && (r.flags &= -2), r(), r.flags & 4 || (r.flags &= -2));
    }
  }
}
function Xc(e) {
  if (Kn.length) {
    const t = [...new Set(Kn)].sort((n, r) => Mr(n) - Mr(r));
    if (((Kn.length = 0), cn)) {
      cn.push(...t);
      return;
    }
    for (cn = t, Vn = 0; Vn < cn.length; Vn++) {
      const n = cn[Vn];
      (n.flags & 4 && (n.flags &= -2), n.flags & 8 || n(), (n.flags &= -2));
    }
    ((cn = null), (Vn = 0));
  }
}
const Mr = e => (e.id == null ? (e.flags & 2 ? -1 : 1 / 0) : e.id);
function Jc(e) {
  try {
    for (Pt = 0; Pt < lt.length; Pt++) {
      const t = lt[Pt];
      t &&
        !(t.flags & 8) &&
        (t.flags & 4 && (t.flags &= -2), Yr(t, t.i, t.i ? 15 : 14), t.flags & 4 || (t.flags &= -2));
    }
  } finally {
    for (; Pt < lt.length; Pt++) {
      const t = lt[Pt];
      t && (t.flags &= -2);
    }
    ((Pt = -1), (lt.length = 0), Xc(), (Ts = null), (lt.length || Kn.length) && Jc());
  }
}
let ze = null,
  zc = null;
function ws(e) {
  const t = ze;
  return ((ze = e), (zc = (e && e.type.__scopeId) || null), t);
}
function lh(e, t = ze, n) {
  if (!t || e._n) return e;
  const r = (...s) => {
    r._d && Ps(-1);
    const o = ws(t);
    let i;
    try {
      i = e(...s);
    } finally {
      (ws(o), r._d && Ps(1));
    }
    return i;
  };
  return ((r._n = !0), (r._c = !0), (r._d = !0), r);
}
function fv(e, t) {
  if (ze === null) return e;
  const n = no(ze),
    r = e.dirs || (e.dirs = []);
  for (let s = 0; s < t.length; s++) {
    let [o, i, a, l = _e] = t[s];
    o &&
      (oe(o) && (o = { mounted: o, updated: o }),
      o.deep && Kt(i),
      r.push({ dir: o, instance: n, value: i, oldValue: void 0, arg: a, modifiers: l }));
  }
  return e;
}
function En(e, t, n, r) {
  const s = e.dirs,
    o = t && t.dirs;
  for (let i = 0; i < s.length; i++) {
    const a = s[i];
    o && (a.oldValue = o[i].value);
    let l = a.dir[r];
    l && (zt(), St(l, n, 8, [e.el, a, e, t]), Qt());
  }
}
function ms(e, t) {
  if (Xe) {
    let n = Xe.provides;
    const r = Xe.parent && Xe.parent.provides;
    (r === n && (n = Xe.provides = Object.create(r)), (n[e] = t));
  }
}
function mt(e, t, n = !1) {
  const r = At();
  if (r || Nn) {
    let s = Nn
      ? Nn._context.provides
      : r
        ? r.parent == null || r.ce
          ? r.vnode.appContext && r.vnode.appContext.provides
          : r.parent.provides
        : void 0;
    if (s && e in s) return s[e];
    if (arguments.length > 1) return n && oe(t) ? t.call(r && r.proxy) : t;
  }
}
function ch() {
  return !!(At() || Nn);
}
const uh = Symbol.for('v-scx'),
  fh = () => mt(uh);
function Qc(e, t) {
  return Qs(e, null, t);
}
function dh(e, t) {
  return Qs(e, null, { flush: 'sync' });
}
function vt(e, t, n) {
  return Qs(e, t, n);
}
function Qs(e, t, n = _e) {
  const { immediate: r, deep: s, flush: o, once: i } = n,
    a = Ve({}, n),
    l = (t && r) || (!t && o !== 'post');
  let c;
  if (Jn) {
    if (o === 'sync') {
      const h = fh();
      c = h.__watcherHandles || (h.__watcherHandles = []);
    } else if (!l) {
      const h = () => {};
      return ((h.stop = Ft), (h.resume = Ft), (h.pause = Ft), h);
    }
  }
  const u = Xe;
  a.call = (h, p, y) => St(h, u, p, y);
  let f = !1;
  (o === 'post'
    ? (a.scheduler = h => {
        je(h, u && u.suspense);
      })
    : o !== 'sync' &&
      ((f = !0),
      (a.scheduler = (h, p) => {
        p ? h() : ki(h);
      })),
    (a.augmentJob = h => {
      (t && (h.flags |= 4), f && ((h.flags |= 2), u && ((h.id = u.uid), (h.i = u))));
    }));
  const d = sh(e, t, a);
  return (Jn && (c ? c.push(d) : l && d()), d);
}
function hh(e, t, n) {
  const r = this.proxy,
    s = Ce(e) ? (e.includes('.') ? Zc(r, e) : () => r[e]) : e.bind(r, r);
  let o;
  oe(t) ? (o = t) : ((o = t.handler), (n = t));
  const i = Qr(this),
    a = Qs(s, o.bind(r), n);
  return (i(), a);
}
function Zc(e, t) {
  const n = t.split('.');
  return () => {
    let r = e;
    for (let s = 0; s < n.length && r; s++) r = r[n[s]];
    return r;
  };
}
const an = new WeakMap(),
  eu = Symbol('_vte'),
  tu = e => e.__isTeleport,
  On = e => e && (e.disabled || e.disabled === ''),
  ph = e => e && (e.defer || e.defer === ''),
  ma = e => typeof SVGElement < 'u' && e instanceof SVGElement,
  ga = e => typeof MathMLElement == 'function' && e instanceof MathMLElement,
  qo = (e, t) => {
    const n = e && e.to;
    return Ce(n) ? (t ? t(n) : null) : n;
  },
  mh = {
    name: 'Teleport',
    __isTeleport: !0,
    process(e, t, n, r, s, o, i, a, l, c) {
      const {
          mc: u,
          pc: f,
          pbc: d,
          o: { insert: h, querySelector: p, createText: y, createComment: S, parentNode: A }
        } = c,
        T = On(t.props);
      let { dynamicChildren: E } = t;
      const g = (D, F, P) => {
          D.shapeFlag & 16 && u(D.children, F, P, s, o, i, a, l);
        },
        C = (D = t) => {
          const F = On(D.props),
            P = (D.target = qo(D.props, p)),
            H = Yo(P, D, y, h);
          P &&
            (i !== 'svg' && ma(P) ? (i = 'svg') : i !== 'mathml' && ga(P) && (i = 'mathml'),
            s && s.isCE && (s.ce._teleportTargets || (s.ce._teleportTargets = new Set())).add(P),
            F || (g(D, P, H), vr(D, !1)));
        },
        I = D => {
          const F = () => {
            if (an.get(D) === F) {
              if ((an.delete(D), On(D.props))) {
                const P = A(D.el) || n;
                (g(D, P, D.anchor), vr(D, !0));
              }
              C(D);
            }
          };
          (an.set(D, F), je(F, o));
        };
      if (e == null) {
        const D = (t.el = y('')),
          F = (t.anchor = y(''));
        if ((h(D, n, r), h(F, n, r), ph(t.props) || (o && o.pendingBranch))) {
          I(t);
          return;
        }
        (T && (g(t, n, F), vr(t, !0)), C());
      } else {
        t.el = e.el;
        const D = (t.anchor = e.anchor),
          F = an.get(e);
        if (F) {
          ((F.flags |= 8), an.delete(e), I(t));
          return;
        }
        t.targetStart = e.targetStart;
        const P = (t.target = e.target),
          H = (t.targetAnchor = e.targetAnchor),
          W = On(e.props),
          M = W ? n : P,
          z = W ? D : H;
        if (
          (i === 'svg' || ma(P) ? (i = 'svg') : (i === 'mathml' || ga(P)) && (i = 'mathml'),
          E ? (d(e.dynamicChildren, E, M, s, o, i, a), Hi(e, t, !0)) : l || f(e, t, M, z, s, o, i, a, !1),
          T)
        )
          W ? t.props && e.props && t.props.to !== e.props.to && (t.props.to = e.props.to) : as(t, n, D, c, 1);
        else if ((t.props && t.props.to) !== (e.props && e.props.to)) {
          const ie = (t.target = qo(t.props, p));
          ie && as(t, ie, null, c, 0);
        } else W && as(t, P, H, c, 1);
        vr(t, T);
      }
    },
    remove(e, t, n, { um: r, o: { remove: s } }, o) {
      const { shapeFlag: i, children: a, anchor: l, targetStart: c, targetAnchor: u, target: f, props: d } = e,
        h = o || !On(d),
        p = an.get(e);
      if ((p && ((p.flags |= 8), an.delete(e)), f && (s(c), s(u)), o && s(l), !p && i & 16))
        for (let y = 0; y < a.length; y++) {
          const S = a[y];
          r(S, t, n, h, !!S.dynamicChildren);
        }
    },
    move: as,
    hydrate: gh
  };
function as(e, t, n, { o: { insert: r }, m: s }, o = 2) {
  o === 0 && r(e.targetAnchor, t, n);
  const { el: i, anchor: a, shapeFlag: l, children: c, props: u } = e,
    f = o === 2;
  if ((f && r(i, t, n), !an.has(e) && (!f || On(u)) && l & 16)) for (let d = 0; d < c.length; d++) s(c[d], t, n, 2);
  f && r(a, t, n);
}
function gh(e, t, n, r, s, o, { o: { nextSibling: i, parentNode: a, querySelector: l, insert: c, createText: u } }, f) {
  function d(S, A) {
    let T = A;
    for (; T; ) {
      if (T && T.nodeType === 8) {
        if (T.data === 'teleport start anchor') t.targetStart = T;
        else if (T.data === 'teleport anchor') {
          ((t.targetAnchor = T), (S._lpa = t.targetAnchor && i(t.targetAnchor)));
          break;
        }
      }
      T = i(T);
    }
  }
  function h(S, A) {
    A.anchor = f(i(S), A, a(S), n, r, s, o);
  }
  const p = (t.target = qo(t.props, l)),
    y = On(t.props);
  if (p) {
    const S = p._lpa || p.firstChild;
    (t.shapeFlag & 16 &&
      (y
        ? (h(e, t), d(p, S), t.targetAnchor || Yo(p, t, u, c, a(e) === p ? e : null))
        : ((t.anchor = i(e)), d(p, S), t.targetAnchor || Yo(p, t, u, c), f(S && i(S), t, p, n, r, s, o))),
      vr(t, y));
  } else y && t.shapeFlag & 16 && (h(e, t), (t.targetStart = e), (t.targetAnchor = i(e)));
  return t.anchor && i(t.anchor);
}
const dv = mh;
function vr(e, t) {
  const n = e.ctx;
  if (n && n.ut) {
    let r, s;
    for (t ? ((r = e.el), (s = e.anchor)) : ((r = e.targetStart), (s = e.targetAnchor)); r && r !== s; )
      (r.nodeType === 1 && r.setAttribute('data-v-owner', n.uid), (r = r.nextSibling));
    n.ut();
  }
}
function Yo(e, t, n, r, s = null) {
  const o = (t.targetStart = n('')),
    i = (t.targetAnchor = n(''));
  return ((o[eu] = i), e && (r(o, e, s), r(i, e, s)), i);
}
const Et = Symbol('_leaveCb'),
  pr = Symbol('_enterCb');
function _h() {
  const e = { isMounted: !1, isLeaving: !1, isUnmounting: !1, leavingVNodes: new Map() };
  return (
    lr(() => {
      e.isMounted = !0;
    }),
    Mi(() => {
      e.isUnmounting = !0;
    }),
    e
  );
}
const _t = [Function, Array],
  nu = {
    mode: String,
    appear: Boolean,
    persisted: Boolean,
    onBeforeEnter: _t,
    onEnter: _t,
    onAfterEnter: _t,
    onEnterCancelled: _t,
    onBeforeLeave: _t,
    onLeave: _t,
    onAfterLeave: _t,
    onLeaveCancelled: _t,
    onBeforeAppear: _t,
    onAppear: _t,
    onAfterAppear: _t,
    onAppearCancelled: _t
  },
  ru = e => {
    const t = e.subTree;
    return t.component ? ru(t.component) : t;
  },
  yh = {
    name: 'BaseTransition',
    props: nu,
    setup(e, { slots: t }) {
      const n = At(),
        r = _h();
      return () => {
        const s = t.default && iu(t.default(), !0),
          o = s && s.length ? su(s) : n.subTree ? ap() : void 0;
        if (!o) return;
        const i = me(e),
          { mode: a } = i;
        if (r.isLeaving) return So(o);
        const l = _a(o);
        if (!l) return So(o);
        let c = Xo(l, i, r, n, f => (c = f));
        l.type !== Ye && Yn(l, c);
        let u = n.subTree && _a(n.subTree);
        if (u && u.type !== Ye && !fn(u, l) && ru(n).type !== Ye) {
          let f = Xo(u, i, r, n);
          if ((Yn(u, f), a === 'out-in' && l.type !== Ye))
            return (
              (r.isLeaving = !0),
              (f.afterLeave = () => {
                ((r.isLeaving = !1), n.job.flags & 8 || n.update(), delete f.afterLeave, (u = void 0));
              }),
              So(o)
            );
          a === 'in-out' && l.type !== Ye
            ? (f.delayLeave = (d, h, p) => {
                const y = ou(r, u);
                ((y[String(u.key)] = u),
                  (d[Et] = () => {
                    (h(), (d[Et] = void 0), delete c.delayedLeave, (u = void 0));
                  }),
                  (c.delayedLeave = () => {
                    (p(), delete c.delayedLeave, (u = void 0));
                  }));
              })
            : (u = void 0);
        } else u && (u = void 0);
        return o;
      };
    }
  };
function su(e) {
  let t = e[0];
  if (e.length > 1) {
    for (const n of e)
      if (n.type !== Ye) {
        t = n;
        break;
      }
  }
  return t;
}
const Eh = yh;
function ou(e, t) {
  const { leavingVNodes: n } = e;
  let r = n.get(t.type);
  return (r || ((r = Object.create(null)), n.set(t.type, r)), r);
}
function Xo(e, t, n, r, s) {
  const {
      appear: o,
      mode: i,
      persisted: a = !1,
      onBeforeEnter: l,
      onEnter: c,
      onAfterEnter: u,
      onEnterCancelled: f,
      onBeforeLeave: d,
      onLeave: h,
      onAfterLeave: p,
      onLeaveCancelled: y,
      onBeforeAppear: S,
      onAppear: A,
      onAfterAppear: T,
      onAppearCancelled: E
    } = t,
    g = String(e.key),
    C = ou(n, e),
    I = (P, H) => {
      P && St(P, r, 9, H);
    },
    D = (P, H) => {
      const W = H[1];
      (I(P, H), Z(P) ? P.every(M => M.length <= 1) && W() : P.length <= 1 && W());
    },
    F = {
      mode: i,
      persisted: a,
      beforeEnter(P) {
        let H = l;
        if (!n.isMounted)
          if (o) H = S || l;
          else return;
        P[Et] && P[Et](!0);
        const W = C[g];
        (W && fn(e, W) && W.el[Et] && W.el[Et](), I(H, [P]));
      },
      enter(P) {
        if (C[g] === e) return;
        let H = c,
          W = u,
          M = f;
        if (!n.isMounted)
          if (o) ((H = A || c), (W = T || u), (M = E || f));
          else return;
        let z = !1;
        P[pr] = Se => {
          z || ((z = !0), Se ? I(M, [P]) : I(W, [P]), F.delayedLeave && F.delayedLeave(), (P[pr] = void 0));
        };
        const ie = P[pr].bind(null, !1);
        H ? D(H, [P, ie]) : ie();
      },
      leave(P, H) {
        const W = String(e.key);
        if ((P[pr] && P[pr](!0), n.isUnmounting)) return H();
        I(d, [P]);
        let M = !1;
        P[Et] = ie => {
          M || ((M = !0), H(), ie ? I(y, [P]) : I(p, [P]), (P[Et] = void 0), C[W] === e && delete C[W]);
        };
        const z = P[Et].bind(null, !1);
        ((C[W] = e), h ? D(h, [P, z]) : z());
      },
      clone(P) {
        const H = Xo(P, t, n, r, s);
        return (s && s(H), H);
      }
    };
  return F;
}
function So(e) {
  if (Jr(e)) return ((e = en(e)), (e.children = null), e);
}
function _a(e) {
  if (!Jr(e)) return tu(e.type) && e.children ? su(e.children) : e;
  if (e.component) return e.component.subTree;
  const { shapeFlag: t, children: n } = e;
  if (n) {
    if (t & 16) return n[0];
    if (t & 32 && oe(n.default)) return n.default();
  }
}
function Yn(e, t) {
  e.shapeFlag & 6 && e.component
    ? ((e.transition = t), Yn(e.component.subTree, t))
    : e.shapeFlag & 128
      ? ((e.ssContent.transition = t.clone(e.ssContent)), (e.ssFallback.transition = t.clone(e.ssFallback)))
      : (e.transition = t);
}
function iu(e, t = !1, n) {
  let r = [],
    s = 0;
  for (let o = 0; o < e.length; o++) {
    let i = e[o];
    const a = n == null ? i.key : String(n) + String(i.key != null ? i.key : o);
    i.type === ct
      ? (i.patchFlag & 128 && s++, (r = r.concat(iu(i.children, t, a))))
      : (t || i.type !== Ye) && r.push(a != null ? en(i, { key: a }) : i);
  }
  if (s > 1) for (let o = 0; o < r.length; o++) r[o].patchFlag = -2;
  return r;
}
function kn(e, t) {
  return oe(e) ? Ve({ name: e.name }, t, { setup: e }) : e;
}
function Fi(e) {
  e.ids = [e.ids[0] + e.ids[2]++ + '-', 0, 0];
}
function ya(e, t) {
  let n;
  return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
const Os = new WeakMap();
function Cr(e, t, n, r, s = !1) {
  if (Z(e)) {
    e.forEach((y, S) => Cr(y, t && (Z(t) ? t[S] : t), n, r, s));
    return;
  }
  if (hn(r) && !s) {
    r.shapeFlag & 512 && r.type.__asyncResolved && r.component.subTree.component && Cr(e, t, n, r.component.subTree);
    return;
  }
  const o = r.shapeFlag & 4 ? no(r.component) : r.el,
    i = s ? null : o,
    { i: a, r: l } = e,
    c = t && t.r,
    u = a.refs === _e ? (a.refs = {}) : a.refs,
    f = a.setupState,
    d = me(f),
    h = f === _e ? yc : y => (ya(u, y) ? !1 : ve(d, y)),
    p = (y, S) => !(S && ya(u, S));
  if (c != null && c !== l) {
    if ((Ea(t), Ce(c))) ((u[c] = null), h(c) && (f[c] = null));
    else if (Pe(c)) {
      const y = t;
      (p(c, y.k) && (c.value = null), y.k && (u[y.k] = null));
    }
  }
  if (oe(l)) Yr(l, a, 12, [i, u]);
  else {
    const y = Ce(l),
      S = Pe(l);
    if (y || S) {
      const A = () => {
        if (e.f) {
          const T = y ? (h(l) ? f[l] : u[l]) : p() || !e.k ? l.value : u[e.k];
          if (s) Z(T) && Ti(T, o);
          else if (Z(T)) T.includes(o) || T.push(o);
          else if (y) ((u[l] = [o]), h(l) && (f[l] = u[l]));
          else {
            const E = [o];
            (p(l, e.k) && (l.value = E), e.k && (u[e.k] = E));
          }
        } else y ? ((u[l] = i), h(l) && (f[l] = i)) : S && (p(l, e.k) && (l.value = i), e.k && (u[e.k] = i));
      };
      if (i) {
        const T = () => {
          (A(), Os.delete(e));
        };
        ((T.id = -1), Os.set(e, T), je(T, n));
      } else (Ea(e), A());
    }
  }
}
function Ea(e) {
  const t = Os.get(e);
  t && ((t.flags |= 8), Os.delete(e));
}
const ba = e => e.nodeType === 8;
Ks().requestIdleCallback;
Ks().cancelIdleCallback;
function bh(e, t) {
  if (ba(e) && e.data === '[') {
    let n = 1,
      r = e.nextSibling;
    for (; r; ) {
      if (r.nodeType === 1) {
        if (t(r) === !1) break;
      } else if (ba(r))
        if (r.data === ']') {
          if (--n === 0) break;
        } else r.data === '[' && n++;
      r = r.nextSibling;
    }
  } else t(e);
}
const hn = e => !!e.type.__asyncLoader;
function hv(e) {
  oe(e) && (e = { loader: e });
  const {
    loader: t,
    loadingComponent: n,
    errorComponent: r,
    delay: s = 200,
    hydrate: o,
    timeout: i,
    suspensible: a = !0,
    onError: l
  } = e;
  let c = null,
    u,
    f = 0;
  const d = () => (f++, (c = null), h()),
    h = () => {
      let p;
      return (
        c ||
        (p = c =
          t()
            .catch(y => {
              if (((y = y instanceof Error ? y : new Error(String(y))), l))
                return new Promise((S, A) => {
                  l(
                    y,
                    () => S(d()),
                    () => A(y),
                    f + 1
                  );
                });
              throw y;
            })
            .then(y =>
              p !== c && c
                ? c
                : (y && (y.__esModule || y[Symbol.toStringTag] === 'Module') && (y = y.default), (u = y), y)
            ))
      );
    };
  return kn({
    name: 'AsyncComponentWrapper',
    __asyncLoader: h,
    __asyncHydrate(p, y, S) {
      let A = !1;
      (y.bu || (y.bu = [])).push(() => (A = !0));
      const T = () => {
          A || S();
        },
        E = o
          ? () => {
              const g = o(T, C => bh(p, C));
              g && (y.bum || (y.bum = [])).push(g);
            }
          : T;
      u ? E() : h().then(() => !y.isUnmounted && E());
    },
    get __asyncResolved() {
      return u;
    },
    setup() {
      const p = Xe;
      if ((Fi(p), u)) return () => ls(u, p);
      const y = C => {
        ((c = null), Xr(C, p, 13, !r));
      };
      if ((a && p.suspense) || Jn)
        return h()
          .then(C => () => ls(C, p))
          .catch(C => (y(C), () => (r ? Ue(r, { error: C }) : null)));
      const S = le(!1),
        A = le(),
        T = le(!!s);
      let E, g;
      return (
        eo(() => {
          (E != null && clearTimeout(E), g != null && clearTimeout(g));
        }),
        s &&
          (g = setTimeout(() => {
            p.isUnmounted || (T.value = !1);
          }, s)),
        i != null &&
          (E = setTimeout(() => {
            if (!p.isUnmounted && !S.value && !A.value) {
              const C = new Error(`Async component timed out after ${i}ms.`);
              (y(C), (A.value = C));
            }
          }, i)),
        h()
          .then(() => {
            p.isUnmounted || ((S.value = !0), p.parent && Jr(p.parent.vnode) && p.parent.update());
          })
          .catch(C => {
            if (p.isUnmounted) {
              c = null;
              return;
            }
            (y(C), (A.value = C));
          }),
        () => {
          if (S.value && u) return ls(u, p);
          if (A.value && r) return Ue(r, { error: A.value });
          if (n && !T.value) return ls(n, p);
        }
      );
    }
  });
}
function ls(e, t) {
  const { ref: n, props: r, children: s, ce: o } = t.vnode,
    i = Ue(e, r, s);
  return ((i.ref = n), (i.ce = o), delete t.vnode.ce, i);
}
const Jr = e => e.type.__isKeepAlive,
  vh = {
    name: 'KeepAlive',
    __isKeepAlive: !0,
    props: { include: [String, RegExp, Array], exclude: [String, RegExp, Array], max: [String, Number] },
    setup(e, { slots: t }) {
      const n = At(),
        r = n.ctx;
      if (!r.renderer)
        return () => {
          const T = t.default && t.default();
          return T && T.length === 1 ? T[0] : T;
        };
      const s = new Map(),
        o = new Set();
      let i = null;
      const a = n.suspense,
        {
          renderer: {
            p: l,
            m: c,
            um: u,
            o: { createElement: f }
          }
        } = r,
        d = f('div');
      ((r.activate = (T, E, g, C, I) => {
        const D = T.component;
        (c(T, E, g, 0, a),
          l(D.vnode, T, E, g, D, a, C, T.slotScopeIds, I),
          je(() => {
            ((D.isDeactivated = !1), D.a && Gn(D.a));
            const F = T.props && T.props.onVnodeMounted;
            F && yt(F, D.parent, T);
          }, a));
      }),
        (r.deactivate = T => {
          const E = T.component;
          (Ls(E.m),
            Ls(E.a),
            c(T, d, null, 1, a),
            je(() => {
              E.da && Gn(E.da);
              const g = T.props && T.props.onVnodeUnmounted;
              (g && yt(g, E.parent, T), (E.isDeactivated = !0));
            }, a));
        }));
      function h(T) {
        (Ao(T), u(T, n, a, !0));
      }
      function p(T) {
        s.forEach((E, g) => {
          const C = ni(hn(E) ? E.type.__asyncResolved || {} : E.type);
          C && !T(C) && y(g);
        });
      }
      function y(T) {
        const E = s.get(T);
        (E && (!i || !fn(E, i)) ? h(E) : i && Ao(i), s.delete(T), o.delete(T));
      }
      vt(
        () => [e.include, e.exclude],
        ([T, E]) => {
          (T && p(g => Sr(T, g)), E && p(g => !Sr(E, g)));
        },
        { flush: 'post', deep: !0 }
      );
      let S = null;
      const A = () => {
        S != null &&
          (Ns(n.subTree.type)
            ? je(() => {
                s.set(S, cs(n.subTree));
              }, n.subTree.suspense)
            : s.set(S, cs(n.subTree)));
      };
      return (
        lr(A),
        cu(A),
        Mi(() => {
          s.forEach(T => {
            const { subTree: E, suspense: g } = n,
              C = cs(E);
            if (T.type === C.type && T.key === C.key) {
              Ao(C);
              const I = C.component.da;
              I && je(I, g);
              return;
            }
            h(T);
          });
        }),
        () => {
          if (((S = null), !t.default)) return (i = null);
          const T = t.default(),
            E = T[0];
          if (T.length > 1) return ((i = null), T);
          if (!Xn(E) || (!(E.shapeFlag & 4) && !(E.shapeFlag & 128))) return ((i = null), E);
          let g = cs(E);
          if (g.type === Ye) return ((i = null), g);
          const C = g.type,
            I = ni(hn(g) ? g.type.__asyncResolved || {} : C),
            { include: D, exclude: F, max: P } = e;
          if ((D && (!I || !Sr(D, I))) || (F && I && Sr(F, I))) return ((g.shapeFlag &= -257), (i = g), E);
          const H = g.key == null ? C : g.key,
            W = s.get(H);
          return (
            g.el && ((g = en(g)), E.shapeFlag & 128 && (E.ssContent = g)),
            (S = H),
            W
              ? ((g.el = W.el),
                (g.component = W.component),
                g.transition && Yn(g, g.transition),
                (g.shapeFlag |= 512),
                o.delete(H),
                o.add(H))
              : (o.add(H), P && o.size > parseInt(P, 10) && y(o.values().next().value)),
            (g.shapeFlag |= 256),
            (i = g),
            Ns(E.type) ? E : g
          );
        }
      );
    }
  },
  pv = vh;
function Sr(e, t) {
  return Z(e) ? e.some(n => Sr(n, t)) : Ce(e) ? e.split(',').includes(t) : _d(e) ? ((e.lastIndex = 0), e.test(t)) : !1;
}
function Sh(e, t) {
  au(e, 'a', t);
}
function Ah(e, t) {
  au(e, 'da', t);
}
function au(e, t, n = Xe) {
  const r =
    e.__wdc ||
    (e.__wdc = () => {
      let s = n;
      for (; s; ) {
        if (s.isDeactivated) return;
        s = s.parent;
      }
      return e();
    });
  if ((Zs(t, r, n), n)) {
    let s = n.parent;
    for (; s && s.parent; ) (Jr(s.parent.vnode) && Th(r, t, n, s), (s = s.parent));
  }
}
function Th(e, t, n, r) {
  const s = Zs(t, e, r, !0);
  eo(() => {
    Ti(r[t], s);
  }, n);
}
function Ao(e) {
  ((e.shapeFlag &= -257), (e.shapeFlag &= -513));
}
function cs(e) {
  return e.shapeFlag & 128 ? e.ssContent : e;
}
function Zs(e, t, n = Xe, r = !1) {
  if (n) {
    const s = n[e] || (n[e] = []),
      o =
        t.__weh ||
        (t.__weh = (...i) => {
          zt();
          const a = Qr(n),
            l = St(t, n, e, i);
          return (a(), Qt(), l);
        });
    return (r ? s.unshift(o) : s.push(o), o);
  }
}
const nn =
    e =>
    (t, n = Xe) => {
      (!Jn || e === 'sp') && Zs(e, (...r) => t(...r), n);
    },
  lu = nn('bm'),
  lr = nn('m'),
  wh = nn('bu'),
  cu = nn('u'),
  Mi = nn('bum'),
  eo = nn('um'),
  Oh = nn('sp'),
  Rh = nn('rtg'),
  Ch = nn('rtc');
function Lh(e, t = Xe) {
  Zs('ec', e, t);
}
const uu = 'components';
function Nh(e, t) {
  return du(uu, e, !0, t) || e;
}
const fu = Symbol.for('v-ndc');
function mv(e) {
  return Ce(e) ? du(uu, e, !1) || e : e || fu;
}
function du(e, t, n = !0, r = !1) {
  const s = ze || Xe;
  if (s) {
    const o = s.type;
    {
      const a = ni(o, !1);
      if (a && (a === t || a === tt(t) || a === Ws(tt(t)))) return o;
    }
    const i = va(s[e] || o[e], t) || va(s.appContext[e], t);
    return !i && r ? o : i;
  }
}
function va(e, t) {
  return e && (e[t] || e[tt(t)] || e[Ws(tt(t))]);
}
function gv(e, t, n, r) {
  let s;
  const o = n,
    i = Z(e);
  if (i || Ce(e)) {
    const a = i && Yt(e);
    let l = !1,
      c = !1;
    (a && ((l = !pt(e)), (c = Zt(e)), (e = Xs(e))), (s = new Array(e.length)));
    for (let u = 0, f = e.length; u < f; u++) s[u] = t(l ? (c ? qn(Ct(e[u])) : Ct(e[u])) : e[u], u, void 0, o);
  } else if (typeof e == 'number') {
    s = new Array(e);
    for (let a = 0; a < e; a++) s[a] = t(a + 1, a, void 0, o);
  } else if (Ee(e))
    if (e[Symbol.iterator]) s = Array.from(e, (a, l) => t(a, l, void 0, o));
    else {
      const a = Object.keys(e);
      s = new Array(a.length);
      for (let l = 0, c = a.length; l < c; l++) {
        const u = a[l];
        s[l] = t(e[u], u, l, o);
      }
    }
  else s = [];
  return s;
}
function _v(e, t, n = {}, r, s) {
  if (ze.ce || (ze.parent && hn(ze.parent) && ze.parent.ce)) {
    const c = Object.keys(n).length > 0;
    return (t !== 'default' && (n.name = t), Is(), ei(ct, null, [Ue('slot', n, r && r())], c ? -2 : 64));
  }
  let o = e[t];
  (o && o._c && (o._d = !1), Is());
  const i = o && hu(o(n)),
    a = n.key || (i && i.key),
    l = ei(
      ct,
      { key: (a && !gt(a) ? a : `_${t}`) + (!i && r ? '_fb' : '') },
      i || (r ? r() : []),
      i && e._ === 1 ? 64 : -2
    );
  return (o && o._c && (o._d = !0), l);
}
function hu(e) {
  return e.some(t => (Xn(t) ? !(t.type === Ye || (t.type === ct && !hu(t.children))) : !0)) ? e : null;
}
const Jo = e => (e ? (Pu(e) ? no(e) : Jo(e.parent)) : null),
  Lr = Ve(Object.create(null), {
    $: e => e,
    $el: e => e.vnode.el,
    $data: e => e.data,
    $props: e => e.props,
    $attrs: e => e.attrs,
    $slots: e => e.slots,
    $refs: e => e.refs,
    $parent: e => Jo(e.parent),
    $root: e => Jo(e.root),
    $host: e => e.ce,
    $emit: e => e.emit,
    $options: e => mu(e),
    $forceUpdate: e =>
      e.f ||
      (e.f = () => {
        ki(e.update);
      }),
    $nextTick: e => e.n || (e.n = ar.bind(e.proxy)),
    $watch: e => hh.bind(e)
  }),
  To = (e, t) => e !== _e && !e.__isScriptSetup && ve(e, t),
  Ih = {
    get({ _: e }, t) {
      if (t === '__v_skip') return !0;
      const { ctx: n, setupState: r, data: s, props: o, accessCache: i, type: a, appContext: l } = e;
      if (t[0] !== '$') {
        const d = i[t];
        if (d !== void 0)
          switch (d) {
            case 1:
              return r[t];
            case 2:
              return s[t];
            case 4:
              return n[t];
            case 3:
              return o[t];
          }
        else {
          if (To(r, t)) return ((i[t] = 1), r[t]);
          if (s !== _e && ve(s, t)) return ((i[t] = 2), s[t]);
          if (ve(o, t)) return ((i[t] = 3), o[t]);
          if (n !== _e && ve(n, t)) return ((i[t] = 4), n[t]);
          zo && (i[t] = 0);
        }
      }
      const c = Lr[t];
      let u, f;
      if (c) return (t === '$attrs' && et(e.attrs, 'get', ''), c(e));
      if ((u = a.__cssModules) && (u = u[t])) return u;
      if (n !== _e && ve(n, t)) return ((i[t] = 4), n[t]);
      if (((f = l.config.globalProperties), ve(f, t))) return f[t];
    },
    set({ _: e }, t, n) {
      const { data: r, setupState: s, ctx: o } = e;
      return To(s, t)
        ? ((s[t] = n), !0)
        : r !== _e && ve(r, t)
          ? ((r[t] = n), !0)
          : ve(e.props, t) || (t[0] === '$' && t.slice(1) in e)
            ? !1
            : ((o[t] = n), !0);
    },
    has({ _: { data: e, setupState: t, accessCache: n, ctx: r, appContext: s, props: o, type: i } }, a) {
      let l;
      return !!(
        n[a] ||
        (e !== _e && a[0] !== '$' && ve(e, a)) ||
        To(t, a) ||
        ve(o, a) ||
        ve(r, a) ||
        ve(Lr, a) ||
        ve(s.config.globalProperties, a) ||
        ((l = i.__cssModules) && l[a])
      );
    },
    defineProperty(e, t, n) {
      return (
        n.get != null ? (e._.accessCache[t] = 0) : ve(n, 'value') && this.set(e, t, n.value, null),
        Reflect.defineProperty(e, t, n)
      );
    }
  };
function Rs(e) {
  return Z(e) ? e.reduce((t, n) => ((t[n] = null), t), {}) : e;
}
function yv(e, t) {
  return !e || !t ? e || t : Z(e) && Z(t) ? e.concat(t) : Ve({}, Rs(e), Rs(t));
}
let zo = !0;
function Ph(e) {
  const t = mu(e),
    n = e.proxy,
    r = e.ctx;
  ((zo = !1), t.beforeCreate && Sa(t.beforeCreate, e, 'bc'));
  const {
    data: s,
    computed: o,
    methods: i,
    watch: a,
    provide: l,
    inject: c,
    created: u,
    beforeMount: f,
    mounted: d,
    beforeUpdate: h,
    updated: p,
    activated: y,
    deactivated: S,
    beforeDestroy: A,
    beforeUnmount: T,
    destroyed: E,
    unmounted: g,
    render: C,
    renderTracked: I,
    renderTriggered: D,
    errorCaptured: F,
    serverPrefetch: P,
    expose: H,
    inheritAttrs: W,
    components: M,
    directives: z,
    filters: ie
  } = t;
  if ((c && Dh(c, r, null), i))
    for (const te in i) {
      const de = i[te];
      oe(de) && (r[te] = de.bind(n));
    }
  if (s) {
    const te = s.call(n, n);
    Ee(te) && (e.data = qr(te));
  }
  if (((zo = !0), o))
    for (const te in o) {
      const de = o[te],
        Me = oe(de) ? de.bind(n, n) : oe(de.get) ? de.get.bind(n, n) : Ft,
        Le = !oe(de) && oe(de.set) ? de.set.bind(n) : Ft,
        ue = Ae({ get: Me, set: Le });
      Object.defineProperty(r, te, {
        enumerable: !0,
        configurable: !0,
        get: () => ue.value,
        set: pe => (ue.value = pe)
      });
    }
  if (a) for (const te in a) pu(a[te], r, n, te);
  if (l) {
    const te = oe(l) ? l.call(n) : l;
    Reflect.ownKeys(te).forEach(de => {
      ms(de, te[de]);
    });
  }
  u && Sa(u, e, 'c');
  function se(te, de) {
    Z(de) ? de.forEach(Me => te(Me.bind(n))) : de && te(de.bind(n));
  }
  if (
    (se(lu, f),
    se(lr, d),
    se(wh, h),
    se(cu, p),
    se(Sh, y),
    se(Ah, S),
    se(Lh, F),
    se(Ch, I),
    se(Rh, D),
    se(Mi, T),
    se(eo, g),
    se(Oh, P),
    Z(H))
  )
    if (H.length) {
      const te = e.exposed || (e.exposed = {});
      H.forEach(de => {
        Object.defineProperty(te, de, { get: () => n[de], set: Me => (n[de] = Me), enumerable: !0 });
      });
    } else e.exposed || (e.exposed = {});
  (C && e.render === Ft && (e.render = C),
    W != null && (e.inheritAttrs = W),
    M && (e.components = M),
    z && (e.directives = z),
    P && Fi(e));
}
function Dh(e, t, n = Ft) {
  Z(e) && (e = Qo(e));
  for (const r in e) {
    const s = e[r];
    let o;
    (Ee(s) ? ('default' in s ? (o = mt(s.from || r, s.default, !0)) : (o = mt(s.from || r))) : (o = mt(s)),
      Pe(o)
        ? Object.defineProperty(t, r, { enumerable: !0, configurable: !0, get: () => o.value, set: i => (o.value = i) })
        : (t[r] = o));
  }
}
function Sa(e, t, n) {
  St(Z(e) ? e.map(r => r.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function pu(e, t, n, r) {
  let s = r.includes('.') ? Zc(n, r) : () => n[r];
  if (Ce(e)) {
    const o = t[e];
    oe(o) && vt(s, o);
  } else if (oe(e)) vt(s, e.bind(n));
  else if (Ee(e))
    if (Z(e)) e.forEach(o => pu(o, t, n, r));
    else {
      const o = oe(e.handler) ? e.handler.bind(n) : t[e.handler];
      oe(o) && vt(s, o, e);
    }
}
function mu(e) {
  const t = e.type,
    { mixins: n, extends: r } = t,
    {
      mixins: s,
      optionsCache: o,
      config: { optionMergeStrategies: i }
    } = e.appContext,
    a = o.get(t);
  let l;
  return (
    a
      ? (l = a)
      : !s.length && !n && !r
        ? (l = t)
        : ((l = {}), s.length && s.forEach(c => Cs(l, c, i, !0)), Cs(l, t, i)),
    Ee(t) && o.set(t, l),
    l
  );
}
function Cs(e, t, n, r = !1) {
  const { mixins: s, extends: o } = t;
  (o && Cs(e, o, n, !0), s && s.forEach(i => Cs(e, i, n, !0)));
  for (const i in t)
    if (!(r && i === 'expose')) {
      const a = xh[i] || (n && n[i]);
      e[i] = a ? a(e[i], t[i]) : t[i];
    }
  return e;
}
const xh = {
  data: Aa,
  props: Ta,
  emits: Ta,
  methods: Ar,
  computed: Ar,
  beforeCreate: ot,
  created: ot,
  beforeMount: ot,
  mounted: ot,
  beforeUpdate: ot,
  updated: ot,
  beforeDestroy: ot,
  beforeUnmount: ot,
  destroyed: ot,
  unmounted: ot,
  activated: ot,
  deactivated: ot,
  errorCaptured: ot,
  serverPrefetch: ot,
  components: Ar,
  directives: Ar,
  watch: Fh,
  provide: Aa,
  inject: kh
};
function Aa(e, t) {
  return t
    ? e
      ? function () {
          return Ve(oe(e) ? e.call(this, this) : e, oe(t) ? t.call(this, this) : t);
        }
      : t
    : e;
}
function kh(e, t) {
  return Ar(Qo(e), Qo(t));
}
function Qo(e) {
  if (Z(e)) {
    const t = {};
    for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
    return t;
  }
  return e;
}
function ot(e, t) {
  return e ? [...new Set([].concat(e, t))] : t;
}
function Ar(e, t) {
  return e ? Ve(Object.create(null), e, t) : t;
}
function Ta(e, t) {
  return e ? (Z(e) && Z(t) ? [...new Set([...e, ...t])] : Ve(Object.create(null), Rs(e), Rs(t ?? {}))) : t;
}
function Fh(e, t) {
  if (!e) return t;
  if (!t) return e;
  const n = Ve(Object.create(null), e);
  for (const r in t) n[r] = ot(e[r], t[r]);
  return n;
}
function gu() {
  return {
    app: null,
    config: {
      isNativeTag: yc,
      performance: !1,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: Object.create(null),
    optionsCache: new WeakMap(),
    propsCache: new WeakMap(),
    emitsCache: new WeakMap()
  };
}
let Mh = 0;
function Uh(e, t) {
  return function (r, s = null) {
    (oe(r) || (r = Ve({}, r)), s != null && !Ee(s) && (s = null));
    const o = gu(),
      i = new WeakSet(),
      a = [];
    let l = !1;
    const c = (o.app = {
      _uid: Mh++,
      _component: r,
      _props: s,
      _container: null,
      _context: o,
      _instance: null,
      version: _p,
      get config() {
        return o.config;
      },
      set config(u) {},
      use(u, ...f) {
        return (i.has(u) || (u && oe(u.install) ? (i.add(u), u.install(c, ...f)) : oe(u) && (i.add(u), u(c, ...f))), c);
      },
      mixin(u) {
        return (o.mixins.includes(u) || o.mixins.push(u), c);
      },
      component(u, f) {
        return f ? ((o.components[u] = f), c) : o.components[u];
      },
      directive(u, f) {
        return f ? ((o.directives[u] = f), c) : o.directives[u];
      },
      mount(u, f, d) {
        if (!l) {
          const h = c._ceVNode || Ue(r, s);
          return (
            (h.appContext = o),
            d === !0 ? (d = 'svg') : d === !1 && (d = void 0),
            e(h, u, d),
            (l = !0),
            (c._container = u),
            (u.__vue_app__ = c),
            no(h.component)
          );
        }
      },
      onUnmount(u) {
        a.push(u);
      },
      unmount() {
        l && (St(a, c._instance, 16), e(null, c._container), delete c._container.__vue_app__);
      },
      provide(u, f) {
        return ((o.provides[u] = f), c);
      },
      runWithContext(u) {
        const f = Nn;
        Nn = c;
        try {
          return u();
        } finally {
          Nn = f;
        }
      }
    });
    return c;
  };
}
let Nn = null;
function Ev(e, t, n = _e) {
  const r = At(),
    s = tt(t),
    o = tn(t),
    i = _u(e, s),
    a = Gc((l, c) => {
      let u,
        f = _e,
        d;
      return (
        dh(() => {
          const h = e[s];
          qe(u, h) && ((u = h), c());
        }),
        {
          get() {
            return (l(), n.get ? n.get(u) : u);
          },
          set(h) {
            const p = n.set ? n.set(h) : h;
            if (!qe(p, u) && !(f !== _e && qe(h, f))) return;
            const y = r.vnode.props,
              S = !!(
                y &&
                (t in y || s in y || o in y) &&
                (`onUpdate:${t}` in y || `onUpdate:${s}` in y || `onUpdate:${o}` in y)
              );
            (S || ((u = h), c()),
              r.emit(`update:${t}`, p),
              qe(h, f) && ((qe(h, p) && !qe(p, d)) || (S && f !== _e && !qe(p, u))) && c(),
              (f = h),
              (d = p));
          }
        }
      );
    });
  return (
    (a[Symbol.iterator] = () => {
      let l = 0;
      return {
        next() {
          return l < 2 ? { value: l++ ? i || _e : a, done: !1 } : { done: !0 };
        }
      };
    }),
    a
  );
}
const _u = (e, t) =>
  t === 'modelValue' || t === 'model-value'
    ? e.modelModifiers
    : e[`${t}Modifiers`] || e[`${tt(t)}Modifiers`] || e[`${tn(t)}Modifiers`];
function Vh(e, t, ...n) {
  if (e.isUnmounted) return;
  const r = e.vnode.props || _e;
  let s = n;
  const o = t.startsWith('update:'),
    i = o && _u(r, t.slice(7));
  i && (i.trim && (s = n.map(u => (Ce(u) ? u.trim() : u))), i.number && (s = n.map(Gs)));
  let a,
    l = r[(a = _o(t))] || r[(a = _o(tt(t)))];
  (!l && o && (l = r[(a = _o(tn(t)))]), l && St(l, e, 6, s));
  const c = r[a + 'Once'];
  if (c) {
    if (!e.emitted) e.emitted = {};
    else if (e.emitted[a]) return;
    ((e.emitted[a] = !0), St(c, e, 6, s));
  }
}
const Hh = new WeakMap();
function yu(e, t, n = !1) {
  const r = n ? Hh : t.emitsCache,
    s = r.get(e);
  if (s !== void 0) return s;
  const o = e.emits;
  let i = {},
    a = !1;
  if (!oe(e)) {
    const l = c => {
      const u = yu(c, t, !0);
      u && ((a = !0), Ve(i, u));
    };
    (!n && t.mixins.length && t.mixins.forEach(l), e.extends && l(e.extends), e.mixins && e.mixins.forEach(l));
  }
  return !o && !a
    ? (Ee(e) && r.set(e, null), null)
    : (Z(o) ? o.forEach(l => (i[l] = null)) : Ve(i, o), Ee(e) && r.set(e, i), i);
}
function to(e, t) {
  return !e || !Hs(t)
    ? !1
    : ((t = t.slice(2).replace(/Once$/, '')), ve(e, t[0].toLowerCase() + t.slice(1)) || ve(e, tn(t)) || ve(e, t));
}
function wa(e) {
  const {
      type: t,
      vnode: n,
      proxy: r,
      withProxy: s,
      propsOptions: [o],
      slots: i,
      attrs: a,
      emit: l,
      render: c,
      renderCache: u,
      props: f,
      data: d,
      setupState: h,
      ctx: p,
      inheritAttrs: y
    } = e,
    S = ws(e);
  let A, T;
  try {
    if (n.shapeFlag & 4) {
      const g = s || r,
        C = g;
      ((A = xt(c.call(C, g, u, f, h, d, p))), (T = a));
    } else {
      const g = t;
      ((A = xt(g.length > 1 ? g(f, { attrs: a, slots: i, emit: l }) : g(f, null))), (T = t.props ? a : $h(a)));
    }
  } catch (g) {
    ((Nr.length = 0), Xr(g, e, 1), (A = Ue(Ye)));
  }
  let E = A;
  if (T && y !== !1) {
    const g = Object.keys(T),
      { shapeFlag: C } = E;
    g.length && C & 7 && (o && g.some($s) && (T = jh(T, o)), (E = en(E, T, !1, !0)));
  }
  return (
    n.dirs && ((E = en(E, null, !1, !0)), (E.dirs = E.dirs ? E.dirs.concat(n.dirs) : n.dirs)),
    n.transition && Yn(E, n.transition),
    (A = E),
    ws(S),
    A
  );
}
const $h = e => {
    let t;
    for (const n in e) (n === 'class' || n === 'style' || Hs(n)) && ((t || (t = {}))[n] = e[n]);
    return t;
  },
  jh = (e, t) => {
    const n = {};
    for (const r in e) (!$s(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
    return n;
  };
function Bh(e, t, n) {
  const { props: r, children: s, component: o } = e,
    { props: i, children: a, patchFlag: l } = t,
    c = o.emitsOptions;
  if (t.dirs || t.transition) return !0;
  if (n && l >= 0) {
    if (l & 1024) return !0;
    if (l & 16) return r ? Oa(r, i, c) : !!i;
    if (l & 8) {
      const u = t.dynamicProps;
      for (let f = 0; f < u.length; f++) {
        const d = u[f];
        if (Eu(i, r, d) && !to(c, d)) return !0;
      }
    }
  } else return (s || a) && (!a || !a.$stable) ? !0 : r === i ? !1 : r ? (i ? Oa(r, i, c) : !0) : !!i;
  return !1;
}
function Oa(e, t, n) {
  const r = Object.keys(t);
  if (r.length !== Object.keys(e).length) return !0;
  for (let s = 0; s < r.length; s++) {
    const o = r[s];
    if (Eu(t, e, o) && !to(n, o)) return !0;
  }
  return !1;
}
function Eu(e, t, n) {
  const r = e[n],
    s = t[n];
  return n === 'style' && Ee(r) && Ee(s) ? !ir(r, s) : r !== s;
}
function Wh({ vnode: e, parent: t, suspense: n }, r) {
  for (; t; ) {
    const s = t.subTree;
    if ((s.suspense && s.suspense.activeBranch === e && ((s.suspense.vnode.el = s.el = r), (e = s)), s === e))
      (((e = t.vnode).el = r), (t = t.parent));
    else break;
  }
  n && n.activeBranch === e && (n.vnode.el = r);
}
const bu = {},
  vu = () => Object.create(bu),
  Su = e => Object.getPrototypeOf(e) === bu;
function Gh(e, t, n, r = !1) {
  const s = {},
    o = vu();
  ((e.propsDefaults = Object.create(null)), Au(e, t, s, o));
  for (const i in e.propsOptions[0]) i in s || (s[i] = void 0);
  (n ? (e.props = r ? s : jc(s)) : e.type.props ? (e.props = s) : (e.props = o), (e.attrs = o));
}
function Kh(e, t, n, r) {
  const {
      props: s,
      attrs: o,
      vnode: { patchFlag: i }
    } = e,
    a = me(s),
    [l] = e.propsOptions;
  let c = !1;
  if ((r || i > 0) && !(i & 16)) {
    if (i & 8) {
      const u = e.vnode.dynamicProps;
      for (let f = 0; f < u.length; f++) {
        let d = u[f];
        if (to(e.emitsOptions, d)) continue;
        const h = t[d];
        if (l)
          if (ve(o, d)) h !== o[d] && ((o[d] = h), (c = !0));
          else {
            const p = tt(d);
            s[p] = Zo(l, a, p, h, e, !1);
          }
        else h !== o[d] && ((o[d] = h), (c = !0));
      }
    }
  } else {
    Au(e, t, s, o) && (c = !0);
    let u;
    for (const f in a)
      (!t || (!ve(t, f) && ((u = tn(f)) === f || !ve(t, u)))) &&
        (l ? n && (n[f] !== void 0 || n[u] !== void 0) && (s[f] = Zo(l, a, f, void 0, e, !0)) : delete s[f]);
    if (o !== a) for (const f in o) (!t || !ve(t, f)) && (delete o[f], (c = !0));
  }
  c && Gt(e.attrs, 'set', '');
}
function Au(e, t, n, r) {
  const [s, o] = e.propsOptions;
  let i = !1,
    a;
  if (t)
    for (let l in t) {
      if (wr(l)) continue;
      const c = t[l];
      let u;
      s && ve(s, (u = tt(l)))
        ? !o || !o.includes(u)
          ? (n[u] = c)
          : ((a || (a = {}))[u] = c)
        : to(e.emitsOptions, l) || ((!(l in r) || c !== r[l]) && ((r[l] = c), (i = !0)));
    }
  if (o) {
    const l = me(n),
      c = a || _e;
    for (let u = 0; u < o.length; u++) {
      const f = o[u];
      n[f] = Zo(s, l, f, c[f], e, !ve(c, f));
    }
  }
  return i;
}
function Zo(e, t, n, r, s, o) {
  const i = e[n];
  if (i != null) {
    const a = ve(i, 'default');
    if (a && r === void 0) {
      const l = i.default;
      if (i.type !== Function && !i.skipFactory && oe(l)) {
        const { propsDefaults: c } = s;
        if (n in c) r = c[n];
        else {
          const u = Qr(s);
          ((r = c[n] = l.call(null, t)), u());
        }
      } else r = l;
      s.ce && s.ce._setProp(n, r);
    }
    i[0] && (o && !a ? (r = !1) : i[1] && (r === '' || r === tn(n)) && (r = !0));
  }
  return r;
}
const qh = new WeakMap();
function Tu(e, t, n = !1) {
  const r = n ? qh : t.propsCache,
    s = r.get(e);
  if (s) return s;
  const o = e.props,
    i = {},
    a = [];
  let l = !1;
  if (!oe(e)) {
    const u = f => {
      l = !0;
      const [d, h] = Tu(f, t, !0);
      (Ve(i, d), h && a.push(...h));
    };
    (!n && t.mixins.length && t.mixins.forEach(u), e.extends && u(e.extends), e.mixins && e.mixins.forEach(u));
  }
  if (!o && !l) return (Ee(e) && r.set(e, Bn), Bn);
  if (Z(o))
    for (let u = 0; u < o.length; u++) {
      const f = tt(o[u]);
      Ra(f) && (i[f] = _e);
    }
  else if (o)
    for (const u in o) {
      const f = tt(u);
      if (Ra(f)) {
        const d = o[u],
          h = (i[f] = Z(d) || oe(d) ? { type: d } : Ve({}, d)),
          p = h.type;
        let y = !1,
          S = !0;
        if (Z(p))
          for (let A = 0; A < p.length; ++A) {
            const T = p[A],
              E = oe(T) && T.name;
            if (E === 'Boolean') {
              y = !0;
              break;
            } else E === 'String' && (S = !1);
          }
        else y = oe(p) && p.name === 'Boolean';
        ((h[0] = y), (h[1] = S), (y || ve(h, 'default')) && a.push(f));
      }
    }
  const c = [i, a];
  return (Ee(e) && r.set(e, c), c);
}
function Ra(e) {
  return e[0] !== '$' && !wr(e);
}
const Ui = e => e === '_' || e === '_ctx' || e === '$stable',
  Vi = e => (Z(e) ? e.map(xt) : [xt(e)]),
  Yh = (e, t, n) => {
    if (t._n) return t;
    const r = lh((...s) => Vi(t(...s)), n);
    return ((r._c = !1), r);
  },
  wu = (e, t, n) => {
    const r = e._ctx;
    for (const s in e) {
      if (Ui(s)) continue;
      const o = e[s];
      if (oe(o)) t[s] = Yh(s, o, r);
      else if (o != null) {
        const i = Vi(o);
        t[s] = () => i;
      }
    }
  },
  Ou = (e, t) => {
    const n = Vi(t);
    e.slots.default = () => n;
  },
  Ru = (e, t, n) => {
    for (const r in t) (n || !Ui(r)) && (e[r] = t[r]);
  },
  Xh = (e, t, n) => {
    const r = (e.slots = vu());
    if (e.vnode.shapeFlag & 32) {
      const s = t._;
      s ? (Ru(r, t, n), n && Sc(r, '_', s, !0)) : wu(t, r);
    } else t && Ou(e, t);
  },
  Jh = (e, t, n) => {
    const { vnode: r, slots: s } = e;
    let o = !0,
      i = _e;
    if (r.shapeFlag & 32) {
      const a = t._;
      (a ? (n && a === 1 ? (o = !1) : Ru(s, t, n)) : ((o = !t.$stable), wu(t, s)), (i = t));
    } else t && (Ou(e, t), (i = { default: 1 }));
    if (o) for (const a in s) !Ui(a) && i[a] == null && delete s[a];
  },
  je = tp;
function zh(e) {
  return Qh(e);
}
function Qh(e, t) {
  const n = Ks();
  n.__VUE__ = !0;
  const {
      insert: r,
      remove: s,
      patchProp: o,
      createElement: i,
      createText: a,
      createComment: l,
      setText: c,
      setElementText: u,
      parentNode: f,
      nextSibling: d,
      setScopeId: h = Ft,
      insertStaticContent: p
    } = e,
    y = (b, O, v, w = null, R = null, L = null, j = void 0, B = null, m = !!O.dynamicChildren) => {
      if (b === O) return;
      (b && !fn(b, O) && ((w = U(b)), pe(b, R, L, !0), (b = null)),
        O.patchFlag === -2 && ((m = !1), (O.dynamicChildren = null)));
      const { type: _, ref: x, shapeFlag: V } = O;
      switch (_) {
        case zr:
          S(b, O, v, w);
          break;
        case Ye:
          A(b, O, v, w);
          break;
        case gs:
          b == null && T(O, v, w, j);
          break;
        case ct:
          M(b, O, v, w, R, L, j, B, m);
          break;
        default:
          V & 1
            ? C(b, O, v, w, R, L, j, B, m)
            : V & 6
              ? z(b, O, v, w, R, L, j, B, m)
              : (V & 64 || V & 128) && _.process(b, O, v, w, R, L, j, B, m, Q);
      }
      x != null && R ? Cr(x, b && b.ref, L, O || b, !O) : x == null && b && b.ref != null && Cr(b.ref, null, L, b, !0);
    },
    S = (b, O, v, w) => {
      if (b == null) r((O.el = a(O.children)), v, w);
      else {
        const R = (O.el = b.el);
        O.children !== b.children && c(R, O.children);
      }
    },
    A = (b, O, v, w) => {
      b == null ? r((O.el = l(O.children || '')), v, w) : (O.el = b.el);
    },
    T = (b, O, v, w) => {
      [b.el, b.anchor] = p(b.children, O, v, w, b.el, b.anchor);
    },
    E = ({ el: b, anchor: O }, v, w) => {
      let R;
      for (; b && b !== O; ) ((R = d(b)), r(b, v, w), (b = R));
      r(O, v, w);
    },
    g = ({ el: b, anchor: O }) => {
      let v;
      for (; b && b !== O; ) ((v = d(b)), s(b), (b = v));
      s(O);
    },
    C = (b, O, v, w, R, L, j, B, m) => {
      if ((O.type === 'svg' ? (j = 'svg') : O.type === 'math' && (j = 'mathml'), b == null)) I(O, v, w, R, L, j, B, m);
      else {
        const _ = b.el && b.el._isVueCE ? b.el : null;
        try {
          (_ && _._beginPatch(), P(b, O, R, L, j, B, m));
        } finally {
          _ && _._endPatch();
        }
      }
    },
    I = (b, O, v, w, R, L, j, B) => {
      let m, _;
      const { props: x, shapeFlag: V, transition: q, dirs: G } = b;
      if (
        ((m = b.el = i(b.type, L, x && x.is, x)),
        V & 8 ? u(m, b.children) : V & 16 && F(b.children, m, null, w, R, wo(b, L), j, B),
        G && En(b, null, w, 'created'),
        D(m, b, b.scopeId, j, w),
        x)
      ) {
        for (const $ in x) $ !== 'value' && !wr($) && o(m, $, null, x[$], L, w);
        ('value' in x && o(m, 'value', null, x.value, L), (_ = x.onVnodeBeforeMount) && yt(_, w, b));
      }
      G && En(b, null, w, 'beforeMount');
      const k = Zh(R, q);
      (k && q.beforeEnter(m),
        r(m, O, v),
        ((_ = x && x.onVnodeMounted) || k || G) &&
          je(() => {
            try {
              (_ && yt(_, w, b), k && q.enter(m), G && En(b, null, w, 'mounted'));
            } finally {
            }
          }, R));
    },
    D = (b, O, v, w, R) => {
      if ((v && h(b, v), w)) for (let L = 0; L < w.length; L++) h(b, w[L]);
      if (R) {
        let L = R.subTree;
        if (O === L || (Ns(L.type) && (L.ssContent === O || L.ssFallback === O))) {
          const j = R.vnode;
          D(b, j, j.scopeId, j.slotScopeIds, R.parent);
        }
      }
    },
    F = (b, O, v, w, R, L, j, B, m = 0) => {
      for (let _ = m; _ < b.length; _++) {
        const x = (b[_] = B ? Wt(b[_]) : xt(b[_]));
        y(null, x, O, v, w, R, L, j, B);
      }
    },
    P = (b, O, v, w, R, L, j) => {
      const B = (O.el = b.el);
      let { patchFlag: m, dynamicChildren: _, dirs: x } = O;
      m |= b.patchFlag & 16;
      const V = b.props || _e,
        q = O.props || _e;
      let G;
      if (
        (v && bn(v, !1),
        (G = q.onVnodeBeforeUpdate) && yt(G, v, O, b),
        x && En(O, b, v, 'beforeUpdate'),
        v && bn(v, !0),
        ((V.innerHTML && q.innerHTML == null) || (V.textContent && q.textContent == null)) && u(B, ''),
        _ ? H(b.dynamicChildren, _, B, v, w, wo(O, R), L) : j || de(b, O, B, null, v, w, wo(O, R), L, !1),
        m > 0)
      ) {
        if (m & 16) W(B, V, q, v, R);
        else if (
          (m & 2 && V.class !== q.class && o(B, 'class', null, q.class, R),
          m & 4 && o(B, 'style', V.style, q.style, R),
          m & 8)
        ) {
          const k = O.dynamicProps;
          for (let $ = 0; $ < k.length; $++) {
            const ee = k[$],
              fe = V[ee],
              we = q[ee];
            (we !== fe || ee === 'value') && o(B, ee, fe, we, R, v);
          }
        }
        m & 1 && b.children !== O.children && u(B, O.children);
      } else !j && _ == null && W(B, V, q, v, R);
      ((G = q.onVnodeUpdated) || x) &&
        je(() => {
          (G && yt(G, v, O, b), x && En(O, b, v, 'updated'));
        }, w);
    },
    H = (b, O, v, w, R, L, j) => {
      for (let B = 0; B < O.length; B++) {
        const m = b[B],
          _ = O[B],
          x = m.el && (m.type === ct || !fn(m, _) || m.shapeFlag & 198) ? f(m.el) : v;
        y(m, _, x, null, w, R, L, j, !0);
      }
    },
    W = (b, O, v, w, R) => {
      if (O !== v) {
        if (O !== _e) for (const L in O) !wr(L) && !(L in v) && o(b, L, O[L], null, R, w);
        for (const L in v) {
          if (wr(L)) continue;
          const j = v[L],
            B = O[L];
          j !== B && L !== 'value' && o(b, L, B, j, R, w);
        }
        'value' in v && o(b, 'value', O.value, v.value, R);
      }
    },
    M = (b, O, v, w, R, L, j, B, m) => {
      const _ = (O.el = b ? b.el : a('')),
        x = (O.anchor = b ? b.anchor : a(''));
      let { patchFlag: V, dynamicChildren: q, slotScopeIds: G } = O;
      (G && (B = B ? B.concat(G) : G),
        b == null
          ? (r(_, v, w), r(x, v, w), F(O.children || [], v, x, R, L, j, B, m))
          : V > 0 && V & 64 && q && b.dynamicChildren && b.dynamicChildren.length === q.length
            ? (H(b.dynamicChildren, q, v, R, L, j, B), (O.key != null || (R && O === R.subTree)) && Hi(b, O, !0))
            : de(b, O, v, x, R, L, j, B, m));
    },
    z = (b, O, v, w, R, L, j, B, m) => {
      ((O.slotScopeIds = B),
        b == null ? (O.shapeFlag & 512 ? R.ctx.activate(O, v, w, j, m) : ie(O, v, w, R, L, j, m)) : Se(b, O, m));
    },
    ie = (b, O, v, w, R, L, j) => {
      const B = (b.component = fp(b, w, R));
      if ((Jr(b) && (B.ctx.renderer = Q), dp(B, !1, j), B.asyncDep)) {
        if ((R && R.registerDep(B, se, j), !b.el)) {
          const m = (B.subTree = Ue(Ye));
          (A(null, m, O, v), (b.placeholder = m.el));
        }
      } else se(B, b, O, v, R, L, j);
    },
    Se = (b, O, v) => {
      const w = (O.component = b.component);
      if (Bh(b, O, v))
        if (w.asyncDep && !w.asyncResolved) {
          te(w, O, v);
          return;
        } else ((w.next = O), w.update());
      else ((O.el = b.el), (w.vnode = O));
    },
    se = (b, O, v, w, R, L, j) => {
      const B = () => {
        if (b.isMounted) {
          let { next: V, bu: q, u: G, parent: k, vnode: $ } = b;
          {
            const Ke = Cu(b);
            if (Ke) {
              (V && ((V.el = $.el), te(b, V, j)),
                Ke.asyncDep.then(() => {
                  je(() => {
                    b.isUnmounted || _();
                  }, R);
                }));
              return;
            }
          }
          let ee = V,
            fe;
          (bn(b, !1),
            V ? ((V.el = $.el), te(b, V, j)) : (V = $),
            q && Gn(q),
            (fe = V.props && V.props.onVnodeBeforeUpdate) && yt(fe, k, V, $),
            bn(b, !0));
          const we = wa(b),
            rt = b.subTree;
          ((b.subTree = we),
            y(rt, we, f(rt.el), U(rt), b, R, L),
            (V.el = we.el),
            ee === null && Wh(b, we.el),
            G && je(G, R),
            (fe = V.props && V.props.onVnodeUpdated) && je(() => yt(fe, k, V, $), R));
        } else {
          let V;
          const { el: q, props: G } = O,
            { bm: k, m: $, parent: ee, root: fe, type: we } = b,
            rt = hn(O);
          (bn(b, !1), k && Gn(k), !rt && (V = G && G.onVnodeBeforeMount) && yt(V, ee, O), bn(b, !0));
          {
            fe.ce && fe.ce._hasShadowRoot() && fe.ce._injectChildStyle(we, b.parent ? b.parent.type : void 0);
            const Ke = (b.subTree = wa(b));
            (y(null, Ke, v, w, b, R, L), (O.el = Ke.el));
          }
          if (($ && je($, R), !rt && (V = G && G.onVnodeMounted))) {
            const Ke = O;
            je(() => yt(V, ee, Ke), R);
          }
          ((O.shapeFlag & 256 || (ee && hn(ee.vnode) && ee.vnode.shapeFlag & 256)) && b.a && je(b.a, R),
            (b.isMounted = !0),
            (O = v = w = null));
        }
      };
      b.scope.on();
      const m = (b.effect = new Cc(B));
      b.scope.off();
      const _ = (b.update = m.run.bind(m)),
        x = (b.job = m.runIfDirty.bind(m));
      ((x.i = b), (x.id = b.uid), (m.scheduler = () => ki(x)), bn(b, !0), _());
    },
    te = (b, O, v) => {
      O.component = b;
      const w = b.vnode.props;
      ((b.vnode = O), (b.next = null), Kh(b, O.props, w, v), Jh(b, O.children, v), zt(), pa(b), Qt());
    },
    de = (b, O, v, w, R, L, j, B, m = !1) => {
      const _ = b && b.children,
        x = b ? b.shapeFlag : 0,
        V = O.children,
        { patchFlag: q, shapeFlag: G } = O;
      if (q > 0) {
        if (q & 128) {
          Le(_, V, v, w, R, L, j, B, m);
          return;
        } else if (q & 256) {
          Me(_, V, v, w, R, L, j, B, m);
          return;
        }
      }
      G & 8
        ? (x & 16 && ne(_, R, L), V !== _ && u(v, V))
        : x & 16
          ? G & 16
            ? Le(_, V, v, w, R, L, j, B, m)
            : ne(_, R, L, !0)
          : (x & 8 && u(v, ''), G & 16 && F(V, v, w, R, L, j, B, m));
    },
    Me = (b, O, v, w, R, L, j, B, m) => {
      ((b = b || Bn), (O = O || Bn));
      const _ = b.length,
        x = O.length,
        V = Math.min(_, x);
      let q;
      for (q = 0; q < V; q++) {
        const G = (O[q] = m ? Wt(O[q]) : xt(O[q]));
        y(b[q], G, v, null, R, L, j, B, m);
      }
      _ > x ? ne(b, R, L, !0, !1, V) : F(O, v, w, R, L, j, B, m, V);
    },
    Le = (b, O, v, w, R, L, j, B, m) => {
      let _ = 0;
      const x = O.length;
      let V = b.length - 1,
        q = x - 1;
      for (; _ <= V && _ <= q; ) {
        const G = b[_],
          k = (O[_] = m ? Wt(O[_]) : xt(O[_]));
        if (fn(G, k)) y(G, k, v, null, R, L, j, B, m);
        else break;
        _++;
      }
      for (; _ <= V && _ <= q; ) {
        const G = b[V],
          k = (O[q] = m ? Wt(O[q]) : xt(O[q]));
        if (fn(G, k)) y(G, k, v, null, R, L, j, B, m);
        else break;
        (V--, q--);
      }
      if (_ > V) {
        if (_ <= q) {
          const G = q + 1,
            k = G < x ? O[G].el : w;
          for (; _ <= q; ) (y(null, (O[_] = m ? Wt(O[_]) : xt(O[_])), v, k, R, L, j, B, m), _++);
        }
      } else if (_ > q) for (; _ <= V; ) (pe(b[_], R, L, !0), _++);
      else {
        const G = _,
          k = _,
          $ = new Map();
        for (_ = k; _ <= q; _++) {
          const dt = (O[_] = m ? Wt(O[_]) : xt(O[_]));
          dt.key != null && $.set(dt.key, _);
        }
        let ee,
          fe = 0;
        const we = q - k + 1;
        let rt = !1,
          Ke = 0;
        const yn = new Array(we);
        for (_ = 0; _ < we; _++) yn[_] = 0;
        for (_ = G; _ <= V; _++) {
          const dt = b[_];
          if (fe >= we) {
            pe(dt, R, L, !0);
            continue;
          }
          let It;
          if (dt.key != null) It = $.get(dt.key);
          else
            for (ee = k; ee <= q; ee++)
              if (yn[ee - k] === 0 && fn(dt, O[ee])) {
                It = ee;
                break;
              }
          It === void 0
            ? pe(dt, R, L, !0)
            : ((yn[It - k] = _ + 1), It >= Ke ? (Ke = It) : (rt = !0), y(dt, O[It], v, null, R, L, j, B, m), fe++);
        }
        const go = rt ? ep(yn) : Bn;
        for (ee = go.length - 1, _ = we - 1; _ >= 0; _--) {
          const dt = k + _,
            It = O[dt],
            la = O[dt + 1],
            ca = dt + 1 < x ? la.el || Lu(la) : w;
          yn[_] === 0 ? y(null, It, v, ca, R, L, j, B, m) : rt && (ee < 0 || _ !== go[ee] ? ue(It, v, ca, 2) : ee--);
        }
      }
    },
    ue = (b, O, v, w, R = null) => {
      const { el: L, type: j, transition: B, children: m, shapeFlag: _ } = b;
      if (_ & 6) {
        ue(b.component.subTree, O, v, w);
        return;
      }
      if (_ & 128) {
        b.suspense.move(O, v, w);
        return;
      }
      if (_ & 64) {
        j.move(b, O, v, Q);
        return;
      }
      if (j === ct) {
        r(L, O, v);
        for (let V = 0; V < m.length; V++) ue(m[V], O, v, w);
        r(b.anchor, O, v);
        return;
      }
      if (j === gs) {
        E(b, O, v);
        return;
      }
      if (w !== 2 && _ & 1 && B)
        if (w === 0) B.persisted && !L[Et] ? r(L, O, v) : (B.beforeEnter(L), r(L, O, v), je(() => B.enter(L), R));
        else {
          const { leave: V, delayLeave: q, afterLeave: G } = B,
            k = () => {
              b.ctx.isUnmounted ? s(L) : r(L, O, v);
            },
            $ = () => {
              const ee = L._isLeaving || !!L[Et];
              (L._isLeaving && L[Et](!0),
                B.persisted && !ee
                  ? k()
                  : V(L, () => {
                      (k(), G && G());
                    }));
            };
          q ? q(L, k, $) : $();
        }
      else r(L, O, v);
    },
    pe = (b, O, v, w = !1, R = !1) => {
      const {
        type: L,
        props: j,
        ref: B,
        children: m,
        dynamicChildren: _,
        shapeFlag: x,
        patchFlag: V,
        dirs: q,
        cacheIndex: G,
        memo: k
      } = b;
      if (
        (V === -2 && (R = !1),
        B != null && (zt(), Cr(B, null, v, b, !0), Qt()),
        G != null && (O.renderCache[G] = void 0),
        x & 256)
      ) {
        O.ctx.deactivate(b);
        return;
      }
      const $ = x & 1 && q,
        ee = !hn(b);
      let fe;
      if ((ee && (fe = j && j.onVnodeBeforeUnmount) && yt(fe, O, b), x & 6)) We(b.component, v, w);
      else {
        if (x & 128) {
          b.suspense.unmount(v, w);
          return;
        }
        ($ && En(b, null, O, 'beforeUnmount'),
          x & 64
            ? b.type.remove(b, O, v, Q, w)
            : _ && !_.hasOnce && (L !== ct || (V > 0 && V & 64))
              ? ne(_, O, v, !1, !0)
              : ((L === ct && V & 384) || (!R && x & 16)) && ne(m, O, v),
          w && Ne(b));
      }
      const we = k != null && G == null;
      ((ee && (fe = j && j.onVnodeUnmounted)) || $ || we) &&
        je(() => {
          (fe && yt(fe, O, b), $ && En(b, null, O, 'unmounted'), we && (b.el = null));
        }, v);
    },
    Ne = b => {
      const { type: O, el: v, anchor: w, transition: R } = b;
      if (O === ct) {
        xe(v, w);
        return;
      }
      if (O === gs) {
        g(b);
        return;
      }
      const L = () => {
        (s(v), R && !R.persisted && R.afterLeave && R.afterLeave());
      };
      if (b.shapeFlag & 1 && R && !R.persisted) {
        const { leave: j, delayLeave: B } = R,
          m = () => j(v, L);
        B ? B(b.el, L, m) : m();
      } else L();
    },
    xe = (b, O) => {
      let v;
      for (; b !== O; ) ((v = d(b)), s(b), (b = v));
      s(O);
    },
    We = (b, O, v) => {
      const { bum: w, scope: R, job: L, subTree: j, um: B, m, a: _ } = b;
      (Ls(m),
        Ls(_),
        w && Gn(w),
        R.stop(),
        L && ((L.flags |= 8), pe(j, b, O, v)),
        B && je(B, O),
        je(() => {
          b.isUnmounted = !0;
        }, O));
    },
    ne = (b, O, v, w = !1, R = !1, L = 0) => {
      for (let j = L; j < b.length; j++) pe(b[j], O, v, w, R);
    },
    U = b => {
      if (b.shapeFlag & 6) return U(b.component.subTree);
      if (b.shapeFlag & 128) return b.suspense.next();
      const O = d(b.anchor || b.el),
        v = O && O[eu];
      return v ? d(v) : O;
    };
  let Y = !1;
  const K = (b, O, v) => {
      let w;
      (b == null
        ? O._vnode && (pe(O._vnode, null, null, !0), (w = O._vnode.component))
        : y(O._vnode || null, b, O, null, null, null, v),
        (O._vnode = b),
        Y || ((Y = !0), pa(w), Xc(), (Y = !1)));
    },
    Q = { p: y, um: pe, m: ue, r: Ne, mt: ie, mc: F, pc: de, pbc: H, n: U, o: e };
  return { render: K, hydrate: void 0, createApp: Uh(K) };
}
function wo({ type: e, props: t }, n) {
  return (n === 'svg' && e === 'foreignObject') ||
    (n === 'mathml' && e === 'annotation-xml' && t && t.encoding && t.encoding.includes('html'))
    ? void 0
    : n;
}
function bn({ effect: e, job: t }, n) {
  n ? ((e.flags |= 32), (t.flags |= 4)) : ((e.flags &= -33), (t.flags &= -5));
}
function Zh(e, t) {
  return (!e || (e && !e.pendingBranch)) && t && !t.persisted;
}
function Hi(e, t, n = !1) {
  const r = e.children,
    s = t.children;
  if (Z(r) && Z(s))
    for (let o = 0; o < r.length; o++) {
      const i = r[o];
      let a = s[o];
      (a.shapeFlag & 1 &&
        !a.dynamicChildren &&
        ((a.patchFlag <= 0 || a.patchFlag === 32) && ((a = s[o] = Wt(s[o])), (a.el = i.el)),
        !n && a.patchFlag !== -2 && Hi(i, a)),
        a.type === zr && (a.patchFlag === -1 && (a = s[o] = Wt(a)), (a.el = i.el)),
        a.type === Ye && !a.el && (a.el = i.el));
    }
}
function ep(e) {
  const t = e.slice(),
    n = [0];
  let r, s, o, i, a;
  const l = e.length;
  for (r = 0; r < l; r++) {
    const c = e[r];
    if (c !== 0) {
      if (((s = n[n.length - 1]), e[s] < c)) {
        ((t[r] = s), n.push(r));
        continue;
      }
      for (o = 0, i = n.length - 1; o < i; ) ((a = (o + i) >> 1), e[n[a]] < c ? (o = a + 1) : (i = a));
      c < e[n[o]] && (o > 0 && (t[r] = n[o - 1]), (n[o] = r));
    }
  }
  for (o = n.length, i = n[o - 1]; o-- > 0; ) ((n[o] = i), (i = t[i]));
  return n;
}
function Cu(e) {
  const t = e.subTree.component;
  if (t) return t.asyncDep && !t.asyncResolved ? t : Cu(t);
}
function Ls(e) {
  if (e) for (let t = 0; t < e.length; t++) e[t].flags |= 8;
}
function Lu(e) {
  if (e.placeholder) return e.placeholder;
  const t = e.component;
  return t ? Lu(t.subTree) : null;
}
const Ns = e => e.__isSuspense;
function tp(e, t) {
  t && t.pendingBranch ? (Z(e) ? t.effects.push(...e) : t.effects.push(e)) : ah(e);
}
const ct = Symbol.for('v-fgt'),
  zr = Symbol.for('v-txt'),
  Ye = Symbol.for('v-cmt'),
  gs = Symbol.for('v-stc'),
  Nr = [];
let ht = null;
function Is(e = !1) {
  Nr.push((ht = e ? null : []));
}
function np() {
  (Nr.pop(), (ht = Nr[Nr.length - 1] || null));
}
let Ur = 1;
function Ps(e, t = !1) {
  ((Ur += e), e < 0 && ht && t && (ht.hasOnce = !0));
}
function Nu(e) {
  return ((e.dynamicChildren = Ur > 0 ? ht || Bn : null), np(), Ur > 0 && ht && ht.push(e), e);
}
function rp(e, t, n, r, s, o) {
  return Nu($i(e, t, n, r, s, o, !0));
}
function ei(e, t, n, r, s) {
  return Nu(Ue(e, t, n, r, s, !0));
}
function Xn(e) {
  return e ? e.__v_isVNode === !0 : !1;
}
function fn(e, t) {
  return e.type === t.type && e.key === t.key;
}
const Iu = ({ key: e }) => e ?? null,
  _s = ({ ref: e, ref_key: t, ref_for: n }) => (
    typeof e == 'number' && (e = '' + e),
    e != null ? (Ce(e) || Pe(e) || oe(e) ? { i: ze, r: e, k: t, f: !!n } : e) : null
  );
function $i(e, t = null, n = null, r = 0, s = null, o = e === ct ? 0 : 1, i = !1, a = !1) {
  const l = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e,
    props: t,
    key: t && Iu(t),
    ref: t && _s(t),
    scopeId: zc,
    slotScopeIds: null,
    children: n,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag: o,
    patchFlag: r,
    dynamicProps: s,
    dynamicChildren: null,
    appContext: null,
    ctx: ze
  };
  return (
    a ? (ji(l, n), o & 128 && e.normalize(l)) : n && (l.shapeFlag |= Ce(n) ? 8 : 16),
    Ur > 0 && !i && ht && (l.patchFlag > 0 || o & 6) && l.patchFlag !== 32 && ht.push(l),
    l
  );
}
const Ue = sp;
function sp(e, t = null, n = null, r = 0, s = null, o = !1) {
  if (((!e || e === fu) && (e = Ye), Xn(e))) {
    const a = en(e, t, !0);
    return (
      n && ji(a, n),
      Ur > 0 && !o && ht && (a.shapeFlag & 6 ? (ht[ht.indexOf(e)] = a) : ht.push(a)),
      (a.patchFlag = -2),
      a
    );
  }
  if ((gp(e) && (e = e.__vccOpts), t)) {
    t = op(t);
    let { class: a, style: l } = t;
    (a && !Ce(a) && (t.class = qs(a)), Ee(l) && (Js(l) && !Z(l) && (l = Ve({}, l)), (t.style = wi(l))));
  }
  const i = Ce(e) ? 1 : Ns(e) ? 128 : tu(e) ? 64 : Ee(e) ? 4 : oe(e) ? 2 : 0;
  return $i(e, t, n, r, s, i, o, !0);
}
function op(e) {
  return e ? (Js(e) || Su(e) ? Ve({}, e) : e) : null;
}
function en(e, t, n = !1, r = !1) {
  const { props: s, ref: o, patchFlag: i, children: a, transition: l } = e,
    c = t ? lp(s || {}, t) : s,
    u = {
      __v_isVNode: !0,
      __v_skip: !0,
      type: e.type,
      props: c,
      key: c && Iu(c),
      ref: t && t.ref ? (n && o ? (Z(o) ? o.concat(_s(t)) : [o, _s(t)]) : _s(t)) : o,
      scopeId: e.scopeId,
      slotScopeIds: e.slotScopeIds,
      children: a,
      target: e.target,
      targetStart: e.targetStart,
      targetAnchor: e.targetAnchor,
      staticCount: e.staticCount,
      shapeFlag: e.shapeFlag,
      patchFlag: t && e.type !== ct ? (i === -1 ? 16 : i | 16) : i,
      dynamicProps: e.dynamicProps,
      dynamicChildren: e.dynamicChildren,
      appContext: e.appContext,
      dirs: e.dirs,
      transition: l,
      component: e.component,
      suspense: e.suspense,
      ssContent: e.ssContent && en(e.ssContent),
      ssFallback: e.ssFallback && en(e.ssFallback),
      placeholder: e.placeholder,
      el: e.el,
      anchor: e.anchor,
      ctx: e.ctx,
      ce: e.ce
    };
  return (l && r && Yn(u, l.clone(u)), u);
}
function ip(e = ' ', t = 0) {
  return Ue(zr, null, e, t);
}
function bv(e, t) {
  const n = Ue(gs, null, e);
  return ((n.staticCount = t), n);
}
function ap(e = '', t = !1) {
  return t ? (Is(), ei(Ye, null, e)) : Ue(Ye, null, e);
}
function xt(e) {
  return e == null || typeof e == 'boolean'
    ? Ue(Ye)
    : Z(e)
      ? Ue(ct, null, e.slice())
      : Xn(e)
        ? Wt(e)
        : Ue(zr, null, String(e));
}
function Wt(e) {
  return (e.el === null && e.patchFlag !== -1) || e.memo ? e : en(e);
}
function ji(e, t) {
  let n = 0;
  const { shapeFlag: r } = e;
  if (t == null) t = null;
  else if (Z(t)) n = 16;
  else if (typeof t == 'object')
    if (r & 65) {
      const s = t.default;
      s && (s._c && (s._d = !1), ji(e, s()), s._c && (s._d = !0));
      return;
    } else {
      n = 32;
      const s = t._;
      !s && !Su(t)
        ? (t._ctx = ze)
        : s === 3 && ze && (ze.slots._ === 1 ? (t._ = 1) : ((t._ = 2), (e.patchFlag |= 1024)));
    }
  else
    oe(t)
      ? ((t = { default: t, _ctx: ze }), (n = 32))
      : ((t = String(t)), r & 64 ? ((n = 16), (t = [ip(t)])) : (n = 8));
  ((e.children = t), (e.shapeFlag |= n));
}
function lp(...e) {
  const t = {};
  for (let n = 0; n < e.length; n++) {
    const r = e[n];
    for (const s in r)
      if (s === 'class') t.class !== r.class && (t.class = qs([t.class, r.class]));
      else if (s === 'style') t.style = wi([t.style, r.style]);
      else if (Hs(s)) {
        const o = t[s],
          i = r[s];
        i && o !== i && !(Z(o) && o.includes(i))
          ? (t[s] = o ? [].concat(o, i) : i)
          : i == null && o == null && !$s(s) && (t[s] = i);
      } else s !== '' && (t[s] = r[s]);
  }
  return t;
}
function yt(e, t, n, r = null) {
  St(e, t, 7, [n, r]);
}
const cp = gu();
let up = 0;
function fp(e, t, n) {
  const r = e.type,
    s = (t ? t.appContext : e.appContext) || cp,
    o = {
      uid: up++,
      vnode: e,
      type: r,
      parent: t,
      appContext: s,
      root: null,
      next: null,
      subTree: null,
      effect: null,
      update: null,
      job: null,
      scope: new Oc(!0),
      render: null,
      proxy: null,
      exposed: null,
      exposeProxy: null,
      withProxy: null,
      provides: t ? t.provides : Object.create(s.provides),
      ids: t ? t.ids : ['', 0, 0],
      accessCache: null,
      renderCache: [],
      components: null,
      directives: null,
      propsOptions: Tu(r, s),
      emitsOptions: yu(r, s),
      emit: null,
      emitted: null,
      propsDefaults: _e,
      inheritAttrs: r.inheritAttrs,
      ctx: _e,
      data: _e,
      props: _e,
      attrs: _e,
      slots: _e,
      refs: _e,
      setupState: _e,
      setupContext: null,
      suspense: n,
      suspenseId: n ? n.pendingId : 0,
      asyncDep: null,
      asyncResolved: !1,
      isMounted: !1,
      isUnmounted: !1,
      isDeactivated: !1,
      bc: null,
      c: null,
      bm: null,
      m: null,
      bu: null,
      u: null,
      um: null,
      bum: null,
      da: null,
      a: null,
      rtg: null,
      rtc: null,
      ec: null,
      sp: null
    };
  return ((o.ctx = { _: o }), (o.root = t ? t.root : o), (o.emit = Vh.bind(null, o)), e.ce && e.ce(o), o);
}
let Xe = null;
const At = () => Xe || ze;
let Ds, ti;
{
  const e = Ks(),
    t = (n, r) => {
      let s;
      return (
        (s = e[n]) || (s = e[n] = []),
        s.push(r),
        o => {
          s.length > 1 ? s.forEach(i => i(o)) : s[0](o);
        }
      );
    };
  ((Ds = t('__VUE_INSTANCE_SETTERS__', n => (Xe = n))), (ti = t('__VUE_SSR_SETTERS__', n => (Jn = n))));
}
const Qr = e => {
    const t = Xe;
    return (
      Ds(e),
      e.scope.on(),
      () => {
        (e.scope.off(), Ds(t));
      }
    );
  },
  Ca = () => {
    (Xe && Xe.scope.off(), Ds(null));
  };
function Pu(e) {
  return e.vnode.shapeFlag & 4;
}
let Jn = !1;
function dp(e, t = !1, n = !1) {
  t && ti(t);
  const { props: r, children: s } = e.vnode,
    o = Pu(e);
  (Gh(e, r, o, t), Xh(e, s, n || t));
  const i = o ? hp(e, t) : void 0;
  return (t && ti(!1), i);
}
function hp(e, t) {
  const n = e.type;
  ((e.accessCache = Object.create(null)), (e.proxy = new Proxy(e.ctx, Ih)));
  const { setup: r } = n;
  if (r) {
    zt();
    const s = (e.setupContext = r.length > 1 ? mp(e) : null),
      o = Qr(e),
      i = Yr(r, e, 0, [e.props, s]),
      a = Ec(i);
    if ((Qt(), o(), (a || e.sp) && !hn(e) && Fi(e), a)) {
      if ((i.then(Ca, Ca), t))
        return i
          .then(l => {
            La(e, l);
          })
          .catch(l => {
            Xr(l, e, 0);
          });
      e.asyncDep = i;
    } else La(e, i);
  } else Du(e);
}
function La(e, t, n) {
  (oe(t) ? (e.type.__ssrInlineRender ? (e.ssrRender = t) : (e.render = t)) : Ee(t) && (e.setupState = Wc(t)), Du(e));
}
function Du(e, t, n) {
  const r = e.type;
  e.render || (e.render = r.render || Ft);
  {
    const s = Qr(e);
    zt();
    try {
      Ph(e);
    } finally {
      (Qt(), s());
    }
  }
}
const pp = {
  get(e, t) {
    return (et(e, 'get', ''), e[t]);
  }
};
function mp(e) {
  const t = n => {
    e.exposed = n || {};
  };
  return { attrs: new Proxy(e.attrs, pp), slots: e.slots, emit: e.emit, expose: t };
}
function no(e) {
  return e.exposed
    ? e.exposeProxy ||
        (e.exposeProxy = new Proxy(Wc(xi(e.exposed)), {
          get(t, n) {
            if (n in t) return t[n];
            if (n in Lr) return Lr[n](e);
          },
          has(t, n) {
            return n in t || n in Lr;
          }
        }))
    : e.proxy;
}
function ni(e, t = !0) {
  return oe(e) ? e.displayName || e.name : e.name || (t && e.__name);
}
function gp(e) {
  return oe(e) && '__vccOpts' in e;
}
const Ae = (e, t) => nh(e, t, Jn);
function Zr(e, t, n) {
  try {
    Ps(-1);
    const r = arguments.length;
    return r === 2
      ? Ee(t) && !Z(t)
        ? Xn(t)
          ? Ue(e, null, [t])
          : Ue(e, t)
        : Ue(e, null, t)
      : (r > 3 ? (n = Array.prototype.slice.call(arguments, 2)) : r === 3 && Xn(n) && (n = [n]), Ue(e, t, n));
  } finally {
    Ps(1);
  }
}
const _p = '3.5.38';
/**
 * @vue/runtime-dom v3.5.38
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/ let ri;
const Na = typeof window < 'u' && window.trustedTypes;
if (Na)
  try {
    ri = Na.createPolicy('vue', { createHTML: e => e });
  } catch {}
const xu = ri ? e => ri.createHTML(e) : e => e,
  yp = 'http://www.w3.org/2000/svg',
  Ep = 'http://www.w3.org/1998/Math/MathML',
  Bt = typeof document < 'u' ? document : null,
  Ia = Bt && Bt.createElement('template'),
  bp = {
    insert: (e, t, n) => {
      t.insertBefore(e, n || null);
    },
    remove: e => {
      const t = e.parentNode;
      t && t.removeChild(e);
    },
    createElement: (e, t, n, r) => {
      const s =
        t === 'svg'
          ? Bt.createElementNS(yp, e)
          : t === 'mathml'
            ? Bt.createElementNS(Ep, e)
            : n
              ? Bt.createElement(e, { is: n })
              : Bt.createElement(e);
      return (e === 'select' && r && r.multiple != null && s.setAttribute('multiple', r.multiple), s);
    },
    createText: e => Bt.createTextNode(e),
    createComment: e => Bt.createComment(e),
    setText: (e, t) => {
      e.nodeValue = t;
    },
    setElementText: (e, t) => {
      e.textContent = t;
    },
    parentNode: e => e.parentNode,
    nextSibling: e => e.nextSibling,
    querySelector: e => Bt.querySelector(e),
    setScopeId(e, t) {
      e.setAttribute(t, '');
    },
    insertStaticContent(e, t, n, r, s, o) {
      const i = n ? n.previousSibling : t.lastChild;
      if (s && (s === o || s.nextSibling))
        for (; t.insertBefore(s.cloneNode(!0), n), !(s === o || !(s = s.nextSibling)); );
      else {
        Ia.innerHTML = xu(r === 'svg' ? `<svg>${e}</svg>` : r === 'mathml' ? `<math>${e}</math>` : e);
        const a = Ia.content;
        if (r === 'svg' || r === 'mathml') {
          const l = a.firstChild;
          for (; l.firstChild; ) a.appendChild(l.firstChild);
          a.removeChild(l);
        }
        t.insertBefore(a, n);
      }
      return [i ? i.nextSibling : t.firstChild, n ? n.previousSibling : t.lastChild];
    }
  },
  rn = 'transition',
  mr = 'animation',
  Vr = Symbol('_vtc'),
  ku = {
    name: String,
    type: String,
    css: { type: Boolean, default: !0 },
    duration: [String, Number, Object],
    enterFromClass: String,
    enterActiveClass: String,
    enterToClass: String,
    appearFromClass: String,
    appearActiveClass: String,
    appearToClass: String,
    leaveFromClass: String,
    leaveActiveClass: String,
    leaveToClass: String
  },
  vp = Ve({}, nu, ku),
  Sp = e => ((e.displayName = 'Transition'), (e.props = vp), e),
  vv = Sp((e, { slots: t }) => Zr(Eh, Ap(e), t)),
  vn = (e, t = []) => {
    Z(e) ? e.forEach(n => n(...t)) : e && e(...t);
  },
  Pa = e => (e ? (Z(e) ? e.some(t => t.length > 1) : e.length > 1) : !1);
function Ap(e) {
  const t = {};
  for (const M in e) M in ku || (t[M] = e[M]);
  if (e.css === !1) return t;
  const {
      name: n = 'v',
      type: r,
      duration: s,
      enterFromClass: o = `${n}-enter-from`,
      enterActiveClass: i = `${n}-enter-active`,
      enterToClass: a = `${n}-enter-to`,
      appearFromClass: l = o,
      appearActiveClass: c = i,
      appearToClass: u = a,
      leaveFromClass: f = `${n}-leave-from`,
      leaveActiveClass: d = `${n}-leave-active`,
      leaveToClass: h = `${n}-leave-to`
    } = e,
    p = Tp(s),
    y = p && p[0],
    S = p && p[1],
    {
      onBeforeEnter: A,
      onEnter: T,
      onEnterCancelled: E,
      onLeave: g,
      onLeaveCancelled: C,
      onBeforeAppear: I = A,
      onAppear: D = T,
      onAppearCancelled: F = E
    } = t,
    P = (M, z, ie, Se) => {
      ((M._enterCancelled = Se), Sn(M, z ? u : a), Sn(M, z ? c : i), ie && ie());
    },
    H = (M, z) => {
      ((M._isLeaving = !1), Sn(M, f), Sn(M, h), Sn(M, d), z && z());
    },
    W = M => (z, ie) => {
      const Se = M ? D : T,
        se = () => P(z, M, ie);
      (vn(Se, [z, se]),
        Da(() => {
          (Sn(z, M ? l : o), Vt(z, M ? u : a), Pa(Se) || xa(z, r, y, se));
        }));
    };
  return Ve(t, {
    onBeforeEnter(M) {
      (vn(A, [M]), Vt(M, o), Vt(M, i));
    },
    onBeforeAppear(M) {
      (vn(I, [M]), Vt(M, l), Vt(M, c));
    },
    onEnter: W(!1),
    onAppear: W(!0),
    onLeave(M, z) {
      M._isLeaving = !0;
      const ie = () => H(M, z);
      (Vt(M, f),
        M._enterCancelled ? (Vt(M, d), Ma(M)) : (Ma(M), Vt(M, d)),
        Da(() => {
          M._isLeaving && (Sn(M, f), Vt(M, h), Pa(g) || xa(M, r, S, ie));
        }),
        vn(g, [M, ie]));
    },
    onEnterCancelled(M) {
      (P(M, !1, void 0, !0), vn(E, [M]));
    },
    onAppearCancelled(M) {
      (P(M, !0, void 0, !0), vn(F, [M]));
    },
    onLeaveCancelled(M) {
      (H(M), vn(C, [M]));
    }
  });
}
function Tp(e) {
  if (e == null) return null;
  if (Ee(e)) return [Oo(e.enter), Oo(e.leave)];
  {
    const t = Oo(e);
    return [t, t];
  }
}
function Oo(e) {
  return vd(e);
}
function Vt(e, t) {
  (t.split(/\s+/).forEach(n => n && e.classList.add(n)), (e[Vr] || (e[Vr] = new Set())).add(t));
}
function Sn(e, t) {
  t.split(/\s+/).forEach(r => r && e.classList.remove(r));
  const n = e[Vr];
  n && (n.delete(t), n.size || (e[Vr] = void 0));
}
function Da(e) {
  requestAnimationFrame(() => {
    requestAnimationFrame(e);
  });
}
let wp = 0;
function xa(e, t, n, r) {
  const s = (e._endId = ++wp),
    o = () => {
      s === e._endId && r();
    };
  if (n != null) return setTimeout(o, n);
  const { type: i, timeout: a, propCount: l } = Op(e, t);
  if (!i) return r();
  const c = i + 'end';
  let u = 0;
  const f = () => {
      (e.removeEventListener(c, d), o());
    },
    d = h => {
      h.target === e && ++u >= l && f();
    };
  (setTimeout(() => {
    u < l && f();
  }, a + 1),
    e.addEventListener(c, d));
}
function Op(e, t) {
  const n = window.getComputedStyle(e),
    r = p => (n[p] || '').split(', '),
    s = r(`${rn}Delay`),
    o = r(`${rn}Duration`),
    i = ka(s, o),
    a = r(`${mr}Delay`),
    l = r(`${mr}Duration`),
    c = ka(a, l);
  let u = null,
    f = 0,
    d = 0;
  t === rn
    ? i > 0 && ((u = rn), (f = i), (d = o.length))
    : t === mr
      ? c > 0 && ((u = mr), (f = c), (d = l.length))
      : ((f = Math.max(i, c)), (u = f > 0 ? (i > c ? rn : mr) : null), (d = u ? (u === rn ? o.length : l.length) : 0));
  const h = u === rn && /\b(?:transform|all)(?:,|$)/.test(r(`${rn}Property`).toString());
  return { type: u, timeout: f, propCount: d, hasTransform: h };
}
function ka(e, t) {
  for (; e.length < t.length; ) e = e.concat(e);
  return Math.max(...t.map((n, r) => Fa(n) + Fa(e[r])));
}
function Fa(e) {
  return e === 'auto' ? 0 : Number(e.slice(0, -1).replace(',', '.')) * 1e3;
}
function Ma(e) {
  return (e ? e.ownerDocument : document).body.offsetHeight;
}
function Rp(e, t, n) {
  const r = e[Vr];
  (r && (t = (t ? [t, ...r] : [...r]).join(' ')),
    t == null ? e.removeAttribute('class') : n ? e.setAttribute('class', t) : (e.className = t));
}
const xs = Symbol('_vod'),
  Fu = Symbol('_vsh'),
  Sv = {
    name: 'show',
    beforeMount(e, { value: t }, { transition: n }) {
      ((e[xs] = e.style.display === 'none' ? '' : e.style.display), n && t ? n.beforeEnter(e) : gr(e, t));
    },
    mounted(e, { value: t }, { transition: n }) {
      n && t && n.enter(e);
    },
    updated(e, { value: t, oldValue: n }, { transition: r }) {
      !t != !n &&
        (r
          ? t
            ? (r.beforeEnter(e), gr(e, !0), r.enter(e))
            : r.leave(e, () => {
                gr(e, !1);
              })
          : gr(e, t));
    },
    beforeUnmount(e, { value: t }) {
      gr(e, t);
    }
  };
function gr(e, t) {
  ((e.style.display = t ? e[xs] : 'none'), (e[Fu] = !t));
}
const Cp = Symbol(''),
  Lp = /(?:^|;)\s*display\s*:/;
function Np(e, t, n) {
  const r = e.style,
    s = Ce(n);
  let o = !1;
  if (n && !s) {
    if (t)
      if (Ce(t))
        for (const i of t.split(';')) {
          const a = i.slice(0, i.indexOf(':')).trim();
          n[a] == null && Tr(r, a, '');
        }
      else for (const i in t) n[i] == null && Tr(r, i, '');
    for (const i in n) {
      i === 'display' && (o = !0);
      const a = n[i];
      a != null ? Pp(e, i, !Ce(t) && t ? t[i] : void 0, a) || Tr(r, i, a) : Tr(r, i, '');
    }
  } else if (s) {
    if (t !== n) {
      const i = r[Cp];
      (i && (n += ';' + i), (r.cssText = n), (o = Lp.test(n)));
    }
  } else t && e.removeAttribute('style');
  xs in e && ((e[xs] = o ? r.display : ''), e[Fu] && (r.display = 'none'));
}
const Ua = /\s*!important$/;
function Tr(e, t, n) {
  if (Z(n)) n.forEach(r => Tr(e, t, r));
  else if ((n == null && (n = ''), t.startsWith('--'))) e.setProperty(t, n);
  else {
    const r = Ip(e, t);
    Ua.test(n) ? e.setProperty(tn(r), n.replace(Ua, ''), 'important') : (e[r] = n);
  }
}
const Va = ['Webkit', 'Moz', 'ms'],
  Ro = {};
function Ip(e, t) {
  const n = Ro[t];
  if (n) return n;
  let r = tt(t);
  if (r !== 'filter' && r in e) return (Ro[t] = r);
  r = Ws(r);
  for (let s = 0; s < Va.length; s++) {
    const o = Va[s] + r;
    if (o in e) return (Ro[t] = o);
  }
  return t;
}
function Pp(e, t, n, r) {
  return e.tagName === 'TEXTAREA' && (t === 'width' || t === 'height') && Ce(r) && n === r;
}
const Ha = 'http://www.w3.org/1999/xlink';
function $a(e, t, n, r, s, o = Rd(t)) {
  r && t.startsWith('xlink:')
    ? n == null
      ? e.removeAttributeNS(Ha, t.slice(6, t.length))
      : e.setAttributeNS(Ha, t, n)
    : n == null || (o && !Ac(n))
      ? e.removeAttribute(t)
      : e.setAttribute(t, o ? '' : gt(n) ? String(n) : n);
}
function ja(e, t, n, r, s) {
  if (t === 'innerHTML' || t === 'textContent') {
    n != null && (e[t] = t === 'innerHTML' ? xu(n) : n);
    return;
  }
  const o = e.tagName;
  if (t === 'value' && o !== 'PROGRESS' && !o.includes('-')) {
    const a = o === 'OPTION' ? e.getAttribute('value') || '' : e.value,
      l = n == null ? (e.type === 'checkbox' ? 'on' : '') : String(n);
    ((a !== l || !('_value' in e)) && (e.value = l), n == null && e.removeAttribute(t), (e._value = n));
    return;
  }
  let i = !1;
  if (n === '' || n == null) {
    const a = typeof e[t];
    a === 'boolean'
      ? (n = Ac(n))
      : n == null && a === 'string'
        ? ((n = ''), (i = !0))
        : a === 'number' && ((n = 0), (i = !0));
  }
  try {
    e[t] = n;
  } catch {}
  i && e.removeAttribute(s || t);
}
function dn(e, t, n, r) {
  e.addEventListener(t, n, r);
}
function Dp(e, t, n, r) {
  e.removeEventListener(t, n, r);
}
const Ba = Symbol('_vei');
function xp(e, t, n, r, s = null) {
  const o = e[Ba] || (e[Ba] = {}),
    i = o[t];
  if (r && i) i.value = r;
  else {
    const [a, l] = kp(t);
    if (r) {
      const c = (o[t] = Up(r, s));
      dn(e, a, c, l);
    } else i && (Dp(e, a, i, l), (o[t] = void 0));
  }
}
const Wa = /(?:Once|Passive|Capture)$/;
function kp(e) {
  let t;
  if (Wa.test(e)) {
    t = {};
    let r;
    for (; (r = e.match(Wa)); ) ((e = e.slice(0, e.length - r[0].length)), (t[r[0].toLowerCase()] = !0));
  }
  return [e[2] === ':' ? e.slice(3) : tn(e.slice(2)), t];
}
let Co = 0;
const Fp = Promise.resolve(),
  Mp = () => Co || (Fp.then(() => (Co = 0)), (Co = Date.now()));
function Up(e, t) {
  const n = r => {
    if (!r._vts) r._vts = Date.now();
    else if (r._vts <= n.attached) return;
    const s = n.value;
    if (Z(s)) {
      const o = r.stopImmediatePropagation;
      r.stopImmediatePropagation = () => {
        (o.call(r), (r._stopped = !0));
      };
      const i = s.slice(),
        a = [r];
      for (let l = 0; l < i.length && !r._stopped; l++) {
        const c = i[l];
        c && St(c, t, 5, a);
      }
    } else St(s, t, 5, [r]);
  };
  return ((n.value = e), (n.attached = Mp()), n);
}
const Ga = e => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123,
  Vp = (e, t, n, r, s, o) => {
    const i = s === 'svg';
    t === 'class'
      ? Rp(e, r, i)
      : t === 'style'
        ? Np(e, n, r)
        : Hs(t)
          ? $s(t) || xp(e, t, n, r, o)
          : (t[0] === '.' ? ((t = t.slice(1)), !0) : t[0] === '^' ? ((t = t.slice(1)), !1) : Hp(e, t, r, i))
            ? (ja(e, t, r),
              !e.tagName.includes('-') &&
                (t === 'value' || t === 'checked' || t === 'selected') &&
                $a(e, t, r, i, o, t !== 'value'))
            : e._isVueCE && ($p(e, t) || (e._def.__asyncLoader && (/[A-Z]/.test(t) || !Ce(r))))
              ? ja(e, tt(t), r, o, t)
              : (t === 'true-value' ? (e._trueValue = r) : t === 'false-value' && (e._falseValue = r), $a(e, t, r, i));
  };
function Hp(e, t, n, r) {
  if (r) return !!(t === 'innerHTML' || t === 'textContent' || (t in e && Ga(t) && oe(n)));
  if (
    t === 'spellcheck' ||
    t === 'draggable' ||
    t === 'translate' ||
    t === 'autocorrect' ||
    (t === 'sandbox' && e.tagName === 'IFRAME') ||
    t === 'form' ||
    (t === 'list' && e.tagName === 'INPUT') ||
    (t === 'type' && e.tagName === 'TEXTAREA')
  )
    return !1;
  if (t === 'width' || t === 'height') {
    const s = e.tagName;
    if (s === 'IMG' || s === 'VIDEO' || s === 'CANVAS' || s === 'SOURCE') return !1;
  }
  return Ga(t) && Ce(n) ? !1 : t in e;
}
function $p(e, t) {
  const n = e._def.props;
  if (!n) return !1;
  const r = tt(t);
  return Array.isArray(n) ? n.some(s => tt(s) === r) : Object.keys(n).some(s => tt(s) === r);
}
const zn = e => {
  const t = e.props['onUpdate:modelValue'] || !1;
  return Z(t) ? n => Gn(t, n) : t;
};
function jp(e) {
  e.target.composing = !0;
}
function Ka(e) {
  const t = e.target;
  t.composing && ((t.composing = !1), t.dispatchEvent(new Event('input')));
}
const Jt = Symbol('_assign');
function qa(e, t, n) {
  return (t && (e = e.trim()), n && (e = Gs(e)), e);
}
const Av = {
    created(e, { modifiers: { lazy: t, trim: n, number: r } }, s) {
      e[Jt] = zn(s);
      const o = r || (s.props && s.props.type === 'number');
      (dn(e, t ? 'change' : 'input', i => {
        i.target.composing || e[Jt](qa(e.value, n, o));
      }),
        (n || o) &&
          dn(e, 'change', () => {
            e.value = qa(e.value, n, o);
          }),
        t || (dn(e, 'compositionstart', jp), dn(e, 'compositionend', Ka), dn(e, 'change', Ka)));
    },
    mounted(e, { value: t }) {
      e.value = t ?? '';
    },
    beforeUpdate(e, { value: t, oldValue: n, modifiers: { lazy: r, trim: s, number: o } }, i) {
      if (((e[Jt] = zn(i)), e.composing)) return;
      const a = (o || e.type === 'number') && !/^0\d/.test(e.value) ? Gs(e.value) : e.value,
        l = t ?? '';
      if (a === l) return;
      const c = e.getRootNode();
      ((c instanceof Document || c instanceof ShadowRoot) &&
        c.activeElement === e &&
        e.type !== 'range' &&
        ((r && t === n) || (s && e.value.trim() === l))) ||
        (e.value = l);
    }
  },
  Tv = {
    deep: !0,
    created(e, t, n) {
      ((e[Jt] = zn(n)),
        dn(e, 'change', () => {
          const r = e._modelValue,
            s = Hr(e),
            o = e.checked,
            i = e[Jt];
          if (Z(r)) {
            const a = Oi(r, s),
              l = a !== -1;
            if (o && !l) i(r.concat(s));
            else if (!o && l) {
              const c = [...r];
              (c.splice(a, 1), i(c));
            }
          } else if (sr(r)) {
            const a = new Set(r);
            (o ? a.add(s) : a.delete(s), i(a));
          } else i(Mu(e, o));
        }));
    },
    mounted: Ya,
    beforeUpdate(e, t, n) {
      ((e[Jt] = zn(n)), Ya(e, t, n));
    }
  };
function Ya(e, { value: t, oldValue: n }, r) {
  e._modelValue = t;
  let s;
  if (Z(t)) s = Oi(t, r.props.value) > -1;
  else if (sr(t)) s = t.has(r.props.value);
  else {
    if (t === n) return;
    s = ir(t, Mu(e, !0));
  }
  e.checked !== s && (e.checked = s);
}
const wv = {
  deep: !0,
  created(e, { value: t, modifiers: { number: n } }, r) {
    const s = sr(t);
    (dn(e, 'change', () => {
      const o = Array.prototype.filter.call(e.options, i => i.selected).map(i => (n ? Gs(Hr(i)) : Hr(i)));
      (e[Jt](e.multiple ? (s ? new Set(o) : o) : o[0]),
        (e._assigning = !0),
        ar(() => {
          e._assigning = !1;
        }));
    }),
      (e[Jt] = zn(r)));
  },
  mounted(e, { value: t }) {
    Xa(e, t);
  },
  beforeUpdate(e, t, n) {
    e[Jt] = zn(n);
  },
  updated(e, { value: t }) {
    e._assigning || Xa(e, t);
  }
};
function Xa(e, t) {
  const n = e.multiple,
    r = Z(t);
  if (!(n && !r && !sr(t))) {
    for (let s = 0, o = e.options.length; s < o; s++) {
      const i = e.options[s],
        a = Hr(i);
      if (n)
        if (r) {
          const l = typeof a;
          l === 'string' || l === 'number'
            ? (i.selected = t.some(c => String(c) === String(a)))
            : (i.selected = Oi(t, a) > -1);
        } else i.selected = t.has(a);
      else if (ir(Hr(i), t)) {
        e.selectedIndex !== s && (e.selectedIndex = s);
        return;
      }
    }
    !n && e.selectedIndex !== -1 && (e.selectedIndex = -1);
  }
}
function Hr(e) {
  return '_value' in e ? e._value : e.value;
}
function Mu(e, t) {
  const n = t ? '_trueValue' : '_falseValue';
  return n in e ? e[n] : t;
}
const Bp = ['ctrl', 'shift', 'alt', 'meta'],
  Wp = {
    stop: e => e.stopPropagation(),
    prevent: e => e.preventDefault(),
    self: e => e.target !== e.currentTarget,
    ctrl: e => !e.ctrlKey,
    shift: e => !e.shiftKey,
    alt: e => !e.altKey,
    meta: e => !e.metaKey,
    left: e => 'button' in e && e.button !== 0,
    middle: e => 'button' in e && e.button !== 1,
    right: e => 'button' in e && e.button !== 2,
    exact: (e, t) => Bp.some(n => e[`${n}Key`] && !t.includes(n))
  },
  Ov = (e, t) => {
    if (!e) return e;
    const n = e._withMods || (e._withMods = {}),
      r = t.join('.');
    return (
      n[r] ||
      (n[r] = (s, ...o) => {
        for (let i = 0; i < t.length; i++) {
          const a = Wp[t[i]];
          if (a && a(s, t)) return;
        }
        return e(s, ...o);
      })
    );
  },
  Gp = {
    esc: 'escape',
    space: ' ',
    up: 'arrow-up',
    left: 'arrow-left',
    right: 'arrow-right',
    down: 'arrow-down',
    delete: 'backspace'
  },
  Rv = (e, t) => {
    const n = e._withKeys || (e._withKeys = {}),
      r = t.join('.');
    return (
      n[r] ||
      (n[r] = s => {
        if (!('key' in s)) return;
        const o = tn(s.key);
        if (t.some(i => i === o || Gp[i] === o)) return e(s);
      })
    );
  },
  Kp = Ve({ patchProp: Vp }, bp);
let Ja;
function qp() {
  return Ja || (Ja = zh(Kp));
}
const Yp = (...e) => {
  const t = qp().createApp(...e),
    { mount: n } = t;
  return (
    (t.mount = r => {
      const s = Jp(r);
      if (!s) return;
      const o = t._component;
      (!oe(o) && !o.render && !o.template && (o.template = s.innerHTML), s.nodeType === 1 && (s.textContent = ''));
      const i = n(s, !1, Xp(s));
      return (s instanceof Element && (s.removeAttribute('v-cloak'), s.setAttribute('data-v-app', '')), i);
    }),
    t
  );
};
function Xp(e) {
  if (e instanceof SVGElement) return 'svg';
  if (typeof MathMLElement == 'function' && e instanceof MathMLElement) return 'mathml';
}
function Jp(e) {
  return Ce(e) ? document.querySelector(e) : e;
}
/*!
 * pinia v2.3.1
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */ let Uu;
const ro = e => (Uu = e),
  Vu = Symbol();
function si(e) {
  return (
    e &&
    typeof e == 'object' &&
    Object.prototype.toString.call(e) === '[object Object]' &&
    typeof e.toJSON != 'function'
  );
}
var Ir;
(function (e) {
  ((e.direct = 'direct'), (e.patchObject = 'patch object'), (e.patchFunction = 'patch function'));
})(Ir || (Ir = {}));
function zp() {
  const e = Ri(!0),
    t = e.run(() => le({}));
  let n = [],
    r = [];
  const s = xi({
    install(o) {
      (ro(s),
        (s._a = o),
        o.provide(Vu, s),
        (o.config.globalProperties.$pinia = s),
        r.forEach(i => n.push(i)),
        (r = []));
    },
    use(o) {
      return (this._a ? n.push(o) : r.push(o), this);
    },
    _p: n,
    _a: null,
    _e: e,
    _s: new Map(),
    state: t
  });
  return s;
}
const Hu = () => {};
function za(e, t, n, r = Hu) {
  e.push(t);
  const s = () => {
    const o = e.indexOf(t);
    o > -1 && (e.splice(o, 1), r());
  };
  return (!n && Ci() && Rc(s), s);
}
function Mn(e, ...t) {
  e.slice().forEach(n => {
    n(...t);
  });
}
const Qp = e => e(),
  Qa = Symbol(),
  Lo = Symbol();
function oi(e, t) {
  e instanceof Map && t instanceof Map
    ? t.forEach((n, r) => e.set(r, n))
    : e instanceof Set && t instanceof Set && t.forEach(e.add, e);
  for (const n in t) {
    if (!t.hasOwnProperty(n)) continue;
    const r = t[n],
      s = e[n];
    si(s) && si(r) && e.hasOwnProperty(n) && !Pe(r) && !Yt(r) ? (e[n] = oi(s, r)) : (e[n] = r);
  }
  return e;
}
const Zp = Symbol();
function em(e) {
  return !si(e) || !e.hasOwnProperty(Zp);
}
const { assign: ln } = Object;
function tm(e) {
  return !!(Pe(e) && e.effect);
}
function nm(e, t, n, r) {
  const { state: s, actions: o, getters: i } = t,
    a = n.state.value[e];
  let l;
  function c() {
    a || (n.state.value[e] = s ? s() : {});
    const u = zd(n.state.value[e]);
    return ln(
      u,
      o,
      Object.keys(i || {}).reduce(
        (f, d) => (
          (f[d] = xi(
            Ae(() => {
              ro(n);
              const h = n._s.get(e);
              return i[d].call(h, h);
            })
          )),
          f
        ),
        {}
      )
    );
  }
  return ((l = $u(e, c, t, n, r, !0)), l);
}
function $u(e, t, n = {}, r, s, o) {
  let i;
  const a = ln({ actions: {} }, n),
    l = { deep: !0 };
  let c,
    u,
    f = [],
    d = [],
    h;
  const p = r.state.value[e];
  !o && !p && (r.state.value[e] = {});
  let y;
  function S(F) {
    let P;
    ((c = u = !1),
      typeof F == 'function'
        ? (F(r.state.value[e]), (P = { type: Ir.patchFunction, storeId: e, events: h }))
        : (oi(r.state.value[e], F), (P = { type: Ir.patchObject, payload: F, storeId: e, events: h })));
    const H = (y = Symbol());
    (ar().then(() => {
      y === H && (c = !0);
    }),
      (u = !0),
      Mn(f, P, r.state.value[e]));
  }
  const A = o
    ? function () {
        const { state: P } = n,
          H = P ? P() : {};
        this.$patch(W => {
          ln(W, H);
        });
      }
    : Hu;
  function T() {
    (i.stop(), (f = []), (d = []), r._s.delete(e));
  }
  const E = (F, P = '') => {
      if (Qa in F) return ((F[Lo] = P), F);
      const H = function () {
        ro(r);
        const W = Array.from(arguments),
          M = [],
          z = [];
        function ie(te) {
          M.push(te);
        }
        function Se(te) {
          z.push(te);
        }
        Mn(d, { args: W, name: H[Lo], store: C, after: ie, onError: Se });
        let se;
        try {
          se = F.apply(this && this.$id === e ? this : C, W);
        } catch (te) {
          throw (Mn(z, te), te);
        }
        return se instanceof Promise
          ? se.then(te => (Mn(M, te), te)).catch(te => (Mn(z, te), Promise.reject(te)))
          : (Mn(M, se), se);
      };
      return ((H[Qa] = !0), (H[Lo] = P), H);
    },
    g = {
      _p: r,
      $id: e,
      $onAction: za.bind(null, d),
      $patch: S,
      $reset: A,
      $subscribe(F, P = {}) {
        const H = za(f, F, P.detached, () => W()),
          W = i.run(() =>
            vt(
              () => r.state.value[e],
              M => {
                (P.flush === 'sync' ? u : c) && F({ storeId: e, type: Ir.direct, events: h }, M);
              },
              ln({}, l, P)
            )
          );
        return H;
      },
      $dispose: T
    },
    C = qr(g);
  r._s.set(e, C);
  const D = ((r._a && r._a.runWithContext) || Qp)(() => r._e.run(() => (i = Ri()).run(() => t({ action: E }))));
  for (const F in D) {
    const P = D[F];
    if ((Pe(P) && !tm(P)) || Yt(P))
      o || (p && em(P) && (Pe(P) ? (P.value = p[F]) : oi(P, p[F])), (r.state.value[e][F] = P));
    else if (typeof P == 'function') {
      const H = E(P, F);
      ((D[F] = H), (a.actions[F] = P));
    }
  }
  return (
    ln(C, D),
    ln(me(C), D),
    Object.defineProperty(C, '$state', {
      get: () => r.state.value[e],
      set: F => {
        S(P => {
          ln(P, F);
        });
      }
    }),
    r._p.forEach(F => {
      ln(
        C,
        i.run(() => F({ store: C, app: r._a, pinia: r, options: a }))
      );
    }),
    p && o && n.hydrate && n.hydrate(C.$state, p),
    (c = !0),
    (u = !0),
    C
  );
}
/*! #__NO_SIDE_EFFECTS__ */ function Bi(e, t, n) {
  let r, s;
  const o = typeof t == 'function';
  typeof e == 'string' ? ((r = e), (s = o ? n : t)) : ((s = e), (r = e.id));
  function i(a, l) {
    const c = ch();
    return (
      (a = a || (c ? mt(Vu, null) : null)),
      a && ro(a),
      (a = Uu),
      a._s.has(r) || (o ? $u(r, t, s, a) : nm(r, s, a)),
      a._s.get(r)
    );
  }
  return ((i.$id = r), i);
}
function ju(e) {
  return Ci() ? (Rc(e), !0) : !1;
}
function so(e) {
  return typeof e == 'function' ? e() : Xt(e);
}
const rm = typeof window < 'u' && typeof document < 'u';
typeof WorkerGlobalScope < 'u' && globalThis instanceof WorkerGlobalScope;
const sm = Object.prototype.toString,
  om = e => sm.call(e) === '[object Object]',
  Bu = () => {};
function im(e, t) {
  function n(...r) {
    return new Promise((s, o) => {
      Promise.resolve(e(() => t.apply(this, r), { fn: t, thisArg: this, args: r }))
        .then(s)
        .catch(o);
    });
  }
  return n;
}
const Wu = e => e();
function am(e = Wu) {
  const t = le(!0);
  function n() {
    t.value = !1;
  }
  function r() {
    t.value = !0;
  }
  return {
    isActive: Fr(t),
    pause: n,
    resume: r,
    eventFilter: (...o) => {
      t.value && e(...o);
    }
  };
}
function lm(e) {
  return At();
}
function cm(...e) {
  if (e.length !== 1) return eh(...e);
  const t = e[0];
  return typeof t == 'function' ? Fr(Gc(() => ({ get: t, set: Bu }))) : le(t);
}
function um(e, t, n = {}) {
  const { eventFilter: r = Wu, ...s } = n;
  return vt(e, im(r, t), s);
}
function fm(e, t, n = {}) {
  const { eventFilter: r, ...s } = n,
    { eventFilter: o, pause: i, resume: a, isActive: l } = am(r);
  return { stop: um(e, t, { ...s, eventFilter: o }), pause: i, resume: a, isActive: l };
}
function Gu(e, t = !0, n) {
  lm() ? lr(e, n) : t ? e() : ar(e);
}
const $r = rm ? window : void 0;
function Ku(e) {
  var t;
  const n = so(e);
  return (t = n == null ? void 0 : n.$el) != null ? t : n;
}
function Za(...e) {
  let t, n, r, s;
  if ((typeof e[0] == 'string' || Array.isArray(e[0]) ? (([n, r, s] = e), (t = $r)) : ([t, n, r, s] = e), !t))
    return Bu;
  (Array.isArray(n) || (n = [n]), Array.isArray(r) || (r = [r]));
  const o = [],
    i = () => {
      (o.forEach(u => u()), (o.length = 0));
    },
    a = (u, f, d, h) => (u.addEventListener(f, d, h), () => u.removeEventListener(f, d, h)),
    l = vt(
      () => [Ku(t), so(s)],
      ([u, f]) => {
        if ((i(), !u)) return;
        const d = om(f) ? { ...f } : f;
        o.push(...n.flatMap(h => r.map(p => a(u, h, p, d))));
      },
      { immediate: !0, flush: 'post' }
    ),
    c = () => {
      (l(), i());
    };
  return (ju(c), c);
}
function dm() {
  const e = le(!1),
    t = At();
  return (
    t &&
      lr(() => {
        e.value = !0;
      }, t),
    e
  );
}
function hm(e) {
  const t = dm();
  return Ae(() => (t.value, !!e()));
}
function pm(e, t = {}) {
  const { window: n = $r } = t,
    r = hm(() => n && 'matchMedia' in n && typeof n.matchMedia == 'function');
  let s;
  const o = le(!1),
    i = c => {
      o.value = c.matches;
    },
    a = () => {
      s && ('removeEventListener' in s ? s.removeEventListener('change', i) : s.removeListener(i));
    },
    l = Qc(() => {
      r.value &&
        (a(),
        (s = n.matchMedia(so(e))),
        'addEventListener' in s ? s.addEventListener('change', i) : s.addListener(i),
        (o.value = s.matches));
    });
  return (
    ju(() => {
      (l(), a(), (s = void 0));
    }),
    o
  );
}
const us =
    typeof globalThis < 'u'
      ? globalThis
      : typeof window < 'u'
        ? window
        : typeof global < 'u'
          ? global
          : typeof self < 'u'
            ? self
            : {},
  fs = '__vueuse_ssr_handlers__',
  mm = gm();
function gm() {
  return (fs in us || (us[fs] = us[fs] || {}), us[fs]);
}
function qu(e, t) {
  return mm[e] || t;
}
function Yu(e) {
  return pm('(prefers-color-scheme: dark)', e);
}
function _m(e) {
  return e == null
    ? 'any'
    : e instanceof Set
      ? 'set'
      : e instanceof Map
        ? 'map'
        : e instanceof Date
          ? 'date'
          : typeof e == 'boolean'
            ? 'boolean'
            : typeof e == 'string'
              ? 'string'
              : typeof e == 'object'
                ? 'object'
                : Number.isNaN(e)
                  ? 'any'
                  : 'number';
}
const ym = {
    boolean: { read: e => e === 'true', write: e => String(e) },
    object: { read: e => JSON.parse(e), write: e => JSON.stringify(e) },
    number: { read: e => Number.parseFloat(e), write: e => String(e) },
    any: { read: e => e, write: e => String(e) },
    string: { read: e => e, write: e => String(e) },
    map: { read: e => new Map(JSON.parse(e)), write: e => JSON.stringify(Array.from(e.entries())) },
    set: { read: e => new Set(JSON.parse(e)), write: e => JSON.stringify(Array.from(e)) },
    date: { read: e => new Date(e), write: e => e.toISOString() }
  },
  el = 'vueuse-storage';
function Em(e, t, n, r = {}) {
  var s;
  const {
      flush: o = 'pre',
      deep: i = !0,
      listenToStorageChanges: a = !0,
      writeDefaults: l = !0,
      mergeDefaults: c = !1,
      shallow: u,
      window: f = $r,
      eventFilter: d,
      onError: h = H => {
        console.error(H);
      },
      initOnMounted: p
    } = r,
    y = (u ? zs : le)(typeof t == 'function' ? t() : t);
  if (!n)
    try {
      n = qu('getDefaultStorage', () => {
        var H;
        return (H = $r) == null ? void 0 : H.localStorage;
      })();
    } catch (H) {
      h(H);
    }
  if (!n) return y;
  const S = so(t),
    A = _m(S),
    T = (s = r.serializer) != null ? s : ym[A],
    { pause: E, resume: g } = fm(y, () => I(y.value), { flush: o, deep: i, eventFilter: d });
  (f &&
    a &&
    Gu(() => {
      (n instanceof Storage ? Za(f, 'storage', F) : Za(f, el, P), p && F());
    }),
    p || F());
  function C(H, W) {
    if (f) {
      const M = { key: e, oldValue: H, newValue: W, storageArea: n };
      f.dispatchEvent(n instanceof Storage ? new StorageEvent('storage', M) : new CustomEvent(el, { detail: M }));
    }
  }
  function I(H) {
    try {
      const W = n.getItem(e);
      if (H == null) (C(W, null), n.removeItem(e));
      else {
        const M = T.write(H);
        W !== M && (n.setItem(e, M), C(W, M));
      }
    } catch (W) {
      h(W);
    }
  }
  function D(H) {
    const W = H ? H.newValue : n.getItem(e);
    if (W == null) return (l && S != null && n.setItem(e, T.write(S)), S);
    if (!H && c) {
      const M = T.read(W);
      return typeof c == 'function' ? c(M, S) : A === 'object' && !Array.isArray(M) ? { ...S, ...M } : M;
    } else return typeof W != 'string' ? W : T.read(W);
  }
  function F(H) {
    if (!(H && H.storageArea !== n)) {
      if (H && H.key == null) {
        y.value = S;
        return;
      }
      if (!(H && H.key !== e)) {
        E();
        try {
          (H == null ? void 0 : H.newValue) !== T.write(y.value) && (y.value = D(H));
        } catch (W) {
          h(W);
        } finally {
          H ? ar(g) : g();
        }
      }
    }
  }
  function P(H) {
    F(H.detail);
  }
  return y;
}
const bm =
  '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}';
function vm(e = {}) {
  const {
      selector: t = 'html',
      attribute: n = 'class',
      initialValue: r = 'auto',
      window: s = $r,
      storage: o,
      storageKey: i = 'vueuse-color-scheme',
      listenToStorageChanges: a = !0,
      storageRef: l,
      emitAuto: c,
      disableTransition: u = !0
    } = e,
    f = { auto: '', light: 'light', dark: 'dark', ...(e.modes || {}) },
    d = Yu({ window: s }),
    h = Ae(() => (d.value ? 'dark' : 'light')),
    p = l || (i == null ? cm(r) : Em(i, r, o, { window: s, listenToStorageChanges: a })),
    y = Ae(() => (p.value === 'auto' ? h.value : p.value)),
    S = qu('updateHTMLAttrs', (g, C, I) => {
      const D = typeof g == 'string' ? (s == null ? void 0 : s.document.querySelector(g)) : Ku(g);
      if (!D) return;
      const F = new Set(),
        P = new Set();
      let H = null;
      if (C === 'class') {
        const M = I.split(/\s/g);
        Object.values(f)
          .flatMap(z => (z || '').split(/\s/g))
          .filter(Boolean)
          .forEach(z => {
            M.includes(z) ? F.add(z) : P.add(z);
          });
      } else H = { key: C, value: I };
      if (F.size === 0 && P.size === 0 && H === null) return;
      let W;
      u &&
        ((W = s.document.createElement('style')),
        W.appendChild(document.createTextNode(bm)),
        s.document.head.appendChild(W));
      for (const M of F) D.classList.add(M);
      for (const M of P) D.classList.remove(M);
      (H && D.setAttribute(H.key, H.value), u && (s.getComputedStyle(W).opacity, document.head.removeChild(W)));
    });
  function A(g) {
    var C;
    S(t, n, (C = f[g]) != null ? C : g);
  }
  function T(g) {
    e.onChanged ? e.onChanged(g, A) : A(g);
  }
  (vt(y, T, { flush: 'post', immediate: !0 }), Gu(() => T(y.value)));
  const E = Ae({
    get() {
      return c ? p.value : y.value;
    },
    set(g) {
      p.value = g;
    }
  });
  try {
    return Object.assign(E, { store: p, system: h, state: y });
  } catch {
    return E;
  }
}
const Sm = Bi('theme', () => {
    const e = vm({ storageKey: 'posecraft_theme' }),
      t = le(!1),
      n = Yu();
    Qc(() => {
      ((t.value = e.value === 'dark' || (e.value === 'auto' && n.value)),
        document.documentElement.classList.toggle('dark', t.value));
    });
    function r() {
      e.value = e.value === 'light' ? 'dark' : 'light';
    }
    return { isDark: t, colorMode: e, toggleTheme: r };
  }),
  Am = {
    class: 'min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-300'
  },
  Tm = kn({
    __name: 'App',
    setup(e) {
      const t = Sm();
      return (n, r) => {
        const s = Nh('router-view');
        return (Is(), rp('div', { class: qs({ dark: Xt(t).isDark }) }, [$i('div', Am, [Ue(s)])], 2));
      };
    }
  }),
  wm = 'modulepreload',
  Om = function (e) {
    return '/posecraft/' + e;
  },
  tl = {},
  ge = function (t, n, r) {
    let s = Promise.resolve();
    if (n && n.length > 0) {
      document.getElementsByTagName('link');
      const i = document.querySelector('meta[property=csp-nonce]'),
        a = (i == null ? void 0 : i.nonce) || (i == null ? void 0 : i.getAttribute('nonce'));
      s = Promise.allSettled(
        n.map(l => {
          if (((l = Om(l)), l in tl)) return;
          tl[l] = !0;
          const c = l.endsWith('.css'),
            u = c ? '[rel="stylesheet"]' : '';
          if (document.querySelector(`link[href="${l}"]${u}`)) return;
          const f = document.createElement('link');
          if (
            ((f.rel = c ? 'stylesheet' : wm),
            c || (f.as = 'script'),
            (f.crossOrigin = ''),
            (f.href = l),
            a && f.setAttribute('nonce', a),
            document.head.appendChild(f),
            c)
          )
            return new Promise((d, h) => {
              (f.addEventListener('load', d),
                f.addEventListener('error', () => h(new Error(`Unable to preload CSS for ${l}`))));
            });
        })
      );
    }
    function o(i) {
      const a = new Event('vite:preloadError', { cancelable: !0 });
      if (((a.payload = i), window.dispatchEvent(a), !a.defaultPrevented)) throw i;
    }
    return s.then(i => {
      for (const a of i || []) a.status === 'rejected' && o(a.reason);
      return t().catch(o);
    });
  };
/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */ const Hn = typeof document < 'u';
function Xu(e) {
  return typeof e == 'object' || 'displayName' in e || 'props' in e || '__vccOpts' in e;
}
function Rm(e) {
  return e.__esModule || e[Symbol.toStringTag] === 'Module' || (e.default && Xu(e.default));
}
const be = Object.assign;
function No(e, t) {
  const n = {};
  for (const r in t) {
    const s = t[r];
    n[r] = Lt(s) ? s.map(e) : e(s);
  }
  return n;
}
const Pr = () => {},
  Lt = Array.isArray;
function nl(e, t) {
  const n = {};
  for (const r in e) n[r] = r in t ? t[r] : e[r];
  return n;
}
const Ju = /#/g,
  Cm = /&/g,
  Lm = /\//g,
  Nm = /=/g,
  Im = /\?/g,
  zu = /\+/g,
  Pm = /%5B/g,
  Dm = /%5D/g,
  Qu = /%5E/g,
  xm = /%60/g,
  Zu = /%7B/g,
  km = /%7C/g,
  ef = /%7D/g,
  Fm = /%20/g;
function Wi(e) {
  return e == null
    ? ''
    : encodeURI('' + e)
        .replace(km, '|')
        .replace(Pm, '[')
        .replace(Dm, ']');
}
function Mm(e) {
  return Wi(e).replace(Zu, '{').replace(ef, '}').replace(Qu, '^');
}
function ii(e) {
  return Wi(e)
    .replace(zu, '%2B')
    .replace(Fm, '+')
    .replace(Ju, '%23')
    .replace(Cm, '%26')
    .replace(xm, '`')
    .replace(Zu, '{')
    .replace(ef, '}')
    .replace(Qu, '^');
}
function Um(e) {
  return ii(e).replace(Nm, '%3D');
}
function Vm(e) {
  return Wi(e).replace(Ju, '%23').replace(Im, '%3F');
}
function Hm(e) {
  return Vm(e).replace(Lm, '%2F');
}
function jr(e) {
  if (e == null) return null;
  try {
    return decodeURIComponent('' + e);
  } catch {}
  return '' + e;
}
const $m = /\/$/,
  jm = e => e.replace($m, '');
function Io(e, t, n = '/') {
  let r,
    s = {},
    o = '',
    i = '';
  const a = t.indexOf('#');
  let l = t.indexOf('?');
  return (
    (l = a >= 0 && l > a ? -1 : l),
    l >= 0 && ((r = t.slice(0, l)), (o = t.slice(l, a > 0 ? a : t.length)), (s = e(o.slice(1)))),
    a >= 0 && ((r = r || t.slice(0, a)), (i = t.slice(a, t.length))),
    (r = Km(r ?? t, n)),
    { fullPath: r + o + i, path: r, query: s, hash: jr(i) }
  );
}
function Bm(e, t) {
  const n = t.query ? e(t.query) : '';
  return t.path + (n && '?') + n + (t.hash || '');
}
function rl(e, t) {
  return !t || !e.toLowerCase().startsWith(t.toLowerCase()) ? e : e.slice(t.length) || '/';
}
function Wm(e, t, n) {
  const r = t.matched.length - 1,
    s = n.matched.length - 1;
  return (
    r > -1 &&
    r === s &&
    Qn(t.matched[r], n.matched[s]) &&
    tf(t.params, n.params) &&
    e(t.query) === e(n.query) &&
    t.hash === n.hash
  );
}
function Qn(e, t) {
  return (e.aliasOf || e) === (t.aliasOf || t);
}
function tf(e, t) {
  if (Object.keys(e).length !== Object.keys(t).length) return !1;
  for (var n in e) if (!Gm(e[n], t[n])) return !1;
  return !0;
}
function Gm(e, t) {
  return Lt(e)
    ? sl(e, t)
    : Lt(t)
      ? sl(t, e)
      : (e == null ? void 0 : e.valueOf()) === (t == null ? void 0 : t.valueOf());
}
function sl(e, t) {
  return Lt(t) ? e.length === t.length && e.every((n, r) => n === t[r]) : e.length === 1 && e[0] === t;
}
function Km(e, t) {
  if (e.startsWith('/')) return e;
  if (!e) return t;
  const n = t.split('/'),
    r = e.split('/'),
    s = r[r.length - 1];
  (s === '..' || s === '.') && r.push('');
  let o = n.length - 1,
    i,
    a;
  for (i = 0; i < r.length; i++)
    if (((a = r[i]), a !== '.'))
      if (a === '..') o > 1 && o--;
      else break;
  return n.slice(0, o).join('/') + '/' + r.slice(i).join('/');
}
const sn = {
  path: '/',
  name: void 0,
  params: {},
  query: {},
  hash: '',
  fullPath: '/',
  matched: [],
  meta: {},
  redirectedFrom: void 0
};
let ai = (function (e) {
    return ((e.pop = 'pop'), (e.push = 'push'), e);
  })({}),
  Po = (function (e) {
    return ((e.back = 'back'), (e.forward = 'forward'), (e.unknown = ''), e);
  })({});
function qm(e) {
  if (!e)
    if (Hn) {
      const t = document.querySelector('base');
      ((e = (t && t.getAttribute('href')) || '/'), (e = e.replace(/^\w+:\/\/[^\/]+/, '')));
    } else e = '/';
  return (e[0] !== '/' && e[0] !== '#' && (e = '/' + e), jm(e));
}
const Ym = /^[^#]+#/;
function Xm(e, t) {
  return e.replace(Ym, '#') + t;
}
function Jm(e, t) {
  const n = document.documentElement.getBoundingClientRect(),
    r = e.getBoundingClientRect();
  return { behavior: t.behavior, left: r.left - n.left - (t.left || 0), top: r.top - n.top - (t.top || 0) };
}
const oo = () => ({ left: window.scrollX, top: window.scrollY });
function zm(e) {
  let t;
  if ('el' in e) {
    const n = e.el,
      r = typeof n == 'string' && n.startsWith('#'),
      s = typeof n == 'string' ? (r ? document.getElementById(n.slice(1)) : document.querySelector(n)) : n;
    if (!s) return;
    t = Jm(s, e);
  } else t = e;
  'scrollBehavior' in document.documentElement.style
    ? window.scrollTo(t)
    : window.scrollTo(t.left != null ? t.left : window.scrollX, t.top != null ? t.top : window.scrollY);
}
function ol(e, t) {
  return (history.state ? history.state.position - t : -1) + e;
}
const li = new Map();
function Qm(e, t) {
  li.set(e, t);
}
function Zm(e) {
  const t = li.get(e);
  return (li.delete(e), t);
}
function eg(e) {
  return typeof e == 'string' || (e && typeof e == 'object');
}
function nf(e) {
  return typeof e == 'string' || typeof e == 'symbol';
}
let De = (function (e) {
  return (
    (e[(e.MATCHER_NOT_FOUND = 1)] = 'MATCHER_NOT_FOUND'),
    (e[(e.NAVIGATION_GUARD_REDIRECT = 2)] = 'NAVIGATION_GUARD_REDIRECT'),
    (e[(e.NAVIGATION_ABORTED = 4)] = 'NAVIGATION_ABORTED'),
    (e[(e.NAVIGATION_CANCELLED = 8)] = 'NAVIGATION_CANCELLED'),
    (e[(e.NAVIGATION_DUPLICATED = 16)] = 'NAVIGATION_DUPLICATED'),
    e
  );
})({});
const rf = Symbol('');
(De.MATCHER_NOT_FOUND + '',
  De.NAVIGATION_GUARD_REDIRECT + '',
  De.NAVIGATION_ABORTED + '',
  De.NAVIGATION_CANCELLED + '',
  De.NAVIGATION_DUPLICATED + '');
function Zn(e, t) {
  return be(new Error(), { type: e, [rf]: !0 }, t);
}
function Ht(e, t) {
  return e instanceof Error && rf in e && (t == null || !!(e.type & t));
}
const tg = ['params', 'query', 'hash'];
function ng(e) {
  if (typeof e == 'string') return e;
  if (e.path != null) return e.path;
  const t = {};
  for (const n of tg) n in e && (t[n] = e[n]);
  return JSON.stringify(t, null, 2);
}
function rg(e) {
  const t = {};
  if (e === '' || e === '?') return t;
  const n = (e[0] === '?' ? e.slice(1) : e).split('&');
  for (let r = 0; r < n.length; ++r) {
    const s = n[r].replace(zu, ' '),
      o = s.indexOf('='),
      i = jr(o < 0 ? s : s.slice(0, o)),
      a = o < 0 ? null : jr(s.slice(o + 1));
    if (i in t) {
      let l = t[i];
      (Lt(l) || (l = t[i] = [l]), l.push(a));
    } else t[i] = a;
  }
  return t;
}
function il(e) {
  let t = '';
  for (let n in e) {
    const r = e[n];
    if (((n = Um(n)), r == null)) {
      r !== void 0 && (t += (t.length ? '&' : '') + n);
      continue;
    }
    (Lt(r) ? r.map(s => s && ii(s)) : [r && ii(r)]).forEach(s => {
      s !== void 0 && ((t += (t.length ? '&' : '') + n), s != null && (t += '=' + s));
    });
  }
  return t;
}
function sg(e) {
  const t = {};
  for (const n in e) {
    const r = e[n];
    r !== void 0 && (t[n] = Lt(r) ? r.map(s => (s == null ? null : '' + s)) : r == null ? r : '' + r);
  }
  return t;
}
const og = Symbol(''),
  al = Symbol(''),
  io = Symbol(''),
  Gi = Symbol(''),
  ci = Symbol('');
function _r() {
  let e = [];
  function t(r) {
    return (
      e.push(r),
      () => {
        const s = e.indexOf(r);
        s > -1 && e.splice(s, 1);
      }
    );
  }
  function n() {
    e = [];
  }
  return { add: t, list: () => e.slice(), reset: n };
}
function un(e, t, n, r, s, o = i => i()) {
  const i = r && (r.enterCallbacks[s] = r.enterCallbacks[s] || []);
  return () =>
    new Promise((a, l) => {
      const c = d => {
          d === !1
            ? l(Zn(De.NAVIGATION_ABORTED, { from: n, to: t }))
            : d instanceof Error
              ? l(d)
              : eg(d)
                ? l(Zn(De.NAVIGATION_GUARD_REDIRECT, { from: t, to: d }))
                : (i && r.enterCallbacks[s] === i && typeof d == 'function' && i.push(d), a());
        },
        u = o(() => e.call(r && r.instances[s], t, n, c));
      let f = Promise.resolve(u);
      (e.length < 3 && (f = f.then(c)), f.catch(d => l(d)));
    });
}
function Do(e, t, n, r, s = o => o()) {
  const o = [];
  for (const i of e)
    for (const a in i.components) {
      let l = i.components[a];
      if (!(t !== 'beforeRouteEnter' && !i.instances[a]))
        if (Xu(l)) {
          const c = (l.__vccOpts || l)[t];
          c && o.push(un(c, n, r, i, a, s));
        } else {
          let c = l();
          o.push(() =>
            c.then(u => {
              if (!u) throw new Error(`Couldn't resolve component "${a}" at "${i.path}"`);
              const f = Rm(u) ? u.default : u;
              ((i.mods[a] = u), (i.components[a] = f));
              const d = (f.__vccOpts || f)[t];
              return d && un(d, n, r, i, a, s)();
            })
          );
        }
    }
  return o;
}
function ig(e, t) {
  const n = [],
    r = [],
    s = [],
    o = Math.max(t.matched.length, e.matched.length);
  for (let i = 0; i < o; i++) {
    const a = t.matched[i];
    a && (e.matched.find(c => Qn(c, a)) ? r.push(a) : n.push(a));
    const l = e.matched[i];
    l && (t.matched.find(c => Qn(c, l)) || s.push(l));
  }
  return [n, r, s];
}
/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */ let ag = () => location.protocol + '//' + location.host;
function sf(e, t) {
  const { pathname: n, search: r, hash: s } = t,
    o = e.indexOf('#');
  if (o > -1) {
    let i = s.includes(e.slice(o)) ? e.slice(o).length : 1,
      a = s.slice(i);
    return (a[0] !== '/' && (a = '/' + a), rl(a, ''));
  }
  return rl(n, e) + r + s;
}
function lg(e, t, n, r) {
  let s = [],
    o = [],
    i = null;
  const a = ({ state: d }) => {
    const h = sf(e, location),
      p = n.value,
      y = t.value;
    let S = 0;
    if (d) {
      if (((n.value = h), (t.value = d), i && i === p)) {
        i = null;
        return;
      }
      S = y ? d.position - y.position : 0;
    } else r(h);
    s.forEach(A => {
      A(n.value, p, { delta: S, type: ai.pop, direction: S ? (S > 0 ? Po.forward : Po.back) : Po.unknown });
    });
  };
  function l() {
    i = n.value;
  }
  function c(d) {
    s.push(d);
    const h = () => {
      const p = s.indexOf(d);
      p > -1 && s.splice(p, 1);
    };
    return (o.push(h), h);
  }
  function u() {
    if (document.visibilityState === 'hidden') {
      const { history: d } = window;
      if (!d.state) return;
      d.replaceState(be({}, d.state, { scroll: oo() }), '');
    }
  }
  function f() {
    for (const d of o) d();
    ((o = []),
      window.removeEventListener('popstate', a),
      window.removeEventListener('pagehide', u),
      document.removeEventListener('visibilitychange', u));
  }
  return (
    window.addEventListener('popstate', a),
    window.addEventListener('pagehide', u),
    document.addEventListener('visibilitychange', u),
    { pauseListeners: l, listen: c, destroy: f }
  );
}
function ll(e, t, n, r = !1, s = !1) {
  return { back: e, current: t, forward: n, replaced: r, position: window.history.length, scroll: s ? oo() : null };
}
function cg(e) {
  const { history: t, location: n } = window,
    r = { value: sf(e, n) },
    s = { value: t.state };
  s.value ||
    o(r.value, { back: null, current: r.value, forward: null, position: t.length - 1, replaced: !0, scroll: null }, !0);
  function o(l, c, u) {
    const f = e.indexOf('#'),
      d = f > -1 ? (n.host && document.querySelector('base') ? e : e.slice(f)) + l : ag() + e + l;
    try {
      (t[u ? 'replaceState' : 'pushState'](c, '', d), (s.value = c));
    } catch (h) {
      (console.error(h), n[u ? 'replace' : 'assign'](d));
    }
  }
  function i(l, c) {
    (o(l, be({}, t.state, ll(s.value.back, l, s.value.forward, !0), c, { position: s.value.position }), !0),
      (r.value = l));
  }
  function a(l, c) {
    const u = be({}, s.value, t.state, { forward: l, scroll: oo() });
    (o(u.current, u, !0), o(l, be({}, ll(r.value, l, null), { position: u.position + 1 }, c), !1), (r.value = l));
  }
  return { location: r, state: s, push: a, replace: i };
}
function ug(e) {
  e = qm(e);
  const t = cg(e),
    n = lg(e, t.state, t.location, t.replace);
  function r(o, i = !0) {
    (i || n.pauseListeners(), history.go(o));
  }
  const s = be({ location: '', base: e, go: r, createHref: Xm.bind(null, e) }, t, n);
  return (
    Object.defineProperty(s, 'location', { enumerable: !0, get: () => t.location.value }),
    Object.defineProperty(s, 'state', { enumerable: !0, get: () => t.state.value }),
    s
  );
}
let Rn = (function (e) {
  return ((e[(e.Static = 0)] = 'Static'), (e[(e.Param = 1)] = 'Param'), (e[(e.Group = 2)] = 'Group'), e);
})({});
var He = (function (e) {
  return (
    (e[(e.Static = 0)] = 'Static'),
    (e[(e.Param = 1)] = 'Param'),
    (e[(e.ParamRegExp = 2)] = 'ParamRegExp'),
    (e[(e.ParamRegExpEnd = 3)] = 'ParamRegExpEnd'),
    (e[(e.EscapeNext = 4)] = 'EscapeNext'),
    e
  );
})(He || {});
const fg = { type: Rn.Static, value: '' },
  dg = /[a-zA-Z0-9_]/;
function hg(e) {
  if (!e) return [[]];
  if (e === '/') return [[fg]];
  if (!e.startsWith('/')) throw new Error(`Invalid path "${e}"`);
  function t(h) {
    throw new Error(`ERR (${n})/"${c}": ${h}`);
  }
  let n = He.Static,
    r = n;
  const s = [];
  let o;
  function i() {
    (o && s.push(o), (o = []));
  }
  let a = 0,
    l,
    c = '',
    u = '';
  function f() {
    c &&
      (n === He.Static
        ? o.push({ type: Rn.Static, value: c })
        : n === He.Param || n === He.ParamRegExp || n === He.ParamRegExpEnd
          ? (o.length > 1 &&
              (l === '*' || l === '+') &&
              t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),
            o.push({
              type: Rn.Param,
              value: c,
              regexp: u,
              repeatable: l === '*' || l === '+',
              optional: l === '*' || l === '?'
            }))
          : t('Invalid state to consume buffer'),
      (c = ''));
  }
  function d() {
    c += l;
  }
  for (; a < e.length; ) {
    if (((l = e[a++]), l === '\\' && n !== He.ParamRegExp)) {
      ((r = n), (n = He.EscapeNext));
      continue;
    }
    switch (n) {
      case He.Static:
        l === '/' ? (c && f(), i()) : l === ':' ? (f(), (n = He.Param)) : d();
        break;
      case He.EscapeNext:
        (d(), (n = r));
        break;
      case He.Param:
        l === '('
          ? (n = He.ParamRegExp)
          : dg.test(l)
            ? d()
            : (f(), (n = He.Static), l !== '*' && l !== '?' && l !== '+' && a--);
        break;
      case He.ParamRegExp:
        l === ')' ? (u[u.length - 1] == '\\' ? (u = u.slice(0, -1) + l) : (n = He.ParamRegExpEnd)) : (u += l);
        break;
      case He.ParamRegExpEnd:
        (f(), (n = He.Static), l !== '*' && l !== '?' && l !== '+' && a--, (u = ''));
        break;
      default:
        t('Unknown state');
        break;
    }
  }
  return (n === He.ParamRegExp && t(`Unfinished custom RegExp for param "${c}"`), f(), i(), s);
}
const cl = '[^/]+?',
  pg = { sensitive: !1, strict: !1, start: !0, end: !0 };
var at = (function (e) {
  return (
    (e[(e._multiplier = 10)] = '_multiplier'),
    (e[(e.Root = 90)] = 'Root'),
    (e[(e.Segment = 40)] = 'Segment'),
    (e[(e.SubSegment = 30)] = 'SubSegment'),
    (e[(e.Static = 40)] = 'Static'),
    (e[(e.Dynamic = 20)] = 'Dynamic'),
    (e[(e.BonusCustomRegExp = 10)] = 'BonusCustomRegExp'),
    (e[(e.BonusWildcard = -50)] = 'BonusWildcard'),
    (e[(e.BonusRepeatable = -20)] = 'BonusRepeatable'),
    (e[(e.BonusOptional = -8)] = 'BonusOptional'),
    (e[(e.BonusStrict = 0.7000000000000001)] = 'BonusStrict'),
    (e[(e.BonusCaseSensitive = 0.25)] = 'BonusCaseSensitive'),
    e
  );
})(at || {});
const mg = /[.+*?^${}()[\]/\\]/g;
function gg(e, t) {
  const n = be({}, pg, t),
    r = [];
  let s = n.start ? '^' : '';
  const o = [];
  for (const c of e) {
    const u = c.length ? [] : [at.Root];
    n.strict && !c.length && (s += '/');
    for (let f = 0; f < c.length; f++) {
      const d = c[f];
      let h = at.Segment + (n.sensitive ? at.BonusCaseSensitive : 0);
      if (d.type === Rn.Static) (f || (s += '/'), (s += d.value.replace(mg, '\\$&')), (h += at.Static));
      else if (d.type === Rn.Param) {
        const { value: p, repeatable: y, optional: S, regexp: A } = d;
        o.push({ name: p, repeatable: y, optional: S });
        const T = A || cl;
        if (T !== cl) {
          h += at.BonusCustomRegExp;
          try {
            `${T}`;
          } catch (g) {
            throw new Error(`Invalid custom RegExp for param "${p}" (${T}): ` + g.message);
          }
        }
        let E = y ? `((?:${T})(?:/(?:${T}))*)` : `(${T})`;
        (f || (E = S && c.length < 2 ? `(?:/${E})` : '/' + E),
          S && (E += '?'),
          (s += E),
          (h += at.Dynamic),
          S && (h += at.BonusOptional),
          y && (h += at.BonusRepeatable),
          T === '.*' && (h += at.BonusWildcard));
      }
      u.push(h);
    }
    r.push(u);
  }
  if (n.strict && n.end) {
    const c = r.length - 1;
    r[c][r[c].length - 1] += at.BonusStrict;
  }
  (n.strict || (s += '/?'), n.end ? (s += '$') : n.strict && !s.endsWith('/') && (s += '(?:/|$)'));
  const i = new RegExp(s, n.sensitive ? '' : 'i');
  function a(c) {
    const u = c.match(i),
      f = {};
    if (!u) return null;
    for (let d = 1; d < u.length; d++) {
      const h = u[d] || '',
        p = o[d - 1];
      f[p.name] = h && p.repeatable ? h.split('/') : h;
    }
    return f;
  }
  function l(c) {
    let u = '',
      f = !1;
    for (const d of e) {
      ((!f || !u.endsWith('/')) && (u += '/'), (f = !1));
      for (const h of d)
        if (h.type === Rn.Static) u += h.value;
        else if (h.type === Rn.Param) {
          const { value: p, repeatable: y, optional: S } = h,
            A = p in c ? c[p] : '';
          if (Lt(A) && !y)
            throw new Error(`Provided param "${p}" is an array but it is not repeatable (* or + modifiers)`);
          const T = Lt(A) ? A.join('/') : A;
          if (!T)
            if (S) d.length < 2 && (u.endsWith('/') ? (u = u.slice(0, -1)) : (f = !0));
            else throw new Error(`Missing required param "${p}"`);
          u += T;
        }
    }
    return u || '/';
  }
  return { re: i, score: r, keys: o, parse: a, stringify: l };
}
function _g(e, t) {
  let n = 0;
  for (; n < e.length && n < t.length; ) {
    const r = t[n] - e[n];
    if (r) return r;
    n++;
  }
  return e.length < t.length
    ? e.length === 1 && e[0] === at.Static + at.Segment
      ? -1
      : 1
    : e.length > t.length
      ? t.length === 1 && t[0] === at.Static + at.Segment
        ? 1
        : -1
      : 0;
}
function of(e, t) {
  let n = 0;
  const r = e.score,
    s = t.score;
  for (; n < r.length && n < s.length; ) {
    const o = _g(r[n], s[n]);
    if (o) return o;
    n++;
  }
  if (Math.abs(s.length - r.length) === 1) {
    if (ul(r)) return 1;
    if (ul(s)) return -1;
  }
  return s.length - r.length;
}
function ul(e) {
  const t = e[e.length - 1];
  return e.length > 0 && t[t.length - 1] < 0;
}
const yg = { strict: !1, end: !0, sensitive: !1 };
function Eg(e, t, n) {
  const r = gg(hg(e.path), n),
    s = be(r, { record: e, parent: t, children: [], alias: [] });
  return (t && !s.record.aliasOf == !t.record.aliasOf && t.children.push(s), s);
}
function bg(e, t) {
  const n = [],
    r = new Map();
  t = nl(yg, t);
  function s(f) {
    return r.get(f);
  }
  function o(f, d, h) {
    const p = !h,
      y = dl(f);
    y.aliasOf = h && h.record;
    const S = nl(t, f),
      A = [y];
    if ('alias' in f) {
      const g = typeof f.alias == 'string' ? [f.alias] : f.alias;
      for (const C of g)
        A.push(
          dl(be({}, y, { components: h ? h.record.components : y.components, path: C, aliasOf: h ? h.record : y }))
        );
    }
    let T, E;
    for (const g of A) {
      const { path: C } = g;
      if (d && C[0] !== '/') {
        const I = d.record.path,
          D = I[I.length - 1] === '/' ? '' : '/';
        g.path = d.record.path + (C && D + C);
      }
      if (
        ((T = Eg(g, d, S)),
        h ? h.alias.push(T) : ((E = E || T), E !== T && E.alias.push(T), p && f.name && !hl(T) && i(f.name)),
        af(T) && l(T),
        y.children)
      ) {
        const I = y.children;
        for (let D = 0; D < I.length; D++) o(I[D], T, h && h.children[D]);
      }
      h = h || T;
    }
    return E
      ? () => {
          i(E);
        }
      : Pr;
  }
  function i(f) {
    if (nf(f)) {
      const d = r.get(f);
      d && (r.delete(f), n.splice(n.indexOf(d), 1), d.children.forEach(i), d.alias.forEach(i));
    } else {
      const d = n.indexOf(f);
      d > -1 && (n.splice(d, 1), f.record.name && r.delete(f.record.name), f.children.forEach(i), f.alias.forEach(i));
    }
  }
  function a() {
    return n;
  }
  function l(f) {
    const d = Ag(f, n);
    (n.splice(d, 0, f), f.record.name && !hl(f) && r.set(f.record.name, f));
  }
  function c(f, d) {
    let h,
      p = {},
      y,
      S;
    if ('name' in f && f.name) {
      if (((h = r.get(f.name)), !h)) throw Zn(De.MATCHER_NOT_FOUND, { location: f });
      ((S = h.record.name),
        (p = be(
          fl(
            d.params,
            h.keys
              .filter(E => !E.optional)
              .concat(h.parent ? h.parent.keys.filter(E => E.optional) : [])
              .map(E => E.name)
          ),
          f.params &&
            fl(
              f.params,
              h.keys.map(E => E.name)
            )
        )),
        (y = h.stringify(p)));
    } else if (f.path != null)
      ((y = f.path), (h = n.find(E => E.re.test(y))), h && ((p = h.parse(y)), (S = h.record.name)));
    else {
      if (((h = d.name ? r.get(d.name) : n.find(E => E.re.test(d.path))), !h))
        throw Zn(De.MATCHER_NOT_FOUND, { location: f, currentLocation: d });
      ((S = h.record.name), (p = be({}, d.params, f.params)), (y = h.stringify(p)));
    }
    const A = [];
    let T = h;
    for (; T; ) (A.unshift(T.record), (T = T.parent));
    return { name: S, path: y, params: p, matched: A, meta: Sg(A) };
  }
  e.forEach(f => o(f));
  function u() {
    ((n.length = 0), r.clear());
  }
  return { addRoute: o, resolve: c, removeRoute: i, clearRoutes: u, getRoutes: a, getRecordMatcher: s };
}
function fl(e, t) {
  const n = {};
  for (const r of t) r in e && (n[r] = e[r]);
  return n;
}
function dl(e) {
  const t = {
    path: e.path,
    redirect: e.redirect,
    name: e.name,
    meta: e.meta || {},
    aliasOf: e.aliasOf,
    beforeEnter: e.beforeEnter,
    props: vg(e),
    children: e.children || [],
    instances: {},
    leaveGuards: new Set(),
    updateGuards: new Set(),
    enterCallbacks: {},
    components: 'components' in e ? e.components || null : e.component && { default: e.component }
  };
  return (Object.defineProperty(t, 'mods', { value: {} }), t);
}
function vg(e) {
  const t = {},
    n = e.props || !1;
  if ('component' in e) t.default = n;
  else for (const r in e.components) t[r] = typeof n == 'object' ? n[r] : n;
  return t;
}
function hl(e) {
  for (; e; ) {
    if (e.record.aliasOf) return !0;
    e = e.parent;
  }
  return !1;
}
function Sg(e) {
  return e.reduce((t, n) => be(t, n.meta), {});
}
function Ag(e, t) {
  let n = 0,
    r = t.length;
  for (; n !== r; ) {
    const o = (n + r) >> 1;
    of(e, t[o]) < 0 ? (r = o) : (n = o + 1);
  }
  const s = Tg(e);
  return (s && (r = t.lastIndexOf(s, r - 1)), r);
}
function Tg(e) {
  let t = e;
  for (; (t = t.parent); ) if (af(t) && of(e, t) === 0) return t;
}
function af({ record: e }) {
  return !!(e.name || (e.components && Object.keys(e.components).length) || e.redirect);
}
function pl(e) {
  const t = mt(io),
    n = mt(Gi),
    r = Ae(() => {
      const l = Xt(e.to);
      return t.resolve(l);
    }),
    s = Ae(() => {
      const { matched: l } = r.value,
        { length: c } = l,
        u = l[c - 1],
        f = n.matched;
      if (!u || !f.length) return -1;
      const d = f.findIndex(Qn.bind(null, u));
      if (d > -1) return d;
      const h = ml(l[c - 2]);
      return c > 1 && ml(u) === h && f[f.length - 1].path !== h ? f.findIndex(Qn.bind(null, l[c - 2])) : d;
    }),
    o = Ae(() => s.value > -1 && Lg(n.params, r.value.params)),
    i = Ae(() => s.value > -1 && s.value === n.matched.length - 1 && tf(n.params, r.value.params));
  function a(l = {}) {
    if (Cg(l)) {
      const c = t[Xt(e.replace) ? 'replace' : 'push'](Xt(e.to)).catch(Pr);
      return (
        e.viewTransition &&
          typeof document < 'u' &&
          'startViewTransition' in document &&
          document.startViewTransition(() => c),
        c
      );
    }
    return Promise.resolve();
  }
  return { route: r, href: Ae(() => r.value.href), isActive: o, isExactActive: i, navigate: a };
}
function wg(e) {
  return e.length === 1 ? e[0] : e;
}
const Og = kn({
    name: 'RouterLink',
    compatConfig: { MODE: 3 },
    props: {
      to: { type: [String, Object], required: !0 },
      replace: Boolean,
      activeClass: String,
      exactActiveClass: String,
      custom: Boolean,
      ariaCurrentValue: { type: String, default: 'page' },
      viewTransition: Boolean
    },
    useLink: pl,
    setup(e, { slots: t }) {
      const n = qr(pl(e)),
        { options: r } = mt(io),
        s = Ae(() => ({
          [gl(e.activeClass, r.linkActiveClass, 'router-link-active')]: n.isActive,
          [gl(e.exactActiveClass, r.linkExactActiveClass, 'router-link-exact-active')]: n.isExactActive
        }));
      return () => {
        const o = t.default && wg(t.default(n));
        return e.custom
          ? o
          : Zr(
              'a',
              {
                'aria-current': n.isExactActive ? e.ariaCurrentValue : null,
                href: n.href,
                onClick: n.navigate,
                class: s.value
              },
              o
            );
      };
    }
  }),
  Rg = Og;
function Cg(e) {
  if (
    !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
    !e.defaultPrevented &&
    !(e.button !== void 0 && e.button !== 0)
  ) {
    if (e.currentTarget && e.currentTarget.getAttribute) {
      const t = e.currentTarget.getAttribute('target');
      if (/\b_blank\b/i.test(t)) return;
    }
    return (e.preventDefault && e.preventDefault(), !0);
  }
}
function Lg(e, t) {
  for (const n in t) {
    const r = t[n],
      s = e[n];
    if (typeof r == 'string') {
      if (r !== s) return !1;
    } else if (!Lt(s) || s.length !== r.length || r.some((o, i) => o.valueOf() !== s[i].valueOf())) return !1;
  }
  return !0;
}
function ml(e) {
  return e ? (e.aliasOf ? e.aliasOf.path : e.path) : '';
}
const gl = (e, t, n) => e ?? t ?? n,
  Ng = kn({
    name: 'RouterView',
    inheritAttrs: !1,
    props: { name: { type: String, default: 'default' }, route: Object },
    compatConfig: { MODE: 3 },
    setup(e, { attrs: t, slots: n }) {
      const r = mt(ci),
        s = Ae(() => e.route || r.value),
        o = mt(al, 0),
        i = Ae(() => {
          let c = Xt(o);
          const { matched: u } = s.value;
          let f;
          for (; (f = u[c]) && !f.components; ) c++;
          return c;
        }),
        a = Ae(() => s.value.matched[i.value]);
      (ms(
        al,
        Ae(() => i.value + 1)
      ),
        ms(og, a),
        ms(ci, s));
      const l = le();
      return (
        vt(
          () => [l.value, a.value, e.name],
          ([c, u, f], [d, h, p]) => {
            (u &&
              ((u.instances[f] = c),
              h &&
                h !== u &&
                c &&
                c === d &&
                (u.leaveGuards.size || (u.leaveGuards = h.leaveGuards),
                u.updateGuards.size || (u.updateGuards = h.updateGuards))),
              c && u && (!h || !Qn(u, h) || !d) && (u.enterCallbacks[f] || []).forEach(y => y(c)));
          },
          { flush: 'post' }
        ),
        () => {
          const c = s.value,
            u = e.name,
            f = a.value,
            d = f && f.components[u];
          if (!d) return _l(n.default, { Component: d, route: c });
          const h = f.props[u],
            p = h ? (h === !0 ? c.params : typeof h == 'function' ? h(c) : h) : null,
            S = Zr(
              d,
              be({}, p, t, {
                onVnodeUnmounted: A => {
                  A.component.isUnmounted && (f.instances[u] = null);
                },
                ref: l
              })
            );
          return _l(n.default, { Component: S, route: c }) || S;
        }
      );
    }
  });
function _l(e, t) {
  if (!e) return null;
  const n = e(t);
  return n.length === 1 ? n[0] : n;
}
const Ig = Ng;
function Pg(e) {
  const t = bg(e.routes, e),
    n = e.parseQuery || rg,
    r = e.stringifyQuery || il,
    s = e.history,
    o = _r(),
    i = _r(),
    a = _r(),
    l = zs(sn);
  let c = sn;
  Hn && e.scrollBehavior && 'scrollRestoration' in history && (history.scrollRestoration = 'manual');
  const u = No.bind(null, U => '' + U),
    f = No.bind(null, Hm),
    d = No.bind(null, jr);
  function h(U, Y) {
    let K, Q;
    return (nf(U) ? ((K = t.getRecordMatcher(U)), (Q = Y)) : (Q = U), t.addRoute(Q, K));
  }
  function p(U) {
    const Y = t.getRecordMatcher(U);
    Y && t.removeRoute(Y);
  }
  function y() {
    return t.getRoutes().map(U => U.record);
  }
  function S(U) {
    return !!t.getRecordMatcher(U);
  }
  function A(U, Y) {
    if (((Y = be({}, Y || l.value)), typeof U == 'string')) {
      const v = Io(n, U, Y.path),
        w = t.resolve({ path: v.path }, Y),
        R = s.createHref(v.fullPath);
      return be(v, w, { params: d(w.params), hash: jr(v.hash), redirectedFrom: void 0, href: R });
    }
    let K;
    if (U.path != null) K = be({}, U, { path: Io(n, U.path, Y.path).path });
    else {
      const v = be({}, U.params);
      for (const w in v) v[w] == null && delete v[w];
      ((K = be({}, U, { params: f(v) })), (Y.params = f(Y.params)));
    }
    const Q = t.resolve(K, Y),
      ae = U.hash || '';
    Q.params = u(d(Q.params));
    const b = Bm(r, be({}, U, { hash: Mm(ae), path: Q.path })),
      O = s.createHref(b);
    return be({ fullPath: b, hash: ae, query: r === il ? sg(U.query) : U.query || {} }, Q, {
      redirectedFrom: void 0,
      href: O
    });
  }
  function T(U) {
    return typeof U == 'string' ? Io(n, U, l.value.path) : be({}, U);
  }
  function E(U, Y) {
    if (c !== U) return Zn(De.NAVIGATION_CANCELLED, { from: Y, to: U });
  }
  function g(U) {
    return D(U);
  }
  function C(U) {
    return g(be(T(U), { replace: !0 }));
  }
  function I(U, Y) {
    const K = U.matched[U.matched.length - 1];
    if (K && K.redirect) {
      const { redirect: Q } = K;
      let ae = typeof Q == 'function' ? Q(U, Y) : Q;
      return (
        typeof ae == 'string' &&
          ((ae = ae.includes('?') || ae.includes('#') ? (ae = T(ae)) : { path: ae }), (ae.params = {})),
        be({ query: U.query, hash: U.hash, params: ae.path != null ? {} : U.params }, ae)
      );
    }
  }
  function D(U, Y) {
    const K = (c = A(U)),
      Q = l.value,
      ae = U.state,
      b = U.force,
      O = U.replace === !0,
      v = I(K, Q);
    if (v) return D(be(T(v), { state: typeof v == 'object' ? be({}, ae, v.state) : ae, force: b, replace: O }), Y || K);
    const w = K;
    w.redirectedFrom = Y;
    let R;
    return (
      !b && Wm(r, Q, K) && ((R = Zn(De.NAVIGATION_DUPLICATED, { to: w, from: Q })), ue(Q, Q, !0, !1)),
      (R ? Promise.resolve(R) : H(w, Q))
        .catch(L => (Ht(L) ? (Ht(L, De.NAVIGATION_GUARD_REDIRECT) ? L : Le(L)) : de(L, w, Q)))
        .then(L => {
          if (L) {
            if (Ht(L, De.NAVIGATION_GUARD_REDIRECT))
              return D(
                be({ replace: O }, T(L.to), { state: typeof L.to == 'object' ? be({}, ae, L.to.state) : ae, force: b }),
                Y || w
              );
          } else L = M(w, Q, !0, O, ae);
          return (W(w, Q, L), L);
        })
    );
  }
  function F(U, Y) {
    const K = E(U, Y);
    return K ? Promise.reject(K) : Promise.resolve();
  }
  function P(U) {
    const Y = xe.values().next().value;
    return Y && typeof Y.runWithContext == 'function' ? Y.runWithContext(U) : U();
  }
  function H(U, Y) {
    let K;
    const [Q, ae, b] = ig(U, Y);
    K = Do(Q.reverse(), 'beforeRouteLeave', U, Y);
    for (const v of Q)
      v.leaveGuards.forEach(w => {
        K.push(un(w, U, Y));
      });
    const O = F.bind(null, U, Y);
    return (
      K.push(O),
      ne(K)
        .then(() => {
          K = [];
          for (const v of o.list()) K.push(un(v, U, Y));
          return (K.push(O), ne(K));
        })
        .then(() => {
          K = Do(ae, 'beforeRouteUpdate', U, Y);
          for (const v of ae)
            v.updateGuards.forEach(w => {
              K.push(un(w, U, Y));
            });
          return (K.push(O), ne(K));
        })
        .then(() => {
          K = [];
          for (const v of b)
            if (v.beforeEnter)
              if (Lt(v.beforeEnter)) for (const w of v.beforeEnter) K.push(un(w, U, Y));
              else K.push(un(v.beforeEnter, U, Y));
          return (K.push(O), ne(K));
        })
        .then(
          () => (
            U.matched.forEach(v => (v.enterCallbacks = {})),
            (K = Do(b, 'beforeRouteEnter', U, Y, P)),
            K.push(O),
            ne(K)
          )
        )
        .then(() => {
          K = [];
          for (const v of i.list()) K.push(un(v, U, Y));
          return (K.push(O), ne(K));
        })
        .catch(v => (Ht(v, De.NAVIGATION_CANCELLED) ? v : Promise.reject(v)))
    );
  }
  function W(U, Y, K) {
    a.list().forEach(Q => P(() => Q(U, Y, K)));
  }
  function M(U, Y, K, Q, ae) {
    const b = E(U, Y);
    if (b) return b;
    const O = Y === sn,
      v = Hn ? history.state : {};
    (K && (Q || O ? s.replace(U.fullPath, be({ scroll: O && v && v.scroll }, ae)) : s.push(U.fullPath, ae)),
      (l.value = U),
      ue(U, Y, K, O),
      Le());
  }
  let z;
  function ie() {
    z ||
      (z = s.listen((U, Y, K) => {
        if (!We.listening) return;
        const Q = A(U),
          ae = I(Q, We.currentRoute.value);
        if (ae) {
          D(be(ae, { replace: !0, force: !0 }), Q).catch(Pr);
          return;
        }
        c = Q;
        const b = l.value;
        (Hn && Qm(ol(b.fullPath, K.delta), oo()),
          H(Q, b)
            .catch(O =>
              Ht(O, De.NAVIGATION_ABORTED | De.NAVIGATION_CANCELLED)
                ? O
                : Ht(O, De.NAVIGATION_GUARD_REDIRECT)
                  ? (D(be(T(O.to), { force: !0 }), Q)
                      .then(v => {
                        Ht(v, De.NAVIGATION_ABORTED | De.NAVIGATION_DUPLICATED) &&
                          !K.delta &&
                          K.type === ai.pop &&
                          s.go(-1, !1);
                      })
                      .catch(Pr),
                    Promise.reject())
                  : (K.delta && s.go(-K.delta, !1), de(O, Q, b))
            )
            .then(O => {
              ((O = O || M(Q, b, !1)),
                O &&
                  (K.delta && !Ht(O, De.NAVIGATION_CANCELLED)
                    ? s.go(-K.delta, !1)
                    : K.type === ai.pop && Ht(O, De.NAVIGATION_ABORTED | De.NAVIGATION_DUPLICATED) && s.go(-1, !1)),
                W(Q, b, O));
            })
            .catch(Pr));
      }));
  }
  let Se = _r(),
    se = _r(),
    te;
  function de(U, Y, K) {
    Le(U);
    const Q = se.list();
    return (Q.length ? Q.forEach(ae => ae(U, Y, K)) : console.error(U), Promise.reject(U));
  }
  function Me() {
    return te && l.value !== sn
      ? Promise.resolve()
      : new Promise((U, Y) => {
          Se.add([U, Y]);
        });
  }
  function Le(U) {
    return (te || ((te = !U), ie(), Se.list().forEach(([Y, K]) => (U ? K(U) : Y())), Se.reset()), U);
  }
  function ue(U, Y, K, Q) {
    const { scrollBehavior: ae } = e;
    if (!Hn || !ae) return Promise.resolve();
    const b = (!K && Zm(ol(U.fullPath, 0))) || ((Q || !K) && history.state && history.state.scroll) || null;
    return ar()
      .then(() => ae(U, Y, b))
      .then(O => O && zm(O))
      .catch(O => de(O, U, Y));
  }
  const pe = U => s.go(U);
  let Ne;
  const xe = new Set(),
    We = {
      currentRoute: l,
      listening: !0,
      addRoute: h,
      removeRoute: p,
      clearRoutes: t.clearRoutes,
      hasRoute: S,
      getRoutes: y,
      resolve: A,
      options: e,
      push: g,
      replace: C,
      go: pe,
      back: () => pe(-1),
      forward: () => pe(1),
      beforeEach: o.add,
      beforeResolve: i.add,
      afterEach: a.add,
      onError: se.add,
      isReady: Me,
      install(U) {
        (U.component('RouterLink', Rg),
          U.component('RouterView', Ig),
          (U.config.globalProperties.$router = We),
          Object.defineProperty(U.config.globalProperties, '$route', { enumerable: !0, get: () => Xt(l) }),
          Hn && !Ne && l.value === sn && ((Ne = !0), g(s.location).catch(Q => {})));
        const Y = {};
        for (const Q in sn) Object.defineProperty(Y, Q, { get: () => l.value[Q], enumerable: !0 });
        (U.provide(io, We), U.provide(Gi, jc(Y)), U.provide(ci, l));
        const K = U.unmount;
        (xe.add(U),
          (U.unmount = function () {
            (xe.delete(U), xe.size < 1 && ((c = sn), z && z(), (z = null), (l.value = sn), (Ne = !1), (te = !1)), K());
          }));
      }
    };
  function ne(U) {
    return U.reduce((Y, K) => Y.then(() => P(K)), Promise.resolve());
  }
  return We;
}
function Cv() {
  return mt(io);
}
function Lv(e) {
  return mt(Gi);
}
var Dg =
  typeof globalThis < 'u'
    ? globalThis
    : typeof window < 'u'
      ? window
      : typeof global < 'u'
        ? global
        : typeof self < 'u'
          ? self
          : {};
function xg(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, 'default') ? e.default : e;
}
function Nv(e) {
  if (e.__esModule) return e;
  var t = e.default;
  if (typeof t == 'function') {
    var n = function r() {
      return this instanceof r ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    n.prototype = t.prototype;
  } else n = {};
  return (
    Object.defineProperty(n, '__esModule', { value: !0 }),
    Object.keys(e).forEach(function (r) {
      var s = Object.getOwnPropertyDescriptor(e, r);
      Object.defineProperty(
        n,
        r,
        s.get
          ? s
          : {
              enumerable: !0,
              get: function () {
                return e[r];
              }
            }
      );
    }),
    n
  );
}
var lf = { exports: {} };
/* NProgress, (c) 2013, 2014 Rico Sta. Cruz - http://ricostacruz.com/nprogress
 * @license MIT */ (function (e, t) {
  (function (n, r) {
    e.exports = r();
  })(Dg, function () {
    var n = {};
    n.version = '0.2.0';
    var r = (n.settings = {
      minimum: 0.08,
      easing: 'ease',
      positionUsing: '',
      speed: 200,
      trickle: !0,
      trickleRate: 0.02,
      trickleSpeed: 800,
      showSpinner: !0,
      barSelector: '[role="bar"]',
      spinnerSelector: '[role="spinner"]',
      parent: 'body',
      template:
        '<div class="bar" role="bar"><div class="peg"></div></div><div class="spinner" role="spinner"><div class="spinner-icon"></div></div>'
    });
    ((n.configure = function (p) {
      var y, S;
      for (y in p) ((S = p[y]), S !== void 0 && p.hasOwnProperty(y) && (r[y] = S));
      return this;
    }),
      (n.status = null),
      (n.set = function (p) {
        var y = n.isStarted();
        ((p = s(p, r.minimum, 1)), (n.status = p === 1 ? null : p));
        var S = n.render(!y),
          A = S.querySelector(r.barSelector),
          T = r.speed,
          E = r.easing;
        return (
          S.offsetWidth,
          a(function (g) {
            (r.positionUsing === '' && (r.positionUsing = n.getPositioningCSS()),
              l(A, i(p, T, E)),
              p === 1
                ? (l(S, { transition: 'none', opacity: 1 }),
                  S.offsetWidth,
                  setTimeout(function () {
                    (l(S, { transition: 'all ' + T + 'ms linear', opacity: 0 }),
                      setTimeout(function () {
                        (n.remove(), g());
                      }, T));
                  }, T))
                : setTimeout(g, T));
          }),
          this
        );
      }),
      (n.isStarted = function () {
        return typeof n.status == 'number';
      }),
      (n.start = function () {
        n.status || n.set(0);
        var p = function () {
          setTimeout(function () {
            n.status && (n.trickle(), p());
          }, r.trickleSpeed);
        };
        return (r.trickle && p(), this);
      }),
      (n.done = function (p) {
        return !p && !n.status ? this : n.inc(0.3 + 0.5 * Math.random()).set(1);
      }),
      (n.inc = function (p) {
        var y = n.status;
        return y
          ? (typeof p != 'number' && (p = (1 - y) * s(Math.random() * y, 0.1, 0.95)),
            (y = s(y + p, 0, 0.994)),
            n.set(y))
          : n.start();
      }),
      (n.trickle = function () {
        return n.inc(Math.random() * r.trickleRate);
      }),
      (function () {
        var p = 0,
          y = 0;
        n.promise = function (S) {
          return !S || S.state() === 'resolved'
            ? this
            : (y === 0 && n.start(),
              p++,
              y++,
              S.always(function () {
                (y--, y === 0 ? ((p = 0), n.done()) : n.set((p - y) / p));
              }),
              this);
        };
      })(),
      (n.render = function (p) {
        if (n.isRendered()) return document.getElementById('nprogress');
        u(document.documentElement, 'nprogress-busy');
        var y = document.createElement('div');
        ((y.id = 'nprogress'), (y.innerHTML = r.template));
        var S = y.querySelector(r.barSelector),
          A = p ? '-100' : o(n.status || 0),
          T = document.querySelector(r.parent),
          E;
        return (
          l(S, { transition: 'all 0 linear', transform: 'translate3d(' + A + '%,0,0)' }),
          r.showSpinner || ((E = y.querySelector(r.spinnerSelector)), E && h(E)),
          T != document.body && u(T, 'nprogress-custom-parent'),
          T.appendChild(y),
          y
        );
      }),
      (n.remove = function () {
        (f(document.documentElement, 'nprogress-busy'), f(document.querySelector(r.parent), 'nprogress-custom-parent'));
        var p = document.getElementById('nprogress');
        p && h(p);
      }),
      (n.isRendered = function () {
        return !!document.getElementById('nprogress');
      }),
      (n.getPositioningCSS = function () {
        var p = document.body.style,
          y =
            'WebkitTransform' in p
              ? 'Webkit'
              : 'MozTransform' in p
                ? 'Moz'
                : 'msTransform' in p
                  ? 'ms'
                  : 'OTransform' in p
                    ? 'O'
                    : '';
        return y + 'Perspective' in p ? 'translate3d' : y + 'Transform' in p ? 'translate' : 'margin';
      }));
    function s(p, y, S) {
      return p < y ? y : p > S ? S : p;
    }
    function o(p) {
      return (-1 + p) * 100;
    }
    function i(p, y, S) {
      var A;
      return (
        r.positionUsing === 'translate3d'
          ? (A = { transform: 'translate3d(' + o(p) + '%,0,0)' })
          : r.positionUsing === 'translate'
            ? (A = { transform: 'translate(' + o(p) + '%,0)' })
            : (A = { 'margin-left': o(p) + '%' }),
        (A.transition = 'all ' + y + 'ms ' + S),
        A
      );
    }
    var a = (function () {
        var p = [];
        function y() {
          var S = p.shift();
          S && S(y);
        }
        return function (S) {
          (p.push(S), p.length == 1 && y());
        };
      })(),
      l = (function () {
        var p = ['Webkit', 'O', 'Moz', 'ms'],
          y = {};
        function S(g) {
          return g.replace(/^-ms-/, 'ms-').replace(/-([\da-z])/gi, function (C, I) {
            return I.toUpperCase();
          });
        }
        function A(g) {
          var C = document.body.style;
          if (g in C) return g;
          for (var I = p.length, D = g.charAt(0).toUpperCase() + g.slice(1), F; I--; )
            if (((F = p[I] + D), F in C)) return F;
          return g;
        }
        function T(g) {
          return ((g = S(g)), y[g] || (y[g] = A(g)));
        }
        function E(g, C, I) {
          ((C = T(C)), (g.style[C] = I));
        }
        return function (g, C) {
          var I = arguments,
            D,
            F;
          if (I.length == 2) for (D in C) ((F = C[D]), F !== void 0 && C.hasOwnProperty(D) && E(g, D, F));
          else E(g, I[1], I[2]);
        };
      })();
    function c(p, y) {
      var S = typeof p == 'string' ? p : d(p);
      return S.indexOf(' ' + y + ' ') >= 0;
    }
    function u(p, y) {
      var S = d(p),
        A = S + y;
      c(S, y) || (p.className = A.substring(1));
    }
    function f(p, y) {
      var S = d(p),
        A;
      c(p, y) && ((A = S.replace(' ' + y + ' ', ' ')), (p.className = A.substring(1, A.length - 1)));
    }
    function d(p) {
      return (' ' + (p.className || '') + ' ').replace(/\s+/gi, ' ');
    }
    function h(p) {
      p && p.parentNode && p.parentNode.removeChild(p);
    }
    return n;
  });
})(lf);
var kg = lf.exports;
const Ki = xg(kg);
function cf(e = 'localStorage', t = '') {
  const n = e === 'localStorage' ? localStorage : sessionStorage;
  function r(l) {
    return `${t}${l}`;
  }
  function s(l) {
    try {
      const c = n.getItem(r(l));
      if (!c) return null;
      const u = JSON.parse(c);
      return u.exp && Date.now() > u.exp ? (n.removeItem(r(l)), null) : u.value;
    } catch {
      return null;
    }
  }
  function o(l, c, u) {
    const f = { value: c };
    (u != null && u.exp && (f.exp = Date.now() + u.exp * 1e3), n.setItem(r(l), JSON.stringify(f)));
  }
  function i(l) {
    n.removeItem(r(l));
  }
  function a() {
    Object.keys(n).forEach(c => {
      c.startsWith(t) && n.removeItem(c);
    });
  }
  return { get: s, set: o, del: i, clear: a };
}
const st = cf('localStorage', 'posecraft_'),
  uf =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 150'%3E%3Crect width='150' height='150' fill='%23e2e8f0'/%3E%3Ccircle cx='75' cy='60' r='25' fill='%2394a3b8'/%3E%3Cellipse cx='75' cy='130' rx='40' ry='30' fill='%2394a3b8'/%3E%3C/svg%3E",
  In = Bi('auth', () => {
    const e = le(!1),
      t = le(null),
      n = le(null),
      r = le([]),
      s = le({ allows: [], denies: [] }),
      o = le(!1),
      i = le(0),
      a = le(0),
      l = le(0),
      c = le(0),
      u = le(0),
      f = le(0),
      d = le(0),
      h = le(0),
      p = () => {
        l.value++;
      },
      y = () => {
        f.value++;
      },
      S = le(null),
      A = Ae(() => {
        var w;
        return ((w = S.value) == null ? void 0 : w.avatar) || uf;
      }),
      T = le(0),
      E = le(0),
      g = le('30天内'),
      C = le(st.get('save_login_info') !== !1);
    async function I(w) {
      if (((C.value = w), st.set('save_login_info', w), e.value))
        try {
          const { authApi: R } = await ge(async () => {
            const { authApi: L } = await import('./auth-B31mPbwd.js');
            return { authApi: L };
          }, []);
          await R.updateRememberMe(w);
        } catch (R) {
          console.warn('同步保存登录信息状态失败:', R);
        }
    }
    const D = le([]),
      F = le([]),
      P = le([]),
      H = le([]),
      W = le([]),
      M = Ae(() => r.value.includes('admin') || r.value.includes('posecraft_admin'));
    function z() {
      const w = st.get('user');
      (w &&
        ((t.value = w),
        (e.value = !0),
        (r.value = st.get('roles') || []),
        (s.value = st.get('permissions') || { allows: [], denies: [] })),
        (n.value = st.get('token')));
    }
    function ie(w, R = null, L) {
      ((e.value = w),
        (t.value = R),
        w
          ? (R && st.set('user', R), L && ((n.value = L), st.set('token', L)))
          : ((n.value = null),
            (r.value = []),
            (s.value = { allows: [], denies: [] }),
            (i.value = 0),
            (a.value = 0),
            (l.value = 0),
            (c.value = 0),
            (u.value = 0),
            (f.value = 0),
            (d.value = 0),
            (h.value = 0),
            (T.value = 0),
            (D.value = []),
            (F.value = []),
            (P.value = []),
            (H.value = []),
            (W.value = []),
            (Ne.value = []),
            (S.value = null),
            st.del('user'),
            st.del('token'),
            st.del('roles'),
            st.del('permissions')));
    }
    async function Se() {
      try {
        const { authApi: w } = await ge(async () => {
            const { authApi: L } = await import('./auth-B31mPbwd.js');
            return { authApi: L };
          }, []),
          R = await w.getPermissions();
        ((r.value = R.roles || []),
          (s.value = R.permissions || { allows: [], denies: [] }),
          st.set('roles', r.value),
          st.set('permissions', s.value));
      } catch (w) {
        console.error('获取权限失败:', w);
      }
    }
    async function se() {
      try {
        const { authApi: w } = await ge(async () => {
            const { authApi: L } = await import('./auth-B31mPbwd.js');
            return { authApi: L };
          }, []),
          R = await w.getUserInfo();
        return R
          ? ((t.value = { uid: R.uid, ...R }),
            (e.value = !0),
            st.set('user', t.value),
            await Se().catch(() => {}),
            await K().catch(() => {}),
            (o.value = !0),
            !0)
          : (ie(!1, null), (o.value = !0), !1);
      } catch {
        return (ie(!1, null), (o.value = !0), !1);
      }
    }
    async function te() {
      try {
        const { profileApi: w } = await ge(async () => {
            const { profileApi: j } = await import('./profile-iaXWE0Tu.js');
            return { profileApi: j };
          }, []),
          R = await w.getMyStats(),
          L = (R == null ? void 0 : R.data) || R;
        L &&
          (L.following !== void 0 && (i.value = L.following),
          L.followers !== void 0 && (a.value = L.followers),
          L.works_count !== void 0 && (l.value = L.works_count),
          L.likes_received !== void 0 && (c.value = L.likes_received),
          L.mutual !== void 0 && (u.value = L.mutual),
          L.templates_count !== void 0 && (f.value = L.templates_count),
          L.collects_count !== void 0 && (d.value = L.collects_count),
          L.recommendations_count !== void 0 && (h.value = L.recommendations_count));
      } catch (w) {
        console.warn('获取个人统计失败', w);
      }
    }
    async function de() {
      try {
        const { interactionApi: w } = await ge(async () => {
            const { interactionApi: L } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: L };
          }, []),
          R = await w.getHistoryList({ page: 1, pageSize: 100 });
        W.value = R.list || [];
      } catch (w) {
        console.warn('获取浏览历史失败', w);
      }
    }
    async function Me() {
      try {
        const { workApi: w } = await ge(async () => {
            const { workApi: L } = await import('./work-CSZq0nvF.js');
            return { workApi: L };
          }, []),
          R = await w.getMyWorks({ page: 1, pageSize: 100 });
        D.value = (R == null ? void 0 : R.list) || [];
      } catch (w) {
        console.warn('获取我的作品失败', w);
      }
    }
    async function Le() {
      try {
        const { templateApi: w } = await ge(async () => {
            const { templateApi: L } = await import('./template-C3FhZP8t.js');
            return { templateApi: L };
          }, []),
          R = await w.getMyTemplates({ page: 1, pageSize: 100 });
        F.value = (R == null ? void 0 : R.list) || [];
      } catch (w) {
        console.warn('获取我的模板失败', w);
      }
    }
    async function ue() {
      try {
        const { interactionApi: w } = await ge(async () => {
            const { interactionApi: L } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: L };
          }, []),
          R = await w.getLikesList({ page: 1, pageSize: 100 });
        P.value = R.list || [];
      } catch (w) {
        console.warn('获取点赞列表失败', w);
      }
    }
    async function pe() {
      try {
        const { interactionApi: w } = await ge(async () => {
            const { interactionApi: L } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: L };
          }, []),
          R = await w.getCollectsList({ page: 1, pageSize: 100 });
        H.value = R.list || [];
      } catch (w) {
        console.warn('获取收藏列表失败', w);
      }
    }
    const Ne = le([]);
    async function xe(w = { page: 1, pageSize: 20 }) {
      try {
        const { recommendationApi: R } = await ge(async () => {
            const { recommendationApi: j } = await import('./recommendation-uOBvXcQ3.js');
            return { recommendationApi: j };
          }, []),
          L = await R.getMyList(w);
        Ne.value = (L == null ? void 0 : L.list) || [];
      } catch (R) {
        console.warn('获取推荐列表失败', R);
      }
    }
    async function We(w) {
      try {
        const { recommendationApi: R } = await ge(async () => {
          const { recommendationApi: L } = await import('./recommendation-uOBvXcQ3.js');
          return { recommendationApi: L };
        }, []);
        (w.workId
          ? await R.cancelRecommendWork(w.workId)
          : w.templateId && (await R.cancelRecommendTemplate(w.templateId)),
          (Ne.value = Ne.value.filter(
            L => !(w.workId && L.target_id === w.workId) && !(w.templateId && L.target_id === w.templateId)
          )),
          (h.value = Math.max(0, h.value - 1)));
      } catch (R) {
        console.warn('取消推荐失败', R);
      }
    }
    async function ne(w) {
      if (e.value)
        try {
          const { interactionApi: R } = await ge(async () => {
            const { interactionApi: L } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: L };
          }, []);
          (await R.recordHistory(w), de());
        } catch (R) {
          console.error('记录历史失败', R);
        }
    }
    async function U(w) {
      if (!e.value) return !1;
      try {
        const { interactionApi: R } = await ge(async () => {
            const { interactionApi: j } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: j };
          }, []),
          L = await R.toggleLike(w);
        if (L && L.liked !== void 0) return (ue(), !0);
      } catch (R) {
        console.error('点赞操作失败', R);
      }
      return !1;
    }
    async function Y(w) {
      if (!e.value) return !1;
      try {
        const { interactionApi: R } = await ge(async () => {
            const { interactionApi: j } = await import('./interaction-BQbDjw-F.js');
            return { interactionApi: j };
          }, []),
          L = await R.toggleCollect(w);
        if (L && L.collected !== void 0) return (pe(), !0);
      } catch (R) {
        console.error('收藏操作失败', R);
      }
      return !1;
    }
    async function K() {
      var w, R;
      try {
        const { userApi: L } = await ge(async () => {
            const { userApi: B } = await import('./user-6MceWoQF.js');
            return { userApi: B };
          }, []),
          j = await L.getProfile();
        if (!j) return;
        ((S.value = j),
          (t.value = {
            ...t.value,
            ...j,
            id: ((w = t.value) == null ? void 0 : w.sub) || ((R = t.value) == null ? void 0 : R.id)
          }),
          await te());
      } catch (L) {
        console.warn('获取用户资料失败', L);
      }
    }
    async function Q(w) {
      try {
        const { userApi: R } = await ge(async () => {
            const { userApi: j } = await import('./user-6MceWoQF.js');
            return { userApi: j };
          }, []),
          L = await R.updateProfile(w);
        if (L) return ((S.value = { ...S.value, ...L }), (t.value = { ...t.value, ...L }), !0);
      } catch (R) {
        console.error('更新资料失败', R);
      }
      return !1;
    }
    function ae(w) {
      if (M.value) return !0;
      const { allows: R, denies: L } = s.value;
      return L.some(j => O(j, w)) ? !1 : R.some(j => O(j, w));
    }
    function b(w) {
      return r.value.includes(w);
    }
    function O(w, R) {
      return w === '*' || w === R ? !0 : w.endsWith(':*') ? R.startsWith(w.slice(0, -1)) : !1;
    }
    function v() {
      ie(!1, null);
    }
    return (
      z(),
      {
        isLoggedIn: e,
        user: t,
        token: n,
        roles: r,
        permissions: s,
        isAdmin: M,
        initialized: o,
        setLoggedIn: ie,
        checkSession: se,
        fetchPermissions: Se,
        hasPermission: ae,
        hasRole: b,
        logout: v,
        followingCount: i,
        followersCount: a,
        worksCount: l,
        templatesCount: f,
        incrementWorksCount: p,
        incrementTemplatesCount: y,
        likesCount: c,
        mutualCount: u,
        recommendationsCount: h,
        userProfile: S,
        fetchUserProfile: K,
        fetchMyStats: te,
        updateUserProfile: Q,
        likedWorksCount: T,
        collectsCount: d,
        watchLaterCount: E,
        historyText: g,
        myWorks: D,
        myTemplates: F,
        myLikes: P,
        myCollects: H,
        myHistory: W,
        myRecommendations: Ne,
        fetchMyWorks: Me,
        fetchMyTemplates: Le,
        fetchMyHistory: de,
        fetchMyLikes: ue,
        fetchMyCollects: pe,
        fetchMyRecommendations: xe,
        cancelRecommendation: We,
        recordHistoryAction: ne,
        toggleLikeAction: U,
        toggleCollectAction: Y,
        saveLoginInfo: C,
        updateSaveLoginInfo: I,
        safeAvatar: A
      }
    );
  }),
  yl = Object.freeze(
    Object.defineProperty({ __proto__: null, DEFAULT_AVATAR: uf, useAuthStore: In }, Symbol.toStringTag, {
      value: 'Module'
    })
  );
Ki.configure({ showSpinner: !1 });
const ao = Pg({
  history: ug('/posecraft/'),
  routes: [
    {
      path: '/',
      component: () =>
        ge(() => import('./HomeView-Hlm7Y1Kp.js'), __vite__mapDeps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])),
      children: [
        {
          path: '',
          name: 'home-featured',
          component: () =>
            ge(
              () => import('./FeaturedView-CC_C4xE-.js'),
              __vite__mapDeps([12, 13, 14, 5, 15, 16, 10, 17, 4, 18, 19, 9, 8, 7, 6, 20, 1, 2, 3, 21, 22, 23])
            ),
          meta: { title: '精选姿势' }
        },
        {
          path: 'recommend',
          name: 'home-recommend',
          component: () =>
            ge(() => import('./RecommendView-Beyhd1RM.js'), __vite__mapDeps([24, 1, 2, 3, 21, 7, 5, 22, 14, 6, 25])),
          meta: { title: '推荐内容' }
        },
        {
          path: 'nearby',
          name: 'home-nearby',
          component: () =>
            ge(() => import('./NearbyView-8Gev2Hq9.js'), __vite__mapDeps([26, 1, 2, 3, 21, 7, 5, 22, 14, 27])),
          meta: { title: '附近创作者' }
        },
        {
          path: 'following',
          name: 'home-following',
          component: () =>
            ge(() => import('./FollowingView-BmjAisWe.js'), __vite__mapDeps([28, 1, 2, 3, 21, 7, 5, 22, 14, 8, 29])),
          meta: { title: '我的关注', requiresAuth: !0 }
        },
        {
          path: 'friends',
          name: 'home-friends',
          component: () =>
            ge(() => import('./FriendsView-aFqeewWt.js'), __vite__mapDeps([30, 1, 2, 3, 21, 7, 5, 22, 14, 9, 31])),
          meta: { title: '朋友动态', requiresAuth: !0 }
        },
        {
          path: 'mine',
          name: 'home-mine',
          component: () =>
            ge(
              () => import('./MineView-B69ymlvI.js'),
              __vite__mapDeps([32, 1, 2, 3, 21, 7, 5, 22, 33, 34, 17, 15, 20, 35])
            ),
          meta: { title: '我的空间', requiresAuth: !0 }
        }
      ]
    },
    {
      path: '/editor',
      name: 'editor',
      component: () =>
        ge(
          () => import('./EditorView-CFRR2zLQ.js'),
          __vite__mapDeps([36, 34, 37, 5, 15, 4, 13, 14, 16, 10, 17, 18, 19, 9, 8, 7, 6, 20, 3, 38])
        ),
      meta: { title: '编辑器', requiresAuth: !0 }
    },
    {
      path: '/camera',
      name: 'camera',
      component: () => ge(() => import('./CameraView-Cfkh8XaV.js'), __vite__mapDeps([39, 37, 3, 2, 34])),
      meta: { title: '相机', requiresAuth: !0 }
    },
    {
      path: '/login',
      name: 'login',
      component: () => ge(() => import('./LoginView-BAxi1SSb.js'), __vite__mapDeps([40, 41, 15, 5, 19, 42])),
      meta: { title: '登录' }
    },
    {
      path: '/callback',
      name: 'callback',
      component: () => ge(() => import('./CallbackView-fAESdZJ9.js'), __vite__mapDeps([43, 41])),
      meta: { title: '登录中...' }
    },
    {
      path: '/template/:id',
      name: 'template-detail',
      component: () =>
        ge(
          () => import('./WorkDetail-Bsx1ONlD.js'),
          __vite__mapDeps([44, 1, 2, 3, 34, 10, 5, 6, 16, 7, 20, 19, 18, 8, 45])
        ),
      meta: { title: '模板详情' }
    },
    {
      path: '/work/:id',
      name: 'work-detail',
      component: () =>
        ge(
          () => import('./WorkDetail-Bsx1ONlD.js'),
          __vite__mapDeps([44, 1, 2, 3, 34, 10, 5, 6, 16, 7, 20, 19, 18, 8, 45])
        ),
      meta: { title: '作品详情' }
    }
  ]
});
ao.beforeEach(async e => {
  if ((Ki.start(), (document.title = `${e.meta.title || 'PoseCraft'} - CoreFlow`), e.meta.requiresAuth)) {
    const t = In();
    if (!t.initialized && !(await t.checkSession())) return { name: 'login', query: { redirect: e.fullPath } };
    if (!t.isLoggedIn) return { name: 'login', query: { redirect: e.fullPath } };
  }
});
ao.afterEach(() => Ki.done());
/*!
 * shared v9.14.5
 * (c) 2025 kazuya kawaguchi
 * Released under the MIT License.
 */ function Fg(e, t) {
  typeof console < 'u' && (console.warn('[intlify] ' + e), t && console.warn(t.stack));
}
const ks = typeof window < 'u',
  mn = (e, t = !1) => (t ? Symbol.for(e) : Symbol(e)),
  Mg = (e, t, n) => Ug({ l: e, k: t, s: n }),
  Ug = e =>
    JSON.stringify(e)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
      .replace(/\u0027/g, '\\u0027'),
  ke = e => typeof e == 'number' && isFinite(e),
  Vg = e => df(e) === '[object Date]',
  pn = e => df(e) === '[object RegExp]',
  lo = e => ce(e) && Object.keys(e).length === 0,
  Qe = Object.assign,
  Hg = Object.create,
  Te = (e = null) => Hg(e);
let El;
const qt = () =>
  El ||
  (El =
    typeof globalThis < 'u'
      ? globalThis
      : typeof self < 'u'
        ? self
        : typeof window < 'u'
          ? window
          : typeof global < 'u'
            ? global
            : Te());
function bl(e) {
  return e
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\//g, '&#x2F;')
    .replace(/=/g, '&#x3D;');
}
function vl(e) {
  return e
    .replace(/&(?![a-zA-Z0-9#]{2,6};)/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function $g(e) {
  return (
    (e = e.replace(/(\w+)\s*=\s*"([^"]*)"/g, (r, s, o) => `${s}="${vl(o)}"`)),
    (e = e.replace(/(\w+)\s*=\s*'([^']*)'/g, (r, s, o) => `${s}='${vl(o)}'`)),
    /\s*on\w+\s*=\s*["']?[^"'>]+["']?/gi.test(e) && (e = e.replace(/(\s+)(on)(\w+\s*=)/gi, '$1&#111;n$3')),
    [
      /(\s+(?:href|src|action|formaction)\s*=\s*["']?)\s*javascript:/gi,
      /(style\s*=\s*["'][^"']*url\s*\(\s*)javascript:/gi
    ].forEach(r => {
      e = e.replace(r, '$1javascript&#58;');
    }),
    e
  );
}
const jg = Object.prototype.hasOwnProperty;
function wt(e, t) {
  return jg.call(e, t);
}
const Ie = Array.isArray,
  Re = e => typeof e == 'function',
  X = e => typeof e == 'string',
  he = e => typeof e == 'boolean',
  ye = e => e !== null && typeof e == 'object',
  Bg = e => ye(e) && Re(e.then) && Re(e.catch),
  ff = Object.prototype.toString,
  df = e => ff.call(e),
  ce = e => {
    if (!ye(e)) return !1;
    const t = Object.getPrototypeOf(e);
    return t === null || t.constructor === Object;
  },
  Wg = e => (e == null ? '' : Ie(e) || (ce(e) && e.toString === ff) ? JSON.stringify(e, null, 2) : String(e));
function Gg(e, t = '') {
  return e.reduce((n, r, s) => (s === 0 ? n + r : n + t + r), '');
}
function co(e) {
  let t = e;
  return () => ++t;
}
const ds = e => !ye(e) || Ie(e);
function ys(e, t) {
  if (ds(e) || ds(t)) throw new Error('Invalid value');
  const n = [{ src: e, des: t }];
  for (; n.length; ) {
    const { src: r, des: s } = n.pop();
    Object.keys(r).forEach(o => {
      o !== '__proto__' &&
        (ye(r[o]) && !ye(s[o]) && (s[o] = Array.isArray(r[o]) ? [] : Te()),
        ds(s[o]) || ds(r[o]) ? (s[o] = r[o]) : n.push({ src: r[o], des: s[o] }));
    });
  }
}
/*!
 * message-compiler v9.14.5
 * (c) 2025 kazuya kawaguchi
 * Released under the MIT License.
 */ function Kg(e, t, n) {
  return { line: e, column: t, offset: n };
}
function Fs(e, t, n) {
  return { start: e, end: t };
}
const qg = /\{([0-9a-zA-Z]+)\}/g;
function hf(e, ...t) {
  return (
    t.length === 1 && Yg(t[0]) && (t = t[0]),
    (!t || !t.hasOwnProperty) && (t = {}),
    e.replace(qg, (n, r) => (t.hasOwnProperty(r) ? t[r] : ''))
  );
}
const pf = Object.assign,
  Sl = e => typeof e == 'string',
  Yg = e => e !== null && typeof e == 'object';
function mf(e, t = '') {
  return e.reduce((n, r, s) => (s === 0 ? n + r : n + t + r), '');
}
const qi = { USE_MODULO_SYNTAX: 1, __EXTEND_POINT__: 2 },
  Xg = { [qi.USE_MODULO_SYNTAX]: "Use modulo before '{{0}}'." };
function Jg(e, t, ...n) {
  const r = hf(Xg[e], ...(n || [])),
    s = { message: String(r), code: e };
  return (t && (s.location = t), s);
}
const re = {
    EXPECTED_TOKEN: 1,
    INVALID_TOKEN_IN_PLACEHOLDER: 2,
    UNTERMINATED_SINGLE_QUOTE_IN_PLACEHOLDER: 3,
    UNKNOWN_ESCAPE_SEQUENCE: 4,
    INVALID_UNICODE_ESCAPE_SEQUENCE: 5,
    UNBALANCED_CLOSING_BRACE: 6,
    UNTERMINATED_CLOSING_BRACE: 7,
    EMPTY_PLACEHOLDER: 8,
    NOT_ALLOW_NEST_PLACEHOLDER: 9,
    INVALID_LINKED_FORMAT: 10,
    MUST_HAVE_MESSAGES_IN_PLURAL: 11,
    UNEXPECTED_EMPTY_LINKED_MODIFIER: 12,
    UNEXPECTED_EMPTY_LINKED_KEY: 13,
    UNEXPECTED_LEXICAL_ANALYSIS: 14,
    UNHANDLED_CODEGEN_NODE_TYPE: 15,
    UNHANDLED_MINIFIER_NODE_TYPE: 16,
    __EXTEND_POINT__: 17
  },
  zg = {
    [re.EXPECTED_TOKEN]: "Expected token: '{0}'",
    [re.INVALID_TOKEN_IN_PLACEHOLDER]: "Invalid token in placeholder: '{0}'",
    [re.UNTERMINATED_SINGLE_QUOTE_IN_PLACEHOLDER]: 'Unterminated single quote in placeholder',
    [re.UNKNOWN_ESCAPE_SEQUENCE]: 'Unknown escape sequence: \\{0}',
    [re.INVALID_UNICODE_ESCAPE_SEQUENCE]: 'Invalid unicode escape sequence: {0}',
    [re.UNBALANCED_CLOSING_BRACE]: 'Unbalanced closing brace',
    [re.UNTERMINATED_CLOSING_BRACE]: 'Unterminated closing brace',
    [re.EMPTY_PLACEHOLDER]: 'Empty placeholder',
    [re.NOT_ALLOW_NEST_PLACEHOLDER]: 'Not allowed nest placeholder',
    [re.INVALID_LINKED_FORMAT]: 'Invalid linked format',
    [re.MUST_HAVE_MESSAGES_IN_PLURAL]: 'Plural must have messages',
    [re.UNEXPECTED_EMPTY_LINKED_MODIFIER]: 'Unexpected empty linked modifier',
    [re.UNEXPECTED_EMPTY_LINKED_KEY]: 'Unexpected empty linked key',
    [re.UNEXPECTED_LEXICAL_ANALYSIS]: "Unexpected lexical analysis in token: '{0}'",
    [re.UNHANDLED_CODEGEN_NODE_TYPE]: "unhandled codegen node type: '{0}'",
    [re.UNHANDLED_MINIFIER_NODE_TYPE]: "unhandled mimifier node type: '{0}'"
  };
function cr(e, t, n = {}) {
  const { domain: r, messages: s, args: o } = n,
    i = hf((s || zg)[e] || '', ...(o || [])),
    a = new SyntaxError(String(i));
  return ((a.code = e), t && (a.location = t), (a.domain = r), a);
}
function Qg(e) {
  throw e;
}
const $t = ' ',
  Zg = '\r',
  it = `
`,
  e_ = '\u2028',
  t_ = '\u2029';
function n_(e) {
  const t = e;
  let n = 0,
    r = 1,
    s = 1,
    o = 0;
  const i = D => t[D] === Zg && t[D + 1] === it,
    a = D => t[D] === it,
    l = D => t[D] === t_,
    c = D => t[D] === e_,
    u = D => i(D) || a(D) || l(D) || c(D),
    f = () => n,
    d = () => r,
    h = () => s,
    p = () => o,
    y = D => (i(D) || l(D) || c(D) ? it : t[D]),
    S = () => y(n),
    A = () => y(n + o);
  function T() {
    return ((o = 0), u(n) && (r++, (s = 0)), i(n) && n++, n++, s++, t[n]);
  }
  function E() {
    return (i(n + o) && o++, o++, t[n + o]);
  }
  function g() {
    ((n = 0), (r = 1), (s = 1), (o = 0));
  }
  function C(D = 0) {
    o = D;
  }
  function I() {
    const D = n + o;
    for (; D !== n; ) T();
    o = 0;
  }
  return {
    index: f,
    line: d,
    column: h,
    peekOffset: p,
    charAt: y,
    currentChar: S,
    currentPeek: A,
    next: T,
    peek: E,
    reset: g,
    resetPeek: C,
    skipToPeek: I
  };
}
const on = void 0,
  r_ = '.',
  Al = "'",
  s_ = 'tokenizer';
function o_(e, t = {}) {
  const n = t.location !== !1,
    r = n_(e),
    s = () => r.index(),
    o = () => Kg(r.line(), r.column(), r.index()),
    i = o(),
    a = s(),
    l = {
      currentType: 14,
      offset: a,
      startLoc: i,
      endLoc: i,
      lastType: 14,
      lastOffset: a,
      lastStartLoc: i,
      lastEndLoc: i,
      braceNest: 0,
      inLinked: !1,
      text: ''
    },
    c = () => l,
    { onError: u } = t;
  function f(m, _, x, ...V) {
    const q = c();
    if (((_.column += x), (_.offset += x), u)) {
      const G = n ? Fs(q.startLoc, _) : null,
        k = cr(m, G, { domain: s_, args: V });
      u(k);
    }
  }
  function d(m, _, x) {
    ((m.endLoc = o()), (m.currentType = _));
    const V = { type: _ };
    return (n && (V.loc = Fs(m.startLoc, m.endLoc)), x != null && (V.value = x), V);
  }
  const h = m => d(m, 14);
  function p(m, _) {
    return m.currentChar() === _ ? (m.next(), _) : (f(re.EXPECTED_TOKEN, o(), 0, _), '');
  }
  function y(m) {
    let _ = '';
    for (; m.currentPeek() === $t || m.currentPeek() === it; ) ((_ += m.currentPeek()), m.peek());
    return _;
  }
  function S(m) {
    const _ = y(m);
    return (m.skipToPeek(), _);
  }
  function A(m) {
    if (m === on) return !1;
    const _ = m.charCodeAt(0);
    return (_ >= 97 && _ <= 122) || (_ >= 65 && _ <= 90) || _ === 95;
  }
  function T(m) {
    if (m === on) return !1;
    const _ = m.charCodeAt(0);
    return _ >= 48 && _ <= 57;
  }
  function E(m, _) {
    const { currentType: x } = _;
    if (x !== 2) return !1;
    y(m);
    const V = A(m.currentPeek());
    return (m.resetPeek(), V);
  }
  function g(m, _) {
    const { currentType: x } = _;
    if (x !== 2) return !1;
    y(m);
    const V = m.currentPeek() === '-' ? m.peek() : m.currentPeek(),
      q = T(V);
    return (m.resetPeek(), q);
  }
  function C(m, _) {
    const { currentType: x } = _;
    if (x !== 2) return !1;
    y(m);
    const V = m.currentPeek() === Al;
    return (m.resetPeek(), V);
  }
  function I(m, _) {
    const { currentType: x } = _;
    if (x !== 8) return !1;
    y(m);
    const V = m.currentPeek() === '.';
    return (m.resetPeek(), V);
  }
  function D(m, _) {
    const { currentType: x } = _;
    if (x !== 9) return !1;
    y(m);
    const V = A(m.currentPeek());
    return (m.resetPeek(), V);
  }
  function F(m, _) {
    const { currentType: x } = _;
    if (!(x === 8 || x === 12)) return !1;
    y(m);
    const V = m.currentPeek() === ':';
    return (m.resetPeek(), V);
  }
  function P(m, _) {
    const { currentType: x } = _;
    if (x !== 10) return !1;
    const V = () => {
        const G = m.currentPeek();
        return G === '{'
          ? A(m.peek())
          : G === '@' || G === '%' || G === '|' || G === ':' || G === '.' || G === $t || !G
            ? !1
            : G === it
              ? (m.peek(), V())
              : M(m, !1);
      },
      q = V();
    return (m.resetPeek(), q);
  }
  function H(m) {
    y(m);
    const _ = m.currentPeek() === '|';
    return (m.resetPeek(), _);
  }
  function W(m) {
    const _ = y(m),
      x = m.currentPeek() === '%' && m.peek() === '{';
    return (m.resetPeek(), { isModulo: x, hasSpace: _.length > 0 });
  }
  function M(m, _ = !0) {
    const x = (q = !1, G = '', k = !1) => {
        const $ = m.currentPeek();
        return $ === '{'
          ? G === '%'
            ? !1
            : q
          : $ === '@' || !$
            ? G === '%'
              ? !0
              : q
            : $ === '%'
              ? (m.peek(), x(q, '%', !0))
              : $ === '|'
                ? G === '%' || k
                  ? !0
                  : !(G === $t || G === it)
                : $ === $t
                  ? (m.peek(), x(!0, $t, k))
                  : $ === it
                    ? (m.peek(), x(!0, it, k))
                    : !0;
      },
      V = x();
    return (_ && m.resetPeek(), V);
  }
  function z(m, _) {
    const x = m.currentChar();
    return x === on ? on : _(x) ? (m.next(), x) : null;
  }
  function ie(m) {
    const _ = m.charCodeAt(0);
    return (_ >= 97 && _ <= 122) || (_ >= 65 && _ <= 90) || (_ >= 48 && _ <= 57) || _ === 95 || _ === 36;
  }
  function Se(m) {
    return z(m, ie);
  }
  function se(m) {
    const _ = m.charCodeAt(0);
    return (_ >= 97 && _ <= 122) || (_ >= 65 && _ <= 90) || (_ >= 48 && _ <= 57) || _ === 95 || _ === 36 || _ === 45;
  }
  function te(m) {
    return z(m, se);
  }
  function de(m) {
    const _ = m.charCodeAt(0);
    return _ >= 48 && _ <= 57;
  }
  function Me(m) {
    return z(m, de);
  }
  function Le(m) {
    const _ = m.charCodeAt(0);
    return (_ >= 48 && _ <= 57) || (_ >= 65 && _ <= 70) || (_ >= 97 && _ <= 102);
  }
  function ue(m) {
    return z(m, Le);
  }
  function pe(m) {
    let _ = '',
      x = '';
    for (; (_ = Me(m)); ) x += _;
    return x;
  }
  function Ne(m) {
    S(m);
    const _ = m.currentChar();
    return (_ !== '%' && f(re.EXPECTED_TOKEN, o(), 0, _), m.next(), '%');
  }
  function xe(m) {
    let _ = '';
    for (;;) {
      const x = m.currentChar();
      if (x === '{' || x === '}' || x === '@' || x === '|' || !x) break;
      if (x === '%')
        if (M(m)) ((_ += x), m.next());
        else break;
      else if (x === $t || x === it)
        if (M(m)) ((_ += x), m.next());
        else {
          if (H(m)) break;
          ((_ += x), m.next());
        }
      else ((_ += x), m.next());
    }
    return _;
  }
  function We(m) {
    S(m);
    let _ = '',
      x = '';
    for (; (_ = te(m)); ) x += _;
    return (m.currentChar() === on && f(re.UNTERMINATED_CLOSING_BRACE, o(), 0), x);
  }
  function ne(m) {
    S(m);
    let _ = '';
    return (
      m.currentChar() === '-' ? (m.next(), (_ += `-${pe(m)}`)) : (_ += pe(m)),
      m.currentChar() === on && f(re.UNTERMINATED_CLOSING_BRACE, o(), 0),
      _
    );
  }
  function U(m) {
    return m !== Al && m !== it;
  }
  function Y(m) {
    (S(m), p(m, "'"));
    let _ = '',
      x = '';
    for (; (_ = z(m, U)); ) _ === '\\' ? (x += K(m)) : (x += _);
    const V = m.currentChar();
    return V === it || V === on
      ? (f(re.UNTERMINATED_SINGLE_QUOTE_IN_PLACEHOLDER, o(), 0), V === it && (m.next(), p(m, "'")), x)
      : (p(m, "'"), x);
  }
  function K(m) {
    const _ = m.currentChar();
    switch (_) {
      case '\\':
      case "'":
        return (m.next(), `\\${_}`);
      case 'u':
        return Q(m, _, 4);
      case 'U':
        return Q(m, _, 6);
      default:
        return (f(re.UNKNOWN_ESCAPE_SEQUENCE, o(), 0, _), '');
    }
  }
  function Q(m, _, x) {
    p(m, _);
    let V = '';
    for (let q = 0; q < x; q++) {
      const G = ue(m);
      if (!G) {
        f(re.INVALID_UNICODE_ESCAPE_SEQUENCE, o(), 0, `\\${_}${V}${m.currentChar()}`);
        break;
      }
      V += G;
    }
    return `\\${_}${V}`;
  }
  function ae(m) {
    return m !== '{' && m !== '}' && m !== $t && m !== it;
  }
  function b(m) {
    S(m);
    let _ = '',
      x = '';
    for (; (_ = z(m, ae)); ) x += _;
    return x;
  }
  function O(m) {
    let _ = '',
      x = '';
    for (; (_ = Se(m)); ) x += _;
    return x;
  }
  function v(m) {
    const _ = x => {
      const V = m.currentChar();
      return V === '{' || V === '%' || V === '@' || V === '|' || V === '(' || V === ')' || !V || V === $t
        ? x
        : ((x += V), m.next(), _(x));
    };
    return _('');
  }
  function w(m) {
    S(m);
    const _ = p(m, '|');
    return (S(m), _);
  }
  function R(m, _) {
    let x = null;
    switch (m.currentChar()) {
      case '{':
        return (
          _.braceNest >= 1 && f(re.NOT_ALLOW_NEST_PLACEHOLDER, o(), 0),
          m.next(),
          (x = d(_, 2, '{')),
          S(m),
          _.braceNest++,
          x
        );
      case '}':
        return (
          _.braceNest > 0 && _.currentType === 2 && f(re.EMPTY_PLACEHOLDER, o(), 0),
          m.next(),
          (x = d(_, 3, '}')),
          _.braceNest--,
          _.braceNest > 0 && S(m),
          _.inLinked && _.braceNest === 0 && (_.inLinked = !1),
          x
        );
      case '@':
        return (
          _.braceNest > 0 && f(re.UNTERMINATED_CLOSING_BRACE, o(), 0),
          (x = L(m, _) || h(_)),
          (_.braceNest = 0),
          x
        );
      default: {
        let q = !0,
          G = !0,
          k = !0;
        if (H(m))
          return (
            _.braceNest > 0 && f(re.UNTERMINATED_CLOSING_BRACE, o(), 0),
            (x = d(_, 1, w(m))),
            (_.braceNest = 0),
            (_.inLinked = !1),
            x
          );
        if (_.braceNest > 0 && (_.currentType === 5 || _.currentType === 6 || _.currentType === 7))
          return (f(re.UNTERMINATED_CLOSING_BRACE, o(), 0), (_.braceNest = 0), j(m, _));
        if ((q = E(m, _))) return ((x = d(_, 5, We(m))), S(m), x);
        if ((G = g(m, _))) return ((x = d(_, 6, ne(m))), S(m), x);
        if ((k = C(m, _))) return ((x = d(_, 7, Y(m))), S(m), x);
        if (!q && !G && !k) return ((x = d(_, 13, b(m))), f(re.INVALID_TOKEN_IN_PLACEHOLDER, o(), 0, x.value), S(m), x);
        break;
      }
    }
    return x;
  }
  function L(m, _) {
    const { currentType: x } = _;
    let V = null;
    const q = m.currentChar();
    switch (
      ((x === 8 || x === 9 || x === 12 || x === 10) && (q === it || q === $t) && f(re.INVALID_LINKED_FORMAT, o(), 0), q)
    ) {
      case '@':
        return (m.next(), (V = d(_, 8, '@')), (_.inLinked = !0), V);
      case '.':
        return (S(m), m.next(), d(_, 9, '.'));
      case ':':
        return (S(m), m.next(), d(_, 10, ':'));
      default:
        return H(m)
          ? ((V = d(_, 1, w(m))), (_.braceNest = 0), (_.inLinked = !1), V)
          : I(m, _) || F(m, _)
            ? (S(m), L(m, _))
            : D(m, _)
              ? (S(m), d(_, 12, O(m)))
              : P(m, _)
                ? (S(m), q === '{' ? R(m, _) || V : d(_, 11, v(m)))
                : (x === 8 && f(re.INVALID_LINKED_FORMAT, o(), 0), (_.braceNest = 0), (_.inLinked = !1), j(m, _));
    }
  }
  function j(m, _) {
    let x = { type: 14 };
    if (_.braceNest > 0) return R(m, _) || h(_);
    if (_.inLinked) return L(m, _) || h(_);
    switch (m.currentChar()) {
      case '{':
        return R(m, _) || h(_);
      case '}':
        return (f(re.UNBALANCED_CLOSING_BRACE, o(), 0), m.next(), d(_, 3, '}'));
      case '@':
        return L(m, _) || h(_);
      default: {
        if (H(m)) return ((x = d(_, 1, w(m))), (_.braceNest = 0), (_.inLinked = !1), x);
        const { isModulo: q, hasSpace: G } = W(m);
        if (q) return G ? d(_, 0, xe(m)) : d(_, 4, Ne(m));
        if (M(m)) return d(_, 0, xe(m));
        break;
      }
    }
    return x;
  }
  function B() {
    const { currentType: m, offset: _, startLoc: x, endLoc: V } = l;
    return (
      (l.lastType = m),
      (l.lastOffset = _),
      (l.lastStartLoc = x),
      (l.lastEndLoc = V),
      (l.offset = s()),
      (l.startLoc = o()),
      r.currentChar() === on ? d(l, 14) : j(r, l)
    );
  }
  return { nextToken: B, currentOffset: s, currentPosition: o, context: c };
}
const i_ = 'parser',
  a_ = /(?:\\\\|\\'|\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{6}))/g;
function l_(e, t, n) {
  switch (e) {
    case '\\\\':
      return '\\';
    case "\\'":
      return "'";
    default: {
      const r = parseInt(t || n, 16);
      return r <= 55295 || r >= 57344 ? String.fromCodePoint(r) : '�';
    }
  }
}
function c_(e = {}) {
  const t = e.location !== !1,
    { onError: n, onWarn: r } = e;
  function s(E, g, C, I, ...D) {
    const F = E.currentPosition();
    if (((F.offset += I), (F.column += I), n)) {
      const P = t ? Fs(C, F) : null,
        H = cr(g, P, { domain: i_, args: D });
      n(H);
    }
  }
  function o(E, g, C, I, ...D) {
    const F = E.currentPosition();
    if (((F.offset += I), (F.column += I), r)) {
      const P = t ? Fs(C, F) : null;
      r(Jg(g, P, D));
    }
  }
  function i(E, g, C) {
    const I = { type: E };
    return (t && ((I.start = g), (I.end = g), (I.loc = { start: C, end: C })), I);
  }
  function a(E, g, C, I) {
    t && ((E.end = g), E.loc && (E.loc.end = C));
  }
  function l(E, g) {
    const C = E.context(),
      I = i(3, C.offset, C.startLoc);
    return ((I.value = g), a(I, E.currentOffset(), E.currentPosition()), I);
  }
  function c(E, g) {
    const C = E.context(),
      { lastOffset: I, lastStartLoc: D } = C,
      F = i(5, I, D);
    return ((F.index = parseInt(g, 10)), E.nextToken(), a(F, E.currentOffset(), E.currentPosition()), F);
  }
  function u(E, g, C) {
    const I = E.context(),
      { lastOffset: D, lastStartLoc: F } = I,
      P = i(4, D, F);
    return ((P.key = g), C === !0 && (P.modulo = !0), E.nextToken(), a(P, E.currentOffset(), E.currentPosition()), P);
  }
  function f(E, g) {
    const C = E.context(),
      { lastOffset: I, lastStartLoc: D } = C,
      F = i(9, I, D);
    return ((F.value = g.replace(a_, l_)), E.nextToken(), a(F, E.currentOffset(), E.currentPosition()), F);
  }
  function d(E) {
    const g = E.nextToken(),
      C = E.context(),
      { lastOffset: I, lastStartLoc: D } = C,
      F = i(8, I, D);
    return g.type !== 12
      ? (s(E, re.UNEXPECTED_EMPTY_LINKED_MODIFIER, C.lastStartLoc, 0),
        (F.value = ''),
        a(F, I, D),
        { nextConsumeToken: g, node: F })
      : (g.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, C.lastStartLoc, 0, Tt(g)),
        (F.value = g.value || ''),
        a(F, E.currentOffset(), E.currentPosition()),
        { node: F });
  }
  function h(E, g) {
    const C = E.context(),
      I = i(7, C.offset, C.startLoc);
    return ((I.value = g), a(I, E.currentOffset(), E.currentPosition()), I);
  }
  function p(E) {
    const g = E.context(),
      C = i(6, g.offset, g.startLoc);
    let I = E.nextToken();
    if (I.type === 9) {
      const D = d(E);
      ((C.modifier = D.node), (I = D.nextConsumeToken || E.nextToken()));
    }
    switch (
      (I.type !== 10 && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(I)),
      (I = E.nextToken()),
      I.type === 2 && (I = E.nextToken()),
      I.type)
    ) {
      case 11:
        (I.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(I)),
          (C.key = h(E, I.value || '')));
        break;
      case 5:
        (I.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(I)),
          (C.key = u(E, I.value || '')));
        break;
      case 6:
        (I.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(I)),
          (C.key = c(E, I.value || '')));
        break;
      case 7:
        (I.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(I)),
          (C.key = f(E, I.value || '')));
        break;
      default: {
        s(E, re.UNEXPECTED_EMPTY_LINKED_KEY, g.lastStartLoc, 0);
        const D = E.context(),
          F = i(7, D.offset, D.startLoc);
        return (
          (F.value = ''),
          a(F, D.offset, D.startLoc),
          (C.key = F),
          a(C, D.offset, D.startLoc),
          { nextConsumeToken: I, node: C }
        );
      }
    }
    return (a(C, E.currentOffset(), E.currentPosition()), { node: C });
  }
  function y(E) {
    const g = E.context(),
      C = g.currentType === 1 ? E.currentOffset() : g.offset,
      I = g.currentType === 1 ? g.endLoc : g.startLoc,
      D = i(2, C, I);
    D.items = [];
    let F = null,
      P = null;
    do {
      const M = F || E.nextToken();
      switch (((F = null), M.type)) {
        case 0:
          (M.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(M)),
            D.items.push(l(E, M.value || '')));
          break;
        case 6:
          (M.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(M)),
            D.items.push(c(E, M.value || '')));
          break;
        case 4:
          P = !0;
          break;
        case 5:
          (M.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(M)),
            D.items.push(u(E, M.value || '', !!P)),
            P && (o(E, qi.USE_MODULO_SYNTAX, g.lastStartLoc, 0, Tt(M)), (P = null)));
          break;
        case 7:
          (M.value == null && s(E, re.UNEXPECTED_LEXICAL_ANALYSIS, g.lastStartLoc, 0, Tt(M)),
            D.items.push(f(E, M.value || '')));
          break;
        case 8: {
          const z = p(E);
          (D.items.push(z.node), (F = z.nextConsumeToken || null));
          break;
        }
      }
    } while (g.currentType !== 14 && g.currentType !== 1);
    const H = g.currentType === 1 ? g.lastOffset : E.currentOffset(),
      W = g.currentType === 1 ? g.lastEndLoc : E.currentPosition();
    return (a(D, H, W), D);
  }
  function S(E, g, C, I) {
    const D = E.context();
    let F = I.items.length === 0;
    const P = i(1, g, C);
    ((P.cases = []), P.cases.push(I));
    do {
      const H = y(E);
      (F || (F = H.items.length === 0), P.cases.push(H));
    } while (D.currentType !== 14);
    return (F && s(E, re.MUST_HAVE_MESSAGES_IN_PLURAL, C, 0), a(P, E.currentOffset(), E.currentPosition()), P);
  }
  function A(E) {
    const g = E.context(),
      { offset: C, startLoc: I } = g,
      D = y(E);
    return g.currentType === 14 ? D : S(E, C, I, D);
  }
  function T(E) {
    const g = o_(E, pf({}, e)),
      C = g.context(),
      I = i(0, C.offset, C.startLoc);
    return (
      t && I.loc && (I.loc.source = E),
      (I.body = A(g)),
      e.onCacheKey && (I.cacheKey = e.onCacheKey(E)),
      C.currentType !== 14 && s(g, re.UNEXPECTED_LEXICAL_ANALYSIS, C.lastStartLoc, 0, E[C.offset] || ''),
      a(I, g.currentOffset(), g.currentPosition()),
      I
    );
  }
  return { parse: T };
}
function Tt(e) {
  if (e.type === 14) return 'EOF';
  const t = (e.value || '').replace(/\r?\n/gu, '\\n');
  return t.length > 10 ? t.slice(0, 9) + '…' : t;
}
function u_(e, t = {}) {
  const n = { ast: e, helpers: new Set() };
  return { context: () => n, helper: o => (n.helpers.add(o), o) };
}
function Tl(e, t) {
  for (let n = 0; n < e.length; n++) Yi(e[n], t);
}
function Yi(e, t) {
  switch (e.type) {
    case 1:
      (Tl(e.cases, t), t.helper('plural'));
      break;
    case 2:
      Tl(e.items, t);
      break;
    case 6: {
      (Yi(e.key, t), t.helper('linked'), t.helper('type'));
      break;
    }
    case 5:
      (t.helper('interpolate'), t.helper('list'));
      break;
    case 4:
      (t.helper('interpolate'), t.helper('named'));
      break;
  }
}
function f_(e, t = {}) {
  const n = u_(e);
  (n.helper('normalize'), e.body && Yi(e.body, n));
  const r = n.context();
  e.helpers = Array.from(r.helpers);
}
function d_(e) {
  const t = e.body;
  return (t.type === 2 ? wl(t) : t.cases.forEach(n => wl(n)), e);
}
function wl(e) {
  if (e.items.length === 1) {
    const t = e.items[0];
    (t.type === 3 || t.type === 9) && ((e.static = t.value), delete t.value);
  } else {
    const t = [];
    for (let n = 0; n < e.items.length; n++) {
      const r = e.items[n];
      if (!(r.type === 3 || r.type === 9) || r.value == null) break;
      t.push(r.value);
    }
    if (t.length === e.items.length) {
      e.static = mf(t);
      for (let n = 0; n < e.items.length; n++) {
        const r = e.items[n];
        (r.type === 3 || r.type === 9) && delete r.value;
      }
    }
  }
}
const h_ = 'minifier';
function $n(e) {
  switch (((e.t = e.type), e.type)) {
    case 0: {
      const t = e;
      ($n(t.body), (t.b = t.body), delete t.body);
      break;
    }
    case 1: {
      const t = e,
        n = t.cases;
      for (let r = 0; r < n.length; r++) $n(n[r]);
      ((t.c = n), delete t.cases);
      break;
    }
    case 2: {
      const t = e,
        n = t.items;
      for (let r = 0; r < n.length; r++) $n(n[r]);
      ((t.i = n), delete t.items, t.static && ((t.s = t.static), delete t.static));
      break;
    }
    case 3:
    case 9:
    case 8:
    case 7: {
      const t = e;
      t.value && ((t.v = t.value), delete t.value);
      break;
    }
    case 6: {
      const t = e;
      ($n(t.key), (t.k = t.key), delete t.key, t.modifier && ($n(t.modifier), (t.m = t.modifier), delete t.modifier));
      break;
    }
    case 5: {
      const t = e;
      ((t.i = t.index), delete t.index);
      break;
    }
    case 4: {
      const t = e;
      ((t.k = t.key), delete t.key);
      break;
    }
    default:
      throw cr(re.UNHANDLED_MINIFIER_NODE_TYPE, null, { domain: h_, args: [e.type] });
  }
  delete e.type;
}
const p_ = 'parser';
function m_(e, t) {
  const { filename: n, breakLineCode: r, needIndent: s } = t,
    o = t.location !== !1,
    i = {
      filename: n,
      code: '',
      column: 1,
      line: 1,
      offset: 0,
      map: void 0,
      breakLineCode: r,
      needIndent: s,
      indentLevel: 0
    };
  o && e.loc && (i.source = e.loc.source);
  const a = () => i;
  function l(y, S) {
    i.code += y;
  }
  function c(y, S = !0) {
    const A = S ? r : '';
    l(s ? A + '  '.repeat(y) : A);
  }
  function u(y = !0) {
    const S = ++i.indentLevel;
    y && c(S);
  }
  function f(y = !0) {
    const S = --i.indentLevel;
    y && c(S);
  }
  function d() {
    c(i.indentLevel);
  }
  return {
    context: a,
    push: l,
    indent: u,
    deindent: f,
    newline: d,
    helper: y => `_${y}`,
    needIndent: () => i.needIndent
  };
}
function g_(e, t) {
  const { helper: n } = e;
  (e.push(`${n('linked')}(`),
    er(e, t.key),
    t.modifier ? (e.push(', '), er(e, t.modifier), e.push(', _type')) : e.push(', undefined, _type'),
    e.push(')'));
}
function __(e, t) {
  const { helper: n, needIndent: r } = e;
  (e.push(`${n('normalize')}([`), e.indent(r()));
  const s = t.items.length;
  for (let o = 0; o < s && (er(e, t.items[o]), o !== s - 1); o++) e.push(', ');
  (e.deindent(r()), e.push('])'));
}
function y_(e, t) {
  const { helper: n, needIndent: r } = e;
  if (t.cases.length > 1) {
    (e.push(`${n('plural')}([`), e.indent(r()));
    const s = t.cases.length;
    for (let o = 0; o < s && (er(e, t.cases[o]), o !== s - 1); o++) e.push(', ');
    (e.deindent(r()), e.push('])'));
  }
}
function E_(e, t) {
  t.body ? er(e, t.body) : e.push('null');
}
function er(e, t) {
  const { helper: n } = e;
  switch (t.type) {
    case 0:
      E_(e, t);
      break;
    case 1:
      y_(e, t);
      break;
    case 2:
      __(e, t);
      break;
    case 6:
      g_(e, t);
      break;
    case 8:
      e.push(JSON.stringify(t.value), t);
      break;
    case 7:
      e.push(JSON.stringify(t.value), t);
      break;
    case 5:
      e.push(`${n('interpolate')}(${n('list')}(${t.index}))`, t);
      break;
    case 4:
      e.push(`${n('interpolate')}(${n('named')}(${JSON.stringify(t.key)}))`, t);
      break;
    case 9:
      e.push(JSON.stringify(t.value), t);
      break;
    case 3:
      e.push(JSON.stringify(t.value), t);
      break;
    default:
      throw cr(re.UNHANDLED_CODEGEN_NODE_TYPE, null, { domain: p_, args: [t.type] });
  }
}
const b_ = (e, t = {}) => {
  const n = Sl(t.mode) ? t.mode : 'normal',
    r = Sl(t.filename) ? t.filename : 'message.intl';
  t.sourceMap;
  const s =
      t.breakLineCode != null
        ? t.breakLineCode
        : n === 'arrow'
          ? ';'
          : `
`,
    o = t.needIndent ? t.needIndent : n !== 'arrow',
    i = e.helpers || [],
    a = m_(e, { filename: r, breakLineCode: s, needIndent: o });
  (a.push(n === 'normal' ? 'function __msg__ (ctx) {' : '(ctx) => {'),
    a.indent(o),
    i.length > 0 &&
      (a.push(
        `const { ${mf(
          i.map(u => `${u}: _${u}`),
          ', '
        )} } = ctx`
      ),
      a.newline()),
    a.push('return '),
    er(a, e),
    a.deindent(o),
    a.push('}'),
    delete e.helpers);
  const { code: l, map: c } = a.context();
  return { ast: e, code: l, map: c ? c.toJSON() : void 0 };
};
function v_(e, t = {}) {
  const n = pf({}, t),
    r = !!n.jit,
    s = !!n.minify,
    o = n.optimize == null ? !0 : n.optimize,
    a = c_(n).parse(e);
  return r ? (o && d_(a), s && $n(a), { ast: a, code: '' }) : (f_(a, n), b_(a, n));
}
/*!
 * core-base v9.14.5
 * (c) 2025 kazuya kawaguchi
 * Released under the MIT License.
 */ function S_() {
  (typeof __INTLIFY_PROD_DEVTOOLS__ != 'boolean' && (qt().__INTLIFY_PROD_DEVTOOLS__ = !1),
    typeof __INTLIFY_JIT_COMPILATION__ != 'boolean' && (qt().__INTLIFY_JIT_COMPILATION__ = !1),
    typeof __INTLIFY_DROP_MESSAGE_COMPILER__ != 'boolean' && (qt().__INTLIFY_DROP_MESSAGE_COMPILER__ = !1));
}
function Mt(e) {
  return ye(e) && Xi(e) === 0 && (wt(e, 'b') || wt(e, 'body'));
}
const gf = ['b', 'body'];
function A_(e) {
  return gn(e, gf);
}
const _f = ['c', 'cases'];
function T_(e) {
  return gn(e, _f, []);
}
const yf = ['s', 'static'];
function w_(e) {
  return gn(e, yf);
}
const Ef = ['i', 'items'];
function O_(e) {
  return gn(e, Ef, []);
}
const bf = ['t', 'type'];
function Xi(e) {
  return gn(e, bf);
}
const vf = ['v', 'value'];
function hs(e, t) {
  const n = gn(e, vf);
  if (n != null) return n;
  throw Br(t);
}
const Sf = ['m', 'modifier'];
function R_(e) {
  return gn(e, Sf);
}
const Af = ['k', 'key'];
function C_(e) {
  const t = gn(e, Af);
  if (t) return t;
  throw Br(6);
}
function gn(e, t, n) {
  for (let r = 0; r < t.length; r++) {
    const s = t[r];
    if (wt(e, s) && e[s] != null) return e[s];
  }
  return n;
}
const Tf = [...gf, ..._f, ...yf, ...Ef, ...Af, ...Sf, ...vf, ...bf];
function Br(e) {
  return new Error(`unhandled node type: ${e}`);
}
const _n = [];
_n[0] = { w: [0], i: [3, 0], '[': [4], o: [7] };
_n[1] = { w: [1], '.': [2], '[': [4], o: [7] };
_n[2] = { w: [2], i: [3, 0], 0: [3, 0] };
_n[3] = { i: [3, 0], 0: [3, 0], w: [1, 1], '.': [2, 1], '[': [4, 1], o: [7, 1] };
_n[4] = { "'": [5, 0], '"': [6, 0], '[': [4, 2], ']': [1, 3], o: 8, l: [4, 0] };
_n[5] = { "'": [4, 0], o: 8, l: [5, 0] };
_n[6] = { '"': [4, 0], o: 8, l: [6, 0] };
const L_ = /^\s?(?:true|false|-?[\d.]+|'[^']*'|"[^"]*")\s?$/;
function N_(e) {
  return L_.test(e);
}
function I_(e) {
  const t = e.charCodeAt(0),
    n = e.charCodeAt(e.length - 1);
  return t === n && (t === 34 || t === 39) ? e.slice(1, -1) : e;
}
function P_(e) {
  if (e == null) return 'o';
  switch (e.charCodeAt(0)) {
    case 91:
    case 93:
    case 46:
    case 34:
    case 39:
      return e;
    case 95:
    case 36:
    case 45:
      return 'i';
    case 9:
    case 10:
    case 13:
    case 160:
    case 65279:
    case 8232:
    case 8233:
      return 'w';
  }
  return 'i';
}
function D_(e) {
  const t = e.trim();
  return e.charAt(0) === '0' && isNaN(parseInt(e)) ? !1 : N_(t) ? I_(t) : '*' + t;
}
function x_(e) {
  const t = [];
  let n = -1,
    r = 0,
    s = 0,
    o,
    i,
    a,
    l,
    c,
    u,
    f;
  const d = [];
  ((d[0] = () => {
    i === void 0 ? (i = a) : (i += a);
  }),
    (d[1] = () => {
      i !== void 0 && (t.push(i), (i = void 0));
    }),
    (d[2] = () => {
      (d[0](), s++);
    }),
    (d[3] = () => {
      if (s > 0) (s--, (r = 4), d[0]());
      else {
        if (((s = 0), i === void 0 || ((i = D_(i)), i === !1))) return !1;
        d[1]();
      }
    }));
  function h() {
    const p = e[n + 1];
    if ((r === 5 && p === "'") || (r === 6 && p === '"')) return (n++, (a = '\\' + p), d[0](), !0);
  }
  for (; r !== null; )
    if ((n++, (o = e[n]), !(o === '\\' && h()))) {
      if (
        ((l = P_(o)),
        (f = _n[r]),
        (c = f[l] || f.l || 8),
        c === 8 || ((r = c[0]), c[1] !== void 0 && ((u = d[c[1]]), u && ((a = o), u() === !1))))
      )
        return;
      if (r === 7) return t;
    }
}
const Ol = new Map();
function k_(e, t) {
  return ye(e) ? e[t] : null;
}
function F_(e, t) {
  if (!ye(e)) return null;
  let n = Ol.get(t);
  if ((n || ((n = x_(t)), n && Ol.set(t, n)), !n)) return null;
  const r = n.length;
  let s = e,
    o = 0;
  for (; o < r; ) {
    const i = n[o];
    if (Tf.includes(i) && Mt(s)) return null;
    const a = s[i];
    if (a === void 0 || Re(s)) return null;
    ((s = a), o++);
  }
  return s;
}
const M_ = e => e,
  U_ = e => '',
  V_ = 'text',
  H_ = e => (e.length === 0 ? '' : Gg(e)),
  $_ = Wg;
function Rl(e, t) {
  return ((e = Math.abs(e)), t === 2 ? (e ? (e > 1 ? 1 : 0) : 1) : e ? Math.min(e, 2) : 0);
}
function j_(e) {
  const t = ke(e.pluralIndex) ? e.pluralIndex : -1;
  return e.named && (ke(e.named.count) || ke(e.named.n))
    ? ke(e.named.count)
      ? e.named.count
      : ke(e.named.n)
        ? e.named.n
        : t
    : t;
}
function B_(e, t) {
  (t.count || (t.count = e), t.n || (t.n = e));
}
function W_(e = {}) {
  const t = e.locale,
    n = j_(e),
    r = ye(e.pluralRules) && X(t) && Re(e.pluralRules[t]) ? e.pluralRules[t] : Rl,
    s = ye(e.pluralRules) && X(t) && Re(e.pluralRules[t]) ? Rl : void 0,
    o = A => A[r(n, A.length, s)],
    i = e.list || [],
    a = A => i[A],
    l = e.named || Te();
  ke(e.pluralIndex) && B_(n, l);
  const c = A => l[A];
  function u(A) {
    const T = Re(e.messages) ? e.messages(A) : ye(e.messages) ? e.messages[A] : !1;
    return T || (e.parent ? e.parent.message(A) : U_);
  }
  const f = A => (e.modifiers ? e.modifiers[A] : M_),
    d = ce(e.processor) && Re(e.processor.normalize) ? e.processor.normalize : H_,
    h = ce(e.processor) && Re(e.processor.interpolate) ? e.processor.interpolate : $_,
    p = ce(e.processor) && X(e.processor.type) ? e.processor.type : V_,
    S = {
      list: a,
      named: c,
      plural: o,
      linked: (A, ...T) => {
        const [E, g] = T;
        let C = 'text',
          I = '';
        T.length === 1
          ? ye(E)
            ? ((I = E.modifier || I), (C = E.type || C))
            : X(E) && (I = E || I)
          : T.length === 2 && (X(E) && (I = E || I), X(g) && (C = g || C));
        const D = u(A)(S),
          F = C === 'vnode' && Ie(D) && I ? D[0] : D;
        return I ? f(I)(F, C) : F;
      },
      message: u,
      type: p,
      interpolate: h,
      normalize: d,
      values: Qe(Te(), i, l)
    };
  return S;
}
let Wr = null;
function G_(e) {
  Wr = e;
}
function K_(e, t, n) {
  Wr && Wr.emit('i18n:init', { timestamp: Date.now(), i18n: e, version: t, meta: n });
}
const q_ = Y_('function:translate');
function Y_(e) {
  return t => Wr && Wr.emit(e, t);
}
const X_ = qi.__EXTEND_POINT__,
  An = co(X_),
  J_ = {
    FALLBACK_TO_TRANSLATE: An(),
    CANNOT_FORMAT_NUMBER: An(),
    FALLBACK_TO_NUMBER_FORMAT: An(),
    CANNOT_FORMAT_DATE: An(),
    FALLBACK_TO_DATE_FORMAT: An(),
    EXPERIMENTAL_CUSTOM_MESSAGE_COMPILER: An(),
    __EXTEND_POINT__: An()
  },
  wf = re.__EXTEND_POINT__,
  Tn = co(wf),
  Ot = {
    INVALID_ARGUMENT: wf,
    INVALID_DATE_ARGUMENT: Tn(),
    INVALID_ISO_DATE_ARGUMENT: Tn(),
    NOT_SUPPORT_NON_STRING_MESSAGE: Tn(),
    NOT_SUPPORT_LOCALE_PROMISE_VALUE: Tn(),
    NOT_SUPPORT_LOCALE_ASYNC_FUNCTION: Tn(),
    NOT_SUPPORT_LOCALE_TYPE: Tn(),
    __EXTEND_POINT__: Tn()
  };
function kt(e) {
  return cr(e, null, void 0);
}
function Ji(e, t) {
  return t.locale != null ? Cl(t.locale) : Cl(e.locale);
}
let xo;
function Cl(e) {
  if (X(e)) return e;
  if (Re(e)) {
    if (e.resolvedOnce && xo != null) return xo;
    if (e.constructor.name === 'Function') {
      const t = e();
      if (Bg(t)) throw kt(Ot.NOT_SUPPORT_LOCALE_PROMISE_VALUE);
      return (xo = t);
    } else throw kt(Ot.NOT_SUPPORT_LOCALE_ASYNC_FUNCTION);
  } else throw kt(Ot.NOT_SUPPORT_LOCALE_TYPE);
}
function z_(e, t, n) {
  return [...new Set([n, ...(Ie(t) ? t : ye(t) ? Object.keys(t) : X(t) ? [t] : [n])])];
}
function Of(e, t, n) {
  const r = X(n) ? n : tr,
    s = e;
  s.__localeChainCache || (s.__localeChainCache = new Map());
  let o = s.__localeChainCache.get(r);
  if (!o) {
    o = [];
    let i = [n];
    for (; Ie(i); ) i = Ll(o, i, t);
    const a = Ie(t) || !ce(t) ? t : t.default ? t.default : null;
    ((i = X(a) ? [a] : a), Ie(i) && Ll(o, i, !1), s.__localeChainCache.set(r, o));
  }
  return o;
}
function Ll(e, t, n) {
  let r = !0;
  for (let s = 0; s < t.length && he(r); s++) {
    const o = t[s];
    X(o) && (r = Q_(e, t[s], n));
  }
  return r;
}
function Q_(e, t, n) {
  let r;
  const s = t.split('-');
  do {
    const o = s.join('-');
    ((r = Z_(e, o, n)), s.splice(-1, 1));
  } while (s.length && r === !0);
  return r;
}
function Z_(e, t, n) {
  let r = !1;
  if (!e.includes(t) && ((r = !0), t)) {
    r = t[t.length - 1] !== '!';
    const s = t.replace(/!/g, '');
    (e.push(s), (Ie(n) || ce(n)) && n[s] && (r = n[s]));
  }
  return r;
}
const ey = '9.14.5',
  uo = -1,
  tr = 'en-US',
  Nl = '',
  Il = e => `${e.charAt(0).toLocaleUpperCase()}${e.substr(1)}`;
function ty() {
  return {
    upper: (e, t) =>
      t === 'text' && X(e)
        ? e.toUpperCase()
        : t === 'vnode' && ye(e) && '__v_isVNode' in e
          ? e.children.toUpperCase()
          : e,
    lower: (e, t) =>
      t === 'text' && X(e)
        ? e.toLowerCase()
        : t === 'vnode' && ye(e) && '__v_isVNode' in e
          ? e.children.toLowerCase()
          : e,
    capitalize: (e, t) =>
      t === 'text' && X(e) ? Il(e) : t === 'vnode' && ye(e) && '__v_isVNode' in e ? Il(e.children) : e
  };
}
let Rf;
function Pl(e) {
  Rf = e;
}
let Cf;
function ny(e) {
  Cf = e;
}
let Lf;
function ry(e) {
  Lf = e;
}
let Nf = null;
const sy = e => {
    Nf = e;
  },
  oy = () => Nf;
let If = null;
const Dl = e => {
    If = e;
  },
  iy = () => If;
let xl = 0;
function ay(e = {}) {
  const t = Re(e.onWarn) ? e.onWarn : Fg,
    n = X(e.version) ? e.version : ey,
    r = X(e.locale) || Re(e.locale) ? e.locale : tr,
    s = Re(r) ? tr : r,
    o =
      Ie(e.fallbackLocale) || ce(e.fallbackLocale) || X(e.fallbackLocale) || e.fallbackLocale === !1
        ? e.fallbackLocale
        : s,
    i = ce(e.messages) ? e.messages : ko(s),
    a = ce(e.datetimeFormats) ? e.datetimeFormats : ko(s),
    l = ce(e.numberFormats) ? e.numberFormats : ko(s),
    c = Qe(Te(), e.modifiers, ty()),
    u = e.pluralRules || Te(),
    f = Re(e.missing) ? e.missing : null,
    d = he(e.missingWarn) || pn(e.missingWarn) ? e.missingWarn : !0,
    h = he(e.fallbackWarn) || pn(e.fallbackWarn) ? e.fallbackWarn : !0,
    p = !!e.fallbackFormat,
    y = !!e.unresolving,
    S = Re(e.postTranslation) ? e.postTranslation : null,
    A = ce(e.processor) ? e.processor : null,
    T = he(e.warnHtmlMessage) ? e.warnHtmlMessage : !0,
    E = !!e.escapeParameter,
    g = Re(e.messageCompiler) ? e.messageCompiler : Rf,
    C = Re(e.messageResolver) ? e.messageResolver : Cf || k_,
    I = Re(e.localeFallbacker) ? e.localeFallbacker : Lf || z_,
    D = ye(e.fallbackContext) ? e.fallbackContext : void 0,
    F = e,
    P = ye(F.__datetimeFormatters) ? F.__datetimeFormatters : new Map(),
    H = ye(F.__numberFormatters) ? F.__numberFormatters : new Map(),
    W = ye(F.__meta) ? F.__meta : {};
  xl++;
  const M = {
    version: n,
    cid: xl,
    locale: r,
    fallbackLocale: o,
    messages: i,
    modifiers: c,
    pluralRules: u,
    missing: f,
    missingWarn: d,
    fallbackWarn: h,
    fallbackFormat: p,
    unresolving: y,
    postTranslation: S,
    processor: A,
    warnHtmlMessage: T,
    escapeParameter: E,
    messageCompiler: g,
    messageResolver: C,
    localeFallbacker: I,
    fallbackContext: D,
    onWarn: t,
    __meta: W
  };
  return (
    (M.datetimeFormats = a),
    (M.numberFormats = l),
    (M.__datetimeFormatters = P),
    (M.__numberFormatters = H),
    __INTLIFY_PROD_DEVTOOLS__ && K_(M, n, W),
    M
  );
}
const ko = e => ({ [e]: Te() });
function zi(e, t, n, r, s) {
  const { missing: o, onWarn: i } = e;
  if (o !== null) {
    const a = o(e, n, t, s);
    return X(a) ? a : t;
  } else return t;
}
function yr(e, t, n) {
  const r = e;
  ((r.__localeChainCache = new Map()), e.localeFallbacker(e, n, t));
}
function ly(e, t) {
  return e === t ? !1 : e.split('-')[0] === t.split('-')[0];
}
function cy(e, t) {
  const n = t.indexOf(e);
  if (n === -1) return !1;
  for (let r = n + 1; r < t.length; r++) if (ly(e, t[r])) return !0;
  return !1;
}
function Fo(e) {
  return n => uy(n, e);
}
function uy(e, t) {
  const n = A_(t);
  if (n == null) throw Br(0);
  if (Xi(n) === 1) {
    const o = T_(n);
    return e.plural(o.reduce((i, a) => [...i, kl(e, a)], []));
  } else return kl(e, n);
}
function kl(e, t) {
  const n = w_(t);
  if (n != null) return e.type === 'text' ? n : e.normalize([n]);
  {
    const r = O_(t).reduce((s, o) => [...s, ui(e, o)], []);
    return e.normalize(r);
  }
}
function ui(e, t) {
  const n = Xi(t);
  switch (n) {
    case 3:
      return hs(t, n);
    case 9:
      return hs(t, n);
    case 4: {
      const r = t;
      if (wt(r, 'k') && r.k) return e.interpolate(e.named(r.k));
      if (wt(r, 'key') && r.key) return e.interpolate(e.named(r.key));
      throw Br(n);
    }
    case 5: {
      const r = t;
      if (wt(r, 'i') && ke(r.i)) return e.interpolate(e.list(r.i));
      if (wt(r, 'index') && ke(r.index)) return e.interpolate(e.list(r.index));
      throw Br(n);
    }
    case 6: {
      const r = t,
        s = R_(r),
        o = C_(r);
      return e.linked(ui(e, o), s ? ui(e, s) : void 0, e.type);
    }
    case 7:
      return hs(t, n);
    case 8:
      return hs(t, n);
    default:
      throw new Error(`unhandled node on format message part: ${n}`);
  }
}
const Pf = e => e;
let jn = Te();
function Df(e, t = {}) {
  let n = !1;
  const r = t.onError || Qg;
  return (
    (t.onError = s => {
      ((n = !0), r(s));
    }),
    { ...v_(e, t), detectError: n }
  );
}
const fy = (e, t) => {
  if (!X(e)) throw kt(Ot.NOT_SUPPORT_NON_STRING_MESSAGE);
  {
    he(t.warnHtmlMessage) && t.warnHtmlMessage;
    const r = (t.onCacheKey || Pf)(e),
      s = jn[r];
    if (s) return s;
    const { code: o, detectError: i } = Df(e, t),
      a = new Function(`return ${o}`)();
    return i ? a : (jn[r] = a);
  }
};
function dy(e, t) {
  if (__INTLIFY_JIT_COMPILATION__ && !__INTLIFY_DROP_MESSAGE_COMPILER__ && X(e)) {
    he(t.warnHtmlMessage) && t.warnHtmlMessage;
    const r = (t.onCacheKey || Pf)(e),
      s = jn[r];
    if (s) return s;
    const { ast: o, detectError: i } = Df(e, { ...t, location: !1, jit: !0 }),
      a = Fo(o);
    return i ? a : (jn[r] = a);
  } else {
    const n = e.cacheKey;
    if (n) {
      const r = jn[n];
      return r || (jn[n] = Fo(e));
    } else return Fo(e);
  }
}
const Fl = () => '',
  bt = e => Re(e);
function Ml(e, ...t) {
  const {
      fallbackFormat: n,
      postTranslation: r,
      unresolving: s,
      messageCompiler: o,
      fallbackLocale: i,
      messages: a
    } = e,
    [l, c] = fi(...t),
    u = he(c.missingWarn) ? c.missingWarn : e.missingWarn,
    f = he(c.fallbackWarn) ? c.fallbackWarn : e.fallbackWarn,
    d = he(c.escapeParameter) ? c.escapeParameter : e.escapeParameter,
    h = !!c.resolvedMessage,
    p = X(c.default) || he(c.default) ? (he(c.default) ? (o ? l : () => l) : c.default) : n ? (o ? l : () => l) : '',
    y = n || p !== '',
    S = Ji(e, c);
  d && hy(c);
  let [A, T, E] = h ? [l, S, a[S] || Te()] : xf(e, l, S, i, f, u),
    g = A,
    C = l;
  if ((!h && !(X(g) || Mt(g) || bt(g)) && y && ((g = p), (C = g)), !h && (!(X(g) || Mt(g) || bt(g)) || !X(T))))
    return s ? uo : l;
  let I = !1;
  const D = () => {
      I = !0;
    },
    F = bt(g) ? g : kf(e, l, T, g, C, D);
  if (I) return g;
  const P = gy(e, T, E, c),
    H = W_(P),
    W = py(e, F, H);
  let M = r ? r(W, l) : W;
  if ((d && X(M) && (M = $g(M)), __INTLIFY_PROD_DEVTOOLS__)) {
    const z = {
      timestamp: Date.now(),
      key: X(l) ? l : bt(g) ? g.key : '',
      locale: T || (bt(g) ? g.locale : ''),
      format: X(g) ? g : bt(g) ? g.source : '',
      message: M
    };
    ((z.meta = Qe({}, e.__meta, oy() || {})), q_(z));
  }
  return M;
}
function hy(e) {
  Ie(e.list)
    ? (e.list = e.list.map(t => (X(t) ? bl(t) : t)))
    : ye(e.named) &&
      Object.keys(e.named).forEach(t => {
        X(e.named[t]) && (e.named[t] = bl(e.named[t]));
      });
}
function xf(e, t, n, r, s, o) {
  const { messages: i, onWarn: a, messageResolver: l, localeFallbacker: c } = e,
    u = c(e, r, n);
  let f = Te(),
    d,
    h = null;
  const p = 'translate';
  for (
    let y = 0;
    y < u.length && ((d = u[y]), (f = i[d] || Te()), (h = l(f, t)) === null && (h = f[t]), !(X(h) || Mt(h) || bt(h)));
    y++
  )
    if (!cy(d, u)) {
      const S = zi(e, t, d, o, p);
      S !== t && (h = S);
    }
  return [h, d, f];
}
function kf(e, t, n, r, s, o) {
  const { messageCompiler: i, warnHtmlMessage: a } = e;
  if (bt(r)) {
    const c = r;
    return ((c.locale = c.locale || n), (c.key = c.key || t), c);
  }
  if (i == null) {
    const c = () => r;
    return ((c.locale = n), (c.key = t), c);
  }
  const l = i(r, my(e, n, s, r, a, o));
  return ((l.locale = n), (l.key = t), (l.source = r), l);
}
function py(e, t, n) {
  return t(n);
}
function fi(...e) {
  const [t, n, r] = e,
    s = Te();
  if (!X(t) && !ke(t) && !bt(t) && !Mt(t)) throw kt(Ot.INVALID_ARGUMENT);
  const o = ke(t) ? String(t) : (bt(t), t);
  return (
    ke(n) ? (s.plural = n) : X(n) ? (s.default = n) : ce(n) && !lo(n) ? (s.named = n) : Ie(n) && (s.list = n),
    ke(r) ? (s.plural = r) : X(r) ? (s.default = r) : ce(r) && Qe(s, r),
    [o, s]
  );
}
function my(e, t, n, r, s, o) {
  return {
    locale: t,
    key: n,
    warnHtmlMessage: s,
    onError: i => {
      throw (o && o(i), i);
    },
    onCacheKey: i => Mg(t, n, i)
  };
}
function gy(e, t, n, r) {
  const {
      modifiers: s,
      pluralRules: o,
      messageResolver: i,
      fallbackLocale: a,
      fallbackWarn: l,
      missingWarn: c,
      fallbackContext: u
    } = e,
    d = {
      locale: t,
      modifiers: s,
      pluralRules: o,
      messages: h => {
        let p = i(n, h);
        if (p == null && u) {
          const [, , y] = xf(u, h, t, a, l, c);
          p = i(y, h);
        }
        if (X(p) || Mt(p)) {
          let y = !1;
          const A = kf(e, h, t, p, h, () => {
            y = !0;
          });
          return y ? Fl : A;
        } else return bt(p) ? p : Fl;
      }
    };
  return (
    e.processor && (d.processor = e.processor),
    r.list && (d.list = r.list),
    r.named && (d.named = r.named),
    ke(r.plural) && (d.pluralIndex = r.plural),
    d
  );
}
function Ul(e, ...t) {
  const { datetimeFormats: n, unresolving: r, fallbackLocale: s, onWarn: o, localeFallbacker: i } = e,
    { __datetimeFormatters: a } = e,
    [l, c, u, f] = di(...t),
    d = he(u.missingWarn) ? u.missingWarn : e.missingWarn;
  he(u.fallbackWarn) ? u.fallbackWarn : e.fallbackWarn;
  const h = !!u.part,
    p = Ji(e, u),
    y = i(e, s, p);
  if (!X(l) || l === '') return new Intl.DateTimeFormat(p, f).format(c);
  let S = {},
    A,
    T = null;
  const E = 'datetime format';
  for (let I = 0; I < y.length && ((A = y[I]), (S = n[A] || {}), (T = S[l]), !ce(T)); I++) zi(e, l, A, d, E);
  if (!ce(T) || !X(A)) return r ? uo : l;
  let g = `${A}__${l}`;
  lo(f) || (g = `${g}__${JSON.stringify(f)}`);
  let C = a.get(g);
  return (C || ((C = new Intl.DateTimeFormat(A, Qe({}, T, f))), a.set(g, C)), h ? C.formatToParts(c) : C.format(c));
}
const Ff = [
  'localeMatcher',
  'weekday',
  'era',
  'year',
  'month',
  'day',
  'hour',
  'minute',
  'second',
  'timeZoneName',
  'formatMatcher',
  'hour12',
  'timeZone',
  'dateStyle',
  'timeStyle',
  'calendar',
  'dayPeriod',
  'numberingSystem',
  'hourCycle',
  'fractionalSecondDigits'
];
function di(...e) {
  const [t, n, r, s] = e,
    o = Te();
  let i = Te(),
    a;
  if (X(t)) {
    const l = t.match(/(\d{4}-\d{2}-\d{2})(T|\s)?(.*)/);
    if (!l) throw kt(Ot.INVALID_ISO_DATE_ARGUMENT);
    const c = l[3]
      ? l[3].trim().startsWith('T')
        ? `${l[1].trim()}${l[3].trim()}`
        : `${l[1].trim()}T${l[3].trim()}`
      : l[1].trim();
    a = new Date(c);
    try {
      a.toISOString();
    } catch {
      throw kt(Ot.INVALID_ISO_DATE_ARGUMENT);
    }
  } else if (Vg(t)) {
    if (isNaN(t.getTime())) throw kt(Ot.INVALID_DATE_ARGUMENT);
    a = t;
  } else if (ke(t)) a = t;
  else throw kt(Ot.INVALID_ARGUMENT);
  return (
    X(n)
      ? (o.key = n)
      : ce(n) &&
        Object.keys(n).forEach(l => {
          Ff.includes(l) ? (i[l] = n[l]) : (o[l] = n[l]);
        }),
    X(r) ? (o.locale = r) : ce(r) && (i = r),
    ce(s) && (i = s),
    [o.key || '', a, o, i]
  );
}
function Vl(e, t, n) {
  const r = e;
  for (const s in n) {
    const o = `${t}__${s}`;
    r.__datetimeFormatters.has(o) && r.__datetimeFormatters.delete(o);
  }
}
function Hl(e, ...t) {
  const { numberFormats: n, unresolving: r, fallbackLocale: s, onWarn: o, localeFallbacker: i } = e,
    { __numberFormatters: a } = e,
    [l, c, u, f] = hi(...t),
    d = he(u.missingWarn) ? u.missingWarn : e.missingWarn;
  he(u.fallbackWarn) ? u.fallbackWarn : e.fallbackWarn;
  const h = !!u.part,
    p = Ji(e, u),
    y = i(e, s, p);
  if (!X(l) || l === '') return new Intl.NumberFormat(p, f).format(c);
  let S = {},
    A,
    T = null;
  const E = 'number format';
  for (let I = 0; I < y.length && ((A = y[I]), (S = n[A] || {}), (T = S[l]), !ce(T)); I++) zi(e, l, A, d, E);
  if (!ce(T) || !X(A)) return r ? uo : l;
  let g = `${A}__${l}`;
  lo(f) || (g = `${g}__${JSON.stringify(f)}`);
  let C = a.get(g);
  return (C || ((C = new Intl.NumberFormat(A, Qe({}, T, f))), a.set(g, C)), h ? C.formatToParts(c) : C.format(c));
}
const Mf = [
  'localeMatcher',
  'style',
  'currency',
  'currencyDisplay',
  'currencySign',
  'useGrouping',
  'minimumIntegerDigits',
  'minimumFractionDigits',
  'maximumFractionDigits',
  'minimumSignificantDigits',
  'maximumSignificantDigits',
  'compactDisplay',
  'notation',
  'signDisplay',
  'unit',
  'unitDisplay',
  'roundingMode',
  'roundingPriority',
  'roundingIncrement',
  'trailingZeroDisplay'
];
function hi(...e) {
  const [t, n, r, s] = e,
    o = Te();
  let i = Te();
  if (!ke(t)) throw kt(Ot.INVALID_ARGUMENT);
  const a = t;
  return (
    X(n)
      ? (o.key = n)
      : ce(n) &&
        Object.keys(n).forEach(l => {
          Mf.includes(l) ? (i[l] = n[l]) : (o[l] = n[l]);
        }),
    X(r) ? (o.locale = r) : ce(r) && (i = r),
    ce(s) && (i = s),
    [o.key || '', a, o, i]
  );
}
function $l(e, t, n) {
  const r = e;
  for (const s in n) {
    const o = `${t}__${s}`;
    r.__numberFormatters.has(o) && r.__numberFormatters.delete(o);
  }
}
S_();
/*!
 * vue-i18n v9.14.5
 * (c) 2025 kazuya kawaguchi
 * Released under the MIT License.
 */ const _y = '9.14.5';
function yy() {
  (typeof __VUE_I18N_FULL_INSTALL__ != 'boolean' && (qt().__VUE_I18N_FULL_INSTALL__ = !0),
    typeof __VUE_I18N_LEGACY_API__ != 'boolean' && (qt().__VUE_I18N_LEGACY_API__ = !0),
    typeof __INTLIFY_JIT_COMPILATION__ != 'boolean' && (qt().__INTLIFY_JIT_COMPILATION__ = !1),
    typeof __INTLIFY_DROP_MESSAGE_COMPILER__ != 'boolean' && (qt().__INTLIFY_DROP_MESSAGE_COMPILER__ = !1),
    typeof __INTLIFY_PROD_DEVTOOLS__ != 'boolean' && (qt().__INTLIFY_PROD_DEVTOOLS__ = !1));
}
const Ey = J_.__EXTEND_POINT__,
  jt = co(Ey);
(jt(), jt(), jt(), jt(), jt(), jt(), jt(), jt(), jt());
const Uf = Ot.__EXTEND_POINT__,
  ut = co(Uf),
  Be = {
    UNEXPECTED_RETURN_TYPE: Uf,
    INVALID_ARGUMENT: ut(),
    MUST_BE_CALL_SETUP_TOP: ut(),
    NOT_INSTALLED: ut(),
    NOT_AVAILABLE_IN_LEGACY_MODE: ut(),
    REQUIRED_VALUE: ut(),
    INVALID_VALUE: ut(),
    CANNOT_SETUP_VUE_DEVTOOLS_PLUGIN: ut(),
    NOT_INSTALLED_WITH_PROVIDE: ut(),
    UNEXPECTED_ERROR: ut(),
    NOT_COMPATIBLE_LEGACY_VUE_I18N: ut(),
    BRIDGE_SUPPORT_VUE_2_ONLY: ut(),
    MUST_DEFINE_I18N_OPTION_IN_ALLOW_COMPOSITION: ut(),
    NOT_AVAILABLE_COMPOSITION_IN_LEGACY: ut(),
    __EXTEND_POINT__: ut()
  };
function Ge(e, ...t) {
  return cr(e, null, void 0);
}
const pi = mn('__translateVNode'),
  mi = mn('__datetimeParts'),
  gi = mn('__numberParts'),
  Vf = mn('__setPluralRules'),
  Hf = mn('__injectWithOption'),
  _i = mn('__dispose');
function Gr(e) {
  if (!ye(e) || Mt(e)) return e;
  for (const t in e)
    if (wt(e, t))
      if (!t.includes('.')) ye(e[t]) && Gr(e[t]);
      else {
        const n = t.split('.'),
          r = n.length - 1;
        let s = e,
          o = !1;
        for (let i = 0; i < r; i++) {
          if (n[i] === '__proto__') throw new Error(`unsafe key: ${n[i]}`);
          if ((n[i] in s || (s[n[i]] = Te()), !ye(s[n[i]]))) {
            o = !0;
            break;
          }
          s = s[n[i]];
        }
        if ((o || (Mt(s) ? Tf.includes(n[r]) || delete e[t] : ((s[n[r]] = e[t]), delete e[t])), !Mt(s))) {
          const i = s[n[r]];
          ye(i) && Gr(i);
        }
      }
  return e;
}
function fo(e, t) {
  const { messages: n, __i18n: r, messageResolver: s, flatJson: o } = t,
    i = ce(n) ? n : Ie(r) ? Te() : { [e]: Te() };
  if (
    (Ie(r) &&
      r.forEach(a => {
        if ('locale' in a && 'resource' in a) {
          const { locale: l, resource: c } = a;
          l ? ((i[l] = i[l] || Te()), ys(c, i[l])) : ys(c, i);
        } else X(a) && ys(JSON.parse(a), i);
      }),
    s == null && o)
  )
    for (const a in i) wt(i, a) && Gr(i[a]);
  return i;
}
function $f(e) {
  return e.type;
}
function jf(e, t, n) {
  let r = ye(t.messages) ? t.messages : Te();
  '__i18nGlobal' in n && (r = fo(e.locale.value, { messages: r, __i18n: n.__i18nGlobal }));
  const s = Object.keys(r);
  s.length &&
    s.forEach(o => {
      e.mergeLocaleMessage(o, r[o]);
    });
  {
    if (ye(t.datetimeFormats)) {
      const o = Object.keys(t.datetimeFormats);
      o.length &&
        o.forEach(i => {
          e.mergeDateTimeFormat(i, t.datetimeFormats[i]);
        });
    }
    if (ye(t.numberFormats)) {
      const o = Object.keys(t.numberFormats);
      o.length &&
        o.forEach(i => {
          e.mergeNumberFormat(i, t.numberFormats[i]);
        });
    }
  }
}
function jl(e) {
  return Ue(zr, null, e, 0);
}
const Bl = '__INTLIFY_META__',
  Wl = () => [],
  by = () => !1;
let Gl = 0;
function Kl(e) {
  return (t, n, r, s) => e(n, r, At() || void 0, s);
}
const vy = () => {
  const e = At();
  let t = null;
  return e && (t = $f(e)[Bl]) ? { [Bl]: t } : null;
};
function Qi(e = {}, t) {
  const { __root: n, __injectWithOption: r } = e,
    s = n === void 0,
    o = e.flatJson,
    i = ks ? le : zs,
    a = !!e.translateExistCompatible;
  let l = he(e.inheritLocale) ? e.inheritLocale : !0;
  const c = i(n && l ? n.locale.value : X(e.locale) ? e.locale : tr),
    u = i(
      n && l
        ? n.fallbackLocale.value
        : X(e.fallbackLocale) || Ie(e.fallbackLocale) || ce(e.fallbackLocale) || e.fallbackLocale === !1
          ? e.fallbackLocale
          : c.value
    ),
    f = i(fo(c.value, e)),
    d = i(ce(e.datetimeFormats) ? e.datetimeFormats : { [c.value]: {} }),
    h = i(ce(e.numberFormats) ? e.numberFormats : { [c.value]: {} });
  let p = n ? n.missingWarn : he(e.missingWarn) || pn(e.missingWarn) ? e.missingWarn : !0,
    y = n ? n.fallbackWarn : he(e.fallbackWarn) || pn(e.fallbackWarn) ? e.fallbackWarn : !0,
    S = n ? n.fallbackRoot : he(e.fallbackRoot) ? e.fallbackRoot : !0,
    A = !!e.fallbackFormat,
    T = Re(e.missing) ? e.missing : null,
    E = Re(e.missing) ? Kl(e.missing) : null,
    g = Re(e.postTranslation) ? e.postTranslation : null,
    C = n ? n.warnHtmlMessage : he(e.warnHtmlMessage) ? e.warnHtmlMessage : !0,
    I = !!e.escapeParameter;
  const D = n ? n.modifiers : ce(e.modifiers) ? e.modifiers : {};
  let F = e.pluralRules || (n && n.pluralRules),
    P;
  ((P = (() => {
    s && Dl(null);
    const k = {
      version: _y,
      locale: c.value,
      fallbackLocale: u.value,
      messages: f.value,
      modifiers: D,
      pluralRules: F,
      missing: E === null ? void 0 : E,
      missingWarn: p,
      fallbackWarn: y,
      fallbackFormat: A,
      unresolving: !0,
      postTranslation: g === null ? void 0 : g,
      warnHtmlMessage: C,
      escapeParameter: I,
      messageResolver: e.messageResolver,
      messageCompiler: e.messageCompiler,
      __meta: { framework: 'vue' }
    };
    ((k.datetimeFormats = d.value),
      (k.numberFormats = h.value),
      (k.__datetimeFormatters = ce(P) ? P.__datetimeFormatters : void 0),
      (k.__numberFormatters = ce(P) ? P.__numberFormatters : void 0));
    const $ = ay(k);
    return (s && Dl($), $);
  })()),
    yr(P, c.value, u.value));
  function W() {
    return [c.value, u.value, f.value, d.value, h.value];
  }
  const M = Ae({
      get: () => c.value,
      set: k => {
        ((c.value = k), (P.locale = c.value));
      }
    }),
    z = Ae({
      get: () => u.value,
      set: k => {
        ((u.value = k), (P.fallbackLocale = u.value), yr(P, c.value, k));
      }
    }),
    ie = Ae(() => f.value),
    Se = Ae(() => d.value),
    se = Ae(() => h.value);
  function te() {
    return Re(g) ? g : null;
  }
  function de(k) {
    ((g = k), (P.postTranslation = k));
  }
  function Me() {
    return T;
  }
  function Le(k) {
    (k !== null && (E = Kl(k)), (T = k), (P.missing = E));
  }
  const ue = (k, $, ee, fe, we, rt) => {
    W();
    let Ke;
    try {
      (__INTLIFY_PROD_DEVTOOLS__, s || (P.fallbackContext = n ? iy() : void 0), (Ke = k(P)));
    } finally {
      (__INTLIFY_PROD_DEVTOOLS__, s || (P.fallbackContext = void 0));
    }
    if ((ee !== 'translate exists' && ke(Ke) && Ke === uo) || (ee === 'translate exists' && !Ke)) {
      const [yn, go] = $();
      return n && S ? fe(n) : we(yn);
    } else {
      if (rt(Ke)) return Ke;
      throw Ge(Be.UNEXPECTED_RETURN_TYPE);
    }
  };
  function pe(...k) {
    return ue(
      $ => Reflect.apply(Ml, null, [$, ...k]),
      () => fi(...k),
      'translate',
      $ => Reflect.apply($.t, $, [...k]),
      $ => $,
      $ => X($)
    );
  }
  function Ne(...k) {
    const [$, ee, fe] = k;
    if (fe && !ye(fe)) throw Ge(Be.INVALID_ARGUMENT);
    return pe($, ee, Qe({ resolvedMessage: !0 }, fe || {}));
  }
  function xe(...k) {
    return ue(
      $ => Reflect.apply(Ul, null, [$, ...k]),
      () => di(...k),
      'datetime format',
      $ => Reflect.apply($.d, $, [...k]),
      () => Nl,
      $ => X($)
    );
  }
  function We(...k) {
    return ue(
      $ => Reflect.apply(Hl, null, [$, ...k]),
      () => hi(...k),
      'number format',
      $ => Reflect.apply($.n, $, [...k]),
      () => Nl,
      $ => X($)
    );
  }
  function ne(k) {
    return k.map($ => (X($) || ke($) || he($) ? jl(String($)) : $));
  }
  const Y = { normalize: ne, interpolate: k => k, type: 'vnode' };
  function K(...k) {
    return ue(
      $ => {
        let ee;
        const fe = $;
        try {
          ((fe.processor = Y), (ee = Reflect.apply(Ml, null, [fe, ...k])));
        } finally {
          fe.processor = null;
        }
        return ee;
      },
      () => fi(...k),
      'translate',
      $ => $[pi](...k),
      $ => [jl($)],
      $ => Ie($)
    );
  }
  function Q(...k) {
    return ue(
      $ => Reflect.apply(Hl, null, [$, ...k]),
      () => hi(...k),
      'number format',
      $ => $[gi](...k),
      Wl,
      $ => X($) || Ie($)
    );
  }
  function ae(...k) {
    return ue(
      $ => Reflect.apply(Ul, null, [$, ...k]),
      () => di(...k),
      'datetime format',
      $ => $[mi](...k),
      Wl,
      $ => X($) || Ie($)
    );
  }
  function b(k) {
    ((F = k), (P.pluralRules = F));
  }
  function O(k, $) {
    return ue(
      () => {
        if (!k) return !1;
        const ee = X($) ? $ : c.value,
          fe = R(ee),
          we = P.messageResolver(fe, k);
        return a ? we != null : Mt(we) || bt(we) || X(we);
      },
      () => [k],
      'translate exists',
      ee => Reflect.apply(ee.te, ee, [k, $]),
      by,
      ee => he(ee)
    );
  }
  function v(k) {
    let $ = null;
    const ee = Of(P, u.value, c.value);
    for (let fe = 0; fe < ee.length; fe++) {
      const we = f.value[ee[fe]] || {},
        rt = P.messageResolver(we, k);
      if (rt != null) {
        $ = rt;
        break;
      }
    }
    return $;
  }
  function w(k) {
    const $ = v(k);
    return $ ?? (n ? n.tm(k) || {} : {});
  }
  function R(k) {
    return f.value[k] || {};
  }
  function L(k, $) {
    if (o) {
      const ee = { [k]: $ };
      for (const fe in ee) wt(ee, fe) && Gr(ee[fe]);
      $ = ee[k];
    }
    ((f.value[k] = $), (P.messages = f.value));
  }
  function j(k, $) {
    f.value[k] = f.value[k] || {};
    const ee = { [k]: $ };
    if (o) for (const fe in ee) wt(ee, fe) && Gr(ee[fe]);
    (($ = ee[k]), ys($, f.value[k]), (P.messages = f.value));
  }
  function B(k) {
    return d.value[k] || {};
  }
  function m(k, $) {
    ((d.value[k] = $), (P.datetimeFormats = d.value), Vl(P, k, $));
  }
  function _(k, $) {
    ((d.value[k] = Qe(d.value[k] || {}, $)), (P.datetimeFormats = d.value), Vl(P, k, $));
  }
  function x(k) {
    return h.value[k] || {};
  }
  function V(k, $) {
    ((h.value[k] = $), (P.numberFormats = h.value), $l(P, k, $));
  }
  function q(k, $) {
    ((h.value[k] = Qe(h.value[k] || {}, $)), (P.numberFormats = h.value), $l(P, k, $));
  }
  (Gl++,
    n &&
      ks &&
      (vt(n.locale, k => {
        l && ((c.value = k), (P.locale = k), yr(P, c.value, u.value));
      }),
      vt(n.fallbackLocale, k => {
        l && ((u.value = k), (P.fallbackLocale = k), yr(P, c.value, u.value));
      })));
  const G = {
    id: Gl,
    locale: M,
    fallbackLocale: z,
    get inheritLocale() {
      return l;
    },
    set inheritLocale(k) {
      ((l = k), k && n && ((c.value = n.locale.value), (u.value = n.fallbackLocale.value), yr(P, c.value, u.value)));
    },
    get availableLocales() {
      return Object.keys(f.value).sort();
    },
    messages: ie,
    get modifiers() {
      return D;
    },
    get pluralRules() {
      return F || {};
    },
    get isGlobal() {
      return s;
    },
    get missingWarn() {
      return p;
    },
    set missingWarn(k) {
      ((p = k), (P.missingWarn = p));
    },
    get fallbackWarn() {
      return y;
    },
    set fallbackWarn(k) {
      ((y = k), (P.fallbackWarn = y));
    },
    get fallbackRoot() {
      return S;
    },
    set fallbackRoot(k) {
      S = k;
    },
    get fallbackFormat() {
      return A;
    },
    set fallbackFormat(k) {
      ((A = k), (P.fallbackFormat = A));
    },
    get warnHtmlMessage() {
      return C;
    },
    set warnHtmlMessage(k) {
      ((C = k), (P.warnHtmlMessage = k));
    },
    get escapeParameter() {
      return I;
    },
    set escapeParameter(k) {
      ((I = k), (P.escapeParameter = k));
    },
    t: pe,
    getLocaleMessage: R,
    setLocaleMessage: L,
    mergeLocaleMessage: j,
    getPostTranslationHandler: te,
    setPostTranslationHandler: de,
    getMissingHandler: Me,
    setMissingHandler: Le,
    [Vf]: b
  };
  return (
    (G.datetimeFormats = Se),
    (G.numberFormats = se),
    (G.rt = Ne),
    (G.te = O),
    (G.tm = w),
    (G.d = xe),
    (G.n = We),
    (G.getDateTimeFormat = B),
    (G.setDateTimeFormat = m),
    (G.mergeDateTimeFormat = _),
    (G.getNumberFormat = x),
    (G.setNumberFormat = V),
    (G.mergeNumberFormat = q),
    (G[Hf] = r),
    (G[pi] = K),
    (G[mi] = ae),
    (G[gi] = Q),
    G
  );
}
function Sy(e) {
  const t = X(e.locale) ? e.locale : tr,
    n =
      X(e.fallbackLocale) || Ie(e.fallbackLocale) || ce(e.fallbackLocale) || e.fallbackLocale === !1
        ? e.fallbackLocale
        : t,
    r = Re(e.missing) ? e.missing : void 0,
    s = he(e.silentTranslationWarn) || pn(e.silentTranslationWarn) ? !e.silentTranslationWarn : !0,
    o = he(e.silentFallbackWarn) || pn(e.silentFallbackWarn) ? !e.silentFallbackWarn : !0,
    i = he(e.fallbackRoot) ? e.fallbackRoot : !0,
    a = !!e.formatFallbackMessages,
    l = ce(e.modifiers) ? e.modifiers : {},
    c = e.pluralizationRules,
    u = Re(e.postTranslation) ? e.postTranslation : void 0,
    f = X(e.warnHtmlInMessage) ? e.warnHtmlInMessage !== 'off' : !0,
    d = !!e.escapeParameterHtml,
    h = he(e.sync) ? e.sync : !0;
  let p = e.messages;
  if (ce(e.sharedMessages)) {
    const I = e.sharedMessages;
    p = Object.keys(I).reduce((F, P) => {
      const H = F[P] || (F[P] = {});
      return (Qe(H, I[P]), F);
    }, p || {});
  }
  const { __i18n: y, __root: S, __injectWithOption: A } = e,
    T = e.datetimeFormats,
    E = e.numberFormats,
    g = e.flatJson,
    C = e.translateExistCompatible;
  return {
    locale: t,
    fallbackLocale: n,
    messages: p,
    flatJson: g,
    datetimeFormats: T,
    numberFormats: E,
    missing: r,
    missingWarn: s,
    fallbackWarn: o,
    fallbackRoot: i,
    fallbackFormat: a,
    modifiers: l,
    pluralRules: c,
    postTranslation: u,
    warnHtmlMessage: f,
    escapeParameter: d,
    messageResolver: e.messageResolver,
    inheritLocale: h,
    translateExistCompatible: C,
    __i18n: y,
    __root: S,
    __injectWithOption: A
  };
}
function yi(e = {}, t) {
  {
    const n = Qi(Sy(e)),
      { __extender: r } = e,
      s = {
        id: n.id,
        get locale() {
          return n.locale.value;
        },
        set locale(o) {
          n.locale.value = o;
        },
        get fallbackLocale() {
          return n.fallbackLocale.value;
        },
        set fallbackLocale(o) {
          n.fallbackLocale.value = o;
        },
        get messages() {
          return n.messages.value;
        },
        get datetimeFormats() {
          return n.datetimeFormats.value;
        },
        get numberFormats() {
          return n.numberFormats.value;
        },
        get availableLocales() {
          return n.availableLocales;
        },
        get formatter() {
          return {
            interpolate() {
              return [];
            }
          };
        },
        set formatter(o) {},
        get missing() {
          return n.getMissingHandler();
        },
        set missing(o) {
          n.setMissingHandler(o);
        },
        get silentTranslationWarn() {
          return he(n.missingWarn) ? !n.missingWarn : n.missingWarn;
        },
        set silentTranslationWarn(o) {
          n.missingWarn = he(o) ? !o : o;
        },
        get silentFallbackWarn() {
          return he(n.fallbackWarn) ? !n.fallbackWarn : n.fallbackWarn;
        },
        set silentFallbackWarn(o) {
          n.fallbackWarn = he(o) ? !o : o;
        },
        get modifiers() {
          return n.modifiers;
        },
        get formatFallbackMessages() {
          return n.fallbackFormat;
        },
        set formatFallbackMessages(o) {
          n.fallbackFormat = o;
        },
        get postTranslation() {
          return n.getPostTranslationHandler();
        },
        set postTranslation(o) {
          n.setPostTranslationHandler(o);
        },
        get sync() {
          return n.inheritLocale;
        },
        set sync(o) {
          n.inheritLocale = o;
        },
        get warnHtmlInMessage() {
          return n.warnHtmlMessage ? 'warn' : 'off';
        },
        set warnHtmlInMessage(o) {
          n.warnHtmlMessage = o !== 'off';
        },
        get escapeParameterHtml() {
          return n.escapeParameter;
        },
        set escapeParameterHtml(o) {
          n.escapeParameter = o;
        },
        get preserveDirectiveContent() {
          return !0;
        },
        set preserveDirectiveContent(o) {},
        get pluralizationRules() {
          return n.pluralRules || {};
        },
        __composer: n,
        t(...o) {
          const [i, a, l] = o,
            c = {};
          let u = null,
            f = null;
          if (!X(i)) throw Ge(Be.INVALID_ARGUMENT);
          const d = i;
          return (
            X(a) ? (c.locale = a) : Ie(a) ? (u = a) : ce(a) && (f = a),
            Ie(l) ? (u = l) : ce(l) && (f = l),
            Reflect.apply(n.t, n, [d, u || f || {}, c])
          );
        },
        rt(...o) {
          return Reflect.apply(n.rt, n, [...o]);
        },
        tc(...o) {
          const [i, a, l] = o,
            c = { plural: 1 };
          let u = null,
            f = null;
          if (!X(i)) throw Ge(Be.INVALID_ARGUMENT);
          const d = i;
          return (
            X(a) ? (c.locale = a) : ke(a) ? (c.plural = a) : Ie(a) ? (u = a) : ce(a) && (f = a),
            X(l) ? (c.locale = l) : Ie(l) ? (u = l) : ce(l) && (f = l),
            Reflect.apply(n.t, n, [d, u || f || {}, c])
          );
        },
        te(o, i) {
          return n.te(o, i);
        },
        tm(o) {
          return n.tm(o);
        },
        getLocaleMessage(o) {
          return n.getLocaleMessage(o);
        },
        setLocaleMessage(o, i) {
          n.setLocaleMessage(o, i);
        },
        mergeLocaleMessage(o, i) {
          n.mergeLocaleMessage(o, i);
        },
        d(...o) {
          return Reflect.apply(n.d, n, [...o]);
        },
        getDateTimeFormat(o) {
          return n.getDateTimeFormat(o);
        },
        setDateTimeFormat(o, i) {
          n.setDateTimeFormat(o, i);
        },
        mergeDateTimeFormat(o, i) {
          n.mergeDateTimeFormat(o, i);
        },
        n(...o) {
          return Reflect.apply(n.n, n, [...o]);
        },
        getNumberFormat(o) {
          return n.getNumberFormat(o);
        },
        setNumberFormat(o, i) {
          n.setNumberFormat(o, i);
        },
        mergeNumberFormat(o, i) {
          n.mergeNumberFormat(o, i);
        },
        getChoiceIndex(o, i) {
          return -1;
        }
      };
    return ((s.__extender = r), s);
  }
}
const Zi = {
  tag: { type: [String, Object] },
  locale: { type: String },
  scope: { type: String, validator: e => e === 'parent' || e === 'global', default: 'parent' },
  i18n: { type: Object }
};
function Ay({ slots: e }, t) {
  return t.length === 1 && t[0] === 'default'
    ? (e.default ? e.default() : []).reduce((r, s) => [...r, ...(s.type === ct ? s.children : [s])], [])
    : t.reduce((n, r) => {
        const s = e[r];
        return (s && (n[r] = s()), n);
      }, Te());
}
function Bf(e) {
  return ct;
}
const Ty = kn({
    name: 'i18n-t',
    props: Qe(
      {
        keypath: { type: String, required: !0 },
        plural: { type: [Number, String], validator: e => ke(e) || !isNaN(e) }
      },
      Zi
    ),
    setup(e, t) {
      const { slots: n, attrs: r } = t,
        s = e.i18n || ea({ useScope: e.scope, __useComponent: !0 });
      return () => {
        const o = Object.keys(n).filter(f => f !== '_'),
          i = Te();
        (e.locale && (i.locale = e.locale), e.plural !== void 0 && (i.plural = X(e.plural) ? +e.plural : e.plural));
        const a = Ay(t, o),
          l = s[pi](e.keypath, a, i),
          c = Qe(Te(), r),
          u = X(e.tag) || ye(e.tag) ? e.tag : Bf();
        return Zr(u, c, l);
      };
    }
  }),
  ql = Ty;
function wy(e) {
  return Ie(e) && !X(e[0]);
}
function Wf(e, t, n, r) {
  const { slots: s, attrs: o } = t;
  return () => {
    const i = { part: !0 };
    let a = Te();
    (e.locale && (i.locale = e.locale),
      X(e.format)
        ? (i.key = e.format)
        : ye(e.format) &&
          (X(e.format.key) && (i.key = e.format.key),
          (a = Object.keys(e.format).reduce((d, h) => (n.includes(h) ? Qe(Te(), d, { [h]: e.format[h] }) : d), Te()))));
    const l = r(e.value, i, a);
    let c = [i.key];
    Ie(l)
      ? (c = l.map((d, h) => {
          const p = s[d.type],
            y = p ? p({ [d.type]: d.value, index: h, parts: l }) : [d.value];
          return (wy(y) && (y[0].key = `${d.type}-${h}`), y);
        }))
      : X(l) && (c = [l]);
    const u = Qe(Te(), o),
      f = X(e.tag) || ye(e.tag) ? e.tag : Bf();
    return Zr(f, u, c);
  };
}
const Oy = kn({
    name: 'i18n-n',
    props: Qe({ value: { type: Number, required: !0 }, format: { type: [String, Object] } }, Zi),
    setup(e, t) {
      const n = e.i18n || ea({ useScope: e.scope, __useComponent: !0 });
      return Wf(e, t, Mf, (...r) => n[gi](...r));
    }
  }),
  Yl = Oy,
  Ry = kn({
    name: 'i18n-d',
    props: Qe({ value: { type: [Number, Date], required: !0 }, format: { type: [String, Object] } }, Zi),
    setup(e, t) {
      const n = e.i18n || ea({ useScope: e.scope, __useComponent: !0 });
      return Wf(e, t, Ff, (...r) => n[mi](...r));
    }
  }),
  Xl = Ry;
function Cy(e, t) {
  const n = e;
  if (e.mode === 'composition') return n.__getInstance(t) || e.global;
  {
    const r = n.__getInstance(t);
    return r != null ? r.__composer : e.global.__composer;
  }
}
function Ly(e) {
  const t = i => {
    const { instance: a, modifiers: l, value: c } = i;
    if (!a || !a.$) throw Ge(Be.UNEXPECTED_ERROR);
    const u = Cy(e, a.$),
      f = Jl(c);
    return [Reflect.apply(u.t, u, [...zl(f)]), u];
  };
  return {
    created: (i, a) => {
      const [l, c] = t(a);
      (ks &&
        e.global === c &&
        (i.__i18nWatcher = vt(c.locale, () => {
          a.instance && a.instance.$forceUpdate();
        })),
        (i.__composer = c),
        (i.textContent = l));
    },
    unmounted: i => {
      (ks && i.__i18nWatcher && (i.__i18nWatcher(), (i.__i18nWatcher = void 0), delete i.__i18nWatcher),
        i.__composer && ((i.__composer = void 0), delete i.__composer));
    },
    beforeUpdate: (i, { value: a }) => {
      if (i.__composer) {
        const l = i.__composer,
          c = Jl(a);
        i.textContent = Reflect.apply(l.t, l, [...zl(c)]);
      }
    },
    getSSRProps: i => {
      const [a] = t(i);
      return { textContent: a };
    }
  };
}
function Jl(e) {
  if (X(e)) return { path: e };
  if (ce(e)) {
    if (!('path' in e)) throw Ge(Be.REQUIRED_VALUE, 'path');
    return e;
  } else throw Ge(Be.INVALID_VALUE);
}
function zl(e) {
  const { path: t, locale: n, args: r, choice: s, plural: o } = e,
    i = {},
    a = r || {};
  return (X(n) && (i.locale = n), ke(s) && (i.plural = s), ke(o) && (i.plural = o), [t, a, i]);
}
function Ny(e, t, ...n) {
  const r = ce(n[0]) ? n[0] : {},
    s = !!r.useI18nComponentName;
  ((he(r.globalInstall) ? r.globalInstall : !0) &&
    ([s ? 'i18n' : ql.name, 'I18nT'].forEach(i => e.component(i, ql)),
    [Yl.name, 'I18nN'].forEach(i => e.component(i, Yl)),
    [Xl.name, 'I18nD'].forEach(i => e.component(i, Xl))),
    e.directive('t', Ly(t)));
}
function Iy(e, t, n) {
  return {
    beforeCreate() {
      const r = At();
      if (!r) throw Ge(Be.UNEXPECTED_ERROR);
      const s = this.$options;
      if (s.i18n) {
        const o = s.i18n;
        if ((s.__i18n && (o.__i18n = s.__i18n), (o.__root = t), this === this.$root)) this.$i18n = Ql(e, o);
        else {
          ((o.__injectWithOption = !0), (o.__extender = n.__vueI18nExtend), (this.$i18n = yi(o)));
          const i = this.$i18n;
          i.__extender && (i.__disposer = i.__extender(this.$i18n));
        }
      } else if (s.__i18n)
        if (this === this.$root) this.$i18n = Ql(e, s);
        else {
          this.$i18n = yi({ __i18n: s.__i18n, __injectWithOption: !0, __extender: n.__vueI18nExtend, __root: t });
          const o = this.$i18n;
          o.__extender && (o.__disposer = o.__extender(this.$i18n));
        }
      else this.$i18n = e;
      (s.__i18nGlobal && jf(t, s, s),
        (this.$t = (...o) => this.$i18n.t(...o)),
        (this.$rt = (...o) => this.$i18n.rt(...o)),
        (this.$tc = (...o) => this.$i18n.tc(...o)),
        (this.$te = (o, i) => this.$i18n.te(o, i)),
        (this.$d = (...o) => this.$i18n.d(...o)),
        (this.$n = (...o) => this.$i18n.n(...o)),
        (this.$tm = o => this.$i18n.tm(o)),
        n.__setInstance(r, this.$i18n));
    },
    mounted() {},
    unmounted() {
      const r = At();
      if (!r) throw Ge(Be.UNEXPECTED_ERROR);
      const s = this.$i18n;
      (delete this.$t,
        delete this.$rt,
        delete this.$tc,
        delete this.$te,
        delete this.$d,
        delete this.$n,
        delete this.$tm,
        s.__disposer && (s.__disposer(), delete s.__disposer, delete s.__extender),
        n.__deleteInstance(r),
        delete this.$i18n);
    }
  };
}
function Ql(e, t) {
  ((e.locale = t.locale || e.locale),
    (e.fallbackLocale = t.fallbackLocale || e.fallbackLocale),
    (e.missing = t.missing || e.missing),
    (e.silentTranslationWarn = t.silentTranslationWarn || e.silentFallbackWarn),
    (e.silentFallbackWarn = t.silentFallbackWarn || e.silentFallbackWarn),
    (e.formatFallbackMessages = t.formatFallbackMessages || e.formatFallbackMessages),
    (e.postTranslation = t.postTranslation || e.postTranslation),
    (e.warnHtmlInMessage = t.warnHtmlInMessage || e.warnHtmlInMessage),
    (e.escapeParameterHtml = t.escapeParameterHtml || e.escapeParameterHtml),
    (e.sync = t.sync || e.sync),
    e.__composer[Vf](t.pluralizationRules || e.pluralizationRules));
  const n = fo(e.locale, { messages: t.messages, __i18n: t.__i18n });
  return (
    Object.keys(n).forEach(r => e.mergeLocaleMessage(r, n[r])),
    t.datetimeFormats && Object.keys(t.datetimeFormats).forEach(r => e.mergeDateTimeFormat(r, t.datetimeFormats[r])),
    t.numberFormats && Object.keys(t.numberFormats).forEach(r => e.mergeNumberFormat(r, t.numberFormats[r])),
    e
  );
}
const Py = mn('global-vue-i18n');
function Dy(e = {}, t) {
  const n = __VUE_I18N_LEGACY_API__ && he(e.legacy) ? e.legacy : __VUE_I18N_LEGACY_API__,
    r = he(e.globalInjection) ? e.globalInjection : !0,
    s = __VUE_I18N_LEGACY_API__ && n ? !!e.allowComposition : !0,
    o = new Map(),
    [i, a] = xy(e, n),
    l = mn('');
  function c(d) {
    return o.get(d) || null;
  }
  function u(d, h) {
    o.set(d, h);
  }
  function f(d) {
    o.delete(d);
  }
  {
    const d = {
      get mode() {
        return __VUE_I18N_LEGACY_API__ && n ? 'legacy' : 'composition';
      },
      get allowComposition() {
        return s;
      },
      async install(h, ...p) {
        if (((h.__VUE_I18N_SYMBOL__ = l), h.provide(h.__VUE_I18N_SYMBOL__, d), ce(p[0]))) {
          const A = p[0];
          ((d.__composerExtend = A.__composerExtend), (d.__vueI18nExtend = A.__vueI18nExtend));
        }
        let y = null;
        (!n && r && (y = By(h, d.global)),
          __VUE_I18N_FULL_INSTALL__ && Ny(h, d, ...p),
          __VUE_I18N_LEGACY_API__ && n && h.mixin(Iy(a, a.__composer, d)));
        const S = h.unmount;
        h.unmount = () => {
          (y && y(), d.dispose(), S());
        };
      },
      get global() {
        return a;
      },
      dispose() {
        i.stop();
      },
      __instances: o,
      __getInstance: c,
      __setInstance: u,
      __deleteInstance: f
    };
    return d;
  }
}
function ea(e = {}) {
  const t = At();
  if (t == null) throw Ge(Be.MUST_BE_CALL_SETUP_TOP);
  if (!t.isCE && t.appContext.app != null && !t.appContext.app.__VUE_I18N_SYMBOL__) throw Ge(Be.NOT_INSTALLED);
  const n = ky(t),
    r = My(n),
    s = $f(t),
    o = Fy(e, s);
  if (__VUE_I18N_LEGACY_API__ && n.mode === 'legacy' && !e.__useComponent) {
    if (!n.allowComposition) throw Ge(Be.NOT_AVAILABLE_IN_LEGACY_MODE);
    return $y(t, o, r, e);
  }
  if (o === 'global') return (jf(r, e, s), r);
  if (o === 'parent') {
    let l = Uy(n, t, e.__useComponent);
    return (l == null && (l = r), l);
  }
  const i = n;
  let a = i.__getInstance(t);
  if (a == null) {
    const l = Qe({}, e);
    ('__i18n' in s && (l.__i18n = s.__i18n),
      r && (l.__root = r),
      (a = Qi(l)),
      i.__composerExtend && (a[_i] = i.__composerExtend(a)),
      Hy(i, t, a),
      i.__setInstance(t, a));
  }
  return a;
}
function xy(e, t, n) {
  const r = Ri();
  {
    const s = __VUE_I18N_LEGACY_API__ && t ? r.run(() => yi(e)) : r.run(() => Qi(e));
    if (s == null) throw Ge(Be.UNEXPECTED_ERROR);
    return [r, s];
  }
}
function ky(e) {
  {
    const t = mt(e.isCE ? Py : e.appContext.app.__VUE_I18N_SYMBOL__);
    if (!t) throw Ge(e.isCE ? Be.NOT_INSTALLED_WITH_PROVIDE : Be.UNEXPECTED_ERROR);
    return t;
  }
}
function Fy(e, t) {
  return lo(e) ? ('__i18n' in t ? 'local' : 'global') : e.useScope ? e.useScope : 'local';
}
function My(e) {
  return e.mode === 'composition' ? e.global : e.global.__composer;
}
function Uy(e, t, n = !1) {
  let r = null;
  const s = t.root;
  let o = Vy(t, n);
  for (; o != null; ) {
    const i = e;
    if (e.mode === 'composition') r = i.__getInstance(o);
    else if (__VUE_I18N_LEGACY_API__) {
      const a = i.__getInstance(o);
      a != null && ((r = a.__composer), n && r && !r[Hf] && (r = null));
    }
    if (r != null || s === o) break;
    o = o.parent;
  }
  return r;
}
function Vy(e, t = !1) {
  return e == null ? null : (t && e.vnode.ctx) || e.parent;
}
function Hy(e, t, n) {
  (lr(() => {}, t),
    eo(() => {
      const r = n;
      e.__deleteInstance(t);
      const s = r[_i];
      s && (s(), delete r[_i]);
    }, t));
}
function $y(e, t, n, r = {}) {
  const s = t === 'local',
    o = zs(null);
  if (s && e.proxy && !(e.proxy.$options.i18n || e.proxy.$options.__i18n))
    throw Ge(Be.MUST_DEFINE_I18N_OPTION_IN_ALLOW_COMPOSITION);
  const i = he(r.inheritLocale) ? r.inheritLocale : !X(r.locale),
    a = le(!s || i ? n.locale.value : X(r.locale) ? r.locale : tr),
    l = le(
      !s || i
        ? n.fallbackLocale.value
        : X(r.fallbackLocale) || Ie(r.fallbackLocale) || ce(r.fallbackLocale) || r.fallbackLocale === !1
          ? r.fallbackLocale
          : a.value
    ),
    c = le(fo(a.value, r)),
    u = le(ce(r.datetimeFormats) ? r.datetimeFormats : { [a.value]: {} }),
    f = le(ce(r.numberFormats) ? r.numberFormats : { [a.value]: {} }),
    d = s ? n.missingWarn : he(r.missingWarn) || pn(r.missingWarn) ? r.missingWarn : !0,
    h = s ? n.fallbackWarn : he(r.fallbackWarn) || pn(r.fallbackWarn) ? r.fallbackWarn : !0,
    p = s ? n.fallbackRoot : he(r.fallbackRoot) ? r.fallbackRoot : !0,
    y = !!r.fallbackFormat,
    S = Re(r.missing) ? r.missing : null,
    A = Re(r.postTranslation) ? r.postTranslation : null,
    T = s ? n.warnHtmlMessage : he(r.warnHtmlMessage) ? r.warnHtmlMessage : !0,
    E = !!r.escapeParameter,
    g = s ? n.modifiers : ce(r.modifiers) ? r.modifiers : {},
    C = r.pluralRules || (s && n.pluralRules);
  function I() {
    return [a.value, l.value, c.value, u.value, f.value];
  }
  const D = Ae({
      get: () => (o.value ? o.value.locale.value : a.value),
      set: v => {
        (o.value && (o.value.locale.value = v), (a.value = v));
      }
    }),
    F = Ae({
      get: () => (o.value ? o.value.fallbackLocale.value : l.value),
      set: v => {
        (o.value && (o.value.fallbackLocale.value = v), (l.value = v));
      }
    }),
    P = Ae(() => (o.value ? o.value.messages.value : c.value)),
    H = Ae(() => u.value),
    W = Ae(() => f.value);
  function M() {
    return o.value ? o.value.getPostTranslationHandler() : A;
  }
  function z(v) {
    o.value && o.value.setPostTranslationHandler(v);
  }
  function ie() {
    return o.value ? o.value.getMissingHandler() : S;
  }
  function Se(v) {
    o.value && o.value.setMissingHandler(v);
  }
  function se(v) {
    return (I(), v());
  }
  function te(...v) {
    return o.value ? se(() => Reflect.apply(o.value.t, null, [...v])) : se(() => '');
  }
  function de(...v) {
    return o.value ? Reflect.apply(o.value.rt, null, [...v]) : '';
  }
  function Me(...v) {
    return o.value ? se(() => Reflect.apply(o.value.d, null, [...v])) : se(() => '');
  }
  function Le(...v) {
    return o.value ? se(() => Reflect.apply(o.value.n, null, [...v])) : se(() => '');
  }
  function ue(v) {
    return o.value ? o.value.tm(v) : {};
  }
  function pe(v, w) {
    return o.value ? o.value.te(v, w) : !1;
  }
  function Ne(v) {
    return o.value ? o.value.getLocaleMessage(v) : {};
  }
  function xe(v, w) {
    o.value && (o.value.setLocaleMessage(v, w), (c.value[v] = w));
  }
  function We(v, w) {
    o.value && o.value.mergeLocaleMessage(v, w);
  }
  function ne(v) {
    return o.value ? o.value.getDateTimeFormat(v) : {};
  }
  function U(v, w) {
    o.value && (o.value.setDateTimeFormat(v, w), (u.value[v] = w));
  }
  function Y(v, w) {
    o.value && o.value.mergeDateTimeFormat(v, w);
  }
  function K(v) {
    return o.value ? o.value.getNumberFormat(v) : {};
  }
  function Q(v, w) {
    o.value && (o.value.setNumberFormat(v, w), (f.value[v] = w));
  }
  function ae(v, w) {
    o.value && o.value.mergeNumberFormat(v, w);
  }
  const b = {
    get id() {
      return o.value ? o.value.id : -1;
    },
    locale: D,
    fallbackLocale: F,
    messages: P,
    datetimeFormats: H,
    numberFormats: W,
    get inheritLocale() {
      return o.value ? o.value.inheritLocale : i;
    },
    set inheritLocale(v) {
      o.value && (o.value.inheritLocale = v);
    },
    get availableLocales() {
      return o.value ? o.value.availableLocales : Object.keys(c.value);
    },
    get modifiers() {
      return o.value ? o.value.modifiers : g;
    },
    get pluralRules() {
      return o.value ? o.value.pluralRules : C;
    },
    get isGlobal() {
      return o.value ? o.value.isGlobal : !1;
    },
    get missingWarn() {
      return o.value ? o.value.missingWarn : d;
    },
    set missingWarn(v) {
      o.value && (o.value.missingWarn = v);
    },
    get fallbackWarn() {
      return o.value ? o.value.fallbackWarn : h;
    },
    set fallbackWarn(v) {
      o.value && (o.value.missingWarn = v);
    },
    get fallbackRoot() {
      return o.value ? o.value.fallbackRoot : p;
    },
    set fallbackRoot(v) {
      o.value && (o.value.fallbackRoot = v);
    },
    get fallbackFormat() {
      return o.value ? o.value.fallbackFormat : y;
    },
    set fallbackFormat(v) {
      o.value && (o.value.fallbackFormat = v);
    },
    get warnHtmlMessage() {
      return o.value ? o.value.warnHtmlMessage : T;
    },
    set warnHtmlMessage(v) {
      o.value && (o.value.warnHtmlMessage = v);
    },
    get escapeParameter() {
      return o.value ? o.value.escapeParameter : E;
    },
    set escapeParameter(v) {
      o.value && (o.value.escapeParameter = v);
    },
    t: te,
    getPostTranslationHandler: M,
    setPostTranslationHandler: z,
    getMissingHandler: ie,
    setMissingHandler: Se,
    rt: de,
    d: Me,
    n: Le,
    tm: ue,
    te: pe,
    getLocaleMessage: Ne,
    setLocaleMessage: xe,
    mergeLocaleMessage: We,
    getDateTimeFormat: ne,
    setDateTimeFormat: U,
    mergeDateTimeFormat: Y,
    getNumberFormat: K,
    setNumberFormat: Q,
    mergeNumberFormat: ae
  };
  function O(v) {
    ((v.locale.value = a.value),
      (v.fallbackLocale.value = l.value),
      Object.keys(c.value).forEach(w => {
        v.mergeLocaleMessage(w, c.value[w]);
      }),
      Object.keys(u.value).forEach(w => {
        v.mergeDateTimeFormat(w, u.value[w]);
      }),
      Object.keys(f.value).forEach(w => {
        v.mergeNumberFormat(w, f.value[w]);
      }),
      (v.escapeParameter = E),
      (v.fallbackFormat = y),
      (v.fallbackRoot = p),
      (v.fallbackWarn = h),
      (v.missingWarn = d),
      (v.warnHtmlMessage = T));
  }
  return (
    lu(() => {
      if (e.proxy == null || e.proxy.$i18n == null) throw Ge(Be.NOT_AVAILABLE_COMPOSITION_IN_LEGACY);
      const v = (o.value = e.proxy.$i18n.__composer);
      t === 'global'
        ? ((a.value = v.locale.value),
          (l.value = v.fallbackLocale.value),
          (c.value = v.messages.value),
          (u.value = v.datetimeFormats.value),
          (f.value = v.numberFormats.value))
        : s && O(v);
    }),
    b
  );
}
const jy = ['locale', 'fallbackLocale', 'availableLocales'],
  Zl = ['t', 'rt', 'd', 'n', 'tm', 'te'];
function By(e, t) {
  const n = Object.create(null);
  return (
    jy.forEach(s => {
      const o = Object.getOwnPropertyDescriptor(t, s);
      if (!o) throw Ge(Be.UNEXPECTED_ERROR);
      const i = Pe(o.value)
        ? {
            get() {
              return o.value.value;
            },
            set(a) {
              o.value.value = a;
            }
          }
        : {
            get() {
              return o.get && o.get();
            }
          };
      Object.defineProperty(n, s, i);
    }),
    (e.config.globalProperties.$i18n = n),
    Zl.forEach(s => {
      const o = Object.getOwnPropertyDescriptor(t, s);
      if (!o || !o.value) throw Ge(Be.UNEXPECTED_ERROR);
      Object.defineProperty(e.config.globalProperties, `$${s}`, o);
    }),
    () => {
      (delete e.config.globalProperties.$i18n,
        Zl.forEach(s => {
          delete e.config.globalProperties[`$${s}`];
        }));
    }
  );
}
yy();
__INTLIFY_JIT_COMPILATION__ ? Pl(dy) : Pl(fy);
ny(F_);
ry(Of);
if (__INTLIFY_PROD_DEVTOOLS__) {
  const e = qt();
  ((e.__INTLIFY__ = !0), G_(e.__INTLIFY_DEVTOOLS_GLOBAL_HOOK__));
}
const Wy = {
    title: 'PoseCraft',
    subtitle: 'AI 姿势分析平台',
    search_placeholder: '搜索模板、作品...',
    recommended: '推荐',
    nearby: '附近',
    gallery: '画廊',
    new_template: '新建模板',
    profile: '我的',
    settings: '设置',
    login: '登录',
    logout: '退出登录'
  },
  Gy = { popular_templates: '热门模板', recent_works: '最新作品', load_more: '加载更多' },
  Ky = { title: '图片编辑器', save: '保存', export: '导出', undo: '撤销', redo: '重做' },
  qy = { title: 'AI 相机', capture: '拍照', analyze: '分析', switch_camera: '切换摄像头' },
  Yy = {
    loading: '加载中...',
    no_data: '暂无数据',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    create: '创建',
    success: '操作成功',
    error: '操作失败'
  },
  Xy = { app: Wy, home: Gy, editor: Ky, camera: qy, common: Yy },
  Jy = {
    title: 'PoseCraft',
    subtitle: 'AI Pose Analysis Platform',
    search_placeholder: 'Search templates, works...',
    recommended: 'Recommended',
    nearby: 'Nearby',
    gallery: 'Gallery',
    new_template: 'New Template',
    profile: 'Profile',
    settings: 'Settings',
    login: 'Login',
    logout: 'Logout'
  },
  zy = { popular_templates: 'Popular Templates', recent_works: 'Recent Works', load_more: 'Load More' },
  Qy = { title: 'Image Editor', save: 'Save', export: 'Export', undo: 'Undo', redo: 'Redo' },
  Zy = { title: 'AI Camera', capture: 'Capture', analyze: 'Analyze', switch_camera: 'Switch Camera' },
  eE = {
    loading: 'Loading...',
    no_data: 'No Data',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    success: 'Success',
    error: 'Error'
  },
  tE = { app: Jy, home: zy, editor: Qy, camera: Zy, common: eE },
  nE = Dy({
    legacy: !1,
    locale: localStorage.getItem('posecraft_locale') || 'zh',
    fallbackLocale: 'zh',
    messages: { zh: Xy, en: tE }
  });
function rE(e) {
  const t = In();
  return t.isLoggedIn ? (Array.isArray(e) ? e : [e]).some(r => t.hasRole(r)) : !1;
}
const sE = {
  mounted(e, t) {
    var r;
    const n = t.value;
    n && (rE(n) || (r = e.parentNode) == null || r.removeChild(e));
  }
};
function oE(e) {
  const t = In();
  return t.isLoggedIn ? (t.isAdmin ? !0 : (Array.isArray(e) ? e : [e]).some(r => t.hasPermission(r))) : !1;
}
const iE = {
  mounted(e, t) {
    var r;
    const n = t.value;
    n && (oE(n) || (r = e.parentNode) == null || r.removeChild(e));
  }
};
function aE(e) {
  (e.directive('role', sE), e.directive('auth', iE));
}
function Gf(e, t) {
  return function () {
    return e.apply(t, arguments);
  };
}
const { toString: lE } = Object.prototype,
  { getPrototypeOf: nr } = Object,
  { iterator: es, toStringTag: Kf } = Symbol,
  Ms = (
    ({ hasOwnProperty: e }) =>
    (t, n) =>
      e.call(t, n)
  )(Object.prototype),
  Kr = (e, t) => {
    let n = e;
    const r = [];
    for (; n != null && n !== Object.prototype; ) {
      if (r.indexOf(n) !== -1) return !1;
      if ((r.push(n), Ms(n, t))) return !0;
      n = nr(n);
    }
    return !1;
  },
  cE = (e, t) => (e != null && Kr(e, t) ? e[t] : void 0),
  ta = (e => t => {
    const n = lE.call(t);
    return e[n] || (e[n] = n.slice(8, -1).toLowerCase());
  })(Object.create(null)),
  Nt = e => ((e = e.toLowerCase()), t => ta(t) === e),
  ho = e => t => typeof t === e,
  { isArray: Dn } = Array,
  rr = ho('undefined');
function ur(e) {
  return (
    e !== null &&
    !rr(e) &&
    e.constructor !== null &&
    !rr(e.constructor) &&
    ft(e.constructor.isBuffer) &&
    e.constructor.isBuffer(e)
  );
}
const qf = Nt('ArrayBuffer');
function uE(e) {
  let t;
  return (
    typeof ArrayBuffer < 'u' && ArrayBuffer.isView ? (t = ArrayBuffer.isView(e)) : (t = e && e.buffer && qf(e.buffer)),
    t
  );
}
const fE = ho('string'),
  ft = ho('function'),
  Yf = ho('number'),
  fr = e => e !== null && typeof e == 'object',
  dE = e => e === !0 || e === !1,
  Es = e => {
    if (!fr(e)) return !1;
    const t = nr(e);
    return (t === null || t === Object.prototype || nr(t) === null) && !Kr(e, Kf) && !Kr(e, es);
  },
  hE = e => {
    if (!fr(e) || ur(e)) return !1;
    try {
      return Object.keys(e).length === 0 && Object.getPrototypeOf(e) === Object.prototype;
    } catch {
      return !1;
    }
  },
  pE = Nt('Date'),
  mE = Nt('File'),
  gE = e => !!(e && typeof e.uri < 'u'),
  _E = e => e && typeof e.getParts < 'u',
  yE = Nt('Blob'),
  EE = Nt('FileList'),
  bE = e => fr(e) && ft(e.pipe);
function vE() {
  return typeof globalThis < 'u'
    ? globalThis
    : typeof self < 'u'
      ? self
      : typeof window < 'u'
        ? window
        : typeof global < 'u'
          ? global
          : {};
}
const ec = vE(),
  tc = typeof ec.FormData < 'u' ? ec.FormData : void 0,
  SE = e => {
    if (!e) return !1;
    if (tc && e instanceof tc) return !0;
    const t = nr(e);
    if (!t || t === Object.prototype || !ft(e.append)) return !1;
    const n = ta(e);
    return n === 'formdata' || (n === 'object' && ft(e.toString) && e.toString() === '[object FormData]');
  },
  AE = Nt('URLSearchParams'),
  [TE, wE, OE, RE] = ['ReadableStream', 'Request', 'Response', 'Headers'].map(Nt),
  CE = e => (e.trim ? e.trim() : e.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, ''));
function ts(e, t, { allOwnKeys: n = !1 } = {}) {
  if (e === null || typeof e > 'u') return;
  let r, s;
  if ((typeof e != 'object' && (e = [e]), Dn(e))) for (r = 0, s = e.length; r < s; r++) t.call(null, e[r], r, e);
  else {
    if (ur(e)) return;
    const o = n ? Object.getOwnPropertyNames(e) : Object.keys(e),
      i = o.length;
    let a;
    for (r = 0; r < i; r++) ((a = o[r]), t.call(null, e[a], a, e));
  }
}
function Xf(e, t) {
  if (ur(e)) return null;
  t = t.toLowerCase();
  const n = Object.keys(e);
  let r = n.length,
    s;
  for (; r-- > 0; ) if (((s = n[r]), t === s.toLowerCase())) return s;
  return null;
}
const Cn = typeof globalThis < 'u' ? globalThis : typeof self < 'u' ? self : typeof window < 'u' ? window : global,
  Jf = e => !rr(e) && e !== Cn;
function Ei(...e) {
  const { caseless: t, skipUndefined: n } = (Jf(this) && this) || {},
    r = {},
    s = (o, i) => {
      if (i === '__proto__' || i === 'constructor' || i === 'prototype') return;
      const a = (t && typeof i == 'string' && Xf(r, i)) || i,
        l = Ms(r, a) ? r[a] : void 0;
      Es(l) && Es(o)
        ? (r[a] = Ei(l, o))
        : Es(o)
          ? (r[a] = Ei({}, o))
          : Dn(o)
            ? (r[a] = o.slice())
            : (!n || !rr(o)) && (r[a] = o);
    };
  for (let o = 0, i = e.length; o < i; o++) {
    const a = e[o];
    if (!a || ur(a) || (ts(a, s), typeof a != 'object' || Dn(a))) continue;
    const l = Object.getOwnPropertySymbols(a);
    for (let c = 0; c < l.length; c++) {
      const u = l[c];
      HE.call(a, u) && s(a[u], u);
    }
  }
  return r;
}
const LE = (e, t, n, { allOwnKeys: r } = {}) => (
    ts(
      t,
      (s, o) => {
        n && ft(s)
          ? Object.defineProperty(e, o, {
              __proto__: null,
              value: Gf(s, n),
              writable: !0,
              enumerable: !0,
              configurable: !0
            })
          : Object.defineProperty(e, o, { __proto__: null, value: s, writable: !0, enumerable: !0, configurable: !0 });
      },
      { allOwnKeys: r }
    ),
    e
  ),
  NE = e => (e.charCodeAt(0) === 65279 && (e = e.slice(1)), e),
  IE = (e, t, n, r) => {
    ((e.prototype = Object.create(t.prototype, r)),
      Object.defineProperty(e.prototype, 'constructor', {
        __proto__: null,
        value: e,
        writable: !0,
        enumerable: !1,
        configurable: !0
      }),
      Object.defineProperty(e, 'super', { __proto__: null, value: t.prototype }),
      n && Object.assign(e.prototype, n));
  },
  PE = (e, t, n, r) => {
    let s, o, i;
    const a = {};
    if (((t = t || {}), e == null)) return t;
    do {
      for (s = Object.getOwnPropertyNames(e), o = s.length; o-- > 0; )
        ((i = s[o]), (!r || r(i, e, t)) && !a[i] && ((t[i] = e[i]), (a[i] = !0)));
      e = n !== !1 && nr(e);
    } while (e && (!n || n(e, t)) && e !== Object.prototype);
    return t;
  },
  DE = (e, t, n) => {
    ((e = String(e)), (n === void 0 || n > e.length) && (n = e.length), (n -= t.length));
    const r = e.indexOf(t, n);
    return r !== -1 && r === n;
  },
  xE = e => {
    if (!e) return null;
    if (Dn(e)) return e;
    let t = e.length;
    if (!Yf(t)) return null;
    const n = new Array(t);
    for (; t-- > 0; ) n[t] = e[t];
    return n;
  },
  kE = (
    e => t =>
      e && t instanceof e
  )(typeof Uint8Array < 'u' && nr(Uint8Array)),
  FE = (e, t) => {
    const r = (e && e[es]).call(e);
    let s;
    for (; (s = r.next()) && !s.done; ) {
      const o = s.value;
      t.call(e, o[0], o[1]);
    }
  },
  ME = (e, t) => {
    let n;
    const r = [];
    for (; (n = e.exec(t)) !== null; ) r.push(n);
    return r;
  },
  UE = Nt('HTMLFormElement'),
  VE = e =>
    e.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function (n, r, s) {
      return r.toUpperCase() + s;
    }),
  { propertyIsEnumerable: HE } = Object.prototype,
  $E = Nt('RegExp'),
  zf = (e, t) => {
    const n = Object.getOwnPropertyDescriptors(e),
      r = {};
    (ts(n, (s, o) => {
      let i;
      (i = t(s, o, e)) !== !1 && (r[o] = i || s);
    }),
      Object.defineProperties(e, r));
  },
  jE = e => {
    zf(e, (t, n) => {
      if (ft(e) && ['arguments', 'caller', 'callee'].includes(n)) return !1;
      const r = e[n];
      if (ft(r)) {
        if (((t.enumerable = !1), 'writable' in t)) {
          t.writable = !1;
          return;
        }
        t.set ||
          (t.set = () => {
            throw Error("Can not rewrite read-only method '" + n + "'");
          });
      }
    });
  },
  BE = (e, t) => {
    const n = {},
      r = s => {
        s.forEach(o => {
          n[o] = !0;
        });
      };
    return (Dn(e) ? r(e) : r(String(e).split(t)), n);
  },
  WE = () => {},
  GE = (e, t) => (e != null && Number.isFinite((e = +e)) ? e : t);
function KE(e) {
  return !!(e && ft(e.append) && e[Kf] === 'FormData' && e[es]);
}
const qE = e => {
    const t = new WeakSet(),
      n = r => {
        if (fr(r)) {
          if (t.has(r)) return;
          if (ur(r)) return r;
          if (!('toJSON' in r)) {
            t.add(r);
            const s = Dn(r) ? [] : {};
            return (
              ts(r, (o, i) => {
                const a = n(o);
                !rr(a) && (s[i] = a);
              }),
              t.delete(r),
              s
            );
          }
        }
        return r;
      };
    return n(e);
  },
  YE = Nt('AsyncFunction'),
  XE = e => e && (fr(e) || ft(e)) && ft(e.then) && ft(e.catch),
  Qf = ((e, t) =>
    e
      ? setImmediate
      : t
        ? ((n, r) => (
            Cn.addEventListener(
              'message',
              ({ source: s, data: o }) => {
                s === Cn && o === n && r.length && r.shift()();
              },
              !1
            ),
            s => {
              (r.push(s), Cn.postMessage(n, '*'));
            }
          ))(`axios@${Math.random()}`, [])
        : n => setTimeout(n))(typeof setImmediate == 'function', ft(Cn.postMessage)),
  JE = typeof queueMicrotask < 'u' ? queueMicrotask.bind(Cn) : (typeof process < 'u' && process.nextTick) || Qf,
  Zf = e => e != null && ft(e[es]),
  zE = e => e != null && Kr(e, es) && Zf(e),
  N = {
    isArray: Dn,
    isArrayBuffer: qf,
    isBuffer: ur,
    isFormData: SE,
    isArrayBufferView: uE,
    isString: fE,
    isNumber: Yf,
    isBoolean: dE,
    isObject: fr,
    isPlainObject: Es,
    isEmptyObject: hE,
    isReadableStream: TE,
    isRequest: wE,
    isResponse: OE,
    isHeaders: RE,
    isUndefined: rr,
    isDate: pE,
    isFile: mE,
    isReactNativeBlob: gE,
    isReactNative: _E,
    isBlob: yE,
    isRegExp: $E,
    isFunction: ft,
    isStream: bE,
    isURLSearchParams: AE,
    isTypedArray: kE,
    isFileList: EE,
    forEach: ts,
    merge: Ei,
    extend: LE,
    trim: CE,
    stripBOM: NE,
    inherits: IE,
    toFlatObject: PE,
    kindOf: ta,
    kindOfTest: Nt,
    endsWith: DE,
    toArray: xE,
    forEachEntry: FE,
    matchAll: ME,
    isHTMLForm: UE,
    hasOwnProperty: Ms,
    hasOwnProp: Ms,
    hasOwnInPrototypeChain: Kr,
    getSafeProp: cE,
    reduceDescriptors: zf,
    freezeMethods: jE,
    toObjectSet: BE,
    toCamelCase: VE,
    noop: WE,
    toFiniteNumber: GE,
    findKey: Xf,
    global: Cn,
    isContextDefined: Jf,
    isSpecCompliantForm: KE,
    toJSONObject: qE,
    isAsyncFn: YE,
    isThenable: XE,
    setImmediate: Qf,
    asap: JE,
    isIterable: Zf,
    isSafeIterable: zE
  },
  QE = N.toObjectSet([
    'age',
    'authorization',
    'content-length',
    'content-type',
    'etag',
    'expires',
    'from',
    'host',
    'if-modified-since',
    'if-unmodified-since',
    'last-modified',
    'location',
    'max-forwards',
    'proxy-authorization',
    'referer',
    'retry-after',
    'user-agent'
  ]),
  ZE = e => {
    const t = {};
    let n, r, s;
    return (
      e &&
        e
          .split(
            `
`
          )
          .forEach(function (i) {
            ((s = i.indexOf(':')),
              (n = i.substring(0, s).trim().toLowerCase()),
              (r = i.substring(s + 1).trim()),
              !(!n || (t[n] && QE[n])) &&
                (n === 'set-cookie' ? (t[n] ? t[n].push(r) : (t[n] = [r])) : (t[n] = t[n] ? t[n] + ', ' + r : r)));
          }),
      t
    );
  };
function eb(e) {
  let t = 0,
    n = e.length;
  for (; t < n; ) {
    const r = e.charCodeAt(t);
    if (r !== 9 && r !== 32) break;
    t += 1;
  }
  for (; n > t; ) {
    const r = e.charCodeAt(n - 1);
    if (r !== 9 && r !== 32) break;
    n -= 1;
  }
  return t === 0 && n === e.length ? e : e.slice(t, n);
}
const tb = new RegExp('[\\u0000-\\u0008\\u000a-\\u001f\\u007f]+', 'g'),
  nb = new RegExp('[^\\u0009\\u0020-\\u007e\\u0080-\\u00ff]+', 'g');
function na(e, t) {
  return N.isArray(e) ? e.map(n => na(n, t)) : eb(String(e).replace(t, ''));
}
const rb = e => na(e, tb),
  sb = e => na(e, nb);
function ed(e) {
  const t = Object.create(null);
  return (
    N.forEach(e.toJSON(), (n, r) => {
      t[r] = sb(n);
    }),
    t
  );
}
const nc = Symbol('internals');
function Er(e) {
  return e && String(e).trim().toLowerCase();
}
function bs(e) {
  return e === !1 || e == null ? e : N.isArray(e) ? e.map(bs) : rb(String(e));
}
function ob(e) {
  const t = Object.create(null),
    n = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let r;
  for (; (r = n.exec(e)); ) t[r[1]] = r[2];
  return t;
}
const ib = e => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(e.trim());
function Mo(e, t, n, r, s) {
  if (N.isFunction(r)) return r.call(this, t, n);
  if ((s && (t = n), !!N.isString(t))) {
    if (N.isString(r)) return t.indexOf(r) !== -1;
    if (N.isRegExp(r)) return r.test(t);
  }
}
function ab(e) {
  return e
    .trim()
    .toLowerCase()
    .replace(/([a-z\d])(\w*)/g, (t, n, r) => n.toUpperCase() + r);
}
function lb(e, t) {
  const n = N.toCamelCase(' ' + t);
  ['get', 'set', 'has'].forEach(r => {
    Object.defineProperty(e, r + n, {
      __proto__: null,
      value: function (s, o, i) {
        return this[r].call(this, t, s, o, i);
      },
      configurable: !0
    });
  });
}
let nt = class {
  constructor(t) {
    t && this.set(t);
  }
  set(t, n, r) {
    const s = this;
    function o(a, l, c) {
      const u = Er(l);
      if (!u) return;
      const f = N.findKey(s, u);
      (!f || s[f] === void 0 || c === !0 || (c === void 0 && s[f] !== !1)) && (s[f || l] = bs(a));
    }
    const i = (a, l) => N.forEach(a, (c, u) => o(c, u, l));
    if (N.isPlainObject(t) || t instanceof this.constructor) i(t, n);
    else if (N.isString(t) && (t = t.trim()) && !ib(t)) i(ZE(t), n);
    else if (N.isObject(t) && N.isSafeIterable(t)) {
      let a = Object.create(null),
        l,
        c;
      for (const u of t) {
        if (!N.isArray(u)) throw new TypeError('Object iterator must return a key-value pair');
        ((c = u[0]),
          N.hasOwnProp(a, c) ? ((l = a[c]), (a[c] = N.isArray(l) ? [...l, u[1]] : [l, u[1]])) : (a[c] = u[1]));
      }
      i(a, n);
    } else t != null && o(n, t, r);
    return this;
  }
  get(t, n) {
    if (((t = Er(t)), t)) {
      const r = N.findKey(this, t);
      if (r) {
        const s = this[r];
        if (!n) return s;
        if (n === !0) return ob(s);
        if (N.isFunction(n)) return n.call(this, s, r);
        if (N.isRegExp(n)) return n.exec(s);
        throw new TypeError('parser must be boolean|regexp|function');
      }
    }
  }
  has(t, n) {
    if (((t = Er(t)), t)) {
      const r = N.findKey(this, t);
      return !!(r && this[r] !== void 0 && (!n || Mo(this, this[r], r, n)));
    }
    return !1;
  }
  delete(t, n) {
    const r = this;
    let s = !1;
    function o(i) {
      if (((i = Er(i)), i)) {
        const a = N.findKey(r, i);
        a && (!n || Mo(r, r[a], a, n)) && (delete r[a], (s = !0));
      }
    }
    return (N.isArray(t) ? t.forEach(o) : o(t), s);
  }
  clear(t) {
    const n = Object.keys(this);
    let r = n.length,
      s = !1;
    for (; r--; ) {
      const o = n[r];
      (!t || Mo(this, this[o], o, t, !0)) && (delete this[o], (s = !0));
    }
    return s;
  }
  normalize(t) {
    const n = this,
      r = {};
    return (
      N.forEach(this, (s, o) => {
        const i = N.findKey(r, o);
        if (i) {
          ((n[i] = bs(s)), delete n[o]);
          return;
        }
        const a = t ? ab(o) : String(o).trim();
        (a !== o && delete n[o], (n[a] = bs(s)), (r[a] = !0));
      }),
      this
    );
  }
  concat(...t) {
    return this.constructor.concat(this, ...t);
  }
  toJSON(t) {
    const n = Object.create(null);
    return (
      N.forEach(this, (r, s) => {
        r != null && r !== !1 && (n[s] = t && N.isArray(r) ? r.join(', ') : r);
      }),
      n
    );
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([t, n]) => t + ': ' + n).join(`
`);
  }
  getSetCookie() {
    return this.get('set-cookie') || [];
  }
  get [Symbol.toStringTag]() {
    return 'AxiosHeaders';
  }
  static from(t) {
    return t instanceof this ? t : new this(t);
  }
  static concat(t, ...n) {
    const r = new this(t);
    return (n.forEach(s => r.set(s)), r);
  }
  static accessor(t) {
    const r = (this[nc] = this[nc] = { accessors: {} }).accessors,
      s = this.prototype;
    function o(i) {
      const a = Er(i);
      r[a] || (lb(s, i), (r[a] = !0));
    }
    return (N.isArray(t) ? t.forEach(o) : o(t), this);
  }
};
nt.accessor(['Content-Type', 'Content-Length', 'Accept', 'Accept-Encoding', 'User-Agent', 'Authorization']);
N.reduceDescriptors(nt.prototype, ({ value: e }, t) => {
  let n = t[0].toUpperCase() + t.slice(1);
  return {
    get: () => e,
    set(r) {
      this[n] = r;
    }
  };
});
N.freezeMethods(nt);
const cb = '[REDACTED ****]';
function ub(e) {
  if (N.hasOwnProp(e, 'toJSON')) return !0;
  let t = Object.getPrototypeOf(e);
  for (; t && t !== Object.prototype; ) {
    if (N.hasOwnProp(t, 'toJSON')) return !0;
    t = Object.getPrototypeOf(t);
  }
  return !1;
}
function fb(e, t) {
  const n = new Set(t.map(o => String(o).toLowerCase())),
    r = [],
    s = o => {
      if (o === null || typeof o != 'object' || N.isBuffer(o)) return o;
      if (r.indexOf(o) !== -1) return;
      (o instanceof nt && (o = o.toJSON()), r.push(o));
      let i;
      if (N.isArray(o))
        ((i = []),
          o.forEach((a, l) => {
            const c = s(a);
            N.isUndefined(c) || (i[l] = c);
          }));
      else {
        if (!N.isPlainObject(o) && ub(o)) return (r.pop(), o);
        i = Object.create(null);
        for (const [a, l] of Object.entries(o)) {
          const c = n.has(a.toLowerCase()) ? cb : s(l);
          N.isUndefined(c) || (i[a] = c);
        }
      }
      return (r.pop(), i);
    };
  return s(e);
}
let J = class td extends Error {
  static from(t, n, r, s, o, i) {
    const a = new td(t.message, n || t.code, r, s, o);
    return (
      (a.cause = t),
      (a.name = t.name),
      t.status != null && a.status == null && (a.status = t.status),
      i && Object.assign(a, i),
      a
    );
  }
  constructor(t, n, r, s, o) {
    (super(t),
      Object.defineProperty(this, 'message', {
        __proto__: null,
        value: t,
        enumerable: !0,
        writable: !0,
        configurable: !0
      }),
      (this.name = 'AxiosError'),
      (this.isAxiosError = !0),
      n && (this.code = n),
      r && (this.config = r),
      s && (this.request = s),
      o && ((this.response = o), (this.status = o.status)));
  }
  toJSON() {
    const t = this.config,
      n = t && N.hasOwnProp(t, 'redact') ? t.redact : void 0,
      r = N.isArray(n) && n.length > 0 ? fb(t, n) : N.toJSONObject(t);
    return {
      message: this.message,
      name: this.name,
      description: this.description,
      number: this.number,
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      config: r,
      code: this.code,
      status: this.status
    };
  }
};
J.ERR_BAD_OPTION_VALUE = 'ERR_BAD_OPTION_VALUE';
J.ERR_BAD_OPTION = 'ERR_BAD_OPTION';
J.ECONNABORTED = 'ECONNABORTED';
J.ETIMEDOUT = 'ETIMEDOUT';
J.ECONNREFUSED = 'ECONNREFUSED';
J.ERR_NETWORK = 'ERR_NETWORK';
J.ERR_FR_TOO_MANY_REDIRECTS = 'ERR_FR_TOO_MANY_REDIRECTS';
J.ERR_DEPRECATED = 'ERR_DEPRECATED';
J.ERR_BAD_RESPONSE = 'ERR_BAD_RESPONSE';
J.ERR_BAD_REQUEST = 'ERR_BAD_REQUEST';
J.ERR_CANCELED = 'ERR_CANCELED';
J.ERR_NOT_SUPPORT = 'ERR_NOT_SUPPORT';
J.ERR_INVALID_URL = 'ERR_INVALID_URL';
J.ERR_FORM_DATA_DEPTH_EXCEEDED = 'ERR_FORM_DATA_DEPTH_EXCEEDED';
const db = null,
  nd = 100;
function bi(e) {
  return N.isPlainObject(e) || N.isArray(e);
}
function rd(e) {
  return N.endsWith(e, '[]') ? e.slice(0, -2) : e;
}
function Uo(e, t, n) {
  return e
    ? e
        .concat(t)
        .map(function (s, o) {
          return ((s = rd(s)), !n && o ? '[' + s + ']' : s);
        })
        .join(n ? '.' : '')
    : t;
}
function hb(e) {
  return N.isArray(e) && !e.some(bi);
}
const pb = N.toFlatObject(N, {}, null, function (t) {
  return /^is[A-Z]/.test(t);
});
function po(e, t, n) {
  if (!N.isObject(e)) throw new TypeError('target must be an object');
  ((t = t || new FormData()),
    (n = N.toFlatObject(n, { metaTokens: !0, dots: !1, indexes: !1 }, !1, function (T, E) {
      return !N.isUndefined(E[T]);
    })));
  const r = n.metaTokens,
    s = n.visitor || p,
    o = n.dots,
    i = n.indexes,
    a = n.Blob || (typeof Blob < 'u' && Blob),
    l = n.maxDepth === void 0 ? nd : n.maxDepth,
    c = a && N.isSpecCompliantForm(t),
    u = [];
  if (!N.isFunction(s)) throw new TypeError('visitor must be a function');
  function f(A) {
    if (A === null) return '';
    if (N.isDate(A)) return A.toISOString();
    if (N.isBoolean(A)) return A.toString();
    if (!c && N.isBlob(A)) throw new J('Blob is not supported. Use a Buffer instead.');
    return N.isArrayBuffer(A) || N.isTypedArray(A)
      ? c && typeof Blob == 'function'
        ? new Blob([A])
        : Buffer.from(A)
      : A;
  }
  function d(A) {
    if (A > l)
      throw new J('Object is too deeply nested (' + A + ' levels). Max depth: ' + l, J.ERR_FORM_DATA_DEPTH_EXCEEDED);
  }
  function h(A, T) {
    if (l === 1 / 0) return JSON.stringify(A);
    const E = [];
    return JSON.stringify(A, function (C, I) {
      if (!N.isObject(I)) return I;
      for (; E.length && E[E.length - 1] !== this; ) E.pop();
      return (E.push(I), d(T + E.length - 1), I);
    });
  }
  function p(A, T, E) {
    let g = A;
    if (N.isReactNative(t) && N.isReactNativeBlob(A)) return (t.append(Uo(E, T, o), f(A)), !1);
    if (A && !E && typeof A == 'object') {
      if (N.endsWith(T, '{}')) ((T = r ? T : T.slice(0, -2)), (A = h(A, 1)));
      else if ((N.isArray(A) && hb(A)) || ((N.isFileList(A) || N.endsWith(T, '[]')) && (g = N.toArray(A))))
        return (
          (T = rd(T)),
          g.forEach(function (I, D) {
            !(N.isUndefined(I) || I === null) && t.append(i === !0 ? Uo([T], D, o) : i === null ? T : T + '[]', f(I));
          }),
          !1
        );
    }
    return bi(A) ? !0 : (t.append(Uo(E, T, o), f(A)), !1);
  }
  const y = Object.assign(pb, { defaultVisitor: p, convertValue: f, isVisitable: bi });
  function S(A, T, E = 0) {
    if (!N.isUndefined(A)) {
      if ((d(E), u.indexOf(A) !== -1)) throw new Error('Circular reference detected in ' + T.join('.'));
      (u.push(A),
        N.forEach(A, function (C, I) {
          (!(N.isUndefined(C) || C === null) && s.call(t, C, N.isString(I) ? I.trim() : I, T, y)) === !0 &&
            S(C, T ? T.concat(I) : [I], E + 1);
        }),
        u.pop());
    }
  }
  if (!N.isObject(e)) throw new TypeError('data must be an object');
  return (S(e), t);
}
function rc(e) {
  const t = { '!': '%21', "'": '%27', '(': '%28', ')': '%29', '~': '%7E', '%20': '+' };
  return encodeURIComponent(e).replace(/[!'()~]|%20/g, function (r) {
    return t[r];
  });
}
function ra(e, t) {
  ((this._pairs = []), e && po(e, this, t));
}
const sd = ra.prototype;
sd.append = function (t, n) {
  this._pairs.push([t, n]);
};
sd.toString = function (t) {
  const n = t
    ? function (r) {
        return t.call(this, r, rc);
      }
    : rc;
  return this._pairs
    .map(function (s) {
      return n(s[0]) + '=' + n(s[1]);
    }, '')
    .join('&');
};
function mb(e) {
  return encodeURIComponent(e).replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, '+');
}
function od(e, t, n) {
  if (!t) return e;
  const r = N.isFunction(n) ? { serialize: n } : n,
    s = N.getSafeProp(r, 'encode') || mb,
    o = N.getSafeProp(r, 'serialize');
  let i;
  if ((o ? (i = o(t, r)) : (i = N.isURLSearchParams(t) ? t.toString() : new ra(t, r).toString(s)), i)) {
    const a = e.indexOf('#');
    (a !== -1 && (e = e.slice(0, a)), (e += (e.indexOf('?') === -1 ? '?' : '&') + i));
  }
  return e;
}
class sc {
  constructor() {
    this.handlers = [];
  }
  use(t, n, r) {
    return (
      this.handlers.push({
        fulfilled: t,
        rejected: n,
        synchronous: r ? r.synchronous : !1,
        runWhen: r ? r.runWhen : null
      }),
      this.handlers.length - 1
    );
  }
  eject(t) {
    this.handlers[t] && (this.handlers[t] = null);
  }
  clear() {
    this.handlers && (this.handlers = []);
  }
  forEach(t) {
    N.forEach(this.handlers, function (r) {
      r !== null && t(r);
    });
  }
}
const sa = {
    silentJSONParsing: !0,
    forcedJSONParsing: !0,
    clarifyTimeoutError: !1,
    legacyInterceptorReqResOrdering: !0,
    advertiseZstdAcceptEncoding: !1,
    validateStatusUndefinedResolves: !0
  },
  gb = typeof URLSearchParams < 'u' ? URLSearchParams : ra,
  _b = typeof FormData < 'u' ? FormData : null,
  yb = typeof Blob < 'u' ? Blob : null,
  Eb = {
    isBrowser: !0,
    classes: { URLSearchParams: gb, FormData: _b, Blob: yb },
    protocols: ['http', 'https', 'file', 'blob', 'url', 'data']
  },
  oa = typeof window < 'u' && typeof document < 'u',
  vi = (typeof navigator == 'object' && navigator) || void 0,
  bb = oa && (!vi || ['ReactNative', 'NativeScript', 'NS'].indexOf(vi.product) < 0),
  vb = typeof WorkerGlobalScope < 'u' && self instanceof WorkerGlobalScope && typeof self.importScripts == 'function',
  Sb = (oa && window.location.href) || 'http://localhost',
  Ab = Object.freeze(
    Object.defineProperty(
      {
        __proto__: null,
        hasBrowserEnv: oa,
        hasStandardBrowserEnv: bb,
        hasStandardBrowserWebWorkerEnv: vb,
        navigator: vi,
        origin: Sb
      },
      Symbol.toStringTag,
      { value: 'Module' }
    )
  ),
  Je = { ...Ab, ...Eb };
function Tb(e, t) {
  return po(e, new Je.classes.URLSearchParams(), {
    visitor: function (n, r, s, o) {
      return Je.isNode && N.isBuffer(n)
        ? (this.append(r, n.toString('base64')), !1)
        : o.defaultVisitor.apply(this, arguments);
    },
    ...t
  });
}
const oc = nd;
function id(e) {
  if (e > oc)
    throw new J(
      'FormData field is too deeply nested (' + e + ' levels). Max depth: ' + oc,
      J.ERR_FORM_DATA_DEPTH_EXCEEDED
    );
}
function wb(e) {
  const t = [],
    n = /\w+|\[(\w*)]/g;
  let r;
  for (; (r = n.exec(e)) !== null; ) (id(t.length), t.push(r[0] === '[]' ? '' : r[1] || r[0]));
  return t;
}
function Ob(e) {
  const t = {},
    n = Object.keys(e);
  let r;
  const s = n.length;
  let o;
  for (r = 0; r < s; r++) ((o = n[r]), (t[o] = e[o]));
  return t;
}
function ad(e) {
  function t(n, r, s, o) {
    id(o);
    let i = n[o++];
    if (i === '__proto__') return !0;
    const a = Number.isFinite(+i),
      l = o >= n.length;
    return (
      (i = !i && N.isArray(s) ? s.length : i),
      l
        ? (N.hasOwnProp(s, i) ? (s[i] = N.isArray(s[i]) ? s[i].concat(r) : [s[i], r]) : (s[i] = r), !a)
        : ((!N.hasOwnProp(s, i) || !N.isObject(s[i])) && (s[i] = []),
          t(n, r, s[i], o) && N.isArray(s[i]) && (s[i] = Ob(s[i])),
          !a)
    );
  }
  if (N.isFormData(e) && N.isFunction(e.entries)) {
    const n = {};
    return (
      N.forEachEntry(e, (r, s) => {
        t(wb(r), s, n, 0);
      }),
      n
    );
  }
  return null;
}
const Un = (e, t) => (e != null && N.hasOwnProp(e, t) ? e[t] : void 0);
function Rb(e, t, n) {
  if (N.isString(e))
    try {
      return ((t || JSON.parse)(e), N.trim(e));
    } catch (r) {
      if (r.name !== 'SyntaxError') throw r;
    }
  return (n || JSON.stringify)(e);
}
const ns = {
  transitional: sa,
  adapter: ['xhr', 'http', 'fetch'],
  transformRequest: [
    function (t, n) {
      const r = n.getContentType() || '',
        s = r.indexOf('application/json') > -1,
        o = N.isObject(t);
      if ((o && N.isHTMLForm(t) && (t = new FormData(t)), N.isFormData(t))) return s ? JSON.stringify(ad(t)) : t;
      if (N.isArrayBuffer(t) || N.isBuffer(t) || N.isStream(t) || N.isFile(t) || N.isBlob(t) || N.isReadableStream(t))
        return t;
      if (N.isArrayBufferView(t)) return t.buffer;
      if (N.isURLSearchParams(t))
        return (n.setContentType('application/x-www-form-urlencoded;charset=utf-8', !1), t.toString());
      let a;
      if (o) {
        const l = Un(this, 'formSerializer');
        if (r.indexOf('application/x-www-form-urlencoded') > -1) return Tb(t, l).toString();
        if ((a = N.isFileList(t)) || r.indexOf('multipart/form-data') > -1) {
          const c = Un(this, 'env'),
            u = c && c.FormData;
          return po(a ? { 'files[]': t } : t, u && new u(), l);
        }
      }
      return o || s ? (n.setContentType('application/json', !1), Rb(t)) : t;
    }
  ],
  transformResponse: [
    function (t) {
      const n = Un(this, 'transitional') || ns.transitional,
        r = n && n.forcedJSONParsing,
        s = Un(this, 'responseType'),
        o = s === 'json';
      if (N.isResponse(t) || N.isReadableStream(t)) return t;
      if (t && N.isString(t) && ((r && !s) || o)) {
        const a = !(n && n.silentJSONParsing) && o;
        try {
          return JSON.parse(t, Un(this, 'parseReviver'));
        } catch (l) {
          if (a) throw l.name === 'SyntaxError' ? J.from(l, J.ERR_BAD_RESPONSE, this, null, Un(this, 'response')) : l;
        }
      }
      return t;
    }
  ],
  timeout: 0,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  maxContentLength: -1,
  maxBodyLength: -1,
  env: { FormData: Je.classes.FormData, Blob: Je.classes.Blob },
  validateStatus: function (t) {
    return t >= 200 && t < 300;
  },
  headers: { common: { Accept: 'application/json, text/plain, */*', 'Content-Type': void 0 } }
};
N.forEach(['delete', 'get', 'head', 'post', 'put', 'patch', 'query'], e => {
  ns.headers[e] = {};
});
function Vo(e, t) {
  const n = this || ns,
    r = t || n,
    s = nt.from(r.headers);
  let o = r.data;
  return (
    N.forEach(e, function (a) {
      o = a.call(n, o, s.normalize(), t ? t.status : void 0);
    }),
    s.normalize(),
    o
  );
}
function ld(e) {
  return !!(e && e.__CANCEL__);
}
let rs = class extends J {
  constructor(t, n, r) {
    (super(t ?? 'canceled', J.ERR_CANCELED, n, r), (this.name = 'CanceledError'), (this.__CANCEL__ = !0));
  }
};
function cd(e, t, n) {
  const r = n.config.validateStatus;
  !n.status || !r || r(n.status)
    ? e(n)
    : t(
        new J(
          'Request failed with status code ' + n.status,
          n.status >= 400 && n.status < 500 ? J.ERR_BAD_REQUEST : J.ERR_BAD_RESPONSE,
          n.config,
          n.request,
          n
        )
      );
}
function Cb(e) {
  const t = /^([-+\w]{1,25}):(?:\/\/)?/.exec(e);
  return (t && t[1]) || '';
}
function Lb(e, t) {
  e = e || 10;
  const n = new Array(e),
    r = new Array(e);
  let s = 0,
    o = 0,
    i;
  return (
    (t = t !== void 0 ? t : 1e3),
    function (l) {
      const c = Date.now(),
        u = r[o];
      (i || (i = c), (n[s] = l), (r[s] = c));
      let f = o,
        d = 0;
      for (; f !== s; ) ((d += n[f++]), (f = f % e));
      if (((s = (s + 1) % e), s === o && (o = (o + 1) % e), c - i < t)) return;
      const h = u && c - u;
      return h ? Math.round((d * 1e3) / h) : void 0;
    }
  );
}
function Nb(e, t) {
  let n = 0,
    r = 1e3 / t,
    s,
    o;
  const i = (c, u = Date.now()) => {
    ((n = u), (s = null), o && (clearTimeout(o), (o = null)), e(...c));
  };
  return [
    (...c) => {
      const u = Date.now(),
        f = u - n;
      f >= r
        ? i(c, u)
        : ((s = c),
          o ||
            (o = setTimeout(() => {
              ((o = null), i(s));
            }, r - f)));
    },
    () => s && i(s)
  ];
}
const Us = (e, t, n = 3) => {
    let r = 0;
    const s = Lb(50, 250);
    return Nb(o => {
      if (!o || typeof o.loaded != 'number') return;
      const i = o.loaded,
        a = o.lengthComputable ? o.total : void 0,
        l = a != null ? Math.min(i, a) : i,
        c = Math.max(0, l - r),
        u = s(c);
      r = Math.max(r, l);
      const f = {
        loaded: l,
        total: a,
        progress: a ? l / a : void 0,
        bytes: c,
        rate: u || void 0,
        estimated: u && a ? (a - l) / u : void 0,
        event: o,
        lengthComputable: a != null,
        [t ? 'download' : 'upload']: !0
      };
      e(f);
    }, n);
  },
  ic = (e, t) => {
    const n = e != null;
    return [r => t[0]({ lengthComputable: n, total: e, loaded: r }), t[1]];
  },
  ac =
    e =>
    (...t) =>
      N.asap(() => e(...t)),
  Ib = Je.hasStandardBrowserEnv
    ? ((e, t) => n => (
        (n = new URL(n, Je.origin)),
        e.protocol === n.protocol && e.host === n.host && (t || e.port === n.port)
      ))(new URL(Je.origin), Je.navigator && /(msie|trident)/i.test(Je.navigator.userAgent))
    : () => !0,
  Pb = Je.hasStandardBrowserEnv
    ? {
        write(e, t, n, r, s, o, i) {
          if (typeof document > 'u') return;
          const a = [`${e}=${encodeURIComponent(t)}`];
          (N.isNumber(n) && a.push(`expires=${new Date(n).toUTCString()}`),
            N.isString(r) && a.push(`path=${r}`),
            N.isString(s) && a.push(`domain=${s}`),
            o === !0 && a.push('secure'),
            N.isString(i) && a.push(`SameSite=${i}`),
            (document.cookie = a.join('; ')));
        },
        read(e) {
          if (typeof document > 'u') return null;
          const t = document.cookie.split(';');
          for (let n = 0; n < t.length; n++) {
            const r = t[n].replace(/^\s+/, ''),
              s = r.indexOf('=');
            if (s !== -1 && r.slice(0, s) === e) return decodeURIComponent(r.slice(s + 1));
          }
          return null;
        },
        remove(e) {
          this.write(e, '', Date.now() - 864e5, '/');
        }
      }
    : {
        write() {},
        read() {
          return null;
        },
        remove() {}
      };
function Db(e) {
  return typeof e != 'string' ? !1 : /^([a-z][a-z\d+\-.]*:)?\/\//i.test(e);
}
function xb(e, t) {
  return t ? e.replace(/\/?\/$/, '') + '/' + t.replace(/^\/+/, '') : e;
}
const kb = /^https?:(?!\/\/)/i,
  Fb = /[\t\n\r]/g;
function Mb(e) {
  let t = 0;
  for (; t < e.length && e.charCodeAt(t) <= 32; ) t++;
  return e.slice(t);
}
function Ub(e) {
  return Mb(e).replace(Fb, '');
}
function lc(e, t) {
  if (typeof e == 'string' && kb.test(Ub(e)))
    throw new J('Invalid URL: missing "//" after protocol', J.ERR_INVALID_URL, t);
}
function ud(e, t, n, r) {
  lc(t, r);
  let s = !Db(t);
  return e && (s || n === !1) ? (lc(e, r), xb(e, t)) : t;
}
const cc = e => (e instanceof nt ? { ...e } : e);
function xn(e, t) {
  t = t || {};
  const n = Object.create(null);
  Object.defineProperty(n, 'hasOwnProperty', {
    __proto__: null,
    value: Object.prototype.hasOwnProperty,
    enumerable: !1,
    writable: !0,
    configurable: !0
  });
  function r(u, f, d, h) {
    return N.isPlainObject(u) && N.isPlainObject(f)
      ? N.merge.call({ caseless: h }, u, f)
      : N.isPlainObject(f)
        ? N.merge({}, f)
        : N.isArray(f)
          ? f.slice()
          : f;
  }
  function s(u, f, d, h) {
    if (N.isUndefined(f)) {
      if (!N.isUndefined(u)) return r(void 0, u, d, h);
    } else return r(u, f, d, h);
  }
  function o(u, f) {
    if (!N.isUndefined(f)) return r(void 0, f);
  }
  function i(u, f) {
    if (N.isUndefined(f)) {
      if (!N.isUndefined(u)) return r(void 0, u);
    } else return r(void 0, f);
  }
  function a(u) {
    const f = N.hasOwnProp(t, 'transitional') ? t.transitional : void 0;
    if (!N.isUndefined(f))
      if (N.isPlainObject(f)) {
        if (N.hasOwnProp(f, u)) return f[u];
      } else return;
    const d = N.hasOwnProp(e, 'transitional') ? e.transitional : void 0;
    if (N.isPlainObject(d) && N.hasOwnProp(d, u)) return d[u];
  }
  function l(u, f, d) {
    if (N.hasOwnProp(t, d)) return r(u, f);
    if (N.hasOwnProp(e, d)) return r(void 0, u);
  }
  const c = {
    url: o,
    method: o,
    data: o,
    baseURL: i,
    transformRequest: i,
    transformResponse: i,
    paramsSerializer: i,
    timeout: i,
    timeoutMessage: i,
    withCredentials: i,
    withXSRFToken: i,
    adapter: i,
    responseType: i,
    xsrfCookieName: i,
    xsrfHeaderName: i,
    onUploadProgress: i,
    onDownloadProgress: i,
    decompress: i,
    maxContentLength: i,
    maxBodyLength: i,
    beforeRedirect: i,
    transport: i,
    httpAgent: i,
    httpsAgent: i,
    cancelToken: i,
    socketPath: i,
    allowedSocketPaths: i,
    responseEncoding: i,
    validateStatus: l,
    headers: (u, f, d) => s(cc(u), cc(f), d, !0)
  };
  return (
    N.forEach(Object.keys({ ...e, ...t }), function (f) {
      if (f === '__proto__' || f === 'constructor' || f === 'prototype') return;
      const d = N.hasOwnProp(c, f) ? c[f] : s,
        h = N.hasOwnProp(e, f) ? e[f] : void 0,
        p = N.hasOwnProp(t, f) ? t[f] : void 0,
        y = d(h, p, f);
      (N.isUndefined(y) && d !== l) || (n[f] = y);
    }),
    N.hasOwnProp(t, 'validateStatus') &&
      N.isUndefined(t.validateStatus) &&
      a('validateStatusUndefinedResolves') === !1 &&
      (N.hasOwnProp(e, 'validateStatus') ? (n.validateStatus = r(void 0, e.validateStatus)) : delete n.validateStatus),
    n
  );
}
const Vb = ['content-type', 'content-length'];
function Hb(e, t, n) {
  if (n !== 'content-only') {
    e.set(t);
    return;
  }
  Object.entries(t).forEach(([r, s]) => {
    Vb.includes(r.toLowerCase()) && e.set(r, s);
  });
}
const $b = e => encodeURIComponent(e).replace(/%([0-9A-F]{2})/gi, (t, n) => String.fromCharCode(parseInt(n, 16)));
function fd(e) {
  const t = xn({}, e),
    n = d => (N.hasOwnProp(t, d) ? t[d] : void 0),
    r = n('data');
  let s = n('withXSRFToken');
  const o = n('xsrfHeaderName'),
    i = n('xsrfCookieName');
  let a = n('headers');
  const l = n('auth'),
    c = n('baseURL'),
    u = n('allowAbsoluteUrls'),
    f = n('url');
  if (((t.headers = a = nt.from(a)), (t.url = od(ud(c, f, u, t), n('params'), n('paramsSerializer'))), l)) {
    const d = N.getSafeProp(l, 'username') || '',
      h = N.getSafeProp(l, 'password') || '';
    a.set('Authorization', 'Basic ' + btoa(d + ':' + (h ? $b(h) : '')));
  }
  if (
    (N.isFormData(r) &&
      (Je.hasStandardBrowserEnv || Je.hasStandardBrowserWebWorkerEnv || N.isReactNative(r)
        ? a.setContentType(void 0)
        : N.isFunction(r.getHeaders) && Hb(a, r.getHeaders(), n('formDataHeaderPolicy'))),
    Je.hasStandardBrowserEnv && (N.isFunction(s) && (s = s(t)), s === !0 || (s == null && Ib(t.url))))
  ) {
    const h = o && i && Pb.read(i);
    h && a.set(o, h);
  }
  return t;
}
const jb = typeof XMLHttpRequest < 'u',
  Bb =
    jb &&
    function (e) {
      return new Promise(function (n, r) {
        const s = fd(e);
        let o = s.data;
        const i = nt.from(s.headers).normalize();
        let { responseType: a, onUploadProgress: l, onDownloadProgress: c } = s,
          u,
          f,
          d,
          h,
          p;
        function y() {
          (h && h(),
            p && p(),
            s.cancelToken && s.cancelToken.unsubscribe(u),
            s.signal && s.signal.removeEventListener('abort', u));
        }
        let S = new XMLHttpRequest();
        (S.open(s.method.toUpperCase(), s.url, !0), (S.timeout = s.timeout));
        function A() {
          if (!S) return;
          const E = nt.from('getAllResponseHeaders' in S && S.getAllResponseHeaders()),
            C = {
              data: !a || a === 'text' || a === 'json' ? S.responseText : S.response,
              status: S.status,
              statusText: S.statusText,
              headers: E,
              config: e,
              request: S
            };
          (cd(
            function (D) {
              (n(D), y());
            },
            function (D) {
              (r(D), y());
            },
            C
          ),
            (S = null));
        }
        ('onloadend' in S
          ? (S.onloadend = A)
          : (S.onreadystatechange = function () {
              !S ||
                S.readyState !== 4 ||
                (S.status === 0 && !(S.responseURL && S.responseURL.startsWith('file:'))) ||
                setTimeout(A);
            }),
          (S.onabort = function () {
            S && (r(new J('Request aborted', J.ECONNABORTED, e, S)), y(), (S = null));
          }),
          (S.onerror = function (g) {
            const C = g && g.message ? g.message : 'Network Error',
              I = new J(C, J.ERR_NETWORK, e, S);
            ((I.event = g || null), r(I), y(), (S = null));
          }),
          (S.ontimeout = function () {
            let g = s.timeout ? 'timeout of ' + s.timeout + 'ms exceeded' : 'timeout exceeded';
            const C = s.transitional || sa;
            (s.timeoutErrorMessage && (g = s.timeoutErrorMessage),
              r(new J(g, C.clarifyTimeoutError ? J.ETIMEDOUT : J.ECONNABORTED, e, S)),
              y(),
              (S = null));
          }),
          o === void 0 && i.setContentType(null),
          'setRequestHeader' in S &&
            N.forEach(ed(i), function (g, C) {
              S.setRequestHeader(C, g);
            }),
          N.isUndefined(s.withCredentials) || (S.withCredentials = !!s.withCredentials),
          a && a !== 'json' && (S.responseType = s.responseType),
          c && (([d, p] = Us(c, !0)), S.addEventListener('progress', d)),
          l &&
            S.upload &&
            (([f, h] = Us(l)), S.upload.addEventListener('progress', f), S.upload.addEventListener('loadend', h)),
          (s.cancelToken || s.signal) &&
            ((u = E => {
              S && (r(!E || E.type ? new rs(null, e, S) : E), S.abort(), y(), (S = null));
            }),
            s.cancelToken && s.cancelToken.subscribe(u),
            s.signal && (s.signal.aborted ? u() : s.signal.addEventListener('abort', u))));
        const T = Cb(s.url);
        if (T && !Je.protocols.includes(T)) {
          r(new J('Unsupported protocol ' + T + ':', J.ERR_BAD_REQUEST, e));
          return;
        }
        S.send(o || null);
      });
    },
  Wb = (e, t) => {
    if (((e = e ? e.filter(Boolean) : []), !t && !e.length)) return;
    const n = new AbortController();
    let r = !1;
    const s = function (l) {
      if (!r) {
        ((r = !0), i());
        const c = l instanceof Error ? l : this.reason;
        n.abort(c instanceof J ? c : new rs(c instanceof Error ? c.message : c));
      }
    };
    let o =
      t &&
      setTimeout(() => {
        ((o = null), s(new J(`timeout of ${t}ms exceeded`, J.ETIMEDOUT)));
      }, t);
    const i = () => {
      e &&
        (o && clearTimeout(o),
        (o = null),
        e.forEach(l => {
          l.unsubscribe ? l.unsubscribe(s) : l.removeEventListener('abort', s);
        }),
        (e = null));
    };
    e.forEach(l => l.addEventListener('abort', s));
    const { signal: a } = n;
    return ((a.unsubscribe = () => N.asap(i)), a);
  },
  Gb = function* (e, t) {
    let n = e.byteLength;
    if (n < t) {
      yield e;
      return;
    }
    let r = 0,
      s;
    for (; r < n; ) ((s = r + t), yield e.slice(r, s), (r = s));
  },
  Kb = async function* (e, t) {
    for await (const n of qb(e)) yield* Gb(n, t);
  },
  qb = async function* (e) {
    if (e[Symbol.asyncIterator]) {
      yield* e;
      return;
    }
    const t = e.getReader();
    try {
      for (;;) {
        const { done: n, value: r } = await t.read();
        if (n) break;
        yield r;
      }
    } finally {
      await t.cancel();
    }
  },
  uc = (e, t, n, r) => {
    const s = Kb(e, t);
    let o = 0,
      i,
      a = l => {
        i || ((i = !0), r && r(l));
      };
    return new ReadableStream(
      {
        async pull(l) {
          try {
            const { done: c, value: u } = await s.next();
            if (c) {
              (a(), l.close());
              return;
            }
            let f = u.byteLength;
            if (n) {
              let d = (o += f);
              n(d);
            }
            l.enqueue(new Uint8Array(u));
          } catch (c) {
            throw (a(c), c);
          }
        },
        cancel(l) {
          return (a(l), s.return());
        }
      },
      { highWaterMark: 2 }
    );
  },
  Vs = e => (e >= 48 && e <= 57) || (e >= 65 && e <= 70) || (e >= 97 && e <= 102),
  Yb = (e, t, n) => t + 2 < n && Vs(e.charCodeAt(t + 1)) && Vs(e.charCodeAt(t + 2));
function Xb(e) {
  if (!e || typeof e != 'string' || !e.startsWith('data:')) return 0;
  const t = e.indexOf(',');
  if (t < 0) return 0;
  const n = e.slice(5, t),
    r = e.slice(t + 1);
  if (/;base64/i.test(n)) {
    let i = r.length;
    const a = r.length;
    for (let h = 0; h < a; h++)
      if (r.charCodeAt(h) === 37 && h + 2 < a) {
        const p = r.charCodeAt(h + 1),
          y = r.charCodeAt(h + 2);
        Vs(p) && Vs(y) && ((i -= 2), (h += 2));
      }
    let l = 0,
      c = a - 1;
    const u = h =>
      h >= 2 &&
      r.charCodeAt(h - 2) === 37 &&
      r.charCodeAt(h - 1) === 51 &&
      (r.charCodeAt(h) === 68 || r.charCodeAt(h) === 100);
    (c >= 0 && (r.charCodeAt(c) === 61 ? (l++, c--) : u(c) && (l++, (c -= 3))),
      l === 1 && c >= 0 && (r.charCodeAt(c) === 61 || u(c)) && l++);
    const d = Math.floor(i / 4) * 3 - (l || 0);
    return d > 0 ? d : 0;
  }
  let o = 0;
  for (let i = 0, a = r.length; i < a; i++) {
    const l = r.charCodeAt(i);
    if (l === 37 && Yb(r, i, a)) ((o += 1), (i += 2));
    else if (l < 128) o += 1;
    else if (l < 2048) o += 2;
    else if (l >= 55296 && l <= 56319 && i + 1 < a) {
      const c = r.charCodeAt(i + 1);
      c >= 56320 && c <= 57343 ? ((o += 4), i++) : (o += 3);
    } else o += 3;
  }
  return o;
}
const ia = '1.18.0',
  fc = 64 * 1024,
  { isFunction: ps } = N,
  Jb = e => encodeURIComponent(e).replace(/%([0-9A-F]{2})/gi, (t, n) => String.fromCharCode(parseInt(n, 16))),
  dc = e => {
    if (!N.isString(e)) return e;
    try {
      return decodeURIComponent(e);
    } catch {
      return e;
    }
  },
  hc = (e, ...t) => {
    try {
      return !!e(...t);
    } catch {
      return !1;
    }
  },
  zb = e => {
    const t = e.indexOf('://');
    let n = e;
    return (t !== -1 && (n = n.slice(t + 3)), n.includes('@') || n.includes(':'));
  },
  Qb = e => {
    const t = N.global !== void 0 && N.global !== null ? N.global : globalThis,
      { ReadableStream: n, TextEncoder: r } = t;
    e = N.merge.call({ skipUndefined: !0 }, { Request: t.Request, Response: t.Response }, e);
    const { fetch: s, Request: o, Response: i } = e,
      a = s ? ps(s) : typeof fetch == 'function',
      l = ps(o),
      c = ps(i);
    if (!a) return !1;
    const u = a && ps(n),
      f =
        a &&
        (typeof r == 'function'
          ? (
              A => T =>
                A.encode(T)
            )(new r())
          : async A => new Uint8Array(await new o(A).arrayBuffer())),
      d =
        l &&
        u &&
        hc(() => {
          let A = !1;
          const T = new o(Je.origin, {
              body: new n(),
              method: 'POST',
              get duplex() {
                return ((A = !0), 'half');
              }
            }),
            E = T.headers.has('Content-Type');
          return (T.body != null && T.body.cancel(), A && !E);
        }),
      h = c && u && hc(() => N.isReadableStream(new i('').body)),
      p = { stream: h && (A => A.body) };
    a &&
      ['text', 'arrayBuffer', 'blob', 'formData', 'stream'].forEach(A => {
        !p[A] &&
          (p[A] = (T, E) => {
            let g = T && T[A];
            if (g) return g.call(T);
            throw new J(`Response type '${A}' is not supported`, J.ERR_NOT_SUPPORT, E);
          });
      });
    const y = async A => {
        if (A == null) return 0;
        if (N.isBlob(A)) return A.size;
        if (N.isSpecCompliantForm(A))
          return (await new o(Je.origin, { method: 'POST', body: A }).arrayBuffer()).byteLength;
        if (N.isArrayBufferView(A) || N.isArrayBuffer(A)) return A.byteLength;
        if ((N.isURLSearchParams(A) && (A = A + ''), N.isString(A))) return (await f(A)).byteLength;
      },
      S = async (A, T) => {
        const E = N.toFiniteNumber(A.getContentLength());
        return E ?? y(T);
      };
    return async A => {
      let {
        url: T,
        method: E,
        data: g,
        signal: C,
        cancelToken: I,
        timeout: D,
        onDownloadProgress: F,
        onUploadProgress: P,
        responseType: H,
        headers: W,
        withCredentials: M = 'same-origin',
        fetchOptions: z,
        maxContentLength: ie,
        maxBodyLength: Se
      } = fd(A);
      const se = N.isNumber(ie) && ie > -1,
        te = N.isNumber(Se) && Se > -1,
        de = ne => (N.hasOwnProp(A, ne) ? A[ne] : void 0);
      let Me = s || fetch;
      H = H ? (H + '').toLowerCase() : 'text';
      let Le = Wb([C, I && I.toAbortSignal()], D),
        ue = null;
      const pe =
        Le &&
        Le.unsubscribe &&
        (() => {
          Le.unsubscribe();
        });
      let Ne,
        xe = null;
      const We = () => new J('Request body larger than maxBodyLength limit', J.ERR_BAD_REQUEST, A, ue);
      try {
        let ne;
        const U = de('auth');
        if (U) {
          const R = N.getSafeProp(U, 'username') || '',
            L = N.getSafeProp(U, 'password') || '';
          ne = { username: R, password: L };
        }
        if (zb(T)) {
          const R = new URL(T, Je.origin);
          if (!ne && (R.username || R.password)) {
            const L = dc(R.username),
              j = dc(R.password);
            ne = { username: L, password: j };
          }
          (R.username || R.password) && ((R.username = ''), (R.password = ''), (T = R.href));
        }
        if (
          (ne &&
            (W.delete('authorization'),
            W.set('Authorization', 'Basic ' + btoa(Jb((ne.username || '') + ':' + (ne.password || ''))))),
          se && typeof T == 'string' && T.startsWith('data:') && Xb(T) > ie)
        )
          throw new J('maxContentLength size of ' + ie + ' exceeded', J.ERR_BAD_RESPONSE, A, ue);
        if (te && E !== 'get' && E !== 'head') {
          const R = await y(g);
          if (typeof R == 'number' && isFinite(R) && ((Ne = R), R > Se)) throw We();
        }
        const Y = te && (N.isReadableStream(g) || N.isStream(g)),
          K = (R, L, j) =>
            uc(
              R,
              fc,
              B => {
                if (te && B > Se) throw (xe = We());
                L && L(B);
              },
              j
            );
        if (d && E !== 'get' && E !== 'head' && (P || Y)) {
          if (((Ne = Ne ?? (await S(W, g))), Ne !== 0 || Y)) {
            let R = new o(T, { method: 'POST', body: g, duplex: 'half' }),
              L;
            if ((N.isFormData(g) && (L = R.headers.get('content-type')) && W.setContentType(L), R.body)) {
              const [j, B] = (P && ic(Ne, Us(ac(P)))) || [];
              g = K(R.body, j, B);
            }
          }
        } else if (Y && !l && u && E !== 'get' && E !== 'head') g = K(g);
        else if (Y && l && !d && E !== 'get' && E !== 'head')
          throw new J(
            'Stream request bodies are not supported by the current fetch implementation',
            J.ERR_NOT_SUPPORT,
            A,
            ue
          );
        N.isString(M) || (M = M ? 'include' : 'omit');
        const Q = l && 'credentials' in o.prototype;
        if (N.isFormData(g)) {
          const R = W.getContentType();
          R && /^multipart\/form-data/i.test(R) && !/boundary=/i.test(R) && W.delete('content-type');
        }
        W.set('User-Agent', 'axios/' + ia, !1);
        const ae = {
          ...z,
          signal: Le,
          method: E.toUpperCase(),
          headers: ed(W.normalize()),
          body: g,
          duplex: 'half',
          credentials: Q ? M : void 0
        };
        ue = l && new o(T, ae);
        let b = await (l ? Me(ue, z) : Me(T, ae));
        const O = nt.from(b.headers);
        if (se) {
          const R = N.toFiniteNumber(O.getContentLength());
          if (R != null && R > ie)
            throw new J('maxContentLength size of ' + ie + ' exceeded', J.ERR_BAD_RESPONSE, A, ue);
        }
        const v = h && (H === 'stream' || H === 'response');
        if (h && b.body && (F || se || (v && pe))) {
          const R = {};
          ['status', 'statusText', 'headers'].forEach(x => {
            R[x] = b[x];
          });
          const L = N.toFiniteNumber(O.getContentLength()),
            [j, B] = (F && ic(L, Us(ac(F), !0))) || [];
          let m = 0;
          const _ = x => {
            if (se && ((m = x), m > ie))
              throw new J('maxContentLength size of ' + ie + ' exceeded', J.ERR_BAD_RESPONSE, A, ue);
            j && j(x);
          };
          b = new i(
            uc(b.body, fc, _, () => {
              (B && B(), pe && pe());
            }),
            R
          );
        }
        H = H || 'text';
        let w = await p[N.findKey(p, H) || 'text'](b, A);
        if (se && !h && !v) {
          let R;
          if (
            (w != null &&
              (typeof w.byteLength == 'number'
                ? (R = w.byteLength)
                : typeof w.size == 'number'
                  ? (R = w.size)
                  : typeof w == 'string' && (R = typeof r == 'function' ? new r().encode(w).byteLength : w.length)),
            typeof R == 'number' && R > ie)
          )
            throw new J('maxContentLength size of ' + ie + ' exceeded', J.ERR_BAD_RESPONSE, A, ue);
        }
        return (
          !v && pe && pe(),
          await new Promise((R, L) => {
            cd(R, L, {
              data: w,
              headers: nt.from(b.headers),
              status: b.status,
              statusText: b.statusText,
              config: A,
              request: ue
            });
          })
        );
      } catch (ne) {
        if ((pe && pe(), Le && Le.aborted && Le.reason instanceof J)) {
          const U = Le.reason;
          throw ((U.config = A), ue && (U.request = ue), ne !== U && (U.cause = ne), U);
        }
        throw xe
          ? (ue && !xe.request && (xe.request = ue), xe)
          : ne instanceof J
            ? (ue && !ne.request && (ne.request = ue), ne)
            : ne && ne.name === 'TypeError' && /Load failed|fetch/i.test(ne.message)
              ? Object.assign(new J('Network Error', J.ERR_NETWORK, A, ue, ne && ne.response), {
                  cause: ne.cause || ne
                })
              : J.from(ne, ne && ne.code, A, ue, ne && ne.response);
      }
    };
  },
  Zb = new Map(),
  dd = e => {
    let t = (e && e.env) || {};
    const { fetch: n, Request: r, Response: s } = t,
      o = [r, s, n];
    let i = o.length,
      a = i,
      l,
      c,
      u = Zb;
    for (; a--; ) ((l = o[a]), (c = u.get(l)), c === void 0 && u.set(l, (c = a ? new Map() : Qb(t))), (u = c));
    return c;
  };
dd();
const aa = { http: db, xhr: Bb, fetch: { get: dd } };
N.forEach(aa, (e, t) => {
  if (e) {
    try {
      Object.defineProperty(e, 'name', { __proto__: null, value: t });
    } catch {}
    Object.defineProperty(e, 'adapterName', { __proto__: null, value: t });
  }
});
const pc = e => `- ${e}`,
  ev = e => N.isFunction(e) || e === null || e === !1;
function tv(e, t) {
  e = N.isArray(e) ? e : [e];
  const { length: n } = e;
  let r, s;
  const o = {};
  for (let i = 0; i < n; i++) {
    r = e[i];
    let a;
    if (((s = r), !ev(r) && ((s = aa[(a = String(r)).toLowerCase()]), s === void 0)))
      throw new J(`Unknown adapter '${a}'`);
    if (s && (N.isFunction(s) || (s = s.get(t)))) break;
    o[a || '#' + i] = s;
  }
  if (!s) {
    const i = Object.entries(o).map(
      ([l, c]) => `adapter ${l} ` + (c === !1 ? 'is not supported by the environment' : 'is not available in the build')
    );
    let a = n
      ? i.length > 1
        ? `since :
` +
          i.map(pc).join(`
`)
        : ' ' + pc(i[0])
      : 'as no adapter specified';
    throw new J('There is no suitable adapter to dispatch the request ' + a, 'ERR_NOT_SUPPORT');
  }
  return s;
}
const hd = { getAdapter: tv, adapters: aa };
function Ho(e) {
  if ((e.cancelToken && e.cancelToken.throwIfRequested(), e.signal && e.signal.aborted)) throw new rs(null, e);
}
function mc(e) {
  return (
    Ho(e),
    (e.headers = nt.from(e.headers)),
    (e.data = Vo.call(e, e.transformRequest)),
    ['post', 'put', 'patch'].indexOf(e.method) !== -1 &&
      e.headers.setContentType('application/x-www-form-urlencoded', !1),
    hd
      .getAdapter(
        e.adapter || ns.adapter,
        e
      )(e)
      .then(
        function (r) {
          (Ho(e), (e.response = r));
          try {
            r.data = Vo.call(e, e.transformResponse, r);
          } finally {
            delete e.response;
          }
          return ((r.headers = nt.from(r.headers)), r);
        },
        function (r) {
          if (!ld(r) && (Ho(e), r && r.response)) {
            e.response = r.response;
            try {
              r.response.data = Vo.call(e, e.transformResponse, r.response);
            } finally {
              delete e.response;
            }
            r.response.headers = nt.from(r.response.headers);
          }
          return Promise.reject(r);
        }
      )
  );
}
const mo = {};
['object', 'boolean', 'number', 'function', 'string', 'symbol'].forEach((e, t) => {
  mo[e] = function (r) {
    return typeof r === e || 'a' + (t < 1 ? 'n ' : ' ') + e;
  };
});
const gc = {};
mo.transitional = function (t, n, r) {
  function s(o, i) {
    return '[Axios v' + ia + "] Transitional option '" + o + "'" + i + (r ? '. ' + r : '');
  }
  return (o, i, a) => {
    if (t === !1) throw new J(s(i, ' has been removed' + (n ? ' in ' + n : '')), J.ERR_DEPRECATED);
    return (
      n &&
        !gc[i] &&
        ((gc[i] = !0),
        console.warn(s(i, ' has been deprecated since v' + n + ' and will be removed in the near future'))),
      t ? t(o, i, a) : !0
    );
  };
};
mo.spelling = function (t) {
  return (n, r) => (console.warn(`${r} is likely a misspelling of ${t}`), !0);
};
function nv(e, t, n) {
  if (typeof e != 'object') throw new J('options must be an object', J.ERR_BAD_OPTION_VALUE);
  const r = Object.keys(e);
  let s = r.length;
  for (; s-- > 0; ) {
    const o = r[s],
      i = Object.prototype.hasOwnProperty.call(t, o) ? t[o] : void 0;
    if (i) {
      const a = e[o],
        l = a === void 0 || i(a, o, e);
      if (l !== !0) throw new J('option ' + o + ' must be ' + l, J.ERR_BAD_OPTION_VALUE);
      continue;
    }
    if (n !== !0) throw new J('Unknown option ' + o, J.ERR_BAD_OPTION);
  }
}
const vs = { assertOptions: nv, validators: mo },
  Ze = vs.validators;
let Pn = class {
  constructor(t) {
    ((this.defaults = t || {}), (this.interceptors = { request: new sc(), response: new sc() }));
  }
  async request(t, n) {
    try {
      return await this._request(t, n);
    } catch (r) {
      if (r instanceof Error) {
        let s = {};
        Error.captureStackTrace ? Error.captureStackTrace(s) : (s = new Error());
        const o = (() => {
          if (!s.stack) return '';
          const i = s.stack.indexOf(`
`);
          return i === -1 ? '' : s.stack.slice(i + 1);
        })();
        try {
          if (!r.stack) r.stack = o;
          else if (o) {
            const i = o.indexOf(`
`),
              a =
                i === -1
                  ? -1
                  : o.indexOf(
                      `
`,
                      i + 1
                    ),
              l = a === -1 ? '' : o.slice(a + 1);
            String(r.stack).endsWith(l) ||
              (r.stack +=
                `
` + o);
          }
        } catch {}
      }
      throw r;
    }
  }
  _request(t, n) {
    (typeof t == 'string' ? ((n = n || {}), (n.url = t)) : (n = t || {}), (n = xn(this.defaults, n)));
    const { transitional: r, paramsSerializer: s, headers: o } = n;
    (r !== void 0 &&
      vs.assertOptions(
        r,
        {
          silentJSONParsing: Ze.transitional(Ze.boolean),
          forcedJSONParsing: Ze.transitional(Ze.boolean),
          clarifyTimeoutError: Ze.transitional(Ze.boolean),
          legacyInterceptorReqResOrdering: Ze.transitional(Ze.boolean),
          advertiseZstdAcceptEncoding: Ze.transitional(Ze.boolean),
          validateStatusUndefinedResolves: Ze.transitional(Ze.boolean)
        },
        !1
      ),
      s != null &&
        (N.isFunction(s)
          ? (n.paramsSerializer = { serialize: s })
          : vs.assertOptions(s, { encode: Ze.function, serialize: Ze.function }, !0)),
      n.allowAbsoluteUrls !== void 0 ||
        (this.defaults.allowAbsoluteUrls !== void 0
          ? (n.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls)
          : (n.allowAbsoluteUrls = !0)),
      vs.assertOptions(n, { baseUrl: Ze.spelling('baseURL'), withXsrfToken: Ze.spelling('withXSRFToken') }, !0),
      (n.method = (n.method || this.defaults.method || 'get').toLowerCase()));
    let i = o && N.merge(o.common, o[n.method]);
    (o &&
      N.forEach(['delete', 'get', 'head', 'post', 'put', 'patch', 'query', 'common'], p => {
        delete o[p];
      }),
      (n.headers = nt.concat(i, o)));
    const a = [];
    let l = !0;
    this.interceptors.request.forEach(function (y) {
      if (typeof y.runWhen == 'function' && y.runWhen(n) === !1) return;
      l = l && y.synchronous;
      const S = n.transitional || sa;
      S && S.legacyInterceptorReqResOrdering ? a.unshift(y.fulfilled, y.rejected) : a.push(y.fulfilled, y.rejected);
    });
    const c = [];
    this.interceptors.response.forEach(function (y) {
      c.push(y.fulfilled, y.rejected);
    });
    let u,
      f = 0,
      d;
    if (!l) {
      const p = [mc.bind(this), void 0];
      for (p.unshift(...a), p.push(...c), d = p.length, u = Promise.resolve(n); f < d; ) u = u.then(p[f++], p[f++]);
      return u;
    }
    d = a.length;
    let h = n;
    for (; f < d; ) {
      const p = a[f++],
        y = a[f++];
      try {
        h = p(h);
      } catch (S) {
        y.call(this, S);
        break;
      }
    }
    try {
      u = mc.call(this, h);
    } catch (p) {
      return Promise.reject(p);
    }
    for (f = 0, d = c.length; f < d; ) u = u.then(c[f++], c[f++]);
    return u;
  }
  getUri(t) {
    t = xn(this.defaults, t);
    const n = ud(t.baseURL, t.url, t.allowAbsoluteUrls, t);
    return od(n, t.params, t.paramsSerializer);
  }
};
N.forEach(['delete', 'get', 'head', 'options'], function (t) {
  Pn.prototype[t] = function (n, r) {
    return this.request(xn(r || {}, { method: t, url: n, data: r && N.hasOwnProp(r, 'data') ? r.data : void 0 }));
  };
});
N.forEach(['post', 'put', 'patch', 'query'], function (t) {
  function n(r) {
    return function (o, i, a) {
      return this.request(
        xn(a || {}, { method: t, headers: r ? { 'Content-Type': 'multipart/form-data' } : {}, url: o, data: i })
      );
    };
  }
  ((Pn.prototype[t] = n()), t !== 'query' && (Pn.prototype[t + 'Form'] = n(!0)));
});
let rv = class pd {
  constructor(t) {
    if (typeof t != 'function') throw new TypeError('executor must be a function.');
    let n;
    this.promise = new Promise(function (o) {
      n = o;
    });
    const r = this;
    (this.promise.then(s => {
      if (!r._listeners) return;
      let o = r._listeners.length;
      for (; o-- > 0; ) r._listeners[o](s);
      r._listeners = null;
    }),
      (this.promise.then = s => {
        let o;
        const i = new Promise(a => {
          (r.subscribe(a), (o = a));
        }).then(s);
        return (
          (i.cancel = function () {
            r.unsubscribe(o);
          }),
          i
        );
      }),
      t(function (o, i, a) {
        r.reason || ((r.reason = new rs(o, i, a)), n(r.reason));
      }));
  }
  throwIfRequested() {
    if (this.reason) throw this.reason;
  }
  subscribe(t) {
    if (this.reason) {
      t(this.reason);
      return;
    }
    this._listeners ? this._listeners.push(t) : (this._listeners = [t]);
  }
  unsubscribe(t) {
    if (!this._listeners) return;
    const n = this._listeners.indexOf(t);
    n !== -1 && this._listeners.splice(n, 1);
  }
  toAbortSignal() {
    const t = new AbortController(),
      n = r => {
        t.abort(r);
      };
    return (this.subscribe(n), (t.signal.unsubscribe = () => this.unsubscribe(n)), t.signal);
  }
  static source() {
    let t;
    return {
      token: new pd(function (s) {
        t = s;
      }),
      cancel: t
    };
  }
};
function sv(e) {
  return function (n) {
    return e.apply(null, n);
  };
}
function ov(e) {
  return N.isObject(e) && e.isAxiosError === !0;
}
const Si = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
  WebServerIsDown: 521,
  ConnectionTimedOut: 522,
  OriginIsUnreachable: 523,
  TimeoutOccurred: 524,
  SslHandshakeFailed: 525,
  InvalidSslCertificate: 526
};
Object.entries(Si).forEach(([e, t]) => {
  Si[t] = e;
});
function md(e) {
  const t = new Pn(e),
    n = Gf(Pn.prototype.request, t);
  return (
    N.extend(n, Pn.prototype, t, { allOwnKeys: !0 }),
    N.extend(n, t, null, { allOwnKeys: !0 }),
    (n.create = function (s) {
      return md(xn(e, s));
    }),
    n
  );
}
const Fe = md(ns);
Fe.Axios = Pn;
Fe.CanceledError = rs;
Fe.CancelToken = rv;
Fe.isCancel = ld;
Fe.VERSION = ia;
Fe.toFormData = po;
Fe.AxiosError = J;
Fe.Cancel = Fe.CanceledError;
Fe.all = function (t) {
  return Promise.all(t);
};
Fe.spread = sv;
Fe.isAxiosError = ov;
Fe.mergeConfig = xn;
Fe.AxiosHeaders = nt;
Fe.formToJSON = e => ad(N.isHTMLForm(e) ? new FormData(e) : e);
Fe.getAdapter = hd.getAdapter;
Fe.HttpStatusCode = Si;
Fe.default = Fe;
const {
    Axios: xv,
    AxiosError: kv,
    CanceledError: Fv,
    isCancel: Mv,
    CancelToken: Uv,
    VERSION: Vv,
    all: Hv,
    Cancel: $v,
    isAxiosError: jv,
    spread: Bv,
    toFormData: Wv,
    AxiosHeaders: Gv,
    HttpStatusCode: Kv,
    formToJSON: qv,
    getAdapter: Yv,
    mergeConfig: Xv,
    create: Jv
  } = Fe,
  iv = 'posecraft_token';
let $o = !1,
  jo = [];
async function av(e) {
  if (!$o) {
    $o = !0;
    try {
      const { useAuthStore: t } = await ge(
          async () => {
            const { useAuthStore: o } = await Promise.resolve().then(() => yl);
            return { useAuthStore: o };
          },
          void 0
        ),
        n = t(),
        { authApi: r } = await ge(async () => {
          const { authApi: o } = await import('./auth-B31mPbwd.js');
          return { authApi: o };
        }, []),
        s = await r.refreshToken();
      return (
        n.setLoggedIn(!0, n.user, s),
        jo.forEach(o => o(s)),
        (jo = []),
        e.headers && (e.headers.Authorization = `Bearer ${s}`),
        Dr(e)
      );
    } catch {
      const { useAuthStore: t } = await ge(
        async () => {
          const { useAuthStore: n } = await Promise.resolve().then(() => yl);
          return { useAuthStore: n };
        },
        void 0
      );
      (t().logout(), (window.location.href = '/posecraft/login'));
    } finally {
      $o = !1;
    }
  }
  return new Promise(t => {
    jo.push(n => {
      (e.headers && (e.headers.Authorization = `Bearer ${n}`), t(Dr(e)));
    });
  });
}
function lv(e) {
  const t = Fe.create({
    baseURL: '',
    timeout: 15e3,
    withCredentials: !0,
    headers: { 'Content-Type': 'application/json' }
  });
  return (
    t.interceptors.request.use(n => {
      const r = localStorage.getItem(iv);
      return (r && (n.headers.Authorization = `Bearer ${r}`), n);
    }),
    t.interceptors.response.use(
      n => {
        const r = n.data;
        if (r.code === 200)
          return r.pagination
            ? {
                list: r.data,
                total: r.pagination.total,
                page: r.pagination.page,
                pageSize: r.pagination.pageSize,
                totalPages: r.pagination.totalPages
              }
            : r.data;
        const s = new Error(r.message || 'API Error');
        return ((s.code = r.code), Promise.reject(s));
      },
      n => {
        var r;
        return ((r = n.response) == null ? void 0 : r.status) === 401 ? av(n.config) : Promise.reject(n);
      }
    ),
    t
  );
}
const Dr = lv(),
  _c = {
    getAll: () => Dr.get('/posecraft/v1/settings'),
    getField: e => Dr.get(`/posecraft/v1/settings/${encodeURIComponent(e)}`),
    setField: (e, t) => Dr.put(`/posecraft/v1/settings/${encodeURIComponent(e)}`, { value: t })
  },
  br = cf('localStorage', 'posecraft_settings_'),
  Bo = { showTemplate: !0, theme: 'auto' },
  cv = Bi('userSettings', () => {
    const e = le({ ...Bo }),
      t = le(!1);
    function n() {
      const l = Object.keys(Bo);
      for (const c of l) {
        const u = br.get(c);
        u != null && (e.value[c] = u);
      }
    }
    async function r(l, c) {
      if (In().isLoggedIn)
        try {
          await _c.setField(l, c);
        } catch (f) {
          console.warn(`[userSettings] 同步字段 ${l} 失败，下次登录重试:`, f);
        }
    }
    function s(l, c) {
      ((e.value[l] = c), br.set(l, c), r(l, c));
    }
    async function o() {
      if (In().isLoggedIn)
        try {
          const c = await _c.getAll(),
            u = (c == null ? void 0 : c.data) || c || {},
            f = Object.keys(Bo);
          for (const d of f)
            if (u[d] !== void 0) ((e.value[d] = u[d]), br.set(d, u[d]));
            else {
              const h = br.get(d),
                p = h !== null ? h : e.value[d];
              (await r(d, p), (e.value[d] = p), br.set(d, p));
            }
          t.value = !0;
        } catch (c) {
          console.warn('[userSettings] 拉取设置失败，使用缓存:', c);
        }
    }
    function i() {
      const l = In();
      let c = null;
      l.$subscribe((u, f) => {
        var h, p;
        const d = ((h = f.user) == null ? void 0 : h.uid) || ((p = f.user) == null ? void 0 : p.id) || null;
        f.isLoggedIn && d !== c ? ((c = d), o()) : f.isLoggedIn || ((c = null), (t.value = !1));
      });
    }
    function a() {
      (n(), i());
    }
    return {
      settings: e,
      syncedFromServer: t,
      setSetting: s,
      pullFromServer: o,
      hydrateFromCache: n,
      bindAuthWatcher: i,
      init: a
    };
  }),
  dr = Yp(Tm),
  uv = zp();
dr.config.errorHandler = (e, t, n) => {
  console.error('[Global Exception]', e, n);
};
dr.use(uv);
dr.use(ao);
dr.use(nE);
aE(dr);
cv().init();
ao.isReady().then(() => {
  dr.mount('#app');
});
export {
  Nv as $,
  lr as A,
  eo as B,
  vt as C,
  Pe as D,
  lh as E,
  ct as F,
  mv as G,
  zs as H,
  Nh as I,
  hv as J,
  pv as K,
  Sh as L,
  ar as M,
  Ah as N,
  dv as O,
  eh as P,
  bv as Q,
  Bi as R,
  wv as S,
  vv as T,
  Rv as U,
  _v as V,
  xi as W,
  xg as X,
  Dg as Y,
  Fe as Z,
  ge as _,
  Ev as a,
  Dr as a0,
  cv as a1,
  mt as a2,
  ms as a3,
  Zr as a4,
  $i as b,
  rp as c,
  kn as d,
  Ue as e,
  Xt as f,
  Cv as g,
  Lv as h,
  In as i,
  ip as j,
  Ae as k,
  le as l,
  yv as m,
  qs as n,
  Is as o,
  wi as p,
  Av as q,
  gv as r,
  Ov as s,
  Ld as t,
  Sm as u,
  Tv as v,
  fv as w,
  Sv as x,
  ap as y,
  ei as z
};
