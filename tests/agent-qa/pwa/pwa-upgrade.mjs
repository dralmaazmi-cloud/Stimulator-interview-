// PWA upgrade test. Env: V1_ROOT (work/ of commit d0c2efb), V2_ROOT (this work/), V2_NEXT_ROOT (copy of V2 with a bumped cache suffix), HARNESS_SERVER (work/audit-harness/server.mjs). Run from a dir where 'playwright' resolves.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const V1 = process.env.V1_ROOT, V2 = process.env.V2_ROOT, V2N = process.env.V2_NEXT_ROOT;
const servers = [];
const start = (root, port) => new Promise(r => { const p = spawn('node', [process.env.HARNESS_SERVER], { env: { ...process.env, ROOT: root, PORT: String(port) }, stdio: 'ignore' }); servers.push(p); setTimeout(() => r(p), 1500); });
const ANSWER = 'في بداية المشروع كان الفريق متأخرًا عن الجدول. كانت مهمتي إعادة توزيع العمل. أنا عقدت اجتماعًا ووزعت الأدوار بنفسي. اكتمل المشروع في الموعد. تعلمت أن المتابعة المبكرة تمنع التأخير.';
const VIS = `(() => { let s = 'visible'; Object.defineProperty(document, 'visibilityState', { get: () => s, configurable: true }); Object.defineProperty(document, 'hidden', { get: () => s === 'hidden', configurable: true }); window.__setVisibility = v => { s = v; document.dispatchEvent(new Event('visibilitychange')); }; })();`;
const snap = page => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('leadership-interview-coach'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const counts = {}; for (const s of db.objectStoreNames) counts[s] = await new Promise(res => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => res(q.result); });
  const ls = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('lic:') && k !== 'lic:client-id').sort().map(k => [k, localStorage.getItem(k).slice(0, 40)]));
  db.close(); return { dbVersion: db.version, counts, ls, caches: await caches.keys(), title: document.title };
});
async function seedV1(page, base) {
  await page.goto(`${base}/#/home`); await page.waitForSelector('.home-dashboard');
  await page.evaluate(() => { localStorage.setItem('lic:theme', 'dark'); localStorage.setItem('lic:font-size', 'large'); localStorage.setItem('lic:bookmarked-questions', JSON.stringify(['C1-S1', 'C2-B3'])); });
  await page.goto(`${base}/#/simulation?question=C1-B3&answer=text`); await page.waitForSelector('.simulation-privacy-page');
  await page.locator('#simulation-privacy-acknowledgement').check(); await page.locator('.simulation-privacy-continue').click();
  await page.waitForSelector('.ai-question-card'); await page.locator('textarea.simulation-answer-input').fill(ANSWER);
  await page.locator('button:has-text("إرسال الإجابة للتقييم")').click(); await page.waitForSelector('.evaluation-report', { timeout: 30000 });
  await page.locator('button:has-text("إنهاء وعرض الملخص")').first().click(); await page.waitForTimeout(1200);
  await page.goto(`${base}/#/home`); await page.waitForTimeout(2500);
}
const out = {};
// ---------- S1: installed V1 on the production origin -> V2 deployed -> cold launch ----------
{
  const PROFILE = '/tmp/pwa-s1'; fs.rmSync(PROFILE, { recursive: true, force: true }); const port = 4691, base = `http://localhost:${port}`;
  let srv = await start(V1, port);
  let ctx = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 14'], locale: 'ar-AE' });
  let page = ctx.pages()[0]; await seedV1(page, base); const before = await snap(page); await ctx.close(); srv.kill();
  srv = await start(V2, port);
  ctx = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 14'], locale: 'ar-AE' });
  page = ctx.pages()[0]; const errors = []; let navs = 0;
  page.on('pageerror', e => errors.push(e.message)); page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
  await page.goto(`${base}/#/home`); await page.waitForTimeout(3000);
  const first = { h1: await page.locator('h1').first().textContent().catch(() => null), practiceLink: await page.locator('a[href^="#/practice"]').count() };
  await page.waitForTimeout(8000); const after = await snap(page);
  await page.goto(`${base}/#/reports`); await page.waitForTimeout(1000); const sessionsListed = await page.locator('a[href^="#/sessions/"]').count();
  await page.goto(`${base}/#/tools/saved`); await page.waitForTimeout(800); const savedCount = await page.locator('main [data-question-id], main .question-link-card, main a[href^="#/question/"]').count();
  await page.goto(`${base}/#/settings`); await page.waitForTimeout(800); const hostRow = (await page.locator('main').textContent()).includes(`localhost:${port}`);
  out.S1 = { before, after, first, navigationsDuring11s: navs, sessionsListed, savedCount, hostRowShown: hostRow, errors };
  await ctx.close(); srv.kill();
}
// ---------- S2: V2 open (resumed from memory) -> newer deploy -> app returns to foreground ----------
{
  const PROFILE = '/tmp/pwa-s2'; fs.rmSync(PROFILE, { recursive: true, force: true }); const port = 4692, base = `http://localhost:${port}`;
  let srv = await start(V2, port);
  const ctx = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 14'], locale: 'ar-AE' });
  await ctx.addInitScript(VIS);
  const page = ctx.pages()[0]; const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/#/home`); await page.waitForTimeout(2500); await page.reload(); await page.waitForTimeout(2500);
  await page.evaluate(() => { localStorage.setItem('lic:theme', 'light'); localStorage.setItem('lic:v2:a5', JSON.stringify({ boxes: { 'mistakes:1': 2 } })); });
  const before = await snap(page);
  srv.kill(); srv = await start(V2N, port);                       // new release while the app sits in memory
  let navs = 0; page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
  await page.evaluate(() => window.__setVisibility('hidden')); await page.waitForTimeout(300);
  await page.evaluate(() => window.__setVisibility('visible'));   // user returns to the app
  await page.waitForTimeout(6000); const reloadsAfterResume = navs;
  await page.evaluate(() => window.__setVisibility('hidden')); await page.evaluate(() => window.__setVisibility('visible'));
  await page.waitForTimeout(6000);                                 // second resume with nothing new: must not reload again
  const after = await snap(page);
  out.S2 = { before: { caches: before.caches, title: before.title, ls: before.ls }, after: { caches: after.caches, title: after.title, ls: after.ls, counts: after.counts }, reloadsAfterResume, totalNavigations: navs, errors };
  await ctx.close(); srv.kill();
}
// ---------- S3: app pinned to a fixed deployment URL (origin A, V1 forever) -> data moved to production origin B via export/import ----------
{
  const A = 4693, B = 4694; const sa = await start(V1, A), sb = await start(V2, B);
  const browser = await chromium.launch(); const ctxA = await browser.newContext({ ...devices['iPhone 14'], locale: 'ar-AE', acceptDownloads: true });
  const pa = await ctxA.newPage(); await seedV1(pa, `http://localhost:${A}`); const before = await snap(pa);
  await pa.goto(`http://localhost:${A}/#/settings`); await pa.waitForTimeout(800); await pa.locator('summary:has-text("البيانات")').first().click(); await pa.waitForTimeout(400);
  const dl = pa.waitForEvent('download'); await pa.locator('button:has-text("تصدير البيانات")').first().click(); const file = await (await dl).path();
  const ctxB = await browser.newContext({ ...devices['iPhone 14'], locale: 'ar-AE' }); const pb = await ctxB.newPage(); const errors = []; pb.on('pageerror', e => errors.push(e.message));
  pb.on('dialog', d => d.accept());
  await pb.goto(`http://localhost:${B}/#/settings`); await pb.waitForTimeout(1500); await pb.locator('summary:has-text("البيانات")').first().click(); await pb.waitForTimeout(400);
  await pb.locator('input[type=file]').setInputFiles(file); await pb.waitForTimeout(1500);
  const confirm = pb.locator('dialog[open] button:has-text("استيراد"), dialog[open] button:has-text("متابعة"), dialog[open] button:has-text("نعم")'); if (await confirm.count()) { await confirm.first().click(); await pb.waitForTimeout(1500); }
  const after = await snap(pb);
  await pb.goto(`http://localhost:${B}/#/reports`); await pb.waitForTimeout(1000); const sessionsListed = await pb.locator('a[href^="#/sessions/"]').count();
  out.S3 = { beforeCounts: before.counts, beforeLS: before.ls, afterCounts: after.counts, afterLS: after.ls, sessionsListed, errors };
  await browser.close(); sa.kill(); sb.kill();
}
console.log(JSON.stringify(out, null, 1));
servers.forEach(s => { try { s.kill(); } catch {} });
