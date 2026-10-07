import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const OUT = process.env.OUT || new URL('./shots/v060', import.meta.url).pathname;
const BASE = process.env.BASE || 'http://localhost:4173';
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  '#/home', '#/preparation', '#/preparation/U1', '#/preparation/U2', '#/preparation/U4', '#/preparation/U5',
  '#/competencies', '#/competencies/C1', '#/competencies/C1?tab=questions',
  '#/question/C1-S1', '#/question/M6-S1', '#/question/X1',
  '#/simulation', '#/reports', '#/coverage', '#/tools', '#/tools/saved', '#/settings', '#/nope',
  // alpha-5 fix: direct-training routes (behavioural, mission behavioural, scenario, general) in text and voice modes
  '#/simulation?question=C2-B3&answer=text', '#/simulation?question=C2-B3&answer=voice',
  '#/simulation?question=M1-B1&answer=text', '#/simulation?question=M1-B1&answer=voice',
  '#/simulation?question=C1-S1&answer=text', '#/simulation?question=C1-S1&answer=voice',
  '#/simulation?question=X1&answer=text', '#/simulation?question=X1&answer=voice',
  // alpha-10.1: question centre routes + self-introduction builder
  '#/questions', '#/questions?view=competencies', '#/questions?view=deck', '#/questions?view=deck&scope=mission',
  '#/questions?view=deck&scope=saved', '#/questions?view=deck&scope=competency&competency=C1',
  '#/questions?view=deck&question=C1-S1', '#/self-intro'
];
// alpha-10.1: direct-training routes land on the privacy screen first; measure it, acknowledge, then measure the training screen too.
const DIRECT_TRAINING = route => /#\/simulation\?question=/.test(route);
const findings = [];
const note = (route, kind, detail) => {
  findings.push({ route, kind, detail });
  console.log(`[${kind}] ${route}: ${detail}`);
};

async function inspect(page, route) {
  return page.evaluate(currentRoute => {
    const bodyText = document.body.innerText;
    const viewport = document.documentElement.clientWidth;
    // alpha-5: العناصر المخفية بصريًا لقارئ الشاشة (.sr-only / clip) ليست أهداف لمس ولا نصًا مقصوصًا.
    const screenReaderOnly = element => element.closest('.sr-only') != null || (() => {
      const style = getComputedStyle(element);
      return style.position === 'absolute' && (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)') && parseFloat(style.width) <= 1;
    })();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && !element.closest('[hidden]') && !screenReaderOnly(element);
    };
    const wide = [...document.querySelectorAll('body *')].filter(element => {
      if (!visible(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.right > viewport + 2 || rect.left < -2;
    }).slice(0, 8).map(element => `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]}`);
    const targets = [...document.querySelectorAll('a[href],button,input,select,summary,textarea,[role=button]')].filter(visible);
    const small = targets.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).slice(0, 12).map(element => {
      const rect = element.getBoundingClientRect();
      const label = (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 22);
      return `${element.tagName.toLowerCase()}[${label}] ${Math.round(rect.width)}x${Math.round(rect.height)}`;
    });
    const clipped = [...document.querySelectorAll('body *')].filter(element => {
      if (!visible(element) || element.children.length) return false;
      const style = getComputedStyle(element);
      return (style.overflow === 'hidden' || style.overflowX === 'hidden')
        && element.scrollWidth > element.clientWidth + 2 && style.textOverflow !== 'ellipsis';
    }).slice(0, 8).map(element => `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]}`);
    return {
      route: currentRoute,
      title: document.querySelector('h1')?.textContent?.trim() || '',
      bad: bodyText.match(/\b(null|undefined|NaN|\[object Object\])\b/g) || [],
      overflow: document.documentElement.scrollWidth > viewport + 1,
      wide,
      small,
      targetCount: targets.length,
      clipped,
      backHidden: document.querySelector('#back-button')?.hidden,
      navPosition: getComputedStyle(document.querySelector('.bottom-nav')).position,
      textLength: bodyText.length,
      fitsViewport: document.documentElement.scrollHeight <= window.innerHeight + 2,
      scrollHeight: document.documentElement.scrollHeight
    };
  }, route);
}

async function run(theme) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ ...devices['iPhone 14'], locale: 'ar-AE', colorScheme: theme, permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${BASE}/#/home`);
  await page.waitForSelector('.home-dashboard');
  await page.evaluate(value => localStorage.setItem('lic:theme', value), theme);
  await page.reload();
  await page.waitForSelector('.home-dashboard');

  const summary = {};
  const measure = async (route, label) => {
    const result = await inspect(page, route);
    summary[label] = result;
    if (result.bad.length) note(`${label} [${theme}]`, 'NULL-TEXT', result.bad.join(','));
    if (result.overflow || result.wide.length) note(`${label} [${theme}]`, 'H-OVERFLOW', result.wide.join(','));
    if (result.small.length) note(`${label} [${theme}]`, 'SMALL-TARGET', result.small.join(' | '));
    if (result.clipped.length) note(`${label} [${theme}]`, 'CLIPPED', result.clipped.join(' | '));
    if (route !== '#/home' && result.backHidden) note(`${label} [${theme}]`, 'NO-BACK', 'زر الرجوع مخفي');
    if (route === '#/home' && !result.fitsViewport) note(`${label} [${theme}]`, 'HOME-SCROLL', `${result.scrollHeight}px`);
    if (!['fixed', 'sticky'].includes(result.navPosition)) note(`${label} [${theme}]`, 'NAV', `position=${result.navPosition}`);
    await page.screenshot({ path: `${OUT}/${theme}-${label.replace(/[#\/?=&]/g, '_')}.png`, fullPage: true });
    return result;
  };
  for (const route of ROUTES) {
    await page.goto(`${BASE}/${route}`);
    await page.waitForTimeout(350);
    if (DIRECT_TRAINING(route)) {
      const gate = await page.locator('.simulation-privacy-page').count();
      if (!gate) { note(`${route} [${theme}]`, 'PRIVACY-GATE-MISSING', 'direct training did not show the privacy screen'); continue; }
      await measure(route, `${route} (privacy)`);
      const continueButton = page.locator('.simulation-privacy-continue');
      if (!(await continueButton.isDisabled())) note(`${route} [${theme}]`, 'PRIVACY-GATE-ENABLED', 'continue enabled before the box was ticked');
      await page.locator('#simulation-privacy-acknowledgement').check();
      await continueButton.click();
      await page.waitForSelector('.ai-question-card', { timeout: 10000 });
      await page.waitForTimeout(350);
      await measure(route, `${route} (training)`);
      continue;
    }
    await measure(route, route);
  }

  await page.goto(`${BASE}/#/preparation`);
  await page.waitForSelector('.preparation-card');
  const preparationCount = await page.locator('.preparation-card').count();
  note(`#/preparation [${theme}]`, 'PREPARATION', `${preparationCount} بطاقات`);

  await page.goto(`${BASE}/#/competencies`);
  await page.waitForSelector('.competency-card');
  const competencyCount = await page.locator('.competency-card').count();
  note(`#/competencies [${theme}]`, 'COMPETENCIES', `${competencyCount} بطاقات`);

  await page.goto(`${BASE}/#/competencies/C1?tab=questions`);
  await page.waitForSelector('.question-link-card');
  const selectedQuestion = await page.locator('.question-link-card').first().getAttribute('data-question-id');
  await page.locator('.question-link-card').first().click();
  await page.waitForSelector('.question-focus-page');
  const perQuestionExport = await page.locator('.question-focus-page .document-actions').count();
  if (perQuestionExport) note(`#/question/${selectedQuestion} [${theme}]`, 'PER-QUESTION-EXPORT', `${perQuestionExport} action groups`);
  await page.locator('.question-focus-close').click();
  await page.waitForSelector('.competency-questions-panel:not([hidden])');
  const returnedCard = page.locator(`.question-link-card[data-question-id="${selectedQuestion}"]`);
  const contextualReturn = await returnedCard.count() === 1 && await returnedCard.evaluate(node => node.classList.contains('requested'));
  note(`#/competencies/C1?tab=questions [${theme}]`, 'QUESTION-RETURN', `question=${selectedQuestion} contextual=${contextualReturn}`);
  if (!contextualReturn) note(`#/competencies/C1?tab=questions [${theme}]`, 'QUESTION-RETURN-FAIL', `question=${selectedQuestion}`);

  await page.goto(`${BASE}/#/question/C1-S1`);
  await page.waitForSelector('.question-focus-page');
  await page.locator('.question-step').last().click();
  await page.locator('button:has-text("إظهار الإجابة النموذجية")').click();
  const parts = await page.locator('.focus-answer-part').count();
  note(`#/question/C1-S1 [${theme}]`, 'MODEL-ANSWER', `revealed=true parts=${parts}`);
  await page.screenshot({ path: `${OUT}/${theme}-question-C1-S1-answer.png`, fullPage: true });

  await page.goto(`${BASE}/#/simulation`);
  await page.waitForSelector('.simulation-mode-card');
  const modes = await page.locator('.simulation-mode-card').count();
  const full = await page.locator('.simulation-mode-card:has-text("مقابلة كاملة")').count();
  note(`#/simulation [${theme}]`, 'SIMULATION-MODES', `${modes} أوضاع، full=${full}`);

  await browser.close();
  return { summary, errors };
}

const light = await run('light');
const dark = await run('dark');
const acceptanceFailures = findings.filter(item => ['NULL-TEXT', 'H-OVERFLOW', 'SMALL-TARGET', 'CLIPPED', 'NO-BACK', 'NAV', 'HOME-SCROLL', 'PER-QUESTION-EXPORT', 'QUESTION-RETURN-FAIL', 'PRIVACY-GATE-MISSING', 'PRIVACY-GATE-ENABLED'].includes(item.kind));
const result = { generated_at: new Date().toISOString(), findings, acceptanceFailures, errors: [...light.errors, ...dark.errors], light: light.summary, dark: dark.summary };
fs.writeFileSync(`${OUT}/sweep.json`, JSON.stringify(result, null, 2));
console.log(`SUMMARY routes=${ROUTES.length * 2} screens=${Object.keys(light.summary).length + Object.keys(dark.summary).length} failures=${acceptanceFailures.length} consoleErrors=${result.errors.length}`);
if (acceptanceFailures.length || result.errors.length) process.exitCode = 1;
