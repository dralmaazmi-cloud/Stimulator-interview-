import { get, completedLessons, markLesson, saveChecklist } from './storage.js';
import { renderSelfIntroLauncher } from './self-intro.js';
import { renderInlineQuestion } from './competencies.js';
import { bookActions } from './print-book.js';
import {
  bindExclusiveAccordions, button, clear, el, icon, renderBlock, tag, toast
} from './ui.js';

const LESSON_DESCRIPTIONS = Object.freeze({
  U1: 'تعرّف إلى هدف المقابلة، وطريقة إدارتها، وما الذي تبحث عنه لجنة التقييم.',
  U2: 'استخدم أطر الإجابة المعتمدة لبناء إجابات واضحة، منظمة ومؤثرة.',
  U3: 'تعلّم الكفاءات القيادية الثماني وتدرّب على أسئلتها المعتمدة.',
  U4: 'حوّل القصد إلى نتائج من خلال الثقة، والتمكين، والقرار في الوقت المناسب.',
  U5: 'مراجعة عملية وسريعة قبل الانتقال إلى المحاكاة.'
});

const LESSON_TONES = ['blue', 'mint', 'sand', 'rose', 'violet'];

export function cleanupLearn() {
  // لا توجد مستمعات دائمة خارج عناصر الصفحة.
}

function preparationCard(lesson, completed) {
  const href = lesson.id === 'U3' ? '#/competencies' : `#/preparation/${lesson.id}`;
  return el('a', { class: `preparation-card card ${completed ? 'completed' : ''}`, href },
    el('span', { class: `preparation-icon tone-${lesson.number}` }, icon(lesson.icon || 'book')),
    el('div', { class: 'unit-copy' },
      el('h2', { text: `${lesson.number}. ${lesson.title}` }),
      el('p', { text: LESSON_DESCRIPTIONS[lesson.id] || lesson.subtitle })
    ),
    completed ? el('span', { class: 'completion-mark', 'aria-label': 'مكتمل', text: '✓' }) : null,
    el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
  );
}

function questionsPreparationCard() {
  return el('a', { class: 'preparation-card questions-preparation-card card', href: '#/questions' },
    el('span', { class: 'preparation-icon tone-questions' }, icon('answer')),
    el('div', { class: 'unit-copy' },
      el('small', { text: 'تدريب تفاعلي' }),
      el('h2', { text: 'الأسئلة' }),
      el('p', { text: 'تصفّح حسب الكفاءة أو النوع، وانتقل بين الأسئلة كبطاقات ذكية.' })
    ),
    el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
  );
}

export async function renderLearnIndex(root, data) {
  cleanupLearn();
  clear(root);
  const completed = await completedLessons();
  root.append(el('section', { class: 'preparation-overview' },
    el('div', { class: 'preparation-lead' },
      el('span', { class: 'preparation-lead-icon' }, icon('book')),
      el('h1', { text: 'تعلّم، طبّق، واستعد بثقة' }),
      el('p', { text: 'محطات تعليمية واضحة، يليها قسم تفاعلي للتدرّب على الأسئلة.' })
    ),
    el('div', { class: 'preparation-grid', dataset: completed.size > 0 ? { ready: 'true' } : undefined },
      ...data.lessons.map(lesson => preparationCard(lesson, completed.has(lesson.id))),
      questionsPreparationCard()
    ),
    bookActions(data, { type: 'preparation' }, 'دليل التحضير الكامل')
  ));
}

function lessonHero(lesson, options = {}) {
  return el('section', { class: `lesson-hero ${options.tone || ''}` },
    el('span', { class: 'lesson-hero-icon' }, icon(options.icon || lesson.icon || 'book')),
    el('div', {},
      options.kicker ? el('small', { text: options.kicker }) : null,
      el('h1', { text: lesson.title }),
      el('p', { text: options.description || LESSON_DESCRIPTIONS[lesson.id] })
    )
  );
}

function sourceAccordion(sections, storageKey, options = {}) {
  const group = el('section', { class: `smart-accordion ${options.className || ''}`, 'aria-label': options.label || 'موضوعات الدرس' });
  sections.forEach((section, index) => {
    const details = el('details', {
      class: `smart-accordion-item tone-${LESSON_TONES[index % LESSON_TONES.length]}`,
      id: `${storageKey}-${section.number.replace('.', '-')}`
    });
    const summary = el('summary', {},
      el('span', { class: 'accordion-icon' }, icon(options.icons?.[index] || 'book')),
      el('span', { class: 'accordion-copy' },
        el('strong', { text: options.titleTransform ? options.titleTransform(section) : section.title }),
        options.subtitleTransform ? el('small', { text: options.subtitleTransform(section) }) : null
      ),
      el('i', { class: 'accordion-chevron', 'aria-hidden': 'true', text: '⌄' })
    );
    const body = el('div', { class: 'smart-accordion-body' });
    (section.blocks || []).forEach(block => body.append(renderBlock(block)));
    if (options.enhance) options.enhance(body, section, index);
    details.append(summary, body);
    group.append(details);
  });
  return bindExclusiveAccordions(group, storageKey);
}

function finishLesson(lesson) {
  return el('div', { class: 'lesson-finish no-print' },
    button('وضع علامة مكتمل', {
      className: 'wide',
      onClick: async event => {
        await markLesson(lesson.id, true);
        event.currentTarget.textContent = 'تم إكمال المحطة ✓';
        event.currentTarget.disabled = true;
        toast('تم حفظ تقدمك على هذا الجهاز.');
      }
    })
  );
}

function frameworkRows(section) {
  return section?.blocks?.find(block => block.type === 'table')?.rows || [];
}

function frameworkExplorer(reference) {
  const star = reference.part_2_answering.sections.find(section => section.number === '2.1');
  const seal = reference.part_2_answering.sections.find(section => section.number === '2.2');
  const explorer = el('section', { class: 'framework-explorer card' });
  const switcher = el('div', { class: 'framework-switcher', role: 'group', 'aria-label': 'اختر بناء الإجابة' });
  const content = el('div', { class: 'framework-content' });

  const draw = (type, section) => {
    [...switcher.children].forEach(control => control.classList.toggle('active', control.dataset.type === type));
    const rows = frameworkRows(section);
    const items = el('div', { class: `framework-steps ${type.toLowerCase().replace('-', '')}` });
    rows.forEach(([code, description], index) => {
      const [letter, english = ''] = String(code).split('\n');
      const [title, ...rest] = String(description).split(' — ');
      items.append(el('article', { class: `framework-step step-${index + 1}` },
        el('span', { class: 'framework-letter', text: letter }),
        el('div', {},
          el('strong', { text: title || english }),
          el('p', { text: rest.join(' — ') || description })
        )
      ));
    });
    content.replaceChildren(
      el('div', { class: 'framework-heading' },
        el('div', {}, el('small', { text: 'البناء المختار' }), el('h2', { text: `نموذج ${type}` })),
        el('p', { text: section.blocks.find(block => block.type === 'paragraph')?.text || '' })
      ),
      items
    );
  };

  [['STAR-L', star, 'competencies', 'للمواقف الحقيقية والإنجازات'], ['SEAL', seal, 'answer', 'للسيناريوهات والقرارات المستقبلية']]
    .forEach(([type, section, iconName, subtitle], index) => {
      const control = el('button', { type: 'button', class: index === 0 ? 'active' : '', dataset: { type } },
        el('span', {}, icon(iconName)),
        el('strong', { text: type }),
        el('small', { text: subtitle })
      );
      control.addEventListener('click', () => draw(type, section));
      switcher.append(control);
    });
  explorer.append(el('h2', { class: 'section-title', text: 'اختر البناء المناسب' }), switcher, content);
  draw('STAR-L', star);
  return explorer;
}

function renderUnderstand(body, data, lesson) {
  body.append(
    el('div', { class: 'learning-progress no-print' },
      ...['افهم المقابلة', 'جهّز إجابتك', 'تدرّب', 'نصائح أخيرة'].map((label, index) =>
        el('span', { class: index === 0 ? 'active' : '' }, el('b', { text: String(index + 1) }), el('small', { text: label }))
      )
    ),
    lessonHero(lesson, { icon: 'book' }),
    sourceAccordion(data.reference.part_1_framework.sections, 'understand', {
      label: 'محاور فهم المقابلة',
      icons: ['target', 'book', 'microphone', 'communication', 'leadership']
    }),
    el('aside', { class: 'reading-tip' },
      el('span', {}, icon('problem')),
      el('div', {}, el('small', { text: 'نصيحة عملية' }), el('p', { text: 'اربط كل مفهوم بخبرة حقيقية من عملك؛ فالوضوح والصدق أقوى من الإجابات المحفوظة.' }))
    )
  );
}

function renderAnswerBuilding(body, data, lesson) {
  const sections = data.reference.part_2_answering.sections.filter(section => !['2.1', '2.2'].includes(section.number));
  body.append(
    lessonHero(lesson, { tone: 'petrol', icon: 'answer', kicker: 'منهجية الإجابة المهنية' }),
    frameworkExplorer(data.reference),
    el('div', { class: 'section-heading smart-section-heading' },
      el('div', {}, el('small', { text: 'دليل الاحتراف' }), el('h2', { text: 'حوّل البناء إلى إجابة مقنعة' }))
    ),
    sourceAccordion(sections, 'answer-building', {
      icons: ['readiness', 'problem', 'target', 'communication', 'leadership']
    })
  );
}

function renderMission(body, data, lesson, params = new URLSearchParams()) {
  const source = data.reference.part_4_mission_command;
  const requestedQuestion = params.get('question');
  const principleGroup = el('section', { class: 'smart-accordion mission-accordion', 'aria-label': 'مبادئ قيادة المهمة' });
  source.principles.forEach((principle, index) => {
    const questionIds = data.missionMap.find(item => item.principle_id === principle.id)?.question_ids || [];
    const questions = questionIds.map(id => data.questionById.get(id)).filter(Boolean);
    const requestedHere = questions.some(question => question.id === requestedQuestion);
    const details = el('details', { class: `smart-accordion-item tone-${LESSON_TONES[index % LESSON_TONES.length]}`, id: `mission-${principle.id}`, open: requestedHere },
      el('summary', {},
        el('span', { class: 'accordion-number', text: String(index + 1) }),
        el('span', { class: 'accordion-copy' }, el('strong', { text: principle.title }), el('small', { text: `${questions.length} سؤال للتطبيق` })),
        el('i', { class: 'accordion-chevron', 'aria-hidden': 'true', text: '⌄' })
      )
    );
    const content = el('div', { class: 'smart-accordion-body' },
      el('p', { text: principle.description }),
      el('h3', { text: 'الكفاءات المرتبطة' }),
      el('div', { class: 'question-meta' }, ...principle.linked_competencies.map(name => tag(name, 'accent')))
    );
    if (questions.length) {
      const list = el('div', { class: 'smart-question-list mission-question-list' },
        ...questions.map((question, questionIndex) => renderInlineQuestion(question, data, questionIndex, {
          returnHash: `#/preparation/U4?question=${encodeURIComponent(question.id)}`
        }))
      );
      list.querySelectorAll('details').forEach(item => item.addEventListener('toggle', () => {
        if (!item.open) return;
        list.querySelectorAll('details[open]').forEach(other => { if (other !== item) other.open = false; });
      }));
      content.append(el('h3', { text: 'تدرّب على المبدأ' }), list);
    }
    details.append(content);
    principleGroup.append(details);
  });

  body.append(
    lessonHero(lesson, { icon: 'flag', kicker: 'فلسفة قيادية عملية' }),
    el('section', { class: 'mission-introduction card' },
      el('span', { class: 'mission-illustration' }, icon('flag')),
      el('div', {},
        el('h2', { text: source.title }),
        ...source.intro.map(block => renderBlock(block))
      )
    ),
    el('div', { class: 'section-heading smart-section-heading' },
      el('div', {}, el('small', { text: 'ستة مبادئ' }), el('h2', { text: 'افهم المبدأ ثم اربطه بسلوكك' }))
    ),
    bindExclusiveAccordions(principleGroup, 'mission-command')
  );
}

async function readinessAccordion(data) {
  const sections = data.reference.part_6_preparation.sections;
  return sourceAccordion(sections, 'final-readiness', {
    icons: ['book', 'interview', 'leadership', 'microphone', 'communication'],
    enhance: (body, section) => {
      if (section.number === '6.1') renderChecklist(body, section);
      if (section.number === '6.3') body.append(renderSelfIntroLauncher());
    }
  });
}

async function renderChecklist(host, section) {
  const saved = await get('checklists', 'preparation-6.1');
  const items = section.blocks.find(block => block.type === 'list')?.items || [];
  const checklist = el('div', { class: 'readiness-checklist no-print' });
  items.forEach((text, index) => {
    const input = el('input', { type: 'checkbox', checked: saved?.checked?.includes(index) });
    input.addEventListener('change', async () => {
      const checked = [...checklist.querySelectorAll('input')]
        .map((item, itemIndex) => item.checked ? itemIndex : null).filter(item => item != null);
      await saveChecklist('preparation-6.1', checked);
    });
    checklist.append(el('label', { class: 'readiness-check-item' }, input, el('span', { text })));
  });
  host.append(checklist);
}

// alpha-5 (C1): سؤالا الذكاء الاصطناعي (X1، X2) ببطاقتين تحت بند «أسئلة الذكاء الاصطناعي» بعنوان «إجابة الدليل».
function renderAiQuestions(data, params = new URLSearchParams()) {
  const questions = ['X1', 'X2'].map(id => data.questionById.get(id)).filter(Boolean);
  if (!questions.length) return null;
  const requested = params.get('question');
  return el('section', { class: 'ai-questions-section section-block', 'aria-label': 'أسئلة الذكاء الاصطناعي' },
    el('div', { class: 'section-heading smart-section-heading' },
      el('div', {}, el('small', { text: 'سؤالان معرفيان من الدليل' }), el('h2', { text: 'أسئلة الذكاء الاصطناعي' }))
    ),
    el('p', { class: 'section-intro', text: 'افتح كل سؤال في صفحة تركيز مستقلة، ثم راجع إجابة الدليل بعد أن تكوّن إجابتك.' }),
    el('div', { class: 'smart-question-list ai-question-grid' },
      ...questions.map((question, index) => renderInlineQuestion(question, data, index, {
        returnHash: `#/preparation/U5?question=${encodeURIComponent(question.id)}`
      }))
    )
  );
}

async function renderReadiness(body, data, lesson, params = new URLSearchParams()) {
  body.append(
    lessonHero(lesson, { tone: 'petrol readiness', icon: 'checklist', kicker: 'مراجعة سريعة قبل المحاكاة' }),
    await readinessAccordion(data),
    renderAiQuestions(data, params),
    el('section', { class: 'ready-callout card no-print' },
      el('span', {}, icon('readiness')),
      el('div', {}, el('h2', { text: 'أنت جاهز للانتقال إلى المحاكاة' }), el('p', { text: 'طبّق ما راجعته في مقابلة تدريبية واحصل على تقرير تطوير مفصل.' })),
      button('ابدأ المحاكاة', { href: '#/simulation', className: 'wide' })
    )
  );
}

export async function renderLesson(root, data, lessonId, params = new URLSearchParams()) {
  cleanupLearn();
  const lesson = data.lessonById.get(lessonId);
  if (!lesson) {
    clear(root).append(el('section', { class: 'card empty-state' }, el('h1', { text: 'الدرس غير موجود' })));
    return;
  }
  if (lesson.id === 'U3') {
    location.hash = '#/competencies';
    return;
  }

  clear(root);
  const body = el('article', { class: `professional-lesson lesson-${lesson.id.toLowerCase()}` });
  if (lesson.id === 'U1') renderUnderstand(body, data, lesson);
  if (lesson.id === 'U2') renderAnswerBuilding(body, data, lesson);
  if (lesson.id === 'U4') renderMission(body, data, lesson, params);
  if (lesson.id === 'U5') await renderReadiness(body, data, lesson, params);
  body.append(bookActions(data, { type: 'lesson', id: lesson.id }, lesson.title), finishLesson(lesson));
  root.append(body);
  const requestedQuestion = params.get('question');
  if (requestedQuestion) requestAnimationFrame(() => requestAnimationFrame(() => {
    const card = root.querySelector(`[data-question-id="${CSS.escape(requestedQuestion)}"]`);
    card?.classList.add('requested');
    card?.scrollIntoView({ block: 'center' });
  }));
}
