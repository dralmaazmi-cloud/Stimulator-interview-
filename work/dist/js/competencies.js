import { isBookmarked, toggleBookmark } from './bookmarks.js';
import { questionSamples } from './data.js';
import { buildAnswerGuidance } from './guidance.js';
import { bookActions } from './print-book.js';
import {
  bindExclusiveAccordions, button, clear, el, formatModel, formatType, icon, notice, tag, toast, trainingDisclaimer
} from './ui.js';

const COMPETENCY_ICONS = ['leadership', 'decision', 'communication', 'team', 'planning', 'problem', 'resilience', 'results'];
const COMPETENCY_TONES = ['mint', 'sand', 'blue', 'rose', 'violet', 'mint', 'blue', 'sand'];
const TRAINED_KEY = 'lic:trained-question-ids';

function trainedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(TRAINED_KEY) || '[]')); } catch { return new Set(); }
}

function markTrainingStarted(questionId) {
  const ids = trainedIds();
  ids.add(questionId);
  localStorage.setItem(TRAINED_KEY, JSON.stringify([...ids]));
}

function skyline() {
  return el('div', { class: 'uae-skyline', 'aria-hidden': 'true' },
    el('i'), el('i'), el('i'), el('i'), el('i'), el('i'), el('i')
  );
}

function bulletList(items, className = '') {
  return el('ul', { class: className }, ...items.filter(Boolean).map(item => el('li', { text: item })));
}

function answerLabels(mode) {
  return mode === 'seal'
    ? { situation: 'فهم الوضع', evaluation: 'التقييم', action: 'الإجراء', leadership_impact: 'الأثر القيادي' }
    : { situation: 'الموقف', task: 'المهمة ودورك', action: 'الإجراء', result: 'النتيجة', learning: 'التعلّم', action_points: 'الإجراءات' };
}

function renderAnswerParts(parts, mode) {
  const labels = answerLabels(mode);
  return el('div', { class: `focus-answer-parts answer-mode-${mode}` },
    ...Object.entries(parts || {}).filter(([, value]) => value != null).map(([key, value], index) =>
      el('article', { class: `focus-answer-part part-${index + 1}` },
        el('span', { class: 'focus-answer-code', text: String(index + 1) }),
        el('div', {},
          el('strong', { text: labels[key] || key }),
          el('p', { text: Array.isArray(value) ? value.join(' • ') : value })
        )
      )
    )
  );
}

function renderSample(sample, mode) {
  return el('section', { class: `focus-answer-sample sample-${sample.kind || 'guide'}` },
    el('header', { class: 'focus-answer-sample-heading' },
      el('h3', { text: sample.title || 'الإجابة النموذجية' }),
      sample.subtitle ? el('p', { text: sample.subtitle }) : null
    ),
    sample.parts
      ? renderAnswerParts(sample.parts, mode)
      : el('p', { class: 'focus-guide-answer', text: sample.text })
  );
}

export async function renderCompetenciesIndex(root, data) {
  clear(root);
  const list = el('section', { class: 'competencies-screen' },
    el('header', { class: 'competencies-heading' },
      skyline(),
      el('small', { text: 'التحضير للمقابلة' }),
      el('h1', { text: 'الكفاءات الثمانية' }),
      el('p', { text: 'اختر الكفاءة، افهم ما يبحث عنه المقابل، ثم افتح أسئلتها وتدرّب عليها.' })
    )
  );

  const grid = el('div', { class: 'competency-card-grid' });
  data.competencies.forEach((competency, index) => {
    const count = data.primaryIdsByCompetency.get(competency.id)?.length || 0;
    grid.append(el('a', { class: `competency-card card tone-${COMPETENCY_TONES[index]}`, href: `#/competencies/${competency.id}` },
      el('span', { class: 'competency-number', text: String(index + 1) }),
      el('span', { class: 'competency-symbol' }, icon(COMPETENCY_ICONS[index])),
      el('strong', { text: competency.name }),
      el('small', { text: `${count} ${count === 1 ? 'سؤال' : 'أسئلة'} بإجابات نموذجية` }),
      el('i', { class: 'card-chevron', 'aria-hidden': 'true', text: '‹' })
    ));
  });
  list.append(grid, bookActions(data, { type: 'competencies' }, 'الكفاءات الثمانية'));
  root.append(list);
}

function defaultQuestionReturn(question) {
  if (question.owner_type === 'mission_command' || question.principle_id) {
    return `#/preparation/U4?question=${encodeURIComponent(question.id)}`;
  }
  if (['X1', 'X2'].includes(question.id)) {
    return `#/preparation/U5?question=${encodeURIComponent(question.id)}`;
  }
  if (question.competency_id) {
    return `#/competencies/${encodeURIComponent(question.competency_id)}?tab=questions&question=${encodeURIComponent(question.id)}`;
  }
  return '#/preparation';
}

function questionLinkCard(question, index, options = {}) {
  const returnHash = options.returnHash || defaultQuestionReturn(question);
  return el('a', {
    class: `smart-question-card question-link-card tone-${COMPETENCY_TONES[index % COMPETENCY_TONES.length]}`,
    href: `#/question/${encodeURIComponent(question.id)}?return=${encodeURIComponent(returnHash)}`,
    'aria-label': `فتح السؤال ${index + 1}: ${question.display_question}`,
    dataset: { questionId: question.id }
  },
  el('span', { class: 'smart-question-number', text: String(index + 1) }),
  el('span', { class: 'smart-question-copy' },
    el('span', { class: 'question-meta' }, tag(formatType(question.type), 'warning'), tag(formatModel(question.rubric_mode), 'accent')),
    el('strong', { text: question.display_question }),
    el('small', { text: 'افتح السؤال، راجع المطلوب، ثم ابنِ إجابتك.' })
  ),
  el('span', { class: 'question-open-action' }, el('span', { text: 'فتح' }), el('i', { 'aria-hidden': 'true', text: '‹' }))
  );
}

export function renderInlineQuestion(question, data, index, options = {}) {
  return questionLinkCard(question, index, options);
}

function accordionItem(id, iconName, title, body, tone = 'mint', open = false) {
  return el('details', { class: `competency-explainer-item tone-${tone}`, id, open },
    el('summary', {},
      el('span', { class: 'competency-explainer-icon' }, icon(iconName)),
      el('strong', { text: title }),
      el('i', { class: 'accordion-chevron', 'aria-hidden': 'true', text: '⌄' })
    ),
    el('div', { class: 'competency-explainer-body' }, body)
  );
}

function meaningPanel(competency) {
  const accordion = el('div', { class: 'competency-explainer' },
    accordionItem('competency-meaning', 'book', 'المعنى الأساسي',
      el('div', { class: 'step-reading' },
        el('p', { text: competency.definition }),
        competency.definition_v1_2025 && competency.definition_v1_2025 !== competency.definition
          ? el('aside', { class: 'definition-note' }, el('strong', { text: 'بصياغة أبسط' }), el('p', { text: competency.definition_v1_2025 }))
          : null
      ), 'mint', true),
    accordionItem('competency-measures', 'target', 'ما الذي يبحث عنه المقابل؟',
      el('div', { class: 'measure-reading-list' }, ...competency.what_interviewer_measures.map((text, index) =>
        el('article', {}, el('span', { text: String(index + 1) }), el('p', { text }))
      )), 'sand')
  );
  return el('section', { class: 'competency-tab-panel active', 'data-panel': 'understand' },
    el('header', { class: 'panel-reading-head' },
      el('small', { text: 'ابدأ من هنا' }),
      el('h2', { text: 'فهم الكفاءة وما الذي تقيسه' }),
      el('p', { text: 'اقرأ المعنى أولًا، ثم افتح ما يبحث عنه المقابل. يظهر بند واحد فقط في كل مرة.' })
    ),
    bindExclusiveAccordions(accordion, `competency-understand-${competency.id}`)
  );
}

function showPanel(competency) {
  const items = el('div', { class: 'competency-explainer' },
    accordionItem('competency-positive', 'readiness', 'سلوكيات تقوّي إجابتك',
      bulletList(competency.supporting_behaviours.map(item => item.text), 'positive-list'), 'blue', true),
    competency.negative_behaviours.length
      ? accordionItem('competency-negative', 'problem', 'سلوكيات تضعف إجابتك',
        bulletList(competency.negative_behaviours.map(item => item.text), 'negative-list'), 'rose')
      : accordionItem('competency-practical', 'problem', 'حوّلها إلى قصة واضحة',
        el('ol', { class: 'practical-steps' },
          el('li', { text: 'اختر موقفًا حقيقيًا واحدًا يثبت الكفاءة.' }),
          el('li', { text: 'وضّح دورك الشخصي وما فعلته أنت تحديدًا.' }),
          el('li', { text: 'اختم بالأثر أو النتيجة وما تعلّمته.' })
        ), 'rose')
  );
  return el('section', { class: 'competency-tab-panel', 'data-panel': 'show', hidden: true },
    el('header', { class: 'panel-reading-head' },
      el('small', { text: 'حوّل الفهم إلى دليل' }),
      el('h2', { text: 'كيف تُظهرها في المقابلة؟' }),
      el('p', { text: 'ركّز على السلوك الذي قمت به، لا على وصف نفسك بصفات عامة.' })
    ),
    bindExclusiveAccordions(items, `competency-show-${competency.id}`)
  );
}

function questionsPanel(competency, questions) {
  return el('section', { class: 'competency-tab-panel competency-questions-panel', 'data-panel': 'questions', hidden: true },
    el('header', { class: 'panel-reading-head' },
      el('small', { text: `${questions.length} ${questions.length === 1 ? 'سؤالًا' : 'أسئلة'} بإجابات نموذجية كاملة` }),
      el('h2', { text: 'أسئلة الكفاءة' }),
      el('p', { text: 'اختر سؤالًا للتركيز على المطلوب وبناء إجابتك خطوة بخطوة.' })
    ),
    el('div', { class: 'smart-question-list' }, ...questions.map((question, index) => questionLinkCard(question, index, {
      returnHash: `#/competencies/${encodeURIComponent(competency.id)}?tab=questions&question=${encodeURIComponent(question.id)}`
    })))
  );
}

function competencyTabs(competency, questions) {
  const panels = {
    understand: meaningPanel(competency),
    show: showPanel(competency),
    questions: questionsPanel(competency, questions)
  };
  const tabs = el('div', { class: 'competency-tabs focus-tabs', role: 'tablist', 'aria-label': 'محتوى الكفاءة' });
  const host = el('div', { class: 'competency-tab-content' }, ...Object.values(panels));
  [['understand', 'فهم الكفاءة'], ['show', 'كيف تُظهرها'], ['questions', 'الأسئلة']].forEach(([id, label], index) => {
    const tab = el('button', {
      type: 'button', class: index === 0 ? 'active' : '', role: 'tab',
      'aria-selected': index === 0 ? 'true' : 'false', text: label
    });
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      Object.entries(panels).forEach(([key, panel]) => {
        panel.hidden = key !== id;
        panel.classList.toggle('active', key === id);
      });
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    tabs.append(tab);
  });
  return { tabs, host };
}

export async function renderCompetencyDetail(root, data, competencyId, params = new URLSearchParams()) {
  const competency = data.competencyById.get(competencyId);
  if (!competency) {
    clear(root).append(notice('الكفاءة المطلوبة غير موجودة.', 'danger'));
    return;
  }
  clear(root);
  const index = Math.max(0, data.competencies.findIndex(item => item.id === competency.id));
  const questions = (data.primaryIdsByCompetency.get(competency.id) || [])
    .map(id => data.questionById.get(id)).filter(Boolean);
  const trained = trainedIds();
  const trainedCount = questions.filter(question => trained.has(question.id)).length;
  const progress = questions.length ? Math.round(trainedCount / questions.length * 100) : 0;
  const bookmarked = localStorage.getItem(`lic:competency-bookmark:${competency.id}`) === 'yes';
  const bookmark = el('button', {
    class: `competency-bookmark ${bookmarked ? 'active' : ''}`, type: 'button', 'aria-label': 'حفظ الكفاءة', 'aria-pressed': String(bookmarked)
  }, icon('bookmark'));
  bookmark.addEventListener('click', () => {
    const active = bookmark.classList.toggle('active');
    bookmark.setAttribute('aria-pressed', String(active));
    localStorage.setItem(`lic:competency-bookmark:${competency.id}`, active ? 'yes' : 'no');
    toast(active ? 'تم حفظ الكفاءة.' : 'تمت إزالة الكفاءة من المحفوظات.');
  });
  const tabs = competencyTabs(competency, questions);

  root.append(el('article', { class: 'competency-focus-page' },
    el('section', { class: `competency-focus-hero tone-${COMPETENCY_TONES[index]}` },
      el('span', { class: 'competency-focus-icon' }, icon(COMPETENCY_ICONS[index])),
      el('div', {},
        el('small', { text: `الكفاءة ${index + 1} من 8` }),
        el('h1', { text: competency.name }),
        el('p', { text: 'افهم ما تعنيه الكفاءة، تعرّف إلى السلوك الذي يثبتها، ثم انتقل إلى أسئلتها.' }),
        el('div', {
          class: 'competency-focus-progress', role: 'progressbar',
          'aria-label': 'تقدم التدريب على أسئلة الكفاءة', 'aria-valuemin': '0',
          'aria-valuemax': '100', 'aria-valuenow': String(progress)
        },
        el('span', {}, el('i', { style: { width: `${progress}%` } })),
        el('small', { text: `بدأت التدريب على ${trainedCount} من ${questions.length}` })
        )
      ),
      bookmark
    ),
    tabs.tabs,
    tabs.host,
    bookActions(data, { type: 'competency', id: competency.id }, competency.name)
  ));

  const requestedQuestion = params.get('question');
  if (params.get('tab') === 'questions' || requestedQuestion) requestAnimationFrame(() => {
    tabs.tabs.querySelector('button:last-child')?.click();
    if (!requestedQuestion) return;
    const card = tabs.host.querySelector(`[data-question-id="${CSS.escape(requestedQuestion)}"]`);
    card?.classList.add('requested');
    requestAnimationFrame(() => card?.scrollIntoView({ block: 'center' }));
  });
}

function focusStepButton(number, label, index) {
  return el('button', { type: 'button', class: 'question-step', dataset: { step: String(index) } },
    el('b', { text: String(number) }), el('span', { text: label })
  );
}

function questionOrigin(question) {
  if (['X1', 'X2'].includes(question.id)) return 'أسئلة الذكاء الاصطناعي';
  return question.competency_name || question.principle_title || 'سؤال قيادي';
}

export async function renderQuestionFocus(root, data, questionId, params = new URLSearchParams()) {
  const question = data.questionById.get(questionId);
  if (!question) {
    clear(root).append(notice('السؤال المطلوب غير موجود.', 'danger'));
    return;
  }
  clear(root);
  const guidance = buildAnswerGuidance(question, data);
  const samples = questionSamples(question);
  let currentStep = 0;
  let answerRevealed = false;
  const requestedReturn = params.get('return');
  const returnHash = requestedReturn?.startsWith('#/') ? requestedReturn : defaultQuestionReturn(question);
  const globalBack = document.querySelector('#back-button');
  if (globalBack) globalBack.dataset.returnHash = returnHash;

  const close = el('button', {
    class: 'question-focus-close', type: 'button',
    'aria-label': 'إغلاق السؤال والعودة إلى قائمة الأسئلة', title: 'إغلاق السؤال'
  }, el('span', { 'aria-hidden': 'true', text: '×' }));
  close.addEventListener('click', () => window.dispatchEvent(new CustomEvent('lic:return-to-context', {
    detail: { returnHash }
  })));

  const bookmark = el('button', {
    class: `question-focus-bookmark ${isBookmarked(question.id) ? 'active' : ''}`,
    type: 'button', 'aria-label': 'حفظ السؤال', 'aria-pressed': String(isBookmarked(question.id))
  }, icon('bookmark'));
  bookmark.addEventListener('click', () => {
    const active = toggleBookmark(question.id);
    bookmark.classList.toggle('active', active);
    bookmark.setAttribute('aria-pressed', String(active));
    toast(active ? 'تم حفظ السؤال.' : 'تمت إزالة السؤال من المحفوظات.');
  });

  const stepper = el('nav', { class: 'question-stepper', 'aria-label': 'مراحل مراجعة السؤال' },
    focusStepButton(1, 'السؤال', 0),
    focusStepButton(2, 'المطلوب', 1),
    focusStepButton(3, 'بناء الإجابة', 2),
    focusStepButton(4, 'المثال', 3)
  );
  const content = el('section', { class: 'question-focus-content', 'aria-live': 'polite' });
  const previous = button('السابق', { variant: 'secondary', className: 'question-prev' });
  const next = button('التالي', { className: 'question-next' });
  const actions = el('footer', { class: 'question-focus-actions' }, previous, next);

  const questionPanel = () => el('div', { class: 'question-focus-panel' },
    el('div', { class: 'question-focus-meta' }, tag(questionOrigin(question), 'accent'), tag(formatModel(question.rubric_mode), 'warning')),
    el('h1', { text: question.display_question }),
    el('aside', { class: 'focus-explanation' },
      el('span', {}, icon('communication')),
      el('div', {}, el('strong', { text: guidance.intent.title }), el('p', { text: guidance.intent.instruction }))
    )
  );

  const requirementsPanel = () => el('div', { class: 'question-focus-panel' },
    el('small', { class: 'focus-kicker', text: 'قبل أن تبدأ الإجابة' }),
    el('h2', { text: 'ما المطلوب في إجابتك؟' }),
    el('p', { class: 'focus-intro', text: guidance.lead || guidance.intent.instruction }),
    el('div', { class: 'focus-checklist' }, ...guidance.points.map((point, index) =>
      el('article', {}, el('span', { text: '✓' }), el('div', {}, el('b', { text: `النقطة ${index + 1}` }), el('p', { text: point })))
    ))
  );

  const blueprintPanel = () => el('div', { class: 'question-focus-panel' },
    el('small', { class: 'focus-kicker', text: `نظّمها وفق ${formatModel(question.rubric_mode)}` }),
    el('h2', { text: 'ابنِ إجابتك خطوة بخطوة' }),
    el('p', { class: 'focus-intro', text: guidance.intent.answerPlan }),
    el('div', { class: 'focus-blueprint' }, ...guidance.elements.map(item =>
      el('article', {}, el('b', { text: item.key }), el('div', {}, el('strong', { text: item.title }), el('p', { text: item.prompt })))
    )),
    el('div', { class: 'focus-training-choices no-print' },
      button('تدرّب بصوتك', {
        href: `#/simulation?question=${encodeURIComponent(question.id)}&answer=voice`,
        onClick: () => markTrainingStarted(question.id)
      }),
      button('تدرّب بالكتابة', {
        href: `#/simulation?question=${encodeURIComponent(question.id)}&answer=text`,
        variant: 'secondary', onClick: () => markTrainingStarted(question.id)
      })
    )
  );

  const examplePanel = () => {
    const panel = el('div', { class: 'question-focus-panel' },
      el('small', { class: 'focus-kicker', text: 'راجع البناء بعد محاولتك' }),
      el('h2', { text: 'الإجابة النموذجية' }),
      el('p', { class: 'focus-intro', text: 'استخدم المثال لفهم طريقة التفكير، ولا تحفظه حرفيًا.' })
    );
    if (!answerRevealed) {
      panel.append(el('section', { class: 'answer-gate' },
        el('span', {}, icon('privacy')),
        el('h3', { text: 'هل كوّنت إجابتك أولًا؟' }),
        el('p', { text: 'إخفاء المثال في البداية يساعدك على التفكير من خبرتك بدل تقليد النص.' }),
        button('إظهار الإجابة النموذجية', {
          onClick: () => { answerRevealed = true; draw(); }
        })
      ));
    } else if (samples.length) panel.append(
      el('div', { class: 'focus-answer-samples' },
        ...samples.map(sample => renderSample(sample, question.rubric_mode))
      ),
      trainingDisclaimer('answer')
    );
    else panel.append(notice('الإجابة النموذجية غير متاحة.', 'warning'));
    return panel;
  };

  const panelFactories = [questionPanel, requirementsPanel, blueprintPanel, examplePanel];
  const draw = () => {
    content.replaceChildren(panelFactories[currentStep]());
    [...stepper.querySelectorAll('.question-step')].forEach((item, index) => {
      item.classList.toggle('active', index === currentStep);
      item.classList.toggle('complete', index < currentStep);
      item.setAttribute('aria-current', index === currentStep ? 'step' : 'false');
    });
    previous.disabled = currentStep === 0;
    next.hidden = currentStep === panelFactories.length - 1;
    next.textContent = currentStep === 0 ? 'التالي: المطلوب' : currentStep === 1 ? 'التالي: بناء الإجابة' : 'التالي: المثال';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  previous.addEventListener('click', () => { if (currentStep > 0) { currentStep -= 1; draw(); } });
  next.addEventListener('click', () => { if (currentStep < panelFactories.length - 1) { currentStep += 1; draw(); } });
  stepper.querySelectorAll('.question-step').forEach((item, index) => item.addEventListener('click', () => {
    currentStep = index;
    draw();
  }));

  root.append(el('article', { class: 'question-focus-page' },
    el('header', { class: 'question-focus-heading' },
      close,
      el('div', {}, el('small', { text: questionOrigin(question) }), el('strong', { text: 'سؤال تدريبي' })),
      bookmark
    ),
    stepper,
    content,
    actions
  ));
  draw();
}
