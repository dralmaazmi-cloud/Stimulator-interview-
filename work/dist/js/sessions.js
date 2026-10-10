import { get, getAll, remove } from './storage.js';
import { renderEvaluationReport, renderSessionSummary } from './report.js';
import { el, button, clear, notice, pageHead, tag } from './ui.js';

// البند 7: التقارير المغلقة تُفتح تلقائيًا قبل الطباعة كي تُطبع المعايير والاقتباسات.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('details.saved-report').forEach(details => { details.open = true; });
  });
}

const MODE_LABELS = Object.freeze({
  single: 'سؤال واحد',
  realistic: 'محاكاة واقعية',
  extended: 'محاكاة ممتدة',
  full: 'مقابلة كاملة'
});

function responsesOf(session) {
  return [session.intro_response, ...(session.responses || [])].filter(item => item?.report && item?.question);
}

function averageOf(session) {
  const scores = responsesOf(session).map(item => item.report?.final_score).filter(Number.isFinite);
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return 'تاريخ غير متوفر';
  return new Intl.DateTimeFormat('ar-AE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export async function renderSessions(root) {
  clear(root);
  const allSessions = await getAll('sessions');
  const sessions = allSessions
    .filter(item => item.status === 'completed')
    .sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
  const pending = allSessions
    .filter(item => item.status === 'in_progress' && Array.isArray(item.question_ids) && item.question_ids.length)
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
  root.append(
    pageHead('محفوظ محليًا', 'سجل الجلسات', 'تقاريرك السابقة موجودة على هذا الجهاز فقط.'),
    notice('لا تُخزن التسجيلات الصوتية. يمكنك طباعة أي تقرير أو حفظه PDF من شاشة التقرير.', '', 'ⓘ'),
    // alpha-5 (D3): رابط خريطة التغطية من «التقارير».
    el('a', { class: 'card coverage-link-card', href: '#/coverage' },
      el('div', {}, el('strong', { text: 'خريطة التغطية' }), el('small', { text: 'ما جرّبته من الكفاءات والمبادئ وما لم تجرّبه بعد.' })),
      el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
    )
  );
  if (pending.length) {
    root.append(el('section', { class: 'section-block pending-sessions' },
      el('h2', { text: 'جلسات غير مكتملة' }),
      ...pending.map(session => el('article', { class: 'card pending-session-card' },
        el('div', { class: 'session-history-head' },
          tag(MODE_LABELS[session.mode] || 'محاكاة', 'accent'),
          tag(session.answer_mode === 'voice' ? 'صوتي' : 'نصي'),
          el('time', { datetime: session.updated_at || session.created_at, text: formatDate(session.updated_at || session.created_at) })
        ),
        el('p', { text: `السؤال ${Math.min((Number(session.current_index) || 0) + 1, session.question_ids.length)} من ${session.question_ids.length}` }),
        el('div', { class: 'button-row' },
          button('استئناف', { href: '#/simulation' }),
          button('حذف', { variant: 'ghost', onClick: async () => { await remove('sessions', session.id); renderSessions(root); } })
        )
      ))
    ));
  }
  if (!sessions.length) {
    root.append(el('section', { class: 'card empty-state' },
      el('strong', { text: 'لا توجد جلسات مكتملة بعد' }),
      el('p', { text: 'أكمل أول محاكاة ليظهر تقريرها هنا.' }),
      button('ابدأ محاكاة', { href: '#/simulation' })
    ));
    return;
  }

  const averages = sessions.map(averageOf).filter(Number.isFinite);
  root.append(
    el('section', { class: 'session-history-stats' },
      stat(String(sessions.length), 'جلسات مكتملة'),
      stat(averages.length ? `${Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length)}%` : '—', 'المتوسط العام'),
      stat(String(sessions.reduce((sum, item) => sum + responsesOf(item).length, 0)), 'إجابات محللة')
    ),
    el('section', { class: 'session-history-list section-block' }, ...sessions.map(session => {
      const average = averageOf(session);
      return el('a', { class: 'card session-history-card', href: `#/sessions/${session.id}` },
        el('div', { class: 'session-history-head' },
          tag(MODE_LABELS[session.mode] || 'محاكاة', 'accent'),
          tag(session.answer_mode === 'voice' ? 'صوتي' : 'نصي'),
          el('time', { datetime: session.completed_at, text: formatDate(session.completed_at) })
        ),
        el('div', { class: 'session-history-body' },
          el('div', {},
            el('strong', { text: `${responsesOf(session).length} إجابة` }),
            el('small', { text: 'اضغط لفتح الملخص وتقارير الإجابات كاملة' })
          ),
          el('span', { class: 'session-history-score', text: average == null ? '—' : `${average}%` })
        )
      );
    }))
  );
}

export async function renderSavedSession(root, id) {
  clear(root);
  const session = await get('sessions', id);
  if (!session || session.status !== 'completed') {
    root.append(notice('تعذر العثور على هذا التقرير على جهازك.', 'danger'));
    return;
  }
  const previousSessions = (await getAll('sessions'))
    .filter(item => item.status === 'completed' && item.id !== session.id
      && String(item.completed_at || '') < String(session.completed_at || ''))
    .sort((a, b) => String(a.completed_at || '').localeCompare(String(b.completed_at || '')));
  root.append(
    pageHead('تقرير محفوظ', MODE_LABELS[session.mode] || 'تقرير المحاكاة', formatDate(session.completed_at)),
    renderSessionSummary(session, {
      previousSessions,
      onRestart: () => { location.hash = '#/simulation'; }
    })
  );
  // البند 7: التقرير الكامل لكل إجابة (المعايير والاقتباسات) بلا أزرار إجراءات.
  const responses = responsesOf(session);
  if (responses.length) {
    root.append(el('section', { class: 'section-block saved-reports' },
      el('h2', { text: 'تقارير الإجابات' }),
      ...responses.map((item, index) => el('details', { class: 'reveal saved-report' },
        el('summary', { text: `تقرير الإجابة ${index + 1} — ${item.question.id === 'SELF-INTRO' ? 'تقديم الذات' : (item.question.competency_name || item.question.principle_title || 'سؤال عام')}` }),
        el('div', { class: 'reveal-content' },
          renderEvaluationReport({
            report: item.report,
            question: item.question,
            answer: item.answer,
            followups: item.followups || [],
            currentAttempt: item.attempt?.current || null,
            previousAttempt: item.attempt?.previous || null,
            example: item.example || null,
            retryHref: item.question.id === 'SELF-INTRO' ? null : `#/simulation?question=${encodeURIComponent(item.question.id)}&answer=${session.answer_mode === 'voice' ? 'voice' : 'text'}`,
            onFollowup: null,
            onNext: null,
            onFinish: null
          })
        )
      ))
    ));
  }
}

function stat(value, label) {
  return el('article', { class: 'card session-history-stat' },
    el('strong', { text: value }),
    el('span', { text: label })
  );
}
