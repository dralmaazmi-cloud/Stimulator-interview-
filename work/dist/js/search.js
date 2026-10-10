import { el, clear, normalizeArabic, pageHead, tag, notice } from './ui.js';
import { loadSearchIndex } from './data.js';

export async function renderSearch(root, data, params = new URLSearchParams()) {
  clear(root);
  root.append(pageHead('بحث شامل', 'ابحث في المرجع والأسئلة', 'ابحث بكلمة أو عبارة داخل الشروحات والكفاءات والأسئلة.'));
  const input = el('input', { class: 'input', type: 'search', value: params.get('q') || '', placeholder: 'مثال: تحمل المسؤولية، النتيجة، التفويض…', autofocus: true });
  const summary = el('div', { class: 'results-summary', 'aria-live': 'polite' });
  const results = el('div', { class: 'question-list' });
  root.append(el('section', { class: 'card toolbar-card' }, el('label', { class: 'field' }, el('span', { text: 'عبارة البحث' }), input)), summary, results);

  // الفهرس (≈260KB) لا يُحمَّل عند الإقلاع بل عند فتح صفحة البحث فقط.
  let searchIndex = null;
  let loadFailed = false;

  const draw = () => {
    const query = normalizeArabic(input.value);
    results.replaceChildren();
    if (loadFailed) {
      summary.textContent = '';
      results.append(notice('تعذر تحميل فهرس البحث. تحقق من الاتصال ثم أعد فتح الصفحة.', 'danger'));
      return;
    }
    if (!searchIndex) {
      summary.textContent = 'جارٍ تحميل فهرس البحث…';
      return;
    }
    if (query.length < 2) {
      summary.textContent = 'اكتب حرفين على الأقل.';
      results.append(el('div', { class: 'card empty-state' }, el('strong', { text: 'ابدأ بكلمة من الموضوع الذي تراجعه' }), el('p', { text: 'سيظهر لك مكانها في الدروس والأسئلة والكفاءات.' })));
      return;
    }
    const words = query.split(/\s+/).filter(Boolean);
    const primaryIds = new Set(data.curation.primary_ids);
    const matches = searchIndex
      .filter(item => item.kind !== 'question' || primaryIds.has(item.id))
      .map(item => {
        const haystack = normalizeArabic(`${item.title} ${item.text} ${(item.tags || []).join(' ')}`);
        const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
        return { item, score };
      })
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'ar'))
      .slice(0, 80);
    summary.textContent = `النتائج: ${matches.length}${matches.length === 80 ? ' (أول 80 نتيجة)' : ''}`;
    if (!matches.length) {
      results.append(el('div', { class: 'card empty-state' }, el('strong', { text: 'لا توجد نتيجة' }), el('p', { text: 'جرّب كلمة أقصر أو مرادفًا آخر.' })));
      return;
    }
    matches.forEach(({ item }) => results.append(el('a', { class: 'card question-card', href: item.route, style: { textDecoration: 'none' } },
      el('div', { class: 'question-meta' }, tag(kindLabel(item.kind), 'accent'), ...(item.tags || []).slice(0, 2).map(value => tag(tagLabel(value)))),
      el('h2', { text: item.title }),
      el('span', { class: 'card-link', text: 'افتح النتيجة ←' })
    )));
  };
  input.addEventListener('input', () => {
    history.replaceState(null, '', `#/search?q=${encodeURIComponent(input.value)}`);
    draw();
  });
  draw();
  try {
    searchIndex = await loadSearchIndex();
  } catch (error) {
    console.error(error);
    loadFailed = true;
  }
  draw();
}

// البند 12: وسوم الفهرس الداخلية تُعرض بترجمتها دون تغيير الفهرس نفسه.
const TAG_LABELS = Object.freeze({
  scenario: 'سيناريو',
  behavioural: 'سلوكي',
  general: 'عام',
  star_l: 'STAR-L',
  seal: 'SEAL',
  self_intro: 'تقديم الذات'
});

function tagLabel(value) {
  return TAG_LABELS[value] || value;
}

function kindLabel(kind) {
  return ({ question: 'سؤال', competency: 'كفاءة', lesson: 'درس', section: 'قسم من المرجع', principle: 'مبدأ' })[kind] || kind;
}
