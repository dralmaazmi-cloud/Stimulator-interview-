#!/usr/bin/env node
// V2 release-candidate E2E (Chromium only; this does not prove iOS Safari behaviour).
//   BASE=http://localhost:4273 OUT=/tmp/qa-final/e2e node tests/agent-qa/e2e/v2-release.test.mjs
//   ONLY=tabs,activities,... limits sections (names: tabs activities sim errors voice offline persist backup layout font).
// Needs a server that mounts /api (the audit-harness mock server). Network and paid APIs are never used.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4273';
const OUT = process.env.OUT || '/tmp/qa-final/e2e';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });

const ANSWER = 'في بداية المشروع كان الفريق متأخرًا عن الجدول. كانت مهمتي إعادة توزيع العمل بين الأعضاء. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي وتابعت التنفيذ يوميًا. اكتمل المشروع في الموعد المحدد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
const SECRET = 'عبارة-سرية-للاختبار-QA7731';
let failures = 0;
let passes = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 400)}`);
  if (ok) passes += 1; else failures += 1;
};
const sections = [];
const section = (name, fn) => sections.push([name, fn]);

const browser = await chromium.launch();
const voiceBrowser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

async function fresh({ w = 390, h = 844, b = browser, mobile = true, perms = [], extra = {} } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'ar', isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2, permissions: perms, ...extra });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  return { ctx, page, errors };
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const norm = s => String(s).replace(/\s+/g, ' ').trim();
const idb = (page, store) => page.evaluate(s => new Promise(resolve => {
  const r = indexedDB.open('leadership-interview-coach');
  r.onsuccess = () => { const g = r.result.transaction(s).objectStore(s).getAll(); g.onsuccess = () => resolve(g.result); };
  r.onerror = () => resolve(null);
}), store);
async function passPrivacy(page) {
  await page.waitForSelector('.simulation-privacy-page', { timeout: 10000 });
  await page.locator('#simulation-privacy-acknowledgement').check();
  await page.locator('.simulation-privacy-continue').click();
}
async function toQuestion(page, { voice = false } = {}) {
  await page.goto(`${BASE}/#/home`);
  await page.goto(`${BASE}/#/simulation${voice ? '?answer=voice' : ''}`);
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await passPrivacy(page);
  await page.waitForSelector('.ai-question-card');
}
const submitBtn = page => page.locator('button:has-text("إرسال الإجابة للتقييم")');
// Console errors we provoke on purpose by forcing HTTP error statuses.
const unexpected = errors => errors.filter(e => !/Failed to load resource|net::ERR_|status of (4|5)\d\d/.test(e));

// ---------------------------------------------------------------- 1. five tabs + back
section('tabs', async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(`${BASE}/#/home`);
  await page.waitForSelector('.home-dashboard');
  check('html dir=rtl lang=ar', await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'));
  const tabs = await page.locator('.bottom-nav a').evaluateAll(n => n.map(a => ({ nav: a.dataset.nav, href: a.getAttribute('href'), text: a.textContent.trim() })));
  check('bottom nav has exactly 5 tabs', tabs.length === 5, JSON.stringify(tabs));
  const expect = { home: '#/home', preparation: '#/preparation', simulation: '#/simulation', reports: '#/reports', more: '#/settings' };
  for (const nav of Object.keys(expect)) {
    await page.locator(`.bottom-nav a[data-nav="${nav}"]`).click();
    await page.waitForTimeout(450);
    const state = await page.evaluate(n => ({
      hash: location.hash.split('?')[0],
      current: document.querySelector(`.bottom-nav a[data-nav="${n}"]`).getAttribute('aria-current'),
      others: [...document.querySelectorAll('.bottom-nav a')].filter(a => a.dataset.nav !== n && a.getAttribute('aria-current') === 'page').length,
      title: document.querySelector('#route-title')?.textContent.trim(),
      h1: document.querySelector('main h1')?.textContent.trim() || '',
      busy: document.querySelector('#main-content')?.getAttribute('aria-busy'),
      empty: !document.querySelector('#main-content')?.children.length
    }), nav);
    check(`tab ${nav}: hash ${expect[nav]}, aria-current, content rendered`, state.hash === expect[nav] && state.current === 'page' && state.others === 0 && !state.empty && state.busy !== 'true', JSON.stringify(state));
    check(`tab ${nav}: no horizontal overflow`, await noOverflow(page));
  }
  // back button on an inner page and browser back
  await page.goto(`${BASE}/#/preparation`);
  await page.waitForSelector('.smart-accordion, .lesson-card, main h1');
  await page.goto(`${BASE}/#/preparation/U1`);
  await page.waitForSelector('main h1');
  const backVisible = await page.evaluate(() => !document.querySelector('#back-button').hidden);
  check('back button visible on inner page', backVisible);
  await page.locator('#back-button').click();
  await page.waitForTimeout(500);
  check('back button returns to previous route (#/preparation)', (await page.evaluate(() => location.hash)).startsWith('#/preparation') && !(await page.evaluate(() => location.hash)).includes('U1'), await page.evaluate(() => location.hash));
  await page.locator('.bottom-nav a[data-nav="home"]').click();
  await page.waitForTimeout(400);
  check('home: header and back button hidden (by design)', await page.evaluate(() => document.querySelector('#back-button').hidden && document.querySelector('#app-header').hidden));
  await page.goto(`${BASE}/#/preparation`);
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/#/settings`);
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(500);
  check('browser back works after tab navigation', (await page.evaluate(() => location.hash)).startsWith('#/preparation'), await page.evaluate(() => location.hash));
  // unknown route
  await page.goto(`${BASE}/#/does-not-exist`);
  await page.waitForTimeout(500);
  check('unknown route shows a recovery link, not a blank page', (await page.locator('main a[href="#/home"]').count()) > 0, await page.locator('main').innerText());
  check('tabs: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
});

// ---------------------------------------------------------------- 2. A1-A5 + U1/U2
section('activities', async () => {
  const { ctx, page, errors } = await fresh();
  const questions = (await (await fetch(`${BASE}/data/derived/questions.json`)).json()).map(q => ({ ...q, display_question: norm(q.display_question) }));
  const F = { keys: ['S', 'T', 'A', 'R', 'L'], fields: { S: 'situation', T: 'task', A: 'action', R: 'result', L: 'learning' } };
  // A1 sort
  await page.goto(`${BASE}/#/practice/a1`);
  await page.waitForSelector('.practice-card-chip');
  const qTextA1 = norm(await page.locator('.practice-question-text').innerText());
  const q = questions.find(i => i.display_question === qTextA1);
  for (const [idx, key] of F.keys.entries()) {
    await page.locator('.practice-card-chip', { hasText: q.sample_answer_star_l[F.fields[key]].slice(0, 25) }).first().click();
    await page.locator('.practice-slot').nth(idx).locator('.practice-slot-button').click();
  }
  await page.getByRole('button', { name: 'تحقّق' }).click();
  const a1 = await page.locator('.practice-feedback').innerText();
  check('A1 sort: correct order gives 5 من 5 with check glyph', a1.includes('5 من 5') && a1.includes('✓'), a1);
  // A2
  await page.goto(`${BASE}/#/practice/a2`);
  await page.waitForSelector('.practice-choice');
  const qTextA2 = norm(await page.locator('.practice-question-text').innerText());
  const mode = questions.find(i => i.display_question === qTextA2).rubric_mode;
  await page.locator(`.practice-choice[data-mode="${mode}"]`).click();
  const a2 = await page.locator('.practice-feedback').innerText();
  check('A2: correct choice gives صحيح + glyph', a2.includes('صحيح') && a2.includes('✓'), a2);
  // A3
  await page.goto(`${BASE}/#/practice/a3`);
  await page.waitForSelector('.practice-example-text, .practice-step-note');
  const next = () => page.locator('.practice-actions .button').last();
  for (let i = 0; i < 6; i += 1) await next().click();
  check('A3: worked example reaches the summary chips', await page.locator('.practice-chips').count() > 0);
  // A4
  await page.goto(`${BASE}/#/practice/a4`);
  await page.waitForSelector('.budget-row');
  await page.getByRole('button', { name: /زيادة وقت الاسم/ }).click();
  await page.getByRole('button', { name: /زيادة وقت الاسم/ }).click();
  check('A4: exceeding the budget shows an over-limit message', (await page.locator('.practice-feedback').innerText()).includes('تجاوزت الحدّ'));
  // A5
  await page.goto(`${BASE}/#/practice/a5?deck=due`);
  await page.waitForSelector('.flashcard');
  check('A5: back of card hidden until reveal', await page.locator('.flashcard-back').isHidden());
  await page.getByRole('button', { name: 'أظهر الإجابة' }).click();
  check('A5: back visible after reveal', await page.locator('.flashcard-back').isVisible());
  await page.getByRole('button', { name: 'عرفتها' }).click();
  check('A5: known feedback', (await page.locator('.practice-feedback').innerText()).includes('أحسنت'));
  // U1 / U2 mini-checks
  for (const [lesson, wrong] of [['U1', 'المعلومات النظرية التي تحفظها'], ['U2', 'الموقف']]) {
    await page.goto(`${BASE}/#/preparation/${lesson}`);
    await page.waitForSelector('.mini-check');
    const mini = page.locator('.mini-check');
    await mini.locator('.mini-check-option', { hasText: wrong }).first().click();
    const fb = await mini.locator('.practice-feedback').innerText();
    check(`${lesson} mini-check: wrong answer gives glyph + explanation and locks options`, fb.includes('✗') && fb.length > 40 && await mini.locator('.mini-check-option:disabled').count() >= 2, fb);
  }
  check('activities: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
});

// ---------------------------------------------------------------- 3. single question text sim -> report -> resend (+ shared context for backup)
let backupSeed = null; // { ctx, page } kept alive for the backup section
section('sim', async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(`${BASE}/#/simulation`);
  await page.waitForSelector('.simulation-start');
  // mode select and answer-method toggle
  const modeTitles = await page.locator('.simulation-mode-card strong').allInnerTexts();
  check('simulation setup lists 4 modes', modeTitles.length === 4, modeTitles.join('|'));
  await page.locator('.simulation-mode-card', { hasText: 'مقابلة واقعية' }).click();
  check('mode select marks card pressed', (await page.locator('.simulation-mode-card.selected strong').innerText()).includes('مقابلة واقعية'));
  await page.locator('.simulation-mode-card', { hasText: 'سؤال واحد' }).click();
  await page.locator('.simulation-answer-switch button', { hasText: 'إجابة صوتية' }).click();
  check('answer-method toggle -> voice', await page.locator('.simulation-answer-switch button.active').innerText().then(t => t.includes('صوتية')));
  await page.locator('.simulation-answer-switch button', { hasText: 'إجابة نصية' }).click();
  check('answer-method toggle -> text', await page.locator('.simulation-answer-switch button.active').innerText().then(t => t.includes('نصية')));
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.simulation-privacy-page');
  check('privacy gate: continue disabled until acknowledged', await page.locator('.simulation-privacy-continue').isDisabled());
  await passPrivacy(page);
  await page.waitForSelector('.ai-question-card');
  check('empty answer: submit disabled', await submitBtn(page).isDisabled());
  // first attempt fails with 503 -> resend after lock -> succeeds
  let calls = 0;
  await page.route('**/api/evaluate', route => { calls += 1; if (calls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'AI_OVERLOADED', error: 'x' }) }); return route.continue(); });
  await page.locator('textarea.simulation-answer-input').fill(`${ANSWER} ${SECRET}`);
  await submitBtn(page).click();
  await page.waitForSelector('.resend-evaluation:not([hidden])', { timeout: 15000 });
  check('503 first attempt: resend button appears, answer kept', await page.locator('textarea.simulation-answer-input').inputValue().then(v => v.includes(SECRET)));
  check('resend initially locked (countdown)', await page.locator('.resend-evaluation').isDisabled() && (await page.locator('.retry-countdown').innerText()).length > 0);
  await page.waitForFunction(() => { const b = document.querySelector('.resend-evaluation'); return b && !b.disabled; }, null, { timeout: 20000 });
  await page.locator('.resend-evaluation').click();
  await page.waitForSelector('.evaluation-report', { timeout: 25000 });
  check('resend yields a report with a score', /\d/.test(await page.locator('.final-score').first().innerText()));
  check('evaluate was called twice (503 then ok)', calls === 2, String(calls));
  const body = await page.locator('body').innerText();
  check('report has no null/undefined/NaN text', !/\b(null|undefined|NaN)\b/.test(body));
  await page.screenshot({ path: `${OUT}/sim-report.png`, fullPage: true });
  await page.locator('button:has-text("إنهاء وعرض الملخص")').click();
  await page.waitForSelector('.session-summary');
  const sessions = await idb(page, 'sessions');
  check('session persisted as completed after finish', sessions.filter(s => s.status === 'completed').length === 1 && sessions.filter(s => s.status === 'in_progress').length === 0, JSON.stringify(sessions.map(s => s.status)));
  await page.goto(`${BASE}/#/reports`);
  await page.waitForSelector('.session-history-card');
  await page.reload();
  await page.waitForSelector('.session-history-card');
  check('saved report survives reload', await page.locator('.session-history-card').count() === 1);
  check('sim: no unexpected console errors', unexpected(errors).length === 0, errors.join(' | '));
  backupSeed = { ctx, page };
});

// ---------------------------------------------------------------- 4. AI error states
section('errors', async () => {
  const cases = [
    ['503 AI_OVERLOADED', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'AI_OVERLOADED', error: 'overloaded' }) }), /مزدحمة/],
    ['504 gateway timeout', route => route.fulfill({ status: 504, contentType: 'text/plain', body: 'Gateway Timeout' }), /وقتًا أطول من المعتاد/],
    ['422 AI_SCHEMA_FAILED', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'AI_SCHEMA_FAILED', error: 'schema' }) }), /لم يصلنا تقييم مكتمل/],
    ['aborted request', route => route.abort('failed'), /تعذّر الاتصال بالخدمة/]
  ];
  for (const [name, handler, message] of cases) {
    const { ctx, page, errors } = await fresh();
    await toQuestion(page);
    await page.route('**/api/evaluate', handler);
    await page.locator('textarea.simulation-answer-input').fill(`${ANSWER} ${SECRET}`);
    await submitBtn(page).click();
    await page.waitForSelector('.resend-evaluation:not([hidden])', { timeout: 15000 });
    const notice = await page.locator('.notice, .notice-danger, [class*="notice"]').first().innerText().catch(() => '');
    const main = await page.locator('main').innerText();
    check(`${name}: Arabic message shown`, message.test(main), main.slice(0, 300));
    check(`${name}: answer text kept`, (await page.locator('textarea.simulation-answer-input').inputValue()).includes(SECRET));
    check(`${name}: resend control present (locked or enabled), no report shown`, await page.locator('.evaluation-report').count() === 0);
    check(`${name}: no raw error code / stack leaked`, !/AI_[A-Z_]+|TypeError|undefined|\[object/.test(main), main.slice(0, 300));
    check(`${name}: no horizontal overflow`, await noOverflow(page));
    await page.screenshot({ path: `${OUT}/err-${name.split(' ')[0]}.png` });
    check(`${name}: no unexpected console errors`, unexpected(errors).length === 0, errors.join(' | '));
    void notice;
    await ctx.close();
  }

  // 9 s delay: waiting card shows phase + elapsed seconds, then completes
  {
    const { ctx, page, errors } = await fresh();
    await toQuestion(page);
    await page.route('**/api/evaluate', async route => { await new Promise(r => setTimeout(r, 9000)); try { await route.continue(); } catch { /* page closed */ } });
    await page.locator('textarea.simulation-answer-input').fill(ANSWER);
    await submitBtn(page).click();
    await page.waitForSelector('.ai-working');
    check('waiting: card is role=status', await page.locator('.ai-working').getAttribute('role') === 'status');
    check('waiting: submit is disabled during the request (no double submit)', await submitBtn(page).count() === 0 || await submitBtn(page).first().isDisabled() || !(await submitBtn(page).first().isVisible()));
    await page.waitForTimeout(3300);
    const phase3 = await page.locator('.ai-working-phase').innerText();
    const secs3 = Number((phase3.match(/(\d+) ث/) || [])[1]);
    check('waiting @~3s: phase label and elapsed seconds shown', /جارٍ/.test(phase3) && secs3 >= 2 && secs3 <= 5, phase3);
    await page.waitForSelector('.ai-working .slow-notice', { timeout: 5000 }).catch(() => {});
    const full = await page.locator('.ai-working').innerText().catch(() => '');
    check('waiting @~9s: slow notice (after 8 s) and elapsed seconds shown', /ما زلنا نحاول الاتصال/.test(full) && /(\d+) ث/.test(full), full);
    await page.screenshot({ path: `${OUT}/waiting-9s.png` });
    await page.waitForSelector('.evaluation-report', { timeout: 20000 });
    check('delayed request completes to a report', true);
    check('waiting: no unexpected console errors', unexpected(errors).length === 0, errors.join(' | '));
    await ctx.close();
  }
  // Cancel keeps the answer
  {
    const { ctx, page, errors } = await fresh();
    await toQuestion(page);
    await page.route('**/api/evaluate', async route => { await new Promise(r => setTimeout(r, 9000)); try { await route.continue(); } catch { /* aborted */ } });
    await page.locator('textarea.simulation-answer-input').fill(`${ANSWER} ${SECRET}`);
    await submitBtn(page).click();
    await page.waitForSelector('.ai-cancel');
    await page.waitForTimeout(1500);
    await page.locator('.ai-cancel').click();
    await page.waitForSelector('.ai-working', { state: 'detached', timeout: 5000 });
    const main = await page.locator('main').innerText();
    check('cancel: waiting card removed and cancel message shown', /أُلغي الطلب/.test(main), main.slice(0, 200));
    check('cancel: answer text preserved', (await page.locator('textarea.simulation-answer-input').inputValue()).includes(SECRET));
    check('cancel: submit available again', await submitBtn(page).isEnabled());
    check('cancel: no report appears later', await (async () => { await page.waitForTimeout(8500); return (await page.locator('.evaluation-report').count()) === 0; })());
    check('cancel: no unexpected console errors', unexpected(errors).length === 0, errors.join(' | '));
    await ctx.close();
  }
});

// ---------------------------------------------------------------- 5. voice mode with fake mic
section('voice', async () => {
  const { ctx, page, errors } = await fresh({ b: voiceBrowser, perms: ['microphone'] });
  let transcribeCalls = 0;
  let evaluateCalls = 0;
  await page.route('**/api/transcribe', route => { transcribeCalls += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript: `${ANSWER} نص-مفرّغ-QA`, duration_seconds: 3, word_count: 30 }) }); });
  await page.route('**/api/evaluate', route => { evaluateCalls += 1; return route.continue(); });
  await toQuestion(page, { voice: true });
  await page.waitForSelector('.voice-answer-panel');
  check('voice: textarea hidden before recording', await page.locator('textarea.simulation-answer-input').isHidden());
  await page.locator('.privacy-consent input').check();
  await page.locator('.record-start').click();
  await page.waitForTimeout(3300);
  const state = await page.locator('.recording-state').innerText();
  const clock = await page.locator('.recording-clock').innerText();
  check('voice: recording state and ticking clock', /تسجيل/.test(state) && clock !== '00:00', `${state} ${clock}`);
  await page.locator('.record-stop').click();
  await page.waitForSelector('textarea.simulation-answer-input:visible', { timeout: 20000 });
  const text = await page.locator('textarea.simulation-answer-input').inputValue();
  check('voice: transcript (mock) appears in editable textarea', text.includes('نص-مفرّغ-QA'), text.slice(0, 100));
  check('voice: transcribe called once, evaluation not auto-sent', transcribeCalls === 1 && evaluateCalls === 0, `${transcribeCalls}/${evaluateCalls}`);
  await submitBtn(page).click();
  await page.waitForSelector('.evaluation-report', { timeout: 25000 });
  check('voice: reviewed transcript evaluates to a report', evaluateCalls === 1);
  // transcription failure keeps recording for resend
  const second = await fresh({ b: voiceBrowser, perms: ['microphone'] });
  let tc = 0;
  await second.page.route('**/api/transcribe', route => { tc += 1; if (tc === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'AI_OVERLOADED', error: 'x' }) }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transcript: 'نص بعد إعادة الإرسال QA', duration_seconds: 3, word_count: 5 }) }); });
  await toQuestion(second.page, { voice: true });
  await second.page.locator('.privacy-consent input').check();
  await second.page.locator('.record-start').click();
  await second.page.waitForTimeout(2500);
  await second.page.locator('.record-stop').click();
  await second.page.waitForSelector('.record-resend:not([hidden])', { timeout: 20000 });
  check('voice: failed transcription keeps the recording and offers resend', true);
  await second.page.waitForFunction(() => { const b = document.querySelector('.record-resend'); return b && !b.disabled; }, null, { timeout: 25000 }).catch(() => {});
  await second.page.locator('.record-resend').click();
  await second.page.waitForSelector('textarea.simulation-answer-input:visible', { timeout: 20000 });
  check('voice: resend of same recording transcribes', (await second.page.locator('textarea.simulation-answer-input').inputValue()).includes('بعد إعادة الإرسال'));
  check('voice: no unexpected console errors', unexpected([...errors, ...second.errors]).length === 0, [...errors, ...second.errors].join(' | '));
  await second.ctx.close();
  await ctx.close();
});

// ---------------------------------------------------------------- 6. offline via service worker
section('offline', async () => {
  const { ctx, page, errors } = await fresh({ mobile: false, w: 1000, h: 800 });
  await page.goto(`${BASE}/#/home`);
  await page.waitForSelector('.home-dashboard');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the worker take control
  await page.waitForSelector('.home-dashboard');
  check('service worker controls the page', await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  for (const route of ['#/practice/a2', '#/preparation/U1', '#/practice/a5?deck=due']) {
    await page.goto(`${BASE}/${route}`);
    await page.waitForTimeout(900);
  }
  await page.goto(`${BASE}/#/practice/a2`);
  await page.waitForSelector('.practice-choice');
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.goto(`${BASE}/#/home`).catch(() => {});
  await page.reload();
  const homeOk = await page.waitForSelector('.home-dashboard', { timeout: 10000 }).then(() => true).catch(() => false);
  check('offline reload: home renders from cache', homeOk);
  await page.goto(`${BASE}/#/practice/a2`);
  await page.reload();
  const a2 = await page.waitForSelector('.practice-choice', { timeout: 10000 }).then(() => true).catch(() => false);
  check('offline reload on previously visited practice route (a2)', a2);
  await page.goto(`${BASE}/#/preparation/U1`);
  await page.reload();
  check('offline reload on preparation lesson (U1)', await page.waitForSelector('main h1', { timeout: 10000 }).then(() => true).catch(() => false));
  await page.locator('.bottom-nav a[data-nav="preparation"]').click();
  await page.waitForTimeout(600);
  check('offline: tab navigation works', await page.evaluate(() => location.hash.startsWith('#/preparation')) && await page.locator('main h1').count() > 0);
  await page.goto(`${BASE}/#/simulation`);
  await page.reload();
  await page.waitForSelector('.simulation-start', { timeout: 10000 }).catch(() => {});
  await page.locator('.simulation-start').click().catch(() => {});
  await page.waitForTimeout(500);
  const body = await page.locator('body').innerText();
  check('offline simulation setup renders (AI itself needs network)', body.length > 50);
  await page.screenshot({ path: `${OUT}/offline-sim.png` });
  check('offline: no uncaught page errors', errors.filter(e => e.startsWith('PAGEERROR')).length === 0, errors.join(' | '));
  await ctx.setOffline(false);
  await ctx.close();
});

// ---------------------------------------------------------------- 7. persistence
section('persist', async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(`${BASE}/#/practice/a4`);
  await page.waitForSelector('.budget-row');
  await page.getByRole('button', { name: /زيادة وقت الاسم/ }).click();
  const before = await page.evaluate(() => localStorage.getItem('lic:v2:budget'));
  await page.reload();
  await page.waitForSelector('.budget-row');
  check('practice progress (A4 budget) survives reload', before && before === await page.evaluate(() => localStorage.getItem('lic:v2:budget')) && JSON.parse(before).seconds.identity === 10, before);
  await page.goto(`${BASE}/#/practice/a5?deck=due`);
  await page.waitForSelector('.flashcard');
  await page.getByRole('button', { name: 'أظهر الإجابة' }).click();
  await page.getByRole('button', { name: 'عرفتها' }).click();
  await page.reload();
  await page.waitForSelector('.flashcard');
  check('A5 card boxes survive reload', Object.keys(JSON.parse(await page.evaluate(() => localStorage.getItem('lic:v2:cards'))).cards).length >= 1);
  await page.goto(`${BASE}/#/settings`);
  await page.waitForSelector('.settings-accordion');
  await page.locator('#settings-appearance > summary').click();
  await page.locator('.preference-row', { hasText: 'الخلفية' }).getByRole('button', { name: 'داكن' }).click();
  check('theme applied immediately', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  await page.reload();
  await page.waitForSelector('.home-dashboard, .settings-accordion');
  check('theme dark survives reload', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await page.evaluate(() => localStorage.getItem('lic:theme')) === 'dark');
  await page.waitForSelector('#settings-appearance');
  await page.evaluate(() => { document.querySelector('#settings-appearance').open = true; });
  await page.locator('.preference-row', { hasText: 'حجم الخط' }).getByRole('button', { name: 'كبير' }).click();
  await page.reload();
  check('font size large survives reload', await page.evaluate(() => localStorage.getItem('lic:font-size')) === 'large');
  // old stored shape tolerance: unknown/legacy values must not crash the app
  await page.evaluate(() => { localStorage.setItem('lic:v2:a1', '{"legacy":true}'); localStorage.setItem('lic:v2:cards', 'not-json'); localStorage.setItem('lic:v2:budget', '[]'); });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  for (const r of ['practice/a1', 'practice/a5?deck=due', 'practice/a4', 'practice']) {
    await page.goto(`${BASE}/#/${r}`);
    await page.reload();
    await page.waitForTimeout(700);
  }
  check('legacy/corrupt v2 localStorage shapes do not crash practice routes', pageErrors.length === 0 && await page.locator('main').innerText().then(t => t.length > 30), pageErrors.join('|'));
  await ctx.close();
});

// ---------------------------------------------------------------- 8. export / import
section('backup', async () => {
  const { ctx, page } = backupSeed || {};
  if (!page) { check('backup: needs the sim section to run first (ONLY must include sim)', false); return; }
  await page.goto(`${BASE}/#/settings`);
  await page.waitForSelector('.settings-accordion');
  await page.locator('#settings-data > summary').click();
  const snap = () => page.evaluate(async () => {
    const s = await import('/js/storage.js');
    const sessions = await new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const g = r.result.transaction('sessions').objectStore('sessions').getAll(); g.onsuccess = () => resolve(g.result.length); }; });
    void s;
    return JSON.stringify({ sessions, ls: Object.entries(localStorage).sort() });
  });
  const dl = async () => { const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير البيانات' }).click()]); return fs.readFileSync(await d.path(), 'utf8'); };
  const full = await dl();
  check('export (default, with answers) contains the typed answer', full.includes(SECRET));
  check('export is valid JSON with format marker', JSON.parse(full).format === 'leadership-interview-coach-backup');
  await page.locator('#backup-include-answers').uncheck();
  const lean = await dl();
  check('export without answers omits the typed answer', !lean.includes(SECRET) && JSON.parse(lean).include_answers === false);
  check('export without answers keeps sessions and scores', JSON.parse(lean).stores.sessions.length >= 1);
  await page.locator('#backup-include-answers').check();
  const before = await snap();
  const bad = [
    ['not JSON', '{this is not json'],
    ['wrong JSON shape', JSON.stringify({ hello: 'world' })],
    ['prototype pollution keys', '{"__proto__":{"polluted":1},"format":"leadership-interview-coach-backup","schema_version":99}'],
    ['empty file', '']
  ];
  for (const [name, content] of bad) {
    await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await page.waitForSelector('.toast.error', { timeout: 5000 }).catch(() => {});
    const toastText = await page.locator('.toast').first().innerText().catch(() => '');
    check(`malformed import (${name}): error toast shown`, /غير صالح|لم تتغير|تعذر|غير مدعوم|صالح/.test(toastText), toastText);
    check(`malformed import (${name}): data intact`, (await snap()) === before);
    await page.waitForTimeout(300);
  }
  check('Object.prototype not polluted', await page.evaluate(() => ({}).polluted === undefined));
  await page.locator('input[type=file]').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(lean) });
  await page.waitForTimeout(1200);
  const okToast = await page.locator('.toast').first().innerText().catch(() => '');
  check('valid own export re-imports (success toast)', /اكتمل استيراد/.test(okToast), okToast);
  await ctx.close();
});

// ---------------------------------------------------------------- 9. RTL + overflow at 4 viewports
section('layout', async () => {
  const routes = ['home', 'preparation', 'preparation/U1', 'preparation/U2', 'simulation', 'reports', 'settings', 'practice', 'practice/a1', 'practice/a2', 'practice/a3', 'practice/a4', 'practice/a5?deck=due', 'competencies', 'competencies/C1', 'question/C1-B3', 'self-intro', 'sessions', 'search'];
  for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
    const { ctx, page, errors } = await fresh({ w, h });
    const bad = [];
    for (const r of routes) {
      await page.goto(`${BASE}/#/${r}`);
      await page.waitForTimeout(450);
      const s = await page.evaluate(() => ({ dir: document.documentElement.dir, over: document.documentElement.scrollWidth - innerWidth, empty: !document.querySelector('#main-content')?.children.length, wide: [...document.querySelectorAll('main *')].filter(n => { const b = n.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1) && !n.closest('[data-scroll],.table-scroll,pre,.segmented,.sr-only') && getComputedStyle(n).position !== 'fixed'; }).slice(0, 3).map(n => `${n.tagName}.${String(n.className).slice(0, 30)}`) }));
      if (s.dir !== 'rtl' || s.over > 1 || s.empty) bad.push(`${r}: ${JSON.stringify(s)}`);
      else if (s.wide.length) bad.push(`${r}: ELEMENTS PAST VIEWPORT ${s.wide.join(',')}`);
    }
    // simulation question page too
    await toQuestion(page);
    const q = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth }));
    if (q.over > 1) bad.push(`simulation question: over=${q.over}`);
    await page.screenshot({ path: `${OUT}/layout-q-${w}.png` });
    check(`RTL + no horizontal overflow ${w}x${h} (${routes.length} routes + question page)`, bad.length === 0, bad.join(' ;; '));
    check(`no console errors ${w}x${h}`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
});

// ---------------------------------------------------------------- 10. large font
section('font', async () => {
  for (const [w, h] of [[390, 844], [320, 568]]) {
    const { ctx, page, errors } = await fresh({ w, h });
    await page.goto(`${BASE}/#/home`);
    await page.waitForSelector('.home-dashboard'); // do not reload while init is still fetching (aborted init fetches log a console error)
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => { localStorage.setItem('lic:font-size', 'large'); });
    await page.reload();
    await page.waitForSelector('.home-dashboard');
    const rootPx = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const bodyPx = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    check(`large font is applied ${w} (root ${rootPx}px, body ${bodyPx}px)`, await page.evaluate(() => document.documentElement.dataset.fontSize === 'large' || document.body.dataset.fontSize === 'large' || /large/.test(document.documentElement.className) ) || bodyPx > 16, `${rootPx}/${bodyPx}`);
    check(`home large font: no horizontal overflow ${w}`, await noOverflow(page));
    const homeCover = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
      const last = [...document.querySelectorAll('main *')].filter(n => n.getBoundingClientRect().height > 0).map(n => n.getBoundingClientRect().bottom).sort((a, b) => b - a)[0];
      return { navTop: nav.top, lastBottom: last };
    });
    check(`home large font: last content not hidden behind bottom nav ${w}`, homeCover.lastBottom <= homeCover.navTop + 2, JSON.stringify(homeCover));
    await page.screenshot({ path: `${OUT}/font-home-${w}.png` });
    await page.goto(`${BASE}/#/simulation`);
    await page.waitForSelector('.simulation-start');
    check(`simulation setup large font: no overflow ${w}`, await noOverflow(page));
    const reach = await page.evaluate(() => { const b = document.querySelector('.simulation-start'); b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b === top || b.contains(top); });
    check(`simulation start button reachable, not covered ${w}`, reach);
    await page.screenshot({ path: `${OUT}/font-sim-setup-${w}.png` });
    await page.locator('.simulation-start').click();
    await passPrivacy(page);
    await page.waitForSelector('.ai-question-card');
    check(`simulation question large font: no overflow ${w}`, await noOverflow(page));
    await page.locator('textarea.simulation-answer-input').fill(ANSWER);
    const submitReach = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('إرسال الإجابة للتقييم')); b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b === top || b.contains(top); });
    check(`submit button reachable with large font ${w}`, submitReach);
    await page.screenshot({ path: `${OUT}/font-sim-question-${w}.png`, fullPage: true });
    check(`large font: no console errors ${w}`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
});

for (const [name, fn] of sections) {
  if (ONLY && !ONLY.has(name)) continue;
  console.log(`--- section ${name}`);
  try { await fn(); } catch (error) { check(`section ${name} completed without exception`, false, error.stack || error.message); }
}
console.log(`\n${failures === 0 ? 'ALL PASSED' : 'FAILURES: ' + failures} (passed ${passes}, failed ${failures}) engine=chromium base=${BASE}`);
await browser.close();
await voiceBrowser.close();
process.exit(failures ? 1 : 0);
