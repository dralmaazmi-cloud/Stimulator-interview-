// alpha-4 — اختبارات الصمود (B1–B13): مزود وهمي، ساعة وهمية، sleep وrandom محقونان. لا شبكة ولا انتظار حقيقي.
import assert from 'node:assert/strict';
import evaluateHandler from '../api/evaluate.js';
import transcribeHandler from '../api/transcribe.js';
import { getQuestionContext } from '../api/_lib/data.js';
import {
  HANDLER_BUDGET_MS, MIN_REMAINING_TO_START_MS, RETRY_DELAYS_MS, RETRY_JITTER,
  callWithRetry, configureProviderDeps, createBudget, fallbackModelId, jitteredDelay, resetProviderDeps, complete, transcribe
} from '../api/_lib/provider.js';

const USER_TEXT = 'في بداية المشروع كان الفريق متأخرًا. كانت مهمتي إعادة توزيع العمل. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي. اكتمل المشروع في الموعد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
const context = getQuestionContext('C1-B3');
const goodReport = {
  question_id: 'C1-B3', rubric_mode: 'star_l',
  elements: {
    situation: { present: true, quote: 'في بداية المشروع كان الفريق متأخرًا' },
    task: { present: true, quote: 'كانت مهمتي إعادة توزيع العمل' },
    action: { present: true, quote: 'أنا عقدت اجتماعًا ووزعت الأدوار بنفسي' },
    result: { present: true, quote: 'اكتمل المشروع في الموعد' },
    learning: { present: true, quote: 'تعلمت أن المتابعة المبكرة تمنع التأخير' }
  },
  criteria: ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence']
    .map(key => ({ key, score: 4, evidence: ['في بداية المشروع كان الفريق متأخرًا'], justification: 'x' })),
  expected_points_coverage: [],
  behaviours_observed: { supporting: [], negative: [] },
  mission_command_indicators: [], flags: [], strengths: ['s'], missing: ['m'], next_actions: ['n'], follow_up_questions: []
};
const restPayload = text => ({
  id: 'v1', status: 'completed',
  usage: { total_tokens: 150, total_input_tokens: 100, total_output_tokens: 50 },
  steps: [{ type: 'model_output', content: [{ type: 'text', text }] }], object: 'interaction', model: 'x'
});
const jsonResponse = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const ok = text => jsonResponse(200, restPayload(text));
const providerError = status => jsonResponse(status, { error: { code: status, message: 'provider detail that must never leak', status: 'UNAVAILABLE' } });

function mockResponse() {
  return { statusCode: 200, headers: {}, payload: undefined, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(value) { this.payload = value ? JSON.parse(value) : undefined; } };
}
function evaluateRequest(ip) {
  return { method: 'POST', headers: { 'x-client-id': 'resilience', 'x-forwarded-for': ip }, socket: { remoteAddress: '127.0.0.1' }, body: { question_id: 'C1-B3', answer: USER_TEXT } };
}
let ipCounter = 0;
const nextIp = () => `10.1.0.${(ipCounter += 1) % 250}`;

// ساعة وهمية + sleep يسجل التأخيرات دون انتظار + random ببذرة ثابتة.
function fakeClock(start = 1_700_000_000_000) {
  let now = start;
  return { now: () => now, advance: ms => { now += ms; }, set: value => { now = value; } };
}
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
}
async function withProvider(responses, run, options = {}) {
  const calls = [];
  const sleeps = [];
  const clock = fakeClock();
  const queue = [...responses];
  const restore = configureProviderDeps({
    now: clock.now,
    sleep: async ms => { sleeps.push(ms); clock.advance(ms); },
    random: seededRandom(options.seed ?? 42),
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url: String(url), body, signal: init.signal });
      const next = queue.shift();
      if (typeof next === 'function') return next({ body, signal: init.signal, clock });
      if (next instanceof Error) throw next;
      return next;
    }
  });
  const savedEnv = { ...process.env };
  Object.assign(process.env, { GEMINI_API_KEY: 'resilience-test-key' }, options.env || {});
  ['GEMINI_EVALUATION_FALLBACK_MODEL', 'GEMINI_TRANSCRIBE_FALLBACK_MODEL', 'GEMINI_RETRY_MODEL'].forEach(key => { if (!(options.env || {})[key]) delete process.env[key]; });
  const logs = [];
  const originalInfo = console.info; const originalError = console.error;
  console.info = (...args) => logs.push(args.map(String).join(' '));
  console.error = (...args) => logs.push(args.map(String).join(' '));
  try {
    const result = await run({ calls, sleeps, clock, logs });
    return { result, calls, sleeps, clock, logs };
  } finally {
    console.info = originalInfo; console.error = originalError;
    restore(); resetProviderDeps();
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}
const allBodiesSafe = calls => calls.every(call => call.body.store === false && !('previous_interaction_id' in call.body));

// 1. 503 مرة ثم نجاح → نجاح بنداءين، مع تأخير أول ضمن النطاق.
{
  const { result, calls, sleeps } = await withProvider([providerError(503), ok(JSON.stringify(goodReport))], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  });
  assert.equal(result.statusCode, 200, JSON.stringify(result.payload));
  assert.equal(calls.length, 2);
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] >= RETRY_DELAYS_MS[0] * (1 - RETRY_JITTER) && sleeps[0] <= RETRY_DELAYS_MS[0] * (1 + RETRY_JITTER));
  assert.ok(allBodiesSafe(calls));
}
// 2. 503 ثلاث مرات بلا احتياطي → AI_OVERLOADED (503) وثلاثة نداءات، والرسالة العربية الثابتة.
{
  const { result, calls, sleeps, logs } = await withProvider([providerError(503), providerError(502), providerError(504)], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  });
  assert.equal(result.statusCode, 503);
  assert.equal(result.payload.code, 'AI_OVERLOADED');
  assert.equal(result.payload.error, 'خدمة الذكاء الاصطناعي مزدحمة الآن. إجابتك محفوظة؛ أعد الإرسال بعد دقيقة.');
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps.map(ms => Math.round(ms / 100) * 100 > 0), [true, true]);
  const usageLine = logs.find(line => line.startsWith('[usage]'));
  const usage = JSON.parse(usageLine.slice('[usage] '.length));
  assert.equal(usage.provider_call_count, 3);
  assert.equal(usage.fallback_used, false);
  assert.equal(usage.final_provider_status, 504);
  assert.equal(usage.error_code, 'AI_OVERLOADED');
  // B13: لا نص مستخدم ولا استجابة خام في السجلات.
  assert.ok(logs.every(line => !line.includes(USER_TEXT.slice(0, 20))), 'user text must not appear in logs');
  assert.ok(logs.every(line => !line.includes('provider detail that must never leak')), 'raw provider errors must not appear in logs');
}
// 3. 503 ثلاث مرات ثم احتياطي ناجح → نجاح بأربعة نداءات، النداء الرابع بالنموذج الاحتياطي.
{
  const { result, calls } = await withProvider([providerError(503), providerError(503), providerError(503), ok(JSON.stringify(goodReport))], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  }, { env: { GEMINI_EVALUATION_FALLBACK_MODEL: 'fallback-eval-model' } });
  assert.equal(result.statusCode, 200, JSON.stringify(result.payload));
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(call => call.body.model), ['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash', 'fallback-eval-model']);
  assert.ok(allBodiesSafe(calls));
}
// 4. 400 → نداء واحد، خطأ غير قابل لإعادة المحاولة.
{
  const { result, calls } = await withProvider([providerError(400)], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  }, { env: { GEMINI_EVALUATION_FALLBACK_MODEL: 'fallback-eval-model' } });
  assert.equal(calls.length, 1);
  assert.equal(result.statusCode, 502);
  assert.equal(result.payload.code, 'AI_PROVIDER_ERROR');
  assert.doesNotMatch(result.payload.error, /provider detail|UNAVAILABLE/);
}
// 5. 429 → نداء واحد، AI_RATE_LIMITED، retry_after من الترويسة كعدد ثوانٍ فقط.
{
  const { result, calls } = await withProvider([jsonResponse(429, { error: { message: 'quota' } }, { 'Retry-After': '30' })], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  }, { env: { GEMINI_EVALUATION_FALLBACK_MODEL: 'fallback-eval-model' } });
  assert.equal(calls.length, 1);
  assert.equal(result.statusCode, 429);
  assert.equal(result.payload.code, 'AI_RATE_LIMITED');
  assert.equal(result.payload.retry_after, 30);
  assert.doesNotMatch(result.payload.error, /quota/);
}
// 6. فشل شبكة ثم نجاح → نداءان.
{
  const { result, calls } = await withProvider([new TypeError('fetch failed'), ok(JSON.stringify(goodReport))], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  });
  assert.equal(result.statusCode, 200);
  assert.equal(calls.length, 2);
}
// 7. انتهاء مهلة النداء → AI_TIMEOUT بلا إعادة محاولة داخل الطلب نفسه.
{
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const { result, calls } = await withProvider([abort, ok(JSON.stringify(goodReport))], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  });
  assert.equal(calls.length, 1);
  assert.equal(result.statusCode, 504);
  assert.equal(result.payload.code, 'AI_TIMEOUT');
}
// 8. استنفاد deadline → لا نداء بعد الموعد؛ ومهلة كل نداء = الأصغر من 28 ثانية والمتبقي ناقص ثانية.
{
  const { result, calls, clock } = await withProvider([ok(JSON.stringify(goodReport))], async ({ clock: c }) => {
    const budget = createBudget({ startedAt: c.now(), maxCalls: 5 });
    assert.equal(budget.callTimeoutMs(), 28_000);
    c.advance(HANDLER_BUDGET_MS - 10_000);
    assert.equal(budget.callTimeoutMs(), 9_000, 'remaining minus one second');
    c.advance(10_000 - MIN_REMAINING_TO_START_MS + 1);
    assert.equal(budget.canStart(), false);
    let failure;
    try { await complete('prompt', {}, { budget }); } catch (error) { failure = error; }
    return failure;
  });
  assert.equal(result.code, 'AI_OVERLOADED');
  assert.equal(calls.length, 0, 'no provider call after the deadline');
  void clock;
}
// 9. مخطط غير صالح بعد نجاح متأخر → /evaluate لا يتجاوز خمسة نداءات إجمالًا.
{
  const badSchema = JSON.stringify({ ...goodReport, question_id: 'WRONG-ID' });
  const { result, calls } = await withProvider([
    providerError(503), providerError(503), providerError(503), ok(badSchema), // 4 نداءات (نقل + احتياطي) ثم مخطط فاشل
    ok(badSchema), ok(JSON.stringify(goodReport)) // إصلاح المخطط يستهلك النداء الخامس فقط؛ السادس لا يُنفَّذ أبدًا
  ], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  }, { env: { GEMINI_EVALUATION_FALLBACK_MODEL: 'fallback-eval-model', GEMINI_RETRY_MODEL: 'repair-model' } });
  assert.equal(calls.length, 5, 'evaluate must never exceed five provider calls');
  assert.equal(result.statusCode, 502);
  assert.equal(result.payload.code, 'AI_SCHEMA_FAILED');
}
// 10. jitter ضمن ±25% وبذرة ثابتة تعطي القيم نفسها.
{
  const a = Array.from({ length: 50 }, (_, index) => jitteredDelay(RETRY_DELAYS_MS[index % 2], seededRandom(7)));
  const b = Array.from({ length: 50 }, (_, index) => jitteredDelay(RETRY_DELAYS_MS[index % 2], seededRandom(7)));
  assert.deepEqual(a, b);
  const random = seededRandom(99);
  for (let index = 0; index < 500; index += 1) {
    const base = RETRY_DELAYS_MS[index % 2];
    const value = jitteredDelay(base, random);
    assert.ok(value >= base * 0.75 && value <= base * 1.25, `jitter out of range: ${value}`);
  }
}
// 12 (+B1/B7): فصل احتياطي الصوت عن التقييم، وتجاهل الاحتياطي الفارغ أو المساوي للأساسي.
{
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(3000, 1)]);
  const transcribeRequest = () => ({ method: 'POST', headers: { 'x-client-id': 'resilience-tr', 'x-forwarded-for': nextIp(), 'content-type': 'audio/webm', 'x-audio-duration': '3.5', 'content-length': String(webm.length) }, socket: { remoteAddress: '127.0.0.1' }, body: webm });
  // احتياطي التقييم معرّف فقط → التفريغ لا يستخدمه: ثلاثة نداءات ثم AI_OVERLOADED.
  const first = await withProvider([providerError(503), providerError(503), providerError(503), ok('نص')], async () => {
    const res = mockResponse(); await transcribeHandler(transcribeRequest(), res); return res;
  }, { env: { GEMINI_EVALUATION_FALLBACK_MODEL: 'fallback-eval-model' } });
  assert.equal(first.calls.length, 3);
  assert.equal(first.result.statusCode, 503);
  assert.equal(first.result.payload.code, 'AI_OVERLOADED');
  // احتياطي التفريغ معرّف → أربعة نداءات، الرابع بنموذج التفريغ الاحتياطي، ولا يُستخدم للتقييم.
  const second = await withProvider([providerError(503), providerError(503), providerError(503), ok('هذا تفريغ تجريبي')], async () => {
    const res = mockResponse(); await transcribeHandler(transcribeRequest(), res); return res;
  }, { env: { GEMINI_TRANSCRIBE_FALLBACK_MODEL: 'fallback-audio-model' } });
  assert.equal(second.result.statusCode, 200, JSON.stringify(second.result.payload));
  assert.equal(second.calls.length, 4);
  assert.equal(second.calls[3].body.model, 'fallback-audio-model');
  assert.ok(second.calls.every(call => Array.isArray(call.body.input) && call.body.input[1].type === 'audio'));
  assert.ok(allBodiesSafe(second.calls));
  const third = await withProvider([providerError(503), providerError(503), providerError(503), ok(JSON.stringify(goodReport))], async () => {
    const res = mockResponse(); await evaluateHandler(evaluateRequest(nextIp()), res); return res;
  }, { env: { GEMINI_TRANSCRIBE_FALLBACK_MODEL: 'fallback-audio-model' } });
  assert.equal(third.calls.length, 3, 'transcription fallback must never be used for evaluation');
  assert.equal(third.result.payload.code, 'AI_OVERLOADED');
  process.env.GEMINI_EVALUATION_FALLBACK_MODEL = 'gemini-3.8-flash';
  assert.equal(fallbackModelId('evaluation'), null, 'fallback equal to the primary model is ignored');
  process.env.GEMINI_EVALUATION_FALLBACK_MODEL = '   ';
  assert.equal(fallbackModelId('evaluation'), null, 'blank fallback is ignored');
  delete process.env.GEMINI_EVALUATION_FALLBACK_MODEL;
  assert.ok(allBodiesSafe([...first.calls, ...third.calls]));
}
// B3: السقف العام للنداءات يمنع تداخل العدادات (callWithRetry مباشرة مع ميزانية نداءين).
{
  const { calls, result } = await withProvider([providerError(503), providerError(503), ok('x')], async ({ clock: c }) => {
    const budget = createBudget({ startedAt: c.now(), maxCalls: 2 });
    let failure;
    try { await callWithRetry(model => ({ model, store: false }), { budget, primaryModel: 'p', fallbackModel: 'f' }); } catch (error) { failure = error; }
    return { failure, budget };
  });
  assert.equal(calls.length, 2);
  assert.equal(result.failure.code, 'AI_OVERLOADED');
  assert.equal(result.budget.calls, 2);
}
// transcribe() مباشرة: الاحتياطي لا يُستدعى إن كان مساويًا للأساسي.
{
  const { calls } = await withProvider([providerError(503), providerError(503), providerError(503)], async () => {
    let failure; try { await transcribe(Buffer.alloc(200, 1), 'audio/webm'); } catch (error) { failure = error; } return failure;
  }, { env: { GEMINI_TRANSCRIBE_MODEL: 'audio-model', GEMINI_TRANSCRIBE_FALLBACK_MODEL: 'audio-model' } });
  assert.equal(calls.length, 3);
}

console.log('PASS resilience: retry policy, budget/deadline, call caps, fallback roles, 429/400/timeout handling, store:false, safe logs.');
