# -*- coding: utf-8 -*-
r"""校验 《线性代数基础·让会倒的东西站住.docx》 与 md 正文的保真性。

办法与上一篇同一套（tools/build_docx.py 那一轮立下的）：解包 docx、读 word/document.xml，
把段落切成序列，逐块对账。doc_to_image 云转换历史上不稳定，所以不做视觉渲染，
以结构 + 文本 + 公式序号 + 图片数四项为准。

对账规则：
  - 文本段：md 那一行把行内公式 $...$ 抹掉之后，应当**逐字等于**该段所有 <w:t> 的拼接
    （公式是 OMML，落在 <m:t> 里，不进 <w:t>——所以这条等式同时验证了"文字没丢"
    和"公式确实独立成了 oMath 而没有被当成文字灌进去"）；
  - 行内公式数：每段 <m:oMath> 个数应当等于该行 $...$ 的个数；
  - 展示公式：单独成段、段内 oMath 恰好 1 个；
  - 配图：每张图一个 <w:drawing> 段 + 一个图题段。

用法：python tools/verify_docx_control.py
"""
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, "线性代数基础·让会倒的东西站住.md")
DOCX = os.path.join(ROOT, "线性代数基础·让会倒的东西站住.docx")

P = re.compile(r"<w:p\b.*?</w:p>|<w:p\b[^>]*/>", re.S)
WT = re.compile(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", re.S)
OMATH = re.compile(r"<m:oMath\b", re.S)
DRAWING = re.compile(r"<w:drawing\b", re.S)
IMG_LINE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)$")
INLINE = re.compile(r"\$([^$]+)\$")


def unescape(s):
    return (s.replace("&lt;", "<").replace("&gt;", ">")
             .replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&"))


def para_text(xml):
    """段内所有 <w:t> 拼起来（不含 OMML 的 <m:t>）。"""
    return unescape("".join(WT.findall(xml)))


def expected_blocks():
    blocks = []
    with open(MD, encoding="utf-8") as f:
        lines = f.read().split("\n")
    blocks.append(("h1", lines[0].lstrip("# ").strip(), 0))
    for raw in lines[1:]:
        line = raw.strip()
        if not line:
            continue
        m = IMG_LINE.match(line)
        if m:
            blocks.append(("img", os.path.basename(m.group(2)), 0))
            blocks.append(("cap", m.group(1), 0))
            continue
        if line.startswith("$$") and line.endswith("$$"):
            blocks.append(("display", line[2:-2].strip(), 1))
            continue
        n = len(INLINE.findall(line))
        blocks.append(("text", INLINE.sub("", line), n))
    return blocks


def main():
    if not os.path.exists(DOCX):
        sys.exit("找不到 docx：%s" % DOCX)
    with zipfile.ZipFile(DOCX) as z:
        xml = z.read("word/document.xml").decode("utf-8")
        media = [n for n in z.namelist() if n.startswith("word/media/")]

    paras = P.findall(xml)
    exp = expected_blocks()

    # docx 末尾常带一个空段（编辑器模板），对账时去掉尾部空段
    while paras and para_text(paras[-1]).strip() == "" and not OMATH.search(paras[-1]) \
            and not DRAWING.search(paras[-1]):
        paras.pop()

    fails = []
    if len(paras) != len(exp):
        fails.append("段数 docx=%d md=%d" % (len(paras), len(exp)))

    n_img = 0
    n_math_inline = n_math_disp = 0
    for i, ((kind, payload, nm), pxml) in enumerate(zip(exp, paras)):
        t = para_text(pxml)
        has_img = bool(DRAWING.search(pxml))
        n_om = len(OMATH.findall(pxml))

        if kind == "img":
            n_img += 1
            if not has_img:
                fails.append("块%d 应是配图 %s，段里没有 <w:drawing>" % (i, payload))
            continue
        if has_img:
            fails.append("块%d 不该有图，却带了 <w:drawing>" % i)
        if kind in ("cap", "text", "h1"):
            if t != payload:
                fails.append("块%d 文本不一致\n     md  : %s\n     docx: %s"
                             % (i, payload[:70], t[:70]))
            if n_om != nm:
                fails.append("块%d 行内公式数 docx=%d md=%d" % (i, n_om, nm))
            n_math_inline += n_om
        elif kind == "display":
            if n_om != 1:
                fails.append("块%d 展示公式应是 1 个 oMath，实得 %d" % (i, n_om))
            n_math_disp += 1

    print("段 %d/%d　配图 %d　行内公式 %d　展示公式 %d　媒体文件 %d"
          % (len(paras), len(exp), n_img, n_math_inline, n_math_disp, len(media)))
    if fails:
        print("FAIL:")
        for f in fails[:20]:
            print("  -", f)
        if len(fails) > 20:
            print("  ... 共 %d 条" % len(fails))
        sys.exit(1)
    print("PASS: 段落序列 / 文本 / 行内公式 / 展示公式 / 配图 全保真")


if __name__ == "__main__":
    main()
