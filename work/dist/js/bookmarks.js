import { el, button, clear, notice, pageHead, tag } from './ui.js';

const KEY = 'lic:bookmarked-questions';

export function getBookmarkedIds() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isBookmarked(questionId) {
  return getBookmarkedIds().includes(questionId);
}

export function toggleBookmark(questionId) {
  const ids = new Set(getBookmarkedIds());
  if (ids.has(questionId)) ids.delete(questionId);
  else ids.add(questionId);
  localStorage.setItem(KEY, JSON.stringify([...ids]));
  return ids.has(questionId);
}

export function renderSavedQuestions(root, data) {
  clear(root);
  const ids = getBookmarkedIds();
  const questions = ids.map(id => data.questionById.get(id)).filter(Boolean);
  root.append(pageHead('محفوظة على هذا الجهاز', 'الأسئلة المحفوظة', 'احفظ الأسئلة المهمة للرجوع إليها بسرعة دون اتصال.'));
  if (!questions.length) {
    root.append(notice('لم تحفظ أي سؤال بعد. افتح سؤالًا واضغط «حفظ السؤال».', '', '☆'),
      el('div', { class: 'button-row' }, button('فتح بنك الأسئلة', { href: '#/bank' })));
    return;
  }
  const list = el('div', { class: 'question-list' });
  questions.forEach(question => list.append(el('a', { class: 'card saved-question-card', href: `#/bank/${question.id}` },
    el('div', { class: 'question-meta' },
      tag(question.competency_name || question.principle_title || 'سؤال عام', 'accent'),
      tag('إجابة نموذجية متوفرة', 'success')
    ),
    el('strong', { text: question.display_question }),
    el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
  )));
  root.append(list);
}
