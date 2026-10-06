const FILES = Object.freeze({
  reference: 'data/reference.json',
  questions: 'data/derived/questions.json',
  competencies: 'data/derived/competencies.json',
  missionMap: 'data/derived/mission-map.json',
  lessons: 'data/derived/lessons.json',
  searchIndex: 'data/derived/search-index.json',
  variants: 'data/derived/variants.json',
  curation: 'data/derived/curation.json',
  questionAudit: 'data/derived/question-audit.json',
  manifest: 'data/derived/manifest.json'
});

let cache = null;

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`تعذر تحميل ${url}: ${response.status}`);
  return response.json();
}

export async function loadData() {
  if (cache) return cache;
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, file]) => [key, await fetchJson(file)]));
  cache = Object.fromEntries(entries);
  cache.questionById = new Map(cache.questions.map(question => [question.id, question]));
  const primaryIds = new Set(cache.curation.primary_ids);
  cache.primaryQuestions = cache.questions.filter(question => primaryIds.has(question.id));
  cache.alternateQuestions = cache.questions.filter(question => !primaryIds.has(question.id));
  cache.primaryQuestionById = new Map(cache.primaryQuestions.map(question => [question.id, question]));
  cache.primaryIdsByCompetency = new Map(cache.competencies.map(competency => [
    competency.id,
    competency.question_ids.filter(id => primaryIds.has(id))
  ]));
  cache.competencyById = new Map(cache.competencies.map(competency => [competency.id, competency]));
  cache.lessonById = new Map(cache.lessons.map(lesson => [lesson.id, lesson]));
  return cache;
}

export function getCachedData() {
  if (!cache) throw new Error('Data has not loaded yet.');
  return cache;
}

export function sectionsByNumber(part) {
  return new Map((part.sections || []).map(section => [section.number, section]));
}

// alpha-5 (F2): السؤال الموقفي يعرض الإجابة الموسّعة بعنوانها الصادق ثم «إجابة الدليل كما هي» حرفيًا.
// (C1): السؤال المعرفي (X1/X2) يعرض «إجابة الدليل» كما هي.
export function questionSamples(question) {
  const results = [];
  if (question.sample_answer_seal) {
    results.push({
      kind: 'expanded',
      title: 'إجابة نموذجية موسّعة، مبنية على إجابة الدليل',
      subtitle: 'استخدمها لفهم طريقة بناء القرار، ولا تحفظها حرفيًا.',
      parts: question.sample_answer_seal
    });
    if (typeof question.sample_answer === 'string' && question.sample_answer.trim()) {
      results.push({ kind: 'guide', title: 'إجابة الدليل كما هي', text: question.sample_answer });
    }
  } else if (question.sample_answer_star_l) {
    results.push({
      kind: 'guide',
      title: 'إجابة نموذجية إرشادية',
      subtitle: 'استخدمها لفهم طريقة بناء الإجابة، ولا تحفظها حرفيًا.',
      parts: question.sample_answer_star_l
    });
  } else if (typeof question.sample_answer === 'string' && question.sample_answer.trim()) {
    results.push({ kind: 'guide', title: 'إجابة الدليل', text: question.sample_answer });
  }
  return results;
}
