// alpha-5 (D3): «خريطة التغطية» — تُحسب محليًا من سجل المحاولات (attempts) بلا نداء خادم.
// 15 صفًا: الكفاءات الثماني، المبادئ الستة، «أسئلة الذكاء الاصطناعي»؛ عمودان «سلوكي» و«موقفي».
import { getAll, loadRotation } from './storage.js';
import { pickRotatedQuestions } from './rotation.js';
import { el, button, clear, notice, pageHead } from './ui.js';

export const COLUMNS = Object.freeze([
  { key: 'behavioural', label: 'سلوكي' },
  { key: 'scenario', label: 'موقفي' }
]);

export function statusText(cell) {
  if (!cell || !cell.attempts) return 'لم تُجرَّب';
  if (cell.best >= 80) return '80% فأكثر';
  if (cell.best >= 60) return '60–79%';
  return 'دون 60%';
}

export function statusTone(cell) {
  if (!cell || !cell.attempts) return 'none';
  if (cell.best >= 80) return 'strong';
  if (cell.best >= 60) return 'medium';
  return 'weak';
}

// دالة خالصة: تبني الصفوف والخانات من البيانات وسجل المحاولات.
export function buildCoverage(data, attemptRecords = []) {
  const attemptsById = new Map(attemptRecords.map(item => [item.id, Array.isArray(item.attempts) ? item.attempts : []]));
  const cellFor = questions => {
    const attempts = questions.flatMap(question => attemptsById.get(question.id) || []).filter(item => Number.isFinite(item.score));
    const best = attempts.length ? Math.max(...attempts.map(item => item.score)) : null;
    const last = attempts.length ? attempts.map(item => item.at).sort().at(-1) : null;
    return { questions, attempts: attempts.length, best, last };
  };
  const rows = [];
  data.competencies.forEach(competency => {
    const pool = data.primaryQuestions.filter(item => item.competency_id === competency.id && item.rubric_mode !== 'general');
    rows.push({
      id: competency.id,
      kind: 'competency',
      title: competency.name,
      cells: COLUMNS.map(column => ({ column: column.key, ...cellFor(pool.filter(item => item.type === column.key)) }))
    });
  });
  data.missionMap.forEach(principle => {
    const pool = data.primaryQuestions.filter(item => item.principle_id === principle.principle_id);
    rows.push({
      id: principle.principle_id,
      kind: 'principle',
      title: principle.title,
      cells: COLUMNS.map(column => ({ column: column.key, ...cellFor(pool.filter(item => item.type === column.key)) }))
    });
  });
  const aiPool = ['X1', 'X2'].map(id => data.questionById.get(id)).filter(Boolean);
  rows.push({
    id: 'AI',
    kind: 'additional',
    title: 'أسئلة الذكاء الاصطناعي',
    cells: [{ column: 'general', span: true, ...cellFor(aiPool) }]
  });
  const cells = rows.flatMap(row => row.cells).filter(cell => cell.questions.length);
  return {
    rows,
    total_cells: cells.length,
    tried_cells: cells.filter(cell => cell.attempts > 0).length,
    untried: cells.filter(cell => cell.attempts === 0)
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-AE', { dateStyle: 'medium' }).format(date);
}

function openCell(cell, rotation) {
  const question = pickRotatedQuestions(cell.questions, 1, rotation, Math.random)[0];
  if (!question) return;
  location.hash = `#/simulation?question=${encodeURIComponent(question.id)}&answer=text`;
}

function renderCell(cell, columnLabel, rotation) {
  const tone = statusTone(cell);
  const hasQuestions = cell.questions.length > 0;
  const node = el('button', {
    type: 'button',
    class: `coverage-cell ${tone} ${cell.span ? 'span' : ''}`,
    disabled: !hasQuestions,
    'aria-label': `${columnLabel}: ${hasQuestions ? statusText(cell) : 'لا أسئلة'}`
  },
  el('span', { class: 'coverage-cell-column', text: columnLabel }),
  hasQuestions ? el('strong', { class: 'coverage-status', text: statusText(cell) }) : el('strong', { class: 'coverage-status', text: 'لا أسئلة منشورة' }),
  hasQuestions ? el('span', { class: 'coverage-meta', text: `${cell.attempts} محاولة موثوقة` }) : null,
  hasQuestions ? el('span', { class: 'coverage-meta', text: `أفضل نسبة: ${cell.best == null ? '—' : `${cell.best}%`}` }) : null,
  hasQuestions ? el('span', { class: 'coverage-meta', text: `آخر محاولة: ${formatDate(cell.last)}` }) : null
  );
  if (hasQuestions) node.addEventListener('click', () => openCell(cell, rotation));
  return node;
}

export async function renderCoverageMap(root, data) {
  clear(root);
  const [attemptRecords, rotation] = await Promise.all([
    getAll('attempts').catch(() => []),
    loadRotation().catch(() => new Map())
  ]);
  const coverage = buildCoverage(data, attemptRecords);
  const trainUntried = button('درّبني على ما لم أجرّبه', {
    className: 'wide train-untried',
    disabled: !coverage.untried.length,
    onClick: () => {
      const cell = coverage.untried[Math.floor(Math.random() * coverage.untried.length)];
      if (cell) openCell(cell, rotation);
    }
  });
  root.append(
    pageHead('محسوبة محليًا', 'خريطة التغطية', 'المحاولات الموثوقة فقط تدخل في الحساب. اضغط على خانة لفتح سؤال منها.'),
    el('section', { class: 'card coverage-summary' },
      el('strong', { class: 'coverage-tried', text: `جرّبت ${coverage.tried_cells} من ${coverage.total_cells} خانة` }),
      el('small', { text: coverage.untried.length ? `${coverage.untried.length} خانة لم تُجرَّب بعد.` : 'جرّبت كل الخانات.' }),
      trainUntried
    ),
    el('div', { class: 'coverage-legend', 'aria-hidden': 'true' },
      ...[['none', 'لم تُجرَّب'], ['weak', 'دون 60%'], ['medium', '60–79%'], ['strong', '80% فأكثر']].map(([tone, label]) =>
        el('span', { class: `coverage-legend-item ${tone}`, text: label }))
    ),
    el('section', { class: 'coverage-grid', 'aria-label': 'خريطة التغطية' },
      ...coverage.rows.map(row => el('article', { class: `card coverage-row kind-${row.kind}`, 'data-row': row.id },
        el('h2', { class: 'coverage-row-title', text: row.title }),
        el('div', { class: 'coverage-cells' }, ...row.cells.map(cell =>
          renderCell(cell, cell.span ? 'سؤال معرفي' : (COLUMNS.find(column => column.key === cell.column)?.label || cell.column), rotation)))
      ))
    ),
    notice('هذه الخريطة أداة تدريبية محلية؛ لا تصدر نجاحًا أو رسوبًا ولا تتنبأ بنتيجة المقابلة الفعلية.', 'warning')
  );
}
