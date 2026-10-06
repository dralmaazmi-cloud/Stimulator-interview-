import { completedLessons, getAll } from './storage.js';
import { clear, el, icon } from './ui.js';

function sessionAverage(session) {
  const responses = [session.intro_response, ...(session.responses || [])]
    .filter(item => Number.isFinite(item?.report?.final_score));
  return responses.length
    ? Math.round(responses.reduce((sum, item) => sum + item.report.final_score, 0) / responses.length)
    : null;
}

function startCard(kind, title, subtitle, href, iconName) {
  return el('a', { class: `home-start-card ${kind}`, href, 'aria-label': `${title}: ${subtitle}` },
    el('span', { class: 'home-start-icon' }, icon(iconName)),
    el('strong', { text: title }),
    el('span', { text: subtitle }),
    el('i', { class: 'home-start-arrow', 'aria-hidden': 'true', text: '‹' })
  );
}

function pathNode(iconName, label, active = false) {
  return el('span', { class: `path-node ${active ? 'active' : ''}` },
    el('i', {}, icon(iconName)),
    el('small', { text: label })
  );
}

export async function renderHome(root, data) {
  clear(root);
  const completed = await completedLessons();
  const done = data.lessons.filter(lesson => completed.has(lesson.id)).length;
  const percent = Math.round((done / Math.max(1, data.lessons.length)) * 100);
  const sessions = (await getAll('sessions').catch(() => []))
    .filter(item => item.status === 'completed')
    .sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
  const latestAverage = sessions.length ? sessionAverage(sessions[0]) : null;

  root.append(el('section', { class: 'home-dashboard' },
    el('section', { class: 'home-photo-hero', 'aria-label': 'مدرّب المقابلات القيادية' },
      el('img', {
        src: 'assets/images/abu-dhabi-sea-hero.jpg',
        alt: 'أفق مدينة أبوظبي كما يبدو من البحر'
      }),
      el('div', { class: 'home-photo-overlay' },
        el('h1', { text: 'مدرّب المقابلات' }),
        el('p', { text: 'استعد للمقابلة القيادية بثقة' })
      )
    ),

    el('section', { class: 'home-start-section', 'aria-labelledby': 'home-start-title' },
      el('h2', { id: 'home-start-title', text: 'ابدأ من هنا' }),
      el('div', { class: 'home-start-grid' },
        startCard('simulation', 'المحاكاة', 'اختبر نفسك', '#/simulation', 'microphone'),
        startCard('preparation', 'التحضير للمقابلة', 'تعلّم وراجع', '#/preparation', 'book')
      )
    ),

    el('section', { class: 'home-path-card card', 'aria-label': `اكتمل ${percent}% من مسار التحضير` },
      el('div', { class: 'home-path-copy' },
        el('h2', { text: 'مسارك التدريبي' }),
        el('div', { class: 'path-nodes' },
          pathNode('book', 'المعرفة', done >= 1),
          pathNode('competencies', 'المهارات', done >= 3),
          pathNode('flag', 'الجاهزية', done >= 5)
        )
      ),
      el('div', { class: 'home-progress-ring', style: { '--progress': `${percent * 3.6}deg` } },
        el('strong', { text: `${percent}%` }),
        el('span', { text: `${done}/${data.lessons.length}` })
      )
    ),

    el('a', { class: 'home-report-card card', href: '#/reports' },
      el('span', { class: 'home-report-icon' }, icon('reports')),
      el('div', {},
        el('small', { text: 'آخر تقرير' }),
        el('strong', { text: latestAverage == null ? 'ابدأ أول محاكاة' : `متوسط الأداء ${latestAverage}%` }),
        el('span', { text: latestAverage == null ? 'سيظهر تحليلك هنا بعد المقابلة.' : 'راجع نقاط القوة وأولويات التطوير.' })
      ),
      el('b', { 'aria-hidden': 'true', text: '‹' })
    ),
    el('span', { class: 'sr-only', text: 'المحاكاة الذكية' })
  ));
}
