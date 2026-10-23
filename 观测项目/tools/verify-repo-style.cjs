/* ============================================================
 * tools/verify-repo-style.cjs —— 统一性靠脚本判，不靠约定（《看不见的状态》）
 * 跑法：node tools/verify-repo-style.cjs
 *
 * 检查：
 *   1. 导航页与磁盘上的视角双向一致
 *   2. 每个视角都能回到导航页、都引用共享设计层与核心数学
 *   3. 各视角的 <style> 块里没有硬写界面色（主题色只能来自 theme.css）
 *   4. 核心数学文件可被 Node 直接加载（UMD 双端），观测这四件套齐备
 *   5. 与上两篇同一套记号：vec/apply/mul/det/inv/eigen/expm2 一个没少
 *   6. 正文页（文章.html）与项目同源（图片落盘、公式为服务端预渲染产物）
 *   7. 画布尺寸靠 CSS（3:2）而不是靠 width:100% 撑出来的固有比例
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VIEWS_DIR = path.join(ROOT, "views");
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; failures.push(name); console.log("  ✗ " + name + (detail ? " —— " + detail : "")); }
}
function read(p) { return fs.readFileSync(p, "utf8"); }
function exists(p) { return fs.existsSync(p); }

const indexHtml = read(path.join(ROOT, "index.html"));
const viewFiles = fs.readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".html")).sort();

console.log("[导航] 双向一致");
check("导航页存在", exists(path.join(ROOT, "index.html")));
check("磁盘上有 5 个视角", viewFiles.length === 5, "实际 " + viewFiles.length);
viewFiles.forEach((f) => {
  check("导航页链接到 " + f, indexHtml.includes("views/" + f));
});

console.log("\n[视角] 各自自足");
viewFiles.forEach((f) => {
  const html = read(path.join(VIEWS_DIR, f));
  check(f + " 能回到导航页", html.includes('href="../index.html"'));
  check(f + " 引用共享设计层", html.includes('href="../assets/theme.css"'));
  check(f + " 引用核心数学", html.includes('src="../assets/core.js"'));
  check(f + " 引用共享绘图层", html.includes('src="../assets/draw.js"'));
  check(f + " lang=zh-CN", html.includes('lang="zh-CN"'));
  check(f + " 页脚带 zh-CN 标记", html.includes('class="zh-CN"'));
  const styles = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  check(f + " 样式块无硬写界面色", !styles.some((s) => /#[0-9a-fA-F]{3,8}\b/.test(s)),
    (styles.join(" ").match(/#[0-9a-fA-F]{3,8}\b/g) || []).slice(0, 3).join(" "));
  /* 坐标换算只能有一处：视角不许自己写 sx/sy 这类映射（那是 draw.js 的事） */
  check(f + " 不自己写坐标映射", !/function\s+(sx|sy|wx|wy)\s*\(/.test(html));
});

console.log("\n[共享层] 只有一处定义");
const theme = read(path.join(ROOT, "assets", "theme.css"));
check("theme.css 定义了配色 token",
  theme.includes("--u:") && theme.includes("--v:") && theme.includes("--red:") && theme.includes("--purple:"));
check("五个视角都不自带第二套 token", viewFiles.every((f) => !read(path.join(VIEWS_DIR, f)).includes("--u:")));
/* 画布的尺寸靠 CSS 的 aspect-ratio 定：只写 width:100% 会让浏览器拿 height 属性
   当固有比例（300:520），把画布撑成比窗口还高的竖长条。这一条是踩出来的。 */
check("画布尺寸由 CSS 给定（aspect-ratio，不靠固有比例）",
  /\.stage\s+canvas\s*\{[^}]*aspect-ratio\s*:\s*3\s*\/\s*2/.test(theme));
const draw = read(path.join(ROOT, "assets", "draw.js"));
check("绘图层只有一处定义", !viewFiles.some((f) => /function\s+(sx|sy|wx|wy)\s*\(/.test(read(path.join(VIEWS_DIR, f)))));
check("'整条线画满画框'只有一处定义（view.reach 由取景算出来，不写死长度）",
  draw.includes("function reach(") &&
  viewFiles.some((f) => read(path.join(VIEWS_DIR, f)).includes("view.reach(")));
check("画框固定时用 view.clamp 约束对象（01 那一站）",
  draw.includes("function clamp(") &&
  read(path.join(VIEWS_DIR, "01-只看见一个数.html")).includes("view.clamp("));

console.log("\n[核心数学] 双端可加载");
let core = null, coreDetail = "";
try { core = require(path.join(ROOT, "assets", "core.js")); } catch (e) { coreDetail = e.message; }
check("core.js 可被 Node 直接 require", !!core, coreDetail);
check("观测四件套齐备（measure／observeMat／observabilityMatrix／observable／blindDirection）",
  !!core && ["measure", "observeMat", "observabilityMatrix", "observable", "blindDirection"].every((k) => typeof core[k] === "function"));
check("影子那两条路都在（矩阵指数／一步一步积分）",
  !!core && typeof core.shadowRun === "function" && typeof core.shadowIntegrate === "function");
check("差分那一路的三件（采样／差分／上界）",
  !!core && ["sampleTheta", "diffEstimate", "diffBound"].every((k) => typeof core[k] === "function"));
check("记号与上两篇同源（老底子一个没少）",
  !!core && ["vec", "apply", "mul", "det", "inv", "eigen", "expm2", "stickMat"].every((k) => typeof core[k] === "function"));

console.log("\n[正文页] 与项目同源");
const articlePath = path.join(ROOT, "文章.html");
check("正文网页版存在", exists(articlePath));
if (exists(articlePath)) {
  const art = read(articlePath);
  check("导航页链接到正文页", indexHtml.includes('href="文章.html"'));
  check("正文页能回到导航页", art.includes('href="index.html"'));
  check("正文页是单文件（不引外部样式表）", !/rel="stylesheet"/.test(art));
  check("正文页不引外部脚本", !/<script[^>]*\ssrc=/.test(art));
  check("正文页 lang=zh-CN", art.includes('lang="zh-CN"'));
  const imgRefs = (art.match(/src="(图\/[^"]+)"/g) || []).map((s) => s.slice(5, -1));
  check("正文页引用 14 张图", imgRefs.length === 14, "实际 " + imgRefs.length);
  check("正文页图片全部落盘", imgRefs.length > 0 && imgRefs.every((p) => exists(path.join(ROOT, p))));
  const nFm = (art.match(/class="fm/g) || []).length;
  const nIm = (art.match(/class="im"/g) || []).length;
  check("公式已由服务端转成标记（.im／.fm 合计 ≥ 12 处）", nFm + nIm >= 12, "展示 " + nFm + "、行内 " + nIm);
  const artBody = art.split("<article")[1] || art;
  check("正文不残留 LaTeX 定界符或命令",
    !artBody.includes("$") && !/\\frac|\\begin\{|\\lambda|\\theta/.test(artBody));
  check("正文页不含客户端公式脚本", !/class="katex"/.test(art) && !art.includes("auto-render"));
  const styles = art.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  check("正文页样式只有一块", styles.length === 1, "实际 " + styles.length);
  const oneStyle = styles.join("\n");
  check("正文页自带 :root 定色", /:root\s*\{[\s\S]*?\}/.test(oneStyle));
  const outsideRoot = oneStyle.replace(/:root\s*\{[\s\S]*?\}/, "");
  const stray = outsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  check("正文页配色只在 :root 里出现", stray.length === 0, "越界色值 " + stray.slice(0, 5).join(" "));
  check("正文页确实在用变量（var(--…) 至少 20 处）", (oneStyle.match(/var\(--/g) || []).length >= 20);
  const iframes = (art.match(/<iframe[^>]*src="([^"]+)"/g) || [])
    .map((s) => s.replace(/^.*src="/, "").replace(/"$/, ""));
  check("正文页就地内嵌 5 个站点", iframes.length === 5, "实际 " + iframes.length);
  const lost = iframes.filter((p) => !exists(path.join(ROOT, p)));
  check("内嵌站点全部落盘", iframes.length > 0 && lost.length === 0, lost.join(" "));
  /* 帽子上那一点：正文里 \hat{x} 全都得变成 .hat，不能漏成纯文本—— 
     那是"真的"与"算出来的替身"唯一的分别。 */
  check("帽子记号已经落到页面上（.hat ≥ 4 处）", (art.match(/class="hat"/g) || []).length >= 4,
    "实际 " + (art.match(/class="hat"/g) || []).length);
}

console.log("\n────────────────────────");
console.log("结构检查：" + pass + " 通过，" + fail + " 失败。");
if (fail > 0) { failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
