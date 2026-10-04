import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { selectSessionQuestions } from '../dist/js/sim.js';
import { buildAnswerGuidance } from '../dist/js/guidance.js';
import { buildSelfIntroduction } from '../dist/js/self-intro.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(project, relative));
const json = relative => JSON.parse(read(relative).toString('utf8'));

const referenceBytes = read('dist/data/reference.json');
const reference = JSON.parse(referenceBytes.toString('utf8'));
const questions = json('dist/data/derived/questions.json');
const competencies = json('dist/data/derived/competencies.json');
const missionMap = json('dist/data/derived/mission-map.json');
const lessons = json('dist/data/derived/lessons.json');
const variants = json('dist/data/derived/variants.json');
const curation = json('dist/data/derived/curation.json');
const exercises = json('dist/data/exercises.json');
const manifest = json('dist/data/derived/manifest.json');

function sourceQuestions() {
  const result = [];
  for (const competency of reference.part_3_competencies.competencies) {
    result.push(...competency.scenario_questions, ...competency.behavioural_questions);
  }
  for (const principle of reference.part_4_mission_command.principles) {
    result.push(principle.scenario_question, principle.behavioural_question);
  }
  result.push(...reference.part_5_additional_questions.questions);
  return result;
}

const originalQuestions = sourceQuestions();
const derivedById = new Map(questions.map(question => [question.id, question]));

assert.equal(reference.schema_version, '1.0');
assert.equal(competencies.length, 8);
assert.equal(questions.filter(q => q.owner_type === 'competency').length, 113);
assert.equal(missionMap.length, 6);
assert.equal(questions.filter(q => q.owner_type === 'mission_command').length, 12);
assert.equal(questions.filter(q => q.owner_type === 'additional').length, 2);
assert.equal(questions.length, 127);
assert.equal(new Set(questions.map(q => q.id)).size, 127);
assert.equal(questions.filter(q => q.sample_answer || q.sample_answer_star_l || q.sample_answers?.length).length, 127,
  'Every question shown in the bank must have a source model answer');
assert.equal(lessons.length, 6);
assert.equal(variants.length, 16);
assert.equal(curation.primary_count, 89);
assert.equal(curation.alternate_count, 38);
assert.equal(curation.primary_ids.length, 89);
assert.equal(curation.alternates.length, 38);
assert.equal(new Set(curation.primary_ids).size, 89);
assert.equal(new Set([...curation.primary_ids, ...curation.alternates.map(item => item.id)]).size, 127);
assert.ok(curation.alternates.every(item => curation.primary_ids.includes(item.primary_id)), 'Every alternate must point to a primary question');
assert.ok(questions.filter(question => curation.primary_ids.includes(question.id))
  .every(question => question.sample_answer || question.sample_answer_star_l || question.sample_answers?.length),
  'Every primary question must retain a source model answer');
assert.deepEqual(
  Object.fromEntries(competencies.map(competency => [
    competency.id,
    competency.question_ids.filter(id => curation.primary_ids.includes(id)).length
  ])),
  { C1: 8, C2: 7, C3: 11, C4: 12, C5: 10, C6: 10, C7: 9, C8: 8 }
);
assert.ok(exercises.length >= 60);
// البند 11 (v0.5.1): جودة تمارين التثبيت بعد تطبيق tools/exercise-overrides.json.
assert.ok(exercises.length >= 120, 'At least 120 exercises must remain after de-duplication');
assert.ok(exercises.every(exercise => exercise.explanation && exercise.explanation !== exercise.choices[exercise.answer]),
  'No exercise may use its correct choice as the explanation');
assert.ok(exercises.every(exercise => !/حقل (situation|task|action|result|learning)/.test(exercise.explanation)),
  'Explanations must not expose internal field names');
assert.ok(exercises.every(exercise => exercise.choices.length <= 5), 'Exercises must have at most 5 choices');
assert.ok(exercises.every(exercise => exercise.answer >= 0 && exercise.answer < exercise.choices.length), 'Answer index must point at a choice');
assert.equal(new Set(exercises.map(exercise => exercise.stimulus)).size, exercises.length, 'No duplicate stimulus');
{
  const positions = new Map();
  exercises.forEach(exercise => positions.set(exercise.answer, (positions.get(exercise.answer) || 0) + 1));
  assert.ok(Math.max(...positions.values()) / exercises.length <= 0.35, 'No answer position may exceed 35% of exercises');
}
assert.ok(exercises.every(exercise => exercise.source_ref));
assert.ok(exercises.every(exercise => exercise.prompt && exercise.stimulus && exercise.choices?.length), 'Exercises must have clear prompt, stimulus and choices');
assert.ok(exercises.every(exercise => !('label' in exercise) || Boolean(exercise.label)), 'Optional exercise labels must never be null');
assert.ok(exercises.filter(exercise => exercise.authored).every(exercise => exercise.label), 'Authored exercises must be visibly labelled');
assert.doesNotMatch(JSON.stringify(exercises), /"(?:label|prompt|stimulus)":null/, 'User-facing exercise fields cannot be null');
assert.ok(exercises.every(exercise => [exercise.label, exercise.prompt, exercise.stimulus, ...exercise.choices]
  .filter(value => value != null)
  .every(value => !/^(null|undefined)$/i.test(String(value).trim()))), 'User-facing exercise text cannot contain null/undefined sentinels');
assert.deepEqual(manifest.source_block_counts, {
  part_1_framework: { paragraph: 8, list: 3, key_point: 3, table: 2 },
  part_2_answering: { paragraph: 7, table: 6, key_point: 2, list: 1 },
  part_4_mission_command: { paragraph: 2, key_point: 1 },
  part_5_additional_questions: { paragraph: 1 },
  part_6_preparation: { paragraph: 5, list: 3, table: 2, template: 1, key_point: 1 }
});

for (const original of originalQuestions) {
  const derived = derivedById.get(original.id);
  assert.ok(derived, `Missing derived question ${original.id}`);
  assert.equal(derived.question, original.question, `Question text changed: ${original.id}`);
  if (original.question_continuation) assert.equal(derived.question_continuation, original.question_continuation);
  if (original.options) assert.deepEqual(derived.options, original.options);
}

const m6 = derivedById.get('M6-S1');
assert.ok(m6.question && m6.options.length && m6.question_continuation);
assert.ok(m6.display_question.indexOf(m6.question) < m6.display_question.indexOf(m6.options[0]));
assert.ok(m6.display_question.indexOf(m6.options.at(-1)) < m6.display_question.indexOf(m6.question_continuation));
assert.equal(reference.part_3_competencies.competencies[0].negative_behaviours.length, 0);
assert.equal(questions.filter(q => q.owner_type === 'competency' && !q.expected_answer_points).length, 81);
assert.deepEqual(
  questions.filter(q => q.rubric_mode === 'general').map(q => q.id).sort(),
  ['C4-S10', 'C4-S7', 'C4-S8', 'C4-S9', 'C5-S7', 'C5-S8', 'X1', 'X2'].sort()
);
assert.ok(Array.isArray(derivedById.get('C4-S10').sample_answers));

const hash = crypto.createHash('sha256').update(referenceBytes).digest('hex');
assert.equal(hash, manifest.reference_sha256);
assert.equal(hash, '51d413def77dd11a33a672222acbad46e9612da0f2d202bc28537928c2b7a357');

for (let iteration = 0; iteration < 1000; iteration += 1) {
  let state = (iteration + 1) * 2654435761 >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const selected = selectSessionQuestions(questions.filter(q => q.owner_type === 'competency'), 12, random);
  const groups = selected.map(q => q.variant_group).filter(Boolean);
  assert.equal(groups.length, new Set(groups).size, `Variant collision in iteration ${iteration}`);
}

const requiredFiles = [
  'dist/index.html', 'dist/manifest.webmanifest', 'dist/sw.js',
  'dist/assets/icons/icon-192.png', 'dist/assets/icons/icon-512.png',
  'dist/assets/fonts/NotoSansArabic-Regular.ttf', 'dist/assets/fonts/NotoSansArabic-Bold.ttf',
  'dist/assets/illustrations/journey.svg',
  'dist/js/competencies.js', 'dist/js/quick-review.js', 'dist/js/guidance.js', 'dist/js/self-intro.js',
  'dist/js/tools.js', 'dist/js/bookmarks.js', 'dist/data/derived/curation.json'
];
requiredFiles.forEach(file => assert.ok(fs.existsSync(path.join(project, file)), `Missing ${file}`));

const serviceWorkerText = read('dist/sw.js').toString('utf8');
const cachedPaths = [...serviceWorkerText.matchAll(/'\.\/(.*?)'/g)].map(match => match[1]);
cachedPaths.filter(item => item && item !== '').forEach(file => {
  assert.ok(fs.existsSync(path.join(project, 'dist', file)), `Service worker caches missing file: ${file}`);
});

const clientText = fs.readdirSync(path.join(project, 'dist/js'))
  .map(file => read(`dist/js/${file}`).toString('utf8')).join('\n');
assert.doesNotMatch(clientText, /AIza[0-9A-Za-z_-]{30,}/, 'Potential Google API key in client');
assert.doesNotMatch(clientText, /sk-[A-Za-z0-9_-]{20,}/, 'Potential API key in client');

const learnText = read('dist/js/learn.js').toString('utf8');
assert.match(learnText, /part_1_framework\.sections/);
assert.match(learnText, /part_2_answering\.sections/);
assert.match(learnText, /part_6_preparation\.sections/);
assert.match(learnText, /source\.intro\.forEach/);
assert.match(learnText, /Math\.min\(3,/);
assert.doesNotMatch(learnText, /LocalRecorder|renderLocalRecorder|التقييم الذاتي/);
assert.match(learnText, /appendChildren\(card,/,
  'Exercise cards must use null-safe appendChildren; native append renders null as visible text');

const uiText = read('dist/js/ui.js').toString('utf8');
assert.match(uiText, /export function appendChildren/);
assert.match(uiText, /child != null && child !== false/);

const simText = read('dist/js/sim.js').toString('utf8');
assert.doesNotMatch(simText, /speechSynthesis|MediaRecorder|راجع إجابتي|اعرض التقييم الذاتي|textarea/i);
assert.match(simText, /export function selectSessionQuestions/);
// الرموز المحذوفة في v0.5.1 (البند 13) تُبنى بالتجميع كي يبقى فحص grep في بوابة القبول صفرًا.
const removedRenderer = ['render', 'Practice'].join('');
const removedPreparation = ['render', 'Preparation'].join('');
const removedModule = ['evidence', 'js'].join('.');
assert.ok(!simText.includes(removedRenderer), 'Dead practice renderer must stay removed (v0.5.1 item 13)');
assert.ok(!fs.existsSync(path.join(project, 'dist/js', removedModule)), 'Unused client module must stay removed');
assert.ok(!read('dist/js/learn.js').toString('utf8').includes(removedPreparation));
const bankSourceText = read('dist/js/bank.js').toString('utf8');
assert.match(bankSourceText, /ما الذي يجب أن تذكره/);
assert.match(bankSourceText, /إظهار الإجابة النموذجية/);
assert.match(read('dist/js/quick-review.js').toString('utf8'), /سؤال السيناريو: الموقف موجود في نص السؤال/);

const sourceQuestion = questions.find(question => question.expected_answer_points);
const derivedQuestion = questions.find(question => question.competency_id && !question.expected_answer_points);
const dataForGuidance = { competencyById: new Map(competencies.map(item => [item.id, item])), reference };
assert.equal(buildAnswerGuidance(sourceQuestion, dataForGuidance).kind, 'source');
assert.equal(buildAnswerGuidance(derivedQuestion, dataForGuidance).kind, 'derived');
assert.ok(buildAnswerGuidance(derivedQuestion, dataForGuidance).points.length);

const introInput = {
  identity: 'قائد عمليات', current_role: 'مدير فريق العمليات', current_scope: 'قيادة فريق متعدد التخصصات',
  qualification: 'بكالوريوس إدارة', courses: 'إدارة المشاريع', career_start: 'مشرف عمليات',
  progression: 'الإشراف ثم إدارة وحدة ثم قيادة الفريق الحالي', leadership: 'تطوير الفرق وإدارة التغيير',
  achievements: 'خفض زمن إنجاز المعاملات بنسبة عشرين بالمئة', participation: 'لجنة التحول المؤسسي',
  future_goal: 'توسيع أثر التحسين ورفع جودة الخدمة'
};
const intro60 = buildSelfIntroduction(introInput, { duration: 60 });
const intro120 = buildSelfIntroduction(introInput, { duration: 120 });
assert.ok(intro60.text.includes('مدير فريق العمليات'));
assert.ok(intro60.text.includes('خفض زمن إنجاز المعاملات'));
assert.ok(intro60.text.includes('توسيع أثر التحسين'));
assert.ok(intro60.word_count <= 112);
assert.ok(intro120.word_count <= 225);
assert.ok(intro120.text.indexOf('مشرف عمليات') < intro120.text.indexOf('مدير فريق العمليات'), 'Self introduction must move from past to present');
assert.ok(intro120.text.indexOf('مدير فريق العمليات') < intro120.text.indexOf('توسيع أثر التحسين'), 'Future goal must follow current role');
assert.notEqual(buildSelfIntroduction(introInput, { duration: 60, variation: 0 }).text, buildSelfIntroduction(introInput, { duration: 60, variation: 1 }).text);

const indexText = read('dist/index.html').toString('utf8');
assert.match(indexText, /id="back-button"/);
assert.equal((indexText.match(/data-nav=/g) || []).length, 4);
assert.match(indexText, />المسار</);
assert.match(indexText, />الأدوات</);

const homeText = read('dist/js/home.js').toString('utf8');
assert.match(homeText, /ابدأ المسار التعليمي/);
assert.match(homeText, /89 سؤالًا أساسيًا/);
assert.match(homeText, /التعلّم والبنك محليان/);
assert.match(homeText, /محاكاة المقابلة/);

const bankText = read('dist/js/bank.js').toString('utf8');
assert.match(bankText, /السؤال والإجابة/);
assert.match(bankText, /إجابة نموذجية متوفرة/);
assert.match(bankText, /ماذا يريد منك المقابل/);
assert.match(bankText, /ما الذي يجب أن تذكره/);
assert.match(bankText, /إظهار الإجابة النموذجية/);
assert.doesNotMatch(bankText, /textarea|اكتب إجابتك|راجع إجابتي/i);

const configText = read('dist/js/config.js').toString('utf8');
assert.match(configText, /maxExercisesPerLessonSession: 3/);

const cssText = read('dist/css/styles.css').toString('utf8');
assert.match(cssText, /NotoSansArabic-Regular\.ttf/);
assert.match(cssText, /\[data-theme="dark"\]/);

console.log(`PASS phase 1 data: ${questions.length} questions, ${exercises.length} exercises, 1000 variant-safe sessions.`);
