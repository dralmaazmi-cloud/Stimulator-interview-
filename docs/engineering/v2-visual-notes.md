# V2 visual redesign: implementation notes

Branch: `feature/interview-v2-redesign`. Spec: `docs/design/v2/`. AI waiting API: `docs/ai/v2-ai-audit.md` section 4.

## How the stylesheet is built
`work/dist/css/styles.css` is one file with this layer order:

`contract-base, legacy, reset, tokens, base, layout, components, screens, themes, utilities, contract-final, print`

- `legacy` holds the V1 rules (comments and print rules removed, `!important` dropped except `.sr-only`, motion and the back-button arrow). It is a low-priority fallback: any class that V2 does not restyle still renders, using V1 geometry with V2 colors. V1 custom properties (`--paper`, `--teal-900`, ...) are aliased to V2 tokens in the `tokens` layer, so the fallback follows light/dark/accent settings.
- Because layers beat specificity, every V2 rule overrides legacy regardless of selector weight. A legacy property that V2 does not declare still applies (for example `flex-direction` in a legacy media query); when a screen looks wrong, declare the property in a V2 layer.
- `contract-*` layers carry the strings asserted by `work/tests/*` verbatim.
- `print` is the V1 `@media print` blocks copied unchanged (verified by normalized text comparison: 13 of 13 present) plus one V2 block that flattens the score rings for paper. `[hidden] { display: none !important }` lives at the start of this layer on purpose: `!important` in an earlier layer would beat the print rules.

The file is edited directly; there is no build step.

## Cache busting
Tests regex-match the V1 version strings, so the suffix is appended: `styles.css?v=0.6.0-alpha-10-v2`, `app.js?v=0.6.0-alpha-10-v2`, cache `leadership-interview-coach-v0.6.0-alpha-10.2-51d413de-v2`. Remove the suffix only together with a test update.

## JS changes
- `ui.js`: `toast(message, duration, kind)`, `notice-icon` class, `setBusy()`, icons `lock` and `warning`, `createAiWaiting()` (phase label, elapsed seconds, cancel button, `.slow-notice`).
- `simulation.js`: evaluation runner and transcription use phase/progress/abort; cancel keeps the answer or recording. `RETRYABLE_CLIENT_CODES` now includes `AI_INVALID_JSON`, `AI_SCHEMA_FAILED`, `AI_EVIDENCE_FAILED`, `AI_EMPTY_RESPONSE`, `AI_PROVIDER_ERROR`, `NETWORK`. Word counter under the answer box.
- `report.js`: score ring custom property, example request uses the waiting card with cancel. `self-intro.js`: AI improvement uses the waiting card with cancel.
- Small hooks: `aria-pressed` on bookmarks and answer-mode buttons, `data-ready` on the preparation grid, `aria-current` on the active nav link, `path-caption` on home.

## Known gaps versus the spec
See the engineer report: settings accordion default and theme swatches need `settings.js` (separate task); several spec details that need markup or logic that does not exist were skipped rather than invented.
