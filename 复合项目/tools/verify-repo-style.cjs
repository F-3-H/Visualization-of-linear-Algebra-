/* ============================================================
 * tools/verify-repo-style.cjs —— 项目统一性检查
 * 跑法：node tools/verify-repo-style.cjs
 *
 * 不靠人自觉，靠这条脚本判定：
 *   - 导航页与磁盘上的视角双向一致（不多不少）
 *   - 每个视角都能回到导航页
 *   - 每个视角都引用共享设计层与核心数学、绘图层
 *   - lang 与页脚齐备，样式块里没有硬写界面色
 *   缺依赖/文件时如实报错并 exit 1，不静默通过。
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; failures.push(name + (detail ? " —— " + detail : "")); console.log("  ✗ " + name + (detail ? " —— " + detail : "")); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

console.log("\n[文件齐备]");
["index.html", "assets/theme.css", "assets/core.js", "assets/draw.js", "tests/verify-core.cjs"].forEach(function (f) {
  check("存在 " + f, exists(f));
});

console.log("\n[导航 ↔ 视角 双向一致]");
const index = read("index.html");
const linked = [...index.matchAll(/href="(views\/[^"]+)"/g)].map(m => m[1]);
const onDisk = fs.readdirSync(path.join(ROOT, "views")).filter(f => f.endsWith(".html")).map(f => "views/" + f);
check("导航链到的视角数 = 磁盘上的视角数（" + onDisk.length + "）", new Set(linked).size === onDisk.length,
  "导航 " + linked.length + " 个，磁盘 " + onDisk.length + " 个");
onDisk.forEach(function (v) {
  check("导航里有 " + v, linked.indexOf(v) >= 0);
});
linked.forEach(function (v) {
  check("磁盘上有 " + v, onDisk.indexOf(v) >= 0);
});

console.log("\n[每个视角：回链、共享层、外壳]");
onDisk.forEach(function (v) {
  const html = read(v);
  check(v + " 能回到导航页", /href="\.\.\/index\.html"/.test(html));
  check(v + " 引用共享设计层", /href="\.\.\/assets\/theme\.css"/.test(html));
  check(v + " 引用核心数学", /src="\.\.\/assets\/core\.js"/.test(html));
  check(v + " 引用共享绘图层", /src="\.\.\/assets\/draw\.js"/.test(html));
  check(v + " lang 正确", /<html lang="zh-CN">/.test(html));
  check(v + " 页脚齐备", /class="footer"/.test(html) && /class="zh-CN"/.test(html));
  check(v + " 不硬写界面色（样式块里无 #hex 给背景/文字）", !/(background|color)\s*:\s*#[0-9a-fA-F]{3,6}/.test(html.split("<style>")[1] || ""));
});

console.log("\n[核心数学：只此一处]");
const core = read("assets/core.js");
check("core.js 暴露 mul（复合）", /function mul\(A, B\)/.test(core));
check("core.js 暴露 mixMat（过渡）", /function mixMat\(A, B, s\)/.test(core));
const draw = read("assets/draw.js");
check("draw.js 暴露 warpGrid（网格的像）", /function warpGrid\(M, o\)/.test(draw));
check("warpGrid 已挂到 view 上", /grid: grid, warpGrid: warpGrid/.test(draw));

console.log("\n────────────────────────");
console.log("统一性检查：" + pass + " 项通过。");
if (fail > 0) {
  console.log("失败 " + fail + " 项：");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
console.log("全部通过。");
