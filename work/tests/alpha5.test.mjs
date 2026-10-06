// alpha-5 — اختبارات الخطوة 6 (3): R1، مجموع «حصلت على»، R6، 70 منشورًا، لا نموذج إجابة في طلبات المزود (تقييم ومثال)،
// 200 مقابلة كاملة، مقابلتان متتاليتان تغطيان الكفاءات الثماني، شروط زر المثال وإعادة الوسم، ترحيل قاعدة البيانات، F4.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ELEMENT_ORDER, WEIGHTS_VERSION, classifyByCompletion, completeElements, computeReportScore, fallbackSummary,
  normalizeReportForDisplay, scoreBreakdown
} from '../dist/js/scoring-rules.js';
import { retryLockPlan, rateLimitMessage } from '../dist/js/retry-plan.js';
import { composeFullInterview, composeQuestionSet } from '../dist/js/session-plan.js';
import { applyRecords, pickRotatedQuestions, shownRecords } from '../dist/js/rotation.js';
import { DB_VERSION, STORES, upgradeDatabase, attemptSummary, previousComparableAttempt } from '../dist/js/storage.js';
import { calculateScore } from '../api/_lib/scoring.js';
import { getQuestionContext, sampleAnswerTexts } from '../api/_lib/data.js';
import { buildEvaluationPrompt, buildExamplePrompt } from '../api/_lib/prompts.js';
import {
  EXAMPLE_COVERED_MESSAGE, cleanEvaluatorSentence, cleanSummary, nearReferenceModel, referenceSimilarityDetails,
  sanitizeEvaluation, sanitizeExample, traineeOverlap, verifyEvidence
} from '../api/_lib/validation.js';
import evaluateHandler from '../api/evaluate.js';
import exampleHandler, { PROMPT_VERSION as EXAMPLE_PROMPT_VERSION } from '../api/example.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const json = relative => JSON.parse(fs.readFileSync(path.join(project, relative), 'utf8'));
const questions = json('dist/data/derived/questions.json');
const competencies = json('dist/data/derived/competencies.json');
const missionMap = json('dist/data/derived/mission-map.json');
const curation = json('dist/data/derived/curation.json');

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
}
const CRITERIA = ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence'];
const elementsAllPresent = mode => Object.fromEntries(ELEMENT_ORDER[mode].map(key => [key, { present: true, quote: 'اقتباس حرفي من الإجابة هنا' }]));

// ---------- 70 منشورًا (46 star_l، 22 seal، 2 general) ----------
assert.equal(questions.length, 70);
assert.equal(questions.filter(item => item.rubric_mode === 'star_l').length, 46);
assert.equal(questions.filter(item => item.rubric_mode === 'seal').length, 22);
assert.equal(questions.filter(item => item.rubric_mode === 'general').length, 2);

// ---------- R1: كل المعايير 2/5 مع خمسة عناصر مذكورة → 0 مكتمل و«ضعيفة» ----------
{
  const report = { rubric_mode: 'star_l', elements: elementsAllPresent('star_l'), criteria: CRITERIA.map(key => ({ key, score: 2, evidence: ['x'] })) };
  const score = computeReportScore(report, 'behavioural', 'نص');
  assert.equal(score.elements_complete, 0);
  assert.equal(score.elements_total, 5);
  assert.equal(score.classification, 'ضعيفة');
  assert.equal(score.weights_version, 'phase2-1.1');
  assert.ok(Object.values(score.elements).every(item => item.present === true && item.complete === false));
  // المعيار غير الموثّق (unverified) لا يكمل عنصره حتى لو كانت درجته 3+.
  const unverified = { ...report, criteria: CRITERIA.map(key => ({ key, score: 4, evidence: [], unverified: key === 'action_or_plan' })) };
  const scoreU = computeReportScore(unverified, 'behavioural', 'نص');
  assert.equal(scoreU.elements.action.complete, false);
  assert.equal(scoreU.elements_complete, 4);
  assert.equal(scoreU.classification, 'متوسطة');
  // SEAL: أربعة عناصر؛ ينقص اثنان → ضعيفة.
  const seal = { rubric_mode: 'seal', elements: elementsAllPresent('seal'), criteria: CRITERIA.map(key => ({ key, score: ['context', 'action_or_plan'].includes(key) ? 4 : 2, evidence: ['x'] })) };
  const scoreS = computeReportScore(seal, 'scenario', 'نص');
  assert.equal(scoreS.elements_total, 4);
  assert.equal(scoreS.elements_complete, 2);
  assert.equal(scoreS.classification, 'ضعيفة');
  assert.equal(classifyByCompletion('seal', 3, 4, 50), 'متوسطة');
  assert.equal(classifyByCompletion('general', 0, 0, 80), 'قوية');
  // الخادم يستعمل الدالة نفسها.
  assert.deepEqual(calculateScore(report, 'behavioural', 'نص'), score);
  // تقرير محفوظ قديم (phase2-1.0 بلا complete) يُحسب عند العرض.
  const old = { ...report, trusted: true, final_score: 40, classification: 'قوية', weights_version: 'phase2-1.0' };
  const normalized = normalizeReportForDisplay(old, 'behavioural');
  assert.equal(normalized.elements_complete, 0);
  assert.equal(normalized.classification, 'ضعيفة');
  assert.equal(normalized.weights_version, WEIGHTS_VERSION);
  assert.equal(normalizeReportForDisplay({ ...old, trusted: false, final_score: null }, 'behavioural').classification, 'قوية', 'untrusted reports stay untouched');
}

// ---------- مجموع «حصلت على» يساوي الدرجة على 50 تقريرًا ببذور ثابتة ----------
{
  const random = seededRandom(2024);
  for (let index = 0; index < 50; index += 1) {
    const mode = index % 3 === 0 ? 'seal' : index % 3 === 1 ? 'star_l' : 'general';
    const type = mode === 'seal' ? 'scenario' : mode === 'star_l' ? 'behavioural' : 'general';
    const keys = mode === 'general' ? ['clarity', 'reasoning_depth', 'link_to_practice', 'realism_maturity'] : CRITERIA;
    const report = {
      rubric_mode: mode,
      elements: mode === 'general' ? {} : elementsAllPresent(mode),
      criteria: keys.map(key => ({ key, score: Math.floor(random() * 6), evidence: ['x'], unverified: random() < 0.15 }))
    };
    const breakdown = scoreBreakdown(report, type);
    const score = computeReportScore(report, type, 'نص الإجابة');
    const sum = breakdown.rows.reduce((total, row) => total + row.earned, 0);
    assert.equal(Math.round(sum * 100) / 100, score.final_score, `report ${index}: sum of earned must equal final score`);
    assert.equal(breakdown.total, score.final_score);
    assert.deepEqual(breakdown.rows.map(row => row.weight), [...breakdown.rows.map(row => row.weight)].sort((a, b) => b - a), 'rows ordered by weight');
    assert.ok(breakdown.rows.every(row => row.percent === Math.round(row.score / 5 * 100)));
  }
}

// ---------- R2: التنظيف يقص الأطوال ويحذف النسب و«من 100»؛ الملخص الاحتياطي ----------
{
  assert.equal(cleanEvaluatorSentence('أضف مؤشرًا للنتيجة (ارتفع 25%) ليصل 70 من 100.', 160), 'أضف مؤشرًا للنتيجة (ارتفع) ليصل.');
  assert.ok(cleanEvaluatorSentence('ك'.repeat(300), 160).length <= 160);
  assert.ok(cleanSummary('إجابة قوية بنسبة 80% ومنظمة', 240).length <= 240);
  assert.doesNotMatch(cleanSummary('إجابة قوية بنسبة 80% ومنظمة 3 من 5', 240), /[0-9%]|قوية/);
  const report = { rubric_mode: 'star_l', elements: elementsAllPresent('star_l'), criteria: CRITERIA.map(key => ({ key, score: key === 'action_or_plan' ? 2 : 4, evidence: ['x'] })) };
  assert.equal(fallbackSummary(report, 'behavioural', { action_or_plan: 'الإجراء الشخصي أو خطة العمل' }), 'اكتمل 4 من 5 عناصر. ابدأ بـ‹الإجراء الشخصي أو خطة العمل›.');
  const context = getQuestionContext('C1-B3');
  const sanitized = sanitizeEvaluation({ criteria: CRITERIA.map(key => ({ key, score: 3, evidence: [], justification: 'x', improve: 'ارفع 40% عبر ذكر النتيجة' })), summary: 'ملخص 90% إجابة ضعيفة', elements: {} }, context);
  assert.equal(sanitized.criteria[0].improve, 'ارفع عبر ذكر النتيجة');
  assert.equal(sanitized.summary, 'ملخص');
}

// ---------- R6: 30 و60 و600 و3600 ----------
{
  const plan = seconds => retryLockPlan({ code: 'AI_RATE_LIMITED', retryAfter: seconds });
  assert.deepEqual([plan(30).lockSeconds, plan(60).lockSeconds, plan(600).lockSeconds, plan(3600).lockSeconds], [30, 60, 120, 120]);
  assert.equal(plan(30).message, 'الخدمة مشغولة حاليًا. حاول بعد 30 ثانية.');
  assert.equal(plan(60).message, 'الخدمة مشغولة حاليًا. حاول بعد 60 ثانية.');
  assert.equal(plan(600).message, 'بلغت الخدمة حدّها المؤقت. يمكنك إعادة الإرسال بعد نحو 10 دقيقة. إجابتك محفوظة.');
  assert.equal(plan(3600).message, 'بلغت الخدمة حدّها المؤقت. يمكنك إعادة الإرسال بعد نحو 60 دقيقة. إجابتك محفوظة.');
  assert.equal(plan(90).message, rateLimitMessage(90));
  assert.equal(plan(91).message, 'بلغت الخدمة حدّها المؤقت. يمكنك إعادة الإرسال بعد نحو 2 دقيقة. إجابتك محفوظة.');
  assert.ok(plan(undefined).lockSeconds === 60 && !plan(undefined).advisory);
  assert.equal(retryLockPlan({ code: 'AI_OVERLOADED', message: 'x' }).advisory, true);
}

// ---------- D1/D2: 200 مقابلة كاملة بالتركيب الصحيح وأربع كفاءات مختلفة؛ مقابلتان متتاليتان تغطيان الثماني ----------
{
  const primaryIds = new Set(curation.primary_ids);
  const data = {
    questions,
    competencies,
    missionMap,
    questionById: new Map(questions.map(item => [item.id, item])),
    primaryQuestions: questions.filter(item => primaryIds.has(item.id))
  };
  const random = seededRandom(7);
  const rotation = new Map();
  const seenAi = new Set();
  for (let run = 0; run < 200; run += 1) {
    const set = composeFullInterview(data, rotation, random);
    assert.equal(set.length, 6, `run ${run}: six questions`);
    assert.deepEqual(set.slice(0, 2).map(item => item.type), ['behavioural', 'behavioural']);
    assert.deepEqual(set.slice(2, 4).map(item => item.type), ['scenario', 'scenario']);
    assert.ok(set.slice(0, 4).every(item => item.owner_type === 'competency' && item.rubric_mode !== 'general'));
    assert.equal(new Set(set.slice(0, 4).map(item => item.competency_id)).size, 4, `run ${run}: four distinct competencies`);
    assert.equal(set[4].owner_type, 'mission_command');
    assert.ok(['X1', 'X2'].includes(set[5].id));
    assert.equal(new Set(set.map(item => item.id)).size, 6);
    seenAi.add(set[5].id);
    set.forEach(item => applyRecords(rotation, shownRecords(item, new Date(1_700_000_000_000 + run * 60_000).toISOString(), rotation)));
  }
  assert.deepEqual([...seenAi].sort(), ['X1', 'X2'], 'rotation alternates X1/X2');
  // مقابلتان متتاليتان من حالة فارغة تغطيان الكفاءات الثماني.
  for (let seed = 1; seed <= 20; seed += 1) {
    const fresh = new Map();
    const rng = seededRandom(seed);
    const first = composeFullInterview(data, fresh, rng);
    first.forEach(item => applyRecords(fresh, shownRecords(item, '2026-01-01T00:00:00.000Z', fresh)));
    const second = composeFullInterview(data, fresh, rng);
    const covered = new Set([...first, ...second].slice(0).filter(item => item.competency_id).map(item => item.competency_id));
    assert.equal(covered.size, 8, `seed ${seed}: two consecutive full interviews must cover all eight competencies`);
  }
  // التركيب عبر composeQuestionSet: الوضع full بلا نطاق = التركيب الجديد؛ مع نطاق يبقى السلوك القائم.
  assert.equal(composeQuestionSet(data, 'full', '', null, { rotation: new Map(), random: seededRandom(3) }).length, 6);
  const scoped = composeQuestionSet(data, 'full', 'C1', null, { rotation: new Map(), random: seededRandom(3) });
  assert.ok(scoped.length > 0 && scoped.every(item => item.competency_id === 'C1'));
  const mission = composeQuestionSet(data, 'full', 'mission', null, { rotation: new Map(), random: seededRandom(3) });
  assert.equal(mission.length, 6);
  assert.deepEqual(mission.map(item => item.principle_id), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
  // الوصف F7/D1.
  assert.match(fs.readFileSync(path.join(project, 'dist/js/simulation.js'), 'utf8'), /تقديم الذات ثم ستة أسئلة: سلوكية وموقفية وقيادة بالمهمة وسؤال معرفي\./);
  // D2: غير المجرَّب قبل الجميع، ثم الأقدم.
  const pool = questions.filter(item => item.competency_id === 'C1');
  const rot = new Map();
  pool.forEach((item, index) => { if (index > 0) rot.set(`question:${item.id}`, { count: 1, last_shown_at: new Date(1_700_000_000_000 + index * 1000).toISOString() }); });
  assert.equal(pickRotatedQuestions(pool, 1, rot, seededRandom(1))[0].id, pool[0].id, 'untried question first');
  rot.set(`question:${pool[0].id}`, { count: 3, last_shown_at: '2026-09-01T00:00:00.000Z' });
  assert.equal(pickRotatedQuestions(pool, 1, rot, seededRandom(1))[0].id, pool[1].id, 'then the oldest shown');
}

// ---------- R5: ملخص المحاولة بلا نص إجابة؛ لا مقارنة مع غير موثوق أو بين نسخ أوزان مختلفة ----------
{
  const report = { trusted: true, final_score: 64, classification: 'متوسطة', weights_version: WEIGHTS_VERSION, elements_complete: 4, elements_total: 5, elements: { situation: { complete: true } }, criteria: [{ key: 'context', score: 4 }] };
  const summary = attemptSummary(report, 's1:0', '2026-10-01T00:00:00.000Z');
  assert.ok(!('answer' in summary) && !JSON.stringify(summary).includes('اقتباس'));
  assert.deepEqual(summary.criteria, { context: 4 });
  assert.equal(attemptSummary({ trusted: false, final_score: null }, 'k'), null, 'untrusted attempts are not recorded');
  const attempts = [{ key: 'a', at: '1', weights_version: 'phase2-1.0' }, { key: 'b', at: '2', weights_version: WEIGHTS_VERSION }, { key: 'c', at: '3', weights_version: WEIGHTS_VERSION }];
  assert.equal(previousComparableAttempt(attempts, 'c', WEIGHTS_VERSION).key, 'b');
  assert.equal(previousComparableAttempt(attempts, 'b', WEIGHTS_VERSION), null);
}

// ---------- الترحيل (DB_VERSION 3): تُنشأ المخازن الناقصة فقط ولا يُحذف شيء ----------
{
  assert.equal(DB_VERSION, 3);
  assert.ok(STORES.includes('attempts') && STORES.includes('rotation'));
  const existing = new Set(['settings', 'progress', 'stories', 'sessions', 'checklists', 'review', 'pending_recordings']);
  const created = [];
  const fakeDb = {
    objectStoreNames: { contains: name => existing.has(name) },
    createObjectStore: (name, options) => { assert.deepEqual(options, { keyPath: 'id' }); existing.add(name); created.push(name); },
    deleteObjectStore: () => { throw new Error('migration must never delete a store'); }
  };
  const result = upgradeDatabase(fakeDb, 2);
  assert.deepEqual(created, ['attempts', 'rotation']);
  assert.deepEqual(result, { from: 2, to: 3, created: ['attempts', 'rotation'] });
  assert.deepEqual(upgradeDatabase(fakeDb, 3).created, [], 'idempotent');
}

// ---------- الخطوة 5: شروط زر المثال وإعادة وسم المقاطع ----------
{
  const { exampleButtonVisible } = await import('../dist/js/report.js').catch(() => ({ exampleButtonVisible: null }));
  if (exampleButtonVisible) {
    const base = { trusted: true, final_score: 70, elements_complete: 5, elements_total: 5 };
    assert.equal(exampleButtonVisible(base, { rubric_mode: 'star_l' }), true, 'score < 80 → button');
    assert.equal(exampleButtonVisible({ ...base, final_score: 85 }, { rubric_mode: 'star_l' }), false, 'all complete and ≥ 80 → no button');
    assert.equal(exampleButtonVisible({ ...base, final_score: 85, elements_complete: 4 }, { rubric_mode: 'seal' }), true, 'incomplete element → button');
    assert.equal(exampleButtonVisible({ ...base, trusted: false, final_score: null }, { rubric_mode: 'star_l' }), false, 'untrusted → no button');
    assert.equal(exampleButtonVisible(base, { rubric_mode: 'general' }), false, 'general → no button');
  }
  const context = getQuestionContext('C1-B3');
  const answer = 'في بداية المشروع كان الفريق متأخرًا. كانت مهمتي إعادة توزيع العمل. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي.';
  const example = sanitizeExample({
    question_id: 'C1-B3', rubric_mode: 'star_l',
    segments: [
      { element: 'situation', text: 'في بداية المشروع كان الفريق متأخرًا.', source: 'trainee' },
      { element: 'task', text: 'درّبت الفريق على منهجية جديدة لم تُذكر إطلاقًا في أي مكان.', source: 'trainee' },
      { element: 'result', text: 'أنجزنا العمل بنسبة 90% قبل الموعد.', source: 'added' },
      { element: 'evaluation', text: 'عنصر من نموذج آخر يُسقط.', source: 'added' }
    ],
    additions: [{ criterion: 'result_or_effect', what: 'مؤشر 90% للنتيجة', why: 'بلا مؤشر' }, { criterion: 'clarity', what: 'x', why: 'y' }]
  }, { question: context.question, answer });
  assert.equal(example.segments.length, 3);
  assert.equal(example.segments[0].source, 'trainee');
  assert.equal(example.segments[1].source, 'added', 'trainee segment with < 70% overlap is relabelled added');
  assert.equal(example.relabelled_segments, 1);
  assert.doesNotMatch(example.segments[2].text, /90%/, 'scores/percentages are stripped');
  assert.doesNotMatch(example.additions[0].what, /90%/);
  assert.equal(example.additions.length, 1, 'criteria outside the mode are dropped');
  assert.ok(traineeOverlap('في بداية المشروع كان الفريق متأخرًا', answer) >= 0.7);
  const covered = sanitizeExample({ question_id: 'C1-B3', rubric_mode: 'star_l', segments: [{ element: 'situation', text: 'في بداية المشروع كان الفريق متأخرًا.', source: 'trainee' }], additions: [] }, { question: context.question, answer });
  assert.equal(covered.covered, true);
  assert.equal(covered.message, EXAMPLE_COVERED_MESSAGE);
  assert.equal(EXAMPLE_PROMPT_VERSION, 'example-1.0');
  // تظليل المضاف: خلفية وخط معًا (CSS) ومفتاح التظليل والتنبيه الحرفي في العرض.
  const css = fs.readFileSync(path.join(project, 'dist/css/styles.css'), 'utf8');
  assert.match(css, /mark\.example-added \{[^}]*background:[^}]*font-style: italic[^}]*font-weight: 700/);
  const reportText = fs.readFileSync(path.join(project, 'dist/js/report.js'), 'utf8');
  assert.match(reportText, /المظلَّل/);
  assert.match(reportText, /التفاصيل المظللة افتراضية للتوضيح\. استبدلها بما حدث معك فعلًا؛ لا تحفظها\./);
  assert.match(reportText, /مثال توضيحي يبيّن كيف تُقال الأجزاء الناقصة\. ليس إجابتك، ولا يُقيَّم\./);
  assert.match(reportText, /اعرض مثالًا مكتملًا على غرار موقفك/);
  assert.doesNotMatch(reportText, /تطوير قصتك|تحسين إجابتك/);
}

// ---------- F4: نسخ الإجابة الموسّعة حرفيًا يرفع تنبيه القرب من النموذج ----------
{
  const seal = questions.find(item => item.sample_answer_seal);
  const samples = sampleAnswerTexts(seal);
  const expandedText = Object.values(seal.sample_answer_seal).join(' ');
  assert.ok(samples.some(sample => sample.includes(expandedText.slice(0, 40))), 'sampleAnswerTexts must include sample_answer_seal');
  assert.ok(samples.some(sample => nearReferenceModel(referenceSimilarityDetails(expandedText, sample))), 'copying the expanded answer verbatim must be detected');
}

// ---------- لا نموذج إجابة في أي طلب ملتقَط للمزود (تقييم ومثال)؛ store:false؛ المثال عبر المعالج ----------
{
  const mockResponse = () => ({ statusCode: 200, headers: {}, payload: undefined, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(value) { this.payload = value ? JSON.parse(value) : undefined; } });
  const restPayload = text => ({ id: 'v1', status: 'completed', usage: { total_input_tokens: 10, total_output_tokens: 5 }, steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] });
  const ids = ['C1-B3', questions.find(item => item.sample_answer_seal).id, 'X1'];
  const answerText = 'في بداية المشروع كان الفريق متأخرًا عن الجدول. كانت مهمتي إعادة توزيع العمل. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي. اكتمل المشروع في الموعد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
  const originalFetch = globalThis.fetch;
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'alpha5-test-key';
  const bodies = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    const mode = /"rubric_mode":"seal"/.test(body.input) ? 'seal' : /"rubric_mode":"general"/.test(body.input) ? 'general' : 'star_l';
    const qid = (body.input.match(/"id":"([^"]+)"/) || [])[1];
    if (body.response_format?.schema?.properties?.segments) {
      const text = JSON.stringify({ question_id: qid, rubric_mode: mode, segments: [{ element: 'situation', text: 'في بداية المشروع كان الفريق متأخرًا عن الجدول.', source: 'trainee' }, { element: 'action', text: 'وافترضت خطة متابعة أسبوعية.', source: 'added' }], additions: [{ criterion: 'action_or_plan', what: 'خطة متابعة', why: 'الإجراء بلا متابعة' }] });
      return new Response(JSON.stringify(restPayload(text)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const keys = mode === 'general' ? ['clarity', 'reasoning_depth', 'link_to_practice', 'realism_maturity'] : CRITERIA;
    const elements = Object.fromEntries((ELEMENT_ORDER[mode] || []).map(key => [key, { present: true, quote: 'في بداية المشروع كان الفريق متأخرًا' }]));
    const report = { question_id: qid, rubric_mode: mode, elements, criteria: keys.map(key => ({ key, score: 3, evidence: ['في بداية المشروع كان الفريق متأخرًا'], justification: 'x', improve: 'y' })), expected_points_coverage: [], behaviours_observed: { supporting: [], negative: [] }, mission_command_indicators: [], flags: [], strengths: ['s'], missing: ['m'], next_actions: ['n'], follow_up_questions: [], summary: 'ملخص' };
    return new Response(JSON.stringify(restPayload(JSON.stringify(report))), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    let ip = 0;
    for (const id of ids) {
      const request = body => ({ method: 'POST', headers: { 'x-client-id': 'alpha5', 'x-forwarded-for': `10.9.0.${(ip += 1)}` }, socket: { remoteAddress: '127.0.0.1' }, body });
      const evaluateRes = mockResponse();
      await evaluateHandler(request({ question_id: id, answer: answerText }), evaluateRes);
      assert.equal(evaluateRes.statusCode, 200, JSON.stringify(evaluateRes.payload));
      assert.equal(evaluateRes.payload.meta.prompt_version, 'evaluation-1.2');
      assert.equal(evaluateRes.payload.report.weights_version, 'phase2-1.1');
      assert.ok('elements_complete' in evaluateRes.payload.report && 'elements_total' in evaluateRes.payload.report);
      assert.equal(evaluateRes.payload.report.summary, 'ملخص');
      if (id !== 'X1') {
        const exampleRes = mockResponse();
        await exampleHandler(request({ question_id: id, answer: answerText, missing_elements: ['result'], weak_criteria: ['learning'] }), exampleRes);
        assert.equal(exampleRes.statusCode, 200, JSON.stringify(exampleRes.payload));
        assert.equal(exampleRes.payload.meta.prompt_version, 'example-1.0');
        assert.ok(exampleRes.payload.example.segments.some(segment => segment.source === 'added'));
        assert.ok(!JSON.stringify(exampleRes.payload).match(/final_score|"score"/), 'example response carries no score');
      } else {
        const exampleRes = mockResponse();
        await exampleHandler(request({ question_id: id, answer: answerText }), exampleRes);
        assert.equal(exampleRes.statusCode, 400, 'general questions have no worked example');
      }
      const context = getQuestionContext(id);
      const samples = sampleAnswerTexts(context.question);
      assert.ok(samples.length, `${id} has model answers to protect`);
      bodies.forEach(body => {
        assert.strictEqual(body.store, false);
        assert.ok(!('previous_interaction_id' in body));
        samples.forEach(sample => assert.ok(!body.input.includes(sample), `provider request for ${id} leaked a model answer`));
        if (context.question.sample_answer_seal) Object.values(context.question.sample_answer_seal).forEach(part => assert.ok(!body.input.includes(part), 'expanded answer leaked'));
        if (context.question.sample_answer) assert.ok(!body.input.includes(context.question.sample_answer), 'guide paragraph leaked');
      });
    }
    assert.ok(bodies.some(body => body.response_format?.schema?.properties?.segments), 'example request captured');
    assert.ok(bodies.some(body => body.response_format?.schema?.properties?.criteria), 'evaluate request captured');
    // الحدّان ضمن حدّ التقييم: المثال يستهلك من حصة التقييم نفسها.
    const shared = body => ({ method: 'POST', headers: { 'x-client-id': 'shared-quota', 'x-forwarded-for': '10.9.1.1' }, socket: { remoteAddress: '127.0.0.1' }, body });
    for (let index = 0; index < 40; index += 1) { const r = mockResponse(); await exampleHandler(shared({ question_id: 'C1-B3', answer: answerText }), r); }
    const limited = mockResponse();
    await evaluateHandler(shared({ question_id: 'C1-B3', answer: answerText }), limited);
    assert.equal(limited.statusCode, 429, 'example calls count within the evaluate limit');
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey;
  }
  // prompt builders never embed model answers
  for (const id of ids) {
    const context = getQuestionContext(id);
    const prompt = buildEvaluationPrompt(context, answerText, []);
    const examplePrompt = id === 'X1' ? '' : buildExamplePrompt(context, answerText, ['result'], ['learning']);
    sampleAnswerTexts(context.question).forEach(sample => { assert.ok(!prompt.includes(sample)); assert.ok(!examplePrompt.includes(sample)); });
  }
}

// ---------- verifyEvidence يضع unverified الذي تعتمد عليه R1 ----------
{
  const context = getQuestionContext('C1-B3');
  const sanitized = sanitizeEvaluation({ elements: { situation: { present: true, quote: 'في بداية المشروع كان الفريق متأخرًا' } }, criteria: CRITERIA.map(key => ({ key, score: 4, evidence: key === 'context' ? ['في بداية المشروع كان الفريق متأخرًا'] : ['غير موجود في النص إطلاقًا'], justification: 'x', improve: 'y' })), summary: 's' }, context);
  const verified = verifyEvidence(sanitized, 'في بداية المشروع كان الفريق متأخرًا عن الجدول.');
  const completion = completeElements(verified.report);
  assert.equal(completion.elements.situation.complete, true);
  assert.equal(completion.elements_complete, 1);
}

console.log('PASS alpha-5: R1 completion rules, breakdown sums, R6 messages, 70 published, D1/D2 composition (200 runs), R5 attempts, DB migration, worked example, provider isolation.');
