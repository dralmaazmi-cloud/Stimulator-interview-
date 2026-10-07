import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(project, relative));
const text = relative => read(relative).toString('utf8');

const home = text('dist/js/home.js');
assert.match(home, /جهّز تعريفك الشخصي/);
assert.match(home, /أنشئ مقدمة احترافية وتدرّب على توقيتها/);
assert.match(home, /هذا المحتوى اجتهاد شخصي أُعد لأغراض التدريب والتطوير الذاتي فقط، ولا يُعد اختبارًا أو تقييمًا رسميًا\./);
assert.match(home, /ولا تنسونا من دعائكم/);

const ui = text('dist/js/ui.js');
assert.match(ui, /تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية\./);
assert.match(ui, /تنبيه: هذا اجتهاد تدريبي وليس تقييمًا رسميًا\./);
assert.match(ui, /training-disclaimer/);

const simulation = text('dist/js/simulation.js');
assert.match(simulation, /const drawPrivacyGate/);
assert.match(simulation, /تُرسل إجاباتك النصية أو الصوتية إلى خدمة ذكاء اصطناعي لغرض التفريغ والتقييم/);
assert.match(simulation, /تجنّب ذكر الأسماء والبيانات الشخصية والمعلومات الوظيفية السرية أو الحساسة/);
assert.match(simulation, /استخدم أمثلة مجهولة الهوية، مع الإبقاء على تفاصيل الموقف ودورك وإجراءاتك والنتيجة/);
assert.doesNotMatch(simulation, /استخدم أمثلة عامة أو مجهولة الهوية/);
assert.match(simulation, /يطلب التطبيق من المزود عدم تخزين المحتوى، لكنه يغادر جهازك مؤقتًا للمعالجة\./);
assert.match(simulation, /فهمت تنبيه الخصوصية/);
assert.match(simulation, /فهمت، متابعة/);
assert.match(simulation, /continueButton\.disabled = !acknowledgement\.checked/);
assert.match(simulation, /drawPrivacyGate\(session, questions, pending\)/);
assert.match(simulation, /drawPrivacyGate\(session, \[requestedQuestion\]\)/);

const selfIntro = text('dist/js/self-intro.js');
['من أنت؟', 'مسيرتك وخبرتك', 'قيمتك للدور', 'طموحك المهني'].forEach(label => assert.match(selfIntro, new RegExp(label.replace('؟', '\\؟'))));
assert.match(selfIntro, /bindExclusiveAccordions/);
assert.match(selfIntro, /trainingDisclaimer\('answer'\)/);
assert.match(selfIntro, /تحسين الصياغة بالذكاء الاصطناعي — اختياري/);
assert.match(selfIntro, /استخدم تعريفًا مهنيًا عامًا بدل الأسماء أو الجهات/);

const report = text('dist/js/report.js');
assert.match(report, /trainingDisclaimer\(question\.id === 'SELF-INTRO' \? 'answer' : 'evaluation'\)/);
assert.match(report, /panel\.append\(trainingDisclaimer\('answer'\)\)/);
assert.match(report, /trainingDisclaimer\('evaluation'\)/);

const printBook = text('dist/js/print-book.js');
assert.match(printBook, /print-training-disclaimer/);
assert.match(printBook, /تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية\./);
assert.match(printBook, /print-cover-disclaimer/);

const css = text('dist/css/styles.css');
['.training-disclaimer', '.privacy-reminder', '.simulation-privacy-page', '.intro-question-group', '.home-start-card.self-intro', '.home-disclaimer'].forEach(selector => {
  assert.ok(css.includes(selector), `missing alpha-9 style: ${selector}`);
});
assert.match(css, /\.back-button svg \{ transform: none !important; \}/);
assert.match(css, /home-start-copy strong \{ font-size: 1\.04rem; \}/);
assert.match(css, /home-start-card\.simulation \.home-start-copy strong \{ font-size: 1\.22rem; \}/);
assert.match(css, /home-disclaimer p \{ font-size: \.64rem/);

const index = text('dist/index.html');
assert.match(index, /styles\.css\?v=0\.6\.0-alpha-10/);
assert.match(index, /app\.js\?v=0\.6\.0-alpha-10/);
assert.match(index, /<path d="m9 18 6-6-6-6"/);
assert.equal(JSON.parse(text('package.json')).version, '0.6.0-alpha-10');
assert.match(text('dist/js/config.js'), /appVersion: '0\.6\.0-alpha-10'/);
assert.match(text('dist/js/config.js'), /promptVersion: 'evaluation-1\.3'/);
assert.match(text('dist/sw.js'), /leadership-interview-coach-v0\.6\.0-alpha-10-51d413de/);

const prompts = text('api/_lib/prompts.js');
assert.match(prompts, /لا تخفض الدرجة، ولا تستخدم العلم generic، لمجرد أن المستخدم أخفى أسماء الأشخاص أو الجهات أو المشاريع/);
assert.match(prompts, /لا تشترط رقمًا دقيقًا أو معلومة حساسة لإثبات الأثر/);
assert.match(prompts, /لا تستبدل التفاصيل التي أخفاها المستخدم حفاظًا على الخصوصية/);
assert.match(text('api/evaluate.js'), /PROMPT_VERSION = 'evaluation-1\.3'/);

const referenceHash = crypto.createHash('sha256').update(read('dist/data/reference.json')).digest('hex');
assert.equal(referenceHash, '51d413def77dd11a33a672222acbad46e9612da0f2d202bc28537928c2b7a357');

console.log('alpha-10 regression tests passed');
