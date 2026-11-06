/**
 * ⚠️ 自动生成，请勿手改 —— 改这个文件等于给自己埋一个"跟真包行为不一致"的雷。
 *
 * cookie 的 CJS 镜像（**仅供 jest**，不进运行时）：
 * jest 里 light-my-request@6(CJS) 会 require('cookie')，而 cookie@2 是纯 ESM，
 * Node 22.x 的 jest 无法 require(esm) → 所有 app.inject() 用例整片失败。
 * jest.config.js 的 moduleNameMapper 把 'cookie' 指到本文件兜底。
 *
 * 来源：node_modules/cookie/dist/index.js
 * 版本：cookie@2.0.1
 * 导出：parseCookie, parseSetCookie, stringifyCookie, stringifySetCookie
 * 再生成：node scripts/jest/shims/build-cookie-shim.mjs
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, {
  parseCookie: () => parseCookie,
  parseSetCookie: () => parseSetCookie,
  stringifyCookie: () => stringifyCookie,
  stringifySetCookie: () => stringifySetCookie
});
module.exports = __toCommonJS(stdin_exports);
const cookieNameRegExp = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/;
const cookieValueRegExp = /^[\u0021-\u003A\u003C-\u007E]*$/;
const domainValueRegExp = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const pathValueRegExp = /^[\u0020-\u003A\u003D-\u007E]*$/;
const maxAgeRegExp = /^-?\d+$/;
const cookieOctetRegExp = /^[!#$&'()*+\-.\/0-9:<=>?@A-Z[\]\^_`a-z{|}~]*$/;
const NullObject = /* @__PURE__ */ (() => {
  const C = function() {
  };
  C.prototype = /* @__PURE__ */ Object.create(null);
  return C;
})();
function parseCookie(str, options) {
  const obj = new NullObject();
  const len = str.length;
  if (len < 2)
    return obj;
  const dec = options?.decode || decode;
  let index = 0;
  do {
    const eqIdx = eqIndex(str, index, len);
    if (eqIdx === len)
      break;
    const endIdx = endIndex(str, index, len);
    if (eqIdx > endIdx) {
      index = str.lastIndexOf(";", eqIdx - 1) + 1;
      continue;
    }
    const key = valueSlice(str, index, eqIdx);
    if (obj[key] === void 0) {
      obj[key] = dec(valueSlice(str, eqIdx + 1, endIdx));
    }
    index = endIdx + 1;
  } while (index < len);
  return obj;
}
function stringifyCookie(cookie, options) {
  const enc = options?.encode || defaultEncode;
  const keys = Object.keys(cookie);
  let str = "";
  for (let i = 0; i < keys.length; i++) {
    const name = keys[i];
    const val = cookie[name];
    if (val === void 0)
      continue;
    if (!cookieNameRegExp.test(name)) {
      throw new TypeError(`cookie name is invalid: ${name}`);
    }
    const value = enc(val);
    if (!cookieValueRegExp.test(value)) {
      throw new TypeError(`cookie val is invalid: ${val}`);
    }
    if (str)
      str += "; ";
    str += name + "=" + value;
  }
  return str;
}
function stringifySetCookie(cookie, options) {
  const enc = options?.encode || defaultEncode;
  if (!cookieNameRegExp.test(cookie.name)) {
    throw new TypeError(`argument name is invalid: ${cookie.name}`);
  }
  const value = cookie.value == null ? "" : enc(cookie.value);
  if (!cookieValueRegExp.test(value)) {
    throw new TypeError(`argument val is invalid: ${cookie.value}`);
  }
  let str = cookie.name + "=" + value;
  if (cookie.maxAge !== void 0) {
    if (!Number.isInteger(cookie.maxAge)) {
      throw new TypeError(`option maxAge is invalid: ${cookie.maxAge}`);
    }
    str += "; Max-Age=" + cookie.maxAge;
  }
  if (cookie.domain) {
    if (!domainValueRegExp.test(cookie.domain)) {
      throw new TypeError(`option domain is invalid: ${cookie.domain}`);
    }
    str += "; Domain=" + cookie.domain;
  }
  if (cookie.path) {
    if (!pathValueRegExp.test(cookie.path)) {
      throw new TypeError(`option path is invalid: ${cookie.path}`);
    }
    str += "; Path=" + cookie.path;
  }
  if (cookie.expires) {
    if (!Number.isFinite(cookie.expires.valueOf())) {
      throw new TypeError(`option expires is invalid: ${cookie.expires}`);
    }
    str += "; Expires=" + cookie.expires.toUTCString();
  }
  if (cookie.httpOnly) {
    str += "; HttpOnly";
  }
  if (cookie.secure) {
    str += "; Secure";
  }
  if (cookie.partitioned) {
    str += "; Partitioned";
  }
  if (cookie.priority) {
    const priority = typeof cookie.priority === "string" ? cookie.priority.toLowerCase() : void 0;
    switch (priority) {
      case "low":
        str += "; Priority=Low";
        break;
      case "medium":
        str += "; Priority=Medium";
        break;
      case "high":
        str += "; Priority=High";
        break;
      default:
        throw new TypeError(`option priority is invalid: ${cookie.priority}`);
    }
  }
  if (cookie.sameSite) {
    const sameSite = typeof cookie.sameSite === "string" ? cookie.sameSite.toLowerCase() : cookie.sameSite;
    switch (sameSite) {
      case true:
      case "strict":
        str += "; SameSite=Strict";
        break;
      case "lax":
        str += "; SameSite=Lax";
        break;
      case "none":
        str += "; SameSite=None";
        break;
      default:
        throw new TypeError(`option sameSite is invalid: ${cookie.sameSite}`);
    }
  }
  return str;
}
function parseSetCookie(str, options) {
  const dec = options?.decode || decode;
  const len = str.length;
  const endIdx = endIndex(str, 0, len);
  let eqIdx = eqIndex(str, 0, len);
  const setCookie = eqIdx < endIdx ? {
    name: valueSlice(str, 0, eqIdx),
    value: dec(valueSlice(str, eqIdx + 1, endIdx))
  } : { name: "", value: dec(valueSlice(str, 0, endIdx)) };
  let index = endIdx + 1;
  while (index < len) {
    const endIdx2 = endIndex(str, index, len);
    if (eqIdx < index)
      eqIdx = eqIndex(str, index, len);
    const attr = eqIdx < endIdx2 ? valueSlice(str, index, eqIdx) : valueSlice(str, index, endIdx2);
    const val = eqIdx < endIdx2 ? valueSlice(str, eqIdx + 1, endIdx2) : void 0;
    switch (attr.toLowerCase()) {
      case "httponly":
        setCookie.httpOnly = true;
        break;
      case "secure":
        setCookie.secure = true;
        break;
      case "partitioned":
        setCookie.partitioned = true;
        break;
      case "domain":
        setCookie.domain = val;
        break;
      case "path":
        setCookie.path = val;
        break;
      case "max-age":
        if (val && maxAgeRegExp.test(val))
          setCookie.maxAge = Number(val);
        break;
      case "expires":
        if (!val)
          break;
        const date = new Date(val);
        if (Number.isFinite(date.valueOf()))
          setCookie.expires = date;
        break;
      case "priority":
        if (!val)
          break;
        const priority = val.toLowerCase();
        if (priority === "low" || priority === "medium" || priority === "high") {
          setCookie.priority = priority;
        }
        break;
      case "samesite":
        if (!val)
          break;
        const sameSite = val.toLowerCase();
        if (sameSite === "lax" || sameSite === "strict" || sameSite === "none") {
          setCookie.sameSite = sameSite;
        }
        break;
    }
    index = endIdx2 + 1;
  }
  return setCookie;
}
function endIndex(str, min, len) {
  const index = str.indexOf(";", min);
  return index === -1 ? len : index;
}
function eqIndex(str, min, len) {
  const index = str.indexOf("=", min);
  return index === -1 ? len : index;
}
function valueSlice(str, min, max) {
  if (min === max)
    return "";
  let start = min;
  let end = max;
  do {
    const code = str.charCodeAt(start);
    if (code !== 32 && code !== 9)
      break;
  } while (++start < end);
  while (end > start) {
    const code = str.charCodeAt(end - 1);
    if (code !== 32 && code !== 9)
      break;
    end--;
  }
  return str.slice(start, end);
}
function decode(str) {
  if (str.indexOf("%") === -1)
    return str;
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}
function defaultEncode(str) {
  return cookieOctetRegExp.test(str) ? str : encodeURIComponent(str);
}
