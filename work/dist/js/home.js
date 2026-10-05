import { completedLessons, getAll } from './storage.js';
import { el, button, clear } from './ui.js';

export async function renderHome(root, data) {
  clear(root);
  const completed = await completedLessons();
  const completedInCurrentPath = new Set(data.lessons.filter(lesson => completed.has(lesson.id)).map(lesson => lesson.id));
  const percent = Math.round((completedInCurrentPath.size / data.lessons.length) * 100);
  const next = data.lessons.find(lesson => !completedInCurrentPath.has(lesson.id)) || data.lessons.at(-1);
  const pendingSession = (await getAll('sessions').catch(() => []))
    .filter(item => item.status === 'in_progress' && Array.isArray(item.question_ids) && item.question_ids.length)
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0] || null;

  root.append(el('section', { class: 'home-dashboard' },
    el('section', { class: 'home-hero card' },
      el('div', { class: 'home-hero-copy' },
        el('span', { class: 'offline-pill', text: '✓ التعلّم يعمل دون إنترنت' }),
        el('h1', { text: 'استعد للمقابلة القيادية بثقة' }),
        el('p', { text: 'تعلّم من الدليل، راجع الأسئلة، ثم اختبر إجابتك في محاكاة مدعومة بالذكاء الاصطناعي.' })
      ),
      el('img', {
        class: 'journey-art',
        src: 'assets/illustrations/journey.svg',
        alt: 'طريق متدرج يرمز إلى مسار الاستعداد للمقابلة'
      }),
      button(completedInCurrentPath.size ? 'تابع المسار التعليمي' : 'ابدأ المسار التعليمي', {
        href: `#/learn/${next.id}`,
        className: 'wide home-primary-action'
      })
    ),

    el('a', { class: 'next-step-card card', href: `#/learn/${next.id}` },
      el('span', { class: 'next-step-icon', 'aria-hidden': 'true', text: next.number }),
      el('div', {},
        el('small', { text: completedInCurrentPath.size ? 'خطوتك التالية' : 'ابدأ من هنا' }),
        el('strong', { text: next.title }),
        el('p', { text: next.subtitle })
      ),
      el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
    ),

    pendingSession ? el('a', { class: 'next-step-card resume-session-card card', href: '#/simulation' },
      el('span', { class: 'next-step-icon', 'aria-hidden': 'true', text: '◎' }),
      el('div', {},
        el('small', { text: 'جلسة غير مكتملة' }),
        el('strong', { text: 'استئناف المحاكاة' }),
        el('p', { text: `السؤال ${Math.min((Number(pendingSession.current_index) || 0) + 1, pendingSession.question_ids.length)} من ${pendingSession.question_ids.length}` })
      ),
      el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
    ) : null,

    el('section', { class: 'home-main-links', 'aria-label': 'أقسام التطبيق الرئيسية' },
      mainLink('▤', 'المسار التعليمي', 'ست وحدات مترابطة تأخذك خطوة بخطوة.', '#/learn', 'teal'),
      mainLink('؟', 'بنك الأسئلة والأجوبة', '89 سؤالًا أساسيًا مع المطلوب والإجابة النموذجية.', '#/bank', 'gold'),
      mainLink('◎', 'محاكاة المقابلة', 'أجب نصيًا أو صوتيًا، ثم احصل على تقرير موثق وأسئلة متابعة.', '#/simulation', 'purple'),
      mainLink('▣', 'أدوات الاستعداد', 'تقديم الذات، قائمة التحضير، والمراجعة السريعة.', '#/tools', 'blue')
    ),

    el('section', { class: 'home-progress-strip card' },
      el('div', { class: 'progress-copy' },
        el('strong', { text: `تقدم المسار ${percent}%` }),
        el('span', { text: `${completedInCurrentPath.size} من ${data.lessons.length} وحدات مكتملة` })
      ),
      el('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
        el('span', { style: { width: `${percent}%` } })
      )
    ),

    el('p', { class: 'home-disclaimer', text: 'التعلّم والبنك محليان. المحاكاة فقط تحتاج إلى الإنترنت وإلى تهيئة مفتاح الذكاء الاصطناعي في الخادم.' })
  ));
}

function mainLink(icon, title, description, href, tone) {
  return el('a', { class: `home-main-link ${tone}`, href },
    el('span', { class: 'home-main-icon', 'aria-hidden': 'true', text: icon }),
    el('div', {}, el('strong', { text: title }), el('small', { text: description })),
    el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
  );
}
