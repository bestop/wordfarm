#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全量重建词库音标:
- 基准: CMU 词典(美式标准) 第一发音 -> 词库风格 IPA (无重音符, 长元音带 ː)
- 多音词白名单: 按词库中文释义定音
- *day 词族特判: di -> deɪ
- CMU 缺词手工补 (cafe/paperclip)
- 逐行重写 words.ts 的 phonetic 字段, 其余内容不动
"""
import re
from pathlib import Path

ROOT = Path("/home/z/my-project")
WORDS_TS = ROOT / "src/game/words.ts"
CMU_PATH = ROOT / "scripts/data/cmudict.dict"

# ---------- CMU ----------
cmu = {}
for line in CMU_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
    if not line or line.startswith(";;;"):
        continue
    parts = line.split()
    w = re.sub(r"\(\d+\)$", "", parts[0]).lower()
    cmu.setdefault(w, []).append(" ".join(parts[1:]))

# ---------- 白名单: 按 zh 定音 (最终风格化 IPA 直接给出) ----------
WHITELIST = {
    "use": "juːz",           # 使用(动词)
    "live": "lɪv",           # 居住
    "wind": "wɪnd",          # 风
    "estimate": "ɛstɪmeɪt",  # 估计(动词)
    "resource": "riːsɔːrs",  # 资源 (CMU 弱读变体过度弱化, 取词典主流)
    "café": "kæfeɪ",         # CMU 缺词
    "paperclip": "peɪpərklɪp",  # CMU 缺词
}

# ---------- ARPAbet -> 词库风格 IPA ----------
VOW = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ",
    "EH": "ɛ", "ER": "ɜr", "EY": "eɪ", "IH": "ɪ", "IY": "i", "OW": "oʊ",
    "OY": "ɔɪ", "UH": "ʊ", "UW": "u",
}
CON = {
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h",
    "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p",
    "R": "r", "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w",
    "Y": "j", "Z": "z", "ZH": "ʒ",
}

def arp2ipa_styled(phones: str) -> str:
    out = []
    for tok in phones.split():
        m = re.match(r"^([A-Z]+)(\d)?$", tok)
        if not m:
            return ""
        base, stress = m.group(1), m.group(2) or ""
        if base in VOW:
            ipa = VOW[base]
            # 弱读形
            if stress == "0":
                if base == "AH":
                    ipa = "ə"
                elif base == "ER":
                    ipa = "ər"
                elif base == "IY":
                    ipa = "i"
                elif base == "UW":
                    ipa = "u"
                elif base in ("AA", "AE", "AO"):
                    ipa = "ə"
                else:
                    # IH->ɪ, EH->ɛ, AY->aɪ, EY->eɪ, OW->oʊ 等保持本音 (词典标准)
                    pass
            else:
                # 重读长元音带 ː (对齐词库风格)
                if base in ("AA", "AO", "IY", "UW"):
                    ipa += "ː"
                elif base == "ER":
                    ipa = "ɜːr"
            out.append(ipa)
        elif base in CON:
            out.append(CON[base])
        else:
            return ""
    return "".join(out)

# ---------- 逐行重写 ----------
lines = WORDS_TS.read_text(encoding="utf-8").splitlines(keepends=True)
pat = re.compile(r'^(\s*\{ en: "([^"]+)", zh: "[^"]*", phonetic: "/)([^/]*)(/", difficulty: \d \},?\s*)$')

changed, kept_manual, missing = 0, 0, []
for i, line in enumerate(lines):
    m = pat.match(line.rstrip("\n"))
    if not m:
        continue
    head, en, old, tail = m.group(1), m.group(2), m.group(3), m.group(4)
    key = en.lower()
    if key in WHITELIST:
        new = WHITELIST[key]
        kept_manual += 1
    else:
        phones_list = cmu.get(key)
        if not phones_list:
            missing.append(en)
            continue
        new = arp2ipa_styled(phones_list[0])
        if not new:
            missing.append(en + "(转换失败)")
            continue
        # *day 词族特判: CMU 尾 D IY0 -> deɪ (词典主流标法)
        if key.endswith("day") and new.endswith("di"):
            new = new[:-2] + "deɪ"
    if new != old:
        lines[i] = f"{head}{new}{tail}\n"
        changed += 1

WORDS_TS.write_text("".join(lines), encoding="utf-8")
print(f"重写音标: {changed} 条; 白名单: {kept_manual} 条; 失败: {len(missing)} {missing}")

# ---------- 自检: 三已知错标 ----------
import subprocess
src = WORDS_TS.read_text(encoding="utf-8")
for w in ("poem", "sky", "cherry", "fly", "island", "city", "busy", "benefit", "use", "live", "wind", "Friday"):
    mm = re.search(rf'en: "{w}", zh: "[^"]*", phonetic: "(/[^/]*/)"', src)
    print(f"  {w:<10} -> {mm.group(1) if mm else 'NOT FOUND'}")
