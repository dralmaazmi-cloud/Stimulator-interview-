const VALID_FLAGS = new Set(['we_not_i', 'no_result', 'hypothetical_drift', 'generic', 'opinion_not_behaviour', 'off_competency', 'exaggeration']);
const VALID_MODES = new Set(['star_l', 'seal', 'general', 'self_intro']);
const CRITERIA_BY_MODE = Object.freeze({
  star_l: ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence'],
  seal: ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence'],
  general: ['clarity', 'reasoning_depth', 'link_to_practice', 'realism_maturity'],
  self_intro: ['coverage', 'structure_clarity', 'timing']
});
const ELEMENTS_BY_MODE = Object.freeze({
  star_l: ['situation', 'task', 'action', 'result', 'learning'],
  seal: ['situation', 'evaluation', 'action', 'leadership_effect'],
  general: [],
  self_intro: []
});

export function normalizeArabic(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ـ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value, maximum = 20) {
  return [...new Set(array(value).map(item => String(item || '').trim()).filter(Boolean))].slice(0, maximum);
}

function clampScore(value) {
  return Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
}

// alpha-5 (R2): جملة المقيّم تُقصّ إلى الحد وتُحذف منها أي نسبة مئوية أو «من 100» أو «من 5».
export function cleanEvaluatorSentence(value, maximum) {
  const text = String(value || '')
    .replace(/[0-9\u0660-\u0669]+(?:[.,][0-9\u0660-\u0669]+)?\s*(?:%|٪|بالمئة|بالمائة|في المئة|في المائة)/g, '')
    .replace(/[0-9\u0660-\u0669]+\s*من\s*(?:100|١٠٠|5|٥)\b/g, '')
    .replace(/\bمن\s*(?:100|١٠٠)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.،؛:!؟)])/g, '$1')
    .trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1).trimEnd()}…` : text;
}

// alpha-5 (R2): الملخص بلا أرقام ولا تصنيف.
export function cleanSummary(value, maximum = 240) {
  const stripped = cleanEvaluatorSentence(value, Number.MAX_SAFE_INTEGER)
    .replace(/[0-9\u0660-\u0669]+/g, '')
    .replace(/(?<!\p{L})(?:إجابة\s+)?(?:قوية|متوسطة|ضعيفة)(?!\p{L})/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.،؛:!؟)])/g, '$1')
    .trim();
  return stripped.length > maximum ? `${stripped.slice(0, maximum - 1).trimEnd()}…` : stripped;
}

export function shapeErrors(value, expectedQuestionId, expectedMode) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['root'];
  if (value.question_id !== expectedQuestionId) errors.push('question_id');
  if (!VALID_MODES.has(value.rubric_mode) || value.rubric_mode !== expectedMode) errors.push('rubric_mode');
  if (!value.elements || typeof value.elements !== 'object' || Array.isArray(value.elements)) errors.push('elements');
  const expectedCriteria = CRITERIA_BY_MODE[expectedMode] || [];
  if (!Array.isArray(value.criteria) || value.criteria.length !== expectedCriteria.length) errors.push('criteria');
  array(value.criteria).forEach((criterion, index) => {
    if (!criterion || typeof criterion.key !== 'string') errors.push(`criteria.${index}.key`);
    if (!Number.isFinite(Number(criterion?.score)) || Number(criterion.score) < 0 || Number(criterion.score) > 5) errors.push(`criteria.${index}.score`);
    if (!Array.isArray(criterion?.evidence)) errors.push(`criteria.${index}.evidence`);
  });
  const criterionKeys = array(value.criteria).map(item => item?.key);
  if (new Set(criterionKeys).size !== criterionKeys.length
    || expectedCriteria.some(key => !criterionKeys.includes(key))) errors.push('criteria.keys');
  (ELEMENTS_BY_MODE[expectedMode] || []).forEach(key => {
    const element = value.elements?.[key];
    if (!element || typeof element.present !== 'boolean' || !('quote' in element)) errors.push(`elements.${key}`);
  });
  ['expected_points_coverage', 'strengths', 'missing', 'next_actions', 'follow_up_questions', 'flags'].forEach(key => {
    if (!Array.isArray(value[key])) errors.push(key);
  });
  if (!value.behaviours_observed || !Array.isArray(value.behaviours_observed.supporting) || !Array.isArray(value.behaviours_observed.negative)) {
    errors.push('behaviours_observed');
  }
  return errors;
}

export function sanitizeEvaluation(value, context) {
  const allowedSupporting = new Set((context.competency?.supporting_behaviours || []).map(item => typeof item === 'string' ? item : item.text));
  const allowedNegative = new Set((context.competency?.negative_behaviours || []).map(item => typeof item === 'string' ? item : item.text));
  const allowedCriteria = new Set(CRITERIA_BY_MODE[context.question.rubric_mode] || []);
  const sourcePoints = (context.question.expected_points?.points || context.question.expected_answer_points?.points || [])
    .map(item => typeof item === 'string' ? item : item?.text)
    .filter(Boolean);
  const modelCoverage = array(value.expected_points_coverage);
  const result = {
    question_id: context.question.id,
    rubric_mode: context.question.rubric_mode,
    elements: {},
    criteria: array(value.criteria).filter(item => allowedCriteria.has(item?.key)).map(item => ({
      key: String(item?.key || ''),
      score: clampScore(item?.score),
      evidence: strings(item?.evidence, 4),
      justification: String(item?.justification || '').trim(),
      improve: cleanEvaluatorSentence(item?.improve, 160)
    })),
    summary: cleanSummary(value.summary, 240),
    expected_points_coverage: sourcePoints.map(point => {
      const candidate = modelCoverage.find(item => normalizeArabic(item?.point) === normalizeArabic(point));
      return {
        point,
        covered: Boolean(candidate?.covered),
        quote: candidate?.quote == null ? null : String(candidate.quote).trim() || null
      };
    }),
    behaviours_observed: {
      supporting: strings(value.behaviours_observed?.supporting, 12).filter(item => allowedSupporting.has(item)),
      negative: strings(value.behaviours_observed?.negative, 12).filter(item => allowedNegative.has(item))
    },
    mission_command_indicators: strings(value.mission_command_indicators, 6).filter(item => /^M[1-6]$/.test(item)),
    flags: strings(value.flags, 7).filter(item => VALID_FLAGS.has(item)),
    strengths: strings(value.strengths, 5),
    missing: strings(value.missing, 5),
    next_actions: strings(value.next_actions, 3),
    follow_up_questions: strings(value.follow_up_questions, 2),
    follow_up_reasons: strings(value.follow_up_reasons, 2)
  };

  const allowedElements = new Set(ELEMENTS_BY_MODE[context.question.rubric_mode] || []);
  for (const [key, element] of Object.entries(value.elements || {})) {
    if (!allowedElements.has(key)) continue;
    result.elements[key] = {
      present: Boolean(element?.present),
      quote: element?.quote == null ? null : String(element.quote).trim() || null
    };
  }
  return result;
}

// الاقتباس صالح فقط إذا كان ≥ 3 كلمات بعد التطبيع (أو ≥ 12 حرفًا) ومشمولًا حرفيًا في نص المستخدم.
export function quoteLongEnough(normalizedQuote) {
  const wordCount = normalizedQuote.split(' ').filter(Boolean).length;
  return wordCount >= 3 || normalizedQuote.length >= 12;
}

export function verifyEvidence(report, userText) {
  const normalizedUser = normalizeArabic(userText);
  // عدد المعايير التي أعطاها النموذج درجة > 0 قبل أي تخفيض.
  const scoredCriteria = report.criteria.filter(criterion => criterion.score > 0).length;
  let checked = 0;
  let failed = 0;
  const validQuote = quote => {
    checked += 1;
    const normalized = normalizeArabic(quote);
    const valid = quoteLongEnough(normalized) && normalizedUser.includes(normalized);
    if (!valid) failed += 1;
    return valid;
  };

  Object.values(report.elements).forEach(element => {
    if (!element.present) {
      element.quote = null;
      return;
    }
    if (!element.quote || !validQuote(element.quote)) {
      element.present = false;
      element.quote = null;
    }
  });

  report.criteria.forEach(criterion => {
    criterion.evidence = criterion.evidence.filter(validQuote);
    if (criterion.score > 0 && criterion.evidence.length === 0) {
      criterion.score = Math.min(criterion.score, 2);
      criterion.unverified = true;
    }
  });

  report.expected_points_coverage.forEach(item => {
    if (!item.covered) {
      item.quote = null;
      return;
    }
    if (!item.quote || !validQuote(item.quote)) {
      item.covered = false;
      item.quote = null;
    }
  });

  // عدد المعايير ذات الدرجة > 0 التي بقي لها دليل موثّق واحد على الأقل بعد التحقق.
  const verifiedCriteria = report.criteria.filter(criterion => criterion.score > 0 && criterion.evidence.length > 0).length;
  // عدد المعايير الموسومة unverified (درجة > 0 بلا دليل موثّق).
  const unverifiedCriteria = report.criteria.filter(criterion => criterion.unverified).length;

  return {
    report,
    checked,
    failed,
    failureRate: checked ? failed / checked : 0,
    verifiedCriteria,
    scoredCriteria,
    unverifiedCriteria
  };
}

function ngrams(value, n) {
  const tokens = normalizeArabic(value).split(' ').filter(Boolean);
  const result = new Set();
  for (let index = 0; index <= tokens.length - n; index += 1) result.add(tokens.slice(index, index + n).join(' '));
  return result;
}

export function ngramSimilarity(a, b, n = 4) {
  const left = ngrams(a, n);
  const right = ngrams(b, n);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach(item => { if (right.has(item)) overlap += 1; });
  return overlap / new Set([...left, ...right]).size;
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach(item => { if (right.has(item)) overlap += 1; });
  return overlap / new Set([...left, ...right]).size;
}

function contentWords(value) {
  // كلمات التوقف القصيرة (≤ 2 حرف) تُحذف قبل مقارنة مجموعة الكلمات.
  return new Set(normalizeArabic(value).split(' ').filter(word => word.length > 2));
}

// ثلاث نسب تشابه تُعاد منفصلة؛ العتبات تُطبَّق في evaluate.js.
export function referenceSimilarityDetails(answer, sample) {
  return {
    four_gram: ngramSimilarity(answer, sample, 4),
    two_gram: ngramSimilarity(answer, sample, 2),
    word_jaccard: jaccard(contentWords(answer), contentWords(sample))
  };
}

// الأقصى بين تشابه 4-gram وتشابه 2-gram ومعامل Jaccard على مجموعة الكلمات.
export function referenceSimilarity(answer, sample) {
  const details = referenceSimilarityDetails(answer, sample);
  return Math.max(details.four_gram, details.two_gram, details.word_jaccard);
}

export function nearReferenceModel(details) {
  return details.four_gram >= 0.35 || details.two_gram >= 0.45 || details.word_jaccard >= 0.6;
}

// ---------- alpha-5 (الخطوة 5): «مثال مكتمل على غرار موقفك» ----------
export const EXAMPLE_ELEMENTS_BY_MODE = ELEMENTS_BY_MODE;

// كلمات ذات معنى: بعد التطبيع، أطول من حرفين، وليست من كلمات التوقف الشائعة.
const STOP_WORDS = new Set(['في', 'من', 'على', 'إلى', 'الى', 'عن', 'مع', 'أن', 'ان', 'ثم', 'كان', 'كانت', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'كما', 'لم', 'لا', 'ما', 'قد', 'كل', 'بعد', 'قبل', 'حتى', 'بين', 'عند', 'لكن', 'أو', 'او', 'هو', 'هي', 'نحن', 'أنا', 'انا', 'تم', 'وقد', 'ولم', 'فقد']);
export function meaningfulWords(value) {
  return normalizeArabic(value).split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

// نسبة كلمات المقطع ذات المعنى الموجودة في إجابة المتدرب (0–1).
export function traineeOverlap(segmentText, answerText) {
  const answerWords = new Set(meaningfulWords(answerText));
  const words = meaningfulWords(segmentText);
  if (!words.length) return 0;
  const hits = words.filter(word => answerWords.has(word)).length;
  return hits / words.length;
}

export const TRAINEE_OVERLAP_THRESHOLD = 0.7;
export const EXAMPLE_COVERED_MESSAGE = 'إجابتك تغطي العناصر المطلوبة. راجع التعليق على كل معيار لرفعها.';

// تُحذف أي درجة أو نسبة من نص المثال.
function stripScores(value) {
  return String(value || '')
    .replace(/[0-9\u0660-\u0669]+(?:[.,][0-9\u0660-\u0669]+)?\s*(?:%|٪|بالمئة|بالمائة|في المئة|في المائة)/g, '')
    .replace(/[0-9\u0660-\u0669]+\s*من\s*(?:100|١٠٠|5|٥)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function exampleShapeErrors(value, expectedQuestionId, expectedMode) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['root'];
  if (value.question_id !== expectedQuestionId) errors.push('question_id');
  if (value.rubric_mode !== expectedMode) errors.push('rubric_mode');
  if (!Array.isArray(value.segments) || !value.segments.length) errors.push('segments');
  array(value.segments).forEach((segment, index) => {
    if (!segment || typeof segment.text !== 'string' || !segment.text.trim()) errors.push(`segments.${index}.text`);
    if (!['trainee', 'added'].includes(segment?.source)) errors.push(`segments.${index}.source`);
  });
  if (!Array.isArray(value.additions)) errors.push('additions');
  return errors;
}

// تحقق الخادم: مقطع trainee تطابقه مع الإجابة دون 70% يُعاد وسمه added؛ تُحذف الدرجات والنسب؛
// العناصر والمعايير خارج النموذج تُسقط؛ الإضافات حتى ست.
export function sanitizeExample(value, context) {
  const mode = context.question.rubric_mode;
  const allowedElements = new Set(ELEMENTS_BY_MODE[mode] || []);
  const allowedCriteria = new Set(CRITERIA_BY_MODE[mode] || []);
  const answer = context.answer || '';
  let relabelled = 0;
  const segments = array(value.segments)
    .filter(segment => allowedElements.has(segment?.element))
    .map(segment => {
      const text = stripScores(segment.text).slice(0, 1200);
      let source = segment.source === 'trainee' ? 'trainee' : 'added';
      if (source === 'trainee' && traineeOverlap(text, answer) < TRAINEE_OVERLAP_THRESHOLD) {
        source = 'added';
        relabelled += 1;
      }
      return { element: segment.element, text, source };
    })
    .filter(segment => segment.text)
    .slice(0, 12);
  const additions = array(value.additions)
    .filter(item => allowedCriteria.has(item?.criterion))
    .map(item => ({
      criterion: item.criterion,
      what: stripScores(item.what).slice(0, 240),
      why: stripScores(item.why).slice(0, 240)
    }))
    .filter(item => item.what)
    .slice(0, 6);
  const hasAdded = segments.some(segment => segment.source === 'added');
  return {
    question_id: context.question.id,
    rubric_mode: mode,
    segments,
    additions: hasAdded ? additions : [],
    covered: !hasAdded,
    message: hasAdded ? '' : EXAMPLE_COVERED_MESSAGE,
    relabelled_segments: relabelled,
    word_count: segments.map(segment => segment.text).join(' ').split(/\s+/).filter(Boolean).length
  };
}
