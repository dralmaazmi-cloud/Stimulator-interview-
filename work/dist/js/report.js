import { questionSamples } from './data.js';
import { createAiWaiting, el, button, notice, showDialog, tag, formatType, trainingDisclaimer } from './ui.js';
import {
  ELEMENT_ORDER, WEIGHTS_VERSION, normalizeReportForDisplay, percentTone, scoreBreakdown
} from './scoring-rules.js';

export const CRITERIA_LABELS = Object.freeze({
  context: 'فهم الموقف والسياق',
  personal_role_or_options: 'الدور الشخصي أو التقييم',
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

// alpha-5 (F3): أسماء عناصر SEAL موحّدة في كل الشاشات: «فهم الوضع»، «التقييم»، «الإجراء»، «الأثر القيادي».
const STAR_L_LABELS = Object.freeze({
  situation: 'الموقف',
  task: 'المهمة',
  action: 'الإجراء',
  result: 'النتيجة',
  learning: 'التعلّم'
});
const SEAL_LABELS = Object.freeze({
  situation: 'فهم الوضع',
  evaluation: 'التقييم',
  action: 'الإجراء',
  leadership_effect: 'الأثر القيادي',
  leadership_impact: 'الأثر القيادي'
});
export const MODEL_TITLES = Object.freeze({ star_l: 'STAR-L', seal: 'SEAL' });

export function elementLabel(key, mode) {
  if (mode === 'seal') return SEAL_LABELS[key] || STAR_L_LABELS[key] || key;
  return STAR_L_LABELS[key] || SEAL_LABELS[key] || key;
}

const FLAG_LABELS = Object.freeze({
  we_not_i: 'الدور الشخصي غير واضح',
  no_result: 'النتيجة غير مذكورة',
  hypothetical_drift: 'إجابة افتراضية بدل موقف حدث فعلًا',
  generic: 'الإجابة عامة',
  opinion_not_behaviour: 'رأي بدل سلوك',
  off_competency: 'الإجابة بعيدة عن الكفاءة',
  exaggeration: 'مبالغة محتملة'
});

const COMPLETE_RULE_TEXT = 'العنصر يُحتسب مكتملًا عند 60% فأكثر';
export const EXAMPLE_TITLE = 'مثال مكتمل على غرار موقفك';
export const EXAMPLE_BUTTON_TEXT = 'اعرض مثالًا مكتملًا على غرار موقفك';

function classificationTone(value) {
  if (value === 'قوية') return 'strong';
  if (value === 'متوسطة') return 'medium';
  return 'weak';
}

function badgeText(classification) {
  if (classification === 'قوية') return 'إجابة قوية';
  if (classification === 'متوسطة') return 'إجابة متوسطة';
  return 'إجابة ضعيفة';
}

function questionTypeLabel(question) {
  if (question.id === 'SELF-INTRO') return 'تقديم الذات';
  if (question.rubric_mode === 'general') return 'سؤال معرفي';
  return formatType(question.type);
}

function ownerLabel(question) {
  if (question.id === 'SELF-INTRO') return 'تقديم الذات';
  return question.competency_name || question.principle_title || 'أسئلة الذكاء الاصطناعي';
}

// alpha-5 (الخطوة 5): شروط زر المثال — دالة خالصة قابلة للاختبار.
export function exampleButtonVisible(report, question) {
  if (!report || report.trusted === false || !Number.isFinite(report.final_score)) return false;
  if (!['star_l', 'seal'].includes(question?.rubric_mode)) return false;
  const incomplete = Number.isFinite(report.elements_total) && Number.isFinite(report.elements_complete)
    && report.elements_complete < report.elements_total;
  return incomplete || report.final_score < 80;
}

export function incompleteElementKeys(report) {
  return (ELEMENT_ORDER[report?.rubric_mode] || []).filter(key => !report?.elements?.[key]?.complete);
}

export function weakCriterionKeys(report) {
  return (report?.criteria || []).filter(item => (Number(item.score) || 0) / 5 * 100 < 60).map(item => item.key);
}

// ---------- 1. سطر السؤال ----------
function renderQuestionLine(question) {
  return el('section', { class: 'report-question-line card' },
    el('div', { class: 'question-meta' },
      tag(ownerLabel(question), 'accent'),
      tag(questionTypeLabel(question), 'warning')
    ),
    el('p', { class: 'report-question-text', text: question.question })
  );
}

// ---------- 2. بطاقة الدرجة ----------
function renderScoreCard(report, options = {}) {
  if (report.trusted === false || !Number.isFinite(report.final_score)) {
    return el('header', { class: 'score-hero score-card untrusted weak' },
      el('div', {},
        el('h2', { text: 'تقييم غير موثوق' }),
        el('strong', { class: 'final-score', text: 'بلا درجة' })
      ),
      notice('لم تجتز نسبة كافية من الاقتباسات التحقق؛ لذلك لم تُعرض درجة رقمية.', 'danger', '!')
    );
  }
  const percent = report.final_score;
  const tone = percentTone(percent);
  const hasElements = Number.isFinite(report.elements_total) && report.elements_total > 0;
  return el('header', { class: `score-hero score-card ${tone}` },
    el('div', { class: 'score-card-top' },
      el('strong', { class: 'final-score score-ring', style: { '--p': String(Math.max(0, Math.min(100, percent))) } }, el('bdi', { text: `${percent}%` })),
      el('div', { class: 'score-card-copy' },
        el('span', { class: `score-badge ${classificationTone(report.classification)}`, text: badgeText(report.classification) }),
        hasElements ? el('p', { class: 'elements-complete-line', text: `العناصر المكتملة: ${report.elements_complete} من ${report.elements_total}` }) : null
      )
    ),
    el('div', { class: 'score-track', role: 'progressbar', 'aria-valuenow': String(percent), 'aria-valuemin': '0', 'aria-valuemax': '100' },
      el('span', { class: tone, style: { width: `${Math.max(0, Math.min(100, percent))}%` } })
    ),
    report.summary ? el('p', { class: 'score-summary', text: report.summary }) : null,
    el('p', { class: 'trust-line', text: options.trustText || 'اجتاز التقرير فحص المخطط والاقتباسات الحرفية.' })
  );
}

// ---------- 3. أين ذهبت الدرجة ----------
function renderBreakdown(report, question) {
  if (!Number.isFinite(report.final_score)) return null;
  const breakdown = scoreBreakdown(report, question.type);
  if (!breakdown.rows.length) return null;
  const formatEarned = value => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return el('section', { class: 'report-section score-breakdown' },
    el('h3', { text: 'أين ذهبت الدرجة' }),
    el('div', { class: 'breakdown-rows' }, ...breakdown.rows.map(row =>
      el('article', { class: `breakdown-row ${percentTone(row.percent)}` },
        el('div', { class: 'breakdown-head' },
          el('strong', { text: CRITERIA_LABELS[row.key] || row.key }),
          el('bdi', { class: 'breakdown-percent', text: `${row.percent}%` })
        ),
        el('div', { class: 'mini-score-track' }, el('span', { class: percentTone(row.percent), style: { width: `${row.percent}%` } })),
        el('small', { class: 'breakdown-weight', text: `الوزن ${row.weight} · حصلت على ${formatEarned(row.earned)}` }),
        row.unverified ? el('small', { class: 'unverified-label', text: 'دليل غير موثّق؛ خُفّضت الدرجة.' }) : null
      ))),
    el('p', { class: 'breakdown-total', text: `المجموع: ${breakdown.total} من 100` }),
    el('p', { class: 'breakdown-rule', text: COMPLETE_RULE_TEXT })
  );
}

// ---------- 4. نصيب الإجراء ----------
function renderActionShare(report) {
  if (report.action_ratio == null) return null;
  const value = Math.max(0, Math.min(100, Number(report.action_ratio) || 0));
  return el('section', { class: 'report-section action-share' },
    el('h3', { text: 'نصيب الإجراء من إجابتك' }),
    el('div', { class: 'action-share-row' },
      el('div', { class: 'action-share-track' },
        el('span', { class: 'action-share-fill', style: { width: `${value}%` } }),
        el('i', { class: 'action-share-marker', style: { insetInlineStart: '70%' }, 'aria-hidden': 'true' }),
        el('small', { class: 'action-share-marker-label', style: { insetInlineStart: '70%' }, text: '70' })
      ),
      el('bdi', { class: 'action-share-value', text: `${value}%` })
    ),
    el('small', { class: 'action-share-note', text: 'تقديري · قاعدة الدليل: الإجراء هو الجزء الأكبر من الإجابة.' })
  );
}

// ---------- 5. التعليق على كل معيار ----------
function renderCriteriaFeedback(report) {
  const criteria = report.criteria || [];
  if (!criteria.length) return null;
  return el('section', { class: 'report-section criteria-feedback' },
    el('h3', { text: 'التعليق على كل معيار' }),
    el('div', { class: 'criteria-list' }, ...criteria.map(item => {
      const percent = Math.round((Number(item.score) || 0) / 5 * 100);
      const tone = percentTone(percent);
      return el('article', { class: `criterion-card ${tone}` },
        el('div', { class: 'criterion-head' },
          el('strong', { text: CRITERIA_LABELS[item.key] || item.key }),
          el('bdi', { class: `criterion-score ${tone}`, text: `${percent}%` })
        ),
        el('div', { class: 'criterion-lines' },
          el('div', { class: 'criterion-line' },
            el('b', { text: 'ما ظهر في إجابتك' }),
            item.evidence?.length
              ? el('div', { class: 'evidence-quotes' }, ...item.evidence.map(quote => el('q', { text: quote })))
              : el('span', { class: 'muted', text: 'لم يظهر دليل مقتبس.' })
          ),
          el('div', { class: 'criterion-line' },
            el('b', { text: percent >= 80 ? 'التعليق' : 'ما ينقص' }),
            el('span', { text: item.justification || '—' })
          ),
          item.improve ? el('div', { class: 'criterion-line improve-line' },
            el('b', { text: 'كيف ترفعه' }),
            el('span', { text: item.improve })
          ) : null
        ),
        item.unverified ? el('small', { class: 'unverified-label', text: 'دليل غير موثّق؛ خُفّضت الدرجة.' }) : null
      );
    }))
  );
}

// ---------- 6. تغطية النقاط المتوقعة (نقاط حقيقية فقط؛ لا تدخل في الدرجة) ----------
const ELEMENT_NAME_SET = new Set([...Object.values(STAR_L_LABELS), ...Object.values(SEAL_LABELS), 'S', 'T', 'A', 'R', 'L', 'E']);
export function realExpectedPoints(points = []) {
  return points.filter(item => item?.point && !ELEMENT_NAME_SET.has(String(item.point).trim()) && String(item.point).trim().length > 3);
}

function renderCoverage(report) {
  const points = realExpectedPoints(report.expected_points_coverage || []);
  if (!points.length) return null;
  return el('section', { class: 'report-section coverage-section' },
    el('h3', { text: 'تغطية النقاط المتوقعة' }),
    el('small', { class: 'muted', text: 'للاسترشاد فقط؛ لا تدخل في الدرجة.' }),
    el('ul', { class: 'coverage-list' }, ...points.map(item =>
      el('li', { class: item.covered ? 'covered' : 'not-covered' },
        el('span', { text: item.covered ? '✓' : '○' }),
        el('div', {}, el('strong', { text: item.point }), item.quote ? el('q', { text: item.quote }) : null)
      )))
  );
}

// ---------- 7. سلوكيات الدليل والملاحظات (مختصرة) ----------
function renderBehaviours(report) {
  const supporting = report.behaviours_observed?.supporting || [];
  const negative = report.behaviours_observed?.negative || [];
  const flags = report.flags || [];
  const indicators = report.mission_command_indicators || [];
  if (!supporting.length && !negative.length && !flags.length && !indicators.length && !report.near_reference_model) return null;
  return el('section', { class: 'report-section behaviours-card' },
    el('h3', { text: 'سلوكيات الدليل والملاحظات' }),
    supporting.length ? el('div', { class: 'behaviour-line positive' }, el('b', { text: 'سلوكيات داعمة' }), el('span', { text: supporting.join(' · ') })) : null,
    negative.length ? el('div', { class: 'behaviour-line negative' }, el('b', { text: 'سلوكيات تضعف الإجابة' }), el('span', { text: negative.join(' · ') })) : null,
    flags.length ? el('div', { class: 'tag-row flags-card' }, ...flags.map(flag => tag(FLAG_LABELS[flag] || flag, 'warning'))) : null,
    indicators.length ? el('div', { class: 'tag-row mission-indicators' }, ...indicators.map(item => tag(item, 'accent')), el('small', { text: 'مؤشرات قيادة المهمة؛ ضمنية بلا درجة مستقلة.' })) : null,
    report.near_reference_model ? notice('إجابتك قريبة من الإجابة النموذجية. استخدم موقفًا حقيقيًا من خبرتك بدل حفظ المثال.', 'warning') : null
  );
}

// ---------- 8. خطة المحاولة القادمة ----------
function renderNextPlan(report) {
  const actions = (report.next_actions || []).slice(0, 3);
  if (!actions.length) return null;
  return el('section', { class: 'report-section next-plan' },
    el('h3', { text: 'خطة المحاولة القادمة' }),
    el('ol', {}, ...actions.map(item => el('li', { text: item })))
  );
}

function renderStrengths(report) {
  const items = report.strengths || [];
  if (!items.length) return null;
  return el('section', { class: 'report-section strengths-section' },
    el('h3', { text: 'ما أحسنتَ فيه' }),
    el('ul', {}, ...items.map(item => el('li', { text: item })))
  );
}

function renderAnswerAsEvaluated(answer, followups = []) {
  return el('section', { class: 'report-section transcript-review-card' },
    el('h3', { text: 'إجابتك كما قُيّمت' }),
    el('p', { class: 'user-answer-text', text: answer }),
    ...followups.map(item => el('div', { class: 'followup-answer-pair' },
      el('strong', { text: item.question }),
      item.reason ? el('small', { text: `سبب المتابعة: ${item.reason}` }) : null,
      el('p', { text: item.answer })
    ))
  );
}

// ---------- R5: مقارنة بمحاولتك السابقة (نصية) ----------
export function attemptDifferences(current, previous, mode) {
  if (!current || !previous) return [];
  if (current.weights_version !== previous.weights_version) return [];
  const lines = [];
  const delta = (current.score ?? 0) - (previous.score ?? 0);
  if (delta > 0) lines.push(`ارتفعت الدرجة الكلية من ${previous.score}% إلى ${current.score}%.`);
  else if (delta < 0) lines.push(`انخفضت الدرجة الكلية من ${previous.score}% إلى ${current.score}%.`);
  else lines.push(`الدرجة الكلية كما هي: ${current.score}%.`);
  if (Number.isFinite(current.elements_complete) && Number.isFinite(previous.elements_complete)) {
    if (current.elements_complete > previous.elements_complete) lines.push(`اكتمل ${current.elements_complete} من ${current.elements_total} عناصر بعد أن كان ${previous.elements_complete}.`);
    else if (current.elements_complete < previous.elements_complete) lines.push(`تراجع عدد العناصر المكتملة إلى ${current.elements_complete} من ${current.elements_total} بعد أن كان ${previous.elements_complete}.`);
    else lines.push(`عدد العناصر المكتملة ثابت: ${current.elements_complete} من ${current.elements_total}.`);
  }
  const gained = Object.keys(current.elements || {}).filter(key => current.elements[key] && !previous.elements?.[key]);
  const lost = Object.keys(previous.elements || {}).filter(key => previous.elements[key] && !current.elements?.[key]);
  if (gained.length) lines.push(`اكتمل الآن: ${gained.map(key => elementLabel(key, mode)).join('، ')}.`);
  if (lost.length) lines.push(`لم يعد مكتملًا: ${lost.map(key => elementLabel(key, mode)).join('، ')}.`);
  const up = [];
  const down = [];
  Object.keys(current.criteria || {}).forEach(key => {
    const before = previous.criteria?.[key];
    const after = current.criteria?.[key];
    if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return;
    const label = CRITERIA_LABELS[key] || key;
    (after > before ? up : down).push(`${label} (${Math.round(before / 5 * 100)}% ← ${Math.round(after / 5 * 100)}%)`);
  });
  if (up.length) lines.push(`تحسّن: ${up.join('، ')}.`);
  if (down.length) lines.push(`تراجع: ${down.join('، ')}.`);
  return lines;
}

function renderComparison(current, previous, mode) {
  if (!previous || !current) return null;
  const lines = attemptDifferences(current, previous, mode);
  const date = new Date(previous.at);
  const dateText = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-AE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return el('section', { class: 'report-section attempt-comparison no-print' },
    el('h3', { text: 'مقارنة بمحاولتك السابقة' }),
    dateText ? el('small', { class: 'muted', text: `المحاولة السابقة: ${dateText}` }) : null,
    lines.length ? el('ul', {}, ...lines.map(line => el('li', { text: line }))) : el('p', { class: 'muted', text: 'لا تتوفر مقارنة بنسخة الأوزان نفسها.' })
  );
}

// ---------- الخطوة 5: لوحة «مثال مكتمل على غرار موقفك» ----------
export function renderExamplePanel(example, mode) {
  const panel = el('section', { class: 'report-section worked-example no-print' },
    el('h3', { text: EXAMPLE_TITLE }),
    el('p', { class: 'example-lead', text: 'مثال توضيحي يبيّن كيف تُقال الأجزاء الناقصة. ليس إجابتك، ولا يُقيَّم.' })
  );
  if (!example || example.covered || !example.segments?.length) {
    panel.append(
      notice(example?.message || 'إجابتك تغطي العناصر المطلوبة. راجع التعليق على كل معيار لرفعها.', '', '✓'),
      trainingDisclaimer('answer')
    );
    return panel;
  }
  panel.append(
    el('p', { class: 'example-key' }, el('mark', { class: 'example-added', text: 'المظلَّل' }), document.createTextNode(': مضاف للتوضيح')),
    el('div', { class: 'example-text' }, ...example.segments.map(segment =>
      el('p', { class: `example-segment ${segment.source}`, 'data-element': segment.element },
        el('b', { class: 'example-element', text: elementLabel(segment.element, mode) }),
        segment.source === 'added'
          ? el('mark', { class: 'example-added', text: segment.text })
          : el('span', { text: segment.text })
      ))),
    notice('التفاصيل المظللة افتراضية للتوضيح. استبدلها بما حدث معك فعلًا؛ لا تحفظها.', 'warning')
  );
  if (example.additions?.length) {
    panel.append(el('div', { class: 'example-additions' },
      el('h4', { text: 'ما أُضيف ولماذا' }),
      el('ul', {}, ...example.additions.map(item => el('li', {},
        el('b', { text: CRITERIA_LABELS[item.criterion] || item.criterion }),
        el('span', { text: ` ${item.what}` }),
        item.why ? el('small', { text: item.why }) : null
      )))
    ));
  }
  panel.append(trainingDisclaimer('answer'));
  return panel;
}

function renderExampleArea(options, report, question) {
  const { example, onRequestExample } = options;
  if (!['star_l', 'seal'].includes(question.rubric_mode)) return null;
  if (example) return renderExamplePanel(example, question.rubric_mode);
  if (!onRequestExample || !exampleButtonVisible(report, question)) return null;
  const host = el('div', { class: 'worked-example-host no-print' });
  const status = el('div', { class: 'example-status', 'aria-live': 'polite' });
  const trigger = button(EXAMPLE_BUTTON_TEXT, { variant: 'secondary', className: 'wide worked-example-button' });
  trigger.addEventListener('click', async () => {
    trigger.disabled = true;
    const waiting = createAiWaiting({ title: 'جارٍ إعداد المثال…' });
    status.replaceChildren(waiting.node);
    try {
      const result = await onRequestExample({
        question_id: question.id,
        missing_elements: incompleteElementKeys(report),
        weak_criteria: weakCriterionKeys(report)
      }, waiting.options);
      host.replaceChildren(renderExamplePanel(result, question.rubric_mode));
    } catch (error) {
      if (error?.code === 'ABORTED') status.replaceChildren(notice('أُلغي الطلب. يمكنك طلب المثال متى شئت.', 'warning', '!'));
      else status.replaceChildren(notice(error?.message || 'تعذّر إعداد المثال الآن.', 'danger'));
      trigger.disabled = false;
    }
  });
  host.append(trigger, status);
  return host;
}

// ---------- نافذة المقارنة بالإجابة النموذجية (F2) ----------
function showReferenceAnswer(question) {
  const samples = questionSamples(question);
  const body = el('div', { class: 'reference-comparison' },
    notice('للمقارنة بعد التقييم، وليست الإجابة الصحيحة الوحيدة.', 'warning')
  );
  if (!samples.length) body.append(el('p', { text: 'لا يحتوي المرجع على إجابة نموذجية لهذا السؤال.' }));
  samples.forEach(sample => {
    const card = el('article', { class: `sample-answer sample-${sample.kind || 'guide'}` }, el('h3', { text: sample.title }));
    if (sample.subtitle) card.append(el('small', { text: sample.subtitle }));
    if (sample.text) card.append(el('p', { text: sample.text }));
    if (sample.parts) {
      card.append(el('div', { class: 'answer-parts' }, ...Object.entries(sample.parts).map(([key, value]) =>
        el('div', { class: 'answer-part' },
          el('strong', { text: elementLabel(key, question.rubric_mode) }),
          el('span', { text: Array.isArray(value) ? value.join(' • ') : value })
        ))));
    }
    body.append(card);
  });
  if (samples.length) body.append(trainingDisclaimer('answer'));
  showDialog('المقارنة بالإجابة النموذجية', body);
}

// ---------- «كيف حُسبت الدرجة» (الصفحة 2 في PDF) ----------
function renderHowScored(report, question) {
  if (!Number.isFinite(report.final_score)) return null;
  const breakdown = scoreBreakdown(report, question.type);
  return el('section', { class: 'report-section how-scored print-only' },
    el('h3', { text: 'كيف حُسبت الدرجة' }),
    el('p', { text: 'لكل معيار درجة من 0 إلى 5 مبنية على اقتباسات حرفية من إجابتك. تُضرب في وزن المعيار ويُجمع الناتج من 100.' }),
    el('p', { text: `${COMPLETE_RULE_TEXT} (3 من 5) ما دام العنصر مذكورًا ودليله موثّقًا.` }),
    el('p', { text: `الأوزان: ${breakdown.rows.map(row => `${CRITERIA_LABELS[row.key] || row.key} ${row.weight}`).join('، ')}.` }),
    el('p', { class: 'muted', text: `نسخة الأوزان ${WEIGHTS_VERSION}.` })
  );
}

export function renderEvaluationReport(options) {
  const {
    question, answer, followups = [], onFollowup, onNext, onFinish, onRetry, retryHref,
    previousAttempt = null, currentAttempt = null, nextLabel = 'السؤال التالي'
  } = options;
  // R1: التقارير المحفوظة القديمة تُحسب بالقاعدة الجديدة عند العرض.
  const report = normalizeReportForDisplay(options.report, question.type);
  const untrusted = report.trusted === false || !Number.isFinite(report.final_score);

  const panel = el('article', { class: `evaluation-report section-block ${untrusted ? 'untrusted' : ''}` },
    el('div', { class: 'print-header print-only' },
      el('strong', { text: 'تقرير إجابة تدريبي' }),
      el('span', { text: new Intl.DateTimeFormat('ar-AE', { dateStyle: 'medium' }).format(new Date()) })
    ),
    renderQuestionLine(question),
    renderScoreCard(report),
    untrusted ? renderAnswerAsEvaluated(answer, followups) : null,
    !untrusted ? el('div', { class: 'print-page-one' },
      renderBreakdown(report, question),
      renderNextPlan(report),
      renderStrengths(report),
      renderAnswerAsEvaluated(answer, followups)
    ) : null,
    !untrusted ? el('div', { class: 'print-page-two' },
      renderActionShare(report),
      renderCriteriaFeedback(report),
      renderCoverage(report),
      renderBehaviours(report),
      renderHowScored(report, question)
    ) : el('div', {}, renderCriteriaFeedback(report), renderBehaviours(report)),
    !untrusted ? renderComparison(currentAttempt, previousAttempt, question.rubric_mode) : null,
    renderExampleArea(options, report, question),
    el('footer', { class: 'print-footer print-only', text: 'تقييم تدريبي لإجابة واحدة، ولا يتنبأ بنتيجة المقابلة الفعلية.' })
  );

  const actions = el('div', { class: 'report-actions no-print' });
  actions.append(button('تصدير PDF', { variant: 'secondary', className: 'export-pdf', onClick: () => window.print() }));
  if (question.id !== 'SELF-INTRO') {
    if (onRetry) actions.append(button('أعد الإجابة وقارن', { variant: 'secondary', className: 'retry-question', onClick: onRetry }));
    else if (retryHref) actions.append(button('أعد الإجابة وقارن', { variant: 'secondary', className: 'retry-question', href: retryHref }));
    actions.append(button('قارن بالإجابة النموذجية', { variant: 'secondary', className: 'compare-model', onClick: () => showReferenceAnswer(question) }));
  }
  if (report.follow_up_questions?.length && followups.length < 2 && onFollowup) {
    actions.append(button('الإجابة عن سؤال المتابعة', {
      onClick: () => onFollowup(report.follow_up_questions[0], report.follow_up_reasons?.[0] || '')
    }));
  }
  if (onNext) actions.append(button(nextLabel, { onClick: onNext }));
  if (onFinish) actions.append(button('إنهاء وعرض الملخص', { variant: 'ghost', onClick: onFinish }));
  panel.append(trainingDisclaimer(question.id === 'SELF-INTRO' ? 'answer' : 'evaluation'), actions);
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
    .filter(item => item?.report && item?.question)
    .map(item => ({ ...item, report: normalizeReportForDisplay(item.report, item.question.type) }));
  const trusted = responses.filter(item => Number.isFinite(item.report?.final_score));
  const average = roundedAverage(trusted.map(item => item.report.final_score));
  const criteria = new Map();
  // alpha-5 (F5/R1): لكل نموذج سجله المستقل (STAR-L خمسة، SEAL أربعة)، ويُعتمد المكتمل لا المذكور.
  const elements = { star_l: new Map(), seal: new Map() };
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
    const mode = item.report.rubric_mode || item.question.rubric_mode;
    if (elements[mode]) {
      (ELEMENT_ORDER[mode] || []).forEach(key => {
        const value = item.report.elements?.[key];
        const entry = elements[mode].get(key) || { key, mode, complete: 0, total: 0 };
        entry.total += 1;
        if (value?.complete) entry.complete += 1;
        elements[mode].set(key, entry);
      });
    }
    realExpectedPoints(item.report.expected_points_coverage || []).forEach(point => {
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
  const toCoverage = (map, mode) => [...map.values()].map(item => ({
    key: item.key,
    mode,
    label: elementLabel(item.key, mode),
    present: item.complete,
    complete: item.complete,
    total: item.total,
    percent: item.total ? Math.round(item.complete / item.total * 100) : 0
  }));
  const elementCoverageByModel = [
    { mode: 'star_l', title: `اكتمال عناصر ${MODEL_TITLES.star_l}`, subtitle: 'خمسة عناصر: الموقف، المهمة، الإجراء، النتيجة، التعلّم', elements: toCoverage(elements.star_l, 'star_l') },
    { mode: 'seal', title: `اكتمال عناصر ${MODEL_TITLES.seal}`, subtitle: 'أربعة عناصر: فهم الوضع، التقييم، الإجراء، الأثر القيادي', elements: toCoverage(elements.seal, 'seal') }
  ].filter(group => group.elements.length);
  const elementCoverage = elementCoverageByModel.flatMap(group => group.elements);
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
    ...elementCoverage.filter(item => item.percent < 75).slice(0, 2).map(item => `ثبّت عنصر «${item.label}» (${MODEL_TITLES[item.mode]})؛ اكتمل في ${item.complete} من ${item.total} إجابات فقط.`),
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
    element_coverage_by_model: elementCoverageByModel,
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
    detail ? el('small', { text: detail }) : null
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
      el('div', { class: 'session-average', style: average == null ? undefined : { '--p': String(Math.max(0, Math.min(100, average))) } },
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
    // alpha-5 (F5): كل نموذج بعنوانه وسطره؛ لا تُجمع عناصر STAR-L مع SEAL.
    ...insights.element_coverage_by_model.map(group => el('section', { class: `card aggregate-section element-coverage-${group.mode}` },
      el('div', { class: 'aggregate-section-head' }, el('div', {}, el('small', { text: group.subtitle }), el('h2', { text: group.title }))),
      el('div', { class: 'structure-coverage-grid' }, ...group.elements.map(item => el('article', { class: item.percent >= 75 ? 'ready' : 'needs-work' },
        el('strong', { text: item.label }),
        el('bdi', { text: `${item.percent}%` }),
        el('small', { text: `مكتمل في ${item.complete} من ${item.total}` })
      )))
    )),
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
        el('div', {}, el('strong', { text: item.question.id === 'SELF-INTRO' ? 'تقديم الذات' : (item.question.competency_name || item.question.principle_title || 'أسئلة الذكاء الاصطناعي') }),
          el('small', { text: item.question.question })),
        el('span', { class: `session-result-score ${classificationTone(item.report.classification)}`, text: item.report.final_score == null ? '—' : `${item.report.final_score}%` })
      ))),
    trainingDisclaimer('evaluation'),
    el('div', { class: 'button-row no-print' },
      button('طباعة أو تصدير PDF', { onClick: () => window.print() }),
      button('محاكاة جديدة', { variant: 'secondary', onClick: options.onRestart || (() => { location.hash = '#/simulation'; }) }),
      button('خريطة التغطية', { href: '#/coverage', variant: 'secondary' }),
      button('سجل التقارير', { href: '#/reports', variant: 'secondary' }),
      button('العودة للرئيسية', { href: '#/home', variant: 'ghost' })
    )
  );
}
