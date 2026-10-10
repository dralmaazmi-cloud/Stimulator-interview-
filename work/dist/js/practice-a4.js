// A4: ميزانية وقت التعريف الشخصي (توزيع 60 أو 120 ثانية على الأجزاء الستة من المرجع 6.3).
import { button, clear, el } from './ui.js';
import { WORDS_PER_MINUTE } from './self-intro.js';
import { p, practiceShell, readStore, segmented, writeStore } from './practice-core.js';

const COMPONENTS = Object.freeze([
  ['identity', 'الاسم أو الرمز الوظيفي'],
  ['qualification', 'المؤهل العلمي وأبرز الدورات'],
  ['career', 'التدرج الوظيفي باختصار'],
  ['current', 'المنصب الحالي ومسؤولياته الأساسية'],
  ['participation', 'أهم المشاركات الداخلية والخارجية'],
  ['vision', 'رؤيتك وأهدافك']
]);

// اقتراح تدريبي [تقدير]: مجموع كل خيار يساوي المدة تمامًا.
const SUGGESTED = Object.freeze({
  60: { identity: 5, qualification: 8, career: 10, current: 15, participation: 7, vision: 15 },
  120: { identity: 8, qualification: 15, career: 22, current: 30, participation: 15, vision: 30 }
});

const STEP = 5;

function loadState() {
  const saved = readStore('budget', null);
  const duration = saved?.duration === 120 ? 120 : 60;
  const seconds = { ...SUGGESTED[duration] };
  if (saved?.seconds && typeof saved.seconds === 'object') {
    COMPONENTS.forEach(([key]) => {
      const value = Number(saved.seconds[key]);
      if (Number.isFinite(value) && value >= 0 && value <= 600) seconds[key] = Math.round(value);
    });
  }
  return { duration, seconds };
}

export function wordsFor(seconds) {
  return Math.round((seconds * WORDS_PER_MINUTE) / 60);
}

export function budgetVerdict(total, target) {
  const diff = total - target;
  if (Math.abs(diff) <= 3) return { kind: 'good', text: 'وقتك موزّع بشكل جيد.' };
  if (diff > 3) return { kind: 'bad', text: `تجاوزت الحدّ بـ ${diff} ثانية. اختصر أولًا ما هو أقل ارتباطًا بالمنصب الذي تتقدم إليه.` };
  if (diff < -10) return { kind: 'info', text: `بقي لديك ${-diff} ثانية. أضف تفصيلًا يخدم المنصب.` };
  return { kind: 'good', text: `وقتك موزّع بشكل جيد، وبقي لديك ${-diff} ثانية.` };
}

export function renderBudgetPanel() {
  const state = loadState();
  const save = () => writeStore('budget', { duration: state.duration, seconds: state.seconds, at: new Date().toISOString() });
  const rowsHost = el('div', { class: 'budget-rows' });
  const totalLine = el('p', { class: 'budget-total' });
  const bar = el('div', { class: 'budget-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-label': 'مجموع الوقت الموزّع' }, el('i'));
  const verdict = el('div', { class: 'practice-feedback info', role: 'status' });
  const rowRefs = new Map();

  const total = () => COMPONENTS.reduce((sum, [key]) => sum + state.seconds[key], 0);

  function refresh() {
    const sum = total();
    totalLine.replaceChildren(el('bdi', { text: String(sum) }), ' من ', el('bdi', { text: String(state.duration) }), ' ثانية');
    bar.setAttribute('aria-valuemax', String(state.duration));
    bar.setAttribute('aria-valuenow', String(sum));
    bar.classList.toggle('over', sum > state.duration + 3);
    bar.firstChild.style.inlineSize = `${Math.min(100, (sum / state.duration) * 100)}%`;
    const result = budgetVerdict(sum, state.duration);
    verdict.className = `practice-feedback ${result.kind}`;
    verdict.replaceChildren(
      el('span', { class: 'practice-feedback-glyph', 'aria-hidden': 'true', text: result.kind === 'good' ? '✓' : result.kind === 'bad' ? '✗' : 'ⓘ' }),
      el('div', { class: 'practice-feedback-body' }, el('strong', { text: result.text }))
    );
    COMPONENTS.forEach(([key]) => {
      const refs = rowRefs.get(key);
      const value = state.seconds[key];
      refs.value.textContent = String(value);
      refs.words.textContent = `≈ ${wordsFor(value)} كلمة`;
      refs.minus.disabled = value <= 0;
      refs.warn.hidden = value !== 0;
    });
  }

  function change(key, delta) {
    state.seconds[key] = Math.max(0, Math.min(600, state.seconds[key] + delta));
    save();
    refresh();
  }

  COMPONENTS.forEach(([key, label], index) => {
    const value = el('bdi', { class: 'budget-value' });
    const words = el('small', { class: 'budget-words' });
    const minus = el('button', { type: 'button', class: 'budget-step', 'aria-label': `تقليل وقت ${label}` }, '−');
    const plus = el('button', { type: 'button', class: 'budget-step', 'aria-label': `زيادة وقت ${label}` }, '+');
    minus.addEventListener('click', () => change(key, -STEP));
    plus.addEventListener('click', () => change(key, STEP));
    const warn = el('small', { class: 'budget-warn', text: 'هذا الجزء سيُحذف من تعريفك. هل هذا مقصود؟' });
    warn.hidden = true;
    rowRefs.set(key, { value, words, minus, warn });
    rowsHost.append(el('div', { class: 'budget-row' },
      el('span', { class: 'budget-label' }, el('b', { 'aria-hidden': 'true', text: String(index + 1) }), label),
      el('div', { class: 'budget-controls' }, minus, el('span', { class: 'budget-readout' }, value, el('small', { text: ' ث' })), plus),
      words,
      warn
    ));
  });

  const durationToggle = segmented('المدة', [[60, 'حتى 60 ثانية'], [120, 'حتى 120 ثانية']], state.duration, value => {
    state.duration = Number(value);
    state.seconds = { ...SUGGESTED[state.duration] };
    save();
    refresh();
  });

  const panel = el('section', { class: 'budget-panel card no-print', 'aria-label': 'ميزانية وقت التعريف الشخصي' },
    el('h2', { text: 'خطّط لدقيقتك قبل أن تكتب' }),
    p('يبدأ المقابِل بطلب تعريف مختصر منظم. اختر مدتك ثم وزّع الوقت على الأجزاء الستة.', 'practice-lead'),
    durationToggle,
    rowsHost,
    el('div', { class: 'budget-summary' }, totalLine, bar),
    verdict,
    el('div', { class: 'practice-actions' },
      button('اقتراح تدريبي', { variant: 'secondary', onClick: () => { state.seconds = { ...SUGGESTED[state.duration] }; save(); refresh(); } }),
      button('أنشئ مسودتي', { href: '#/self-intro' })
    ),
    p('جهّز نسخة لا تتجاوز دقيقة ونسخة أطول قليلًا.', 'practice-helper')
  );
  refresh();
  return panel;
}

export async function renderA4(root) {
  clear(root).append(practiceShell('ميزانية وقت التعريف الشخصي', '', renderBudgetPanel()));
}
