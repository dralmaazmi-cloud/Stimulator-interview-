// A1: ورشة العناصر (STAR-L / SEAL): رتّب العناصر + اكتشف الناقص.
import { button, clear, el } from './ui.js';
import {
  fill, FRAMEWORKS, badge, createFeedback, drillPool, elementPrompts, markSeen, orderByRotation, p, practiceShell,
  pushLimited, questionCard, readStore, restoreFocus, segmented, shuffle, writeStore
} from './practice-core.js';

const PAIR_MESSAGES = Object.freeze({
  star_l: {
    'S|T': 'الموقف يصف الظروف: أين ومتى ومن. المهمة تحدد ما كان مطلوبًا منك أنت.',
    'T|A': 'المهمة هي المطلوب منك. الإجراء هو ما فعلته أنت فعلًا.',
    'A|R': 'الإجراء ما فعلته. النتيجة ما تغيّر بعد ذلك.',
    'R|L': 'النتيجة هي الأثر الذي حدث. التعلّم هو ما استخلصته وستفعله بصورة أفضل لاحقًا.'
  },
  seal: {
    'E|A': 'التقييم يحلّل الخيارات والمخاطر. الإجراء يذكر الخطوات التي ستنفّذها.',
    'A|L': 'الأثر القيادي يصف ما سيحدث للفريق والهدف، لا ما ستفعله.'
  }
});

const MISSING_EXPLANATIONS = Object.freeze({
  star_l: {
    S: 'من غير موقف لا يفهم المقابِل السياق.',
    T: 'من غير مهمة لا يعرف المقابِل دورك الشخصي.',
    A: 'الإجراء أهم محور؛ غيابه يترك الإجابة بلا سلوك يُقيَّم.',
    R: 'عدم ذكر النتيجة يجعل الإجابة غير مكتملة.',
    L: 'الدروس المستفادة مؤشر النضج القيادي.'
  },
  seal: {
    S: 'من غير فهم الوضع لا يظهر أنك قرأت الموقف بدقة.',
    E: 'التقييم أهم عنصر في السيناريو.',
    A: 'من غير إجراء لا توجد خطوات عملية.',
    L: 'من غير الأثر لا يظهر كيف يخدم قرارك الفريق والهدف.'
  }
});

// الأجزاء التي يتخطاها المتدربون كثيرًا (R/L/T) تُحذف أكثر [تقدير].
const MISSING_WEIGHTS = Object.freeze({
  star_l: { S: 1, T: 3, A: 1, R: 3, L: 3 },
  seal: { S: 1, E: 2, A: 1, L: 3 }
});

function normalizeStore(raw) {
  const store = raw && typeof raw === 'object' ? raw : {};
  return {
    sort: {
      done: Number(store.sort?.done) || 0,
      firstTry: Array.isArray(store.sort?.firstTry) ? store.sort.firstTry.slice(-10) : [],
      seen: store.sort?.seen && typeof store.sort.seen === 'object' ? store.sort.seen : {}
    },
    missing: {
      runs: Array.isArray(store.missing?.runs) ? store.missing.runs.slice(-10) : [],
      seen: store.missing?.seen && typeof store.missing.seen === 'object' ? store.missing.seen : {}
    },
    mastered: { sort: Boolean(store.mastered?.sort), missing: Boolean(store.mastered?.missing) },
    lastMode: store.lastMode === 'missing' ? 'missing' : 'sort'
  };
}

function weightedKey(keys, weights, random = Math.random) {
  const total = keys.reduce((sum, key) => sum + (weights[key] || 1), 0);
  let roll = random() * total;
  for (const key of keys) {
    roll -= weights[key] || 1;
    if (roll < 0) return key;
  }
  return keys[keys.length - 1];
}

function pairMessage(mode, placed, actual) {
  const table = PAIR_MESSAGES[mode] || {};
  return table[`${placed}|${actual}`] || table[`${actual}|${placed}`] || null;
}

export async function renderA1(root, data, params = new URLSearchParams()) {
  const store = normalizeStore(readStore('a1', null));
  let mode = params.get('mode') === 'missing' ? 'missing' : params.has('mode') ? 'sort' : store.lastMode;
  let fw = params.get('fw') === 'seal' ? 'seal' : 'star_l';
  let forced = { q: params.get('q'), el: params.get('el') };
  const save = () => writeStore('a1', { ...store, lastMode: mode });

  const body = el('div', { class: 'practice-body' });
  // I3: السؤال والبطاقات أولًا؛ مفتاحا النوع والإطار بعد التمرين حتى تظهر البطاقات في الشاشة الأولى.
  const shell = practiceShell('ورشة العناصر', 'درّب عينك على عناصر STAR-L وSEAL داخل إجابات حقيقية.',
    body,
    segmented('نوع التمرين', [['sort', 'رتّب العناصر'], ['missing', 'اكتشف الناقص']], mode, value => { mode = value; forced = {}; save(); start(); }),
    segmented('الإطار', [['star_l', 'STAR-L'], ['seal', 'SEAL']], fw, value => { fw = value; forced = {}; start(); })
  );
  clear(root).append(shell);

  function pickQuestion(kind) {
    const pool = drillPool(data, fw);
    if (!pool.length) return null;
    if (forced.q) {
      const wanted = pool.find(question => question.id === forced.q);
      forced.q = null;
      if (wanted) return wanted;
    }
    return orderByRotation(pool, 'drill-a1', store[kind].seen)[0];
  }

  function start() {
    if (mode === 'missing') startMissing(); else startSort();
  }

  // ---------------------------------------------------------------- رتّب العناصر
  function startSort() {
    const question = pickQuestion('sort');
    if (!question) { fill(body, p('لا توجد أسئلة متاحة لهذا التمرين الآن.')); return; }
    markSeen(store.sort.seen, question.id);
    save();
    const framework = FRAMEWORKS[fw];
    const answer = question[framework.answerField];
    const cards = framework.keys.map(key => ({ key, text: answer[framework.fields[key]] }));
    let order = shuffle(cards.map(card => card.key));
    for (let attempt = 0; attempt < 5 && order.join() === framework.keys.join(); attempt += 1) order = shuffle(order);
    const state = {
      question, framework, cards, order,
      placement: {}, locked: new Set(), selected: null, touched: null,
      phase: 'arrange', checks: 0, firstScore: null, results: {}
    };
    drawSort(state);
  }

  function drawSort(state, focusId = null) {
    const { framework, cards, question } = state;
    const prompts = elementPrompts(framework.id);
    const textOf = key => cards.find(card => card.key === key).text;
    const placedKeys = new Set(Object.values(state.placement));
    const feedback = state.feedback || createFeedback();
    state.feedback = feedback;

    const tray = el('div', { class: 'practice-tray', role: 'group', 'aria-label': 'البطاقات غير الموضوعة' },
      ...state.order.filter(key => !placedKeys.has(key)).map(key => {
        const selected = state.selected === key;
        const card = el('button', {
          type: 'button', class: `practice-card-chip${selected ? ' selected' : ''}`,
          'aria-pressed': String(selected), 'data-focus-id': `card-${key}`
        }, el('span', { class: 'practice-chip-mark', 'aria-hidden': 'true', text: selected ? '●' : '○' }), el('span', { text: textOf(key) }));
        card.addEventListener('click', () => {
          state.selected = selected ? null : key;
          drawSort(state, `card-${key}`);
        });
        return card;
      })
    );

    const slots = el('ol', { class: 'practice-slots' }, ...framework.keys.map(slotKey => {
      const placedKey = state.placement[slotKey];
      const result = state.results[slotKey];
      const locked = state.locked.has(slotKey);
      const slotButton = el('button', {
        type: 'button',
        class: `practice-slot-button${placedKey ? ' filled' : ''}${result ? ` ${result.ok ? 'ok' : 'wrong'}` : ''}`,
        'data-focus-id': `slot-${slotKey}`,
        disabled: locked || state.phase === 'checked' || state.phase === 'done',
        'aria-label': placedKey
          ? `${framework.labels[slotKey]}: ${textOf(placedKey)}. اضغط لإعادة البطاقة إلى الصندوق.`
          : `${framework.labels[slotKey]}: فارغ. اختر بطاقة ثم اضغط هنا لوضعها.`
      }, placedKey ? el('span', { text: textOf(placedKey) }) : el('span', { class: 'practice-slot-empty', text: 'اضغط هنا لوضع البطاقة المحددة' }));
      slotButton.addEventListener('click', () => {
        state.touched = slotKey;
        if (placedKey && !state.selected) {
          delete state.placement[slotKey];
          state.selected = placedKey;
          drawSort(state, `card-${placedKey}`);
        } else if (state.selected) {
          const moving = state.selected;
          if (placedKey) delete state.placement[slotKey];
          state.placement[slotKey] = moving;
          state.selected = null;
          drawSort(state, `slot-${slotKey}`);
        } else {
          feedback.show('info', 'اختر بطاقة أولًا', `ثم اضغط على «${framework.labels[slotKey]}» لوضعها.`);
        }
      });
      return el('li', { class: 'practice-slot' },
        el('div', { class: 'practice-slot-head' }, el('strong', { text: framework.labels[slotKey] }), el('small', { text: prompts[slotKey] })),
        slotButton,
        result ? el('p', { class: `practice-slot-result ${result.ok ? 'ok' : 'wrong'}` },
          el('span', { 'aria-hidden': 'true', text: result.ok ? '✓ ' : '✗ ' }),
          result.ok ? 'صحيح' : result.message) : null,
        state.revealed && result && !result.ok
          ? el('p', { class: 'practice-slot-answer' }, el('b', { text: 'الصحيح: ' }), textOf(slotKey)) : null
      );
    }));

    const allPlaced = framework.keys.every(key => state.placement[key]);
    const hintButton = button('تلميح', { variant: 'secondary', onClick: () => {
      const slotKey = state.touched || framework.keys.find(key => !state.placement[key]) || framework.keys[0];
      feedback.show('info', `تلميح: ${framework.labels[slotKey]}`, prompts[slotKey]);
    } });
    hintButton.disabled = state.phase === 'checked' || state.phase === 'done';
    const checkButton = button('تحقّق', { disabled: !allPlaced || state.phase === 'checked' || state.phase === 'done', onClick: () => checkSort(state) });
    const actions = el('div', { class: 'practice-actions' }, hintButton, checkButton);
    const helper = !allPlaced && state.phase === 'arrange'
      ? p('ضع كل البطاقات في أماكنها لتفعيل زر «تحقّق».', 'practice-helper') : null;

    const footer = el('div', { class: 'practice-actions' });
    if (state.phase === 'checked') {
      footer.append(button('أعد وضع البطاقات الخاطئة', { onClick: () => retrySort(state) }));
    }
    if (state.phase === 'done') {
      footer.append(button('تمرين جديد', { onClick: () => startSort() }));
      if (state.failedLink) footer.append(button('شاهد الإجابة الكاملة أولًا', { href: '#/practice/a3', variant: 'secondary' }));
    }

    fill(body, 
      questionCard(question),
      p('ضع كل فقرة في العنصر المناسب.', 'practice-instruction'),
      state.phase === 'arrange' || state.phase === 'retry' ? tray : null,
      state.phase === 'arrange' || state.phase === 'retry' ? (tray.children.length ? null : p('وُضعت كل البطاقات.', 'practice-helper')) : null,
      slots,
      helper,
      state.phase === 'arrange' || state.phase === 'retry' ? actions : null,
      feedback.node,
      footer,
      store.mastered.sort ? badge('أنجزت هذا التمرين') : null
    );
    restoreFocus(body, focusId);
  }

  function checkSort(state) {
    const { framework } = state;
    state.checks += 1;
    const prompts = elementPrompts(framework.id);
    let correct = 0;
    framework.keys.forEach(slotKey => {
      const placedKey = state.placement[slotKey];
      if (placedKey === slotKey) {
        correct += 1;
        state.results[slotKey] = { ok: true };
      } else {
        const message = pairMessage(framework.id, slotKey, placedKey)
          || `راجع تعريف العنصر ثم حاول مجددًا. ${prompts[placedKey]}`;
        state.results[slotKey] = { ok: false, message };
      }
    });
    if (state.firstScore == null) state.firstScore = correct;
    const total = framework.keys.length;
    if (state.checks === 1) {
      store.sort.done += 1;
      store.sort.firstTry = pushLimited(store.sort.firstTry, correct);
      store.mastered.sort = store.sort.firstTry.filter(score => score >= 4).length >= 3;
      const recent = store.sort.firstTry.slice(-2);
      state.failedLink = recent.length === 2 && recent.every(score => score < 4);
      save();
    }
    if (correct === total) {
      state.phase = 'done';
      state.revealed = false;
      drawSort(state);
      state.feedback.show('good', `${correct} من ${total} في مكانها الصحيح.`, state.checks === 1 ? 'أحسنت. لاحظ أن الإجراء هو الجزء الأكبر.' : 'أحسنت. أصبحت كل البطاقات في أماكنها.');
      return;
    }
    if (state.checks === 1) {
      state.phase = 'checked';
      drawSort(state);
      state.feedback.show('bad', `${correct} من ${total} في مكانها الصحيح.`, 'راجع الرسائل تحت كل عنصر خاطئ، ثم أعد وضع البطاقات الخاطئة وحاول مرة أخرى.');
    } else {
      state.phase = 'done';
      state.revealed = true;
      drawSort(state);
      state.feedback.show('info', `${correct} من ${total} في مكانها الصحيح.`, 'عرضنا الترتيب الصحيح تحت كل عنصر خاطئ. جرّب تمرينًا جديدًا.');
    }
  }

  function retrySort(state) {
    state.framework.keys.forEach(slotKey => {
      if (state.results[slotKey]?.ok) state.locked.add(slotKey);
      else delete state.placement[slotKey];
    });
    state.results = {};
    state.selected = null;
    state.phase = 'retry';
    drawSort(state, 'card-' + state.order.find(key => !Object.values(state.placement).includes(key)));
    state.feedback.show('info', 'حاول مرة أخرى', 'البطاقات الصحيحة ثُبّتت في أماكنها. ضع البطاقات المتبقية.');
  }

  // ---------------------------------------------------------------- اكتشف الناقص
  function startMissing() {
    const question = pickQuestion('missing');
    if (!question) { fill(body, p('لا توجد أسئلة متاحة لهذا التمرين الآن.')); return; }
    markSeen(store.missing.seen, question.id);
    const framework = FRAMEWORKS[fw];
    const answer = question[framework.answerField];
    const removed = forced.el && framework.keys.includes(forced.el)
      ? forced.el
      : weightedKey(framework.keys, MISSING_WEIGHTS[fw]);
    forced = {};
    save();
    drawMissing({ question, framework, answer, removed, attempts: 0, wrong: new Set(), finished: false });
  }

  function drawMissing(state, focusId = null) {
    const { framework, question, answer, removed } = state;
    const feedback = state.feedback || createFeedback();
    state.feedback = feedback;
    const remaining = framework.keys.filter(key => key !== removed);
    const blocks = el('ol', { class: 'practice-blocks' }, ...remaining.map((key, index) =>
      el('li', { class: 'practice-block' },
        el('small', { text: `فقرة ${index + 1}` }),
        el('p', { text: answer[framework.fields[key]] })
      )));
    const options = el('div', { class: 'practice-options', role: 'group', 'aria-label': 'اختر العنصر الناقص' },
      ...framework.keys.map(key => {
        const isWrong = state.wrong.has(key);
        const choice = el('button', {
          type: 'button', class: `practice-option${isWrong ? ' wrong' : ''}${state.finished && key === removed ? ' right' : ''}`,
          disabled: state.finished || isWrong, 'data-focus-id': `opt-${key}`
        }, el('span', { 'aria-hidden': 'true', text: isWrong ? '✗ ' : state.finished && key === removed ? '✓ ' : '' }), framework.labels[key]);
        choice.addEventListener('click', () => answerMissing(state, key));
        return choice;
      }));
    fill(body, 
      questionCard(question),
      p('حُذف عنصر واحد من هذه الإجابة. أيّ عنصر هو؟', 'practice-instruction'),
      blocks,
      options,
      feedback.node,
      state.finished ? el('section', { class: 'practice-reveal' },
        el('small', { text: 'هذا ما كان في الإجابة' }),
        el('p', { text: answer[framework.fields[removed]] })) : null,
      state.finished ? el('div', { class: 'practice-actions' },
        button('تمرين جديد', { onClick: () => startMissing() }),
        fw === 'star_l' ? button('شاهد إجابة كاملة', { href: '#/practice/a3', variant: 'secondary' }) : null) : null,
      store.mastered.missing ? badge('أنجزت هذا التمرين') : null
    );
    restoreFocus(body, focusId);
  }

  function answerMissing(state, key) {
    const { framework, removed } = state;
    state.attempts += 1;
    if (key === removed) {
      state.finished = true;
      finishMissing(state, state.attempts === 1);
      drawMissing(state);
      state.feedback.show('good', `صحيح. العنصر الناقص هو ${framework.labels[removed]}.`, MISSING_EXPLANATIONS[framework.id][removed]);
      return;
    }
    state.wrong.add(key);
    if (state.attempts >= 2) {
      state.finished = true;
      finishMissing(state, false);
      drawMissing(state);
      state.feedback.show('info', `العنصر الناقص هو ${framework.labels[removed]}.`, MISSING_EXPLANATIONS[framework.id][removed]);
      return;
    }
    drawMissing(state, `opt-${framework.keys.find(item => !state.wrong.has(item))}`);
    state.feedback.show('bad', 'ليس هذا. جرّب مرة أخرى.');
  }

  function finishMissing(state, firstTry) {
    store.missing.runs = pushLimited(store.missing.runs, Boolean(firstTry));
    const window6 = store.missing.runs.slice(-6);
    store.mastered.missing = window6.length >= 5 && window6.filter(Boolean).length >= 5;
    save();
  }

  start();
}
