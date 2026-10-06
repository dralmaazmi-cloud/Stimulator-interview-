import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectSessionQuestions } from '../dist/js/sim.js';
import { buildAnswerGuidance } from '../dist/js/guidance.js';
import { buildSelfIntroduction } from '../dist/js/self-intro.js';
import { buildSessionInsights } from '../dist/js/report.js';
import { printBookQuestionIds } from '../dist/js/print-book.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(project, relative));
const text = relative => read(relative).toString('utf8');
const json = relative => JSON.parse(text(relative));

const referenceBytes = read('dist/data/reference.json');
const reference = JSON.parse(referenceBytes.toString('utf8'));
const questions = json('dist/data/derived/questions.json');
const competencies = json('dist/data/derived/competencies.json');
const missionMap = json('dist/data/derived/mission-map.json');
const lessons = json('dist/data/derived/lessons.json');
const variants = json('dist/data/derived/variants.json');
const curation = json('dist/data/derived/curation.json');
const audit = json('dist/data/derived/question-audit.json');
const exercises = json('dist/data/exercises.json');
const manifest = json('dist/data/derived/manifest.json');
const expandedAnswers = json('dist/data/expanded-model-answers.json');
const expandedIds = new Set(expandedAnswers.answers.map(item => item.id));

function sourceQuestions() {
  return [
    ...reference.part_3_competencies.competencies.flatMap(item => [...item.scenario_questions, ...item.behavioural_questions]),
    ...reference.part_4_mission_command.principles.flatMap(item => [item.scenario_question, item.behavioural_question]),
    ...reference.part_5_additional_questions.questions
  ];
}

// alpha-5 (C1): X1 وX2 يُنشران بإجابة الدليل (فقرة) بنموذج general.
const PARAGRAPH_IDS = new Set(['X1', 'X2']);
function completeParagraph(question) {
  return PARAGRAPH_IDS.has(question?.id) && typeof question.sample_answer === 'string' && question.sample_answer.trim().length > 0;
}

function completeModel(question) {
  const model = question?.sample_answer_star_l;
  const action = model?.action ?? model?.action_points;
  return [model?.situation, model?.task, action, model?.result, model?.learning]
    .every(value => Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0);
}

const source = sourceQuestions();
const sourceById = new Map(source.map(item => [item.id, item]));
const accepted = source.filter(item => completeModel(item) || expandedIds.has(item.id) || completeParagraph(item));
const excluded = source.filter(item => !completeModel(item) && !expandedIds.has(item.id) && !completeParagraph(item));
const derivedById = new Map(questions.map(item => [item.id, item]));

assert.equal(reference.schema_version, '1.0');
assert.equal(source.length, 127);
assert.equal(expandedAnswers.count, 22);
// alpha-5 (F1): الملف الموسّع يُوضع كما هو من المالك؛ الـHash ثابت ولا كلمات مشوّهة (لام-ألف مفكوكة) في أي إجابة.
const expandedBytes = read('dist/data/expanded-model-answers.json');
assert.equal(crypto.createHash('sha256').update(expandedBytes).digest('hex'),
  'b81bd2d1a60cc6b47a45c85a15f7503b4e5f8bb28b892372d5ec5be43054160b', 'expanded-model-answers.json must be the owner attachment, unmodified');
assert.equal(manifest.expanded_answers_sha256, 'b81bd2d1a60cc6b47a45c85a15f7503b4e5f8bb28b892372d5ec5be43054160b');
const corruptedWords = ['معالفريق', 'الصالحيات', 'زمالئه', 'العامالن', 'لللأسئلة', 'الاختالف', 'االستقاللية', 'املالحظات', 'الزمالء', 'لالختبار', 'باملهام', 'الأولوايت'];
const expandedText = expandedBytes.toString('utf8');
corruptedWords.forEach(word => assert.ok(!expandedText.includes(word), `Corrupted word «${word}» must not appear in expanded answers`));
assert.ok(!fs.existsSync(path.join(project, 'tools/import-expanded-answers.py')), 'import script must be deleted (F1)');
// alpha-5 (C1): المنشور 70 (46 star_l، 22 seal، 2 general) والمستبعد 57.
assert.equal(accepted.length, 70);
assert.equal(excluded.length, 57);
assert.equal(questions.length, 70);
assert.equal(new Set(questions.map(item => item.id)).size, 70);
assert.deepEqual(new Set(questions.map(item => item.id)), new Set(accepted.map(item => item.id)));
assert.equal(questions.filter(item => item.rubric_mode === 'seal').length, 22);
assert.equal(questions.filter(item => item.rubric_mode === 'star_l').length, 46);
assert.equal(questions.filter(item => item.rubric_mode === 'general').length, 2);
assert.deepEqual(questions.filter(item => item.rubric_mode === 'general').map(item => item.id).sort(), ['X1', 'X2']);
assert.ok(questions.every(item => item.learning_status === 'primary'));
assert.ok(questions.every(item => ['complete_source_star_l', 'approved_expanded_seal', 'complete_source_paragraph'].includes(item.model_answer_status)));
assert.ok(questions.filter(item => item.model_answer_status === 'complete_source_paragraph').every(item => PARAGRAPH_IDS.has(item.id) && item.rubric_mode === 'general'));
assert.ok(questions.every(item => completeModel(item) || item.sample_answer_seal || completeParagraph(item)), 'Every published question must contain a complete model answer');
assert.match(text('dist/js/app.js'), /complete_source_paragraph/, 'integrity check must accept the new status (C1)');
assert.ok(excluded.every(item => !derivedById.has(item.id)), 'No incomplete/general answer may remain in the published bank');

for (const question of questions) {
  const original = sourceById.get(question.id);
  assert.ok(original, `Missing source question ${question.id}`);
  assert.equal(question.question, original.question, `Question text changed: ${question.id}`);
  assert.deepEqual(question.sample_answer_star_l, original.sample_answer_star_l, `Source model answer changed: ${question.id}`);
  assert.equal(question.sample_answer, original.sample_answer, `Guide sample_answer changed: ${question.id}`);
  if (expandedIds.has(question.id)) assert.ok(question.sample_answer_seal?.leadership_impact, `Missing expanded SEAL answer: ${question.id}`);
}

assert.equal(competencies.length, 8);
assert.equal(missionMap.length, 6);
assert.equal(questions.filter(item => item.owner_type === 'competency').length, 56);
assert.equal(questions.filter(item => item.owner_type === 'mission_command').length, 12);
assert.equal(questions.filter(item => item.owner_type === 'additional').length, 2);
assert.deepEqual(Object.fromEntries(competencies.map(item => [item.id, item.question_ids.length])),
  { C1: 5, C2: 5, C3: 13, C4: 6, C5: 6, C6: 10, C7: 6, C8: 5 });
assert.ok(missionMap.every(item => item.question_ids.length === 2));

assert.deepEqual(lessons.map(item => item.title), [
  'افهم المقابلة', 'بناء الإجابة النموذجية', 'الكفاءات الثمانية', 'قيادة المهمة', 'الجاهزية النهائية'
]);
assert.equal(exercises.length, 0, 'Preparation must not contain comprehension quizzes');
assert.equal(variants.length, 0);
assert.equal(curation.policy, 'complete-model-answers-only');
assert.equal(curation.primary_count, 70);
assert.equal(curation.alternate_count, 0);
assert.deepEqual(curation.primary_ids, questions.map(item => item.id));

assert.equal(audit.source_question_count, 127);
assert.equal(audit.published_question_count, 70);
assert.equal(audit.excluded_question_count, 57);
assert.equal(audit.published.length, 70);
assert.equal(audit.excluded.length, 57);
assert.deepEqual(new Set(audit.published.map(item => item.id)), new Set(questions.map(item => item.id)));
assert.deepEqual(new Set(audit.excluded.map(item => item.id)), new Set(excluded.map(item => item.id)));
assert.ok(audit.excluded.every(item => item.reason && item.status === 'excluded'));

assert.deepEqual(manifest.counts, {
  competencies: 8,
  competency_questions: 56,
  mission_command_principles: 6,
  mission_command_questions: 12,
  additional_questions: 2,
  total_questions: 70,
  source_questions: 127,
  excluded_questions: 57,
  unique_question_ids: 70,
  primary_questions: 70,
  alternate_questions: 0,
  variant_pairs: 0,
  lessons: 5,
  exercises: 0
});
assert.equal(manifest.config_version, '6.0');
assert.deepEqual(manifest.source_block_counts, {
  part_1_framework: { paragraph: 8, list: 3, key_point: 3, table: 2 },
  part_2_answering: { paragraph: 7, table: 6, key_point: 2, list: 1 },
  part_4_mission_command: { paragraph: 2, key_point: 1 },
  part_5_additional_questions: { paragraph: 1 },
  part_6_preparation: { paragraph: 5, list: 3, table: 2, template: 1, key_point: 1 }
});

const hash = crypto.createHash('sha256').update(referenceBytes).digest('hex');
assert.equal(hash, manifest.reference_sha256);
assert.equal(hash, audit.reference_sha256);
assert.equal(hash, '51d413def77dd11a33a672222acbad46e9612da0f2d202bc28537928c2b7a357');

for (let iteration = 0; iteration < 300; iteration += 1) {
  let state = (iteration + 1) * 2654435761 >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const selected = selectSessionQuestions(questions, 12, random);
  assert.equal(new Set(selected.map(item => item.id)).size, selected.length);
}

const requiredFiles = [
  'dist/index.html', 'dist/manifest.webmanifest', 'dist/sw.js',
  'dist/assets/images/abu-dhabi-sea-hero.jpg',
  'dist/assets/icons/app-icon-1024.png', 'dist/assets/icons/apple-touch-icon-180.png',
  'dist/assets/icons/icon-192.png', 'dist/assets/icons/icon-512.png', 'dist/assets/icons/icon-maskable-512.png',
  'dist/assets/fonts/NotoSansArabic-Regular.ttf', 'dist/assets/fonts/NotoSansArabic-Bold.ttf',
  'dist/js/wake-lock.js', 'dist/js/report.js', 'dist/data/derived/question-audit.json',
  'dist/data/expanded-model-answers.json',
  'dist/js/scoring-rules.js', 'dist/js/retry-plan.js', 'dist/js/rotation.js', 'dist/js/session-plan.js', 'dist/js/coverage.js',
  'dist/js/print-book.js', 'api/example.js'
];
requiredFiles.forEach(file => assert.ok(fs.existsSync(path.join(project, file)), `Missing ${file}`));
assert.ok(read('dist/assets/images/abu-dhabi-sea-hero.jpg').length > 100_000, 'Hero must be a production-quality local image');

const serviceWorkerText = text('dist/sw.js');
assert.match(serviceWorkerText, /leadership-interview-coach-v0\.6\.0-alpha-6/);
assert.doesNotMatch(serviceWorkerText, /alpha-[45]/, 'only the alpha-6 cache name may remain');
['scoring-rules', 'retry-plan', 'rotation', 'session-plan', 'coverage', 'print-book'].forEach(name => assert.match(serviceWorkerText, new RegExp(`'\\./js/${name}\\.js'`), `APP_SHELL must include ${name}.js`));
const cachedPaths = [...serviceWorkerText.matchAll(/'\.\/(.*?)'/g)].map(match => match[1]);
cachedPaths.filter(Boolean).forEach(file => assert.ok(fs.existsSync(path.join(project, 'dist', file)), `Service worker caches missing file: ${file}`));
assert.match(serviceWorkerText, /url\.pathname\.startsWith\('\/api\/'\)/, 'API responses must never be cached');

const clientText = fs.readdirSync(path.join(project, 'dist/js')).map(file => text(`dist/js/${file}`)).join('\n');
assert.doesNotMatch(clientText, /AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}/, 'No API key may ship to the client');
assert.doesNotMatch(clientText, /\bC\d+-(?:SB|NB)\d+\b|\bC\d+-[SB]\d+-EP\d+\b/, 'Internal behaviour codes must not appear in client copy');

const indexText = text('dist/index.html');
assert.equal((indexText.match(/data-nav=/g) || []).length, 5);
['الرئيسية', 'التحضير', 'المحاكاة', 'التقارير', 'المزيد'].forEach(label => assert.match(indexText, new RegExp(`>${label}<`)));
assert.match(indexText, /apple-touch-icon-180\.png/);
assert.match(indexText, /id="back-button"[^>]+aria-label="العودة إلى الصفحة السابقة"/);
assert.match(indexText, /href="#\/settings" data-nav="more"/);

const homeText = text('dist/js/home.js');
assert.match(homeText, /abu-dhabi-sea-hero\.jpg/);
assert.match(homeText, /التحضير للمقابلة/);
assert.match(homeText, /المحاكاة الذكية/);
assert.match(homeText, /home-start-grid/);
assert.match(homeText, /home-path-card/);
assert.match(homeText, /home-report-card/);
assert.doesNotMatch(homeText, /أيام الأسبوع|الاثنين|الثلاثاء/);

const learnText = text('dist/js/learn.js');
assert.match(learnText, /bookActions/);
assert.match(learnText, /part_1_framework\.sections/);
assert.match(learnText, /part_2_answering\.sections/);
assert.match(learnText, /#\/competencies/);
assert.match(learnText, /renderMission/);
assert.match(learnText, /renderLesson\(root, data, lessonId, params = new URLSearchParams\(\)\)/,
  'Lesson routes must receive URL parameters before rendering Mission Command');
assert.match(learnText, /renderReadiness/);
assert.match(learnText, /bindExclusiveAccordions/);
assert.doesNotMatch(learnText, /اختبار فهم|اختبر فهمك/);

const competencyText = text('dist/js/competencies.js');
assert.match(competencyText, /competency-card-grid/);
assert.match(competencyText, /smart-question-card/);
assert.match(competencyText, /renderQuestionFocus/);
assert.match(competencyText, /\['understand', 'فهم الكفاءة'\], \['show', 'كيف تُظهرها'\], \['questions', 'الأسئلة'\]/);
assert.match(competencyText, /#\/question\/\$\{encodeURIComponent\(question\.id\)\}/);
assert.match(competencyText, /إظهار الإجابة النموذجية/);
assert.match(competencyText, /answerRevealed/);
assert.match(text('dist/js/data.js'), /إجابة نموذجية إرشادية/);
// alpha-5 (F2): عناوين صادقة للسؤال الموقفي + «إجابة الدليل كما هي»؛ (F6) زر حفظ السؤال داخل البطاقة.
assert.match(text('dist/js/data.js'), /إجابة نموذجية موسّعة، مبنية على إجابة الدليل/);
assert.match(text('dist/js/data.js'), /إجابة الدليل كما هي/);
assert.match(competencyText, /حفظ السؤال/);
assert.match(competencyText, /toggleBookmark/);
assert.match(competencyText, /تدرّب بصوتك/);
assert.match(competencyText, /تدرّب بالكتابة/);

const appText = text('dist/js/app.js');
assert.match(appText, /page === 'question' && parts\[1\]/);
assert.match(appText, /renderQuestionFocus/);
assert.match(appText, /question: 'سؤال تدريبي'/);

const printBookText = text('dist/js/print-book.js');
['print-cover', 'print-toc', 'print-question-page', 'print-model-answer', 'print-memory-box']
  .forEach(className => assert.match(printBookText, new RegExp(className)));
assert.match(printBookText, /هذا السؤال فقط/);
assert.match(printBookText, /دليل التحضير كاملًا/);
assert.match(printBookText, /لن تُطبع واجهة الهاتف/);

const printableData = {
  questions,
  competencies,
  missionMap,
  lessons,
  questionById: new Map(questions.map(item => [item.id, item])),
  primaryIdsByCompetency: new Map(competencies.map(item => [item.id, item.question_ids])),
  competencyById: new Map(competencies.map(item => [item.id, item])),
  lessonById: new Map(lessons.map(item => [item.id, item]))
};
assert.deepEqual(new Set(printBookQuestionIds(printableData)), new Set(questions.map(item => item.id)),
  'The complete preparation book must include all 70 published questions');
assert.equal(printBookQuestionIds(printableData, { kind: 'competency', id: 'C3' }).length, 13);
assert.equal(printBookQuestionIds(printableData, { kind: 'lesson', id: 'U4' }).length, 12);
assert.deepEqual(printBookQuestionIds(printableData, { kind: 'lesson', id: 'U5' }), ['X1', 'X2']);
assert.deepEqual(printBookQuestionIds(printableData, { kind: 'question', id: 'C1-S1' }), ['C1-S1']);

const settingsText = text('dist/js/settings.js');
['المظهر والقراءة', 'الصوت والمحاكاة', 'البيانات والنسخة الاحتياطية', 'الخصوصية والتحكم', 'عن التطبيق']
  .forEach(label => assert.match(settingsText, new RegExp(label)));
['حجم الخط', 'تباعد السطور', 'تصدير البيانات', 'استيراد نسخة', 'حذف جميع بياناتي المحلية']
  .forEach(label => assert.match(settingsText, new RegExp(label)));

const uiText = text('dist/js/ui.js');
assert.match(uiText, /other !== item\) other\.open = false/, 'Opening one accordion item must close the previous item');

const cssText = text('dist/css/styles.css');
assert.match(cssText, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/, 'Bottom navigation must fit five destinations');
assert.match(cssText, /html:not\(\[data-font-size="large"\]\) body\[data-page="home"\]\s*\{\s*overflow:\s*hidden;/,
  'Normal phone home viewport must not scroll, while large text keeps a safe scrolling fallback');
assert.match(cssText, /\.header-inner \{ direction: rtl; \}/, 'The RTL back control must be placed on the right');
assert.match(cssText, /body\[data-page="question"\] \.bottom-nav \{ display: none; \}/,
  'The dedicated question page must remove navigation distractions');
assert.match(cssText, /body\.book-printing > \*:not\(#print-book-root\)/,
  'Book export must print an independent document instead of the current screen');

assert.doesNotMatch(clientText, /استُبعدت الأسئلة|الواجهة جاهزة|تهيئة مفتاح|إعادة النشر/);
assert.doesNotMatch(settingsText, /الأسئلة المستبعدة|بصمة المرجع|بنك الأسئلة/);

const simulationText = text('dist/js/simulation.js');
assert.match(simulationText, /مقابلة كاملة/);
assert.match(simulationText, /selectedMode === 'full'/);
assert.match(simulationText, /acquireWakeLock\('transcribing'\)/);
assert.match(simulationText, /acquireWakeLock\('evaluating'\)/);
assert.match(simulationText, /draft_answer/);
assert.match(simulationText, /direct_training/);
assert.match(simulationText, /تذكّر بناء SEAL/);

const reportText = text('dist/js/report.js');
['تقرير المقابلة الشامل', 'متوسط معايير المقابلة', 'نقاط القوة المتكررة', 'نقاط الضعف المتكررة', 'أولوياتك للمحاكاة القادمة'].forEach(label => assert.match(reportText, new RegExp(label)));

const manifestWeb = json('dist/manifest.webmanifest');
assert.ok(manifestWeb.icons.some(item => item.src.endsWith('icon-192.png')));
assert.ok(manifestWeb.icons.some(item => item.purpose.includes('maskable')));

const firstQuestion = questions.find(item => item.rubric_mode === 'star_l');
const dataForGuidance = { competencyById: new Map(competencies.map(item => [item.id, item])), reference };
const guidance = buildAnswerGuidance(firstQuestion, dataForGuidance);
assert.ok(guidance.points.length);
assert.match(guidance.intent.answerPlan, /STAR-L/);

const introInput = {
  identity: 'قائد عمليات', current_role: 'مدير فريق العمليات', current_scope: 'قيادة فريق متعدد التخصصات',
  qualification: 'بكالوريوس إدارة', courses: 'إدارة المشاريع', career_start: 'مشرف عمليات',
  progression: 'الإشراف ثم إدارة وحدة ثم قيادة الفريق الحالي', leadership: 'تطوير الفرق وإدارة التغيير',
  achievements: 'خفض زمن إنجاز المعاملات بنسبة عشرين بالمئة', participation: 'لجنة التحول المؤسسي',
  future_goal: 'توسيع أثر التحسين ورفع جودة الخدمة'
};
const intro60 = buildSelfIntroduction(introInput, { duration: 60 });
const intro120 = buildSelfIntroduction(introInput, { duration: 120 });
assert.ok(intro60.text.includes('مدير فريق العمليات') && intro60.word_count <= 112);
assert.ok(intro120.word_count <= 225);
assert.ok(intro120.text.indexOf('مشرف عمليات') < intro120.text.indexOf('مدير فريق العمليات'));

const reportFor = (score, competency, overrides = {}) => ({
  question: { id: competency.id, question: 'سؤال', competency_id: competency.id, competency_name: competency.name },
  report: {
    final_score: score,
    classification: score == null ? null : score >= 80 ? 'قوية' : score >= 60 ? 'متوسطة' : 'ضعيفة',
    criteria: [{ key: 'context', score: score == null ? 5 : score / 20 }],
    elements: { situation: { present: score != null }, action: { present: score >= 80 } },
    expected_points_coverage: [], action_ratio: score == null ? 99 : score / 2,
    strengths: ['وضوح الرسالة'], missing: ['تفصيل النتيجة'], next_actions: ['أضف مؤشرًا للنتيجة.'], flags: [],
    ...overrides
  }
});
const insights = buildSessionInsights({
  responses: [
    reportFor(80, { id: 'C1', name: 'التواصل' }),
    reportFor(60, { id: 'C2', name: 'العمل الجماعي' }),
    reportFor(null, { id: 'C3', name: 'القرار' }, { strengths: ['يجب ألا تُحتسب'], missing: ['يجب ألا تُحتسب'] })
  ]
});
assert.equal(insights.average, 70);
assert.equal(insights.trusted_count, 2);
assert.equal(insights.untrusted_count, 1);
assert.equal(insights.criterion_scores[0].score, 70);
assert.equal(insights.competency_scores.length, 2);
assert.equal(insights.action_ratio, 35);
assert.ok(insights.strengths.every(item => item.text !== 'يجب ألا تُحتسب'));
assert.ok(insights.weaknesses.every(item => item.text !== 'يجب ألا تُحتسب'));
assert.ok(insights.priorities.length > 0);

console.log(`PASS v0.6 content and UX: ${questions.length} complete-answer questions, ${audit.excluded.length} excluded, 5 preparation sections.`);
