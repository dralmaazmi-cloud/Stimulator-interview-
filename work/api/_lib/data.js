import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpError } from './http.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..', '..');

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(project, relative), 'utf8'));
}

const questions = readJson('dist/data/derived/questions.json');
const competencies = readJson('dist/data/derived/competencies.json');
const missionMap = readJson('dist/data/derived/mission-map.json');
const reference = readJson('dist/data/reference.json');
const manifest = readJson('dist/data/derived/manifest.json');

const questionById = new Map(questions.map(question => [question.id, question]));
const competencyById = new Map(competencies.map(item => [item.id, item]));
const principleById = new Map(missionMap.map(item => [item.principle_id, item]));

const selfIntroductionQuestion = Object.freeze({
  id: 'SELF-INTRO',
  number: 0,
  type: 'self_intro',
  question: 'قدّم نفسك بصورة مهنية، من الماضي إلى الحاضر ثم المستقبل.',
  display_question: 'قدّم نفسك بصورة مهنية، من الماضي إلى الحاضر ثم المستقبل.',
  rubric_mode: 'self_intro',
  owner_type: 'preparation',
  competency_id: null,
  principle_id: null,
  expected_points: null
});

export function getQuestionContext(id) {
  const requestedId = String(id || '');
  const question = requestedId === selfIntroductionQuestion.id
    ? selfIntroductionQuestion
    : questionById.get(requestedId);
  if (!question) throw httpError(404, 'السؤال غير موجود.', 'QUESTION_NOT_FOUND');
  const selfIntro = question.id === selfIntroductionQuestion.id;
  return {
    question,
    competency: question.competency_id ? competencyById.get(question.competency_id) || null : null,
    principle: question.principle_id ? principleById.get(question.principle_id) || null : null,
    rubricSections: selfIntro
      ? reference.part_6_preparation.sections.filter(section => ['6.2', '6.3'].includes(section.number))
      : reference.part_2_answering.sections.filter(section => ['2.1', '2.2', '2.3', '2.4', '2.5', '2.7'].includes(section.number)),
    referenceIntro: selfIntro ? [] : reference.part_2_answering.intro || [],
    referenceSha256: manifest.reference_sha256
  };
}

export function sampleAnswerTexts(question) {
  const values = [];
  if (question.sample_answer) values.push(question.sample_answer);
  if (question.sample_answer_star_l) values.push(Object.values(question.sample_answer_star_l).flat().join(' '));
  // alpha-5 (F4): الإجابة الموسّعة (SEAL) تدخل في فحص القرب من النموذج أيضًا.
  if (question.sample_answer_seal && typeof question.sample_answer_seal === 'object') {
    values.push(Object.values(question.sample_answer_seal).flat().filter(Boolean).join(' '));
  }
  if (Array.isArray(question.sample_answers)) {
    question.sample_answers.forEach(item => values.push(typeof item === 'string' ? item : item.answer || ''));
  }
  return values.filter(Boolean);
}
