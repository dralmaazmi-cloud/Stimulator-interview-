import { CONFIG } from './config.js';
import { getAll, get, set, completedLessons, markLesson, saveChecklist } from './storage.js';
import { renderSelfIntroLauncher } from './self-intro.js';
import { appendChildren, el, button, clear, notice, pageHead, renderBlock, renderSourceSection, tag, toast } from './ui.js';

export function cleanupLearn() {
  // Reserved for route cleanup. Phase one no longer records audio.
}

export async function renderLearnIndex(root, data) {
  cleanupLearn();
  clear(root);
  const completed = await completedLessons();
  const done = data.lessons.filter(lesson => completed.has(lesson.id)).length;
  root.append(
    pageHead('ابدأ من الوحدة الأولى', 'المسار التعليمي', 'ست وحدات مرتبة. اقرأ المحتوى، ثم استخدم تمارين الاختيارات القصيرة لتثبيت الفكرة.'),
    notice('المحتوى والأسئلة والإجابات محفوظة داخل التطبيق وتعمل دون اتصال بعد أول تحميل.', '', '✓')
  );
  const grid = el('div', { class: 'unit-path section-block' });
  data.lessons.forEach(lesson => {
    const count = Math.min(3, data.exercises.filter(exercise => exercise.lesson_id === lesson.id).length);
    grid.append(el('a', {
      class: `card unit-card ${completed.has(lesson.id) ? 'completed' : ''}`,
      href: `#/learn/${lesson.id}`
    },
    el('span', { class: 'unit-number', text: lesson.number }),
    el('div', { class: 'unit-copy' },
      el('h2', { text: lesson.title }),
      el('p', { text: lesson.subtitle }),
      el('small', { text: count ? `${count} تمارين اختيارية قصيرة` : 'قراءة وأداة تطبيقية' })
    ),
    el('span', { class: 'row-chevron', 'aria-hidden': 'true', text: '‹' })
    ));
  });
  root.append(grid, el('div', { class: 'notice section-block' },
    el('strong', { text: `${done}/${data.lessons.length}` }),
    el('p', { text: done === data.lessons.length ? 'أكملت المسار التعليمي كاملًا.' : 'يمكنك التنقل بحرية، ويُحفظ تقدمك على هذا الجهاز.' })
  ));
}

export async function renderLesson(root, data, lessonId, params = new URLSearchParams()) {
  cleanupLearn();
  const lesson = data.lessonById.get(lessonId);
  if (!lesson) {
    clear(root).append(notice('الدرس المطلوب غير موجود.', 'danger'));
    return;
  }
  clear(root);
  root.append(el('nav', { class: 'crumbs', 'aria-label': 'مسار الصفحة' },
    el('a', { href: '#/learn', text: 'التعلّم' }),
    el('span', { text: '←' }),
    el('span', { text: lesson.title })
  ));
  const completeAction = button('وضع علامة مكتمل', {
    variant: 'secondary small',
    onClick: async event => {
      await markLesson(lesson.id, true);
      event.currentTarget.textContent = 'تم إكمال الدرس ✓';
      event.currentTarget.disabled = true;
      toast('حُفظ تقدم الدرس على جهازك.');
    }
  });
  const progress = await get('progress', lesson.id);
  if (progress?.completed) {
    completeAction.textContent = 'تم إكمال الدرس ✓';
    completeAction.disabled = true;
  }
  root.append(pageHead(`الوحدة ${lesson.number} من ${data.lessons.length}`, lesson.title, lessonDescription(lesson.id), completeAction));

  const body = el('div', { class: 'lesson-body' });
  const outlineItems = [];
  if (lesson.id === 'U1') renderSourceSections(body, data.reference.part_1_framework.sections, outlineItems);
  if (lesson.id === 'U2') renderSourceSections(body, data.reference.part_2_answering.sections, outlineItems);
  if (lesson.id === 'U3') await renderSelfIntroductionUnit(body, data, outlineItems);
  if (lesson.id === 'U4') renderCompetencies(body, data, params, outlineItems);
  if (lesson.id === 'U5') renderMissionCommand(body, data, outlineItems);
  if (lesson.id === 'U6') await renderFinalReadiness(body, data, outlineItems);

  body.append(await renderExercises(data, lesson.id));
  body.append(el('div', { class: 'button-row no-print' },
    button('تم، أكملت هذا الدرس', {
      onClick: async () => {
        await markLesson(lesson.id, true);
        toast('أحسنت. تم حفظ تقدمك.');
        location.hash = '#/learn';
      }
    }),
    button('العودة إلى الوحدات', { href: '#/learn', variant: 'secondary' })
  ));

  const outline = el('aside', { class: 'lesson-aside card outline-card' }, el('h3', { text: 'في هذا الدرس' }));
  const outlineList = el('ul', { class: 'outline-list' });
  outlineItems.forEach(item => outlineList.append(el('li', {}, el('a', { href: `#${item.id}`, text: item.title }))));
  outline.append(outlineList);
  root.append(el('div', { class: 'lesson-layout' }, body, outline));
}

function lessonDescription(id) {
  return ({
    U1: 'افهم ما الذي تقيسه المقابلة، والفرق بين المعرفة والمهارة والسلوك والكفاءة.',
    U2: 'تعلّم STAR-L وSEAL، وافهم معايير الإجابة القوية والأخطاء وعقلية المقيّم.',
    U3: 'رتّب الماضي والحاضر والمستقبل، ثم أنشئ نسخة تناسب 60 أو 120 ثانية.',
    U4: 'تعرّف إلى كل كفاءة، وما يقيسه المقابل، وسلوكياتها وأسئلتها الأساسية.',
    U5: 'افهم المبادئ الستة وكيف تظهر ضمنيًا في سلوك القائد وقراراته.',
    U6: 'أكمل قائمة التحضير، وراجع الحضور المهني والأسئلة العامة الإضافية.'
  })[id];
}

function renderSourceSections(container, sections, outline) {
  sections.forEach(section => {
    container.append(renderSourceSection(section));
    outline.push({ id: `section-${section.number.replace('.', '-')}`, title: `${section.number} ${section.title}` });
  });
}

function renderCompetencies(container, data, params, outline) {
  const requested = params.get('competency');
  container.append(notice('اضغط على الكفاءة لعرض التعريف والسلوكيات والأسئلة. بطاقات المراجعة في نهاية الصفحة تعيد العناصر التي أخطأت فيها.', '', '✦'));
  data.competencies.forEach(competency => {
    const details = el('details', {
      class: 'card source-section',
      id: `competency-${competency.id}`,
      open: requested === competency.id || competency.id === 'C1'
    });
    details.append(el('summary', {},
      el('strong', { text: `${competency.id} — ${competency.name}` }),
      el('span', { class: 'source-page', text: `صفحة ${competency.pdf_page} في الدليل` })
    ));
    const content = el('div', { class: 'stack', style: { marginTop: '16px' } });
    content.append(el('div', {}, el('h3', { text: 'التعريف' }), el('p', { text: competency.definition })));
    content.append(el('details', { class: 'reveal' },
      el('summary', { text: 'عرض تعريف نسخة 2025 (V1)' }),
      el('div', { class: 'reveal-content' }, el('p', { text: competency.definition_v1_2025 }))
    ));
    content.append(listPanel('ما يقيسه المقابِل', competency.what_interviewer_measures));
    content.append(behaviourPanel('السلوكيات الداعمة', competency.supporting_behaviours, 'good'));
    content.append(competency.negative_behaviours.length
      ? behaviourPanel('السلوكيات السلبية', competency.negative_behaviours, 'bad')
      : notice('لا يحتوي المرجع على سلوكيات سلبية للكفاءة C1؛ تُعرض القائمة فارغة كما وردت.', 'warning'));
    const primaryIds = data.primaryIdsByCompetency.get(competency.id) || [];
    const questions = el('div', {}, el('h3', { text: `الأسئلة الأساسية (${primaryIds.length})` }));
    const qList = el('ol');
    primaryIds.forEach(id => {
      const question = data.questionById.get(id);
      qList.append(el('li', {}, el('a', { href: `#/bank/${id}`, text: question.display_question })));
    });
    questions.append(qList);
    content.append(questions);
    details.append(content);
    container.append(details);
    outline.push({ id: `competency-${competency.id}`, title: competency.name });
  });
  container.append(renderReviewCards(data));
  outline.push({ id: 'review-cards', title: 'بطاقات المراجعة' });
}

function listPanel(title, items) {
  return el('div', {}, el('h3', { text: title }), el('ul', {}, ...items.map(item => el('li', { text: item }))));
}

function behaviourPanel(title, items, kind) {
  return el('div', {}, el('h3', { text: title }), el('div', { class: 'question-meta' },
    ...items.map(item => tag(item.text, kind === 'good' ? 'accent' : 'warning'))
  ));
}

function renderReviewCards(data) {
  const section = el('section', { class: 'section-block', id: 'review-cards' },
    el('div', { class: 'section-heading' }, el('h2', { text: 'بطاقات مراجعة الكفاءات' }))
  );
  const grid = el('div', { class: 'review-cards' });
  data.competencies.forEach(competency => {
    const card = el('button', { class: 'flip-card', type: 'button', 'aria-expanded': 'false' },
      el('div', { class: 'front' },
        el('span', { class: 'question-id', text: competency.id }),
        el('h3', { text: competency.name }),
        el('p', { class: 'muted', text: 'اضغط لقلب البطاقة' })
      ),
      el('div', { class: 'back' },
        el('strong', { text: 'التعريف' }),
        el('p', { text: competency.definition }),
        el('div', { class: 'button-row' },
          button('أعرفها', { variant: 'small', onClick: event => reviewCard(event, competency.id, true) }),
          button('أراجعها لاحقًا', { variant: 'secondary small', onClick: event => reviewCard(event, competency.id, false) })
        )
      )
    );
    card.addEventListener('click', event => {
      if (event.target.closest('.button')) return;
      const flipped = card.classList.toggle('flipped');
      card.setAttribute('aria-expanded', String(flipped));
    });
    grid.append(card);
  });
  section.append(grid);
  return section;
}

async function reviewCard(event, competencyId, known) {
  event.stopPropagation();
  const prior = await get('review', `card-${competencyId}`);
  await set('review', {
    id: `card-${competencyId}`,
    competency_id: competencyId,
    correct_count: (prior?.correct_count || 0) + (known ? 1 : 0),
    wrong_count: (prior?.wrong_count || 0) + (known ? 0 : 1),
    review_again: !known,
    updated_at: new Date().toISOString()
  });
  toast(known ? 'سُجلت كبطاقة متقنة.' : 'ستظهر هذه البطاقة ضمن المراجعة مرة أخرى.');
}

function renderMissionCommand(container, data, outline) {
  const source = data.reference.part_4_mission_command;
  const intro = el('section', { class: 'card source-section', id: 'mission-intro' }, el('h2', { text: source.title }));
  source.intro.forEach(block => intro.append(renderBlock(block)));
  container.append(intro);
  outline.push({ id: 'mission-intro', title: source.title });
  source.principles.forEach(principle => {
    const section = el('section', { class: 'card source-section', id: `principle-${principle.id}` },
      el('h2', {}, el('small', { text: `${principle.id} — المبدأ ${principle.number}` }), document.createTextNode(principle.title)),
      el('p', { text: principle.description }),
      el('h3', { text: 'الكفاءات المرتبطة' }),
      el('div', { class: 'question-meta' }, ...principle.linked_competencies.map(name => tag(name, 'accent'))),
      missionQuestionFull(principle.scenario_question, 'سؤال السيناريو'),
      missionQuestionFull(principle.behavioural_question, 'السؤال السلوكي'),
      el('div', { class: 'source-page', text: `صفحة ${principle.pdf_page} في الدليل` })
    );
    container.append(section);
    outline.push({ id: `principle-${principle.id}`, title: principle.title });
  });
}

function missionQuestionFull(question, title) {
  const answer = el('details', { class: 'reveal' }, el('summary', { text: 'عرض نموذج الدليل' }));
  const answerBody = el('div', { class: 'reveal-content' });
  if (question.sample_answer) answerBody.append(el('p', { text: question.sample_answer }));
  if (question.sample_answer_star_l) {
    const labels = { situation: 'S — الموقف', task: 'T — المهمة', action: 'A — الإجراء', result: 'R — النتيجة', learning: 'L — التعلّم' };
    const parts = el('div', { class: 'answer-parts' });
    Object.entries(question.sample_answer_star_l).forEach(([key, value]) => {
      parts.append(el('div', { class: 'answer-part' }, el('strong', { text: labels[key] || key }), el('span', { text: Array.isArray(value) ? value.join(' • ') : value })));
    });
    answerBody.append(parts);
  }
  answer.append(answerBody);
  return el('div', { class: 'stack' },
    el('h3', { text: title }),
    el('p', { text: question.question }),
    answer,
    el('a', { class: 'button ghost small', href: `#/bank/${question.id}`, text: 'عرض السؤال ونموذجه' })
  );
}

async function renderSelfIntroductionUnit(container, data, outline) {
  const section = data.reference.part_6_preparation.sections.find(item => item.number === '6.3');
  container.append(renderSourceSection(section));
  container.append(renderSelfIntroLauncher());
  outline.push({ id: 'section-6-3', title: `6.3 ${section.title}` });
  container.append(notice('باني تقديم الذات هو الأداة الوحيدة التي تطلب منك إدخال معلومات؛ أسئلة المقابلة نفسها لا تطلب كتابة أي إجابة.', '', 'ⓘ'));
}

async function renderFinalReadiness(container, data, outline) {
  const sections = data.reference.part_6_preparation.sections.filter(item => item.number !== '6.3');
  for (const section of sections) {
    if (section.number === '6.1') {
      const card = renderSourceSection(section);
      card.append(await renderPrepChecklist(section));
      container.append(card);
    } else container.append(renderSourceSection(section));
    outline.push({ id: `section-${section.number.replace('.', '-')}`, title: `${section.number} ${section.title}` });
  }
  renderAdditionalQuestions(container, data, outline);
}

async function renderPrepChecklist(section) {
  const saved = await get('checklists', 'preparation-6.1');
  const items = section.blocks.find(block => block.type === 'list')?.items || [];
  const box = el('div', { class: 'stack no-print' }, el('h3', { text: 'قائمة تحضيري' }));
  const list = el('div', { class: 'checklist' });
  items.forEach((text, index) => {
    const checkbox = el('input', { type: 'checkbox', checked: saved?.checked?.includes(index) });
    checkbox.addEventListener('change', async () => {
      const checked = [...list.querySelectorAll('input')].map((input, i) => input.checked ? i : null).filter(i => i != null);
      await saveChecklist('preparation-6.1', checked);
    });
    list.append(el('label', { class: 'check-item' }, checkbox, el('span', { text })));
  });
  box.append(list);
  return box;
}

function renderAdditionalQuestions(container, data, outline) {
  const source = data.reference.part_5_additional_questions;
  const intro = el('section', { class: 'card source-section', id: 'additional-intro' }, el('h2', { text: source.title }));
  (source.intro || []).forEach(block => intro.append(renderBlock(block)));
  container.append(intro);
  outline.push({ id: 'additional-intro', title: source.title });
  source.questions.forEach(question => {
    const section = el('section', { class: 'card source-section', id: `additional-${question.id}` },
      el('h2', {}, el('small', { text: question.id }), document.createTextNode(question.question)),
      tag('تقييم عام', 'accent'),
      el('details', { class: 'reveal' },
        el('summary', { text: 'عرض نموذج الدليل' }),
        el('div', { class: 'reveal-content' }, el('p', { text: question.sample_answer }))
      ),
      el('div', { class: 'source-page', text: `صفحة ${question.pdf_page} في الدليل` })
    );
    container.append(section);
    outline.push({ id: `additional-${question.id}`, title: question.id });
  });
  container.append(notice('يرتبط السؤالان بنقطة التحضير: «تجهيز تصور واضح حول دور الذكاء الاصطناعي في عملك». ويحتوي البنك أيضًا على ستة أسئلة عامة أخرى.', 'warning'));
}

async function renderExercises(data, lessonId) {
  const all = data.exercises.filter(exercise => exercise.lesson_id === lessonId);
  if (!all.length) return document.createDocumentFragment();
  const reviewRecords = await getAll('review');
  const needsReview = new Set(reviewRecords.filter(item => item.review_again).map(item => item.exercise_id));
  const prioritized = [...all].sort((a, b) => Number(needsReview.has(b.id)) - Number(needsReview.has(a.id)));
  const queue = prioritized.slice(0, Math.min(prioritized.length, CONFIG.review.maxExercisesPerLessonSession));
  let index = 0;
  const zone = el('section', { class: 'exercise-zone', id: 'lesson-exercises' });
  const heading = el('div', { class: 'section-heading' },
    el('div', {}, el('h2', { text: 'ثبّت المعلومة' }), el('small', { class: 'muted', text: 'اختيارات قصيرة، ولا توجد كتابة.' }))
  );
  const host = el('div');

  const draw = () => {
    if (index >= queue.length) {
      host.replaceChildren(el('div', { class: 'card empty-state' },
        el('strong', { text: 'أنهيت جولة التمارين' }),
        el('p', { text: `أكملت ${queue.length} تمرينًا في هذه الجولة. العناصر التي أخطأت فيها ستتقدم في المراجعة القادمة.` }),
        button('أعد الجولة', { variant: 'secondary', onClick: () => { index = 0; draw(); } })
      ));
      return;
    }
    const exercise = queue[index];
    const card = el('div', { class: 'card exercise-card' });
    const feedback = el('div');
    appendChildren(card,
      el('div', { class: 'exercise-top' },
        el('h3', { text: exercise.prompt }),
        el('span', { class: 'exercise-count', text: `${index + 1} من ${queue.length}` })
      ),
      exercise.label ? el('span', { class: 'exercise-label', text: exercise.label }) : null,
      el('div', { class: 'exercise-stimulus', text: exercise.stimulus })
    );
    const choices = el('div', { class: 'choice-list' });
    exercise.choices.forEach((choice, choiceIndex) => {
      const option = el('button', { class: 'choice-button', type: 'button', text: choice });
      option.addEventListener('click', async () => {
        if (choices.dataset.answered) return;
        choices.dataset.answered = 'true';
        const correct = choiceIndex === exercise.answer;
        [...choices.children].forEach((child, i) => {
          child.disabled = true;
          if (i === exercise.answer) child.classList.add('correct');
        });
        if (!correct) option.classList.add('wrong');
        const prior = await get('review', `exercise-${exercise.id}`);
        await set('review', {
          id: `exercise-${exercise.id}`,
          exercise_id: exercise.id,
          correct_count: (prior?.correct_count || 0) + (correct ? 1 : 0),
          wrong_count: (prior?.wrong_count || 0) + (correct ? 0 : 1),
          review_again: !correct,
          updated_at: new Date().toISOString()
        });
        feedback.replaceChildren(el('div', { class: `exercise-feedback ${correct ? 'correct' : 'wrong'}` },
          el('strong', { text: correct ? 'إجابة صحيحة ✓' : 'إجابة غير صحيحة' }),
          correct ? null : el('p', { class: 'correct-answer', text: `الإجابة الصحيحة: ${exercise.choices[exercise.answer]}` }),
          el('p', { text: exercise.explanation || `المصدر: ${exercise.source_ref}` }),
          el('small', { class: 'muted', text: `المرجع: ${exercise.source_ref}` }),
          button(index === queue.length - 1 ? 'إنهاء الجولة' : 'السؤال التالي', {
            variant: 'small',
            onClick: () => { index += 1; draw(); }
          })
        ));
      });
      choices.append(option);
    });
    card.append(choices, feedback);
    host.replaceChildren(card);
  };
  draw();
  zone.append(heading, host);
  return zone;
}
