#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
词库音标系统性校验:
1. 从 src/game/words.ts 提取 (en, phonetic)
2. 用 CMU 词典 (ARPAbet) 转 IPA 作为参照
3. 宽松归一化对比 (过滤英式/美式口音差异), 抓真错标
"""
import re
import json
from pathlib import Path

ROOT = Path("/home/z/my-project")
WORDS_TS = ROOT / "src/game/words.ts"
CMU_PATH = ROOT / "scripts/data/cmudict.dict"
OUT = ROOT / "scripts/data/phonetic_report.json"

# ---------- 1. 提取词库 ----------
src = WORDS_TS.read_text(encoding="utf-8")
entries = re.findall(r'\{ en: "([^"]+)", zh: "([^"]*)", phonetic: "/([^/]*)/", difficulty: (\d) \}', src)
print(f"词库条目数: {len(entries)}")

# ---------- 2. CMU 词典 ----------
cmu = {}  # word(lower, 无撇号变体) -> [arpabet str]
for line in CMU_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
    if not line or line.startswith(";;;"):
        continue
    parts = line.split()
    w = parts[0]
    # 括号变体 (2) 跳过
    w_clean = re.sub(r"\(\d+\)$", "", w).lower()
    phones = " ".join(parts[1:])
    cmu.setdefault(w_clean, []).append(phones)

# ---------- 3. ARPAbet -> IPA ----------
ARP2IPA = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ",
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "EH": "ɛ", "ER": "ɜr",
    "EY": "eɪ", "F": "f", "G": "ɡ", "HH": "h", "IH": "ɪ", "IY": "i",
    "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ",
    "OW": "oʊ", "OY": "ɔɪ", "P": "p", "R": "r", "S": "s", "SH": "ʃ",
    "T": "t", "TH": "θ", "UH": "ʊ", "UW": "u", "V": "v", "W": "w",
    "Y": "j", "Z": "z", "ZH": "ʒ",
}

def arpabet_to_ipa(phones: str) -> str:
    out = []
    for tok in phones.split():
        m = re.match(r"^([A-Z]+)(\d)?$", tok)
        if not m:
            continue
        base, stress = m.group(1), m.group(2)
        if base not in ARP2IPA:
            return ""
        ipa = ARP2IPA[base]
        if base in ("AA", "EY", "IY", "OW", "UW", "AO", "AY", "AW", "OY") and stress in ("1", "2"):
            # 长元音在重读音节标 ː (对齐词库风格)
            if base in ("AA", "EY", "IY", "OW", "UW", "AO"):
                ipa += "ː"
        if base == "ER" and stress == "0":
            ipa = "ər"
        out.append(ipa)
    return "".join(out)

# ---------- 4. 归一化 (宽松等价类, 抹平英美差异) ----------
def normalize(p: str) -> str:
    p = p.strip()
    p = p.replace("əʊ", "oʊ").replace("aʊ", "aw_").replace("aɪ", "ay_")
    # 不可再分的双元音先保护
    for a, b in [("oʊ", "O"), ("ɔɪ", "OY"), ("tʃ", "C"), ("dʒ", "J"), ("ŋ", "NG"), ("ʃ", "SH"), ("ʒ", "ZH"), ("θ", "TH"), ("ð", "DH")]:
        p = p.replace(a, b)
    p = p.translate(str.maketrans({"ˈ": "", "ˌ": "", "ː": ""}))
    # r 化差异: 直接去掉 r (ɜr~ɜ, ɔr~ɔ, ər~ə, ɑr~ɑ)
    p = p.replace("r", "")
    # 口音等价
    p = p.replace("ɒ", "ɑ").replace("ɔ", "ɑ")   # ɔ/ɒ/ɑ 合并 (caught-cot merger 美式常见)
    p = p.replace("e", "ɛ")
    # 长短元音合并
    for a, b in [("iː", "i"), ("uː", "u"), ("ɔː", "ɔ"), ("ɑː", "ɑ"), ("ɜː", "ɜ"), ("æ", "ɑ")]:
        p = p.replace(a, b)
    # 中央元音合并
    p = p.replace("ə", "ʌ").replace("ɜ", "ʌ")
    # 还原保护符
    for b, a in [("O", "oʊ"), ("OY", "ɔɪ"), ("C", "tʃ"), ("J", "dʒ"), ("NG", "ŋ"), ("SH", "ʃ"), ("ZH", "ʒ"), ("TH", "θ"), ("DH", "ð")]:
        p = p.replace(b, a)
    return p

def lev(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        cur = [i + 1]
        for j, cb in enumerate(b):
            cur.append(min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (ca != cb)))
        prev = cur
    return prev[-1]

# ---------- 5. 对比 ----------
results = {"missing_in_cmu": [], "mismatch": [], "ok": 0}
for en, zh, ph, diff in entries:
    en_l = en.lower()
    key = en_l
    if key not in cmu:
        # 尝试去复数/变形再确认
        results["missing_in_cmu"].append({"en": en, "zh": zh, "phonetic": f"/{ph}/"})
        continue
    # 取第一个(最常见)发音
    ref_ipa = arpabet_to_ipa(cmu[key][0])
    if not ref_ipa:
        results["missing_in_cmu"].append({"en": en, "zh": zh, "phonetic": f"/{ph}/", "note": "arpabet转换失败"})
        continue
    ours, ref = normalize(ph), normalize(ref_ipa)
    if ours == ref:
        results["ok"] += 1
        continue
    d = lev(ours, ref)
    results["mismatch"].append({
        "en": en, "zh": zh, "diff": int(diff),
        "ours": f"/{ph}/", "cmu": f"/{ref_ipa}/",
        "norm_ours": ours, "norm_ref": ref, "lev": d,
    })

results["mismatch"].sort(key=lambda x: (-x["lev"], x["en"]))
print(f"CMU 无此词: {len(results['missing_in_cmu'])}")
print(f"归一化后不一致: {len(results['mismatch'])}  (一致: {results['ok']})")
big = [m for m in results["mismatch"] if m["lev"] >= 3]
print(f"其中编辑距离>=3 (疑似真错标): {len(big)}")
OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"报告已写: {OUT}")

# 打印最可疑的 40 条
print("\n===== 疑似真错标 TOP40 (编辑距离大) =====")
for m in results["mismatch"][:40]:
    print(f'{m["en"]:<14} 词库{m["ours"]:<16} CMU{m["cmu"]:<16} lev={m["lev"]}')
