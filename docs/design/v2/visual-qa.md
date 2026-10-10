# V2 Visual QA (against docs/design/v2 spec)

Target: http://localhost:4273 (work/dist, css `?v=0.6.0-alpha-10-v2c`; the JS version string changed to `v2d` during the run, so the engineer was still editing). Method: Chromium (Playwright) with an iPhone Safari user agent, DPR 2, touch, `ar-AE`. Widths 375x667, 390x844, 430x932. Themes: cream (default), light (white), dark. Large font via Settings. Screenshots are in `/tmp/vqa/shots`; the best 13 are in `/tmp/vqa/final`. This is Chromium emulation, not Safari: safe-area insets are 0 in the run, `backdrop-filter` and `color-mix` rendering can differ.

Verdict: **PASS WITH FIXES**. The direction is delivered: calm hierarchy, one hero action on Home, readable Arabic type, consistent row cards, dark-mode parity, no horizontal overflow on any screen at any width, no tap target under 44px (measured), focus ring visible on every tabbed element, and the Home screen fits at 375x667 and 390x844 without scrolling. Seven defects are visible regressions, and one fails WCAG contrast. The root cause of most of them is the same: V1 `legacy` rules that V2 does not reset.

## Root cause pattern
V2 lives in `@layer screens/components`; the V1 rules in `@layer legacy` still apply for every property V2 does not set again (box size, border, `direction`, `position`, `transform`, `@media (max-width)` blocks). Each blocker below is a legacy property surviving. Beyond the fixes listed, grep legacy for `inline-size|block-size|border-radius: 50%|direction: ltr|position: absolute` on the classes V2 restyled.

## Required fixes (ranked)

### B1 blocker. Competency detail: active tab text unreadable (1.79:1)
Screen: `#/competencies/C1`, all themes except dark. Seen in `02_competency_C1_tabs_contrast_bug_390.png`. Measured: `button.active` colour `rgb(18,48,45)` on `rgb(15,91,87)`. The tabs are `div.competency-tabs.focus-tabs`, not `.segmented`; legacy `.focus-tabs button.active {color:#fff}` loses to the `base` layer `button` colour.
Fix (screens layer, near line 3511 of styles.css):
```css
.competency-tabs > button { min-block-size: 44px; border: 0; border-radius: 10px; background: transparent; color: var(--ink-2); font: 700 var(--fs-small)/1.2 var(--font); }
.competency-tabs > button.active { background: var(--surface); color: var(--brand-text); box-shadow: var(--e-1); outline: 1.5px solid var(--brand-text); outline-offset: -1.5px; }
```
(Selected state keeps a non-colour cue: outline.)

### B2 blocker. Practice A5 deck cards: text crushed into a 50px column
`#/practice/a5`, 375/390/430. Seen in `03_practice_a5_deck_cards_broken_390.png` ("STA/R-L", "الكفاء/ات/الثمان/ية", "5 بطاق…"). `a.preparation-card.practice-deck` has no icon badge, so `.unit-copy` falls in the legacy 50px column (`grid-template-columns: 50px minmax(0,1fr) auto 18px` at max-width 380px; 40px column elsewhere).
Fix: `.practice-deck { grid-template-columns: minmax(0, 1fr) auto; } .practice-deck .unit-copy p { display: block; -webkit-line-clamp: unset; }`

### B3 blocker. Session summary hero ring clipped and broken
`#/simulation` after "إنهاء وعرض الملخص". Seen in `11_session_summary_ring_bug_390.png`. Legacy `.session-average {inline-size:116px (96px on phones); block-size; border:12px solid; border-radius:50%}` still applies around the new 112px ring (`strong`), so a second pale circle appears, the ring overflows the card and is cut by legacy `.aggregate-hero {overflow:hidden}`, and "%" wraps under "85".
Fix:
```css
.session-average { inline-size: auto; block-size: auto; border: 0; border-radius: 0; align-self: center; }
.session-average strong { display: flex; align-items: baseline; justify-content: center; gap: 2px; white-space: nowrap; }
.aggregate-hero { overflow: visible; }
```

### M1 major. Score pills wrap "%" onto a second line (summary rows, reports list)
`.session-result-score` (legacy 44x44 circle) and `.session-history-score` (legacy 58x58 with 7px ring border) in `11_session_summary...`, `12_reports_list...`. Fix:
```css
.session-result-score, .session-history-score { inline-size: auto; block-size: auto; min-inline-size: 56px; border: 0; display: inline-flex; justify-content: center; white-space: nowrap; }
```
Also `.session-history-stat:first-child { grid-column: auto; }` (legacy 480px rule makes the first of three tiles span the whole row and leaves a hole beside the other two; see `12_reports_list_stats_grid_bug_390.png`).

### M2 major. Competency detail hero: bookmark button sits on top of the symbol badge
`.competency-focus-hero .competency-bookmark {inset-inline-start:12px}` is the start (right in RTL) where the badge is. Spec puts it at the end. Fix: `inset-inline-start: auto; inset-inline-end: 12px;`. Same override for `.competency-smart-dashboard .competency-bookmark`.

### M3 major. Question hub rows: chevron drawn on top of the icon badge
`#/questions`, `.question-hub-option-arrow` keeps legacy `position:absolute; inset-inline-start:11px; inset-block-end:8px`. Seen in `05_question_hub_chevron_bug_390.png` (clipped "(" shapes at bottom-right of each badge). Fix: `.question-hub-option-arrow { position: static; inset: auto; }` and put it in grid column 3.

### M4 major. Contrast failures (computed, all text nodes, 3 themes)
- `--brand-text #0E7C73` on `--brand-tint #E1F0EC` = 4.31:1 (needs 4.5): selected mode card title and "2–4 دقائق", active stepper label "السؤال", self-intro group number, lesson hero kicker. Spec claimed 4.98 on surface only. Fix: `--brand-text: #0B6B63` (6.26 on surface, 5.42 on tint, 4.81 on tint-2). Check navy/sage accents the same way.
- Dark home hero kicker `.home-start-kicker` `#F0D49C` on `#17786F` = 3.69:1. Fix: `[data-theme="dark"] .home-start-kicker { color: #fff; }` or darken dark `--brand` fill used there to `#0E5A53`.
- Dark deck type tag (`.tag` blue tone) `#17786F` on `#14283A` = 2.83:1. Fix: use `--brand-text` for tag text in dark.
- Selected mode radio dot `.mode-radio` flagged 1.56:1; it is visually hidden (font-size 0), the check circle is the cue. Ignore.

### M5 major. Answering screen: the textarea is below the fold
`simulation?question=...&answer=text`, 390x844 and worse at 375x667 (`08_answering_text_textarea_below_fold_390.png`). Above the field: page head, question card (5 lines at 24px), answer-mode segmented, privacy notice. The primary input starts at y=1365 of 1688 (css 683 of 844) and the sticky bar covers its label. Fix options (keep content): hide the page-head `h1`/lead on this route (`body[data-page="simulation"] .simulation-answer-page > .page-head{display:none}`), move `.simulation-answer-switch` and the privacy line below the textarea, or clamp the question card with a "عرض كامل" expander. Target: textarea label visible within the first 560px.

### M6 major. Question focus screen: duplicated header and heavy nesting
- The app header ("سؤال تدريبي" plus back chevron) and the in-page row (X, kicker, "سؤال تدريبي", bookmark) repeat the same title and two exit buttons. Costs 92px of 667 at 375x667. Fix: hide the in-page `strong` that repeats the route title, or hide `.app-header` when `body[data-page="question"]`.
- Model answer: card in card in card in badge column leaves about 230px of text width (about 22 Arabic characters per line, `06_question_focus_model_answer_390.png`). Fix: `.focus-answer-part { grid-template-columns: 1fr; }` with the arch badge and title in one row, and drop the middle container border/background.
- `.question-step` done steps show a plain filled number; spec says a check glyph for done. Minor.

### M7 major. Keyboard focus can be hidden under sticky bars
Tabbing on `/simulation`, `/settings`, `/competencies/C1`: focused select/inputs/summaries land at y 770 to 1077 (under the 64px bottom nav and the 104px action bar). No `scroll-padding` exists in the stylesheet. Fix:
```css
html { scroll-padding-block-start: calc(var(--header-h) + env(safe-area-inset-top) + 8px); scroll-padding-block-end: calc(var(--nav-h) + env(safe-area-inset-bottom) + 112px); }
```

### M8 major. Action-share marker label in the wrong place (RTL)
Per-answer report, "نصيب الإجراء من إجابتك". The marker line is correctly at 70% from the start, the "70" label is under the 30% position. Legacy `.action-share-marker-label {direction: ltr; transform: translateX(50%); inset-block-start: 100%}` flips the logical inset to physical left and doubles the shift. Fix: `.action-share-marker-label { direction: inherit; unicode-bidi: isolate; transform: none; inset-block-start: auto; }`.

## Minor
1. Practice feedback wrong/right (A2, A3, A5): the primary "السؤال التالي" ends up partly under the bottom nav after answering, and feedback is not scrolled into view at 375x667. Call `scrollIntoView({block:'nearest'})` on the feedback or add `scroll-margin-block-end`.
2. Disabled buttons have no helper line (spec 5): privacy gate "فهمت، متابعة" and answer "إرسال الإجابة للتقييم" are dashed with no "أكّد التنبيه للمتابعة" / "اكتب إجابتك أولًا". Add `<small id=… class="hint">` plus `aria-describedby`.
3. Sticky `.simulation-start` / submit bar has no backing panel; content is visible around the button. Add the spec `.action-bar` background (`color-mix(in srgb, var(--bg) 88%, transparent)`, `backdrop-filter: blur(12px)`, `padding: var(--s-3)`, `border-radius: var(--r-lg)`). The privacy gate actions and self-intro action are not sticky as specified.
4. Evidence quote text in the criteria feedback is 11.5px (`q`) and mini score `%` 11.8px: below the 13px floor. Set `.evidence-quotes q, .mini-score … { font-size: var(--fs-caption) }`. Home ring caption "0/5" is 9.1px (`.home-path-card span`): set 12px.
5. Report actions: three secondary buttons in a 2-column grid leave an orphan half-width button. `.report-actions .button:last-of-type:nth-child(odd) { grid-column: 1 / -1 }`.
6. Mock-only: coverage quotes use `”…“` (closing then opening); in RTL use `«…»`.
7. Question focus: scenario notice icon circle touches the notice heading (gap about 0). Add `gap: var(--s-3)` / padding-inline-end. Meta tags are 50px tall bubbles (spec 28px).
8. 404 (`app.js` markup) lacks the arch badge, description and ghost link in spec 18; reports empty state lacks the 72px badge; practice hub page shows the link "كل التمارين" pointing to itself.
9. Deck: primary "فتح السؤال" is about 270px wide, not full width; the kicker and the 24px question text are centred (use `text-align: start` for reading). Filter chips wrap to 2 rows instead of scrolling (acceptable).
10. Voice mode: `.record-start` is a full-width button, not the 72px round mic button; the empty "راجع التفريغ وصححه" card shows before any transcript.
11. Header `#route-title` repeats the `h1` at 17px bold ink (spec: 15px muted when equal), so two similar titles stack on Settings, Self-intro, Reports.
12. Competency tile 4 uses a pink tint with a red icon; it reads like the "weak" band. Swap the 4th tint for `--sand-soft`/lilac per spec.
13. At large font, notice paragraphs inherit the reading line-height 1.85 (about 36px lines at 19px). Use `--lh-ui` inside `.notice`.
14. Preparation hub: lesson cards still show icon badge plus "1." in the title; spec wanted the number in the arch badge and a progress strip. The "مسارك المقترح" chip row wraps to 3 rows at 390.

## Checked and passing
- RTL: back chevron points right (start), row chevrons point left (forward), deck prev/next mirrored correctly, progress bars fill from the right (A2, A3, per-answer breakdown, competency list), steppers run 1 to 4 right to left, Latin tokens (SEAL, STAR-L, PDF) stay intact inside Arabic lines, numerals Western everywhere.
- Layout: no horizontal overflow (measured 0 on 26 routes x 3 widths), no small tap targets (the only hit is the visually hidden file input), last content clears the bottom nav by 24px, Home needs no scroll at 667 and 844.
- Dark mode: 16 dark routes were captured at 390 and contrast-measured on 15; I opened Home, Preparation and Competency C1 in dark. Parity there is good; only two contrast misses (M4). Dark answering, report and summary were not opened.
- Large font (settings control works, `data-font-size="large"`): no overflow on Home, Prep, Simulation, C1, Question focus, A2; Home scrolls as designed.
- AI waiting state: arch badge, hint, elapsed seconds, cancel and a sliding indeterminate bar, no fake progress. Card appears below the unhidden form instead of replacing it (spec 11), acceptable but the form should be hidden to cut the scroll.
- Per-answer report order matches spec; score hero ring reads well; coverage chips use check glyph plus text; weak/medium/strong bands use icon plus word.

## Not verified
Real Safari rendering, safe-area insets (0 in headless), real microphone recording and permission-denied states, `prefers-reduced-motion`, high-contrast and accent presets (navy, sage), print layout, a failed AI evaluation (error state), offline state. Screenshots of 375 and 430 widths were taken for all routes but only about 10 were opened one by one; the layout bugs above reproduce at all three widths because they come from shared CSS.
