import { el, button, clear, notice, pageHead } from './ui.js';

export function renderQuickReview(root) {
  clear(root);
  root.append(pageHead('خلاصة قبل التدريب', 'مراجعة سريعة', 'أربع قواعد تحفظ اتجاه إجابتك دون أن تستبدل قراءة الدليل.'));
  const cards = el('div', { class: 'quick-review-list' },
    reviewCard('★', 'القاعدة الذهبية', 'قدّم أمثلة واقعية من خبرتك، لا أفكارًا نظرية فقط.', 'gold'),
    reviewCard('▤', 'قبل الإجابة', 'افهم السؤال، وحدّد الكفاءة، وخذ لحظة لترتيب الفكرة.', 'blue'),
    reviewCard('⚙', 'أثناء الإجابة', 'استخدم STAR-L للسؤال السلوكي وSEAL للسيناريو، وركّز على دورك وإجراءك. الإجراء هو الجزء الأكبر.', 'purple'),
    reviewCard('▥', 'تذكّر دائمًا', 'أنا فعلت — النتيجة — ما تعلّمت.', 'cyan')
  );
  root.append(cards,
    notice('هذه الصفحة أداة تذكّر سريعة. التفاصيل الكاملة موجودة في دروس المرجع.', '', 'ⓘ'),
    el('div', { class: 'button-row' },
      button('بناء الإجابة', { href: '#/answer-guide' }),
      button('بطاقات المراجعة', { href: '#/practice/a5', variant: 'secondary' }),
      button('استعراض الكفاءات وأسئلتها', { href: '#/competencies', variant: 'secondary' })
    )
  );
}

export function renderAnswerGuide(root) {
  clear(root);
  root.append(pageHead('اختر النموذج حسب نوع السؤال', 'بناء الإجابة', 'استخدم الهيكل لتنظيم فكرتك، ولا تحفظ نموذج الدليل حرفيًا.'));
  const star = methodCard('STAR-L', 'للسؤال السلوكي عن موقف حدث فعلًا', [
    ['S', 'الموقف'], ['T', 'المهمة'], ['A', 'الإجراء'], ['R', 'النتيجة'], ['L', 'التعلّم']
  ], 'purple');
  const seal = methodCard('SEAL', 'لسؤال السيناريو: ماذا ستفعل؟', [
    ['S', 'فهم الوضع'], ['E', 'التقييم'], ['A', 'الإجراء'], ['L', 'الأثر القيادي']
  ], 'teal');
  root.append(el('div', { class: 'method-grid' }, star, seal),
    notice('السؤال السلوكي: أنت تختار موقفًا حقيقيًا حدث لك. سؤال السيناريو: الموقف موجود في نص السؤال، وأنت تشرح كيف ستتصرف.', '', 'مهم'),
    notice('اجعل الإجراء الشخصي الجزء الأكبر من الإجابة، واربطه بنتيجة أو أثر واضح.', 'warning', '✦'),
    el('section', { class: 'card criteria-card' },
      el('h2', { text: 'ما الذي يجعل الإجابة قوية؟' }),
      el('div', { class: 'criteria-grid' },
        criterion('1', 'وضوح الموقف والسياق'),
        criterion('2', 'دورك الشخصي'),
        criterion('3', 'الإجراء أو جودة القرار'),
        criterion('4', 'النتيجة والأثر'),
        criterion('5', 'التعلّم والمراجعة')
      ),
      el('p', { class: 'muted', text: 'معايير تعليمية من الدليل تُستخدم أيضًا في تقييم المحاكاة.' })
    ),
    el('div', { class: 'button-row' },
      button('استعرض الكفاءات وأسئلتها', { href: '#/competencies' }),
      button('اقرأ وحدة STAR-L وSEAL', { href: '#/learn/U2', variant: 'secondary' })
    )
  );
}

function reviewCard(icon, title, text, tone) {
  return el('article', { class: `review-summary-card ${tone}` },
    el('span', { class: 'review-summary-icon', 'aria-hidden': 'true', text: icon }),
    el('div', {}, el('h2', { text: title }), el('p', { text }))
  );
}

function methodCard(title, subtitle, items, tone) {
  return el('article', { class: `card method-card ${tone}` },
    el('div', { class: 'method-heading' }, el('strong', { text: title }), el('span', { text: subtitle })),
    el('div', { class: 'method-steps' }, ...items.map(([key, label]) => el('div', { class: 'method-step' },
      el('strong', { text: key }),
      el('span', { text: label })
    )))
  );
}

function criterion(number, title) {
  return el('div', { class: 'criterion' }, el('span', { text: number }), el('strong', { text: title }));
}
