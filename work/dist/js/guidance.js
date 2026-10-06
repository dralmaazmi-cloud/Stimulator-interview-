const MODEL_ELEMENTS = Object.freeze({
  star_l: [
    { key: 'S', title: 'الموقف', prompt: 'حدّد موقفًا حقيقيًا: متى وأين حدث، ولماذا كان مهمًا؟' },
    { key: 'T', title: 'المهمة ودورك', prompt: 'وضّح مسؤوليتك أنت وما كان مطلوبًا منك تحديدًا.' },
    { key: 'A', title: 'الإجراء', prompt: 'اشرح ما فعلته أنت خطوة بخطوة، واجعل هذا الجزء الأكبر.' },
    { key: 'R', title: 'النتيجة', prompt: 'اذكر ما تغيّر، وأضف مؤشرًا أو أثرًا ملموسًا إن وُجد.' },
    { key: 'L', title: 'التعلّم', prompt: 'بيّن ما تعلّمته وما الذي ستفعله بصورة أفضل لاحقًا.' }
  ],
  seal: [
    { key: 'S', title: 'فهم الوضع', prompt: 'حدّد المشكلة والأطراف والقيود والأثر الفوري.' },
    { key: 'E', title: 'التقييم', prompt: 'اعرض البدائل والمخاطر، وفسّر سبب اختيارك.' },
    { key: 'A', title: 'الإجراء', prompt: 'اذكر خطوات عملية واضحة، والمسؤوليات، والمتابعة.' },
    { key: 'L', title: 'الأثر القيادي', prompt: 'وضّح كيف تحافظ على الفريق والهدف والثقة والانضباط.' }
  ],
  general: [
    { key: '1', title: 'الوضوح', prompt: 'قدّم رأيك أو ممارستك بصورة مباشرة ومحددة.' },
    { key: '2', title: 'عمق التحليل', prompt: 'اشرح الأسباب والاعتبارات والبدائل المهمة.' },
    { key: '3', title: 'الربط بالممارسة', prompt: 'اربط الفكرة بعملك أو بمثال واقعي مناسب.' },
    { key: '4', title: 'الواقعية والنضج', prompt: 'اعترف بالقيود والمخاطر وتجنّب الإجابات المطلقة.' }
  ]
});

export function modelElements(mode) {
  return MODEL_ELEMENTS[mode] || MODEL_ELEMENTS.general;
}

export function explainQuestion(question) {
  if (question.rubric_mode === 'star_l') {
    return {
      title: 'هذا سؤال سلوكي عن تجربة حدثت فعلًا',
      instruction: 'اختر موقفًا حقيقيًا واحدًا من خبرتك يشبه موضوع السؤال. لا تخترع سيناريو جديدًا، ولا تتكلم بصورة عامة.',
      answerPlan: 'احكِ الموقف بصيغة STAR-L: الموقف، مهمتك، ما فعلته أنت، النتيجة، ثم ما تعلمته.'
    };
  }
  if (question.rubric_mode === 'seal') {
    return {
      title: 'هذا سؤال سيناريو افتراضي',
      instruction: 'السيناريو موجود داخل السؤال؛ لا تحتاج إلى اختراع موقف آخر. المطلوب أن تشرح كيف ستفهمه وتتخذ قرارك.',
      answerPlan: 'نظّم قرارك بصيغة SEAL: فهم الوضع، التقييم، الإجراء، ثم الأثر القيادي.'
    };
  }
  return {
    title: 'هذا سؤال عام يختبر وضوح التفكير',
    instruction: 'أجب عن الفكرة مباشرة، ثم فسّر أسبابك واربطها بممارسة أو مثال واقعي مناسب.',
    answerPlan: 'لا تستخدم STAR-L أو SEAL بصورة آلية؛ ركّز على الوضوح، وعمق التحليل، والواقعية.'
  };
}

export function buildAnswerGuidance(question, data) {
  const intent = explainQuestion(question);
  if (question.expected_answer_points) {
    return {
      intent,
      label: 'نقاط متوقعة واردة في الدليل',
      kind: 'source',
      lead: question.expected_answer_points.lead || 'احرص على تغطية النقاط الآتية:',
      points: (question.expected_answer_points.points || []).filter(Boolean),
      elements: modelElements(question.rubric_mode),
      tip: question.rubric_mode === 'star_l'
        ? 'اختر موقفًا حقيقيًا من خبرتك، ولا تحفظ نموذج الدليل حرفيًا.'
        : 'استخدم حكمك المهني، وفسّر سبب اختيارك بدل سرد خطوات عامة.'
    };
  }

  if (question.competency_id) {
    const competency = data.competencyById.get(question.competency_id);
    return {
      intent,
      label: 'إرشاد تطبيقي مستخلص من الدليل',
      kind: 'derived',
      lead: `لا يورد الدليل نقاطًا خاصة بهذا السؤال؛ لذلك استُخدمت العناصر التي يقيسها المقابل في كفاءة «${competency?.name || question.competency_name}».`,
      points: (competency?.what_interviewer_measures || []).filter(Boolean),
      elements: modelElements(question.rubric_mode),
      tip: question.rubric_mode === 'star_l'
        ? 'تذكّر موقفًا حقيقيًا يثبت هذه الكفاءة، ثم نظّمه وفق STAR-L.'
        : 'عالِج السيناريو وفق SEAL، واربط قرارك بالسلوك القيادي الذي تقيسه الكفاءة.'
    };
  }

  if (question.principle_id) {
    const principle = data.reference.part_4_mission_command.principles
      .find(item => item.id === question.principle_id);
    return {
      intent,
      label: 'إرشاد تطبيقي مستخلص من الدليل',
      kind: 'derived',
      lead: `ابنِ الإجابة حول مبدأ «${principle?.title || question.principle_title}» والكفاءات المرتبطة به.`,
      points: [principle?.description, ...(principle?.linked_competencies || []).map(name => `أظهر صلتها بكفاءة: ${name}`)].filter(Boolean),
      elements: modelElements(question.rubric_mode),
      tip: 'قيادة المهمة تُقاس ضمنيًا من خلال السلوك والقرار، لا من خلال تعريف نظري للمبدأ.'
    };
  }

  return {
    intent,
    label: 'إرشاد تطبيقي مستخلص من الدليل',
    kind: 'derived',
    lead: 'هذا سؤال عام؛ نظّم إجابتك حول التحليل والممارسة الواقعية.',
    points: modelElements('general').map(item => `${item.title}: ${item.prompt}`),
    elements: modelElements('general'),
    tip: 'لا تستخدم STAR-L أو SEAL بصورة آلية إذا كان السؤال يطلب رأيًا أو ممارسة عامة.'
  };
}
