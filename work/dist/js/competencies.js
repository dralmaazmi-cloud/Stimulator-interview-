import { questionSamples } from './data.js';
import { buildAnswerGuidance } from './guidance.js';
import {
  button, clear, el, formatModel, formatType, icon, notice, printActions, tag, toast
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

export async function renderCompetenciesIndex(root, data) {
  clear(root);
  const list = el('section', { class: 'competencies-screen' },
    el('header', { class: 'competencies-heading' },
      skyline(),
      el('small', { text: 'التحضير للمقابلة' }),
      el('h1', { text: 'الكفاءات الثمانية' }),
      el('p', { text: 'اختر الكفاءة، افهم ما يقيسه المقابل، ثم تدرّب على أسئلتها.' })
    )
  );

  const grid = el('div', { class: 'competency-card-grid' });
  data.competencies.forEach((competency, index) => {
    const count = data.primaryIdsByCompetency.get(competency.id)?.length || 0;
    grid.append(el('a', { class: `competency-card card tone-${COMPETENCY_TONES[index]}`, href: `#/competencies/${competency.id}` },
      el('span', { class: 'competency-number', text: String(index + 1) }),
      el('span', { class: 'competency-symbol' }, icon(COMPETENCY_ICONS[index])),
      el('strong', { text: competency.name }),
      el('small', { text: `${count} ${count === 1 ? 'سؤال للتدريب' : 'أسئلة للتدريب'}` }),
      el('i', { class: 'card-chevron', 'aria-hidden': 'true', text: '‹' })
    ));
  });
  list.append(grid, printActions('ملخص الكفاءات'));
  root.append(list);
}

function bulletList(items, className = '') {
  return el('ul', { class: className }, ...items.map(item => el('li', { text: item })));
}

function renderAnswerParts(parts, mode) {
  const labels = mode === 'seal'
    ? { situation: 'فهم الوضع', evaluation: 'التقييم', action: 'الإجراء', leadership_impact: 'الأثر القيادي' }
    : { situation: 'الموقف', task: 'المهمة ودورك', action: 'الإجراء', result: 'النتيجة', learning: 'التعلّم', action_points: 'الإجراءات' };
  return el('div', { class: `inline-answer-parts answer-mode-${mode}` },
    ...Object.entries(parts || {}).filter(([, value]) => value != null).map(([key, value], index) =>
      el('article', { class: `inline-answer-part part-${index + 1}` },
        el('strong', { text: labels[key] || key }),
        el('p', { text: Array.isArray(value) ? value.join(' • ') : value })
      )
    )
  );
}

export function renderInlineQuestion(question, data, index, options = {}) {
  const guidance = buildAnswerGuidance(question, data);
  const sample = questionSamples(question)[0];
  const details = el('details', {
    class: 'smart-question-card',
    id: `question-${question.id}`,
    open: options.open === true
  });
  const summary = el('summary', {},
    el('span', { class: 'smart-question-number', text: String(index + 1) }),
    el('span', { class: 'smart-question-copy' },
      el('span', { class: 'question-meta' }, tag(formatType(question.type), 'warning'), tag(formatModel(question.rubric_mode), 'accent')),
      el('strong', { text: question.display_question })
    ),
    el('i', { class: 'accordion-chevron', 'aria-hidden': 'true', text: '⌄' })
  );

  const required = el('section', { class: 'inline-question-section requirement-section' },
    el('h4', { text: 'ما الذي يريد المقابل سماعه؟' }),
    el('p', { text: guidance.intent.instruction }),
    guidance.points.length ? bulletList(guidance.points, 'guidance-points') : null
  );
  const blueprint = el('section', { class: 'inline-question-section blueprint-section' },
    el('h4', { text: 'خريطة بناء الإجابة' }),
    el('div', { class: 'inline-blueprint' }, ...guidance.elements.map(item =>
      el('article', {}, el('b', { text: item.key }), el('div', {}, el('strong', { text: item.title }), el('small', { text: item.prompt })))
    ))
  );
  const answer = el('section', { class: 'inline-question-section model-answer-section' },
    el('div', { class: 'inline-model-heading' },
      el('div', {}, el('h4', { text: 'إجابة نموذجية إرشادية' }), el('small', { text: 'لفهم البناء وطريقة التفكير، وليست نصًا للحفظ.' }))
    ),
    sample ? renderAnswerParts(sample.parts, question.rubric_mode) : notice('الإجابة غير متاحة حاليًا.', 'warning')
  );
  const train = button('تدرّب على هذا السؤال', {
    href: `#/simulation?question=${encodeURIComponent(question.id)}&answer=voice`,
    className: 'wide inline-train-button'
  });
  train.addEventListener('click', () => markTrainingStarted(question.id));
  details.append(summary, el('div', { class: 'smart-question-body' }, required, blueprint, answer, train));
  return details;
}

function makeTabs(competency) {
  const panels = {
    meaning: el('section', { class: 'competency-tab-panel active', 'data-panel': 'meaning' },
      el('h2', { text: 'معنى الكفاءة' }), el('p', { text: competency.definition })
    ),
    measure: el('section', { class: 'competency-tab-panel', 'data-panel': 'measure', hidden: true },
      el('h2', { text: 'ما الذي يقيسه المقابل؟' }),
      el('div', { class: 'measure-tile-grid' }, ...competency.what_interviewer_measures.map((text, index) =>
        el('article', { class: `measure-tile tone-${COMPETENCY_TONES[index % COMPETENCY_TONES.length]}` },
          el('span', {}, icon(index % 2 ? 'target' : 'communication')), el('p', { text })
        )
      ))
    ),
    show: el('section', { class: 'competency-tab-panel', 'data-panel': 'show', hidden: true },
      el('h2', { text: 'كيف تظهرها في إجابتك؟' }),
      el('div', { class: 'behaviour-columns' },
        el('article', { class: 'supporting-column' }, el('h3', { text: 'سلوكيات تقوّي إجابتك' }), bulletList(competency.supporting_behaviours.map(item => item.text), 'positive-list')),
        competency.negative_behaviours.length
          ? el('article', { class: 'negative-column' }, el('h3', { text: 'سلوكيات تضعفها' }), bulletList(competency.negative_behaviours.map(item => item.text), 'negative-list'))
          : null
      )
    )
  };
  const tabs = el('div', { class: 'competency-tabs', role: 'tablist', 'aria-label': 'محتوى الكفاءة' });
  const host = el('div', { class: 'competency-tab-content' }, ...Object.values(panels));
  [['meaning', 'المعنى'], ['measure', 'ما يُقاس'], ['show', 'كيف تُظهرها']].forEach(([id, label], index) => {
    const tab = el('button', { type: 'button', class: index === 0 ? 'active' : '', role: 'tab', 'aria-selected': index === 0 ? 'true' : 'false', text: label });
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
      Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== id; panel.classList.toggle('active', key === id); });
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
  const questions = (data.primaryIdsByCompetency.get(competency.id) || []).map(id => data.questionById.get(id)).filter(Boolean);
  const trained = trainedIds();
  const trainedCount = questions.filter(question => trained.has(question.id)).length;
  const progress = questions.length ? Math.round(trainedCount / questions.length * 100) : 0;
  const requestedQuestion = params.get('question');
  const tabs = makeTabs(competency);
  const questionList = el('div', { class: 'smart-question-list' },
    ...questions.map((question, questionIndex) => renderInlineQuestion(question, data, questionIndex, { open: question.id === requestedQuestion }))
  );
  questionList.querySelectorAll('details').forEach(item => item.addEventListener('toggle', () => {
    if (!item.open) return;
    questionList.querySelectorAll('details[open]').forEach(other => { if (other !== item) other.open = false; });
  }));

  const bookmarked = localStorage.getItem(`lic:competency-bookmark:${competency.id}`) === 'yes';
  const bookmark = el('button', { class: `competency-bookmark ${bookmarked ? 'active' : ''}`, type: 'button', 'aria-label': 'حفظ الكفاءة' }, icon('bookmark'));
  bookmark.addEventListener('click', () => {
    const active = bookmark.classList.toggle('active');
    localStorage.setItem(`lic:competency-bookmark:${competency.id}`, active ? 'yes' : 'no');
    toast(active ? 'تم حفظ الكفاءة.' : 'تمت إزالة الكفاءة من المحفوظات.');
  });

  root.append(el('article', { class: 'competency-workspace' },
    el('section', { class: `competency-smart-dashboard tone-${COMPETENCY_TONES[index]}` },
      el('div', { class: 'competency-dashboard-copy' },
        el('small', { text: `الكفاءة ${index + 1} من 8` }),
        el('h1', { text: competency.name }),
        el('p', { text: competency.definition }),
        el('div', { class: 'dashboard-meta' }, tag(`${questions.length} أسئلة`, 'accent'), tag('تعلّم ثم تدرّب', 'success'))
      ),
      el('div', { class: 'competency-progress-ring', style: { '--progress': `${progress * 3.6}deg` } },
        el('span', {}, el('strong', { text: `${progress}%` }), el('small', { text: 'بدأت تدريبها' }))
      ),
      bookmark
    ),
    tabs.tabs,
    tabs.host,
    el('section', { class: 'competency-training-section' },
      el('div', { class: 'section-heading smart-section-heading' },
        el('div', {}, el('small', { text: 'التطبيق العملي' }), el('h2', { text: 'أسئلة الكفاءة' }), el('p', { text: 'افتح سؤالًا واحدًا، راجع بناء الإجابة، ثم تدرّب عليه بصوتك أو كتابتك.' }))
      ),
      questionList
    ),
    printActions(competency.name)
  ));
  if (requestedQuestion) requestAnimationFrame(() => document.querySelector(`#question-${CSS.escape(requestedQuestion)}`)?.scrollIntoView({ block: 'start' }));
}
