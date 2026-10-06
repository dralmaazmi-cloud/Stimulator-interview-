// alpha-5 (R1): قواعد الدرجة والاكتمال في دالة خالصة واحدة يشترك فيها الخادم (api/_lib/scoring.js)
// والعميل (report.js). لا DOM ولا شبكة هنا. التقارير المحفوظة القديمة تُعاد حسابها بها عند العرض.

export const WEIGHTS_VERSION = 'phase2-1.1';

export const WEIGHTS = Object.freeze({
  behavioural: Object.freeze({
    context: 10,
    personal_role_or_options: 10,
    action_or_plan: 35,
    result_or_effect: 20,
    learning: 10,
    competency_evidence: 15
  }),
  scenario: Object.freeze({
    context: 10,
    personal_role_or_options: 25,
    action_or_plan: 30,
    result_or_effect: 10,
    learning: 10,
    competency_evidence: 15
  }),
  general: Object.freeze({
    clarity: 25,
    reasoning_depth: 35,
    link_to_practice: 25,
    realism_maturity: 15
  }),
  self_intro: Object.freeze({
    coverage: 60,
    structure_clarity: 25,
    timing: 15
  })
});

// ترتيب العناصر ومعيار كل عنصر (R1).
export const ELEMENT_ORDER = Object.freeze({
  star_l: Object.freeze(['situation', 'task', 'action', 'result', 'learning']),
  seal: Object.freeze(['situation', 'evaluation', 'action', 'leadership_effect'])
});

export const ELEMENT_CRITERION = Object.freeze({
  star_l: Object.freeze({
    situation: 'context',
    task: 'personal_role_or_options',
    action: 'action_or_plan',
    result: 'result_or_effect',
    learning: 'learning'
  }),
  seal: Object.freeze({
    situation: 'context',
    evaluation: 'personal_role_or_options',
    action: 'action_or_plan',
    leadership_effect: 'result_or_effect'
  })
});

// العنصر يُحتسب مكتملًا عند 60% فأكثر (3 من 5).
export const COMPLETE_THRESHOLD = 3;

export function weightFamily(rubricMode, questionType) {
  if (rubricMode === 'general') return 'general';
  if (rubricMode === 'self_intro') return 'self_intro';
  return questionType === 'scenario' ? 'scenario' : 'behavioural';
}

export function weightsFor(rubricMode, questionType) {
  return WEIGHTS[weightFamily(rubricMode, questionType)];
}

function clampScore(value) {
  return Math.max(0, Math.min(5, Number(value) || 0));
}

function criteriaMap(report) {
  const map = new Map();
  (report?.criteria || []).forEach(item => { if (item?.key) map.set(item.key, item); });
  return map;
}

// يعيد نسخة من elements مع حقل complete لكل عنصر، وعدد المكتمل والمجموع.
export function completeElements(report) {
  const mode = report?.rubric_mode;
  const order = ELEMENT_ORDER[mode] || [];
  const mapping = ELEMENT_CRITERION[mode] || {};
  const criteria = criteriaMap(report);
  const elements = {};
  let complete = 0;
  order.forEach(key => {
    const element = report?.elements?.[key] || { present: false, quote: null };
    const criterion = criteria.get(mapping[key]);
    const isComplete = Boolean(element.present)
      && Boolean(criterion)
      && clampScore(criterion.score) >= COMPLETE_THRESHOLD
      && !criterion.unverified;
    elements[key] = { present: Boolean(element.present), quote: element.quote ?? null, complete: isComplete };
    if (isComplete) complete += 1;
  });
  return { elements, elements_complete: complete, elements_total: order.length };
}

// التصنيف بقاعدة الدليل على العناصر المكتملة: كلها «قوية»، ينقص واحد «متوسطة»، ينقص اثنان فأكثر «ضعيفة».
// العام وتقديم الذات بلا تغيير (بالدرجة).
export function classifyByCompletion(rubricMode, completeCount, total, score) {
  if (rubricMode === 'star_l' || rubricMode === 'seal') {
    if (completeCount >= total) return 'قوية';
    if (completeCount === total - 1) return 'متوسطة';
    return 'ضعيفة';
  }
  return score >= 75 ? 'قوية' : score >= 50 ? 'متوسطة' : 'ضعيفة';
}

// صفوف «أين ذهبت الدرجة»: من الأثقل وزنًا؛ النسبة = الدرجة ÷ 5 × 100؛ حصلت على = الدرجة ÷ 5 × الوزن.
export function scoreBreakdown(report, questionType) {
  const weights = weightsFor(report?.rubric_mode, questionType) || {};
  const criteria = criteriaMap(report);
  const rows = Object.entries(weights).map(([key, weight]) => {
    const criterion = criteria.get(key);
    const score = criterion ? clampScore(criterion.score) : 0;
    return {
      key,
      weight,
      score,
      percent: Math.round(score / 5 * 100),
      earned: Math.round(score / 5 * weight * 100) / 100,
      unverified: Boolean(criterion?.unverified)
    };
  }).sort((a, b) => b.weight - a.weight);
  const total = Math.round(rows.reduce((sum, row) => sum + row.earned, 0));
  return { rows, total, weights, weights_version: WEIGHTS_VERSION };
}

// الدالة الكاملة: الدرجة، العناصر المكتملة، التصنيف، نسبة الإجراء.
export function computeReportScore(report, questionType, answerText = '') {
  const family = weightFamily(report?.rubric_mode, questionType);
  const breakdown = scoreBreakdown(report, questionType);
  const completion = completeElements(report);
  const finalScore = breakdown.total;
  const answerWords = String(answerText || '').trim().split(/\s+/).filter(Boolean).length;
  const actionWords = String(report?.elements?.action?.quote || '').trim().split(/\s+/).filter(Boolean).length;
  return {
    final_score: finalScore,
    classification: classifyByCompletion(report?.rubric_mode, completion.elements_complete, completion.elements_total, finalScore),
    elements: completion.elements,
    elements_complete: completion.elements_complete,
    elements_total: completion.elements_total,
    action_ratio: family === 'behavioural' || family === 'scenario'
      ? (answerWords ? Math.round(actionWords / answerWords * 100) : 0)
      : null,
    weights_version: WEIGHTS_VERSION
  };
}

// للعرض: تقرير محفوظ قديم (بلا complete أو بنسخة أوزان أقدم) يُعاد حسابه بالقاعدة نفسها.
// التقرير غير الموثوق يبقى كما هو (بلا درجة).
export function normalizeReportForDisplay(report, questionType) {
  if (!report || report.trusted === false || !Number.isFinite(report.final_score)) return report;
  const hasCompletion = report.weights_version === WEIGHTS_VERSION
    && Number.isFinite(report.elements_complete)
    && Number.isFinite(report.elements_total);
  if (hasCompletion) return report;
  const completion = completeElements(report);
  const breakdown = scoreBreakdown(report, questionType);
  const finalScore = Number.isFinite(report.final_score) ? report.final_score : breakdown.total;
  return {
    ...report,
    elements: { ...(report.elements || {}), ...completion.elements },
    elements_complete: completion.elements_complete,
    elements_total: completion.elements_total,
    classification: classifyByCompletion(report.rubric_mode, completion.elements_complete, completion.elements_total, finalScore),
    weights_version: WEIGHTS_VERSION,
    recomputed_at_display: true
  };
}

export function percentTone(percent) {
  if (percent == null || !Number.isFinite(percent)) return 'none';
  if (percent >= 80) return 'strong';
  if (percent >= 60) return 'medium';
  return 'weak';
}

// الملخص الاحتياطي (R2) عند غياب summary من المقيّم.
export function fallbackSummary(report, questionType, labels = {}) {
  const breakdown = scoreBreakdown(report, questionType);
  const weak = breakdown.rows.find(row => row.percent < 60) || [...breakdown.rows].sort((a, b) => a.percent - b.percent || b.weight - a.weight)[0];
  const label = weak ? (labels[weak.key] || weak.key) : '';
  const completion = completeElements(report);
  const start = label ? ` ابدأ بـ‹${label}›.` : '';
  if (completion.elements_total > 0) return `اكتمل ${completion.elements_complete} من ${completion.elements_total} عناصر.${start}`.trim();
  return start.trim();
}
