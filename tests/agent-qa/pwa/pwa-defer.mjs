// Deferred PWA update scenarios. Env: V2_ROOT, V2_NEXT_ROOT (copy with bumped cache suffix), HARNESS_SERVER.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const V2 = process.env.V2_ROOT, V2N = process.env.V2_NEXT_ROOT, SERVER = process.env.HARNESS_SERVER;
const NEXT = 'leadership-interview-coach-v0.6.0-alpha-10.2-51d413de-v2i-next';
const ANSWER = 'في بداية المشروع كان الفريق متأخرًا عن الجدول. كانت مهمتي إعادة توزيع العمل. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي. اكتمل المشروع في الموعد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
const VIS = `(() => { let s = 'visible'; Object.defineProperty(document, 'visibilityState', { get: () => s, configurable: true }); Object.defineProperty(document, 'hidden', { get: () => s === 'hidden', configurable: true }); window.__resume = () => { s = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); s = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }; })();`;
let port = 4700;
const start = (root, p) => new Promise(r => { const s = spawn('node', [SERVER], { env: { ...process.env, ROOT: root, PORT: String(p) }, stdio: 'ignore' }); setTimeout(() => r(s), 1500); });
const results = {};
async function scenario(name, fn) {
  const p = ++port, base = `http://localhost:${p}`, profile = `/tmp/defer-${name}`;
  fs.rmSync(profile, { recursive: true, force: true });
  let srv = await start(V2, p);
  const ctx = await chromium.launchPersistentContext(profile, { ...devices['iPhone 14'], locale: 'ar-AE', permissions: ['microphone'], args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  await ctx.addInitScript(VIS);
  const page = ctx.pages()[0]; const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(`${base}/#/home`); await page.waitForTimeout(2500); await page.reload(); await page.waitForTimeout(2000); // v2i SW controls
  const loads = []; const t0 = Date.now(); page.on('load', () => loads.push(Date.now() - t0));
  const h = {
    base, page,
    swapToNext: async () => { srv.kill(); srv = await start(V2N, p); },
    resume: () => page.evaluate(() => window.__resume()),
    cache: () => page.evaluate(() => caches.keys()),
    notice: () => page.locator('.update-notice').count(),
    loads: () => loads.length,
    stores: () => page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('leadership-interview-coach'); q.onsuccess = () => r(q.result); }); const o = {}; for (const s of ['sessions', 'attempts']) o[s] = await new Promise(r => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result); }); db.close(); return o; })
  };
  try { results[name] = { ...(await fn(h)), errors }; } catch (e) { results[name] = { failed: e.message.split('\n')[0], errors }; }
  await ctx.close(); srv.kill();
}
async function openQuestion(page, base, answer = 'text') {
  await page.goto(`${base}/#/simulation?question=C1-B3&answer=${answer}`); await page.waitForSelector('.simulation-privacy-page');
  await page.locator('#simulation-privacy-acknowledgement').check(); await page.locator('.simulation-privacy-continue').click();
  await page.waitForSelector('.ai-question-card');
}
// 1) idle on home -> new release -> applied once, silently
if (!process.env.ONLY || process.env.ONLY==='idle') await scenario('idle', async h => {
  await h.swapToNext(); await h.resume(); await h.page.waitForTimeout(6000);
  const loadsAfter = h.loads(); await h.resume(); await h.page.waitForTimeout(6000);
  return { reloads: loadsAfter, reloadsAfterSecondResume: h.loads() - loadsAfter, cache: await h.cache(), noticeShown: await h.notice() };
});
// 2) unsaved text answer -> deferred, notice once, text intact; applied after the interview finishes
if (!process.env.ONLY || process.env.ONLY==='unsaved-text') await scenario('unsaved-text', async h => {
  const { page, base } = h; await openQuestion(page, base); await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await h.swapToNext(); await h.resume(); await page.waitForTimeout(9000);
  const during = { reloads: h.loads(), notice: await h.notice(), textKept: (await page.locator('textarea.simulation-answer-input').inputValue()) === ANSWER, cache: await h.cache() };
  await page.locator('.update-notice button:has-text("لاحقًا")').click().catch(() => {});
  await h.resume(); await page.waitForTimeout(5000);
  const noticeAgain = await h.notice();
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click(); await page.waitForSelector('.evaluation-report', { timeout: 30000 });
  await page.waitForTimeout(6000); const afterReport = { reloads: h.loads() };
  await page.locator('button:has-text("إنهاء وعرض الملخص")').first().click(); await page.waitForTimeout(9000);
  return { during, noticeShownAgainAfterDismiss: noticeAgain, reloadsWhileReportOpen: afterReport.reloads, reloadsAfterFinish: h.loads(), cacheAfter: await h.cache(), stores: await h.stores() };
});
// 3) active voice recording -> deferred; applied after leaving the interview
if (!process.env.ONLY || process.env.ONLY==='recording') await scenario('recording', async h => {
  const { page, base } = h; let step = 'open'; try {
  await openQuestion(page, base, 'voice'); step = 'consent';
  await page.locator('.privacy-consent input').check(); step = 'record-start'; await page.locator('.record-start').click(); await page.waitForTimeout(1500); step = 'swap';
  await h.swapToNext(); await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update())); await page.waitForTimeout(7000);
  const during = { reloads: h.loads(), stillRecording: await page.locator('.record-stop').isVisible(), notice: await h.notice() };
  step = 'record-stop'; await page.locator('.record-stop').click(); step = 'transcript'; await page.waitForSelector('textarea.simulation-answer-input:visible', { timeout: 20000 });
  await page.waitForTimeout(5000); const afterStop = h.loads();
  await page.locator('textarea.simulation-answer-input').fill('');
  await page.goto(`${base}/#/home`); await page.waitForTimeout(8000);
  return { during, reloadsAfterTranscriptionStillInInterview: afterStop, reloadsAfterLeaving: h.loads(), cacheAfter: await h.cache() };
  } catch (e) { return { failedAtStep: step, message: e.message.split('\n')[0], recordButtons: await page.locator('.record-start, .record-stop, .privacy-consent input').evaluateAll(n => n.map(x => x.className + ':' + (x.offsetParent !== null))) }; }
});
// 4) AI evaluation in flight (7 s) -> no reload during the request
if (!process.env.ONLY || process.env.ONLY==='evaluation') await scenario('evaluation', async h => {
  const { page, base } = h; await openQuestion(page, base); await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.route('**/api/evaluate', async route => { await new Promise(r => setTimeout(r, 7000)); await route.continue(); });
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click(); await page.waitForTimeout(800);
  await h.swapToNext(); await h.resume(); await page.waitForTimeout(4000);
  const midRequest = { reloads: h.loads(), waitingCard: await page.locator('.ai-working').count() };
  await page.waitForSelector('.evaluation-report', { timeout: 30000 }); await page.waitForTimeout(5000);
  return { midRequest, reportShown: true, reloadsAfterReportStillInInterview: h.loads(), cache: await h.cache() };
});
// 5) user taps "تحديث الآن" during an active task -> applied immediately after confirmation, data kept
if (!process.env.ONLY || process.env.ONLY==='update-now') await scenario('update-now', async h => {
  const { page, base } = h; await openQuestion(page, base); await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.waitForTimeout(1500);
  await h.swapToNext(); await h.resume(); await page.waitForSelector('.update-notice', { timeout: 15000 });
  await page.locator('.update-notice button:has-text("تحديث الآن")').click(); await page.waitForTimeout(8000);
  const sessions = await page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('leadership-interview-coach'); q.onsuccess = () => r(q.result); }); const all = await new Promise(r => { const q = db.transaction('sessions').objectStore('sessions').getAll(); q.onsuccess = () => r(q.result); }); db.close(); return all.map(s => ({ status: s.status, draftKept: String(s.draft_answer || '').startsWith('في بداية') })); });
  await page.waitForTimeout(10000);
  return { reloads: h.loads(), cache: await h.cache(), sessions, noticeAfterReload: await h.notice() };
});
console.log(JSON.stringify(results, null, 1));
