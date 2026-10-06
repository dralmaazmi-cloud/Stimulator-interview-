#!/usr/bin/env python3
"""Import the approved 22-question PDF draft into a separate SEAL answer file."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path


REPLACEMENTS = (
    ("مع ا", "معًا"), ("أوال", "أولًا"), ("كالمه", "كلامه"),
    ("ألنه", "لأنه"), ("ألن", "لأن"), ("الخالف", "الخلاف"),
    ("أالحظ", "ألاحظ"), ("خالل", "خلال"), ("المشكالت", "المشكلات"),
    ("حال نهائيا", "حلًا نهائيًا"), ("بديال مؤقتا", "بديلًا مؤقتًا"),
    ("معقوال", "معقولًا"), ("ثالث ا", "ثالثًا"), ("مقد ر", "مقدّر"),
    ("هو لته", "هوّلته"), ("سيالحظه", "سيلاحظه"),
    ("ألعرف", "لأعرف"), ("أوف ر", "أوفّر"), ("أرك ز", "أركّز"),
    ("م ن", "من"), ("مرك زا", "مركّزًا"), ("ألسبوعين", "لأسبوعين"),
    ("أال يتوقف", "ألا يتوقف"), ("ألهيئه", "لأهيئه"), ("لالنتقال", "للانتقال"),
    ("جدوال زمنيا", "جدولًا زمنيًا"), ("ألتأكد", "لأتأكد"),
    ("إال", "إلا"), ("تتكو ن", "تتكون"), ("استقاللية", "استقلالية"),
    ("مرجعا التخاذ", "مرجعًا لاتخاذ"), ("أوف ر", "أوفّر"),
    ("ألسئلة", "للأسئلة"), ("إخالل", "إخلال"), ("قابال", "قابلًا"),
    ("كامال", "كاملًا"), (" فعال", " فعلًا"),
    ("معالفرق", "مع الفرق"), (" الحقا", " لاحقًا"), (" الح.", " لاحقًا."),
    ("أقس مه", "أقسمه"), ("أقس م", "أقسم"), ("سأقس م", "سأقسم"),
    ("يوض ح", "يوضح"), ("توض ح", "توضح"), ("سينف ذه", "سينفذه"),
    ("ينف ذها", "ينفذها"), ("ينف ذ", "ينفذ"), ("تنف ذ", "تنفذ"),
    ("ويعط ل", "ويعطل"), ("تعط ل", "تعطل"), ("سأفع ل", "سأفعل"),
    ("وأفع ل", "وأفعل"), ("فع الة", "فعالة"), ("أذك رهم", "أذكرهم"),
    ("سأعد ل", "سأعدل"), ("وأعد ل", "وأعدل"), ("أجه ز", "أجهز"),
    ("يتعي ن", "يتعين"), ("تطب ق", "تطبق"), ("يصع د", "يصعد"),
    ("يل خص", "يلخص"), ("نن فذه", "ننفذه"), ("يوح د", "يوحد"),
    ("تتك و ن", "تتكون"), ("تحس نه", "تحسنه"), ("يهي ئه", "يهيئه"),
    ("األ", "الأ"), ("اإل", "الإ"), ("اآل", "الآ"),
    ("اال", "الا"), ("الال", "اللا"), ("عىل", "على"),
    ("إىل", "إلى"), ("أوىل", "أولى"), ("األوىل", "الأولى"),
)


def normalize(text: str) -> str:
    text = "".join(char for char in text if unicodedata.category(char) != "Cf")
    text = re.sub(r"[\u064b-\u065f\u0670]", "", text)
    for source, target in REPLACEMENTS:
        text = text.replace(source, target)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([،؛؟.!:])", r"\1", text)
    text = re.sub(r"([،؛؟.!:])(?=[\u0621-\u064a])", r"\1 ", text)
    # The PDF extractor separates the final alif of tanween words.
    text = re.sub(r"([\u0621-\u064a])\s+ا(?=($|[ ،؛؟.!]))", r"\1ا", text)
    text = re.sub(r"(?<![\u0621-\u064a])ال(?![\u0621-\u064a])", "لا", text)
    text = re.sub(r"(?<![\u0621-\u064a])وال(?![\u0621-\u064a])", "ولا", text)
    text = re.sub(r"(?<![\u0621-\u064a])فال(?![\u0621-\u064a])", "فلا", text)
    for source, target in REPLACEMENTS:
        text = text.replace(source, target)
    return text


def parse(extracted_text: str) -> dict:
    answers = []
    for page in extracted_text.split("\f")[1:23]:
        lines = [normalize(line) for line in page.splitlines() if normalize(line)]
        identifier = re.search(r"[CM]\d-S\d", " ".join(lines[:6]))
        if not identifier:
            raise ValueError("تعذر تحديد معرّف سؤال في إحدى الصفحات.")
        question_id = identifier.group()
        start = next(index for index, line in enumerate(lines) if "النموذجية" in line and "الموس" in line)
        labels = ["فهم الوضع", "التقييم", "الإجراء", "الأثر القيادي"]
        headings = {
            label: next(index for index, line in enumerate(lines[start + 1 :], start + 1) if line == label)
            for label in labels
        }
        end = next(
            (index for index, line in enumerate(lines[headings[labels[-1]] + 1 :], headings[labels[-1]] + 1)
             if re.fullmatch(r"\d+ / 24", line)),
            len(lines),
        )
        answers.append({
            "id": question_id,
            "answer": {
                "situation": normalize(" ".join(lines[headings[labels[0]] + 1 : headings[labels[1]]])),
                "evaluation": normalize(" ".join(lines[headings[labels[1]] + 1 : headings[labels[2]]])),
                "action": normalize(" ".join(lines[headings[labels[2]] + 1 : headings[labels[3]]])),
                "leadership_impact": normalize(" ".join(lines[headings[labels[3]] + 1 : end])),
            },
        })
    if len(answers) != 22 or len({item["id"] for item in answers}) != 22:
        raise ValueError("يجب أن يحتوي الملف على 22 سؤالًا فريدًا.")
    return {
        "schema_version": "1.0",
        "title": "إجابات نموذجية إرشادية موسعة لأسئلة السيناريو",
        "reviewed_at": "2026-10-05",
        "answer_framework": "SEAL",
        "source_note": "مبنية على إجابات الدليل ونقاطه المتوقعة وسلوكيات الكفاءات، ومهيأة للتدريب لا للحفظ الحرفي.",
        "count": len(answers),
        "answers": answers,
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: import-expanded-answers.py EXTRACTED_TEXT OUTPUT_JSON")
    source, output = map(Path, sys.argv[1:])
    payload = parse(source.read_text(encoding="utf-8"))
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
