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
      justification: String(item?.justification || '').trim()
    })),
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

  return {
    report,
    checked,
    failed,
    failureRate: checked ? failed / checked : 0,
    verifiedCriteria
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
