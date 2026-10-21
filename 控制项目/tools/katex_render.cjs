#!/usr/bin/env node
// katex_render.cjs — 把公式清单预渲染为 KaTeX HTML 片段
// 用法: node katex_render.cjs <formulas.json> <out.json>
// formulas.json: [{"latex":"...","display":false}, ...]
// out.json: ["<span class=\"katex\">...</span>", ...]
// 依赖 katex 包：优先 require('katex')，失败时用 KATEX_PATH 或下方默认路径。
const fs = require('fs');
const path = require('path');

let katex;
try {
  katex = require('katex');
} catch (e) {
  const fallback = process.env.KATEX_PATH
    || 'C:/Users/Lenovo/.workbuddy/binaries/node/workspace/node_modules/katex';
  katex = require(path.resolve(fallback));
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node katex_render.cjs <formulas.json> <out.json>');
  process.exit(2);
}
const formulas = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const out = formulas.map((f) => {
  try {
    return katex.renderToString(f.latex, {
      displayMode: !!f.display,
      throwOnError: true,
      output: 'html',
    });
  } catch (e) {
    console.error('RENDER FAIL:', f.latex, '=>', e.message);
    process.exit(1);
  }
});
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('rendered', out.length, 'formulas ->', outPath);
