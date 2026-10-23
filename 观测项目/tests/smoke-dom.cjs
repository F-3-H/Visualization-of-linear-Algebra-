/* ============================================================
 * tests/smoke-dom.cjs —— 无浏览器冒烟测试
 * 跑法：node tests/smoke-dom.cjs
 *
 * 用 Proxy 垫片模拟 DOM/Canvas，把每个视角的内联脚本
 * 真实跑一遍（初始化 + 首次绘制 + 各预设/切换的处理器），
 * 抓 typo、undefined、null 引用这类运行时错误。
 * 真正的视觉效果仍需在浏览器里目视确认。
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "assets", "core.js"));
const D = require(path.join(ROOT, "assets", "draw.js"));

function fakeCtx() {
  const store = {
    /* 桩件要照着真实 2D 上下文的样子垫。measureText 在真浏览器里返回 {width}，
       若让 Proxy 把它垫成"返回 undefined 的空函数"，任何量文字宽度的绘图代码
       都会整段崩掉——那报的是桩件的错，不是页面的错（第一次撞见就是这条：
       共享绘图层给文字加底衬后开始量宽度，桩件里就"失败"了）。 */
    measureText(s) { return { width: String(s).length * 6 }; }
  };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      return function () {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function fakeEl(tag) {
  const el = {
    tagName: tag,
    style: {},
    children: [],
    _handlers: {},
    textContent: "",
    innerHTML: "",
    value: "0",
    width: 0,
    height: 0,
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 520 }; },
    getContext() { return fakeCtx(); }
  };
  return el;
}

function runView(file) {
  const html = fs.readFileSync(path.join(ROOT, "views", file), "utf8");
  const ids = {};
  const re = /id="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) ids[m[1]] = fakeEl("div");
  const documentShim = {
    getElementById(id) {
      if (!ids[id]) throw new Error("getElementById('" + id + "') → null");
      return ids[id];
    },
    createElement(tag) { return fakeEl(tag); }
  };
  const windowShim = {
    Lin: L, Draw: D,
    devicePixelRatio: 1,
    addEventListener() {}
  };
  const blocks = [];
  const sre = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
  while ((m = sre.exec(html)) !== null) blocks.push(m[1]);
  if (blocks.length !== 1) throw new Error("预期 1 段内联脚本，实际 " + blocks.length);
  const fn = new Function("window", "document", "self", blocks[0]);
  fn(windowShim, documentShim, windowShim);
  // 冒烟：把所有按钮与输入处理器各跑一遍；输入用多组值逼出更多路径
  // 桩件照真实 API 垫：浏览器里事件处理器的 this 就是那个元素，
  // 所以这里用 h.call(el, {})，否则"处理器里写了 this.value"会被误报成页面出错。
  let fired = 0;
  const inputValues = ["0", "1", "-2.5", "0.5", "100"];
  Object.values(ids).forEach(el => {
    (el._handlers.click || []).forEach(h => { try { h.call(el, {}); fired++; } catch (e) { throw new Error("click 处理器炸了：" + e.message); } });
    (el._handlers.input || []).forEach(h => {
      inputValues.forEach(v => {
        el.value = v;
        try { h.call(el, {}); fired++; } catch (e) { throw new Error("input 处理器炸了（值 " + v + "）：" + e.message); }
      });
    });
  });
  return fired;
}

const files = fs.readdirSync(path.join(ROOT, "views")).filter(f => f.endsWith(".html")).sort();
let fail = 0;
files.forEach(f => {
  try {
    const fired = runView(f);
    console.log("  ✓ " + f + "（初始化 + 首帧绘制 + " + fired + " 个事件处理器）");
  } catch (e) {
    fail++;
    console.log("  ✗ " + f + " —— " + e.message);
  }
});
console.log("\n────────────────────────");
console.log(fail ? "冒烟测试失败 " + fail + " 个视角。" : "五个视角全部初始化、首帧绘制、事件处理器无运行时错误。");
process.exit(fail ? 1 : 0);
