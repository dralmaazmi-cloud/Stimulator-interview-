import { get, completedLessons, markLesson, saveChecklist } from './storage.js';
import { renderSelfIntroLauncher } from './self-intro.js';
import { renderInlineQuestion } from './competencies.js';
import { bookActions } from './print-book.js';
import { renderBudgetPanel } from './practice-a4.js';
import { rateCard, reviewStatus } from './practice-a5.js';
import { FRAMEWORKS, readStore, rich, u2PracticeMastered, writeStore } from './practice-core.js';
import {
  bindExclusiveAccordions, button, clear, el, icon, notice, renderBlock, tag, toast
} from './ui.js';

const LESSON_DESCRIPTIONS = Object.freeze({
  U1: 'تعرّف إلى هدف المقابلة، وطريقة إدارتها، وما الذي تبحث عنه لجنة التقييم.',
  U2: 'استخدم أطر الإجابة المعتمدة لبناء إجابات واضحة، منظمة ومؤثرة.',
  U3: 'تعلّم الكفاءات القيادية الثماني وتدرّب على أسئلتها المعتمدة.',
  U4: 'ستة مبادئ تظهر في إجاباتك وسلوكك دون أن تُسأل عنها مباشرة.',
  U5: 'مراجعة عملية وسريعة قبل الانتقال إلى المحاكاة.'
});

const LESSON_TONES = ['blue', 'mint', 'sand', 'rose', 'violet'];

export function cleanupLearn() {
  // لا توجد مستمعات دائمة خارج عناصر الصفحة.
}

const CARD_DESCRIPTIONS = Object.freeze({
  U1: 'افهم ما الذي تقيسه المقابلة وكيف يحكم المقابِل',
  U2: 'تعلّم STAR-L وSEAL وتدرّب عليهما',
  U4: 'ستة مبادئ تظهر في إجاباتك من غير أن تُسأل عنها مباشرة'
});

// تقدير زمني [EST] يُضبط مع متعلمين حقيقيين.
const TIME_HINTS = Object.freeze({
  U1: 'نحو 8 دقائق',
  U2: 'نحو 15 دقيقة مع التدريبات',
  U4: 'نحو 10 دقائق',
  U5: 'نحو 5 دقائق'
});

const PATH_STEPS = Object.freeze([
  ['افهم المقابلة', '#/preparation/U1'],
  ['ابنِ إجابتك', '#/preparation/U2'],
  ['تعرّف إلى الكفاءات', '#/competencies'],
  ['جاهزية أخيرة', '#/preparation/U5'],
  ['جرّب المحاكاة', '#/simulation']
]);

function preparationCard(lesson, completed) {
  const href = lesson.id === 'U3' ? '#/competencies' : `#/preparation/${lesson.id}`;
  const meta = [lesson.id === 'U4' ? 'تعمّق، يمكن تأجيله إلى ما بعد أول محاكاة' : null, TIME_HINTS[lesson.id]].filter(Boolean);
  return el('a', { class: `preparation-card card ${completed ? 'completed' : ''}`, href },
    el('span', { class: `preparation-icon tone-${lesson.number}` }, icon(lesson.icon || 'book')),
    el('div', { class: 'unit-copy' },
      el('h2', { text: `${lesson.number}. ${lesson.title}` }),
      el('p', {}, ...rich(CARD_DESCRIPTIONS[lesson.id] || LESSON_DESCRIPTIONS[lesson.id] || lesson.subtitle)),
      meta.length ? el('small', { class: 'preparation-meta', text: meta.join(' · ') }) : null
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

function practiceEntry(href, iconName, title, description) {
  return el('a', { class: 'preparation-card card practice-entry', href },
    el('span', { class: 'preparation-icon' }, icon(iconName)),
    el('div', { class: 'unit-copy' }, el('h2', { text: title }), el('p', {}, ...rich(description))),
    el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
  );
}

function pathSection() {
  return el('nav', { class: 'path-section', 'aria-label': 'مسارك المقترح' },
    el('h2', { text: 'مسارك المقترح' }),
    el('ol', { class: 'path-chips' }, ...PATH_STEPS.map(([label, href], index) =>
      el('li', {}, el('a', { class: 'path-chip', href }, el('b', { 'aria-hidden': 'true', text: String(index + 1) }), label))))
  );
}

function expressCard() {
  return el('section', { class: 'express-card card', 'aria-label': 'مسار سريع' },
    el('h2', { text: 'عندك 10 دقائق؟' }),
    el('p', { text: 'راجع البطاقات وجرّب تمرين اختيار الإطار.' }),
    el('div', { class: 'practice-actions' },
      button('راجع البطاقات', { href: '#/practice/a5' }),
      button('اختر الإطار', { href: '#/practice/a2', variant: 'secondary' }),
      button('كل التمارين', { href: '#/practice', variant: 'ghost' })
    )
  );
}

export async function renderLearnIndex(root, data) {
  cleanupLearn();
  clear(root);
  const completed = await completedLessons();
  const last = readStore('path', null)?.last;
  const resume = last && last !== 'U3' && data.lessonById.has(last) ? last : null;
  root.append(el('section', { class: 'preparation-overview' },
    el('div', { class: 'preparation-lead' },
      el('span', { class: 'preparation-lead-icon' }, icon('book')),
      el('h1', { text: 'تعلّم، طبّق، واستعد بثقة' }),
      el('p', { text: 'مسار قصير يبدأ بفهم المقابلة وينتهي بالمحاكاة. تقدّم بالترتيب، أو اذهب مباشرة إلى ما تحتاجه.' }),
      resume ? button('تابع من حيث توقفت', { href: `#/preparation/${resume}`, variant: 'secondary', className: 'resume-button' }) : null
    ),
    expressCard(),
    pathSection(),
    el('div', { class: 'preparation-grid', dataset: completed.size > 0 ? { ready: 'true' } : undefined },
      ...data.lessons.map(lesson => preparationCard(lesson, completed.has(lesson.id) || (lesson.id === 'U2' && u2PracticeMastered()))),
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
      id: `${options.idKey || storageKey}-${section.number.replace('.', '-')}`
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

function firstClause(text) {
  const clean = String(text || '').trim();
  const colon = clean.indexOf(':');
  return colon > 0 ? `${clean.slice(0, colon).trim()}.` : clean;
}

function frameworkExplorer(reference) {
  const star = reference.part_2_answering.sections.find(section => section.number === '2.1');
  const seal = reference.part_2_answering.sections.find(section => section.number === '2.2');
  const explorer = el('section', { class: 'framework-explorer card' });
  const switcher = el('div', { class: 'framework-switcher', role: 'group', 'aria-label': 'اختر بناء الإجابة' });
  const content = el('div', { class: 'framework-content' });

  const draw = (type, section) => {
    [...switcher.children].forEach(control => {
      const active = control.dataset.type === type;
      control.classList.toggle('active', active);
      control.setAttribute('aria-pressed', String(active));
    });
    const framework = type === 'STAR-L' ? FRAMEWORKS.star_l : FRAMEWORKS.seal;
    const rows = frameworkRows(section);
    const items = el('div', { class: `framework-steps ${type.toLowerCase().replace('-', '')}` });
    rows.forEach(([code, description], index) => {
      const [letter, english = ''] = String(code).split('\n');
      const [title, ...rest] = String(description).split(' — ');
      // التسمية القياسية في الواجهة من الإطار؛ ونص المرجع كما هو في السطر الثاني.
      items.append(el('article', { class: `framework-step step-${index + 1}` },
        el('span', { class: 'framework-letter', text: letter }),
        el('div', {},
          el('strong', { text: framework.labels[letter] || title || english }),
          el('p', { text: rest.join(' — ') || description })
        )
      ));
    });
    const lead = type === 'STAR-L'
      ? 'يُستخدم لتقييم المواقف الحقيقية.'
      : firstClause(section.blocks.find(block => block.type === 'paragraph')?.text || '');
    const share = type === 'STAR-L'
      ? el('div', { class: 'framework-share' },
        el('p', { class: 'framework-share-label', text: 'الإجراء هو الجزء الأكبر من إجابتك (نحو 70%)' }),
        el('div', { class: 'framework-share-bar', role: 'img', 'aria-label': 'الإجراء نحو 70% من الإجابة' }, el('i', { style: { inlineSize: '70%' } })),
        el('p', { class: 'framework-share-caption', text: 'قل «أنا فعلت» لا «نحن فعلنا».' }))
      : el('div', { class: 'framework-share' },
        el('p', { class: 'framework-share-caption', text: 'التقييم هو أهم عنصر: حلّل الخيارات والمخاطر قبل أن تقرر.' }));
    content.replaceChildren(
      el('div', { class: 'framework-heading' },
        el('div', {}, el('small', { text: 'البناء المختار' }), el('h2', {}, 'نموذج ', el('bdi', { dir: 'ltr', text: type }))),
        el('p', { text: lead })
      ),
      items,
      share
    );
  };

  [['STAR-L', star, 'competencies', 'للمواقف الحقيقية والإنجازات'], ['SEAL', seal, 'answer', 'للسيناريوهات والقرارات المستقبلية']]
    .forEach(([type, section, iconName, subtitle], index) => {
      const control = el('button', { type: 'button', class: index === 0 ? 'active' : '', 'aria-pressed': String(index === 0), dataset: { type } },
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

function decisionCard() {
  return el('section', { class: 'decision-card card', 'aria-label': 'كيف تختار البناء؟' },
    el('h2', { text: 'كيف تختار البناء؟' }),
    el('ul', {},
      el('li', {}, el('span', { text: 'هل يطلب السؤال قصة حدثت لك؟' }), el('b', {}, el('bdi', { dir: 'ltr', text: 'STAR-L' }))),
      el('li', {}, el('span', { text: 'هل يضعك في موقف افتراضي ويسألك ماذا ستفعل؟' }), el('b', {}, el('bdi', { dir: 'ltr', text: 'SEAL' })))
    )
  );
}

function compareStrip() {
  const rows = [
    ['نوع السؤال', 'سلوكي', 'سيناريو'],
    ['الزمن', 'الماضي', 'افتراضي'],
    ['من أين تأتي القصة', 'من خبرتك', 'من نص السؤال'],
    ['أهم عنصر', 'الإجراء', 'التقييم'],
    ['ماذا يثبت', 'ما فعلته', 'كيف تفكّر وتقرر']
  ];
  return el('section', { class: 'compare-strip card', 'aria-label': 'مقارنة بين النوعين' },
    el('h2', { text: 'قارن بين النوعين' }),
    el('table', { class: 'compare-table' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: '' }), el('th', { scope: 'col' }, el('bdi', { dir: 'ltr', text: 'STAR-L' })), el('th', { scope: 'col' }, el('bdi', { dir: 'ltr', text: 'SEAL' })))),
      el('tbody', {}, ...rows.map(([label, a, b]) => el('tr', {}, el('th', { scope: 'row', text: label }), el('td', { text: a }), el('td', { text: b }))))
    )
  );
}

function practiceEntries() {
  return [
    el('section', { class: 'practice-entries', 'aria-label': 'شاهد ثم درّب نفسك' },
      el('div', { class: 'section-heading smart-section-heading' }, el('div', {}, el('small', { text: 'تعلّم بالممارسة' }), el('h2', { text: 'شاهد إجابة كاملة' }))),
      practiceEntry('#/practice/a3', 'book', 'شاهد إجابة كاملة', 'تابع إجابة نموذجية جزءًا جزءًا، ثم أكمل الخطوة التالية بنفسك.'),
      el('div', { class: 'section-heading smart-section-heading' }, el('div', {}, el('h2', { text: 'درّب نفسك على العناصر' }))),
      practiceEntry('#/practice/a1', 'answer', 'ورشة العناصر', 'رتّب عناصر STAR-L وSEAL، أو اكتشف العنصر الناقص.'),
      el('div', { class: 'section-heading smart-section-heading' }, el('div', {}, el('h2', { text: 'أي بناء أستخدم؟' }))),
      practiceEntry('#/practice/a2', 'decision', 'أي بناء أستخدم؟', 'ميّز بين السؤال السلوكي وسؤال السيناريو.')
    )
  ];
}

const TWO_TYPES = Object.freeze([
  ['سؤال سلوكي', '«أخبرني عن موقف قُدت فيه فريقًا خلال ضغط عالٍ.»', 'موقف حدث فعلًا', 'STAR-L'],
  ['سؤال سيناريو', '«كيف ستقود فريقًا يعاني من انخفاض معنويات؟»', 'موقف افتراضي', 'SEAL']
]);

function ideaInThreeSentences() {
  return el('section', { class: 'idea-card card', 'aria-label': 'الفكرة في ثلاث جمل' },
    el('h2', { text: 'الفكرة في ثلاث جمل' }),
    el('ol', {},
      el('li', { text: 'المقابلة المبنية على الكفاءات تسأل عمّا فعلته فعلًا، لا عمّا تعرفه فقط.' }),
      el('li', { text: 'السلوك السابق مؤشر قوي على السلوك المستقبلي.' }),
      el('li', { text: 'يبحث المقابِل عن: ماذا فعلت؟ كيف؟ لماذا؟ ما النتيجة؟ ماذا تعلّمت؟' })
    )
  );
}

function twoTypesPanel() {
  return el('section', { class: 'two-types card', 'aria-label': 'نوعا الأسئلة' },
    el('h2', { text: 'نوعان من الأسئلة' }),
    el('div', { class: 'two-types-grid' }, ...TWO_TYPES.map(([title, example, kind, framework]) =>
      el('article', {}, el('strong', { text: title }), el('p', { text: example }), el('small', {}, kind, ' · يُجاب بـ ', el('bdi', { dir: 'ltr', text: framework }))))),
    button('جرّب تمييزهما', { href: '#/practice/a2?n=4', variant: 'secondary' })
  );
}

function renderUnderstand(body, data, lesson) {
  body.append(
    el('div', { class: 'learning-progress no-print' },
      ...['افهم المقابلة', 'جهّز إجابتك', 'تدرّب', 'نصائح أخيرة'].map((label, index) =>
        el('span', { class: index === 0 ? 'active' : '' }, el('b', { text: String(index + 1) }), el('small', { text: label }))
      )
    ),
    lessonHero(lesson, { icon: 'book' }),
    ideaInThreeSentences(),
    twoTypesPanel(),
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
  const bySection = new Map(data.reference.part_2_answering.sections.map(section => [section.number, section]));
  const pick = numbers => numbers.map(number => bySection.get(number)).filter(Boolean);
  const subtitles = { '2.5': 'خمسة أسئلة في ذهنه', '2.4': 'سبعة أخطاء تتجنبها', '2.3': 'التفاصيل' };
  const enhance = (accordionBody, section) => {
    if (section.number !== '2.5') return;
    // البند 9: الجملة المفتاحية فوق الجدول، مع تنبيه يمنع الربط الحرفي بحروف STAR-L.
    const keyPoint = accordionBody.querySelector('.block-key_point');
    const table = accordionBody.querySelector('.block-table');
    if (keyPoint && table) table.before(keyPoint);
    const caption = el('p', { class: 'practice-helper', text: 'هذه العناصر الخمسة هي ما يسأل عنه المقابِل، وليست مطابقة حرفًا بحرف لحروف STAR-L.' });
    (table || accordionBody).after(caption);
  };
  body.append(
    lessonHero(lesson, { tone: 'petrol', icon: 'answer', kicker: 'منهجية الإجابة المهنية' }),
    decisionCard(),
    frameworkExplorer(data.reference),
    compareStrip(),
    ...practiceEntries(),
    el('div', { class: 'section-heading smart-section-heading' },
      el('div', {}, el('small', { text: 'دليل الاحتراف' }), el('h2', { text: 'حوّل البناء إلى إجابة مقنعة' }))
    ),
    sourceAccordion(pick(['2.5', '2.4', '2.3']), 'answer-building', {
      icons: ['target', 'problem', 'readiness'],
      subtitleTransform: section => subtitles[section.number] || '',
      enhance
    }),
    el('div', { class: 'section-heading smart-section-heading' }, el('div', {}, el('h2', { text: 'للتعمق' }))),
    sourceAccordion(pick(['2.6', '2.7']), 'answer-building-deep', {
      idKey: 'answer-building',
      icons: ['communication', 'leadership']
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
    content.append(principleCheck(principle));
    details.append(content);
    principleGroup.append(details);
  });

  body.append(
    lessonHero(lesson, { icon: 'flag', kicker: 'فلسفة قيادية عملية' }),
    notice('المبادئ لا تُقيَّم عبر سؤال مباشر. يراها المقابِل في إجاباتك: كيف تمكّن فريقك، وتوضّح القصد، وتدير المخاطر، وتقود حين يغيب التوجيه المباشر.', '', 'ⓘ'),
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
    bindExclusiveAccordions(principleGroup, 'mission-command'),
    el('div', { class: 'practice-actions no-print' }, button('راجع المبادئ الستة', { href: '#/practice/a5?deck=mission', variant: 'secondary' }))
  );
}

// S6: تقييم ذاتي سريع لكل مبدأ يغذّي بطاقات الاسترجاع (A5).
function principleCheck(principle) {
  const note = el('small', { class: 'practice-helper', role: 'status' });
  const group = el('div', { class: 'principle-check no-print', role: 'group', 'aria-label': `تحقق من فهمك: ${principle.title}` });
  [['أستطيع شرح هذا المبدأ بجملة', true], ['أحتاج مراجعة', false]].forEach(([text, known]) => {
    const choice = el('button', { type: 'button', class: 'selfcheck-choice', 'aria-pressed': 'false' }, text);
    choice.addEventListener('click', () => {
      rateCard(`mission:${principle.id}`, known);
      [...group.children].forEach(item => {
        item.setAttribute('aria-pressed', String(item === choice));
        item.classList.toggle('active', item === choice);
      });
      note.textContent = known ? '✓ حُفظ تقييمك على هذا الجهاز.' : 'ستظهر لك بطاقة هذا المبدأ في المراجعة قريبًا.';
    });
    group.append(choice);
  });
  return el('div', { class: 'principle-check-wrap' }, el('h3', { text: 'تحقق من فهمك' }), group, note);
}

async function readinessAccordion(data) {
  const sections = data.reference.part_6_preparation.sections;
  return sourceAccordion(sections, 'final-readiness', {
    icons: ['book', 'interview', 'leadership', 'microphone', 'communication'],
    enhance: (body, section) => {
      if (section.number === '6.1') {
        renderChecklist(body, section);
        body.append(
          el('p', { class: 'practice-helper', text: 'اختر قصة أو قصتين على الأقل لكل كفاءة، ثم تدرّب على قولها بصوتك.' }),
          el('a', { class: 'practice-link', href: '#/competencies' }, 'افتح الكفاءات'));
      }
      if (section.number === '6.3') body.append(renderBudgetPanel(), renderSelfIntroLauncher());
      if (section.number === '6.4') body.append(rehearsalRoutine());
    }
  });
}

function rehearsalRoutine() {
  return el('section', { class: 'rehearsal-card card no-print', 'aria-label': 'روتين بروفة قصير' },
    el('h3', { text: 'روتين من ثلاث خطوات' }),
    el('ol', {},
      el('li', { text: 'أجب بصوت مرتفع.' }),
      el('li', { text: 'سجّل نفسك.' }),
      el('li', { text: 'راجع: هل غاب عنصر من STAR-L؟' })),
    button('ابدأ بروفة', { href: '#/simulation' })
  );
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
  const completed = await completedLessons();
  const done = data.lessons.filter(item => completed.has(item.id)).length;
  const review = reviewStatus(data);
  body.append(
    lessonHero(lesson, { tone: 'petrol readiness', icon: 'checklist', kicker: 'مراجعة سريعة قبل المحاكاة' }),
    el('p', { class: 'readiness-progress no-print' }, 'أنجزت ', el('bdi', { text: String(done) }), ' من ', el('bdi', { text: String(data.lessons.length) }), ' محطات.'),
    await readinessAccordion(data),
    renderAiQuestions(data, params),
    review.started && review.due > 0
      ? el('a', { class: 'practice-link no-print', href: '#/practice/a5?deck=due' }, `لديك ${review.due} بطاقة مستحقة للمراجعة قبل المحاكاة.`)
      : document.createDocumentFragment(),
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
  writeStore('path', { last: lesson.id, at: new Date().toISOString() });
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
