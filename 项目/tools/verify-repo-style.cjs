/* ============================================================
 * tools/verify-repo-style.cjs —— 统一性靠脚本判，不靠约定
 * 跑法：node tools/verify-repo-style.cjs
 *
 * 检查：
 *   1. 导航页与磁盘上的视角双向一致
 *   2. 每个视角都能回到导航页
 *   3. 每个视角都引用共享设计层与核心数学
 *   4. 页面 lang、页脚 zh-CN 齐备
 *   5. 各视角的 <style> 块里没有硬写界面色（主题色只能来自 theme.css）
 *   6. 核心数学文件可被 Node 直接加载（UMD 双端）
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
const viewFiles = fs.readdirSync(VIEWS_DIR).filter(f => f.endsWith(".html")).sort();

console.log("[导航] 双向一致");
check("导航页存在", exists(path.join(ROOT, "index.html")));
check("磁盘上有 5 个视角", viewFiles.length === 5, "实际 " + viewFiles.length);
viewFiles.forEach(f => {
  check("导航页链接到 " + f, indexHtml.includes("views/" + f));
});

console.log("\n[视角] 各自自足");
viewFiles.forEach(f => {
  const html = read(path.join(VIEWS_DIR, f));
  check(f + " 能回到导航页", html.includes('href="../index.html"'));
  check(f + " 引用共享设计层", html.includes('href="../assets/theme.css"'));
  check(f + " 引用核心数学", html.includes('src="../assets/core.js"'));
  check(f + " 引用共享绘图层", html.includes('src="../assets/draw.js"'));
  check(f + " lang=zh-CN", html.includes('lang="zh-CN"'));
  check(f + " 页脚带 zh-CN 标记", html.includes('class="zh-CN"'));
  const styles = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  const hexInStyle = styles.some(s => /#[0-9a-fA-F]{3,8}\b/.test(s));
  check(f + " 样式块无硬写界面色", !hexInStyle);
});

console.log("\n[共享层] 只有一处定义");
const theme = read(path.join(ROOT, "assets", "theme.css"));
check("theme.css 定义了配色 token", theme.includes("--u:") && theme.includes("--v:") && theme.includes("--red:"));
check("五个视角都不自带第二套 token", viewFiles.every(f => !read(path.join(VIEWS_DIR, f)).includes("--u:")));

console.log("\n[核心数学] 双端可加载");
let coreOk = false, coreDetail = "";
try {
  const L = require(path.join(ROOT, "assets", "core.js"));
  coreOk = typeof L.apply === "function" && typeof L.eigen === "function" && typeof L.expm2 === "function";
} catch (e) { coreDetail = e.message; }
check("core.js 可被 Node 直接 require", coreOk, coreDetail);

console.log("\n[正文页] 与项目同源");
const articlePath = path.join(ROOT, "文章.html");
check("正文网页版存在", exists(articlePath));
if (exists(articlePath)) {
  const art = read(articlePath);
  check("导航页链接到正文页", indexHtml.includes('href="文章.html"'));
  check("正文页能回到导航页", art.includes('href="index.html"'));
  /* 正文页改成「单文件 · 主题自带 · 公式服务端产出 · 项目就地内嵌」之后，
     这一段必须跟着改判据——是要求换了，不是放宽：
       · 以前要它引 assets/theme.css，现在单文件不该引任何外部样式表；
       · 以前要它引 KaTeX，现在公式在生成阶段就已经转成 .im/.fm 标记；
       · 以前要 <style> 里一个色值都不许有，现在它必须自带 :root 定色，
         判据换成「:root 之外不许有硬写色」——"配色只有一处来源"仍然守得住。
     另加一条新形式独有的：五个站点是就地嵌进来的，那些页面必须真的在盘上。 */
  check("正文页是单文件（不引外部样式表）", !/rel="stylesheet"/.test(art));
  check("正文页不引外部脚本", !/<script[^>]*\ssrc=/.test(art));
  check("正文页 lang=zh-CN", art.includes('lang="zh-CN"'));
  const imgRefs = (art.match(/src="(图\/[^"]+)"/g) || []).map(s => s.slice(5, -1));
  check("正文页引用 15 张图", imgRefs.length === 15, "实际 " + imgRefs.length);
  check("正文页图片全部落盘", imgRefs.length > 0 && imgRefs.every(p => exists(path.join(ROOT, p))));
  const nFm = (art.match(/class="fm/g) || []).length;
  const nIm = (art.match(/class="im"/g) || []).length;
  check("公式已由服务端转成标记（.im／.fm 合计 ≥ 12 处）", nFm + nIm >= 12,
    "展示 " + nFm + "、行内 " + nIm);
  const artBody = art.split("<article")[1] || art;
  check("正文不残留 LaTeX 定界符或命令",
    !artBody.includes("$") && !/\\frac|\\begin\{|\\lambda|\\theta/.test(artBody));
  check("正文页不含 KaTeX 产物或客户端公式脚本",
    !/class="katex"/.test(art) && !art.includes("auto-render"));
  const styles = art.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  check("正文页样式只有一块", styles.length === 1, "实际 " + styles.length);
  const oneStyle = styles.join("\n");
  check("正文页自带 :root 定色", /:root\s*\{[\s\S]*?\}/.test(oneStyle));
  const outsideRoot = oneStyle.replace(/:root\s*\{[\s\S]*?\}/, "");
  const stray = outsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  check("正文页配色只在 :root 里出现", stray.length === 0, "越界色值 " + stray.slice(0, 5).join(" "));
  check("正文页确实在用变量（var(--…) 至少 20 处）", (oneStyle.match(/var\(--/g) || []).length >= 20);
  const iframes = (art.match(/<iframe[^>]*src="([^"]+)"/g) || [])
    .map(s => s.replace(/^.*src="/, "").replace(/"$/, ""));
  check("正文页就地内嵌 5 个站点", iframes.length === 5, "实际 " + iframes.length);
  const lostI = iframes.filter(p => !exists(path.join(ROOT, p)));
  check("内嵌站点全部落盘", iframes.length > 0 && lostI.length === 0, lostI.join(" "));
}

console.log("\n────────────────────────");
console.log("结构检查：" + pass + " 通过，" + fail + " 失败。");
if (fail > 0) { failures.forEach(f => console.log("  - " + f)); process.exit(1); }
