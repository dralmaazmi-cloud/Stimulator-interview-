// تمارين التعلّم V2: أدوات مشتركة (تخزين محلي آمن، ترتيب بالتدوير، مكوّنات واجهة مشتركة).
// لا يُكتب هنا أي محتوى معتمد؛ كل نصوص الأسئلة والإجابات والتعريفات تُقرأ وقت التشغيل من البيانات المعتمدة.
import { button, el } from './ui.js';
import { rotateOrder } from './rotation.js';
import { modelElements } from './guidance.js';

export const PREFIX = 'lic:v2:';

// آلية data-drill-exclude (البند 11.2): قائمة معرّفات أسئلة تُستبعد من التمارين دون تعديل البيانات المعتمدة.
// فارغة افتراضيًا. تُقرأ أيضًا من السمة data-drill-exclude="C1-B3,C2-S1" على عنصر html.
export const DRILL_EXCLUDE = Object.freeze([]);

// F4: عناصر تُستبعد من تمرينَي الفرز والاكتشاف (A1، A3) فقط، ولا تُستبعد من المميّز (A2).
// C3-B4: نص «المهمة» فيه يُقرأ كنتيجة، فيتنافس مع «النتيجة» في الفرز ويُربك حذف العنصر. البيانات المعتمدة لا تُعدَّل.
export const ELEMENT_DRILL_EXCLUDE = Object.freeze(['C3-B4']);

export function excludedIds() {
  const ids = new Set(DRILL_EXCLUDE);
  try {
    const raw = document.documentElement.getAttribute('data-drill-exclude') || '';
    raw.split(',').map(item => item.trim()).filter(Boolean).forEach(id => ids.add(id));
  } catch {
    // القراءة اختيارية؛ تبقى القائمة الافتراضية.
  }
  return ids;
}

export function readStore(name, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStore(name, value) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const FRAMEWORKS = Object.freeze({
  star_l: {
    id: 'star_l',
    name: 'STAR-L',
    keys: ['S', 'T', 'A', 'R', 'L'],
    fields: { S: 'situation', T: 'task', A: 'action', R: 'result', L: 'learning' },
    labels: { S: 'الموقف', T: 'المهمة', A: 'الإجراء', R: 'النتيجة', L: 'التعلّم' },
    answerField: 'sample_answer_star_l'
  },
  seal: {
    id: 'seal',
    name: 'SEAL',
    keys: ['S', 'E', 'A', 'L'],
    fields: { S: 'situation', E: 'evaluation', A: 'action', L: 'leadership_impact' },
    labels: { S: 'فهم الوضع', E: 'التقييم', A: 'الإجراء', L: 'الأثر القيادي' },
    answerField: 'sample_answer_seal'
  }
});

// تعريفات العناصر من guidance.js (المصدر المعتمد للنصوص التوجيهية).
export function elementPrompts(mode) {
  return Object.fromEntries(modelElements(mode).map(item => [item.key, item.prompt]));
}

// replaceChildren يحوّل null إلى نص «null»؛ هذه الدالة تتجاهل القيم الفارغة.
export function fill(node, ...children) {
  node.replaceChildren(...children.flat(Infinity).filter(child => child != null && child !== false));
  return node;
}

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// أسئلة صالحة للفرز/الاكتشاف: كل عناصر الإجابة النموذجية نصوص غير فارغة، وليست مستبعدة.
export function drillPool(data, mode) {
  const framework = FRAMEWORKS[mode];
  const excluded = excludedIds();
  ELEMENT_DRILL_EXCLUDE.forEach(id => excluded.add(id));
  return data.questions.filter(question => {
    if (question.rubric_mode !== mode || excluded.has(question.id)) return false;
    const answer = question[framework.answerField];
    return answer && framework.keys.every(key => hasText(answer[framework.fields[key]]));
  });
}

// أسئلة المميّز: كل أسئلة star_l وseal (بلا العامة X1/X2).
export function chooserPool(data, mode) {
  const excluded = excludedIds();
  return data.questions.filter(question => question.rubric_mode === mode && !excluded.has(question.id) && hasText(question.display_question));
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// يستخدم rotateOrder الموجود: غير المجرَّب أولًا ثم الأقدم. seen = { id: { n, last } }.
export function orderByRotation(items, kind, seen = {}) {
  const rotation = {};
  Object.entries(seen || {}).forEach(([id, entry]) => {
    rotation[`${kind}:${id}`] = { count: Number(entry?.n) || 0, last_shown_at: entry?.last || '' };
  });
  return rotateOrder(items, kind, item => item.id, rotation);
}

export function markSeen(seen, id, now = new Date().toISOString()) {
  const entry = seen[id] || { n: 0, last: '' };
  seen[id] = { n: (Number(entry.n) || 0) + 1, last: now };
  return seen;
}

export function pushLimited(list, value, limit = 10) {
  const next = Array.isArray(list) ? [...list, value] : [value];
  return next.slice(-limit);
}

const LATIN_TOKENS = /(STAR-L|SEAL)/g;

// يلفّ الرموز اللاتينية في bdi حتى لا يُعاد ترتيبها داخل النص العربي.
export function rich(text) {
  return String(text ?? '').split(LATIN_TOKENS).filter(part => part !== '').map(part =>
    part === 'STAR-L' || part === 'SEAL' ? el('bdi', { dir: 'ltr', text: part }) : part);
}

export function p(text, className = '') {
  return el('p', { class: className }, ...rich(text));
}

export function numberText(value) {
  return el('bdi', { text: String(value) });
}

// منطقة تغذية راجعة فورية: أيقونة + نص (ليست باللون وحده)، وينتقل إليها التركيز.
export function createFeedback() {
  const node = el('div', { class: 'practice-feedback', role: 'status', tabindex: '-1' });
  node.hidden = true;
  const glyphs = { good: '✓', bad: '✗', info: 'ⓘ' };
  return {
    node,
    show(kind, headline, ...details) {
      node.hidden = false;
      node.className = `practice-feedback ${kind}`;
      fill(node,
        el('span', { class: 'practice-feedback-glyph', 'aria-hidden': 'true', text: glyphs[kind] || glyphs.info }),
        el('div', { class: 'practice-feedback-body' },
          headline ? el('strong', {}, ...rich(headline)) : null,
          ...details.filter(Boolean).map(detail => detail instanceof Node ? detail : p(detail))
        )
      );
      node.focus({ preventScroll: true });
      node.scrollIntoView?.({ block: 'nearest' });
    },
    hide() {
      node.hidden = true;
      node.replaceChildren();
    }
  };
}

// مفتاح تبديل (segmented) يستخدم أزرارًا مع aria-pressed.
export function segmented(label, options, current, onChange) {
  const group = el('div', { class: 'segmented practice-segmented', role: 'group', 'aria-label': label });
  options.forEach(([value, text]) => {
    const choice = el('button', {
      type: 'button',
      class: value === current ? 'active' : '',
      'aria-pressed': String(value === current)
    }, ...rich(text));
    choice.addEventListener('click', () => {
      [...group.children].forEach(item => {
        item.classList.toggle('active', item === choice);
        item.setAttribute('aria-pressed', String(item === choice));
      });
      onChange(value);
    });
    group.append(choice);
  });
  return group;
}

export function practiceShell(title, lead, ...children) {
  return el('article', { class: 'practice-screen' },
    el('a', { class: 'practice-crumb', href: '#/practice' }, el('span', { 'aria-hidden': 'true', text: '›' }), ' كل التمارين'),
    el('header', { class: 'practice-head' },
      el('h1', {}, ...rich(title)),
      lead ? p(lead, 'practice-lead') : null
    ),
    ...children,
    el('p', { class: 'practice-disclaimer', text: 'تمرين للتعلّم، وليس تقييمًا.' })
  );
}

export function badge(text) {
  return el('span', { class: 'practice-badge' }, el('span', { 'aria-hidden': 'true', text: '✓' }), ' ', text);
}

// بعد إعادة بناء الواجهة: يعيد التركيز إلى عنصر يحمل data-focus-id المطلوب.
export function restoreFocus(container, focusId) {
  if (!focusId) return;
  const target = container.querySelector(`[data-focus-id="${CSS.escape(focusId)}"]`);
  target?.focus({ preventScroll: false });
}

export function questionCard(question, label = 'السؤال') {
  return el('section', { class: 'practice-question', 'aria-label': label },
    el('small', { text: label }),
    el('p', { class: 'practice-question-text', text: question.display_question })
  );
}

// حالة التمرين المتقن (تُقرأ من الصفحات الأخرى بلا بناء واجهة).
export function a1Mastered() {
  const store = readStore('a1', null);
  return Boolean(store?.mastered?.sort && store?.mastered?.missing);
}

export function a2Mastered() {
  return Boolean(readStore('a2', null)?.mastered);
}

export function u2PracticeMastered() {
  return a1Mastered() && a2Mastered();
}

// F5: تحقق قصير (سؤال واحد في كل شاشة، محاولة واحدة لكل سؤال، ثم تغذية راجعة فورية بأيقونة ونص).
// questions = [{ text, options: [{ text, correct?, feedback }] }]. الحالة تُحفظ تحت lic:v2:<storeName>.
export function miniCheck({ storeName, title, questions }) {
  const host = el('section', { class: 'mini-check card no-print', 'aria-label': title });
  const total = questions.length;
  let answers = [];

  const saved = readStore(storeName, null);
  const isSaved = saved && typeof saved === 'object' && Array.isArray(saved.answers) && saved.answers.length === total;

  function finish() {
    const passed = answers.every((chosen, index) => questions[index].options[chosen]?.correct === true);
    writeStore(storeName, { v: 1, passed, at: new Date().toISOString(), answers: [...answers] });
    drawSummary(passed);
  }

  function drawSummary(passed, moveFocus = true) {
    const right = answers.filter((chosen, index) => questions[index].options[chosen]?.correct === true).length;
    fill(host,
      el('h2', { text: title }),
      el('div', { class: 'practice-feedback ' + (passed ? 'good' : 'info'), role: 'status', tabindex: '-1' },
        el('span', { class: 'practice-feedback-glyph', 'aria-hidden': 'true', text: passed ? '✓' : 'ⓘ' }),
        el('div', { class: 'practice-feedback-body' },
          el('strong', {}, 'أجبت إجابة صحيحة عن ', el('bdi', { text: String(right) }), ' من ', el('bdi', { text: String(total) }), '.'),
          p(passed ? 'ممتاز. انتقل إلى الخطوة التالية.' : 'راجع شرح هذه المحطة أعلاه، ثم أعد التحقق متى شئت.'))),
      el('div', { class: 'practice-actions' }, button('أعد التحقق', { variant: 'secondary', onClick: () => { answers = []; drawQuestion(0); } })),
      el('p', { class: 'practice-disclaimer', text: 'تمرين للتعلّم، وليس تقييمًا.' })
    );
    if (moveFocus) host.querySelector('[role="status"]')?.focus({ preventScroll: true });
  }

  function drawQuestion(index) {
    const question = questions[index];
    const feedback = createFeedback();
    const optionButtons = [];
    const next = button(index + 1 < total ? 'السؤال التالي' : 'عرض النتيجة', { onClick: () => (index + 1 < total ? drawQuestion(index + 1) : finish()) });
    next.hidden = true;
    const group = el('div', { class: 'mini-check-options', role: 'group', 'aria-label': question.text });
    shuffle(question.options.map((option, optionIndex) => ({ option, optionIndex }))).forEach(({ option, optionIndex }) => {
      const choice = el('button', { type: 'button', class: 'selfcheck-choice mini-check-option', 'data-correct': option.correct ? 'true' : 'false' },
        el('span', { class: 'mini-check-mark', 'aria-hidden': 'true' }), el('span', {}, ...rich(option.text)));
      choice.addEventListener('click', () => {
        answers[index] = optionIndex;
        optionButtons.forEach(item => {
          item.disabled = true;
          const isCorrect = item.dataset.correct === 'true';
          const mark = item.querySelector('.mini-check-mark');
          if (isCorrect) { item.classList.add('right'); mark.textContent = '✓'; }
          if (item === choice && !isCorrect) { item.classList.add('wrong'); mark.textContent = '✗'; }
        });
        feedback.show(option.correct ? 'good' : 'bad', option.correct ? 'صحيح.' : 'ليست الإجابة الأدق.', option.feedback);
        next.hidden = false;
      });
      optionButtons.push(choice);
      group.append(choice);
    });
    fill(host,
      el('h2', { text: title }),
      el('p', { class: 'practice-helper' }, 'السؤال ', el('bdi', { text: String(index + 1) }), ' من ', el('bdi', { text: String(total) }), ' · محاولة واحدة لكل سؤال'),
      el('p', { class: 'practice-instruction', tabindex: '-1' }, ...rich(question.text)),
      group, feedback.node, next,
      el('p', { class: 'practice-disclaimer', text: 'تمرين للتعلّم، وليس تقييمًا.' })
    );
    if (index > 0 || answers.length) host.querySelector('.practice-instruction')?.focus({ preventScroll: true });
  }

  if (isSaved) {
    answers = saved.answers.map(Number);
    drawSummary(saved.passed === true, false);
  } else {
    drawQuestion(0);
  }
  return host;
}
