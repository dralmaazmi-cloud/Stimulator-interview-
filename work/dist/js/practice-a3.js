// A3: شاهد إجابة كاملة (مثال محلول مع تلاشي الدعم تدريجيًا).
import { button, clear, el } from './ui.js';
import {
  fill, FRAMEWORKS, drillPool, elementPrompts, hasText, p, practiceShell, questionCard, readStore, shuffle, writeStore
} from './practice-core.js';

const DEFAULT_STAR = 'C1-B3';
const DEFAULT_SEAL = 'C1-S1';

const STAR_ANNOTATIONS = Object.freeze({
  S: 'يضع المقابِل في الصورة: أين ومتى ومن.',
  T: 'يحدد ما كان مطلوبًا منك أنت.',
  A: 'هنا يقيّمك المقابِل أكثر. ابحث عن أفعال تبدأ بـ «أنا».',
  R: 'أثر ملموس. الأرقام تقوّي الإجابة حين تتوفر.',
  L: 'ما غيّرته التجربة في أسلوبك القيادي.'
});

// ملاحظات إضافية مكتوبة يدويًا لمثال بعينه (عرض فقط، لا تغيّر نص الإجابة المعتمد).
const EXTRA_ANNOTATIONS = Object.freeze({
  'C1-B3': {
    A: 'لاحظ الفعل «عدّلتُ»: قرار شخصي لا «عدّلنا».',
    R: 'نتيجة قابلة للملاحظة: تنفيذ دقيق وانخفاض الارتباك.'
  }
});

const SEAL_ANNOTATIONS = Object.freeze({
  E: 'التقييم هو أهم عنصر: حلّل الخيارات والمخاطر قبل أن تقرر.',
  L: 'كيف يتحرك الفريق والهدف نتيجة قرارك.'
});

function normalizeStore(raw) {
  const store = raw && typeof raw === 'object' ? raw : {};
  return {
    seen: Array.isArray(store.seen) ? store.seen.filter(id => typeof id === 'string') : [],
    faded: store.faded && typeof store.faded === 'object' ? store.faded : {},
    completedAt: typeof store.completedAt === 'string' ? store.completedAt : null
  };
}

function pickExample(pool, defaultId, seen, avoid = null) {
  const preferred = pool.find(question => question.id === defaultId);
  if (preferred && !seen.includes(defaultId) && preferred.id !== avoid) return preferred;
  const unseen = pool.filter(question => !seen.includes(question.id) && question.id !== avoid);
  if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)];
  const others = pool.filter(question => question.id !== avoid);
  return others[Math.floor(Math.random() * others.length)] || pool[0];
}

export async function renderA3(root, data) {
  const store = normalizeStore(readStore('a3', null));
  const save = () => writeStore('a3', store);
  const starPool = drillPool(data, 'star_l');
  const sealPool = drillPool(data, 'seal');
  const body = el('div', { class: 'practice-body' });
  clear(root).append(practiceShell('شاهد إجابة كاملة', 'تابع كيف تُبنى الإجابة جزءًا جزءًا، ثم أكمل بنفسك.', body));
  if (!starPool.length || !sealPool.length) { body.append(p('لا توجد أمثلة متاحة الآن.')); return; }

  const state = {
    star: pickExample(starPool, DEFAULT_STAR, store.seen),
    seal: pickExample(sealPool, DEFAULT_SEAL, store.seen),
    part: 1,
    step: 0
  };

  function starSteps() {
    const framework = FRAMEWORKS.star_l;
    const answer = state.star[framework.answerField];
    const steps = [{ kind: 'intro' }];
    framework.keys.forEach(key => {
      const text = answer[framework.fields[key]];
      if (hasText(text)) steps.push({ kind: 'element', key, text });
    });
    steps.push({ kind: 'summary' });
    return steps;
  }

  function sealSteps() {
    const framework = FRAMEWORKS.seal;
    const answer = state.seal[framework.answerField];
    const steps = [{ kind: 'intro' }];
    ['S', 'E'].forEach(key => {
      const text = answer[framework.fields[key]];
      if (hasText(text)) steps.push({ kind: 'element', key, text });
    });
    steps.push({ kind: 'choose' });
    if (hasText(answer.leadership_impact)) steps.push({ kind: 'element', key: 'L', text: answer.leadership_impact });
    steps.push({ kind: 'summary' });
    return steps;
  }

  function elementBlock(framework, key, text, annotation, latest) {
    return el('article', { class: `practice-example-element${latest ? ' latest' : ''}`, tabindex: latest ? '-1' : null, 'data-latest': latest ? 'true' : null },
      el('span', { class: 'practice-element-chip', text: framework.labels[key] }),
      el('p', { class: 'practice-example-text', text }),
      annotation ? el('p', { class: 'practice-annotation' }, el('b', { text: 'لماذا؟ ' }), annotation) : null
    );
  }

  function draw() {
    const isStar = state.part === 1;
    if (state.part === 3) { drawPractice(); return; }
    const steps = isStar ? starSteps() : sealSteps();
    const framework = isStar ? FRAMEWORKS.star_l : FRAMEWORKS.seal;
    const question = isStar ? state.star : state.seal;
    const prompts = elementPrompts(framework.id);
    const step = steps[state.step];
    const blocks = [];
    steps.slice(0, state.step + 1).forEach((item, index) => {
      const latest = index === state.step;
      if (item.kind === 'element') {
        const annotation = isStar
          ? (EXTRA_ANNOTATIONS[question.id]?.[item.key] || STAR_ANNOTATIONS[item.key])
          : (SEAL_ANNOTATIONS[item.key] || prompts[item.key]);
        blocks.push(elementBlock(framework, item.key, item.text, annotation, latest));
      } else if (item.kind === 'choose' && index < state.step) {
        blocks.push(elementBlock(framework, 'A', question[framework.answerField].action, prompts.A, false));
      }
    });

    const header = el('div', { class: 'practice-progress' },
      el('span', {}, state.part === 1 ? 'الجزء 1: سؤال سلوكي · ' : 'الجزء 2: سؤال سيناريو · ', 'الخطوة ', el('bdi', { text: String(state.step + 1) }), ' من ', el('bdi', { text: String(steps.length) })),
      el('span', { class: 'practice-progress-track', 'aria-hidden': 'true' }, el('i', { style: { inlineSize: `${((state.step + 1) / steps.length) * 100}%` } }))
    );

    const live = el('div', { class: 'practice-step-note', role: 'status' });
    if (step.kind === 'intro') {
      live.append(p(isStar
        ? 'هذا سؤال سلوكي. اقرأه ثم شاهد كيف تُبنى إجابته جزءًا جزءًا.'
        : 'هذا سؤال سيناريو: الموقف مكتوب في السؤال. شاهد كيف يُبنى القرار، ثم أكمل الجزء الناقص بنفسك.'));
    }
    if (step.kind === 'summary') {
      live.append(isStar
        ? p('خمسة أجزاء، والإجراء هو الجزء الأكبر.')
        : p('أربعة أجزاء، والتقييم هو أهم عنصر في السيناريو.'));
      live.append(el('div', { class: 'practice-chips' }, ...framework.keys.map(key => el('span', { class: 'practice-element-chip', text: framework.labels[key] }))));
    }

    let chooser = null;
    if (step.kind === 'choose') chooser = drawChoose(framework);

    const prev = button('السابق', { variant: 'secondary', onClick: () => { if (state.step > 0) { state.step -= 1; draw(); } } });
    prev.disabled = state.step === 0;
    const isLast = state.step === steps.length - 1;
    const next = button(isLast ? (isStar ? 'التالي: مثال سيناريو' : 'التالي: دورك الآن') : 'التالي', {
      onClick: () => {
        if (!isLast) { state.step += 1; draw(); return; }
        if (!store.seen.includes(question.id)) store.seen.push(question.id);
        save();
        state.part = isStar ? 2 : 3;
        state.step = 0;
        draw();
      }
    });
    if (step.kind === 'choose' && !store.faded[state.seal.id]) next.disabled = true;

    fill(body, header, questionCard(question, isStar ? 'السؤال السلوكي' : 'سؤال السيناريو'), ...blocks, live, chooser,
      el('div', { class: 'practice-actions' }, prev, next));
    if (chooser) chooser.nextButton = next;
    const latest = body.querySelector('[data-latest="true"]');
    (latest || live).focus?.({ preventScroll: true });
    (latest || live).scrollIntoView?.({ block: 'nearest' });
  }

  // الخطوة المتلاشية: اختر البطاقة التي تمثل الإجراء.
  function drawChoose(framework) {
    const answer = state.seal[framework.answerField];
    const options = shuffle([
      { key: 'A', text: answer.action },
      { key: 'E', text: answer.evaluation },
      { key: 'L', text: answer.leadership_impact }
    ].filter(option => hasText(option.text)));
    const holder = el('section', { class: 'practice-choose', 'aria-label': 'خطوة التطبيق' },
      el('h2', { text: 'اختر البطاقة التي تمثل الإجراء' }),
      p('الإجراء يذكر الخطوات: ماذا ستفعل ومن يفعل ومتى.', 'practice-helper')
    );
    const feedbackNode = el('div', { class: 'practice-feedback', role: 'status', tabindex: '-1' });
    feedbackNode.hidden = true;
    const labelByKey = { E: 'التقييم', L: 'الأثر القيادي' };
    let resolved = false;
    const list = el('div', { class: 'practice-options practice-option-cards', role: 'group', 'aria-label': 'ثلاث بطاقات' });
    options.forEach(option => {
      const choice = el('button', { type: 'button', class: 'practice-option practice-text-option' },
        el('span', { class: 'practice-choice-mark', 'aria-hidden': 'true' }), el('span', { text: option.text }));
      choice.addEventListener('click', () => {
        if (resolved) return;
        const mark = choice.querySelector('.practice-choice-mark');
        const show = (kind, headline, text) => {
          feedbackNode.hidden = false;
          feedbackNode.className = `practice-feedback ${kind}`;
          fill(feedbackNode, 
            el('span', { class: 'practice-feedback-glyph', 'aria-hidden': 'true', text: kind === 'good' ? '✓' : '✗' }),
            el('div', { class: 'practice-feedback-body' }, el('strong', { text: headline }), p(text))
          );
          feedbackNode.focus({ preventScroll: true });
        };
        if (option.key === 'A') {
          resolved = true;
          choice.classList.add('right');
          mark.textContent = '✓';
          [...list.children].forEach(item => { item.disabled = true; });
          store.faded[state.seal.id] = true;
          save();
          show('good', 'صحيح.', 'الإجراء يذكر الخطوات: ماذا ستفعل ومن يفعل ومتى.');
          if (holder.nextButton) holder.nextButton.disabled = false;
          const nextButton = body.querySelector('.practice-actions .button:not(.secondary)');
          if (nextButton) nextButton.disabled = false;
        } else {
          choice.classList.add('wrong');
          choice.disabled = true;
          mark.textContent = '✗';
          show('bad', 'ليس هذا.', `هذا يصف ${labelByKey[option.key]}. الإجراء هو ما ستنفّذه.`);
        }
      });
      list.append(choice);
    });
    holder.append(list, feedbackNode);
    return holder;
  }

  function drawPractice() {
    const target = pickExample(starPool, '', [state.star.id, ...store.seen], state.star.id);
    store.completedAt = new Date().toISOString();
    save();
    fill(body, 
      el('section', { class: 'practice-summary card' },
        el('h2', { text: 'الآن دورك' }),
        p('اختر سؤالًا وأجب بنفسك.'),
        el('div', { class: 'practice-actions' },
          button('ابدأ الإجابة بنفسك', { href: `#/simulation?question=${encodeURIComponent(target.id)}&answer=text` }),
          button('اختر سؤالًا آخر', { href: '#/questions', variant: 'secondary' }),
          button('شاهد مثالًا آخر', { variant: 'ghost', onClick: () => {
            state.star = pickExample(starPool, '', store.seen, state.star.id);
            state.seal = pickExample(sealPool, '', store.seen, state.seal.id);
            state.part = 1;
            state.step = 0;
            draw();
          } })
        )
      )
    );
  }

  draw();
}
