import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class TestNode {
  constructor(tagName = '') {
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    this.className = '';
    this._text = '';
  }

  append(...nodes) {
    nodes.flat(Infinity).filter(node => node != null).forEach(node => {
      assert.ok(node instanceof TestNode, `print renderer appended a non-node value: ${String(node)}`);
      this.childNodes.push(node);
    });
  }

  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener() {}

  set textContent(value) {
    this._text = String(value ?? '');
    this.childNodes = [];
  }

  get textContent() {
    return this._text + this.childNodes.map(node => node.textContent).join('');
  }
}

class TestTextNode extends TestNode {
  constructor(value) {
    super('#text');
    this._text = String(value ?? '');
  }
}

globalThis.Node = TestNode;
globalThis.document = {
  createElement: tag => new TestNode(tag),
  createElementNS: (_namespace, tag) => new TestNode(tag),
  createTextNode: value => new TestTextNode(value)
};

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const json = relative => JSON.parse(fs.readFileSync(path.join(project, relative), 'utf8'));
const questions = json('dist/data/derived/questions.json');
const competencies = json('dist/data/derived/competencies.json');
const missionMap = json('dist/data/derived/mission-map.json');
const lessons = json('dist/data/derived/lessons.json');
const data = {
  reference: json('dist/data/reference.json'),
  questions,
  competencies,
  missionMap,
  lessons,
  questionById: new Map(questions.map(item => [item.id, item])),
  competencyById: new Map(competencies.map(item => [item.id, item])),
  primaryIdsByCompetency: new Map(competencies.map(item => [item.id, item.question_ids])),
  lessonById: new Map(lessons.map(item => [item.id, item]))
};

const { buildPrintBook } = await import('../dist/js/print-book.js');

function descendants(root) {
  return [root, ...root.childNodes.flatMap(descendants)];
}

function withClass(root, className) {
  return descendants(root).filter(node => String(node.className).split(/\s+/).includes(className));
}

const fullBook = buildPrintBook(data, { kind: 'preparation' });
const questionPages = withClass(fullBook, 'print-question-page');
assert.equal(questionPages.length, 70, 'the full preparation book must render one complete section for every published question');
assert.equal(withClass(fullBook, 'print-model-answer').length, 70, 'every printed question must contain a model-answer section');
assert.equal(withClass(fullBook, 'print-empty').length, 0, 'no published question may print an empty-answer message');
assert.deepEqual(new Set(questionPages.map(node => node.dataset.questionId)), new Set(questions.map(item => item.id)));
questions.forEach(question => assert.ok(fullBook.textContent.includes(question.display_question), `printed book is missing ${question.id}`));
['محتويات الكتاب', 'افهم المقابلة', 'بناء الإجابة النموذجية', 'الكفاءات الثمانية', 'قيادة المهمة', 'الجاهزية النهائية', 'أسئلة الذكاء الاصطناعي']
  .forEach(label => assert.ok(fullBook.textContent.includes(label), `printed book is missing chapter label: ${label}`));

const competencyBook = buildPrintBook(data, { kind: 'competency', id: 'C3' });
assert.equal(withClass(competencyBook, 'print-question-page').length, 13);
assert.ok(competencyBook.textContent.includes('فهم الكفاءة وما الذي تقيسه'));
assert.ok(competencyBook.textContent.includes('كيف تُظهرها في المقابلة'));

const questionsBook = buildPrintBook(data, { kind: 'questions' });
assert.equal(withClass(questionsBook, 'print-question-page').length, 70,
  'the questions book must render all 70 approved questions');
assert.equal(withClass(questionsBook, 'print-model-answer').length, 70,
  'the questions book must include a complete model-answer section for every question');
assert.ok(questionsBook.textContent.includes('الأسئلة والإجابات النموذجية'));

const sealQuestion = questions.find(item => item.sample_answer_seal && item.sample_answer);
const sealBook = buildPrintBook(data, { kind: 'question', id: sealQuestion.id });
assert.ok(sealBook.textContent.includes('إجابة نموذجية موسّعة، مبنية على إجابة الدليل'));
assert.ok(sealBook.textContent.includes('إجابة الدليل كما هي'));

// alpha-6.1 (restored): أسماء عناصر SEAL المعتمدة في الكتاب المطبوع (C1-S1) وفي كتاب الأسئلة، وSTAR-L يحتفظ بأسمائه (C1-B3).
const SEAL_NAMES = ['فهم الوضع', 'التقييم', 'الإجراء', 'الأثر القيادي'];
const partLabels = root => withClass(root, 'print-answer-part').map(node => node.childNodes.find(child => child.tagName === 'H4').textContent);
const c1s1Book = buildPrintBook(data, { kind: 'question', id: 'C1-S1' });
assert.deepEqual(partLabels(c1s1Book), SEAL_NAMES, 'printed SEAL answer must use exactly the four agreed element names in order');
['تقييم الخيارات', 'خطة العمل'].forEach(label => assert.ok(!c1s1Book.textContent.includes(label), `printed book must not contain «${label}»`));
const c1b3Book = buildPrintBook(data, { kind: 'question', id: 'C1-B3' });
assert.deepEqual(partLabels(c1b3Book), ['الموقف', 'المهمة ودورك', 'الإجراء', 'النتيجة', 'التعلّم'], 'STAR-L keeps its own names');
assert.ok(!c1b3Book.textContent.includes('فهم الوضع'));
// نص الدليل نفسه يحوي «تقييم الخيارات» في تعريف كفاءة (محتوى مرجعي ثابت)، لذا الفحص هنا على تسميات عناصر الإجابة لا على نص الكتاب كله.
const questionsBookLabels = partLabels(questionsBook);
['تقييم الخيارات', 'خطة العمل'].forEach(label => assert.ok(!questionsBookLabels.includes(label), `questions book answer labels must not contain «${label}»`));
const questionsBookC1S1 = withClass(questionsBook, 'print-question-page').find(node => node.dataset.questionId === 'C1-S1');
assert.ok(questionsBookC1S1, 'questions book must contain C1-S1');
assert.deepEqual(partLabels(questionsBookC1S1), SEAL_NAMES, 'questions book prints the four agreed SEAL names for C1-S1');
const sealPages = withClass(questionsBook, 'print-question-page').filter(node => data.questionById.get(node.dataset.questionId)?.rubric_mode === 'seal');
assert.equal(sealPages.length, 22);
sealPages.forEach(node => assert.deepEqual(partLabels(node), SEAL_NAMES, `questions book SEAL page ${node.dataset.questionId} must use the four agreed names`));

const generalBook = buildPrintBook(data, { kind: 'question', id: 'X1' });
assert.ok(generalBook.textContent.includes(data.questionById.get('X1').sample_answer));

console.log('PASS print book: 70 questions rendered with model answers, chapters, focused and competency scopes.');
