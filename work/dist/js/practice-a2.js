// A2: أي بناء أستخدم؟ STAR-L أم SEAL (تمرين تمييز متداخل).
import { button, clear, el } from './ui.js';
import {
  fill, chooserPool, createFeedback, markSeen, orderByRotation, p, practiceShell, pushLimited, questionCard,
  readStore, shuffle, writeStore
} from './practice-core.js';

function normalizeStore(raw) {
  const store = raw && typeof raw === 'object' ? raw : {};
  return {
    rounds: Array.isArray(store.rounds) ? store.rounds.slice(-10) : [],
    wrongIds: Array.isArray(store.wrongIds) ? store.wrongIds.filter(id => typeof id === 'string') : [],
    seen: store.seen && typeof store.seen === 'object' ? store.seen : {},
    mastered: Boolean(store.mastered)
  };
}

export function buildRound(data, total, store, random = Math.random) {
  const perMode = Math.floor(total / 2);
  const blocked = new Set();
  const picked = [];
  ['star_l', 'seal'].forEach(mode => {
    const pool = chooserPool(data, mode);
    const ordered = orderByRotation(pool, 'drill-a2', store.seen);
    const wrongFirst = [
      ...ordered.filter(question => store.wrongIds.includes(question.id)),
      ...ordered.filter(question => !store.wrongIds.includes(question.id))
    ];
    let count = 0;
    for (const question of wrongFirst) {
      if (count >= perMode) break;
      if (question.variant_group && blocked.has(question.variant_group)) continue;
      picked.push(question);
      if (question.variant_group) blocked.add(question.variant_group);
      count += 1;
    }
  });
  return shuffle(picked, random);
}

export async function renderA2(root, data, params = new URLSearchParams()) {
  const store = normalizeStore(readStore('a2', null));
  const total = params.get('n') === '4' ? 4 : 8;
  const save = () => writeStore('a2', store);
  const body = el('div', { class: 'practice-body' });
  clear(root).append(practiceShell('أي بناء أستخدم؟', 'اقرأ السؤال، ثم قرّر: هل يطلب قصة حدثت لك؟ STAR-L. هل يضعك في موقف افتراضي؟ SEAL.', body));

  const round = buildRound(data, total, store);
  if (round.length < 2) { body.append(p('لا توجد أسئلة كافية لهذا التمرين الآن.')); return; }
  const state = { index: 0, score: 0, wrong: [] };

  function drawQuestion() {
    const question = round[state.index];
    const feedback = createFeedback();
    const choices = el('div', { class: 'practice-choices', role: 'group', 'aria-label': 'اختر البناء المناسب' });
    const options = [['star_l', 'STAR-L', 'قصة حدثت لي'], ['seal', 'SEAL', 'موقف افتراضي']];
    const nextButton = button(state.index + 1 >= round.length ? 'عرض النتيجة' : 'السؤال التالي', { onClick: () => { state.index += 1; if (state.index >= round.length) drawEnd(); else drawQuestion(); } });
    nextButton.hidden = true;
    const deeper = el('a', { class: 'practice-link', href: '#/preparation/U2' }, 'تعمّق في عناصر الإطار');
    deeper.hidden = true;

    options.forEach(([mode, name, subtitle]) => {
      const choice = el('button', { type: 'button', class: 'practice-choice', 'data-mode': mode },
        el('span', { class: 'practice-choice-mark', 'aria-hidden': 'true' }),
        el('strong', {}, el('bdi', { dir: 'ltr', text: name })),
        el('small', { text: subtitle }));
      choice.addEventListener('click', () => {
        const correct = mode === question.rubric_mode;
        markSeen(store.seen, question.id);
        [...choices.children].forEach(item => {
          item.disabled = true;
          const isRight = item.dataset.mode === question.rubric_mode;
          const mark = item.querySelector('.practice-choice-mark');
          if (isRight) { item.classList.add('right'); mark.textContent = '✓'; }
          else if (item === choice) { item.classList.add('wrong'); mark.textContent = '✗'; }
        });
        if (correct) {
          state.score += 1;
          feedback.show('good', question.rubric_mode === 'star_l' ? 'صحيح: STAR-L.' : 'صحيح: SEAL.',
            question.rubric_mode === 'star_l'
              ? 'السؤال يطلب منك أن تروي موقفًا حدث لك فعلًا.'
              : 'الموقف مكتوب في السؤال، وأنت تشرح كيف ستتصرف.');
        } else {
          state.wrong.push(question.id);
          if (question.rubric_mode === 'star_l') {
            feedback.show('bad', 'ليس هذا.', 'هذا سؤال سلوكي: يطلب قصة من خبرتك، فنستخدم STAR-L.', 'غالبًا يبدأ السؤال السلوكي بطلب مثل: صف، أخبرني، اذكر.');
          } else {
            feedback.show('bad', 'ليس هذا.', 'هذا سؤال سيناريو: الموقف مكتوب أمامك ويسأل ماذا ستفعل، فنستخدم SEAL.');
          }
        }
        save();
        deeper.hidden = false;
        nextButton.hidden = false;
      });
      choices.append(choice);
    });

    fill(body, 
      el('div', { class: 'practice-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(round.length), 'aria-valuenow': String(state.index + 1), 'aria-label': 'تقدم الجولة' },
        el('span', {}, 'السؤال ', el('bdi', { text: String(state.index + 1) }), ' من ', el('bdi', { text: String(round.length) })),
        el('span', { class: 'practice-progress-track', 'aria-hidden': 'true' }, el('i', { style: { inlineSize: `${((state.index) / round.length) * 100}%` } }))
      ),
      questionCard(question),
      choices,
      feedback.node,
      el('div', { class: 'practice-actions' }, nextButton, deeper)
    );
    window.scrollTo?.({ top: 0 });
  }

  function drawEnd() {
    const passMark = Math.ceil(total * 7 / 8);
    const passed = state.score >= passMark;
    if (total === 8) {
      store.rounds = pushLimited(store.rounds, { at: new Date().toISOString(), score: state.score, total });
      store.mastered = store.rounds.filter(item => item.total === 8 && item.score >= 7).length >= 2;
    }
    store.wrongIds = [...new Set([...state.wrong, ...store.wrongIds.filter(id => !round.some(question => question.id === id))])];
    save();
    const feedback = createFeedback();
    fill(body, 
      el('section', { class: 'practice-summary card' },
        el('h2', {}, el('bdi', { text: String(state.score) }), ' من ', el('bdi', { text: String(total) })),
        feedback.node,
        el('div', { class: 'practice-actions' },
          button('جولة جديدة', { onClick: () => renderA2(root, data, params) }),
          passed ? null : button('راجع المقارنة بين النوعين', { href: '#/preparation/U2', variant: 'secondary' }),
          button('كل التمارين', { href: '#/practice', variant: 'ghost' })
        ),
        store.mastered ? el('p', { class: 'practice-badge' }, el('span', { 'aria-hidden': 'true', text: '✓' }), ' أتقنت هذا التمرين') : null
      )
    );
    feedback.show(passed ? 'good' : 'info', passed ? 'ممتاز. تميّز نوع السؤال بثقة.' : 'راجع المقارنة بين النوعين ثم أعد الجولة.');
  }

  drawQuestion();
}

