import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(project, relative), 'utf8'));
const questions = readJson('dist/data/derived/questions.json');
const curation = readJson('dist/data/derived/curation.json');
const primary = questions.filter(item => curation.primary_ids.includes(item.id));

function sampleText(question) {
  if (question.sample_answer) return question.sample_answer;
  if (question.sample_answer_star_l) return Object.values(question.sample_answer_star_l).flat().filter(Boolean).join(' ');
  if (question.sample_answers?.length) {
    return question.sample_answers.map(item => typeof item === 'string' ? item : item.answer).filter(Boolean).join(' ');
  }
  throw new Error(`Missing sample for ${question.id}`);
}

function words(value, maximum = 130) {
  return String(value).split(/\s+/).filter(Boolean).slice(0, maximum).join(' ');
}

const behavioural = primary.filter(item => item.type === 'behavioural' && item.competency_id).slice(0, 10);
const fixtures = [];

behavioural.forEach((question, index) => {
  const pair = `length-${index + 1}`;
  fixtures.push({
    id: `${pair}-strong`, group: 'short_strong_vs_long_weak', pair_id: pair,
    question_id: question.id, answer: words(sampleText(question), 95),
    expectation: { beats_pair: `${pair}-weak` }
  });
  fixtures.push({
    id: `${pair}-weak`, group: 'short_strong_vs_long_weak', pair_id: pair,
    question_id: question.id,
    answer: 'القيادة موضوع مهم جدًا ويحتاج إلى تواصل وتخطيط واجتماعات كثيرة، ونحن دائمًا نحاول أن نعمل كفريق واحد ونحرص بصورة عامة على الجودة والسرعة والمرونة والتعاون، لأن هذه المبادئ ضرورية في جميع المشروعات وفي كل الظروف، ولذلك أرى أن القائد الجيد يجب أن يستمع ويقرر ويتابع ويحفز الجميع باستمرار دون ذكر موقف محدد أو إجراء شخصي أو نتيجة قابلة للقياس.',
    expectation: { loses_to_pair: `${pair}-strong`, flags_include: ['generic'] }
  });
});

behavioural.forEach((question, index) => fixtures.push({
  id: `copied-${index + 1}`, group: 'copied_reference', question_id: question.id,
  answer: sampleText(question),
  expectation: { near_reference_model: true, competency_evidence_max: 3 }
}));

behavioural.forEach((question, index) => {
  const pair = `role-${index + 1}`;
  const tail = 'حللت سبب التأخير، ثم وضعت خطة أسبوعية ووزعت المسؤوليات وتابعت المؤشرات. انتهى العمل في الموعد، وتعلمت أهمية المتابعة المبكرة.';
  fixtures.push({
    id: `${pair}-i`, group: 'personal_role_i_vs_we', pair_id: pair, question_id: question.id,
    answer: `في مشروع متعثر كانت مهمتي استعادة الانضباط. أنا ${tail}`,
    expectation: { personal_role_beats: `${pair}-we` }
  });
  fixtures.push({
    id: `${pair}-we`, group: 'personal_role_i_vs_we', pair_id: pair, question_id: question.id,
    answer: `في مشروع متعثر كانت مهمتنا استعادة الانضباط. نحن ${tail}`,
    expectation: { personal_role_loses_to: `${pair}-i`, flags_include: ['we_not_i'] }
  });
});

behavioural.forEach((question, index) => {
  const pair = `result-${index + 1}`;
  const base = 'واجهت تأخرًا في مشروع مسؤول عنه، فراجعت الأسباب وحددت الأولويات بنفسي، ثم وزعت المهام وتابعت التنفيذ يوميًا.';
  fixtures.push({
    id: `${pair}-with`, group: 'with_result_vs_without_result', pair_id: pair, question_id: question.id,
    answer: `${base} انخفض التأخير من عشرة أيام إلى يومين واكتمل التسليم في الموعد. تعلمت أن القياس اليومي يكشف الانحراف مبكرًا.`,
    expectation: { result_beats: `${pair}-without` }
  });
  fixtures.push({
    id: `${pair}-without`, group: 'with_result_vs_without_result', pair_id: pair, question_id: question.id,
    answer: `${base} وتعلمت أن المتابعة مهمة.`,
    expectation: { result_loses_to: `${pair}-with`, flags_include: ['no_result'] }
  });
});

behavioural.slice(0, 5).forEach((question, index) => {
  const pair = `dialect-${index + 1}`;
  fixtures.push({
    id: `${pair}-msa`, group: 'msa_vs_gulf', pair_id: pair, question_id: question.id,
    answer: 'في بداية المشروع لاحظت أن الفريق لم يفهم الأولويات. كانت مهمتي توضيح الخطة. عقدت اجتماعًا قصيرًا، وشرحت المسؤوليات، وطلبت من كل عضو تلخيص دوره. انخفضت الأخطاء، واكتمل العمل في الموعد. تعلمت أن التأكد من الفهم أهم من مجرد إرسال التعليمات.',
    expectation: { score_difference_max: 5, compare_to: `${pair}-gulf` }
  });
  fixtures.push({
    id: `${pair}-gulf`, group: 'msa_vs_gulf', pair_id: pair, question_id: question.id,
    answer: 'بداية المشروع لاحظت إن الفريق ما كان فاهم الأولويات. كان دوري أوضح الخطة. سويت اجتماع قصير، وشرحت المسؤوليات، وطلبت من كل واحد يلخص دوره. قلت الأخطاء، وخلصنا الشغل في وقته. تعلمت إن التأكد من الفهم أهم من إني بس أرسل التعليمات.',
    expectation: { score_difference_max: 5, compare_to: `${pair}-msa` }
  });
});

behavioural.slice(0, 5).forEach((question, index) => fixtures.push({
  id: `hypothetical-${index + 1}`, group: 'hypothetical_drift', question_id: question.id,
  answer: 'لو واجهت هذا الموقف فسوف أجمع الفريق، وسأحلل الخيارات، ثم سأوزع المهام وسأتابع النتيجة، وبعد ذلك سأراجع ما حدث.',
  expectation: { flags_include: ['hypothetical_drift'] }
}));

behavioural.slice(0, 5).forEach((question, index) => {
  const other = behavioural.find(item => item.competency_id !== question.competency_id) || behavioural[(index + 1) % behavioural.length];
  fixtures.push({
    id: `off-competency-${index + 1}`, group: 'off_competency', question_id: question.id,
    answer: words(sampleText(other), 120), source_answer_question_id: other.id,
    expectation: { flags_include: ['off_competency'] }
  });
});

const output = {
  suite_version: '1.0',
  generated_at: new Date().toISOString(),
  description: 'مجموعة معايرة للمرحلة الثانية مبنية من نماذج الدليل وتعديلات متحكم بها.',
  counts: fixtures.reduce((result, item) => {
    result[item.group] = (result[item.group] || 0) + 1;
    return result;
  }, { total: fixtures.length }),
  fixtures
};
output.counts.total = fixtures.length;

const target = path.join(project, 'tests/answers/bias-suite.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${fixtures.length} bias fixtures to ${path.relative(project, target)}`);
