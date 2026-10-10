// PWA upgrade test. Env: V1_ROOT (work/ of commit d0c2efb), V2_ROOT (this work/), V2_NEXT_ROOT (copy of V2 with a bumped cache suffix), HARNESS_SERVER (work/audit-harness/server.mjs). Run from a dir where 'playwright' resolves.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const PROFILE = '/tmp/pwa-loads', port = 4695, base = `http://localhost:${port}`; fs.rmSync(PROFILE, { recursive: true, force: true });
const start = root => new Promise(r => { const p = spawn('node', [process.env.HARNESS_SERVER], { env: { ...process.env, ROOT: root, PORT: String(port) }, stdio: 'ignore' }); setTimeout(() => r(p), 1500); });
let srv = await start(process.env.V1_ROOT);
let ctx = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 14'] }); let page = ctx.pages()[0];
await page.goto(`${base}/#/home`); await page.waitForTimeout(3000); await ctx.close(); srv.kill();
srv = await start(process.env.V2_ROOT);
ctx = await chromium.launchPersistentContext(PROFILE, { ...devices['iPhone 14'] }); page = ctx.pages()[0];
const loads = []; const t0 = Date.now(); page.on('load', () => loads.push(Date.now() - t0));
await page.goto(`${base}/#/home`); await page.waitForTimeout(20000);
console.log(JSON.stringify({ fullPageLoadsIn20s: loads.length, atMs: loads, finalCache: await page.evaluate(() => caches.keys()), h1: await page.locator('h1').first().textContent() }));
await ctx.close(); srv.kill();
