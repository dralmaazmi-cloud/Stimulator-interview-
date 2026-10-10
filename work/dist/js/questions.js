import { getBookmarkedIds, isBookmarked, toggleBookmark } from './bookmarks.js';
import { bookActions } from './print-book.js';
import {
  button, clear, el, formatModel, formatType, icon, normalizeArabic, notice, toast
} from './ui.js';

const MASTERED_KEY = 'lic:mastered-question-ids';
const LAST_QUESTION_KEY = 'lic:questions:last-id';
const COMPETENCY_ICONS = ['leadership', 'decision', 'communication', 'team', 'planning', 'problem', 'resilience', 'results'];
const TONES = ['mint', 'sand', 'blue', 'violet', 'rose'];

function storedIds(key) {
  try {
    const ids = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveIds(key, ids) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

function publishedQuestions(data) {
  return data.primaryQuestions?.length ? data.primaryQuestions : data.questions;
}

function questionLabel(question) {
  return question.competency_name || question.principle_title || 'الجاهزية النهائية';
}

function deckHash(options = {}) {
  const params = new URLSearchParams({ view: 'deck' });
  if (options.scope && options.scope !== 'all') params.set('scope', options.scope);
  if (options.competency) params.set('competency', options.competency);
  if (options.filter && options.filter !== 'all') params.set('filter', options.filter);
  if (options.query) params.set('query', options.query);
  if (options.question) params.set('question', options.question);
  return `#/questions?${params.toString()}`;
}

function hubOption(iconName, title, subtitle, href, tone) {
  return el('a', { class: `question-hub-option tone-${tone}`, href },
    el('span', { class: 'question-hub-option-icon' }, icon(iconName)),
    el('div', {}, el('strong', { text: title }), el('p', { text: subtitle })),
    el('span', { class: 'question-hub-option-arrow', 'aria-hidden': 'true', text: '›' })
  );
}

function renderQuestionHubLanding(root, data) {
  const questions = publishedQuestions(data);
  const mastered = storedIds(MASTERED_KEY);
  const completed = questions.filter(question => mastered.has(question.id)).length;
  const percent = Math.round(completed / Math.max(1, questions.length) * 100);
  const storedLastId = localStorage.getItem(LAST_QUESTION_KEY);
  const lastQuestion = data.questionById.get(storedLastId) || questions[0];

  root.append(el('section', { class: 'question-hub-page' },
    el('header', { class: 'question-hub-heading' },
      el('small', { text: 'التحضير للمقابلة' }),
      el('h1', { text: 'الأسئلة' }),
      el('p', { text: 'اختر طريقة التصفح، وركّز على سؤال واحد في كل مرة.' })
    ),
    el('section', { class: 'question-hub-hero' },
      el('div', { class: 'question-hub-hero-copy' },
        el('small', { text: 'تدريب منظم وتفاعلي' }),
        el('h2', { text: 'تدرّب على أسئلتك بذكاء' }),
        el('p', { text: 'اختر المسار وابدأ من مستواك.' }),
        el('div', { class: 'question-hub-progress-line' },
          el('span', {}, el('i', { style: { width: `${percent}%` } })),
          el('strong', { text: `${completed} من ${questions.length} سؤالًا` })
        )
      ),
      el('div', {
        class: 'question-hub-progress-ring',
        style: { '--progress': `${percent * 3.6}deg` },
        role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent)
      }, el('strong', { text: String(completed) }), el('small', { text: `من ${questions.length}` }))
    ),
    el('section', { class: 'question-hub-browse' },
      el('header', {}, el('small', { text: 'اختر المسار المناسب لك' }), el('h2', { text: 'طريقة التصفح' })),
      el('div', { class: 'question-hub-options' },
        hubOption('competencies', 'حسب الكفاءة', 'أسئلة الكفاءات القيادية الثماني', '#/questions?view=competencies', 'mint'),
        hubOption('answer', 'حسب نوع السؤال', 'سلوكي، سيناريو، أو سؤال عام', deckHash(), 'sand'),
        hubOption('flag', 'قيادة المهمة', 'أسئلة المواقف والقيادة التنفيذية', deckHash({ scope: 'mission' }), 'blue'),
        hubOption('bookmark', 'المحفوظة', 'الأسئلة التي اخترت الرجوع إليها', deckHash({ scope: 'saved' }), 'violet')
      )
    ),
    lastQuestion ? el('a', {
      class: 'question-hub-continue',
      href: deckHash({ question: lastQuestion.id })
    },
    el('span', { class: 'question-hub-continue-icon' }, icon('calendar')),
    el('div', {},
      el('small', { text: 'تابع من حيث توقفت' }),
      el('strong', { text: lastQuestion.display_question })
    ),
    el('b', { 'aria-hidden': 'true', text: '›' })
    ) : null,
    bookActions(data, { type: 'questions' }, 'الأسئلة والإجابات النموذجية')
  ));
}

function renderCompetencyChooser(root, data) {
  root.append(el('section', { class: 'question-hub-page question-competency-chooser' },
    el('header', { class: 'question-hub-heading' },
      el('small', { text: 'تصفح الأسئلة' }),
      el('h1', { text: 'اختر الكفاءة' }),
      el('p', { text: 'ابدأ بالكفاءة التي تريد تطويرها، ثم تنقّل بين أسئلتها كبطاقات تفاعلية.' })
    ),
    el('div', { class: 'question-competency-grid' }, ...data.competencies.map((competency, index) => {
      const count = data.primaryIdsByCompetency.get(competency.id)?.length || 0;
      return el('a', {
        class: `question-competency-option tone-${TONES[index % TONES.length]}`,
        href: deckHash({ scope: 'competency', competency: competency.id })
      },
      el('span', {}, icon(COMPETENCY_ICONS[index] || 'competencies')),
      el('strong', { text: competency.name }),
      el('small', { text: `${count} ${count === 1 ? 'سؤال' : 'أسئلة'}` }),
      el('b', { 'aria-hidden': 'true', text: '›' })
      );
    }))
  ));
}

function baseQuestions(data, scope, competencyId) {
  const questions = publishedQuestions(data);
  if (scope === 'competency') return questions.filter(question => question.competency_id === competencyId);
  if (scope === 'mission') return questions.filter(question => question.owner_type === 'mission_command');
  if (scope === 'saved') {
    const saved = new Set(getBookmarkedIds());
    return questions.filter(question => saved.has(question.id));
  }
  return questions;
}

function deckTitle(scope, competencyId, data) {
  if (scope === 'competency') return data.competencyById.get(competencyId)?.name || 'أسئلة الكفاءة';
  if (scope === 'mission') return 'أسئلة قيادة المهمة';
  if (scope === 'saved') return 'الأسئلة المحفوظة';
  return 'بطاقات الأسئلة';
}

function filterQuestions(questions, filter, query) {
  let result = questions;
  if (filter === 'behavioural' || filter === 'scenario') result = result.filter(question => question.type === filter);
  else if (filter === 'mission') result = result.filter(question => question.owner_type === 'mission_command');
  const normalizedQuery = normalizeArabic(query);
  if (normalizedQuery) result = result.filter(question => normalizeArabic([
    question.display_question, question.competency_name, question.principle_title, question.label
  ].filter(Boolean).join(' ')).includes(normalizedQuery));
  return result;
}

function renderQuestionDeck(root, data, params) {
  const scope = params.get('scope') || 'all';
  const competencyId = params.get('competency') || '';
  let base = baseQuestions(data, scope, competencyId);
  const allowedFilters = scope === 'all'
    ? ['all', 'behavioural', 'scenario', 'mission']
    : ['all', 'behavioural', 'scenario'];
  const state = {
    filter: allowedFilters.includes(params.get('filter')) ? params.get('filter') : 'all',
    query: params.get('query') || '',
    index: 0
  };
  const requestedQuestion = params.get('question');
  const requestedIndex = filterQuestions(base, state.filter, state.query).findIndex(question => question.id === requestedQuestion);
  if (requestedIndex >= 0) state.index = requestedIndex;
  const mastered = storedIds(MASTERED_KEY);

  const search = el('input', {
    class: 'question-deck-search-input', type: 'search', inputMode: 'search',
    placeholder: 'ابحث في الأسئلة', 'aria-label': 'ابحث في الأسئلة'
  });
  search.value = state.query;
  const searchWrap = el('label', { class: 'question-deck-search' }, icon('search'), search);
  const filters = el('div', { class: 'question-deck-filters', role: 'group', 'aria-label': 'تصفية الأسئلة' });
  const deck = el('section', { class: 'question-deck-stage', 'aria-live': 'polite' });
  const stats = el('div', { class: 'question-deck-stats' });

  const currentList = () => filterQuestions(base, state.filter, state.query);
  const currentReturnHash = question => deckHash({
    scope, competency: competencyId, filter: state.filter, query: state.query, question: question?.id
  });
  const syncAddress = question => {
    const hash = currentReturnHash(question);
    history.replaceState(null, '', hash);
    window.dispatchEvent(new CustomEvent('lic:route-replaced', { detail: { hash } }));
  };

  const move = direction => {
    const list = currentList();
    if (list.length < 2) return;
    state.index = (state.index + direction + list.length) % list.length;
    draw();
  };

  const filterOptions = [
    ['all', 'الكل'], ['behavioural', 'سلوكي'], ['scenario', 'سيناريو'], ['mission', 'قيادة المهمة']
  ].filter(([value]) => allowedFilters.includes(value));
  const filterButtons = filterOptions.map(([value, label]) => {
    const control = el('button', { type: 'button', text: label, dataset: { filter: value } });
    control.addEventListener('click', () => {
      state.filter = value;
      state.index = 0;
      draw();
    });
    filters.append(control);
    return control;
  });

  const drawStats = list => {
    const masteredCount = list.filter(question => mastered.has(question.id)).length;
    stats.replaceChildren(
      el('span', {}, el('i', {}, icon('readiness')), el('small', { text: 'أتقنت' }), el('strong', { text: String(masteredCount) })),
      el('span', {}, el('i', {}, icon('answer')), el('small', { text: 'متبقي' }), el('strong', { text: String(Math.max(0, list.length - masteredCount)) }))
    );
  };

  const draw = () => {
    const list = currentList();
    filterButtons.forEach(control => {
      const active = control.dataset.filter === state.filter;
      control.classList.toggle('active', active);
      control.setAttribute('aria-pressed', String(active));
    });
    if (!list.length) {
      syncAddress();
      deck.replaceChildren(notice(scope === 'saved'
        ? 'لا توجد أسئلة محفوظة تطابق هذا الاختيار.'
        : 'لا توجد أسئلة تطابق البحث أو التصفية.', '', '⌕'));
      drawStats(list);
      return;
    }
    state.index = Math.min(state.index, list.length - 1);
    const question = list[state.index];
    localStorage.setItem(LAST_QUESTION_KEY, question.id);
    syncAddress(question);

    const bookmark = el('button', {
      type: 'button', class: `question-deck-bookmark ${isBookmarked(question.id) ? 'active' : ''}`,
      'aria-label': isBookmarked(question.id) ? 'إزالة السؤال من المحفوظة' : 'حفظ السؤال',
      'aria-pressed': String(isBookmarked(question.id))
    }, icon('bookmark'));
    bookmark.addEventListener('click', () => {
      const active = toggleBookmark(question.id);
      bookmark.classList.toggle('active', active);
      bookmark.setAttribute('aria-pressed', String(active));
      bookmark.setAttribute('aria-label', active ? 'إزالة السؤال من المحفوظة' : 'حفظ السؤال');
      toast(active ? 'تم حفظ السؤال.' : 'تمت إزالة السؤال من المحفوظة.');
      if (scope === 'saved' && !active) {
        base = base.filter(item => item.id !== question.id);
        state.index = Math.max(0, state.index - 1);
        draw();
      }
    });

    const masteredControl = el('button', {
      type: 'button', class: `question-deck-mastered ${mastered.has(question.id) ? 'active' : ''}`,
      'aria-pressed': String(mastered.has(question.id))
    }, icon('readiness'), el('span', { text: mastered.has(question.id) ? 'تم الإتقان' : 'أتقنت هذا السؤال' }));
    masteredControl.addEventListener('click', () => {
      if (mastered.has(question.id)) mastered.delete(question.id);
      else mastered.add(question.id);
      saveIds(MASTERED_KEY, mastered);
      draw();
    });

    const card = el('article', { class: 'question-deck-card', tabindex: '0' },
      el('header', { class: 'question-deck-card-head' },
        bookmark,
        el('div', { class: 'question-deck-position' },
          el('span', {}, 'السؤال ', el('bdi', { text: String(state.index + 1) }), ' من ', el('bdi', { text: String(list.length) })),
          el('i', {}, el('b', { style: { width: `${((state.index + 1) / list.length) * 100}%` } }))
        ),
        el('span', { class: 'question-deck-model', text: formatModel(question.rubric_mode) })
      ),
      el('div', { class: 'question-deck-symbol' }, icon(question.owner_type === 'mission_command' ? 'flag' : question.type === 'scenario' ? 'communication' : 'competencies')),
      el('span', { class: 'question-deck-owner', text: questionLabel(question) }),
      el('h2', { text: question.display_question }),
      el('div', { class: 'question-deck-meta' },
        el('span', { text: formatType(question.type) }),
        masteredControl
      )
    );
    let pointerStart = null;
    card.addEventListener('pointerdown', event => { pointerStart = event.clientX; });
    card.addEventListener('pointerup', event => {
      if (pointerStart == null) return;
      const delta = event.clientX - pointerStart;
      pointerStart = null;
      if (Math.abs(delta) < 48) return;
      move(delta < 0 ? 1 : -1);
    });

    const returnHash = currentReturnHash(question);
    const openHref = `#/question/${encodeURIComponent(question.id)}?return=${encodeURIComponent(returnHash)}`;
    deck.replaceChildren(
      el('div', { class: 'question-deck-stack' }, card),
      el('div', { class: 'question-deck-actions' },
        button('السابق', { variant: 'secondary', onClick: () => move(-1) }),
        button('فتح السؤال', { href: openHref, className: 'question-deck-open' })
      ),
      el('div', { class: 'question-deck-swipe-hint' },
        el('button', { type: 'button', 'aria-label': 'السؤال السابق', on: { click: () => move(-1) }, text: '›' }),
        el('span', { text: 'اسحب للتنقل بين الأسئلة' }),
        el('button', { type: 'button', 'aria-label': 'السؤال التالي', on: { click: () => move(1) }, text: '‹' })
      )
    );
    drawStats(list);
  };

  search.addEventListener('input', () => {
    state.query = search.value;
    state.index = 0;
    draw();
  });

  root.append(el('section', { class: 'question-deck-page' },
    el('header', { class: 'question-deck-heading' },
      el('small', { text: scope === 'all' ? 'تصفّح وتدرّب' : 'مسار محدد' }),
      el('h1', { text: deckTitle(scope, competencyId, data) }),
      el('p', { text: 'اقرأ السؤال بوضوح، ثم افتحه عندما تكون مستعدًا لبناء إجابتك.' })
    ),
    searchWrap,
    filters,
    deck,
    stats
  ));
  draw();
}

export function renderQuestions(root, data, params = new URLSearchParams()) {
  clear(root);
  const view = params.get('view') || 'hub';
  if (view === 'competencies') renderCompetencyChooser(root, data);
  else if (view === 'deck') renderQuestionDeck(root, data, params);
  else renderQuestionHubLanding(root, data);
}
