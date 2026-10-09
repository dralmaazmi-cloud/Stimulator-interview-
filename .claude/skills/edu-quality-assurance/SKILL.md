---
name: edu-quality-assurance
description: Educational content and assessment QA for the educational-architect. Use for the Educational Quality Gate after implementation, for auditing lessons and blueprints, and for question-bank, answer-key, difficulty, coverage, psychometric and scoring-algorithm reviews.
---

# Educational content and assessment QA

Two modes. Pick the one the brief needs.

## Mode A: Educational Quality Gate and content review
1. Load the approved blueprint (objectives, essential content, sequence, interactions, sources).
2. Inspect the implementation: read the content in code or data files; when a local file or URL is provided, take real screenshots with the visual-check helper and open each PNG before commenting.
3. Check each item of `references/gate-checklist.md` (read it at the start of the gate).
4. For each issue: location (screen or file and line), category, severity (blocker, major, minor), evidence, and a concrete fix.
5. Verdict line, exactly one of: `Educational verdict: APPROVED`, `Educational verdict: CHANGES REQUIRED`, `Educational verdict: BLOCKED (reason)`. No other wording. Separate from QA.
6. Wording rule: say "evidence-informed design" when a principle supports a choice. Never say the app is proven to improve learning without data from real learners.

## Mode B: Assessment and question-bank audit
Follow `references/assessment-audit.md` (read it when this mode starts). Key rules:
- Verify every answer key by solving the item yourself from the source material; mark keys Verified, Disputed (with reasoning and source) or Unverifiable.
- Find duplicates and near-duplicates (normalize text; compare stems and options). Scripts must write only to /tmp.
- Build a coverage matrix: competency or objective by item count and cognitive level; list gaps against the reference documents.
- Label difficulty as **estimated** unless real response data (p-values) exists.
- Content coverage is not validity. Claim reliability or validity only with real data and named methods (for example Cronbach's alpha, item-total correlation, factor analysis, IRT), and report sample size.
- Scoring algorithms: test with hand-computed cases, edge cases and reverse-keyed items; report discrepancies with exact inputs and outputs.
- Never change an approved bank, key or algorithm; propose changes in the report.

## Output
Markdown report, plus JSON following `references/report-schema.json` when the brief asks for machine-readable output.
