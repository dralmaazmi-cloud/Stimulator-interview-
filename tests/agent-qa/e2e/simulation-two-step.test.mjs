#!/usr/bin/env node
// Two-step simulation setup (step 1: type, step 2: answer method + settings) — Chromium with iPhone emulation.
// This does not prove iOS Safari/WebKit behaviour.
//   BASE=http://localhost:4173 OUT=/tmp/sim-two-step node tests/agent-qa/e2e/simulation-two-step.test.mjs
// Needs the audit-harness mock server (mounts the real api/ handlers with a mock provider). No paid API is called.
// Answers used here are fixed test sentences; transcripts and answers are never printed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4173';
const OUT = process.env.OUT || '/tmp/sim-two-step';
fs.mkdirSync(OUT, { recursive: true });

const ANSWER = 'في بداية المشروع كان الفريق متأخرًا عن الجدول. كانت مهمتي إعادة توزيع العمل بين الأعضاء. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي وتابعت التنفيذ يوميًا. اكتمل المشروع في الموعد المحدد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
const MODES = [
  { id: 'single', title: 'سؤال واحد', description: 'تدريب سريع على سؤال واحد.', minutes: '2–4 دقائق', count: 1 },
  { id: 'realistic', title: 'مقابلة واقعية', description: 'سؤالان', minutes: 'نحو 7 دقائق', count: 2 },
  { id: 'extended', title: 'مقابلة موسّعة', description: 'خمسة أسئلة متنوعة.', minutes: 'نحو 16 دقيقة', count: 5 },
  { id: 'full', title: 'مقابلة كاملة', description: 'تقديم الذات ثم ستة أسئلة', minutes: 'نحو 20 دقيقة', count: 6 }
];
let failures = 0;
let passes = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 400)}`);
  if (ok) passes += 1; else failures += 1;
};
const norm = s => String(s).replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

// Counts getUserMedia calls so we can prove step 2 never asks for the microphone.
const COUNT_GUM = () => {
  window.__gumCalls = 0;
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) {
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = constraints => { window.__gumCalls += 1; return original(constraints); };
  }
};
async function fresh({ width = 390, height = 844, theme = '', init = COUNT_GUM, perms = ['microphone'] } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width, height }, locale: 'ar-AE', permissions: perms });
  await ctx.addInitScript(init);
  if (theme) await ctx.addInitScript(t => { try { localStorage.setItem('lic:theme', t); } catch { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('dialog', d => d.accept());
  return { ctx, page, errors };
}
const idbSessions = page => page.evaluate(() => new Promise(resolve => {
  const r = indexedDB.open('leadership-interview-coach');
  r.onsuccess = () => { const g = r.result.transaction('sessions').objectStore('sessions').getAll(); g.onsuccess = () => resolve(g.result); };
  r.onerror = () => resolve([]);
}));
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const step1 = async page => { await page.waitForSelector('.simulation-next'); await page.waitForTimeout(150); };
const step2 = async page => { await page.waitForSelector('.simulation-method-step'); await page.waitForTimeout(150); };
const checkedMethod = page => page.locator('.simulation-method-card[aria-checked="true"]').getAttribute('data-method');
const selectedMode = page => page.locator('.simulation-mode-card.selected strong').innerText();
async function passPrivacy(page) {
  await page.waitForSelector('.simulation-privacy-page', { timeout: 10000 });
  await page.locator('#simulation-privacy-acknowledgement').check();
  await page.locator('.simulation-privacy-continue').click();
}
const openSimulation = async page => {
  await page.goto(`${BASE}/#/home`);
  await page.waitForSelector('.bottom-nav');
  await page.locator('[data-nav="simulation"]').click();
  await step1(page);
};

// ---------- 1. Step 1 content ----------
{
  const { ctx, page, errors } = await fresh();
  await openSimulation(page);
  const cards = await page.locator('.simulation-mode-card').allInnerTexts();
  check('step1: four type cards in the original order', cards.length === 4 && MODES.every((m, i) => norm(cards[i]).includes(m.title)), cards.map(norm).join(' | '));
  check('step1: card copy and durations', MODES.every((m, i) => norm(cards[i]).includes(m.description) && norm(cards[i]).includes(m.minutes)), cards.map(norm).join(' | '));
  check('step1: «سؤال واحد» is the default', (await selectedMode(page)) === 'سؤال واحد');
  const hero = norm(await page.locator('.simulation-hero').innerText());
  check('step1: hero kept', hero.includes('بيئة تدريب تفاعلية') && hero.includes('اختر تجربة تناسب استعدادك') && hero.includes('حدّد نوع المقابلة ثم ابدأ عندما تكون جاهزًا.'), hero);
  check('step1: health strip «المحاكاة جاهزة.»', norm(await page.locator('.ai-health-host').innerText()).includes('المحاكاة جاهزة.'));
  const absent = await page.evaluate(() => ({
    method: document.querySelectorAll('.simulation-method-card, [role="radiogroup"]').length,
    select: document.querySelectorAll('#main-content select').length,
    followups: document.body.innerText.includes('أسئلة المتابعة'),
    readiness: document.querySelectorAll('.simulation-readiness-strip').length,
    disclaimer: document.body.innerText.includes('هذه أداة تدريبية'),
    start: document.querySelectorAll('.simulation-start').length
  }));
  check('step1: method, competency, follow-ups, readiness, disclaimer and start moved out', !absent.method && !absent.select && !absent.followups && !absent.readiness && !absent.disclaimer && !absent.start, JSON.stringify(absent));
  check('step1: «التالي» with arrow', norm(await page.locator('.simulation-next').innerText()) === 'التالي ←', await page.locator('.simulation-next').innerText());
  await page.locator('.simulation-next').click();
  await step2(page);
  check('step1→2: no session is created by «التالي»', (await idbSessions(page)).length === 0);
  check('step1: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- 2. The eight type × method paths ----------
const scopes = { single: 'C1', realistic: '', extended: 'C4', full: 'C3' };
for (const mode of MODES) {
  for (const method of ['voice', 'text']) {
    const name = `${mode.id}/${method}`;
    const { ctx, page, errors } = await fresh();
    await openSimulation(page);
    await page.locator('.simulation-mode-card', { hasText: mode.title }).click();
    check(`${name}: card selected`, (await selectedMode(page)) === mode.title);
    await page.locator('.simulation-next').click();
    await step2(page);
    const label = norm(await page.locator('.simulation-step-label').innerText());
    const bar = await page.locator('.simulation-step-bar > span.done').count();
    check(`${name}: «الخطوة 2 من 2» and two filled bar segments`, label === 'الخطوة 2 من 2' && bar === 2, `${label} ${bar}`);
    const summary = norm(await page.locator('.simulation-type-summary').innerText());
    check(`${name}: summary shows the chosen type`, summary.includes(mode.title) && summary.includes(mode.description) && summary.includes(mode.minutes), summary);
    const summaryInteractive = await page.locator('.simulation-type-summary button, .simulation-type-summary input, .simulation-type-summary[role="radio"]').count();
    check(`${name}: summary is not selectable`, summaryInteractive === 0);
    const subtitle = norm(await page.locator('.simulation-method-head p').innerText());
    check(`${name}: subtitle`, subtitle === (mode.id === 'single' ? 'اختر كيف تريد الإجابة على هذا السؤال' : 'اختر كيف تريد الإجابة على أسئلة هذه المحاكاة'), subtitle);
    check(`${name}: default method is voice when recording is supported`, (await checkedMethod(page)) === 'voice');
    check(`${name}: no microphone request when step 2 opens`, (await page.evaluate(() => window.__gumCalls)) === 0);
    await page.locator(`.simulation-method-card[data-method="${method}"]`).click();
    check(`${name}: method selected`, (await checkedMethod(page)) === method);
    const readiness = norm(await page.locator('.simulation-readiness-strip').innerText());
    check(`${name}: readiness follows the method`, method === 'voice' ? readiness.includes('الميكروفون جاهز') : readiness.includes('الإجابة النصية جاهزة'), readiness);
    const scopeValue = scopes[mode.id];
    check(`${name}: competency defaults to «اختيار عشوائي»`, (await page.locator('.simulation-method-step select[aria-label="مجال المحاكاة"]').inputValue()) === '');
    if (scopeValue) await page.locator('.simulation-method-step select[aria-label="مجال المحاكاة"]').selectOption(scopeValue);
    const followupsOn = method === 'voice';
    const followup = page.locator('label.toggle-row:has-text("أسئلة المتابعة") input');
    check(`${name}: follow-ups on by default`, await followup.isChecked());
    if (!followupsOn) await followup.uncheck();
    const introVisible = await page.locator('.simulation-intro-options').isVisible();
    check(`${name}: self-intro options visibility`, introVisible === (mode.id !== 'single'));
    if (mode.id === 'full') {
      const box = page.locator('.simulation-intro-options input[type=checkbox]');
      check(`${name}: self-intro fixed in «مقابلة كاملة»`, (await box.isChecked()) && (await box.isDisabled()));
    }
    const notice = norm(await page.locator('.simulation-method-notice').innerText());
    check(`${name}: notice texts`, notice.includes('يمكنك اختيار الطريقة قبل بدء المحاكاة. لا يمكن تغييرها أثناء الجلسة.') && notice.includes('هذه أداة تدريبية؛ لا تصدر نجاحًا أو رسوبًا ولا تتنبأ بنتيجة المقابلة الفعلية.'), notice);
    check(`${name}: «متابعة» button`, norm(await page.locator('.simulation-start').innerText()) === 'متابعة');
    await page.locator('.simulation-start').click();
    await passPrivacy(page);
    if (mode.id === 'full') {
      await page.waitForSelector('.page-head h1');
      check(`${name}: full interview opens with self-introduction`, norm(await page.locator('.page-head h1').innerText()).startsWith('تقديم الذات'), await page.locator('.page-head h1').innerText());
    } else {
      await page.waitForSelector('.ai-question-card');
      check(`${name}: first question shown`, true);
    }
    if (method === 'voice') check(`${name}: voice panel shown`, await page.locator('.voice-answer-panel').isVisible());
    else check(`${name}: text box shown`, await page.locator('textarea.simulation-answer-input').isVisible());
    check(`${name}: still no microphone request before recording`, (await page.evaluate(() => window.__gumCalls)) === 0);
    const [session] = await idbSessions(page);
    check(`${name}: session settings`, session && session.mode === mode.id && session.answer_mode === method && session.followups_enabled === followupsOn
      && session.include_self_intro === (mode.id === 'full') && session.question_ids.length === mode.count, JSON.stringify(session && { mode: session.mode, answer_mode: session.answer_mode, followups: session.followups_enabled, intro: session.include_self_intro, n: session.question_ids?.length }));
    if (scopeValue) {
      const scoped = await page.evaluate(async ({ ids, scopeValue: scope }) => {
        const questions = await (await fetch('data/derived/questions.json')).json();
        const list = Array.isArray(questions) ? questions : questions.questions;
        return ids.every(id => {
          const q = list.find(item => item.id === id);
          return scope === 'mission' ? q?.owner_type === 'mission_command' : (q?.competency_id === scope || q?.principle_id === scope);
        });
      }, { ids: session.question_ids, scopeValue });
      check(`${name}: questions follow the chosen competency (${scopeValue})`, scoped);
    }
    check(`${name}: no console errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// ---------- 3. Back navigation keeps the selection (three ways) ----------
for (const way of ['link', 'header', 'browser']) {
  const { ctx, page, errors } = await fresh();
  await openSimulation(page);
  await page.locator('.simulation-mode-card', { hasText: 'مقابلة موسّعة' }).click();
  await page.locator('.simulation-next').click();
  await step2(page);
  await page.locator('.simulation-method-card[data-method="text"]').click();
  await page.locator('.simulation-method-step select[aria-label="مجال المحاكاة"]').selectOption('C2');
  await page.evaluate(() => window.scrollTo(0, 400));
  if (way === 'link') await page.locator('.simulation-step-back').click();
  else if (way === 'header') await page.locator('#back-button').click();
  else await page.goBack();
  await step1(page);
  const state = await page.evaluate(() => ({ hash: location.hash, focus: document.activeElement?.textContent, scroll: Math.round(scrollY) }));
  check(`back (${way}): returns to step 1 inside the simulation tab`, state.hash === '#/simulation' && (await page.locator('.simulation-method-step').count()) === 0, JSON.stringify(state));
  check(`back (${way}): type selection kept`, (await selectedMode(page)) === 'مقابلة موسّعة');
  check(`back (${way}): heading focused and page at top`, state.focus === 'اختر تجربة تناسب استعدادك' && state.scroll === 0, JSON.stringify(state));
  if (way === 'browser') {
    await page.goForward();
    await step2(page);
    check('forward: browser forward reopens step 2', true);
  } else {
    await page.locator('.simulation-next').click();
    await step2(page);
  }
  const s2 = await page.evaluate(() => ({ focus: document.activeElement?.textContent, scroll: Math.round(scrollY) }));
  check(`back (${way}): method and competency kept on return to step 2`, (await checkedMethod(page)) === 'text'
    && (await page.locator('.simulation-method-step select[aria-label="مجال المحاكاة"]').inputValue()) === 'C2');
  check(`back (${way}): step 2 heading focused and page at top`, s2.focus === 'طريقة الإجابة' && s2.scroll === 0, JSON.stringify(s2));
  check(`back (${way}): no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- 4. Header back on a directly opened simulation, nav tap, step-1 header behaviour, in-session back ----------
{
  const { ctx, page, errors } = await fresh();
  await page.goto(`${BASE}/#/simulation`);
  await step1(page);
  await page.locator('.simulation-next').click();
  await step2(page);
  await page.locator('#back-button').click();
  await step1(page);
  check('direct entry: header back on step 2 goes to step 1 (not home)', (await page.evaluate(() => location.hash)) === '#/simulation');
  await page.locator('.simulation-next').click();
  await step2(page);
  await page.locator('[data-nav="simulation"]').click();
  await step1(page);
  check('bottom nav «المحاكاة» on step 2 returns to step 1', (await page.locator('.simulation-method-step').count()) === 0);
  await ctx.close();

  const second = await fresh();
  await openSimulation(second.page);
  await second.page.locator('#back-button').click();
  await second.page.waitForTimeout(400);
  check('step 1: header back keeps its behaviour (leaves to the previous page)', (await second.page.evaluate(() => location.hash)) === '#/home');
  await openSimulation(second.page);
  await second.page.locator('.simulation-next').click();
  await step2(second.page);
  await second.page.locator('.simulation-method-card[data-method="text"]').click();
  await second.page.locator('.simulation-start').click();
  await passPrivacy(second.page);
  await second.page.waitForSelector('.ai-question-card');
  await second.page.goBack();
  await second.page.waitForTimeout(500);
  check('in session: browser back leaves the simulation as before (step entry removed)', (await second.page.evaluate(() => location.hash)) === '#/home');
  await openSimulation(second.page);
  check('re-entering from the bottom nav starts at step 1', (await second.page.locator('.simulation-next').count()) === 1);
  check('navigation: no console errors', errors.length === 0 && second.errors.length === 0, [...errors, ...second.errors].join(' | '));
  await second.ctx.close();
}

// ---------- 5. Recording not supported ----------
for (const [label, init] of [
  ['no MediaRecorder', () => { delete window.MediaRecorder; window.MediaRecorder = undefined; }],
  ['no getUserMedia', () => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = undefined; }]
]) {
  const { ctx, page, errors } = await fresh({ init });
  await openSimulation(page);
  await page.locator('.simulation-next').click();
  await step2(page);
  const voice = page.locator('.simulation-method-card[data-method="voice"]');
  check(`unsupported (${label}): text is the default`, (await checkedMethod(page)) === 'text');
  check(`unsupported (${label}): voice card disabled with message, no badge`, (await voice.isDisabled())
    && norm(await voice.innerText()).includes('التسجيل الصوتي غير مدعوم على هذا المتصفح.')
    && (await voice.locator('.method-badge').count()) === 0, norm(await voice.innerText()));
  check(`unsupported (${label}): readiness shows text`, norm(await page.locator('.simulation-readiness-strip').innerText()).includes('الإجابة النصية جاهزة'));
  check(`unsupported (${label}): no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- 6. Accessibility of the method group ----------
{
  const { ctx, page } = await fresh();
  await openSimulation(page);
  await page.locator('.simulation-next').click();
  await step2(page);
  const a11y = await page.evaluate(() => {
    const group = document.querySelector('.simulation-method-options');
    const radios = [...group.querySelectorAll('[role="radio"]')];
    return {
      role: group.getAttribute('role'),
      label: group.getAttribute('aria-label'),
      radios: radios.length,
      aria: radios.every(r => ['true', 'false'].includes(r.getAttribute('aria-checked'))),
      minHeight: Math.min(...radios.map(r => r.getBoundingClientRect().height)),
      back: document.querySelector('.simulation-step-back').getBoundingClientRect().height,
      badge: radios[0].querySelector('.method-badge')?.textContent
    };
  });
  check('a11y: radiogroup with two radios and aria-checked', a11y.role === 'radiogroup' && a11y.label === 'طريقة الإجابة' && a11y.radios === 2 && a11y.aria, JSON.stringify(a11y));
  check('a11y: touch targets ≥ 44px', a11y.minHeight >= 44 && a11y.back >= 44, JSON.stringify(a11y));
  check('voice card badge «موصى بها ✦»', a11y.badge === 'موصى بها ✦', a11y.badge);
  await page.locator('.simulation-method-card[data-method="voice"]').focus();
  await page.keyboard.press('ArrowDown');
  check('a11y: arrow key moves the selection', (await checkedMethod(page)) === 'text' && (await page.evaluate(() => document.activeElement?.dataset.method)) === 'text');
  await ctx.close();
}

// ---------- 7. Voice and text end to end (mock provider) ----------
{
  const { ctx, page, errors } = await fresh();
  await openSimulation(page);
  await page.locator('.simulation-next').click();
  await step2(page);
  await page.locator('.simulation-start').click();
  await passPrivacy(page);
  await page.waitForSelector('.voice-answer-panel');
  await page.locator('.privacy-consent input').check();
  await page.locator('.record-start').click();
  await page.waitForTimeout(3000);
  check('voice e2e: microphone requested only at the first recording', (await page.evaluate(() => window.__gumCalls)) === 1);
  await page.locator('.record-stop').click();
  await page.waitForSelector('textarea.simulation-answer-input:visible', { timeout: 20000 });
  const transcriptLength = (await page.locator('textarea.simulation-answer-input').inputValue()).trim().length;
  check('voice e2e: transcript is not empty (mock /api/transcribe)', transcriptLength > 0, `length=${transcriptLength}`);
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  check('voice e2e: evaluation report shown', true);
  check('voice e2e: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page, errors } = await fresh();
  await openSimulation(page);
  await page.locator('.simulation-next').click();
  await step2(page);
  await page.locator('.simulation-method-card[data-method="text"]').click();
  await page.locator('.simulation-start').click();
  await passPrivacy(page);
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  check('text e2e: evaluation report shown', true);
  await page.locator('button:has-text("إنهاء وعرض الملخص")').click();
  await page.waitForSelector('.session-summary');
  check('text e2e: session summary shown', true);
  check('text e2e: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- 8. Layout at iPhone widths, light and dark, with screenshots ----------
for (const theme of ['light', 'dark']) {
  for (const width of [375, 390, 430]) {
    const { ctx, page, errors } = await fresh({ width, height: width === 375 ? 667 : 932, theme });
    await openSimulation(page);
    const dir = await page.evaluate(() => document.documentElement.dir);
    check(`layout ${theme} ${width}: RTL`, dir === 'rtl');
    check(`layout ${theme} ${width}: step 1 no horizontal scroll`, await noOverflow(page));
    const nextReach = await page.evaluate(() => {
      const b = document.querySelector('.simulation-next');
      b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return (b === top || b.contains(top)) && r.bottom <= nav.top + 1;
    });
    check(`layout ${theme} ${width}: «التالي» not covered by the bottom nav`, nextReach);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${OUT}/step1-${theme}-${width}.png`, fullPage: false });
    await page.locator('.simulation-next').click();
    await step2(page);
    check(`layout ${theme} ${width}: step 2 no horizontal scroll`, await noOverflow(page));
    const wide = await page.evaluate(() => [...document.querySelectorAll('#main-content *')].filter(n => { const b = n.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1); }).slice(0, 3).map(n => n.className));
    check(`layout ${theme} ${width}: no element outside the viewport`, wide.length === 0, JSON.stringify(wide));
    const startReach = await page.evaluate(() => {
      const b = document.querySelector('.simulation-start');
      b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect();
      const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return (b === top || b.contains(top)) && r.bottom <= nav.top + 1;
    });
    check(`layout ${theme} ${width}: «متابعة» not covered by the bottom nav`, startReach);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/step2-${theme}-${width}.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/step2-${theme}-${width}-full.png`, fullPage: true });
    check(`layout ${theme} ${width}: no console errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
