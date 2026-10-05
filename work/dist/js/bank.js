import { questionSamples } from './data.js';
import { buildAnswerGuidance } from './guidance.js';
import { isBookmarked, toggleBookmark } from './bookmarks.js';
import { el, button, clear, formatModel, formatType, normalizeArabic, notice, pageHead, tag, toast } from './ui.js';

const PAGE_SIZE = 16;

export function renderBank(root, data, params = new URLSearchParams()) {
  clear(root);
  root.append(
    pageHead('89 سؤالًا أساسيًا', 'بنك الأسئلة والأجوبة', 'كل سؤال يشرح المطلوب، والنقاط التي يجب ذكرها، ثم يعرض إجابة نموذجية من الدليل.'),
    notice('تم دمج الصياغات المتشابهة لمنع التكرار. تبقى 38 صياغة إضافية محفوظة ويمكن عرضها من المرشحات.', '', '✓')
  );

  const toolbar = el('section', { class: 'card toolbar-card no-print', 'aria-label': 'مرشحات بنك الأسئلة' });
  const search = el('input', { class: 'input search-input', type: 'search', placeholder: 'ابحث في السؤال أو الكفاءة…', 'aria-label': 'بحث' });
  const owner = selectField('المجال', [
    ['', 'كل المجالات'],
    ...data.competencies.map(c => [c.id, c.name]),
    ['mission_command', 'قيادة المهمة'],
    ['additional', 'الأسئلة الإضافية']
  ]);
  const type = selectField('نوع السؤال', [['', 'كل الأنواع'], ['behavioural', 'سلوكي'], ['scenario', 'سيناريو'], ['general', 'عام']]);
  const collection = selectField('مجموعة الأسئلة', [
    ['primary', 'الأسئلة الأساسية (89)'],
    ['alternate', 'الصياغات الإضافية (38)'],
    ['all', 'جميع أسئلة الدليل (127)']
  ]);
  toolbar.append(el('div', { class: 'filter-grid bank-filter-grid' },
    el('label', { class: 'field' }, el('span', { text: 'البحث' }), search),
    owner.wrapper,
    type.wrapper,
    collection.wrapper
  ));

  const resetButton = button('مسح المرشحات', { variant: 'ghost small' });
  toolbar.append(el('div', { class: 'button-row compact-row' }, resetButton));

  // البند 15: العدّادات تُحسب من المجموعة المختارة وتتحدث مع كل تطبيق للمرشحات.
  const totals = el('div', { class: 'bank-totals' });
  const drawTotals = pool => totals.replaceChildren(
    total(String(pool.filter(question => question.owner_type === 'competency').length), 'أسئلة الكفاءات'),
    total(String(pool.filter(question => question.owner_type === 'mission_command').length), 'قيادة المهمة'),
    total(String(pool.filter(question => question.owner_type === 'additional').length), 'إضافية')
  );
  const summary = el('div', { class: 'results-summary', 'aria-live': 'polite' });
  const list = el('div', { class: 'question-list' });
  const moreHost = el('div', { class: 'button-row' });
  root.append(toolbar, totals, summary, list, moreHost);

  let visible = PAGE_SIZE;
  let current = data.primaryQuestions;
  if (params.get('q')) search.value = params.get('q');
  if (params.get('competency')) owner.select.value = params.get('competency');

  const selectedCollection = () => {
    if (collection.select.value === 'alternate') return data.alternateQuestions;
    if (collection.select.value === 'all') return data.questions;
    return data.primaryQuestions;
  };

  const apply = () => {
    const query = normalizeArabic(search.value);
    drawTotals(selectedCollection());
    current = selectedCollection().filter(question => {
      const ownerValue = owner.select.value;
      const ownerMatch = !ownerValue
        || question.competency_id === ownerValue
        || (ownerValue === 'mission_command' && question.owner_type === 'mission_command')
        || (ownerValue === 'additional' && question.owner_type === 'additional');
      const typeValue = type.select.value;
      const typeMatch = !typeValue || question.type === typeValue || (typeValue === 'general' && question.rubric_mode === 'general');
      const haystack = normalizeArabic([
        question.id, question.display_question, question.competency_name,
        question.principle_title, question.label
      ].filter(Boolean).join(' '));
      return ownerMatch && typeMatch && (!query || haystack.includes(query));
    });
    visible = PAGE_SIZE;
    draw();
  };

  const draw = () => {
    list.replaceChildren();
    summary.textContent = `${current.length} سؤالًا مطابقًا`;
    if (!current.length) {
      list.append(el('div', { class: 'card empty-state' },
        el('strong', { text: 'لا توجد نتائج مطابقة' }),
        el('p', { text: 'غيّر كلمة البحث أو أحد المرشحات.' })
      ));
    } else current.slice(0, visible).forEach(question => list.append(renderQuestionPreview(question)));
    moreHost.replaceChildren();
    if (visible < current.length) moreHost.append(button(`عرض المزيد (${Math.min(PAGE_SIZE, current.length - visible)})`, {
      variant: 'secondary',
      onClick: () => { visible += PAGE_SIZE; draw(); }
    }));
  };

  [search, owner.select, type.select, collection.select].forEach(input => input.addEventListener(input === search ? 'input' : 'change', apply));
  resetButton.addEventListener('click', () => {
    search.value = '';
    owner.select.value = '';
    type.select.value = '';
    collection.select.value = 'primary';
    apply();
  });
  apply();
}

export function renderQuestionDetail(root, data, questionId) {
  const question = data.questionById.get(questionId);
  if (!question) {
    clear(root).append(notice('السؤال المطلوب غير موجود.', 'danger'));
    return;
  }
  clear(root);
  root.append(pageHead(
    question.pdf_page ? `${question.id} · صفحة ${question.pdf_page} في الدليل` : question.id,
    'السؤال والإجابة',
    'اقرأ السؤال، وافهم المطلوب والنقاط الأساسية، ثم افتح الإجابة النموذجية.'
  ));

  if (question.learning_status === 'alternate') {
    root.append(notice(`هذه صياغة إضافية من الدليل. السؤال الأساسي المرتبط بها هو ${question.alternate_of}.`, 'warning', '↔'));
  }

  const guidance = buildAnswerGuidance(question, data);
  const samples = questionSamples(question);
  root.append(el('nav', { class: 'question-flow-steps', 'aria-label': 'خطوات مراجعة السؤال' },
    flowStep('1', 'السؤال'), flowStep('2', 'المطلوب'), flowStep('3', 'النقاط'), flowStep('4', 'الإجابة')
  ));

  const questionCard = el('article', { class: 'card question-detail-card' },
    el('span', { class: 'flow-section-label', text: '1 — السؤال' }),
    el('div', { class: 'question-meta' },
      tag(question.competency_name || question.principle_title || 'سؤال عام', 'accent'),
      tag(formatType(question.type), 'warning'),
      tag(formatModel(question.rubric_mode)),
      question.id === 'X1' || question.id === 'X2' ? tag('🤖 ذكاء اصطناعي', 'accent') : null
    ),
    el('h2', { class: 'question-detail-text', text: question.question }),
    question.options?.length ? el('ol', { class: 'question-options' }, ...question.options.map(option => el('li', { text: option }))) : null,
    question.question_continuation ? el('p', { class: 'question-continuation', text: question.question_continuation }) : null
  );

  const intentCard = el('section', { class: 'card question-intent-card' },
    el('span', { class: 'flow-section-label', text: '2 — ماذا يريد منك المقابل؟' }),
    el('h2', { text: guidance.intent.title }),
    el('p', { text: guidance.intent.instruction }),
    el('div', { class: 'intent-plan' },
      el('strong', { text: 'طريقة تنظيم الإجابة' }),
      el('span', { text: guidance.intent.answerPlan })
    )
  );

  const guidanceCard = el('section', { class: 'card guidance-panel' },
    el('span', { class: 'flow-section-label', text: '3 — ما الذي يجب أن تذكره؟' }),
    el('span', { class: `guidance-label ${guidance.kind}`, text: guidance.label }),
    el('p', { class: 'muted', text: guidance.lead }),
    guidance.points.length ? el('ul', { class: 'guidance-points' }, ...guidance.points.map(point => el('li', { text: point }))) : null,
    el('h3', { text: 'رتّب الإجابة بهذا التسلسل' }),
    el('div', { class: 'model-elements' }, ...guidance.elements.map(item => el('article', { class: 'model-element' },
      el('span', { text: item.key }),
      el('div', {}, el('strong', { text: item.title }), el('p', { text: item.prompt }))
    )))
  );

  const modelDetails = el('details', { class: 'reveal answer-reveal' },
    el('summary', { text: `إظهار الإجابة النموذجية${samples.length > 1 ? ` (${samples.length})` : ''}` })
  );
  const modelBody = el('div', { class: 'reveal-content stack' },
    el('span', { class: 'flow-section-label', text: '4 — الإجابة النموذجية من الدليل' }),
    notice('مثال إرشادي لفهم البناء، وليس نصًا للحفظ.', 'warning', 'ⓘ')
  );
  samples.forEach(sample => modelBody.append(renderSample(sample)));
  if (question.sample_answer_note) modelBody.append(el('p', { class: 'muted', text: question.sample_answer_note }));
  modelDetails.append(modelBody);

  const bookmarkButton = button(isBookmarked(question.id) ? 'السؤال محفوظ ★' : 'حفظ السؤال ☆', { variant: 'secondary' });
  bookmarkButton.addEventListener('click', () => {
    const saved = toggleBookmark(question.id);
    bookmarkButton.textContent = saved ? 'السؤال محفوظ ★' : 'حفظ السؤال ☆';
    toast(saved ? 'تم حفظ السؤال على جهازك.' : 'تمت إزالة السؤال من المحفوظات.');
  });
  const next = nextQuestion(data, question);

  root.append(questionCard, intentCard, guidanceCard, modelDetails,
    el('div', { class: 'button-row question-navigation no-print' },
      button('تدرّب على هذا السؤال', { href: `#/simulation?question=${encodeURIComponent(question.id)}`, variant: 'secondary' }),
      next ? button('السؤال التالي', { href: `#/bank/${next.id}` }) : null,
      bookmarkButton,
      button('بنك الأسئلة', { href: '#/bank', variant: 'ghost' })
    )
  );
}

function nextQuestion(data, question) {
  let pool;
  if (question.competency_id) pool = data.primaryQuestions.filter(item => item.competency_id === question.competency_id);
  else if (question.owner_type === 'mission_command') pool = data.primaryQuestions.filter(item => item.owner_type === 'mission_command');
  else pool = data.primaryQuestions.filter(item => item.owner_type === 'additional');
  const baseId = question.learning_status === 'alternate' ? question.alternate_of : question.id;
  const index = pool.findIndex(item => item.id === baseId);
  if (!pool.length) return null;
  return pool[(index + 1 + pool.length) % pool.length];
}

function renderQuestionPreview(question) {
  return el('article', { class: 'card question-preview' },
    el('div', { class: 'question-preview-top' },
      el('div', { class: 'question-meta' },
        tag(question.competency_name || question.principle_title || 'سؤال عام', 'accent'),
        tag(formatType(question.type), 'warning'),
        question.learning_status === 'alternate' ? tag('صياغة إضافية') : tag('إجابة نموذجية متوفرة', 'success'),
        question.id === 'X1' || question.id === 'X2' ? tag('🤖 ذكاء اصطناعي', 'accent') : null
      ),
      el('span', { class: 'question-id', text: question.id })
    ),
    el('h2', { text: question.display_question }),
    el('div', { class: 'question-preview-foot' },
      el('span', { class: 'source-page', text: question.pdf_page ? `صفحة ${question.pdf_page} في الدليل` : '' }),
      button('فتح السؤال والإجابة', { href: `#/bank/${question.id}`, variant: 'ghost small' })
    )
  );
}

function renderSample(sample) {
  const section = el('section', { class: 'sample-answer' }, el('h3', { text: sample.title }));
  if (sample.subtitle) section.append(el('small', { class: 'muted', text: sample.subtitle }));
  if (sample.text) section.append(el('p', { text: sample.text }));
  if (sample.parts) {
    const labels = {
      situation: 'S — الموقف', task: 'T — المهمة', action: 'A — الإجراء',
      result: 'R — النتيجة', learning: 'L — التعلّم', action_points: 'نقاط الإجراء'
    };
    section.append(el('div', { class: 'answer-parts' }, ...Object.entries(sample.parts)
      .filter(([, value]) => value != null)
      .map(([key, value]) => el('div', { class: `answer-part answer-${key}` },
        el('strong', { text: labels[key] || key }),
        el('span', { text: Array.isArray(value) ? value.join(' • ') : value })
      ))));
  }
  return section;
}

function selectField(label, options) {
  const select = el('select', { class: 'input', 'aria-label': label });
  options.forEach(([value, text]) => select.append(el('option', { value, text })));
  return { select, wrapper: el('label', { class: 'field' }, el('span', { text: label }), select) };
}

function total(value, label) {
  return el('div', {}, el('strong', { text: value }), el('span', { text: label }));
}

function flowStep(number, label) {
  return el('span', {}, el('b', { text: number }), el('small', { text: label }));
}
