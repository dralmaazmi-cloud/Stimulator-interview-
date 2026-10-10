# Quality gates

Run a gate only when its trigger applies. Each gate produces one verdict line that the Orchestrator copies into the final report.

| Gate | Agent | Required when | Verdict line |
|---|---|---|---|
| QA | qa-engineer | Any behavior change in code | `QA verdict: APPROVED / CHANGES REQUIRED / BLOCKED` |
| Security | security-engineer | Auth, secrets, storage of personal data, dependencies, AI calls, deployment config changed; always before a deployment request | `Security verdict: PASS / PASS WITH RISKS / FAIL` |
| Educational | educational-architect | Educational content, learning flow, interactions, assessments or scoring built or changed | `Educational verdict: APPROVED / CHANGES REQUIRED / BLOCKED` |
| Visual | ui-ux-designer | Screens or styles changed, or RTL/LTR or iPhone layout is in scope | Issue list with severities, from screenshots actually opened |

Not required: documentation-only changes, comment changes, or changes with no runtime effect. Say "not required" with the reason in the final report.

## QA gate checklist
- Tests for each acceptance criterion exist and ran in this task.
- Regression suite ran, or the reason it could not is stated.
- Data persistence checked when storage changed.
- Mobile viewport and RTL checked when UI changed (engine named).

## Security gate checklist
- No secrets in code, history or client bundles (values redacted in reports).
- Server-side authorization on every protected path.
- Dependency audit actually run, real findings listed.
- AI data flows and prompt-injection exposure reviewed when AI is involved.

## Educational Quality Gate checklist
Reviewed against the approved blueprint, separate from QA:
- Educational accuracy: every essential claim matches the cited sources; no new unsourced claims in the UI.
- Explanation clarity for the stated learner level.
- Content completeness: every essential item from the blueprint is present.
- Prioritization: essential content is prominent; supplementary content does not crowd it out.
- Learning sequence matches the blueprint and prerequisites come first.
- Interactions suit the concept, work as intended, and give useful feedback.
- Alignment: every objective has teaching content and a practice or check.
- Wording: no claim that the app is proven to improve learning; "evidence-informed design" only, with the principle named.

## Final Orchestrator review
- Every user requirement mapped to evidence (file, test, screenshot or verdict).
- `git status` shows only intended files; no protected or approved file changed without approval.
- `scope.json` removed after the task.
- Nothing deployed, pushed or merged without explicit user approval.
