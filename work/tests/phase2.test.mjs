import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import healthHandler from '../api/health.js';
import evaluateHandler from '../api/evaluate.js';
import transcribeHandler from '../api/transcribe.js';
import selfIntroHandler from '../api/self-intro.js';
import { getQuestionContext, sampleAnswerTexts } from '../api/_lib/data.js';
import { buildEvaluationPrompt } from '../api/_lib/prompts.js';
import { calculateScore, weightsForTesting } from '../api/_lib/scoring.js';
import { ngramSimilarity, normalizeArabic, referenceSimilarityDetails, nearReferenceModel, sanitizeEvaluation, shapeErrors, verifyEvidence } from '../api/_lib/validation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(project, relative));
const json = relative => JSON.parse(read(relative).toString('utf8'));

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(value) { this.payload = value ? JSON.parse(value) : undefined; }
  };
}

const requiredFiles = [
  'api/health.js', 'api/evaluate.js', 'api/transcribe.js', 'api/self-intro.js',
  'api/_lib/provider.js', 'api/_lib/schemas.js', 'api/_lib/prompts.js', 'api/_lib/validation.js',
  'api/_lib/scoring.js', 'api/_lib/rate-limit.js', 'api/_lib/usage.js',
  'dist/js/evaluate-client.js', 'dist/js/recorder.js', 'dist/js/report.js', 'dist/js/simulation.js',
  'dist/js/sessions.js'
];
requiredFiles.forEach(file => assert.ok(fs.existsSync(path.join(project, file)), `Missing ${file}`));

const referenceBytes = read('dist/data/reference.json');
const manifest = json('dist/data/derived/manifest.json');
const biasSuite = json('tests/answers/bias-suite.json');
assert.equal(crypto.createHash('sha256').update(referenceBytes).digest('hex'), manifest.reference_sha256,
  'Phase 2 must not alter the source reference');
assert.ok(biasSuite.fixtures.length >= 55, 'Live bias suite must contain at least 55 cases');
assert.equal(biasSuite.counts.copied_reference, 10);
assert.equal(biasSuite.counts.hypothetical_drift, 5);
assert.equal(biasSuite.counts.off_competency, 5);
assert.equal(biasSuite.counts.prompt_injection, 5, 'alpha-3: five prompt-injection cases');
assert.equal(biasSuite.counts.total, 95);
assert.ok(biasSuite.fixtures.filter(item => item.group === 'prompt_injection').every(item => item.injection_text && item.answer.includes(item.injection_text) && biasSuite.fixtures.some(other => other.id === item.expectation.compare_to)));

const context = getQuestionContext('C1-B3');
const sourceSamples = sampleAnswerTexts(context.question);
const prompt = buildEvaluationPrompt(context, 'شرحت الخطة بنفسي ثم طلبت من كل عضو أن يلخص دوره.', []);
assert.match(prompt, /C1-B3/);
assert.match(prompt, /إجابة المستخدم المصححة/);
assert.ok(sourceSamples.length);
sourceSamples.forEach(sample => assert.ok(!prompt.includes(sample), 'Evaluation prompt must never contain a source sample answer'));

const selfIntroContext = getQuestionContext('SELF-INTRO');
assert.equal(selfIntroContext.question.rubric_mode, 'self_intro');
assert.ok(selfIntroContext.rubricSections.some(section => section.number === '6.3'));

const userText = 'في بداية المشروع كان الفريق متأخرًا. كانت مهمتي إعادة توزيع العمل. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي. اكتمل المشروع في الموعد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
const rawReport = {
  question_id: 'C1-B3',
  rubric_mode: 'star_l',
  elements: {
    situation: { present: true, quote: 'في بداية المشروع كان الفريق متأخرًا' },
    task: { present: true, quote: 'كانت مهمتي إعادة توزيع العمل' },
    action: { present: true, quote: 'أنا عقدت اجتماعًا ووزعت الأدوار بنفسي' },
    result: { present: true, quote: 'اكتمل المشروع في الموعد' },
    learning: { present: true, quote: 'تعلمت أن المتابعة المبكرة تمنع التأخير' }
  },
  criteria: [
    { key: 'context', score: 4, evidence: ['في بداية المشروع كان الفريق متأخرًا'], justification: 'سياق واضح.' },
    { key: 'personal_role_or_options', score: 4, evidence: ['كانت مهمتي إعادة توزيع العمل'], justification: 'الدور واضح.' },
    { key: 'action_or_plan', score: 4, evidence: ['أنا عقدت اجتماعًا ووزعت الأدوار بنفسي'], justification: 'إجراء شخصي.' },
    { key: 'result_or_effect', score: 4, evidence: ['اكتمل المشروع في الموعد'], justification: 'نتيجة واضحة.' },
    { key: 'learning', score: 4, evidence: ['تعلمت أن المتابعة المبكرة تمنع التأخير'], justification: 'تعلم واضح.' },
    { key: 'competency_evidence', score: 4, evidence: ['اقتباس غير موجود في الإجابة'], justification: 'يجب رفض هذا الدليل.' }
  ],
  expected_points_coverage: [],
  behaviours_observed: { supporting: [], negative: [] },
  mission_command_indicators: [],
  flags: [],
  strengths: ['وضوح الموقف'],
  missing: ['مؤشر رقمي أدق'],
  next_actions: ['أضف مؤشرًا قابلًا للقياس.'],
  follow_up_questions: ['ما المؤشر الذي استخدمته لقياس النتيجة؟']
};

assert.deepEqual(shapeErrors(rawReport, 'C1-B3', 'star_l'), []);
const sanitized = sanitizeEvaluation(structuredClone(rawReport), context);
const verified = verifyEvidence(sanitized, userText);
assert.equal(verified.report.criteria.find(item => item.key === 'competency_evidence').score, 2,
  'A criterion without a literal verified quote must be capped at 2');
assert.equal(verified.report.criteria.find(item => item.key === 'competency_evidence').evidence.length, 0);
assert.equal(verified.failed, 1);

const score = calculateScore(verified.report, 'behavioural', userText);
assert.equal(score.final_score, 74);
assert.equal(score.classification, 'قوية');
assert.ok(score.action_ratio > 0);
assert.equal(Object.values(weightsForTesting().behavioural).reduce((sum, weight) => sum + weight, 0), 100);
assert.equal(Object.values(weightsForTesting().scenario).reduce((sum, weight) => sum + weight, 0), 100);
assert.equal(Object.values(weightsForTesting().general).reduce((sum, weight) => sum + weight, 0), 100);
assert.equal(Object.values(weightsForTesting().self_intro).reduce((sum, weight) => sum + weight, 0), 100);

assert.equal(normalizeArabic('أُجريت مُقابلة ناجحة'), normalizeArabic('اجريت مقابله ناجحه'));
assert.equal(ngramSimilarity('هذا نص مطابق تمامًا في كل الكلمات المهمة', 'هذا نص مطابق تمامًا في كل الكلمات المهمة', 4), 1);
assert.ok(ngramSimilarity('كلمات مختلفة تمامًا هنا', 'هذا نص آخر لا يشبه الأول', 4) < 0.35);

const malformed = structuredClone(rawReport);
malformed.criteria.pop();
assert.ok(shapeErrors(malformed, 'C1-B3', 'star_l').includes('criteria'));
const duplicate = structuredClone(rawReport);
duplicate.criteria[5].key = 'context';
assert.ok(shapeErrors(duplicate, 'C1-B3', 'star_l').includes('criteria.keys'));

const clientText = fs.readdirSync(path.join(project, 'dist/js'))
  .map(file => read(`dist/js/${file}`).toString('utf8')).join('\n');
assert.doesNotMatch(clientText, /GEMINI_API_KEY|GOOGLE_API_KEY|AIza[0-9A-Za-z_-]{20,}/,
  'Provider credentials or environment variable names must not appear in the client');
assert.match(read('api/_lib/provider.js').toString('utf8'), /process\.env\.GEMINI_API_KEY/);
assert.match(read('api/_lib/provider.js').toString('utf8'), /'audio\/mp4': 'audio\/m4a'/,
  'iOS audio MIME must be mapped to a provider-supported MIME');
assert.match(read('dist/sw.js').toString('utf8'), /url\.pathname\.startsWith\('\/api\/'\)/,
  'Service worker must never cache API responses');
assert.match(read('dist/js/recorder.js').toString('utf8'), /MAX_SECONDS = 120/);
assert.match(read('dist/js/recorder.js').toString('utf8'), /MAX_BYTES = 4 \* 1024 \* 1024/);
assert.match(read('dist/js/simulation.js').toString('utf8'), /راجع التفريغ وصححه/);
assert.match(read('dist/js/simulation.js').toString('utf8'), /SELF-INTRO/);
// alpha-5 (F2): زر التقرير «قارن بالإجابة النموذجية»، ونص النافذة الجديد.
assert.match(read('dist/js/report.js').toString('utf8'), /قارن بالإجابة النموذجية/);
assert.match(read('dist/js/report.js').toString('utf8'), /للمقارنة بعد التقييم، وليست الإجابة الصحيحة الوحيدة\./);
assert.doesNotMatch(read('dist/js/report.js').toString('utf8'), /التصنيف النوعي/, 'old header label removed (R3)');

const savedGemini = process.env.GEMINI_API_KEY;
const savedGoogle = process.env.GOOGLE_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
try {
  const healthRes = mockResponse();
  await healthHandler({ method: 'GET', headers: {} }, healthRes);
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.payload.phase, 2);
  assert.equal(healthRes.payload.ai.configured, false);

  const evaluateRes = mockResponse();
  await evaluateHandler({
    method: 'POST',
    headers: { 'x-client-id': 'phase2-test' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { question_id: 'C1-B3', answer: userText }
  }, evaluateRes);
  assert.equal(evaluateRes.statusCode, 503);
  assert.equal(evaluateRes.payload.code, 'AI_NOT_CONFIGURED');
  assert.doesNotMatch(evaluateRes.payload.error, /Gemini|جيميناي/i);
} finally {
  if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGemini;
  if (savedGoogle === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = savedGoogle;
}

// alpha-3 البند 1: بوابة الثقة بثلاث حالات (أ، ب، ج) عبر verifyEvidence + الحالة القائمة (5/6 → 74) تبقى.
{
  const keys = ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence'];
  const trustedBy = verified => verified.failureRate <= 0.3 && verified.unverifiedCriteria <= Math.floor(verified.scoredCriteria / 2);
  const emptyElements = () => Object.fromEntries(['situation', 'task', 'action', 'result', 'learning'].map(key => [key, { present: false, quote: null }]));
  const buildRaw = criteria => ({ ...structuredClone(rawReport), elements: emptyElements(), criteria, strengths: [], missing: [], flags: ['generic'] });
  // (أ) معياران بدرجة 2 ودليل صحيح + أربعة بدرجة 0 بلا دليل
  const caseA = verifyEvidence(sanitizeEvaluation(buildRaw(keys.map((key, index) => ({
    key, score: index < 2 ? 2 : 0, evidence: index < 2 ? ['في بداية المشروع كان الفريق متأخرًا'] : [], justification: 'x'
  }))), context), userText);
  assert.equal(caseA.scoredCriteria, 2);
  assert.equal(caseA.unverifiedCriteria, 0);
  assert.equal(trustedBy(caseA), true, '(أ) must be trusted');
  const scoreA = calculateScore(caseA.report, 'behavioural', userText);
  assert.ok(scoreA.final_score > 0 && scoreA.final_score < 50, '(أ) low numeric score');
  assert.equal(scoreA.classification, 'ضعيفة');
  // (ب) ستة معايير بدرجات 3–5 بلا أي اقتباس
  const caseB = verifyEvidence(sanitizeEvaluation(buildRaw(keys.map((key, index) => ({ key, score: 3 + (index % 3), evidence: [], justification: 'x' }))), context), userText);
  assert.equal(caseB.scoredCriteria, 6);
  assert.equal(caseB.unverifiedCriteria, 6);
  assert.equal(trustedBy(caseB), false, '(ب) must be untrusted');
  // (ج) كل المعايير 0 بلا اقتباسات
  const caseC = verifyEvidence(sanitizeEvaluation(buildRaw(keys.map(key => ({ key, score: 0, evidence: [], justification: 'x' }))), context), userText);
  assert.equal(caseC.scoredCriteria, 0);
  assert.equal(caseC.unverifiedCriteria, 0);
  assert.equal(trustedBy(caseC), true, '(ج) must be trusted');
  // الحالة القائمة: 5/6 موثقة
  assert.equal(verified.scoredCriteria, 6);
  assert.equal(verified.unverifiedCriteria, 1);
  assert.equal(trustedBy(verified), true);
}

// البند 5: طول الاقتباس — كلمة واحدة تُرفض، وثلاث كلمات تُقبل.
{
  const shortQuoteReport = sanitizeEvaluation(structuredClone(rawReport), context);
  shortQuoteReport.criteria[0].evidence = ['المشروع'];
  shortQuoteReport.criteria[1].evidence = ['كانت مهمتي إعادة'];
  const checked = verifyEvidence(shortQuoteReport, userText);
  assert.equal(checked.report.criteria[0].evidence.length, 0, 'A one-word quote must be rejected even if literal');
  assert.equal(checked.report.criteria[0].unverified, true);
  assert.deepEqual(checked.report.criteria[1].evidence, ['كانت مهمتي إعادة'], 'A three-word literal quote must be accepted');
  assert.equal(checked.verifiedCriteria, 4, 'verifiedCriteria counts criteria with score > 0 and at least one verified quote');
}
// البند 5: اكتشاف النسخ المعاد صياغته من نموذج الدليل.
{
  const sample = sourceSamples[0];
  const paraphrased = sample.split(' ').map((word, index) => (index % 6 === 0 ? 'كذلك' : word)).join(' ');
  assert.ok(nearReferenceModel(referenceSimilarityDetails(sample, sample)));
  assert.ok(nearReferenceModel(referenceSimilarityDetails(paraphrased, sample)), 'Lightly paraphrased guide answer must still be detected');
  assert.ok(!nearReferenceModel(referenceSimilarityDetails(userText, sample)), 'A genuinely different answer must not be flagged');
}

// شكل الاستجابة الموثق من Interactions API (REST): steps[] + usage.
const restPayload = (text, extra = {}) => ({
  id: 'v1_test', status: 'completed',
  usage: { total_tokens: 150, total_input_tokens: 100, total_output_tokens: 50 },
  steps: [{ type: 'thought', signature: 'x' }, { type: 'model_output', content: [{ type: 'text', text }] }],
  object: 'interaction', model: 'gemini-3.8-flash',
  ...extra
});
const originalFetch = globalThis.fetch;
process.env.GEMINI_API_KEY = 'phase2-test-key';
try {
  const providerBodies = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/interactions');
    const providerBody = JSON.parse(options.body);
    providerBodies.push(providerBody);
    assert.equal(providerBody.model, 'gemini-3.8-flash');
    if (Array.isArray(providerBody.input)) {
      return new Response(JSON.stringify(restPayload('هذا تفريغ تجريبي للتسجيل الصوتي.')), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (providerBody.response_format?.schema?.properties?.facts_preserved) {
      return new Response(JSON.stringify(restPayload(JSON.stringify({ text: 'أنا مدير فريق العمليات وأتولى قيادة فريق متعدد التخصصات.', changes: ['ربط الجمل'], facts_preserved: true }))), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(providerBody.response_format.mime_type, 'application/json');
    sourceSamples.forEach(sample => assert.ok(!providerBody.input.includes(sample), 'Provider request leaked a source model answer'));
    if (providerBody.input.includes('ALL-ZERO') || providerBody.input.includes('NO-QUOTES')) {
      const zero = providerBody.input.includes('ALL-ZERO');
      const variant = {
        ...structuredClone(rawReport),
        elements: Object.fromEntries(Object.keys(rawReport.elements).map(key => [key, { present: false, quote: null }])),
        criteria: rawReport.criteria.map((item, index) => ({ ...item, score: zero ? 0 : 3 + (index % 3), evidence: [] }))
      };
      return new Response(JSON.stringify(restPayload(JSON.stringify(variant))), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (providerBody.input.includes('FAILED-STATUS')) {
      return new Response(JSON.stringify(restPayload('', { status: 'failed', steps: [] })), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // JSON محاط بمسافات وأسطر زائدة يجب أن يُقتطع قبل التحليل.
    return new Response(JSON.stringify(restPayload(`\n\n  ${JSON.stringify(rawReport)}\n`)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const livePathRes = mockResponse();
  await evaluateHandler({
    method: 'POST',
    headers: { 'x-client-id': 'phase2-mocked-success', 'x-forwarded-for': '10.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { question_id: 'C1-B3', answer: userText }
  }, livePathRes);
  assert.equal(livePathRes.statusCode, 200);
  assert.equal(livePathRes.payload.report.final_score, 74);
  assert.equal(livePathRes.payload.report.trusted, true);
  assert.equal(livePathRes.payload.report.verification.rejected_quotes, 1);
  assert.equal(livePathRes.payload.report.verification.verified_criteria, 5);
  assert.equal(livePathRes.payload.meta.reference_sha256, manifest.reference_sha256);

  // alpha-3 البند 1 عبر المعالج: (ج) كل المعايير 0 بلا اقتباسات → 200، موثوق، الدرجة 0، «ضعيفة».
  const zeroRes = mockResponse();
  await evaluateHandler({
    method: 'POST',
    headers: { 'x-client-id': 'phase2-all-zero', 'x-forwarded-for': '10.0.0.5' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { question_id: 'C1-B3', answer: `${userText} ALL-ZERO` }
  }, zeroRes);
  assert.equal(zeroRes.statusCode, 200, JSON.stringify(zeroRes.payload));
  assert.equal(zeroRes.payload.report.trusted, true);
  assert.equal(zeroRes.payload.report.final_score, 0);
  assert.equal(zeroRes.payload.report.classification, 'ضعيفة');
  assert.equal(zeroRes.payload.report.verification.scored_criteria, 0);
  // (ب) عبر المعالج: ستة معايير مُدرَّجة بلا اقتباسات → غير موثوق بلا درجة.
  const noQuotesRes = mockResponse();
  await evaluateHandler({
    method: 'POST',
    headers: { 'x-client-id': 'phase2-no-quotes', 'x-forwarded-for': '10.0.0.6' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { question_id: 'C1-B3', answer: `${userText} NO-QUOTES` }
  }, noQuotesRes);
  assert.equal(noQuotesRes.statusCode, 200, JSON.stringify(noQuotesRes.payload));
  assert.equal(noQuotesRes.payload.report.trusted, false);
  assert.equal(noQuotesRes.payload.report.final_score, null);
  assert.equal(noQuotesRes.payload.report.verification.unverified_criteria, 6);

  // البند 1: status غير completed → 502 برسالة عربية ثابتة.
  const failedRes = mockResponse();
  await evaluateHandler({
    method: 'POST',
    headers: { 'x-client-id': 'phase2-failed-status', 'x-forwarded-for': '10.0.0.2' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { question_id: 'C1-B3', answer: `${userText} FAILED-STATUS` }
  }, failedRes);
  assert.equal(failedRes.statusCode, 502);
  assert.equal(failedRes.payload.code, 'AI_PROVIDER_ERROR');
  assert.doesNotMatch(failedRes.payload.error, /Gemini|Google|failed/i);

  // البند 1: الخصوصية لدى المزود — store: false في التفريغ وتحسين تقديم الذات أيضًا.
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(600, 1)]);
  const transcribeRes = mockResponse();
  await transcribeHandler({
    method: 'POST',
    headers: { 'x-client-id': 'phase2-transcribe', 'x-forwarded-for': '10.0.0.3', 'content-type': 'audio/webm;codecs=opus', 'x-audio-duration': '5', 'content-length': String(webm.length) },
    socket: { remoteAddress: '127.0.0.1' },
    body: webm
  }, transcribeRes);
  assert.equal(transcribeRes.statusCode, 200, JSON.stringify(transcribeRes.payload));
  assert.match(transcribeRes.payload.transcript, /تفريغ تجريبي/);

  const selfIntroRes = mockResponse();
  await selfIntroHandler({
    method: 'POST',
    headers: { 'x-client-id': 'phase2-self-intro', 'x-forwarded-for': '10.0.0.4' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { text: 'أنا مدير فريق العمليات وأتولى حاليًا قيادة فريق متعدد التخصصات. بدأت مسيرتي مشرف عمليات.', duration: 60 }
  }, selfIntroRes);
  assert.equal(selfIntroRes.statusCode, 200, JSON.stringify(selfIntroRes.payload));

  // alpha-3 البند 2: حدّان معًا — (IP + معرّف) 40/ساعة، وIP 200/ساعة مشترك.
  {
    const call = async (client, ip) => {
      const res = mockResponse();
      await evaluateHandler({
        method: 'POST',
        headers: { 'x-client-id': client, 'x-forwarded-for': ip },
        socket: { remoteAddress: '127.0.0.1' },
        body: { question_id: 'C1-B3', answer: 'قصير' }
      }, res);
      return res;
    };
    let last;
    for (let index = 0; index < 41; index += 1) last = await call('rl-same', '10.0.0.77');
    assert.equal(last.statusCode, 429, '41st request with the same client id must be rate limited');
    assert.equal(last.payload.code, 'RATE_LIMITED');
    const other = await call('rl-other', '10.0.0.77');
    assert.equal(other.statusCode, 400, 'another client id from the same IP still passes (validation 400, not 429)');
    let hit = null;
    for (let index = 0; index < 220 && hit == null; index += 1) {
      const res = await call(`rl-fresh-${index}`, '10.0.0.77');
      if (res.statusCode === 429) hit = index;
    }
    // 41 + 1 + 158 = 200 → الطلب 201 من العنوان يُرفض.
    assert.equal(hit, 158, 'the IP cap must trigger exactly when the address reaches 200 requests');
    const otherIp = await call('rl-fresh-0', '10.0.0.78');
    assert.equal(otherIp.statusCode, 400, 'a different IP is unaffected');
  }

  const kinds = providerBodies.map(body => Array.isArray(body.input) ? 'transcribe' : body.response_format?.schema?.properties?.facts_preserved ? 'self-intro' : 'evaluate');
  assert.ok(['evaluate', 'transcribe', 'self-intro'].every(kind => kinds.includes(kind)), 'All three provider request kinds must be exercised');
  providerBodies.forEach((body, index) => assert.strictEqual(body.store, false, `Provider request ${kinds[index]} must set store: false`));
  assert.ok(providerBodies.every(body => !('previous_interaction_id' in body)), 'Provider-side conversation storage must never be used');
  const transcribeBody = providerBodies.find(body => Array.isArray(body.input));
  assert.equal(transcribeBody.input[1].mime_type, 'audio/webm', 'MIME parameters must be stripped before reaching the provider');
} finally {
  globalThis.fetch = originalFetch;
  if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGemini;
}

console.log('PASS phase 2 engine: prompt isolation, schema checks, quote verification, REST response shape, store:false, scoring, API safety.');
