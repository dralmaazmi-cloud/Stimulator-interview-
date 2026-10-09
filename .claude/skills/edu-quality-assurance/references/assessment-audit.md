# Assessment and question-bank audit procedure

## 1. Inputs
Reference documents (frameworks, competency models, syllabi), the question bank, answer keys, scoring rules, and any response data. Extract PDF text with `pdftotext file.pdf -` (stdout) and read only relevant sections.

## 2. Extract the framework
List competencies, dimensions, traits or objectives with definitions and the source location (file, page or section). This is the coverage baseline.

## 3. Per-item checks
- Alignment: which competency or objective it measures (or none).
- Stem: clear, self-contained, no clues to the answer, no unnecessary negatives, no double-barrelled questions.
- Key: re-solve independently; Verified, Disputed (reason, source) or Unverifiable.
- Distractors: plausible, mutually exclusive, similar length and grammar, each reflecting a real error.
- Explanation: correct, explains why the key is right and why main distractors are wrong.
- Difficulty: estimated level with reasoning, unless real p-values exist.
- Item-type specifics:
  - Numerical reasoning: recompute every figure; check units, rounding and data tables.
  - Verbal reasoning: the answer must follow from the passage only (True / False / Cannot say logic).
  - Abstract reasoning: exactly one rule set yields the key; no alternative valid rule.
  - Situational judgement: scoring key justified by the framework or expert consensus; note that SJT keys are judgment-based.
  - Personality and derailer items: keyed direction, reverse-keyed items, social desirability risk; no right-or-wrong framing.

## 4. Bank-level checks
- Duplicates and near-duplicates.
- Coverage matrix and gaps against the framework.
- Difficulty distribution (estimated or empirical, labeled).
- Answer-position balance for multiple choice.
- Consistency of terminology and formatting.

## 5. Psychometric claims
Only with data: reliability (alpha or omega with N), item statistics, validity evidence types (content, internal structure, relations to other variables). Otherwise state "not established".

## 6. Scoring algorithms
Hand-compute expected results for typical, boundary and extreme response patterns; include reverse-keyed and missing responses; compare with the implementation output.

## 7. Report
Summary, findings by severity, item table (ID, alignment, key status, issues, estimated difficulty), coverage gaps, duplicates, recommendations, and a clear split between documented findings, inferences and estimates.
