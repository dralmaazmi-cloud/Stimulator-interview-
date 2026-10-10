// Transition from the previous production release and from V1. Env: V2_ROOT, PREV_V2_ROOT, V1_ROOT, HARNESS_SERVER.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const start = (root, p) => new Promise(r => { const s = spawn('node', [process.env.HARNESS_SERVER], { env: { ...process.env, ROOT: root, PORT: String(p) }, stdio: 'ignore' }); setTimeout(() => r(s), 1500); });
const VIS = `(() => { let s = 'visible'; Object.defineProperty(document, 'visibilityState', { get: () => s, configurable: true }); window.__resume = () => { s = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); s = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }; })();`;
const snap = page => page.evaluate(async () => { const db = await new Promise(r => { const q = indexedDB.open('leadership-interview-coach'); q.onsuccess = () => r(q.result); }); const c = {}; for (const s of db.objectStoreNames) c[s] = await new Promise(r => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result); }); db.close(); return { counts: c, ls: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('lic:') && !/client-id|update-|privacy/.test(k)).sort().map(k => [k, localStorage.getItem(k).slice(0, 30)])), caches: await caches.keys() }; });
const out = {};
for (const [name, fromRoot, port] of [['currentProduction_v2g_to_v2i', process.env.PREV_V2_ROOT, 4761], ['V1_to_v2i', process.env.V1_ROOT, 4762]]) {
  const base = `http://localhost:${port}`, prof = `/tmp/tr-${port}`; fs.rmSync(prof, { recursive: true, force: true });
  let srv = await start(fromRoot, port);
  let ctx = await chromium.launchPersistentContext(prof, { ...devices['iPhone 14'] }); await ctx.addInitScript(VIS); let page = ctx.pages()[0];
  await page.goto(`${base}/#/home`); await page.waitForTimeout(2500); await page.reload(); await page.waitForTimeout(2000);
  await page.evaluate(() => { localStorage.setItem('lic:theme', 'dark'); localStorage.setItem('lic:bookmarked-questions', '["C1-S1"]'); localStorage.setItem('lic:v2:a5', '{"boxes":{"mistakes:1":2}}'); });
  const before = await snap(page);
  srv.kill(); srv = await start(process.env.V2_ROOT, port);
  // app in memory returns to foreground (old code still running)
  let loads = 0; page.on('load', () => loads++); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.evaluate(() => window.__resume?.()); await page.waitForTimeout(6000);
  const inMemory = { reloads: loads, caches: await page.evaluate(() => caches.keys()) };
  await ctx.close();
  // next launch of the Home Screen app
  ctx = await chromium.launchPersistentContext(prof, { ...devices['iPhone 14'] }); page = ctx.pages()[0];
  let loads2 = 0; page.on('load', () => loads2++); page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${base}/#/home`); await page.waitForTimeout(15000);
  const after = await snap(page);
  out[name] = { inMemory, nextLaunch: { pageLoadsIn15s: loads2, cache: after.caches, hasPwaUpdateModule: await page.evaluate(() => fetch('js/pwa-update.js').then(r => r.ok)) }, dataSame: JSON.stringify(before.counts) === JSON.stringify(after.counts) && JSON.stringify(before.ls) === JSON.stringify(after.ls), before: before.ls, after: after.ls, errors: errs };
  await ctx.close(); srv.kill();
}
console.log(JSON.stringify(out, null, 1));
