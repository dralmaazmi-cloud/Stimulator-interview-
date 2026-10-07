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

const generalBook = buildPrintBook(data, { kind: 'question', id: 'X1' });
assert.ok(generalBook.textContent.includes(data.questionById.get('X1').sample_answer));

console.log('PASS print book: 70 questions rendered with model answers, chapters, focused and competency scopes.');
