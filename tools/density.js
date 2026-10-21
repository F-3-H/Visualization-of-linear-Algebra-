// 文章密度自检：配图、公式、中文字数、哲学/技术词频
// 跑法：node tools/density.js [md文件]
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const file = process.argv[2] || "线性代数基础·让会倒的东西站住.md";
const md = fs.readFileSync(path.join(ROOT, file), "utf8");

const cn = (md.match(/[\u4e00-\u9fa5]/g) || []).length;
const imgs = (md.match(/!\[/g) || []).length;

// 公式：$$...$$ 各算一个；剩下的成对 $ 每个算一个
let rest = md.replace(/\$\$[\s\S]*?\$\$/g, "\u0000");
const blocks = (md.match(/\$\$/g) || []).length / 2;
const inline = (rest.match(/\$/g) || []).length / 2;
const nf = blocks + inline;

const PHIL = ["内因", "外因", "矛盾", "量变", "质变", "根据", "条件", "整体", "部分", "通过内因"];
const TECH = ["特征值", "特征方向", "矩阵", "向量", "行列式", "反馈", "闭环", "开环",
              "极点配置", "能控性", "状态方程", "线性化", "特征方程", "复平面"];
const cnt = (list) => list.reduce((s, w) => s + md.split(w).length - 1, 0);

console.log(`文件：${file}`);
console.log(`中文字数 ${cn}　配图 ${imgs} 张 → ${(imgs / cn * 1000).toFixed(2)} 张/千字（基线 2.88）`);
console.log(`块公式 ${blocks} 个、行内公式 ${inline} 个 → ${nf} 个 → ${(nf / cn * 1000).toFixed(2)} 个/千字（上一篇 4.61）`);
const p = cnt(PHIL), t = cnt(TECH);
console.log(`哲学词 ${p}（${PHIL.map(w => w + cnt([w])).join(" ")}）`);
console.log(`技术词 ${t}`);
console.log(p > t ? "✓ 哲学是工作语言（哲学词压过技术词）" : "✗ 技术词压过了哲学词，要改");
console.log(`小标题（## 开头）${(md.match(/^##/gm) || []).length} 个 —— 应为 0（通篇连续行文）`);
const imgsList = [...md.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map(m => m[2]);
const missing = imgsList.filter(p2 => !fs.existsSync(path.join(ROOT, p2)));
console.log(`正文引用的图：${imgsList.length} 张，落盘 ${imgsList.length - missing.length} 张` +
  (missing.length ? `；缺 ${missing.join("、")}` : ""));
