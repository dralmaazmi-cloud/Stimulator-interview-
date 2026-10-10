# Educational audit of Leadership Interview Coach (V1 baseline)

Date: 2026-10-10. Author: educational-architect. Scope: presentation layer only. Approved content (questions, model answers, rubrics, reference text) was read, not judged for change.

## 0. What was inspected (all actually opened this run)
- Code: `work/dist/js/learn.js`, `competencies.js` (lines 335-436), `quick-review.js`, `guidance.js` (lines 1-60), `home.js`, `report.js` (grep of UI strings + lines 100-125, 255-275), `self-intro.js` (grep), `rotation.js` (head), `storage.js` (grep), `app.js` (routes).
- Data: `data/reference.json` (parts 1, 2, 4 intro + principle list, 6 in full text), `data/derived/questions.json` (70 items: structure and counts), `expanded-model-answers.json` (header), `derived/lessons.json`, `derived/competencies.json` (head).
- Screenshots: `/tmp/v1-baseline/light-__home.png`, `light-__preparation.png`, `light-__preparation_U2.png`, `light-__competencies_C1.png` (viewed). Not viewed: the other ~100 screenshots, so nothing is claimed about U1, U4, U5, self-intro, simulation or report screens beyond what the code shows.
- Screenshot note: the dark bottom navigation appears mid-page in the full-page captures. This is an artifact of a sticky bar in a stitched full-page capture, not evidence of a layout bug. Not a finding.

## 1. Facts about the current experience (Documented from code/data)
- Question bank: 70 = 40 competency STAR-L + 16 competency SEAL + 6 mission SEAL + 6 mission STAR-L + 2 general (X1, X2). 46 behavioural/STAR-L (each has `sample_answer_star_l` with S/T/A/R/L), 22 scenario/SEAL (`sample_answer_seal`: situation/evaluation/action/leadership_impact), 2 general.
- Preparation = 5 stations: U1 understand, U2 answer building, U3 competencies (redirects to #/competencies), U4 mission command, U5 readiness; plus a "Questions" card. Progress = a manual "mark complete" button per station; home shows "0/5".
- The only interactive learning element in U1/U2/U4/U5 is: accordions, a STAR-L/SEAL tab switch, an unscored readiness checklist (6.1), and inline question cards. The question-focus page (4 steps: question, requirements, build, example) with an answer gate ("have you formed your answer first?") is already good practice and must be kept.
- `rotation.js` already implements "unseen first, then oldest" ordering; the `review` and `stories` IndexedDB stores are declared in `storage.js` but no UI reads or writes `stories` (grep). Persistence of V2 in the brief uses `lic:` localStorage keys; `clearAll()` already removes every `lic:` key (storage.js lines 108-114), so reset works; `exportBackup` exports only IndexedDB stores plus `lic:bookmarked-questions`, so V2 keys would not be backed up unless engineering extends it (decision for the user, see blueprint section 11).

## 2. Findings, prioritized
Priority: P1 = affects whether the learner can apply STAR-L/SEAL (core objective); P2 = clarity/retention; P3 = polish.

### 2.1 Essential (must stay prominent)
| # | Item | Why | Where now |
|---|---|---|---|
| E1 | STAR-L for behavioural, SEAL for scenario, and how to tell which | Core decision on every question; reference 1.4, 2.1, 2.2 | U2 explorer (tab switch), duplicated in quick-review |
| E2 | "Action = the largest part (70%) and say I, not we" | Highest-leverage rule; reference 2.1, 2.3, 2.4 | Buried inside the A card text and an accordion |
| E3 | The five things the interviewer looks for (clarity, personal role, decision quality, impact, learning) | Defines "strong answer"; reference 2.5 | Accordion, 3rd of 5 |
| E4 | 2-3 real stories per competency prepared in advance | Reference 6.1; the best predictor of a usable answer on the day | Line in a U5 accordion; no tool |
| E5 | Self-intro 6 components and 1-2 minutes (with a <=1 minute version) | Reference 6.2-6.3 | U5 accordion + self-intro tool (good) |
| E6 | Rehearse out loud, record, review | Reference 6.4 | U5 accordion text only |

### 2.2 Simplify
| # | Finding | Evidence | Fix (blueprint ref) |
|---|---|---|---|
| S1 (P1) | U2 opens with the framework tab switch but the definition text arrives as a paragraph that the screenshot shows cut under the nav; the learner is told "the most widely adopted international model... gold standard" before seeing what it is. That claim is the guide's own and was not verified externally. | learn.js 150, screenshot U2 | Lead with the decision rule + mnemonic; drop the authority claim from new copy (section 5, S3) |
| S2 (P1) | Competency detail shows the formal definition first (a dense 5-line paragraph) and the "بصياغة أبسط" version second. | screenshot light-__competencies_C1 | Show the simpler wording first, formal one behind "الصياغة الرسمية" (S4) |
| S3 (P2) | Reference table 1.2 (knowledge/skill/behaviour/competency, 4x4 table) is dense for a phone and low on the application path. | reference 1.2 | Collapse into one sentence + key point; table behind "للتعمق" (S2) |
| S4 (P2) | Same STAR-L/SEAL concept is labelled differently in 4 places: reference "الإجراءات / الوضع", explorer "الإجراءات", quick-review "الإجراء / فهم الوضع", guidance.js "الإجراء / فهم الوضع". | learn.js, quick-review.js, guidance.js | One glossary of labels in new copy; keep guidance.js labels as the canonical UI labels (they are what the learner meets in every question) and show the reference's longer label as sub-text |

### 2.3 Reorganize
| # | Finding | Fix |
|---|---|---|
| R1 (P1) | U2 order is: tabs, then 5 accordions in reference order 2.3 criteria, 2.4 mistakes, 2.5 evaluator, 2.6 context, 2.7 how questions are formed. 2.5 (what the evaluator asks) is the headline and 2.3 is its detail; 2.6 and 2.7 are depth. | Order: decision rule, explorer, worked example, activities, then 2.5, 2.4, 2.3, then a "للتعمق" group with 2.6 and 2.7 |
| R2 (P1) | No recommended path. Five equal cards plus a sixth; U4 (mission command) looks as mandatory as U2 although the reference states mission command is "not assessed by a direct question" (reference part 4 key point). | Add a path with U4 labelled as depth; reference sentence explains why |
| R3 (P2) | Self-intro practice appears only in U5 and on home; the interview opens with it (reference 6.2 step 1), yet it is learned last. | Teaser link from U1; budget activity beside U5 6.3 |
| R4 (P2) | Quick-review "answer-guide" page and U2 explorer teach the same thing in two places with different wording (S4). | Keep quick-review as the 60-second recap; add flashcards; remove duplicate definitions from it only in copy, not routing |

### 2.4 Add (gaps)
| # | Gap | Fix | Priority |
|---|---|---|---|
| A1 | No worked-example walkthrough: learners see a finished model answer only after attempting a question, never annotated by element | Activity A3 (worked example with fading) | P1 |
| A2 | No practice at the skill "what type of question is this, and which framework?" before the 70 questions | Activity A2 chooser | P1 |
| A3 | No practice at recognising or placing the five STAR-L elements, or noticing what is missing | Activity A1 | P1 |
| A4 | No retrieval practice or spaced review of the frameworks, 8 competencies, 6 principles, common mistakes | Activity A5 flashcards | P2 |
| A5 | No self-check after viewing the model answer ("what did my answer lack?") | S5 self-check panel | P1 |
| A6 | Self-intro timing: the tool measures time but there is no planning step for how to spend the 60/120 seconds | Activity A4 | P2 |
| A7 | No checks for understanding at the end of U1, U2 | Mini-checks (S2, S3) | P2 |
| A8 | Story bank (E4) not supported; `stories` store exists but is unused | Backlog, not specified here (needs a data-privacy decision) | P3 |

### 2.5 Redundant / overlapping
- 2.3 (7 criteria) and 2.5 (5 interviewer questions) overlap; 2.5 is also what quick-review lists. Present 2.5 as the headline and 2.3 as "التفاصيل".
- Print and PDF buttons repeat on every station page and compete visually with "mark complete" (screenshot U2). Move to the page overflow menu (UI decision, flagged to ui-ux-designer).
- "Questions" preparation card and `#/competencies` question lists overlap for the learner; acceptable, but name them differently ("حسب الكفاءة" vs "كل الأسئلة").
- Manual "mark complete" duplicates what activity completion could prove.

### 2.6 Hide behind "optional / للتعمق" (progressive disclosure)
Reference 1.2 table, 1.5 selection logic paragraph (mentions SHL, Korn Ferry, DDI, OPM, not verified here), 2.6, 2.7, 6.5 body-language table detail (keep 3 headline items visible: sitting posture, eye contact, not interrupting; the rest behind "المزيد"), full list of 7 criteria in 2.3.

### 2.7 Make interactive (by concept type)
| Concept | Type | Current | Proposed | Why this over alternatives |
|---|---|---|---|---|
| Which framework for which question | judgment/classification | tab switch (passive) | A2 chooser, interleaved | Practice discriminating; flashcards would only test labels |
| STAR-L elements | structure | table/cards | A1 sort + missing-element | Structure is learned by placing parts; quiz of letters is weaker transfer |
| What a good answer looks like | procedure by example | model answer after attempt | A3 annotated walkthrough with fading | Worked examples suit novices; fading hands over control |
| Terms, 8 competencies, 6 principles, mistakes | facts/terms | read-only | A5 flashcards, 3 boxes | Cheap, repeatable, spaced |
| Self-intro structure and timing | process over time | generator + timer | A4 time budget | Makes the 60/120 s limit tangible before writing |
| Readiness | checklist | checkbox list (unscored) | keep; link each item to an action | Low cost, already works |

## 3. Cautions found in the current copy (no change requested to approved text)
- "The most widely adopted international model... gold standard" (reference 2.1) and the SHL/Korn Ferry/DDI/OPM list (reference 1.5) are claims inside approved content. They could not be verified in this run (no web access, see evidence-log). New UI copy therefore avoids repeating them. Whether to keep them is the owner's decision; no change proposed.
- Reference 6.2 gives two durations for the self-intro ("one to two minutes" and "not more than one minute", with advice to prepare a short and a longer version). The tool offers 60 s and 120 s; consistent. New copy states both without choosing one.
- Reference 2.5 maps to 5 interviewer questions, not to the five STAR-L letters. New copy must not claim a 1:1 mapping.

## 4. Educational-risk notes
- Self-ratings and drills are practice aids; they must never be presented as assessment, score or prediction of the real interview (the app already disclaims this in the report footer).
- Effectiveness of any V2 activity for these learners is unproven until measured; design choices are evidence-informed (see evidence-log, with its verification limits).
