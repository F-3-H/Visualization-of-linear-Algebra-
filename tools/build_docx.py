# -*- coding: utf-8 -*-
"""把《线性代数基础·一捆数与一张表.md》灌入 editor_sdk 新建的 docx（干净重建版）。

关键行为约定（经探针验证）：
- doc_insert_paragraph_with_text：链式推进用 next_index（跳过本段 ¶）；
  若用 position（¶ 位置）会触发自动断段，每次多留一个尾部空段。
- doc_insert_text / doc_insert_math：段内行内追加用 position。
- 富文本段（含行内公式）：首 chunk 建段（拿 next_index 无关，改用段内 position 链），
  段内最后一个 position + 1 即下一段的 idx（跳过段末 ¶）。
- 展示公式：runs=[{type:math}] 单独成段 + jc=center（单公式 run 无偏移 bug）。
- 图片段：runs=[{type:image}] + jc=center。
"""
import json
import os
import re
import struct
import subprocess
import sys
import tempfile

SKILL_DIR = r"E:\新建文件夹\WorkBuddy\resources\app.asar.unpacked\resources\plugins\workbuddy-builtin\skills\tencent-local-office-edit"
MD_PATH = r"E:\线性代数\线性代数基础·一捆数与一张表.md"
MD_DIR = os.path.dirname(MD_PATH)
OUT_DOCX = r"E:\线性代数\线性代数基础·一捆数与一张表.docx"
IMG_W = 560  # 目标图片宽度（px @96dpi）

FILE_ID = sys.argv[1]


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not png: " + path)
    return struct.unpack(">II", head[16:24])


def fix_latex(s):
    s = s.replace(r"\tfrac12", r"\frac{1}{2}")
    s = s.replace(r"\tfrac", r"\frac")
    s = s.replace(r"\dfrac", r"\frac")
    s = re.sub(r"([A-Za-z])'", r"\1^{\\prime}", s)
    return s.strip()


INLINE_MATH = re.compile(r"\$([^$]+)\$")


def make_runs(text):
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
            ["python", "edsdk.py", "call", tool, "--json-file", tmp],
            cwd=SKILL_DIR, capture_output=True, text=True, encoding="utf-8",
        )
    finally:
        os.unlink(tmp)
    out = (proc.stdout or "").strip()
    if proc.returncode != 0:
        raise RuntimeError("call failed: %s\nargs=%s" % (out or proc.stderr, json.dumps(args, ensure_ascii=False)[:400]))
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        raise RuntimeError("non-json output: %s" % out[:400])


def insert_para(idx, args):
    """整段一次性插入（纯文本 / 图片 / 单公式展示段）。返回下一段 idx（next_index）。"""
    resp = call("doc_insert_paragraph_with_text", dict(args, idx=idx))
    return resp["next_index"]


def insert_rich_para(idx, runs, para_prop):
    """含行内公式的段：首 chunk 建段，段内用 position 链 text/math。返回下一段 idx。"""
    if runs[0]["type"] != "text":
        raise RuntimeError("rich paragraph must start with text run")
    resp = call("doc_insert_paragraph_with_text",
                {"idx": idx, "text": runs[0]["text"], "paragraph_property": para_prop})
    pos = resp["position"]  # 段内追加点（¶ 之前）
    for r in runs[1:]:
        if r["type"] == "text":
            resp = call("doc_insert_text", {"idx": pos, "text": r["text"]})
        else:
            resp = call("doc_insert_math", {"idx": pos, "latex": r["latex"]})
        pos = resp["position"]
    return pos + 1  # 跳过段末 ¶


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

    stats = {"para": 0, "image": 0, "caption": 0, "math_display": 0, "math_inline": 0}

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
        stats["math_inline"] += n_math
        stats["para"] += 1
        if n_math:
            idx = insert_rich_para(idx, runs, BODY_PROP)
        else:
            idx = insert_para(idx, {"runs": runs, "paragraph_property": BODY_PROP})
        print("[text ] L%-3d runs=%d math=%d %s" % (ln, len(runs), n_math, line[:24]))

    print("\nSTATS", json.dumps(stats, ensure_ascii=False), "final idx =", idx)
    proc = subprocess.run(
        ["python", "edsdk.py", "call", "save_file", "file_id=" + FILE_ID,
         "file_path=" + OUT_DOCX],
        cwd=SKILL_DIR, capture_output=True, text=True, encoding="utf-8")
    print("SAVE", (proc.stdout or proc.stderr).strip())


if __name__ == "__main__":
    main()
