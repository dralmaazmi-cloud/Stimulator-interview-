#!/usr/bin/env node
// Backup export/import safety: validation before any clear, old-format import, export without answers.
//   BASE=http://localhost:4273 node tests/agent-qa/storage/backup.test.mjs
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4273';
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`); if (!ok) failures += 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.goto(`${BASE}/#/home`);
await page.waitForTimeout(500);

const SECRET = 'نص-إجابة-سري-للاختبار';
const FOLLOW = 'متابعة-سرية-للاختبار';
const QUOTE = 'اقتباس-سري-للاختبار';
const DRAFT = 'مسودة-سرية-للاختبار';

async function seed() {
  await page.evaluate(async ({ SECRET, FOLLOW, QUOTE, DRAFT }) => {
    const s = await import('/js/storage.js');
    await s.clearAll();
    await s.set('progress', { id: 'U1', completed: true });
    await s.set('checklists', { id: 'preparation-6.1', checked: [0, 2] });
    await s.set('settings', { id: 'self-intro-draft', text: DRAFT });
    await s.set('sessions', {
      id: 's1', status: 'completed', mode: 'single', draft_answer: SECRET,
      responses: [{ question: { id: 'C1-B3', question: 'q' }, answer: SECRET, followups: [{ question: 'f', answer: FOLLOW }],
        report: { final_score: 70, criteria: [{ key: 'a', score: 2, evidence: [QUOTE], justification: 'j' }], expected_points_coverage: [{ point: 'p', covered: true, quote: QUOTE }] } }],
      intro_response: { answer: SECRET, followups: [], report: { final_score: 60 } }
    });
    localStorage.setItem('lic:bookmarked-questions', JSON.stringify(['C1-B3']));
    localStorage.setItem('lic:v2:a1', JSON.stringify({ sort: { done: 2 } }));
    localStorage.setItem('lic:v2:cards', JSON.stringify({ v: 1, cards: { 'comp:C1': { box: 2 } } }));
  }, { SECRET, FOLLOW, QUOTE, DRAFT });
}
const snapshot = () => page.evaluate(async () => {
  const s = await import('/js/storage.js');
  return JSON.stringify({
    progress: await s.getAll('progress'), checklists: await s.getAll('checklists'), sessions: await s.getAll('sessions'), settings: await s.getAll('settings'),
    bookmarks: localStorage.getItem('lic:bookmarked-questions'), a1: localStorage.getItem('lic:v2:a1'), cards: localStorage.getItem('lic:v2:cards')
  });
});
const tryImport = payload => page.evaluate(async backup => {
  const s = await import('/js/storage.js');
  try { await s.importBackup(backup); return { ok: true }; } catch (error) { return { ok: false, message: error.message }; }
}, payload);
const exportWith = options => page.evaluate(async options => {
  const s = await import('/js/storage.js');
  return s.exportBackup({}, options);
}, options);

// 1. valid backup: round trip incl. lic:v2 keys
await seed();
const full = await exportWith({});
check('export includes v2 keys', full.v2['lic:v2:a1']?.sort?.done === 2 && full.v2['lic:v2:cards']?.cards?.['comp:C1']);
check('export default keeps answers', JSON.stringify(full).includes(SECRET) && JSON.stringify(full).includes(FOLLOW));
const before = await snapshot();
await page.evaluate(async () => { const s = await import('/js/storage.js'); await s.clearAll(); });
check('clearAll empties', (await snapshot()) !== before);
const imported = await tryImport(full);
check('valid backup imports', imported.ok, JSON.stringify(imported));
check('round trip restores all data and v2 keys', (await snapshot()) === before);

// 2. malformed backups leave data untouched and give Arabic errors
const base = JSON.parse(JSON.stringify(full));
const bad = {
  'wrong format': { ...base, format: 'x' },
  'wrong schema_version': { ...base, schema_version: 99 },
  'store not array': { ...base, stores: { ...base.stores, progress: { id: 'U1' } } },
  'record without id': { ...base, stores: { ...base.stores, progress: [{ completed: true }] } },
  'id wrong type': { ...base, stores: { ...base.stores, progress: [{ id: { a: 1 } }] } },
  'session responses not array': { ...base, stores: { ...base.stores, sessions: [{ id: 'x', responses: 'oops' }] } },
  'bookmarks not strings': { ...base, bookmarks: [1, 2] },
  'bookmarks not array': { ...base, bookmarks: 'C1-B3' },
  'v2 bad key': { ...base, v2: { 'evil:key': 1 } },
  'null': null,
  'oversize': { ...base, metadata: { blob: 'ا'.repeat(3 * 1024 * 1024) } }
};
for (const [name, payload] of Object.entries(bad)) {
  const result = await tryImport(payload);
  const after = await snapshot();
  check(`malformed (${name}) rejected with Arabic error`, !result.ok && /[؀-ۿ]/.test(result.message || ''), JSON.stringify(result).slice(0, 120));
  check(`malformed (${name}) leaves data intact`, after === before);
}

// 3. old-format backup (schema_version 1, no v2, no include_answers) still imports
const old = { format: 'leadership-interview-coach-backup', schema_version: 1, exported_at: '2026-01-01T00:00:00.000Z', metadata: {},
  stores: { progress: [{ id: 'U2', completed: true }], sessions: [{ id: 'legacy-1', status: 'completed', responses: [] }], checklists: [{ id: 'preparation-6.1', checked: [1] }] },
  bookmarks: ['C2-S1'] };
const oldResult = await tryImport(old);
check('old-format backup imports', oldResult.ok, JSON.stringify(oldResult));
const afterOld = JSON.parse(await snapshot());
check('old-format data present', afterOld.progress.length === 1 && afterOld.progress[0].id === 'U2' && afterOld.sessions[0].id === 'legacy-1' && afterOld.bookmarks === '["C2-S1"]');
check('old-format import keeps existing lic:v2 keys', afterOld.a1 !== null);

// 4. export without answers strips text
await seed();
const lean = await exportWith({ includeAnswers: false });
const text = JSON.stringify(lean);
check('no-answers export strips answers', !text.includes(SECRET));
check('no-answers export strips follow-ups', !text.includes(FOLLOW));
check('no-answers export strips report quotes', !text.includes(QUOTE));
check('no-answers export strips self-intro draft', !text.includes(DRAFT));
check('no-answers export keeps scores and ids', lean.stores.sessions[0].responses[0].report.final_score === 70 && lean.stores.sessions[0].id === 's1' && lean.include_answers === false);
check('no-answers export keeps progress and v2 keys', lean.stores.progress.length === 1 && Boolean(lean.v2['lic:v2:a1']));
check('no-answers export still importable', (await tryImport(lean)).ok);

// 5. settings UI: checkbox, notices, accordion closed, labels
await page.goto(`${BASE}/#/settings`);
await page.waitForSelector('.settings-accordion');
check('appearance accordion closed by default', await page.evaluate(() => !document.querySelector('#settings-appearance').open));
await page.locator('#settings-data summary').click();
const box = page.getByLabel('تضمين نصوص إجاباتك');
check('include-answers checkbox default checked', await box.isChecked());
check('personal-answers warning visible', (await page.locator('.backup-answers-note').innerText()).includes('إجاباتك الشخصية'));
await box.uncheck();
check('warning updates when unchecked', (await page.locator('.backup-answers-note').innerText()).includes('لن يتضمن'));
const panelText = await page.locator('#settings-data').innerText();
check('backup notice no longer claims answers are excluded', !panelText.includes('نصوص الإجابات في سجل المحاولات لا تدخل في التصدير'));
await page.locator('#settings-appearance summary').click();
const pressed = await page.locator('#settings-appearance .segmented button').evaluateAll(nodes => nodes.every(node => node.hasAttribute('aria-pressed')));
check('preference buttons expose aria-pressed', pressed);
for (const label of ['حجم الخط', 'تباعد السطور', 'تصدير البيانات', 'استيراد نسخة']) check(`label kept: ${label}`, (await page.locator('.more-screen').evaluate(node => node.textContent)).includes(label));
// import through the UI with a malformed file shows an Arabic error and keeps data
const beforeUi = await snapshot();
await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"nope"}') });
await page.waitForSelector('.toast');
check('UI shows Arabic error toast for bad file', /[؀-ۿ]/.test(await page.locator('.toast').innerText()));
check('UI bad file leaves data intact', (await snapshot()) === beforeUi);
check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
