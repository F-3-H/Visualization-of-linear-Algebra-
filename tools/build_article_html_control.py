# -*- coding: utf-8 -*-
"""从 md 正文生成《让会倒的东西站住》的网页版（控制项目/文章.html，离线自足）。

与上一篇的 tools/build_article_html.py 同一套做法：
解析 md 块 → 抽出公式清单 → 调 node katex_render.cjs 预渲染
→ 拼出静态 HTML（无客户端 JS 依赖，公式是 KaTeX 服务端产物）。

差别只有两处：正文的图引在 控制图/，网页版引在项目内的 图/
（图在两处同源，跑 render_figures_control.py 之后 copy 过来）。

用法：python tools/build_article_html_control.py
"""
import json
import os
import re
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # E:\线性代数
PROJ = os.path.join(ROOT, "控制项目")
MD_PATH = os.path.join(ROOT, "线性代数基础·让会倒的东西站住.md")
OUT_HTML = os.path.join(PROJ, "文章.html")
TMP_DIR = os.path.join(ROOT, "tools", "_article_tmp_control")
NODE = r"C:\Users\Lenovo\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
RENDERER = os.path.join(PROJ, "tools", "katex_render.cjs")

TITLE = "线性代数基础 · 让会倒的东西站住"
SUBTITLE = "让会倒的东西站住 · 网页版"

INLINE_MATH = re.compile(r"\$([^$]+)\$")


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def png_size(path):
    """读 PNG IHDR 拿真实像素尺寸；写进 width/height 属性，懒加载也不跳版。"""
    try:
        with open(path, "rb") as f:
            head = f.read(26)
        if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
            return None
        return struct.unpack(">II", head[16:24])
    except OSError:
        return None


def parse_blocks():
    with open(MD_PATH, encoding="utf-8") as f:
        lines = f.read().split("\n")
    blocks = []
    title = lines[0].lstrip("# ").strip()
    for raw in lines[1:]:
        line = raw.strip()
        if not line:
            continue
        m_img = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", line)
        if m_img:
            rel = m_img.group(2).replace("\\", "/")
            blocks.append(("figure", "图/" + os.path.basename(rel), m_img.group(1)))
            continue
        if line.startswith("$$") and line.endswith("$$"):
            blocks.append(("display", line[2:-2].strip()))
            continue
        # 段落：拆成 text / math 片段
        segs, pos = [], 0
        for m in INLINE_MATH.finditer(line):
            if m.start() > pos:
                segs.append(("t", line[pos:m.start()]))
            segs.append(("m", m.group(1)))
            pos = m.end()
        if pos < len(line):
            segs.append(("t", line[pos:]))
        blocks.append(("p", segs))
    return title, blocks


def main():
    title, blocks = parse_blocks()

    # 1) 公式清单（按出现顺序；display 与行内共用同一序列）
    formulas = []
    for block in blocks:
        if block[0] == "display":
            formulas.append({"latex": block[1], "display": True})
        elif block[0] == "p":
            for typ, val in block[1]:
                if typ == "m":
                    formulas.append({"latex": val, "display": False})
    os.makedirs(TMP_DIR, exist_ok=True)
    f_json = os.path.join(TMP_DIR, "formulas.json")
    f_out = os.path.join(TMP_DIR, "rendered.json")
    with open(f_json, "w", encoding="utf-8") as f:
        json.dump(formulas, f, ensure_ascii=False)

    # 2) node 预渲染
    proc = subprocess.run([NODE, RENDERER, f_json, f_out],
                          capture_output=True, text=True, encoding="utf-8")
    print(proc.stdout.strip() or proc.stderr.strip())
    if proc.returncode != 0:
        sys.exit("KaTeX 预渲染失败")
    with open(f_out, encoding="utf-8") as f:
        rendered = json.load(f)

    # 3) 拼 HTML
    body = []
    mi = 0  # 公式游标
    for block in blocks:
        kind = block[0]
        if kind == "figure":
            _, path, cap = block
            size = png_size(os.path.join(PROJ, path))
            dims = ' width="%d" height="%d"' % size if size else ""
            body.append(
                '<figure><img src="%s" alt="%s"%s loading="lazy">'
                '<figcaption>%s</figcaption></figure>'
                % (esc(path), esc(cap), dims, esc(cap)))
        elif kind == "display":
            body.append('<div class="formula-display">%s</div>' % rendered[mi])
            mi += 1
        else:
            parts = []
            for typ, val in block[1]:
                if typ == "t":
                    parts.append(esc(val))
                else:
                    parts.append(rendered[mi])
                    mi += 1
            body.append("<p>%s</p>" % "".join(parts))
    assert mi == len(rendered), "公式游标与渲染数不一致"

    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<link rel="stylesheet" href="assets/theme.css">
<link rel="stylesheet" href="assets/katex/katex.min.css">
<style>
  .reader {
    max-width: 760px;
    margin: 18px auto 0;
    padding: 30px 26px 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", serif;
    font-size: 16.5px;
    line-height: 1.95;
    color: var(--ink);
  }
  .reader h1 {
    text-align: center;
    font-size: 23px;
    letter-spacing: 1px;
    margin: 4px 0 30px;
    font-weight: 700;
  }
  .reader p { margin: 0 0 1.05em; text-align: justify; }
  .reader p:last-child { margin-bottom: 0; }
  .reader figure { margin: 24px 0; text-align: center; }
  .reader figure img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
  }
  .reader figcaption {
    font-size: 12.5px;
    color: var(--ink-soft);
    margin-top: 8px;
    font-family: var(--sans);
  }
  .formula-display { margin: 22px 0; overflow-x: auto; }
  .reader .katex { font-size: 1.06em; }
  .reader .katex-display { margin: 0; }
  .reader-end {
    max-width: 760px;
    margin: 14px auto 0;
    text-align: center;
    font-family: var(--sans);
    font-size: 13px;
  }
  .reader-end a { color: var(--v); text-decoration: none; }
  .reader-end a:hover { text-decoration: underline; }
  @media (max-width: 720px) {
    .reader { padding: 22px 16px 10px; font-size: 15.5px; }
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">线性代数基础 · 正文<small>__SUBTITLE__</small></div>
  <a class="back" href="index.html">← 回到项目</a>
</header>

<article class="reader">
  <h1>__TITLE__</h1>
__BODY__
</article>

<div class="reader-end">
  <p>正文与 <a href="index.html">五个视角的交互项目</a>同源——每一张图，都是从项目里同一套数学算出来的。</p>
</div>

<footer class="footer">
  <span class="zh-CN"></span>网页版正文；公式由 KaTeX 离线渲染（assets/katex），图在 图/ 目录，均无需联网。
</footer>
</body>
</html>
"""
    html = (html.replace("__TITLE__", esc(title))
                .replace("__SUBTITLE__", esc(SUBTITLE))
                .replace("__BODY__", "\n  ".join(body)))

    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print("written:", OUT_HTML, "%.1f KB" % (len(html.encode('utf-8')) / 1024))


if __name__ == "__main__":
    main()
