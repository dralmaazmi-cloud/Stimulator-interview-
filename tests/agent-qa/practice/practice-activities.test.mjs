#!/usr/bin/env node
// V2 learning activities (A1-A5): feedback, keyboard, persistence, console errors, layout at iPhone sizes.
//   BASE=http://localhost:4273 OUT=/tmp/v2b-shots node tests/agent-qa/practice/practice-activities.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4273';
const OUT = process.env.OUT || '/tmp/v2b-shots';
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [[390, 844], [375, 667]];
const questions = (await (await fetch(`${BASE}/data/derived/questions.json`)).json()).map(item => ({ ...item, display_question: String(item.display_question).replace(/\s+/g, ' ').trim() }));
const FW = {
  star_l: { keys: ['S', 'T', 'A', 'R', 'L'], fields: { S: 'situation', T: 'task', A: 'action', R: 'result', L: 'learning' }, labels: { S: 'الموقف', T: 'المهمة', A: 'الإجراء', R: 'النتيجة', L: 'التعلّم' }, answer: 'sample_answer_star_l' },
  seal: { keys: ['S', 'E', 'A', 'L'], fields: { S: 'situation', E: 'evaluation', A: 'action', L: 'leadership_impact' }, labels: { S: 'فهم الوضع', E: 'التقييم', A: 'الإجراء', L: 'الأثر القيادي' }, answer: 'sample_answer_seal' }
};
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`); if (!ok) failures += 1; };

const browser = await chromium.launch();
async function fresh(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ar' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  return { ctx, page, errors };
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('.practice-screen button, .practice-screen a.button, .budget-step')]
  .filter(node => node.offsetParent !== null).map(node => ({ t: node.textContent.trim().slice(0, 20), h: node.getBoundingClientRect().height, w: node.getBoundingClientRect().width }))
  .filter(item => item.h < 43.5));

for (const [w, h] of VIEWPORTS) {
  const tag = `${w}x${h}`;
  const { ctx, page, errors } = await fresh(w, h);

  // ---- A1 sort: correct arrangement
  await page.goto(`${BASE}/#/practice/a1`);
  await page.waitForSelector('.practice-card-chip');
  const qText = (await page.locator('.practice-question-text').innerText()).replace(/\s+/g, ' ').trim();
  const q = questions.find(item => item.display_question === qText);
  const fw = FW.star_l;
  const answer = q[fw.answer];
  const cardTexts = await page.locator('.practice-card-chip span:last-child').allInnerTexts();
  for (const key of fw.keys) {
    const text = answer[fw.fields[key]];
    await page.locator('.practice-card-chip', { hasText: text.slice(0, 25) }).first().click();
    await page.locator('.practice-slot').nth(fw.keys.indexOf(key)).locator('.practice-slot-button').click();
  }
  await page.getByRole('button', { name: 'تحقّق' }).click();
  const okText = await page.locator('.practice-feedback').innerText();
  check(`A1 sort correct feedback ${tag}`, okText.includes('5 من 5') && okText.includes('✓'), okText);
  check(`A1 sort cards were 5 ${tag}`, cardTexts.length === 5);
  await page.screenshot({ path: `${OUT}/a1-sort-correct-${tag}.png` });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lic:v2:a1') || 'null'));
  check(`A1 persisted lic:v2:a1 ${tag}`, stored?.sort?.done === 1 && stored.sort.firstTry[0] === 5, JSON.stringify(stored));
  await page.reload(); await page.waitForSelector('.practice-card-chip');
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('lic:v2:a1') || 'null'));
  check(`A1 persistence across reload ${tag}`, afterReload?.sort?.done === 1);

  // ---- A1 sort: incorrect (swap first two) -> wrong feedback with glyph and text, never colour only
  await page.goto(`${BASE}/#/practice/a1`); await page.reload(); await page.waitForSelector('.practice-card-chip');
  const qText2 = (await page.locator('.practice-question-text').innerText()).replace(/\s+/g, ' ').trim();
  const q2 = questions.find(item => item.display_question === qText2);
  const ans2 = q2[fw.answer];
  const wrongOrder = [fw.keys[1], fw.keys[0], ...fw.keys.slice(2)];
  for (let i = 0; i < 5; i += 1) {
    const text = ans2[fw.fields[wrongOrder[i]]];
    await page.locator('.practice-card-chip', { hasText: text.slice(0, 25) }).first().click();
    await page.locator('.practice-slot').nth(i).locator('.practice-slot-button').click();
  }
  await page.getByRole('button', { name: 'تحقّق' }).click();
  const badText = await page.locator('.practice-slots').innerText();
  check(`A1 sort wrong feedback has marks and message ${tag}`, badText.includes('✗') && badText.includes('الموقف يصف الظروف'), badText.slice(0, 200));
  await page.screenshot({ path: `${OUT}/a1-sort-wrong-${tag}.png` });

  // ---- A1 missing element
  await page.goto(`${BASE}/#/practice/a1?mode=missing`); await page.waitForSelector('.practice-block');
  const mText = (await page.locator('.practice-question-text').innerText()).replace(/\s+/g, ' ').trim();
  const mq = questions.find(item => item.display_question === mText);
  const shown = await page.locator('.practice-block p').allInnerTexts();
  const removed = fw.keys.find(key => !shown.includes(mq[fw.answer][fw.fields[key]]));
  const wrongKey = fw.keys.find(key => key !== removed);
  await page.locator('.practice-option', { hasText: fw.labels[wrongKey] }).first().click();
  check(`A1 missing wrong feedback ${tag}`, (await page.locator('.practice-feedback').innerText()).includes('ليس هذا'));
  await page.locator('.practice-option', { hasText: fw.labels[removed] }).first().click();
  const missOk = await page.locator('.practice-feedback').innerText();
  check(`A1 missing reveal ${tag}`, missOk.includes(fw.labels[removed]) && await page.locator('.practice-reveal').count() === 1, missOk);
  await page.screenshot({ path: `${OUT}/a1-missing-${tag}.png` });

  // ---- A2 correct, incorrect and keyboard
  await page.goto(`${BASE}/#/practice/a2`); await page.waitForSelector('.practice-choice');
  const q2text = (await page.locator('.practice-question-text').innerText()).replace(/\s+/g, ' ').trim();
  const key = questions.find(item => item.display_question === q2text).rubric_mode;
  const right = page.locator(`.practice-choice[data-mode="${key}"]`);
  await right.focus();
  await page.keyboard.press('Enter');
  const a2ok = await page.locator('.practice-feedback').innerText();
  check(`A2 keyboard answer + correct feedback ${tag}`, a2ok.includes('صحيح') && a2ok.includes('✓'), a2ok);
  check(`A2 focus moved to feedback ${tag}`, await page.evaluate(() => document.activeElement?.classList.contains('practice-feedback')));
  await page.screenshot({ path: `${OUT}/a2-${tag}.png` });
  await page.getByRole('button', { name: /السؤال التالي/ }).click();
  const q3 = (await page.locator('.practice-question-text').innerText()).replace(/\s+/g, ' ').trim();
  const key3 = questions.find(item => item.display_question === q3).rubric_mode;
  await page.locator(`.practice-choice[data-mode="${key3 === 'seal' ? 'star_l' : 'seal'}"]`).click();
  const a2bad = await page.locator('.practice-feedback').innerText();
  check(`A2 incorrect feedback ${tag}`, a2bad.includes('ليس هذا') && a2bad.includes('✗'), a2bad);
  const a2store = await page.evaluate(() => JSON.parse(localStorage.getItem('lic:v2:a2')));
  check(`A2 persists wrong ids ${tag}`, Array.isArray(a2store?.seen ? Object.keys(a2store.seen) : null) && Object.keys(a2store.seen).length === 2);

  // ---- A3 worked example (default pair), fading step
  await page.goto(`${BASE}/#/practice/a3`); await page.waitForSelector('.practice-example-text, .practice-step-note');
  const a3q = (await page.locator('.practice-question-text').innerText()).replace(/\s+/g, ' ').trim();
  check(`A3 default example C1-B3 ${tag}`, a3q === questions.find(item => item.id === 'C1-B3').display_question, a3q);
  const next = () => page.locator('.practice-actions .button').last();
  for (let i = 0; i < 6; i += 1) await next().click();
  await page.waitForSelector('.practice-chips');
  await page.screenshot({ path: `${OUT}/a3-summary-${tag}.png` });
  await next().click();
  for (let i = 0; i < 3; i += 1) await next().click();
  await page.waitForSelector('.practice-choose');
  check(`A3 next disabled before choosing ${tag}`, await next().isDisabled());
  const s1 = questions.find(item => item.id === 'C1-S1').sample_answer_seal;
  await page.locator('.practice-text-option', { hasText: s1.evaluation.slice(0, 25) }).click();
  check(`A3 wrong card feedback ${tag}`, (await page.locator('.practice-choose .practice-feedback').innerText()).includes('التقييم'));
  await page.locator('.practice-text-option', { hasText: s1.action.slice(0, 25) }).click();
  check(`A3 correct card feedback ${tag}`, (await page.locator('.practice-choose .practice-feedback').innerText()).includes('صحيح'));
  await page.screenshot({ path: `${OUT}/a3-faded-${tag}.png` });
  check(`A3 next enabled after correct ${tag}`, await next().isEnabled());
  const a3store = await page.evaluate(() => JSON.parse(localStorage.getItem('lic:v2:a3')));
  check(`A3 persists faded ${tag}`, a3store?.faded?.['C1-S1'] === true && a3store.seen.includes('C1-B3'), JSON.stringify(a3store));

  // ---- A4 budget
  await page.goto(`${BASE}/#/practice/a4`); await page.waitForSelector('.budget-row');
  check(`A4 default total feedback ${tag}`, (await page.locator('.practice-feedback').innerText()).includes('موزّع بشكل جيد'));
  await page.getByRole('button', { name: /زيادة وقت الاسم/ }).click();
  await page.getByRole('button', { name: /زيادة وقت الاسم/ }).click();
  check(`A4 over limit message ${tag}`, (await page.locator('.practice-feedback').innerText()).includes('تجاوزت الحدّ بـ 10 ثانية'));
  await page.reload(); await page.waitForSelector('.budget-row');
  const b = await page.evaluate(() => JSON.parse(localStorage.getItem('lic:v2:budget')));
  check(`A4 persistence across reload ${tag}`, b?.seconds?.identity === 15 && (await page.locator('.budget-readout').first().innerText()).includes('15'), JSON.stringify(b));
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: /تقليل وقت الاسم/ }).click();
  check(`A4 zero-second warning ${tag}`, await page.locator('.budget-warn:visible').count() === 1);
  await page.screenshot({ path: `${OUT}/a4-${tag}.png` });

  // ---- A5 flashcards
  await page.goto(`${BASE}/#/practice/a5?deck=due`); await page.waitForSelector('.flashcard');
  check(`A5 back hidden until reveal ${tag}`, await page.locator('.flashcard-back').isHidden());
  await page.getByRole('button', { name: 'أظهر الإجابة' }).click();
  await page.screenshot({ path: `${OUT}/a5-${tag}.png` });
  await page.getByRole('button', { name: 'لم أعرفها' }).click();
  check(`A5 unknown feedback ${tag}`, (await page.locator('.practice-feedback').innerText()).includes('ستعود إليك البطاقة قريبًا'));
  await page.getByRole('button', { name: 'أظهر الإجابة' }).click();
  await page.getByRole('button', { name: 'عرفتها' }).click();
  check(`A5 known feedback ${tag}`, (await page.locator('.practice-feedback').innerText()).includes('أحسنت'));
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('lic:v2:cards')));
  const boxes = Object.values(cards.cards).map(card => card.box).sort();
  check(`A5 boxes stored ${tag}`, boxes.length === 2 && boxes.join() === '1,2', JSON.stringify(cards));
  await page.reload(); await page.waitForSelector('.flashcard');
  const cards2 = await page.evaluate(() => JSON.parse(localStorage.getItem('lic:v2:cards')));
  check(`A5 persistence across reload ${tag}`, Object.keys(cards2.cards).length === 2);

  // ---- layout, targets, hub
  for (const route of ['practice', 'practice/a1', 'practice/a2', 'practice/a3', 'practice/a4', 'practice/a5', 'preparation', 'preparation/U2', 'preparation/U5']) {
    await page.goto(`${BASE}/#/${route}`); await page.waitForTimeout(300);
    check(`no horizontal overflow ${route} ${tag}`, await noOverflow(page));
    if (route.startsWith('practice')) {
      const small = await smallTargets(page);
      check(`44px targets ${route} ${tag}`, small.length === 0, JSON.stringify(small));
    }
  }
  await page.goto(`${BASE}/#/practice/a2`);
  check(`nav highlights preparation + back visible ${tag}`, await page.evaluate(() => document.querySelector('[data-nav="preparation"]').getAttribute('aria-current') === 'page' && !document.querySelector('#back-button').hidden));
  check(`no console errors ${tag}`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// reduced motion: no transition on progress fill
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/practice/a2`); await page.waitForSelector('.practice-progress-track i', { state: 'attached' });
  const dur = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.practice-progress-track i')).transitionDuration));
  check('reduced motion neutralises progress transition', dur <= 0.001, String(dur));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
