# V2 Design System: "Majlis Editorial"

Direction: calm, premium, editorial. Warm ivory paper, deep petrol ink, one sand-gold accent used sparingly, large well-spaced Arabic type, chrome that disappears so the question and the feedback are the heroes. One memorable device: the **arch** (a UAE-architecture-inspired shape, `border-radius: 999px 999px 14px 14px`) used for icon badges and the score ring cap; plus a **2px sand hairline** on the leading edge of featured cards. No gradients on text, no decorative patterns behind content.

All contrast ratios below were computed with a script against the stated pairs (WCAG relative luminance).

## 1. Color tokens

Theme switch stays `data-theme="cream|light|dark"` on `<html>`. `cream` is the default (ivory). `light` = same tokens with `--bg: #FFFFFF; --bg-sunk: #F3F5F4`. `dark` is the petrol-black set. `data-accent` navy/sage override only `--brand*` (see 1.3). `data-contrast="high"` overrides `--muted`, `--line`.

### 1.1 Light (cream, default)
```css
:root {
  color-scheme: light;
  --bg: #F7F3EA;            /* page */
  --bg-sunk: #EFE9DC;       /* wells, segmented track */
  --surface: #FFFDF8;       /* cards */
  --surface-2: #F2EEE3;     /* quiet cards, inputs disabled */
  --line: #E3DCCB;          /* hairlines on cards */
  --line-strong: #7E918D;   /* input and control borders, 3.27:1 on surface */
  --ink: #12302D;           /* 12.76:1 on bg */
  --ink-2: #3E5552;         /* 7.22:1 */
  --muted: #536663;         /* 5.50:1 on bg, 5.18:1 on brand-tint */
  --brand: #0F5B57;         /* primary fill; white on it 7.91:1 */
  --brand-strong: #083B39;  /* pressed, hero base */
  --brand-text: #0E7C73;    /* links/icons on surface 4.98:1 */
  --brand-tint: #E1F0EC;    /* selected, soft fills */
  --brand-tint-2: #CDE5DF;
  --sand: #E9DDC3;          /* decorative fill */
  --sand-soft: #F6ECD3;
  --gold: #C98416;          /* decoration only (hairlines, dots). Never text. */
  --gold-text: #8A5A0B;     /* kickers, 5.34:1 on bg */
  --success: #1E7A5C; --success-soft: #E3F2EA; --success-ink: #17624A;   /* ink on soft 6.30:1 */
  --warning: #B7791F; --warning-soft: #FBEFD2; --warning-ink: #7A5410;   /* 5.92:1 */
  --danger:  #A33F3B; --danger-soft: #FBE8E5;  --danger-ink: #8F2F2B;    /* 6.81:1 */
  --weak: #9A3B2E; --weak-soft: #FBE9E4;        /* score band "weak": terracotta, not alarm red; 5.88:1 on soft */
  --focus: #0E7C73;
  --scrim: rgba(8, 40, 40, .55);
}
```
### 1.2 Dark
```css
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0A1A1C; --bg-sunk: #07120F; --surface: #10282A; --surface-2: #153235;
  --line: #234346; --line-strong: #5B8A8D;   /* 4.02:1 on surface */
  --ink: #F2F5F1;        /* 16.2:1 */
  --ink-2: #C5D3CF;      /* 10.0:1 */
  --muted: #9FB3AF;      /* 7.0:1 on surface */
  --brand: #17786F;      /* fill; white on it 5.31:1 */
  --brand-strong: #0E5A53;
  --brand-text: #5CC4B4; /* 7.37:1 on surface */
  --brand-tint: #12383A; --brand-tint-2: #1A4A4C;
  --sand: #3A3321; --sand-soft: #2A2518; --gold: #E2B563; --gold-text: #E2B563; /* 8.1:1 */
  --success: #6FD3A8; --success-soft: #153A30; --success-ink: #8EE0BB;
  --warning: #F0C46A; --warning-soft: #3A2E14; --warning-ink: #F0C46A;
  --danger: #F29A94; --danger-soft: #3C2224; --danger-ink: #F6B3AE;
  --weak: #F2A28F; --weak-soft: #3A2320;
  --focus: #5CC4B4;
  --scrim: rgba(0, 0, 0, .6);
}
```
### 1.3 Accent presets (settings "اللون الأساسي")
```css
[data-accent="navy"] { --brand: #1E4A7A; --brand-strong: #12304F; --brand-text: #1E5C99; --brand-tint: #E3EDF7; --brand-tint-2: #CFDFEF; }
[data-accent="sage"] { --brand: #3F6B4F; --brand-strong: #2A4A36; --brand-text: #3F6B4F; --brand-tint: #E5EFE6; --brand-tint-2: #D2E3D5; }
[data-theme="dark"][data-accent="navy"] { --brand: #2B65A3; --brand-text: #8DBBEA; --brand-tint: #14304A; --brand-tint-2: #1B4264; }
[data-theme="dark"][data-accent="sage"] { --brand: #4A7F5D; --brand-text: #9BD0AC; --brand-tint: #17331F; --brand-tint-2: #204530; }
```
(White on navy/sage fills is above 6:1 in light; in dark the fill values above keep white at 4.8:1 or higher; QA verifies.)

### 1.4 Score bands (shared by score ring, badges, bars)
| Band | Rule (existing `classificationTone`/`percentTone`) | Color | Icon (not color alone) | Word |
|---|---|---|---|---|
| strong | class `strong`, >= 80 | `--success` on `--success-soft` | check | "إجابة قوية" |
| medium | class `medium`, 60 to 79 | `--warning` on `--warning-soft` | half circle | "إجابة متوسطة" |
| weak | class `weak`, < 60 | `--weak` on `--weak-soft` | upward arrow (room to grow) | "تحتاج إلى تطوير" |
Wording for weak band comes from the existing `badgeText()`; do not change strings, only add the glyph.

## 2. Typography

Fonts: keep the self-hosted "Coach Arabic" (Noto Sans Arabic Regular 400 and Bold 700). No CDNs. Stack: `"Coach Arabic", "Noto Sans Arabic", "Geeza Pro", "Tahoma", system-ui, sans-serif`. Optional P2 (not required): add self-hosted Noto Sans Arabic variable (wght 400 to 800) as `Coach Arabic` weight range `400 800` to unlock 500/600. Until then use only 400 and 700; tokens below never request other weights, so adding the variable file later is a one-line change to `@font-face`.

Rules: no `letter-spacing` anywhere on Arabic; `font-kerning: normal`; `text-wrap: pretty` on paragraphs, `text-wrap: balance` on headings; `hyphens: manual`; numerals Western 0-9 (as in V1) wrapped in `<bdi>`; Latin tokens (SEAL, STAR-L, PDF) in `<bdi>` with `font-family` unchanged.

```css
:root {
  --fs-scale: 1;                       /* data-font-size: small .92, large 1.12 */
  --fs-display: calc(2rem * var(--fs-scale));      /* 32 / lh 1.35  home hero title */
  --fs-h1: calc(1.75rem * var(--fs-scale));        /* 28 / 1.4 */
  --fs-h2: calc(1.375rem * var(--fs-scale));       /* 22 / 1.5 */
  --fs-h3: calc(1.125rem * var(--fs-scale));       /* 18 / 1.55, 700 */
  --fs-question: calc(1.5rem * var(--fs-scale));   /* 24 / 1.8, 700, question text */
  --fs-body: calc(1.0625rem * var(--fs-scale));    /* 17 / 1.85 reading text */
  --fs-ui: calc(1rem * var(--fs-scale));           /* 16 / 1.6 controls, row titles */
  --fs-small: calc(.875rem * var(--fs-scale));     /* 14 / 1.6 secondary text */
  --fs-caption: calc(.8125rem * var(--fs-scale));  /* 13 / 1.5 minimum for any text */
  --fs-nav: .75rem;                                /* 12 / 1.3 nav labels (fixed, not scaled) */
  --lh-tight: 1.35; --lh-ui: 1.6; --lh-read: 1.85;
}
[data-font-size="small"] { --fs-scale: .92; }
[data-font-size="large"] { --fs-scale: 1.12; }
[data-line-space="compact"] { --lh-read: 1.65; }
html { font-size: 16px; }
body { font: 400 var(--fs-ui)/var(--lh-ui) "Coach Arabic", ...; }
h1 { font: 700 var(--fs-h1)/var(--lh-tight) ...; text-wrap: balance; margin: 0; }
```
Minimum rendered text size anywhere: 12px (nav) and 13px (everything else). Kickers/eyebrows: 13px, 700, `color: var(--gold-text)`, no uppercase, no letter-spacing.
Line length: reading text containers `max-inline-size: 36em` (about 60 Arabic characters) on screens wider than 600px; on phones the gutter governs.

## 3. Spacing, layout, radius, elevation

```css
:root {
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px;
  --gutter: 16px;                      /* 14px at <=359px; 20px at >=430px; 24px at >=768px */
  --content-max: 560px;                /* phone column also on tablets; wider screens center it */
  --header-h: 52px;
  --nav-h: 64px;                       /* plus env(safe-area-inset-bottom) */
  --tap: 44px;                         /* minimum target */
  --r-sm: 10px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px; --r-pill: 999px;
  --r-arch: 999px 999px 14px 14px;
  --e-0: none;
  --e-1: 0 1px 2px rgba(18,48,45,.06), 0 4px 14px rgba(18,48,45,.06);
  --e-2: 0 8px 28px rgba(18,48,45,.12);
  --e-nav: 0 -1px 0 var(--line), 0 -8px 24px rgba(18,48,45,.06);
}
[data-theme="dark"] { --e-1: inset 0 1px 0 rgba(255,255,255,.04); --e-2: 0 10px 30px rgba(0,0,0,.45); --e-nav: 0 -1px 0 var(--line); }
```
Vertical rhythm: between sections `--s-6`; between cards in a list `--s-3`; inside a card `--s-4` padding (`--s-5` for hero cards); heading to its content `--s-3`. These four values only.
Page shell: `.app-main { inline-size: min(100% - 2*var(--gutter), var(--content-max)); margin-inline: auto; padding-block: var(--s-4) calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--s-6)); }`.
Elevation use: cards `--e-1` only when interactive or featured; static cards are border-only (`1px solid var(--line)`), which also makes dark mode consistent.

## 4. Motion
```css
:root { --d-fast: 120ms; --d-base: 200ms; --d-slow: 360ms; --ease: cubic-bezier(.2,.8,.2,1); --ease-in: cubic-bezier(.4,0,1,1); }
```
- Press: `transform: scale(.98)` over `--d-fast`. Hover (pointer devices only, `@media (hover:hover)`): border-color to `--line-strong`.
- Page enter: opacity 0 to 1 and `translateY(6px)` to 0 over `--d-base`, on `.app-main > *` first child only.
- Accordion: content height not animated (details); chevron rotates 180deg over `--d-base`.
- Score ring fill: `--p` animates from 0 over 700ms once (via `@property --p { syntax: "<number>"; inherits: false; initial-value: 0 }`); fallback is static.
- Reduced motion, both `@media (prefers-reduced-motion: reduce)` and `[data-motion="reduced"]`: `*, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }` and ring/skeleton/wave become static. Pulsing waits show a static dot.

## 5. Focus, states and global rules
- Focus ring on every `a, button, summary, input, select, textarea, [tabindex]`: `outline: 2px solid var(--focus); outline-offset: 2px; border-radius: inherit`. Never `outline: none` without the ring replacement. On dark brand fills (primary button) use `outline-color: #fff` plus `box-shadow: 0 0 0 4px var(--brand)`.
- Disabled: no `opacity` tricks. Use `background: var(--surface-2); color: var(--ink-2); border: 1.5px dashed var(--line-strong)` (ink-2 on surface-2 stays above 4.5:1 so a disabled label is still readable), plus `disabled`/`aria-disabled` and a visible helper line explaining why it is disabled (for example "أكّد تنبيه الخصوصية للمتابعة").
- Selection: `::selection { background: var(--brand-tint-2); }`.
- `-webkit-tap-highlight-color: transparent`; `touch-action: manipulation` on buttons and links.
- Safe areas: header `padding-block-start: env(safe-area-inset-top)`; nav `padding-block-end: env(safe-area-inset-bottom)`; sticky bars add the same.

## 6. Components

All class names below already exist in V1 markup unless marked NEW. Sizes are rendered CSS px at 390 width.

### 6.1 Buttons (`.button`, variants `.secondary`, `.ghost`; NEW `.danger`)
```css
.button { display:inline-flex; align-items:center; justify-content:center; gap:var(--s-2); min-block-size:48px; padding-inline:var(--s-5); padding-block:var(--s-2);
  border:1.5px solid transparent; border-radius:var(--r-md); background:var(--brand); color:#fff; font:700 var(--fs-ui)/1.3 inherit; text-decoration:none; cursor:pointer;
  transition: transform var(--d-fast) var(--ease), background-color var(--d-fast), box-shadow var(--d-fast); touch-action:manipulation; }
.button:active { transform: scale(.98); background: var(--brand-strong); }
.button.secondary { background: var(--surface); color: var(--brand-text); border-color: var(--line-strong); }
.button.secondary:active { background: var(--brand-tint); }
.button.ghost { background: transparent; color: var(--brand-text); min-block-size: var(--tap); }
.button.danger { background: var(--danger); color:#fff; }   /* white on #A33F3B = 6.2:1 */
.button[disabled], .button[aria-disabled="true"] { background: var(--surface-2); color: var(--ink-2); border:1.5px dashed var(--line-strong); transform:none; pointer-events:none; }
```
Loading state (NEW class `.is-loading`, set by JS where a button triggers async work, e.g. submit): text stays, `pointer-events:none`, a 16px spinner `::before` (`border:2.5px solid currentColor; border-block-start-color: transparent; animation: spin .8s linear infinite`), `aria-busy="true"`. With reduced motion the spinner becomes a static three-dot "…" suffix.
Layout rules: primary button full width on phones (`inline-size:100%`) when it is the screen's main action; at most 1 primary per viewport; secondary actions in a 2-column grid `grid-template-columns: 1fr 1fr; gap: var(--s-3)`; icon buttons `.icon-button` are 44x44 with 24px icon.
Sticky action bar (NEW `.action-bar`, applied by CSS to specific existing containers): `position: sticky; inset-block-end: calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--s-2)); padding: var(--s-3); background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px); border-radius: var(--r-lg); box-shadow: var(--e-2); z-index: 20`.

### 6.2 Cards (tiers)
| Tier | Class (existing) | Style |
|---|---|---|
| Hero | `.home-photo-hero`, `.simulation-hero`, `.score-hero`, `.competency-focus-hero`, `.lesson-hero` | `border-radius: var(--r-xl); padding: var(--s-5); background: var(--brand) with an inset radial highlight; color:#fff`. Score hero uses surface instead (see 6.9). |
| Featured | `.home-start-card.simulation`, first preparation card | `background: var(--surface); border: 1px solid var(--line); border-inline-start: 3px solid var(--gold); box-shadow: var(--e-1)` |
| Row | `.preparation-card`, `.session-history-card`, `.more-shortcut`, `.tool-card`, `.question-link-card`, `.smart-accordion-item` | `min-block-size: 64px; padding: var(--s-3) var(--s-4); border:1px solid var(--line); border-radius: var(--r-md); background: var(--surface); display:grid; grid-template-columns: 40px 1fr auto; gap: var(--s-3); align-items:center` |
| Tile | `.competency-card`, `.simulation-mode-card` | 2-column grid cell, `padding: var(--s-4); border-radius: var(--r-lg)` |
| Quiet | `.card` default, `.notice` | border-only, `background: var(--surface-2)` or tint; no shadow |
Icon badge (all `*-icon` spans): 40x40, `border-radius: var(--r-arch)`, `background: var(--brand-tint)`, icon 22px `stroke-width: 1.8`, color `--brand-text`. Tone classes (`tone-1..n`, `tone-blue`...) all map to the single brand tint, except the competency tiles keep 4 tints (`--brand-tint`, `--sand-soft`, `#E8EEF7`/dark `#14283A`, `#F1E9F5`/dark `#2A2036`) because these help competencies be told apart. Never more than one decoration per row (icon badge OR number, not both plus a chevron circle). Chevron: 20px inline SVG or the existing `‹`/`›` char at 20px, no circle, `color: var(--muted)`, mirrored automatically because the char is directional for RTL (`‹` is "forward" in RTL).
Pressed: `transform: scale(.985); background: var(--brand-tint)`.

### 6.3 Segmented control (`.segmented`)
Track `background: var(--bg-sunk); padding: 4px; border-radius: var(--r-md); border:1px solid var(--line)`; buttons `min-block-size: 44px; border-radius: 10px; font: 700 var(--fs-small)/1.2; color: var(--ink-2)`; `.active` = `background: var(--surface); color: var(--brand-text); box-shadow: var(--e-1); outline: 1.5px solid var(--brand-text)` (outline gives a non-shadow cue in high contrast). `role="radiogroup"` semantic stays as in JS; add `aria-pressed` or `aria-checked` (see implementation plan). Max 4 segments per row at 390; 5 or more wrap to 2 rows via `grid-template-columns: repeat(auto-fit, minmax(84px, 1fr))`.

### 6.4 Chips and tags (`.tag`, `.tag.accent`, `.tag.warning`, deck filters `.question-deck-filters button`)
Tag: `min-block-size: 28px; padding: 2px 10px; border-radius: var(--r-pill); font: 700 var(--fs-caption)/1.5; background: var(--brand-tint); color: var(--brand-text)`; `.warning` uses warning-soft/ink. Tags are not interactive (no target needed). Filter chips (interactive): `min-block-size: 44px; padding-inline: 16px; border: 1.5px solid var(--line-strong); border-radius: pill; background: var(--surface)`; selected: `background: var(--brand); color:#fff; border-color: var(--brand)` and a leading check glyph (so selection is not color-only). Filter row scrolls horizontally inside its own container (`overflow-x:auto; scroll-snap-type:x proximity; padding-inline: var(--gutter); margin-inline: calc(-1 * var(--gutter))`), never the page.

### 6.5 Accordions (`details.smart-accordion-item`, `.settings-item`, `.intro-question-group`, `.worked-example`)
Summary: Row-card grid (40px badge, title 16/700, optional 14px subtitle, chevron 20px), `min-block-size: 56px`, no chevron circle; chevron rotates 180deg when `[open]`. Open body: `padding: var(--s-4); border-block-start: 1px solid var(--line)`; body text 17/1.85. Group (`.smart-accordion`) gap `--s-3`. First item open only where the screen's learning flow needs it; settings: all closed.

### 6.6 Progress
- Linear (`.simulation-progress`, `.competency-focus-progress`, `.question-hub-progress-line`, `.mini-score-track`): track 8px `--bg-sunk`, radius pill; fill `--brand-text` (or band color for scores); fill animates width over `--d-slow`. Always paired with text "السؤال 2 من 4" (bdi numbers). Keep `role="progressbar"` and aria-values (exist).
- Step dots (lesson stepper, question stepper `.question-stepper`, `.question-step`): 4 equal buttons 44px high, number in a 28px circle; current = filled brand, done = check, upcoming = outline; label 13px. Connector line 2px `--line`.
- Ring (`.home-progress-ring`): 64px, `conic-gradient(var(--brand-text) var(--progress), var(--brand-tint-2) 0)` with `::before` inset 8px `--surface` mask; center `<strong>` 16px/700 percent; helper text beside it says "x من y دروس".

### 6.7 Toasts (`.toast-region`, `.toast`)
Bottom-anchored above nav: `inset-block-end: calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--s-3))`. Card: `background: var(--ink); color: var(--bg); padding: 12px 16px; border-radius: var(--r-md); font: 700 var(--fs-small)/1.5; box-shadow: var(--e-2)`, leading 20px glyph by tone: `.toast.success` check, `.toast.error` exclamation (NEW optional classes; JS `toast(message, duration)` signature unchanged, optional 3rd arg `kind`). Duration 2.6s, 5s for errors; `role="status"` (errors `role="alert"`). Enter: slide 8px + fade `--d-base`.

### 6.8 Skeletons and loading
`.skeleton` (NEW): `background: linear-gradient(90deg, var(--bg-sunk) 25%, var(--surface-2) 37%, var(--bg-sunk) 63%); background-size: 400% 100%; animation: shimmer 1.4s linear infinite; border-radius: var(--r-sm)`. Shimmer direction follows `dir` (use `background-position` on logical axis: set `[dir=rtl] .skeleton { animation-direction: reverse }`). Reduced motion: static `--bg-sunk`. Used for: `.loading-screen` (3 bars: 28px title, 16px text lines) instead of the lone spinner; report-waiting; deck card.
`.loader` (spinner) kept for inline use: 24px, 3px border.

### 6.9 AI waiting state (`.card.ai-working`, `.slow-notice`)
Structure (see screens.md S-eval): arch icon badge 56px with a slow pulse (`scale 1 to 1.06`, 1.6s, static under reduced motion), title 18/700 (existing `workingText`), hint 14/muted (existing `workingHint`), an **indeterminate** 4px bar (`.ai-working::after`, a 40% wide segment sliding along the track; static full-width at 30% opacity under reduced motion), then after the existing slow threshold `.slow-notice` becomes a `--warning-soft` strip with 14px text and keeps its current text. Do not show fake percentages or fake stages: evaluation duration is unknown. `aria-live="polite"` on the status region (exists). The submit button shows `.is-loading` meanwhile; the retry button stays disabled as in V1.

### 6.10 Score and result visuals
- **Score hero** (`.score-hero.score-card.{strong|medium|weak}`): surface card, `border-radius: var(--r-xl); padding: var(--s-5); border:1px solid var(--line)`; top row: ring (left in LTR, start side in RTL) 112px + copy. Ring = `.final-score`: `inline-size:112px; aspect-ratio:1; border-radius:50%; background: conic-gradient(var(--tone) calc(var(--p) * 1%), var(--tone-soft) 0); display:grid; place-items:center; position:relative`; `::before { content:""; position:absolute; inset:10px; border-radius:50%; background: var(--surface) }`; the number `font: 700 2rem/1 inherit` (the `<bdi>` inside is above the mask via `position:relative`); `%` sign 14px. `--tone`/`--tone-soft` come from the band classes (1.4). Copy column: `.score-badge` pill (icon + word, 14/700, tone-soft background, tone-ink text), `.elements-complete-line` 14/muted ("العناصر المكتملة: 3 من 4"), nothing else. Below: `.score-summary` 17/1.85 (the human summary is the lead text), then `.trust-line` 13/muted with a small shield icon.
- `.score-track`: kept in DOM for the progressbar role; visually it is the **ring** (the element with `role=progressbar` is hidden with `position:absolute; inline-size:1px; clip-path: inset(50%)` but still exposed to AT), so there is no duplicated bar.
- **Criteria rows** (`.criterion-card`, `.breakdown-row`): left color rail replaced by: title 16/700, value `<bdi>` pill at the end (tone-soft), 8px bar below, then lines. Evidence quotes `.evidence-quotes q`: `display:block; padding: var(--s-3); border-inline-start: 3px solid var(--tone); background: var(--surface-2); border-radius: var(--r-sm); font-size: var(--fs-small); quotes: "«" "»"`.
- **Action-share bar** (`.action-share-track`): 12px track, fill `--brand-text`, marker at 70% as 2px tall line 20px `--ink` with label above (existing `.action-share-marker`, `-label`).
- **Aggregate / session**: `.session-average` big number 48/700 with "المتوسط التدريبي" caption; `.session-result-row` rows: question number badge, 2-line clamp question text, score pill at end.
- Everything numeric uses `<bdi>`/`font-variant-numeric: tabular-nums`.

### 6.11 Forms
Inputs/textarea/select: `min-block-size: 48px; padding: 12px 14px; font-size: 16px (never smaller, avoids iOS zoom); border: 1.5px solid var(--line-strong); border-radius: var(--r-md); background: var(--surface); color: var(--ink)`; focus: border `--focus` + ring; placeholder `color: var(--muted)`. Textarea `line-height: var(--lh-read)`; `resize: none` on phones (auto-grow height instead, `field-sizing: content` where supported, `min-block-size: 40dvh`, `max-block-size: 60dvh`). Labels 14/700 above the field, never placeholder-only. Checkbox/toggle rows (`.toggle-row`, `.privacy-consent`): whole row is the target, `min-block-size: 56px`, 24px box `accent-color: var(--brand)` with a visible 2px border `--line-strong`.
Attributes: free-text answer `autocomplete="off" autocorrect="on" spellcheck="true" lang="ar" enterkeyhint="done"`; search `type="search" inputmode="search" enterkeyhint="search"`.

### 6.12 Header and bottom nav
Header (`.app-header`): sticky, `block-size: calc(var(--header-h) + env(safe-area-inset-top))`, `background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: saturate(1.4) blur(14px); border-block-end: 1px solid var(--line)`; `.header-inner { direction: rtl; }` (contract) grid `44px 1fr 44px`; title `#route-title` 17/700 centered, one line ellipsis; `#back-button` 44x44, ghost circle, icon `--ink`. The inline SVG path in index.html stays (tests).
Bottom nav (`.bottom-nav`): `position: fixed; inset-inline: 0; inset-block-end: 0; padding-block-end: env(safe-area-inset-bottom); background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(16px); box-shadow: var(--e-nav); display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); block-size: auto; min-block-size: var(--nav-h)`; items 64px tall column flex, icon 24px, label 12px/700 one line; inactive `--muted`; active: `color: var(--brand-text)` and a 56x32 pill behind the icon `background: var(--brand-tint)` (`a.active svg` wrapped by pseudo-element `::before` on the anchor, positioned behind the icon), plus `aria-current="page"`. At 360px width each item is 72px: label "التقارير" fits at 12px.

### 6.13 Dialog (`#app-dialog`)
Bottom sheet on phones: `inset-block-end: 0; inline-size: 100%; max-block-size: 88dvh; border-radius: var(--r-xl) var(--r-xl) 0 0; padding-block-end: env(safe-area-inset-bottom)`, drag handle 36x4 pill `::before`, `::backdrop { background: var(--scrim) }`, title 18/700, close button 44x44. Print-scope options (`.print-scope-option`) are row cards with min height 56px.

### 6.14 Notices (`.notice`, `.training-disclaimer`, `.privacy-reminder`)
Notice: row `grid-template-columns: 24px 1fr`, `padding: 12px 14px; border-radius: var(--r-md); font-size: var(--fs-small)`; kinds: default (brand-tint), `.warning` (warning-soft/ink), `.danger` (danger-soft/ink; only for real errors), `.success`. The icon argument currently passes text glyphs ('ⓘ', '!', '▣'); CSS renders them in a 24px circle, and the `▣` call site is replaced (plan). Privacy reminders use `--warning-soft`, not danger.
