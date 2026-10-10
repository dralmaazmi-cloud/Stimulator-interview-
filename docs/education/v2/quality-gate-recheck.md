# V2 Educational Quality Gate: recheck of F1 to F5

Date: 2026-10-10. Scope: only F1 to F5 from `docs/education/v2/quality-gate.md` and the new mini-check feedback wording. Code read by absolute path in `/home/user/Stimulator-interview-/work/dist/js/`; app at http://localhost:4273; iPhone 14 viewport, Arabic RTL.

## Method (what was actually run)

- Read `practice-a5.js`, `practice-core.js` (`miniCheck`, `ELEMENT_DRILL_EXCLUDE`, `drillPool`, `chooserPool`), `learn.js` (U1, U2, U5), `competencies.js`.
- Playwright (global install, inline `node --input-type=module -e`, because the Bash guard refused creating `/tmp/edu-gate2`; screenshots went to the session scratchpad): drove both mini-checks with an all-wrong and an all-right run, rendered A5 cards `mistakes:2`, `mistakes:3`, `comp:C3`, rendered `#/competencies/C1`, read U5 text. Page errors: none. Screenshots opened with Read: U1 wrong Q1, U2 right Q1, U2 wrong summary, A5 mistakes 2 and 3, A5 comp C3, C1.
- Browser import of `buildCards`, `drillPool`, `chooserPool` against the live data.
- Wording checked against `work/dist/data/reference.json` (R 1.2, 1.3, 1.4, 2.1, 2.2, 2.4 and the part 2 intro, line 253).
- Not run: `npm test`, hash re-check of protected files (not in scope of this recheck), real learners, screen reader.

## F1 to F5 status

| Fix | Result | Evidence |
|---|---|---|
| F1 A5 mistakes deck | Closed | Front is now `لماذا يُعدّ «…» خطأً شائعًا في الإجابة؟`; back is bold mistake name, then the R 2.4 explanation. 7 cards, keys unchanged (`mistakes:1..7`), total 35 cards. Rendered cards 2 and 3 read correctly. |
| F2 U5 6.1 note | Closed | Text on `#/preparation/U5`: `اختر من موقفين إلى ثلاثة مواقف قوية لكل كفاءة…`; the old "قصة أو قصتين" is absent. Matches R 6.1 (2 to 3). |
| F3 "المعنى ببساطة" | Closed | C1 accordion titles: `تعريف الكفاءة`, `صياغة أخرى في الدليل`. A5 front: `ما تعريف كفاءة «…»؟`. The page and the card use the same text (`definition_v1_2025`), so what is studied is what is recalled. Residual, minor: backs stay long (about 110 to 300 characters) because each definition is one sentence; the text is approved and cannot be cut. C6 card asks for «تطوير المهارات» and the back begins «تطوير القدرات» (data naming, not a code fault). |
| F4 C3-B4 | Closed | `drillPool` 42 STAR-L and 22 SEAL, no C3-B4; `chooserPool` still 46 STAR-L (C3-B4 kept for A2) and 22 SEAL, as intended. |
| F5 O1, O5 checks | Closed | U1 and U2 mini-checks present, one attempt per question, icon plus text feedback, summary and retry, stored as `lic:v2:u1-check` and `u2-check`, disclaimer "تمرين للتعلّم، وليس تقييمًا". Rendered. |

## Feedback wording: confirmation against the reference

| Item | Text in app | Verdict | Source |
|---|---|---|---|
| U1 Q1 correct | الكفاءة تُقاس بأدلة سلوكية: ماذا فعلت فعلًا. | Confirmed (Documented) | R 1.2 (الكفاءة: بالأدلة السلوكية) |
| U1 Q1 wrong "المعلومات النظرية" | المعرفة داعمة لكنها لا تكشف السلوك وحدها. | Confirmed (Documented) | R 1.2 |
| U1 Q1 wrong "الطلاقة والانطباع العام" | التقييم يعتمد على جودة الإجابة لا على الطلاقة أو الانطباع العام. | Confirmed (Documented). My earlier doubt was checked and is withdrawn | part 2 intro, `reference.json` line 253 |
| U1 Q2 correct | هذه جملة تصف ما فعلته أنت فعلًا، وهذا هو الدليل السلوكي. | Confirmed (Documented) | R 1.2 (السلوك: ما يقوم به القائد فعليًا), R 2.4 |
| U1 Q2 wrong | هذا رأي. الدليل يريد ما فعلته أنت فعلًا. | Confirmed (Documented). The wrong sentence is the R 2.4 example | R 2.4 row 4 |
| U2 Q1 correct | الإجراء هو الجزء الأكبر من إجابتك (نحو 70%). قل «أنا فعلت» لا «نحن فعلنا». | Confirmed (Documented). "نحو" softens R's "يجب أن يشكّل 70%", which is honest because model answers average about 35% (earlier I7) | R 2.1, R 2.4 row 2 |
| U2 Q1 wrong (الموقف / التعلّم) | الموقف يمهّد فقط… / التعلّم يختم الإجابة… | Confirmed. "يمهّد" matches R 2.1 "وصف مختصر"; "يختم" is Inferred from order (L is last) | R 2.1 |
| U2 Q2 correct | التقييم هو أهم عنصر: حلّل الخيارات والمخاطر قبل أن تقرر. | Confirmed (Documented). "قبل أن تقرر" is Inferred | R 2.2 |
| U2 Q2 wrong | فهم الوضع يمهّد للقرار… / الأثر القيادي يختم الإجابة… | Confirmed (Documented plus Inferred as above) | R 2.2 |

No replacement text is required for these lines.

## A5 mistakes card 3

Back renders as bold `عدم ذكر النتيجة`, then `وهذا يجعل الإجابة غير مكتملة.` Acceptable: «وهذا» refers to the bold line directly above it, the text is verbatim R 2.4, and the front asks "why", which the line answers. No change.

## Optional (not required)

- O-a. Card `mistakes:2` front shows nested guillemets that end in `«أنا»»`. Cosmetic. If the engineer wants to polish: for that front only, drop the outer pair, for example `لماذا يُعدّ التركيز على «نحن» بدلاً من «أنا» خطأً شائعًا في الإجابة؟` (build the front without outer «» for all seven; the bold line already gives the quoted name).
- O-b. Mini-check failure summary says `راجع الشرح تحت كل سؤال في الدرس`. The explanations are in the lesson above, not under each question. Suggested: `راجع شرح هذه المحطة أعلاه، ثم أعد التحقق متى شئت.` (`practice-core.js` line 259.)

## Limits

Effectiveness for real learners is unproven; the design is evidence-informed (retrieval practice, immediate feedback). Native Arabic editor pass still recommended. Mini-check thresholds are not validated as a measure of mastery.

Educational verdict: APPROVED
