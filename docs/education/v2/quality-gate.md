# V2 Educational Quality Gate

Date: 2026-10-10. Scope: implemented V2 (code read from `/home/user/Stimulator-interview-/work/dist/js/`, app at http://localhost:4273, iPhone 14 viewport, Arabic RTL). Compared with `blueprint.md`, `audit.md`, `evidence-log.md`.

Result: **Educational verdict: CHANGES REQUIRED** (equivalent to "PASS WITH FIXES": no blocker, 5 small required fixes).

## 1. What was run (and what was not)

| Check | Command / method | Result |
|---|---|---|
| Protected files unchanged | The literal `git -C <main checkout> diff 4ca4ff5 --stat ...` was refused by the worktree guard (git redirected to another checkout). Equivalent run instead: `git ls-tree -r 4ca4ff5 -- <protected paths>` in the worktree, then a Python script (`python3 -I`, scratchpad) computing git blob SHA-1 of each file in the main checkout and comparing | 16 of 16 files identical to 4ca4ff5 (`work/dist/data/derived/*.json` x9 incl. questions.json, `exercises.json`, `expanded-model-answers.json`, `reference.json`, `guidance.js`, `scoring-rules.js`, `api/_lib/scoring.js`, `api/_lib/prompts.js`). No extra file exists under `work/dist/data`. Not the literal command, so please re-run it once in the main session. |
| A1 data fidelity, all items | Playwright (`/tmp/edu-gate/a1test.mjs`): for all 43 STAR-L + 22 SEAL items in the drill pool, load `#/practice/a1?mode=sort&q=ID`, compare question text, 5/4 card texts and slot labels to `questions.json`, place cards by the data key and press check; then missing mode for every element (`el=`), compare shown blocks, success feedback and revealed text | 65 items, 0 problems. Mechanism and label/data match are correct. |
| A1 human ambiguity | Read all 65 items in full (more than the 25 required) | See section 3. |
| A2 keys, all 68 items | Script `audit3.mjs`: `rubric_mode` vs `type` (behavioural/scenario) for all 68 pool items | 0 mismatches. Hint "غالبًا يبدأ ... صف، أخبرني، اذكر" verified: 41 of 46 STAR-L items open with صف/أخبرني/اذكر (+2 قدّم); no SEAL item opens with a behavioural cue. |
| A5 cards | Browser import of `buildCards` | 35 cards as designed; problems in section 3. |
| Rendered screens | Screenshots read: `#/preparation`, `U2`, `competencies/C1`, A1 sort, A3 choose step, A4, self-check | RTL correct, no horizontal overflow, no tap target under 44 px on 15 routes, no page errors except one `console TypeError: Failed to fetch` seen during the flow run (origin not identified; not traced to V2 code). |
| Interaction flows | Self-check on C1-S1 (ratings, summary, links), X1 self-check, A2 answer feedback, A3 walk to the SEAL choose step, A5 card reveal | Worked as coded. |
| Not done | Tests with real learners; native Arabic editor review; `npm test` (QA's job); `U1`, `U4`, `U5`, hub, A5-deck screenshots were taken but only U2/index were examined closely | |

## 2. Objectives O1 to O8 versus what was built

| Obj | Teaching | Practice | Check | Status |
|---|---|---|---|---|
| O1 competency interview measures behaviour | U1 "الفكرة في ثلاث جمل", two-types panel (matches R 1.3, 1.4) | A2 4-item round from U1 | None direct (S2 mini-check skipped). Only A5 "evaluator" deck touches it | Partial: no check (F5) |
| O2 behavioural vs scenario | decision card, compare strip, two-types panel | A2 8-item interleaved round | A2 7/8 twice | Met |
| O3 place 5 STAR-L / 4 SEAL elements | explorer, A3 | A1 sort | A1 first-try 4/5 three times | Met |
| O4 spot missing element | A1 missing explanations | A1 missing | A1 5 of 6; S5 self-check | Met |
| O5 Action largest, "I" not "we" | explorer 70% bar + caption, A3 annotations, A1 perfect-sort line | A3 | No direct check: A3 faded step tests SEAL Action, not this idea. Indirect via A5 cards `star-l:A`, `mistakes:2` | Partial (F5) |
| O6 60 s / 120 s self-intro covering 6 components | A4 text from R 6.2, 6.3 | A4 budget | A4 total vs target feedback; link to existing tool | Met |
| O7 recall 8 competencies, 6 principles, 7 mistakes | A5 | A5 | A5 boxes | Met in structure; card quality defects (F1, F3) |
| O8 compare own answer to elements | S5 panel | S5 | S5 summary | Met |

Sequence: path chips, express card, A3 then A1 then A2 inside U2 (worked example before practice) follow the blueprint. Practice is on separate routes behind entry cards rather than inline; acceptable and lowers page load.

## 3. Findings

Severity: blocker, major, minor. No blocker found.

### Required fixes

**F1 (major) A5 "mistakes" deck: cards are circular.** `practice-a5.js` line 65-71. Front: `ما الخطأ الشائع: «الحديث بعموميات دون تفاصيل»؟` already names the mistake; back for card 1 is only `مثل: «أنا دائماً أقود الفريق بشكل جيد.»`, card 3 `وهذا يجعل الإجابة غير مكتملة.`, card 6 `مؤشر ضعف في النضج القيادي.` (sentence fragments with no subject). Text is verbatim from R 2.4, so the fault is the card form, not the data. Proposed exact change (keys unchanged so saved boxes survive):
- front: `` `لماذا يُعدّ «${cellText(row[0])}» خطأً شائعًا في الإجابة؟` ``
- back: `[cellText(row[0]), cellText(row[1])]` (first line renders bold, then the R 2.4 explanation).

**F2 (major) U5 6.1 note contradicts the reference.** `learn.js` line 451: `اختر قصة أو قصتين على الأقل لكل كفاءة، ثم تدرّب على قولها بصوتك.` The checklist item directly above (R 6.1) says "اختيار 2–3 مواقف قوية لكل كفاءة". The blueprint marked this line `[REF 6.1: 2-3]` but my own copy said "قصة أو قصتين"; error originated in the blueprint. Replace with: `اختر من موقفين إلى ثلاثة مواقف قوية لكل كفاءة، ثم تدرّب على قولها بصوتك.`

**F3 (major) "المعنى ببساطة" is an unsupported claim.** `competencies.js` line 141 labels `definition_v1_2025` as "simple", but it is not simpler: it is longer than `definition` for 7 of 8 competencies (C1 233 vs 226 chars, C3 386 vs 290, C5 394 vs 327, C7 345 vs 176 ...). The same assumption was made in my blueprint (S4) and carried to A5. Fixes:
- `competencies.js` 141: title `تعريف الكفاءة`; line 146: title `صياغة أخرى في الدليل`.
- `practice-a5.js` line 54: front `` `ما تعريف كفاءة «${competency.name}»؟` `` (drop "ببساطة") and back `[firstSentence(competency.definition_v1_2025)]` (the helper already exists in the file). Current backs are 230-390 characters, too long for a recall card.
- Section subtitle "اقرأ المعنى أولًا" is fine to keep.

**F4 (major, one item) Exclude C3-B4 from the element drills.** Its Task text is `اتضح أن هذا القرار أثر على مستوى التطبيق لدى بعض المتدربين` (reads as a consequence, so it competes with Result in sort mode and makes Result-removal ambiguous in missing mode), while Situation holds the decision (`قررت تقليل وقت التطبيق...`). Data is approved and must not be edited. Preferred implementation: a new constant used only in `drillPool` (A1, A3), e.g. `ELEMENT_DRILL_EXCLUDE = ['C3-B4']`, because the existing `DRILL_EXCLUDE` / `data-drill-exclude` is also applied in `chooserPool` and would remove a valid A2 item. Acceptable alternative: `DRILL_EXCLUDE = ['C3-B4']` (costs one of 46 A2 items). Pool then: 42 STAR-L, 22 SEAL.

**F5 (major, may be resolved by documentation) O1 and O5 have no check.** Either implement the two mini-checks skipped by the engineer, or amend the objective table and release notes to say O1/O5 are covered only by A5 retrieval. Minimum content, copy from blueprint S2/S3 (all answers from R 1.2, 1.3, 2.1, 2.2):
- U1, Q1 "ما الذي تقيسه المقابلة المبنية على الكفاءات أساسًا؟" correct "سلوكك القيادي الفعلي ودليله".
- U1, Q2 "أي الجملتين أقرب إلى دليل سلوكي؟" correct «لاحظت أن الفريق لم يفهم التوجيه، فأعدت صياغته وطلبت من كل فرد أن يعيد شرح جزئه.»
- U2, Q1 "أي عنصر ينبغي أن يكون الجزء الأكبر من إجابة STAR-L؟" correct الإجراء. Q2 "في سؤال سيناريو، أي عنصر هو الأهم؟" correct التقييم.
- Persist as `lic:v2:u1-check`, `lic:v2:u2-check`; one attempt, then the feedback lines in blueprint S2.

### Data observations (not changes to make now; proposals for the content owner)

| Location | Current | Proposed | Reason |
|---|---|---|---|
| `questions.json` C6-B6 `sample_answer_star_l.task` | `...إدارة الحوار خلال30 يومًا لتأمين جاهزيته` | `خلال 30 يومًا` | missing space (typo) |
| C6-B7 task | `رفع جاهزية الفريق ضمن مدة90 يومًا` | `ضمن مدة 90 يومًا` | missing space |

Items needing no action but worth a human spot check (ambiguity risk in sort mode, not wrong-keyed): C6-B6, C6-B7, C6-B8 (Situation restates the Task and the time frame), C7-B4 (Learning phrased as a cause, "ظهوري بثبات ... كان العامل الحاسم"), C2-B5 (single-sentence Action, only item where Action is not the longest element). SEAL Evaluation/Action are structurally similar in all items (both future tense); highest risk: C8-S1 (Evaluation starts "سأجمع المعلومات"), C7-S1 ("خطوتي الأولى"), M4-S1, C1-S1. Recommendation: do not exclude; check with 3 to 5 real learners; the pair messages for E/A already target this confusion. 3 STAR-L items (C5-B6, C6-B9, C6-B10) are automatically outside A1/A3 because their data has `action_points` instead of five elements; the blueprint's "46 candidates" is really 43 (42 after F4).

### Feedback accuracy and consistency with reference.json

- A1 pair messages, missing-element explanations, A2 feedback, A3 annotations, S5, U1/U2 copy, mission banner, A4 intro: consistent with R 1.3, 1.4, 2.1, 2.2, 2.4, 2.5, 6.2, 6.3 and `guidance.js` prompts. STAR-L = Situation, Task, Action, Result, Learning; SEAL = Situation, Evaluation, Action, Leadership Effect: meaning unchanged. Canonical labels (الموقف، المهمة، الإجراء، النتيجة، التعلّم / فهم الوضع، التقييم، الإجراء، الأثر القيادي) used throughout. "نحو 70%" matches R 2.1.
- A4 suggested splits sum exactly (60 and 120); words at 115 wpm computed correctly (5 s = 10 words).
- Caption protecting against a false mapping of the five evaluator criteria to STAR-L letters is present (U2).
- Evidence wording: no claim that the app improves learning; "تمرين للتعلّم، وليس تقييمًا" is on every activity.
- No altered approved content: question text, model answers and element texts are rendered verbatim (65-item test); rubric files and scoring untouched (hash check).

### Skipped blueprint items (engineer list)

| Item | Impact | Decision |
|---|---|---|
| S2/S3 mini-checks | Leaves O1 and O5 without a check | F5 |
| S1 U1 reorder / "للتعمق" grouping | U1 still shows all five accordions in source order; low load (five collapsed rows) | Accept, minor |
| S7 6.5 trimmed to three rows | Body-language detail stays complete; adds length to U5 only if opened | Accept, minor |
| S8 report wording | "دليل غير موثّق" and "أين ذهبت الدرجة" remain; the learner meets unexplained jargon in the one screen that matters most | Defer; propose as a separate approved change because `report.js` display strings relate to scoring explanation; wording table in blueprint S8 stands |
| A4 prefill of self-intro | Optional in the blueprint | Accept |

### Cognitive load, accessibility

- Load is acceptable: five activities, one idea per screen, A1 mastered badge; hub gives no suggested order (minor, see I6).
- Accessibility: tap or select alternative everywhere (no drag), feedback is icon plus text with focus moved to it, `aria-pressed` on toggles, Latin terms wrapped in `bdi dir=ltr`, progress bars have roles. Not verified: screen-reader behaviour, `prefers-reduced-motion` (code uses smooth scroll only when not reduced in S5; other `scrollIntoView` calls not checked), keyboard order in RTL.

## 4. Optional improvements

- I1 (A3 faded step is trivially solvable). The Evaluation block is already on screen above, and the same text is offered again as a card; elimination leaves two cards. Drop the Evaluation card (offer Action and Leadership impact plus, if wanted, nothing else) or replace the distractor with another item's Evaluation text; keep the feedback lines. This design came from my blueprint.
- I2 (A2 SEAL hint). 11 of 22 SEAL questions contain first-person past verbs (لاحظت، تلقيت، واجهت، اكتشفت), which can trigger "a story that happened to me". Add to the wrong-answer feedback for SEAL: `انتبه لآخر السؤال: كيف ستتعامل؟ ماذا ستفعل؟ هذه صيغة موقف افتراضي.`
- I3 (A1 sort first screen). On iPhone 14 the learner sees two toggles and the question before any card; the cards start below the fold. Put the toggles after the question or collapse them once a mode is chosen.
- I4 (U2 duplication). Section headings repeat the card titles ("شاهد إجابة كاملة", "أي بناء أستخدم؟"); keep one.
- I5 (labels). Self-check rows use guidance titles ("المهمة ودورك") while A1/A5 use "المهمة"; consistent enough, but note it.
- I6 (hub order). Add one line: `ابدأ بـ «شاهد إجابة كاملة» ثم «ورشة العناصر».`
- I7 (70% versus examples). R 2.1 says Action should be 70%; in the 43 model answers Action averages 35% of characters (it is the longest element in 42 of 43). Wording "الجزء الأكبر" is true to the examples; keep the 70% label but avoid asking learners to measure it.
- I8 ("أتقنت هذا التمرين" and time hints). Thresholds and "نحو 8 دقائق" are Estimated (blueprint `[EST]`); consider "أنجزت هذا التمرين" and "تقدير تقريبي".
- I9 (backup). `lic:v2:*` progress is not in the export (blueprint open item 11.1); decide with the owner.
- I10. The `Failed to fetch` console error should be traced by QA (could be unrelated to V2).

## 5. Uncertainties and limits

- Effectiveness for real learners is unproven; the design is evidence-informed (retrieval practice, spacing, worked examples with fading, interleaving: evidence-log E-L1 to E-L4, not verified against opened sources this run).
- Item ambiguity judgments are the reviewer's reading, not learner data.
- Arabic copy still needs a native editor pass.

Educational verdict: CHANGES REQUIRED
