# V2 Implementation Plan (for the software-engineer)

Owner of this plan: ui-ux-designer. Work on a dedicated development branch. `work/dist/css/styles.css`, `index.html`, `config.js`, `sw.js` and tests are protected: unlock only the specific file, per `.claude/agent-team/protected-paths.txt`. Set `.claude/agent-team/scope.json` to the files named below before delegating.

## 0. Caveats on this spec
- Screens were specified from V1 screenshots and renderer code. Class names mentioned in screens.md that I could not confirm in code (for example `.session-comparison` inside the session summary, `.question-hub-continue` resume behavior, the lock behavior of the "المثال" step) must be checked against the renderer; where the element or logic does not exist, skip that detail and do not add behavior. Never change learning content, scoring, answer keys, rubrics or strings that tests assert.
- No screenshot of a finished report exists in the baseline; capture one with the harness journeys before and after.

## 1. Order of work and branches of risk
1. Tokens + shell (css) 2. Contract layer (css) 3. Components (css) 4. Screens (css) 5. Targeted markup (js) 6. Dark/RTL/reduced-motion pass 7. Print check 8. Harness + tests. Ship each step as its own commit so QA can bisect.

## 2. CSS contract: strings tests assert (must remain verbatim)
Cascade layers beat specificity: a later layer always wins. So the contract has two blocks. `contract-base` (first layer) holds the one rule whose V1 value is unacceptable and must be overridden later. `contract-final` (last layer before `print`) holds rules that must really apply as written.
```css
@layer contract-base {
  .home-disclaimer p { font-size: .64rem; }              /* test needs this string; overridden to 13px in the components layer */
}
@layer contract-final {
  .header-inner { direction: rtl; }
  .back-button svg { transform: none !important; }
  body[data-page="question"] .bottom-nav { display: none; }
  .bottom-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  html:not([data-font-size="large"]) body[data-page="home"] { overflow: hidden; }
  .home-start-copy strong { font-size: 1.04rem; }
  .home-start-card.simulation .home-start-copy strong { font-size: 1.22rem; }
  .home-report-icon { display: grid; place-content: center; }
  mark.example-added { background: var(--warning-soft); font-style: italic; font-weight: 700; }
  .training-disclaimer, .privacy-reminder, .simulation-privacy-page, .intro-question-group, .home-start-card.self-intro {}
  .question-hub-hero, .question-hub-options, .question-deck-card, .question-deck-stack, .question-deck-swipe-hint {}
}
```
Notes: (a) The test `html:not([data-font-size="large"]) body[data-page="home"]\s*\{\s*overflow:\s*hidden;` requires `overflow: hidden;` to be the first declaration of that rule; keep the rule above exact, and put additional declarations in later layers. (b) The regex for `mark.example-added` is `\{[^}]*background:[^}]*font-style: italic[^}]*font-weight: 700`, so declaration order must be background, then font-style, then font-weight. (c) `.back-button svg` rule is `transform: none !important`, keep verbatim. (d) The empty selector rules are only there so the substring checks find `.training-disclaimer`, etc.; real styling lives in later layers. (e) Also assert after the rewrite: `body.book-printing > *:not(#print-book-root)` exists, `.print-question-page` has no `break-before: page`, and `.print-question-prep` has `grid-template-columns`; copy the **entire V1 print section verbatim** (all `@media print` blocks and `.print-*` rules, plus the `body.book-printing` rules) into the last layer `print`, unchanged. Verify by diffing `@media print` blocks between V1 and V2 files.
(f) `index.html` must still contain `styles.css?v=0.6.0-alpha-10` and the same `app.js` query while the approved tests are unchanged. See section 8 for the PWA cache implication.

## 3. CSS architecture (`work/dist/css/styles.css`, full rewrite, target about 1500 lines)
Single file (no build step, SW precache unchanged). Cascade layers (Safari 15.4+; iOS 16+ assumed):
```css
@layer contract-base, reset, tokens, base, layout, components, screens, themes, utilities, contract-final, print;
```
Sections and approximate sizes:
| Layer | Content | Lines |
|---|---|---|
| contract-base / contract-final | section 2 blocks | 30 |
| reset | box-sizing, margins, `button,input,select,textarea { font: inherit }`, tap highlight, `[hidden] { display: none !important }`, images | 40 |
| tokens | DS sections 1 to 4 (`:root`, `[data-theme="dark"]`, accent, contrast, fonts, scale); `@font-face` x2 (same files, same family name "Coach Arabic") | 160 |
| base | body, headings, links, `.sr-only`, `.skip-link`, focus ring, selection, `::placeholder`, safe areas | 80 |
| layout | `.app-header`, `.header-inner`, `.app-main`, `.bottom-nav`, `.toast-region`, `.page-head`, `.section-block`, grids, `.action-bar` rules for the named containers, `body[data-page=...]` rules | 160 |
| components | `.button`, `.icon-button`, `.card`, row/tile/featured tiers, `.tag`, `.notice`, `.segmented`, accordions, progress, ring, forms, dialog, toast, skeleton, `.loader`, tables `.source-table.stacked`, `.key-point` | 400 |
| screens | home, preparation/lesson, competencies, question focus, questions hub/deck, simulation (setup, privacy, answer, voice, waiting), report (score, criteria, coverage, comparison, session), reports list, self-intro, settings, coverage, tools, 404 | 550 |
| themes | dark overrides that cannot be expressed through tokens (hero overlay, shadows), `[data-contrast="high"]`, `[data-motion="reduced"]`, `@media (prefers-reduced-motion: reduce)` | 40 |
| utilities | `.no-print`, `.print-only { display:none }`, `.muted`, `.stack` | 15 |
| print | V1 print rules, verbatim | as V1 (about 600; not counted above) |
Rules of engagement: no `!important` except the contract `transform: none`, `[hidden]`, reduced motion and print; use logical properties only (`margin-inline`, `padding-block`, `inset-inline-start`, `inline-size`, `border-inline-start`, `text-align: start`); no `left/right/translateX` for layout (the one allowed use: animation of the nav pill via `translate` is not needed; avoid). Mirror directional icons: the nav and chevrons are inline SVG paths or `‹`/`›` characters; the V1 back button uses an SVG path pointing right (correct for RTL) with `transform: none`; keep. Do not mirror play, check, clock, microphone.
Breakpoints (mobile first, min-width): `@media (min-width: 430px)` gutter 20; `(min-width: 768px)` gutter 24, `--content-max: 640px`, nav becomes a floating pill `inline-size: min(560px, 100% - 32px); inset-inline: 0; margin-inline: auto; inset-block-end: 12px; border-radius: var(--r-xl)` (V1 had this at 860px; keep `position: fixed`); `(min-width: 1024px)` `--content-max: 720px`, question/deck stays single column. Height queries: `@media (max-height: 720px)` home compaction per screens.md. No `max-width` queries except `(max-width: 359px)` gutter 14 and tile columns to 1 for `.simulation-mode-grid` only if text overflows (verify at 320px).
Font loading: keep the two `@font-face` rules with `font-display: swap`; add `<link rel="preload" as="font" type="font/ttf" crossorigin href="assets/fonts/NotoSansArabic-Regular.ttf">` in `index.html` (tiny change; allowed because the file is already unlocked for the meta changes below).

## 4. File-by-file instructions

### 4.1 `work/dist/css/styles.css`
Rewrite per section 3. Class inventory to style: every class in `/tmp/v2-evidence/harness-selectors.txt` plus all classes emitted by the renderers (`grep -o "class: *[\`'][^\`']*" work/dist/js/*.js`). Anything unstyled falls back to base. Acceptance in section 7.

### 4.2 `work/dist/index.html` (unlock, minimal)
- Two theme-color metas: `<meta name="theme-color" content="#F7F3EA" media="(prefers-color-scheme: light)">` and `...content="#0A1A1C" media="(prefers-color-scheme: dark)"` replacing the single teal one (app.js still overrides it per chosen theme, see 4.3).
- `apple-mobile-web-app-status-bar-style` stays `black-translucent`; header handles the safe-area top padding, so the status bar area shows the header surface.
- Add the font preload link. Do not change the `styles.css?v=` or `app.js?v=` strings (tests), do not change the back button SVG path (tests: `<path d="m9 18 6-6-6-6"`).
- Add `<dialog>` markup unchanged. Keep the 5 `.bottom-nav a[data-nav]` items; replace nothing in their text. Optional: wrap each nav icon in nothing; the active pill is a pseudo-element.

### 4.3 `work/dist/js/app.js`
- `applyTheme()` meta color values: `dark` -> `#0A1A1C`, `cream` -> `#F7F3EA`, `light` -> `#FFFFFF`.
- In the nav active toggle (line about 96) add `link.setAttribute('aria-current', link.dataset.nav === active ? 'page' : 'false')` or remove the attribute when inactive.
- First run only (no `lic:theme` saved): `applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'cream')`. This changes default behavior: **needs user decision** (see report).
- Do not change routing, titles or `#back-button` logic. Optional (needs decision): add `document.body.dataset.root = isTabRoot ? 'true' : 'false'` so CSS can hide the back button on tab roots (`body[data-root="true"] #back-button { visibility: hidden }`, keeping layout space and DOM). The harness NO-BACK check applies to inner pages only; run it before deciding.

### 4.4 `work/dist/js/ui.js`
- `toast(message, duration, kind)`: add optional third arg that adds `toast ${kind}` class (`success|error`) and sets `role="alert"` for error; default behavior unchanged.
- `notice()`: no signature change; callers keep passing glyph strings. Add class `notice-icon` to the `strong` (CSS target) while keeping `aria-hidden`.
- `button()`: no change. Add helper `export function setBusy(btn, on)` that toggles `.is-loading` and `aria-busy` (used in simulation/self-intro submit).
- Do not touch icon paths except to add three new icons if needed: `lock` (`M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z`), `check` (`m5 12 4 4L19 6`, exists as `readiness`), `warning` (`M12 3 2 20h20L12 3Zm0 6v5m0 3h.01`).

### 4.5 `work/dist/js/home.js`
- `h2#home-start-title`: add class `sr-only` (still rendered, harness-safe).
- `startCard()`: no structural change (class `home-start-card ${kind}`, `.home-start-icon`, `.home-start-copy`, `.home-start-arrow`). Keep the `aria-label`.
- `home-path-card`: keep structure; add `<small class="path-caption">` with the existing `done/total` text inside `.home-path-copy` (currently only inside the ring) so the ring can be small. Do not remove the ring's `strong` and `span`.
- `home-report-card`: no change. The V1 `'‹'` arrows stay.
- Footer markup unchanged.

### 4.6 `work/dist/js/learn.js`
- Preparation hub: add `data-ready="true"` on the `.preparation-grid` when `completed.size > 0` (to feature the Questions card per screens.md, CSS-only afterward). Do not reorder DOM.
- Accordion chevron elements keep class `accordion-chevron`; the V1 text `⌄` remains but is rendered as an SVG mask in CSS (`font-size: 0` plus `mask`), or simply styled as text at 20px; either is acceptable.
- No text or content changes.

### 4.7 `work/dist/js/competencies.js`
- Competency cards: nothing in JS. `.card-chevron` hidden by CSS.
- Question focus: add `aria-pressed` to `.question-focus-bookmark` and `.competency-bookmark` buttons (state mirrors the `active` class). Add `aria-current="step"` to the current `.question-step`.
- If the locked-step state is derived from `.answer-gate`, add `data-locked="true"` on the step button for styling; do not change gating logic.

### 4.8 `work/dist/js/questions.js`
- Deck: add `aria-pressed` on mastered/bookmark buttons; wrap the position counter in `<bdi>`; no logic change. The stats tiles (`.question-deck-stats`) stay in the DOM; CSS lays them out as a single caption row (`display: flex; gap: 12px` with tile backgrounds removed).

### 4.9 `work/dist/js/simulation.js`
- Setup: set `aria-pressed` on `.simulation-answer-switch` buttons and `aria-checked` on `.mode-radio` wrapper via existing change handlers (no logic change). Wrap `.simulation-start` and its helper in a `div.action-bar` ONLY if the CSS cannot target the existing parent; prefer styling the existing container (`.simulation-start` parent) as sticky. Harness clicks `.simulation-start`; sticky does not break clicks but check overlap with the nav at 390x664.
- Privacy gate: no markup change; CSS handles tone. Replace any `notice(..., 'danger', ...)` used for the privacy text with `'warning'` ONLY if the gate uses `notice()`; if it uses `.simulation-privacy-card` the class styling suffices. Do not change the strings.
- Answer screen: add `<small class="answer-count" aria-live="off">` under the textarea updated on `input` (word count via `value.trim().split(/\s+/).filter(Boolean).length`); informational only. Wrap the SEAL/STAR-L reminder strip (`.training-method-reminder` neighbor) in `<details class="method-fold" open>`; closed by default when `localStorage 'lic:answers-count' > 0` is NOT required; simply keep it open (YAGNI) unless the 664px screenshot shows the submit bar overlapping; then default closed.
- AI waiting (`.card.ai-working`): extend markup in both places (simulation.js line ~85 and report.js line ~377): `el('span', {class:'ai-working-badge','aria-hidden':'true'}, icon('reports'))` before the loader (CSS hides `.loader` inside `.ai-working`), keep `strong` and `small`; the indeterminate bar is `::after`. Keep `.slow-notice` text. Apply `setBusy(submit, true)` and release in the existing `finally`.
- Voice: ensure `.record-start` and `.record-stop` keep their text; add visible text status "جارٍ التسجيل" inside `.recording-state` if not already present (it exists as class; verify), do not change recording logic.

### 4.10 `work/dist/js/report.js`
- `renderScoreCard`: add `style: { '--p': String(percent) }` on `.final-score` (via `el`'s `style` support for custom properties); move `role="progressbar"` + aria values onto `.score-track` as now (CSS hides it visually); keep the strings. Add class `score-ring` to `.final-score` (extra class; keep `final-score`). For untrusted keep `.final-score` text "بلا درجة".
- `renderEvaluationReport` order inside `.print-page-one`: `renderNextPlan(report)`, `renderStrengths(report)`, `renderBreakdown(report, question)`, `renderAnswerAsEvaluated(...)`. This changes print order of the first print page; QA must compare the PDF/print output; if the print structure test fails, keep DOM order and use CSS `order` on `.print-page-one` children (`display: flex; flex-direction: column` in screen media only), which leaves print untouched. **Prefer the CSS `order` method**, no JS change.
- Actions: no markup change. CSS: `.report-actions` grid per screens.md; first non-variant `.button` gets `order:-1; grid-column: 1 / -1`.
- `renderSessionSummary`: no change to strings or order; CSS handles ring on `.session-average` with `--p` custom property: add `style: { '--p': average }` to `.session-average` (when average != null).
- Replace `'▣'` glyph? That is in `sessions.js` (4.11).

### 4.11 `work/dist/js/sessions.js`
- Line 48: replace icon argument `'▣'` with `'ⓘ'` (same function signature) so the notice icon renders a recognizable glyph in every font; or pass `''` and let CSS draw the shield by `.notice::before` for the privacy case. Strings unchanged.

### 4.12 `work/dist/js/settings.js`
- Line ~45: `settingsItem(..., open = false)`: ensure the appearance item is called with `open=false` (V1 opened it). This is a UI default, not content.
- `preferenceGroup()`: for the theme group add a `data-swatch` attribute to each button (`cream|light|dark`) so CSS can paint swatches; keep button text and values. Add `aria-pressed` to every preference button.
- Add preview line under font size group only if trivial (`el('p', {class:'font-preview', text:'نموذج نص عربي'})`), otherwise skip.

### 4.13 `work/dist/js/self-intro.js`
- No logic changes. Merge the three notices only in CSS (hide the duplicate bottom notice with `.intro-builder-card ~ .notice { display:none }` ONLY if its text equals the earlier one; otherwise leave). Make the "إنشاء المسودة" button container (`.button-row`) sticky via CSS.

### 4.14 Other JS (`tools.js`, `search.js`, `coverage.js`, `quick-review.js`, `print-book.js`)
- `tools.js` uses `'▣'` as an icon argument for `toolCard`; replace with `'ⓘ'`/an existing `icon()` name only if the CSS cannot hide it; leave if unclear.
- `print-book.js`, `scoring-rules.js`, `evaluate-client.js`, `recorder.js`, `storage.js`, `data.js`, `rotation.js`, `session-plan.js`, `retry-plan.js`, `guidance.js`, `wake-lock.js`: DO NOT TOUCH.

### 4.15 `work/dist/sw.js`, `work/dist/manifest.webmanifest`
- No change in step 1. See section 8 (cache version) and set `background_color` `#F7F3EA`, `theme_color` `#0F5B57` unchanged (manifest `theme_color` stays teal because it colors the app-switcher; optional change needs user decision).

## 5. Responsive and RTL rules for implementers
- Test at 360, 375, 390, 430 px and 320 px minimum; no horizontal page scroll (`html, body { overflow-x: clip }` is acceptable as a safety net but fix the cause).
- Arabic text: never set `letter-spacing`; `line-height` as tokens; no `text-transform`; headings `text-wrap: balance`; do not clamp body copy more than described.
- Mixed text: wrap Latin tokens and numbers in `<bdi>` where renderers do not (`<bdi>` already used for scores). CSS `unicode-bidi: isolate` on `.tag`, `.question-id`, `.final-score`, `.timer-display`.
- Fixed bottom elements must account for `env(safe-area-inset-bottom)`; `viewport-fit=cover` is already set.
- Hover styles inside `@media (hover: hover)` only.

## 6. Accessibility checklist for the build
- Focus ring visible on every control, in both themes and on brand fills.
- Each icon-only button has an `aria-label` (V1 has them; keep).
- Selected states have a non-color cue (check glyph, border width, or text).
- Score bands have icon + word. Charts/rings have text equivalents (percent in text; ring `aria-hidden`, progressbar on the track).
- `prefers-reduced-motion` and `[data-motion="reduced"]` kill all animations including ring fill, skeleton, wave, pulse, page enter.
- Targets >= 44x44 (visually and hit area), spacing >= 8px between adjacent targets.
- Inputs 16px font. Labels programmatically associated.
- `lang="ar"` on root; English tokens inside `<bdi>`.
- Dialog: focus trapped by `<dialog>`, close button 44px, Esc works.

## 7. Acceptance criteria (QA runs these)
Automated (existing, must stay green):
1. `cd work && npm test` passes unchanged (tests are not edited).
2. Harness `ui-sweep.mjs` and `journeys.mjs` (with `OUT=/tmp/...`): `acceptanceFailures` is `[]` for light and dark: no NULL-TEXT, H-OVERFLOW, SMALL-TARGET, CLIPPED, NO-BACK, NAV, HOME-SCROLL, PER-QUESTION-EXPORT, QUESTION-RETURN-FAIL, PRIVACY-GATE-MISSING/ENABLED. `.bottom-nav` computed position is `fixed`.
3. All selectors in `harness-selectors.txt` resolve and are visible where V1 had them visible.
Visual and measured (QA/designer, iPhone widths 375/390/430, light and dark, RTL):
4. Home fits without scroll at 390x844 and 390x664, nothing clipped behind the nav; hero text contrast >= 4.5:1 sampled at text position.
5. Nav labels >= 12px; item width >= 64px at 320px; 5 items; active item has pill + `aria-current`.
6. Simulation setup: `.simulation-start` visible without scrolling on a 390x844 viewport at load (sticky bar), 4 mode cards visible in first screenful below the head.
7. Per-answer report: the primary action is the first button in `.report-actions`; score ring shows percent in text; badge has icon + word; next-plan precedes breakdown in reading order on screen (check visual order and that print preview is unchanged).
8. Segmented, chips, toggles, icon buttons >= 44px (measure with the sweep SMALL-TARGET rule).
9. Contrast: text pairs from design-system.md measured in browser; body >= 4.5:1, large text and UI parts >= 3:1; dark mode checked on tinted cards.
10. Reduced motion: with the OS setting or `data-motion="reduced"`, no running animations (`document.getAnimations().length === 0` on idle screens).
11. Font settings: `data-font-size="large"` does not overflow horizontally on any screen; home then scrolls (allowed by contract).
12. Print: print-book export and single report PDF identical in structure to V1 (compare page counts for one lesson and one report).
13. Console: no errors on any route; no external network requests (fonts and images local).
14. Latency: tap feedback (pressed state) within one frame; `measure-interaction.mjs` on `.simulation-start` and answer submit shows no regression versus V1 (blur filters limited to header and nav only; if scrolling jank appears on a real device, drop `backdrop-filter` and use solid `--surface`).

## 8. Release notes for the Orchestrator (decisions, not for the engineer to guess)
- Version/cache: tests pin `0.6.0-alpha-10` and the SW cache name `leadership-interview-coach-v0.6.0-alpha-10.2-51d413de`. A purely visual CSS change under the same cache name risks returning PWA users staying on V1 CSS until the SW updates. Options: (a) user approves a test update plus a version/cache bump (recommended), or (b) ship under the same strings and accept stale styles for some users. This is a user decision.
- Deployment is out of scope; no deploy/merge by agents.
- Optional font weights (variable Noto Sans Arabic) require adding a font file to `work/dist/assets/fonts/` and to the SW precache list; deferred.

## 9. Suggested verification loop for the engineer
`cd work && npm test`, serve `work/dist` locally, run the harness with `OUT=/tmp/v2-out`, then `node .claude/agent-team/visual-check.mjs http://localhost:PORT/#/home --devices "iPhone SE (3rd gen),iPhone 13,iPhone 15 Pro Max" --dir rtl` (and `--dark`) for every route in `/tmp/v1-baseline` file names, and hand the screenshots to the ui-ux-designer for visual QA.
