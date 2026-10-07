import { get, set } from './storage.js';
import { improveSelfIntroduction } from './evaluate-client.js';
import {
  bindExclusiveAccordions, el, button, clear, notice, pageHead, privacyReminder, toast, trainingDisclaimer
} from './ui.js';
import { acquireWakeLock, releaseWakeLock } from './wake-lock.js';

const WORDS_PER_MINUTE = 115;

const PHRASES = Object.freeze({
  opening: [
    value => `أنا ${value}`,
    value => `أعرّف بنفسي، أنا ${value}`,
    value => `بدايةً، أنا ${value}`,
    value => `يسعدني أن أقدّم نبذة موجزة عن مسيرتي؛ أنا ${value}`,
    value => `أقدّم نفسي بوصفي ${value}`,
    value => `مهنيًا، أنا ${value}`
  ],
  current: [
    value => `وأشغل حاليًا ${value}`,
    value => `وأتولى في الوقت الحالي ${value}`,
    value => `وأعمل حاليًا في ${value}`,
    value => `أما اليوم، فأشغل ${value}`,
    value => `وفي مرحلتي الحالية، أتولى ${value}`,
    value => `وحاليًا أمارس دوري في ${value}`
  ],
  scope: [
    value => `وتشمل مسؤولياتي ${value}`,
    value => `ويرتكز نطاق عملي على ${value}`,
    value => `وأتحمل ضمن هذا الدور مسؤولية ${value}`,
    value => `ومن خلال هذا الدور، أعمل على ${value}`,
    value => `ويتمثل جانب رئيسي من مسؤوليتي في ${value}`,
    value => `وفي هذا الموقع، أركّز على ${value}`
  ],
  qualification: [
    value => `ومن حيث التأهيل، حصلت على ${value}`,
    value => `وتستند مسيرتي إلى تأهيل في ${value}`,
    value => `أما خلفيتي العلمية والمهنية فتشمل ${value}`,
    value => `وقد أسست خبرتي على ${value}`,
    value => `وعلى مستوى التأهيل، أنجزت ${value}`,
    value => `ودعمت مساري الأكاديمي والمهني من خلال ${value}`
  ],
  start: [
    value => `بدأت مسيرتي في ${value}`,
    value => `وكانت انطلاقتي المهنية من ${value}`,
    value => `وانطلقت مسيرتي عبر ${value}`,
    value => `أما بدايتي المهنية فكانت في ${value}`,
    value => `وقد بدأت رحلتي العملية من ${value}`,
    value => `وتكوّنت خبرتي الأولى في ${value}`
  ],
  progression: [
    value => `ثم تدرجت عبر ${value}`,
    value => `وتطورت مسؤولياتي لاحقًا من خلال ${value}`,
    value => `ومع تراكم الخبرة، انتقلت إلى ${value}`,
    value => `وتوالت محطات مسيرتي في ${value}`,
    value => `ثم اتسع نطاق خبرتي ليشمل ${value}`,
    value => `وقد قادني هذا المسار إلى ${value}`
  ],
  achievement: [
    value => `ومن أبرز ما حققته ${value}`,
    value => `ومن الإنجازات التي أعتز بها ${value}`,
    value => `وكان من أبرز إسهاماتي ${value}`,
    value => `ومن المحطات التي تعكس أثر عملي ${value}`,
    value => `وأبرز مثال على ذلك ${value}`,
    value => `كما تمكنت من ${value}`
  ],
  leadership: [
    value => `وتتركز خبرتي القيادية في ${value}`,
    value => `وعلى المستوى القيادي، أتميز بخبرة في ${value}`,
    value => `وقد طورت خلال ذلك قدرة واضحة على ${value}`,
    value => `كما عززت تجربتي في ${value}`,
    value => `ويظهر جانب مهم من خبرتي في ${value}`,
    value => `ومن أبرز مجالات ممارستي القيادية ${value}`
  ],
  participation: [
    value => `كما شاركت في ${value}`,
    value => `وامتد إسهامي كذلك إلى ${value}`,
    value => `وإلى جانب عملي الأساسي، أسهمت في ${value}`,
    value => `وكان لي حضور فاعل في ${value}`,
    value => `كما دعمت خبرتي من خلال المشاركة في ${value}`,
    value => `ومن المشاركات المرتبطة بمساري ${value}`
  ],
  future: [
    value => `وفي المرحلة المقبلة، أطمح إلى ${value}`,
    value => `أما توجهي المستقبلي فيتمثل في ${value}`,
    value => `وأتطلع مستقبلًا إلى ${value}`,
    value => `ومن خلال خبرتي الحالية، أسعى إلى ${value}`,
    value => `ويتركز هدفي القادم على ${value}`,
    value => `وأرغب في توظيف هذه الخبرة من أجل ${value}`
  ],
  close: [
    'وأرى أن تكامل هذه الخبرات يمنحني أساسًا عمليًا قويًا للإسهام بفاعلية في المرحلة المقبلة.',
    'وأسعى إلى مواصلة هذا المسار بصورة تحقق أثرًا واضحًا ومستدامًا.',
    'وهدفي أن أحوّل هذه الخبرة إلى نتائج عملية وقيمة مضافة مستمرة.',
    'وأتطلع إلى البناء على هذه المسيرة بمسؤولية ووضوح وتركيز على النتائج.',
    'وما يهمني في المرحلة المقبلة هو توظيف خبرتي لخدمة الهدف وتحقيق نتائج قابلة للقياس.',
    'وأطمح إلى مواصلة التطور مع المحافظة على جودة الأداء والأثر القيادي.'
  ]
});

function clean(value = '') {
  return String(value)
    .replace(/[\u200e\u200f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[،؛:.-]+|[،؛:.-]+$/g, '')
    .trim();
}

function words(value = '') {
  return clean(value).split(/\s+/).filter(Boolean);
}

function clip(value, maximum) {
  const list = words(value);
  if (list.length <= maximum) return clean(value);
  return `${list.slice(0, maximum).join(' ')}…`;
}

function splitItems(value = '') {
  return String(value)
    .split(/\n|[؛;]|(?:\s*[•●▪]\s*)/)
    .map(clean)
    .filter(Boolean);
}

function hash(value) {
  let state = 2166136261;
  for (const character of String(value)) {
    state ^= character.codePointAt(0);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

function choose(group, seed, offset = 0) {
  const values = PHRASES[group];
  return values[(seed + offset * 2654435761) % values.length];
}

function phrase(group, value, seed, offset) {
  const source = clean(value);
  if (!source) return '';
  const template = choose(group, seed, offset);
  return typeof template === 'function' ? template(source) : template;
}

function sentence(value) {
  const result = clean(value);
  if (!result) return '';
  return /[.!؟]$/u.test(result) ? result : `${result}.`;
}

function trimToBudget(segments, maximumWords) {
  const included = [...segments];
  let total = words(included.map(item => item.text).join(' ')).length;
  const optional = included
    .map((item, index) => ({ ...item, index }))
    .filter(item => !item.required)
    .sort((a, b) => a.priority - b.priority);

  for (const item of optional) {
    if (total <= maximumWords) break;
    included[item.index].text = '';
    total = words(included.map(part => part.text).join(' ')).length;
  }

  return included.map(item => item.text).filter(Boolean);
}

export function estimateSeconds(text, wordsPerMinute = WORDS_PER_MINUTE) {
  return Math.max(1, Math.round(words(text).length / wordsPerMinute * 60));
}

export function buildSelfIntroduction(input, options = {}) {
  const duration = Number(options.duration) === 120 ? 120 : 60;
  const variation = Number(options.variation) || 0;
  const seedSource = Object.values(input || {}).join('|') + `|${duration}|${variation}`;
  const seed = hash(seedSource);
  const achievementItems = splitItems(input.achievements).slice(0, duration === 120 ? 2 : 1);
  const achievementText = achievementItems.join(duration === 120 && achievementItems.length > 1 ? '، إضافة إلى ' : '');
  const courseText = duration === 120 ? clip(input.courses, 24) : '';
  const participationText = duration === 120 ? clip(input.participation, 24) : '';

  const segments = [
    { required: true, priority: 10, text: phrase('opening', clip(input.identity, 14), seed, 1) },
    { required: false, priority: 3, text: phrase('qualification', clip(input.qualification, duration === 120 ? 28 : 18), seed, 4) },
    { required: false, priority: 1, text: courseText ? phrase('qualification', courseText, seed, 5) : '' },
    { required: false, priority: 4, text: phrase('start', clip(input.career_start, 20), seed, 6) },
    { required: true, priority: 9, text: phrase('progression', clip(input.progression, duration === 120 ? 34 : 23), seed, 7) },
    { required: true, priority: 10, text: phrase('current', clip(input.current_role, 18), seed, 2) },
    { required: duration === 120, priority: 6, text: phrase('scope', clip(input.current_scope, duration === 120 ? 28 : 20), seed, 3) },
    { required: false, priority: 7, text: phrase('leadership', clip(input.leadership, duration === 120 ? 30 : 20), seed, 8) },
    { required: true, priority: 10, text: phrase('achievement', clip(achievementText, duration === 120 ? 42 : 26), seed, 9) },
    { required: false, priority: 2, text: participationText ? phrase('participation', participationText, seed, 10) : '' },
    { required: true, priority: 10, text: phrase('future', clip(input.future_goal, duration === 120 ? 30 : 22), seed, 11) },
    { required: false, priority: 5, text: choose('close', seed, 12) }
  ].filter(item => item.text);

  const maximumWords = duration === 120 ? 225 : 112;
  const selected = trimToBudget(segments, maximumWords).map(sentence);
  const text = selected.join(' ');
  const estimatedSeconds = estimateSeconds(text);
  return {
    text,
    duration,
    word_count: words(text).length,
    estimated_seconds: estimatedSeconds,
    warning: estimatedSeconds < duration * 0.75
      ? 'النص أقصر من المدة المختارة. أضف تفاصيل أكثر عن مسؤولياتك أو إنجازاتك.'
      : ''
  };
}

export function renderSelfIntroLauncher() {
  return el('section', { class: 'card intro-launcher no-print' },
    el('div', {},
      el('span', { class: 'eyebrow', text: 'أداة محلية تعمل دون إنترنت' }),
      el('h2', { text: 'جهّز تعريفك الشخصي' }),
      el('p', { text: 'أنشئ مقدمة مهنية منظمة مدتها 60 أو 120 ثانية، ثم تدرّب على توقيتها.' })
    ),
    button('إعداد التعريف الشخصي', { href: '#/self-intro' })
  );
}

export async function renderSelfIntroPage(root) {
  clear(root);
  const saved = await get('settings', 'self-intro-draft');
  root.append(
    pageHead('مسودة محلية + تحسين اختياري', 'إعداد التعريف الشخصي', 'أنشئ مقدمة واضحة ومهنية، ثم تدرّب على تقديمها بثقة.'),
    notice('المسار الأفضل: من أنت، ثم خبرتك وقيمتك للدور، ثم طموحك المهني.', '', '✦'),
    privacyReminder('إذا اخترت التحسين بالذكاء الاصطناعي، استخدم تعريفًا مهنيًا عامًا بدل الأسماء أو الجهات، واحتفظ بخبرتك وإنجازاتك غير الحساسة.')
  );

  const form = el('section', { class: 'card intro-builder-card' });
  const duration = el('div', { class: 'segmented', role: 'group', 'aria-label': 'مدة تقديم الذات' });
  let selectedDuration = saved?.duration === 120 ? 120 : 60;
  [60, 120].forEach(value => {
    const choice = el('button', { type: 'button', class: selectedDuration === value ? 'active' : '', text: `حتى ${value} ثانية` });
    choice.addEventListener('click', () => {
      selectedDuration = value;
      [...duration.children].forEach(item => item.classList.toggle('active', item === choice));
    });
    duration.append(choice);
  });

  const definitions = [
    ['identity', 'الاسم أو التعريف المهني', 'مثال: طبيب أشعة استشاري متخصص في…'],
    ['qualification', 'المؤهلات الأساسية', 'اذكر الأكثر ارتباطًا بالمقابلة'],
    ['courses', 'أبرز الدورات أو الشهادات', 'اختياري — الأهم فقط'],
    ['career_start', 'بداية المسيرة', 'من أين بدأت؟'],
    ['progression', 'التدرج الوظيفي', 'أهم محطتين أو ثلاث بترتيبها'],
    ['current_role', 'المنصب الحالي', 'ما المنصب الذي تشغله الآن؟'],
    ['current_scope', 'أهم مسؤولياتك الحالية', 'ما الذي تقوده أو تشرف عليه؟'],
    ['leadership', 'خبرتك القيادية', 'فرق، مشروعات، قرارات أو مسؤوليات'],
    ['achievements', 'أبرز الإنجازات', 'اكتب كل إنجاز في سطر مستقل'],
    ['participation', 'المشاركات المهمة', 'لجان، مبادرات أو أعمال إضافية'],
    ['future_goal', 'الهدف المستقبلي', 'ما الأثر الذي تريد تحقيقه؟']
  ];
  const values = { ...(saved?.values || {}) };
  const inputs = new Map();
  const fieldNodes = new Map();
  definitions.forEach(([key, label, placeholder], index) => {
    const input = el('textarea', {
      class: 'input',
      rows: key === 'achievements' || key === 'progression' ? 4 : 3,
      value: values[key] || '',
      placeholder
    });
    input.addEventListener('input', () => { values[key] = input.value; });
    inputs.set(key, input);
    fieldNodes.set(key, el('label', { class: 'intro-question' },
      el('span', { class: 'intro-step', text: String(index + 1) }),
      el('strong', { text: label }),
      input
    ));
  });
  const groupDefinitions = [
    ['intro-who', 'من أنت؟', 'التعريف المهني والتأهيل', ['identity', 'qualification', 'courses']],
    ['intro-experience', 'مسيرتك وخبرتك', 'البداية والتدرّج ودورك الحالي', ['career_start', 'progression', 'current_role']],
    ['intro-value', 'قيمتك للدور', 'مسؤولياتك وقيادتك وإنجازاتك', ['current_scope', 'leadership', 'achievements', 'participation']],
    ['intro-future', 'طموحك المهني', 'الأثر الذي تريد تحقيقه', ['future_goal']]
  ];
  const fields = bindExclusiveAccordions(el('div', { class: 'intro-question-groups' },
    ...groupDefinitions.map(([id, title, subtitle, keys], index) => el('details', {
      id, class: `intro-question-group tone-${index + 1}`, open: index === 0
    },
    el('summary', {},
      el('span', { class: 'intro-group-number', text: String(index + 1) }),
      el('div', {}, el('strong', { text: title }), el('small', { text: subtitle })),
      el('i', { class: 'accordion-chevron', 'aria-hidden': 'true', text: '⌄' })
    ),
    el('div', { class: 'intro-group-fields' }, ...keys.map(key => fieldNodes.get(key)))
    ))
  ), 'self-intro-fields');

  const output = el('section', { class: 'card intro-result', hidden: true });
  const outputText = el('textarea', { class: 'input intro-result-text', rows: 12, 'aria-label': 'نص تقديم الذات' });
  const metrics = el('div', { class: 'intro-metrics' });
  const warning = el('div');
  const aiCandidate = el('section', { class: 'ai-intro-candidate', hidden: true });
  let variation = 0;
  let editedManually = Boolean(saved?.edited_manually);

  const showMetrics = text => {
    const count = words(text).length;
    const seconds = estimateSeconds(text);
    metrics.replaceChildren(
      el('span', { text: `${count} كلمة` }),
      el('span', { text: `المدة التقديرية: ${seconds} ثانية` }),
      el('span', { text: `الهدف: حتى ${selectedDuration} ثانية` })
    );
    warning.replaceChildren(seconds < selectedDuration * 0.75
      ? notice('النص أقصر من المدة المختارة. أضف تفاصيل أكثر عن مسؤولياتك أو إنجازاتك.', 'warning')
      : notice('النص ضمن المدة التقديرية. جرّبه بالمؤقّت لأن سرعة الكلام تختلف من شخص لآخر.', '', '✓'));
  };

  // البند 10: حفظ التعديل اليدوي بتأخير 500ms، مع تفريغ فوري عند مغادرة الصفحة.
  let saveTimer = null;
  const flushDraft = async () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    editedManually = true;
    await set('settings', { id: 'self-intro-draft', values, duration: selectedDuration, text: outputText.value, edited_manually: true, updated_at: new Date().toISOString() });
  };
  outputText.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushDraft, 500);
  });
  window.addEventListener('hashchange', () => { if (saveTimer) flushDraft(); }, { once: true });

  const generate = async () => {
    const required = ['identity', 'current_role', 'progression', 'achievements', 'future_goal'];
    const missing = required.filter(key => !clean(values[key]));
    if (missing.length) {
      toast('أكمل التعريف المهني والمنصب والتدرج والإنجاز والهدف المستقبلي أولًا.');
      const target = inputs.get(missing[0]);
      const group = target?.closest('details');
      if (group) group.open = true;
      target?.focus();
      return;
    }
    const result = buildSelfIntroduction(values, { duration: selectedDuration, variation });
    clearTimeout(saveTimer);
    saveTimer = null;
    editedManually = false;
    output.hidden = false;
    outputText.value = result.text;
    showMetrics(result.text);
    await set('settings', { id: 'self-intro-draft', values, duration: selectedDuration, text: result.text, edited_manually: false, updated_at: new Date().toISOString() });
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  form.append(el('h2', { text: 'اختر المدة' }), duration, fields,
    el('div', { class: 'button-row' }, button('إنشاء المسودة', { onClick: generate }))
  );

  const timerValue = el('strong', { class: 'timer-display', text: '00:00' });
  let timerId = null;
  let startedAt = 0;
  const stopTimer = () => {
    if (timerId) clearInterval(timerId);
    timerId = null;
    releaseWakeLock('self-intro-timer');
  };
  window.addEventListener('hashchange', stopTimer, { once: true });
  const startTimer = button('بدء المؤقّت', { variant: 'secondary small' });
  startTimer.addEventListener('click', () => {
    stopTimer();
    acquireWakeLock('self-intro-timer');
    startedAt = Date.now();
    timerValue.textContent = '00:00';
    timerId = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      timerValue.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds >= selectedDuration) stopTimer();
    }, 250);
  });
  const resetTimer = button('إيقاف وتصفير', { variant: 'ghost small', onClick: () => { stopTimer(); timerValue.textContent = '00:00'; } });

  const improveButton = button('تحسين الصياغة بالذكاء الاصطناعي — اختياري', { variant: 'secondary small' });
  improveButton.addEventListener('click', async () => {
    const source = outputText.value.trim();
    if (!source) {
      toast('ابنِ المسودة المحلية أولًا.');
      return;
    }
    improveButton.disabled = true;
    improveButton.textContent = 'جارٍ التحسين…';
    aiCandidate.hidden = false;
    aiCandidate.replaceChildren(notice('جارٍ تحسين الصياغة مع الحفاظ على معلوماتك والمدة…'));
    try {
      const result = await improveSelfIntroduction({ text: source, duration: selectedDuration });
      const candidateText = el('textarea', { class: 'input intro-result-text', rows: 12, value: result.text, 'aria-label': 'النص المحسن المقترح' });
      const candidateChildren = [
        el('div', { class: 'section-heading' }, el('h3', { text: 'نسخة محسّنة مقترحة' }), el('span', { class: 'tag warning', text: 'تحتاج اعتمادك' })),
        notice('قارن النصين. لن يُستبدل نصك المحلي إلا إذا ضغطت «اعتماد النسخة».', 'warning'),
        candidateText,
        trainingDisclaimer('answer'),
        result.changes?.length ? el('div', { class: 'ai-change-list' },
          el('strong', { text: 'ما الذي تغيّر؟' }),
          el('ul', {}, ...result.changes.map(item => el('li', { text: item })))
        ) : null,
        el('div', { class: 'button-row' },
          button('اعتماد النسخة', { onClick: async () => {
            outputText.value = candidateText.value;
            await set('settings', { id: 'self-intro-draft', values, duration: selectedDuration, text: outputText.value, updated_at: new Date().toISOString() });
            aiCandidate.hidden = true;
            toast('تم اعتماد النسخة المحسّنة.');
          } }),
          button('الاحتفاظ بنصي الحالي', { variant: 'ghost', onClick: () => { aiCandidate.hidden = true; } })
        )
      ].filter(Boolean);
      aiCandidate.replaceChildren(...candidateChildren);
    } catch (error) {
      aiCandidate.replaceChildren(notice(error.message || 'تعذر تحسين النص الآن.', 'danger'));
    } finally {
      improveButton.disabled = false;
      improveButton.textContent = 'تحسين الصياغة بالذكاء الاصطناعي — اختياري';
    }
  });

  output.append(
    el('div', { class: 'section-heading' }, el('h2', { text: 'مسودة تعريفك' }), el('span', { class: 'tag accent', text: 'قابلة للتعديل' })),
    outputText,
    metrics,
    warning,
    trainingDisclaimer('answer'),
    el('div', { class: 'button-row' },
      button('صياغة بديلة', { variant: 'secondary small', onClick: () => {
        if (editedManually && !window.confirm('سيُستبدل نصك المعدّل يدويًا بصياغة جديدة. هل تريد المتابعة؟')) return;
        variation += 1;
        generate();
      } }),
      improveButton,
      button('نسخ النص', { variant: 'ghost small', onClick: async () => { await navigator.clipboard?.writeText(outputText.value); toast('تم نسخ النص.'); } })
    ),
    el('div', { class: 'intro-timer' }, timerValue, startTimer, resetTimer),
    aiCandidate
  );

  if (saved?.text) {
    // استعادة النص المحفوظ (بما فيه التعديل اليدوي) مع مقاييسه مباشرة.
    output.hidden = false;
    outputText.value = saved.text;
    showMetrics(saved.text);
  }

  root.append(form, output,
    notice('المسودة الأساسية تُنشأ محليًا. لا يُرسل النص إلى الخدمة إلا عند اختيار «تحسين الصياغة بالذكاء الاصطناعي — اختياري».', 'warning')
  );
}
