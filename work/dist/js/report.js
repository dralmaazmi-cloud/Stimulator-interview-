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

export function renderSessionSummary(session, options = {}) {
  const allResponses = [session.intro_response, ...(session.responses || [])]
    .filter(item => item?.report && item?.question);
  const trusted = allResponses.filter(item => Number.isFinite(item.report?.final_score));
  const average = trusted.length
    ? Math.round(trusted.reduce((sum, item) => sum + item.report.final_score, 0) / trusted.length)
    : null;
  const strengths = [...new Set(allResponses.flatMap(item => item.report?.strengths || []))].slice(0, 5);
  const actions = [...new Set(allResponses.flatMap(item => item.report?.next_actions || []))].slice(0, 5);
  const previousAverages = (options.previousSessions || []).map(item => {
    const responses = [item.intro_response, ...(item.responses || [])].filter(response => response?.report);
    const scores = responses.map(response => response.report?.final_score).filter(Number.isFinite);
    return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  }).filter(Number.isFinite);
  const previousAverage = previousAverages.length ? previousAverages.at(-1) : null;
  const change = average != null && previousAverage != null ? average - previousAverage : null;
  return el('section', { class: 'session-summary section-block' },
    el('header', { class: 'card session-summary-hero' },
      el('div', {}, el('small', { text: 'اكتملت المحاكاة' }), el('h1', { text: 'ملخص الجلسة' }),
        el('p', { text: `${allResponses.length} إجابة تم تحليلها` })),
      el('div', { class: 'session-average' },
        average == null ? el('strong', { text: '—' }) : el('strong', {}, el('bdi', { text: String(average) }), '%'),
        el('span', { text: average == null ? 'لا توجد درجة موثقة' : 'المتوسط التدريبي' })
      )
    ),
    notice('هذا التقرير أداة تدريب ومتابعة، ولا يتنبأ بنتيجة المقابلة الفعلية.', 'warning'),
    change != null ? el('section', { class: 'card session-comparison' },
      el('strong', { text: 'المقارنة مع آخر جلسة موثقة' }),
      el('span', { class: change >= 0 ? 'positive-change' : 'negative-change' }, el('bdi', { text: `${change >= 0 ? '+' : ''}${change}` }), ' نقطة'),
      el('small', {}, 'السابق ', el('bdi', { text: String(previousAverage) }), ' · الحالي ', el('bdi', { text: String(average) }))
    ) : null,
    el('section', { class: 'session-results' }, ...allResponses.map((item, index) =>
      el('article', { class: 'card session-result-row' },
        el('span', { class: 'session-question-number', text: String(index + 1) }),
        el('div', {}, el('strong', { text: item.question.id === 'SELF-INTRO' ? 'تقديم الذات' : (item.question.competency_name || item.question.principle_title || 'سؤال عام') }),
          el('small', { text: item.question.question })),
        el('span', { class: `session-result-score ${classificationTone(item.report.classification)}`, text: item.report.final_score == null ? '—' : String(item.report.final_score) })
      ))),
    el('div', { class: 'feedback-grid' },
      renderBulletCard('أبرز نقاط القوة', strengths, 'positive', '✓'),
      renderBulletCard('خطوات التحسين', actions, 'action', '↗')
    ),
    el('div', { class: 'button-row no-print' },
      button('طباعة أو تصدير PDF', { onClick: () => window.print() }),
      button('محاكاة جديدة', { variant: 'secondary', onClick: options.onRestart || (() => { location.hash = '#/simulation'; }) }),
      button('سجل الجلسات', { href: '#/sessions', variant: 'secondary' }),
      button('العودة للرئيسية', { href: '#/home', variant: 'ghost' })
    )
  );
}
