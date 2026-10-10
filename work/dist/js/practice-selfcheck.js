// S5: لوحة «قارن بإجابتك أنت» بعد كشف الإجابة النموذجية في صفحة تركيز السؤال.
import { button, el } from './ui.js';
import { modelElements } from './guidance.js';
import { p, readStore, writeStore } from './practice-core.js';

const RATINGS = Object.freeze([['full', 'غطّيته'], ['part', 'جزئيًا'], ['none', 'لم أغطّه']]);

export function renderSelfCheck(question) {
  const elements = modelElements(question.rubric_mode);
  const storeKey = `selfcheck:${question.id}`;
  const saved = readStore(storeKey, null);
  const ratings = saved?.ratings && typeof saved.ratings === 'object' ? { ...saved.ratings } : {};
  const summary = el('div', { class: 'selfcheck-summary', role: 'status' });
  const host = el('section', { class: 'selfcheck card no-print', 'aria-label': 'قارن بإجابتك أنت' },
    el('h3', { text: 'قارن بإجابتك أنت' }),
    p('لا حاجة إلى إجابة مثالية. اسأل نفسك بصدق: هل غطّيت كل عنصر في إجابتك؟', 'practice-lead')
  );

  let interactive = false;
  const refreshSummary = () => {
    const rated = elements.filter(item => ratings[item.key]);
    if (rated.length < elements.length) { summary.replaceChildren(); return; }
    const firstReveal = !summary.hasChildNodes();
    const strong = elements.filter(item => ratings[item.key] === 'full');
    const next = elements.filter(item => ratings[item.key] !== 'full');
    const children = [];
    if (strong.length) children.push(el('p', {}, el('b', { text: 'أقوى عناصرك: ' }), strong.map(item => item.title).join('، ')));
    if (next.length) children.push(el('p', {}, el('b', { text: 'للتدريب القادم: ' }), next.map(item => item.title).join('، ')));
    const firstMissing = elements.find(item => ratings[item.key] === 'none') || elements.find(item => ratings[item.key] === 'part');
    children.push(el('p', { class: 'selfcheck-verdict' }, firstMissing
      ? `ركّز في محاولتك القادمة على: ${firstMissing.title}.`
      : 'إجابة مكتملة العناصر. جرّبها الآن بصوتك.'));
    const actions = el('div', { class: 'practice-actions' },
      button('تدرّب بصوتك', { href: `#/simulation?question=${encodeURIComponent(question.id)}&answer=voice` }),
      button('تدرّب بالكتابة', { href: `#/simulation?question=${encodeURIComponent(question.id)}&answer=text`, variant: 'secondary' }));
    if (firstMissing && (question.rubric_mode === 'star_l' || question.rubric_mode === 'seal')) {
      actions.append(button('درّب هذا العنصر', {
        href: `#/practice/a1?mode=missing&fw=${question.rubric_mode}&el=${encodeURIComponent(firstMissing.key)}&q=${encodeURIComponent(question.id)}`,
        variant: 'ghost'
      }));
    }
    summary.replaceChildren(...children, actions);
    // الملخص يظهر أسفل آخر عنصر وقد يقع خلف شريط الإجراءات اللاصق؛ نُظهره عند أول ظهور فقط.
    if (firstReveal && interactive && typeof summary.scrollIntoView === 'function') {
      summary.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };

  const rows = el('div', { class: 'selfcheck-rows' }, ...elements.map(item => {
    const group = el('div', { class: 'selfcheck-choices', role: 'group', 'aria-label': `تقييم عنصر ${item.title}` });
    RATINGS.forEach(([value, text]) => {
      const choice = el('button', {
        type: 'button', class: `selfcheck-choice${ratings[item.key] === value ? ' active' : ''}`,
        'aria-pressed': String(ratings[item.key] === value)
      }, el('span', { 'aria-hidden': 'true', text: ratings[item.key] === value ? '● ' : '○ ' }), text);
      choice.addEventListener('click', () => {
        ratings[item.key] = value;
        [...group.children].forEach(other => {
          const active = other === choice;
          other.classList.toggle('active', active);
          other.setAttribute('aria-pressed', String(active));
          other.firstChild.textContent = active ? '● ' : '○ ';
        });
        writeStore(storeKey, { ratings, at: new Date().toISOString() });
        refreshSummary();
      });
      group.append(choice);
    });
    return el('article', { class: 'selfcheck-row' },
      el('div', {}, el('strong', { text: item.title }), el('small', { text: item.prompt })),
      group);
  }));

  host.append(rows, summary, p('تقييم ذاتي للتدريب، ولا يدخل في درجة المحاكاة.', 'practice-helper'));
  refreshSummary();
  interactive = true;
  return host;
}
