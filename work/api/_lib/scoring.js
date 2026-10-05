const WEIGHTS = Object.freeze({
  behavioural: {
    context: 10,
    personal_role_or_options: 10,
    action_or_plan: 35,
    result_or_effect: 20,
    learning: 10,
    competency_evidence: 15
  },
  scenario: {
    context: 10,
    personal_role_or_options: 25,
    action_or_plan: 30,
    result_or_effect: 10,
    learning: 10,
    competency_evidence: 15
  },
  general: {
    clarity: 25,
    reasoning_depth: 35,
    link_to_practice: 25,
    realism_maturity: 15
  },
  self_intro: {
    coverage: 60,
    structure_clarity: 25,
    timing: 15
  }
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function presentCount(report, keys) {
  return keys.filter(key => report.elements?.[key]?.present).length;
}

function classification(report, score) {
  if (report.rubric_mode === 'star_l') {
    const count = presentCount(report, ['situation', 'task', 'action', 'result', 'learning']);
    return count === 5 ? 'قوية' : count === 4 ? 'متوسطة' : 'ضعيفة';
  }
  if (report.rubric_mode === 'seal') {
    const count = presentCount(report, ['situation', 'evaluation', 'action', 'leadership_effect']);
    return count === 4 ? 'قوية' : count === 3 ? 'متوسطة' : 'ضعيفة';
  }
  return score >= 75 ? 'قوية' : score >= 50 ? 'متوسطة' : 'ضعيفة';
}

export function calculateScore(report, questionType, answerText = '') {
  const family = report.rubric_mode === 'general'
    ? 'general'
    : report.rubric_mode === 'self_intro'
      ? 'self_intro'
      : questionType === 'scenario' ? 'scenario' : 'behavioural';
  const weights = WEIGHTS[family];
  const scores = new Map(report.criteria.map(item => [item.key, clamp(Number(item.score) || 0, 0, 5)]));
  let total = 0;
  Object.entries(weights).forEach(([key, weight]) => {
    total += ((scores.get(key) || 0) / 5) * weight;
  });
  const finalScore = Math.round(total);
  const answerWords = String(answerText).trim().split(/\s+/).filter(Boolean).length;
  const actionWords = String(report.elements?.action?.quote || '').trim().split(/\s+/).filter(Boolean).length;
  return {
    final_score: finalScore,
    classification: classification(report, finalScore),
    action_ratio: family === 'behavioural' || family === 'scenario'
      ? (answerWords ? Math.round(actionWords / answerWords * 100) : 0)
      : null,
    weights_version: 'phase2-1.0'
  };
}

export function weightsForTesting() {
  return WEIGHTS;
}
