#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(projectRoot, 'dist', 'data');
const derivedDir = path.join(dataDir, 'derived');
const referencePath = path.join(dataDir, 'reference.json');
const expandedAnswersPath = path.join(dataDir, 'expanded-model-answers.json');
const referenceBytes = fs.readFileSync(referencePath);
const reference = JSON.parse(referenceBytes.toString('utf8'));
const expandedAnswersBytes = fs.readFileSync(expandedAnswersPath);
const expandedAnswers = JSON.parse(expandedAnswersBytes.toString('utf8'));
const expandedAnswerById = new Map(expandedAnswers.answers.map(item => [item.id, item.answer]));

fs.mkdirSync(derivedDir, { recursive: true });

const GENERAL_IDS = new Set([
  'C4-S7', 'C4-S8', 'C4-S9', 'C4-S10', 'C5-S7', 'C5-S8', 'X1', 'X2'
]);

// The brief identifies 16 V1/V5 near-duplicate pairs.  We keep both source
// questions and mark the later wording as a variant of the earlier wording.
const VARIANT_PAIRS = [
  ['C5-S1', 'C5-S3'], ['C5-S2', 'C5-S4'], ['C5-B1', 'C5-B3'], ['C5-B2', 'C5-B4'],
  ['C6-S1', 'C6-S3'], ['C6-S2', 'C6-S4'], ['C6-B1', 'C6-B3'], ['C6-B2', 'C6-B4'],
  ['C7-S1', 'C7-S3'], ['C7-S2', 'C7-S4'], ['C7-B1', 'C7-B3'], ['C7-B2', 'C7-B4'],
  ['C8-S1', 'C8-S3'], ['C8-S2', 'C8-S4'], ['C8-B1', 'C8-B3'], ['C8-B2', 'C8-B4']
];

// v0.6.0 content rule: the published bank contains only questions whose
// source includes a complete, fielded STAR-L model answer. A paragraph of
// guidance, expected points, or competency indicators is not a model answer.
// The immutable reference remains untouched and the audit records every
// exclusion explicitly.
// alpha-5 (C1): سؤالا الذكاء الاصطناعي X1 وX2 يُنشران بإجابتَي الدليل (sample_answer) كما هما،
// بنموذج general وحالة complete_source_paragraph. لا يُنشر أي سؤال آخر بهذه القاعدة.
const PARAGRAPH_PUBLISHED_IDS = new Set(['X1', 'X2']);
function hasCompleteParagraphAnswer(question) {
  return PARAGRAPH_PUBLISHED_IDS.has(question?.id) && typeof question.sample_answer === 'string' && question.sample_answer.trim().length > 0;
}

function hasCompleteModelAnswer(question) {
  if (expandedAnswerById.has(question?.id)) return true;
  if (hasCompleteParagraphAnswer(question)) return true;
  const answer = question?.sample_answer_star_l;
  if (!answer || typeof answer !== 'object') return false;
  return ['situation', 'task', 'result', 'learning'].every(key => typeof answer[key] === 'string' && answer[key].trim())
    && ((typeof answer.action === 'string' && answer.action.trim())
      || (Array.isArray(answer.action_points) && answer.action_points.length && answer.action_points.every(Boolean)));
}

const variantOf = new Map(VARIANT_PAIRS.map(([canonical, variant]) => [variant, canonical]));
const variantGroup = new Map();
for (const [canonical, variant] of VARIANT_PAIRS) {
  variantGroup.set(canonical, canonical);
  variantGroup.set(variant, canonical);
}

function writeJson(filename, value) {
  fs.writeFileSync(path.join(derivedDir, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function stableBehaviourList(competencyId, kind, values = []) {
  return values.map((text, index) => ({
    id: `${competencyId}-${kind === 'supporting' ? 'SB' : 'NB'}${index + 1}`,
    text
  }));
}

function stableExpectedPoints(question) {
  const source = question.expected_answer_points;
  if (!source) return null;
  return {
    lead: source.lead ?? null,
    points: (source.points || []).map((text, index) => ({
      id: `${question.id}-EP${index + 1}`,
      text
    }))
  };
}

function rubricFor(question) {
  if (GENERAL_IDS.has(question.id)) return 'general';
  return question.type === 'behavioural' ? 'star_l' : 'seal';
}

function joinedQuestion(question) {
  const parts = [question.question];
  if (Array.isArray(question.options)) {
    parts.push(question.options.map((option, i) => `${i + 1}. ${option}`).join('\n'));
  }
  if (question.question_continuation) parts.push(question.question_continuation);
  return parts.filter(Boolean).join('\n');
}

function flattenQuestion(question, owner) {
  const expanded = expandedAnswerById.get(question.id) || null;
  return {
    ...question,
    display_question: joinedQuestion(question),
    owner_type: owner.owner_type,
    competency_id: owner.competency_id ?? null,
    competency_name: owner.competency_name ?? null,
    principle_id: owner.principle_id ?? null,
    principle_title: owner.principle_title ?? null,
    linked_competencies: owner.linked_competencies ?? [],
    rubric_mode: rubricFor(question),
    variant_of: null,
    variant_group: null,
    learning_status: 'primary',
    alternate_of: null,
    expected_points: stableExpectedPoints(question),
    sample_answer_seal: expanded,
    model_answer_status: expanded ? 'approved_expanded_seal' : hasCompleteParagraphAnswer(question) ? 'complete_source_paragraph' : 'complete_source_star_l'
  };
}

const questions = [];
const competencySummaries = [];

for (const competency of reference.part_3_competencies.competencies) {
  const owner = {
    owner_type: 'competency',
    competency_id: competency.id,
    competency_name: competency.name
  };
  for (const question of competency.scenario_questions) {
    if (hasCompleteModelAnswer(question)) questions.push(flattenQuestion(question, owner));
  }
  for (const question of competency.behavioural_questions) {
    if (hasCompleteModelAnswer(question)) questions.push(flattenQuestion(question, owner));
  }

  competencySummaries.push({
    id: competency.id,
    number: competency.number,
    name: competency.name,
    pdf_page: competency.pdf_page,
    definition: competency.definition,
    definition_v1_2025: competency.definition_v1_2025,
    what_interviewer_measures: competency.what_interviewer_measures,
    supporting_behaviours: stableBehaviourList(competency.id, 'supporting', competency.supporting_behaviours),
    negative_behaviours: stableBehaviourList(competency.id, 'negative', competency.negative_behaviours),
    question_ids: [...competency.scenario_questions, ...competency.behavioural_questions]
      .filter(hasCompleteModelAnswer)
      .map(q => q.id)
  });
}

for (const principle of reference.part_4_mission_command.principles) {
  const owner = {
    owner_type: 'mission_command',
    principle_id: principle.id,
    principle_title: principle.title,
    linked_competencies: principle.linked_competencies
  };
  if (hasCompleteModelAnswer(principle.scenario_question)) questions.push(flattenQuestion(principle.scenario_question, owner));
  if (hasCompleteModelAnswer(principle.behavioural_question)) questions.push(flattenQuestion(principle.behavioural_question, owner));
}

for (const question of reference.part_5_additional_questions.questions) {
  if (hasCompleteModelAnswer(question)) questions.push(flattenQuestion(question, { owner_type: 'additional' }));
}

const missionMap = reference.part_4_mission_command.principles.map(principle => ({
  principle_id: principle.id,
  title: principle.title,
  short_name: principle.short_name ?? null,
  description: principle.description,
  linked_competencies: principle.linked_competencies,
  linked_competency_ids: competencySummaries
    .filter(c => principle.linked_competencies.some(name => c.name.includes(name) || name.includes(c.name)))
    .map(c => c.id),
  question_ids: [principle.scenario_question, principle.behavioural_question]
    .filter(hasCompleteModelAnswer)
    .map(question => question.id)
}));

const lessonIndex = [
  { id: 'U1', number: 1, title: 'افهم المقابلة', subtitle: 'المفهوم والقواعد الأساسية', icon: 'interview', source_refs: ['1.1', '1.2', '1.3', '1.4', '1.5'] },
  { id: 'U2', number: 2, title: 'بناء الإجابة النموذجية', subtitle: 'STAR-L وSEAL وعقلية المقيّم', icon: 'answer', source_refs: ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'] },
  { id: 'U3', number: 3, title: 'الكفاءات الثمانية', subtitle: 'ثماني بطاقات للشرح والأسئلة الكاملة', icon: 'competencies', source_refs: competencySummaries.map(c => c.id) },
  { id: 'U4', number: 4, title: 'قيادة المهمة', subtitle: 'المبادئ الستة والتطبيق القيادي', icon: 'mission', source_refs: missionMap.map(m => m.principle_id) },
  { id: 'U5', number: 5, title: 'الجاهزية النهائية', subtitle: 'التحضير وتقديم الذات والحضور المهني', icon: 'readiness', source_refs: ['6.1', '6.2', '6.3', '6.4', '6.5'] }
];

function searchable(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(searchable).join(' ');
  if (typeof value === 'object') return Object.values(value).map(searchable).join(' ');
  return '';
}

const sectionSearchEntries = [];
for (const [partKey, partLabel] of [
  ['part_1_framework', 'الإطار العام'],
  ['part_2_answering', 'منهجية الإجابة'],
  ['part_6_preparation', 'التحضير والأداء']
]) {
  for (const item of reference[partKey].sections || []) {
    const lesson = lessonIndex.find(candidate => candidate.source_refs.includes(item.number));
    sectionSearchEntries.push({
      id: `section-${item.number}`,
      kind: 'section',
      title: `${item.number} — ${item.title}`,
      route: lesson ? `#/learn/${lesson.id}` : '#/learn',
      text: searchable(item.blocks),
      tags: [partLabel, item.title]
    });
  }
}
sectionSearchEntries.push({
  id: 'section-mission-intro',
  kind: 'section',
  title: reference.part_4_mission_command.title,
  route: '#/learn/U4',
  text: searchable(reference.part_4_mission_command.intro),
  tags: ['قيادة المهمة']
});
for (const principle of reference.part_4_mission_command.principles) {
  sectionSearchEntries.push({
    id: `principle-${principle.id}`,
    kind: 'principle',
    title: `${principle.id} — ${principle.title}`,
    route: `#/learn/U4`,
    text: searchable(principle),
    tags: ['قيادة المهمة', ...(principle.linked_competencies || [])]
  });
}
sectionSearchEntries.push({
  id: 'section-additional',
  kind: 'section',
  title: reference.part_5_additional_questions.title,
  route: '#/learn/U5',
  text: searchable(reference.part_5_additional_questions),
  tags: ['الأسئلة الإضافية', 'الذكاء الاصطناعي']
});

const searchIndex = [
  ...questions.map(q => ({
    id: q.id,
    kind: 'question',
    title: q.display_question,
    route: q.competency_id ? `#/competencies/${q.competency_id}?question=${q.id}` : `#/preparation/U4?question=${q.id}`,
    text: searchable(q),
    tags: [q.type, q.rubric_mode, q.competency_name, q.principle_title, q.label].filter(Boolean)
  })),
  ...competencySummaries.map(c => ({
    id: c.id,
    kind: 'competency',
    title: c.name,
    route: `#/competencies/${c.id}`,
    text: searchable(c),
    tags: ['كفاءة', c.name]
  })),
  ...lessonIndex.map(lesson => ({
    id: lesson.id,
    kind: 'lesson',
    title: lesson.title,
    route: `#/learn/${lesson.id}`,
    text: lesson.source_refs.join(' '),
    tags: ['درس']
  })),
  ...sectionSearchEntries
];

function choiceExercise({ id, lesson, prompt, stimulus, choices, answer, sourceRef, explanation = '', authored = false, label = null }) {
  const exercise = {
    id,
    lesson_id: lesson,
    type: 'single_choice',
    prompt,
    stimulus,
    choices,
    answer,
    explanation,
    source_ref: sourceRef,
    authored
  };
  if (label) exercise.label = label;
  return exercise;
}

const exercises = [];
const section = (partKey, number) => reference[partKey].sections.find(item => item.number === number);

// Lesson 1: every cell comes directly from the comparison table in section 1.2.
const comparisonRows = section('part_1_framework', '1.2').blocks.find(b => b.type === 'table').rows;
const comparisonChoices = comparisonRows.map(row => row[0]);
comparisonRows.forEach((row, rowIndex) => {
  [1, 2, 3].forEach((columnIndex, exerciseIndex) => {
    exercises.push(choiceExercise({
      id: `L1-CLASS-${rowIndex + 1}-${exerciseIndex + 1}`,
      lesson: 'L1',
      prompt: 'اقرأ العبارة المقتبسة من جدول المقارنة، ثم حدّد العنصر الذي تنتمي إليه.',
      stimulus: row[columnIndex],
      choices: comparisonChoices,
      answer: rowIndex,
      sourceRef: '1.2',
      explanation: `العبارة واردة في صف «${row[0]}» في جدول القسم 1.2.`
    }));
  });
});

// Lesson 2: real STAR-L fields from the guide, plus the four SEAL definitions.
const starQuestions = questions.filter(q => q.sample_answer_star_l).slice(0, 4);
const starLabels = {
  situation: 'S — الموقف',
  task: 'T — المهمة',
  action: 'A — الإجراءات',
  result: 'R — النتيجة',
  learning: 'L — الدروس المستفادة'
};
starQuestions.forEach((question, qIndex) => {
  Object.entries(starLabels).forEach(([key, label], fieldIndex) => {
    const value = question.sample_answer_star_l[key];
    if (!value) return;
    exercises.push(choiceExercise({
      id: `L2-STAR-${qIndex + 1}-${fieldIndex + 1}`,
      lesson: 'L2',
      prompt: 'اقرأ هذا المقطع من نموذج الدليل، ثم حدّد عنصر STAR-L الذي يمثله.',
      stimulus: value,
      choices: Object.values(starLabels),
      answer: Object.keys(starLabels).indexOf(key),
      sourceRef: question.id,
      explanation: `هذا النص محفوظ في حقل ${key} للسؤال ${question.id}.`
    }));
  });
});
const sealTable = section('part_2_answering', '2.2').blocks.find(b => b.type === 'table').rows;
sealTable.forEach((row, index) => exercises.push(choiceExercise({
  id: `L2-SEAL-${index + 1}`,
  lesson: 'L2',
  prompt: 'اقرأ التعريف الآتي، ثم حدّد عنصر SEAL الذي يصفه.',
  stimulus: row[1],
  choices: sealTable.map(item => item[0].replace(/\n/g, ' — ')),
  answer: index,
  sourceRef: '2.2',
  explanation: row[0].replace(/\n/g, ' — ')
})));

// Lesson 3: explicitly labelled practice adaptations; they never replace guide text.
const errorRows = section('part_2_answering', '2.4').blocks.find(b => b.type === 'table').rows;
const modifiedExamples = [
  ['نحن قمنا بتحليل المشكلة، ونحن قررنا الحل، ونحن تابعنا التنفيذ.', 1],
  ['قام الفريق بتحسين الإجراء ونجح العمل، ولم يكن لي دور محدد.', 1],
  ['أنا دائماً أقود الفريق بشكل جيد.', 0],
  ['عادةً أتعامل مع كل المواقف باحتراف وأحقق أفضل النتائج.', 0],
  ['حللت الموقف، وحددت دوري، ونفذت الخطوات المطلوبة.', 2],
  ['نفذت الخطة مع الفريق وفق الأولويات المحددة، ثم انتهت المهمة.', 2],
  ['أنا أؤمن بالتواصل الجيد وبأن القائد يجب أن يستمع للجميع.', 3],
  ['برأيي، أفضل قيادة هي التي تجعل كل شخص يشعر بالثقة.', 3],
  ['أنجزت المهمة بالكامل وحدي، ولم أرتكب أي خطأ، وكانت النتيجة مثالية.', 5],
  ['لم نواجه أي صعوبة إطلاقاً، وكل القرارات التي اتخذتها كانت صحيحة.', 5]
];
modifiedExamples.forEach(([text, errorIndex], index) => exercises.push(choiceExercise({
  id: `L3-ERROR-${index + 1}`,
  lesson: 'L3',
  prompt: 'اقرأ النسخة التدريبية الآتية، ثم اختر الخطأ الأوضح فيها.',
  stimulus: text,
  choices: errorRows.map(row => row[0]),
  answer: errorIndex,
  sourceRef: '2.4',
  explanation: errorRows[errorIndex][1],
  authored: true,
  label: 'نسخة معدّلة لغرض التمرين'
})));

// Lesson 4: the five assessment elements and the five question-design criteria.
const assessmentRows = section('part_2_answering', '2.5').blocks.find(b => b.type === 'table').rows;
assessmentRows.forEach((row, index) => exercises.push(choiceExercise({
  id: `L4-ASSESS-${index + 1}`,
  lesson: 'L4',
  prompt: 'اقرأ الوصف الآتي، ثم حدّد العنصر الذي يبحث عنه المقابِل.',
  stimulus: row[1],
  choices: assessmentRows.map(item => item[0]),
  answer: index,
  sourceRef: '2.5',
  explanation: row[0]
})));
const designRows = section('part_2_answering', '2.7').blocks.find(b => b.type === 'table').rows;
designRows.forEach((row, index) => exercises.push(choiceExercise({
  id: `L4-DESIGN-${index + 1}`,
  lesson: 'L4',
  prompt: 'اقرأ النص الآتي، ثم حدّد معيار صياغة السؤال الذي يصفه.',
  stimulus: row[1],
  choices: designRows.map(item => item[0]),
  answer: index,
  sourceRef: '2.7',
  explanation: row[0]
})));

// Lesson 5: genuine behaviours and questions from all eight competencies.
competencySummaries.forEach((competency, competencyIndex) => {
  const competencyChoices = competencySummaries.map(item => item.name);
  const supporting = competency.supporting_behaviours[0];
  if (supporting) exercises.push(choiceExercise({
    id: `L5-COMP-${competency.id}`,
    lesson: 'L5',
    prompt: 'اقرأ السلوك الداعم الآتي، ثم حدّد الكفاءة التي ينتمي إليها.',
    stimulus: supporting.text,
    choices: competencyChoices,
    answer: competencyIndex,
    sourceRef: supporting.id,
    explanation: competency.name
  }));

  const behaviourChoices = ['سلوك داعم', 'سلوك سلبي'];
  competency.supporting_behaviours.slice(0, 2).forEach((behaviour, index) => exercises.push(choiceExercise({
    id: `L5-BEH-S-${competency.id}-${index + 1}`,
    lesson: 'L5',
    prompt: `هل هذا السلوك داعم أم سلبي في كفاءة «${competency.name}»؟`,
    stimulus: behaviour.text,
    choices: behaviourChoices,
    answer: 0,
    sourceRef: behaviour.id,
    explanation: 'ورد ضمن السلوكيات الداعمة في المرجع.'
  })));
  competency.negative_behaviours.slice(0, 2).forEach((behaviour, index) => exercises.push(choiceExercise({
    id: `L5-BEH-N-${competency.id}-${index + 1}`,
    lesson: 'L5',
    prompt: `هل هذا السلوك داعم أم سلبي في كفاءة «${competency.name}»؟`,
    stimulus: behaviour.text,
    choices: behaviourChoices,
    answer: 1,
    sourceRef: behaviour.id,
    explanation: 'ورد ضمن السلوكيات السلبية في المرجع.'
  })));

  const competencyQuestions = questions.filter(q => q.competency_id === competency.id);
  const scenario = competencyQuestions.find(q => q.type === 'scenario' && q.rubric_mode !== 'general');
  const behavioural = competencyQuestions.find(q => q.type === 'behavioural');
  [scenario, behavioural].filter(Boolean).forEach(question => exercises.push(choiceExercise({
    id: `L5-MODE-${question.id}`,
    lesson: 'L5',
    prompt: 'اقرأ السؤال الآتي، ثم حدّد نوعه ونموذج الإجابة الأنسب له.',
    stimulus: question.display_question,
    choices: ['سلوكي — STAR-L', 'سيناريو — SEAL', 'عام — تحليل وممارسة'],
    answer: question.rubric_mode === 'star_l' ? 0 : question.rubric_mode === 'seal' ? 1 : 2,
    sourceRef: question.id,
    explanation: question.rubric_mode === 'star_l' ? 'سؤال سلوكي عن موقف حدث فعلاً.' : 'سؤال سيناريو عن موقف افتراضي.'
  })));
});

// Lesson 6: sample answers from the source, with the principle as the answer.
const principles = reference.part_4_mission_command.principles;
principles.forEach((principle, index) => exercises.push(choiceExercise({
  id: `L6-PRINCIPLE-${principle.id}`,
  lesson: 'L6',
  prompt: 'اقرأ المقطع الآتي، ثم حدّد مبدأ قيادة المهمة الذي يظهر فيه.',
  stimulus: principle.scenario_question.sample_answer,
  choices: principles.map(item => item.title),
  answer: index,
  sourceRef: principle.scenario_question.id,
  explanation: principle.title
})));

// Lesson 7: preparation and body-language content, word-for-word from chapter 6.
const prepItems = section('part_6_preparation', '6.1').blocks.find(b => b.type === 'list').items;
prepItems.forEach((item, index) => exercises.push(choiceExercise({
  id: `L7-PREP-${index + 1}`,
  lesson: 'L7',
  prompt: 'اقرأ الإجراء الآتي، ثم حدّد مرحلة التحضير التي ينتمي إليها.',
  stimulus: item,
  choices: ['التحضير الأولي', 'تقديم الذات', 'لغة الجسد'],
  answer: 0,
  sourceRef: '6.1',
  explanation: 'ورد في قائمة التحضير الأولي.'
})));
const bodyRows = section('part_6_preparation', '6.5').blocks.find(b => b.type === 'table').rows;
bodyRows.forEach((row, index) => exercises.push(choiceExercise({
  id: `L7-BODY-${index + 1}`,
  lesson: 'L7',
  prompt: 'اقرأ التفصيل الآتي، ثم اختر عنوان نصيحة لغة الجسد المناسب له.',
  stimulus: row[1],
  choices: bodyRows.map(item => item[0]),
  answer: index,
  sourceRef: '6.5',
  explanation: row[0]
})));

// Lesson 8: all general questions explicitly use the general rubric.
questions.filter(q => q.rubric_mode === 'general').forEach((question, index) => exercises.push(choiceExercise({
  id: `L8-GENERAL-${index + 1}`,
  lesson: 'L8',
  prompt: 'اقرأ السؤال الآتي، ثم اختر طريقة تنظيم الإجابة المناسبة له.',
  stimulus: question.display_question,
  choices: ['STAR-L', 'SEAL', 'عام: الوضوح وعمق التحليل والربط بالممارسة والواقعية'],
  answer: 2,
  sourceRef: question.id,
  explanation: 'هذا السؤال مصنّف سؤالاً عامًا في موجز التنفيذ.'
})));

// The source-derived exercise generator remains here for provenance, but the
// approved preparation experience contains no comprehension quizzes.
const EXERCISE_UNIT_MAP = {
  L1: 'U1', L2: 'U2', L3: 'U2', L4: 'U2',
  L5: 'U3', L6: 'U4', L7: 'U5', L8: 'U5'
};
exercises.forEach(exercise => { exercise.lesson_id = EXERCISE_UNIT_MAP[exercise.lesson_id] || exercise.lesson_id; });
const publishedExercises = [];

const primaryQuestions = questions.filter(question => question.learning_status === 'primary');
const alternateQuestions = questions.filter(question => question.learning_status === 'alternate');
const curation = {
  schema_version: '2.0',
  policy: 'complete-model-answers-only',
  total_source_questions: 127,
  excluded_source_questions: 127 - questions.length,
  primary_count: primaryQuestions.length,
  alternate_count: alternateQuestions.length,
  primary_ids: primaryQuestions.map(question => question.id),
  alternates: []
};

const allSourceQuestions = [
  ...reference.part_3_competencies.competencies.flatMap(competency => [
    ...competency.scenario_questions,
    ...competency.behavioural_questions
  ]),
  ...reference.part_4_mission_command.principles.flatMap(principle => [
    principle.scenario_question,
    principle.behavioural_question
  ]),
  ...reference.part_5_additional_questions.questions
];
const questionAudit = {
  schema_version: '1.0',
  policy: 'لا يُنشر إلا السؤال الذي يتضمن إجابة نموذجية مكتملة العناصر ومعتمدة للمراجعة والتدريب.',
  source_question_count: allSourceQuestions.length,
  published_question_count: questions.length,
  excluded_question_count: allSourceQuestions.length - questions.length,
  reference_sha256: crypto.createHash('sha256').update(referenceBytes).digest('hex'),
  reviewed_sources: [
    'dist/data/reference.json',
    'دليل المقابلات القيادية المبنية على الكفاءات v1.pdf',
    'دليل الهنداسي - للمقابلات القيادية المبنية على الكفاءات v5.pdf'
  ],
  published: allSourceQuestions.filter(hasCompleteModelAnswer).map(question => ({
    id: question.id,
    status: 'published',
    evidence: expandedAnswerById.has(question.id)
      ? 'إجابة SEAL موسعة ومعتمدة مبنية على الدليل'
      : hasCompleteParagraphAnswer(question)
        ? 'sample_answer فقرة كاملة من الدليل (سؤال معرفي)'
        : 'sample_answer_star_l كامل في المصدر'
  })),
  excluded: allSourceQuestions.filter(question => !hasCompleteModelAnswer(question)).map(question => ({
    id: question.id,
    status: 'excluded',
    reason: question.sample_answer || question.sample_answers?.length
      ? 'المصدر يقدم فقرة إرشادية أو مثالًا عامًا، وليس جوابًا نموذجيًا كاملًا مفصول العناصر.'
      : 'لا يوجد جواب نموذجي في المصدر.'
  }))
};

const questionIds = questions.map(q => q.id);
const sourceHash = crypto.createHash('sha256').update(referenceBytes).digest('hex');
function countBlockTypes(value, counts = {}) {
  if (Array.isArray(value)) value.forEach(item => countBlockTypes(item, counts));
  else if (value && typeof value === 'object') {
    if (typeof value.type === 'string' && ['paragraph', 'list', 'table', 'key_point', 'template'].includes(value.type)) {
      counts[value.type] = (counts[value.type] || 0) + 1;
    }
    Object.values(value).forEach(item => countBlockTypes(item, counts));
  }
  return counts;
}
const sourceBlockCounts = Object.fromEntries(
  ['part_1_framework', 'part_2_answering', 'part_4_mission_command', 'part_5_additional_questions', 'part_6_preparation']
    .map(key => [key, countBlockTypes(reference[key])])
);
const manifest = {
  schema_version: '1.0',
  derived_schema_version: '1.0',
  reference_sha256: sourceHash,
  expanded_answers_sha256: crypto.createHash('sha256').update(expandedAnswersBytes).digest('hex'),
  prompt_version: 'evaluation-1.2+approved-content-audit-1',
  rubric_version: 'phase2-reference-review-4.0',
  config_version: '6.0',
  model_id: null,
  source_block_counts: sourceBlockCounts,
  counts: {
    competencies: competencySummaries.length,
    competency_questions: questions.filter(q => q.owner_type === 'competency').length,
    mission_command_principles: missionMap.length,
    mission_command_questions: questions.filter(q => q.owner_type === 'mission_command').length,
    additional_questions: questions.filter(q => q.owner_type === 'additional').length,
    total_questions: questions.length,
    source_questions: allSourceQuestions.length,
    excluded_questions: questionAudit.excluded_question_count,
    unique_question_ids: new Set(questionIds).size,
    primary_questions: primaryQuestions.length,
    alternate_questions: alternateQuestions.length,
    variant_pairs: VARIANT_PAIRS.filter(pair => pair.every(id => questionIds.includes(id))).length,
    lessons: lessonIndex.length,
    exercises: publishedExercises.length
  }
};

writeJson('questions.json', questions);
writeJson('competencies.json', competencySummaries);
writeJson('mission-map.json', missionMap);
writeJson('lessons.json', lessonIndex);
writeJson('search-index.json', searchIndex);
writeJson('variants.json', VARIANT_PAIRS.filter(pair => pair.every(id => questionIds.includes(id))).map(([canonical, variant], index) => ({
  id: `VG${String(index + 1).padStart(2, '0')}`,
  canonical,
  variant
})));
writeJson('curation.json', curation);
writeJson('question-audit.json', questionAudit);
writeJson('manifest.json', manifest);
fs.writeFileSync(path.join(dataDir, 'exercises.json'), `${JSON.stringify(publishedExercises, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(manifest, null, 2));
