# -*- coding: utf-8 -*-
r"""校验 文章.html 与 md 正文的保真性（重新生成文章页后必跑）。

比对项：
  - 段落数 / 图数 / 展示公式数 / 公式总数（行内 + 展示）
  - 逐段文本：md 段落去掉 $...$ 后的纯文本 vs HTML 段落剥掉 KaTeX span 再剥标签的纯文本

注意：md 的 $$...$$ 展示行不能按 \$[^$]+\$ 数——`$$x$$` 会被误配成一个
"行内公式"匹配，必须先把展示行剔出去再数行内的。

用法：
  python tools/verify_article_html.py                       # 默认：上一篇
  python tools/verify_article_html.py <md> <html>           # 指定某一篇
两篇是同一套工艺，所以这一个脚本同时管两篇：不传参就是《一捆数与一张表》，
传参就能校验《让会倒的东西站住》——避免为每一篇复制一份校验器，
复制出去的那份迟早会与这一份走散。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "线性代数基础·一捆数与一张表.md")
HTML = (sys.argv[2] if len(sys.argv) > 2
        else os.path.join(ROOT, "项目", "文章.html"))
if not os.path.isabs(MD):
    MD = os.path.join(ROOT, MD)
if not os.path.isabs(HTML):
    HTML = os.path.join(ROOT, HTML)

IMG_LINE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)$")
INLINE = re.compile(r"\$[^$]+\$")


def parse_md():
    paras, figs, inline, disp = [], 0, 0, 0
    lines = open(MD, encoding="utf-8").read().split("\n")
    for raw in lines[1:]:
        line = raw.strip()
        if not line:
            continue
        if IMG_LINE.match(line):
            figs += 1
            continue
        if line.startswith("$$") and line.endswith("$$"):
            disp += 1
            continue
        inline += len(INLINE.findall(line))
        paras.append(INLINE.sub("", line))
    return paras, figs, inline, disp


def strip_katex_spans(s):
    """配平计数剥掉 <span class="katex">...</span> 整棵子树。"""
    out, i = [], 0
    marker = '<span class="katex">'
    while True:
        j = s.find(marker, i)
        if j < 0:
            out.append(s[i:])
            break
        out.append(s[i:j])
        depth, k = 1, j + len(marker)
        while depth:
            nxt_open = s.find("<span", k)
            nxt_close = s.find("</span>", k)
            if nxt_close < 0:
                return None
            if nxt_open >= 0 and nxt_open < nxt_close:
                depth += 1
                k = nxt_open + 5
            else:
                depth -= 1
                k = nxt_close + 7
        i = k
    return "".join(out)


def main():
    md_paras, md_figs, md_inline, md_disp = parse_md()
    html = open(HTML, encoding="utf-8").read()
    m = re.search(r'<article class="reader">(.*?)</article>', html, re.S)
    if not m:
        sys.exit("找不到 <article class=\"reader\"> 块")
    body = m.group(1)

    html_paras = re.findall(r"<p>(.*?)</p>", body, re.S)
    html_figs = len(re.findall(r"<figure>", body))
    html_katex = len(re.findall(r'<span class="katex">', html))
    html_disp = len(re.findall(r'<div class="formula-display">', body))

    fails = []
    if len(html_paras) != len(md_paras):
        fails.append("段数 html=%d md=%d" % (len(html_paras), len(md_paras)))
    if html_figs != md_figs:
        fails.append("图数 html=%d md=%d" % (html_figs, md_figs))
    if html_disp != md_disp:
        fails.append("展示公式 html=%d md=%d" % (html_disp, md_disp))
    if html_katex != md_inline + md_disp:
        fails.append("公式总数 html=%d md=%d+%d" % (html_katex, md_inline, md_disp))

    norm = lambda s: re.sub(r"\s+", "", s)
    for idx, (h, t) in enumerate(zip(html_paras, md_paras)):
        ht = strip_katex_spans(h)
        if ht is None:
            fails.append("P%d: KaTeX span 剥离失败" % idx)
            continue
        ht = re.sub(r"<[^>]+>", "", ht)
        if norm(ht) != norm(t):
            fails.append("P%d: 文本不一致" % idx)

    print("段 %d/%d  图 %d/%d  公式 %d/%d（行内 %d + 展示 %d）"
          % (len(html_paras), len(md_paras), html_figs, md_figs,
             html_katex, md_inline + md_disp, md_inline, md_disp))
    if fails:
        print("FAIL:")
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("PASS: 段落文本 / 公式 / 图全保真")


if __name__ == "__main__":
    main()
