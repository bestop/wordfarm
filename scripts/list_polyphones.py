#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""列出 A+B 类中 CMU 有多个发音的词 (潜在多音词, 需按词义定音), 以及缺词"""
import re, json
from pathlib import Path

ROOT = Path("/home/z/my-project")
cls = json.loads((ROOT / "scripts/data/phonetic_classified.json").read_text(encoding="utf-8"))
cmu = {}
for line in (ROOT / "scripts/data/cmudict.dict").read_text(encoding="utf-8", errors="ignore").splitlines():
    if not line or line.startswith(";;;"):
        continue
    parts = line.split()
    w = re.sub(r"\(\d+\)$", "", parts[0]).lower()
    cmu.setdefault(w, []).append(" ".join(parts[1:]))

ab = cls["A"] + cls["B"]
multi = []
for m in ab:
    key = m["en"].lower()
    if len(cmu.get(key, [])) > 1:
        multi.append(m)

print(f"A+B 共 {len(ab)} 词, 其中 CMU 多发音: {len(multi)} 个\n")
for m in multi:
    print(f'{m["en"]:<15} zh={m["zh"]:<12} 词库{m["ours"]:<18} CMU变体:')
    for v in cmu[m["en"].lower()][:4]:
        print(f'    {v}')
print("\n缺词:", [x["en"] for x in cls["missing"]])

# 同时导出 A+B 全列表供人工扫视
lines = []
for m in sorted(ab, key=lambda x: x["en"].lower()):
    lines.append(f'{m["en"]}\t{m["zh"]}\t/{m["ours"].strip("/")}/\tCMU/{m["cmu"].strip("/")}/')
(ROOT / "scripts/data/ab_list.txt").write_text("\n".join(lines), encoding="utf-8")
print(f"A+B 全列表已导出: scripts/data/ab_list.txt ({len(lines)} 行)")
