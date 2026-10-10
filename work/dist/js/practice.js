// تمارين التعلّم V2: مركز التمارين والتوجيه الداخلي (#/practice و#/practice/a1..a5).
import { clear, el, icon } from './ui.js';
import { a1Mastered, a2Mastered, p, practiceShell, readStore } from './practice-core.js';
import { renderA5, reviewStatus } from './practice-a5.js';
import { renderA4 } from './practice-a4.js';
import { loadLazy } from './lazy-load.js';

export { a1Mastered, a2Mastered, u2PracticeMastered } from './practice-core.js';
export { reviewStatus, rateCard } from './practice-a5.js';

const ACTIVITIES = Object.freeze([
  ['a1', 'answer', 'ورشة العناصر', 'رتّب عناصر STAR-L وSEAL، أو اكتشف العنصر الناقص.'],
  ['a2', 'decision', 'أي بناء أستخدم؟', 'ميّز بين السؤال السلوكي وسؤال السيناريو.'],
  ['a3', 'book', 'شاهد إجابة كاملة', 'تابع إجابة نموذجية جزءًا جزءًا، ثم أكمل بنفسك.'],
  ['a4', 'calendar', 'ميزانية وقت التعريف الشخصي', 'وزّع 60 أو 120 ثانية على الأجزاء الستة.'],
  ['a5', 'target', 'بطاقات الاسترجاع', 'راجع الأطر والكفاءات والمبادئ والأخطاء الشائعة.']
]);

function activityStatus(id, review) {
  if (id === 'a1' && a1Mastered()) return 'أنجزت هذا التمرين';
  if (id === 'a2' && a2Mastered()) return 'أنجزت هذا التمرين';
  if (id === 'a3' && readStore('a3', null)?.completedAt) return 'شاهدته';
  if (id === 'a4' && readStore('budget', null)?.at) return 'بدأته';
  if (id === 'a5') return review.due ? `${review.due} بطاقة مستحقة` : 'لا بطاقات مستحقة الآن';
  return '';
}

function renderHub(root, data) {
  const review = reviewStatus(data);
  const cards = ACTIVITIES.map(([id, iconName, title, description]) => {
    const status = activityStatus(id, review);
    return el('a', { class: 'preparation-card card practice-entry', href: `#/practice/${id}` },
      el('span', { class: 'preparation-icon' }, icon(iconName)),
      el('div', { class: 'unit-copy' },
        el('h2', { text: title }),
        p(description),
        status ? el('small', { class: 'practice-status' }, el('span', { 'aria-hidden': 'true', text: id === 'a5' ? '' : '✓ ' }), status) : null
      ),
      el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
    );
  });
  clear(root).append(practiceShell('تمارين التعلّم', 'خمسة تمارين قصيرة تحوّل ما قرأته إلى مهارة. ابدأ بأيّها شئت.',
    el('div', { class: 'preparation-grid practice-hub-grid' }, ...cards),
    el('a', { class: 'practice-link', href: '#/competencies' }, 'تدرّب على أسئلة الكفاءات')
  ));
}

export async function renderPractice(root, data, activity, params = new URLSearchParams()) {
  if (!activity) { renderHub(root, data); return; }
  // التمارين 1 إلى 3 (≈37KB) تُحمَّل عند فتح التمرين فقط؛ 4 و5 مشتركتان مع الرئيسية وصفحات التحضير فتبقيان ثابتتين.
  if (activity === 'a1') { const mod = await loadLazy(root, () => import('./practice-a1.js')); if (mod) await mod.renderA1(root, data, params); return; }
  if (activity === 'a2') { const mod = await loadLazy(root, () => import('./practice-a2.js')); if (mod) await mod.renderA2(root, data, params); return; }
  if (activity === 'a3') { const mod = await loadLazy(root, () => import('./practice-a3.js')); if (mod) await mod.renderA3(root, data, params); return; }
  if (activity === 'a4') { await renderA4(root, data, params); return; }
  if (activity === 'a5') { await renderA5(root, data, params); return; }
  renderHub(root, data);
}
