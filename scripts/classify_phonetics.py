#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 mismatch 分成:
A类=确定真错标(含拉丁残渣特征: ph/kh/词尾伪元音/ia-io串等) -> 自动用CMU修正
B类=疑似错标但无残渣 -> 人工审
C类=英美差异(lev<=2) -> 保留词库
"""
import re, json
from pathlib import Path

ROOT = Path("/home/z/my-project")
rep = json.loads((ROOT / "scripts/data/phonetic_report.json").read_text(encoding="utf-8"))
mm = rep["mismatch"]
print(f"mismatch 总数: {len(mm)}")

# 拉丁残渣特征 (词库音标 side)
def has_latin_residue(ph: str) -> str | None:
    body = ph.strip("/")
    # 1) 送气残留: ph kh th gh (英语IPA无这些音位组合)
    for pat in ("ph", "kh", "gh"):
        if pat in body:
            return f"送气残留:{pat}"
    # 2) 拼写串: ia/io/iu/ua/ue/ao/ea/oe/eo/ii/oo/aa/ee (非IPA组合或非常规)
    for pat in ("ia", "io", "iu", "ua", "ue", "ao", "ea", "oe", "eo", "ii", "uu", "aa", "ee", "oo"):
        if pat in body:
            return f"拼写串:{pat}"
    # 3) 词尾伪元音: 以 ɛ a e ɒ ʌ o 结尾(非 eɪ aɪ ɔɪ oʊ əʊ) 且原词以不发音e结尾
    if body[-1] in "ɛaeɒʌo" and not body.endswith("eɪ"):
        return f"词尾伪元音:{body[-1]}"
    return None

def syllables(p: str) -> int:
    # 数元音 (把双元音当一个)
    p2 = p.replace("eɪ", "E").replace("aɪ", "A").replace("ɔɪ", "Y").replace("oʊ", "O").replace("əʊ", "O").replace("aʊ", "W")
    return len(re.findall(r"[ɑæʌɔɛɪʊoiuaEAYOW]", p2))

A, B, C = [], [], []
for m in mm:
    lev, ours, ref = m["lev"], m["ours"].strip("/"), m["cmu"].strip("/")
    res = has_latin_residue(ours)
    if res:
        A.append({**m, "reason": res})
    elif lev >= 3:
        B.append({**m, "reason": f"lev{lev}", "syl_ours": syllables(ours), "syl_ref": syllables(ref)})
    else:
        C.append(m)

print(f"A类 确定真错标(含拉丁残渣): {len(A)}")
print(f"B类 疑似(lev>=3无残渣, 需人工): {len(B)}")
print(f"C类 口音差异(lev<=2, 保留): {len(C)}")
print(f"CMU缺词: {len(rep['missing_in_cmu'])} -> {[x['en'] for x in rep['missing_in_cmu']]}")

out = {"A": A, "B": B, "C_count": len(C), "missing": rep["missing_in_cmu"]}
(ROOT / "scripts/data/phonetic_classified.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

print("\n===== B类 (lev>=3 无残渣) 全量 =====")
for m in B:
    print(f'{m["en"]:<15} 词库{m["ours"]:<18} CMU{m["cmu"]:<18} lev={m["lev"]} 音节{m["syl_ours"]}/{m["syl_ref"]}')

# B类中音节数不同的格外可疑
sb = [m for m in B if m["syl_ours"] != m["syl_ref"]]
print(f"\nB类中音节数不同(高度可疑): {len(sb)} 个")

print("\n===== C类 抽样 (lev<=2, 应为口音差异) =====")
for m in C[:25]:
    print(f'{m["en"]:<15} 词库{m["ours"]:<14} CMU{m["cmu"]:<14} lev={m["lev"]}')
