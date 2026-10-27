// Update from the production release (v2j) to the two-step simulation release (v2k) on an installed app.
// Env: PREV_ROOT (work/ of the production commit), NEW_ROOT (this work/), HARNESS_SERVER (work/audit-harness/server.mjs).
// Run from a dir where 'playwright' resolves. Chromium with iPhone emulation; this does not prove iOS Safari behaviour.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const start = (root, port) => new Promise(resolve => {
  const server = spawn('node', [process.env.HARNESS_SERVER], { env: { ...process.env, ROOT: root, PORT: String(port) }, stdio: 'ignore' });
  setTimeout(() => resolve(server), 1500);
});
const VIS = `(() => { let s = 'visible'; Object.defineProperty(document, 'visibilityState', { get: () => s, configurable: true }); window.__resume = () => { s = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); s = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }; })();`;
const snap = page => page.evaluate(async () => {
  const db = await new Promise(resolve => { const q = indexedDB.open('leadership-interview-coach'); q.onsuccess = () => resolve(q.result); });
  const counts = {};
  for (const store of db.objectStoreNames) counts[store] = await new Promise(resolve => { const q = db.transaction(store).objectStore(store).count(); q.onsuccess = () => resolve(q.result); });
  db.close();
  const ls = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('lic:') && !/client-id|update-|privacy/.test(k)).sort().map(k => [k, localStorage.getItem(k)]));
  return { counts, ls, caches: await caches.keys() };
});
const swVersion = page => page.evaluate(() => new Promise(resolve => {
  const worker = navigator.serviceWorker.controller;
  if (!worker) { resolve(''); return; }
  const channel = new MessageChannel();
  channel.port1.onmessage = event => resolve(String(event.data));
  worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  setTimeout(() => resolve('timeout'), 2000);
}));

let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + detail}`); if (!ok) failures += 1; };
const port = 4791;
const base = `http://localhost:${port}`;
const profile = '/tmp/two-step-update-profile';
fs.rmSync(profile, { recursive: true, force: true });

let server = await start(process.env.PREV_ROOT, port);
let ctx = await chromium.launchPersistentContext(profile, { ...devices['iPhone 14'] });
await ctx.addInitScript(VIS);
let page = ctx.pages()[0];
await page.goto(`${base}/#/home`);
await page.waitForTimeout(2500);
await page.reload();
await page.waitForTimeout(2000);
const oldVersion = await swVersion(page);
await page.evaluate(() => {
  localStorage.setItem('lic:theme', 'dark');
  localStorage.setItem('lic:bookmarked-questions', '["C1-S1"]');
  localStorage.setItem('lic:followups', 'off');
});
const before = await snap(page);
check('old release installed (v2j)', oldVersion.endsWith('-v2j'), oldVersion);

server.kill();
server = await start(process.env.NEW_ROOT, port);
let loads = 0;
page.on('load', () => { loads += 1; });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.evaluate(() => window.__resume?.());
await page.waitForTimeout(7000);
const newVersion = await swVersion(page);
const after = await snap(page);
check('in-memory app resumes, update applied with one reload', loads === 1, `loads=${loads}`);
check('new service worker controls the page (v2k)', newVersion.endsWith('-v2k'), newVersion);
check('only the new cache remains', after.caches.length === 1 && after.caches[0].endsWith('-v2k'), JSON.stringify(after.caches));
check('local data unchanged (IndexedDB counts and lic:* keys)', JSON.stringify(before.counts) === JSON.stringify(after.counts) && JSON.stringify(before.ls) === JSON.stringify(after.ls), JSON.stringify({ before, after }));
await page.locator('[data-nav="simulation"]').click();
await page.waitForSelector('.simulation-next', { timeout: 10000 });
await page.locator('.simulation-next').click();
await page.waitForSelector('.simulation-method-step');
check('two-step screen served after the update («الخطوة 2 من 2»)', (await page.locator('.simulation-step-label').innerText()).trim() === 'الخطوة 2 من 2');
check('saved follow-up preference kept (off)', !(await page.locator('label.toggle-row:has-text("أسئلة المتابعة") input').isChecked()));
check('no page errors', errors.length === 0, errors.join(' | '));
await ctx.close();

// Next cold launch of the Home Screen app: no further reloads.
ctx = await chromium.launchPersistentContext(profile, { ...devices['iPhone 14'] });
page = ctx.pages()[0];
let loads2 = 0;
page.on('load', () => { loads2 += 1; });
await page.goto(`${base}/#/simulation`);
await page.waitForTimeout(6000);
check('next launch: single load, no reload loop', loads2 === 1, `loads=${loads2}`);
check('next launch: step 1 shown', await page.locator('.simulation-next').isVisible());
await ctx.close();
server.kill();
console.log(JSON.stringify({ oldVersion, newVersion }));
process.exit(failures ? 1 : 0);
