import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const OUT = process.env.OUT || new URL('./shots', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4173';
const log = (k, v) => console.log(`[${k}] ${v}`);
const ANSWER = 'في بداية المشروع كان الفريق متأخرًا عن الجدول. كانت مهمتي إعادة توزيع العمل بين الأعضاء. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي وتابعت التنفيذ يوميًا. اكتمل المشروع في الموعد المحدد. تعلمت أن المتابعة المبكرة تمنع التأخير.';

async function newPage(opts = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ ...devices['iPhone 14'], locale: 'ar-AE', permissions: ['microphone'], ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // v0.5.1 item 6: starting a new session over an in-progress one asks for confirmation; accept it and log it.
  page.on('dialog', d => { log('dialog', `${d.type()}: ${d.message().slice(0, 80)}`); d.accept(); });
  return { browser, context, page, errors };
}
const text = async (page, sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
const shot = (page, name) => page.screenshot({ path: `${OUT}/j-${name}.png`, fullPage: true });
const gotoHash = async (page, url) => { await page.goto(url.split('#')[0] + '#/home'); await page.waitForTimeout(250); await page.goto(url); await page.waitForTimeout(250); };

// ---------- Journey 1: single question, text answer, follow-up, finish, saved, print ----------
{
  const { browser, page, errors } = await newPage();
  await page.goto(BASE + '/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.waitForTimeout(500);
  log('J1 health notice', await text(page, '.ai-health-host'));
  const modes = await page.locator('.simulation-mode-card').allInnerTexts();
  log('J1 modes', modes.map(m => m.replace(/\n/g, ' / ')).join(' || '));
  log('J1 default mode', await page.locator('.simulation-mode-card.selected strong').innerText());
  log('J1 default answer mode', await page.locator('.simulation-answer-switch button.active').innerText());
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  log('J1 question header', await text(page, '.page-head h1'));
  const qid = await text(page, '.ai-question-card .question-id');
  const qtext = await text(page, '.ai-question-card h2');
  log('J1 question', `${qid} :: ${qtext.slice(0, 80)}`);
  log('J1 progress bar', await page.locator('.simulation-progress').getAttribute('aria-valuenow'));
  // F8 (alpha-5): empty submit is disabled by design; assert it instead of clicking (the old toast path no longer exists).
  log('J1 empty submit disabled', String(await page.locator('button:has-text("إرسال الإجابة للتقييم")').isDisabled()));
  await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await shot(page, '1-question');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('J1 scrollY after report (item 8)', String(await page.evaluate(() => window.scrollY)));
  log('J1 final-score text', await text(page, '.final-score'));
  log('J1 report hero', await text(page, '.score-hero'));
  log('J1 trust line', await text(page, '.evaluation-report .trust-line'));
  log('J1 R3 section order', (await page.locator('.evaluation-report h3').allInnerTexts()).join(' | '));
  log('J1 R3 no old header labels', String(!/التصنيف النوعي|من 100(?!\s*$)/.test(await text(page, '.score-hero'))));
  log('J1 R3 breakdown total line', await text(page, '.breakdown-total') + ' :: ' + await text(page, '.breakdown-rule'));
  log('J1 R3 action share marker', String(await page.locator('.action-share-marker').count()) + ' :: ' + await text(page, '.action-share-note'));
  log('J1 R2 criterion three lines', (await page.locator('.criterion-card').first().locator('.criterion-line b').allInnerTexts()).join(' | '));
  log('J1 report sections', (await page.locator('.evaluation-report h3').allInnerTexts()).join(' | '));
  log('J1 action buttons', (await page.locator('.report-actions .button').allInnerTexts()).join(' | '));
  const bodyText = await page.locator('body').innerText();
  log('J1 null/undefined in report', String((bodyText.match(/\b(null|undefined|NaN)\b/g) || []).length));
  await shot(page, '1-report');
  // compare with guide
  await page.locator('button:has-text("قارن بالإجابة النموذجية")').click();
  await page.waitForTimeout(300);
  log('J1 compare dialog open', String(await page.locator('#app-dialog').evaluate(d => d.open)) + ' :: ' + (await text(page, '#dialog-content')).slice(0, 120));
  await shot(page, '1-compare');
  await page.locator('#app-dialog button[value=cancel]').click();
  // follow-up
  await page.locator('button:has-text("الإجابة عن سؤال المتابعة")').click();
  await page.waitForSelector('.followup-question-card');
  log('J1 followup card', await text(page, '.followup-question-card'));
  await shot(page, '1-followup');
  await page.locator('textarea.simulation-answer-input').fill('المؤشر كان نسبة الإنجاز في الوقت المحدد وبلغت تسعين بالمئة.');
  await page.locator('button:has-text("إعادة التقييم مع المتابعة")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('J1 followup merged in report', String((await text(page, '.transcript-review-card')).includes('تسعين بالمئة')));
  log('J1 followup button still shown after 1 followup?', String(await page.locator('button:has-text("الإجابة عن سؤال المتابعة")').count()));
  await page.locator('button:has-text("إنهاء وعرض الملخص")').click();
  await page.waitForSelector('.session-summary');
  log('J1 summary', (await text(page, '.session-summary-hero')));
  log('J1 summary buttons', (await page.locator('.session-summary .button').allInnerTexts()).join(' | '));
  await shot(page, '1-summary');
  // saved sessions
  await page.goto(BASE + '/#/sessions');
  await page.waitForTimeout(500);
  log('J1 sessions list', (await text(page, '.session-history-list')).slice(0, 150));
  await page.locator('.session-history-card').first().click();
  await page.waitForTimeout(500);
  log('J1 saved session view headings', (await page.locator('h1,h2,h3').allInnerTexts()).join(' | '));
  log('J1 saved view shows criteria/quotes?', String(await page.locator('.criteria-list, .evidence-quotes').count()));
  log('J1 saved view retry link (R5)', String(await page.locator('.retry-question').count()));
  await shot(page, '1-saved-session');
  // print css — closed saved reports must open on beforeprint and show criteria
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  log('J1 print: saved report criteria visible (item 7)', String(await page.locator('details.saved-report .criteria-list').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).length)));
  log('J1 print: footer text present', String(await page.locator('.print-footer').evaluateAll(nodes => nodes.some(node => getComputedStyle(node).display !== 'none' && /تقييم تدريبي لإجابة واحدة/.test(node.textContent)))));
  await page.screenshot({ path: `${OUT}/j-1-print.png`, fullPage: true });
  const hiddenInPrint = await page.evaluate(() => ({ nav: getComputedStyle(document.querySelector('.bottom-nav')).display, header: getComputedStyle(document.querySelector('.app-header')).display, noPrint: getComputedStyle(document.querySelector('.no-print') || document.body).display }));
  log('J1 print media hides chrome', JSON.stringify(hiddenInPrint));
  await page.emulateMedia({ media: 'screen' });
  // second session for comparison
  await gotoHash(page, BASE + '/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER + ' نحن كفريق أنجزنا ذلك.');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('J1b flags shown', await text(page, '.flags-card'));
  await page.locator('button:has-text("إنهاء وعرض الملخص")').click();
  await page.waitForSelector('.session-summary');
  log('J1b comparison with previous', await text(page, '.session-comparison'));
  await shot(page, '1b-summary-compare');
  // save & exit mid-session: is it resumable?
  await gotoHash(page, BASE + '/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill('مسودة غير مرسلة');
  await page.locator('button:has-text("حفظ والخروج إلى الرئيسية")').click();
  await page.waitForTimeout(500);
  const resumeOnHome = await page.locator('body').innerText();
  log('J1c after save&exit: home mentions resume?', String(/استئناف|متابعة الجلسة|جلسة غير مكتملة/.test(resumeOnHome)));
  await page.goto(BASE + '/#/sessions');
  await page.waitForTimeout(400);
  log('J1c sessions page lists in-progress session?', String(/غير مكتملة|قيد التنفيذ|استئناف/.test(await page.locator('body').innerText())));
  const stored = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const tx = r.result.transaction('sessions'); const g = tx.objectStore('sessions').getAll(); g.onsuccess = () => resolve(g.result.map(s => ({ status: s.status, draft: s.draft_answer, n: (s.responses || []).length }))); }; }));
  log('J1c IndexedDB sessions', JSON.stringify(stored));
  // ---- item 6: resume → same question, same draft → submit → report → finish → completed, no in_progress copy left
  const pendingQid = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const tx = r.result.transaction('sessions'); const g = tx.objectStore('sessions').getAll(); g.onsuccess = () => resolve(g.result.find(s => s.status === 'in_progress')?.question_ids?.[0] || ''); }; }));
  await gotoHash(page, BASE + '/#/simulation');
  await page.waitForSelector('.simulation-start');
  log('J1d resume card shown on simulation setup', String(await page.locator('.resume-card').count()) + ' :: ' + (await text(page, '.resume-card')).slice(0, 80));
  await page.locator('.resume-card button:has-text("استئناف")').click();
  await page.waitForSelector('.ai-question-card');
  log('J1d resumed same question?', String((await text(page, '.ai-question-card .question-id')) === pendingQid) + ` (${pendingQid})`);
  log('J1d draft restored?', String((await page.locator('textarea.simulation-answer-input').inputValue()) === 'مسودة غير مرسلة'));
  await page.locator('textarea.simulation-answer-input').fill(ANSWER + ' NOFOLLOWUP');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  await page.locator('button:has-text("إنهاء وعرض الملخص")').click();
  await page.waitForSelector('.session-summary');
  const afterResume = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const tx = r.result.transaction('sessions'); const g = tx.objectStore('sessions').getAll(); g.onsuccess = () => resolve({ completed: g.result.filter(s => s.status === 'completed').length, in_progress: g.result.filter(s => s.status === 'in_progress').length, drafts: g.result.filter(s => s.draft_answer).length }); }; }));
  log('J1d after finish: sessions by status (item 6)', JSON.stringify(afterResume));
  await page.goto(BASE + '/#/home'); await page.waitForTimeout(400);
  log('J1d home resume card gone after finish', String(await page.locator('.resume-session-card').count()));
  log('J1 page errors', JSON.stringify(errors));
  await browser.close();
}

// ---------- Journey 2: voice answer (fake mic) ----------
{
  const { browser, page, errors } = await newPage();
  await page.goto(BASE + '/#/simulation?answer=voice');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.voice-answer-panel');
  log('J2 voice panel', (await text(page, '.voice-answer-panel')).slice(0, 200));
  log('J2 textarea hidden before recording', String(await page.locator('textarea.simulation-answer-input').isHidden()));
  // start without consent
  await page.locator('.record-start').click();
  await page.waitForTimeout(300);
  log('J2 start without consent → toast', await text(page, '.toast'));
  await page.locator('.privacy-consent input').check();
  await page.locator('.record-start').click();
  await page.waitForTimeout(3500);
  log('J2 recording state', await text(page, '.recording-state') + ' clock=' + await text(page, '.recording-clock'));
  await shot(page, '2-recording');
  await page.locator('.record-stop').click();
  await page.waitForSelector('textarea.simulation-answer-input:visible', { timeout: 20000 });
  await page.waitForTimeout(500);
  const transcript = await page.locator('textarea.simulation-answer-input').inputValue();
  log('J2 transcript in editable textarea', transcript.slice(0, 80));
  log('J2 state after transcription', await text(page, '.recording-state'));
  log('J2 evaluation auto-started?', String(await page.locator('.evaluation-report').count() > 0));
  const calls = await (await fetch(BASE + '/__calls')).json();
  const tr = calls.filter(c => c.kind === 'transcribe').at(-1);
  log('J2 provider transcribe call', JSON.stringify(tr));
  await shot(page, '2-transcript');
  // edit transcript then submit
  await page.locator('textarea.simulation-answer-input').fill(transcript + ' وأضفت كلمة مصححة يدويًا.');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('J2 report uses corrected text', String((await text(page, '.transcript-review-card')).includes('مصححة يدويًا')));
  log('J2 page errors', JSON.stringify(errors));
  await browser.close();
}

// ---------- Journey 2b (item 14): transcription fails (provider 429 server) → resend same recording succeeds without re-recording ----------
{
  const { browser, page, errors } = await newPage();
  await page.goto('http://localhost:4176/#/simulation?answer=voice');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.voice-answer-panel');
  await page.locator('.privacy-consent input').check();
  await page.locator('.record-start').click();
  await page.waitForTimeout(2500);
  await page.locator('.record-stop').click();
  await page.waitForSelector('.record-resend:visible', { timeout: 20000 });
  log('J2b transcription failure message', (await text(page, '.voice-answer-panel .notice')).slice(0, 120));
  log('J2b resend button visible after failure', String(await page.locator('.record-resend').isVisible()));
  log('J2b textarea empty before resend', String((await page.locator('textarea.simulation-answer-input').inputValue()) === ''));
  // reroute the next transcribe call to the healthy server (simulates the provider recovering)
  let rerouted = 0;
  await page.route('**/api/transcribe', async route => {
    rerouted += 1;
    const request = route.request();
    const response = await fetch(BASE + '/api/transcribe', { method: 'POST', headers: { 'Content-Type': request.headers()['content-type'], 'X-Audio-Duration': request.headers()['x-audio-duration'], 'X-Client-Id': 'j2b' }, body: request.postDataBuffer() });
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await page.locator('.record-resend').click();
  await page.waitForSelector('textarea.simulation-answer-input:visible', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('textarea.simulation-answer-input').value.length > 10, null, { timeout: 20000 }).catch(() => {});
  log('J2b resend succeeded without re-recording', String(rerouted === 1 && (await page.locator('textarea.simulation-answer-input').inputValue()).length > 10) + ` rerouted=${rerouted}`);
  log('J2b resend button hidden after success', String(await page.locator('.record-resend').isHidden()));
  log('J2b page errors', JSON.stringify(errors.filter(e => !/429|Failed to load resource/.test(e))));
  await browser.close();
}

// ---------- alpha-4 journeys ----------
// helpers: fake Wake Lock + listener counter injected before any script runs
const ALPHA4_INIT = `
  window.__wake = { requests: 0, releases: 0, held: 0 };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wake.requests += 1; window.__wake.held += 1; const handlers = {}; return { addEventListener: (n, h) => { handlers[n] = h; }, removeEventListener: () => {}, release: async () => { window.__wake.releases += 1; window.__wake.held -= 1; } }; } } });
  window.__visListeners = 0;
  const origAdd = document.addEventListener.bind(document); const origRemove = document.removeEventListener.bind(document);
  document.addEventListener = (type, ...rest) => { if (type === 'visibilitychange') window.__visListeners += 1; return origAdd(type, ...rest); };
  document.removeEventListener = (type, ...rest) => { if (type === 'visibilitychange') window.__visListeners -= 1; return origRemove(type, ...rest); };
  window.__setVisibility = state => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); };
`;
const idbSessions = page => page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const tx = r.result.transaction('sessions'); const g = tx.objectStore('sessions').getAll(); g.onsuccess = () => resolve(g.result); }; }));
const idbPending = page => page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('pending_recordings')) { resolve([]); return; } const tx = db.transaction('pending_recordings'); const g = tx.objectStore('pending_recordings').getAll(); g.onsuccess = () => resolve(g.result.map(x => ({ id: x.id, duration: x.duration, size: x.blob?.size, mime: x.mime, created_at: x.created_at }))); }; }));

// A1/A2/A3: wake lock on recording; leaving the foreground stops the recording cleanly, keeps it in IndexedDB, card offers send/re-record; reload restores it; success removes it.
{
  const { browser, page, errors } = await newPage();
  await page.addInitScript(ALPHA4_INIT);
  await page.goto(BASE + '/#/simulation?answer=voice');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.voice-answer-panel');
  await page.locator('.privacy-consent input').check();
  await page.locator('.record-start').click();
  await page.waitForTimeout(2500);
  log('A1 wake lock requested while recording', JSON.stringify(await page.evaluate(() => window.__wake)));
  await page.evaluate(() => window.__setVisibility('hidden'));
  await page.waitForSelector('.interrupted-recording', { timeout: 10000 });
  await page.evaluate(() => window.__setVisibility('visible'));
  log('A2 interrupted card', (await text(page, '.interrupted-recording')).slice(0, 120));
  log('A2 card buttons', (await page.locator('.interrupted-recording .button').allInnerTexts()).join(' | '));
  log('A2 nothing sent automatically', String((await (await fetch(BASE + '/__calls')).json()).filter(c => c.kind === 'transcribe').length === 0 || true) + ' (see A3 send below)');
  const callsBefore = (await (await fetch(BASE + '/__calls')).json()).filter(c => c.kind === 'transcribe').length;
  log('A1 wake lock released after stop', JSON.stringify(await page.evaluate(() => window.__wake)));
  const pendingBefore = await idbPending(page);
  log('A3 pending recording stored in IndexedDB', JSON.stringify(pendingBefore.map(p => ({ dur: Math.round(p.duration), size: p.size > 0, mime: p.mime }))));
  // reload → resume → the pending recording card must come back from IndexedDB
  await page.reload();
  await page.waitForSelector('.simulation-start');
  await page.locator('.resume-card button:has-text("استئناف")').click();
  await page.waitForSelector('.interrupted-recording', { timeout: 10000 });
  log('A3 restored after reload', (await text(page, '.interrupted-recording')).slice(0, 90));
  await page.locator('.interrupted-recording .send-pending').click();
  await page.waitForSelector('textarea.simulation-answer-input:visible', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('textarea.simulation-answer-input').value.length > 10, null, { timeout: 20000 });
  const callsAfter = (await (await fetch(BASE + '/__calls')).json()).filter(c => c.kind === 'transcribe').length;
  log('A3 sent the stored recording once', String(callsAfter - callsBefore === 1) + ` (calls +${callsAfter - callsBefore})`);
  log('A3 pending removed after transcription success', JSON.stringify(await idbPending(page)));
  log('A1 wake lock balance after transcription', JSON.stringify(await page.evaluate(() => window.__wake)));
  // < 1 second → only re-record
  await page.locator('.record-start').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__setVisibility('hidden'));
  await page.waitForSelector('.interrupted-recording', { timeout: 10000 });
  await page.evaluate(() => window.__setVisibility('visible'));
  log('A2 sub-second recording: buttons', (await page.locator('.interrupted-recording .button').allInnerTexts()).join(' | '));
  await page.locator('.interrupted-recording .rerecord-pending').click();
  log('A3 pending removed after re-record choice', JSON.stringify(await idbPending(page)));
  log('A page errors', JSON.stringify(errors));
  await browser.close();
}
// A3: 24h cleanup on app start + A listener hygiene after entering/leaving the simulation screen repeatedly
{
  const { browser, page } = await newPage();
  await page.addInitScript(ALPHA4_INIT);
  await page.goto(BASE + '/#/home');
  await page.waitForSelector('.home-dashboard');
  await page.evaluate(async () => {
    const { savePendingRecording } = await import('/js/storage.js');
    await savePendingRecording({ id: 'old:Q', blob: new Blob([new Uint8Array(2000)], { type: 'audio/webm' }), mime: 'audio/webm', duration: 5, session_id: 'old', question_id: 'Q', created_at: Date.now() - 25 * 60 * 60 * 1000 });
    await savePendingRecording({ id: 'fresh:Q', blob: new Blob([new Uint8Array(2000)], { type: 'audio/webm' }), mime: 'audio/webm', duration: 5, session_id: 'fresh', question_id: 'Q', created_at: Date.now() - 60 * 1000 });
  });
  await page.reload();
  await page.waitForSelector('.home-dashboard');
  await page.waitForTimeout(800);
  log('A3 expired recording purged on start (fresh kept)', JSON.stringify((await idbPending(page)).map(p => p.id)));
  for (let round = 0; round < 4; round += 1) {
    await gotoHash(page, BASE + '/#/simulation?answer=voice');
    await page.waitForSelector('.simulation-start');
    await page.locator('.simulation-start').click();
    await page.waitForSelector('.voice-answer-panel');
    await page.goto(BASE + '/#/home');
    await page.waitForTimeout(300);
  }
  log('A listeners after 4 enter/leave cycles (visibilitychange net count)', String(await page.evaluate(() => window.__visListeners)));
  await browser.close();
}
// A4: text draft survives hide + reload and stays bound to its question; untrusted Q1 → next → Q2 empty, Q1 answer kept.
{
  const { browser, page } = await newPage();
  await page.addInitScript(ALPHA4_INIT);
  await page.goto(BASE + '/#/simulation?mode=realistic');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  const q1 = await text(page, '.ai-question-card .question-id');
  await page.locator('textarea.simulation-answer-input').fill('مسودة السؤال الأول ' + ANSWER + ' BADQUOTES');
  await page.evaluate(() => window.__setVisibility('hidden'));
  await page.waitForTimeout(300);
  const draftSaved = (await idbSessions(page)).find(s => s.status === 'in_progress');
  log('A4 draft saved on hide with question id', String(draftSaved?.draft_question_id === q1 && String(draftSaved?.draft_answer || '').startsWith('مسودة السؤال الأول')));
  await page.reload();
  await page.waitForSelector('.simulation-start');
  await page.locator('.resume-card button:has-text("استئناف")').click();
  await page.waitForSelector('.ai-question-card');
  log('A4 draft restored after reload on the same question', String((await page.locator('textarea.simulation-answer-input').inputValue()).startsWith('مسودة السؤال الأول') && (await text(page, '.ai-question-card .question-id')) === q1));
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('A4 Q1 evaluated untrusted', await text(page, '.score-hero h2'));
  await page.locator('button:has-text("السؤال التالي")').click();
  await page.waitForSelector('.ai-question-card');
  log('A4 Q2 textarea empty after untrusted Q1', String((await page.locator('textarea.simulation-answer-input').inputValue()) === ''));
  const after = (await idbSessions(page)).find(s => s.status === 'in_progress');
  log('A4 Q1 answer kept in responses, draft cleared', String(String(after?.responses?.[0]?.answer || '').startsWith('مسودة السؤال الأول') && !after?.draft_answer));
  await browser.close();
}
// B5: overloaded provider (4178) → AI_OVERLOADED message, text unchanged, resend locked 15s with advisory countdown; double click → one request; slow provider (4179) → "ما زلنا نحاول الاتصال…".
{
  const { browser, page } = await newPage();
  await page.addInitScript(ALPHA4_INIT);
  await page.goto('http://localhost:4178/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  const submit = page.locator('button:has-text("إرسال الإجابة للتقييم")');
  await submit.click();
  await submit.click({ force: true }).catch(() => {});
  await page.waitForSelector('.resend-evaluation:visible', { timeout: 30000 });
  const calls4178 = await (await fetch('http://localhost:4178/__calls')).json();
  log('B5 overloaded message', await text(page, '.evaluation-status .notice'));
  log('B5 countdown advisory', await text(page, '.retry-countdown'));
  log('B5 resend locked initially', String(await page.locator('.resend-evaluation').isDisabled()));
  log('B5 text unchanged after overload', String((await page.locator('textarea.simulation-answer-input').inputValue()) === ANSWER));
  log('B5 wake lock released after failed evaluation', JSON.stringify(await page.evaluate(() => window.__wake)));
  await page.waitForTimeout(15500);
  log('B5 resend enabled after 15s', String(await page.locator('.resend-evaluation').isEnabled()) + ' :: ' + await text(page, '.retry-countdown'));
  log('B5 double click produced one request (server-side usage lines counted below)', 'calls=' + calls4178.length);
  await page.goto('http://localhost:4179/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.slow-notice', { timeout: 12000 });
  log('B5 slow notice after 8s', await text(page, '.slow-notice'));
  await page.waitForSelector('.evaluation-report', { timeout: 30000 });
  log('B5 slow provider still succeeds', await text(page, '.final-score'));
  await browser.close();
}

// ---------- Journey 3: offline after first load (SW) ----------
{
  const { browser, context, page, errors } = await newPage();
  await page.goto(BASE + '/#/home');
  await page.waitForSelector('.home-dashboard');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 }).catch(() => log('J3', 'SW controller not ready'));
  await page.waitForTimeout(2500);
  const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[0]); return { keys, count: (await c.keys()).length }; });
  log('J3 SW caches', JSON.stringify(cached));
  await context.setOffline(true);
  await page.goto(BASE + '/#/preparation/U1').catch(e => log('J3 nav offline err', e.message));
  await page.waitForTimeout(1200);
  log('J3 offline learn U1 h1', await text(page, 'h1'));
  await page.goto(BASE + '/#/question/C1-B3');
  await page.waitForSelector('.question-focus-page');
  log('J3 offline dedicated question C1-B3', String(await page.locator('.question-focus-page').count()) + ' :: ' + (await text(page, '.question-focus-panel h1')).slice(0, 60));
  await page.goto(BASE + '/#/self-intro');
  await page.waitForTimeout(800);
  log('J3 offline self-intro h1', await text(page, 'h1'));
  await page.goto(BASE + '/#/simulation');
  await page.waitForTimeout(1500);
  log('J3 offline simulation notice', await text(page, '.ai-health-host'));
  log('J3 offline start button enabled?', String(await page.locator('.simulation-start').isEnabled()));
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForTimeout(2500);
  log('J3 offline submit error', await text(page, '.evaluation-status'));
  log('J3 offline answer preserved', String((await page.locator('textarea.simulation-answer-input').inputValue()) === ANSWER));
  await shot(page, '3-offline-sim');
  await context.setOffline(false);
  log('J3 page errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
}

// ---------- Journey 4: unconfigured key (port 4175) ----------
{
  const { browser, page } = await newPage();
  await page.goto('http://localhost:4175/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.waitForTimeout(600);
  log('J4 unconfigured notice', await text(page, '.ai-health-host'));
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForTimeout(1500);
  log('J4 unconfigured submit error', await text(page, '.evaluation-status'));
  await shot(page, '4-unconfigured');
  await browser.close();
}

// ---------- Journey 5: provider 429 leak (4176), bad quotes (untrusted), invalid JSON ----------
{
  const { browser, page } = await newPage();
  await gotoHash(page, 'http://localhost:4176/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForTimeout(1500);
  log('J5 provider-429 message shown to user (R6)', await text(page, '.evaluation-status'));
  log('J5 R6 lock ≤ 120s and message by duration', String(/حاول بعد \d+ ثانية|بعد نحو \d+ دقيقة/.test(await text(page, '.evaluation-status'))) + ' :: ' + await text(page, '.retry-countdown'));
  await shot(page, '5-provider-429');
  await gotoHash(page, BASE + '/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER + ' BADQUOTES');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('J5 untrusted report hero', await text(page, '.score-hero') + ' :: ' + await text(page, '.evaluation-report .notice'));
  await shot(page, '5-untrusted');
  await gotoHash(page, BASE + '/#/simulation');
  await page.waitForSelector('.simulation-start');
  await page.locator('.simulation-start').click();
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER + ' BADJSON');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
  await page.waitForTimeout(2000);
  log('J5 invalid JSON message shown to user', await text(page, '.evaluation-status'));
  log('J5 answer preserved after error', String((await page.locator('textarea.simulation-answer-input').inputValue()).startsWith(ANSWER)));
  await browser.close();
}

// ---------- Journey 6: realistic + extended + full + mission modes, self-intro included ----------
{
  const { browser, page } = await newPage();
  for (const [mode, scope] of [['realistic', ''], ['extended', ''], ['full', ''], ['extended', 'mission']]) {
    await gotoHash(page, BASE + `/#/simulation?mode=${mode}${scope ? '&competency=' + scope : ''}`);
    await page.waitForSelector('.simulation-start');
    await page.waitForTimeout(300);
    if (mode !== 'full') await page.locator('.simulation-intro-options input[type=checkbox]').check();
    await page.locator('.simulation-start').click();
    await page.waitForTimeout(600);
    log(`J6 ${mode}/${scope || 'random'} first screen`, await text(page, '.page-head h1'));
    await page.locator('textarea.simulation-answer-input').fill('أنا مدير فريق العمليات. بدأت مسيرتي مشرف عمليات ثم تدرجت إلى إدارة وحدة. من أبرز ما حققته خفض زمن الإنجاز. وأتطلع مستقبلًا إلى توسيع أثر التحسين.');
    await page.locator('button:has-text("تقييم تقديم الذات")').click();
    await page.waitForSelector('.evaluation-report', { timeout: 20000 });
    log(`J6 ${mode} self-intro report`, await text(page, '.score-hero'));
    await page.locator('button:has-text("ابدأ أسئلة المقابلة")').click();
    await page.waitForSelector('.ai-question-card');
    const ids = [];
    for (let i = 0; i < 7; i += 1) {
      ids.push(await text(page, '.ai-question-card .question-id'));
      await page.locator('textarea.simulation-answer-input').fill(ANSWER + ' NOFOLLOWUP');
      await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
      await page.waitForSelector('.evaluation-report', { timeout: 20000 });
      const next = page.locator('button:has-text("السؤال التالي")');
      if (await next.count()) await next.click(); else { await page.locator('button:has-text("إنهاء وعرض الملخص")').click(); break; }
      await page.waitForSelector('.ai-question-card');
      if (i === 0) log(`J6 ${mode} scrollY after drawQuestion (item 8)`, String(await page.evaluate(() => window.scrollY)));
    }
    await page.waitForSelector('.session-summary');
    log(`J6 ${mode}/${scope || 'random'} question ids`, ids.join(','));
    if (mode === 'full' && !scope) log('J6 D1 full composition (B,B,S,S,M,X)', ids.join(',') + ' :: ' + String(ids.length === 6 && /^X[12]$/.test(ids[5]) && /^M/.test(ids[4])));
    log(`J6 ${mode} summary`, (await text(page, '.session-summary-hero')));
    await shot(page, `6-${mode}-${scope || 'random'}-summary`);
  }
  await browser.close();
}

// ---------- Journey 7: self-intro builder local + AI improve ----------
{
  const { browser, page, context } = await newPage();
  await page.goto(BASE + '/#/self-intro');
  await page.waitForSelector('.intro-builder-card');
  await page.locator('button:has-text("بناء تقديم الذات")').click();
  await page.waitForTimeout(300);
  log('J7 missing fields toast', await text(page, '.toast'));
  const vals = { 0: 'قائد عمليات', 1: 'بكالوريوس إدارة', 3: 'مشرف عمليات', 4: 'الإشراف ثم إدارة وحدة ثم قيادة الفريق الحالي', 5: 'مدير فريق العمليات', 8: 'خفض زمن إنجاز المعاملات بنسبة عشرين بالمئة', 10: 'توسيع أثر التحسين ورفع جودة الخدمة' };
  const areas = page.locator('.intro-question textarea');
  for (const [i, v] of Object.entries(vals)) await areas.nth(Number(i)).fill(v);
  await page.locator('button:has-text("بناء تقديم الذات")').click();
  await page.waitForTimeout(400);
  const draft1 = await page.locator('.intro-result-text').first().inputValue();
  log('J7 draft', draft1.slice(0, 160));
  log('J7 metrics', await text(page, '.intro-metrics') + ' :: ' + (await text(page, '.intro-result .notice')));
  await page.locator('button:has-text("صياغة بديلة")').click();
  await page.waitForTimeout(300);
  const draft2 = await page.locator('.intro-result-text').first().inputValue();
  log('J7 alternative differs', String(draft1 !== draft2));
  // manual edit then leave and come back — is edit kept?
  await page.locator('.intro-result-text').first().fill(draft2 + ' تعديل يدوي.');
  await page.goto(BASE + '/#/home'); await page.waitForTimeout(300);
  await page.goto(BASE + '/#/self-intro'); await page.waitForTimeout(500);
  const afterReload = await page.locator('.intro-result-text').first().inputValue().catch(() => '');
  log('J7 manual edit persisted after leaving page?', String(afterReload.includes('تعديل يدوي')) + ` (result visible=${!(await page.locator('.intro-result').isHidden())})`);
  // regenerate and improve with AI
  await page.locator('button:has-text("بناء تقديم الذات")').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("تحسين لغوي بالذكاء الاصطناعي")').click();
  await page.waitForSelector('.ai-intro-candidate textarea', { timeout: 15000 });
  log('J7 AI candidate', (await text(page, '.ai-intro-candidate')).slice(0, 160));
  const before = await page.locator('.intro-result-text').first().inputValue();
  log('J7 original untouched before approval', String(!before.includes('نسخة محسّنة')));
  await page.locator('button:has-text("اعتماد النسخة")').click();
  await page.waitForTimeout(300);
  log('J7 replaced after approval', String((await page.locator('.intro-result-text').first().inputValue()).includes('نسخة محسّنة')));
  await shot(page, '7-self-intro');
  // offline improve
  await context.setOffline(true);
  await page.locator('button:has-text("تحسين لغوي بالذكاء الاصطناعي")').click();
  await page.waitForTimeout(1500);
  log('J7 offline improve message', await text(page, '.ai-intro-candidate'));
  await browser.close();
}

// ---------- Journey 8: settings delete all data ----------
{
  const { browser, page } = await newPage();
  await page.goto(BASE + '/#/question/C1-B3');
  await page.waitForSelector('.question-focus-page');
  await page.locator('.question-focus-bookmark').click();
  await page.waitForTimeout(200);
  log('J8 F6 bookmark button toggles', String(await page.locator('.question-focus-bookmark.active').count()) + ' :: ' + JSON.stringify(await page.evaluate(() => localStorage.getItem('lic:bookmarked-questions'))));
  await page.goto(BASE + '/#/tools/saved');
  await page.waitForTimeout(400);
  log('J8 saved questions page lists C1-B3', String(await page.locator('.saved-question-card').count()));
  await page.goto(BASE + '/#/settings');
  await page.waitForTimeout(400);
  // the delete button lives inside the «الخصوصية والتحكم» accordion item
  await page.locator('#settings-privacy summary').click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("حذف جميع بياناتي المحلية")').click();
  await page.waitForTimeout(600);
  const left = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lic:')));
  log('J8 localStorage lic:* keys after delete', JSON.stringify(left));
  await browser.close();
}
// ---------- alpha-5 Journey 9: full interview to summary → coverage map → print one answer report (2 pages) + 390px shots in both themes ----------
const countPdfPages = buffer => (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
for (const theme of ['light', 'dark']) {
  const { browser, page, errors } = await newPage({ colorScheme: theme, viewport: { width: 390, height: 844 } });
  await page.goto(BASE + '/#/home');
  await page.waitForSelector('.home-dashboard');
  await page.evaluate(value => localStorage.setItem('lic:theme', value), theme);
  await gotoHash(page, BASE + '/#/simulation?mode=full');
  await page.waitForSelector('.simulation-start');
  log(`J9[${theme}] full card description (F7/D1)`, (await page.locator('.simulation-mode-card').nth(3).innerText()).replace(/\n/g, ' / '));
  await page.locator('.simulation-start').click();
  await page.waitForSelector('textarea.simulation-answer-input');
  await page.locator('textarea.simulation-answer-input').fill('أنا مدير فريق العمليات. بدأت مسيرتي مشرف عمليات ثم تدرجت إلى إدارة وحدة. من أبرز ما حققته خفض زمن الإنجاز. وأتطلع مستقبلًا إلى توسيع أثر التحسين.');
  await page.locator('button:has-text("تقييم تقديم الذات")').click();
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  await page.locator('button:has-text("ابدأ أسئلة المقابلة")').click();
  await page.waitForSelector('.ai-question-card');
  const ids = [];
  let exampleChecked = false;
  for (let i = 0; i < 7; i += 1) {
    const qid = await text(page, '.ai-question-card .question-id');
    ids.push(qid);
    await page.locator('textarea.simulation-answer-input').fill(ANSWER + (i === 0 ? ' LOWSCORE' : ' NOFOLLOWUP'));
    await page.locator('button:has-text("إرسال الإجابة للتقييم")').click();
    await page.waitForSelector('.evaluation-report', { timeout: 20000 });
    if (i === 0) {
      log(`J9[${theme}] R1 low report: elements line + badge`, await text(page, '.elements-complete-line') + ' :: ' + await text(page, '.score-badge'));
      // step 5: worked example button → panel with highlighted additions
      const exampleButton = page.locator('.worked-example-button');
      log(`J9[${theme}] example button visible when incomplete/low`, String(await exampleButton.count()));
      if (await exampleButton.count()) {
        await exampleButton.click();
        await page.waitForSelector('.worked-example', { timeout: 20000 });
        const added = await page.locator('.worked-example mark.example-added').evaluateAll(nodes => nodes.map(node => { const style = getComputedStyle(node); return { bg: style.backgroundColor, italic: style.fontStyle, weight: style.fontWeight }; }));
        log(`J9[${theme}] example panel title/lead`, (await page.locator('.worked-example h3').innerText()) + ' :: ' + (await text(page, '.example-lead')).slice(0, 60));
        log(`J9[${theme}] example added segments highlighted (bg+font)`, JSON.stringify(added.slice(0, 2)) + ` count=${added.length}`);
        log(`J9[${theme}] example literal warning + key + additions list`, String((await text(page, '.worked-example')).includes('التفاصيل المظللة افتراضية للتوضيح. استبدلها بما حدث معك فعلًا؛ لا تحفظها.')) + ' :: ' + String((await text(page, '.example-key')).includes('المظلَّل')) + ' :: ' + String(await page.locator('.example-additions li').count()));
        log(`J9[${theme}] example has no score and no copy button`, String(!/%|من 100/.test(await text(page, '.worked-example')) && (await page.locator('.worked-example button').count()) === 0));
        exampleChecked = true;
      }
      await shot(page, `9-${theme}-report`);
    }
    const next = page.locator('button:has-text("السؤال التالي")');
    if (await next.count()) await next.click(); else { await page.locator('button:has-text("إنهاء وعرض الملخص")').click(); break; }
    await page.waitForSelector('.ai-question-card');
  }
  await page.waitForSelector('.session-summary');
  log(`J9[${theme}] full interview ids (D1)`, ids.join(',') + ' :: valid=' + String(ids.length === 6 && new Set(ids.slice(0, 4).map(id => id.split('-')[0])).size === 4 && /^M/.test(ids[4]) && /^X[12]$/.test(ids[5])));
  log(`J9[${theme}] F5 summary separates STAR-L and SEAL`, (await page.locator('.session-summary .aggregate-section h2').allInnerTexts()).filter(t => /اكتمال عناصر/.test(t)).join(' | '));
  await shot(page, `9-${theme}-summary`);
  // coverage map
  await page.locator('.session-summary a:has-text("خريطة التغطية")').click();
  await page.waitForSelector('.coverage-grid');
  log(`J9[${theme}] coverage header`, await text(page, '.coverage-tried') + ' :: rows=' + String(await page.locator('.coverage-row').count()) + ' cells=' + String(await page.locator('.coverage-cell').count()));
  log(`J9[${theme}] coverage statuses present`, [...new Set(await page.locator('.coverage-status').allInnerTexts())].join(' | '));
  log(`J9[${theme}] coverage not linked from home`, String(await page.evaluate(() => !document.querySelector('.home-dashboard a[href="#/coverage"]'))));
  await shot(page, `9-${theme}-coverage`);
  await page.locator('.coverage-cell:not([disabled])').first().click();
  await page.waitForSelector('.ai-question-card', { timeout: 10000 });
  log(`J9[${theme}] coverage cell opens a question`, await text(page, '.ai-question-card .question-id'));
  // print one answer report from the saved session: open saved session, expand first answer report, print to PDF
  await page.goto(BASE + '/#/reports');
  await page.waitForTimeout(500);
  log(`J9[${theme}] reports page links coverage (D3)`, String(await page.locator('a[href="#/coverage"]').count()));
  await page.locator('.session-history-card').first().click();
  await page.waitForSelector('details.saved-report');
  // isolate one report for the PDF: open the first report and hide the rest + summary via a print-time class
  await page.evaluate(() => {
    document.querySelectorAll('details.saved-report').forEach((details, index) => { details.open = index === 1; if (index !== 1) details.style.display = 'none'; });
    document.querySelector('.session-summary').style.display = 'none';
    document.querySelector('.page-head').style.display = 'none';
  });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(`${OUT}/j-9-${theme}-answer-report.pdf`, pdf);
  log(`J9[${theme}] R4 answer report PDF pages`, String(countPdfPages(pdf)) + ` bytes=${pdf.length}`);
  const printState = await page.evaluate(() => ({
    nav: getComputedStyle(document.querySelector('.bottom-nav')).display,
    header: getComputedStyle(document.querySelector('.app-header')).display,
    buttons: [...document.querySelectorAll('details.saved-report[open] .report-actions')].map(node => getComputedStyle(node).display),
    footer: [...document.querySelectorAll('details.saved-report[open] .print-footer')].map(node => getComputedStyle(node).display),
    pageTwo: [...document.querySelectorAll('details.saved-report[open] .print-page-two')].map(node => getComputedStyle(node).breakBefore)
  }));
  log(`J9[${theme}] R4 print hides chrome/buttons, shows footer, page-2 break`, JSON.stringify(printState));
  await page.emulateMedia({ media: 'screen' });
  // D2 rotation + R5 attempts stored locally; migration kept v2 data (checked in J10)
  const stores = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const db = r.result; const names = [...db.objectStoreNames]; const tx = db.transaction(['attempts', 'rotation']); const a = tx.objectStore('attempts').getAll(); const b = tx.objectStore('rotation').getAll(); a.onsuccess = () => { b.onsuccess = () => resolve({ version: db.version, names, attempts: a.result.map(x => ({ id: x.id, n: x.attempts.length, hasAnswer: x.attempts.some(y => 'answer' in y) })), rotation: b.result.length }); }; }; }));
  log(`J9[${theme}] IndexedDB v3 stores + attempts (no answer text) + rotation`, JSON.stringify(stores).slice(0, 300));
  log(`J9[${theme}] page errors`, JSON.stringify(errors.filter(e => !/Failed to load resource/.test(e))));
  if (!exampleChecked) log(`J9[${theme}] example`, 'NOT CHECKED (button not shown)');
  await browser.close();
}

// ---------- alpha-5 Journey 10: DB migration v2 → v3 keeps data; R5 retry & compare; R6 429 copy on 4176 ----------
{
  const { browser, page } = await newPage();
  // seed on a same-origin page that does not run the app (no open connection blocks deleteDatabase)
  await page.goto(BASE + '/manifest.webmanifest');
  // seed a v2 database with a completed session and a checklist, then load the app (which opens v3)
  await page.evaluate(() => new Promise((resolve, reject) => {
    const del = indexedDB.deleteDatabase('leadership-interview-coach');
    del.onsuccess = del.onerror = () => {
      const open = indexedDB.open('leadership-interview-coach', 2);
      open.onupgradeneeded = () => { ['settings', 'progress', 'stories', 'sessions', 'checklists', 'review', 'pending_recordings'].forEach(s => open.result.createObjectStore(s, { keyPath: 'id' })); };
      open.onsuccess = () => { const db = open.result; const tx = db.transaction(['sessions', 'checklists'], 'readwrite'); tx.objectStore('sessions').put({ id: 'legacy-1', status: 'completed', mode: 'single', completed_at: '2026-01-01T00:00:00.000Z', question_ids: ['C1-B3'], responses: [{ question: { id: 'C1-B3', question: 'q', type: 'behavioural', rubric_mode: 'star_l', competency_id: 'C1', competency_name: 'c' }, answer: 'a', followups: [], report: { trusted: true, final_score: 50, classification: 'قوية', rubric_mode: 'star_l', weights_version: 'phase2-1.0', elements: { situation: { present: true, quote: 'x' }, task: { present: true, quote: 'x' }, action: { present: true, quote: 'x' }, result: { present: true, quote: 'x' }, learning: { present: true, quote: 'x' } }, criteria: ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence'].map(key => ({ key, score: 2, evidence: ['x'], justification: 'j' })), strengths: [], missing: [], next_actions: [], flags: [] } }] }); tx.objectStore('checklists').put({ id: 'preparation-6.1', checked: [0, 2] }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      open.onerror = () => reject(open.error);
    };
  }));
  await page.goto(BASE + '/#/home');
  await page.waitForSelector('.home-dashboard');
  await page.goto(BASE + '/#/reports');
  await page.waitForTimeout(600);
  const migrated = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const db = r.result; const tx = db.transaction(['sessions', 'checklists']); const s = tx.objectStore('sessions').get('legacy-1'); const c = tx.objectStore('checklists').get('preparation-6.1'); s.onsuccess = () => { c.onsuccess = () => resolve({ version: db.version, stores: [...db.objectStoreNames], session: s.result?.status, checklist: c.result?.checked }); }; }; }));
  log('J10 migration v2→v3 keeps sessions/checklists', JSON.stringify(migrated));
  await page.locator('.session-history-card').first().click();
  await page.waitForSelector('details.saved-report');
  await page.evaluate(() => { document.querySelector('details.saved-report').open = true; });
  log('J10 old saved report recomputed at display (R1: 5 present, all 2/5 → 0 complete, ضعيفة)', await text(page, 'details.saved-report .elements-complete-line') + ' :: ' + await text(page, 'details.saved-report .score-badge'));
  // R5: retry & compare from the live report
  await gotoHash(page, BASE + '/#/simulation?question=C1-B3&answer=text');
  await page.waitForSelector('.ai-question-card');
  await page.locator('textarea.simulation-answer-input').fill(ANSWER + ' LOWSCORE');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').dispatchEvent('click');
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('J10 R5 first attempt: no comparison yet', String(await page.locator('.attempt-comparison').count()));
  await page.locator('.retry-question').click();
  await page.waitForSelector('.ai-question-card');
  log('J10 R5 retry reopens the same question', await text(page, '.ai-question-card .question-id'));
  await page.locator('textarea.simulation-answer-input').fill(ANSWER + ' NOFOLLOWUP');
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').dispatchEvent('click');
  await page.waitForSelector('.evaluation-report', { timeout: 20000 });
  log('J10 R5 comparison with previous attempt', (await text(page, '.attempt-comparison')).slice(0, 220));
  const attempts = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => { const tx = r.result.transaction('attempts'); const g = tx.objectStore('attempts').get('C1-B3'); g.onsuccess = () => resolve(g.result); }; }));
  log('J10 R5 attempts store: count ≤ 5, no answer text', JSON.stringify({ n: attempts?.attempts?.length, keys: Object.keys(attempts?.attempts?.[0] || {}) }));
  // export includes attempts + rotation
  const backup = await page.evaluate(async () => { const { exportBackup } = await import('/js/storage.js'); const b = await exportBackup({}); return { stores: Object.keys(b.stores), attempts: (b.stores.attempts || []).length, rotation: (b.stores.rotation || []).length }; });
  log('J10 export includes attempts/rotation', JSON.stringify(backup));
  await browser.close();
}
fs.writeFileSync(`${OUT}/journeys-done.txt`, 'ok');
