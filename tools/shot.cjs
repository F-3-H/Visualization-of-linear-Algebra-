/* ============================================================
 * tools/shot.cjs —— 给页面拍一张图，自己看排版有没有塌
 * 跑法：node tools/shot.cjs <页面路径或 URL> <输出.png> [宽] [高] [--full]
 * 依赖：playwright-core（managed workspace）+ 本机 Chrome/Edge
 * ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

function loadPlaywright() {
  try { return require("playwright-core"); }
  catch (e) {
    console.log("[跳过] 未安装 playwright-core —— 未执行，不是通过。");
    process.exit(2);
  }
}
function findBrowser() {
  const cands = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.log("[跳过] 找不到 Chrome/Edge。");
  process.exit(2);
}

(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const full = process.argv.includes("--full");
  const [target, out, w, h] = args;
  if (!target || !out) { console.log("用法：node tools/shot.cjs <页面> <输出.png> [宽] [高] [--full]"); process.exit(1); }
  const W = parseInt(w || "1280", 10), H = parseInt(h || "900", 10);
  const url = /^(https?|file):/.test(target) ? target : "file:///" + path.resolve(target).replace(/\\/g, "/");

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(450);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out, fullPage: full });
  console.log("写出", out, W + "x" + H, full ? "(整页)" : "");
  if (errs.length) console.log("控制台错误：\n  " + errs.join("\n  "));
  await browser.close();
})();
