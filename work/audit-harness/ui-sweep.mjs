import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const OUT = process.env.OUT || new URL('./shots', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4173';
const findings = [];
const note = (page, kind, detail) => { findings.push({ page, kind, detail }); console.log(`[${kind}] ${page}: ${detail}`); };

const ROUTES = [
  '#/home', '#/learn', '#/learn/U1', '#/learn/U2', '#/learn/U3', '#/learn/U4', '#/learn/U5', '#/learn/U6',
  '#/bank', '#/bank/C1-B1', '#/bank/M6-S1', '#/bank/C4-S10', '#/bank/C5-S3', '#/bank/X1',
  '#/competencies', '#/competencies/C1', '#/quick-review', '#/answer-guide', '#/self-intro',
  '#/tools', '#/tools/saved', '#/search?q=النتيجة', '#/settings', '#/sessions', '#/simulation', '#/nope'
];

async function audit(page, label) {
  const data = await page.evaluate(() => {
    const text = document.body.innerText;
    const bad = text.match(/\b(null|undefined|NaN|\[object Object\])\b/g) || [];
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth > vw + 1;
    const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 2 || r.left < -2); }).slice(0, 5).map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`);
    const targets = [...document.querySelectorAll('a[href], button, input, select, summary, textarea, [role=button]')]
      .filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden]'); });
    const small = targets.filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
      .map(e => `${e.tagName.toLowerCase()}[${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}] ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const back = document.querySelector('#back-button');
    const nav = document.querySelector('.bottom-nav');
    const navRect = nav.getBoundingClientRect();
    const main = document.querySelector('#main-content');
    const mainStyle = getComputedStyle(main);
    const mainChildren = [...main.children];
    const last = mainChildren.at(-1);
    const lastBottom = last ? last.getBoundingClientRect().bottom + window.scrollY : 0;
    const docH = document.documentElement.scrollHeight;
    const navFixed = getComputedStyle(nav).position;
    const h1 = document.querySelector('h1')?.textContent?.trim();
    // clipped text: elements with overflow hidden and content wider than box, excluding scroll containers
    const clipped = [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return (s.overflow === 'hidden' || s.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 2 && s.textOverflow !== 'ellipsis' && e.children.length === 0 && e.textContent.trim().length; }).slice(0, 5).map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}:${e.textContent.trim().slice(0, 25)}`);
    const dir = document.documentElement.dir;
    const engInArabic = (text.match(/[A-Za-z]{4,}/g) || []).filter(w => !/STAR|SEAL|PDF|JSON|SHA|V1|iPhone|API/.test(w)).slice(0, 8);
    return { bad, overflow, wide, smallCount: small.length, small: small.slice(0, 12), targets: targets.length, backHidden: back.hidden, navFixed, navTop: Math.round(navRect.top), vh: window.innerHeight, mainPadBottom: mainStyle.paddingBottom, lastBottom: Math.round(lastBottom), docH, h1, clipped, dir, engInArabic, textLen: text.length };
  });
  if (data.bad.length) note(label, 'NULL-TEXT', data.bad.join(','));
  if (data.overflow || data.wide.length) note(label, 'H-OVERFLOW', `scrollWidth>viewport; wide=${data.wide.join(',')}`);
  if (data.smallCount) note(label, 'SMALL-TARGET', `${data.smallCount}/${data.targets}: ${data.small.join(' | ')}`);
  if (data.clipped.length) note(label, 'CLIPPED', data.clipped.join(' | '));
  if (label !== '#/home' && data.backHidden) note(label, 'NO-BACK', 'back button hidden');
  if (data.navFixed !== 'fixed' && data.navFixed !== 'sticky') note(label, 'NAV', `position=${data.navFixed}`);
  if (data.engInArabic.length) note(label, 'ENGLISH', data.engInArabic.join(','));
  return data;
}

async function run(theme, extra = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ ...devices['iPhone 14'], colorScheme: theme, locale: 'ar-AE', permissions: ['microphone'], ...extra });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto(BASE + '/#/home');
  await page.waitForSelector('h1');
  await page.evaluate(t => { localStorage.setItem('lic:theme', t); }, theme);
  await page.reload();
  await page.waitForSelector('.home-hero');
  await page.waitForTimeout(1500); // allow SW install

  const summary = {};
  for (const route of ROUTES) {
    await page.goto(BASE + '/' + route);
    await page.waitForTimeout(700);
    const label = route;
    const data = await audit(page, label + ` [${theme}]`);
    summary[route] = { h1: data.h1, small: data.smallCount, targets: data.targets, textLen: data.textLen, docH: data.docH };
    await page.screenshot({ path: `${OUT}/${theme}-${route.replace(/[#\/?=]/g, '_')}.png`, fullPage: true });
  }
  // competency detail: check model answer toggle works in bank
  await page.goto(BASE + '/#/bank/C1-B1');
  await page.waitForTimeout(500);
  const summaryEl = page.locator('details.answer-reveal summary');
  const beforeOpen = await page.locator('details.answer-reveal').evaluate(d => d.open);
  await summaryEl.click();
  const afterOpen = await page.locator('details.answer-reveal').evaluate(d => d.open);
  note('#/bank/C1-B1', 'MODEL-TOGGLE', `closed by default=${!beforeOpen}, opens on tap=${afterOpen}`);
  await page.screenshot({ path: `${OUT}/${theme}-bank-C1-B1-open.png`, fullPage: true });
  // M6-S1 order check in rendered DOM
  await page.goto(BASE + '/#/bank/M6-S1');
  await page.waitForTimeout(400);
  const m6 = await page.evaluate(() => { const t = document.querySelector('.question-detail-card').innerText; return { q: t.indexOf('أمامك خياران'), o1: t.indexOf('خيار منخفض'), o2: t.indexOf('خيار ينطوي'), c: t.indexOf('كيف تتعامل') }; });
  note('#/bank/M6-S1', 'M6-ORDER', JSON.stringify(m6) + (m6.q < m6.o1 && m6.o1 < m6.o2 && m6.o2 < m6.c ? ' OK' : ' WRONG'));
  // C4-S10 multiple samples
  await page.goto(BASE + '/#/bank/C4-S10');
  await page.waitForTimeout(400);
  await page.locator('details.answer-reveal summary').click();
  const c4 = await page.evaluate(() => ({ count: document.querySelectorAll('.answer-reveal .sample-answer').length, summary: document.querySelector('details.answer-reveal summary').textContent, titles: [...document.querySelectorAll('.answer-reveal .sample-answer h3')].slice(0, 3).map(h => h.textContent) }));
  note('#/bank/C4-S10', 'C4-SAMPLES', JSON.stringify(c4));
  await page.screenshot({ path: `${OUT}/${theme}-bank-C4-S10-open.png`, fullPage: true });

  // exercises in lesson U2
  await page.goto(BASE + '/#/learn/U2');
  await page.waitForTimeout(500);
  const ex = page.locator('.exercise-card .choice-button').first();
  await ex.scrollIntoViewIfNeeded();
  await ex.click();
  await page.waitForTimeout(300);
  const fb = await page.locator('.exercise-feedback').innerText().catch(() => 'NO FEEDBACK');
  note('#/learn/U2', 'EXERCISE', 'feedback: ' + fb.replace(/\n/g, ' / ').slice(0, 160));
  await page.screenshot({ path: `${OUT}/${theme}-learn-U2-exercise.png`, fullPage: true });

  await context.close();
  await browser.close();
  return { summary, errors };
}

const light = await run('light');
const dark = await run('dark');
fs.writeFileSync(`${OUT}/sweep.json`, JSON.stringify({ findings, light: light.summary, dark: dark.summary, errorsLight: light.errors, errorsDark: dark.errors }, null, 2));
console.log('\nConsole errors (light):', light.errors.slice(0, 10));
console.log('Console errors (dark):', dark.errors.slice(0, 10));
console.log('\nPage summary (light):'); for (const [r, s] of Object.entries(light.summary)) console.log(r, '|', s.h1, '| small', s.small + '/' + s.targets, '| docH', s.docH);
