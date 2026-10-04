import { el, button, clear, formatType, notice, pageHead, tag } from './ui.js';

const ICONS = ['◯', '✦', '▥', '◆', '◎', '⚙', '↔', '▤'];

export async function renderCompetenciesIndex(root, data) {
  clear(root);
  root.append(
    pageHead('الوحدة الرابعة', 'الكفاءات الثماني', 'افهم كل كفاءة أولًا، ثم انتقل إلى أسئلتها وإجاباتها النموذجية.'),
    notice('داخل كل كفاءة: التعريف، ما يقيسه المقابل، السلوكيات الداعمة والسلبية، ثم الأسئلة الأساسية.', '', '1→4')
  );

  const list = el('div', { class: 'competency-card-grid section-block' });
  data.competencies.forEach((competency, index) => {
    const count = data.primaryIdsByCompetency.get(competency.id)?.length || 0;
    list.append(el('a', { class: 'competency-card card', href: `#/competencies/${competency.id}` },
      el('span', { class: `competency-symbol tone-${(index % 4) + 1}`, 'aria-hidden': 'true', text: ICONS[index] }),
      el('div', { class: 'competency-copy' },
        el('small', { text: competency.id }),
        el('strong', { text: competency.name }),
        el('span', { text: `${count} أسئلة أساسية مع الإجابات` })
      ),
      el('span', { class: 'question-count-badge', text: String(count), 'aria-label': `${count} أسئلة` }),
      el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
    ));
  });
  root.append(list,
    el('div', { class: 'button-row' }, button('فتح بنك الأسئلة الكامل', { href: '#/bank', variant: 'secondary' }))
  );
}

export async function renderCompetencyDetail(root, data, competencyId) {
  const competency = data.competencyById.get(competencyId);
  if (!competency) {
    clear(root).append(notice('الكفاءة المطلوبة غير موجودة.', 'danger'));
    return;
  }
  clear(root);
  const primaryIds = data.primaryIdsByCompetency.get(competency.id) || [];

  root.append(pageHead(
    `${competency.id} · صفحة ${competency.pdf_page} في الدليل`,
    competency.name,
    'اقرأ الأقسام بالترتيب، ثم افتح أسئلة الكفاءة وإجاباتها.'
  ));

  const overview = el('section', { class: 'competency-overview' },
    infoCard('▤', 'التعريف', competency.definition, 'definition'),
    el('details', { class: 'reveal compact-reveal' },
      el('summary', { text: 'عرض تعريف نسخة 2025 (V1)' }),
      el('div', { class: 'reveal-content' }, el('p', { text: competency.definition_v1_2025 }))
    ),
    listCard('◎', 'ماذا يقيس المقابل؟', competency.what_interviewer_measures, 'measures'),
    listCard('✓', 'السلوكيات الداعمة', competency.supporting_behaviours.map(item => item.text), 'good'),
    competency.negative_behaviours.length
      ? listCard('!', 'السلوكيات السلبية', competency.negative_behaviours.map(item => item.text), 'bad')
      : notice('لا يورد المرجع سلوكيات سلبية لهذه الكفاءة؛ لذلك لا نضيف سلوكيات من خارج الدليل.', 'warning', 'ⓘ')
  );

  const questions = el('section', { class: 'section-block competency-questions' },
    el('div', { class: 'section-heading' },
      el('div', {}, el('span', { class: 'eyebrow', text: 'السؤال ثم المطلوب ثم الإجابة' }), el('h2', { text: `أسئلة الكفاءة (${primaryIds.length})` }))
    )
  );
  const questionList = el('div', { class: 'compact-question-list' });
  primaryIds.forEach(id => {
    const question = data.questionById.get(id);
    questionList.append(el('a', { class: 'compact-question', href: `#/bank/${question.id}` },
      el('span', {}, tag(formatType(question.type), 'accent'), tag(question.rubric_mode === 'star_l' ? 'STAR-L' : question.rubric_mode === 'seal' ? 'SEAL' : 'عام')),
      el('strong', { text: question.display_question }),
      el('small', { class: 'answer-available', text: 'المطلوب + النقاط + إجابة نموذجية' }),
      el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
    ));
  });
  questions.append(questionList,
    el('div', { class: 'button-row' },
      button('عرض هذه الكفاءة في البنك', { href: `#/bank?competency=${competency.id}`, variant: 'secondary' }),
      button('العودة إلى الكفاءات', { href: '#/competencies', variant: 'ghost' })
    )
  );

  root.append(overview);
  if (['C5', 'C7', 'C8'].includes(competency.id)) root.append(aiCrossLinks(data));
  root.append(questions);
}

function aiCrossLinks(data) {
  const ids = ['X1', 'X2'];
  return el('section', { class: 'card ai-cross-links' },
    el('span', { class: 'eyebrow', text: '🤖 تطبيقات الذكاء الاصطناعي' }),
    el('h2', { text: 'أسئلة عامة مرتبطة بهذه الكفاءة' }),
    el('p', { text: 'تبقى هذه الأسئلة مصنفة كأسئلة عامة في الدليل، وتظهر هنا كرابط للمراجعة فقط.' }),
    el('div', { class: 'compact-question-list' }, ...ids.map(id => {
      const question = data.questionById.get(id);
      return el('a', { class: 'compact-question', href: `#/bank/${id}` },
        el('strong', { text: question.question }),
        el('small', { class: 'answer-available', text: 'سؤال عام + إجابة نموذجية' }),
        el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
      );
    }))
  );
}

function infoCard(icon, title, text, tone) {
  return el('article', { class: `competency-info-card card ${tone}` },
    el('span', { class: 'competency-info-icon', 'aria-hidden': 'true', text: icon }),
    el('div', {}, el('h2', { text: title }), el('p', { text }))
  );
}

function listCard(icon, title, items, tone) {
  return el('article', { class: `competency-info-card card ${tone}` },
    el('span', { class: 'competency-info-icon', 'aria-hidden': 'true', text: icon }),
    el('div', {},
      el('h2', { text: title }),
      el('ul', { class: 'competency-info-list' }, ...items.map(item => el('li', { text: item })))
    )
  );
}
