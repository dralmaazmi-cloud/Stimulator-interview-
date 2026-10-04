import { el, clear, notice, pageHead } from './ui.js';

export function renderTools(root) {
  clear(root);
  root.append(
    pageHead('أدوات محلية ومتّصلة', 'أدوات الاستعداد', 'أدوات عملية تساعدك على التحضير والمراجعة والتدريب قبل المقابلة.'),
    notice('الأدوات التعليمية محلية. المحاكاة والتحسين الاختياري فقط يرسلان النص المصحح إلى الخادم.', '', '✓'),
    el('section', { class: 'tools-grid section-block' },
      toolCard('▣', 'باني تقديم الذات', 'أدخل معلوماتك وابنِ تقديمًا مرتبًا للماضي والحاضر والمستقبل خلال 60 أو 120 ثانية.', '#/self-intro', 'blue'),
      toolCard('◎', 'محاكاة المقابلة', 'تدرب نصيًا أو صوتيًا واحصل على تقرير وأسئلة متابعة.', '#/simulation', 'teal'),
      toolCard('◴', 'سجل الجلسات', 'ارجع إلى تقاريرك السابقة وقارن تطورك على جهازك.', '#/sessions', 'blue'),
      toolCard('✓', 'قائمة التحضير', 'راجع خطوات الاستعداد وبنية المقابلة ولغة الجسد.', '#/learn/U6', 'teal'),
      toolCard('⚡', 'مراجعة سريعة', 'أهم القواعد قبل الدخول إلى المقابلة.', '#/quick-review', 'purple'),
      toolCard('★', 'الأسئلة المحفوظة', 'احتفظ بالأسئلة التي تريد العودة إليها لاحقًا.', '#/tools/saved', 'gold')
    )
  );
}

function toolCard(icon, title, description, href, tone) {
  return el('a', { class: `tool-card card ${tone}`, href },
    el('span', { class: 'tool-icon', 'aria-hidden': 'true', text: icon }),
    el('div', {}, el('h2', { text: title }), el('p', { text: description })),
    el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
  );
}
