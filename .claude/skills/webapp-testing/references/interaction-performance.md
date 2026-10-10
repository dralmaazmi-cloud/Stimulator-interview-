# Measuring interaction performance

`scripts/measure-interaction.mjs` drives real clicks, taps and typing in Chromium with Playwright and reports
only what the browser measured. It runs against local URLs or local files only.

## Run it
1. Write a step file, for example `tests/e2e/timing-steps.json`:
```json
[
  { "name": "calculate", "action": "click", "selector": "#calc",
    "feedback": "#calc[aria-busy=true]", "loading": ".spinner", "done": "#result:not(:empty)", "api": "/api/" },
  { "action": "fill", "selector": "#amount", "value": "1000", "feedback": "#amount-preview" }
]
```
   - `action`: `click` (default), `tap`, `fill`, `press`, `select`, `check`, `wait` (`ms`) or `goto` (`url`).
   - `selector`: a Playwright selector for the target (CSS, `text=`, `role=`).
   - `feedback`, `loading`, `done`: CSS selectors that become visible **only after** the action. A selector
     that is already visible before the action is rejected as meaningless.
   - `api`: a URL substring attributing requests to the step (default: all fetch/XHR).
2. Run it, with the dev server managed by the upstream helper when needed:
```bash
python3 <skill>/upstream/scripts/with_server.py --server "npm run dev" --port 5173 -- \
  node <skill>/scripts/measure-interaction.mjs http://localhost:5173/ --steps tests/e2e/timing-steps.json \
  --device "iPhone 13" --dir rtl --runs 3
```
   Options: `--cpu-throttle 4` (emulated slower CPU for JavaScript work), `--latency 600` (Chromium latency
   emulation: a **minimum** time per request that overlaps with server time and is not added to it; use it
   only to make loading states visible against an instant local server), `--timeout`, `--quiet-ms`, `--out`.
   Neither option reproduces a real phone or network; the output notes say which were used.

## What it reports (milliseconds from the trusted input event, median over runs, min and max in `spread`)
| Metric | Meaning |
|---|---|
| `feedbackVisibleMs` | the `feedback` selector became visible (click to visual feedback) |
| `firstDomChangeMs` | first DOM mutation after the input |
| `nextFrameAfterInputMs` | first frame produced after the input handlers |
| `interaction.latencyMs` | Event Timing: input to next paint (the INP measure), split into `inputDelayMs` (main thread busy before handlers), `processingMs` (handlers), `presentationDelayMs` (render and paint) |
| `loadingShownMs`, `loadingVisibleForMs` | when the loading indicator appeared and how long it stayed |
| `completionMs` | `done` selector visible; without `done`, the last DOM change or response before a quiet period |
| `blocking.*` | long tasks (count, total, max), long-animation-frame blocking time, longest gap between frames (a freeze) |
| `breakdown.*` | `frontendBeforeFirstRequestMs`, `networkAndBackendMs` (union of request time), `frontendAfterLastResponseMs`, `frontendTotalMs`, `dominant` |
| `requestsLastRun[]` | per request: status, `connectMs` (DNS/TCP/TLS = network setup), `waitingMs` (time to first byte = backend processing + round trip), `downloadMs`, raw `Server-Timing` |
| `errors` | console errors, uncaught page errors, unhandled rejections, HTTP >= 400 and failed requests during the step |
| `pageLoad` | TTFB, DOMContentLoaded, load, FCP, LCP of the initial navigation |

## Separating frontend, backend and network
- `frontend*` time is main-thread work in the browser: handlers, rendering and long tasks. Fix it in client code.
- `waitingMs` on a local server is mostly backend processing. On remote or emulated-latency runs it also
  includes the round trip. A `Server-Timing` header from the backend separates them; otherwise say so.
- `connectMs` and `downloadMs` are network setup and transfer.
- `dominant` is `frontend` or `backend/network` when one side is at least 60 % of completion, else `mixed`.

## Flags (fixed thresholds; they are reported, never invented)
Feedback over 100 ms; interaction latency over 200 ms (needs improvement) or 500 ms (poor); frame gap over
200 ms (UI unresponsive); long tasks of 50 ms or more; an operation over 1 s with no loading indicator; a
loading indicator later than 100 ms; any error during the step.

## Reporting rules
- Copy numbers from the tool output only. Include the command, device, runs, engine and the JSON file path.
- Say "not measured" with the tool's `unavailable` reason when a value is null.
- Desktop CPU and Chromium are not an iPhone with Safari. Treat numbers as relative evidence
  (before versus after, step versus step) unless the run used `--cpu-throttle`, and say which.
- Timings vary between runs; report the median and the spread, and use at least 3 runs for comparisons.
