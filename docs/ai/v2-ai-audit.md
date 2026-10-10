# v2 AI integration audit (Gemini Interactions API)

Scope: latency, reliability, cost, waiting UX. No change to methodology, scoring, prompts, provider.
Evidence: `/tmp/v2-evidence/vercel-usage-logs.md` (production usage logs) and the code in `work/api/`.
Limitation: ai.google.dev was unreachable from this sandbox (proxy 403 / DNS), so provider documentation could not be read in this run. Anything about provider fields below that I did not verify is marked UNVERIFIED.

## 1. The 64 s evaluate request

Log line: `evaluate 64390 ms, in=3153, out=2048, thought=0, attempts=1, status 200, validation passed` (dep 3B7D, main).

### Confirmed from code
- The code never sets an output-token cap (`grep` for `max_output`/`2048` in `work/api` finds nothing). The request body is `model, input, store:false, response_format, generation_config.thinking_level='low'`. So `2048` is not ours.
- `attempts=1` is the handler's schema/evidence retry counter. It does not count transport retries or fallback calls (`provider_call_count` does, and it is missing from the pasted log line). A 64 s request can therefore contain: one slow call, or a 5xx/network failure followed by a retry (delays 1.5 s / 4 s), or a timeout followed by the fallback model.
- The response passed JSON parse and schema validation (`validation passed`), so the text was complete JSON. A truncated-then-valid result is very unlikely: truncated JSON fails `JSON.parse` -> `AI_INVALID_JSON`. A cap hit would normally yield an invalid report, not a valid one.
- Per-call timeout is 75 s and the handler budget is 110 s (`provider.js`). A 64 s call is inside the allowed window, so nothing in our code would cut it short; it is "allowed slowness".
- Other deployments differed: the 14 s call on the same deployment produced 1545 output tokens (about 110 tokens/s); the 64 s call produced 2048 tokens (about 32 tokens/s if one call).

### Hypotheses (not confirmed)
1. H1 (most likely): provider-side slowness or queueing on that one call (throughput 3x lower than the 14 s call on the same deploy). Time is dominated by output generation of a long evaluation-1.3 report (about 1.5-3k tokens), so latency scales with output length.
2. H2: the request included a failed/slow first call plus a retry or fallback; `provider_call_count` was not in the pasted line. The new `calls[]` log (below) settles this next time.
3. H3: `out=2048` with `thought=0` being a round number suggests a provider-side output ceiling or accounting artifact for that path. Unverified. If it is a cap, the model would have been forced to stop at 2048 and the JSON would usually be invalid; it was valid, so this is weak.
4. H4: `thought=0` while `thinking_level=low` normally gives 800-1100 thought tokens suggests either the fallback model answered (different model, no thinking) or the model chose not to think. Cannot distinguish without the model name in the log (now logged).

### Why p50 is already high (confirmed by arithmetic)
The evaluation-1.3 report is long: 1.5-3.2k output tokens plus 800-1500 thought tokens. At about 110 tokens/s this is 14-25 s; any slow provider moment multiplies it. Reduction levers that do not change methodology: lower thinking (already `low`; `minimal` is an env switch), shorter output (needs protected prompt/schema changes, see section 5), and a hard output cap (UNVERIFIED field support).

### New instrumentation (added)
Every provider call now records `{model, status, ms, outcome}`; `[usage]` logs carry `provider_ms` and `calls[]` (no text, no keys). Next 64 s outlier will show whether it was one slow call, a retry, or a fallback, and which model answered.

## 2. Latency budget per endpoint (from logs, p50/p95 are small samples)

| Endpoint | Observed | Client wait limit | Server budget | Notes |
|---|---|---|---|---|
| evaluate | 14-24 s typical, 47 s with schema retry, 64 s outlier | 125 s | 110 s total, 75 s/call, max 5 calls | Retry on evidence failure doubles the time |
| transcribe | 8-16 s for short clips | 125 s | 110 s, 4 calls | Spends 640-1400 thought tokens (waste) |
| example | 18 s | 125 s | 110 s | thought=1685, no thinking_level set |
| self-intro | no sample | 125 s | 110 s | no thinking_level set |
| health | fast | 12 s | n/a | |

Target UX expectations used by the client for the "overrun" flag: evaluate 30 s, transcribe 15 s, example 25 s, self-intro 15 s.

## 3. Findings (prioritized)

| # | Priority | Finding | Status |
|---|---|---|---|
| F1 | High | No per-call timing/model in logs; the 64 s case cannot be root-caused from current logs | Fixed (`calls[]`, `provider_ms`) |
| F2 | High | Transcription spends 640-1400 thinking tokens; unneeded for verbatim transcription | Opt-in switch `GEMINI_TRANSCRIBE_THINKING_LEVEL=minimal` added, default off because the protected test `resilience.test.mjs` line 251 pins "no generation_config" for transcription. Needs orchestrator decision (section 5, D1) |
| F3 | High | No output cap anywhere; a runaway response can consume up to the 75 s call timeout | Opt-in `GEMINI_EVALUATION_MAX_OUTPUT_TOKENS`, `GEMINI_TRANSCRIBE_MAX_OUTPUT_TOKENS`, default off. `generation_config.max_output_tokens` acceptance in the Interactions API is UNVERIFIED; the earlier AI_PROVIDER_ERROR 400 bursts (dep GDWH) show a bad request field hard-fails every call, so test on a preview first |
| F4 | High | Waiting UX: only a single "still trying" notice after 8 s; the user waits up to 125 s with no phase, no elapsed time, no cancel | Client API added (section 4); needs UI wiring in `simulation.js`/`self-intro.js` |
| F5 | Medium | Client had no retry for network failure and one generic message | Fixed: one retry with 1.5 s backoff and jitter on no-response only; never on 4xx, 429, 504 |
| F6 | Medium | Error codes not mapped to Arabic client-side (`AI_INVALID_JSON`, `AI_SCHEMA_FAILED`, `AI_EVIDENCE_FAILED`, `AI_EMPTY_TRANSCRIPT` leaked server English or generic text) | Fixed: `ERROR_MESSAGES` map. `RETRYABLE_CLIENT_CODES` in `simulation.js` still lacks the three "resend" codes (see section 4) |
| F7 | Medium | Evidence-failure retry (`failureRate > 0.3`) re-runs the whole evaluation, doubling latency and cost (seen: 47 s, 6084 in / 3158 out). This is methodology, so not changed | Report only |
| F8 | Medium | Per-call timeout 75 s is much longer than p95 (about 47 s). A hung call burns 75 s before fallback is possible (fallback needs 20 s remaining, so only about 35 s margin) | Suggest lowering evaluation call timeout to about 45 s with fallback configured (needs `MAX_CALL_TIMEOUT_MS`, pinned at 75 000 by a protected test: `callTimeoutMs()` asserted equal 75 000) |
| F9 | Medium | `example` and `self-intro` set no thinking level (example logged 1685 thought tokens) | Not changed: tests assert evaluate-only thinking; propose `low` for both, decision D2 |
| F10 | Low | Rate limiter is per-instance in-memory (documented in file); ineffective across serverless instances | Report only, needs KV store |
| F11 | Low | Prompt caching: system prompt and variable parts are in one `input` string; no explicit/implicit caching control. Implicit caching depends on a stable prefix; the prompt in `prompts.js` is protected | Report only |
| F12 | Low | Logs: no secrets or answer text found. Provider error messages are not logged (status/code only). New fields add model ids and timings only | OK |
| F13 | Low | Audio: base64 of up to 4 MB in the JSON body (about 5.3 MB); Vercel function body limit is 4.5 MB for the incoming request, which is the raw audio (OK). Safari `audio/mp4` is mapped to `audio/m4a` | OK, not re-tested on real devices |

Token and cost estimate per evaluation (from logs): about 3k input, 1.5-3.2k output, 0-1.5k thought. Arabic inflates tokens versus English; do not shorten input further without quality evidence. No prices are stated here because the pricing page could not be fetched.

## 4. Client API for waiting states (`work/dist/js/evaluate-client.js`)

All four calls (`evaluateWithAi(payload, options)`, `transcribeWithAi(blob, seconds, options)`, `requestWorkedExample(payload, options)`, `improveSelfIntroduction(payload, options)`) accept the same optional `options`; the old `onSlow` still works.

- `onPhase({phase, label, elapsedMs})`: phases `sending -> evaluating -> validating -> done` (evaluate/example/self-intro) and `uploading -> transcribing -> validating -> done` (transcribe), plus `retrying` on a network retry. `label` is Arabic, ready to display. Honesty note: the browser cannot observe the server's internal steps, so `evaluating`/`transcribing` are time-based (0.8 s after send; for audio about blob.size/150 KB/s, min 1.5 s) and `validating` fires when the response arrives. Show them as progress hints, not guarantees.
- `onProgress({phase, label, elapsedMs, expectedMs, overrun})` every second; use `elapsedMs` for a timer and `overrun` to switch to a "taking longer than usual" message.
- `signal`: an `AbortSignal` for a user Cancel button; rejects with `code: 'ABORTED'`, message "أُلغي الطلب."
- `retries`: network-failure retries (default 1).
- Errors keep `error.code`, `error.status`, `error.retryAfter`; `error.message` is now always a safe Arabic message. New client code `NETWORK` (no connection) and `ABORTED`.

Wiring needed by the software engineer (not done, files off-limits for me):
1. `simulation.js` `createEvaluationRunner`: pass `onPhase`/`onProgress` to `evaluateWithAi` and update `working` text (phase label + seconds), add a Cancel button using an `AbortController`.
2. `transcribeRecording` (about line 231): same for `transcribeWithAi`, replacing the static "جارٍ تحويل الصوت إلى نص…".
3. Add `AI_INVALID_JSON`, `AI_SCHEMA_FAILED`, `AI_EVIDENCE_FAILED`, `AI_EMPTY_RESPONSE`, `AI_PROVIDER_ERROR` to `RETRYABLE_CLIENT_CODES` so the resend button with lock appears (those messages say "resend").
4. `self-intro.js` line 392: pass `{ onPhase }` to `improveSelfIntroduction`.

## 5. Changes needing protected files or decisions (for the orchestrator)

D1. Transcription without thinking. Code is ready (`GEMINI_TRANSCRIBE_THINKING_LEVEL`). To make it default, the protected test `work/tests/resilience.test.mjs` line 251 must change from
`assert.ok(!('generation_config' in calls[0].body), 'transcription request is unchanged (no thinking_level)');`
to an assertion of `generation_config.thinking_level === 'minimal'`, and `provider.js` `transcriptionThinkingLevel()` default changed from `null` to `'minimal'`. Alternative without touching tests: set env `GEMINI_TRANSCRIBE_THINKING_LEVEL=minimal` in Vercel (preview first). Whether the transcription model accepts `minimal` is UNVERIFIED.

D2. `example` and `self-intro` thinking level `low`: add `thinkingLevel: evaluationThinkingLevel() || undefined` in `work/api/example.js` and `self-intro.js` (allowed files) after confirming no test asserts absence. I did not apply it because it alters generation behavior of approved features without measured quality data.

D3. Output cap value. Suggest preview experiment: `GEMINI_EVALUATION_MAX_OUTPUT_TOKENS=6000` (above the observed max 3158 + margin) to bound runaway cost, and `GEMINI_TRANSCRIBE_MAX_OUTPUT_TOKENS=1500` (120 s speech is about 400 words). Only after confirming the field in current provider docs.

D4. `MAX_CALL_TIMEOUT_MS` 75 000 -> about 45 000 in `provider.js` plus the protected assertions in `resilience.test.mjs` (`callTimeoutMs()` equals 75 000, and the 7b case uses `MAX_CALL_TIMEOUT_MS`). Only worthwhile if a fallback model is configured (`GEMINI_EVALUATION_FALLBACK_MODEL`).

D5. Prompt/schema length (protected `prompts.js`, `schemas.js`): output length drives latency. A measured look at which schema fields (for example long `feedback` strings) can be shortened without changing assessment meaning belongs to the Educational Architect; no diff proposed here.

## 6. Verification performed
- `cd work && npm test`: all suites PASS (run after the server and client changes).
- `node tests/agent-qa/ai/ai-integration.test.mjs`: PASS (mock provider only; no real API calls).
- Scoring: `scoring.js`, `validation.js`, `prompts.js`, `schemas.js` untouched, and default request bodies for evaluate and transcribe are unchanged, so scores for the same model output are identical.
- Not verified: provider documentation, real-device behavior, harness-based UI rendering of phases, actual live latency after the changes.
