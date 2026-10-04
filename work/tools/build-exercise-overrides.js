// يولّد tools/exercise-overrides.json من نصوص المرجع فقط (v0.5.1 — البند 11).
// التفسيرات تستند إلى reference.json ولا تنسب إليه ما ليس فيه. يُشغَّل على مخرجات build-derived.js الخام
// (قبل التطبيق) عبر `npm run exercise-overrides`؛ تشغيله على ملف مُطبَّق سابقًا يُفرغ قائمة الحذف.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(project, relative), 'utf8'));
const reference = readJson('dist/data/reference.json');
const competencies = readJson('dist/data/derived/competencies.json');
const exercises = readJson('dist/data/exercises.json');

const section = (partKey, number) => reference[partKey].sections.find(item => item.number === number);
const table = (partKey, number) => section(partKey, number).blocks.find(block => block.type === 'table');
const firstSentence = text => String(text || '').split(/(?<=[.؟!])\s+/)[0].trim().replace(/[.،]$/, '');
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();

const STAR_ELEMENTS = {
  situation: 'الموقف (S)',
  task: 'المهمة (T)',
  action: 'الإجراء (A)',
  result: 'النتيجة (R)',
  learning: 'التعلّم (L)'
};

const explanations = {};

// الدرس 2: عناصر STAR-L من نماذج الدليل — بلا كشف اسم الحقل البرمجي.
exercises.filter(item => /^L2-STAR-/.test(item.id)).forEach(item => {
  const match = item.explanation.match(/حقل (situation|task|action|result|learning) للسؤال ([A-Z0-9-]+)/);
  if (!match) return;
  explanations[item.id] = `هذا المقطع هو عنصر ${STAR_ELEMENTS[match[1]]} في نموذج الدليل للسؤال ${match[2]}.`;
});

// الدرس 2: تعريفات SEAL من جدول القسم 2.2.
const sealRows = table('part_2_answering', '2.2').rows;
const sealIntro = clean(section('part_2_answering', '2.2').blocks.find(block => block.type === 'paragraph')?.text);
sealRows.forEach((row, index) => {
  const label = row[0].replace(/\n/g, ' — ');
  explanations[`L2-SEAL-${index + 1}`] = `هذا التعريف يصف عنصر «${label}» في نموذج SEAL لأن المرجع يحدده بهذه الصياغة في جدول القسم 2.2، والنموذج ${firstSentence(sealIntro).replace(/^يُستخدم/, 'يُستخدم')}.`;
});

// الدرس 4: العناصر الخمسة (2.5) ومعايير صياغة السؤال (2.7).
table('part_2_answering', '2.5').rows.forEach((row, index) => {
  explanations[`L4-ASSESS-${index + 1}`] = `المقابِل يسأل نفسه «${clean(row[1])}» ليتحقق من عنصر «${clean(row[0])}»، وهو أحد العناصر الخمسة التي يبحث عنها في الإجابة؛ وجودها جميعًا يعني إجابة قوية، وغياب أحدها يجعلها متوسطة — القسم 2.5 في المرجع.`;
});
table('part_2_answering', '2.7').rows.forEach((row, index) => {
  const detail = clean(row[1]);
  const rule = detail.includes('القاعدة:') ? detail.split('القاعدة:')[1].trim() : firstSentence(detail);
  explanations[`L4-DESIGN-${index + 1}`] = `هذا النص يشرح معيار «${clean(row[0])}» في صياغة الأسئلة القيادية، وخلاصته: ${rule.replace(/[.،]$/, '')} — القسم 2.7 في المرجع.`;
});

// الدرس 5: السلوك الداعم الأول لكل كفاءة مع تعريف الكفاءة من المرجع.
competencies.forEach(competency => {
  const supporting = competency.supporting_behaviours[0];
  if (!supporting) return;
  explanations[`L5-COMP-${competency.id}`] = `«${clean(supporting.text).replace(/[.،]$/, '')}» سلوك داعم في كفاءة «${competency.name}» لأن المرجع يعرّف هذه الكفاءة بأنها ${firstSentence(competency.definition)} — السلوك ${supporting.id} ضمن الكفاءة ${competency.id}.`;
});

// الدرس 6: مبادئ قيادة المهمة مع وصف المبدأ من الجزء الرابع.
reference.part_4_mission_command.principles.forEach(principle => {
  explanations[`L6-PRINCIPLE-${principle.id}`] = `هذا المقطع يجسّد مبدأ «${principle.title}» لأن المرجع يصفه بأن ${firstSentence(principle.description).replace(/^يقوم /, 'يقوم ')} — نموذج السؤال ${principle.scenario_question.id} في الجزء الرابع (قيادة المهمة).`;
});

// الدرس 7: نصائح لغة الجسد من جدول القسم 6.5.
table('part_6_preparation', '6.5').rows.forEach((row, index) => {
  explanations[`L7-BODY-${index + 1}`] = `النصيحة «${clean(row[0])}» هي العنوان الذي يضعه المرجع لهذا التفصيل في جدول لغة الجسد، لأن التفصيل يشرح طريقة تطبيقها أثناء المقابلة — القسم 6.5.`;
});

// alpha-3 (البند 5): توسيع التفسيرات ذات السطر الواحد إلى جملة تشرح السبب من نص المرجع.
const competencyById = new Map(competencies.map(item => [item.id, item]));
const comparisonTable = table('part_1_framework', '1.2');
exercises.filter(item => /^L1-CLASS-/.test(item.id)).forEach(item => {
  const row = comparisonTable.rows.find(candidate => candidate.includes(item.stimulus));
  if (!row) return;
  const column = row.indexOf(item.stimulus);
  const header = comparisonTable.headers[column] || '';
  const definition = clean(row[1]);
  const role = clean(row[3]);
  explanations[item.id] = column === 1
    ? `العبارة واردة في صف «${clean(row[0])}» من جدول المقارنة في القسم 1.2 تحت عمود «${header}»، ويبيّن الجدول أن دور هذا العنصر في التقييم: ${role.replace(/[.،]$/, '')}.`
    : `العبارة واردة في صف «${clean(row[0])}» من جدول المقارنة في القسم 1.2 تحت عمود «${header}»، لأن الجدول يعرّف «${clean(row[0])}» بأنها ${definition.replace(/[.،]$/, '')}.`;
});
exercises.filter(item => /^L5-BEH-[SN]-/.test(item.id)).forEach(item => {
  const competency = competencyById.get(item.id.match(/^L5-BEH-[SN]-(C\d)/)[1]);
  if (!competency) return;
  const definition = firstSentence(competency.definition).replace(/[.،]$/, '');
  explanations[item.id] = /-S-/.test(item.id)
    ? `«${clean(item.stimulus).replace(/[.،]$/, '')}» مذكور في قائمة السلوكيات الداعمة لكفاءة «${competency.name}» في المرجع، لأنه يجسّد تعريفها: ${definition}.`
    : `«${clean(item.stimulus).replace(/[.،]$/, '')}» مذكور في قائمة السلوكيات السلبية لكفاءة «${competency.name}» في المرجع، لأنه يتعارض مع تعريفها: ${definition}.`;
});
exercises.filter(item => /^L5-MODE-/.test(item.id)).forEach(item => {
  explanations[item.id] = item.answer === 0 || /سلوكي/.test(item.choices[item.answer])
    ? `صيغة السؤال تطلب موقفًا حدث فعلًا من خبرتك؛ وهذا هو السؤال السلوكي الذي يُجاب عنه بنموذج STAR-L (الموقف، المهمة، الإجراء، النتيجة، التعلّم) وفق القسم 2.1 في المرجع.`
    : `السؤال يضع موقفًا افتراضيًا ويسأل ماذا ستفعل؛ وهذا سؤال سيناريو يُجاب عنه بنموذج SEAL (الوضع، التقييم، الإجراء القيادي، الأثر القيادي) وفق القسم 2.2 في المرجع.`;
});
exercises.filter(item => /^L7-PREP-/.test(item.id)).forEach(item => {
  explanations[item.id] = `هذا الإجراء مذكور في قائمة التحضير الأولي (القسم 6.1) التي تجمع ما يُنجز قبل المقابلة، وليس من عناصر تقديم الذات (القسم 6.3) ولا من نصائح لغة الجسد (القسم 6.5).`;
});
exercises.filter(item => /^L8-GENERAL-/.test(item.id)).forEach(item => {
  explanations[item.id] = `هذا السؤال من الأسئلة العامة التي لا تطلب موقفًا حدث فعلًا ولا سيناريو افتراضيًا؛ لذلك تُنظَّم إجابته بالوضوح وعمق التحليل والربط بالممارسة والواقعية بدل STAR-L أو SEAL.`;
});

// التكرار: من كل زوج متطابق المحفّز يُحذف التمرين الأقل تفسيرًا (L5-BEH-S-Cx-1) ويبقى L5-COMP-Cx.
const byStimulus = new Map();
exercises.forEach(item => byStimulus.set(item.stimulus, [...(byStimulus.get(item.stimulus) || []), item]));
const remove = [];
byStimulus.forEach(items => {
  if (items.length < 2) return;
  const richest = [...items].sort((a, b) => (explanations[b.id] || b.explanation).length - (explanations[a.id] || a.explanation).length)[0];
  items.filter(item => item.id !== richest.id).forEach(item => remove.push(item.id));
});

const output = {
  version: '0.5.1',
  description: 'تجاوزات تمارين التثبيت (البند 11): تفسيرات تعليمية من المرجع، إزالة أسماء الحقول البرمجية، اختصار الخيارات إلى 4، خلط بذرة ثابتة، وحذف المكرر.',
  seed: 'v0.5.1-exercises',
  max_choices: 4,
  trim_when_more_than: 5,
  max_position_share: 0.35,
  remove: remove.sort(),
  explanations
};
fs.writeFileSync(path.join(project, 'tools/exercise-overrides.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${Object.keys(explanations).length} explanations and ${remove.length} removals to tools/exercise-overrides.json`);
