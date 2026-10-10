// A5: بطاقات الاسترجاع (ثلاثة صناديق، مراجعة متباعدة بسيطة). كل نص يُقرأ وقت التشغيل من البيانات المعتمدة.
import { button, clear, el } from './ui.js';
import { FRAMEWORKS, elementPrompts, fill, practiceShell, readStore, shuffle, writeStore } from './practice-core.js';

const DAY = 24 * 60 * 60 * 1000;
// فواصل المراجعة بالأيام لكل صندوق [تقدير].
const INTERVAL_DAYS = Object.freeze({ 1: 1, 2: 3, 3: 7 });
const SESSION_LIMIT = 10;

export const DECKS = Object.freeze([
  ['star-l', 'STAR-L'],
  ['seal', 'SEAL'],
  ['comp', 'الكفاءات الثمانية'],
  ['mission', 'مبادئ قيادة المهمة'],
  ['mistakes', 'الأخطاء الشائعة'],
  ['evaluator', 'ما يسأل عنه المقابِل']
]);

function firstSentence(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const match = clean.match(/^(.+?[.؟!])(\s|$)/);
  return match ? match[1] : clean;
}

function referenceTable(data, sectionNumber) {
  const section = data.reference?.part_2_answering?.sections?.find(item => item.number === sectionNumber);
  return section?.blocks?.find(block => block.type === 'table')?.rows || [];
}

function cellText(value) {
  if (Array.isArray(value)) return value.map(cellText).join(' ');
  if (value && typeof value === 'object' && Array.isArray(value.list)) return value.list.join(' ');
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// يبني البطاقات الخمس والثلاثين من البيانات المعتمدة؛ لا نص مولَّد ولا معاد صياغته.
export function buildCards(data) {
  const cards = [];
  [['star-l', 'star_l'], ['seal', 'seal']].forEach(([deck, mode]) => {
    const framework = FRAMEWORKS[mode];
    const prompts = elementPrompts(mode);
    framework.keys.forEach(key => {
      cards.push({
        key: `${deck}:${key}`, deck,
        front: `ماذا يعني الحرف ${key} في ${framework.name} وماذا يجيب؟`,
        back: [framework.labels[key], prompts[key]]
      });
    });
  });
  (data.competencies || []).forEach(competency => {
    if (!competency.definition_v1_2025) return;
    cards.push({
      key: `comp:${competency.id}`, deck: 'comp',
      front: `ما تعريف كفاءة «${competency.name}»؟`,
      back: [firstSentence(competency.definition_v1_2025)]
    });
  });
  (data.reference?.part_4_mission_command?.principles || []).forEach(principle => {
    cards.push({
      key: `mission:${principle.id}`, deck: 'mission',
      front: `ما مبدأ «${principle.title}»؟`,
      back: [firstSentence(principle.description)]
    });
  });
  referenceTable(data, '2.4').forEach((row, index) => {
    cards.push({
      key: `mistakes:${index + 1}`, deck: 'mistakes',
      front: `لماذا يُعدّ «${cellText(row[0])}» خطأً شائعًا في الإجابة؟`,
      back: [cellText(row[0]), cellText(row[1])]
    });
  });
  referenceTable(data, '2.5').forEach((row, index) => {
    const criterion = cellText(row[0]).replace(/^\d+\.\s*/, '');
    cards.push({
      key: `evaluator:${index + 1}`, deck: 'evaluator',
      front: `ما سؤال المقابِل عن «${criterion}»؟`,
      back: [cellText(row[1])]
    });
  });
  return cards.filter(card => card.front && card.back.every(Boolean));
}

function loadBoxes() {
  const saved = readStore('cards', null);
  const cards = saved && typeof saved === 'object' && saved.cards && typeof saved.cards === 'object' ? saved.cards : {};
  return { v: 1, cards };
}

function saveBoxes(boxes) {
  writeStore('cards', boxes);
}

export function isDue(entry, now = Date.now()) {
  if (!entry) return true;
  const due = Date.parse(entry.due || '');
  return !Number.isFinite(due) || due <= now;
}

export function dueCards(cards, boxes = loadBoxes(), now = Date.now()) {
  return cards.filter(card => isDue(boxes.cards[card.key], now));
}

// عدد البطاقات المستحقة، وهل بدأ المتعلم المراجعة (لإظهار السطر في الرئيسية فقط بعد البدء).
export function reviewStatus(data) {
  const boxes = loadBoxes();
  const cards = buildCards(data);
  return { due: dueCards(cards, boxes).length, total: cards.length, started: Object.keys(boxes.cards).length > 0 };
}

// تقييم بطاقة واحدة من خارج التمرين (مثل صفحة مبادئ قيادة المهمة).
export function rateCard(key, known, now = Date.now()) {
  const boxes = loadBoxes();
  applyRating(boxes, key, known, now, false);
  saveBoxes(boxes);
}

function applyRating(boxes, key, known, now, repeatedFailure) {
  const entry = boxes.cards[key] || { box: 1, n: 0 };
  const box = known ? Math.min(3, (entry.box || 1) + 1) : 1;
  const days = known ? INTERVAL_DAYS[box] : (repeatedFailure ? INTERVAL_DAYS[1] : 0);
  boxes.cards[key] = { box, due: new Date(now + days * DAY).toISOString(), last: new Date(now).toISOString(), n: (entry.n || 0) + 1 };
}

function nextReviewText(boxes, now = Date.now()) {
  const upcoming = Object.values(boxes.cards).map(entry => Date.parse(entry.due || '')).filter(time => Number.isFinite(time) && time > now);
  if (!upcoming.length) return null;
  const soonest = Math.min(...upcoming);
  if (soonest - now <= 1.5 * DAY) return 'غدًا';
  return new Date(soonest).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long' });
}

export async function renderA5(root, data, params = new URLSearchParams()) {
  const allCards = buildCards(data);
  const deckParam = params.get('deck');
  const onlyKey = params.get('only');
  const body = el('div', { class: 'practice-body' });
  clear(root).append(practiceShell('بطاقات الاسترجاع', 'فكّر في الإجابة أولًا، ثم اكشفها وقيّم نفسك بصدق. البطاقات التي تعرفها تتباعد، والتي لا تعرفها تعود قريبًا.', body));

  function chooseDeck() {
    const boxes = loadBoxes();
    const due = dueCards(allCards, boxes);
    const list = el('div', { class: 'practice-deck-list' }, ...DECKS.map(([id, name]) => {
      const cards = allCards.filter(card => card.deck === id);
      const known = cards.filter(card => (boxes.cards[card.key]?.box || 0) === 3).length;
      return el('a', { class: 'preparation-card card practice-deck', href: `#/practice/a5?deck=${id}` },
        el('div', { class: 'unit-copy' }, el('h2', {}, ...(name === 'STAR-L' || name === 'SEAL' ? [el('bdi', { dir: 'ltr', text: name })] : [name])), el('p', {}, el('bdi', { text: String(cards.length) }), ' بطاقة · ', el('bdi', { text: String(known) }), ' في الصندوق 3')),
        el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' }));
    }));
    fill(body, 
      due.length
        ? el('div', { class: 'practice-actions' }, button(`ابدأ المراجعة (${due.length} بطاقة مستحقة)`, { href: '#/practice/a5?deck=due' }))
        : el('div', { class: 'practice-feedback info' }, el('span', { class: 'practice-feedback-glyph', 'aria-hidden': 'true', text: 'ⓘ' }),
          el('div', { class: 'practice-feedback-body' }, el('strong', { text: 'لا توجد بطاقات مستحقة الآن. عد غدًا أو اختر مجموعة للتدرّب الحر.' }))),
      el('h2', { class: 'practice-subhead', text: 'التدرّب الحر حسب المجموعة' }),
      list
    );
  }

  const boxes = loadBoxes();
  let queue;
  if (onlyKey) queue = allCards.filter(card => card.key === onlyKey);
  else if (deckParam === 'due') queue = dueCards(allCards, boxes);
  else if (deckParam && DECKS.some(([id]) => id === deckParam)) {
    const deck = allCards.filter(card => card.deck === deckParam);
    const due = dueCards(deck, boxes);
    queue = [...due, ...deck.filter(card => !due.includes(card))];
  } else { chooseDeck(); return; }
  queue = shuffle(queue).sort((a, b) => (boxes.cards[a.key]?.box || 0) - (boxes.cards[b.key]?.box || 0)).slice(0, SESSION_LIMIT);
  if (!queue.length) { chooseDeck(); return; }

  const session = { queue: [...queue], index: 0, reviewed: new Set(), knownFirst: new Set(), failed: new Set(), total: queue.length };

  function drawCard() {
    const card = session.queue[session.index];
    const feedback = el('div', { class: 'practice-feedback', role: 'status', tabindex: '-1' });
    feedback.hidden = true;
    const back = el('div', { class: 'flashcard-back' }, ...card.back.map((line, index) => el(index === 0 && card.back.length > 1 ? 'strong' : 'p', { text: line })));
    back.hidden = true;
    const reveal = button('أظهر الإجابة', { onClick: () => {
      back.hidden = false;
      reveal.hidden = true;
      ratings.hidden = false;
      back.setAttribute('tabindex', '-1');
      back.focus({ preventScroll: true });
    } });
    const known = button('عرفتها', { onClick: () => rate(card, true) });
    const unknown = button('لم أعرفها', { variant: 'secondary', onClick: () => rate(card, false) });
    const ratings = el('div', { class: 'practice-actions' }, known, unknown);
    ratings.hidden = true;
    const deckName = DECKS.find(([id]) => id === card.deck)?.[1] || '';
    fill(body, 
      el('div', { class: 'practice-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(session.queue.length), 'aria-valuenow': String(session.index + 1), 'aria-label': 'تقدم المراجعة' },
        el('span', {}, 'البطاقة ', el('bdi', { text: String(session.index + 1) }), ' من ', el('bdi', { text: String(session.queue.length) })),
        el('span', { class: 'practice-progress-track', 'aria-hidden': 'true' }, el('i', { style: { inlineSize: `${(session.index / session.queue.length) * 100}%` } }))),
      el('section', { class: 'flashcard card', 'aria-label': 'بطاقة' },
        el('small', { class: 'flashcard-deck', text: deckName }),
        el('p', { class: 'flashcard-front' }, ...frontNodes(card.front)),
        back),
      reveal,
      ratings,
      feedback
    );
    session.feedback = feedback;
  }

  function frontNodes(text) {
    return String(text).split(/(STAR-L|SEAL)/).filter(Boolean).map(part => part === 'STAR-L' || part === 'SEAL' ? el('bdi', { dir: 'ltr', text: part }) : part);
  }

  function rate(card, knew) {
    const stored = loadBoxes();
    const repeated = session.failed.has(card.key);
    applyRating(stored, card.key, knew, Date.now(), repeated);
    saveBoxes(stored);
    if (!session.reviewed.has(card.key) && knew) session.knownFirst.add(card.key);
    session.reviewed.add(card.key);
    if (!knew && !repeated) { session.failed.add(card.key); session.queue.push(card); }
    session.index += 1;
    if (session.index >= session.queue.length) { drawSummary(); return; }
    drawCard();
    session.feedback.hidden = false;
    session.feedback.className = `practice-feedback ${knew ? 'good' : 'info'}`;
    fill(session.feedback, 
      el('span', { class: 'practice-feedback-glyph', 'aria-hidden': 'true', text: knew ? '✓' : 'ⓘ' }),
      el('div', { class: 'practice-feedback-body' }, el('strong', { text: knew ? 'أحسنت.' : 'ستعود إليك البطاقة قريبًا.' })));
    session.feedback.focus({ preventScroll: true });
  }

  function drawSummary() {
    const stored = loadBoxes();
    const next = nextReviewText(stored);
    fill(body, 
      el('section', { class: 'practice-summary card' },
        el('h2', { text: 'انتهت الجلسة' }),
        el('p', { role: 'status', tabindex: '-1', id: 'a5-summary' },
          'راجعت ', el('bdi', { text: String(session.reviewed.size) }), ' بطاقة. عرفت ', el('bdi', { text: String(session.knownFirst.size) }), '. موعد المراجعة القادم: ',
          next === 'غدًا' || !next ? (next || 'عند فتح التمرين') : el('bdi', { text: next }), '.'),
        el('div', { class: 'practice-actions' },
          button('مجموعة أخرى', { href: '#/practice/a5' }),
          button('كل التمارين', { href: '#/practice', variant: 'secondary' }))
      )
    );
    root.querySelector('#a5-summary')?.focus({ preventScroll: true });
  }

  drawCard();
}

