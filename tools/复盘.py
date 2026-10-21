# -*- coding: utf-8 -*-
r"""复盘：《线性代数基础·一捆数与一张表》的可量部分，对文库第六节基线。"""
import io
import re
import os

MD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                  "线性代数基础·一捆数与一张表.md")

s = io.open(MD, encoding="utf-8").read()
body = s
zh = len(re.findall(r"[\u4e00-\u9fff]", body))
figs = len(re.findall(r"!\[", body))
formulas = len(re.findall(r"\$\$", body)) // 2 + len(re.findall(r"(?<!\$)\$(?!\$)[^$\n]+\$", body))

print("中文字数 %d，配图 %d，公式（约）%d" % (zh, figs, formulas))
print("每千字配图 %.2f（作者基线 2.88）" % (1000.0 * figs / zh))
print("每千字公式 %.2f（作者基线 8.63）" % (1000.0 * formulas / zh))

PHILO = ["系统", "变化", "内因", "外因", "作用", "变与不变", "整体与部分", "量变", "质变",
         "反作用", "规律", "矛盾"]
TECH = ["矩阵", "向量", "特征", "行列式", "摁", "表"]

print()
print("%-14s %8s %10s" % ("词", "次数", "每千字"))
tot_p = tot_t = 0
for t in PHILO:
    c = body.count(t)
    tot_p += c
    print("%-14s %8d %10.2f" % (t, c, 1000.0 * c / zh))
print("%-14s %8d %10.2f  ← 哲学词合计" % ("（合计）", tot_p, 1000.0 * tot_p / zh))
print()
for t in TECH:
    c = body.count(t)
    tot_t += c
    print("%-14s %8d %10.2f" % (t, c, 1000.0 * c / zh))
print("%-14s %8d %10.2f  ← 技术词合计" % ("（合计）", tot_t, 1000.0 * tot_t / zh))
print()
print("判据（作者：他用系统论的话讲技术）：哲学词合计 %.2f‰ %s 技术词合计 %.2f‰"
      % (1000.0 * tot_p / zh, ">" if tot_p > tot_t else "<", 1000.0 * tot_t / zh))

# 删词测试的机械化一面：把新术语换成日常话后，段落是否还立得住——这里只统计
# “术语第一次出现前，日常话是否先说过”（人工已按台阶表执行，此处给出落点检查）
print()
for t in ["向量", "矩阵", "特征方向", "行列式"]:
    i = body.find(t)
    print("术语「%s」首次出现在第 %d 字" % (t, i))
