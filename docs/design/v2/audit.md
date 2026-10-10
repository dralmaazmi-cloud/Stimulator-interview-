# V1 UI Audit (Leadership Interview Coach)

Method: I opened the real baseline screenshots in `/tmp/v1-baseline/` (iPhone 14 emulation, 3x, light and dark) and read `index.html`, `css/styles.css` (3428 lines), `home.js`, `ui.js`, parts of `report.js`, `simulation.js`, `settings.js`, `app.js`. Screenshots I actually opened: light home, preparation, preparation_U1, competencies, competencies_C1, question_C1-S1, questions_view_deck, simulation, simulation answer text (training), simulation answer voice (privacy gate), reports, self-intro, settings, nope (404); dark home. Not opened individually: the remaining dark variants, tools, coverage and the other question variants (assumed same shell; findings on them are inferred from CSS, not seen). No screenshot of a finished per-answer report or session report exists in the baseline, so those findings come from reading `report.js` markup only (marked "code-read").
Limitation: Chromium emulation, not Safari. Full-page shots show the fixed bottom nav mid-page; that is an artifact and is ignored here.
Severity: P0 blocks the redesign goal or accessibility, P1 major, P2 polish.

## A. Global and structural

| # | Sev | Finding | Evidence | V2 answer |
|---|-----|---------|----------|-----------|
| G1 | P1 | Heavy chrome: a 76px solid teal header band on every inner page plus a solid teal 72px+ rounded nav block. About 150px of dark paint frames every screen, and the page title is repeated (header title and the page `h1`, e.g. "الكفاءات الثمانية" twice). | light-__competencies, light-__reports, light-__questions_view_deck | Light, translucent 52px header; light floating-style nav; one title per page. |
| G2 | P1 | Bottom-nav labels are tiny: `.64rem` default, `.59rem` at <=640px short, `.53rem` at <=380px (about 8.5 to 10px). Below readability for Arabic. | styles.css lines 1740, 2109, 2133 | Labels 12px minimum, 5 columns of >=72px at 360px width. |
| G3 | P1 | Visual hierarchy is flat: every item is the same white bordered card with a tinted icon circle (preparation list, competencies grid, home cards, settings accordions, tools). Nothing says "do this first". | light-__preparation (6 identical cards), light-__competencies | One primary action per screen, tiered card types (hero, row, tile, quiet). |
| G4 | P1 | CSS is layered patches: four `:root` blocks (lines 17, 1403, 1581, 2388), 50 `!important`, 1557 selectors, 3428 lines, repeated redefinitions of `.bottom-nav`, `.app-main`, `.segmented`. Any change fights earlier rules. | grep of styles.css | Rewrite with cascade layers, one token set. |
| G5 | P1 | Dark theme is navy (`#071727`) while the brand is petrol/teal, so dark mode feels like another product; card chevrons and icon tints nearly vanish. | dark-__home: chevrons in rows 2 and 3 at about 1.5:1 | Petrol-black dark palette, accent lifted to `#5CC4B4`. |
| G6 | P2 | The app does not follow the system color scheme on first run; `data-theme` defaults to `cream`. | app.js `applyTheme` | First run: use `prefers-color-scheme` when no saved choice. |
| G7 | P1 | Segmented controls are 40px high (`.segmented button { min-height: 40px }`), under the 44px target. | styles.css line 775 | 44px minimum; hit area padded. |
| G8 | P2 | Inconsistent vertical rhythm: cards touch with 0 gap in places (reports notice card abuts the coverage card), others have 20px+. | light-__reports around y=850 of 2000 | One spacing scale; sections separated by 16/24/32 only. |
| G9 | P1 | Back button is shown on tab root pages (reports, simulation, settings), where it has no useful meaning, and also on 404. | light-__reports, light-__nope | Keep `#back-button` for inner pages; on tab roots hide it visually with a CSS rule keyed on `body[data-page]`, not by removing the element (harness needs it on inner pages). Needs decision, see implementation plan. |
| G10 | P2 | Toast is dark teal with a small shadow and sits above the nav with a hard-coded offset; no variant for error or success. | styles.css line 684 | Tokenized toast with icon and 3 tones. |
| G11 | P2 | Focus indication is mostly a background change (`.button:focus-visible { background }`); no consistent ring. 11 `focus-visible` rules in 3428 lines. | grep | 2px ring plus 2px offset on every interactive element. |

## B. Screens

| # | Screen | Sev | Finding | Evidence |
|---|--------|-----|---------|----------|
| H1 | Home | P1 | Hero white title and subtitle sit over the bright sunset sky with only a faint overlay; the subtitle is white on pale sea, contrast not guaranteed. | light-__home top |
| H2 | Home | P1 | Five stacked blocks (3 start cards, path card, last-report card) of near-equal weight; the primary action ("ابدأ المحاكاة") is only slightly stronger than the others. The "مسارك التدريبي" card shows a 0% ring plus three decorative icons that are not tappable and carry no state. | light-__home |
| H3 | Home | P1 | Disclaimer line "ولا تنسونا من دعائكم" is clipped behind the nav in the 664px-high baseline. The HOME-SCROLL check passes only because `overflow: hidden` is set; content is lost, not fitted. Disclaimer text is `.64rem` (about 10px). | light-__home bottom, dark-__home bottom |
| H4 | Home | P2 | Section label "ابدأ من هنا" adds a row without adding information. | light-__home |
| P1a | Preparation hub | P1 | Six identical cards with numbered titles, four lines of description, no progress or state; the "Questions" card is the only distinguished one but is last. | light-__preparation |
| P1b | Lesson page | P1 | Stepper with four numbered circles has 11px labels; hero card, accordions with icon circles, tip card, 3 buttons stacked. Accordion rows are 56px but the icon circle plus chevron circle double the decoration. "Mark complete" is the same weight as print/PDF. | light-__preparation_U1 |
| C1a | Competencies | P2 | Skyline illustration collides with the eyebrow "التحضير للمقابلة" (text overlaps the drawing). Eight cards with number badge, icon circle, title, count and chevron circle: five decorations for one tap. | light-__competencies top |
| C1b | Competency detail | P1 | Body text is large and readable, but hero + tabs + intro card + accordion = about 560px before the first content; the sand "صياغة أبسط" callout has a heavy start-edge border. | light-__competencies_C1 |
| Q1 | Question focus | P1 | The question text (the single most important element) is 28px/700 for 6 lines; heavy but legible. The stepper takes 160px above it. The sticky action bar covers the start of the next section. | light-__question_C1-S1 |
| Q2 | Question deck | P1 | Card is cut by the first scroll; progress bar line and bookmark share a row; "فتح السؤال" and "السابق" both full-size; stats tiles at the bottom (70 / 0) repeat the progress. Swipe hint plus two arrow buttons plus two action buttons = four ways to move. | light-__questions_view_deck |
| S1 | Simulation setup | P0 | Primary CTA "ابدأ المحاكاة" is at about 1850px; 4 mode cards, answer-mode switch, competency select, follow-ups toggle, readiness row, privacy notice precede it. The mode radio indicator is a 6px dot (hard to see which is selected beyond the outline). The "المحاكاة جاهزة" strip repeats the readiness row. | light-__simulation |
| S2 | Privacy gate | P1 | Red notice (red icon tile, red text, pink fill) for a routine privacy reminder, which reads as an error. The same amber reminder is repeated at the bottom. The disabled CTA is pale teal at about 2:1. | light-__simulation_question_C1-S1_answer_voice (privacy) |
| S3 | Answering (text) | P1 | The question card scrolls away while writing; the textarea is 560px tall fixed; no length feedback; SEAL helper tiles have 10px captions; disabled submit is washed out; "حفظ والخروج" has the same weight as the submit. | light-__simulation_question_C1-S1_answer_text (training) |
| S4 | AI waiting | P1 | (Code-read) A card with a 36px spinner and one line of text; the slow notice is appended as plain small text. No sense of stages, no way to leave except the page back button. | simulation.js lines 85-93 |
| R1 | Per-answer report | P1 | (Code-read) Order is question, score, breakdown, plan, strengths, answer, action share, criteria, coverage, behaviours, comparison, example, actions: the most actionable section (next plan) is below the numeric breakdown. 6 action buttons in a wrapped row with equal weight. Score is a number plus a flat bar; no band semantics beyond color classes. | report.js lines 110-170 |
| R2 | Session report | P1 | (Code-read) Hero, notice, comparison, aggregate sections, per-question rows, then 5 buttons of equal weight. | report.js lines 620-700 |
| L1 | Reports list | P1 | Header card "سجل الجلسات" duplicates the page title; the privacy notice renders a `▣` text glyph as its icon (sessions.js line 48), which looks like a missing-font box; notice and the coverage row touch with no gap; empty state is a big blank card with the CTA cut by the nav. | light-__reports |
| I1 | Self-intro | P1 | Three stacked banners (guide, warning, hero) before the first input; duration switch, then groups; "إنشاء المسودة" is a small start-aligned button, far from thumb reach; same notice repeated at the bottom. | light-__self-intro |
| T1 | Settings/More | P1 | Shortcut grid is 3 + 1 orphan card; appearance accordion is open by default and runs about 900px (six segmented groups) pushing privacy, data and about out of view; 4 duplicated sub-captions. | light-__settings |
| N1 | 404 | P2 | Bare card with a title and button and no explanation; header still shows the back chevron. | light-__nope |

## C. Accessibility and touch
- Contrast: muted text `#61716f` on `#faf6ee` is 4.75:1 (passes) but only 4.47:1 on tinted cards (`#e4f3ec`, fails); amber label `#c98416` on cream is 2.87:1 (fails 4.5:1) and is used for 12 to 14px kickers ("تجربة عملية", "تصفّح وتدرّب", "التحضير للمقابلة").
- Information carried by color alone: score tones (green/amber/red) have no icon or word besides the badge; the privacy gate uses red alone to signal importance.
- Targets under 44px: segmented buttons (40px). Everything else measured by the V1 sweep passes (acceptanceFailures is empty).
- Motion: a reduced-motion rule exists and `data-motion="reduced"` is supported; keep both.
- Arabic typography: Noto Sans Arabic Regular/Bold only, `line-height` 1.9 body (generous, good), but headings at 700 everywhere flatten hierarchy, and only two weights are shipped.

## D. What is good and must be kept
- Petrol/teal + cream + sand palette family and the Abu Dhabi hero photo.
- Large readable question text, long Arabic line-height (1.8+).
- 4 simulation modes, privacy gate before first answer, training disclaimers (tests assert these strings).
- Bottom nav with exactly 5 destinations; `#back-button` placement on the right in RTL.
- `data-theme` (cream, light, dark), `data-accent`, `data-font-size`, `data-line-space`, `data-contrast`, `data-motion` preference system.

## E. Hard constraints discovered (read before implementing)
1. Tests read `styles.css` as text and assert exact strings and regexes (listed in `implementation-plan.md` section 2). A rewrite must retain them verbatim, inside a `contract` cascade layer that later layers override.
2. `index.html`, `config.js`, `package.json` and `sw.js` versions are asserted by tests (`0.6.0-alpha-10`, SW cache name `...alpha-10.2-51d413de`). Shipping new CSS under the same cache name means returning PWA users may keep the old CSS. A version bump needs the user to approve test updates.
3. The harness selects by class and text; see implementation plan for the preserved list.
