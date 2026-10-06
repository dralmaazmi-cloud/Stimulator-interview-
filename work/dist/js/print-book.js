import { questionSamples } from './data.js';
import { buildAnswerGuidance } from './guidance.js';
import { button, el, formatModel, formatType, icon, renderBlock, showDialog } from './ui.js';

const BOOK_TITLE = 'مدرّب المقابلات';
// alpha-6.1: أسماء العناصر تتبع نموذج السؤال؛ SEAL بالأسماء المعتمدة الأربعة وSTAR-L بأسمائه.
const ANSWER_LABELS = Object.freeze({
  seal: Object.freeze({
    situation: 'فهم الوضع',
    evaluation: 'التقييم',
    action: 'الإجراء',
    leadership_impact: 'الأثر القيادي'
  }),
  star_l: Object.freeze({
    situation: 'الموقف',
    task: 'المهمة ودورك',
    action: 'الإجراء',
    action_points: 'الإجراءات',
    result: 'النتيجة',
    learning: 'التعلّم'
  })
});

function answerLabels(mode) {
  return ANSWER_LABELS[mode] || ANSWER_LABELS.star_l;
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

// قائمة صريحة قابلة للاختبار تمنع سقوط أي سؤال من نسخة الطباعة الكاملة.
export function printBookQuestionIds(data, scope = { kind: 'preparation' }) {
  const competencyIds = competencyId => data.primaryIdsByCompetency.get(competencyId) || [];
  const allCompetencyIds = () => data.competencies.flatMap(competency => competencyIds(competency.id));
  const missionIds = () => data.missionMap.flatMap(principle => principle.question_ids || []);
  const readinessIds = () => ['X1', 'X2'].filter(id => data.questionById.has(id));

  if (scope.kind === 'question') return data.questionById.has(scope.id) ? [scope.id] : [];
  if (scope.kind === 'competency') return uniqueIds(competencyIds(scope.id));
  if (scope.kind === 'competencies') return uniqueIds(allCompetencyIds());
  if (scope.kind === 'lesson') {
    if (scope.id === 'U3') return uniqueIds(allCompetencyIds());
    if (scope.id === 'U4') return uniqueIds(missionIds());
    if (scope.id === 'U5') return readinessIds();
    return [];
  }
  return uniqueIds([...allCompetencyIds(), ...missionIds(), ...readinessIds()]);
}

function sectionHeading(title, subtitle = '') {
  return el('header', { class: 'print-section-heading' },
    el('h2', { text: title }),
    subtitle ? el('p', { text: subtitle }) : null
  );
}

function sourceSections(sections = []) {
  return sections.map(section => el('section', { class: 'print-source-section' },
    el('h3', {}, el('small', { text: `القسم ${section.number}` }), document.createTextNode(section.title)),
    ...(section.blocks || []).map(renderBlock)
  ));
}

function answerParts(parts = {}, mode = 'star_l') {
  const labels = answerLabels(mode);
  return el('div', { class: 'print-answer-parts' },
    ...Object.entries(parts).filter(([, value]) => value != null).map(([key, value]) =>
      el('section', { class: 'print-answer-part' },
        el('h4', { text: labels[key] || key }),
        el('p', { text: Array.isArray(value) ? value.join(' • ') : value })
      )
    )
  );
}

function answerSamples(question) {
  const samples = questionSamples(question);
  if (!samples.length) return el('p', { class: 'print-empty', text: 'الإجابة النموذجية غير متاحة.' });
  return el('div', { class: 'print-answer-samples' }, ...samples.map(sample =>
    el('section', { class: `print-answer-sample sample-${sample.kind || 'guide'}` },
      el('h4', { text: sample.title || 'الإجابة النموذجية الإرشادية' }),
      sample.subtitle ? el('p', { class: 'print-answer-note', text: sample.subtitle }) : null,
      sample.parts ? answerParts(sample.parts, question.rubric_mode) : el('p', { class: 'print-guide-answer', text: sample.text })
    )
  ));
}

function questionPage(question, data, index) {
  const guidance = buildAnswerGuidance(question, data);
  return el('section', { class: 'print-question-page', dataset: { questionId: question.id } },
    el('header', { class: 'print-question-heading' },
      el('span', { class: 'print-question-number', text: `السؤال ${index + 1}` }),
      el('div', { class: 'print-question-tags' },
        el('span', { text: formatType(question.type) }),
        el('span', { text: formatModel(question.rubric_mode) })
      ),
      el('h3', { text: question.display_question })
    ),
    el('section', { class: 'print-question-section' },
      el('h4', { text: 'ما المطلوب في الإجابة؟' }),
      el('p', { text: guidance.intent.instruction }),
      guidance.points.length
        ? el('ul', {}, ...guidance.points.map(point => el('li', { text: point })))
        : null
    ),
    el('section', { class: 'print-question-section' },
      el('h4', { text: `خريطة الإجابة ${formatModel(question.rubric_mode)}` }),
      el('table', { class: 'print-blueprint-table' },
        el('tbody', {}, ...guidance.elements.map(item => el('tr', {},
          el('th', { scope: 'row', text: item.title }),
          el('td', { text: item.prompt })
        )))
      )
    ),
    el('section', { class: 'print-question-section print-model-answer' },
      el('h4', { text: 'الإجابة النموذجية' }),
      el('p', { class: 'print-answer-note', text: 'مثال لفهم البناء وطريقة التفكير، وليس نصًا للحفظ.' }),
      answerSamples(question)
    ),
    el('aside', { class: 'print-memory-box' },
      el('h4', { text: 'نقاط يجب أن تتذكرها' }),
      el('ul', {},
        el('li', { text: guidance.intent.answerPlan }),
        el('li', { text: guidance.tip }),
        el('li', { text: 'استخدم تفاصيل حقيقية، ووضّح دورك الشخصي والأثر الناتج.' })
      )
    )
  );
}

function competencyChapter(competency, data, chapterNumber, options = {}) {
  const questions = (data.primaryIdsByCompetency.get(competency.id) || [])
    .map(id => data.questionById.get(id)).filter(Boolean);
  return el('article', { class: `print-chapter print-competency-chapter ${options.compact ? 'compact' : ''}` },
    sectionHeading(
      `${options.prefix || `الفصل ${chapterNumber} —`} ${competency.name}`.trim(),
      'فهم الكفاءة والتدرّب على أسئلتها'
    ),
    el('section', { class: 'print-overview-section' },
      el('h3', { text: 'فهم الكفاءة وما الذي تقيسه' }),
      el('p', { text: competency.definition }),
      el('table', { class: 'print-measures-table' },
        el('thead', {}, el('tr', {}, el('th', { text: 'المحور' }), el('th', { text: 'ما يبحث عنه المقابل' }))),
        el('tbody', {}, ...competency.what_interviewer_measures.map((measure, index) => el('tr', {},
          el('td', { text: `المحور ${index + 1}` }), el('td', { text: measure })
        )))
      )
    ),
    el('section', { class: 'print-overview-section' },
      el('h3', { text: 'كيف تُظهرها في المقابلة' }),
      el('div', { class: 'print-behaviour-columns' },
        el('div', {}, el('h4', { text: 'سلوكيات تقوّي الإجابة' }),
          el('ul', {}, ...competency.supporting_behaviours.map(item => el('li', { text: item.text })))
        ),
        competency.negative_behaviours.length
          ? el('div', {}, el('h4', { text: 'سلوكيات تضعف الإجابة' }),
            el('ul', {}, ...competency.negative_behaviours.map(item => el('li', { text: item.text })))
          )
          : null
      )
    ),
    el('section', { class: 'print-question-index' },
      el('h3', { text: `أسئلة الكفاءة (${questions.length})` }),
      el('ol', {}, ...questions.map(question => el('li', { text: question.display_question })))
    ),
    ...questions.map((question, index) => questionPage(question, data, index))
  );
}

function missionChapter(data, chapterNumber) {
  const source = data.reference.part_4_mission_command;
  const chapter = el('article', { class: 'print-chapter print-mission-chapter' },
    sectionHeading(`الفصل ${chapterNumber} — قيادة المهمة`, source.title)
  );
  source.intro.forEach(block => chapter.append(renderBlock(block)));
  source.principles.forEach((principle, principleIndex) => {
    const questionIds = data.missionMap.find(item => item.principle_id === principle.id)?.question_ids || [];
    const questions = questionIds.map(id => data.questionById.get(id)).filter(Boolean);
    chapter.append(el('section', { class: 'print-principle' },
      el('h3', { text: `${principleIndex + 1}. ${principle.title}` }),
      el('p', { text: principle.description }),
      el('p', {}, el('strong', { text: 'الكفاءات المرتبطة: ' }), document.createTextNode(principle.linked_competencies.join('، '))),
      ...questions.map((question, index) => questionPage(question, data, index))
    ));
  });
  return chapter;
}

function sourceChapter(title, subtitle, sections, chapterNumber) {
  return el('article', { class: 'print-chapter' },
    sectionHeading(`الفصل ${chapterNumber} — ${title}`, subtitle),
    ...sourceSections(sections)
  );
}

function readinessChapter(data, chapterNumber) {
  const chapter = sourceChapter(
    'الجاهزية النهائية',
    'مراجعة عملية قبل الانتقال إلى المحاكاة.',
    data.reference.part_6_preparation.sections,
    chapterNumber
  );
  const questions = ['X1', 'X2'].map(id => data.questionById.get(id)).filter(Boolean);
  if (questions.length) chapter.append(
    el('section', { class: 'print-question-index' },
      el('h3', { text: 'أسئلة الذكاء الاصطناعي' }),
      el('ol', {}, ...questions.map(question => el('li', { text: question.display_question })))
    ),
    ...questions.map((question, index) => questionPage(question, data, index))
  );
  return chapter;
}

function lessonChapter(data, lessonId, chapterNumber) {
  if (lessonId === 'U1') return sourceChapter(
    'افهم المقابلة',
    'هدف المقابلة، طريقة إدارتها، وما الذي تبحث عنه لجنة التقييم.',
    data.reference.part_1_framework.sections,
    chapterNumber
  );
  if (lessonId === 'U2') return sourceChapter(
    'بناء الإجابة النموذجية',
    'أطر عملية لبناء إجابات واضحة، منظمة ومؤثرة.',
    data.reference.part_2_answering.sections,
    chapterNumber
  );
  if (lessonId === 'U3') {
    const wrapper = el('article', { class: 'print-chapter print-competencies-collection' },
      sectionHeading(`الفصل ${chapterNumber} — الكفاءات الثمانية`, 'فهم كل كفاءة والتدرّب على أسئلتها')
    );
    data.competencies.forEach((competency, index) => wrapper.append(
      competencyChapter(competency, data, index + 1, { compact: true, prefix: `${index + 1}.` })
    ));
    return wrapper;
  }
  if (lessonId === 'U4') return missionChapter(data, chapterNumber);
  return readinessChapter(data, chapterNumber);
}

function contentsFor(scope, data) {
  if (scope.kind === 'question') {
    const question = data.questionById.get(scope.id);
    return {
      title: 'دليل السؤال التدريبي',
      subtitle: question?.competency_name || question?.principle_title || 'التدريب على بناء الإجابة',
      entries: ['السؤال', 'ما المطلوب في الإجابة؟', 'خريطة بناء الإجابة', 'الإجابة النموذجية'],
      chapters: question ? [el('article', { class: 'print-chapter' }, questionPage(question, data, 0))] : []
    };
  }
  if (scope.kind === 'competency') {
    const competency = data.competencyById.get(scope.id);
    return {
      title: competency?.name || 'الكفاءة',
      subtitle: 'فهم الكفاءة والتدرّب على أسئلتها',
      entries: ['فهم الكفاءة وما الذي تقيسه', 'كيف تُظهرها في المقابلة', 'أسئلة الكفاءة', 'الإجابات النموذجية'],
      chapters: competency ? [competencyChapter(competency, data, 1)] : []
    };
  }
  if (scope.kind === 'competencies') {
    return {
      title: 'الكفاءات الثمانية',
      subtitle: 'دليل متكامل للفهم والتدريب',
      entries: data.competencies.map((competency, index) => `${index + 1}. ${competency.name}`),
      chapters: data.competencies.map((competency, index) => competencyChapter(competency, data, index + 1))
    };
  }
  if (scope.kind === 'lesson') {
    const lesson = data.lessonById.get(scope.id);
    return {
      title: lesson?.title || 'فصل التحضير',
      subtitle: lesson?.subtitle || 'دليل التحضير للمقابلة',
      entries: lesson?.id === 'U3'
        ? data.competencies.map((competency, index) => `${index + 1}. ${competency.name}`)
        : lesson?.id === 'U5'
          ? ['مراجعة الجاهزية', 'أسئلة الذكاء الاصطناعي وإجابات الدليل']
          : ['المفاهيم الأساسية', 'الشرح التطبيقي', 'نقاط المراجعة'],
      chapters: lesson ? [lessonChapter(data, lesson.id, 1)] : []
    };
  }
  return {
    title: 'التحضير للمقابلة القيادية',
    subtitle: 'كتاب عملي متكامل للتعلّم والتطبيق والمراجعة',
    entries: data.lessons.map((lesson, index) => `${index + 1}. ${lesson.title}`),
    chapters: data.lessons.map((lesson, index) => lessonChapter(data, lesson.id, index + 1))
  };
}

export function buildPrintBook(data, scope = { kind: 'preparation' }) {
  const content = contentsFor(scope, data);
  return el('section', { class: 'print-book', dir: 'rtl' },
    el('section', { class: 'print-cover' },
      el('div', { class: 'print-cover-mark' }, icon('book')),
      el('p', { class: 'print-brand', text: BOOK_TITLE }),
      el('h1', { text: content.title }),
      el('p', { class: 'print-cover-subtitle', text: content.subtitle }),
      el('div', { class: 'print-cover-rule' }),
      el('p', { class: 'print-cover-note', text: 'مرجع تدريبي منظم للقراءة والطباعة' })
    ),
    el('section', { class: 'print-toc' },
      el('h2', { text: 'محتويات الكتاب' }),
      el('ol', {}, ...content.entries.map(entry => el('li', { text: entry })))
    ),
    ...content.chapters,
    el('footer', { class: 'print-book-end' },
      el('strong', { text: BOOK_TITLE }),
      el('p', { text: 'انتهى هذا الدليل. استخدم النماذج لفهم البناء ثم صغ إجاباتك من خبرتك الشخصية.' })
    )
  );
}

function mountAndPrint(data, scope) {
  let host = document.querySelector('#print-book-root');
  if (!host) {
    host = el('div', { id: 'print-book-root', class: 'print-book-root', 'aria-hidden': 'true' });
    document.body.append(host);
  }
  host.replaceChildren(buildPrintBook(data, scope));
  document.body.classList.add('book-printing');
  const cleanup = () => document.body.classList.remove('book-printing');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => window.print(), 80);
  window.setTimeout(cleanup, 60_000);
}

function scopesFor(context, data) {
  const full = { kind: 'preparation', label: 'دليل التحضير كاملًا', description: 'الفصول الخمسة بجميع محتوياتها وأسئلتها وإجاباتها.' };
  if (context.type === 'preparation') return [full];
  if (context.type === 'competencies') return [
    { kind: 'competencies', label: 'الكفاءات الثمانية', description: 'شرح الكفاءات وأسئلتها وإجاباتها النموذجية.' },
    full
  ];
  if (context.type === 'competency') {
    const competency = data.competencyById.get(context.id);
    return [
      { kind: 'competency', id: context.id, label: `هذه الكفاءة: ${competency?.name || ''}`, description: 'الشرح الكامل وأسئلة هذه الكفاءة وإجاباتها.' },
      { kind: 'competencies', label: 'الكفاءات الثمانية', description: 'جميع الكفاءات وأسئلتها وإجاباتها.' },
      full
    ];
  }
  if (context.type === 'question') {
    const question = data.questionById.get(context.id);
    const parent = question?.competency_id
      ? { kind: 'competency', id: question.competency_id, label: 'الكفاءة كاملة', description: 'شرح الكفاءة وجميع أسئلتها وإجاباتها.' }
      : question?.principle_id
        ? { kind: 'lesson', id: 'U4', label: 'فصل قيادة المهمة', description: 'المبادئ الستة وأسئلتها وإجاباتها.' }
        : { kind: 'lesson', id: 'U5', label: 'فصل الجاهزية النهائية', description: 'محتوى الجاهزية وأسئلته وإجابات الدليل.' };
    return [
      { kind: 'question', id: context.id, label: 'هذا السؤال فقط', description: 'السؤال، المطلوب، خريطة الإجابة والمثال النموذجي.' },
      parent,
      full
    ];
  }
  const lesson = data.lessonById.get(context.id);
  return [
    { kind: 'lesson', id: context.id, label: `هذا الفصل: ${lesson?.title || ''}`, description: 'جميع الموضوعات والمعلومات والأسئلة الموجودة في هذا الفصل.' },
    full
  ];
}

function chooseScope(data, context, action) {
  const scopes = scopesFor(context, data);
  if (scopes.length === 1) {
    mountAndPrint(data, scopes[0]);
    return;
  }
  const list = el('div', { class: 'print-scope-list' },
    ...scopes.map(scope => button(scope.label, {
      variant: 'secondary',
      className: 'print-scope-option',
      onClick: () => {
        document.querySelector('#app-dialog')?.close();
        mountAndPrint(data, scope);
      },
      'aria-description': scope.description
    }))
  );
  showDialog(action === 'export' ? 'اختر محتوى ملف PDF' : 'اختر محتوى الطباعة',
    el('div', { class: 'print-scope-dialog' },
      el('p', { text: 'سيُنشأ مستند مستقل ومنظم؛ لن تُطبع واجهة الهاتف.' }),
      list,
      action === 'export'
        ? el('small', { text: 'على iPhone: من شاشة الطباعة اختر مشاركة، ثم «حفظ في الملفات».' })
        : null
    )
  );
}

export function bookActions(data, context, label = 'المحتوى') {
  return el('div', { class: 'document-actions no-print', 'aria-label': `خيارات ${label}` },
    button('طباعة', {
      className: 'document-action primary',
      onClick: () => chooseScope(data, context, 'print')
    }),
    button('تصدير PDF', {
      variant: 'secondary',
      className: 'document-action',
      onClick: () => chooseScope(data, context, 'export')
    })
  );
}
