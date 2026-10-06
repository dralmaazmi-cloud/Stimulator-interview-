import { questionSamples } from './data.js';
import { el, button, notice, showDialog, tag } from './ui.js';

const CRITERIA_LABELS = Object.freeze({
  context: 'فهم الموقف والسياق',
  personal_role_or_options: 'الدور الشخصي أو تحليل الخيارات',
  action_or_plan: 'الإجراء الشخصي أو خطة العمل',
  result_or_effect: 'النتيجة والأثر',
  learning: 'التعلّم والمراجعة',
  competency_evidence: 'أدلة الكفاءة والوضوح',
  clarity: 'الوضوح',
  reasoning_depth: 'عمق التحليل',
  link_to_practice: 'الربط بالممارسة',
  realism_maturity: 'الواقعية والنضج',
  coverage: 'تغطية العناصر',
  structure_clarity: 'الترتيب والوضوح',
  timing: 'الالتزام بالزمن'
});

const ELEMENT_LABELS = Object.freeze({
  situation: 'الموقف',
  task: 'المهمة',
  action: 'الإجراء',
  result: 'النتيجة',
  learning: 'التعلّم',
  evaluation: 'تحليل الخيارات',
  leadership_effect: 'الأثر القيادي'
});

const FLAG_LABELS = Object.freeze({
  we_not_i: 'الدور الشخصي غير واضح',
  no_result: 'النتيجة غير مذكورة',
  hypothetical_drift: 'إجابة افتراضية بدل موقف حدث فعلًا',
  generic: 'الإجابة عامة',
  opinion_not_behaviour: 'رأي بدل سلوك',
  off_competency: 'الإجابة بعيدة عن الكفاءة',
  exaggeration: 'مبالغة محتملة'
});

function classificationTone(value) {
  if (value === 'قوية') return 'strong';
  if (value === 'متوسطة') return 'medium';
  return 'weak';
}

function renderElements(report) {
  const entries = Object.entries(report.elements || {}).filter(([key]) => ELEMENT_LABELS[key]);
  if (!entries.length) return null;
  return el('section', { class: 'report-section' },
    el('h3', { text: 'بنية الإجابة المكتشفة' }),
    el('div', { class: 'element-status-grid' }, ...entries.map(([key, value]) =>
      el('article', { class: `element-status ${value.present ? 'present' : 'missing'}` },
        el('span', { class: 'element-check', text: value.present ? '✓' : '–' }),
        el('strong', { text: ELEMENT_LABELS[key] }),
        value.quote ? el('q', { text: value.quote }) : el('small', { text: 'لم يظهر بوضوح' })
      )))
  );
}

function renderCriteria(criteria = []) {
  if (!criteria.length) return null;
  return el('section', { class: 'report-section' },
    el('h3', { text: 'تفصيل المعايير' }),
    el('div', { class: 'criteria-list' }, ...criteria.map(item =>
      el('article', { class: 'criterion-card' },
        el('div', { class: 'criterion-head' },
          el('strong', { text: CRITERIA_LABELS[item.key] || item.key }),
          el('span', { class: 'criterion-score', text: `${item.score} / 5` })
        ),
        el('div', { class: 'mini-score-track' }, el('span', { style: { width: `${Math.max(0, Math.min(100, item.score / 5 * 100))}%` } })),
        item.justification ? el('p', { text: item.justification }) : null,
        item.evidence?.length ? el('div', { class: 'evidence-quotes' }, ...item.evidence.map(quote => el('q', { text: quote }))) : null,
        item.unverified ? el('small', { class: 'unverified-label', text: 'دليل غير موثّق؛ خُفّضت الدرجة.' }) : null
      )))
  );
}

function renderBulletCard(title, items, tone, icon) {
  if (!items?.length) return null;
  return el('section', { class: `feedback-card ${tone}` },
    el('h3', {}, el('span', { 'aria-hidden': 'true', text: icon }), document.createTextNode(title)),
    el('ul', {}, ...items.map(item => el('li', { text: item })))
  );
}

function showReferenceAnswer(question) {
  const samples = questionSamples(question);
  const body = el('div', { class: 'reference-comparison' },
    notice('هذا نموذج من الدليل للمقارنة بعد التقييم، وليس الإجابة الصحيحة الوحيدة.', 'warning')
  );
  if (!samples.length) body.append(el('p', { text: 'لا يحتوي المرجع على نموذج إجابة لهذا السؤال.' }));
  samples.forEach(sample => {
    const card = el('article', { class: 'sample-answer' }, el('h3', { text: sample.title }));
    if (sample.subtitle) card.append(el('small', { text: sample.subtitle }));
    if (sample.text) card.append(el('p', { text: sample.text }));
    if (sample.parts) {
      card.append(el('div', { class: 'answer-parts' }, ...Object.entries(sample.parts).map(([key, value]) =>
        el('div', { class: 'answer-part' },
          el('strong', { text: ELEMENT_LABELS[key] || key }),
          el('span', { text: Array.isArray(value) ? value.join(' • ') : value })
        ))));
    }
    body.append(card);
  });
  showDialog('المقارنة بنموذج الدليل', body);
}

export function renderEvaluationReport(options) {
  const { report, question, answer, followups = [], onFollowup, onNext, onFinish, nextLabel = 'السؤال التالي' } = options;
  const tone = classificationTone(report.classification);
  const finalScore = report.final_score == null
    ? el('strong', { class: 'final-score', text: 'بلا درجة' })
    : el('strong', { class: 'final-score' }, el('bdi', { text: String(report.final_score) }), ' من 100');
  const panel = el('section', { class: 'evaluation-report section-block' },
    el('header', { class: `score-hero ${tone}` },
      el('div', {}, el('small', { text: 'التصنيف النوعي' }), el('h2', { text: report.trusted === false ? 'تقييم غير موثوق' : `إجابة ${report.classification}` })),
      finalScore
    ),
    report.trusted === false
      ? notice('لم تجتز نسبة كافية من الاقتباسات التحقق؛ لذلك لم تُعرض درجة رقمية.', 'danger', '!')
      : notice('اجتاز التقرير فحص المخطط والاقتباسات الحرفية.', '', '✓'),
    report.near_reference_model
      ? notice('إجابتك قريبة من نموذج الدليل. استخدم موقفًا حقيقيًا من خبرتك بدل حفظ المثال.', 'warning')
      : null,
    el('article', { class: 'card transcript-review-card' },
      el('h3', { text: 'إجابتك المعتمدة' }),
      el('p', { class: 'user-answer-text', text: answer }),
      ...followups.map(item => el('div', { class: 'followup-answer-pair' },
        el('strong', { text: item.question }),
        item.reason ? el('small', { text: `سبب المتابعة: ${item.reason}` }) : null,
        el('p', { text: item.answer })
      ))
    ),
    renderElements(report),
    report.action_ratio != null ? el('section', { class: 'card action-ratio-card' },
      el('div', {}, el('strong', { text: 'نسبة الإجراء المكتشف' }), el('small', { text: 'قاعدة الدليل الإرشادية: الإجراء هو الجزء الأكبر من الإجابة.' })),
      el('span', { text: `${report.action_ratio}%` })
    ) : null,
    renderCriteria(report.criteria),
    report.expected_points_coverage?.length ? el('section', { class: 'report-section' },
      el('h3', { text: 'تغطية النقاط المتوقعة' }),
      el('ul', { class: 'coverage-list' }, ...report.expected_points_coverage.map(item =>
        el('li', { class: item.covered ? 'covered' : 'not-covered' },
          el('span', { text: item.covered ? '✓' : '○' }),
          el('div', {}, el('strong', { text: item.point }), item.quote ? el('q', { text: item.quote }) : null)
        )))
    ) : null,
    el('div', { class: 'feedback-grid' },
      renderBulletCard('نقاط القوة', report.strengths, 'positive', '✓'),
      renderBulletCard('ما ينقص الإجابة', report.missing, 'negative', '!'),
      renderBulletCard('خطوات التحسين', report.next_actions, 'action', '↗')
    ),
    report.flags?.length ? el('section', { class: 'card flags-card' },
      el('h3', { text: 'ملاحظات مهمة' }),
      el('div', { class: 'tag-row' }, ...report.flags.map(flag => tag(FLAG_LABELS[flag] || flag, 'warning')))
    ) : null,
    report.behaviours_observed?.supporting?.length || report.behaviours_observed?.negative?.length
      ? el('section', { class: 'card behaviours-card' },
        el('h3', { text: 'السلوكيات الملحوظة من الدليل' }),
        renderBulletCard('سلوكيات داعمة', report.behaviours_observed.supporting, 'positive', '✓'),
        renderBulletCard('سلوكيات سلبية', report.behaviours_observed.negative, 'negative', '!')
      ) : null,
    report.mission_command_indicators?.length ? el('section', { class: 'card mission-indicators' },
      el('h3', { text: 'مؤشرات قيادة المهمة' }),
      el('div', { class: 'tag-row' }, ...report.mission_command_indicators.map(item => tag(item, 'accent'))),
      el('small', { text: 'مؤشرات ضمنية بلا درجة مستقلة.' })
    ) : null
  );

  const actions = el('div', { class: 'report-actions no-print' });
  if (question.id !== 'SELF-INTRO') {
    actions.append(button('قارن بنموذج الدليل', { variant: 'secondary', onClick: () => showReferenceAnswer(question) }));
  }
  if (report.follow_up_questions?.length && followups.length < 2 && onFollowup) {
    // البند 15: سبب السؤال يُعرض فقط إذا وفّره المخطط (follow_up_reasons)؛ لا نستعير «ما ينقص الإجابة».
    actions.append(button('الإجابة عن سؤال المتابعة', {
      onClick: () => onFollowup(report.follow_up_questions[0], report.follow_up_reasons?.[0] || '')
    }));
  }
  if (onNext) actions.append(button(nextLabel, { onClick: onNext }));
  if (onFinish) actions.append(button('إنهاء وعرض الملخص', { variant: 'ghost', onClick: onFinish }));
  panel.append(actions);
  return panel;
}

function roundedAverage(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}

function frequentItems(items, limit = 5) {
  const counts = new Map();
  items.filter(Boolean).forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'))
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}

export function buildSessionInsights(session) {
  const responses = [session.intro_response, ...(session.responses || [])]
    .filter(item => item?.report && item?.question);
  const trusted = responses.filter(item => Number.isFinite(item.report?.final_score));
  const average = roundedAverage(trusted.map(item => item.report.final_score));
  const criteria = new Map();
  const elements = new Map();
  const competencies = new Map();
  let coverageTotal = 0;
  let coverageCovered = 0;

  // التقارير غير الموثوقة تبقى في التفصيل، لكنها لا تدخل في الاستنتاجات التجميعية.
  trusted.forEach(item => {
    (item.report.criteria || []).forEach(criterion => {
      const entry = criteria.get(criterion.key) || { key: criterion.key, scores: [] };
      entry.scores.push(Number(criterion.score) * 20);
      criteria.set(criterion.key, entry);
    });
    Object.entries(item.report.elements || {}).forEach(([key, value]) => {
      if (!ELEMENT_LABELS[key]) return;
      const entry = elements.get(key) || { key, present: 0, total: 0 };
      entry.total += 1;
      if (value?.present) entry.present += 1;
      elements.set(key, entry);
    });
    (item.report.expected_points_coverage || []).forEach(point => {
      coverageTotal += 1;
      if (point.covered) coverageCovered += 1;
    });
    const competencyId = item.question.competency_id || item.question.principle_id;
    const competencyName = item.question.competency_name || item.question.principle_title;
    if (competencyId) {
      const entry = competencies.get(competencyId) || { id: competencyId, name: competencyName || competencyId, scores: [] };
      entry.scores.push(item.report.final_score);
      competencies.set(competencyId, entry);
    }
  });

  const criterionScores = [...criteria.values()].map(item => ({
    key: item.key,
    label: CRITERIA_LABELS[item.key] || item.key,
    score: roundedAverage(item.scores)
  })).sort((a, b) => a.score - b.score);
  const elementCoverage = [...elements.values()].map(item => ({
    key: item.key,
    label: ELEMENT_LABELS[item.key],
    present: item.present,
    total: item.total,
    percent: item.total ? Math.round(item.present / item.total * 100) : 0
  }));
  const competencyScores = [...competencies.values()].map(item => ({
    id: item.id,
    name: item.name,
    count: item.scores.length,
    score: roundedAverage(item.scores)
  })).sort((a, b) => a.score - b.score);
  const strengths = frequentItems(trusted.flatMap(item => item.report.strengths || []));
  const weaknesses = frequentItems(trusted.flatMap(item => item.report.missing || []));
  const actions = frequentItems(trusted.flatMap(item => item.report.next_actions || []), 6);
  const flags = frequentItems(trusted.flatMap(item => item.report.flags || []));
  const priorities = [
    ...criterionScores.slice(0, 2).map(item => `ارفع مستوى «${item.label}» من ${item.score}% عبر إضافة دليل وتفصيل أوضح.`),
    ...elementCoverage.filter(item => item.percent < 75).slice(0, 2).map(item => `ثبّت عنصر «${item.label}»؛ ظهر بوضوح في ${item.present} من ${item.total} إجابات فقط.`),
    ...competencyScores.slice(0, 1).filter(item => item.score < 75).map(item => `خصّص تدريبك التالي لكفاءة «${item.name}»؛ متوسطها الحالي ${item.score}%.`),
    ...actions.map(item => item.text)
  ].filter((item, index, all) => all.indexOf(item) === index).slice(0, 5);

  return {
    responses,
    trusted_count: trusted.length,
    untrusted_count: responses.length - trusted.length,
    average,
    classification: average == null ? 'غير مكتمل' : average >= 80 ? 'أداء قوي' : average >= 60 ? 'أداء متوسط' : 'يحتاج إلى تطوير',
    criterion_scores: criterionScores,
    element_coverage: elementCoverage,
    competency_scores: competencyScores,
    coverage: { covered: coverageCovered, total: coverageTotal, percent: coverageTotal ? Math.round(coverageCovered / coverageTotal * 100) : null },
    action_ratio: roundedAverage(trusted.map(item => item.report.action_ratio)),
    strengths,
    weaknesses,
    actions,
    flags,
    priorities
  };
}

function insightList(title, items, tone, emptyText) {
  return el('section', { class: `card aggregate-list ${tone}` },
    el('h2', { text: title }),
    items.length ? el('ol', {}, ...items.map(item => el('li', {},
      el('span', { text: item.text || item }),
      item.count > 1 ? el('small', { text: `ظهر ${item.count} مرات` }) : null
    ))) : el('p', { class: 'muted', text: emptyText })
  );
}

function metricCard(value, label, detail) {
  return el('article', { class: 'card aggregate-metric' },
    el('strong', { text: value }),
    el('span', { text: label }),
    el('small', { text: detail })
  );
}

export function renderSessionSummary(session, options = {}) {
  const insights = buildSessionInsights(session);
  const { responses: allResponses, average } = insights;
  const previousAverages = (options.previousSessions || []).map(item => {
    const responses = [item.intro_response, ...(item.responses || [])].filter(response => response?.report);
    const scores = responses.map(response => response.report?.final_score).filter(Number.isFinite);
    return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  }).filter(Number.isFinite);
  const previousAverage = previousAverages.length ? previousAverages.at(-1) : null;
  const change = average != null && previousAverage != null ? average - previousAverage : null;
  return el('section', { class: 'session-summary section-block' },
    el('header', { class: 'card session-summary-hero aggregate-hero' },
      el('div', {}, el('small', { text: 'اكتملت المحاكاة' }), el('h1', { text: 'تقرير المقابلة الشامل' }),
        el('p', { text: `${allResponses.length} إجابة محللة · ${insights.trusted_count} تقييم موثوق` }),
        el('span', { class: `aggregate-classification ${classificationTone(average >= 80 ? 'قوية' : average >= 60 ? 'متوسطة' : 'ضعيفة')}`, text: insights.classification })),
      el('div', { class: 'session-average' },
        average == null ? el('strong', { text: '—' }) : el('strong', {}, el('bdi', { text: String(average) }), '%'),
        el('span', { text: average == null ? 'لا توجد درجة موثقة' : 'المتوسط التدريبي' })
      )
    ),
    notice('هذا التقرير يجمع أدلة جميع الإجابات لتحديد الأنماط المتكررة. هو أداة تدريب ولا يتنبأ بنتيجة المقابلة الفعلية.', 'warning'),
    change != null ? el('section', { class: 'card session-comparison' },
      el('strong', { text: 'المقارنة مع آخر جلسة موثقة' }),
      el('span', { class: change >= 0 ? 'positive-change' : 'negative-change' }, el('bdi', { text: `${change >= 0 ? '+' : ''}${change}` }), ' نقطة'),
      el('small', {}, 'السابق ', el('bdi', { text: String(previousAverage) }), ' · الحالي ', el('bdi', { text: String(average) }))
    ) : null,
    el('section', { class: 'aggregate-metrics' },
      metricCard(average == null ? '—' : `${average}%`, 'الأداء العام', insights.classification),
      metricCard(insights.action_ratio == null ? '—' : `${insights.action_ratio}%`, 'تركيز الإجراء', 'مدى وضوح ما فعلته أنت'),
      metricCard(insights.coverage.percent == null ? '—' : `${insights.coverage.percent}%`, 'تغطية النقاط', insights.coverage.total ? `${insights.coverage.covered} من ${insights.coverage.total}` : 'لا توجد نقاط مصدرية'),
      metricCard(`${insights.trusted_count}/${allResponses.length}`, 'موثوقية التقارير', insights.untrusted_count ? `${insights.untrusted_count} يحتاج مراجعة` : 'جميعها موثوقة')
    ),
    insights.criterion_scores.length ? el('section', { class: 'card aggregate-section' },
      el('div', { class: 'aggregate-section-head' }, el('div', {}, el('small', { text: 'محاور القياس' }), el('h2', { text: 'متوسط معايير المقابلة' }))),
      el('div', { class: 'aggregate-bars' }, ...insights.criterion_scores.map(item => el('article', {},
        el('div', {}, el('strong', { text: item.label }), el('span', { text: `${item.score}%` })),
        el('div', { class: 'mini-score-track' }, el('span', { style: { width: `${item.score}%` } }))
      )))
    ) : null,
    insights.competency_scores.length ? el('section', { class: 'card aggregate-section' },
      el('div', { class: 'aggregate-section-head' }, el('div', {}, el('small', { text: 'قياس المجالات' }), el('h2', { text: 'أداؤك حسب الكفاءة أو مبدأ قيادة المهمة' }))),
      el('div', { class: 'aggregate-bars' }, ...insights.competency_scores.map(item => el('article', {},
        el('div', {}, el('strong', { text: item.name }), el('span', { text: `${item.score}% · ${item.count} إجابة` })),
        el('div', { class: 'mini-score-track' }, el('span', { style: { width: `${item.score}%` } }))
      )))
    ) : null,
    insights.element_coverage.length ? el('section', { class: 'card aggregate-section' },
      el('div', { class: 'aggregate-section-head' }, el('div', {}, el('small', { text: 'بناء الإجابة' }), el('h2', { text: 'اكتمال عناصر STAR-L' }))),
      el('div', { class: 'structure-coverage-grid' }, ...insights.element_coverage.map(item => el('article', { class: item.percent >= 75 ? 'ready' : 'needs-work' },
        el('strong', { text: item.label }),
        el('bdi', { text: `${item.percent}%` }),
        el('small', { text: `${item.present} من ${item.total}` })
      )))
    ) : null,
    el('div', { class: 'aggregate-feedback-grid' },
      insightList('نقاط القوة المتكررة', insights.strengths, 'positive', 'لم تتوفر أدلة كافية بعد.'),
      insightList('نقاط الضعف المتكررة', insights.weaknesses, 'negative', 'لم تظهر نواقص متكررة موثوقة.')
    ),
    el('section', { class: 'card development-plan' },
      el('small', { text: 'خطة التطوير' }),
      el('h2', { text: 'أولوياتك للمحاكاة القادمة' }),
      insights.priorities.length ? el('ol', {}, ...insights.priorities.map((item, index) => el('li', {},
        el('span', { class: 'priority-number', text: String(index + 1) }),
        el('p', { text: item })
      ))) : el('p', { text: 'أكمل إجابات موثوقة أكثر لبناء خطة تطوير شخصية.' })
    ),
    el('section', { class: 'session-results aggregate-question-results' },
      el('div', { class: 'aggregate-section-head' }, el('div', {}, el('small', { text: 'تفصيل المقابلة' }), el('h2', { text: 'نتيجة كل إجابة' }))),
      ...allResponses.map((item, index) =>
      el('article', { class: 'card session-result-row' },
        el('span', { class: 'session-question-number', text: String(index + 1) }),
        el('div', {}, el('strong', { text: item.question.id === 'SELF-INTRO' ? 'تقديم الذات' : (item.question.competency_name || item.question.principle_title || 'سؤال عام') }),
          el('small', { text: item.question.question })),
        el('span', { class: `session-result-score ${classificationTone(item.report.classification)}`, text: item.report.final_score == null ? '—' : String(item.report.final_score) })
      ))),
    el('div', { class: 'button-row no-print' },
      button('طباعة أو تصدير PDF', { onClick: () => window.print() }),
      button('محاكاة جديدة', { variant: 'secondary', onClick: options.onRestart || (() => { location.hash = '#/simulation'; }) }),
      button('سجل التقارير', { href: '#/reports', variant: 'secondary' }),
      button('العودة للرئيسية', { href: '#/home', variant: 'ghost' })
    )
  );
}
