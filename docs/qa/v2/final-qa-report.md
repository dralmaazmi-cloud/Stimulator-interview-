# V2 release-candidate QA report

Branch feature/interview-v2-redesign. Tested at HEAD 8c680f7 (tree clean at start); HEAD moved to 43f661d during the run
(two docs-only commits: docs/design/v2/visual-qa-recheck.md, docs/education/v2/quality-gate-recheck.md; `git diff 8c680f7 43f661d --stat` shows only those 2 files; app code unchanged).
Engine: Chromium 141 (Playwright) only. This does not prove iOS Safari behaviour. Mock AI provider only (audit-harness server); no live Gemini.

## Verdict: PASS WITH RISKS (0 defects found; risks listed below are unverified areas, not failures)

## Commands and results
| # | Command | Result |
|---|---|---|
| 1 | `cd work && npm test` | exit 0 (alpha-5, print book, alpha-10 regression suites passed) |
| 2a | `BASE=http://localhost:4273 OUT=/tmp/qa-final/sweep node ui-sweep.mjs` | exit 0, `SUMMARY routes=70 screens=86 failures=0 consoleErrors=0` |
| 2b | `BASE=http://localhost:4273 OUT=/tmp/qa-final/journeys node journeys.mjs` | exit 0; "false" lines: J1c home resume (false), J2 auto-start (false = intended). No error lines except J3 offline (expected ERR_INTERNET_DISCONNECTED) |
| 2c | same journeys on V1 (:4173) | same two "false" lines on V1; other diffs are random question/score only |
| 3a | `node tests/agent-qa/practice/practice-activities.test.mjs` | exit 0, 139 PASS, 0 FAIL |
| 3b | `node tests/agent-qa/storage/backup.test.mjs` | exit 0, 89 PASS, 0 FAIL |
| 3c | `node tests/agent-qa/ai/ai-integration.test.mjs` | exit 0 (PASS ai-integration) |
| 4 | `node tests/agent-qa/e2e/v2-release.test.mjs` | exit 0, 136 PASS, 0 FAIL (sections: tabs, activities, sim, errors, voice, offline, persist, backup, layout, font) |
| 5 | measure-interaction.mjs, iPhone 14, RTL, CPU 4x, 5 runs (10 for settings accordion) | see table below |
| 6 | `git diff 4ca4ff5 --stat -- <protected paths>` | empty (0 bytes), re-run at 43f661d |

## E2E coverage (136 checks)
5 tabs + aria-current + back/browser-back/unknown route; A1-A5 and U1/U2 mini-checks; single-question text simulation -> report -> 503 -> locked resend -> report -> session saved -> survives reload;
AI errors via page.route (503 AI_OVERLOADED, 504, 422 AI_SCHEMA_FAILED, aborted request): Arabic message, answer kept, resend control, no raw code; 9 s delay: phase label + elapsed seconds at ~3 s, slow notice after 8 s, completes; Cancel keeps text and no late report;
voice with fake mic (record, stop, mock transcribe, editable text, not auto-evaluated, evaluate after review; failed transcription keeps recording and resend works);
offline reload via service worker (home, practice/a2, preparation/U1, tab nav, simulation setup); persistence (A4, A5, theme dark, font large, corrupt/legacy v2 localStorage shapes);
export with/without answers, 4 malformed imports (not JSON, wrong shape, __proto__ keys, empty) leave data intact, own export re-imports;
dir=rtl and no horizontal overflow on 19 routes + question page at 320x568, 375x667, 390x844, 430x932; large font on home/simulation setup/question at 390 and 320 (no overflow, last content clear of nav, start/submit reachable).

## Interaction latency (feedback visible, ms, median [range]; Chromium, iPhone 14, 4x CPU)
| Step | V2 | V1 | Flag >100 ms |
|---|---|---|---|
| Simulation mode select | 63.2 [55.3-70] | 54.0 [44.5-57.5] | no |
| Answer-method toggle | 29.6 [29.2-42] | 31.0 [27.8-33.6] | no |
| Settings accordion open (10 runs) | 63.5 [54.8-88.4] | 43.8 [38.1-49.5] | no |
| Lesson accordion open (U1) | 59.4 [50.7-74.9] | 66.2 [55.5-71.7] | no |
| A1 answer feedback | 50.7 [37.4-75.5] | n/a (V2 only) | no |
| A5 card flip | 45.3 [40.0-53.5] | n/a (V2 only) | no |
| Bottom-nav tap, aria-current feedback (custom script) | 21-24 [max 36] | not measurable (V1 mutation not observed) | no |
| Bottom-nav tap, input to next paint (Event Timing, 8 ms granularity) | preparation 128 [max 144], reports 56, simulation 48, home 72 | 96, 64, 72, 56 | preparation tab only, below 200 ms |
No long tasks, no console errors in any step. JSON: /tmp/qa-final/perf/*/interaction-*.json and /tmp/qa-final/perf/navtap-*.json.
measure-interaction.mjs cannot time hash-link taps (reports them as cross-document navigations, medians empty), so nav was measured with tests/agent-qa/e2e/timing/nav-tap.mjs (in-page Event Timing + MutationObserver).

## Findings (none blocks release)
- L1 (low, informational): Preparation tab tap to next paint is 128 ms median at 4x CPU (V1 96 ms); highlight itself appears in ~24 ms. Under the 200 ms INP "good" bound.
- L2 (low, informational): Settings accordion open is ~20 ms slower than V1 (63.5 vs 43.8 ms), still under 100 ms.
- L3 (low, pre-existing): after "save and exit" the home screen shows no resume card (J1c false). Identical on V1 and home.js at 4ca4ff5 has no resume code. Resume works from the simulation setup (J1d) and the sessions page.
- L4 (info): reloading the page while app init is still fetching /data/*.json logs `TypeError: Failed to fetch` to console (app.js init catch). Only when a reload races the first load; test artifact, not seen in normal flows.
- Guard note: a hook reported "HEAD changed during this command" (orchestrator docs commits, verified docs-only).

## Not verified
iOS Safari / real iPhone; real microphone and codecs (fake device only); live Gemini (`npm run test:live` not run); service worker on HTTPS Vercel and installed-PWA behaviour; real network latency.

## Files added
tests/agent-qa/e2e/v2-release.test.mjs, tests/agent-qa/e2e/timing/{steps-*.json,nav-tap.mjs}, this report.
