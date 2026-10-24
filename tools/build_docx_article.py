# -*- coding: utf-8 -*-
"""把一篇正文 md 灌入 editor_sdk 新建的 docx（第 12、13 篇共用）。

与 tools/build_docx_control.py（第 12 篇初版）同一套做法与同一套行为约定（经探针验证）：
- doc_insert_paragraph_with_text：链式推进用 next_index（跳过本段 ¶）；
  若用 position（¶ 位置）会触发自动断段，每次多留一个尾部空段。
- doc_insert_text / doc_insert_math：段内行内追加用 position。
- 富文本段（含行内公式）：首 chunk 建段，之后段内 position 链式追加；
  段内最后一个 position + 1 即下一段的 idx（跳过段末 ¶）。
- 展示公式：runs=[{type:math}] 单独成段 + jc=center（单公式 run 无偏移 bug）。
- 图片段：runs=[{type:image}] + jc=center。

本篇新踩到的两处（都先探针验过再写进来）：
1. 上下标**连写**会被这一层的 LaTeX 解析器转错：`c_1^2` 出来是
   "1 带下标 2、上标 c"（参数被轮转了一位）。可用的写法是把底数整体括起来：
   `{c_1}^2` → 正确的 (c₁)²。所以 fix_latex 里先把 `X_a^b` 改写成 `{X_a}^b`。
   单用的 `c_1`、`\\lambda^2` 本来就对，不用动。
2. 粗体：doc_insert_text 没有 text_format 参数，`**…**` 会被原样写进 Word
   （上一篇就是这么发出去的，正文里留着星号）。这一篇改成：写正文时剥掉星号，
   同时记下每个粗体片段的 DOC 区间，最后一次性 doc_update_text_property
   ranges=[...] bold=True 补上。

OMML 兼容：pmatrix / \\text{中文} / \\mathrm{tr} 已验证可用；
本篇把 \\det 换成 \\mathrm{det}（与 \\operatorname{tr} 同理，避免被当成普通字母串）。

用法：python tools/build_docx_article.py <file_id> <md 路径> <输出 docx>
"""
import json
import os
import re
import struct
import subprocess
import sys
import tempfile

SKILL_DIR = (r"E:\新建文件夹\WorkBuddy\resources\app.asar.unpacked\resources\plugins"
             r"\workbuddy-builtin\skills\workbuddy-local-office-edit")
MD_PATH = sys.argv[2]
MD_DIR = os.path.dirname(MD_PATH)
OUT_DOCX = sys.argv[3]
IMG_W = 560

FILE_ID = sys.argv[1]
# 用法：build_docx_article.py <file_id> <md 绝对路径> <输出 docx 绝对路径>
PYTHON = sys.executable


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not png: " + path)
    return struct.unpack(">II", head[16:24])


# 底数 + 下标 + 上标：整串换成 {底数下标}^上标
RE_SUBSUP = re.compile(
    r"([A-Za-z](?:_\{[^{}]*\}|_[A-Za-z0-9]))(\^\{[^{}]*\}|\^[A-Za-z0-9])")


def fix_latex(s):
    s = s.replace(r"\tfrac12", r"\frac{1}{2}")
    s = s.replace(r"\tfrac", r"\frac")
    s = s.replace(r"\dfrac", r"\frac")
    s = s.replace(r"\operatorname{tr}", r"\mathrm{tr}")
    s = s.replace(r"\operatorname{det}", r"\mathrm{det}")
    s = s.replace(r"\det", r"\mathrm{det}")
    s = s.replace(r"\lVert", r"\|").replace(r"\rVert", r"\|")
    # 撇号：}′ 与 x′ 两种写法都要转成上标
    s = s.replace("}'", r"}^{\prime}")
    s = re.sub(r"([A-Za-z])'", r"\1^{\\prime}", s)
    # 上下标连写在这里会被转错，先把底数整体括起来
    s = RE_SUBSUP.sub(lambda m: "{%s}%s" % (m.group(1), m.group(2)), s)
    return s.strip()


INLINE_MATH = re.compile(r"\$([^$]+)\$")
BOLD = re.compile(r"\*\*(.+?)\*\*")


def make_runs(text):
    """把一段文字切成 runs：行内公式、粗体、普通文字。

    粗体先切（用 ** 标出边界），再在每一片里切行内公式——
    两套标记可以嵌套（**…$x$…**），所以先剥粗体、再认公式。
    """
    runs = []
    pos = 0
    for m in BOLD.finditer(text):
        if m.start() > pos:
            runs.extend(plain_runs(text[pos:m.start()]))
        inner = plain_runs(m.group(1))
        for r in inner:
            if r["type"] == "text":
                r["bold"] = True
        runs.extend(inner)
        pos = m.end()
    if pos < len(text):
        runs.extend(plain_runs(text[pos:]))
    return runs


def plain_runs(text):
    runs, pos = [], 0
    for m in INLINE_MATH.finditer(text):
        if m.start() > pos:
            runs.append({"type": "text", "text": text[pos:m.start()]})
        runs.append({"type": "math", "latex": fix_latex(m.group(1))})
        pos = m.end()
    if pos < len(text):
        runs.append({"type": "text", "text": text[pos:]})
    return runs


def call(tool, args):
    args = dict(args)
    args["file_id"] = FILE_ID
    fd, tmp = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(args, f, ensure_ascii=False)
    try:
        proc = subprocess.run(
            [PYTHON, "edsdk.py", "call", tool, "--json-file", tmp],
            cwd=SKILL_DIR, capture_output=True, text=True, encoding="utf-8",
        )
    finally:
        os.unlink(tmp)
    out = (proc.stdout or "").strip()
    if proc.returncode != 0:
        raise RuntimeError("call failed: %s\nargs=%s"
                           % (out or proc.stderr, json.dumps(args, ensure_ascii=False)[:400]))
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        raise RuntimeError("non-json output: %s" % out[:400])


def insert_para(idx, args):
    resp = call("doc_insert_paragraph_with_text", dict(args, idx=idx))
    return resp["next_index"]


BOLD_SPANS = []


def insert_rich_para(idx, runs, para_prop):
    """含行内公式/粗体的段：首 chunk 建段，段内用 position 链 text/math。

    粗体不在这里设（doc_insert_text 没有格式参数），只记下区间，
    最后一并补——记区间用的就是接口回的 position，不自己数字符。
    """
    if runs[0]["type"] != "text":
        runs = [{"type": "text", "text": ""}] + runs
    first = runs[0]
    resp = call("doc_insert_paragraph_with_text",
                {"idx": idx, "text": first["text"], "paragraph_property": para_prop})
    pos = resp["position"]
    if first.get("bold") and first["text"]:
        BOLD_SPANS.append((pos - len(first["text"]), pos))
    for r in runs[1:]:
        if r["type"] == "text":
            resp = call("doc_insert_text", {"idx": pos, "text": r["text"]})
            if r.get("bold") and r["text"]:
                BOLD_SPANS.append((pos, resp["position"]))
        else:
            resp = call("doc_insert_math", {"idx": pos, "latex": r["latex"]})
        pos = resp["position"]
    return pos + 1


BODY_PROP = {"line_spacing": 1.5, "line_spacing_rule": 1, "spacing_after": 8}


def main():
    with open(MD_PATH, encoding="utf-8") as f:
        lines = f.read().split("\n")

    title = lines[0].lstrip("# ").strip()
    idx = insert_para(0, {
        "text": title, "level": 1,
        "paragraph_property": {"jc": "center", "spacing_after": 18},
        "text_format": {"bold": True, "font_size": 16, "color": "1F2937"},
    })
    print("[title] %s -> idx=%d" % (title, idx))

    stats = {"para": 0, "image": 0, "caption": 0, "math_display": 0, "math_inline": 0, "bold": 0}

    for ln, raw in enumerate(lines[1:], start=2):
        line = raw.strip()
        if not line:
            continue

        m_img = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", line)
        if m_img:
            caption, rel = m_img.group(1), m_img.group(2)
            path = os.path.join(MD_DIR, rel)
            w0, h0 = png_size(path)
            w, h = IMG_W, round(h0 * IMG_W / w0)
            idx = insert_para(idx, {
                "runs": [{"type": "image", "image_path": path, "w": w, "h": h}],
                "paragraph_property": {"jc": "center", "spacing_before": 10, "spacing_after": 2},
            })
            stats["image"] += 1
            idx = insert_para(idx, {
                "text": caption,
                "paragraph_property": {"jc": "center", "spacing_after": 14},
                "text_format": {"font_size": 9, "color": "6B7280"},
            })
            stats["caption"] += 1
            print("[img  ] L%-3d %s (%dx%d -> %dx%d)" % (ln, os.path.basename(path), w0, h0, w, h))
            continue

        if line.startswith("$$") and line.endswith("$$"):
            latex = fix_latex(line[2:-2])
            idx = insert_para(idx, {
                "runs": [{"type": "math", "latex": latex}],
                "paragraph_property": {"jc": "center", "spacing_before": 8, "spacing_after": 8},
            })
            stats["math_display"] += 1
            print("[math ] L%-3d %s" % (ln, latex[:60]))
            continue

        runs = make_runs(line)
        n_math = sum(1 for r in runs if r["type"] == "math")
        n_bold = sum(1 for r in runs if r.get("bold"))
        stats["math_inline"] += n_math
        stats["bold"] += n_bold
        stats["para"] += 1
        if n_math or n_bold:
            idx = insert_rich_para(idx, runs, BODY_PROP)
        else:
            idx = insert_para(idx, {"runs": runs, "paragraph_property": BODY_PROP})
        print("[text ] L%-3d runs=%d math=%d bold=%d %s"
              % (ln, len(runs), n_math, n_bold, line[:24]))

    if BOLD_SPANS:
        resp = call("doc_update_text_property",
                    {"ranges": [{"begin": a, "end": b} for a, b in BOLD_SPANS], "bold": True})
        print("[bold ] %d 处 -> %s" % (len(BOLD_SPANS), json.dumps(resp, ensure_ascii=False)[:120]))

    print("\nSTATS", json.dumps(stats, ensure_ascii=False), "final idx =", idx)
    proc = subprocess.run(
        [PYTHON, "edsdk.py", "call", "save_file", "file_id=" + FILE_ID,
         "file_path=" + OUT_DOCX],
        cwd=SKILL_DIR, capture_output=True, text=True, encoding="utf-8")
    print("SAVE", (proc.stdout or proc.stderr).strip())


if __name__ == "__main__":
    main()
