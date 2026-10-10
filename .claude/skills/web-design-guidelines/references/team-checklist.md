# ai-dev-team checks not covered by the upstream guidelines

Check these in addition to `upstream/command.md`. Each line is one check.

## Arabic RTL and English LTR
- `dir` and `lang` set on `<html>` or the section; switching language switches both.
- Logical CSS only: `margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `text-align: start|end`. Flag `left`/`right` used for direction.
- Directional icons (back, next, chevrons, progress) mirror in RTL; play, checkmarks and clocks do not.
- Mixed-direction strings (numbers, Latin words, URLs, units) isolated with `<bdi>` or `unicode-bidi: isolate`.
- Arabic text: Arabic-capable font, line-height about 1.6 to 1.8, no `letter-spacing`, no `text-transform: uppercase` dependence.
- One numeral system per product (Western or Arabic-Indic), produced by `Intl.NumberFormat` with the right locale.

## iPhone
- Tap targets at least 44 x 44 CSS px with spacing; primary action within thumb reach.
- Inputs at least 16 px font size (prevents iOS zoom); correct `inputmode`, `enterkeyhint`, `autocomplete`.
- `viewport-fit=cover` with `env(safe-area-inset-*)` on fixed headers, footers and full-bleed areas.
- No horizontal page scroll at 375, 390 and 430 px widths.
- `100dvh`/`svh` rather than `100vh` for full-height layouts (Safari toolbars).

## Feedback after every interaction
- Every tap gives visible feedback within about 100 ms (pressed state, spinner, inline change).
- Async actions: pending state while waiting, duplicate submits prevented, success state, and an error state with the cause and the next step. The error appears next to its field or action and is announced (`role="alert"` or `aria-live`).
- Loading indicators for waits over about 1 s; skeletons keep layout stable.
- Empty, offline and disabled states are designed, not blank.
- Navigation: back works, the current location is visible, and state survives reload where the product expects it.

## Consistency
- Colors, spacing, radius and type sizes come from existing tokens; flag one-off values.
- The same action keeps the same name in buttons, toasts and errors.
