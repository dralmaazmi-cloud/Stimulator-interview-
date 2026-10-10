# V2 Visual QA recheck (after fix pass)

Target: http://localhost:4273 (css `?v=0.6.0-alpha-10-v2e`). Chromium (Playwright), iPhone Safari user agent, DPR 2, touch, `ar-AE`. Widths 375x667, 390x844, 430x932; themes cream, light, dark (9 combinations, same script: `/tmp/vqa2/run.mjs`). About 25 screens per combination, 225 shots in `/tmp/vqa2/shots`; I opened about 40 one by one (all main screens at 390 cream; dark: Home, C1, A5, setup, waiting, report, summary, settings; 375 cream: Home, answering, summary, A2; 430: model answer, reports). The rest are covered by metrics. Chromium is not Safari: safe-area insets are 0, backdrop blur can differ.

Verdict: **PASS WITH 3 SMALL FIXES** (no blockers, no majors left except one dark-mode contrast regression). All of B1 to B3 and M1 to M8 are resolved or acceptable.

## Measured, all 9 combinations
- Horizontal overflow: 0 on every screen. Console errors: 0. Tap targets under 44px: none (hidden file input excluded).
- Keyboard focus (M7): `scroll-padding-block` is now 60px / 176px. Tabbing 25 stops on `/settings`, `/simulation`, `/competencies/C1` at 390x844 with 450ms settle: 0 focused elements hidden or covered. (A first run at 60ms showed 11 hits; they were mid smooth-scroll, not real.)

## Previous items
| Item | Status | Evidence |
|---|---|---|
| B1 C1 active tab contrast | Fixed | active tab `rgb(11,107,99)` on surface (cream, light) and `rgb(92,196,180)` on `rgb(16,40,42)` (dark) in all 3 widths; outline visible |
| B2 A5 deck cards | Fixed | full-width rows, title and count readable, 3 widths |
| B3 summary ring | Fixed | single ring, "85%" on one line, not clipped, cream and dark |
| M1 score pills, history stats | Fixed | reports list 3 equal tiles, pill "85%" one line |
| M2 bookmark position | Fixed | bookmark at end (left in RTL), badge free |
| M3 question hub chevron | Fixed | no overlap with badge |
| M4 contrast | Fixed for the listed items; one new miss (see R1) |
| M5 textarea below fold | Fixed at 390/430 (label at 485 css px, textarea top 506 / 470); partly at 375x667 (see R2) |
| M6 question focus | Fixed: header row now shows the competency name (no duplicate title), done steps show a check, model answer parts have a full-width body |
| M7 focus under bars | Fixed (measured) |
| M8 action-share label | Fixed: label centre 177.8px equals marker centre 177.8px, at 30% from the left = 70% from the start |
| Minor 1 A2 feedback and next button | Fixed at 390 and 375 (button above bottom nav) |
| Minor 2 disabled helper | Fixed: chip "اكتب إجابتك أولًا" |
| Minor 3 sticky bar backing | Fixed |
| Minor 6 quote marks | Fixed: «…» |
| Minor 12 pink competency tile | Fixed: lilac |
| Minor 4 small text | Not fixed: home ring "0/5" 9.12px, evidence `q` 11.52px, mini `%` 11.84px |
| Minor 8, 11 | Not fixed: practice hub breadcrumb "كل التمارين" points to itself; header title repeats h1 on practice hub |

## Remaining fixes

### R1 (major, dark only): metric numbers fail contrast on the session summary
`.aggregate-metric strong` and `.structure-coverage-grid bdi` use `var(--teal-900)`, which is `#17786F` in dark: 2.91:1 on `#10282A` (4 stat tiles) and 2.35:1 on `#153A30` (SEAL coverage tiles). Cream and light pass. Only the summary screen is affected (report and reports list in dark measured clean).
```css
.aggregate-metric strong, .structure-coverage-grid bdi { color: var(--brand-text); }
```
(`--brand-text` is `#5CC4B4` in dark, `#0B6B63` in cream and light.)

### R2 (minor): answering screen at 375x667 still hides the textarea behind the sticky bar
Textarea top is 541 css px and the submit bar starts near 510, so the first view shows the label and the bar but not the field. Reclaim about 100px on short phones:
```css
@media (max-height: 700px) {
  .ai-question-card .question-id { display: none; }
  .ai-question-card h2 { font-size: var(--fs-body-lg, 1.25rem); line-height: 1.6; }
}
```
(The `h2` is 210px tall at 24px; at 20px it is about 160px, and removing `.question-id` saves 31px.)

### R3 (minor): SEAL coverage grid leaves a hole in the summary
`.structure-coverage-grid article:last-child { grid-column: 1 / -1 }` (legacy, line 1424, max-width block) is meant for the 5-tile STAR-L grid. With the 4 SEAL tiles the 3rd tile sits alone in the right column and the 4th spans the full row.
```css
.structure-coverage-grid article:last-child:nth-child(even) { grid-column: auto; }
```

## Polish notes (no action required)
- Translucent sticky header/stepper lets scrolled text ghost through when `backdrop-filter` is absent (seen in Chromium on C1 and U1 mid-scroll). Safari applies the blur; check there.
- Dark: answer-mode segmented track on the answering/waiting screen is nearly black (`#06100f`) next to teal cards; consider `var(--surface-2)`.
- U2: the selected framework card (STAR-L) loses its icon badge circle while SEAL keeps it.
- Question focus meta tags are still about 50px tall bubbles (spec 28px).
- Full-page screenshots show the "انتقل إلى المحتوى" skip link and a floating bottom nav mid-page; this is a full-page capture artefact (not present in viewport shots; `document.activeElement` after a tab click is the tab button).

## Not verified
Real Safari rendering and safe-area insets, microphone recording and permission-denied states, `prefers-reduced-motion`, large-font mode and accent presets (navy, sage), print layout, failed AI evaluation (error state), offline. The AI response in the run came from the local backend with `/api/evaluate` delayed by 6 to 7 seconds via `page.route`.

## Screenshots for presentation
16 viewport-sized 390x844 images (DPR 2) in `/tmp/vqa2/final/`: 01_home_cream, 02_preparation_light, 03_preparation_U1_light, 04_preparation_U2_cream, 05_practice_hub_cream, 06_practice_a5_dark, 07_practice_a2_feedback_light, 08_competency_C1_tab_dark, 09_question_focus_dark, 10_model_answer_cream, 11_simulation_setup_cream, 12_answering_light, 13_ai_waiting_cream, 14_report_hero_dark, 15_session_summary_cream, 16_reports_list_light. I opened 02, 03, 04, 07, 08, 09, 10, 11, 12, 13, 14, 15 in final form; 01, 05, 06 and 16 come from the same script and I inspected the equivalent captures from the main run (same routes and themes). None shows R1 (the dark summary is deliberately excluded).
