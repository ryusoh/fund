/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/cal-heatmap@4.2.4/dist/cal-heatmap.esm.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import { select as t } from '/npm/d3-selection@3.0.0/+esm';
import { hcl as e } from '/npm/d3-color@3.1.0/+esm';
import {
    timeSecond as n,
    timeMinute as r,
    timeHour as i,
    timeDay as o,
    timeWeek as a,
    timeMonth as u,
    timeYear as s,
    timeMonday as c,
    timeTuesday as l,
    timeWednesday as f,
    timeThursday as h,
    timeFriday as d,
    timeSaturday as p,
    timeSunday as v,
    utcSecond as y,
    utcMinute as m,
    utcHour as g,
    utcDay as w,
    utcWeek as b,
    utcMonth as x,
    utcYear as O,
    utcMonday as k,
    utcTuesday as S,
    utcWednesday as j,
    utcThursday as _,
    utcFriday as M,
    utcSaturday as D,
    utcSunday as $,
    scaleLinear as E,
    scalePow as P,
    scaleLog as L,
    scaleSymlog as A,
    quantize as C,
    scaleQuantile as T,
    extent as R,
    ticks as I,
    interpolateNumber as N,
    reverse as W,
    scaleThreshold as F,
    descending as z,
    scaleIdentity as H,
    max as Y,
    scaleDiverging as U,
    scaleDivergingPow as B,
    scaleDivergingLog as G,
    scaleDivergingSymlog as V,
    scaleTime as q,
    scaleUtc as K,
    scaleImplicit as Z,
    scaleOrdinal as J,
    scalePoint as Q,
    scaleBand as X,
    InternSet as tt,
    sort as et,
    symbolsStroke as nt,
    symbolsFill as rt,
    ascending as it,
    interpolateRgb as ot,
    interpolateRound as at,
    min as ut,
    quantile as st,
    median as ct,
    piecewise as lt,
    range as ft,
    schemeAccent as ht,
    schemeCategory10 as dt,
    schemeDark2 as pt,
    schemePaired as vt,
    schemePastel1 as yt,
    schemePastel2 as mt,
    schemeSet1 as gt,
    schemeSet2 as wt,
    schemeSet3 as bt,
    schemeTableau10 as xt,
    interpolateBrBG as Ot,
    interpolatePRGn as kt,
    interpolatePiYG as St,
    interpolatePuOr as jt,
    interpolateRdBu as _t,
    interpolateRdGy as Mt,
    interpolateRdYlBu as Dt,
    interpolateRdYlGn as $t,
    interpolateSpectral as Et,
    interpolateBlues as Pt,
    interpolateGreens as Lt,
    interpolateGreys as At,
    interpolatePurples as Ct,
    interpolateReds as Tt,
    interpolateOranges as Rt,
    interpolateTurbo as It,
    interpolateViridis as Nt,
    interpolateMagma as Wt,
    interpolateInferno as Ft,
    interpolatePlasma as zt,
    interpolateCividis as Ht,
    interpolateCubehelixDefault as Yt,
    interpolateWarm as Ut,
    interpolateCool as Bt,
    interpolateBuGn as Gt,
    interpolateBuPu as Vt,
    interpolateGnBu as qt,
    interpolateOrRd as Kt,
    interpolatePuBuGn as Zt,
    interpolatePuBu as Jt,
    interpolatePuRd as Qt,
    interpolateRdPu as Xt,
    interpolateYlGnBu as te,
    interpolateYlGn as ee,
    interpolateYlOrBr as ne,
    interpolateYlOrRd as re,
    interpolateRainbow as ie,
    interpolateSinebow as oe,
    symbolAsterisk as ae,
    symbolCircle as ue,
    symbolCross as se,
    symbolDiamond as ce,
    symbolDiamond2 as le,
    symbolPlus as fe,
    symbolSquare as he,
    symbolSquare2 as de,
    symbolStar as pe,
    symbolTimes as ve,
    symbolTriangle as ye,
    symbolTriangle2 as me,
    symbolWye as ge,
    schemeBrBG as we,
    schemePRGn as be,
    schemePiYG as xe,
    schemePuOr as Oe,
    schemeRdBu as ke,
    schemeRdGy as Se,
    schemeRdYlBu as je,
    schemeRdYlGn as _e,
    schemeSpectral as Me,
    schemeBlues as De,
    schemeGreens as $e,
    schemeGreys as Ee,
    schemeOranges as Pe,
    schemePurples as Le,
    schemeReds as Ae,
    schemeBuGn as Ce,
    schemeBuPu as Te,
    schemeGnBu as Re,
    schemeOrRd as Ie,
    schemePuBu as Ne,
    schemePuBuGn as We,
    schemePuRd as Fe,
    schemeRdPu as ze,
    schemeYlGn as He,
    schemeYlGnBu as Ye,
    schemeYlOrBr as Ue,
    schemeYlOrRd as Be,
    interpolateHsl as Ge,
    interpolateHcl as Ve,
    interpolateLab as qe,
} from '/npm/d3/+esm';
import { text as Ke, dsv as Ze, csv as Je, json as Qe } from '/npm/d3-fetch@3.0.1/+esm';
var Xe =
    'undefined' != typeof global
        ? global
        : 'undefined' != typeof self
          ? self
          : 'undefined' != typeof window
            ? window
            : {};
function tn() {
    tn = function () {
        return t;
    };
    var t = {},
        e = Object.prototype,
        n = e.hasOwnProperty,
        r =
            Object.defineProperty ||
            function (t, e, n) {
                t[e] = n.value;
            },
        i = 'function' == typeof Symbol ? Symbol : {},
        o = i.iterator || '@@iterator',
        a = i.asyncIterator || '@@asyncIterator',
        u = i.toStringTag || '@@toStringTag';
    function s(t, e, n) {
        return (
            Object.defineProperty(t, e, {
                value: n,
                enumerable: !0,
                configurable: !0,
                writable: !0,
            }),
            t[e]
        );
    }
    try {
        s({}, '');
    } catch (t) {
        s = function (t, e, n) {
            return (t[e] = n);
        };
    }
    function c(t, e, n, i) {
        var o = e && e.prototype instanceof h ? e : h,
            a = Object.create(o.prototype),
            u = new j(i || []);
        return (r(a, '_invoke', { value: x(t, n, u) }), a);
    }
    function l(t, e, n) {
        try {
            return { type: 'normal', arg: t.call(e, n) };
        } catch (t) {
            return { type: 'throw', arg: t };
        }
    }
    t.wrap = c;
    var f = {};
    function h() {}
    function d() {}
    function p() {}
    var v = {};
    s(v, o, function () {
        return this;
    });
    var y = Object.getPrototypeOf,
        m = y && y(y(_([])));
    m && m !== e && n.call(m, o) && (v = m);
    var g = (p.prototype = h.prototype = Object.create(v));
    function w(t) {
        ['next', 'throw', 'return'].forEach(function (e) {
            s(t, e, function (t) {
                return this._invoke(e, t);
            });
        });
    }
    function b(t, e) {
        function i(r, o, a, u) {
            var s = l(t[r], t, o);
            if ('throw' !== s.type) {
                var c = s.arg,
                    f = c.value;
                return f && 'object' == typeof f && n.call(f, '__await')
                    ? e.resolve(f.__await).then(
                          function (t) {
                              i('next', t, a, u);
                          },
                          function (t) {
                              i('throw', t, a, u);
                          }
                      )
                    : e.resolve(f).then(
                          function (t) {
                              ((c.value = t), a(c));
                          },
                          function (t) {
                              return i('throw', t, a, u);
                          }
                      );
            }
            u(s.arg);
        }
        var o;
        r(this, '_invoke', {
            value: function (t, n) {
                function r() {
                    return new e(function (e, r) {
                        i(t, n, e, r);
                    });
                }
                return (o = o ? o.then(r, r) : r());
            },
        });
    }
    function x(t, e, n) {
        var r = 'suspendedStart';
        return function (i, o) {
            if ('executing' === r) throw new Error('Generator is already running');
            if ('completed' === r) {
                if ('throw' === i) throw o;
                return M();
            }
            for (n.method = i, n.arg = o; ; ) {
                var a = n.delegate;
                if (a) {
                    var u = O(a, n);
                    if (u) {
                        if (u === f) continue;
                        return u;
                    }
                }
                if ('next' === n.method) n.sent = n._sent = n.arg;
                else if ('throw' === n.method) {
                    if ('suspendedStart' === r) throw ((r = 'completed'), n.arg);
                    n.dispatchException(n.arg);
                } else 'return' === n.method && n.abrupt('return', n.arg);
                r = 'executing';
                var s = l(t, e, n);
                if ('normal' === s.type) {
                    if (((r = n.done ? 'completed' : 'suspendedYield'), s.arg === f)) continue;
                    return { value: s.arg, done: n.done };
                }
                'throw' === s.type && ((r = 'completed'), (n.method = 'throw'), (n.arg = s.arg));
            }
        };
    }
    function O(t, e) {
        var n = e.method,
            r = t.iterator[n];
        if (void 0 === r)
            return (
                (e.delegate = null),
                ('throw' === n &&
                    t.iterator.return &&
                    ((e.method = 'return'), (e.arg = void 0), O(t, e), 'throw' === e.method)) ||
                    ('return' !== n &&
                        ((e.method = 'throw'),
                        (e.arg = new TypeError(
                            "The iterator does not provide a '" + n + "' method"
                        )))),
                f
            );
        var i = l(r, t.iterator, e.arg);
        if ('throw' === i.type)
            return ((e.method = 'throw'), (e.arg = i.arg), (e.delegate = null), f);
        var o = i.arg;
        return o
            ? o.done
                ? ((e[t.resultName] = o.value),
                  (e.next = t.nextLoc),
                  'return' !== e.method && ((e.method = 'next'), (e.arg = void 0)),
                  (e.delegate = null),
                  f)
                : o
            : ((e.method = 'throw'),
              (e.arg = new TypeError('iterator result is not an object')),
              (e.delegate = null),
              f);
    }
    function k(t) {
        var e = { tryLoc: t[0] };
        (1 in t && (e.catchLoc = t[1]),
            2 in t && ((e.finallyLoc = t[2]), (e.afterLoc = t[3])),
            this.tryEntries.push(e));
    }
    function S(t) {
        var e = t.completion || {};
        ((e.type = 'normal'), delete e.arg, (t.completion = e));
    }
    function j(t) {
        ((this.tryEntries = [{ tryLoc: 'root' }]), t.forEach(k, this), this.reset(!0));
    }
    function _(t) {
        if (t) {
            var e = t[o];
            if (e) return e.call(t);
            if ('function' == typeof t.next) return t;
            if (!isNaN(t.length)) {
                var r = -1,
                    i = function e() {
                        for (; ++r < t.length; )
                            if (n.call(t, r)) return ((e.value = t[r]), (e.done = !1), e);
                        return ((e.value = void 0), (e.done = !0), e);
                    };
                return (i.next = i);
            }
        }
        return { next: M };
    }
    function M() {
        return { value: void 0, done: !0 };
    }
    return (
        (d.prototype = p),
        r(g, 'constructor', { value: p, configurable: !0 }),
        r(p, 'constructor', { value: d, configurable: !0 }),
        (d.displayName = s(p, u, 'GeneratorFunction')),
        (t.isGeneratorFunction = function (t) {
            var e = 'function' == typeof t && t.constructor;
            return !!e && (e === d || 'GeneratorFunction' === (e.displayName || e.name));
        }),
        (t.mark = function (t) {
            return (
                Object.setPrototypeOf
                    ? Object.setPrototypeOf(t, p)
                    : ((t.__proto__ = p), s(t, u, 'GeneratorFunction')),
                (t.prototype = Object.create(g)),
                t
            );
        }),
        (t.awrap = function (t) {
            return { __await: t };
        }),
        w(b.prototype),
        s(b.prototype, a, function () {
            return this;
        }),
        (t.AsyncIterator = b),
        (t.async = function (e, n, r, i, o) {
            void 0 === o && (o = Promise);
            var a = new b(c(e, n, r, i), o);
            return t.isGeneratorFunction(n)
                ? a
                : a.next().then(function (t) {
                      return t.done ? t.value : a.next();
                  });
        }),
        w(g),
        s(g, u, 'Generator'),
        s(g, o, function () {
            return this;
        }),
        s(g, 'toString', function () {
            return '[object Generator]';
        }),
        (t.keys = function (t) {
            var e = Object(t),
                n = [];
            for (var r in e) n.push(r);
            return (
                n.reverse(),
                function t() {
                    for (; n.length; ) {
                        var r = n.pop();
                        if (r in e) return ((t.value = r), (t.done = !1), t);
                    }
                    return ((t.done = !0), t);
                }
            );
        }),
        (t.values = _),
        (j.prototype = {
            constructor: j,
            reset: function (t) {
                if (
                    ((this.prev = 0),
                    (this.next = 0),
                    (this.sent = this._sent = void 0),
                    (this.done = !1),
                    (this.delegate = null),
                    (this.method = 'next'),
                    (this.arg = void 0),
                    this.tryEntries.forEach(S),
                    !t)
                )
                    for (var e in this)
                        't' === e.charAt(0) &&
                            n.call(this, e) &&
                            !isNaN(+e.slice(1)) &&
                            (this[e] = void 0);
            },
            stop: function () {
                this.done = !0;
                var t = this.tryEntries[0].completion;
                if ('throw' === t.type) throw t.arg;
                return this.rval;
            },
            dispatchException: function (t) {
                if (this.done) throw t;
                var e = this;
                function r(n, r) {
                    return (
                        (a.type = 'throw'),
                        (a.arg = t),
                        (e.next = n),
                        r && ((e.method = 'next'), (e.arg = void 0)),
                        !!r
                    );
                }
                for (var i = this.tryEntries.length - 1; i >= 0; --i) {
                    var o = this.tryEntries[i],
                        a = o.completion;
                    if ('root' === o.tryLoc) return r('end');
                    if (o.tryLoc <= this.prev) {
                        var u = n.call(o, 'catchLoc'),
                            s = n.call(o, 'finallyLoc');
                        if (u && s) {
                            if (this.prev < o.catchLoc) return r(o.catchLoc, !0);
                            if (this.prev < o.finallyLoc) return r(o.finallyLoc);
                        } else if (u) {
                            if (this.prev < o.catchLoc) return r(o.catchLoc, !0);
                        } else {
                            if (!s) throw new Error('try statement without catch or finally');
                            if (this.prev < o.finallyLoc) return r(o.finallyLoc);
                        }
                    }
                }
            },
            abrupt: function (t, e) {
                for (var r = this.tryEntries.length - 1; r >= 0; --r) {
                    var i = this.tryEntries[r];
                    if (
                        i.tryLoc <= this.prev &&
                        n.call(i, 'finallyLoc') &&
                        this.prev < i.finallyLoc
                    ) {
                        var o = i;
                        break;
                    }
                }
                o &&
                    ('break' === t || 'continue' === t) &&
                    o.tryLoc <= e &&
                    e <= o.finallyLoc &&
                    (o = null);
                var a = o ? o.completion : {};
                return (
                    (a.type = t),
                    (a.arg = e),
                    o ? ((this.method = 'next'), (this.next = o.finallyLoc), f) : this.complete(a)
                );
            },
            complete: function (t, e) {
                if ('throw' === t.type) throw t.arg;
                return (
                    'break' === t.type || 'continue' === t.type
                        ? (this.next = t.arg)
                        : 'return' === t.type
                          ? ((this.rval = this.arg = t.arg),
                            (this.method = 'return'),
                            (this.next = 'end'))
                          : 'normal' === t.type && e && (this.next = e),
                    f
                );
            },
            finish: function (t) {
                for (var e = this.tryEntries.length - 1; e >= 0; --e) {
                    var n = this.tryEntries[e];
                    if (n.finallyLoc === t)
                        return (this.complete(n.completion, n.afterLoc), S(n), f);
                }
            },
            catch: function (t) {
                for (var e = this.tryEntries.length - 1; e >= 0; --e) {
                    var n = this.tryEntries[e];
                    if (n.tryLoc === t) {
                        var r = n.completion;
                        if ('throw' === r.type) {
                            var i = r.arg;
                            S(n);
                        }
                        return i;
                    }
                }
                throw new Error('illegal catch attempt');
            },
            delegateYield: function (t, e, n) {
                return (
                    (this.delegate = { iterator: _(t), resultName: e, nextLoc: n }),
                    'next' === this.method && (this.arg = void 0),
                    f
                );
            },
        }),
        t
    );
}
function en(t) {
    return (
        (en =
            'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (t) {
                      return typeof t;
                  }
                : function (t) {
                      return t &&
                          'function' == typeof Symbol &&
                          t.constructor === Symbol &&
                          t !== Symbol.prototype
                          ? 'symbol'
                          : typeof t;
                  }),
        en(t)
    );
}
function nn(t, e) {
    if (!(t instanceof e)) throw new TypeError('Cannot call a class as a function');
}
function rn(t, e) {
    for (var n = 0; n < e.length; n++) {
        var r = e[n];
        ((r.enumerable = r.enumerable || !1),
            (r.configurable = !0),
            'value' in r && (r.writable = !0),
            Object.defineProperty(t, ln(r.key), r));
    }
}
function on(t, e, n) {
    return (
        e && rn(t.prototype, e),
        n && rn(t, n),
        Object.defineProperty(t, 'prototype', { writable: !1 }),
        t
    );
}
function an(t, e) {
    return (
        (function (t) {
            if (Array.isArray(t)) return t;
        })(t) ||
        (function (t, e) {
            var n =
                null == t
                    ? null
                    : ('undefined' != typeof Symbol && t[Symbol.iterator]) || t['@@iterator'];
            if (null != n) {
                var r,
                    i,
                    o,
                    a,
                    u = [],
                    s = !0,
                    c = !1;
                try {
                    if (((o = (n = n.call(t)).next), 0 === e)) {
                        if (Object(n) !== n) return;
                        s = !1;
                    } else
                        for (
                            ;
                            !(s = (r = o.call(n)).done) && (u.push(r.value), u.length !== e);
                            s = !0
                        );
                } catch (t) {
                    ((c = !0), (i = t));
                } finally {
                    try {
                        if (!s && null != n.return && ((a = n.return()), Object(a) !== a)) return;
                    } finally {
                        if (c) throw i;
                    }
                }
                return u;
            }
        })(t, e) ||
        sn(t, e) ||
        (function () {
            throw new TypeError(
                'Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'
            );
        })()
    );
}
function un(t) {
    return (
        (function (t) {
            if (Array.isArray(t)) return cn(t);
        })(t) ||
        (function (t) {
            if (
                ('undefined' != typeof Symbol && null != t[Symbol.iterator]) ||
                null != t['@@iterator']
            )
                return Array.from(t);
        })(t) ||
        sn(t) ||
        (function () {
            throw new TypeError(
                'Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'
            );
        })()
    );
}
function sn(t, e) {
    if (t) {
        if ('string' == typeof t) return cn(t, e);
        var n = Object.prototype.toString.call(t).slice(8, -1);
        return (
            'Object' === n && t.constructor && (n = t.constructor.name),
            'Map' === n || 'Set' === n
                ? Array.from(t)
                : 'Arguments' === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)
                  ? cn(t, e)
                  : void 0
        );
    }
}
function cn(t, e) {
    (null == e || e > t.length) && (e = t.length);
    for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
    return r;
}
function ln(t) {
    var e = (function (t, e) {
        if ('object' != typeof t || null === t) return t;
        var n = t[Symbol.toPrimitive];
        if (void 0 !== n) {
            var r = n.call(t, e || 'default');
            if ('object' != typeof r) return r;
            throw new TypeError('@@toPrimitive must return a primitive value.');
        }
        return ('string' === e ? String : Number)(t);
    })(t, 'string');
    return 'symbol' == typeof e ? e : String(e);
}
var fn =
    'undefined' != typeof globalThis
        ? globalThis
        : 'undefined' != typeof window
          ? window
          : void 0 !== Xe
            ? Xe
            : 'undefined' != typeof self
              ? self
              : {};
function hn(t) {
    return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, 'default') ? t.default : t;
}
var dn = function (t) {
        return t && t.Math === Math && t;
    },
    pn =
        dn('object' == typeof globalThis && globalThis) ||
        dn('object' == typeof window && window) ||
        dn('object' == typeof self && self) ||
        dn('object' == typeof fn && fn) ||
        dn('object' == typeof fn && fn) ||
        (function () {
            return this;
        })() ||
        Function('return this')(),
    vn = { exports: {} },
    yn = pn,
    mn = Object.defineProperty,
    gn = function (t, e) {
        try {
            mn(yn, t, { value: e, configurable: !0, writable: !0 });
        } catch (n) {
            yn[t] = e;
        }
        return e;
    },
    wn = gn,
    bn = '__core-js_shared__',
    xn = pn[bn] || wn(bn, {}),
    On = xn;
(vn.exports = function (t, e) {
    return On[t] || (On[t] = void 0 !== e ? e : {});
})('versions', []).push({
    version: '3.34.0',
    mode: 'global',
    copyright: '© 2014-2023 Denis Pushkarev (zloirock.ru)',
    license: 'https://github.com/zloirock/core-js/blob/v3.34.0/LICENSE',
    source: 'https://github.com/zloirock/core-js',
});
var kn,
    Sn,
    jn = vn.exports,
    _n = function (t) {
        try {
            return !!t();
        } catch (t) {
            return !0;
        }
    },
    Mn = !_n(function () {
        var t = function () {}.bind();
        return 'function' != typeof t || t.hasOwnProperty('prototype');
    }),
    Dn = Mn,
    $n = Function.prototype,
    En = $n.call,
    Pn = Dn && $n.bind.bind(En, En),
    Ln = Dn
        ? Pn
        : function (t) {
              return function () {
                  return En.apply(t, arguments);
              };
          },
    An = function (t) {
        return null == t;
    },
    Cn = An,
    Tn = TypeError,
    Rn = function (t) {
        if (Cn(t)) throw new Tn("Can't call method on " + t);
        return t;
    },
    In = Rn,
    Nn = Object,
    Wn = function (t) {
        return Nn(In(t));
    },
    Fn = Wn,
    zn = Ln({}.hasOwnProperty),
    Hn =
        Object.hasOwn ||
        function (t, e) {
            return zn(Fn(t), e);
        },
    Yn = Ln,
    Un = 0,
    Bn = Math.random(),
    Gn = Yn((1).toString),
    Vn = function (t) {
        return 'Symbol(' + (void 0 === t ? '' : t) + ')_' + Gn(++Un + Bn, 36);
    },
    qn = ('undefined' != typeof navigator && String(navigator.userAgent)) || '',
    Kn = pn,
    Zn = qn,
    Jn = Kn.process,
    Qn = Kn.Deno,
    Xn = (Jn && Jn.versions) || (Qn && Qn.version),
    tr = Xn && Xn.v8;
(tr && (Sn = (kn = tr.split('.'))[0] > 0 && kn[0] < 4 ? 1 : +(kn[0] + kn[1])),
    !Sn &&
        Zn &&
        (!(kn = Zn.match(/Edge\/(\d+)/)) || kn[1] >= 74) &&
        (kn = Zn.match(/Chrome\/(\d+)/)) &&
        (Sn = +kn[1]));
var er = Sn,
    nr = er,
    rr = _n,
    ir = pn.String,
    or =
        !!Object.getOwnPropertySymbols &&
        !rr(function () {
            var t = Symbol('symbol detection');
            return !ir(t) || !(Object(t) instanceof Symbol) || (!Symbol.sham && nr && nr < 41);
        }),
    ar = or && !Symbol.sham && 'symbol' == typeof Symbol.iterator,
    ur = jn,
    sr = Hn,
    cr = Vn,
    lr = or,
    fr = ar,
    hr = pn.Symbol,
    dr = ur('wks'),
    pr = fr ? hr.for || hr : (hr && hr.withoutSetter) || cr,
    vr = function (t) {
        return (sr(dr, t) || (dr[t] = lr && sr(hr, t) ? hr[t] : pr('Symbol.' + t)), dr[t]);
    },
    yr = {};
yr[vr('toStringTag')] = 'z';
var mr = '[object z]' === String(yr),
    gr = 'object' == typeof document && document.all,
    wr = { all: gr, IS_HTMLDDA: void 0 === gr && void 0 !== gr },
    br = wr.all,
    xr = wr.IS_HTMLDDA
        ? function (t) {
              return 'function' == typeof t || t === br;
          }
        : function (t) {
              return 'function' == typeof t;
          },
    Or = {},
    kr = !_n(function () {
        return (
            7 !==
            Object.defineProperty({}, 1, {
                get: function () {
                    return 7;
                },
            })[1]
        );
    }),
    Sr = xr,
    jr = wr.all,
    _r = wr.IS_HTMLDDA
        ? function (t) {
              return 'object' == typeof t ? null !== t : Sr(t) || t === jr;
          }
        : function (t) {
              return 'object' == typeof t ? null !== t : Sr(t);
          },
    Mr = _r,
    Dr = pn.document,
    $r = Mr(Dr) && Mr(Dr.createElement),
    Er = function (t) {
        return $r ? Dr.createElement(t) : {};
    },
    Pr = Er,
    Lr =
        !kr &&
        !_n(function () {
            return (
                7 !==
                Object.defineProperty(Pr('div'), 'a', {
                    get: function () {
                        return 7;
                    },
                }).a
            );
        }),
    Ar =
        kr &&
        _n(function () {
            return (
                42 !==
                Object.defineProperty(function () {}, 'prototype', { value: 42, writable: !1 })
                    .prototype
            );
        }),
    Cr = _r,
    Tr = String,
    Rr = TypeError,
    Ir = function (t) {
        if (Cr(t)) return t;
        throw new Rr(Tr(t) + ' is not an object');
    },
    Nr = Mn,
    Wr = Function.prototype.call,
    Fr = Nr
        ? Wr.bind(Wr)
        : function () {
              return Wr.apply(Wr, arguments);
          },
    zr = pn,
    Hr = xr,
    Yr = function (t, e) {
        return arguments.length < 2 ? ((n = zr[t]), Hr(n) ? n : void 0) : zr[t] && zr[t][e];
        var n;
    },
    Ur = Ln({}.isPrototypeOf),
    Br = Yr,
    Gr = xr,
    Vr = Ur,
    qr = Object,
    Kr = ar
        ? function (t) {
              return 'symbol' == typeof t;
          }
        : function (t) {
              var e = Br('Symbol');
              return Gr(e) && Vr(e.prototype, qr(t));
          },
    Zr = String,
    Jr = function (t) {
        try {
            return Zr(t);
        } catch (t) {
            return 'Object';
        }
    },
    Qr = xr,
    Xr = Jr,
    ti = TypeError,
    ei = function (t) {
        if (Qr(t)) return t;
        throw new ti(Xr(t) + ' is not a function');
    },
    ni = ei,
    ri = An,
    ii = function (t, e) {
        var n = t[e];
        return ri(n) ? void 0 : ni(n);
    },
    oi = Fr,
    ai = xr,
    ui = _r,
    si = TypeError,
    ci = Fr,
    li = _r,
    fi = Kr,
    hi = ii,
    di = function (t, e) {
        var n, r;
        if ('string' === e && ai((n = t.toString)) && !ui((r = oi(n, t)))) return r;
        if (ai((n = t.valueOf)) && !ui((r = oi(n, t)))) return r;
        if ('string' !== e && ai((n = t.toString)) && !ui((r = oi(n, t)))) return r;
        throw new si("Can't convert object to primitive value");
    },
    pi = TypeError,
    vi = vr('toPrimitive'),
    yi = function (t, e) {
        if (!li(t) || fi(t)) return t;
        var n,
            r = hi(t, vi);
        if (r) {
            if ((void 0 === e && (e = 'default'), (n = ci(r, t, e)), !li(n) || fi(n))) return n;
            throw new pi("Can't convert object to primitive value");
        }
        return (void 0 === e && (e = 'number'), di(t, e));
    },
    mi = Kr,
    gi = function (t) {
        var e = yi(t, 'string');
        return mi(e) ? e : e + '';
    },
    wi = kr,
    bi = Lr,
    xi = Ar,
    Oi = Ir,
    ki = gi,
    Si = TypeError,
    ji = Object.defineProperty,
    _i = Object.getOwnPropertyDescriptor,
    Mi = 'enumerable',
    Di = 'configurable',
    $i = 'writable';
Or.f = wi
    ? xi
        ? function (t, e, n) {
              if (
                  (Oi(t),
                  (e = ki(e)),
                  Oi(n),
                  'function' == typeof t && 'prototype' === e && 'value' in n && $i in n && !n[$i])
              ) {
                  var r = _i(t, e);
                  r &&
                      r[$i] &&
                      ((t[e] = n.value),
                      (n = {
                          configurable: Di in n ? n[Di] : r[Di],
                          enumerable: Mi in n ? n[Mi] : r[Mi],
                          writable: !1,
                      }));
              }
              return ji(t, e, n);
          }
        : ji
    : function (t, e, n) {
          if ((Oi(t), (e = ki(e)), Oi(n), bi))
              try {
                  return ji(t, e, n);
              } catch (t) {}
          if ('get' in n || 'set' in n) throw new Si('Accessors not supported');
          return ('value' in n && (t[e] = n.value), t);
      };
var Ei = { exports: {} },
    Pi = kr,
    Li = Hn,
    Ai = Function.prototype,
    Ci = Pi && Object.getOwnPropertyDescriptor,
    Ti = Li(Ai, 'name'),
    Ri = {
        EXISTS: Ti,
        PROPER: Ti && 'something' === function () {}.name,
        CONFIGURABLE: Ti && (!Pi || (Pi && Ci(Ai, 'name').configurable)),
    },
    Ii = xr,
    Ni = xn,
    Wi = Ln(Function.toString);
Ii(Ni.inspectSource) ||
    (Ni.inspectSource = function (t) {
        return Wi(t);
    });
var Fi,
    zi,
    Hi,
    Yi = Ni.inspectSource,
    Ui = xr,
    Bi = pn.WeakMap,
    Gi = Ui(Bi) && /native code/.test(String(Bi)),
    Vi = function (t, e) {
        return { enumerable: !(1 & t), configurable: !(2 & t), writable: !(4 & t), value: e };
    },
    qi = Or,
    Ki = Vi,
    Zi = kr
        ? function (t, e, n) {
              return qi.f(t, e, Ki(1, n));
          }
        : function (t, e, n) {
              return ((t[e] = n), t);
          },
    Ji = Vn,
    Qi = jn('keys'),
    Xi = function (t) {
        return Qi[t] || (Qi[t] = Ji(t));
    },
    to = {},
    eo = Gi,
    no = pn,
    ro = _r,
    io = Zi,
    oo = Hn,
    ao = xn,
    uo = Xi,
    so = to,
    co = 'Object already initialized',
    lo = no.TypeError,
    fo = no.WeakMap;
if (eo || ao.state) {
    var ho = ao.state || (ao.state = new fo());
    ((ho.get = ho.get),
        (ho.has = ho.has),
        (ho.set = ho.set),
        (Fi = function (t, e) {
            if (ho.has(t)) throw new lo(co);
            return ((e.facade = t), ho.set(t, e), e);
        }),
        (zi = function (t) {
            return ho.get(t) || {};
        }),
        (Hi = function (t) {
            return ho.has(t);
        }));
} else {
    var po = uo('state');
    ((so[po] = !0),
        (Fi = function (t, e) {
            if (oo(t, po)) throw new lo(co);
            return ((e.facade = t), io(t, po, e), e);
        }),
        (zi = function (t) {
            return oo(t, po) ? t[po] : {};
        }),
        (Hi = function (t) {
            return oo(t, po);
        }));
}
var vo = {
        set: Fi,
        get: zi,
        has: Hi,
        enforce: function (t) {
            return Hi(t) ? zi(t) : Fi(t, {});
        },
        getterFor: function (t) {
            return function (e) {
                var n;
                if (!ro(e) || (n = zi(e)).type !== t)
                    throw new lo('Incompatible receiver, ' + t + ' required');
                return n;
            };
        },
    },
    yo = Ln,
    mo = _n,
    go = xr,
    wo = Hn,
    bo = kr,
    xo = Ri.CONFIGURABLE,
    Oo = Yi,
    ko = vo.enforce,
    So = vo.get,
    jo = String,
    _o = Object.defineProperty,
    Mo = yo(''.slice),
    Do = yo(''.replace),
    $o = yo([].join),
    Eo =
        bo &&
        !mo(function () {
            return 8 !== _o(function () {}, 'length', { value: 8 }).length;
        }),
    Po = String(String).split('String'),
    Lo = (Ei.exports = function (t, e, n) {
        ('Symbol(' === Mo(jo(e), 0, 7) && (e = '[' + Do(jo(e), /^Symbol\(([^)]*)\)/, '$1') + ']'),
            n && n.getter && (e = 'get ' + e),
            n && n.setter && (e = 'set ' + e),
            (!wo(t, 'name') || (xo && t.name !== e)) &&
                (bo ? _o(t, 'name', { value: e, configurable: !0 }) : (t.name = e)),
            Eo &&
                n &&
                wo(n, 'arity') &&
                t.length !== n.arity &&
                _o(t, 'length', { value: n.arity }));
        try {
            n && wo(n, 'constructor') && n.constructor
                ? bo && _o(t, 'prototype', { writable: !1 })
                : t.prototype && (t.prototype = void 0);
        } catch (t) {}
        var r = ko(t);
        return (wo(r, 'source') || (r.source = $o(Po, 'string' == typeof e ? e : '')), t);
    });
Function.prototype.toString = Lo(function () {
    return (go(this) && So(this).source) || Oo(this);
}, 'toString');
var Ao = Ei.exports,
    Co = xr,
    To = Or,
    Ro = Ao,
    Io = gn,
    No = function (t, e, n, r) {
        r || (r = {});
        var i = r.enumerable,
            o = void 0 !== r.name ? r.name : e;
        if ((Co(n) && Ro(n, o, r), r.global)) i ? (t[e] = n) : Io(e, n);
        else {
            try {
                r.unsafe ? t[e] && (i = !0) : delete t[e];
            } catch (t) {}
            i
                ? (t[e] = n)
                : To.f(t, e, {
                      value: n,
                      enumerable: !1,
                      configurable: !r.nonConfigurable,
                      writable: !r.nonWritable,
                  });
        }
        return t;
    },
    Wo = Ln,
    Fo = Wo({}.toString),
    zo = Wo(''.slice),
    Ho = function (t) {
        return zo(Fo(t), 8, -1);
    },
    Yo = mr,
    Uo = xr,
    Bo = Ho,
    Go = vr('toStringTag'),
    Vo = Object,
    qo =
        'Arguments' ===
        Bo(
            (function () {
                return arguments;
            })()
        ),
    Ko = Yo
        ? Bo
        : function (t) {
              var e, n, r;
              return void 0 === t
                  ? 'Undefined'
                  : null === t
                    ? 'Null'
                    : 'string' ==
                        typeof (n = (function (t, e) {
                            try {
                                return t[e];
                            } catch (t) {}
                        })((e = Vo(t)), Go))
                      ? n
                      : qo
                        ? Bo(e)
                        : 'Object' === (r = Bo(e)) && Uo(e.callee)
                          ? 'Arguments'
                          : r;
          },
    Zo = Ko,
    Jo = mr
        ? {}.toString
        : function () {
              return '[object ' + Zo(this) + ']';
          };
mr || No(Object.prototype, 'toString', Jo, { unsafe: !0 });
var Qo = {},
    Xo = {},
    ta = {}.propertyIsEnumerable,
    ea = Object.getOwnPropertyDescriptor,
    na = ea && !ta.call({ 1: 2 }, 1);
Xo.f = na
    ? function (t) {
          var e = ea(this, t);
          return !!e && e.enumerable;
      }
    : ta;
var ra = _n,
    ia = Ho,
    oa = Object,
    aa = Ln(''.split),
    ua = ra(function () {
        return !oa('z').propertyIsEnumerable(0);
    })
        ? function (t) {
              return 'String' === ia(t) ? aa(t, '') : oa(t);
          }
        : oa,
    sa = ua,
    ca = Rn,
    la = function (t) {
        return sa(ca(t));
    },
    fa = kr,
    ha = Fr,
    da = Xo,
    pa = Vi,
    va = la,
    ya = gi,
    ma = Hn,
    ga = Lr,
    wa = Object.getOwnPropertyDescriptor;
Qo.f = fa
    ? wa
    : function (t, e) {
          if (((t = va(t)), (e = ya(e)), ga))
              try {
                  return wa(t, e);
              } catch (t) {}
          if (ma(t, e)) return pa(!ha(da.f, t, e), t[e]);
      };
var ba = {},
    xa = Math.ceil,
    Oa = Math.floor,
    ka =
        Math.trunc ||
        function (t) {
            var e = +t;
            return (e > 0 ? Oa : xa)(e);
        },
    Sa = function (t) {
        var e = +t;
        return e != e || 0 === e ? 0 : ka(e);
    },
    ja = Sa,
    _a = Math.max,
    Ma = Math.min,
    Da = function (t, e) {
        var n = ja(t);
        return n < 0 ? _a(n + e, 0) : Ma(n, e);
    },
    $a = Sa,
    Ea = Math.min,
    Pa = function (t) {
        return t > 0 ? Ea($a(t), 9007199254740991) : 0;
    },
    La = Pa,
    Aa = function (t) {
        return La(t.length);
    },
    Ca = la,
    Ta = Da,
    Ra = Aa,
    Ia = function (t) {
        return function (e, n, r) {
            var i,
                o = Ca(e),
                a = Ra(o),
                u = Ta(r, a);
            if (t && n != n) {
                for (; a > u; ) if ((i = o[u++]) != i) return !0;
            } else for (; a > u; u++) if ((t || u in o) && o[u] === n) return t || u || 0;
            return !t && -1;
        };
    },
    Na = { includes: Ia(!0), indexOf: Ia(!1) },
    Wa = Hn,
    Fa = la,
    za = Na.indexOf,
    Ha = to,
    Ya = Ln([].push),
    Ua = function (t, e) {
        var n,
            r = Fa(t),
            i = 0,
            o = [];
        for (n in r) !Wa(Ha, n) && Wa(r, n) && Ya(o, n);
        for (; e.length > i; ) Wa(r, (n = e[i++])) && (~za(o, n) || Ya(o, n));
        return o;
    },
    Ba = [
        'constructor',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
        'toString',
        'valueOf',
    ],
    Ga = Ua,
    Va = Ba.concat('length', 'prototype');
ba.f =
    Object.getOwnPropertyNames ||
    function (t) {
        return Ga(t, Va);
    };
var qa = {};
qa.f = Object.getOwnPropertySymbols;
var Ka = Yr,
    Za = ba,
    Ja = qa,
    Qa = Ir,
    Xa = Ln([].concat),
    tu =
        Ka('Reflect', 'ownKeys') ||
        function (t) {
            var e = Za.f(Qa(t)),
                n = Ja.f;
            return n ? Xa(e, n(t)) : e;
        },
    eu = Hn,
    nu = tu,
    ru = Qo,
    iu = Or,
    ou = _n,
    au = xr,
    uu = /#|\.prototype\./,
    su = function (t, e) {
        var n = lu[cu(t)];
        return n === hu || (n !== fu && (au(e) ? ou(e) : !!e));
    },
    cu = (su.normalize = function (t) {
        return String(t).replace(uu, '.').toLowerCase();
    }),
    lu = (su.data = {}),
    fu = (su.NATIVE = 'N'),
    hu = (su.POLYFILL = 'P'),
    du = su,
    pu = pn,
    vu = Qo.f,
    yu = Zi,
    mu = No,
    gu = gn,
    wu = function (t, e, n) {
        for (var r = nu(e), i = iu.f, o = ru.f, a = 0; a < r.length; a++) {
            var u = r[a];
            eu(t, u) || (n && eu(n, u)) || i(t, u, o(e, u));
        }
    },
    bu = du,
    xu = function (t, e) {
        var n,
            r,
            i,
            o,
            a,
            u = t.target,
            s = t.global,
            c = t.stat;
        if ((n = s ? pu : c ? pu[u] || gu(u, {}) : (pu[u] || {}).prototype))
            for (r in e) {
                if (
                    ((o = e[r]),
                    (i = t.dontCallGetSet ? (a = vu(n, r)) && a.value : n[r]),
                    !bu(s ? r : u + (c ? '.' : '#') + r, t.forced) && void 0 !== i)
                ) {
                    if (typeof o == typeof i) continue;
                    wu(o, i);
                }
                ((t.sham || (i && i.sham)) && yu(o, 'sham', !0), mu(n, r, o, t));
            }
    },
    Ou = 'process' === Ho(pn.process),
    ku = Ln,
    Su = ei,
    ju = xr,
    _u = String,
    Mu = TypeError,
    Du = function (t, e, n) {
        try {
            return ku(Su(Object.getOwnPropertyDescriptor(t, e)[n]));
        } catch (t) {}
    },
    $u = Ir,
    Eu = function (t) {
        if ('object' == typeof t || ju(t)) return t;
        throw new Mu("Can't set " + _u(t) + ' as a prototype');
    },
    Pu =
        Object.setPrototypeOf ||
        ('__proto__' in {}
            ? (function () {
                  var t,
                      e = !1,
                      n = {};
                  try {
                      ((t = Du(Object.prototype, '__proto__', 'set'))(n, []),
                          (e = n instanceof Array));
                  } catch (t) {}
                  return function (n, r) {
                      return ($u(n), Eu(r), e ? t(n, r) : (n.__proto__ = r), n);
                  };
              })()
            : void 0),
    Lu = Or.f,
    Au = Hn,
    Cu = vr('toStringTag'),
    Tu = function (t, e, n) {
        (t && !n && (t = t.prototype),
            t && !Au(t, Cu) && Lu(t, Cu, { configurable: !0, value: e }));
    },
    Ru = Ao,
    Iu = Or,
    Nu = function (t, e, n) {
        return (
            n.get && Ru(n.get, e, { getter: !0 }),
            n.set && Ru(n.set, e, { setter: !0 }),
            Iu.f(t, e, n)
        );
    },
    Wu = Yr,
    Fu = Nu,
    zu = kr,
    Hu = vr('species'),
    Yu = function (t) {
        var e = Wu(t);
        zu &&
            e &&
            !e[Hu] &&
            Fu(e, Hu, {
                configurable: !0,
                get: function () {
                    return this;
                },
            });
    },
    Uu = Ur,
    Bu = TypeError,
    Gu = function (t, e) {
        if (Uu(e, t)) return t;
        throw new Bu('Incorrect invocation');
    },
    Vu = Ln,
    qu = _n,
    Ku = xr,
    Zu = Ko,
    Ju = Yi,
    Qu = function () {},
    Xu = [],
    ts = Yr('Reflect', 'construct'),
    es = /^\s*(?:class|function)\b/,
    ns = Vu(es.exec),
    rs = !es.test(Qu),
    is = function (t) {
        if (!Ku(t)) return !1;
        try {
            return (ts(Qu, Xu, t), !0);
        } catch (t) {
            return !1;
        }
    },
    os = function (t) {
        if (!Ku(t)) return !1;
        switch (Zu(t)) {
            case 'AsyncFunction':
            case 'GeneratorFunction':
            case 'AsyncGeneratorFunction':
                return !1;
        }
        try {
            return rs || !!ns(es, Ju(t));
        } catch (t) {
            return !0;
        }
    };
os.sham = !0;
var as,
    us,
    ss,
    cs,
    ls =
        !ts ||
        qu(function () {
            var t;
            return (
                is(is.call) ||
                !is(Object) ||
                !is(function () {
                    t = !0;
                }) ||
                t
            );
        })
            ? os
            : is,
    fs = ls,
    hs = Jr,
    ds = TypeError,
    ps = Ir,
    vs = function (t) {
        if (fs(t)) return t;
        throw new ds(hs(t) + ' is not a constructor');
    },
    ys = An,
    ms = vr('species'),
    gs = Mn,
    ws = Function.prototype,
    bs = ws.apply,
    xs = ws.call,
    Os =
        ('object' == typeof Reflect && Reflect.apply) ||
        (gs
            ? xs.bind(bs)
            : function () {
                  return xs.apply(bs, arguments);
              }),
    ks = Ho,
    Ss = Ln,
    js = function (t) {
        if ('Function' === ks(t)) return Ss(t);
    },
    _s = ei,
    Ms = Mn,
    Ds = js(js.bind),
    $s = function (t, e) {
        return (
            _s(t),
            void 0 === e
                ? t
                : Ms
                  ? Ds(t, e)
                  : function () {
                        return t.apply(e, arguments);
                    }
        );
    },
    Es = Yr('document', 'documentElement'),
    Ps = Ln([].slice),
    Ls = TypeError,
    As = /(?:ipad|iphone|ipod).*applewebkit/i.test(qn),
    Cs = pn,
    Ts = Os,
    Rs = $s,
    Is = xr,
    Ns = Hn,
    Ws = _n,
    Fs = Es,
    zs = Ps,
    Hs = Er,
    Ys = function (t, e) {
        if (t < e) throw new Ls('Not enough arguments');
        return t;
    },
    Us = As,
    Bs = Ou,
    Gs = Cs.setImmediate,
    Vs = Cs.clearImmediate,
    qs = Cs.process,
    Ks = Cs.Dispatch,
    Zs = Cs.Function,
    Js = Cs.MessageChannel,
    Qs = Cs.String,
    Xs = 0,
    tc = {},
    ec = 'onreadystatechange';
Ws(function () {
    as = Cs.location;
});
var nc = function (t) {
        if (Ns(tc, t)) {
            var e = tc[t];
            (delete tc[t], e());
        }
    },
    rc = function (t) {
        return function () {
            nc(t);
        };
    },
    ic = function (t) {
        nc(t.data);
    },
    oc = function (t) {
        Cs.postMessage(Qs(t), as.protocol + '//' + as.host);
    };
(Gs && Vs) ||
    ((Gs = function (t) {
        Ys(arguments.length, 1);
        var e = Is(t) ? t : Zs(t),
            n = zs(arguments, 1);
        return (
            (tc[++Xs] = function () {
                Ts(e, void 0, n);
            }),
            us(Xs),
            Xs
        );
    }),
    (Vs = function (t) {
        delete tc[t];
    }),
    Bs
        ? (us = function (t) {
              qs.nextTick(rc(t));
          })
        : Ks && Ks.now
          ? (us = function (t) {
                Ks.now(rc(t));
            })
          : Js && !Us
            ? ((cs = (ss = new Js()).port2),
              (ss.port1.onmessage = ic),
              (us = Rs(cs.postMessage, cs)))
            : Cs.addEventListener &&
                Is(Cs.postMessage) &&
                !Cs.importScripts &&
                as &&
                'file:' !== as.protocol &&
                !Ws(oc)
              ? ((us = oc), Cs.addEventListener('message', ic, !1))
              : (us =
                    ec in Hs('script')
                        ? function (t) {
                              Fs.appendChild(Hs('script'))[ec] = function () {
                                  (Fs.removeChild(this), nc(t));
                              };
                          }
                        : function (t) {
                              setTimeout(rc(t), 0);
                          }));
var ac = { set: Gs, clear: Vs },
    uc = function () {
        ((this.head = null), (this.tail = null));
    };
uc.prototype = {
    add: function (t) {
        var e = { item: t, next: null },
            n = this.tail;
        (n ? (n.next = e) : (this.head = e), (this.tail = e));
    },
    get: function () {
        var t = this.head;
        if (t) return (null === (this.head = t.next) && (this.tail = null), t.item);
    },
};
var sc,
    cc,
    lc,
    fc,
    hc,
    dc = uc,
    pc = /ipad|iphone|ipod/i.test(qn) && 'undefined' != typeof Pebble,
    vc = /web0s(?!.*chrome)/i.test(qn),
    yc = pn,
    mc = $s,
    gc = Qo.f,
    wc = ac.set,
    bc = dc,
    xc = As,
    Oc = pc,
    kc = vc,
    Sc = Ou,
    jc = yc.MutationObserver || yc.WebKitMutationObserver,
    _c = yc.document,
    Mc = yc.process,
    Dc = yc.Promise,
    $c = gc(yc, 'queueMicrotask'),
    Ec = $c && $c.value;
if (!Ec) {
    var Pc = new bc(),
        Lc = function () {
            var t, e;
            for (Sc && (t = Mc.domain) && t.exit(); (e = Pc.get()); )
                try {
                    e();
                } catch (t) {
                    throw (Pc.head && sc(), t);
                }
            t && t.enter();
        };
    (xc || Sc || kc || !jc || !_c
        ? !Oc && Dc && Dc.resolve
            ? (((fc = Dc.resolve(void 0)).constructor = Dc),
              (hc = mc(fc.then, fc)),
              (sc = function () {
                  hc(Lc);
              }))
            : Sc
              ? (sc = function () {
                    Mc.nextTick(Lc);
                })
              : ((wc = mc(wc, yc)),
                (sc = function () {
                    wc(Lc);
                }))
        : ((cc = !0),
          (lc = _c.createTextNode('')),
          new jc(Lc).observe(lc, { characterData: !0 }),
          (sc = function () {
              lc.data = cc = !cc;
          })),
        (Ec = function (t) {
            (Pc.head || sc(), Pc.add(t));
        }));
}
var Ac = Ec,
    Cc = function (t) {
        try {
            return { error: !1, value: t() };
        } catch (t) {
            return { error: !0, value: t };
        }
    },
    Tc = pn.Promise,
    Rc = 'object' == typeof Deno && Deno && 'object' == typeof Deno.version,
    Ic = !Rc && !Ou && 'object' == typeof window && 'object' == typeof document,
    Nc = pn,
    Wc = Tc,
    Fc = xr,
    zc = du,
    Hc = Yi,
    Yc = vr,
    Uc = Ic,
    Bc = Rc,
    Gc = er;
Wc && Wc.prototype;
var Vc = Yc('species'),
    qc = !1,
    Kc = Fc(Nc.PromiseRejectionEvent),
    Zc = zc('Promise', function () {
        var t = Hc(Wc),
            e = t !== String(Wc);
        if (!e && 66 === Gc) return !0;
        if (!Gc || Gc < 51 || !/native code/.test(t)) {
            var n = new Wc(function (t) {
                    t(1);
                }),
                r = function (t) {
                    t(
                        function () {},
                        function () {}
                    );
                };
            if ((((n.constructor = {})[Vc] = r), !(qc = n.then(function () {}) instanceof r)))
                return !0;
        }
        return !e && (Uc || Bc) && !Kc;
    }),
    Jc = { CONSTRUCTOR: Zc, REJECTION_EVENT: Kc, SUBCLASSING: qc },
    Qc = {},
    Xc = ei,
    tl = TypeError,
    el = function (t) {
        var e, n;
        ((this.promise = new t(function (t, r) {
            if (void 0 !== e || void 0 !== n) throw new tl('Bad Promise constructor');
            ((e = t), (n = r));
        })),
            (this.resolve = Xc(e)),
            (this.reject = Xc(n)));
    };
Qc.f = function (t) {
    return new el(t);
};
var nl,
    rl,
    il,
    ol = xu,
    al = Ou,
    ul = pn,
    sl = Fr,
    cl = No,
    ll = Pu,
    fl = Tu,
    hl = Yu,
    dl = ei,
    pl = xr,
    vl = _r,
    yl = Gu,
    ml = function (t, e) {
        var n,
            r = ps(t).constructor;
        return void 0 === r || ys((n = ps(r)[ms])) ? e : vs(n);
    },
    gl = ac.set,
    wl = Ac,
    bl = function (t, e) {
        try {
            1 === arguments.length ? console.error(t) : console.error(t, e);
        } catch (t) {}
    },
    xl = Cc,
    Ol = dc,
    kl = vo,
    Sl = Tc,
    jl = Qc,
    _l = 'Promise',
    Ml = Jc.CONSTRUCTOR,
    Dl = Jc.REJECTION_EVENT,
    $l = Jc.SUBCLASSING,
    El = kl.getterFor(_l),
    Pl = kl.set,
    Ll = Sl && Sl.prototype,
    Al = Sl,
    Cl = Ll,
    Tl = ul.TypeError,
    Rl = ul.document,
    Il = ul.process,
    Nl = jl.f,
    Wl = Nl,
    Fl = !!(Rl && Rl.createEvent && ul.dispatchEvent),
    zl = 'unhandledrejection',
    Hl = function (t) {
        var e;
        return !(!vl(t) || !pl((e = t.then))) && e;
    },
    Yl = function (t, e) {
        var n,
            r,
            i,
            o = e.value,
            a = 1 === e.state,
            u = a ? t.ok : t.fail,
            s = t.resolve,
            c = t.reject,
            l = t.domain;
        try {
            u
                ? (a || (2 === e.rejection && ql(e), (e.rejection = 1)),
                  !0 === u ? (n = o) : (l && l.enter(), (n = u(o)), l && (l.exit(), (i = !0))),
                  n === t.promise
                      ? c(new Tl('Promise-chain cycle'))
                      : (r = Hl(n))
                        ? sl(r, n, s, c)
                        : s(n))
                : c(o);
        } catch (t) {
            (l && !i && l.exit(), c(t));
        }
    },
    Ul = function (t, e) {
        t.notified ||
            ((t.notified = !0),
            wl(function () {
                for (var n, r = t.reactions; (n = r.get()); ) Yl(n, t);
                ((t.notified = !1), e && !t.rejection && Gl(t));
            }));
    },
    Bl = function (t, e, n) {
        var r, i;
        (Fl
            ? (((r = Rl.createEvent('Event')).promise = e),
              (r.reason = n),
              r.initEvent(t, !1, !0),
              ul.dispatchEvent(r))
            : (r = { promise: e, reason: n }),
            !Dl && (i = ul['on' + t]) ? i(r) : t === zl && bl('Unhandled promise rejection', n));
    },
    Gl = function (t) {
        sl(gl, ul, function () {
            var e,
                n = t.facade,
                r = t.value;
            if (
                Vl(t) &&
                ((e = xl(function () {
                    al ? Il.emit('unhandledRejection', r, n) : Bl(zl, n, r);
                })),
                (t.rejection = al || Vl(t) ? 2 : 1),
                e.error)
            )
                throw e.value;
        });
    },
    Vl = function (t) {
        return 1 !== t.rejection && !t.parent;
    },
    ql = function (t) {
        sl(gl, ul, function () {
            var e = t.facade;
            al ? Il.emit('rejectionHandled', e) : Bl('rejectionhandled', e, t.value);
        });
    },
    Kl = function (t, e, n) {
        return function (r) {
            t(e, r, n);
        };
    },
    Zl = function (t, e, n) {
        t.done || ((t.done = !0), n && (t = n), (t.value = e), (t.state = 2), Ul(t, !0));
    },
    Jl = function (t, e, n) {
        if (!t.done) {
            ((t.done = !0), n && (t = n));
            try {
                if (t.facade === e) throw new Tl("Promise can't be resolved itself");
                var r = Hl(e);
                r
                    ? wl(function () {
                          var n = { done: !1 };
                          try {
                              sl(r, e, Kl(Jl, n, t), Kl(Zl, n, t));
                          } catch (e) {
                              Zl(n, e, t);
                          }
                      })
                    : ((t.value = e), (t.state = 1), Ul(t, !1));
            } catch (e) {
                Zl({ done: !1 }, e, t);
            }
        }
    };
if (
    Ml &&
    ((Cl = (Al = function (t) {
        (yl(this, Cl), dl(t), sl(nl, this));
        var e = El(this);
        try {
            t(Kl(Jl, e), Kl(Zl, e));
        } catch (t) {
            Zl(e, t);
        }
    }).prototype),
    ((nl = function (t) {
        Pl(this, {
            type: _l,
            done: !1,
            notified: !1,
            parent: !1,
            reactions: new Ol(),
            rejection: !1,
            state: 0,
            value: void 0,
        });
    }).prototype = cl(Cl, 'then', function (t, e) {
        var n = El(this),
            r = Nl(ml(this, Al));
        return (
            (n.parent = !0),
            (r.ok = !pl(t) || t),
            (r.fail = pl(e) && e),
            (r.domain = al ? Il.domain : void 0),
            0 === n.state
                ? n.reactions.add(r)
                : wl(function () {
                      Yl(r, n);
                  }),
            r.promise
        );
    })),
    (rl = function () {
        var t = new nl(),
            e = El(t);
        ((this.promise = t), (this.resolve = Kl(Jl, e)), (this.reject = Kl(Zl, e)));
    }),
    (jl.f = Nl =
        function (t) {
            return t === Al || undefined === t ? new rl(t) : Wl(t);
        }),
    pl(Sl) && Ll !== Object.prototype)
) {
    ((il = Ll.then),
        $l ||
            cl(
                Ll,
                'then',
                function (t, e) {
                    var n = this;
                    return new Al(function (t, e) {
                        sl(il, n, t, e);
                    }).then(t, e);
                },
                { unsafe: !0 }
            ));
    try {
        delete Ll.constructor;
    } catch (t) {}
    ll && ll(Ll, Cl);
}
(ol({ global: !0, constructor: !0, wrap: !0, forced: Ml }, { Promise: Al }),
    fl(Al, _l, !1),
    hl(_l));
var Ql = {},
    Xl = Ql,
    tf = vr('iterator'),
    ef = Array.prototype,
    nf = function (t) {
        return void 0 !== t && (Xl.Array === t || ef[tf] === t);
    },
    rf = Ko,
    of = ii,
    af = An,
    uf = Ql,
    sf = vr('iterator'),
    cf = function (t) {
        if (!af(t)) return of(t, sf) || of(t, '@@iterator') || uf[rf(t)];
    },
    lf = Fr,
    ff = ei,
    hf = Ir,
    df = Jr,
    pf = cf,
    vf = TypeError,
    yf = function (t, e) {
        var n = arguments.length < 2 ? pf(t) : e;
        if (ff(n)) return hf(lf(n, t));
        throw new vf(df(t) + ' is not iterable');
    },
    mf = Fr,
    gf = Ir,
    wf = ii,
    bf = function (t, e, n) {
        var r, i;
        gf(t);
        try {
            if (!(r = wf(t, 'return'))) {
                if ('throw' === e) throw n;
                return n;
            }
            r = mf(r, t);
        } catch (t) {
            ((i = !0), (r = t));
        }
        if ('throw' === e) throw n;
        if (i) throw r;
        return (gf(r), n);
    },
    xf = $s,
    Of = Fr,
    kf = Ir,
    Sf = Jr,
    jf = nf,
    _f = Aa,
    Mf = Ur,
    Df = yf,
    $f = cf,
    Ef = bf,
    Pf = TypeError,
    Lf = function (t, e) {
        ((this.stopped = t), (this.result = e));
    },
    Af = Lf.prototype,
    Cf = function (t, e, n) {
        var r,
            i,
            o,
            a,
            u,
            s,
            c,
            l = n && n.that,
            f = !(!n || !n.AS_ENTRIES),
            h = !(!n || !n.IS_RECORD),
            d = !(!n || !n.IS_ITERATOR),
            p = !(!n || !n.INTERRUPTED),
            v = xf(e, l),
            y = function (t) {
                return (r && Ef(r, 'normal', t), new Lf(!0, t));
            },
            m = function (t) {
                return f ? (kf(t), p ? v(t[0], t[1], y) : v(t[0], t[1])) : p ? v(t, y) : v(t);
            };
        if (h) r = t.iterator;
        else if (d) r = t;
        else {
            if (!(i = $f(t))) throw new Pf(Sf(t) + ' is not iterable');
            if (jf(i)) {
                for (o = 0, a = _f(t); a > o; o++) if ((u = m(t[o])) && Mf(Af, u)) return u;
                return new Lf(!1);
            }
            r = Df(t, i);
        }
        for (s = h ? t.next : r.next; !(c = Of(s, r)).done; ) {
            try {
                u = m(c.value);
            } catch (t) {
                Ef(r, 'throw', t);
            }
            if ('object' == typeof u && u && Mf(Af, u)) return u;
        }
        return new Lf(!1);
    },
    Tf = vr('iterator'),
    Rf = !1;
try {
    var If = 0,
        Nf = {
            next: function () {
                return { done: !!If++ };
            },
            return: function () {
                Rf = !0;
            },
        };
    ((Nf[Tf] = function () {
        return this;
    }),
        Array.from(Nf, function () {
            throw 2;
        }));
} catch (t) {}
var Wf = function (t, e) {
        try {
            if (!e && !Rf) return !1;
        } catch (t) {
            return !1;
        }
        var n = !1;
        try {
            var r = {};
            ((r[Tf] = function () {
                return {
                    next: function () {
                        return { done: (n = !0) };
                    },
                };
            }),
                t(r));
        } catch (t) {}
        return n;
    },
    Ff = Tc,
    zf =
        Jc.CONSTRUCTOR ||
        !Wf(function (t) {
            Ff.all(t).then(void 0, function () {});
        }),
    Hf = Fr,
    Yf = ei,
    Uf = Qc,
    Bf = Cc,
    Gf = Cf;
xu(
    { target: 'Promise', stat: !0, forced: zf },
    {
        all: function (t) {
            var e = this,
                n = Uf.f(e),
                r = n.resolve,
                i = n.reject,
                o = Bf(function () {
                    var n = Yf(e.resolve),
                        o = [],
                        a = 0,
                        u = 1;
                    (Gf(t, function (t) {
                        var s = a++,
                            c = !1;
                        (u++,
                            Hf(n, e, t).then(function (t) {
                                c || ((c = !0), (o[s] = t), --u || r(o));
                            }, i));
                    }),
                        --u || r(o));
                });
            return (o.error && i(o.value), n.promise);
        },
    }
);
var Vf = xu,
    qf = Jc.CONSTRUCTOR,
    Kf = Tc,
    Zf = Yr,
    Jf = xr,
    Qf = No,
    Xf = Kf && Kf.prototype;
if (
    (Vf(
        { target: 'Promise', proto: !0, forced: qf, real: !0 },
        {
            catch: function (t) {
                return this.then(void 0, t);
            },
        }
    ),
    Jf(Kf))
) {
    var th = Zf('Promise').prototype.catch;
    Xf.catch !== th && Qf(Xf, 'catch', th, { unsafe: !0 });
}
var eh = Fr,
    nh = ei,
    rh = Qc,
    ih = Cc,
    oh = Cf;
xu(
    { target: 'Promise', stat: !0, forced: zf },
    {
        race: function (t) {
            var e = this,
                n = rh.f(e),
                r = n.reject,
                i = ih(function () {
                    var i = nh(e.resolve);
                    oh(t, function (t) {
                        eh(i, e, t).then(n.resolve, r);
                    });
                });
            return (i.error && r(i.value), n.promise);
        },
    }
);
var ah = Fr,
    uh = Qc;
xu(
    { target: 'Promise', stat: !0, forced: Jc.CONSTRUCTOR },
    {
        reject: function (t) {
            var e = uh.f(this);
            return (ah(e.reject, void 0, t), e.promise);
        },
    }
);
var sh = Ir,
    ch = _r,
    lh = Qc,
    fh = xu,
    hh = Jc.CONSTRUCTOR,
    dh = function (t, e) {
        if ((sh(t), ch(e) && e.constructor === t)) return e;
        var n = lh.f(t);
        return ((0, n.resolve)(e), n.promise);
    };
(Yr('Promise'),
    fh(
        { target: 'Promise', stat: !0, forced: hh },
        {
            resolve: function (t) {
                return dh(this, t);
            },
        }
    ));
var ph = {},
    vh = Ua,
    yh = Ba,
    mh =
        Object.keys ||
        function (t) {
            return vh(t, yh);
        },
    gh = kr,
    wh = Ar,
    bh = Or,
    xh = Ir,
    Oh = la,
    kh = mh;
ph.f =
    gh && !wh
        ? Object.defineProperties
        : function (t, e) {
              xh(t);
              for (var n, r = Oh(e), i = kh(e), o = i.length, a = 0; o > a; )
                  bh.f(t, (n = i[a++]), r[n]);
              return t;
          };
var Sh,
    jh = Ir,
    _h = ph,
    Mh = Ba,
    Dh = to,
    $h = Es,
    Eh = Er,
    Ph = 'prototype',
    Lh = 'script',
    Ah = Xi('IE_PROTO'),
    Ch = function () {},
    Th = function (t) {
        return '<' + Lh + '>' + t + '</' + Lh + '>';
    },
    Rh = function (t) {
        (t.write(Th('')), t.close());
        var e = t.parentWindow.Object;
        return ((t = null), e);
    },
    Ih = function () {
        try {
            Sh = new ActiveXObject('htmlfile');
        } catch (t) {}
        var t, e, n;
        Ih =
            'undefined' != typeof document
                ? document.domain && Sh
                    ? Rh(Sh)
                    : ((e = Eh('iframe')),
                      (n = 'java' + Lh + ':'),
                      (e.style.display = 'none'),
                      $h.appendChild(e),
                      (e.src = String(n)),
                      (t = e.contentWindow.document).open(),
                      t.write(Th('document.F=Object')),
                      t.close(),
                      t.F)
                : Rh(Sh);
        for (var r = Mh.length; r--; ) delete Ih[Ph][Mh[r]];
        return Ih();
    };
Dh[Ah] = !0;
var Nh =
        Object.create ||
        function (t, e) {
            var n;
            return (
                null !== t
                    ? ((Ch[Ph] = jh(t)), (n = new Ch()), (Ch[Ph] = null), (n[Ah] = t))
                    : (n = Ih()),
                void 0 === e ? n : _h.f(n, e)
            );
        },
    Wh = vr,
    Fh = Nh,
    zh = Or.f,
    Hh = Wh('unscopables'),
    Yh = Array.prototype;
void 0 === Yh[Hh] && zh(Yh, Hh, { configurable: !0, value: Fh(null) });
var Uh,
    Bh,
    Gh,
    Vh = function (t) {
        Yh[Hh][t] = !0;
    },
    qh = !_n(function () {
        function t() {}
        return ((t.prototype.constructor = null), Object.getPrototypeOf(new t()) !== t.prototype);
    }),
    Kh = Hn,
    Zh = xr,
    Jh = Wn,
    Qh = qh,
    Xh = Xi('IE_PROTO'),
    td = Object,
    ed = td.prototype,
    nd = Qh
        ? td.getPrototypeOf
        : function (t) {
              var e = Jh(t);
              if (Kh(e, Xh)) return e[Xh];
              var n = e.constructor;
              return Zh(n) && e instanceof n ? n.prototype : e instanceof td ? ed : null;
          },
    rd = _n,
    id = xr,
    od = _r,
    ad = nd,
    ud = No,
    sd = vr('iterator'),
    cd = !1;
[].keys &&
    ('next' in (Gh = [].keys()) ? (Bh = ad(ad(Gh))) !== Object.prototype && (Uh = Bh) : (cd = !0));
var ld =
    !od(Uh) ||
    rd(function () {
        var t = {};
        return Uh[sd].call(t) !== t;
    });
(ld && (Uh = {}),
    id(Uh[sd]) ||
        ud(Uh, sd, function () {
            return this;
        }));
var fd = { IteratorPrototype: Uh, BUGGY_SAFARI_ITERATORS: cd },
    hd = fd.IteratorPrototype,
    dd = Nh,
    pd = Vi,
    vd = Tu,
    yd = Ql,
    md = function () {
        return this;
    },
    gd = xu,
    wd = Fr,
    bd = xr,
    xd = function (t, e, n, r) {
        var i = e + ' Iterator';
        return ((t.prototype = dd(hd, { next: pd(+!r, n) })), vd(t, i, !1), (yd[i] = md), t);
    },
    Od = nd,
    kd = Pu,
    Sd = Tu,
    jd = Zi,
    _d = No,
    Md = Ql,
    Dd = Ri.PROPER,
    $d = Ri.CONFIGURABLE,
    Ed = fd.IteratorPrototype,
    Pd = fd.BUGGY_SAFARI_ITERATORS,
    Ld = vr('iterator'),
    Ad = 'keys',
    Cd = 'values',
    Td = 'entries',
    Rd = function () {
        return this;
    },
    Id = function (t, e, n, r, i, o, a) {
        xd(n, e, r);
        var u,
            s,
            c,
            l = function (t) {
                if (t === i && v) return v;
                if (!Pd && t && t in d) return d[t];
                switch (t) {
                    case Ad:
                    case Cd:
                    case Td:
                        return function () {
                            return new n(this, t);
                        };
                }
                return function () {
                    return new n(this);
                };
            },
            f = e + ' Iterator',
            h = !1,
            d = t.prototype,
            p = d[Ld] || d['@@iterator'] || (i && d[i]),
            v = (!Pd && p) || l(i),
            y = ('Array' === e && d.entries) || p;
        if (
            (y &&
                (u = Od(y.call(new t()))) !== Object.prototype &&
                u.next &&
                (Od(u) !== Ed && (kd ? kd(u, Ed) : bd(u[Ld]) || _d(u, Ld, Rd)), Sd(u, f, !0)),
            Dd &&
                i === Cd &&
                p &&
                p.name !== Cd &&
                ($d
                    ? jd(d, 'name', Cd)
                    : ((h = !0),
                      (v = function () {
                          return wd(p, this);
                      }))),
            i)
        )
            if (((s = { values: l(Cd), keys: o ? v : l(Ad), entries: l(Td) }), a))
                for (c in s) (Pd || h || !(c in d)) && _d(d, c, s[c]);
            else gd({ target: e, proto: !0, forced: Pd || h }, s);
        return (d[Ld] !== v && _d(d, Ld, v, { name: i }), (Md[e] = v), s);
    },
    Nd = function (t, e) {
        return { value: t, done: e };
    },
    Wd = la,
    Fd = Vh,
    zd = Ql,
    Hd = vo,
    Yd = Or.f,
    Ud = Id,
    Bd = Nd,
    Gd = kr,
    Vd = 'Array Iterator',
    qd = Hd.set,
    Kd = Hd.getterFor(Vd),
    Zd = Ud(
        Array,
        'Array',
        function (t, e) {
            qd(this, { type: Vd, target: Wd(t), index: 0, kind: e });
        },
        function () {
            var t = Kd(this),
                e = t.target,
                n = t.index++;
            if (!e || n >= e.length) return ((t.target = void 0), Bd(void 0, !0));
            switch (t.kind) {
                case 'keys':
                    return Bd(n, !1);
                case 'values':
                    return Bd(e[n], !1);
            }
            return Bd([n, e[n]], !1);
        },
        'values'
    ),
    Jd = (zd.Arguments = zd.Array);
if ((Fd('keys'), Fd('values'), Fd('entries'), Gd && 'values' !== Jd.name))
    try {
        Yd(Jd, 'name', { value: 'values' });
    } catch (t) {}
var Qd = Fr,
    Xd = ei,
    tp = Qc,
    ep = Cc,
    np = Cf;
xu(
    { target: 'Promise', stat: !0, forced: zf },
    {
        allSettled: function (t) {
            var e = this,
                n = tp.f(e),
                r = n.resolve,
                i = n.reject,
                o = ep(function () {
                    var n = Xd(e.resolve),
                        i = [],
                        o = 0,
                        a = 1;
                    (np(t, function (t) {
                        var u = o++,
                            s = !1;
                        (a++,
                            Qd(n, e, t).then(
                                function (t) {
                                    s ||
                                        ((s = !0),
                                        (i[u] = { status: 'fulfilled', value: t }),
                                        --a || r(i));
                                },
                                function (t) {
                                    s ||
                                        ((s = !0),
                                        (i[u] = { status: 'rejected', reason: t }),
                                        --a || r(i));
                                }
                            ));
                    }),
                        --a || r(i));
                });
            return (o.error && i(o.value), n.promise);
        },
    }
);
var rp = Ko,
    ip = String,
    op = function (t) {
        if ('Symbol' === rp(t)) throw new TypeError('Cannot convert a Symbol value to a string');
        return ip(t);
    },
    ap = Ln,
    up = Sa,
    sp = op,
    cp = Rn,
    lp = ap(''.charAt),
    fp = ap(''.charCodeAt),
    hp = ap(''.slice),
    dp = function (t) {
        return function (e, n) {
            var r,
                i,
                o = sp(cp(e)),
                a = up(n),
                u = o.length;
            return a < 0 || a >= u
                ? t
                    ? ''
                    : void 0
                : (r = fp(o, a)) < 55296 ||
                    r > 56319 ||
                    a + 1 === u ||
                    (i = fp(o, a + 1)) < 56320 ||
                    i > 57343
                  ? t
                      ? lp(o, a)
                      : r
                  : t
                    ? hp(o, a, a + 2)
                    : i - 56320 + ((r - 55296) << 10) + 65536;
        };
    },
    pp = { codeAt: dp(!1), charAt: dp(!0) },
    vp = pp.charAt,
    yp = op,
    mp = vo,
    gp = Id,
    wp = Nd,
    bp = 'String Iterator',
    xp = mp.set,
    Op = mp.getterFor(bp);
gp(
    String,
    'String',
    function (t) {
        xp(this, { type: bp, string: yp(t), index: 0 });
    },
    function () {
        var t,
            e = Op(this),
            n = e.string,
            r = e.index;
        return r >= n.length ? wp(void 0, !0) : ((t = vp(n, r)), (e.index += t.length), wp(t, !1));
    }
);
var kp = {
        CSSRuleList: 0,
        CSSStyleDeclaration: 0,
        CSSValueList: 0,
        ClientRectList: 0,
        DOMRectList: 0,
        DOMStringList: 0,
        DOMTokenList: 1,
        DataTransferItemList: 0,
        FileList: 0,
        HTMLAllCollection: 0,
        HTMLCollection: 0,
        HTMLFormElement: 0,
        HTMLSelectElement: 0,
        MediaList: 0,
        MimeTypeArray: 0,
        NamedNodeMap: 0,
        NodeList: 1,
        PaintRequestList: 0,
        Plugin: 0,
        PluginArray: 0,
        SVGLengthList: 0,
        SVGNumberList: 0,
        SVGPathSegList: 0,
        SVGPointList: 0,
        SVGStringList: 0,
        SVGTransformList: 0,
        SourceBufferList: 0,
        StyleSheetList: 0,
        TextTrackCueList: 0,
        TextTrackList: 0,
        TouchList: 0,
    },
    Sp = Er('span').classList,
    jp = Sp && Sp.constructor && Sp.constructor.prototype,
    _p = jp === Object.prototype ? void 0 : jp,
    Mp = pn,
    Dp = kp,
    $p = _p,
    Ep = Zd,
    Pp = Zi,
    Lp = Tu,
    Ap = vr('iterator'),
    Cp = Ep.values,
    Tp = function (t, e) {
        if (t) {
            if (t[Ap] !== Cp)
                try {
                    Pp(t, Ap, Cp);
                } catch (e) {
                    t[Ap] = Cp;
                }
            if ((Lp(t, e, !0), Dp[e]))
                for (var n in Ep)
                    if (t[n] !== Ep[n])
                        try {
                            Pp(t, n, Ep[n]);
                        } catch (e) {
                            t[n] = Ep[n];
                        }
        }
    };
for (var Rp in Dp) Tp(Mp[Rp] && Mp[Rp].prototype, Rp);
Tp($p, 'DOMTokenList');
var Ip = Wn,
    Np = Da,
    Wp = Aa,
    Fp = function (t) {
        for (
            var e = Ip(this),
                n = Wp(e),
                r = arguments.length,
                i = Np(r > 1 ? arguments[1] : void 0, n),
                o = r > 2 ? arguments[2] : void 0,
                a = void 0 === o ? n : Np(o, n);
            a > i;

        )
            e[i++] = t;
        return e;
    },
    zp = Vh;
(xu({ target: 'Array', proto: !0 }, { fill: Fp }), zp('fill'));
var Hp = Ho,
    Yp =
        Array.isArray ||
        function (t) {
            return 'Array' === Hp(t);
        },
    Up = gi,
    Bp = Or,
    Gp = Vi,
    Vp = function (t, e, n) {
        var r = Up(e);
        r in t ? Bp.f(t, r, Gp(0, n)) : (t[r] = n);
    },
    qp = _n,
    Kp = er,
    Zp = vr('species'),
    Jp = function (t) {
        return (
            Kp >= 51 ||
            !qp(function () {
                var e = [];
                return (
                    ((e.constructor = {})[Zp] = function () {
                        return { foo: 1 };
                    }),
                    1 !== e[t](Boolean).foo
                );
            })
        );
    },
    Qp = xu,
    Xp = Yp,
    tv = ls,
    ev = _r,
    nv = Da,
    rv = Aa,
    iv = la,
    ov = Vp,
    av = vr,
    uv = Ps,
    sv = Jp('slice'),
    cv = av('species'),
    lv = Array,
    fv = Math.max;
function hv(t, e, n, r) {
    return new (n || (n = Promise))(function (i, o) {
        function a(t) {
            try {
                s(r.next(t));
            } catch (t) {
                o(t);
            }
        }
        function u(t) {
            try {
                s(r.throw(t));
            } catch (t) {
                o(t);
            }
        }
        function s(t) {
            var e;
            t.done
                ? i(t.value)
                : ((e = t.value),
                  e instanceof n
                      ? e
                      : new n(function (t) {
                            t(e);
                        })).then(a, u);
        }
        s((r = r.apply(t, e || [])).next());
    });
}
function dv(t, e, n, r) {
    if ('a' === n && !r) throw new TypeError('Private accessor was defined without a getter');
    if ('function' == typeof e ? t !== e || !r : !e.has(t))
        throw new TypeError(
            'Cannot read private member from an object whose class did not declare it'
        );
    return 'm' === n ? r : 'a' === n ? r.call(t) : r ? r.value : e.get(t);
}
Qp(
    { target: 'Array', proto: !0, forced: !sv },
    {
        slice: function (t, e) {
            var n,
                r,
                i,
                o = iv(this),
                a = rv(o),
                u = nv(t, a),
                s = nv(void 0 === e ? a : e, a);
            if (
                Xp(o) &&
                ((n = o.constructor),
                ((tv(n) && (n === lv || Xp(n.prototype))) || (ev(n) && null === (n = n[cv]))) &&
                    (n = void 0),
                n === lv || void 0 === n)
            )
                return uv(o, u, s);
            for (r = new (void 0 === n ? lv : n)(fv(s - u, 0)), i = 0; u < s; u++, i++)
                u in o && ov(r, i, o[u]);
            return ((r.length = i), r);
        },
    }
);
var pv = { exports: {} };
!(function (t) {
    var e = Object.prototype.hasOwnProperty,
        n = '~';
    function r() {}
    function i(t, e, n) {
        ((this.fn = t), (this.context = e), (this.once = n || !1));
    }
    function o(t, e, r, o, a) {
        if ('function' != typeof r) throw new TypeError('The listener must be a function');
        var u = new i(r, o || t, a),
            s = n ? n + e : e;
        return (
            t._events[s]
                ? t._events[s].fn
                    ? (t._events[s] = [t._events[s], u])
                    : t._events[s].push(u)
                : ((t._events[s] = u), t._eventsCount++),
            t
        );
    }
    function a(t, e) {
        0 == --t._eventsCount ? (t._events = new r()) : delete t._events[e];
    }
    function u() {
        ((this._events = new r()), (this._eventsCount = 0));
    }
    (Object.create && ((r.prototype = Object.create(null)), new r().__proto__ || (n = !1)),
        (u.prototype.eventNames = function () {
            var t,
                r,
                i = [];
            if (0 === this._eventsCount) return i;
            for (r in (t = this._events)) e.call(t, r) && i.push(n ? r.slice(1) : r);
            return Object.getOwnPropertySymbols ? i.concat(Object.getOwnPropertySymbols(t)) : i;
        }),
        (u.prototype.listeners = function (t) {
            var e = n ? n + t : t,
                r = this._events[e];
            if (!r) return [];
            if (r.fn) return [r.fn];
            for (var i = 0, o = r.length, a = new Array(o); i < o; i++) a[i] = r[i].fn;
            return a;
        }),
        (u.prototype.listenerCount = function (t) {
            var e = n ? n + t : t,
                r = this._events[e];
            return r ? (r.fn ? 1 : r.length) : 0;
        }),
        (u.prototype.emit = function (t, e, r, i, o, a) {
            var u = n ? n + t : t;
            if (!this._events[u]) return !1;
            var s,
                c,
                l = this._events[u],
                f = arguments.length;
            if (l.fn) {
                switch ((l.once && this.removeListener(t, l.fn, void 0, !0), f)) {
                    case 1:
                        return (l.fn.call(l.context), !0);
                    case 2:
                        return (l.fn.call(l.context, e), !0);
                    case 3:
                        return (l.fn.call(l.context, e, r), !0);
                    case 4:
                        return (l.fn.call(l.context, e, r, i), !0);
                    case 5:
                        return (l.fn.call(l.context, e, r, i, o), !0);
                    case 6:
                        return (l.fn.call(l.context, e, r, i, o, a), !0);
                }
                for (c = 1, s = new Array(f - 1); c < f; c++) s[c - 1] = arguments[c];
                l.fn.apply(l.context, s);
            } else {
                var h,
                    d = l.length;
                for (c = 0; c < d; c++)
                    switch ((l[c].once && this.removeListener(t, l[c].fn, void 0, !0), f)) {
                        case 1:
                            l[c].fn.call(l[c].context);
                            break;
                        case 2:
                            l[c].fn.call(l[c].context, e);
                            break;
                        case 3:
                            l[c].fn.call(l[c].context, e, r);
                            break;
                        case 4:
                            l[c].fn.call(l[c].context, e, r, i);
                            break;
                        default:
                            if (!s)
                                for (h = 1, s = new Array(f - 1); h < f; h++)
                                    s[h - 1] = arguments[h];
                            l[c].fn.apply(l[c].context, s);
                    }
            }
            return !0;
        }),
        (u.prototype.on = function (t, e, n) {
            return o(this, t, e, n, !1);
        }),
        (u.prototype.once = function (t, e, n) {
            return o(this, t, e, n, !0);
        }),
        (u.prototype.removeListener = function (t, e, r, i) {
            var o = n ? n + t : t;
            if (!this._events[o]) return this;
            if (!e) return (a(this, o), this);
            var u = this._events[o];
            if (u.fn) u.fn !== e || (i && !u.once) || (r && u.context !== r) || a(this, o);
            else {
                for (var s = 0, c = [], l = u.length; s < l; s++)
                    (u[s].fn !== e || (i && !u[s].once) || (r && u[s].context !== r)) &&
                        c.push(u[s]);
                c.length ? (this._events[o] = 1 === c.length ? c[0] : c) : a(this, o);
            }
            return this;
        }),
        (u.prototype.removeAllListeners = function (t) {
            var e;
            return (
                t
                    ? ((e = n ? n + t : t), this._events[e] && a(this, e))
                    : ((this._events = new r()), (this._eventsCount = 0)),
                this
            );
        }),
        (u.prototype.off = u.prototype.removeListener),
        (u.prototype.addListener = u.prototype.on),
        (u.prefixed = n),
        (u.EventEmitter = u),
        (t.exports = u));
})(pv);
var vv = hn(pv.exports),
    yv = Array.isArray;
function mv() {
    if (!arguments.length) return [];
    var t = arguments[0];
    return yv(t) ? t : [t];
}
var gv = Yp,
    wv = ls,
    bv = _r,
    xv = vr('species'),
    Ov = Array,
    kv = function (t) {
        var e;
        return (
            gv(t) &&
                ((e = t.constructor),
                ((wv(e) && (e === Ov || gv(e.prototype))) || (bv(e) && null === (e = e[xv]))) &&
                    (e = void 0)),
            void 0 === e ? Ov : e
        );
    },
    Sv = function (t, e) {
        return new (kv(t))(0 === e ? 0 : e);
    },
    jv = $s,
    _v = ua,
    Mv = Wn,
    Dv = Aa,
    $v = Sv,
    Ev = Ln([].push),
    Pv = function (t) {
        var e = 1 === t,
            n = 2 === t,
            r = 3 === t,
            i = 4 === t,
            o = 6 === t,
            a = 7 === t,
            u = 5 === t || o;
        return function (s, c, l, f) {
            for (
                var h,
                    d,
                    p = Mv(s),
                    v = _v(p),
                    y = Dv(v),
                    m = jv(c, l),
                    g = 0,
                    w = f || $v,
                    b = e ? w(s, y) : n || a ? w(s, 0) : void 0;
                y > g;
                g++
            )
                if ((u || g in v) && ((d = m((h = v[g]), g, p)), t))
                    if (e) b[g] = d;
                    else if (d)
                        switch (t) {
                            case 3:
                                return !0;
                            case 5:
                                return h;
                            case 6:
                                return g;
                            case 2:
                                Ev(b, h);
                        }
                    else
                        switch (t) {
                            case 4:
                                return !1;
                            case 7:
                                Ev(b, h);
                        }
            return o ? -1 : r || i ? i : b;
        };
    },
    Lv = {
        forEach: Pv(0),
        map: Pv(1),
        filter: Pv(2),
        some: Pv(3),
        every: Pv(4),
        find: Pv(5),
        findIndex: Pv(6),
        filterReject: Pv(7),
    },
    Av = Lv.map;
xu(
    { target: 'Array', proto: !0, forced: !Jp('map') },
    {
        map: function (t) {
            return Av(this, t, arguments.length > 1 ? arguments[1] : void 0);
        },
    }
);
var Cv = kr,
    Tv = Ln,
    Rv = Fr,
    Iv = _n,
    Nv = mh,
    Wv = qa,
    Fv = Xo,
    zv = Wn,
    Hv = ua,
    Yv = Object.assign,
    Uv = Object.defineProperty,
    Bv = Tv([].concat),
    Gv =
        !Yv ||
        Iv(function () {
            if (
                Cv &&
                1 !==
                    Yv(
                        { b: 1 },
                        Yv(
                            Uv({}, 'a', {
                                enumerable: !0,
                                get: function () {
                                    Uv(this, 'b', { value: 3, enumerable: !1 });
                                },
                            }),
                            { b: 2 }
                        )
                    ).b
            )
                return !0;
            var t = {},
                e = {},
                n = Symbol('assign detection'),
                r = 'abcdefghijklmnopqrst';
            return (
                (t[n] = 7),
                r.split('').forEach(function (t) {
                    e[t] = t;
                }),
                7 !== Yv({}, t)[n] || Nv(Yv({}, e)).join('') !== r
            );
        })
            ? function (t, e) {
                  for (var n = zv(t), r = arguments.length, i = 1, o = Wv.f, a = Fv.f; r > i; )
                      for (
                          var u,
                              s = Hv(arguments[i++]),
                              c = o ? Bv(Nv(s), o(s)) : Nv(s),
                              l = c.length,
                              f = 0;
                          l > f;

                      )
                          ((u = c[f++]), (Cv && !Rv(a, s, u)) || (n[u] = s[u]));
                  return n;
              }
            : Yv,
    Vv = Gv;
xu({ target: 'Object', stat: !0, arity: 2, forced: Object.assign !== Vv }, { assign: Vv });
var qv = { exports: {} },
    Kv = {},
    Zv = Da,
    Jv = Aa,
    Qv = Vp,
    Xv = Array,
    ty = Math.max,
    ey = function (t, e, n) {
        for (
            var r = Jv(t),
                i = Zv(e, r),
                o = Zv(void 0 === n ? r : n, r),
                a = Xv(ty(o - i, 0)),
                u = 0;
            i < o;
            i++, u++
        )
            Qv(a, u, t[i]);
        return ((a.length = u), a);
    },
    ny = Ho,
    ry = la,
    iy = ba.f,
    oy = ey,
    ay =
        'object' == typeof window && window && Object.getOwnPropertyNames
            ? Object.getOwnPropertyNames(window)
            : [];
Kv.f = function (t) {
    return ay && 'Window' === ny(t)
        ? (function (t) {
              try {
                  return iy(t);
              } catch (t) {
                  return oy(ay);
              }
          })(t)
        : iy(ry(t));
};
var uy = _n(function () {
        if ('function' == typeof ArrayBuffer) {
            var t = new ArrayBuffer(8);
            Object.isExtensible(t) && Object.defineProperty(t, 'a', { value: 8 });
        }
    }),
    sy = _n,
    cy = _r,
    ly = Ho,
    fy = uy,
    hy = Object.isExtensible,
    dy =
        sy(function () {
            hy(1);
        }) || fy
            ? function (t) {
                  return !!cy(t) && (!fy || 'ArrayBuffer' !== ly(t)) && (!hy || hy(t));
              }
            : hy,
    py = !_n(function () {
        return Object.isExtensible(Object.preventExtensions({}));
    }),
    vy = xu,
    yy = Ln,
    my = to,
    gy = _r,
    wy = Hn,
    by = Or.f,
    xy = ba,
    Oy = Kv,
    ky = dy,
    Sy = py,
    jy = !1,
    _y = Vn('meta'),
    My = 0,
    Dy = function (t) {
        by(t, _y, { value: { objectID: 'O' + My++, weakData: {} } });
    },
    $y = (qv.exports = {
        enable: function () {
            (($y.enable = function () {}), (jy = !0));
            var t = xy.f,
                e = yy([].splice),
                n = {};
            ((n[_y] = 1),
                t(n).length &&
                    ((xy.f = function (n) {
                        for (var r = t(n), i = 0, o = r.length; i < o; i++)
                            if (r[i] === _y) {
                                e(r, i, 1);
                                break;
                            }
                        return r;
                    }),
                    vy({ target: 'Object', stat: !0, forced: !0 }, { getOwnPropertyNames: Oy.f })));
        },
        fastKey: function (t, e) {
            if (!gy(t)) return 'symbol' == typeof t ? t : ('string' == typeof t ? 'S' : 'P') + t;
            if (!wy(t, _y)) {
                if (!ky(t)) return 'F';
                if (!e) return 'E';
                Dy(t);
            }
            return t[_y].objectID;
        },
        getWeakData: function (t, e) {
            if (!wy(t, _y)) {
                if (!ky(t)) return !0;
                if (!e) return !1;
                Dy(t);
            }
            return t[_y].weakData;
        },
        onFreeze: function (t) {
            return (Sy && jy && ky(t) && !wy(t, _y) && Dy(t), t);
        },
    });
my[_y] = !0;
var Ey = qv.exports,
    Py = xr,
    Ly = _r,
    Ay = Pu,
    Cy = xu,
    Ty = pn,
    Ry = Ln,
    Iy = du,
    Ny = No,
    Wy = Ey,
    Fy = Cf,
    zy = Gu,
    Hy = xr,
    Yy = An,
    Uy = _r,
    By = _n,
    Gy = Wf,
    Vy = Tu,
    qy = function (t, e, n) {
        var r, i;
        return (
            Ay &&
                Py((r = e.constructor)) &&
                r !== n &&
                Ly((i = r.prototype)) &&
                i !== n.prototype &&
                Ay(t, i),
            t
        );
    },
    Ky = function (t, e, n) {
        var r = -1 !== t.indexOf('Map'),
            i = -1 !== t.indexOf('Weak'),
            o = r ? 'set' : 'add',
            a = Ty[t],
            u = a && a.prototype,
            s = a,
            c = {},
            l = function (t) {
                var e = Ry(u[t]);
                Ny(
                    u,
                    t,
                    'add' === t
                        ? function (t) {
                              return (e(this, 0 === t ? 0 : t), this);
                          }
                        : 'delete' === t
                          ? function (t) {
                                return !(i && !Uy(t)) && e(this, 0 === t ? 0 : t);
                            }
                          : 'get' === t
                            ? function (t) {
                                  return i && !Uy(t) ? void 0 : e(this, 0 === t ? 0 : t);
                              }
                            : 'has' === t
                              ? function (t) {
                                    return !(i && !Uy(t)) && e(this, 0 === t ? 0 : t);
                                }
                              : function (t, n) {
                                    return (e(this, 0 === t ? 0 : t, n), this);
                                }
                );
            };
        if (
            Iy(
                t,
                !Hy(a) ||
                    !(
                        i ||
                        (u.forEach &&
                            !By(function () {
                                new a().entries().next();
                            }))
                    )
            )
        )
            ((s = n.getConstructor(e, t, r, o)), Wy.enable());
        else if (Iy(t, !0)) {
            var f = new s(),
                h = f[o](i ? {} : -0, 1) !== f,
                d = By(function () {
                    f.has(1);
                }),
                p = Gy(function (t) {
                    new a(t);
                }),
                v =
                    !i &&
                    By(function () {
                        for (var t = new a(), e = 5; e--; ) t[o](e, e);
                        return !t.has(-0);
                    });
            (p ||
                (((s = e(function (t, e) {
                    zy(t, u);
                    var n = qy(new a(), t, s);
                    return (Yy(e) || Fy(e, n[o], { that: n, AS_ENTRIES: r }), n);
                })).prototype = u),
                (u.constructor = s)),
                (d || v) && (l('delete'), l('has'), r && l('get')),
                (v || h) && l(o),
                i && u.clear && delete u.clear);
        }
        return (
            (c[t] = s),
            Cy({ global: !0, constructor: !0, forced: s !== a }, c),
            Vy(s, t),
            i || n.setStrong(s, t, r),
            s
        );
    },
    Zy = No,
    Jy = function (t, e, n) {
        for (var r in e) Zy(t, r, e[r], n);
        return t;
    },
    Qy = Ln,
    Xy = Jy,
    tm = Ey.getWeakData,
    em = Gu,
    nm = Ir,
    rm = An,
    im = _r,
    om = Cf,
    am = Hn,
    um = vo.set,
    sm = vo.getterFor,
    cm = Lv.find,
    lm = Lv.findIndex,
    fm = Qy([].splice),
    hm = 0,
    dm = function (t) {
        return t.frozen || (t.frozen = new pm());
    },
    pm = function () {
        this.entries = [];
    },
    vm = function (t, e) {
        return cm(t.entries, function (t) {
            return t[0] === e;
        });
    };
pm.prototype = {
    get: function (t) {
        var e = vm(this, t);
        if (e) return e[1];
    },
    has: function (t) {
        return !!vm(this, t);
    },
    set: function (t, e) {
        var n = vm(this, t);
        n ? (n[1] = e) : this.entries.push([t, e]);
    },
    delete: function (t) {
        var e = lm(this.entries, function (e) {
            return e[0] === t;
        });
        return (~e && fm(this.entries, e, 1), !!~e);
    },
};
var ym,
    mm,
    gm = {
        getConstructor: function (t, e, n, r) {
            var i = t(function (t, i) {
                    (em(t, o),
                        um(t, { type: e, id: hm++, frozen: void 0 }),
                        rm(i) || om(i, t[r], { that: t, AS_ENTRIES: n }));
                }),
                o = i.prototype,
                a = sm(e),
                u = function (t, e, n) {
                    var r = a(t),
                        i = tm(nm(e), !0);
                    return (!0 === i ? dm(r).set(e, n) : (i[r.id] = n), t);
                };
            return (
                Xy(o, {
                    delete: function (t) {
                        var e = a(this);
                        if (!im(t)) return !1;
                        var n = tm(t);
                        return !0 === n ? dm(e).delete(t) : n && am(n, e.id) && delete n[e.id];
                    },
                    has: function (t) {
                        var e = a(this);
                        if (!im(t)) return !1;
                        var n = tm(t);
                        return !0 === n ? dm(e).has(t) : n && am(n, e.id);
                    },
                }),
                Xy(
                    o,
                    n
                        ? {
                              get: function (t) {
                                  var e = a(this);
                                  if (im(t)) {
                                      var n = tm(t);
                                      return !0 === n ? dm(e).get(t) : n ? n[e.id] : void 0;
                                  }
                              },
                              set: function (t, e) {
                                  return u(this, t, e);
                              },
                          }
                        : {
                              add: function (t) {
                                  return u(this, t, !0);
                              },
                          }
                ),
                i
            );
        },
    };
(Ky(
    'WeakSet',
    function (t) {
        return function () {
            return t(this, arguments.length ? arguments[0] : void 0);
        };
    },
    gm
),
    (function (t) {
        ((t[(t.SCROLL_NONE = 0)] = 'SCROLL_NONE'),
            (t[(t.SCROLL_BACKWARD = 1)] = 'SCROLL_BACKWARD'),
            (t[(t.SCROLL_FORWARD = 2)] = 'SCROLL_FORWARD'));
    })(ym || (ym = {})),
    (function (t) {
        ((t[(t.TOP = 0)] = 'TOP'),
            (t[(t.RIGHT = 1)] = 'RIGHT'),
            (t[(t.BOTTOM = 2)] = 'BOTTOM'),
            (t[(t.LEFT = 3)] = 'LEFT'));
    })(mm || (mm = {})));
var wm,
    bm,
    xm,
    Om = [0, 100],
    km = (function () {
        function t(e) {
            (nn(this, t),
                wm.add(this),
                (this.calendar = e),
                (this.maxDomainReached = !1),
                (this.minDomainReached = !1));
        }
        return (
            on(t, [
                {
                    key: 'loadNewDomains',
                    value: function (t) {
                        var e = this,
                            n =
                                arguments.length > 1 && void 0 !== arguments[1]
                                    ? arguments[1]
                                    : ym.SCROLL_NONE,
                            r = this.calendar.options.options,
                            i = this.calendar.templateCollection,
                            o = r.date.min ? i.get(r.domain.type).extractUnit(+r.date.min) : void 0,
                            a = r.date.max ? i.get(r.domain.type).extractUnit(+r.date.max) : void 0,
                            u = this.calendar.domainCollection;
                        return dv(this, wm, 'm', bm).call(this, t, o, a, n)
                            ? ym.SCROLL_NONE
                            : (n !== ym.SCROLL_NONE &&
                                  t.clamp(o, a).slice(r.range, n === ym.SCROLL_FORWARD),
                              u.merge(t, r.range, function (n, o) {
                                  var a = null;
                                  return (
                                      (a = t.at(o + 1)
                                          ? t.at(o + 1)
                                          : e.calendar.dateHelper
                                                .intervals(r.domain.type, n, 2)
                                                .pop()),
                                      i
                                          .get(r.subDomain.type)
                                          .mapping(n, a)
                                          .map(function (t) {
                                              return Object.assign(Object.assign({}, t), {
                                                  v: r.data.defaultValue,
                                              });
                                          })
                                  );
                              }),
                              dv(this, wm, 'm', xm).call(this, u.min, u.max, o, a),
                              n === ym.SCROLL_BACKWARD
                                  ? this.calendar.eventEmitter.emit('domainsLoaded', [u.min])
                                  : n === ym.SCROLL_FORWARD &&
                                    this.calendar.eventEmitter.emit('domainsLoaded', [u.max]),
                              n);
                    },
                },
                {
                    key: 'jumpTo',
                    value: function (t, e) {
                        var n = this.calendar,
                            r = n.domainCollection,
                            i = n.options,
                            o = new Date(r.min),
                            a = new Date(r.max);
                        return t < o
                            ? this.loadNewDomains(
                                  this.calendar.createDomainCollection(t, o, !1),
                                  ym.SCROLL_BACKWARD
                              )
                            : e
                              ? this.loadNewDomains(
                                    this.calendar.createDomainCollection(t, i.options.range),
                                    o < t ? ym.SCROLL_FORWARD : ym.SCROLL_BACKWARD
                                )
                              : t > a
                                ? this.loadNewDomains(
                                      this.calendar.createDomainCollection(a, t, !1),
                                      ym.SCROLL_FORWARD
                                  )
                                : ym.SCROLL_NONE;
                    },
                },
            ]),
            t
        );
    })();
((wm = new WeakSet()),
    (bm = function (t, e, n, r) {
        return (
            !!(n && t.max >= n && this.maxDomainReached && r === ym.SCROLL_FORWARD) ||
            !!(e && t.min <= e && this.minDomainReached && r === ym.SCROLL_BACKWARD)
        );
    }),
    (xm = function (t, e, n, r) {
        if (n) {
            var i = t <= n;
            (this.calendar.eventEmitter.emit(i ? 'minDateReached' : 'minDateNotReached'),
                (this.minDomainReached = i));
        }
        if (r) {
            var o = e >= r;
            (this.calendar.eventEmitter.emit(o ? 'maxDateReached' : 'maxDateNotReached'),
                (this.maxDomainReached = o));
        }
    }));
var Sm = TypeError,
    jm = xu,
    _m = _n,
    Mm = Yp,
    Dm = _r,
    $m = Wn,
    Em = Aa,
    Pm = function (t) {
        if (t > 9007199254740991) throw Sm('Maximum allowed index exceeded');
        return t;
    },
    Lm = Vp,
    Am = Sv,
    Cm = Jp,
    Tm = er,
    Rm = vr('isConcatSpreadable'),
    Im =
        Tm >= 51 ||
        !_m(function () {
            var t = [];
            return ((t[Rm] = !1), t.concat()[0] !== t);
        }),
    Nm = function (t) {
        if (!Dm(t)) return !1;
        var e = t[Rm];
        return void 0 !== e ? !!e : Mm(t);
    };
jm(
    { target: 'Array', proto: !0, arity: 1, forced: !Im || !Cm('concat') },
    {
        concat: function (t) {
            var e,
                n,
                r,
                i,
                o,
                a = $m(this),
                u = Am(a, 0),
                s = 0;
            for (e = -1, r = arguments.length; e < r; e++)
                if (Nm((o = -1 === e ? a : arguments[e])))
                    for (i = Em(o), Pm(s + i), n = 0; n < i; n++, s++) n in o && Lm(u, s, o[n]);
                else (Pm(s + 1), Lm(u, s++, o));
            return ((u.length = s), u);
        },
    }
);
var Wm = _n,
    Fm = function (t, e) {
        var n = [][t];
        return (
            !!n &&
            Wm(function () {
                n.call(
                    null,
                    e ||
                        function () {
                            return 1;
                        },
                    1
                );
            })
        );
    },
    zm = xu,
    Hm = ua,
    Ym = la,
    Um = Fm,
    Bm = Ln([].join);
zm(
    { target: 'Array', proto: !0, forced: Hm !== Object || !Um('join', ',') },
    {
        join: function (t) {
            return Bm(Ym(this), void 0 === t ? ',' : t);
        },
    }
);
var Gm = Nh,
    Vm = Nu,
    qm = Jy,
    Km = $s,
    Zm = Gu,
    Jm = An,
    Qm = Cf,
    Xm = Id,
    tg = Nd,
    eg = Yu,
    ng = kr,
    rg = Ey.fastKey,
    ig = vo.set,
    og = vo.getterFor,
    ag = {
        getConstructor: function (t, e, n, r) {
            var i = t(function (t, i) {
                    (Zm(t, o),
                        ig(t, { type: e, index: Gm(null), first: void 0, last: void 0, size: 0 }),
                        ng || (t.size = 0),
                        Jm(i) || Qm(i, t[r], { that: t, AS_ENTRIES: n }));
                }),
                o = i.prototype,
                a = og(e),
                u = function (t, e, n) {
                    var r,
                        i,
                        o = a(t),
                        u = s(t, e);
                    return (
                        u
                            ? (u.value = n)
                            : ((o.last = u =
                                  {
                                      index: (i = rg(e, !0)),
                                      key: e,
                                      value: n,
                                      previous: (r = o.last),
                                      next: void 0,
                                      removed: !1,
                                  }),
                              o.first || (o.first = u),
                              r && (r.next = u),
                              ng ? o.size++ : t.size++,
                              'F' !== i && (o.index[i] = u)),
                        t
                    );
                },
                s = function (t, e) {
                    var n,
                        r = a(t),
                        i = rg(e);
                    if ('F' !== i) return r.index[i];
                    for (n = r.first; n; n = n.next) if (n.key === e) return n;
                };
            return (
                qm(o, {
                    clear: function () {
                        for (var t = a(this), e = t.index, n = t.first; n; )
                            ((n.removed = !0),
                                n.previous && (n.previous = n.previous.next = void 0),
                                delete e[n.index],
                                (n = n.next));
                        ((t.first = t.last = void 0), ng ? (t.size = 0) : (this.size = 0));
                    },
                    delete: function (t) {
                        var e = this,
                            n = a(e),
                            r = s(e, t);
                        if (r) {
                            var i = r.next,
                                o = r.previous;
                            (delete n.index[r.index],
                                (r.removed = !0),
                                o && (o.next = i),
                                i && (i.previous = o),
                                n.first === r && (n.first = i),
                                n.last === r && (n.last = o),
                                ng ? n.size-- : e.size--);
                        }
                        return !!r;
                    },
                    forEach: function (t) {
                        for (
                            var e,
                                n = a(this),
                                r = Km(t, arguments.length > 1 ? arguments[1] : void 0);
                            (e = e ? e.next : n.first);

                        )
                            for (r(e.value, e.key, this); e && e.removed; ) e = e.previous;
                    },
                    has: function (t) {
                        return !!s(this, t);
                    },
                }),
                qm(
                    o,
                    n
                        ? {
                              get: function (t) {
                                  var e = s(this, t);
                                  return e && e.value;
                              },
                              set: function (t, e) {
                                  return u(this, 0 === t ? 0 : t, e);
                              },
                          }
                        : {
                              add: function (t) {
                                  return u(this, (t = 0 === t ? 0 : t), t);
                              },
                          }
                ),
                ng &&
                    Vm(o, 'size', {
                        configurable: !0,
                        get: function () {
                            return a(this).size;
                        },
                    }),
                i
            );
        },
        setStrong: function (t, e, n) {
            var r = e + ' Iterator',
                i = og(e),
                o = og(r);
            (Xm(
                t,
                e,
                function (t, e) {
                    ig(this, { type: r, target: t, state: i(t), kind: e, last: void 0 });
                },
                function () {
                    for (var t = o(this), e = t.kind, n = t.last; n && n.removed; ) n = n.previous;
                    return t.target && (t.last = n = n ? n.next : t.state.first)
                        ? tg('keys' === e ? n.key : 'values' === e ? n.value : [n.key, n.value], !1)
                        : ((t.target = void 0), tg(void 0, !0));
                },
                n ? 'entries' : 'values',
                !n,
                !0
            ),
                eg(e));
        },
    };
Ky(
    'Map',
    function (t) {
        return function () {
            return t(this, arguments.length ? arguments[0] : void 0);
        };
    },
    ag
);
var ug = Jr,
    sg = TypeError,
    cg = ey,
    lg = Math.floor,
    fg = function (t, e) {
        var n = t.length,
            r = lg(n / 2);
        return n < 8 ? hg(t, e) : dg(t, fg(cg(t, 0, r), e), fg(cg(t, r), e), e);
    },
    hg = function (t, e) {
        for (var n, r, i = t.length, o = 1; o < i; ) {
            for (r = o, n = t[o]; r && e(t[r - 1], n) > 0; ) t[r] = t[--r];
            r !== o++ && (t[r] = n);
        }
        return t;
    },
    dg = function (t, e, n, r) {
        for (var i = e.length, o = n.length, a = 0, u = 0; a < i || u < o; )
            t[a + u] =
                a < i && u < o ? (r(e[a], n[u]) <= 0 ? e[a++] : n[u++]) : a < i ? e[a++] : n[u++];
        return t;
    },
    pg = fg,
    vg = qn.match(/firefox\/(\d+)/i),
    yg = !!vg && +vg[1],
    mg = /MSIE|Trident/.test(qn),
    gg = qn.match(/AppleWebKit\/(\d+)\./),
    wg = !!gg && +gg[1],
    bg = xu,
    xg = Ln,
    Og = ei,
    kg = Wn,
    Sg = Aa,
    jg = function (t, e) {
        if (!delete t[e]) throw new sg('Cannot delete property ' + ug(e) + ' of ' + ug(t));
    },
    _g = op,
    Mg = _n,
    Dg = pg,
    $g = Fm,
    Eg = yg,
    Pg = mg,
    Lg = er,
    Ag = wg,
    Cg = [],
    Tg = xg(Cg.sort),
    Rg = xg(Cg.push),
    Ig = Mg(function () {
        Cg.sort(void 0);
    }),
    Ng = Mg(function () {
        Cg.sort(null);
    }),
    Wg = $g('sort'),
    Fg = !Mg(function () {
        if (Lg) return Lg < 70;
        if (!(Eg && Eg > 3)) {
            if (Pg) return !0;
            if (Ag) return Ag < 603;
            var t,
                e,
                n,
                r,
                i = '';
            for (t = 65; t < 76; t++) {
                switch (((e = String.fromCharCode(t)), t)) {
                    case 66:
                    case 69:
                    case 70:
                    case 72:
                        n = 3;
                        break;
                    case 68:
                    case 71:
                        n = 4;
                        break;
                    default:
                        n = 2;
                }
                for (r = 0; r < 47; r++) Cg.push({ k: e + r, v: n });
            }
            for (
                Cg.sort(function (t, e) {
                    return e.v - t.v;
                }),
                    r = 0;
                r < Cg.length;
                r++
            )
                ((e = Cg[r].k.charAt(0)), i.charAt(i.length - 1) !== e && (i += e));
            return 'DGBEFHACIJK' !== i;
        }
    });
bg(
    { target: 'Array', proto: !0, forced: Ig || !Ng || !Wg || !Fg },
    {
        sort: function (t) {
            void 0 !== t && Og(t);
            var e = kg(this);
            if (Fg) return void 0 === t ? Tg(e) : Tg(e, t);
            var n,
                r,
                i = [],
                o = Sg(e);
            for (r = 0; r < o; r++) r in e && Rg(i, e[r]);
            for (
                Dg(
                    i,
                    (function (t) {
                        return function (e, n) {
                            return void 0 === n
                                ? -1
                                : void 0 === e
                                  ? 1
                                  : void 0 !== t
                                    ? +t(e, n) || 0
                                    : _g(e) > _g(n)
                                      ? 1
                                      : -1;
                        };
                    })(t)
                ),
                    n = Sg(i),
                    r = 0;
                r < n;

            )
                e[r] = i[r++];
            for (; r < o; ) jg(e, r++);
            return e;
        },
    }
);
var zg,
    Hg,
    Yg,
    Ug = Lv.forEach,
    Bg = pn,
    Gg = kp,
    Vg = _p,
    qg = Fm('forEach')
        ? [].forEach
        : function (t) {
              return Ug(this, t, arguments.length > 1 ? arguments[1] : void 0);
          },
    Kg = Zi,
    Zg = function (t) {
        if (t && t.forEach !== qg)
            try {
                Kg(t, 'forEach', qg);
            } catch (e) {
                t.forEach = qg;
            }
    };
for (var Jg in Gg) Gg[Jg] && Zg(Bg[Jg] && Bg[Jg].prototype);
function Qg(t) {
    return 'top' === t || 'bottom' === t;
}
function Xg(t) {
    return t[mm.LEFT] + t[mm.RIGHT];
}
function tw(t) {
    return t[mm.TOP] + t[mm.BOTTOM];
}
Zg(Vg);
var ew,
    nw,
    rw = (function () {
        function t(e, n) {
            (nn(this, t),
                zg.add(this),
                (this.calendar = e),
                (this.domainPainter = n),
                (this.collection = new Map()),
                (this.scrollDirection = ym.SCROLL_FORWARD));
        }
        return (
            on(t, [
                {
                    key: 'get',
                    value: function (t) {
                        return this.collection.get(t);
                    },
                },
                {
                    key: 'update',
                    value: function (t, e) {
                        var n = this,
                            r = this.calendar.options.options,
                            i = r.verticalOrientation,
                            o = r.domain;
                        this.scrollDirection = e;
                        var a = { width: 0, height: 0 },
                            u = 0,
                            s = e === ym.SCROLL_FORWARD ? -1 : 1,
                            c = t.keys;
                        return (
                            'desc' === this.calendar.options.options.domain.sort &&
                                (c.reverse(), (s *= -1)),
                            t.yankedDomains.forEach(function (t) {
                                u += n.collection.get(t)[i ? 'height' : 'width'];
                            }),
                            t.yankedDomains.forEach(function (t) {
                                var e = n.collection.get(t);
                                n.collection.set(
                                    t,
                                    Object.assign(Object.assign({}, e), {
                                        x: i ? e.x : e.x + u * s,
                                        y: i ? e.y + u * s : e.y,
                                    })
                                );
                            }),
                            c.forEach(function (t) {
                                var e = dv(n, zg, 'm', Hg).call(n, t),
                                    r = dv(n, zg, 'm', Yg).call(n, t);
                                i
                                    ? ((a.height += r), (a.width = Math.max(e, a.width)))
                                    : ((a.width += e), (a.height = Math.max(r, a.height)));
                                var c = a.width - e,
                                    l = a.height - r;
                                n.collection.set(
                                    t,
                                    Object.assign(Object.assign({}, n.collection.get(t)), {
                                        x: i ? 0 : c,
                                        y: i ? l : 0,
                                        pre_x: i ? c : c - u * s,
                                        pre_y: i ? l - u * s : l,
                                        width: e,
                                        height: r,
                                        inner_width: e - (i ? 0 : o.gutter),
                                        inner_height: r - (i ? o.gutter : 0),
                                    })
                                );
                            }),
                            a
                        );
                    },
                },
            ]),
            t
        );
    })();
((zg = new WeakSet()),
    (Hg = function (t) {
        var e = this.calendar.options.options,
            n = e.domain,
            r = e.subDomain,
            i = e.x,
            o = e.verticalOrientation,
            a = this.calendar.templateCollection.get(r.type).columnsCount(t),
            u = (r.width + r.gutter) * a - r.gutter;
        return Xg(n.padding) + i.domainHorizontalLabelWidth + (o ? 0 : n.gutter) + u;
    }),
    (Yg = function (t) {
        var e = this.calendar.options.options,
            n = e.domain,
            r = e.subDomain,
            i = e.x,
            o = e.verticalOrientation,
            a = this.calendar.templateCollection.get(r.type).rowsCount(t),
            u = (r.height + r.gutter) * a - r.gutter;
        return tw(n.padding) + u + (o ? n.gutter : 0) + i.domainVerticalLabelHeight;
    }));
var iw = '.ch-domain',
    ow = (function () {
        function t(e) {
            (nn(this, t),
                ew.add(this),
                (this.calendar = e),
                (this.coordinates = new rw(e, this)),
                (this.root = null),
                (this.dimensions = { width: 0, height: 0 }));
        }
        return (
            on(t, [
                {
                    key: 'paint',
                    value: function (t, e) {
                        var n = this,
                            r = this.calendar.options.options.animationDuration,
                            i = e.transition().duration(r),
                            o = this.coordinates;
                        this.dimensions = o.update(this.calendar.domainCollection, t);
                        var a = [];
                        return (
                            (this.root = e
                                .selectAll(iw)
                                .data(this.calendar.domainCollection.keys, function (t) {
                                    return t;
                                })
                                .join(
                                    function (t) {
                                        return t
                                            .append('svg')
                                            .attr('x', function (t) {
                                                return o.get(t).pre_x;
                                            })
                                            .attr('y', function (t) {
                                                return o.get(t).pre_y;
                                            })
                                            .attr('width', function (t) {
                                                return o.get(t).inner_width;
                                            })
                                            .attr('height', function (t) {
                                                return o.get(t).inner_height;
                                            })
                                            .attr('class', function (t) {
                                                return dv(n, ew, 'm', nw).call(n, t);
                                            })
                                            .call(function (t) {
                                                return t
                                                    .append('rect')
                                                    .attr('width', function (t) {
                                                        return o.get(t).inner_width;
                                                    })
                                                    .attr('height', function (t) {
                                                        return o.get(t).inner_height;
                                                    })
                                                    .attr('class', ''.concat(iw.slice(1), '-bg'));
                                            })
                                            .call(function (t) {
                                                return a.push(
                                                    t
                                                        .transition(i)
                                                        .attr('x', function (t) {
                                                            return o.get(t).x;
                                                        })
                                                        .attr('y', function (t) {
                                                            return o.get(t).y;
                                                        })
                                                        .end()
                                                );
                                            });
                                    },
                                    function (t) {
                                        return t
                                            .call(function (t) {
                                                return a.push(
                                                    t
                                                        .transition(i)
                                                        .attr('x', function (t) {
                                                            return o.get(t).x;
                                                        })
                                                        .attr('y', function (t) {
                                                            return o.get(t).y;
                                                        })
                                                        .attr('width', function (t) {
                                                            return o.get(t).inner_width;
                                                        })
                                                        .attr('height', function (t) {
                                                            return o.get(t).inner_height;
                                                        })
                                                        .end()
                                                );
                                            })
                                            .call(function (t) {
                                                return a.push(
                                                    t
                                                        .selectAll(''.concat(iw, '-bg'))
                                                        .transition(i)
                                                        .attr('width', function (t) {
                                                            return o.get(t).inner_width;
                                                        })
                                                        .attr('height', function (t) {
                                                            return o.get(t).inner_height;
                                                        })
                                                        .end()
                                                );
                                            });
                                    },
                                    function (t) {
                                        return t.call(function (t) {
                                            return a.push(
                                                t
                                                    .transition(i)
                                                    .attr('x', function (t) {
                                                        return o.get(t).x;
                                                    })
                                                    .attr('y', function (t) {
                                                        return o.get(t).y;
                                                    })
                                                    .remove()
                                                    .end()
                                            );
                                        });
                                    }
                                )),
                            a
                        );
                    },
                },
            ]),
            t
        );
    })();
((ew = new WeakSet()),
    (nw = function (t) {
        var e = iw.slice(1),
            n = this.calendar.dateHelper.date(t);
        switch (this.calendar.options.options.domain.type) {
            case 'hour':
                e += ' h_'.concat(n.hour());
                break;
            case 'day':
                e += ' d_'.concat(n.date(), ' dy_').concat(n.format('d') + 1);
                break;
            case 'week':
                e += ' w_'.concat(n.week());
                break;
            case 'month':
                e += ' m_'.concat(n.month() + 1);
                break;
            case 'year':
                e += ' y_'.concat(n.year());
        }
        return e;
    }));
var aw = Na.includes,
    uw = Vh;
(xu(
    {
        target: 'Array',
        proto: !0,
        forced: _n(function () {
            return !Array(1).includes();
        }),
    },
    {
        includes: function (t) {
            return aw(this, t, arguments.length > 1 ? arguments[1] : void 0);
        },
    }
),
    uw('includes'));
var sw = Lv.filter;
xu(
    { target: 'Array', proto: !0, forced: !Jp('filter') },
    {
        filter: function (t) {
            return sw(this, t, arguments.length > 1 ? arguments[1] : void 0);
        },
    }
);
var cw,
    lw,
    fw,
    hw,
    dw = Ir,
    pw = bf,
    vw = $s,
    yw = Fr,
    mw = Wn,
    gw = function (t, e, n, r) {
        try {
            return r ? e(dw(n)[0], n[1]) : e(n);
        } catch (e) {
            pw(t, 'throw', e);
        }
    },
    ww = nf,
    bw = ls,
    xw = Aa,
    Ow = Vp,
    kw = yf,
    Sw = cf,
    jw = Array,
    _w = function (t) {
        var e = mw(t),
            n = bw(this),
            r = arguments.length,
            i = r > 1 ? arguments[1] : void 0,
            o = void 0 !== i;
        o && (i = vw(i, r > 2 ? arguments[2] : void 0));
        var a,
            u,
            s,
            c,
            l,
            f,
            h = Sw(e),
            d = 0;
        if (!h || (this === jw && ww(h)))
            for (a = xw(e), u = n ? new this(a) : jw(a); a > d; d++)
                ((f = o ? i(e[d], d) : e[d]), Ow(u, d, f));
        else
            for (l = (c = kw(e, h)).next, u = n ? new this() : []; !(s = yw(l, c)).done; d++)
                ((f = o ? gw(c, i, [s.value, d], !0) : s.value), Ow(u, d, f));
        return ((u.length = d), u);
    };
xu(
    {
        target: 'Array',
        stat: !0,
        forced: !Wf(function (t) {
            Array.from(t);
        }),
    },
    { from: _w }
);
var Mw,
    Dw,
    $w,
    Ew,
    Pw,
    Lw,
    Aw,
    Cw = {
        year: 'YYYY',
        month: 'MMMM',
        week: 'wo [week] YYYY',
        xDay: 'Do MMM',
        ghDay: 'Do MMM',
        day: 'Do MMM',
        hour: 'HH:00',
        minute: 'HH:mm',
    },
    Tw = (function () {
        function t(e, n, r, i) {
            var o = arguments.length > 4 && void 0 !== arguments[4] && arguments[4];
            if (
                (nn(this, t),
                cw.add(this),
                (this.collection = new Map()),
                (this.dateHelper = e),
                n && r && i)
            ) {
                var a = this.dateHelper.intervals(n, r, i, o).map(function (t) {
                    return mv(t);
                });
                this.collection = new Map(a);
            }
            ((this.min = 0),
                (this.max = 0),
                (this.keys = []),
                (this.yankedDomains = []),
                this.collection.size > 0 && dv(this, cw, 'm', hw).call(this));
        }
        return (
            on(t, [
                {
                    key: 'has',
                    value: function (t) {
                        return this.collection.has(t);
                    },
                },
                {
                    key: 'get',
                    value: function (t) {
                        return this.collection.get(t);
                    },
                },
                {
                    key: 'forEach',
                    value: function (t) {
                        return this.collection.forEach(t);
                    },
                },
                {
                    key: 'at',
                    value: function (t) {
                        return this.keys[t];
                    },
                },
                {
                    key: 'clamp',
                    value: function (t, e) {
                        var n = this;
                        return (
                            t &&
                                this.min < t &&
                                this.keys
                                    .filter(function (e) {
                                        return e < t;
                                    })
                                    .forEach(function (t) {
                                        return n.collection.delete(t);
                                    }),
                            e &&
                                this.max > e &&
                                this.keys
                                    .filter(function (t) {
                                        return t > e;
                                    })
                                    .forEach(function (t) {
                                        return n.collection.delete(t);
                                    }),
                            dv(this, cw, 'm', hw).call(this),
                            this
                        );
                    },
                },
                {
                    key: 'merge',
                    value: function (t, e, n) {
                        var r = this;
                        ((this.yankedDomains = []),
                            t.keys.forEach(function (t, i) {
                                if (!r.has(t)) {
                                    if (r.collection.size >= e) {
                                        var o = r.max;
                                        (t > r.max && (o = r.min),
                                            o && r.collection.delete(o) && r.yankedDomains.push(o));
                                    }
                                    (r.collection.set(t, n(t, i)), dv(r, cw, 'm', hw).call(r));
                                }
                            }),
                            (this.yankedDomains = this.yankedDomains.sort(function (t, e) {
                                return t - e;
                            })));
                    },
                },
                {
                    key: 'slice',
                    value: function () {
                        var t = this,
                            e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 0,
                            n = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
                        this.keys.length > e &&
                            ((n ? this.keys.slice(0, -e) : this.keys.slice(e)).forEach(
                                function (e) {
                                    t.collection.delete(e);
                                }
                            ),
                            dv(this, cw, 'm', hw).call(this));
                        return this;
                    },
                },
                {
                    key: 'fill',
                    value: function (t, e, n) {
                        var r = this,
                            i = e.x,
                            o = e.y,
                            a = e.groupY,
                            u = e.defaultValue,
                            s = this.groupRecords(t, i, n);
                        this.keys.forEach(function (t) {
                            var e = s.get(t) || {};
                            dv(r, cw, 'm', lw).call(r, t, e, o, a, u);
                        });
                    },
                },
                {
                    key: 'groupRecords',
                    value: function (t, e, n) {
                        var r = this,
                            i = new Map(),
                            o = new Map();
                        return (
                            this.keys.forEach(function (t) {
                                r.get(t).forEach(function (e) {
                                    o.set(e.t, t);
                                });
                            }),
                            t.forEach(function (t) {
                                var a = r.extractTimestamp(t, e, n);
                                if (o.has(a)) {
                                    var u = o.get(a),
                                        s = i.get(u) || {};
                                    (s[a] || (s[a] = []), s[a].push(t), i.set(u, s));
                                }
                            }),
                            i
                        );
                    },
                },
                {
                    key: 'groupValues',
                    value: function (t, e) {
                        var n = t.filter(function (t) {
                            return null !== t;
                        });
                        if ('string' == typeof e) {
                            if (
                                n.every(function (t) {
                                    return 'number' == typeof t;
                                })
                            )
                                switch (e) {
                                    case 'sum':
                                        return n.reduce(function (t, e) {
                                            return t + e;
                                        }, 0);
                                    case 'count':
                                        return n.length;
                                    case 'min':
                                        return Math.min.apply(Math, un(n)) || null;
                                    case 'max':
                                        return Math.max.apply(Math, un(n)) || null;
                                    case 'average':
                                        return n.length > 0
                                            ? n.reduce(function (t, e) {
                                                  return t + e;
                                              }, 0) / n.length
                                            : null;
                                    default:
                                        return null;
                                }
                            return 'count' === e ? n.length : null;
                        }
                        return 'function' == typeof e ? e(n) : null;
                    },
                },
                {
                    key: 'extractTimestamp',
                    value: function (t, e, n) {
                        var r = 'function' == typeof e ? e(t) : t[e];
                        return ('string' == typeof r && (r = +new Date(r)), n(r));
                    },
                },
            ]),
            t
        );
    })();
((cw = new WeakSet()),
    (lw = function (t, e, n, r, i) {
        var o = this;
        this.get(t).forEach(function (a, u) {
            var s = i;
            (e.hasOwnProperty(a.t) && (s = o.groupValues(dv(o, cw, 'm', fw).call(o, e[a.t], n), r)),
                (o.get(t)[u].v = s));
        });
    }),
    (fw = function (t, e) {
        return t.map(function (t) {
            return 'function' == typeof e ? e(t) : t[e];
        });
    }),
    (hw = function () {
        this.keys = Array.from(this.collection.keys())
            .map(function (t) {
                return parseInt(t, 10);
            })
            .sort(function (t, e) {
                return t - e;
            });
        var t = this.keys;
        return ((this.min = t[0]), (this.max = t[t.length - 1]), this.keys);
    }));
var Rw = '.ch-domain-text',
    Iw = (function () {
        function t(e) {
            (nn(this, t), Mw.add(this), (this.calendar = e));
        }
        return (
            on(t, [
                {
                    key: 'paint',
                    value: function (t) {
                        var e = this,
                            n = this.calendar.options.options.domain,
                            r = n.label,
                            i = n.type,
                            o = this.calendar.dateHelper,
                            a = r.text;
                        null !== a &&
                            '' !== a &&
                            (void 0 === a && (a = Cw[i]),
                            t
                                .selectAll(Rw)
                                .data(
                                    function (t) {
                                        return [t];
                                    },
                                    function (t) {
                                        return t;
                                    }
                                )
                                .join(
                                    function (t) {
                                        return t
                                            .append('text')
                                            .attr('class', Rw.slice(1))
                                            .attr('x', function (t) {
                                                return dv(e, Mw, 'm', $w).call(e, t);
                                            })
                                            .attr('y', function (t) {
                                                return dv(e, Mw, 'm', Ew).call(e, t);
                                            })
                                            .attr('text-anchor', r.textAlign)
                                            .attr('dominant-baseline', function () {
                                                return dv(e, Mw, 'm', Dw).call(e);
                                            })
                                            .text(function (t, e, n) {
                                                return o.format(t, a, n[e]);
                                            })
                                            .call(function (t) {
                                                return dv(e, Mw, 'm', Aw).call(e, t);
                                            });
                                    },
                                    function (t) {
                                        t.attr('x', function (t) {
                                            return dv(e, Mw, 'm', $w).call(e, t);
                                        })
                                            .attr('y', function (t) {
                                                return dv(e, Mw, 'm', Ew).call(e, t);
                                            })
                                            .attr('text-anchor', r.textAlign)
                                            .attr('dominant-baseline', function () {
                                                return dv(e, Mw, 'm', Dw).call(e);
                                            })
                                            .text(function (t, e, n) {
                                                return o.format(t, a, n[e]);
                                            })
                                            .call(function (t) {
                                                return dv(e, Mw, 'm', Aw).call(e, t);
                                            });
                                    }
                                ));
                    },
                },
            ]),
            t
        );
    })();
((Mw = new WeakSet()),
    (Dw = function () {
        var t = this.calendar.options.options.domain.label,
            e = t.position,
            n = t.rotate;
        return Qg(e)
            ? 'middle'
            : ('left' === n && 'left' === e) || ('right' === n && 'right' === e)
              ? 'bottom'
              : 'hanging';
    }),
    ($w = function (t) {
        var e = this.calendar.options.options.domain,
            n = e.padding,
            r = e.label,
            i = r.position,
            o = r.textAlign,
            a = r.offset,
            u = this.calendar.options.options.x.domainHorizontalLabelWidth,
            s = n[mm.LEFT];
        return (
            'right' === i && (s += dv(this, Mw, 'm', Pw).call(this, t)),
            'middle' === o &&
                (['top', 'bottom'].includes(i)
                    ? (s += dv(this, Mw, 'm', Pw).call(this, t) / 2)
                    : (s += u / 2)),
            'end' === o && (Qg(i) ? (s += dv(this, Mw, 'm', Pw).call(this, t)) : (s += u)),
            s + a.x
        );
    }),
    (Ew = function (t) {
        var e = this.calendar.options.options,
            n = e.domain,
            r = n.label,
            i = r.position,
            o = r.offset,
            a = n.padding,
            u = e.x,
            s = a[mm.TOP] + u.domainVerticalLabelHeight / 2;
        return ('bottom' === i && (s += dv(this, Mw, 'm', Lw).call(this, t)), s + o.y);
    }),
    (Pw = function (t) {
        var e = this.calendar.options.options,
            n = e.domain.padding,
            r = e.x.domainHorizontalLabelWidth;
        return (
            this.calendar.calendarPainter.domainsContainerPainter.domainPainter.coordinates.get(t)
                .inner_width -
            r -
            Xg(n)
        );
    }),
    (Lw = function (t) {
        var e = this.calendar.options.options,
            n = e.x.domainVerticalLabelHeight,
            r = e.domain.padding;
        return (
            this.calendar.calendarPainter.domainsContainerPainter.domainPainter.coordinates.get(t)
                .inner_height -
            n -
            tw(r)
        );
    }),
    (Aw = function (t) {
        var e = this,
            n = this.calendar.options.options,
            r = n.domain.label,
            i = r.rotate,
            o = r.textAlign,
            a = r.position,
            u = n.x.domainHorizontalLabelWidth;
        switch (i) {
            case 'right':
                t.attr('transform', function (t) {
                    var n = dv(e, Mw, 'm', Pw).call(e, t),
                        r = dv(e, Mw, 'm', Lw).call(e, t),
                        i = ['rotate(90, '.concat('right' === a ? n : u, ', 0)')];
                    switch (a) {
                        case 'right':
                            'middle' === o
                                ? i.push('translate('.concat(r / 2 - u / 2, ')'))
                                : 'end' === o && i.push('translate('.concat(r - u, ')'));
                            break;
                        case 'left':
                            'start' === o
                                ? i.push('translate('.concat(u, ')'))
                                : 'middle' === o
                                  ? i.push('translate('.concat(u / 2 + r / 2, ')'))
                                  : 'end' === o && i.push('translate('.concat(r, ')'));
                    }
                    return i.join(',');
                });
                break;
            case 'left':
                t.attr('transform', function (t) {
                    var n = dv(e, Mw, 'm', Pw).call(e, t),
                        r = dv(e, Mw, 'm', Lw).call(e, t),
                        i = ['rotate(270, '.concat('right' === a ? n : u, ', 0)')];
                    switch (a) {
                        case 'right':
                            'start' === o
                                ? i.push('translate(-'.concat(r, ')'))
                                : 'middle' === o
                                  ? i.push('translate(-'.concat(r / 2 + u / 2, ')'))
                                  : 'end' === o && i.push('translate(-'.concat(u, ')'));
                            break;
                        case 'left':
                            'start' === o
                                ? i.push('translate('.concat(u - r, ')'))
                                : 'middle' === o && i.push('translate('.concat(u / 2 - r / 2, ')'));
                    }
                    return i.join(',');
                });
        }
    }));
var Nw,
    Ww,
    Fw,
    zw,
    Hw,
    Yw,
    Uw,
    Bw = '\t\n\v\f\r                　\u2028\u2029\ufeff',
    Gw = Rn,
    Vw = op,
    qw = Bw,
    Kw = Ln(''.replace),
    Zw = RegExp('^[' + qw + ']+'),
    Jw = RegExp('(^|[^' + qw + '])[' + qw + ']+$'),
    Qw = function (t) {
        return function (e) {
            var n = Vw(Gw(e));
            return (1 & t && (n = Kw(n, Zw, '')), 2 & t && (n = Kw(n, Jw, '$1')), n);
        };
    },
    Xw = { start: Qw(1), end: Qw(2), trim: Qw(3) },
    tb = Ri.PROPER,
    eb = _n,
    nb = Bw,
    rb = Xw.trim;
xu(
    {
        target: 'String',
        proto: !0,
        forced: (function (t) {
            return eb(function () {
                return !!nb[t]() || '​᠎' !== '​᠎'[t]() || (tb && nb[t].name !== t);
            });
        })('trim'),
    },
    {
        trim: function () {
            return rb(this);
        },
    }
);
var ib,
    ob,
    ab,
    ub,
    sb = '.ch-subdomain',
    cb = (function () {
        function t(e) {
            (nn(this, t), Nw.add(this), (this.calendar = e), (this.root = null));
        }
        return (
            on(t, [
                {
                    key: 'paint',
                    value: function (t) {
                        var e = this;
                        this.root = t || this.root;
                        var n = ''.concat(sb, '-container'),
                            r = this.root
                                .selectAll(n)
                                .data(
                                    function (t) {
                                        return [t];
                                    },
                                    function (t) {
                                        return t;
                                    }
                                )
                                .join(
                                    function (t) {
                                        return t
                                            .append('svg')
                                            .call(function (t) {
                                                return dv(e, Nw, 'm', Ww).call(e, t);
                                            })
                                            .attr('class', n.slice(1));
                                    },
                                    function (t) {
                                        return t.call(function (t) {
                                            return dv(e, Nw, 'm', Ww).call(e, t);
                                        });
                                    }
                                ),
                            i = this.calendar.options.options.subDomain,
                            o = i.radius,
                            a = i.width,
                            u = i.height,
                            s = i.sort,
                            c = this.calendar.eventEmitter;
                        r.selectAll('g')
                            .data(function (t) {
                                var n = e.calendar.domainCollection.get(t);
                                if ('desc' === s) {
                                    var r = Math.max.apply(
                                        Math,
                                        un(
                                            n.map(function (t) {
                                                return t.x;
                                            })
                                        )
                                    );
                                    n.forEach(function (t, e) {
                                        n[e].x = Math.abs(t.x - r);
                                    });
                                }
                                return n;
                            })
                            .join(
                                function (t) {
                                    return t
                                        .append('g')
                                        .call(function (t) {
                                            return t
                                                .insert('rect')
                                                .attr('class', function (t) {
                                                    return dv(e, Nw, 'm', Fw).call(
                                                        e,
                                                        t.t,
                                                        ''.concat(sb.slice(1), '-bg')
                                                    );
                                                })
                                                .attr('width', a)
                                                .attr('height', u)
                                                .attr('x', function (t) {
                                                    return dv(e, Nw, 'm', Yw).call(e, t);
                                                })
                                                .attr('y', function (t) {
                                                    return dv(e, Nw, 'm', Uw).call(e, t);
                                                })
                                                .on('click', function (t, e) {
                                                    return c.emit('click', t, e.t, e.v);
                                                })
                                                .on('mouseover', function (t, e) {
                                                    return c.emit('mouseover', t, e.t, e.v);
                                                })
                                                .on('mouseout', function (t, e) {
                                                    return c.emit('mouseout', t, e.t, e.v);
                                                })
                                                .attr('rx', o > 0 ? o : null)
                                                .attr('ry', o > 0 ? o : null);
                                        })
                                        .call(function (t) {
                                            return dv(e, Nw, 'm', zw).call(e, t);
                                        });
                                },
                                function (t) {
                                    return t
                                        .selectAll('rect')
                                        .attr('class', function (t) {
                                            return dv(e, Nw, 'm', Fw).call(
                                                e,
                                                t.t,
                                                ''.concat(sb.slice(1), '-bg')
                                            );
                                        })
                                        .attr('width', a)
                                        .attr('height', u)
                                        .attr('x', function (t) {
                                            return dv(e, Nw, 'm', Yw).call(e, t);
                                        })
                                        .attr('y', function (t) {
                                            return dv(e, Nw, 'm', Uw).call(e, t);
                                        })
                                        .attr('rx', o)
                                        .attr('ry', o);
                                }
                            );
                    },
                },
            ]),
            t
        );
    })();
((Nw = new WeakSet()),
    (Ww = function (t) {
        var e = this.calendar.options.options,
            n = e.domain,
            r = n.padding,
            i = n.label.position;
        t.attr('x', function () {
            var t = r[mm.LEFT];
            return ('left' === i && (t += e.x.domainHorizontalLabelWidth), t);
        }).attr('y', function () {
            var t = r[mm.TOP];
            return ('top' === i && (t += e.x.domainVerticalLabelHeight), t);
        });
    }),
    (Fw = function (t) {
        var e = this,
            n = this.calendar.options.options,
            r = n.date.highlight,
            i = n.subDomain.type,
            o = '';
        r.length > 0 &&
            r.forEach(function (n) {
                var r = e.calendar.templateCollection.get(i).extractUnit;
                r(+n) === r(t) && (o = 'highlight');
            });
        for (var a = arguments.length, u = new Array(a > 1 ? a - 1 : 0), s = 1; s < a; s++)
            u[s - 1] = arguments[s];
        return [o].concat(u).join(' ').trim();
    }),
    (zw = function (t) {
        var e = this,
            n = this.calendar.options.options.subDomain,
            r = n.width,
            i = n.height,
            o = n.label;
        return o
            ? t
                  .append('text')
                  .attr('class', function (t) {
                      return dv(e, Nw, 'm', Fw).call(e, t.t, ''.concat(sb.slice(1), '-text'));
                  })
                  .attr('x', function (t) {
                      return dv(e, Nw, 'm', Yw).call(e, t) + r / 2;
                  })
                  .attr('y', function (t) {
                      return dv(e, Nw, 'm', Uw).call(e, t) + i / 2;
                  })
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'central')
                  .text(function (t, n, r) {
                      return e.calendar.dateHelper.format(t.t, o, t.v, r[n]);
                  })
            : null;
    }),
    (Hw = function (t, e) {
        var n = this.calendar.options.options.subDomain;
        return e[t] * (n['x' === t ? 'width' : 'height'] + n.gutter);
    }),
    (Yw = function (t) {
        return dv(this, Nw, 'm', Hw).call(this, 'x', t);
    }),
    (Uw = function (t) {
        return dv(this, Nw, 'm', Hw).call(this, 'y', t);
    }));
var lb = '.ch-domain-container',
    fb = 'in-transition',
    hb = (function () {
        function e(t) {
            (nn(this, e),
                ib.add(this),
                (this.calendar = t),
                (this.domainPainter = new ow(t)),
                (this.subDomainPainter = new cb(t)),
                (this.domainLabelPainter = new Iw(t)),
                (this.dimensions = { width: 0, height: 0 }),
                (this.transitionsQueueCount = 0));
        }
        return (
            on(e, [
                {
                    key: 'setup',
                    value: function () {
                        this.root = this.calendar.calendarPainter.root
                            .attr('x', 0)
                            .attr('y', 0)
                            .append('svg')
                            .attr('class', lb.slice(1))
                            .append('svg')
                            .attr('class', ''.concat(lb.slice(1), '-animation-wrapper'));
                    },
                },
                {
                    key: 'paint',
                    value: function (t) {
                        var e = this;
                        dv(this, ib, 'm', ob).call(this);
                        var n = this.domainPainter.paint(t, this.root);
                        return (
                            this.subDomainPainter.paint(this.domainPainter.root),
                            this.domainLabelPainter.paint(this.domainPainter.root),
                            dv(this, ib, 'm', ub).call(this),
                            Promise.allSettled(n).then(function () {
                                dv(e, ib, 'm', ab).call(e);
                            }),
                            n
                        );
                    },
                },
                {
                    key: 'updatePosition',
                    value: function () {
                        var e;
                        if (!(null === (e = this.root) || void 0 === e ? void 0 : e.node()))
                            return Promise.resolve();
                        var n = this.calendar.options.options.animationDuration,
                            r = this.calendar.pluginManager.getHeightFromPosition('top'),
                            i = this.calendar.pluginManager.getWidthFromPosition('left');
                        return [
                            t(this.root.node().parentNode)
                                .transition()
                                .duration(n)
                                .call(function (t) {
                                    t.attr('x', i).attr('y', r);
                                })
                                .end(),
                        ];
                    },
                },
                {
                    key: 'width',
                    value: function () {
                        return this.dimensions.width;
                    },
                },
                {
                    key: 'height',
                    value: function () {
                        return this.dimensions.height;
                    },
                },
                {
                    key: 'destroy',
                    value: function () {
                        return (dv(this, ib, 'm', ob).call(this), Promise.resolve());
                    },
                },
            ]),
            e
        );
    })();
((ib = new WeakSet()),
    (ob = function () {
        var e;
        (null === (e = this.root) || void 0 === e ? void 0 : e.node()) &&
            ((this.transitionsQueueCount += 1), t(this.root.node().parentNode).classed(fb, !0));
    }),
    (ab = function () {
        var e;
        (null === (e = this.root) || void 0 === e ? void 0 : e.node()) &&
            ((this.transitionsQueueCount -= 1),
            0 === this.transitionsQueueCount && t(this.root.node().parentNode).classed(fb, !1));
    }),
    (ub = function () {
        var t = this.calendar.options.options,
            e = t.animationDuration,
            n = t.verticalOrientation,
            r = t.domain.gutter,
            i = this.domainPainter.dimensions;
        ((this.dimensions = { width: i.width - (n ? 0 : r), height: i.height - (n ? r : 0) }),
            this.root
                .transition()
                .duration(e)
                .attr('width', this.dimensions.width)
                .attr('height', this.dimensions.height));
    }));
var db,
    pb,
    vb,
    yb,
    mb = (function () {
        function t(e) {
            (nn(this, t), (this.calendar = e));
        }
        return (
            on(t, [
                {
                    key: 'paint',
                    value: function () {
                        var t = [];
                        return (t = (t = t.concat(this.calendar.pluginManager.paintAll())).concat(
                            this.setPluginsPosition()
                        ));
                    },
                },
                {
                    key: 'setPluginsPosition',
                    value: function () {
                        var t = this.calendar.pluginManager,
                            e = this.calendar.options.options.animationDuration,
                            n = this.calendar.calendarPainter.domainsContainerPainter,
                            r = t.getFromPosition('top'),
                            i = t.getFromPosition('right'),
                            o = t.getFromPosition('bottom'),
                            a = t.getFromPosition('left'),
                            u = t.getHeightFromPosition('top'),
                            s = t.getWidthFromPosition('left'),
                            c = [],
                            l = 0;
                        r.forEach(function (t) {
                            (c.push(
                                t.root.transition().duration(e).attr('y', l).attr('x', s).end()
                            ),
                                (l += t.options.dimensions.height));
                        });
                        var f = 0;
                        return (
                            a.forEach(function (t) {
                                (c.push(
                                    t.root.transition().duration(e).attr('x', f).attr('y', u).end()
                                ),
                                    (f += t.options.dimensions.width));
                            }),
                            o.forEach(function (t) {
                                c.push(
                                    t.root
                                        .transition()
                                        .duration(e)
                                        .attr('x', s)
                                        .attr('y', u + n.height())
                                        .end()
                                );
                            }),
                            (f += n.width()),
                            i.forEach(function (t) {
                                (c.push(
                                    t.root.transition().duration(e).attr('x', f).attr('y', u).end()
                                ),
                                    (f += t.options.dimensions.width));
                            }),
                            c
                        );
                    },
                },
                {
                    key: 'insideWidth',
                    value: function () {
                        return (
                            this.calendar.pluginManager.getWidthFromPosition('left') +
                            this.calendar.pluginManager.getWidthFromPosition('right')
                        );
                    },
                },
                {
                    key: 'insideHeight',
                    value: function () {
                        return (
                            this.calendar.pluginManager.getHeightFromPosition('top') +
                            this.calendar.pluginManager.getHeightFromPosition('bottom')
                        );
                    },
                },
            ]),
            t
        );
    })(),
    gb = (function () {
        function e(t) {
            (nn(this, e),
                db.add(this),
                (this.calendar = t),
                (this.dimensions = { width: 0, height: 0 }),
                (this.root = null),
                (this.domainsContainerPainter = new hb(t)),
                (this.pluginPainter = new mb(t)));
        }
        return (
            on(e, [
                {
                    key: 'setup',
                    value: function () {
                        var e = this.calendar.options.options,
                            n = e.itemSelector,
                            r = e.theme;
                        return (
                            this.root ||
                                ((this.root = t(n)
                                    .append('svg')
                                    .attr('data-theme', r)
                                    .attr('class', '.ch-container'.slice(1))),
                                this.domainsContainerPainter.setup()),
                            this.calendar.pluginManager.setupAll(),
                            !0
                        );
                    },
                },
                {
                    key: 'paint',
                    value: function () {
                        var t =
                                arguments.length > 0 && void 0 !== arguments[0]
                                    ? arguments[0]
                                    : ym.SCROLL_NONE,
                            e = this.domainsContainerPainter
                                .paint(t)
                                .concat(this.pluginPainter.paint())
                                .concat(this.domainsContainerPainter.updatePosition());
                        return (dv(this, db, 'm', yb).call(this), Promise.allSettled(e));
                    },
                },
                {
                    key: 'destroy',
                    value: function () {
                        var t = this.calendar.pluginManager
                            .destroyAll()
                            .concat(this.domainsContainerPainter.destroy());
                        return this.root
                            ? (t.push(
                                  this.root
                                      .transition()
                                      .duration(this.calendar.options.options.animationDuration)
                                      .attr('width', 0)
                                      .attr('height', 0)
                                      .remove()
                                      .end()
                              ),
                              Promise.allSettled(t))
                            : Promise.allSettled(t);
                    },
                },
            ]),
            e
        );
    })();
((db = new WeakSet()),
    (pb = function () {
        return this.domainsContainerPainter.height() + this.pluginPainter.insideHeight();
    }),
    (vb = function () {
        return this.domainsContainerPainter.width() + this.pluginPainter.insideWidth();
    }),
    (yb = function () {
        var t = this.calendar.options.options,
            e = dv(this, db, 'm', vb).call(this),
            n = dv(this, db, 'm', pb).call(this);
        (this.root.transition().duration(t.animationDuration).attr('width', e).attr('height', n),
            (e === this.dimensions.width && n === this.dimensions.height) ||
                this.calendar.eventEmitter.emit(
                    'resize',
                    e,
                    n,
                    this.dimensions.width,
                    this.dimensions.height
                ),
            (this.dimensions = { width: e, height: n }));
    }));
var wb = 'object' == typeof Xe && Xe && Xe.Object === Object && Xe,
    bb = 'object' == typeof self && self && self.Object === Object && self,
    xb = wb || bb || Function('return this')(),
    Ob = xb.Symbol,
    kb = Object.prototype,
    Sb = kb.hasOwnProperty,
    jb = kb.toString,
    _b = Ob ? Ob.toStringTag : void 0;
var Mb = Object.prototype.toString;
var Db = Ob ? Ob.toStringTag : void 0;
function $b(t) {
    return null == t
        ? void 0 === t
            ? '[object Undefined]'
            : '[object Null]'
        : Db && Db in Object(t)
          ? (function (t) {
                var e = Sb.call(t, _b),
                    n = t[_b];
                try {
                    t[_b] = void 0;
                    var r = !0;
                } catch (t) {}
                var i = jb.call(t);
                return (r && (e ? (t[_b] = n) : delete t[_b]), i);
            })(t)
          : (function (t) {
                return Mb.call(t);
            })(t);
}
function Eb(t) {
    var e = typeof t;
    return null != t && ('object' == e || 'function' == e);
}
function Pb(t) {
    if (!Eb(t)) return !1;
    var e = $b(t);
    return (
        '[object Function]' == e ||
        '[object GeneratorFunction]' == e ||
        '[object AsyncFunction]' == e ||
        '[object Proxy]' == e
    );
}
var Lb = Wn,
    Ab = mh;
xu(
    {
        target: 'Object',
        stat: !0,
        forced: _n(function () {
            Ab(1);
        }),
    },
    {
        keys: function (t) {
            return Ab(Lb(t));
        },
    }
);
var Cb,
    Tb = _r,
    Rb = Ho,
    Ib = vr('match'),
    Nb = function (t) {
        var e;
        return Tb(t) && (void 0 !== (e = t[Ib]) ? !!e : 'RegExp' === Rb(t));
    },
    Wb = TypeError,
    Fb = function (t) {
        if (Nb(t)) throw new Wb("The method doesn't accept regular expressions");
        return t;
    },
    zb = vr('match'),
    Hb = function (t) {
        var e = /./;
        try {
            '/./'[t](e);
        } catch (n) {
            try {
                return ((e[zb] = !1), '/./'[t](e));
            } catch (t) {}
        }
        return !1;
    },
    Yb = xu,
    Ub = js,
    Bb = Qo.f,
    Gb = Pa,
    Vb = op,
    qb = Fb,
    Kb = Rn,
    Zb = Hb,
    Jb = Ub(''.startsWith),
    Qb = Ub(''.slice),
    Xb = Math.min,
    tx = Zb('startsWith');
Yb(
    {
        target: 'String',
        proto: !0,
        forced: !!(tx || ((Cb = Bb(String.prototype, 'startsWith')), !Cb || Cb.writable)) && !tx,
    },
    {
        startsWith: function (t) {
            var e = Vb(Kb(this));
            qb(t);
            var n = Gb(Xb(arguments.length > 1 ? arguments[1] : void 0, e.length)),
                r = Vb(t);
            return Jb ? Jb(e, r, n) : Qb(e, n, n + r.length) === r;
        },
    }
);
var ex = kr,
    nx = _n,
    rx = Ln,
    ix = nd,
    ox = mh,
    ax = la,
    ux = rx(Xo.f),
    sx = rx([].push),
    cx =
        ex &&
        nx(function () {
            var t = Object.create(null);
            return ((t[2] = 2), !ux(t, 2));
        }),
    lx = function (t) {
        return function (e) {
            for (
                var n, r = ax(e), i = ox(r), o = cx && null === ix(r), a = i.length, u = 0, s = [];
                a > u;

            )
                ((n = i[u++]), (ex && !(o ? n in r : ux(r, n))) || sx(s, t ? [n, r[n]] : r[n]));
            return s;
        };
    },
    fx = { entries: lx(!0), values: lx(!1) }.entries;
function hx(t) {
    return null != t && !Number.isNaN(t);
}
function dx(t, e) {
    return +hx(e) - +hx(t) || it(t, e);
}
function px(t) {
    return isFinite(t) ? t : NaN;
}
function vx(t) {
    return t > 0 && isFinite(t) ? t : NaN;
}
function yx(t) {
    return t < 0 && isFinite(t) ? t : NaN;
}
xu(
    { target: 'Object', stat: !0 },
    {
        entries: function (t) {
            return fx(t);
        },
    }
);
const mx =
    /^(?:[-+]\d{2})?\d{4}(?:-\d{2}(?:-\d{2})?)?(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[-+]\d{2}:?\d{2})?)?$/;
function gx(t, e) {
    return mx.test((t += '')) ? new Date(t) : 'function' == typeof e ? e(t) : e;
}
const wx = new Map([
        ['second', n],
        ['minute', r],
        ['hour', i],
        ['day', o],
        ['week', a],
        ['month', u],
        ['quarter', u.every(3)],
        ['half', u.every(6)],
        ['year', s],
        ['monday', c],
        ['tuesday', l],
        ['wednesday', f],
        ['thursday', h],
        ['friday', d],
        ['saturday', p],
        ['sunday', v],
    ]),
    bx = new Map([
        ['second', y],
        ['minute', m],
        ['hour', g],
        ['day', w],
        ['week', b],
        ['month', x],
        ['quarter', x.every(3)],
        ['half', x.every(6)],
        ['year', O],
        ['monday', k],
        ['tuesday', S],
        ['wednesday', j],
        ['thursday', _],
        ['friday', M],
        ['saturday', D],
        ['sunday', $],
    ]);
function xx(t) {
    const e = wx.get(`${t}`.toLowerCase());
    if (!e) throw new Error(`unknown interval: ${t}`);
    return e;
}
function Ox(t) {
    const e = bx.get(`${t}`.toLowerCase());
    if (!e) throw new Error(`unknown interval: ${t}`);
    return e;
}
const kx = Object.getPrototypeOf(Uint8Array),
    Sx = Object.prototype.toString,
    jx = (t) => () => t;
function _x(t) {
    return t instanceof kx ? t : Px(t, Mx, Float64Array);
}
function Mx(t) {
    return null == t ? NaN : Number(t);
}
function Dx(t) {
    return Px(t, $x);
}
function $x(t) {
    return t instanceof Date && !isNaN(t)
        ? t
        : 'string' == typeof t
          ? gx(t)
          : null == t || isNaN((t = +t))
            ? void 0
            : new Date(t);
}
function Ex(t) {
    return null == t || t instanceof Array || t instanceof kx ? t : Array.from(t);
}
function Px(t, e, n = Array) {
    return null == t ? t : t instanceof n ? t.map(e) : n.from(t, e);
}
function Lx(t, e = Array) {
    return t instanceof e ? t.slice() : e.from(t);
}
function Ax(t) {
    return (
        (function (t) {
            return t?.toString === Sx;
        })(t) &&
        (void 0 !== t.type || void 0 !== t.domain)
    );
}
function Cx(t, e) {
    if (null != t) {
        if ('number' == typeof t) {
            0 < t && t < 1 && Number.isInteger(1 / t) && (t = -1 / t);
            const e = Math.abs(t);
            return t < 0
                ? {
                      floor: (t) => Math.floor(t * e) / e,
                      offset: (t) => (t * e + 1) / e,
                      range: (t, n) => ft(Math.ceil(t * e), n * e).map((t) => t / e),
                  }
                : {
                      floor: (t) => Math.floor(t / e) * e,
                      offset: (t) => t + e,
                      range: (t, n) => ft(Math.ceil(t / e), n / e).map((t) => t * e),
                  };
        }
        if ('string' == typeof t) return ('time' === e ? xx : Ox)(t);
        if ('function' != typeof t.floor) throw new Error('invalid interval; missing floor method');
        if ('function' != typeof t.offset)
            throw new Error('invalid interval; missing offset method');
        return t;
    }
}
function Tx(t, e) {
    if ((t = Cx(t, e)) && 'function' != typeof t.range)
        throw new Error('invalid interval: missing range method');
    return t;
}
function Rx(t) {
    for (const e of t) {
        if (null == e) continue;
        const t = typeof e;
        return 'string' === t || 'boolean' === t;
    }
}
function Ix(t) {
    for (const e of t) if (null != e) return e instanceof Date;
}
function Nx(t) {
    for (const e of t) if (null != e) return 'string' == typeof e && isNaN(e) && gx(e);
}
function Wx(t) {
    for (const e of t)
        if (null != e) {
            if ('string' != typeof e) return !1;
            if (e.trim()) return !isNaN(e);
        }
}
function Fx(t) {
    if (null == t) return;
    const e = t[0],
        n = t[t.length - 1];
    return z(e, n);
}
const zx = Symbol('position'),
    Hx = Symbol('color'),
    Yx = Symbol('radius'),
    Ux = Symbol('length'),
    Bx = Symbol('opacity'),
    Gx = Symbol('symbol'),
    Vx = new Map([
        ['x', zx],
        ['y', zx],
        ['fx', zx],
        ['fy', zx],
        ['r', Yx],
        ['color', Hx],
        ['opacity', Bx],
        ['symbol', Gx],
        ['length', Ux],
    ]),
    qx = 2 / Math.sqrt(3),
    Kx = new Map([
        ['asterisk', ae],
        ['circle', ue],
        ['cross', se],
        ['diamond', ce],
        ['diamond2', le],
        [
            'hexagon',
            {
                draw(t, e) {
                    const n = Math.sqrt(e / Math.PI),
                        r = n * qx,
                        i = r / 2;
                    (t.moveTo(0, r),
                        t.lineTo(n, i),
                        t.lineTo(n, -i),
                        t.lineTo(0, -r),
                        t.lineTo(-n, -i),
                        t.lineTo(-n, i),
                        t.closePath());
                },
            },
        ],
        ['plus', fe],
        ['square', he],
        ['square2', de],
        ['star', pe],
        ['times', ve],
        ['triangle', ye],
        ['triangle2', me],
        ['wye', ge],
    ]);
function Zx(t) {
    if (
        null == t ||
        (function (t) {
            return t && 'function' == typeof t.draw;
        })(t)
    )
        return t;
    const e = Kx.get(`${t}`.toLowerCase());
    if (e) return e;
    throw new Error(`invalid symbol: ${t}`);
}
function Jx(t) {
    console.warn(t);
}
const Qx = new Map([
    ['accent', ht],
    ['category10', dt],
    ['dark2', pt],
    ['paired', vt],
    ['pastel1', yt],
    ['pastel2', mt],
    ['set1', gt],
    ['set2', wt],
    ['set3', bt],
    ['tableau10', xt],
    ['brbg', tO(we, Ot)],
    ['prgn', tO(be, kt)],
    ['piyg', tO(xe, St)],
    ['puor', tO(Oe, jt)],
    ['rdbu', tO(ke, _t)],
    ['rdgy', tO(Se, Mt)],
    ['rdylbu', tO(je, Dt)],
    ['rdylgn', tO(_e, $t)],
    ['spectral', tO(Me, Et)],
    ['burd', eO(ke, _t)],
    ['buylrd', eO(je, Dt)],
    ['blues', Xx(De, Pt)],
    ['greens', Xx($e, Lt)],
    ['greys', Xx(Ee, At)],
    ['oranges', Xx(Pe, Rt)],
    ['purples', Xx(Le, Ct)],
    ['reds', Xx(Ae, Tt)],
    ['turbo', nO(It)],
    ['viridis', nO(Nt)],
    ['magma', nO(Wt)],
    ['inferno', nO(Ft)],
    ['plasma', nO(zt)],
    ['cividis', nO(Ht)],
    ['cubehelix', nO(Yt)],
    ['warm', nO(Ut)],
    ['cool', nO(Bt)],
    ['bugn', Xx(Ce, Gt)],
    ['bupu', Xx(Te, Vt)],
    ['gnbu', Xx(Re, qt)],
    ['orrd', Xx(Ie, Kt)],
    ['pubu', Xx(Ne, Jt)],
    ['pubugn', Xx(We, Zt)],
    ['purd', Xx(Fe, Qt)],
    ['rdpu', Xx(ze, Xt)],
    ['ylgn', Xx(He, ee)],
    ['ylgnbu', Xx(Ye, te)],
    ['ylorbr', Xx(Ue, ne)],
    ['ylorrd', Xx(Be, re)],
    ['rainbow', rO(ie)],
    ['sinebow', rO(oe)],
]);
function Xx(t, e) {
    return ({ length: n }) =>
        1 === n
            ? [t[3][1]]
            : 2 === n
              ? [t[3][1], t[3][2]]
              : (n = Math.max(3, Math.floor(n))) > 9
                ? C(e, n)
                : t[n];
}
function tO(t, e) {
    return ({ length: n }) =>
        2 === n ? [t[3][0], t[3][2]] : (n = Math.max(3, Math.floor(n))) > 11 ? C(e, n) : t[n];
}
function eO(t, e) {
    return ({ length: n }) =>
        2 === n
            ? [t[3][2], t[3][0]]
            : (n = Math.max(3, Math.floor(n))) > 11
              ? C((t) => e(1 - t), n)
              : t[n].slice().reverse();
}
function nO(t) {
    return ({ length: e }) => C(t, Math.max(2, Math.floor(e)));
}
function rO(t) {
    return ({ length: e }) => C(t, Math.floor(e) + 1).slice(0, -1);
}
function iO(t) {
    const e = `${t}`.toLowerCase();
    if (!Qx.has(e)) throw new Error(`unknown ordinal scheme: ${e}`);
    return Qx.get(e);
}
function oO(t, e) {
    const n = iO(t),
        r = 'function' == typeof n ? n({ length: e }) : n;
    return r.length !== e ? r.slice(0, e) : r;
}
const aO = new Map([
    ['brbg', Ot],
    ['prgn', kt],
    ['piyg', St],
    ['puor', jt],
    ['rdbu', _t],
    ['rdgy', Mt],
    ['rdylbu', Dt],
    ['rdylgn', $t],
    ['spectral', Et],
    ['burd', (t) => _t(1 - t)],
    ['buylrd', (t) => Dt(1 - t)],
    ['blues', Pt],
    ['greens', Lt],
    ['greys', At],
    ['purples', Ct],
    ['reds', Tt],
    ['oranges', Rt],
    ['turbo', It],
    ['viridis', Nt],
    ['magma', Wt],
    ['inferno', Ft],
    ['plasma', zt],
    ['cividis', Ht],
    ['cubehelix', Yt],
    ['warm', Ut],
    ['cool', Bt],
    ['bugn', Gt],
    ['bupu', Vt],
    ['gnbu', qt],
    ['orrd', Kt],
    ['pubugn', Zt],
    ['pubu', Jt],
    ['purd', Qt],
    ['rdpu', Xt],
    ['ylgnbu', te],
    ['ylgn', ee],
    ['ylorbr', ne],
    ['ylorrd', re],
    ['rainbow', ie],
    ['sinebow', oe],
]);
function uO(t) {
    const e = `${t}`.toLowerCase();
    if (!aO.has(e)) throw new Error(`unknown quantitative scheme: ${e}`);
    return aO.get(e);
}
const sO = new Set([
    'brbg',
    'prgn',
    'piyg',
    'puor',
    'rdbu',
    'rdgy',
    'rdylbu',
    'rdylgn',
    'spectral',
    'burd',
    'buylrd',
]);
function cO(t) {
    return null != t && sO.has(`${t}`.toLowerCase());
}
const lO = (t) => (e) => t(1 - e),
    fO = [0, 1],
    hO = new Map([
        ['number', N],
        ['rgb', ot],
        ['hsl', Ge],
        ['hcl', Ve],
        ['lab', qe],
    ]);
function dO(t) {
    const e = `${t}`.toLowerCase();
    if (!hO.has(e)) throw new Error(`unknown interpolator: ${e}`);
    return hO.get(e);
}
function pO(
    t,
    e,
    n,
    {
        type: r,
        nice: i,
        clamp: o,
        zero: a,
        domain: u = gO(t, n),
        unknown: s,
        round: c,
        scheme: l,
        interval: f,
        range: h = Vx.get(t) === Yx
            ? bO(n, u)
            : Vx.get(t) === Ux
              ? xO(n, u)
              : Vx.get(t) === Bx
                ? fO
                : void 0,
        interpolate: d = Vx.get(t) === Hx
            ? null == l && void 0 !== h
                ? ot
                : uO(void 0 !== l ? l : 'cyclical' === r ? 'rainbow' : 'turbo')
            : c
              ? at
              : N,
        reverse: p,
    }
) {
    if (
        ((f = Tx(f, r)),
        ('cyclical' !== r && 'sequential' !== r) || (r = 'linear'),
        (p = !!p),
        'function' != typeof d && (d = dO(d)),
        1 === d.length
            ? (p && ((d = lO(d)), (p = !1)),
              void 0 === h &&
                  2 === (h = Float64Array.from(u, (t, e) => e / (u.length - 1))).length &&
                  (h = fO),
              e.interpolate((h === fO ? jx : SO)(d)))
            : e.interpolate(d),
        a)
    ) {
        const [t, e] = R(u);
        (t > 0 || e < 0) && (Fx((u = Lx(u))) !== Math.sign(t) ? (u[u.length - 1] = 0) : (u[0] = 0));
    }
    return (
        p && (u = W(u)),
        e.domain(u).unknown(s),
        i &&
            (e.nice(
                (function (t, e) {
                    return !0 === t
                        ? void 0
                        : 'number' == typeof t
                          ? t
                          : (function (t, e) {
                                if ((t = Tx(t, e)) && 'function' != typeof t.ceil)
                                    throw new Error('invalid interval: missing ceil method');
                                return t;
                            })(t, e);
                })(i, r)
            ),
            (u = e.domain())),
        void 0 !== h && e.range(h),
        o && e.clamp(o),
        { type: r, domain: u, range: h, scale: e, interpolate: d, interval: f }
    );
}
function vO(t, e, { exponent: n = 1, ...r }) {
    return pO(t, P().exponent(n), e, { ...r, type: 'pow' });
}
function yO(
    t,
    e,
    {
        domain: n = [0],
        unknown: r,
        scheme: i = 'rdylbu',
        interpolate: o,
        range: a = void 0 !== o
            ? C(o, n.length + 1)
            : Vx.get(t) === Hx
              ? oO(i, n.length + 1)
              : void 0,
        reverse: u,
    }
) {
    const s = Fx((n = Ex(n)));
    if (
        !isNaN(s) &&
        !(function (t, e) {
            for (let n = 1, r = t.length, i = t[0]; n < r; ++n) {
                const r = z(i, (i = t[n]));
                if (0 !== r && r !== e) return !1;
            }
            return !0;
        })(n, s)
    )
        throw new Error(`the ${t} scale has a non-monotonic domain`);
    return (
        u && (a = W(a)),
        {
            type: 'threshold',
            scale: F(s < 0 ? W(n) : n, void 0 === a ? [] : a).unknown(r),
            domain: n,
            range: a,
        }
    );
}
function mO(t, e = px) {
    return t.length
        ? [
              ut(t, ({ value: t }) => (void 0 === t ? t : ut(t, e))),
              Y(t, ({ value: t }) => (void 0 === t ? t : Y(t, e))),
          ]
        : [0, 1];
}
function gO(t, e) {
    const n = Vx.get(t);
    return (n === Yx || n === Bx || n === Ux ? wO : mO)(e);
}
function wO(t) {
    return [0, t.length ? Y(t, ({ value: t }) => (void 0 === t ? t : Y(t, px))) : 1];
}
function bO(t, e) {
    const n = t.find(({ radius: t }) => void 0 !== t);
    if (void 0 !== n) return [0, n.radius];
    const r = st(t, 0.5, ({ value: t }) => (void 0 === t ? NaN : st(t, 0.25, vx))),
        i = e.map((t) => 3 * Math.sqrt(t / r)),
        o = 30 / Y(i);
    return o < 1 ? i.map((t) => t * o) : i;
}
function xO(t, e) {
    const n = ct(t, ({ value: t }) => (void 0 === t ? NaN : ct(t, Math.abs))),
        r = e.map((t) => (12 * t) / n),
        i = 60 / Y(r);
    return i < 1 ? r.map((t) => t * i) : r;
}
function OO(t) {
    for (const { value: e } of t)
        if (void 0 !== e)
            for (let n of e) {
                if (n > 0) return mO(t, vx);
                if (n < 0) return mO(t, yx);
            }
    return [1, 10];
}
function kO(t) {
    const e = [];
    for (const { value: n } of t) if (void 0 !== n) for (const t of n) e.push(t);
    return e;
}
function SO(t) {
    return (e, n) => (r) => t(e + r * (n - e));
}
function jO(
    t,
    e,
    n,
    r,
    {
        type: i,
        nice: o,
        clamp: a,
        domain: u = mO(r),
        unknown: s,
        pivot: c = 0,
        scheme: l,
        range: f,
        symmetric: h = !0,
        interpolate: d = Vx.get(t) === Hx
            ? null == l && void 0 !== f
                ? ot
                : uO(void 0 !== l ? l : 'rdbu')
            : N,
        reverse: p,
    }
) {
    c = +c;
    let [v, y] = u;
    if (
        (z(v, y) < 0 && (([v, y] = [y, v]), (p = !p)),
        (v = Math.min(v, c)),
        (y = Math.max(y, c)),
        'function' != typeof d && (d = dO(d)),
        void 0 !== f && (d = 1 === d.length ? SO(d)(...f) : lt(d, f)),
        p && (d = lO(d)),
        h)
    ) {
        const t = n.apply(c),
            e = t - n.apply(v),
            r = n.apply(y) - t;
        e < r ? (v = n.invert(t - r)) : e > r && (y = n.invert(t + e));
    }
    return (
        e.domain([v, c, y]).unknown(s).interpolator(d),
        a && e.clamp(a),
        o && e.nice(o),
        { type: i, domain: [v, y], pivot: c, interpolate: d, scale: e }
    );
}
function _O(t, e, { exponent: n = 1, ...r }) {
    return jO(
        t,
        B().exponent((n = +n)),
        (function (t) {
            return 0.5 === t
                ? EO
                : {
                      apply: (e) => Math.sign(e) * Math.pow(Math.abs(e), t),
                      invert: (e) => Math.sign(e) * Math.pow(Math.abs(e), 1 / t),
                  };
        })(n),
        e,
        { ...r, type: 'diverging-pow' }
    );
}
function MO(t, e, { constant: n = 1, ...r }) {
    return jO(
        t,
        V().constant((n = +n)),
        (function (t) {
            return {
                apply: (e) => Math.sign(e) * Math.log1p(Math.abs(e / t)),
                invert: (e) => Math.sign(e) * Math.expm1(Math.abs(e)) * t,
            };
        })(n),
        e,
        r
    );
}
const DO = { apply: (t) => t, invert: (t) => t },
    $O = { apply: Math.log, invert: Math.exp },
    EO = {
        apply: (t) => Math.sign(t) * Math.sqrt(Math.abs(t)),
        invert: (t) => Math.sign(t) * (t * t),
    };
function PO(t, e, n, r) {
    return pO(t, e, n, r);
}
const LO = Symbol('ordinal');
function AO(t, e, n, { type: r, interval: i, domain: o, range: a, reverse: u, hint: s }) {
    return (
        (i = Tx(i, r)),
        void 0 === o && (o = RO(n, i, t)),
        ('categorical' !== r && r !== LO) || (r = 'ordinal'),
        u && (o = W(o)),
        e.domain(o),
        void 0 !== a && ('function' == typeof a && (a = a(o)), e.range(a)),
        { type: r, domain: o, range: a, scale: e, hint: s, interval: i }
    );
}
function CO(t, e, { type: n, interval: r, domain: i, range: o, scheme: a, unknown: u, ...s }) {
    let c;
    if (((r = Tx(r, n)), void 0 === i && (i = RO(e, r, t)), Vx.get(t) === Gx))
        ((c = (function (t) {
            return { fill: IO(t, 'fill'), stroke: IO(t, 'stroke') };
        })(e)),
            (o =
                void 0 === o
                    ? (function (t) {
                          return (
                              (e = t.fill),
                              null == e ||
                              (function (t) {
                                  return /^\s*none\s*$/i.test(t);
                              })(e)
                                  ? nt
                                  : rt
                          );
                          var e;
                      })(c)
                    : Px(o, Zx)));
    else if (
        Vx.get(t) === Hx &&
        (void 0 !== o ||
            ('ordinal' !== n && n !== LO) ||
            ((o = (function (t, e = 'greys') {
                const n = new Set(),
                    [r, i] = oO(e, 2);
                for (const e of t)
                    if (null != e)
                        if (!0 === e) n.add(i);
                        else {
                            if (!1 !== e) return;
                            n.add(r);
                        }
                return [...n];
            })(i, a)),
            void 0 !== o && (a = void 0)),
        void 0 === a && void 0 === o && (a = 'ordinal' === n ? 'turbo' : 'tableau10'),
        void 0 !== a)
    )
        if (void 0 !== o) {
            const t = uO(a),
                e = o[0],
                n = o[1] - o[0];
            o = ({ length: r }) => C((r) => t(e + n * r), r);
        } else o = iO(a);
    if (u === Z) throw new Error(`implicit unknown on ${t} scale is not supported`);
    return AO(t, J().unknown(u), e, { ...s, type: n, domain: i, range: o, hint: c });
}
function TO(t, e, n, r) {
    let { round: i } = n;
    return (void 0 !== i && t.round((i = !!i)), ((t = AO(r, t, e, n)).round = i), t);
}
function RO(t, e, n) {
    const r = new tt();
    for (const { value: e, domain: n } of t) {
        if (void 0 !== n) return n();
        if (void 0 !== e) for (const t of e) r.add(t);
    }
    if (void 0 !== e) {
        const [t, n] = R(r).map(e.floor, e);
        return e.range(t, e.offset(n));
    }
    if (r.size > 1e4 && Vx.get(n) === zx)
        throw new Error(`implicit ordinal domain of ${n} scale has more than 10,000 values`);
    return et(r, dx);
}
function IO(t, e) {
    let n;
    for (const { hint: r } of t) {
        const t = r?.[e];
        if (void 0 !== t)
            if (void 0 === n) n = t;
            else if (n !== t) return;
    }
    return n;
}
function NO(t, e, n) {
    return (function (t, e = [], n = {}) {
        const r = (function (
            t,
            e,
            { type: n, domain: r, range: i, scheme: o, pivot: a, projection: u }
        ) {
            if ('fx' === t || 'fy' === t) return 'band';
            ('x' !== t && 'y' !== t) || null == u || (n = FO);
            for (const { type: t } of e)
                if (void 0 !== t)
                    if (void 0 === n) n = t;
                    else if (n !== t)
                        throw new Error(`scale incompatible with channel: ${n} !== ${t}`);
            if (n === FO) return;
            if (void 0 !== n) return n;
            if (void 0 === r && !e.some(({ value: t }) => void 0 !== t)) return;
            const s = Vx.get(t);
            if (s === Yx) return 'sqrt';
            if (s === Bx || s === Ux) return 'linear';
            if (s === Gx) return 'ordinal';
            if ((r || i || []).length > 2) return zO(s);
            if (void 0 !== r)
                return Rx(r)
                    ? zO(s)
                    : Ix(r)
                      ? 'utc'
                      : s !== Hx || (null == a && !cO(o))
                        ? 'linear'
                        : 'diverging';
            const c = e.map(({ value: t }) => t).filter((t) => void 0 !== t);
            return c.some(Rx)
                ? zO(s)
                : c.some(Ix)
                  ? 'utc'
                  : s !== Hx || (null == a && !cO(o))
                    ? 'linear'
                    : 'diverging';
        })(t, e, n);
        if (
            void 0 === n.type &&
            void 0 === n.domain &&
            void 0 === n.range &&
            null == n.interval &&
            'fx' !== t &&
            'fy' !== t &&
            (function ({ type: t }) {
                return 'ordinal' === t || 'point' === t || 'band' === t || t === LO;
            })({ type: r })
        ) {
            const n = e.map(({ value: t }) => t).filter((t) => void 0 !== t);
            n.some(Ix)
                ? Jx(
                      `Warning: some data associated with the ${t} scale are dates. Dates are typically associated with a "utc" or "time" scale rather than a "${WO(r)}" scale. If you are using a bar mark, you probably want a rect mark with the interval option instead; if you are using a group transform, you probably want a bin transform instead. If you want to treat this data as ordinal, you can specify the interval of the ${t} scale (e.g., d3.utcDay), or you can suppress this warning by setting the type of the ${t} scale to "${WO(r)}".`
                  )
                : n.some(Nx)
                  ? Jx(
                        `Warning: some data associated with the ${t} scale are strings that appear to be dates (e.g., YYYY-MM-DD). If these strings represent dates, you should parse them to Date objects. Dates are typically associated with a "utc" or "time" scale rather than a "${WO(r)}" scale. If you are using a bar mark, you probably want a rect mark with the interval option instead; if you are using a group transform, you probably want a bin transform instead. If you want to treat this data as ordinal, you can suppress this warning by setting the type of the ${t} scale to "${WO(r)}".`
                    )
                  : n.some(Wx) &&
                    Jx(
                        `Warning: some data associated with the ${t} scale are strings that appear to be numbers. If these strings represent numbers, you should parse or coerce them to numbers. Numbers are typically associated with a "linear" scale rather than a "${WO(r)}" scale. If you want to treat this data as ordinal, you can specify the interval of the ${t} scale (e.g., 1 for integers), or you can suppress this warning by setting the type of the ${t} scale to "${WO(r)}".`
                    );
        }
        switch (((n.type = r), r)) {
            case 'diverging':
            case 'diverging-sqrt':
            case 'diverging-pow':
            case 'diverging-log':
            case 'diverging-symlog':
            case 'cyclical':
            case 'sequential':
            case 'linear':
            case 'sqrt':
            case 'threshold':
            case 'quantile':
            case 'pow':
            case 'log':
            case 'symlog':
                n = HO(e, n, _x);
                break;
            case 'identity':
                switch (Vx.get(t)) {
                    case zx:
                        n = HO(e, n, _x);
                        break;
                    case Gx:
                        n = HO(e, n, YO);
                }
                break;
            case 'utc':
            case 'time':
                n = HO(e, n, Dx);
        }
        switch (r) {
            case 'diverging':
                return (function (t, e, n) {
                    return jO(t, U(), DO, e, n);
                })(t, e, n);
            case 'diverging-sqrt':
                return (function (t, e, n) {
                    return _O(t, e, { ...n, exponent: 0.5 });
                })(t, e, n);
            case 'diverging-pow':
                return _O(t, e, n);
            case 'diverging-log':
                return (function (
                    t,
                    e,
                    { base: n = 10, pivot: r = 1, domain: i = mO(e, r < 0 ? yx : vx), ...o }
                ) {
                    return jO(t, G().base((n = +n)), $O, e, { domain: i, pivot: r, ...o });
                })(t, e, n);
            case 'diverging-symlog':
                return MO(t, e, n);
            case 'categorical':
            case 'ordinal':
            case LO:
                return CO(t, e, n);
            case 'cyclical':
            case 'sequential':
            case 'linear':
                return (function (t, e, n) {
                    return pO(t, E(), e, n);
                })(t, e, n);
            case 'sqrt':
                return (function (t, e, n) {
                    return vO(t, e, { ...n, exponent: 0.5 });
                })(t, e, n);
            case 'threshold':
                return yO(t, 0, n);
            case 'quantile':
                return (function (
                    t,
                    e,
                    {
                        range: n,
                        quantiles: r = void 0 === n ? 5 : (n = [...n]).length,
                        n: i = r,
                        scheme: o = 'rdylbu',
                        domain: a = kO(e),
                        unknown: u,
                        interpolate: s,
                        reverse: c,
                    }
                ) {
                    return (
                        void 0 === n &&
                            (n = void 0 !== s ? C(s, i) : Vx.get(t) === Hx ? oO(o, i) : void 0),
                        a.length > 0 && (a = T(a, void 0 === n ? { length: i } : n).quantiles()),
                        yO(t, 0, { domain: a, range: n, reverse: c, unknown: u })
                    );
                })(t, e, n);
            case 'quantize':
                return (function (
                    t,
                    e,
                    {
                        range: n,
                        n: r = void 0 === n ? 5 : (n = [...n]).length,
                        scheme: i = 'rdylbu',
                        domain: o = gO(t, e),
                        unknown: a,
                        interpolate: u,
                        reverse: s,
                    }
                ) {
                    const [c, l] = R(o);
                    let f;
                    return (
                        void 0 === n
                            ? ((f = I(c, l, r)),
                              f[0] <= c && f.splice(0, 1),
                              f[f.length - 1] >= l && f.pop(),
                              (r = f.length + 1),
                              (n = void 0 !== u ? C(u, r) : Vx.get(t) === Hx ? oO(i, r) : void 0))
                            : ((f = C(N(c, l), r + 1).slice(1, -1)),
                              c instanceof Date && (f = f.map((t) => new Date(t)))),
                        Fx(Ex(o)) < 0 && f.reverse(),
                        yO(t, 0, { domain: f, range: n, reverse: s, unknown: a })
                    );
                })(t, e, n);
            case 'pow':
                return vO(t, e, n);
            case 'log':
                return (function (t, e, { base: n = 10, domain: r = OO(e), ...i }) {
                    return pO(t, L().base(n), e, { ...i, domain: r });
                })(t, e, n);
            case 'symlog':
                return (function (t, e, { constant: n = 1, ...r }) {
                    return pO(t, A().constant(n), e, r);
                })(t, e, n);
            case 'utc':
                return (function (t, e, n) {
                    return PO(t, K(), e, n);
                })(t, e, n);
            case 'time':
                return (function (t, e, n) {
                    return PO(t, q(), e, n);
                })(t, e, n);
            case 'point':
                return (function (t, e, { align: n = 0.5, padding: r = 0.5, ...i }) {
                    return TO(Q().align(n).padding(r), e, i, t);
                })(t, e, n);
            case 'band':
                return (function (
                    t,
                    e,
                    {
                        align: n = 0.5,
                        padding: r = 0.1,
                        paddingInner: i = r,
                        paddingOuter: o = 'fx' === t || 'fy' === t ? 0 : r,
                        ...a
                    }
                ) {
                    return TO(X().align(n).paddingInner(i).paddingOuter(o), e, a, t);
                })(t, e, n);
            case 'identity':
                return Vx.get(t) === zx ? { type: 'identity', scale: H() } : { type: 'identity' };
            case void 0:
                return;
            default:
                throw new Error(`unknown scale type: ${r}`);
        }
    })(t, void 0 === n ? void 0 : [{ hint: n }], { ...e });
}
function WO(t) {
    return 'symbol' == typeof t ? t.description : t;
}
const FO = { toString: () => 'projection' };
function zO(t) {
    switch (t) {
        case zx:
            return 'point';
        case Hx:
            return LO;
        default:
            return 'ordinal';
    }
}
function HO(t, { domain: e, ...n }, r) {
    for (const e of t) void 0 !== e.value && (e.value = r(e.value));
    return { domain: void 0 === e ? e : r(e), ...n };
}
function YO(t) {
    return Px(t, Zx);
}
function UO({
    scale: t,
    type: e,
    domain: n,
    range: r,
    interpolate: i,
    interval: o,
    transform: a,
    percent: u,
    pivot: s,
}) {
    if ('identity' === e) return { type: 'identity', apply: (t) => t, invert: (t) => t };
    const c = t.unknown ? t.unknown() : void 0;
    return {
        type: e,
        domain: Lx(n),
        ...(void 0 !== r && { range: Lx(r) }),
        ...(void 0 !== a && { transform: a }),
        ...(u && { percent: u }),
        ...(void 0 !== c && { unknown: c }),
        ...(void 0 !== o && { interval: o }),
        ...(void 0 !== i && { interpolate: i }),
        ...(t.clamp && { clamp: t.clamp() }),
        ...(void 0 !== s && { pivot: s, symmetric: !1 }),
        ...(t.base && { base: t.base() }),
        ...(t.exponent && { exponent: t.exponent() }),
        ...(t.constant && { constant: t.constant() }),
        ...(t.align && { align: t.align(), round: t.round() }),
        ...(t.padding &&
            (t.paddingInner
                ? { paddingInner: t.paddingInner(), paddingOuter: t.paddingOuter() }
                : { padding: t.padding() })),
        ...(t.bandwidth && { bandwidth: t.bandwidth(), step: t.step() }),
        apply: (e) => t(e),
        ...(t.invert && { invert: (e) => t.invert(e) }),
    };
}
function BO(t) {
    try {
        var e = Object.keys(t)[0];
        return (function (t = {}) {
            let e;
            for (const n in t)
                if (Vx.has(n) && Ax(t[n])) {
                    if (void 0 !== e)
                        throw new Error('ambiguous scale definition; multiple scales found');
                    e = UO(NO(n, t[n]));
                }
            if (void 0 === e) throw new Error('invalid scale definition; no scale found');
            return e;
        })(
            ((n = {}),
            (r = e),
            (i = Object.assign(Object.assign({}, t[e]), { clamp: !0 })),
            (r = ln(r)) in n
                ? Object.defineProperty(n, r, {
                      value: i,
                      enumerable: !0,
                      configurable: !0,
                      writable: !0,
                  })
                : (n[r] = i),
            n)
        );
    } catch (t) {
        return null;
    }
    var n, r, i;
}
var GO = (function () {
    function t(e) {
        (nn(this, t), (this.calendar = e));
    }
    return (
        on(t, [
            {
                key: 'populate',
                value: function () {
                    var t = this.calendar,
                        n = t.options.options,
                        r = n.scale,
                        i = n.subDomain,
                        o = BO(r);
                    t.calendarPainter.root
                        .selectAll('.ch-domain')
                        .selectAll('svg')
                        .selectAll('g')
                        .data(function (e) {
                            return t.domainCollection.get(e) || [];
                        })
                        .call(function (t) {
                            var e, n, i, a;
                            ((e = t.select('rect')),
                                (n = o),
                                (i = r),
                                (a = 'v'),
                                Object.entries(
                                    (function (t, e) {
                                        var n = {};
                                        return (
                                            e.hasOwnProperty('opacity')
                                                ? ((n.fill = function () {
                                                      return e.opacity.baseColor || 'red';
                                                  }),
                                                  (n['fill-opacity'] = function (e) {
                                                      return null == t ? void 0 : t.apply(e);
                                                  }))
                                                : (n.fill = function (e) {
                                                      return 'string' == typeof e &&
                                                          (null == e ? void 0 : e.startsWith('#'))
                                                          ? e
                                                          : null == t
                                                            ? void 0
                                                            : t.apply(e);
                                                  }),
                                            n
                                        );
                                    })(n, i)
                                ).forEach(function (t) {
                                    var n = an(t, 2),
                                        r = n[0],
                                        i = n[1];
                                    return e.style(r, function (t) {
                                        return i(a ? t[a] : t);
                                    });
                                }));
                        })
                        .call(function (n) {
                            n.select('text')
                                .attr('style', function (t) {
                                    var n =
                                            e(null == o ? void 0 : o.apply(t.v)).l > 60
                                                ? '#000'
                                                : '#fff',
                                        r = i.color || (t.v ? n : null);
                                    return (
                                        Pb(r) &&
                                            (r = r(t.t, t.v, null == o ? void 0 : o.apply(t.v))),
                                        r ? 'fill: '.concat(r, ';') : null
                                    );
                                })
                                .text(function (e, n, r) {
                                    return t.dateHelper.format(e.t, i.label, e.v, r[n]);
                                });
                        })
                        .call(function () {
                            t.eventEmitter.emit('fill');
                        });
                },
            },
        ]),
        t
    );
})();
function VO(t, e) {
    return t === e || (t != t && e != e);
}
function qO(t, e) {
    for (var n = t.length; n--; ) if (VO(t[n][0], e)) return n;
    return -1;
}
var KO = Array.prototype.splice;
function ZO(t) {
    var e = -1,
        n = null == t ? 0 : t.length;
    for (this.clear(); ++e < n; ) {
        var r = t[e];
        this.set(r[0], r[1]);
    }
}
((ZO.prototype.clear = function () {
    ((this.__data__ = []), (this.size = 0));
}),
    (ZO.prototype.delete = function (t) {
        var e = this.__data__,
            n = qO(e, t);
        return !(n < 0) && (n == e.length - 1 ? e.pop() : KO.call(e, n, 1), --this.size, !0);
    }),
    (ZO.prototype.get = function (t) {
        var e = this.__data__,
            n = qO(e, t);
        return n < 0 ? void 0 : e[n][1];
    }),
    (ZO.prototype.has = function (t) {
        return qO(this.__data__, t) > -1;
    }),
    (ZO.prototype.set = function (t, e) {
        var n = this.__data__,
            r = qO(n, t);
        return (r < 0 ? (++this.size, n.push([t, e])) : (n[r][1] = e), this);
    }));
var JO = xb['__core-js_shared__'],
    QO = (function () {
        var t = /[^.]+$/.exec((JO && JO.keys && JO.keys.IE_PROTO) || '');
        return t ? 'Symbol(src)_1.' + t : '';
    })();
var XO = Function.prototype.toString;
function tk(t) {
    if (null != t) {
        try {
            return XO.call(t);
        } catch (t) {}
        try {
            return t + '';
        } catch (t) {}
    }
    return '';
}
var ek = /^\[object .+?Constructor\]$/,
    nk = Function.prototype,
    rk = Object.prototype,
    ik = nk.toString,
    ok = rk.hasOwnProperty,
    ak = RegExp(
        '^' +
            ik
                .call(ok)
                .replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
                .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') +
            '$'
    );
function uk(t) {
    return !(!Eb(t) || ((e = t), QO && QO in e)) && (Pb(t) ? ak : ek).test(tk(t));
    var e;
}
function sk(t, e) {
    var n = (function (t, e) {
        return null == t ? void 0 : t[e];
    })(t, e);
    return uk(n) ? n : void 0;
}
var ck = sk(xb, 'Map'),
    lk = sk(Object, 'create');
var fk = Object.prototype.hasOwnProperty;
var hk = Object.prototype.hasOwnProperty;
function dk(t) {
    var e = -1,
        n = null == t ? 0 : t.length;
    for (this.clear(); ++e < n; ) {
        var r = t[e];
        this.set(r[0], r[1]);
    }
}
function pk(t, e) {
    var n,
        r,
        i = t.__data__;
    return (
        'string' == (r = typeof (n = e)) || 'number' == r || 'symbol' == r || 'boolean' == r
            ? '__proto__' !== n
            : null === n
    )
        ? i['string' == typeof e ? 'string' : 'hash']
        : i.map;
}
function vk(t) {
    var e = -1,
        n = null == t ? 0 : t.length;
    for (this.clear(); ++e < n; ) {
        var r = t[e];
        this.set(r[0], r[1]);
    }
}
((dk.prototype.clear = function () {
    ((this.__data__ = lk ? lk(null) : {}), (this.size = 0));
}),
    (dk.prototype.delete = function (t) {
        var e = this.has(t) && delete this.__data__[t];
        return ((this.size -= e ? 1 : 0), e);
    }),
    (dk.prototype.get = function (t) {
        var e = this.__data__;
        if (lk) {
            var n = e[t];
            return '__lodash_hash_undefined__' === n ? void 0 : n;
        }
        return fk.call(e, t) ? e[t] : void 0;
    }),
    (dk.prototype.has = function (t) {
        var e = this.__data__;
        return lk ? void 0 !== e[t] : hk.call(e, t);
    }),
    (dk.prototype.set = function (t, e) {
        var n = this.__data__;
        return (
            (this.size += this.has(t) ? 0 : 1),
            (n[t] = lk && void 0 === e ? '__lodash_hash_undefined__' : e),
            this
        );
    }),
    (vk.prototype.clear = function () {
        ((this.size = 0),
            (this.__data__ = { hash: new dk(), map: new (ck || ZO)(), string: new dk() }));
    }),
    (vk.prototype.delete = function (t) {
        var e = pk(this, t).delete(t);
        return ((this.size -= e ? 1 : 0), e);
    }),
    (vk.prototype.get = function (t) {
        return pk(this, t).get(t);
    }),
    (vk.prototype.has = function (t) {
        return pk(this, t).has(t);
    }),
    (vk.prototype.set = function (t, e) {
        var n = pk(this, t),
            r = n.size;
        return (n.set(t, e), (this.size += n.size == r ? 0 : 1), this);
    }));
function yk(t) {
    var e = (this.__data__ = new ZO(t));
    this.size = e.size;
}
((yk.prototype.clear = function () {
    ((this.__data__ = new ZO()), (this.size = 0));
}),
    (yk.prototype.delete = function (t) {
        var e = this.__data__,
            n = e.delete(t);
        return ((this.size = e.size), n);
    }),
    (yk.prototype.get = function (t) {
        return this.__data__.get(t);
    }),
    (yk.prototype.has = function (t) {
        return this.__data__.has(t);
    }),
    (yk.prototype.set = function (t, e) {
        var n = this.__data__;
        if (n instanceof ZO) {
            var r = n.__data__;
            if (!ck || r.length < 199) return (r.push([t, e]), (this.size = ++n.size), this);
            n = this.__data__ = new vk(r);
        }
        return (n.set(t, e), (this.size = n.size), this);
    }));
var mk = (function () {
        try {
            var t = sk(Object, 'defineProperty');
            return (t({}, '', {}), t);
        } catch (t) {}
    })(),
    gk = mk;
function wk(t, e, n) {
    '__proto__' == e && gk
        ? gk(t, e, { configurable: !0, enumerable: !0, value: n, writable: !0 })
        : (t[e] = n);
}
function bk(t, e, n) {
    ((void 0 !== n && !VO(t[e], n)) || (void 0 === n && !(e in t))) && wk(t, e, n);
}
var xk,
    Ok = function (t, e, n) {
        for (var r = -1, i = Object(t), o = n(t), a = o.length; a--; ) {
            var u = o[xk ? a : ++r];
            if (!1 === e(i[u], u, i)) break;
        }
        return t;
    },
    kk = Ok,
    Sk = 'object' == typeof exports && exports && !exports.nodeType && exports,
    jk = Sk && 'object' == typeof module && module && !module.nodeType && module,
    _k = jk && jk.exports === Sk ? xb.Buffer : void 0,
    Mk = _k ? _k.allocUnsafe : void 0;
var Dk = xb.Uint8Array;
function $k(t, e) {
    var n,
        r,
        i = e
            ? ((n = t.buffer), (r = new n.constructor(n.byteLength)), new Dk(r).set(new Dk(n)), r)
            : t.buffer;
    return new t.constructor(i, t.byteOffset, t.length);
}
var Ek = Object.create,
    Pk = (function () {
        function t() {}
        return function (e) {
            if (!Eb(e)) return {};
            if (Ek) return Ek(e);
            t.prototype = e;
            var n = new t();
            return ((t.prototype = void 0), n);
        };
    })();
function Lk(t, e) {
    return function (n) {
        return t(e(n));
    };
}
var Ak = Lk(Object.getPrototypeOf, Object),
    Ck = Object.prototype;
function Tk(t) {
    var e = t && t.constructor;
    return t === (('function' == typeof e && e.prototype) || Ck);
}
function Rk(t) {
    return null != t && 'object' == typeof t;
}
function Ik(t) {
    return Rk(t) && '[object Arguments]' == $b(t);
}
var Nk = Object.prototype,
    Wk = Nk.hasOwnProperty,
    Fk = Nk.propertyIsEnumerable,
    zk = Ik(
        (function () {
            return arguments;
        })()
    )
        ? Ik
        : function (t) {
              return Rk(t) && Wk.call(t, 'callee') && !Fk.call(t, 'callee');
          };
function Hk(t) {
    return 'number' == typeof t && t > -1 && t % 1 == 0 && t <= 9007199254740991;
}
function Yk(t) {
    return null != t && Hk(t.length) && !Pb(t);
}
var Uk = 'object' == typeof exports && exports && !exports.nodeType && exports,
    Bk = Uk && 'object' == typeof module && module && !module.nodeType && module,
    Gk = Bk && Bk.exports === Uk ? xb.Buffer : void 0,
    Vk =
        (Gk ? Gk.isBuffer : void 0) ||
        function () {
            return !1;
        },
    qk = Function.prototype,
    Kk = Object.prototype,
    Zk = qk.toString,
    Jk = Kk.hasOwnProperty,
    Qk = Zk.call(Object);
var Xk = {};
((Xk['[object Float32Array]'] =
    Xk['[object Float64Array]'] =
    Xk['[object Int8Array]'] =
    Xk['[object Int16Array]'] =
    Xk['[object Int32Array]'] =
    Xk['[object Uint8Array]'] =
    Xk['[object Uint8ClampedArray]'] =
    Xk['[object Uint16Array]'] =
    Xk['[object Uint32Array]'] =
        !0),
    (Xk['[object Arguments]'] =
        Xk['[object Array]'] =
        Xk['[object ArrayBuffer]'] =
        Xk['[object Boolean]'] =
        Xk['[object DataView]'] =
        Xk['[object Date]'] =
        Xk['[object Error]'] =
        Xk['[object Function]'] =
        Xk['[object Map]'] =
        Xk['[object Number]'] =
        Xk['[object Object]'] =
        Xk['[object RegExp]'] =
        Xk['[object Set]'] =
        Xk['[object String]'] =
        Xk['[object WeakMap]'] =
            !1));
var tS,
    eS = 'object' == typeof exports && exports && !exports.nodeType && exports,
    nS = eS && 'object' == typeof module && module && !module.nodeType && module,
    rS = nS && nS.exports === eS && wb.process,
    iS = (function () {
        try {
            var t = nS && nS.require && nS.require('util').types;
            return t || (rS && rS.binding && rS.binding('util'));
        } catch (t) {}
    })(),
    oS = iS && iS.isTypedArray,
    aS = oS
        ? ((tS = oS),
          function (t) {
              return tS(t);
          })
        : function (t) {
              return Rk(t) && Hk(t.length) && !!Xk[$b(t)];
          };
function uS(t, e) {
    if (('constructor' !== e || 'function' != typeof t[e]) && '__proto__' != e) return t[e];
}
var sS = Object.prototype.hasOwnProperty;
function cS(t, e, n) {
    var r = t[e];
    (sS.call(t, e) && VO(r, n) && (void 0 !== n || e in t)) || wk(t, e, n);
}
var lS = /^(?:0|[1-9]\d*)$/;
function fS(t, e) {
    var n = typeof t;
    return (
        !!(e = null == e ? 9007199254740991 : e) &&
        ('number' == n || ('symbol' != n && lS.test(t))) &&
        t > -1 &&
        t % 1 == 0 &&
        t < e
    );
}
var hS = Object.prototype.hasOwnProperty;
function dS(t, e) {
    var n = yv(t),
        r = !n && zk(t),
        i = !n && !r && Vk(t),
        o = !n && !r && !i && aS(t),
        a = n || r || i || o,
        u = a
            ? (function (t, e) {
                  for (var n = -1, r = Array(t); ++n < t; ) r[n] = e(n);
                  return r;
              })(t.length, String)
            : [],
        s = u.length;
    for (var c in t)
        (!e && !hS.call(t, c)) ||
            (a &&
                ('length' == c ||
                    (i && ('offset' == c || 'parent' == c)) ||
                    (o && ('buffer' == c || 'byteLength' == c || 'byteOffset' == c)) ||
                    fS(c, s))) ||
            u.push(c);
    return u;
}
var pS = Object.prototype.hasOwnProperty;
function vS(t) {
    if (!Eb(t))
        return (function (t) {
            var e = [];
            if (null != t) for (var n in Object(t)) e.push(n);
            return e;
        })(t);
    var e = Tk(t),
        n = [];
    for (var r in t) ('constructor' != r || (!e && pS.call(t, r))) && n.push(r);
    return n;
}
function yS(t) {
    return Yk(t) ? dS(t, !0) : vS(t);
}
function mS(t) {
    return (function (t, e, n, r) {
        var i = !n;
        n || (n = {});
        for (var o = -1, a = e.length; ++o < a; ) {
            var u = e[o],
                s = r ? r(n[u], t[u], u, n, t) : void 0;
            (void 0 === s && (s = t[u]), i ? wk(n, u, s) : cS(n, u, s));
        }
        return n;
    })(t, yS(t));
}
function gS(t, e, n, r, i, o, a) {
    var u = uS(t, n),
        s = uS(e, n),
        c = a.get(s);
    if (c) bk(t, n, c);
    else {
        var l,
            f = o ? o(u, s, n + '', t, e, a) : void 0,
            h = void 0 === f;
        if (h) {
            var d = yv(s),
                p = !d && Vk(s),
                v = !d && !p && aS(s);
            ((f = s),
                d || p || v
                    ? yv(u)
                        ? (f = u)
                        : Rk((l = u)) && Yk(l)
                          ? (f = (function (t, e) {
                                var n = -1,
                                    r = t.length;
                                for (e || (e = Array(r)); ++n < r; ) e[n] = t[n];
                                return e;
                            })(u))
                          : p
                            ? ((h = !1),
                              (f = (function (t, e) {
                                  if (e) return t.slice();
                                  var n = t.length,
                                      r = Mk ? Mk(n) : new t.constructor(n);
                                  return (t.copy(r), r);
                              })(s, !0)))
                            : v
                              ? ((h = !1), (f = $k(s, !0)))
                              : (f = [])
                    : (function (t) {
                            if (!Rk(t) || '[object Object]' != $b(t)) return !1;
                            var e = Ak(t);
                            if (null === e) return !0;
                            var n = Jk.call(e, 'constructor') && e.constructor;
                            return 'function' == typeof n && n instanceof n && Zk.call(n) == Qk;
                        })(s) || zk(s)
                      ? ((f = u),
                        zk(u)
                            ? (f = mS(u))
                            : (Eb(u) && !Pb(u)) ||
                              (f = (function (t) {
                                  return 'function' != typeof t.constructor || Tk(t)
                                      ? {}
                                      : Pk(Ak(t));
                              })(s)))
                      : (h = !1));
        }
        (h && (a.set(s, f), i(f, s, r, o, a), a.delete(s)), bk(t, n, f));
    }
}
function wS(t, e, n, r, i) {
    t !== e &&
        kk(
            e,
            function (o, a) {
                if ((i || (i = new yk()), Eb(o))) gS(t, e, a, n, wS, r, i);
                else {
                    var u = r ? r(uS(t, a), o, a + '', t, e, i) : void 0;
                    (void 0 === u && (u = o), bk(t, a, u));
                }
            },
            yS
        );
}
function bS(t) {
    return t;
}
var xS = Math.max;
var OS = gk
        ? function (t, e) {
              return gk(t, 'toString', {
                  configurable: !0,
                  enumerable: !1,
                  value:
                      ((n = e),
                      function () {
                          return n;
                      }),
                  writable: !0,
              });
              var n;
          }
        : bS,
    kS = OS,
    SS = Date.now;
var jS = (function (t) {
        var e = 0,
            n = 0;
        return function () {
            var r = SS(),
                i = 16 - (r - n);
            if (((n = r), i > 0)) {
                if (++e >= 800) return arguments[0];
            } else e = 0;
            return t.apply(void 0, arguments);
        };
    })(kS),
    _S = jS;
function MS(t, e) {
    return _S(
        (function (t, e, n) {
            return (
                (e = xS(void 0 === e ? t.length - 1 : e, 0)),
                function () {
                    for (
                        var r = arguments, i = -1, o = xS(r.length - e, 0), a = Array(o);
                        ++i < o;

                    )
                        a[i] = r[e + i];
                    i = -1;
                    for (var u = Array(e + 1); ++i < e; ) u[i] = r[i];
                    return (
                        (u[e] = n(a)),
                        (function (t, e, n) {
                            switch (n.length) {
                                case 0:
                                    return t.call(e);
                                case 1:
                                    return t.call(e, n[0]);
                                case 2:
                                    return t.call(e, n[0], n[1]);
                                case 3:
                                    return t.call(e, n[0], n[1], n[2]);
                            }
                            return t.apply(e, n);
                        })(t, this, u)
                    );
                }
            );
        })(t, e, bS),
        t + ''
    );
}
var DS,
    $S =
        ((DS = function (t, e, n, r) {
            wS(t, e, n, r);
        }),
        MS(function (t, e) {
            var n = -1,
                r = e.length,
                i = r > 1 ? e[r - 1] : void 0,
                o = r > 2 ? e[2] : void 0;
            for (
                i = DS.length > 3 && 'function' == typeof i ? (r--, i) : void 0,
                    o &&
                        (function (t, e, n) {
                            if (!Eb(n)) return !1;
                            var r = typeof e;
                            return (
                                !!('number' == r
                                    ? Yk(n) && fS(e, n.length)
                                    : 'string' == r && (e in n)) && VO(n[e], t)
                            );
                        })(e[0], e[1], o) &&
                        ((i = r < 3 ? void 0 : i), (r = 1)),
                    t = Object(t);
                ++n < r;

            ) {
                var a = e[n];
                a && DS(t, a, n, i);
            }
            return t;
        })),
    ES = $S;
function PS(t) {
    var e = -1,
        n = null == t ? 0 : t.length;
    for (this.__data__ = new vk(); ++e < n; ) this.add(t[e]);
}
function LS(t, e) {
    for (var n = -1, r = null == t ? 0 : t.length; ++n < r; ) if (e(t[n], n, t)) return !0;
    return !1;
}
((PS.prototype.add = PS.prototype.push =
    function (t) {
        return (this.__data__.set(t, '__lodash_hash_undefined__'), this);
    }),
    (PS.prototype.has = function (t) {
        return this.__data__.has(t);
    }));
function AS(t, e, n, r, i, o) {
    var a = 1 & n,
        u = t.length,
        s = e.length;
    if (u != s && !(a && s > u)) return !1;
    var c = o.get(t),
        l = o.get(e);
    if (c && l) return c == e && l == t;
    var f = -1,
        h = !0,
        d = 2 & n ? new PS() : void 0;
    for (o.set(t, e), o.set(e, t); ++f < u; ) {
        var p = t[f],
            v = e[f];
        if (r) var y = a ? r(v, p, f, e, t, o) : r(p, v, f, t, e, o);
        if (void 0 !== y) {
            if (y) continue;
            h = !1;
            break;
        }
        if (d) {
            if (
                !LS(e, function (t, e) {
                    if (((a = e), !d.has(a) && (p === t || i(p, t, n, r, o)))) return d.push(e);
                    var a;
                })
            ) {
                h = !1;
                break;
            }
        } else if (p !== v && !i(p, v, n, r, o)) {
            h = !1;
            break;
        }
    }
    return (o.delete(t), o.delete(e), h);
}
function CS(t) {
    var e = -1,
        n = Array(t.size);
    return (
        t.forEach(function (t, r) {
            n[++e] = [r, t];
        }),
        n
    );
}
function TS(t) {
    var e = -1,
        n = Array(t.size);
    return (
        t.forEach(function (t) {
            n[++e] = t;
        }),
        n
    );
}
var RS = Ob ? Ob.prototype : void 0,
    IS = RS ? RS.valueOf : void 0;
var NS = Object.prototype.propertyIsEnumerable,
    WS = Object.getOwnPropertySymbols,
    FS = WS
        ? function (t) {
              return null == t
                  ? []
                  : ((t = Object(t)),
                    (function (t, e) {
                        for (var n = -1, r = null == t ? 0 : t.length, i = 0, o = []; ++n < r; ) {
                            var a = t[n];
                            e(a, n, t) && (o[i++] = a);
                        }
                        return o;
                    })(WS(t), function (e) {
                        return NS.call(t, e);
                    }));
          }
        : function () {
              return [];
          },
    zS = FS,
    HS = Lk(Object.keys, Object),
    YS = Object.prototype.hasOwnProperty;
function US(t) {
    return Yk(t)
        ? dS(t)
        : (function (t) {
              if (!Tk(t)) return HS(t);
              var e = [];
              for (var n in Object(t)) YS.call(t, n) && 'constructor' != n && e.push(n);
              return e;
          })(t);
}
function BS(t) {
    return (function (t, e, n) {
        var r = e(t);
        return yv(t)
            ? r
            : (function (t, e) {
                  for (var n = -1, r = e.length, i = t.length; ++n < r; ) t[i + n] = e[n];
                  return t;
              })(r, n(t));
    })(t, US, zS);
}
var GS = Object.prototype.hasOwnProperty;
var VS = sk(xb, 'DataView'),
    qS = sk(xb, 'Promise'),
    KS = sk(xb, 'Set'),
    ZS = sk(xb, 'WeakMap'),
    JS = '[object Map]',
    QS = '[object Promise]',
    XS = '[object Set]',
    tj = '[object WeakMap]',
    ej = '[object DataView]',
    nj = tk(VS),
    rj = tk(ck),
    ij = tk(qS),
    oj = tk(KS),
    aj = tk(ZS),
    uj = $b;
((VS && uj(new VS(new ArrayBuffer(1))) != ej) ||
    (ck && uj(new ck()) != JS) ||
    (qS && uj(qS.resolve()) != QS) ||
    (KS && uj(new KS()) != XS) ||
    (ZS && uj(new ZS()) != tj)) &&
    (uj = function (t) {
        var e = $b(t),
            n = '[object Object]' == e ? t.constructor : void 0,
            r = n ? tk(n) : '';
        if (r)
            switch (r) {
                case nj:
                    return ej;
                case rj:
                    return JS;
                case ij:
                    return QS;
                case oj:
                    return XS;
                case aj:
                    return tj;
            }
        return e;
    });
var sj = uj,
    cj = '[object Arguments]',
    lj = '[object Array]',
    fj = '[object Object]',
    hj = Object.prototype.hasOwnProperty;
function dj(t, e, n, r, i, o) {
    var a = yv(t),
        u = yv(e),
        s = a ? lj : sj(t),
        c = u ? lj : sj(e),
        l = (s = s == cj ? fj : s) == fj,
        f = (c = c == cj ? fj : c) == fj,
        h = s == c;
    if (h && Vk(t)) {
        if (!Vk(e)) return !1;
        ((a = !0), (l = !1));
    }
    if (h && !l)
        return (
            o || (o = new yk()),
            a || aS(t)
                ? AS(t, e, n, r, i, o)
                : (function (t, e, n, r, i, o, a) {
                      switch (n) {
                          case '[object DataView]':
                              if (t.byteLength != e.byteLength || t.byteOffset != e.byteOffset)
                                  return !1;
                              ((t = t.buffer), (e = e.buffer));
                          case '[object ArrayBuffer]':
                              return !(t.byteLength != e.byteLength || !o(new Dk(t), new Dk(e)));
                          case '[object Boolean]':
                          case '[object Date]':
                          case '[object Number]':
                              return VO(+t, +e);
                          case '[object Error]':
                              return t.name == e.name && t.message == e.message;
                          case '[object RegExp]':
                          case '[object String]':
                              return t == e + '';
                          case '[object Map]':
                              var u = CS;
                          case '[object Set]':
                              var s = 1 & r;
                              if ((u || (u = TS), t.size != e.size && !s)) return !1;
                              var c = a.get(t);
                              if (c) return c == e;
                              ((r |= 2), a.set(t, e));
                              var l = AS(u(t), u(e), r, i, o, a);
                              return (a.delete(t), l);
                          case '[object Symbol]':
                              if (IS) return IS.call(t) == IS.call(e);
                      }
                      return !1;
                  })(t, e, s, n, r, i, o)
        );
    if (!(1 & n)) {
        var d = l && hj.call(t, '__wrapped__'),
            p = f && hj.call(e, '__wrapped__');
        if (d || p) {
            var v = d ? t.value() : t,
                y = p ? e.value() : e;
            return (o || (o = new yk()), i(v, y, n, r, o));
        }
    }
    return (
        !!h &&
        (o || (o = new yk()),
        (function (t, e, n, r, i, o) {
            var a = 1 & n,
                u = BS(t),
                s = u.length;
            if (s != BS(e).length && !a) return !1;
            for (var c = s; c--; ) {
                var l = u[c];
                if (!(a ? l in e : GS.call(e, l))) return !1;
            }
            var f = o.get(t),
                h = o.get(e);
            if (f && h) return f == e && h == t;
            var d = !0;
            (o.set(t, e), o.set(e, t));
            for (var p = a; ++c < s; ) {
                var v = t[(l = u[c])],
                    y = e[l];
                if (r) var m = a ? r(y, v, l, e, t, o) : r(v, y, l, t, e, o);
                if (!(void 0 === m ? v === y || i(v, y, n, r, o) : m)) {
                    d = !1;
                    break;
                }
                p || (p = 'constructor' == l);
            }
            if (d && !p) {
                var g = t.constructor,
                    w = e.constructor;
                g == w ||
                    !('constructor' in t) ||
                    !('constructor' in e) ||
                    ('function' == typeof g &&
                        g instanceof g &&
                        'function' == typeof w &&
                        w instanceof w) ||
                    (d = !1);
            }
            return (o.delete(t), o.delete(e), d);
        })(t, e, n, r, i, o))
    );
}
function pj(t, e, n, r, i) {
    return (
        t === e ||
        (null == t || null == e || (!Rk(t) && !Rk(e)) ? t != t && e != e : dj(t, e, n, r, pj, i))
    );
}
function vj(t, e) {
    return pj(t, e);
}
var yj = Object.prototype.hasOwnProperty;
function mj(t, e) {
    return null != t && yj.call(t, e);
}
function gj(t) {
    return 'symbol' == typeof t || (Rk(t) && '[object Symbol]' == $b(t));
}
var wj = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    bj = /^\w*$/;
function xj(t, e) {
    if ('function' != typeof t || (null != e && 'function' != typeof e))
        throw new TypeError('Expected a function');
    var n = function () {
        var r = arguments,
            i = e ? e.apply(this, r) : r[0],
            o = n.cache;
        if (o.has(i)) return o.get(i);
        var a = t.apply(this, r);
        return ((n.cache = o.set(i, a) || o), a);
    };
    return ((n.cache = new (xj.Cache || vk)()), n);
}
xj.Cache = vk;
var Oj =
        /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,
    kj = /\\(\\)?/g,
    Sj = (function (t) {
        var e = xj(t, function (t) {
                return (500 === n.size && n.clear(), t);
            }),
            n = e.cache;
        return e;
    })(function (t) {
        var e = [];
        return (
            46 === t.charCodeAt(0) && e.push(''),
            t.replace(Oj, function (t, n, r, i) {
                e.push(r ? i.replace(kj, '$1') : n || t);
            }),
            e
        );
    }),
    jj = Sj;
var _j = Ob ? Ob.prototype : void 0,
    Mj = _j ? _j.toString : void 0;
function Dj(t) {
    if ('string' == typeof t) return t;
    if (yv(t))
        return (
            (function (t, e) {
                for (var n = -1, r = null == t ? 0 : t.length, i = Array(r); ++n < r; )
                    i[n] = e(t[n], n, t);
                return i;
            })(t, Dj) + ''
        );
    if (gj(t)) return Mj ? Mj.call(t) : '';
    var e = t + '';
    return '0' == e && 1 / t == -1 / 0 ? '-0' : e;
}
function $j(t, e) {
    return yv(t)
        ? t
        : (function (t, e) {
                if (yv(t)) return !1;
                var n = typeof t;
                return (
                    !('number' != n && 'symbol' != n && 'boolean' != n && null != t && !gj(t)) ||
                    bj.test(t) ||
                    !wj.test(t) ||
                    (null != e && t in Object(e))
                );
            })(t, e)
          ? [t]
          : jj(
                (function (t) {
                    return null == t ? '' : Dj(t);
                })(t)
            );
}
function Ej(t) {
    if ('string' == typeof t || gj(t)) return t;
    var e = t + '';
    return '0' == e && 1 / t == -1 / 0 ? '-0' : e;
}
function Pj(t, e) {
    return (
        null != t &&
        (function (t, e, n) {
            for (var r = -1, i = (e = $j(e, t)).length, o = !1; ++r < i; ) {
                var a = Ej(e[r]);
                if (!(o = null != t && n(t, a))) break;
                t = t[a];
            }
            return o || ++r != i
                ? o
                : !!(i = null == t ? 0 : t.length) && Hk(i) && fS(a, i) && (yv(t) || zk(t));
        })(t, e, mj)
    );
}
function Lj(t, e, n) {
    var r =
        null == t
            ? void 0
            : (function (t, e) {
                  for (var n = 0, r = (e = $j(e, t)).length; null != t && n < r; )
                      t = t[Ej(e[n++])];
                  return n && n == r ? t : void 0;
              })(t, e);
    return void 0 === r ? n : r;
}
function Aj(t, e, n) {
    return null == t
        ? t
        : (function (t, e, n, r) {
              if (!Eb(t)) return t;
              for (
                  var i = -1, o = (e = $j(e, t)).length, a = o - 1, u = t;
                  null != u && ++i < o;

              ) {
                  var s = Ej(e[i]),
                      c = n;
                  if ('__proto__' === s || 'constructor' === s || 'prototype' === s) return t;
                  if (i != a) {
                      var l = u[s];
                      void 0 === (c = r ? r(l, s, u) : void 0) &&
                          (c = Eb(l) ? l : fS(e[i + 1]) ? [] : {});
                  }
                  (cS(u, s, c), (u = u[s]));
              }
              return t;
          })(t, e, n);
}
var Cj,
    Tj,
    Rj = {
        range: function (t) {
            return Math.max(+t, 1);
        },
        'date.highlight': function (t) {
            return mv(t);
        },
        'subDomain.label': function (t) {
            return ((function (t) {
                return 'string' == typeof t || (!yv(t) && Rk(t) && '[object String]' == $b(t));
            })(t) &&
                '' !== t) ||
                Pb(t)
                ? t
                : null;
        },
    },
    Ij = (function () {
        function t() {
            var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : Rj;
            (nn(this, t),
                (this.preProcessors = e),
                (this.options = {
                    itemSelector: '#cal-heatmap',
                    range: 12,
                    domain: {
                        type: 'hour',
                        gutter: 4,
                        padding: [0, 0, 0, 0],
                        dynamicDimension: !0,
                        sort: 'asc',
                        label: {
                            text: void 0,
                            position: 'bottom',
                            textAlign: 'middle',
                            offset: { x: 0, y: 0 },
                            rotate: null,
                            width: 100,
                            height: 25,
                        },
                    },
                    subDomain: {
                        type: 'minute',
                        width: 10,
                        height: 10,
                        gutter: 2,
                        radius: 0,
                        label: null,
                        color: void 0,
                        sort: 'asc',
                    },
                    date: {
                        start: new Date(),
                        min: void 0,
                        max: void 0,
                        highlight: [],
                        locale: 'en',
                        timezone: void 0,
                    },
                    verticalOrientation: !1,
                    data: {
                        source: '',
                        type: 'json',
                        requestInit: {},
                        x: '',
                        y: '',
                        groupY: 'sum',
                        defaultValue: null,
                    },
                    scale: void 0,
                    animationDuration: 200,
                    theme: 'light',
                    x: { domainHorizontalLabelWidth: 0, domainVerticalLabelHeight: 0 },
                }));
        }
        return (
            on(t, [
                {
                    key: 'set',
                    value: function (t, e) {
                        return (
                            !(!Pj(this.options, t) || vj(Lj(this.options, t), e)) &&
                            (Aj(
                                this.options,
                                t,
                                Pj(this.preProcessors, t) ? Lj(this.preProcessors, t)(e) : e
                            ),
                            !0)
                        );
                    },
                },
                {
                    key: 'init',
                    value: function (t) {
                        var e = this;
                        this.options = Object.assign(
                            {},
                            ES(this.options, t, function (t, e) {
                                return Array.isArray(e) ? e : void 0;
                            })
                        );
                        var n = this.options;
                        (Object.keys(this.preProcessors).forEach(function (t) {
                            Aj(n, t, Lj(e.preProcessors, t)(Lj(n, t)));
                        }),
                            void 0 === n.scale && this.initScale(),
                            (n.x.domainVerticalLabelHeight = n.domain.label.height),
                            'top' === n.domain.label.position ||
                            'bottom' === n.domain.label.position
                                ? (n.x.domainHorizontalLabelWidth = 0)
                                : ((n.x.domainVerticalLabelHeight = 0),
                                  (n.x.domainHorizontalLabelWidth = n.domain.label.width)),
                            (null !== n.domain.label.text && '' !== n.domain.label.text) ||
                                ((n.x.domainVerticalLabelHeight = 0),
                                (n.x.domainHorizontalLabelWidth = 0)));
                    },
                },
                {
                    key: 'initScale',
                    value: function () {
                        this.options.scale = {
                            color: { scheme: 'YlOrBr', type: 'quantize', domain: Om },
                        };
                    },
                },
            ]),
            t
        );
    })(),
    Nj = Ir,
    Wj = _n,
    Fj = pn.RegExp,
    zj = Wj(function () {
        var t = Fj('a', 'y');
        return ((t.lastIndex = 2), null !== t.exec('abcd'));
    }),
    Hj =
        zj ||
        Wj(function () {
            return !Fj('a', 'y').sticky;
        }),
    Yj =
        zj ||
        Wj(function () {
            var t = Fj('^r', 'gy');
            return ((t.lastIndex = 2), null !== t.exec('str'));
        }),
    Uj = { BROKEN_CARET: Yj, MISSED_STICKY: Hj, UNSUPPORTED_Y: zj },
    Bj = _n,
    Gj = pn.RegExp,
    Vj = Bj(function () {
        var t = Gj('.', 's');
        return !(t.dotAll && t.test('\n') && 's' === t.flags);
    }),
    qj = _n,
    Kj = pn.RegExp,
    Zj = qj(function () {
        var t = Kj('(?<a>b)', 'g');
        return 'b' !== t.exec('b').groups.a || 'bc' !== 'b'.replace(t, '$<a>c');
    }),
    Jj = Fr,
    Qj = Ln,
    Xj = op,
    t_ = function () {
        var t = Nj(this),
            e = '';
        return (
            t.hasIndices && (e += 'd'),
            t.global && (e += 'g'),
            t.ignoreCase && (e += 'i'),
            t.multiline && (e += 'm'),
            t.dotAll && (e += 's'),
            t.unicode && (e += 'u'),
            t.unicodeSets && (e += 'v'),
            t.sticky && (e += 'y'),
            e
        );
    },
    e_ = Uj,
    n_ = Nh,
    r_ = vo.get,
    i_ = Vj,
    o_ = Zj,
    a_ = jn('native-string-replace', String.prototype.replace),
    u_ = RegExp.prototype.exec,
    s_ = u_,
    c_ = Qj(''.charAt),
    l_ = Qj(''.indexOf),
    f_ = Qj(''.replace),
    h_ = Qj(''.slice),
    d_ =
        ((Tj = /b*/g),
        Jj(u_, (Cj = /a/), 'a'),
        Jj(u_, Tj, 'a'),
        0 !== Cj.lastIndex || 0 !== Tj.lastIndex),
    p_ = e_.BROKEN_CARET,
    v_ = void 0 !== /()??/.exec('')[1];
(d_ || v_ || p_ || i_ || o_) &&
    (s_ = function (t) {
        var e,
            n,
            r,
            i,
            o,
            a,
            u,
            s = this,
            c = r_(s),
            l = Xj(t),
            f = c.raw;
        if (f)
            return (
                (f.lastIndex = s.lastIndex),
                (e = Jj(s_, f, l)),
                (s.lastIndex = f.lastIndex),
                e
            );
        var h = c.groups,
            d = p_ && s.sticky,
            p = Jj(t_, s),
            v = s.source,
            y = 0,
            m = l;
        if (
            (d &&
                ((p = f_(p, 'y', '')),
                -1 === l_(p, 'g') && (p += 'g'),
                (m = h_(l, s.lastIndex)),
                s.lastIndex > 0 &&
                    (!s.multiline || (s.multiline && '\n' !== c_(l, s.lastIndex - 1))) &&
                    ((v = '(?: ' + v + ')'), (m = ' ' + m), y++),
                (n = new RegExp('^(?:' + v + ')', p))),
            v_ && (n = new RegExp('^' + v + '$(?!\\s)', p)),
            d_ && (r = s.lastIndex),
            (i = Jj(u_, d ? n : s, m)),
            d
                ? i
                    ? ((i.input = h_(i.input, y)),
                      (i[0] = h_(i[0], y)),
                      (i.index = s.lastIndex),
                      (s.lastIndex += i[0].length))
                    : (s.lastIndex = 0)
                : d_ && i && (s.lastIndex = s.global ? i.index + i[0].length : r),
            v_ &&
                i &&
                i.length > 1 &&
                Jj(a_, i[0], n, function () {
                    for (o = 1; o < arguments.length - 2; o++)
                        void 0 === arguments[o] && (i[o] = void 0);
                }),
            i && h)
        )
            for (i.groups = a = n_(null), o = 0; o < h.length; o++) a[(u = h[o])[0]] = i[u[1]];
        return i;
    });
var y_ = s_;
xu({ target: 'RegExp', proto: !0, forced: /./.exec !== y_ }, { exec: y_ });
var m_,
    g_,
    w_ = js,
    b_ = No,
    x_ = y_,
    O_ = _n,
    k_ = vr,
    S_ = Zi,
    j_ = k_('species'),
    __ = RegExp.prototype,
    M_ = pp.charAt,
    D_ = Ln,
    $_ = Wn,
    E_ = Math.floor,
    P_ = D_(''.charAt),
    L_ = D_(''.replace),
    A_ = D_(''.slice),
    C_ = /\$([$&'`]|\d{1,2}|<[^>]*>)/g,
    T_ = /\$([$&'`]|\d{1,2})/g,
    R_ = Fr,
    I_ = Ir,
    N_ = xr,
    W_ = Ho,
    F_ = y_,
    z_ = TypeError,
    H_ = Os,
    Y_ = Fr,
    U_ = Ln,
    B_ = function (t, e, n, r) {
        var i = k_(t),
            o = !O_(function () {
                var e = {};
                return (
                    (e[i] = function () {
                        return 7;
                    }),
                    7 !== ''[t](e)
                );
            }),
            a =
                o &&
                !O_(function () {
                    var e = !1,
                        n = /a/;
                    return (
                        'split' === t &&
                            (((n = {}).constructor = {}),
                            (n.constructor[j_] = function () {
                                return n;
                            }),
                            (n.flags = ''),
                            (n[i] = /./[i])),
                        (n.exec = function () {
                            return ((e = !0), null);
                        }),
                        n[i](''),
                        !e
                    );
                });
        if (!o || !a || n) {
            var u = w_(/./[i]),
                s = e(i, ''[t], function (t, e, n, r, i) {
                    var a = w_(t),
                        s = e.exec;
                    return s === x_ || s === __.exec
                        ? o && !i
                            ? { done: !0, value: u(e, n, r) }
                            : { done: !0, value: a(n, e, r) }
                        : { done: !1 };
                });
            (b_(String.prototype, t, s[0]), b_(__, i, s[1]));
        }
        r && S_(__[i], 'sham', !0);
    },
    G_ = _n,
    V_ = Ir,
    q_ = xr,
    K_ = An,
    Z_ = Sa,
    J_ = Pa,
    Q_ = op,
    X_ = Rn,
    tM = function (t, e, n) {
        return e + (n ? M_(t, e).length : 1);
    },
    eM = ii,
    nM = function (t, e, n, r, i, o) {
        var a = n + t.length,
            u = r.length,
            s = T_;
        return (
            void 0 !== i && ((i = $_(i)), (s = C_)),
            L_(o, s, function (o, s) {
                var c;
                switch (P_(s, 0)) {
                    case '$':
                        return '$';
                    case '&':
                        return t;
                    case '`':
                        return A_(e, 0, n);
                    case "'":
                        return A_(e, a);
                    case '<':
                        c = i[A_(s, 1, -1)];
                        break;
                    default:
                        var l = +s;
                        if (0 === l) return o;
                        if (l > u) {
                            var f = E_(l / 10);
                            return 0 === f
                                ? o
                                : f <= u
                                  ? void 0 === r[f - 1]
                                      ? P_(s, 1)
                                      : r[f - 1] + P_(s, 1)
                                  : o;
                        }
                        c = r[l - 1];
                }
                return void 0 === c ? '' : c;
            })
        );
    },
    rM = function (t, e) {
        var n = t.exec;
        if (N_(n)) {
            var r = R_(n, t, e);
            return (null !== r && I_(r), r);
        }
        if ('RegExp' === W_(t)) return R_(F_, t, e);
        throw new z_('RegExp#exec called on incompatible receiver');
    },
    iM = vr('replace'),
    oM = Math.max,
    aM = Math.min,
    uM = U_([].concat),
    sM = U_([].push),
    cM = U_(''.indexOf),
    lM = U_(''.slice),
    fM = '$0' === 'a'.replace(/./, '$0'),
    hM = !!/./[iM] && '' === /./[iM]('a', '$0'),
    dM = !G_(function () {
        var t = /./;
        return (
            (t.exec = function () {
                var t = [];
                return ((t.groups = { a: '7' }), t);
            }),
            '7' !== ''.replace(t, '$<a>')
        );
    });
B_(
    'replace',
    function (t, e, n) {
        var r = hM ? '$' : '$0';
        return [
            function (t, n) {
                var r = X_(this),
                    i = K_(t) ? void 0 : eM(t, iM);
                return i ? Y_(i, t, r, n) : Y_(e, Q_(r), t, n);
            },
            function (t, i) {
                var o = V_(this),
                    a = Q_(t);
                if ('string' == typeof i && -1 === cM(i, r) && -1 === cM(i, '$<')) {
                    var u = n(e, o, a, i);
                    if (u.done) return u.value;
                }
                var s = q_(i);
                s || (i = Q_(i));
                var c,
                    l = o.global;
                l && ((c = o.unicode), (o.lastIndex = 0));
                for (var f, h = []; null !== (f = rM(o, a)) && (sM(h, f), l); ) {
                    '' === Q_(f[0]) && (o.lastIndex = tM(a, J_(o.lastIndex), c));
                }
                for (var d, p = '', v = 0, y = 0; y < h.length; y++) {
                    for (
                        var m,
                            g = Q_((f = h[y])[0]),
                            w = oM(aM(Z_(f.index), a.length), 0),
                            b = [],
                            x = 1;
                        x < f.length;
                        x++
                    )
                        sM(b, void 0 === (d = f[x]) ? d : String(d));
                    var O = f.groups;
                    if (s) {
                        var k = uM([g], b, w, a);
                        (void 0 !== O && sM(k, O), (m = Q_(H_(i, void 0, k))));
                    } else m = nM(g, a, w, b, O, i);
                    w >= v && ((p += lM(a, v, w) + m), (v = w + g.length));
                }
                return p + lM(a, v);
            },
        ];
    },
    !dM || !fM || hM
);
var pM = (function () {
    function t(e) {
        (nn(this, t), m_.add(this), (this.calendar = e));
    }
    return (
        on(t, [
            {
                key: 'getDatas',
                value: function (t, e, n) {
                    return hv(
                        this,
                        void 0,
                        void 0,
                        tn().mark(function r() {
                            var i;
                            return tn().wrap(
                                function (r) {
                                    for (;;)
                                        switch ((r.prev = r.next)) {
                                            case 0:
                                                if (!('string' == typeof t && t.length > 0)) {
                                                    r.next = 2;
                                                    break;
                                                }
                                                return r.abrupt(
                                                    'return',
                                                    dv(this, m_, 'm', g_).call(this, t, e, n)
                                                );
                                            case 2:
                                                return (
                                                    (i = []),
                                                    Array.isArray(t) && (i = t),
                                                    r.abrupt(
                                                        'return',
                                                        new Promise(function (t) {
                                                            t(i);
                                                        })
                                                    )
                                                );
                                            case 5:
                                            case 'end':
                                                return r.stop();
                                        }
                                },
                                r,
                                this
                            );
                        })
                    );
                },
            },
            {
                key: 'parseURI',
                value: function (t, e, n) {
                    var r = this,
                        i = t.replace(/\{\{start=(.*?)\}\}/g, function (t, n) {
                            return r.calendar.dateHelper.date(e).format(n);
                        });
                    return (i = i.replace(/\{\{end=(.*?)\}\}/g, function (t, e) {
                        return r.calendar.dateHelper.date(n).format(e);
                    }));
                },
            },
        ]),
        t
    );
})();
((m_ = new WeakSet()),
    (g_ = function (t, e, n) {
        var r = this.calendar.options.options.data,
            i = r.type,
            o = r.requestInit,
            a = this.parseURI(t, e, n);
        switch (i) {
            case 'json':
                return Qe(a, o);
            case 'csv':
                return Je(a, o);
            case 'tsv':
                return Ze('\t', a, o);
            case 'txt':
                return Ke(a, o);
            default:
                return new Promise(function (t) {
                    t([]);
                });
        }
    }));
var vM = kr,
    yM = Ri.EXISTS,
    mM = Ln,
    gM = Nu,
    wM = Function.prototype,
    bM = mM(wM.toString),
    xM = /function\b(?:\s|\/\*[\S\s]*?\*\/|\/\/[^\n\r]*[\n\r]+)*([^\s(/]*)/,
    OM = mM(xM.exec);
vM &&
    !yM &&
    gM(wM, 'name', {
        configurable: !0,
        get: function () {
            try {
                return OM(xM, bM(this))[1];
            } catch (t) {
                return '';
            }
        },
    });
var kM = { exports: {} };
kM.exports = (function () {
    var t = 1e3,
        e = 6e4,
        n = 36e5,
        r = 'millisecond',
        i = 'second',
        o = 'minute',
        a = 'hour',
        u = 'day',
        s = 'week',
        c = 'month',
        l = 'quarter',
        f = 'year',
        h = 'date',
        d = 'Invalid Date',
        p =
            /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/,
        v = /\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,
        y = {
            name: 'en',
            weekdays: 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_'),
            months: 'January_February_March_April_May_June_July_August_September_October_November_December'.split(
                '_'
            ),
            ordinal: function (t) {
                var e = ['th', 'st', 'nd', 'rd'],
                    n = t % 100;
                return '[' + t + (e[(n - 20) % 10] || e[n] || e[0]) + ']';
            },
        },
        m = function (t, e, n) {
            var r = String(t);
            return !r || r.length >= e ? t : '' + Array(e + 1 - r.length).join(n) + t;
        },
        g = {
            s: m,
            z: function (t) {
                var e = -t.utcOffset(),
                    n = Math.abs(e),
                    r = Math.floor(n / 60),
                    i = n % 60;
                return (e <= 0 ? '+' : '-') + m(r, 2, '0') + ':' + m(i, 2, '0');
            },
            m: function t(e, n) {
                if (e.date() < n.date()) return -t(n, e);
                var r = 12 * (n.year() - e.year()) + (n.month() - e.month()),
                    i = e.clone().add(r, c),
                    o = n - i < 0,
                    a = e.clone().add(r + (o ? -1 : 1), c);
                return +(-(r + (n - i) / (o ? i - a : a - i)) || 0);
            },
            a: function (t) {
                return t < 0 ? Math.ceil(t) || 0 : Math.floor(t);
            },
            p: function (t) {
                return (
                    { M: c, y: f, w: s, d: u, D: h, h: a, m: o, s: i, ms: r, Q: l }[t] ||
                    String(t || '')
                        .toLowerCase()
                        .replace(/s$/, '')
                );
            },
            u: function (t) {
                return void 0 === t;
            },
        },
        w = 'en',
        b = {};
    b[w] = y;
    var x = '$isDayjsObject',
        O = function (t) {
            return t instanceof _ || !(!t || !t[x]);
        },
        k = function t(e, n, r) {
            var i;
            if (!e) return w;
            if ('string' == typeof e) {
                var o = e.toLowerCase();
                (b[o] && (i = o), n && ((b[o] = n), (i = o)));
                var a = e.split('-');
                if (!i && a.length > 1) return t(a[0]);
            } else {
                var u = e.name;
                ((b[u] = e), (i = u));
            }
            return (!r && i && (w = i), i || (!r && w));
        },
        S = function (t, e) {
            if (O(t)) return t.clone();
            var n = 'object' == typeof e ? e : {};
            return ((n.date = t), (n.args = arguments), new _(n));
        },
        j = g;
    ((j.l = k),
        (j.i = O),
        (j.w = function (t, e) {
            return S(t, { locale: e.$L, utc: e.$u, x: e.$x, $offset: e.$offset });
        }));
    var _ = (function () {
            function y(t) {
                ((this.$L = k(t.locale, null, !0)),
                    this.parse(t),
                    (this.$x = this.$x || t.x || {}),
                    (this[x] = !0));
            }
            var m = y.prototype;
            return (
                (m.parse = function (t) {
                    ((this.$d = (function (t) {
                        var e = t.date,
                            n = t.utc;
                        if (null === e) return new Date(NaN);
                        if (j.u(e)) return new Date();
                        if (e instanceof Date) return new Date(e);
                        if ('string' == typeof e && !/Z$/i.test(e)) {
                            var r = e.match(p);
                            if (r) {
                                var i = r[2] - 1 || 0,
                                    o = (r[7] || '0').substring(0, 3);
                                return n
                                    ? new Date(
                                          Date.UTC(
                                              r[1],
                                              i,
                                              r[3] || 1,
                                              r[4] || 0,
                                              r[5] || 0,
                                              r[6] || 0,
                                              o
                                          )
                                      )
                                    : new Date(
                                          r[1],
                                          i,
                                          r[3] || 1,
                                          r[4] || 0,
                                          r[5] || 0,
                                          r[6] || 0,
                                          o
                                      );
                            }
                        }
                        return new Date(e);
                    })(t)),
                        this.init());
                }),
                (m.init = function () {
                    var t = this.$d;
                    ((this.$y = t.getFullYear()),
                        (this.$M = t.getMonth()),
                        (this.$D = t.getDate()),
                        (this.$W = t.getDay()),
                        (this.$H = t.getHours()),
                        (this.$m = t.getMinutes()),
                        (this.$s = t.getSeconds()),
                        (this.$ms = t.getMilliseconds()));
                }),
                (m.$utils = function () {
                    return j;
                }),
                (m.isValid = function () {
                    return !(this.$d.toString() === d);
                }),
                (m.isSame = function (t, e) {
                    var n = S(t);
                    return this.startOf(e) <= n && n <= this.endOf(e);
                }),
                (m.isAfter = function (t, e) {
                    return S(t) < this.startOf(e);
                }),
                (m.isBefore = function (t, e) {
                    return this.endOf(e) < S(t);
                }),
                (m.$g = function (t, e, n) {
                    return j.u(t) ? this[e] : this.set(n, t);
                }),
                (m.unix = function () {
                    return Math.floor(this.valueOf() / 1e3);
                }),
                (m.valueOf = function () {
                    return this.$d.getTime();
                }),
                (m.startOf = function (t, e) {
                    var n = this,
                        r = !!j.u(e) || e,
                        l = j.p(t),
                        d = function (t, e) {
                            var i = j.w(n.$u ? Date.UTC(n.$y, e, t) : new Date(n.$y, e, t), n);
                            return r ? i : i.endOf(u);
                        },
                        p = function (t, e) {
                            return j.w(
                                n
                                    .toDate()
                                    [
                                        t
                                    ].apply(n.toDate('s'), (r ? [0, 0, 0, 0] : [23, 59, 59, 999]).slice(e)),
                                n
                            );
                        },
                        v = this.$W,
                        y = this.$M,
                        m = this.$D,
                        g = 'set' + (this.$u ? 'UTC' : '');
                    switch (l) {
                        case f:
                            return r ? d(1, 0) : d(31, 11);
                        case c:
                            return r ? d(1, y) : d(0, y + 1);
                        case s:
                            var w = this.$locale().weekStart || 0,
                                b = (v < w ? v + 7 : v) - w;
                            return d(r ? m - b : m + (6 - b), y);
                        case u:
                        case h:
                            return p(g + 'Hours', 0);
                        case a:
                            return p(g + 'Minutes', 1);
                        case o:
                            return p(g + 'Seconds', 2);
                        case i:
                            return p(g + 'Milliseconds', 3);
                        default:
                            return this.clone();
                    }
                }),
                (m.endOf = function (t) {
                    return this.startOf(t, !1);
                }),
                (m.$set = function (t, e) {
                    var n,
                        s = j.p(t),
                        l = 'set' + (this.$u ? 'UTC' : ''),
                        d = ((n = {}),
                        (n[u] = l + 'Date'),
                        (n[h] = l + 'Date'),
                        (n[c] = l + 'Month'),
                        (n[f] = l + 'FullYear'),
                        (n[a] = l + 'Hours'),
                        (n[o] = l + 'Minutes'),
                        (n[i] = l + 'Seconds'),
                        (n[r] = l + 'Milliseconds'),
                        n)[s],
                        p = s === u ? this.$D + (e - this.$W) : e;
                    if (s === c || s === f) {
                        var v = this.clone().set(h, 1);
                        (v.$d[d](p),
                            v.init(),
                            (this.$d = v.set(h, Math.min(this.$D, v.daysInMonth())).$d));
                    } else d && this.$d[d](p);
                    return (this.init(), this);
                }),
                (m.set = function (t, e) {
                    return this.clone().$set(t, e);
                }),
                (m.get = function (t) {
                    return this[j.p(t)]();
                }),
                (m.add = function (r, l) {
                    var h,
                        d = this;
                    r = Number(r);
                    var p = j.p(l),
                        v = function (t) {
                            var e = S(d);
                            return j.w(e.date(e.date() + Math.round(t * r)), d);
                        };
                    if (p === c) return this.set(c, this.$M + r);
                    if (p === f) return this.set(f, this.$y + r);
                    if (p === u) return v(1);
                    if (p === s) return v(7);
                    var y = ((h = {}), (h[o] = e), (h[a] = n), (h[i] = t), h)[p] || 1,
                        m = this.$d.getTime() + r * y;
                    return j.w(m, this);
                }),
                (m.subtract = function (t, e) {
                    return this.add(-1 * t, e);
                }),
                (m.format = function (t) {
                    var e = this,
                        n = this.$locale();
                    if (!this.isValid()) return n.invalidDate || d;
                    var r = t || 'YYYY-MM-DDTHH:mm:ssZ',
                        i = j.z(this),
                        o = this.$H,
                        a = this.$m,
                        u = this.$M,
                        s = n.weekdays,
                        c = n.months,
                        l = n.meridiem,
                        f = function (t, n, i, o) {
                            return (t && (t[n] || t(e, r))) || i[n].slice(0, o);
                        },
                        h = function (t) {
                            return j.s(o % 12 || 12, t, '0');
                        },
                        p =
                            l ||
                            function (t, e, n) {
                                var r = t < 12 ? 'AM' : 'PM';
                                return n ? r.toLowerCase() : r;
                            };
                    return r.replace(v, function (t, r) {
                        return (
                            r ||
                            (function (t) {
                                switch (t) {
                                    case 'YY':
                                        return String(e.$y).slice(-2);
                                    case 'YYYY':
                                        return j.s(e.$y, 4, '0');
                                    case 'M':
                                        return u + 1;
                                    case 'MM':
                                        return j.s(u + 1, 2, '0');
                                    case 'MMM':
                                        return f(n.monthsShort, u, c, 3);
                                    case 'MMMM':
                                        return f(c, u);
                                    case 'D':
                                        return e.$D;
                                    case 'DD':
                                        return j.s(e.$D, 2, '0');
                                    case 'd':
                                        return String(e.$W);
                                    case 'dd':
                                        return f(n.weekdaysMin, e.$W, s, 2);
                                    case 'ddd':
                                        return f(n.weekdaysShort, e.$W, s, 3);
                                    case 'dddd':
                                        return s[e.$W];
                                    case 'H':
                                        return String(o);
                                    case 'HH':
                                        return j.s(o, 2, '0');
                                    case 'h':
                                        return h(1);
                                    case 'hh':
                                        return h(2);
                                    case 'a':
                                        return p(o, a, !0);
                                    case 'A':
                                        return p(o, a, !1);
                                    case 'm':
                                        return String(a);
                                    case 'mm':
                                        return j.s(a, 2, '0');
                                    case 's':
                                        return String(e.$s);
                                    case 'ss':
                                        return j.s(e.$s, 2, '0');
                                    case 'SSS':
                                        return j.s(e.$ms, 3, '0');
                                    case 'Z':
                                        return i;
                                }
                                return null;
                            })(t) ||
                            i.replace(':', '')
                        );
                    });
                }),
                (m.utcOffset = function () {
                    return 15 * -Math.round(this.$d.getTimezoneOffset() / 15);
                }),
                (m.diff = function (r, h, d) {
                    var p,
                        v = this,
                        y = j.p(h),
                        m = S(r),
                        g = (m.utcOffset() - this.utcOffset()) * e,
                        w = this - m,
                        b = function () {
                            return j.m(v, m);
                        };
                    switch (y) {
                        case f:
                            p = b() / 12;
                            break;
                        case c:
                            p = b();
                            break;
                        case l:
                            p = b() / 3;
                            break;
                        case s:
                            p = (w - g) / 6048e5;
                            break;
                        case u:
                            p = (w - g) / 864e5;
                            break;
                        case a:
                            p = w / n;
                            break;
                        case o:
                            p = w / e;
                            break;
                        case i:
                            p = w / t;
                            break;
                        default:
                            p = w;
                    }
                    return d ? p : j.a(p);
                }),
                (m.daysInMonth = function () {
                    return this.endOf(c).$D;
                }),
                (m.$locale = function () {
                    return b[this.$L];
                }),
                (m.locale = function (t, e) {
                    if (!t) return this.$L;
                    var n = this.clone(),
                        r = k(t, e, !0);
                    return (r && (n.$L = r), n);
                }),
                (m.clone = function () {
                    return j.w(this.$d, this);
                }),
                (m.toDate = function () {
                    return new Date(this.valueOf());
                }),
                (m.toJSON = function () {
                    return this.isValid() ? this.toISOString() : null;
                }),
                (m.toISOString = function () {
                    return this.$d.toISOString();
                }),
                (m.toString = function () {
                    return this.$d.toUTCString();
                }),
                y
            );
        })(),
        M = _.prototype;
    return (
        (S.prototype = M),
        [
            ['$ms', r],
            ['$s', i],
            ['$m', o],
            ['$H', a],
            ['$W', u],
            ['$M', c],
            ['$y', f],
            ['$D', h],
        ].forEach(function (t) {
            M[t[1]] = function (e) {
                return this.$g(e, t[0], t[1]);
            };
        }),
        (S.extend = function (t, e) {
            return (t.$i || (t(e, _, S), (t.$i = !0)), S);
        }),
        (S.locale = k),
        (S.isDayjs = O),
        (S.unix = function (t) {
            return S(1e3 * t);
        }),
        (S.en = b[w]),
        (S.Ls = b),
        (S.p = {}),
        S
    );
})();
var SM,
    jM,
    _M = hn(kM.exports),
    MM = { exports: {} },
    DM = hn(
        (MM.exports =
            ((SM = 'week'),
            (jM = 'year'),
            function (t, e, n) {
                var r = e.prototype;
                ((r.week = function (t) {
                    if ((void 0 === t && (t = null), null !== t))
                        return this.add(7 * (t - this.week()), 'day');
                    var e = this.$locale().yearStart || 1;
                    if (11 === this.month() && this.date() > 25) {
                        var r = n(this).startOf(jM).add(1, jM).date(e),
                            i = n(this).endOf(SM);
                        if (r.isBefore(i)) return 1;
                    }
                    var o = n(this).startOf(jM).date(e).startOf(SM).subtract(1, 'millisecond'),
                        a = this.diff(o, SM, !0);
                    return a < 0 ? n(this).startOf('week').week() : Math.ceil(a);
                }),
                    (r.weeks = function (t) {
                        return (void 0 === t && (t = null), this.week(t));
                    }));
            }))
    ),
    $M = { exports: {} };
$M.exports = function (t, e, n) {
    e.prototype.dayOfYear = function (t) {
        var e = Math.round((n(this).startOf('day') - n(this).startOf('year')) / 864e5) + 1;
        return null == t ? e : this.add(t - e, 'day');
    };
};
var EM = hn($M.exports),
    PM = { exports: {} };
PM.exports = function (t, e) {
    e.prototype.weekday = function (t) {
        var e = this.$locale().weekStart || 0,
            n = this.$W,
            r = (n < e ? n + 7 : n) - e;
        return this.$utils().u(t) ? r : this.subtract(r, 'day').add(t, 'day');
    };
};
var LM = hn(PM.exports),
    AM = { exports: {} };
AM.exports = function (t, e, n) {
    var r = function (t, e) {
        if (
            !e ||
            !e.length ||
            (1 === e.length && !e[0]) ||
            (1 === e.length && Array.isArray(e[0]) && !e[0].length)
        )
            return null;
        var n;
        (1 === e.length && e[0].length > 0 && (e = e[0]),
            (n = (e = e.filter(function (t) {
                return t;
            }))[0]));
        for (var r = 1; r < e.length; r += 1) (e[r].isValid() && !e[r][t](n)) || (n = e[r]);
        return n;
    };
    ((n.max = function () {
        var t = [].slice.call(arguments, 0);
        return r('isAfter', t);
    }),
        (n.min = function () {
            var t = [].slice.call(arguments, 0);
            return r('isBefore', t);
        }));
};
var CM = hn(AM.exports),
    TM = { exports: {} };
TM.exports = function (t, e) {
    e.prototype.isoWeeksInYear = function () {
        var t = this.isLeapYear(),
            e = this.endOf('y').day();
        return 4 === e || (t && 5 === e) ? 53 : 52;
    };
};
var RM = hn(TM.exports),
    IM = { exports: {} };
IM.exports = (function () {
    var t = 'day';
    return function (e, n, r) {
        var i = function (e) {
                return e.add(4 - e.isoWeekday(), t);
            },
            o = n.prototype;
        ((o.isoWeekYear = function () {
            return i(this).year();
        }),
            (o.isoWeek = function (e) {
                if (!this.$utils().u(e)) return this.add(7 * (e - this.isoWeek()), t);
                var n,
                    o,
                    a,
                    u = i(this),
                    s =
                        ((n = this.isoWeekYear()),
                        (a =
                            4 - (o = (this.$u ? r.utc : r)().year(n).startOf('year')).isoWeekday()),
                        o.isoWeekday() > 4 && (a += 7),
                        o.add(a, t));
                return u.diff(s, 'week') + 1;
            }),
            (o.isoWeekday = function (t) {
                return this.$utils().u(t) ? this.day() || 7 : this.day(this.day() % 7 ? t : t - 7);
            }));
        var a = o.startOf;
        o.startOf = function (t, e) {
            var n = this.$utils(),
                r = !!n.u(e) || e;
            return 'isoweek' === n.p(t)
                ? r
                    ? this.date(this.date() - (this.isoWeekday() - 1)).startOf('day')
                    : this.date(this.date() - 1 - (this.isoWeekday() - 1) + 7).endOf('day')
                : a.bind(this)(t, e);
        };
    };
})();
var NM = hn(IM.exports),
    WM = { exports: {} };
WM.exports = function (t, e) {
    e.prototype.isLeapYear = function () {
        return (this.$y % 4 == 0 && this.$y % 100 != 0) || this.$y % 400 == 0;
    };
};
var FM = hn(WM.exports),
    zM = { exports: {} };
zM.exports = function (t, e) {
    var n = e.prototype,
        r = n.format;
    n.format = function (t) {
        var e = this,
            n = this.$locale();
        if (!this.isValid()) return r.bind(this)(t);
        var i = this.$utils(),
            o = (t || 'YYYY-MM-DDTHH:mm:ssZ').replace(
                /\[([^\]]+)]|Q|wo|ww|w|WW|W|zzz|z|gggg|GGGG|Do|X|x|k{1,2}|S/g,
                function (t) {
                    switch (t) {
                        case 'Q':
                            return Math.ceil((e.$M + 1) / 3);
                        case 'Do':
                            return n.ordinal(e.$D);
                        case 'gggg':
                            return e.weekYear();
                        case 'GGGG':
                            return e.isoWeekYear();
                        case 'wo':
                            return n.ordinal(e.week(), 'W');
                        case 'w':
                        case 'ww':
                            return i.s(e.week(), 'w' === t ? 1 : 2, '0');
                        case 'W':
                        case 'WW':
                            return i.s(e.isoWeek(), 'W' === t ? 1 : 2, '0');
                        case 'k':
                        case 'kk':
                            return i.s(String(0 === e.$H ? 24 : e.$H), 'k' === t ? 1 : 2, '0');
                        case 'X':
                            return Math.floor(e.$d.getTime() / 1e3);
                        case 'x':
                            return e.$d.getTime();
                        case 'z':
                            return '[' + e.offsetName() + ']';
                        case 'zzz':
                            return '[' + e.offsetName('long') + ']';
                        default:
                            return t;
                    }
                }
            );
        return r.bind(this)(o);
    };
};
var HM = hn(zM.exports),
    YM = { exports: {} };
YM.exports = (function () {
    var t = 'minute',
        e = /[+-]\d\d(?::?\d\d)?/g,
        n = /([+-]|\d\d)/g;
    return function (r, i, o) {
        var a = i.prototype;
        ((o.utc = function (t) {
            return new i({ date: t, utc: !0, args: arguments });
        }),
            (a.utc = function (e) {
                var n = o(this.toDate(), { locale: this.$L, utc: !0 });
                return e ? n.add(this.utcOffset(), t) : n;
            }),
            (a.local = function () {
                return o(this.toDate(), { locale: this.$L, utc: !1 });
            }));
        var u = a.parse;
        a.parse = function (t) {
            (t.utc && (this.$u = !0),
                this.$utils().u(t.$offset) || (this.$offset = t.$offset),
                u.call(this, t));
        };
        var s = a.init;
        a.init = function () {
            if (this.$u) {
                var t = this.$d;
                ((this.$y = t.getUTCFullYear()),
                    (this.$M = t.getUTCMonth()),
                    (this.$D = t.getUTCDate()),
                    (this.$W = t.getUTCDay()),
                    (this.$H = t.getUTCHours()),
                    (this.$m = t.getUTCMinutes()),
                    (this.$s = t.getUTCSeconds()),
                    (this.$ms = t.getUTCMilliseconds()));
            } else s.call(this);
        };
        var c = a.utcOffset;
        a.utcOffset = function (r, i) {
            var o = this.$utils().u;
            if (o(r)) return this.$u ? 0 : o(this.$offset) ? c.call(this) : this.$offset;
            if (
                'string' == typeof r &&
                ((r = (function (t) {
                    void 0 === t && (t = '');
                    var r = t.match(e);
                    if (!r) return null;
                    var i = ('' + r[0]).match(n) || ['-', 0, 0],
                        o = i[0],
                        a = 60 * +i[1] + +i[2];
                    return 0 === a ? 0 : '+' === o ? a : -a;
                })(r)),
                null === r)
            )
                return this;
            var a = Math.abs(r) <= 16 ? 60 * r : r,
                u = this;
            if (i) return ((u.$offset = a), (u.$u = 0 === r), u);
            if (0 !== r) {
                var s = this.$u ? this.toDate().getTimezoneOffset() : -1 * this.utcOffset();
                (((u = this.local().add(a + s, t)).$offset = a), (u.$x.$localOffset = s));
            } else u = this.utc();
            return u;
        };
        var l = a.format;
        ((a.format = function (t) {
            var e = t || (this.$u ? 'YYYY-MM-DDTHH:mm:ss[Z]' : '');
            return l.call(this, e);
        }),
            (a.valueOf = function () {
                var t = this.$utils().u(this.$offset)
                    ? 0
                    : this.$offset + (this.$x.$localOffset || this.$d.getTimezoneOffset());
                return this.$d.valueOf() - 6e4 * t;
            }),
            (a.isUTC = function () {
                return !!this.$u;
            }),
            (a.toISOString = function () {
                return this.toDate().toISOString();
            }),
            (a.toString = function () {
                return this.toDate().toUTCString();
            }));
        var f = a.toDate;
        a.toDate = function (t) {
            return 's' === t && this.$offset
                ? o(this.format('YYYY-MM-DD HH:mm:ss:SSS')).toDate()
                : f.call(this);
        };
        var h = a.diff;
        a.diff = function (t, e, n) {
            if (t && this.$u === t.$u) return h.call(this, t, e, n);
            var r = this.local(),
                i = o(t).local();
            return h.call(r, i, e, n);
        };
    };
})();
var UM = hn(YM.exports),
    BM = { exports: {} };
BM.exports = (function () {
    var t = { year: 0, month: 1, day: 2, hour: 3, minute: 4, second: 5 },
        e = {};
    return function (n, r, i) {
        var o,
            a = function (t, n, r) {
                void 0 === r && (r = {});
                var i = new Date(t),
                    o = (function (t, n) {
                        void 0 === n && (n = {});
                        var r = n.timeZoneName || 'short',
                            i = t + '|' + r,
                            o = e[i];
                        return (
                            o ||
                                ((o = new Intl.DateTimeFormat('en-US', {
                                    hour12: !1,
                                    timeZone: t,
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    timeZoneName: r,
                                })),
                                (e[i] = o)),
                            o
                        );
                    })(n, r);
                return o.formatToParts(i);
            },
            u = function (e, n) {
                for (var r = a(e, n), o = [], u = 0; u < r.length; u += 1) {
                    var s = r[u],
                        c = s.type,
                        l = s.value,
                        f = t[c];
                    f >= 0 && (o[f] = parseInt(l, 10));
                }
                var h = o[3],
                    d = 24 === h ? 0 : h,
                    p = o[0] + '-' + o[1] + '-' + o[2] + ' ' + d + ':' + o[4] + ':' + o[5] + ':000',
                    v = +e;
                return (i.utc(p).valueOf() - (v -= v % 1e3)) / 6e4;
            },
            s = r.prototype;
        ((s.tz = function (t, e) {
            void 0 === t && (t = o);
            var n = this.utcOffset(),
                r = this.toDate(),
                a = r.toLocaleString('en-US', { timeZone: t }),
                u = Math.round((r - new Date(a)) / 1e3 / 60),
                s = i(a, { locale: this.$L })
                    .$set('millisecond', this.$ms)
                    .utcOffset(15 * -Math.round(r.getTimezoneOffset() / 15) - u, !0);
            if (e) {
                var c = s.utcOffset();
                s = s.add(n - c, 'minute');
            }
            return ((s.$x.$timezone = t), s);
        }),
            (s.offsetName = function (t) {
                var e = this.$x.$timezone || i.tz.guess(),
                    n = a(this.valueOf(), e, { timeZoneName: t }).find(function (t) {
                        return 'timezonename' === t.type.toLowerCase();
                    });
                return n && n.value;
            }));
        var c = s.startOf;
        ((s.startOf = function (t, e) {
            if (!this.$x || !this.$x.$timezone) return c.call(this, t, e);
            var n = i(this.format('YYYY-MM-DD HH:mm:ss:SSS'), { locale: this.$L });
            return c.call(n, t, e).tz(this.$x.$timezone, !0);
        }),
            (i.tz = function (t, e, n) {
                var r = n && e,
                    a = n || e || o,
                    s = u(+i(), a);
                if ('string' != typeof t) return i(t).tz(a);
                var c = (function (t, e, n) {
                        var r = t - 60 * e * 1e3,
                            i = u(r, n);
                        if (e === i) return [r, e];
                        var o = u((r -= 60 * (i - e) * 1e3), n);
                        return i === o ? [r, i] : [t - 60 * Math.min(i, o) * 1e3, Math.max(i, o)];
                    })(i.utc(t, r).valueOf(), s, a),
                    l = c[0],
                    f = c[1],
                    h = i(l).utcOffset(f);
                return ((h.$x.$timezone = a), h);
            }),
            (i.tz.guess = function () {
                return Intl.DateTimeFormat().resolvedOptions().timeZone;
            }),
            (i.tz.setDefault = function (t) {
                o = t;
            }));
    };
})();
var GM = hn(BM.exports),
    VM = { exports: {} };
VM.exports = function (t, e, n) {
    var r = e.prototype,
        i = function (t) {
            return t && (t.indexOf ? t : t.s);
        },
        o = function (t, e, n, r, o) {
            var a = t.name ? t : t.$locale(),
                u = i(a[e]),
                s = i(a[n]),
                c =
                    u ||
                    s.map(function (t) {
                        return t.slice(0, r);
                    });
            if (!o) return c;
            var l = a.weekStart;
            return c.map(function (t, e) {
                return c[(e + (l || 0)) % 7];
            });
        },
        a = function () {
            return n.Ls[n.locale()];
        },
        u = function (t, e) {
            return (
                t.formats[e] ||
                (function (t) {
                    return t.replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g, function (t, e, n) {
                        return e || n.slice(1);
                    });
                })(t.formats[e.toUpperCase()])
            );
        },
        s = function () {
            var t = this;
            return {
                months: function (e) {
                    return e ? e.format('MMMM') : o(t, 'months');
                },
                monthsShort: function (e) {
                    return e ? e.format('MMM') : o(t, 'monthsShort', 'months', 3);
                },
                firstDayOfWeek: function () {
                    return t.$locale().weekStart || 0;
                },
                weekdays: function (e) {
                    return e ? e.format('dddd') : o(t, 'weekdays');
                },
                weekdaysMin: function (e) {
                    return e ? e.format('dd') : o(t, 'weekdaysMin', 'weekdays', 2);
                },
                weekdaysShort: function (e) {
                    return e ? e.format('ddd') : o(t, 'weekdaysShort', 'weekdays', 3);
                },
                longDateFormat: function (e) {
                    return u(t.$locale(), e);
                },
                meridiem: this.$locale().meridiem,
                ordinal: this.$locale().ordinal,
            };
        };
    ((r.localeData = function () {
        return s.bind(this)();
    }),
        (n.localeData = function () {
            var t = a();
            return {
                firstDayOfWeek: function () {
                    return t.weekStart || 0;
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
                longDateFormat: function (e) {
                    return u(t, e);
                },
                meridiem: t.meridiem,
                ordinal: t.ordinal,
            };
        }),
        (n.months = function () {
            return o(a(), 'months');
        }),
        (n.monthsShort = function () {
            return o(a(), 'monthsShort', 'months', 3);
        }),
        (n.weekdays = function (t) {
            return o(a(), 'weekdays', null, null, t);
        }),
        (n.weekdaysShort = function (t) {
            return o(a(), 'weekdaysShort', 'weekdays', 3, t);
        }),
        (n.weekdaysMin = function (t) {
            return o(a(), 'weekdaysMin', 'weekdays', 2, t);
        }));
};
var qM = hn(VM.exports),
    KM = { exports: {} };
KM.exports = (function () {
    var t = {
        LTS: 'h:mm:ss A',
        LT: 'h:mm A',
        L: 'MM/DD/YYYY',
        LL: 'MMMM D, YYYY',
        LLL: 'MMMM D, YYYY h:mm A',
        LLLL: 'dddd, MMMM D, YYYY h:mm A',
    };
    return function (e, n, r) {
        var i = n.prototype,
            o = i.format;
        ((r.en.formats = t),
            (i.format = function (e) {
                void 0 === e && (e = 'YYYY-MM-DDTHH:mm:ssZ');
                var n = this.$locale().formats,
                    r = (function (e, n) {
                        return e.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g, function (e, r, i) {
                            var o = i && i.toUpperCase();
                            return (
                                r ||
                                n[i] ||
                                t[i] ||
                                n[o].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g, function (t, e, n) {
                                    return e || n.slice(1);
                                })
                            );
                        });
                    })(e, void 0 === n ? {} : n);
                return o.call(this, r);
            }));
    };
})();
var ZM = hn(KM.exports),
    JM = { exports: {} };
JM.exports = function (t, e, n) {
    n.updateLocale = function (t, e) {
        var r = n.Ls[t];
        if (r)
            return (
                (e ? Object.keys(e) : []).forEach(function (t) {
                    r[t] = e[t];
                }),
                r
            );
    };
};
var QM = hn(JM.exports);
(_M.extend(DM),
    _M.extend(RM),
    _M.extend(NM),
    _M.extend(FM),
    _M.extend(EM),
    _M.extend(LM),
    _M.extend(CM),
    _M.extend(HM),
    _M.extend(UM),
    _M.extend(GM),
    _M.extend(qM),
    _M.extend(ZM),
    _M.extend(QM));
var XM = 'en',
    tD = (function () {
        function t() {
            var e;
            (nn(this, t),
                (this.locale = XM),
                (this.timezone = _M.tz.guess()),
                'object' === ('undefined' == typeof window ? 'undefined' : en(window)) &&
                    ((e = window).dayjs || (e.dayjs = _M)));
        }
        return (
            on(t, [
                {
                    key: 'setup',
                    value: function (t) {
                        var e = t.options;
                        return hv(
                            this,
                            void 0,
                            void 0,
                            tn().mark(function t() {
                                var n, r;
                                return tn().wrap(
                                    function (t) {
                                        for (;;)
                                            switch ((t.prev = t.next)) {
                                                case 0:
                                                    if (
                                                        ((this.timezone =
                                                            e.date.timezone || _M.tz.guess()),
                                                        'string' != typeof (n = e.date.locale) ||
                                                            n === XM)
                                                    ) {
                                                        t.next = 17;
                                                        break;
                                                    }
                                                    if (
                                                        'object' !==
                                                        ('undefined' == typeof window
                                                            ? 'undefined'
                                                            : en(window))
                                                    ) {
                                                        t.next = 12;
                                                        break;
                                                    }
                                                    if (
                                                        ((t.t0 = window['dayjs_locale_'.concat(n)]),
                                                        t.t0)
                                                    ) {
                                                        t.next = 9;
                                                        break;
                                                    }
                                                    return (
                                                        (t.next = 8),
                                                        this.loadBrowserLocale(n)
                                                    );
                                                case 8:
                                                    t.t0 = t.sent;
                                                case 9:
                                                    ((r = t.t0), (t.next = 15));
                                                    break;
                                                case 12:
                                                    return ((t.next = 14), this.loadNodeLocale(n));
                                                case 14:
                                                    r = t.sent;
                                                case 15:
                                                    (_M.locale(n), (this.locale = r));
                                                case 17:
                                                    'object' === en(n) &&
                                                        (n.hasOwnProperty('name')
                                                            ? (_M.locale(n.name, n),
                                                              (this.locale = n))
                                                            : (this.locale = _M.updateLocale(
                                                                  XM,
                                                                  n
                                                              )));
                                                case 18:
                                                case 'end':
                                                    return t.stop();
                                            }
                                    },
                                    t,
                                    this
                                );
                            })
                        );
                    },
                },
                {
                    key: 'extend',
                    value: function (t) {
                        return _M.extend(t);
                    },
                },
                {
                    key: 'getMonthWeekNumber',
                    value: function (t) {
                        var e = this.date(t),
                            n = e.startOf('day'),
                            r = e.startOf('month').endOf('week');
                        return n <= r ? 1 : Math.ceil(n.diff(r, 'weeks', !0)) + 1;
                    },
                },
                {
                    key: 'getWeeksCountInMonth',
                    value: function (t) {
                        var e = this.date(t);
                        return (
                            this.getLastWeekOfMonth(e).diff(this.getFirstWeekOfMonth(e), 'week') + 1
                        );
                    },
                },
                {
                    key: 'getFirstWeekOfMonth',
                    value: function (t) {
                        var e = this.date(t).startOf('month'),
                            n = e.startOf('week');
                        return (e.weekday() > 4 && (n = n.add(1, 'week')), n);
                    },
                },
                {
                    key: 'getLastWeekOfMonth',
                    value: function (t) {
                        var e = this.date(t).endOf('month'),
                            n = e.endOf('week');
                        return (e.weekday() < 4 && (n = n.subtract(1, 'week')), n);
                    },
                },
                {
                    key: 'date',
                    value: function () {
                        var t =
                            arguments.length > 0 && void 0 !== arguments[0]
                                ? arguments[0]
                                : new Date();
                        return _M.isDayjs(t)
                            ? t
                            : _M(t).tz(this.timezone).utcOffset(0).locale(this.locale);
                    },
                },
                {
                    key: 'format',
                    value: function (t, e) {
                        if ('function' == typeof e) {
                            for (
                                var n = arguments.length, r = new Array(n > 2 ? n - 2 : 0), i = 2;
                                i < n;
                                i++
                            )
                                r[i - 2] = arguments[i];
                            return e.apply(void 0, [t].concat(r));
                        }
                        return 'string' == typeof e ? this.date(t).format(e) : null;
                    },
                },
                {
                    key: 'intervals',
                    value: function (t, e, n) {
                        var r,
                            i = !(arguments.length > 3 && void 0 !== arguments[3]) || arguments[3],
                            o = this.date(e);
                        ((r =
                            'number' == typeof n ? o.add(n, t) : _M.isDayjs(n) ? n : this.date(n)),
                            (o = o.startOf(t)),
                            (r = r.startOf(t)));
                        var a = _M.min(o, r);
                        r = _M.max(o, r);
                        var u = [];
                        i || (r = r.add(1, 'second'));
                        do {
                            (u.push(+a), (a = a.add(1, t)));
                        } while (a < r);
                        return u;
                    },
                },
                {
                    key: 'loadBrowserLocale',
                    value: function (t) {
                        return new Promise(function (e, n) {
                            var r = document.createElement('script');
                            ((r.type = 'text/javascript'),
                                (r.async = !0),
                                (r.src = 'https://cdn.jsdelivr.net/npm/dayjs@1/locale/'.concat(
                                    t,
                                    '.js'
                                )),
                                (r.onerror = function (t) {
                                    n(t);
                                }),
                                (r.onload = function () {
                                    e(window['dayjs_locale_'.concat(t)]);
                                }),
                                document.head.appendChild(r));
                        });
                    },
                },
                {
                    key: 'loadNodeLocale',
                    value: function (t) {
                        return import('dayjs/locale/'.concat(t, '.js'));
                    },
                },
            ]),
            t
        );
    })(),
    eD = xu,
    nD = Fb,
    rD = Rn,
    iD = op,
    oD = Hb,
    aD = Ln(''.indexOf);
eD(
    { target: 'String', proto: !0, forced: !oD('includes') },
    {
        includes: function (t) {
            return !!~aD(iD(rD(this)), iD(nD(t)), arguments.length > 1 ? arguments[1] : void 0);
        },
    }
);
var uD = ['json', 'csv', 'tsv', 'txt'];
function sD(t, e) {
    var n = e.domain,
        r = e.subDomain,
        i = e.data,
        o = n.type,
        a = r.type;
    if (!t.has(o)) throw new Error("'".concat(o, "' is not a valid domain type'"));
    if (!t.has(a)) throw new Error("'".concat(a, "' is not a valid subDomain type'"));
    if (i.type && !uD.includes(i.type))
        throw new Error("The data type '".concat(i.type, "' is not valid data type"));
    if (!(t.get(a).allowedDomainType || []).includes(o))
        throw new Error(
            "The subDomain.type '".concat(a, "' can not be used together ") +
                'with the domain type '.concat(o)
        );
    return !0;
}
Ky(
    'Set',
    function (t) {
        return function () {
            return t(this, arguments.length ? arguments[0] : void 0);
        };
    },
    ag
);
var cD = (function () {
        function t(e) {
            (nn(this, t),
                (this.calendar = e),
                (this.settings = new Map()),
                (this.plugins = new Map()),
                (this.pendingPaint = new Set()));
        }
        return (
            on(t, [
                {
                    key: 'add',
                    value: function (t) {
                        var e = this;
                        t.forEach(function (t) {
                            var n,
                                r,
                                i = an(t, 2),
                                o = i[0],
                                a = i[1],
                                u = (function (t, e) {
                                    return ''
                                        .concat(new t().name)
                                        .concat((null == e ? void 0 : e.key) || '');
                                })(o, a);
                            (e.plugins.get(u) &&
                                e.settings.get(u) &&
                                vj(e.settings.get(u).options, a)) ||
                                (e.settings.set(u, { options: a, dirty: !0 }),
                                e.plugins.has(u) ||
                                    e.plugins.set(u, ((n = o), (r = e.calendar), new n(r))),
                                e.pendingPaint.add(e.plugins.get(u)));
                        });
                    },
                },
                {
                    key: 'setupAll',
                    value: function () {
                        var t = this;
                        this.plugins.forEach(function (e, n) {
                            var r = t.settings.get(n);
                            void 0 !== r &&
                                r.dirty &&
                                (e.setup(r.options), (r.dirty = !1), t.settings.set(n, r));
                        });
                    },
                },
                {
                    key: 'paintAll',
                    value: function () {
                        return Array.from(this.pendingPaint.values()).map(function (t) {
                            return t.paint();
                        });
                    },
                },
                {
                    key: 'destroyAll',
                    value: function () {
                        return this.allPlugins().map(function (t) {
                            return t.destroy();
                        });
                    },
                },
                {
                    key: 'getFromPosition',
                    value: function (t) {
                        return this.allPlugins().filter(function (e) {
                            var n;
                            return (
                                (null === (n = e.options) || void 0 === n ? void 0 : n.position) ===
                                t
                            );
                        });
                    },
                },
                {
                    key: 'getHeightFromPosition',
                    value: function (t) {
                        return this.getFromPosition(t)
                            .map(function (t) {
                                return t.options.dimensions.height;
                            })
                            .reduce(function (t, e) {
                                return t + e;
                            }, 0);
                    },
                },
                {
                    key: 'getWidthFromPosition',
                    value: function (t) {
                        return this.getFromPosition(t)
                            .map(function (t) {
                                return t.options.dimensions.width;
                            })
                            .reduce(function (t, e) {
                                return t + e;
                            }, 0);
                    },
                },
                {
                    key: 'allPlugins',
                    value: function () {
                        return Array.from(this.plugins.values());
                    },
                },
            ]),
            t
        );
    })(),
    lD = [
        function (t) {
            return {
                name: 'minute',
                allowedDomainType: ['day', 'hour'],
                rowsCount: function () {
                    return 10;
                },
                columnsCount: function () {
                    return 6;
                },
                mapping: function (e, n) {
                    return t.intervals('minute', e, t.date(n)).map(function (t, e) {
                        return { t: t, x: Math.floor(e / 10), y: e % 10 };
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('minute').valueOf();
                },
            };
        },
        function (t, e) {
            var n = e.domain;
            return {
                name: 'hour',
                allowedDomainType: ['month', 'week', 'day'],
                rowsCount: function () {
                    return 6;
                },
                columnsCount: function (e) {
                    switch (n.type) {
                        case 'week':
                            return 28;
                        case 'month':
                            return 4 * (n.dynamicDimension ? t.date(e).daysInMonth() : 31);
                        default:
                            return 4;
                    }
                },
                mapping: function (e, r) {
                    return t.intervals('hour', e, t.date(r)).map(function (e) {
                        var r = t.date(e),
                            i = r.hour(),
                            o = r.date(),
                            a = Math.floor(i / 6);
                        return (
                            'month' === n.type && (a += 4 * (o - 1)),
                            'week' === n.type && (a += 4 * +r.format('d')),
                            { t: e, x: a, y: Math.floor(i % 6) }
                        );
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('hour').valueOf();
                },
            };
        },
        function (t, e) {
            var n = e.domain,
                r = e.verticalOrientation;
            return {
                name: 'day',
                allowedDomainType: ['year', 'month', 'week'],
                rowsCount: function () {
                    return 'week' === n.type ? 1 : 7;
                },
                columnsCount: function (e) {
                    switch (n.type) {
                        case 'month':
                            return Math.ceil(
                                n.dynamicDimension && !r
                                    ? t.getMonthWeekNumber(t.date(e).endOf('month'))
                                    : 6
                            );
                        case 'year':
                            return Math.ceil(
                                n.dynamicDimension ? t.date(e).endOf('year').dayOfYear() / 7 : 54
                            );
                        default:
                            return 7;
                    }
                },
                mapping: function (e, r) {
                    var i = 0,
                        o = -1;
                    return t.intervals('day', e, t.date(r)).map(function (e) {
                        var r = t.date(e);
                        switch (n.type) {
                            case 'month':
                                o = t.getMonthWeekNumber(e) - 1;
                                break;
                            case 'year':
                                i !== r.week() && ((i = r.week()), (o += 1));
                                break;
                            case 'week':
                                o = r.weekday();
                        }
                        return { t: e, x: o, y: 'week' === n.type ? 0 : r.weekday() };
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('day').valueOf();
                },
            };
        },
        function (t, e) {
            var n = e.domain,
                r = e.verticalOrientation;
            return {
                name: 'xDay',
                allowedDomainType: ['year', 'month', 'week'],
                rowsCount: function (e) {
                    switch (n.type) {
                        case 'month':
                            return Math.ceil(
                                n.dynamicDimension && !r
                                    ? t.getMonthWeekNumber(t.date(e).endOf('month'))
                                    : 6
                            );
                        case 'year':
                            return Math.ceil(
                                n.dynamicDimension ? t.date(e).endOf('year').dayOfYear() / 7 : 54
                            );
                        default:
                            return 7;
                    }
                },
                columnsCount: function () {
                    return 'week' === n.type ? 1 : 7;
                },
                mapping: function (e, r) {
                    return t.intervals('day', e, t.date(r)).map(function (e) {
                        var r = t.date(e),
                            i = r.endOf('year').week(),
                            o = 0;
                        switch (n.type) {
                            case 'month':
                                o = t.getMonthWeekNumber(e) - 1;
                                break;
                            case 'year':
                                (1 === i &&
                                    r.week() === i &&
                                    (o = r.subtract(1, 'week').week() + 1),
                                    (o = r.week() - 1));
                                break;
                            case 'week':
                                o = r.weekday();
                        }
                        return { t: e, y: o, x: 'week' === n.type ? 0 : r.weekday() };
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('day').valueOf();
                },
            };
        },
        function (t) {
            return {
                name: 'ghDay',
                allowedDomainType: ['month'],
                rowsCount: function () {
                    return 7;
                },
                columnsCount: function (e) {
                    return t.getWeeksCountInMonth(e);
                },
                mapping: function (e, n) {
                    var r = t.getFirstWeekOfMonth(e),
                        i = t.getFirstWeekOfMonth(n),
                        o = -1,
                        a = r.weekday();
                    return t.intervals('day', r, i).map(function (e) {
                        var n = t.date(e).weekday();
                        return (n === a && (o += 1), { t: e, x: o, y: n });
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('day').valueOf();
                },
            };
        },
        function (t, e) {
            var n = e.domain;
            return {
                name: 'week',
                allowedDomainType: ['year', 'month'],
                rowsCount: function () {
                    return 1;
                },
                columnsCount: function (e) {
                    switch (n.type) {
                        case 'year':
                            return n.dynamicDimension
                                ? t.date(e).endOf('year').isoWeeksInYear()
                                : 53;
                        case 'month':
                            return n.dynamicDimension ? t.getWeeksCountInMonth(e) : 5;
                        default:
                            return 1;
                    }
                },
                mapping: function (e, n) {
                    var r = t.getFirstWeekOfMonth(e),
                        i = t.getFirstWeekOfMonth(n);
                    return t.intervals('week', r, i).map(function (t, e) {
                        return { t: t, x: e, y: 0 };
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('week').valueOf();
                },
            };
        },
        function (t) {
            return {
                name: 'month',
                allowedDomainType: ['year'],
                rowsCount: function () {
                    return 1;
                },
                columnsCount: function () {
                    return 12;
                },
                mapping: function (e, n) {
                    return t.intervals('month', e, t.date(n)).map(function (e) {
                        return { t: e, x: t.date(e).month(), y: 0 };
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('month').valueOf();
                },
            };
        },
        function (t) {
            return {
                name: 'year',
                allowedDomainType: [],
                rowsCount: function () {
                    return 1;
                },
                columnsCount: function () {
                    return 1;
                },
                mapping: function (e, n) {
                    return t.intervals('year', e, t.date(n)).map(function (t, e) {
                        return { t: t, x: e, y: 0 };
                    });
                },
                extractUnit: function (e) {
                    return t.date(e).startOf('year').valueOf();
                },
            };
        },
    ],
    fD = (function () {
        function t(e, n) {
            (nn(this, t),
                (this.settings = new Map()),
                (this.dateHelper = e),
                (this.options = n),
                (this.initiated = !1));
        }
        return (
            on(t, [
                {
                    key: 'get',
                    value: function (t) {
                        return this.settings.get(t);
                    },
                },
                {
                    key: 'has',
                    value: function (t) {
                        return this.settings.has(t);
                    },
                },
                {
                    key: 'init',
                    value: function () {
                        this.initiated || ((this.initiated = !0), this.add(lD));
                    },
                },
                {
                    key: 'add',
                    value: function (t) {
                        var e = this;
                        this.init();
                        var n = [];
                        (mv(t).forEach(function (t) {
                            var r = t(e.dateHelper, e.options.options);
                            (e.settings.set(r.name, r),
                                r.hasOwnProperty('parent') && n.push(r.name));
                        }),
                            n.forEach(function (t) {
                                var n = e.settings.get(e.settings.get(t).parent);
                                n &&
                                    e.settings.set(
                                        t,
                                        Object.assign(Object.assign({}, n), e.settings.get(t))
                                    );
                            }));
                    },
                },
            ]),
            t
        );
    })(),
    hD = (function () {
        function t() {
            (nn(this, t),
                (this.options = new Ij()),
                (this.dateHelper = new tD()),
                (this.templateCollection = new fD(this.dateHelper, this.options)),
                (this.dataFetcher = new pM(this)),
                (this.navigator = new km(this)),
                (this.populator = new GO(this)),
                (this.calendarPainter = new gb(this)),
                (this.eventEmitter = new vv()),
                (this.pluginManager = new cD(this)));
        }
        return (
            on(t, [
                {
                    key: 'createDomainCollection',
                    value: function (t, e) {
                        var n = !(arguments.length > 2 && void 0 !== arguments[2]) || arguments[2];
                        return new Tw(this.dateHelper, this.options.options.domain.type, t, e, n);
                    },
                },
                {
                    key: 'paint',
                    value: function (t, e) {
                        return hv(
                            this,
                            void 0,
                            void 0,
                            tn().mark(function n() {
                                return tn().wrap(
                                    function (n) {
                                        for (;;)
                                            switch ((n.prev = n.next)) {
                                                case 0:
                                                    return (
                                                        this.options.init(t),
                                                        (n.next = 3),
                                                        this.dateHelper.setup(this.options)
                                                    );
                                                case 3:
                                                    (this.templateCollection.init(),
                                                        (n.prev = 4),
                                                        sD(
                                                            this.templateCollection,
                                                            this.options.options
                                                        ),
                                                        (n.next = 11));
                                                    break;
                                                case 8:
                                                    return (
                                                        (n.prev = 8),
                                                        (n.t0 = n.catch(4)),
                                                        n.abrupt('return', Promise.reject(n.t0))
                                                    );
                                                case 11:
                                                    return (
                                                        e && this.pluginManager.add(mv(e)),
                                                        this.calendarPainter.setup(),
                                                        (this.domainCollection = new Tw(
                                                            this.dateHelper
                                                        )),
                                                        this.navigator.loadNewDomains(
                                                            this.createDomainCollection(
                                                                this.options.options.date.start,
                                                                this.options.options.range
                                                            )
                                                        ),
                                                        n.abrupt(
                                                            'return',
                                                            Promise.allSettled([
                                                                this.calendarPainter.paint(),
                                                                this.fill(),
                                                            ])
                                                        )
                                                    );
                                                case 16:
                                                case 'end':
                                                    return n.stop();
                                            }
                                    },
                                    n,
                                    this,
                                    [[4, 8]]
                                );
                            })
                        );
                    },
                },
                {
                    key: 'addTemplates',
                    value: function (t) {
                        this.templateCollection.add(t);
                    },
                },
                {
                    key: 'next',
                    value: function () {
                        var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 1,
                            e = this.navigator.loadNewDomains(
                                this.createDomainCollection(this.domainCollection.max, t + 1).slice(
                                    t
                                ),
                                ym.SCROLL_FORWARD
                            );
                        return Promise.allSettled([this.calendarPainter.paint(e), this.fill()]);
                    },
                },
                {
                    key: 'previous',
                    value: function () {
                        var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 1,
                            e = this.navigator.loadNewDomains(
                                this.createDomainCollection(this.domainCollection.min, -t),
                                ym.SCROLL_BACKWARD
                            );
                        return Promise.allSettled([this.calendarPainter.paint(e), this.fill()]);
                    },
                },
                {
                    key: 'jumpTo',
                    value: function (t) {
                        var e = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
                        return Promise.allSettled([
                            this.calendarPainter.paint(this.navigator.jumpTo(t, e)),
                            this.fill(),
                        ]);
                    },
                },
                {
                    key: 'fill',
                    value: function () {
                        var t = this,
                            e =
                                arguments.length > 0 && void 0 !== arguments[0]
                                    ? arguments[0]
                                    : this.options.options.data.source,
                            n = this.options.options,
                            r = this.templateCollection,
                            i = this.dateHelper.intervals(
                                n.domain.type,
                                this.domainCollection.max,
                                2
                            )[1],
                            o = this.dataFetcher.getDatas(e, this.domainCollection.min, i);
                        return new Promise(function (e, i) {
                            o.then(
                                function (i) {
                                    (t.domainCollection.fill(
                                        i,
                                        n.data,
                                        r.get(n.subDomain.type).extractUnit
                                    ),
                                        t.populator.populate(),
                                        e(null));
                                },
                                function (t) {
                                    i(t);
                                }
                            );
                        });
                    },
                },
                {
                    key: 'on',
                    value: function (t, e) {
                        this.eventEmitter.on(t, e);
                    },
                },
                {
                    key: 'dimensions',
                    value: function () {
                        return this.calendarPainter.dimensions;
                    },
                },
                {
                    key: 'destroy',
                    value: function () {
                        return this.calendarPainter.destroy();
                    },
                },
                {
                    key: 'extendDayjs',
                    value: function (t) {
                        return this.dateHelper.extend(t);
                    },
                },
            ]),
            t
        );
    })();
hD.VERSION = '4.2.4';
export { hD as default };
//# sourceMappingURL=/sm/0341510d854b68023659bb440cded9597f56e17154085b3a26450dc109101025.map
