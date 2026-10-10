// Mock-provider tests for the v2 AI audit changes. Run: node tests/agent-qa/ai/ai-integration.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(new URL('../../../work', import.meta.url).pathname);
const load = rel => import(pathToFileURL(path.join(root, rel)).href);
process.env.GEMINI_API_KEY = 'test-key-not-real';
const provider = await load('api/_lib/provider.js');
const { recordUsage } = await load('api/_lib/usage.js');

const okPayload = text => ({ status: 'completed', usage: { total_input_tokens: 10, total_output_tokens: 5 }, steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] });
const jsonRes = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
function inject(responses) {
  const calls = []; let t = 1000;
  const restore = provider.configureProviderDeps({
    now: () => t, sleep: async ms => { t += ms; }, random: () => 0.5,
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); t += 700; const r = responses.shift(); if (r instanceof Error) throw r; return r; }
  });
  return { calls, restore };
}
const audio = Buffer.alloc(300, 1);

// 1. default transcription body is unchanged (no generation_config); knobs are opt-in.
{
  const { calls, restore } = inject([jsonRes(200, okPayload('نص'))]);
  await provider.transcribe(audio, 'audio/webm'); restore();
  assert.ok(!('generation_config' in calls[0]));
  process.env.GEMINI_TRANSCRIBE_THINKING_LEVEL = 'minimal';
  process.env.GEMINI_TRANSCRIBE_MAX_OUTPUT_TOKENS = '1500';
  const second = inject([jsonRes(200, okPayload('نص'))]);
  await provider.transcribe(audio, 'audio/webm'); second.restore();
  assert.deepEqual(second.calls[0].generation_config, { thinking_level: 'minimal', max_output_tokens: 1500 });
  process.env.GEMINI_TRANSCRIBE_THINKING_LEVEL = 'bogus'; process.env.GEMINI_TRANSCRIBE_MAX_OUTPUT_TOKENS = '5';
  assert.equal(provider.transcriptionThinkingLevel(), null);
  assert.equal(provider.transcriptionMaxOutputTokens(), null, 'out-of-range cap ignored');
  delete process.env.GEMINI_TRANSCRIBE_THINKING_LEVEL; delete process.env.GEMINI_TRANSCRIBE_MAX_OUTPUT_TOKENS;
}

// 2. evaluation: cap opt-in; call log records per-call timing without content.
{
  const budget = provider.createBudget({ startedAt: 1000 });
  const { calls, restore } = inject([jsonRes(503, {}), jsonRes(200, okPayload('{"a":1}'))]);
  const out = await provider.complete('SECRET-ANSWER-TEXT', { type: 'object' }, { budget, thinkingLevel: 'low' }); restore();
  assert.deepEqual(calls[0].generation_config, { thinking_level: 'low' });
  const summary = provider.callSummary(budget);
  assert.equal(summary.calls.length, 2);
  assert.deepEqual(summary.calls.map(c => c.outcome), ['error', 'ok']);
  assert.ok(summary.provider_ms >= 1400);
  assert.ok(!JSON.stringify(summary).includes('SECRET'));
  assert.deepEqual(out.data, { a: 1 });
  const capped = inject([jsonRes(200, okPayload('{"a":1}'))]);
  await provider.complete('x', {}, { thinkingLevel: 'low', maxOutputTokens: 4096 }); capped.restore();
  assert.deepEqual(capped.calls[0].generation_config, { thinking_level: 'low', max_output_tokens: 4096 });
}

// 3. malformed JSON / timeout / rate-limit / empty keep their codes; timeout is logged.
{
  let r = inject([jsonRes(200, okPayload('not json'))]);
  await assert.rejects(provider.complete('x', {}), e => e.code === 'AI_INVALID_JSON'); r.restore();
  r = inject([Object.assign(new Error('a'), { name: 'AbortError' })]); const budget = provider.createBudget({ startedAt: 1000 });
  await assert.rejects(provider.complete('x', {}, { budget }), e => e.code === 'AI_TIMEOUT'); r.restore();
  assert.equal(provider.callSummary(budget).calls[0].outcome, 'timeout');
  r = inject([jsonRes(429, {})]);
  await assert.rejects(provider.complete('x', {}), e => e.code === 'AI_RATE_LIMITED'); r.restore();
  r = inject([jsonRes(200, { status: 'completed', steps: [] })]);
  await assert.rejects(provider.complete('x', {}), e => e.code === 'AI_EMPTY_RESPONSE'); r.restore();
}

// 4. usage record keeps only whitelisted, content-free fields.
{
  const logs = []; const orig = console.info; console.info = (...a) => logs.push(a.join(' '));
  const rec = recordUsage({ type: 'evaluate', answer: 'SECRET', calls: [{ model: 'm', status: 200, ms: 5, outcome: 'ok', body: 'SECRET' }], provider_ms: 5 });
  console.info = orig;
  assert.ok(!logs.join('').includes('SECRET'));
  assert.equal(rec.calls[0].ms, 5);
}

// 5. client: phases, error mapping, retry on network failure, abort, progress.
{
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const client = await import(pathToFileURL(path.join(root, 'dist/js/evaluate-client.js')).href);
  const fetchSeq = [];
  globalThis.fetch = async () => { const r = fetchSeq.shift(); if (r instanceof Error) throw r; return r; };
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body });

  fetchSeq.push(res(200, { report: {} }));
  const phases = [];
  await client.evaluateWithAi({ question_id: 'Q', answer: 'abcdef' }, { onPhase: p => phases.push(p.phase) });
  assert.deepEqual(phases, ['sending', 'validating', 'done']);

  fetchSeq.push(new TypeError('net'), res(200, { ok: 1 }));
  const seen = [];
  await client.evaluateWithAi({}, { onPhase: p => seen.push(p.phase) });
  assert.ok(seen.includes('retrying'));

  fetchSeq.push(new TypeError('net'), new TypeError('net'));
  await assert.rejects(client.evaluateWithAi({}), e => e.code === 'NETWORK' && e.message === client.ERROR_MESSAGES.NETWORK);

  fetchSeq.push(res(502, { code: 'AI_INVALID_JSON', error: 'x' }));
  await assert.rejects(client.evaluateWithAi({}), e => e.code === 'AI_INVALID_JSON' && /أعد الإرسال/.test(e.message));
  fetchSeq.push(res(504, {}));
  await assert.rejects(client.evaluateWithAi({}), e => e.code === 'AI_TIMEOUT' && e.message === client.TIMEOUT_MESSAGE);
  fetchSeq.push(res(429, { code: 'AI_RATE_LIMITED', retry_after: 30 }));
  await assert.rejects(client.evaluateWithAi({}), e => e.retryAfter === 30);

  // L-D: the one automatic network retry stays for evaluate/example/self-intro but not for transcribe (large re-upload).
  {
    let calls = 0;
    const counting = outcomes => { calls = 0; globalThis.fetch = async () => { calls += 1; const r = outcomes.shift(); if (r instanceof Error) throw r; return r; }; };
    counting([new TypeError('net'), res(200, { ok: 1 })]);
    await client.requestWorkedExample({});
    assert.equal(calls, 2, 'example retries once after a network failure');
    counting([new TypeError('net'), res(200, { ok: 1 })]);
    await client.improveSelfIntroduction({});
    assert.equal(calls, 2, 'self-intro retries once after a network failure');
    counting([new TypeError('net'), res(200, { ok: 1 })]);
    await client.evaluateWithAi({});
    assert.equal(calls, 2, 'evaluate retries once after a network failure');
    const audio = new Blob([new Uint8Array(2048)], { type: 'audio/webm' });
    const phasesSeen = [];
    counting([new TypeError('net'), res(200, { text: 'x' })]);
    await assert.rejects(client.transcribeWithAi(audio, 3, { onPhase: p => phasesSeen.push(p.phase) }), e => e.code === 'NETWORK');
    assert.equal(calls, 1, 'transcribe makes exactly one request (no automatic re-upload)');
    assert.ok(!phasesSeen.includes('retrying'));
    counting([new TypeError('net'), res(200, { text: 'x' })]);
    await assert.rejects(client.transcribeWithAi(audio, 3, { retries: 3 }), e => e.code === 'NETWORK');
    assert.equal(calls, 1, 'transcribe ignores a caller-supplied retries option');
    counting([res(200, { text: 'ok' })]);
    assert.equal((await client.transcribeWithAi(audio, 3)).text, 'ok');
    assert.equal(calls, 1);
    const clientSource = fs.readFileSync(path.join(root, 'dist/js/evaluate-client.js'), 'utf8');
    assert.ok(!clientSource.includes('لا أثر جانبي لها'), 'the false "no side effect" claim is gone from the comment');
  }

  const ctl = new AbortController();
  globalThis.fetch = (u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' }))));
  const pending = client.evaluateWithAi({}, { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(pending, e => e.code === 'ABORTED');

  const ticks = [];
  globalThis.fetch = async () => { await new Promise(r => setTimeout(r, 1200)); return res(200, {}); };
  await client.evaluateWithAi({}, { onProgress: p => ticks.push(p) });
  assert.ok(ticks.length >= 1 && ticks[0].elapsedMs >= 900 && ticks[0].expectedMs === 30000);
}
console.log('PASS ai-integration (provider call log, opt-in generation_config, usage whitelist, client phases/retry/abort/error mapping, transcribe without network retry)');
